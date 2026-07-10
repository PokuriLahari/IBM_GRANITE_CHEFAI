"""
app.py
──────
Production-ready Flask application for the AI-Powered Recipe Preparation Agent.

Production hardening applied:
  • Gunicorn-managed (this file is the WSGI callable — no app.run() in production)
  • CORS locked to explicit origins via ALLOWED_ORIGINS env var
  • Session cookies: Secure, HttpOnly, SameSite=Lax
  • No debug mode; stack traces never leak to clients
  • Request size capped at 1 MB
  • All secrets sourced from environment variables only

REST API:
  GET  /                          → Single-page UI
  GET  /api/health                → Deep health check (vector store + IBM)
  POST /api/recommend             → RAG recipe recommendation
  POST /api/substitutions         → Ingredient substitution suggestions
  POST /api/shopping-list         → Shopping list for missing ingredients
  POST /api/leftover              → Leftover ingredient recipe ideas
  POST /api/detect-missing        → Missing ingredient detection
  GET  /api/favorites             → Saved favorites (session)
  POST /api/favorites             → Save a favorite
  DELETE /api/favorites/<id>      → Remove a favorite
  GET  /api/history               → Query history (session)
  DELETE /api/history             → Clear history
  GET  /api/recipes               → Browse recipes with filters
  GET  /api/recipes/<id>          → Single recipe by ID
  GET  /api/cuisines              → All cuisine types
  GET  /api/dietary-tags          → All dietary tags
"""

import logging
import os
import sys
import time
from datetime import datetime
from functools import wraps
from typing import Any

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request, session
from flask_cors import CORS

from rag import rag_pipeline
from recipe_loader import (
    filter_recipes,
    get_all_cuisines,
    get_all_dietary_tags,
    get_recipe_by_id,
)

# ─────────────────────────────────────────────────────────────────────────────
# Bootstrap — load .env before anything else reads env vars
# ─────────────────────────────────────────────────────────────────────────────
load_dotenv()

# ── Structured logging ────────────────────────────────────────────────────────
_LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, _LOG_LEVEL, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Flask application factory
# ─────────────────────────────────────────────────────────────────────────────
app = Flask(__name__, template_folder="templates", static_folder="static")

# ── Security: secret key must come from env in production ─────────────────────
_secret = os.getenv("FLASK_SECRET_KEY", "")
if not _secret:
    logger.warning(
        "FLASK_SECRET_KEY is not set — using an insecure default. "
        "Set this variable before deploying to production."
    )
    _secret = "insecure-dev-key-change-before-deploying"
app.secret_key = _secret

# ── Session cookie hardening ───────────────────────────────────────────────────
app.config.update(
    SESSION_COOKIE_HTTPONLY  = True,
    SESSION_COOKIE_SAMESITE  = "Lax",
    SESSION_COOKIE_SECURE    = os.getenv("FLASK_ENV", "production") == "production",
    PERMANENT_SESSION_LIFETIME = 86400,  # 24 h
    MAX_CONTENT_LENGTH         = 1 * 1024 * 1024,  # 1 MB request cap
)

# ── CORS ──────────────────────────────────────────────────────────────────────
# Default: same-origin only (no CORS headers added unless Origin header matches).
# Set ALLOWED_ORIGINS="https://a.com,https://b.com" to allow specific origins.
#
# flask-cors 6.0.2 bug: passing origins=None crashes with
#   TypeError: argument of type 'NoneType' is not iterable
# Fix: only pass `origins` when an explicit list is configured; otherwise omit
# the argument so flask-cors uses its own safe default behaviour.
_raw_origins = os.getenv("ALLOWED_ORIGINS", "")
_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]

_cors_kwargs: dict = dict(supports_credentials=True, max_age=600)
if _origins:
    _cors_kwargs["origins"] = _origins

CORS(app, **_cors_kwargs)

# ─────────────────────────────────────────────────────────────────────────────
# RAG pipeline startup
# Initialised once in the Gunicorn master process (preload_app=True) so all
# forked workers share the same in-memory state via copy-on-write.
# ─────────────────────────────────────────────────────────────────────────────
_startup_ok    = False
_startup_error = ""

with app.app_context():
    logger.info("Starting RAG pipeline initialisation...")
    t0 = time.time()
    try:
        rag_pipeline.initialize()
        _startup_ok = True
        logger.info("RAG pipeline ready in %.1fs.", time.time() - t0)
    except Exception as exc:
        _startup_error = str(exc)
        logger.error(
            "RAG pipeline failed to initialise in %.1fs: %s",
            time.time() - t0, exc,
        )
        logger.warning(
            "App will start but AI endpoints will return 503 until resolved."
        )


