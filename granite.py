"""
granite.py
──────────
IBM Watsonx.ai integration layer — uses the /ml/v1/text/chat endpoint
(OpenAI-compatible, the current IBM-recommended API as of 2024-09-05+).

Endpoint selection:
  POST /ml/v1/text/chat?version=2024-09-05
  Supports: system + user messages, stop sequences, max_tokens.
  All text_generation models in au-syd support this endpoint.

Model auto-selection:
  At startup the module queries /ml/v1/foundation_model_specs to find
  models with function=text_generation in the configured region and picks
  the one that matches MODEL_ID from .env.  If the configured model is
  unavailable the first available text_generation model is used as fallback
  and a warning is logged.

Public API (unchanged — callers in rag.py are unaffected):
  generate_recipe_response()
  generate_substitutions()
  generate_shopping_list()
  generate_leftover_suggestions()
  health_check()
"""

import logging
import os
import time
from typing import Optional

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)


def _build_session() -> requests.Session:
    """
    Persistent HTTP session with connection pooling and automatic retries.
    Retries on transient network errors (connection reset, 502/503/504) with
    exponential back-off. The session is reused across all Granite calls,
    avoiding the overhead of creating a new TCP connection per request.
    """
    session = requests.Session()
    retry = Retry(
        total=3,
        backoff_factor=1,          # 1 s, 2 s, 4 s
        status_forcelist={502, 503, 504},
        allowed_methods={"POST", "GET"},
        raise_on_status=False,     # we check resp.ok ourselves
    )
    adapter = HTTPAdapter(
        max_retries=retry,
        pool_connections=4,
        pool_maxsize=8,
    )
    session.mount("https://", adapter)
    session.mount("http://",  adapter)
    return session


_http: requests.Session = _build_session()


def close_http_session() -> None:
    """
    Close the shared requests.Session, draining the connection pool.

    urllib3 keeps sockets open in a pool between requests.  Calling
    session.close() sends TCP FIN on each idle socket immediately,
    avoiding TIME_WAIT accumulation during rapid rolling deployments.

    Called from the Gunicorn worker_exit server hook.
    """
    try:
        _http.close()
        logger.info("IBM HTTP session closed.")
    except Exception as exc:
        logger.warning("Error closing IBM HTTP session: %s", exc)


# ─────────────────────────────────────────────────────────────────────────────
# Configuration — all values read live from environment so .env changes are
# picked up on restart without touching code.
# ─────────────────────────────────────────────────────────────────────────────
IBM_API_KEY    = os.getenv("IBM_API_KEY", "")
IBM_PROJECT_ID = os.getenv("IBM_PROJECT_ID", "")
IBM_URL        = os.getenv("IBM_URL", "https://au-syd.ml.cloud.ibm.com")
MODEL_ID       = os.getenv("MODEL_ID", "ibm/granite-8b-code-instruct")

IAM_TOKEN_URL  = "https://iam.cloud.ibm.com/identity/token"
_API_VERSION   = "2024-09-05"   # latest stable Watsonx.ai API version


def _get_chat_url() -> str:
    """Return the Watsonx.ai chat endpoint for the configured region."""
    base = os.getenv("IBM_URL", IBM_URL)
    return f"{base}/ml/v1/text/chat?version={_API_VERSION}"


def _get_specs_url() -> str:
    base = os.getenv("IBM_URL", IBM_URL)
    return f"{base}/ml/v1/foundation_model_specs?version={_API_VERSION}&limit=200"


# ─────────────────────────────────────────────────────────────────────────────
# Model resolver — queries live API to verify the requested model is callable
# ─────────────────────────────────────────────────────────────────────────────

