"""
vector_store.py
───────────────
Manages the ChromaDB persistent vector store for recipe embeddings.

Works with the normalised recipe schema from recipe_loader.py which
maps recipes_small.json → { id, name, ingredients, steps, dietary,
                             cuisine, cook_time_minutes, calories, ... }

Collection metadata stored per document:
    name               str
    cuisine            str
    dietary            str   (comma-joined list, e.g. "Vegetarian")
    difficulty         str
    cook_time_minutes  int
    servings           int
    calories           float

Embedding model : all-MiniLM-L6-v2 (384-dim, cosine similarity)
ChromaDB space  : cosine (1 − distance = similarity score)
"""

import logging
import os
import shutil
import time
from typing import Optional

import chromadb
from chromadb.config import Settings
from sentence_transformers import SentenceTransformer

from recipe_loader import build_recipe_document, load_recipes

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Configuration (read from environment / .env)
# ─────────────────────────────────────────────────────────────────────────────
COLLECTION_NAME      = "recipes"
DEFAULT_TOP_K        = int(os.getenv("TOP_K_RESULTS", "5"))
EMBEDDING_MODEL_NAME = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
CHROMA_PERSIST_DIR   = os.getenv("CHROMA_PERSIST_DIR", "./chroma_db")

# Batch size for upsert — ChromaDB is happiest with batches ≤ 500
_UPSERT_BATCH = 500


# ─────────────────────────────────────────────────────────────────────────────
# VectorStore
# ─────────────────────────────────────────────────────────────────────────────