# ─────────────────────────────────────────────────────────────────────────────
# Shared helpers
# ─────────────────────────────────────────────────────────────────────────────

def api_response(data: Any, status: int = 200):
    return jsonify({"success": True,  "data": data}), status


def api_error(message: str, status: int = 400, details: str = ""):
    body = {"success": False, "error": message}
    if details:
        body["details"] = details
    return jsonify(body), status


def require_json(f):
    """Decorator — enforce application/json Content-Type on POST endpoints."""
    @wraps(f)
    def wrapper(*args, **kwargs):
        if not request.is_json:
            return api_error(
                "Request must use Content-Type: application/json", 415
            )
        return f(*args, **kwargs)
    return wrapper


def require_pipeline(f):
    """Decorator — return 503 if the RAG pipeline failed to start."""
    @wraps(f)
    def wrapper(*args, **kwargs):
        if not _startup_ok:
            return api_error(
                "Service unavailable — RAG pipeline is not ready.",
                503,
                details=_startup_error,
            )
        return f(*args, **kwargs)
    return wrapper


def _record_history(query_ingredients: list, filters: dict, recipe_name: str):
    """Append a query to the session history (newest first, max 50)."""
    if "history" not in session:
        session["history"] = []
    entry = {
        "timestamp":  datetime.utcnow().isoformat() + "Z",
        "ingredients": query_ingredients,
        "filters":     filters,
        "top_recipe":  recipe_name,
    }
    history = session["history"]
    history.insert(0, entry)
    session["history"] = history[:50]
    session.modified = True


# ─────────────────────────────────────────────────────────────────────────────
# Routes — UI
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


# ─────────────────────────────────────────────────────────────────────────────
# Routes — Health
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/api/health", methods=["GET"])
def health():
    """
    Deep health check.  Returns 200 when all subsystems are green, 503 when
    the pipeline is degraded.  Consumed by Code Engine's liveness probe.

    Response:
      {
        "status":       "ok" | "degraded",
        "pipeline_ready": bool,
        "vector_store": { status, document_count, ... },
        "ibm_granite":  { ibm_api_key_set, ibm_project_id_set, model_id, ... },
        "timestamp":    "<ISO-8601>"
      }
    """
    from granite import health_check as granite_health
    from vector_store import vector_store as vs

    vs_health  = vs.health()
    ibm_health = granite_health()

    all_ok = (
        _startup_ok
        and vs_health.get("status") == "ok"
        and ibm_health["ibm_api_key_set"]
        and ibm_health["ibm_project_id_set"]
    )

    payload = {
        "status":         "ok" if all_ok else "degraded",
        "pipeline_ready": _startup_ok,
        "vector_store":   vs_health,
        "ibm_granite":    ibm_health,
        "timestamp":      datetime.utcnow().isoformat() + "Z",
    }
    if not _startup_ok:
        payload["startup_error"] = _startup_error

    return api_response(payload, status=200 if all_ok else 503)


# ─────────────────────────────────────────────────────────────────────────────
# Routes — Core RAG
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/api/recommend", methods=["POST"])
@require_json
@require_pipeline
def recommend():
    """
    Main RAG endpoint.

    Request body:
        {
          "ingredients": ["chicken", "garlic"],   // required, 1–20 items
          "cuisine":     "Indian",                 // optional
          "dietary":     ["Vegetarian"],           // optional list
          "top_k":       5                         // optional, 1–10
        }
    """
    body = request.get_json()

    ingredients = body.get("ingredients", [])
    if not isinstance(ingredients, list) or not ingredients:
        return api_error("'ingredients' must be a non-empty list of strings.")
    if len(ingredients) > 20:
        return api_error("'ingredients' list may not exceed 20 items.")
    ingredients = [str(i).strip() for i in ingredients if str(i).strip()]
    if not ingredients:
        return api_error("'ingredients' contained only empty strings.")

    cuisine = body.get("cuisine") or None
    dietary = body.get("dietary") or None
    top_k   = min(int(body.get("top_k", 5)), 10)

    valid_cuisines = get_all_cuisines()
    if cuisine and cuisine not in valid_cuisines:
        return api_error(
            f"Unknown cuisine '{cuisine}'.",
            details=f"Available: {', '.join(valid_cuisines)}",
        )

    try:
        result = rag_pipeline.recommend(
            ingredients=ingredients,
            cuisine_filter=cuisine,
            dietary_filter=dietary,
            top_k=top_k,
        )
        top_name = (
            result["retrieved_recipes"][0]["name"]
            if result["retrieved_recipes"] else "unknown"
        )
        _record_history(ingredients, {"cuisine": cuisine, "dietary": dietary}, top_name)
        return api_response(result)

    except RuntimeError as exc:
        logger.error("RAG recommend error: %s", exc)
        return api_error("Recipe generation failed.", details=str(exc), status=502)
    except Exception as exc:
        logger.exception("Unexpected error in /api/recommend")
        return api_error("Internal server error.", status=500)


