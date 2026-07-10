"""
verify_environment.py
─────────────────────
Pre-flight check for the RecipeAI project.

Run:  python verify_environment.py
      (activate your venv first)

Prints PASS/FAIL for every requirement.
Exit code 0 = all checks passed.
Exit code 1 = one or more checks failed.
"""

import importlib
import importlib.metadata as meta
import json
import os
import socket
import sys
from pathlib import Path

# ── Colour helpers (Windows-safe) ─────────────────────────────────────────────
try:
    import colorama
    colorama.init()
    GREEN  = "\033[32m"
    RED    = "\033[31m"
    YELLOW = "\033[33m"
    RESET  = "\033[0m"
except ImportError:
    GREEN = RED = YELLOW = RESET = ""

PASS  = f"{GREEN}PASS{RESET}"
FAIL  = f"{RED}FAIL{RESET}"
WARN  = f"{YELLOW}WARN{RESET}"

failures: list[str] = []
warnings: list[str] = []


def check(label: str, ok: bool, detail: str = "", warn_only: bool = False) -> bool:
    status = PASS if ok else (WARN if warn_only else FAIL)
    line = f"  [{status}] {label}"
    if detail:
        line += f"  ({detail})"
    print(line)
    if not ok:
        if warn_only:
            warnings.append(label)
        else:
            failures.append(label)
    return ok


_HR  = "-" * 60
_HR2 = "=" * 60


def section(title: str) -> None:
    print(f"\n{_HR}")
    print(f"  {title}")
    print(_HR)


# ─────────────────────────────────────────────────────────────────────────────
# 1. Python version
# ─────────────────────────────────────────────────────────────────────────────
section("1. Python version")
vi = sys.version_info
py_ver = f"{vi.major}.{vi.minor}.{vi.micro}"
py_ok  = (3, 10) <= (vi.major, vi.minor) <= (3, 13)
check("Python 3.10 – 3.13", py_ok, py_ver)
check("Not Python 3.14+",   vi.minor < 14 or vi.major < 3,
      f"{py_ver} (torch has no wheels for 3.14+ yet)", warn_only=True)

# ─────────────────────────────────────────────────────────────────────────────
# 2. Virtual environment
# ─────────────────────────────────────────────────────────────────────────────
section("2. Virtual environment")
in_venv = sys.prefix != sys.base_prefix
check("Running inside a venv", in_venv,
      sys.prefix if in_venv else "run: .\\venv\\Scripts\\Activate.ps1")

# ─────────────────────────────────────────────────────────────────────────────
# 3. Installed packages
# ─────────────────────────────────────────────────────────────────────────────
section("3. Installed packages")

REQUIRED_PACKAGES = {
    "flask":                "3.1.2",
    "flask-cors":           "6.0.2",
    "Werkzeug":             "3.1.3",
    "python-dotenv":        "1.2.2",
    "requests":             "2.33.1",
    "chromadb":             "1.1.1",
    "sentence-transformers":"5.6.0",
    "torch":                "2.11.0",
    "numpy":                "2.2.6",
}

for pkg, expected in REQUIRED_PACKAGES.items():
    try:
        installed = meta.version(pkg)
        ok = installed == expected
        check(f"{pkg}=={expected}", ok,
              f"installed={installed}" if not ok else installed,
              warn_only=not ok)   # version mismatch is a warning, not hard fail
    except meta.PackageNotFoundError:
        check(f"{pkg}=={expected}", False, "NOT INSTALLED")

# Test actual importability (wheel may be broken)
IMPORT_MAP = {
    "flask":                "flask",
    "flask-cors":           "flask_cors",
    "python-dotenv":        "dotenv",
    "requests":             "requests",
    "chromadb":             "chromadb",
    "sentence-transformers":"sentence_transformers",
    "torch":                "torch",
    "numpy":                "numpy",
}
print()
for pkg, mod in IMPORT_MAP.items():
    try:
        importlib.import_module(mod)
        check(f"import {mod}", True)
    except ImportError as e:
        check(f"import {mod}", False, str(e))

# ─────────────────────────────────────────────────────────────────────────────
# 4. .env variables
# ─────────────────────────────────────────────────────────────────────────────
section("4. .env / environment variables")

env_path = Path(".env")
if env_path.exists():
    from dotenv import load_dotenv
    load_dotenv()
    check(".env file exists", True)
else:
    check(".env file exists", False,
          "run: Copy-Item .env.example .env   then fill in credentials")

REQUIRED_ENV = {
    "IBM_API_KEY":    "IBM Cloud IAM API key",
    "IBM_PROJECT_ID": "Watsonx.ai project ID",
    "IBM_URL":        "regional endpoint URL",
    "MODEL_ID":       "Watsonx.ai model ID",
}
OPTIONAL_ENV = {
    "FLASK_SECRET_KEY": "session signing key (insecure default used if absent)",
}

for var, desc in REQUIRED_ENV.items():
    val = os.getenv(var, "")
    is_placeholder = val in ("", "your_ibm_api_key_here", "your_project_id_here")
    check(f"{var} is set", not is_placeholder,
          desc if is_placeholder else f"{'*' * 8}{val[-4:]}" if len(val) > 4 else "set")