def _resolve_model() -> str:
    """
    Confirm the configured model has function=text_generation in this region.
    Returns the model_id to use. Falls back to the first available
    text_generation model if the configured one is absent, logging a clear
    warning with the full list of available alternatives.
    """
    configured = os.getenv("MODEL_ID", MODEL_ID)
    try:
        resp = _http.get(_get_specs_url(), timeout=10)
        resp.raise_for_status()
        resources = resp.json().get("resources", [])
    except Exception as exc:
        logger.warning("Could not fetch model specs (%s) — using %s as-is.", exc, configured)
        return configured

    gen_models = [
        m["model_id"] for m in resources
        if any(f["id"] == "text_generation" for f in m.get("functions", []))
    ]

    if configured in gen_models:
        logger.info("Model '%s' confirmed available for text_generation.", configured)
        return configured

    if gen_models:
        fallback = gen_models[0]
        logger.warning(
            "Model '%s' does NOT have text_generation in region %s.\n"
            "  Available text_generation models: %s\n"
            "  Falling back to: %s\n"
            "  To silence this warning set MODEL_ID=%s in your .env",
            configured, os.getenv("IBM_URL", IBM_URL),
            gen_models, fallback, fallback,
        )
        return fallback

    logger.error(
        "No text_generation models found in region %s. "
        "Proceeding with configured model '%s' — expect errors.",
        os.getenv("IBM_URL", IBM_URL), configured,
    )
    return configured


# Resolve once at module load so the warning appears at startup, not on first request.
_RESOLVED_MODEL: str = _resolve_model()

# ─────────────────────────────────────────────────────────────────────────────
# IAM Token Manager
# ─────────────────────────────────────────────────────────────────────────────

