"""
recipe_loader.py
────────────────
Loads and normalises the real recipe dataset from data/recipes_small.json.

Dataset schema (raw):
  id                 int
  title              str | NaN   → normalised to name
  ingredients        list[str]
  instructions       list[str]  → normalised to steps
  cook_time_minutes  int
  diet               str        ("Vegetarian" | "Unknown")
  cuisine            str        ("Indian", "Mexican", … | "Unknown")
  calories           float

Normalised schema exposed by this module:
  id                 str         (stringified for ChromaDB compatibility)
  name               str
  ingredients        list[str]
  steps              list[str]
  cook_time_minutes  int
  dietary            list[str]   (["Vegetarian"] or [])
  cuisine            str
  calories           float
  description        str         (auto-generated from title + cuisine)

NaN handling:
  - The file contains exactly one record with "title": NaN.
  - Raw bytes `NaN` → replaced with JSON-valid `null` before parsing.
  - Records with null title are skipped during load.

Public API:
  load_recipes()           → list[dict]
  get_recipe_by_id()       → dict | None
  build_recipe_document()  → str   (rich text for embedding)
  get_all_cuisines()       → list[str]
  get_all_dietary_tags()   → list[str]
  filter_recipes()         → list[dict]
"""

import json
import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

_DATA_PATH = os.path.join(os.path.dirname(__file__), "data", "recipes_small.json")

# Module-level caches
_recipe_cache: list[dict] = []
_recipe_index: dict[str, dict] = {}   # id (str) → normalised recipe


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

def load_recipes(path: str = _DATA_PATH) -> list[dict]:
    """
    Load, sanitise, and normalise recipes_small.json.
    Returns cached list on subsequent calls.
    """
    global _recipe_cache, _recipe_index

    if _recipe_cache:
        return _recipe_cache

    if not os.path.exists(path):
        raise FileNotFoundError(
            f"Dataset not found: {path}\n"
            "Place recipes_small.json inside the data/ directory."
        )

    logger.info("Loading dataset from %s", path)

    with open(path, "r", encoding="utf-8") as fh:
        raw = fh.read()

    # ── Sanitise NaN (not valid JSON) before parsing ──────────────────────
    raw = raw.replace(": NaN", ": null").replace(":NaN", ":null")

    data = json.loads(raw)

    if not isinstance(data, list):
        raise ValueError("recipes_small.json must contain a JSON array at root.")

    validated: list[dict] = []
    skipped = 0
    for i, raw_rec in enumerate(data):
        try:
            normalised = _normalise(raw_rec)
            validated.append(normalised)
        except _SkipRecord as reason:
            skipped += 1
            logger.debug("Skipped record %d: %s", i, reason)
        except Exception as exc:
            skipped += 1
            logger.warning("Skipped malformed record at index %d: %s", i, exc)

    _recipe_cache = validated
    _recipe_index = {r["id"]: r for r in validated}

    logger.info(
        "Loaded %d recipes (%d skipped) from %s",
        len(validated), skipped, path,
    )
    return _recipe_cache


def get_recipe_by_id(recipe_id: str) -> Optional[dict]:
    """O(1) lookup. Returns None if not found."""
    if not _recipe_index:
        load_recipes()
    return _recipe_index.get(str(recipe_id))


def build_recipe_document(recipe: dict) -> str:
    """
    Build a rich plain-text document used for generating embeddings.
    Packs all semantically meaningful text into a single string so that
    all-MiniLM-L6-v2 can produce a high-quality vector representation.
    """
    ingredients_str  = ", ".join(recipe.get("ingredients", []))
    steps_str        = " ".join(recipe.get("steps", []))
    dietary_str      = ", ".join(recipe.get("dietary", [])) or "None specified"
    cuisine          = recipe.get("cuisine", "Unknown")
    name             = recipe.get("name", "")
    cook_time        = recipe.get("cook_time_minutes", 0)
    calories         = recipe.get("calories", 0)

    return (
        f"Recipe: {name}. "
        f"Cuisine: {cuisine}. "
        f"Dietary: {dietary_str}. "
        f"Cook time: {cook_time} minutes. "
        f"Calories: {calories} kcal. "
        f"Ingredients: {ingredients_str}. "
        f"Instructions: {steps_str}"
    )


def get_all_cuisines() -> list[str]:
    """Sorted list of distinct cuisines, excluding 'Unknown'."""
    recipes = load_recipes()
    return sorted({r["cuisine"] for r in recipes if r["cuisine"] != "Unknown"})


def get_all_dietary_tags() -> list[str]:
    """Sorted list of distinct dietary tags across all recipes."""
    recipes = load_recipes()
    tags: set[str] = set()
    for r in recipes:
        tags.update(r.get("dietary", []))
    return sorted(tags)