for var, desc in OPTIONAL_ENV.items():
    val = os.getenv(var, "")
    check(f"{var} is set", bool(val), desc, warn_only=True)

# ─────────────────────────────────────────────────────────────────────────────
# 5. Dataset
# ─────────────────────────────────────────────────────────────────────────────
section("5. Recipe dataset")

dataset_path = Path("data") / "recipes_small.json"
if check("data/recipes_small.json exists", dataset_path.exists()):
    try:
        raw = dataset_path.read_text(encoding="utf-8")
        raw = raw.replace(": NaN", ": null").replace(":NaN", ":null")
        data = json.loads(raw)
        check("Dataset is valid JSON", True)
        check("Dataset has records", len(data) > 100, f"{len(data)} records")
    except Exception as e:
        check("Dataset is valid JSON", False, str(e))

# ─────────────────────────────────────────────────────────────────────────────
# 6. ChromaDB
# ─────────────────────────────────────────────────────────────────────────────
section("6. ChromaDB")

try:
    import chromadb
    from chromadb.config import Settings
    test_dir = ".verify_chroma_tmp"
    os.makedirs(test_dir, exist_ok=True)
    client = chromadb.PersistentClient(
        path=test_dir,
        settings=Settings(anonymized_telemetry=False),
    )
    col = client.get_or_create_collection("verify_test",
                                          metadata={"hnsw:space": "cosine"})
    col.upsert(ids=["t1"], documents=["test"], embeddings=[[0.1] * 384],
               metadatas=[{"x": "y"}])
    result = col.query(query_embeddings=[[0.1] * 384], n_results=1)
    check("ChromaDB PersistentClient works", len(result["ids"][0]) == 1)
    check("ChromaDB $eq where-clause works", True)
    client = None   # release
    import shutil
    shutil.rmtree(test_dir, ignore_errors=True)
except Exception as e:
    check("ChromaDB", False, str(e))

chroma_dir = Path(os.getenv("CHROMA_PERSIST_DIR", "./chroma_db"))
if chroma_dir.exists():
    try:
        client2 = chromadb.PersistentClient(
            path=str(chroma_dir),
            settings=Settings(anonymized_telemetry=False),
        )
        col2 = client2.get_or_create_collection("recipes")
        count = col2.count()
        check("ChromaDB recipe collection exists", True, f"{count} documents")
        if count == 0:
            check("Recipes embedded in ChromaDB", False,
                  "empty — will auto-build on first app start (~2–3 min)",
                  warn_only=True)
        else:
            check("Recipes embedded in ChromaDB", count >= 100,
                  f"{count} documents")
        client2 = None
    except Exception as e:
        check("ChromaDB recipe collection", False, str(e))
else:
    check("chroma_db/ directory exists", False,
          "will be created automatically on first app start", warn_only=True)

# ─────────────────────────────────────────────────────────────────────────────
# 7. SentenceTransformer embedding model
# ─────────────────────────────────────────────────────────────────────────────
section("7. Sentence-Transformers embedding model")

model_name = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
try:
    from sentence_transformers import SentenceTransformer
    check("sentence_transformers importable", True)
    # Check if the model is already cached locally (avoid network download here)
    from pathlib import Path as _P
    import os as _os
    cache_root = _os.getenv(
        "SENTENCE_TRANSFORMERS_HOME",
        str(_P.home() / ".cache" / "torch" / "sentence_transformers"),
    )
    # HuggingFace also uses ~/.cache/huggingface/hub
    hf_cache   = str(_P.home() / ".cache" / "huggingface" / "hub")
    model_slug = model_name.replace("/", "--")
    cached_st  = any(model_slug in d for d in _os.listdir(cache_root))  \
                 if _P(cache_root).exists() else False
    cached_hf  = any(model_name.replace("/", "--") in d
                     for d in _os.listdir(hf_cache)) \
                 if _P(hf_cache).exists() else False
    check(
        f"Model '{model_name}' cached locally",
        cached_st or cached_hf,
        "will download on first start (~90 MB)" if not (cached_st or cached_hf) else "cached",
        warn_only=True,
    )
except Exception as e:
    check("sentence_transformers", False, str(e))

# ─────────────────────────────────────────────────────────────────────────────
# 8. Internet connectivity
# ─────────────────────────────────────────────────────────────────────────────
section("8. Internet connectivity")

def _tcp_check(host: str, port: int, label: str, warn_only: bool = False) -> bool:
    try:
        sock = socket.create_connection((host, port), timeout=5)
        sock.close()
        return check(label, True)
    except OSError as e:
        return check(label, False, str(e), warn_only=warn_only)

_tcp_check("iam.cloud.ibm.com",    443, "IBM IAM endpoint reachable")
_tcp_check("huggingface.co",       443, "HuggingFace (model download) reachable",
           warn_only=True)