class VectorStore:
    """
    Wraps a persistent ChromaDB collection for recipe semantic search.
    Thread-safe for concurrent Flask requests (reads are stateless after init).
    """

    def __init__(self):
        self._client: Optional[chromadb.PersistentClient] = None
        self._collection = None
        self._embedding_model: Optional[SentenceTransformer] = None
        self._initialized = False

    # ── Shutdown ──────────────────────────────────────────────────────────────

    def close(self) -> None:
        """
        Release the ChromaDB client and embedding model.

        ChromaDB's PersistentClient uses an embedded SQLite database via
        a background thread.  Calling reset() (or simply dereferencing the
        client) is sufficient to flush pending WAL pages and close the file
        handle cleanly, which prevents database corruption on SIGTERM.

        Called from the Gunicorn worker_exit server hook so it runs in
        each worker process just before the process exits.
        """
        if not self._initialized:
            return
        try:
            if self._client is not None:
                # Dereference — lets the SQLite WAL flush and file handles close.
                # PersistentClient has no explicit .close(); dropping the
                # reference triggers __del__ which closes the underlying DB.
                self._client = None
                self._collection = None
                logger.info("ChromaDB client released.")
        except Exception as exc:
            logger.warning("Error releasing ChromaDB client: %s", exc)
        finally:
            self._embedding_model = None
            self._initialized = False

    # ── Startup ───────────────────────────────────────────────────────────────

    def initialize(self) -> None:
        """
        Full startup sequence (called once at Flask startup via preload_app):
          1. Load SentenceTransformer embedding model
          2. Connect to / create ChromaDB persistent collection
             - Auto-detects HNSW index corruption and wipes+rebuilds if found
          3. Upsert all recipes if the collection is empty (Option B: rebuild
             on first container start; cached on subsequent restarts)
        """
        if self._initialized:
            logger.info("VectorStore already initialised -- skipping.")
            return

        t0 = time.time()

        # ── 1. Embedding model ────────────────────────────────────────────────
        # SENTENCE_TRANSFORMERS_HOME is set in the Dockerfile so the model is
        # loaded from the baked-in cache -- no network call at runtime.
        logger.info("Loading embedding model '%s'...", EMBEDDING_MODEL_NAME)
        self._embedding_model = SentenceTransformer(EMBEDDING_MODEL_NAME)
        logger.info("Embedding model loaded in %.1fs.", time.time() - t0)

        # ── 2. ChromaDB ────────────────────────────────────────────────────────
        persist_dir = os.getenv("CHROMA_PERSIST_DIR", CHROMA_PERSIST_DIR)
        logger.info("Connecting to ChromaDB at '%s'...", persist_dir)
        os.makedirs(persist_dir, exist_ok=True)

        # Wipe corrupt persist dir before opening the client so ChromaDB never
        # sees a partially-written HNSW index (link_lists.bin == 0 bytes is the
        # definitive signal that the index write was interrupted).
        _maybe_wipe_corrupt_index(persist_dir)

        self._client = chromadb.PersistentClient(
            path=persist_dir,
            settings=Settings(anonymized_telemetry=False),
        )
        self._collection = self._client.get_or_create_collection(
            name=COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )

        # ── 3. Embed & upsert ──────────────────────────────────────────────────
        self._upsert_all_recipes()
        self._initialized = True

        logger.info(
            "VectorStore ready in %.1fs. Collection '%s' has %d documents.",
            time.time() - t0,
            COLLECTION_NAME,
            self._collection.count(),
        )

    def _upsert_all_recipes(self) -> None:
        """
        Build embeddings for every recipe and upsert into ChromaDB.

        Uses batch upserts of _UPSERT_BATCH records to avoid memory spikes
        when processing all 5 000 recipes at once.
        ChromaDB upsert is idempotent — duplicate IDs are updated, not doubled.
        """
        recipes = load_recipes()
        if not recipes:
            logger.warning("No recipes found — vector store will be empty.")
            return

        # Check how many are already stored to skip full re-embed on restart
        existing_count = self._collection.count()
        if existing_count >= len(recipes):
            logger.info(
                "ChromaDB already contains %d documents (dataset has %d). "
                "Skipping re-embedding — delete %s to force rebuild.",
                existing_count, len(recipes), CHROMA_PERSIST_DIR,
            )
            return

        logger.info(
            "Embedding %d recipes (batch size %d) — this may take a minute "
            "on first run...", len(recipes), _UPSERT_BATCH,
        )

        total_upserted = 0
        for batch_start in range(0, len(recipes), _UPSERT_BATCH):
            batch = recipes[batch_start : batch_start + _UPSERT_BATCH]

            ids, documents, embeddings, metadatas = [], [], [], []
            for recipe in batch:
                doc  = build_recipe_document(recipe)
                emb  = self._embed(doc)
                meta = _build_metadata(recipe)

                ids.append(recipe["id"])
                documents.append(doc)
                embeddings.append(emb)
                metadatas.append(meta)

            self._collection.upsert(
                ids=ids,
                documents=documents,
                embeddings=embeddings,
                metadatas=metadatas,
            )
            total_upserted += len(batch)
            logger.info(
                "  Upserted %d / %d recipes...", total_upserted, len(recipes)
            )

        logger.info("All %d recipes upserted into ChromaDB.", total_upserted)

    # ── Query ─────────────────────────────────────────────────────────────────

    def query(
        self,
        query_text: str,
        top_k: int = DEFAULT_TOP_K,
        cuisine_filter: Optional[str] = None,
        dietary_filter: Optional[list[str]] = None,
    ) -> list[dict]:
        """
        Semantic search over the recipe collection.

        Args:
            query_text:     Natural-language query (ingredient list as sentence)
            top_k:          Number of top results to return
            cuisine_filter: Optional cuisine name to restrict results
            dietary_filter: Optional dietary tags (ALL must match)

        Returns:
            List of result dicts:
              id, name, cuisine, dietary (list), difficulty,
              cook_time_minutes, servings, calories,
              similarity_score (0–1), document (str)
        """
        self._ensure_initialized()

        query_embedding = self._embed(query_text)

        # ChromaDB 1.x dropped $contains — only use $eq-compatible filters.
        # Dietary filtering is applied in Python after the query.
        where_clause = _build_where_clause(cuisine_filter)

        # Fetch more candidates when dietary filtering so we can post-filter
        # and still return top_k results.
        fetch_k = min(
            top_k * 4 if dietary_filter else top_k,
            self._collection.count() or 1,
        )

        query_kwargs: dict = dict(
            query_embeddings=[query_embedding],
            n_results=fetch_k,
            include=["metadatas", "distances", "documents"],
        )
        if where_clause:
            query_kwargs["where"] = where_clause

        results = self._collection.query(**query_kwargs)
        parsed = _parse_query_results(results)

        # Post-filter by dietary tags (all supplied tags must be present)
        if dietary_filter:
            dietary_lower = [d.lower() for d in dietary_filter]
            parsed = [
                r for r in parsed
                if all(
                    any(d == tag.lower() for tag in r["dietary"])
                    for d in dietary_lower
                )
            ]

        return parsed[:top_k]

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _embed(self, text: str) -> list[float]:
        """Generate a normalised 384-dim embedding vector."""
        vec = self._embedding_model.encode(text, normalize_embeddings=True)
        return vec.tolist()

    def _ensure_initialized(self) -> None:
        if not self._initialized:
            raise RuntimeError(
                "VectorStore.initialize() must be called before querying."
            )

    def health(self) -> dict:
        if not self._initialized:
            return {"status": "uninitialized"}
        return {
            "status":          "ok",
            "collection":      COLLECTION_NAME,
            "document_count":  self._collection.count(),
            "embedding_model": EMBEDDING_MODEL_NAME,
            "persist_dir":     CHROMA_PERSIST_DIR,
        }