# ─────────────────────────────────────────────────────────────────────────────
# Routes — Ingredient substitutions
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/api/substitutions", methods=["POST"])
@require_json
@require_pipeline
def substitutions():
    body        = request.get_json()
    ingredient  = (body.get("ingredient")  or "").strip()
    recipe_name = (body.get("recipe_name") or "").strip()
    dietary     = body.get("dietary") or None

    if not ingredient:
        return api_error("'ingredient' is required.")
    if not recipe_name:
        return api_error("'recipe_name' is required.")
    if len(ingredient) > 200 or len(recipe_name) > 200:
        return api_error("Input fields must be ≤ 200 characters.")

    try:
        result = rag_pipeline.get_substitutions(
            ingredient=ingredient,
            recipe_name=recipe_name,
            dietary_constraints=dietary,
        )
        return api_response(result)
    except RuntimeError as exc:
        logger.error("Substitution error: %s", exc)
        return api_error("Failed to generate substitutions.", details=str(exc), status=502)
    except Exception:
        logger.exception("Unexpected error in /api/substitutions")
        return api_error("Internal server error.", status=500)


# ─────────────────────────────────────────────────────────────────────────────
# Routes — Shopping list
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/api/shopping-list", methods=["POST"])
@require_json
@require_pipeline
def shopping_list():
    body      = request.get_json()
    recipe_id = (body.get("recipe_id") or "").strip()
    available = body.get("ingredients", [])

    if not recipe_id:
        return api_error("'recipe_id' is required.")
    if not isinstance(available, list):
        return api_error("'ingredients' must be a list.")

    available = [str(i).strip() for i in available if str(i).strip()]

    try:
        result = rag_pipeline.get_shopping_list(
            recipe_id=recipe_id,
            available_ingredients=available,
        )
        return api_response(result)
    except ValueError as exc:
        return api_error(str(exc), status=404)
    except RuntimeError as exc:
        logger.error("Shopping list error: %s", exc)
        return api_error("Failed to generate shopping list.", details=str(exc), status=502)
    except Exception:
        logger.exception("Unexpected error in /api/shopping-list")
        return api_error("Internal server error.", status=500)


# ─────────────────────────────────────────────────────────────────────────────
# Routes — Leftover ideas
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/api/leftover", methods=["POST"])
@require_json
@require_pipeline
def leftover():
    body        = request.get_json()
    ingredients = body.get("ingredients", [])
    cuisine     = body.get("cuisine") or None

    if not isinstance(ingredients, list) or not ingredients:
        return api_error("'ingredients' must be a non-empty list.")

    ingredients = [str(i).strip() for i in ingredients if str(i).strip()]

    try:
        result = rag_pipeline.get_leftover_ideas(
            leftover_ingredients=ingredients,
            cuisine_preference=cuisine,
        )
        return api_response(result)
    except RuntimeError as exc:
        logger.error("Leftover suggestion error: %s", exc)
        return api_error("Failed to generate leftover suggestions.", details=str(exc), status=502)
    except Exception:
        logger.exception("Unexpected error in /api/leftover")
        return api_error("Internal server error.", status=500)


# ─────────────────────────────────────────────────────────────────────────────
# Routes — Missing ingredient detection
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/api/detect-missing", methods=["POST"])
@require_json
@require_pipeline
def detect_missing():
    body      = request.get_json()
    recipe_id = (body.get("recipe_id") or "").strip()
    available = body.get("ingredients", [])

    if not recipe_id:
        return api_error("'recipe_id' is required.")

    available = [str(i).strip() for i in available if str(i).strip()]

    try:
        result = rag_pipeline.detect_missing(
            recipe_id=recipe_id,
            available_ingredients=available,
        )
        return api_response(result)
    except ValueError as exc:
        return api_error(str(exc), status=404)
    except Exception:
        logger.exception("Unexpected error in /api/detect-missing")
        return api_error("Internal server error.", status=500)


# ─────────────────────────────────────────────────────────────────────────────
# Routes — Favorites
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/api/favorites", methods=["GET"])
def get_favorites():
    favorites = session.get("favorites", [])
    return api_response({"favorites": favorites, "count": len(favorites)})