def filter_recipes(
    cuisine: Optional[str] = None,
    dietary: Optional[list[str]] = None,
) -> list[dict]:
    """
    Filter by cuisine (exact, case-insensitive) and/or dietary tags
    (recipe must contain ALL supplied tags).
    """
    recipes = load_recipes()

    if cuisine:
        recipes = [r for r in recipes if r["cuisine"].lower() == cuisine.lower()]

    if dietary:
        dietary_lower = [d.lower() for d in dietary]
        recipes = [
            r for r in recipes
            if all(d in [t.lower() for t in r.get("dietary", [])] for d in dietary_lower)
        ]

    return recipes


# ─────────────────────────────────────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────────────────────────────────────

class _SkipRecord(Exception):
    """Raised to signal a record should be silently skipped."""


def _normalise(raw: dict) -> dict:
    """
    Map raw dataset fields to the normalised schema used throughout the app.

    Raw dataset fields:
        id, title, ingredients, instructions, cook_time_minutes,
        diet, cuisine, calories

    Normalised output:
        id (str), name, ingredients, steps, cook_time_minutes,
        dietary (list), cuisine, calories, description
    """
    # Skip records with no usable title
    title = raw.get("title")
    if not title or not isinstance(title, str) or not title.strip():
        raise _SkipRecord("missing or null title")

    name    = title.strip().title()   # "arriba baked winter squash" → "Arriba Baked Winter Squash"
    rec_id  = str(raw["id"])
    cuisine = _clean_field(raw.get("cuisine", "Unknown"))

    # diet → dietary list
    raw_diet = _clean_field(raw.get("diet", "Unknown"))
    dietary: list[str] = []
    if raw_diet and raw_diet.lower() not in ("unknown", ""):
        dietary = [raw_diet]          # e.g. ["Vegetarian"]

    # Ensure instructions is a list of strings
    instructions = raw.get("instructions", [])
    if isinstance(instructions, str):
        instructions = [instructions]
    steps = [str(s).strip() for s in instructions if str(s).strip()]

    # Ensure ingredients is a list of strings
    ingredients_raw = raw.get("ingredients", [])
    if isinstance(ingredients_raw, str):
        ingredients_raw = [ingredients_raw]
    ingredients = [str(i).strip() for i in ingredients_raw if str(i).strip()]

    if not ingredients:
        raise _SkipRecord("empty ingredients list")
    if not steps:
        raise _SkipRecord("empty instructions list")

    cook_time = int(raw.get("cook_time_minutes") or 0)
    calories  = float(raw.get("calories") or 0.0)

    description = _make_description(name, cuisine, len(ingredients), cook_time)

    return {
        "id":                rec_id,
        "name":              name,
        "ingredients":       ingredients,
        "steps":             steps,
        "cook_time_minutes": cook_time,
        "dietary":           dietary,
        "cuisine":           cuisine,
        "calories":          round(calories, 1),
        "description":       description,
        # Fields expected by app.py / frontend (set to sensible defaults)
        "difficulty":        _infer_difficulty(cook_time, len(steps)),
        "servings":          _estimate_servings(ingredients),
        "nutrition": {
            "calories":  round(calories, 1),
            "protein_g": None,    # not in dataset — Granite will estimate
            "carbs_g":   None,
            "fat_g":     None,
            "fiber_g":   None,
        },
        "substitutions":        {},   # Granite generates at query time
        "waste_reduction_tips": [],   # Granite generates at query time
        "tags":                 _make_tags(name, cuisine, dietary),
    }


def _clean_field(val) -> str:
    if val is None:
        return "Unknown"
    return str(val).strip()


def _make_description(name: str, cuisine: str, n_ingredients: int, cook_time: int) -> str:
    cuisine_part = f"{cuisine} " if cuisine != "Unknown" else ""
    time_part    = f"Ready in {cook_time} minutes. " if cook_time > 0 else ""
    return (
        f"A {cuisine_part}recipe with {n_ingredients} ingredients. "
        f"{time_part}"
        f"Discover the full flavour of {name}."
    )


def _infer_difficulty(cook_time: int, n_steps: int) -> str:
    """Estimate difficulty from cook time and number of steps."""
    if cook_time <= 20 and n_steps <= 5:
        return "Easy"
    if cook_time <= 60 and n_steps <= 10:
        return "Medium"
    if cook_time > 120 or n_steps > 15:
        return "Hard"
    return "Medium"


def _estimate_servings(ingredients: list) -> int:
    """Rough heuristic: more ingredients → larger batch."""
    n = len(ingredients)
    if n <= 4:
        return 2
    if n <= 8:
        return 4
    return 6


def _make_tags(name: str, cuisine: str, dietary: list) -> list[str]:
    tags = []
    if cuisine and cuisine != "Unknown":
        tags.append(cuisine.lower())
    tags.extend([d.lower() for d in dietary])
    # Add first 2 meaningful words from name as tags
    stop = {"the", "a", "an", "and", "or", "of", "with", "in", "for", "good",
            "best", "easy", "quick", "style", "great", "old", "new"}
    words = [w for w in name.lower().split() if w not in stop and len(w) > 2]
    tags.extend(words[:2])
    return list(dict.fromkeys(tags))   # deduplicate preserving order