class _TokenManager:
    """Thread-safe IBM IAM token cache with 5-minute pre-expiry refresh."""

    def __init__(self):
        self._token: str = ""
        self._expires_at: float = 0.0

    def get_token(self) -> str:
        if time.time() >= self._expires_at - 300:
            self._refresh()
        return self._token

    def _refresh(self) -> None:
        api_key = os.getenv("IBM_API_KEY", IBM_API_KEY)
        if not api_key:
            raise EnvironmentError(
                "IBM_API_KEY is not set. Copy .env.example → .env and fill in your credentials."
            )
        logger.info("Refreshing IBM IAM token...")
        resp = _http.post(
            IAM_TOKEN_URL,
            data={
                "grant_type": "urn:ibm:params:oauth:grant-type:apikey",
                "apikey": api_key,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=15,
        )
        resp.raise_for_status()
        payload = resp.json()
        self._token      = payload["access_token"]
        self._expires_at = time.time() + payload.get("expires_in", 3600)
        logger.info("IBM IAM token refreshed (expires in %ds).", payload.get("expires_in", 3600))


_token_manager = _TokenManager()


# ─────────────────────────────────────────────────────────────────────────────
# Core generation — uses /ml/v1/text/chat (OpenAI-compatible)
# ─────────────────────────────────────────────────────────────────────────────

def _call_granite(
    system_prompt: str,
    user_prompt: str,
    max_tokens: int = 900,
) -> str:
    """
    Send a system + user message to IBM Watsonx.ai via the /ml/v1/text/chat
    endpoint and return the assistant's reply as a plain string.

    Uses the chat endpoint because:
      • /ml/v1/text/generation is deprecated by IBM (as of 2024-09).
      • All text_generation models in au-syd support /ml/v1/text/chat.
      • The chat format gives the model clear role separation (system / user).

    Raises RuntimeError with the full IBM error body on any API failure.
    """
    token      = _token_manager.get_token()
    model_id   = _RESOLVED_MODEL
    project_id = os.getenv("IBM_PROJECT_ID", IBM_PROJECT_ID)
    url        = _get_chat_url()

    payload = {
        "model_id":   model_id,
        "project_id": project_id,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": user_prompt},
        ],
        "max_tokens": max_tokens,
    }
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type":  "application/json",
        "Accept":        "application/json",
    }

    logger.debug(
        "Watsonx.ai request → %s | model=%s | project=%s | max_tokens=%d",
        url, model_id, project_id, max_tokens,
    )

    try:
        resp = _http.post(url, json=payload, headers=headers, timeout=120)
    except requests.exceptions.Timeout:
        raise RuntimeError("IBM Watsonx.ai request timed out (120 s).")
    except requests.exceptions.ConnectionError as exc:
        raise RuntimeError(f"IBM Watsonx.ai connection error: {exc}") from exc

    # Always log the status so failures are visible even if not raised
    logger.debug("Watsonx.ai response status=%d", resp.status_code)

    if not resp.ok:
        # Log the full response body so the real IBM error is never hidden
        logger.error(
            "IBM Watsonx.ai error — status=%d url=%s\n  body=%s",
            resp.status_code, url, resp.text,
        )
        try:
            err_body = resp.json()
            errors   = err_body.get("errors", [])
            msg      = errors[0].get("message", resp.text) if errors else resp.text
        except Exception:
            msg = resp.text
        raise RuntimeError(
            f"IBM Watsonx.ai HTTP {resp.status_code}: {msg}"
        )

    data = resp.json()

    # Log any deprecation/warning notices from IBM at WARNING level
    for w in data.get("system", {}).get("warnings", []):
        if w.get("id") != "disclaimer_warning":
            logger.warning("IBM Watsonx.ai [%s]: %s", w.get("id", "?"), w.get("message", ""))

    try:
        text = data["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError) as exc:
        raise RuntimeError(
            f"Unexpected IBM Watsonx.ai response structure: {exc}\nFull body: {data}"
        ) from exc

    logger.debug("Granite generated %d chars.", len(text))
    return text


# ─────────────────────────────────────────────────────────────────────────────
# Purpose-built prompt builders
# ─────────────────────────────────────────────────────────────────────────────

def generate_recipe_response(
    user_ingredients: list[str],
    retrieved_recipes: list[dict],
    cuisine_filter: Optional[str] = None,
    dietary_filter: Optional[list[str]] = None,
) -> str:
    """
    Core RAG prompt: select the best-matching recipe from retrieved context
    and generate a full structured response with instructions, nutrition,
    substitutions and food-waste tips.
    """
    ingredients_str = ", ".join(user_ingredients)
    filters_str     = _format_filters(cuisine_filter, dietary_filter)

    context_blocks = []
    for i, recipe in enumerate(retrieved_recipes, 1):
        full      = recipe.get("full_recipe") or recipe
        name      = full.get("name",              recipe.get("name",              "Unknown"))
        cuisine   = full.get("cuisine",            recipe.get("cuisine",           "Unknown"))
        rec_ings  = full.get("ingredients",        [])
        steps     = full.get("steps",              [])
        calories  = full.get("calories",           recipe.get("calories",          "unknown"))
        diff      = full.get("difficulty",         recipe.get("difficulty",        "Unknown"))
        cook_time = full.get("cook_time_minutes",  recipe.get("cook_time_minutes", 0))

        ings_str  = ", ".join(rec_ings[:15])
        steps_str = " | ".join(steps[:6])

        context_blocks.append(
            f"[Recipe {i}] {name} ({cuisine})\n"
            f"  Difficulty: {diff} | Cook time: {cook_time} min | Calories: {calories} kcal\n"
            f"  Ingredients: {ings_str}\n"
            f"  Instructions (first 6 steps): {steps_str}"
        )
    context_str = "\n\n".join(context_blocks)

    system = (
        "You are an expert chef and nutritionist. "
        "Respond ONLY with the structured recipe sections requested. "
        "Be specific, practical, and concise."
    )
    user = f"""A user has these ingredients: {ingredients_str}
Filters applied: {filters_str}

Top retrieved recipes (RAG context):
{context_str}

Select the BEST matching recipe (uses most of the user's ingredients) and respond in EXACTLY this format:

**1. Best Recipe Match**
Name, cuisine, cook time, difficulty, and why it best matches.

**2. Step-by-Step Cooking Instructions**
Numbered steps. Be detailed and practical.

**3. Missing Ingredients**
List each ingredient the recipe needs that the user does NOT have. If nothing is missing, say so.

**4. Ingredient Substitutions**
For any missing or hard-to-find ingredient, suggest a substitute with ratio/notes.

**5. Nutrition Summary**
Calories: [from dataset]. Estimate protein, carbs, fat from ingredient composition.
Format: Calories: X kcal | Protein: ~Xg | Carbs: ~Xg | Fat: ~Xg

**6. Food Waste Reduction Tips**
2–3 specific tips for using leftover ingredients from this recipe."""

    return _call_granite(system, user, max_tokens=950)


def generate_substitutions(
    ingredient: str,
    recipe_name: str,
    dietary_constraints: Optional[list[str]] = None,
) -> str:
    """Generate 4 practical substitutions for a specific ingredient."""
    constraints_str = (
        f"The user requires: {', '.join(dietary_constraints)}."
        if dietary_constraints
        else "No specific dietary constraints."
    )
    system = "You are a professional chef specialising in ingredient substitutions."
    user   = f"""Recipe: {recipe_name}
Ingredient to replace: {ingredient}
Dietary constraints: {constraints_str}

Provide exactly 4 substitutions:
1. [Substitute] — [Why it works] — [Quantity ratio]
2. [Substitute] — [Why it works] — [Quantity ratio]
3. [Substitute] — [Why it works] — [Quantity ratio]
4. [Substitute] — [Why it works] — [Quantity ratio]

End with one sentence on how the substitution changes the flavour profile."""

    return _call_granite(system, user, max_tokens=360)


def generate_shopping_list(
    recipe_name: str,
    recipe_ingredients: list[str],
    available_ingredients: list[str],
) -> str:
    """Categorised shopping list for ingredients the user is missing."""
    available_str  = ", ".join(available_ingredients) if available_ingredients else "none"
    recipe_ing_str = "\n".join(f"  - {ing}" for ing in recipe_ingredients)
    system = "You are a helpful meal-planning assistant."
    user   = f"""Recipe: {recipe_name}
Recipe requires:
{recipe_ing_str}

User already has: {available_str}

Generate a shopping list with ONLY the missing ingredients, organised by category:

**Shopping List for {recipe_name}**

Category: Produce
- [item] — [estimated quantity]

Category: Proteins / Meat
- [item] — [estimated quantity]

Category: Pantry / Dry Goods
- [item] — [estimated quantity]

Category: Dairy / Refrigerated
- [item] — [estimated quantity]

**Estimated Cost**: $[low]–$[high] USD
**Where to Find Specialty Items**: [1–2 suggestions]

Only list ingredients the user does NOT already have. Skip empty categories."""

    return _call_granite(system, user, max_tokens=420)


def generate_leftover_suggestions(
    leftover_ingredients: list[str],
    cuisine_preference: Optional[str] = None,
) -> str:
    """Suggest 3 creative recipes using leftover ingredients."""
    ingredients_str = ", ".join(leftover_ingredients)
    cuisine_str = (
        f"Preferred cuisine: {cuisine_preference}."
        if cuisine_preference
        else "Any cuisine is fine."
    )
    system = "You are a creative chef who specialises in reducing food waste."
    user   = f"""Leftover ingredients: {ingredients_str}
Cuisine preference: {cuisine_str}

Suggest 3 creative recipes using ONLY or MOSTLY these leftovers.

For each recipe:
**Recipe [N]: [Name]**
- Cuisine: [type]
- Uses from leftovers: [list]
- Additional items needed (max 3 pantry staples): [list]
- Cook time: [X] minutes
- Quick method: [2–3 sentences]
- Waste reduction benefit: [one sentence]"""

    return _call_granite(system, user, max_tokens=620)


# ─────────────────────────────────────────────────────────────────────────────
# Utilities
# ─────────────────────────────────────────────────────────────────────────────

def _format_filters(
    cuisine: Optional[str],
    dietary: Optional[list[str]],
) -> str:
    parts = []
    if cuisine:
        parts.append(f"Cuisine: {cuisine}")
    if dietary:
        parts.append(f"Dietary: {', '.join(dietary)}")
    return "; ".join(parts) if parts else "No filters applied"


def health_check() -> dict:
    """Returns configuration and credential status — does NOT make an API call."""
    return {
        "ibm_api_key_set":    bool(os.getenv("IBM_API_KEY", IBM_API_KEY)),
        "ibm_project_id_set": bool(os.getenv("IBM_PROJECT_ID", IBM_PROJECT_ID)),
        "ibm_url":            os.getenv("IBM_URL", IBM_URL),
        "model_id":           _RESOLVED_MODEL,
        "model_id_configured":os.getenv("MODEL_ID", MODEL_ID),
        "chat_url":           _get_chat_url(),
        "api_version":        _API_VERSION,
    }