# ─────────────────────────────────────────────────────────────────────────────
# Module-level singleton
# ─────────────────────────────────────────────────────────────────────────────
vector_store = VectorStore()


# ─────────────────────────────────────────────────────────────────────────────
# Private helpers
# ─────────────────────────────────────────────────────────────────────────────

def _build_metadata(recipe: dict) -> dict:
    """
    Build the flat metadata dict stored per document in ChromaDB.
    ChromaDB metadata values must be str | int | float | bool.
    Lists must be serialised to strings.
    """
    return {
        "name":              recipe["name"],
        "cuisine":           recipe["cuisine"],
        "dietary":           ",".join(recipe.get("dietary", [])),
        "difficulty":        recipe.get("difficulty", "Medium"),
        "cook_time_minutes": int(recipe.get("cook_time_minutes", 0)),
        "servings":          int(recipe.get("servings", 4)),
        "calories":          float(recipe.get("calories", 0.0)),
    }


def _maybe_wipe_corrupt_index(persist_dir: str) -> None:
    """
    Scan persist_dir for HNSW segment sub-directories and wipe the entire
    persist_dir if any segment looks corrupt.

    Corruption signals (either is sufficient):
      * link_lists.bin exists but is 0 bytes  -- index write was interrupted
      * data_level0.bin exists but is < 50 KB  -- far too small for any real dataset

    Wiping before chromadb.PersistentClient() opens the DB means ChromaDB will
    create a fresh, empty collection instead of hitting the
    "Error finding id" InternalError at query time.
    """
    for entry in os.scandir(persist_dir):
        if not entry.is_dir():
            continue
        link_lists = os.path.join(entry.path, "link_lists.bin")
        data_level0 = os.path.join(entry.path, "data_level0.bin")

        corrupt = False
        if os.path.exists(link_lists) and os.path.getsize(link_lists) == 0:
            logger.warning(
                "Corrupt HNSW index detected in '%s': link_lists.bin is 0 bytes.",
                entry.path,
            )
            corrupt = True
        elif os.path.exists(data_level0) and os.path.getsize(data_level0) < 50_000:
            logger.warning(
                "Corrupt HNSW index detected in '%s': data_level0.bin is only %d bytes.",
                entry.path,
                os.path.getsize(data_level0),
            )
            corrupt = True

        if corrupt:
            logger.warning(
                "Wiping '%s' so ChromaDB can rebuild a clean index. "
                "This is a one-time operation -- subsequent starts will be fast.",
                persist_dir,
            )
            shutil.rmtree(persist_dir)
            os.makedirs(persist_dir, exist_ok=True)
            logger.info("Wiped and recreated '%s'.", persist_dir)
            return  # Only one wipe needed; client will start fresh


def _build_where_clause(cuisine: Optional[str]) -> Optional[dict]:
    """
    Construct a ChromaDB metadata filter using only $eq (supported in 1.x).
    Dietary filtering is done in Python after the query (see VectorStore.query).
    """
    if not cuisine:
        return None
    return {"cuisine": {"$eq": cuisine}}


def _parse_query_results(results: dict) -> list[dict]:
    """
    Flatten ChromaDB's list-of-lists response into a clean list of dicts.
    ChromaDB returns one inner list per query embedding (we only ever send one).
    """
    ids       = results.get("ids",       [[]])[0]
    metadatas = results.get("metadatas", [[]])[0]
    distances = results.get("distances", [[]])[0]
    documents = results.get("documents", [[]])[0]

    parsed = []
    for rec_id, meta, dist, doc in zip(ids, metadatas, distances, documents):
        dietary_raw = meta.get("dietary", "")
        parsed.append({
            "id":                rec_id,
            "name":              meta.get("name", ""),
            "cuisine":           meta.get("cuisine", "Unknown"),
            "dietary":           [t for t in dietary_raw.split(",") if t],
            "difficulty":        meta.get("difficulty", "Medium"),
            "cook_time_minutes": meta.get("cook_time_minutes", 0),
            "servings":          meta.get("servings", 4),
            "calories":          meta.get("calories", 0.0),
            "similarity_score":  round(1.0 - float(dist), 4),
            "document":          doc,
        })
    return parsed
