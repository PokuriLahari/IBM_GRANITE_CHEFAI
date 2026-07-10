# RecipeAI — Local Setup Guide (Windows)

## Requirements

| Requirement | Version |
|---|---|
| **Python** | **3.10 – 3.13** (3.13.3 tested) |
| pip | ≥ 23 |
| Internet access | Required for IBM Watsonx.ai API calls |
| IBM Cloud account | Required for Granite LLM (free tier available) |

> **Why Python 3.10–3.13?**  
> `chromadb` and `torch` ship pre-built wheels for Python 3.10–3.13 on Windows.  
> Python 3.9 is end-of-life. Python ≥ 3.14 is not yet supported by PyTorch.

---

## 1 — Create the virtual environment

Open **PowerShell** in the project directory:

```powershell
python -m venv venv
```

---

## 2 — Activate the virtual environment

```powershell
.\venv\Scripts\Activate.ps1
```

If you get an execution-policy error, run this once:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

Your prompt should now show `(venv)`.

---

## 3 — Install dependencies

```powershell
pip install -r requirements.txt
```

> **Notes:**
> - `torch==2.11.0` is ~2 GB. The first install takes several minutes.
> - `gunicorn` is automatically skipped on Windows (`sys_platform != "win32"`).
> - `sentence-transformers` will download the `all-MiniLM-L6-v2` model (~90 MB)
>   on **first run**, not during install.

---

## 4 — Create the `.env` file

```powershell
Copy-Item .env.example .env
```

Open `.env` in any editor and fill in your IBM credentials:

```env
IBM_API_KEY=your_ibm_api_key_here
IBM_PROJECT_ID=your_project_id_here
IBM_URL=https://au-syd.ml.cloud.ibm.com
MODEL_ID=ibm/granite-8b-code-instruct
FLASK_SECRET_KEY=any-long-random-string
FLASK_ENV=development
FLASK_PORT=5000
```

### Where to find IBM credentials

| Variable | Location |
|---|---|
| `IBM_API_KEY` | [cloud.ibm.com](https://cloud.ibm.com) → Manage → Access (IAM) → API keys → Create |
| `IBM_PROJECT_ID` | [dataplatform.cloud.ibm.com](https://dataplatform.cloud.ibm.com) → Your project → Manage → General → Project ID |
| `IBM_URL` | Use your region: `us-south`, `eu-de`, `jp-tok`, or `au-syd` |

---

## 5 — Verify the environment

```powershell
python verify_environment.py
```

All checks should show **PASS**. Fix any **FAIL** items before continuing.

---

## 6 — Start the application

```powershell
python app.py
```

Open your browser at **http://localhost:5000**

On first run, the app will:
1. Download the `all-MiniLM-L6-v2` embedding model (~90 MB, once only)
2. Embed all 4,998 recipes into ChromaDB (~2–3 minutes, once only)
3. Subsequent starts take ~10–15 seconds

---

## 7 — Complete command sequence (fresh machine)

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
python verify_environment.py
python app.py
```

---

## Common errors and fixes

### `ModuleNotFoundError: No module named 'flask_cors'`

The venv was created but `pip install` was not run, or ran incompletely.

```powershell
pip install -r requirements.txt
```

### `ModuleNotFoundError: No module named 'chromadb'`

Same fix:

```powershell
pip install -r requirements.txt
```

### `Set-ExecutionPolicy` blocked

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### `ERROR: Could not find a version that satisfies the requirement gunicorn`

This happens if the `sys_platform` marker is not respected by an older pip.  
Remove or comment the gunicorn line from `requirements.txt`:

```
# gunicorn==23.0.0; sys_platform != "win32"
```

Gunicorn is only needed inside the Docker container (Linux).

### `IBM Watsonx.ai HTTP 404` or model not found

The `MODEL_ID` in your `.env` is not available in your region.  
Run `python verify_environment.py` — it will list available models.

Available models for **au-syd**:
- `ibm/granite-8b-code-instruct` ← recommended
- `ibm/granite-guardian-3-8b`

### ChromaDB: `VectorStore.initialize() must be called before querying`

The RAG pipeline failed to start. Check the console logs for the actual error.  
Most common cause: the `data/recipes_small.json` file is missing.

### `SESSION_COOKIE_SECURE` blocks the session on HTTP

Set `FLASK_ENV=development` in `.env` when running locally. The Secure cookie
flag is only enabled in `production` mode.

### `FLASK_SECRET_KEY is not set` warning

Add it to `.env`:

```env
FLASK_SECRET_KEY=any-long-random-string-here
```

---

## Project structure

```
recipeAI/
├── app.py               ← Flask application (14 REST endpoints)
├── rag.py               ← RAG orchestration
├── granite.py           ← IBM Watsonx.ai integration
├── vector_store.py      ← ChromaDB + SentenceTransformers
├── recipe_loader.py     ← Dataset loader
├── gunicorn.conf.py     ← Production WSGI config (Linux/Docker only)
├── data/
│   └── recipes_small.json   ← 4,998 recipe dataset
├── templates/
│   └── index.html           ← Single-page UI
├── static/
│   ├── css/style.css
│   └── js/app.js
├── chroma_db/           ← Auto-created: ChromaDB vector store
├── requirements.txt
├── .env.example         ← Copy to .env and fill in credentials
├── Dockerfile           ← Production Docker image
└── deployment.md        ← IBM Code Engine deployment guide
```