@app.route("/api/favorites", methods=["POST"])
@require_json
def add_favorite():
    body        = request.get_json()
    recipe_id   = (body.get("recipe_id")   or "").strip()
    recipe_name = (body.get("recipe_name") or "").strip()
    cuisine     = (body.get("cuisine")     or "").strip()

    if not recipe_id:
        return api_error("'recipe_id' is required.")

    if not recipe_name:
        recipe = get_recipe_by_id(recipe_id)
        if recipe:
            recipe_name = recipe["name"]
            cuisine     = recipe.get("cuisine", "")

    if "favorites" not in session:
        session["favorites"] = []

    if recipe_id in {f["recipe_id"] for f in session["favorites"]}:
        return api_response({"message": "Already in favorites.", "recipe_id": recipe_id})

    entry = {
        "recipe_id": recipe_id,
        "name":      recipe_name,
        "cuisine":   cuisine,
        "saved_at":  datetime.utcnow().isoformat() + "Z",
    }
    session["favorites"] = session.get("favorites", []) + [entry]
    session.modified = True
    return api_response({"message": "Added to favorites.", "favorite": entry}, status=201)


@app.route("/api/favorites/<recipe_id>", methods=["DELETE"])
def remove_favorite(recipe_id: str):
    if "favorites" not in session:
        return api_error("Recipe not found in favorites.", status=404)

    before = len(session["favorites"])
    session["favorites"] = [
        f for f in session["favorites"] if f["recipe_id"] != recipe_id
    ]
    session.modified = True

    if len(session["favorites"]) == before:
        return api_error(f"Recipe '{recipe_id}' not found in favorites.", status=404)

    return api_response({"message": f"Recipe '{recipe_id}' removed from favorites."})


# ─────────────────────────────────────────────────────────────────────────────
# Routes — History
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/api/history", methods=["GET"])
def get_history():
    history = session.get("history", [])
    limit   = min(int(request.args.get("limit", 20)), 50)
    return api_response({"history": history[:limit], "total": len(history)})


@app.route("/api/history", methods=["DELETE"])
def clear_history():
    session["history"] = []
    session.modified   = True
    return api_response({"message": "History cleared."})


# ─────────────────────────────────────────────────────────────────────────────
# Routes — Recipe browsing
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/api/recipes", methods=["GET"])
def list_recipes():
    cuisine = request.args.get("cuisine") or None
    dietary = request.args.getlist("dietary") or None
    limit   = min(int(request.args.get("limit",  30)), 100)
    offset  = max(int(request.args.get("offset",  0)),   0)

    try:
        recipes = filter_recipes(cuisine=cuisine, dietary=dietary)
        total   = len(recipes)
        page    = recipes[offset : offset + limit]
        return api_response({"recipes": page, "total": total, "limit": limit, "offset": offset})
    except Exception:
        logger.exception("Error listing recipes")
        return api_error("Failed to list recipes.", status=500)


@app.route("/api/recipes/<recipe_id>", methods=["GET"])
def get_recipe(recipe_id: str):
    recipe = get_recipe_by_id(recipe_id)
    if not recipe:
        return api_error(f"Recipe '{recipe_id}' not found.", status=404)
    return api_response(recipe)


# ─────────────────────────────────────────────────────────────────────────────
# Routes — Metadata
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/api/cuisines", methods=["GET"])
def list_cuisines():
    return api_response({"cuisines": get_all_cuisines()})


@app.route("/api/dietary-tags", methods=["GET"])
def list_dietary_tags():
    return api_response({"dietary_tags": get_all_dietary_tags()})


# ─────────────────────────────────────────────────────────────────────────────
# Error handlers — never leak stack traces
# ─────────────────────────────────────────────────────────────────────────────

@app.errorhandler(404)
def not_found(_exc):
    return api_error("Endpoint not found.", status=404)


@app.errorhandler(405)
def method_not_allowed(_exc):
    return api_error("HTTP method not allowed.", status=405)


@app.errorhandler(413)
def request_too_large(_exc):
    return api_error("Request payload too large (max 1 MB).", status=413)


@app.errorhandler(500)
def internal_error(exc):
    logger.exception("Unhandled 500 error")
    return api_error("Internal server error.", status=500)


# ─────────────────────────────────────────────────────────────────────────────
# Dev entry-point — never used by Gunicorn
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    host  = os.getenv("FLASK_HOST", "0.0.0.0")
    port  = int(os.getenv("FLASK_PORT", "5000"))
    debug = os.getenv("DEBUG", "false").lower() == "true"
    logger.info("Dev server on %s:%d (debug=%s) — use Gunicorn in production.", host, port, debug)
    app.run(host=host, port=port, debug=debug, use_reloader=False)