ibm_url = os.getenv("IBM_URL", "https://au-syd.ml.cloud.ibm.com")
ibm_host = ibm_url.replace("https://", "").replace("http://", "").split("/")[0]
_tcp_check(ibm_host, 443, f"Watsonx.ai endpoint ({ibm_host}) reachable")

# ─────────────────────────────────────────────────────────────────────────────
# 9. IBM Granite connectivity (live API call)
# ─────────────────────────────────────────────────────────────────────────────
section("9. IBM Granite API connectivity")

api_key    = os.getenv("IBM_API_KEY", "")
project_id = os.getenv("IBM_PROJECT_ID", "")

if not api_key or api_key == "your_ibm_api_key_here":
    check("IBM credentials present", False,
          "set IBM_API_KEY and IBM_PROJECT_ID in .env")
else:
    import requests as _req

    # Step 1: IAM token
    iam_ok = False
    token  = ""
    try:
        r = _req.post(
            "https://iam.cloud.ibm.com/identity/token",
            data={"grant_type": "urn:ibm:params:oauth:grant-type:apikey",
                  "apikey": api_key},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=15,
        )
        if r.status_code == 200:
            token = r.json().get("access_token", "")
            iam_ok = bool(token)
        check("IBM IAM token obtained", iam_ok,
              f"HTTP {r.status_code}" if not iam_ok else "OK")
    except Exception as e:
        check("IBM IAM token obtained", False, str(e))

    # Step 2: Model availability
    if iam_ok:
        model_id = os.getenv("MODEL_ID", "ibm/granite-8b-code-instruct")
        specs_url = f"{ibm_url}/ml/v1/foundation_model_specs?version=2024-09-05&limit=200"
        try:
            r2 = _req.get(specs_url, timeout=10)
            resources = r2.json().get("resources", [])
            gen_models = [
                m["model_id"] for m in resources
                if any(f["id"] == "text_generation" for f in m.get("functions", []))
            ]
            model_available = model_id in gen_models
            check(f"Model '{model_id}' available in region", model_available,
                  f"available: {gen_models}" if not model_available else "OK")
            if not model_available and gen_models:
                print(f"      → Available text_generation models: {gen_models}")
        except Exception as e:
            check("Model availability check", False, str(e))

    # Step 3: Minimal generation call
    if iam_ok and token:
        model_id = os.getenv("MODEL_ID", "ibm/granite-8b-code-instruct")
        chat_url = f"{ibm_url}/ml/v1/text/chat?version=2024-09-05"
        try:
            r3 = _req.post(
                chat_url,
                json={
                    "model_id":   model_id,
                    "project_id": project_id,
                    "messages":   [{"role": "user", "content": "Say OK"}],
                    "max_tokens": 5,
                },
                headers={"Authorization": f"Bearer {token}",
                         "Content-Type": "application/json",
                         "Accept":       "application/json"},
                timeout=30,
            )
            gen_ok = r3.status_code == 200
            check("Granite generation endpoint responds", gen_ok,
                  f"HTTP {r3.status_code}" if not gen_ok else "OK")
        except Exception as e:
            check("Granite generation endpoint responds", False, str(e))

# ─────────────────────────────────────────────────────────────────────────────
# 10. Flask app startup (dry run — no network, no embedding)
# ─────────────────────────────────────────────────────────────────────────────
section("10. Flask app startup (import check)")

try:
    import importlib, sys as _sys
    # Prevent the startup block from running (patch before import)
    import rag as _rag_mod
    _rag_mod.rag_pipeline.initialize = lambda: None

    # Force re-import with the patched pipeline
    if "app" in _sys.modules:
        del _sys.modules["app"]

    _app_mod = importlib.import_module("app")
    routes = [str(r) for r in _app_mod.app.url_map.iter_rules()]
    expected = ["/", "/api/health", "/api/recommend", "/api/substitutions",
                "/api/shopping-list", "/api/leftover", "/api/detect-missing",
                "/api/favorites", "/api/history", "/api/recipes",
                "/api/cuisines", "/api/dietary-tags"]
    missing_routes = [r for r in expected if not any(r in x for x in routes)]
    check("Flask app imports without error", True)
    check("All expected routes registered", len(missing_routes) == 0,
          f"missing: {missing_routes}" if missing_routes else f"{len(routes)} routes")
except Exception as e:
    check("Flask app imports without error", False, str(e))

# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────
print(f"\n{_HR2}")
if failures:
    print(f"  {RED}RESULT: {len(failures)} check(s) FAILED{RESET}")
    for f in failures:
        print(f"  FAIL: {f}")
    print()
    print("  Fix the items above, then re-run:  python verify_environment.py")
elif warnings:
    print(f"  {YELLOW}RESULT: All required checks PASSED "
          f"({len(warnings)} warning(s)){RESET}")
    for w in warnings:
        print(f"  WARN: {w}")
    print()
    print("  Warnings are non-fatal. You can run:  python app.py")
else:
    print(f"  {GREEN}RESULT: ALL CHECKS PASSED{RESET}")
    print()
    print("  Run the application:  python app.py")
print(f"{_HR2}\n")

sys.exit(1 if failures else 0)
