<div align="center">

# 🍽️ IBM Granite ChefAI

### An AI-Powered Recipe Recommendation Engine built with IBM Granite, RAG, and ChromaDB

[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![Flask](https://img.shields.io/badge/Flask-3.1.2-000000?style=for-the-badge&logo=flask&logoColor=white)](https://flask.palletsprojects.com/)
[![IBM Watsonx](https://img.shields.io/badge/IBM-Watsonx.ai-052FAD?style=for-the-badge&logo=ibm&logoColor=white)](https://www.ibm.com/watsonx)
[![IBM Granite](https://img.shields.io/badge/IBM-Granite%20LLM-052FAD?style=for-the-badge&logo=ibm&logoColor=white)](https://www.ibm.com/granite)
[![RAG](https://img.shields.io/badge/Architecture-RAG-FF6B35?style=for-the-badge)](https://en.wikipedia.org/wiki/Retrieval-augmented_generation)
[![ChromaDB](https://img.shields.io/badge/ChromaDB-1.1.1-FF6B35?style=for-the-badge)](https://www.trychroma.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-22C55E?style=for-the-badge)](LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/PokuriLahari/IBM_GRANITE_CHEFAI?style=for-the-badge&color=gold)](https://github.com/PokuriLahari/IBM_GRANITE_CHEFAI/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/PokuriLahari/IBM_GRANITE_CHEFAI?style=for-the-badge&color=blue)](https://github.com/PokuriLahari/IBM_GRANITE_CHEFAI/network/members)
[![GitHub Issues](https://img.shields.io/github/issues/PokuriLahari/IBM_GRANITE_CHEFAI?style=for-the-badge&color=red)](https://github.com/PokuriLahari/IBM_GRANITE_CHEFAI/issues)

**Turn any set of ingredients into a restaurant-quality recipe in seconds — powered by IBM Granite foundation models, semantic vector search, and Retrieval-Augmented Generation (RAG).**

[🚀 Quick Start](#-quick-start) · [📖 How RAG Works](#-how-rag-works) · [🔌 API Reference](#-api-reference) · [🐳 Docker](#-docker-deployment) · [☁️ IBM Code Engine](#️-ibm-code-engine-deployment)

</div>

---

## 📌 Problem Statement

Home cooks and professional chefs often face two common challenges:

1. **Ingredient Waste** — They have ingredients on hand but do not know what recipes they can make with them.
2. **Decision Fatigue** — Searching recipe databases manually returns generic results that rarely match the exact ingredients available.

IBM Granite ChefAI solves this by combining **semantic search** (ChromaDB + SentenceTransformers) with **generative AI** (IBM Granite via Watsonx.ai) to deliver personalised, context-aware recipe recommendations, ingredient substitution suggestions, and food waste reduction tips — all in real time.

---

## ✨ Features

| Feature | Description |
|---|---|
| 🧠 **RAG Recipe Recommendation** | Semantic search over ~5 000 recipes via ChromaDB + IBM Granite generation |
| 📋 **Step-by-Step Instructions** | Numbered, detailed cooking steps generated and contextualised by Granite |
| 🔄 **Ingredient Substitutions** | AI-powered swap suggestions with quantity ratios and flavour notes |
| ♻️ **Food Waste Reduction** | 2–3 specific tips per recipe for using leftover ingredients |
| 🥗 **Nutritional Information** | Calories from dataset + protein/carbs/fat estimated by Granite |
| ⏱️ **Cook Time & Difficulty** | Inferred from dataset (Easy / Medium / Hard) |
| 🌍 **Cuisine Filters** | Indian, Chinese, Italian, Mexican, and more |
| 🥦 **Dietary Filters** | Vegetarian, Vegan, Gluten-Free, and more |
| 🍜 **Leftover Suggestions** | Creative recipes using exactly what you have |
| 🛒 **Shopping List** | Auto-detect missing ingredients + categorised shopping list |
| ❤️ **Favourite Recipes** | Save and revisit favourites (session-persisted) |
| 🕐 **Query History** | Replay past searches with one click |
| 🌙 **Dark / Light Mode** | Full theme toggle persisted in `localStorage` |
| 📱 **Responsive Design** | Mobile-first Bootstrap 5.3 single-page layout |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser  (SPA)                           │
│           Bootstrap 5.3 · Dark Mode · Recipe Cards              │
└───────────────────────────┬─────────────────────────────────────┘
                            │  REST API (JSON)
┌───────────────────────────▼─────────────────────────────────────┐
│                       Flask  app.py                             │
│         14 REST endpoints · Session management · CORS           │
└──────┬────────────────────┬───────────────────────────┬─────────┘
       │                    │                           │
┌──────▼──────┐   ┌─────────▼────────┐   ┌─────────────▼─────────┐
│   rag.py    │   │  recipe_loader   │   │     granite.py         │
│  RAG        │   │     .py          │   │  IBM Watsonx.ai        │
│ Orchestrator│   │  JSON Dataset    │   │  IBM Granite LLM       │
└──────┬──────┘   └─────────┬────────┘   └───────────────────────┘
       │                    │
┌──────▼────────────────────▼─────────────────────────────────────┐
│                     vector_store.py                             │
│     ChromaDB (persistent) · SentenceTransformers               │
│      all-MiniLM-L6-v2 · 384-dim · cosine similarity            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔍 How RAG Works

Retrieval-Augmented Generation (RAG) combines the precision of vector search with the fluency of a large language model:

```
User Ingredients  →  Semantic Query String
        │
        ▼
SentenceTransformer  →  384-dim embedding vector
        │
        ▼
ChromaDB cosine similarity search  →  Top-K recipe candidates
        │
        ▼
Hydrate: join vector results with full recipe JSON
        │
        ▼
Construct augmented prompt  (context + user ingredients)
        │
        ▼
IBM Granite  (ibm/granite-8b-code-instruct)  →  Structured response
        │
        ▼
Flask  →  Browser
```

**Why RAG instead of pure LLM?**

| Approach | Problem |
|---|---|
| Pure LLM | Hallucinated recipes, wrong ingredients, no real data |
| Pure search | Returns exact matches only, no generative quality |
| **RAG (this project)** | **Grounded in real data + LLM-quality output** |

The vector store retrieves the most semantically relevant recipes from the dataset. IBM Granite then uses those recipes as grounded context to generate accurate, personalised responses — eliminating hallucinations while maintaining natural language quality.

---

## 🛠️ Technology Stack

| Layer | Technology | Version |
|---|---|---|
| **LLM** | IBM Granite via Watsonx.ai | `ibm/granite-8b-code-instruct` |
| **Vector DB** | ChromaDB (persistent, local) | 1.1.1 |
| **Embeddings** | SentenceTransformers `all-MiniLM-L6-v2` | 5.6.0 |
| **Tensor Backend** | PyTorch | 2.11.0 |
| **Web Framework** | Flask | 3.1.2 |
| **WSGI Server** | Gunicorn (Linux/Docker) | 23.0.0 |
| **Auth** | IBM Cloud IAM (token exchange) | — |
| **Config** | python-dotenv | 1.2.2 |
| **HTTP Client** | requests (pooled + retry) | 2.33.1 |
| **Language** | Python | 3.10–3.13 |

### IBM Cloud Services Used

| Service | Purpose |
|---|---|
| **IBM Watsonx.ai Runtime** | Hosts and serves IBM Granite LLM via REST API |
| **IBM Granite (granite-8b-code-instruct)** | Text generation — recipes, substitutions, shopping lists |
| **IBM Cloud IAM** | API key → Bearer token exchange for all API calls |
| **IBM Code Engine** *(optional)* | Serverless container deployment |
| **IBM Container Registry** *(optional)* | Private Docker image storage |

---

## 📁 Project Structure

```
IBM_GRANITE_CHEFAI/
│
├── app.py                  ← Flask application — 14 REST endpoints, session management
├── rag.py                  ← RAG orchestration (retrieve → hydrate → generate)
├── recipe_loader.py        ← JSON dataset loader, normaliser, filter helpers
├── vector_store.py         ← ChromaDB + SentenceTransformers semantic search
├── granite.py              ← IBM Watsonx.ai / Granite LLM integration layer
├── gunicorn.conf.py        ← Production WSGI config (Gunicorn, Linux/Docker)
│
├── requirements.txt        ← Pinned Python dependencies
├── Dockerfile              ← Multi-stage production Docker image
├── deployment.md           ← IBM Code Engine deployment guide
├── README.md               ← This file
├── .env.example            ← Environment variable template  →  copy to .env
├── .gitignore              ← Comprehensive ignore rules
│
├── data/
│   └── recipes_small.json  ← ~4 998-recipe dataset (JSON array)
│
├── templates/
│   └── index.html          ← Single-page application (Bootstrap 5.3)
│
└── static/
    ├── css/
    │   └── style.css       ← Custom CSS, dark mode, animations
    └── js/
        └── app.js          ← Frontend logic, API calls, UI state management
```

---

## 🚀 Quick Start

### Prerequisites

- Python **3.10 – 3.13** (3.13 tested on Windows; 3.11 in Docker)
- An [IBM Cloud](https://cloud.ibm.com) account (Lite tier is free)
- An [IBM Watsonx.ai](https://www.ibm.com/watsonx) project with a Granite model enabled
- ~3 GB disk space (PyTorch + embedding model cache)

### 1. Clone the repository

```bash
git clone https://github.com/PokuriLahari/IBM_GRANITE_CHEFAI.git
cd IBM_GRANITE_CHEFAI
```

### 2. Create a virtual environment

```bash
# Windows (PowerShell)
python -m venv venv
.\venv\Scripts\Activate.ps1

# macOS / Linux
python -m venv venv
source venv/bin/activate
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

> ⚠️ `torch` (~2 GB) and `sentence-transformers` (~90 MB model on first run) make the first install large. Allow several minutes.

### 4. Configure environment variables

```bash
# Windows
Copy-Item .env.example .env

# macOS / Linux
cp .env.example .env
```

Open `.env` and fill in your IBM credentials:

```env
IBM_API_KEY=YOUR_IBM_CLOUD_API_KEY
IBM_PROJECT_ID=YOUR_WATSONX_PROJECT_ID
IBM_URL=https://au-syd.ml.cloud.ibm.com
MODEL_ID=ibm/granite-8b-code-instruct
FLASK_SECRET_KEY=your-random-secret-key-here
```

#### Where to find your IBM credentials

| Variable | Location |
|---|---|
| `IBM_API_KEY` | [cloud.ibm.com](https://cloud.ibm.com) → Manage → Access (IAM) → API keys → **Create** |
| `IBM_PROJECT_ID` | [dataplatform.cloud.ibm.com](https://dataplatform.cloud.ibm.com) → Your project → Manage → General → **Project ID** |
| `IBM_URL` | Regional endpoint — `us-south`, `eu-de`, `jp-tok`, or `au-syd` |
| `MODEL_ID` | Available models listed in `.env.example` |

### 5. Run the application

```bash
python app.py
```

Open **http://localhost:5000** in your browser.

On first run the application will:
1. Download the `all-MiniLM-L6-v2` embedding model (~90 MB, once only)
2. Embed all recipes into ChromaDB (~2–3 minutes on first start, then cached)
3. All subsequent starts take ~10–15 seconds

---

## 🔌 API Reference

All endpoints return a consistent JSON envelope:

```json
{ "success": true,  "data": { ... } }
{ "success": false, "error": "message", "details": "..." }
```

### `POST /api/recommend`
Core RAG pipeline — ingredient list → best-matching recipe with full instructions.

**Request:**
```json
{
  "ingredients": ["chicken", "garlic", "tomato"],
  "cuisine": "Indian",
  "dietary": ["Gluten-Free"],
  "top_k": 5
}
```

**Response `data`:**
```json
{
  "generated_response": "## Chicken Tikka Masala\n...",
  "retrieved_recipes":  [{ "id": "42", "name": "...", "similarity_score": 0.87 }],
  "query_ingredients":  ["chicken", "garlic", "tomato"],
  "filters_applied":    { "cuisine": "Indian", "dietary": ["Gluten-Free"] }
}
```

---

### `POST /api/substitutions`
AI ingredient substitution suggestions with quantity ratios and flavour notes.

```json
{ "ingredient": "heavy cream", "recipe_name": "Chicken Tikka Masala", "dietary": ["Vegan"] }
```

---

### `POST /api/shopping-list`
Detect missing ingredients and generate a categorised shopping list.

```json
{ "recipe_id": "42", "ingredients": ["chicken", "garlic"] }
```

---

### `POST /api/leftover`
Creative recipe suggestions using leftover/available ingredients.

```json
{ "ingredients": ["cooked rice", "eggs", "spring onion"], "cuisine": "Chinese" }
```

---

### `POST /api/detect-missing`
Check ingredient coverage for a specific recipe (returns `coverage_percent`).

```json
{ "recipe_id": "42", "ingredients": ["chicken", "garlic", "soy sauce"] }
```

---

### `GET /api/recipes`
Browse recipes with optional filters.

```
GET /api/recipes?cuisine=Indian&dietary=Vegetarian&limit=10&offset=0
```

---

### `GET /api/recipes/:id`
Get full recipe details by ID.

---

### `GET /api/cuisines`
List all available cuisine types.

---

### `GET /api/dietary-tags`
List all available dietary tags.

---

### `GET|POST|DELETE /api/favorites`
Manage saved favourite recipes (session-based storage).

---

### `GET|DELETE /api/history`
View and clear query history (session-based, max 50 entries).

---

### `GET /api/health`
System health check — returns status of vector store and IBM Granite.

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "pipeline_ready": true,
    "vector_store": { "status": "ok", "document_count": 4998 },
    "ibm_granite": { "ibm_api_key_set": true, "model_id": "ibm/granite-8b-code-instruct" }
  }
}
```

---

## 📦 Dataset

The application ships with `data/recipes_small.json` — a ~4 998-recipe dataset:

| Field | Description |
|---|---|
| `id` | Unique integer identifier |
| `title` | Recipe name |
| `ingredients` | List of ingredient strings |
| `instructions` | List of step strings |
| `cook_time_minutes` | Estimated cooking time |
| `diet` | `"Vegetarian"` or `"Unknown"` |
| `cuisine` | Cuisine type (Indian, Chinese, Italian, Mexican, …) |
| `calories` | Caloric content per serving |

At startup, `recipe_loader.py` normalises the raw JSON into a clean schema and `vector_store.py` embeds every recipe into ChromaDB using the `all-MiniLM-L6-v2` model. The vector store is rebuilt automatically if missing or corrupt.

---

## 🐳 Docker Deployment

### Build and run locally

```bash
# Build the production image
docker build -t ibm-granite-chefai .

# Run with your credentials
docker run --rm -p 8080:8080 \
  --env-file .env \
  -e FLASK_PORT=8080 \
  ibm-granite-chefai

# Verify health
curl http://localhost:8080/api/health
```

> **First build:** ~8–12 min (downloads PyTorch, pre-caches embedding model).  
> **Subsequent builds:** ~1–2 min (Docker layer cache on `requirements.txt`).

---

## ☁️ IBM Code Engine Deployment

See [`deployment.md`](deployment.md) for the complete step-by-step guide covering:

- IBM Container Registry setup
- Code Engine project and registry secret creation
- Application secrets management (API keys never in the image)
- Resource sizing rationale (2 vCPU / 4 GiB)
- Rolling update with zero downtime
- Scaling to zero and back
- ChromaDB persistence strategy
- Log streaming

**Quick deploy summary:**

```bash
# 1. Push image
IMAGE=au.icr.io/recipeai/recipeai-app:latest
docker build -t $IMAGE . && docker push $IMAGE

# 2. Create project
ibmcloud ce project create --name chefai-prod
ibmcloud ce project select  --name chefai-prod

# 3. Store secrets
ibmcloud ce secret create --name chefai-secrets \
  --from-literal IBM_API_KEY="$IBM_API_KEY" \
  --from-literal IBM_PROJECT_ID="$IBM_PROJECT_ID" \
  --from-literal FLASK_SECRET_KEY="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"

# 4. Deploy
ibmcloud ce application create \
  --name chefai --image $IMAGE \
  --registry-secret icr-secret \
  --port 8080 --cpu 2 --memory 4G \
  --env-from-secret chefai-secrets
```

---

## 🔒 Security

| Concern | Mitigation |
|---|---|
| IBM credentials | Stored in `.env` only — excluded from git via `.gitignore` |
| API key exposure | `.env.example` uses placeholders; no real keys in source |
| XSS | All user input HTML-escaped before DOM insertion (`escHtml()`) |
| CSRF / sessions | Session cookies use `SameSite=Lax`; `Secure` flag in production |
| Input validation | Type, length, and empty-string guards on every API endpoint |
| Error leakage | Stack traces never exposed to clients — consistent error envelope |
| Container security | Non-root user (`appuser`, UID 1001) in Docker image |
| Gunicorn hardening | `limit_request_line=4096`, `limit_request_fields=100` |

---

## ⚙️ Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `IBM_API_KEY` | ✅ | — | IBM Cloud IAM API key |
| `IBM_PROJECT_ID` | ✅ | — | Watsonx.ai project ID |
| `FLASK_SECRET_KEY` | ✅ | — | Flask session signing key (random 32-byte hex) |
| `IBM_URL` | — | `https://au-syd.ml.cloud.ibm.com` | Watsonx.ai regional endpoint |
| `MODEL_ID` | — | `ibm/granite-8b-code-instruct` | LLM model ID |
| `CHROMA_PERSIST_DIR` | — | `./chroma_db` | ChromaDB persistence directory |
| `TOP_K_RESULTS` | — | `5` | Number of recipes retrieved per query |
| `EMBEDDING_MODEL` | — | `all-MiniLM-L6-v2` | SentenceTransformer model name |
| `FLASK_HOST` | — | `0.0.0.0` | Server bind address |
| `FLASK_PORT` | — | `5000` | Server port |
| `DEBUG` | — | `false` | Enable Flask debug mode |
| `LOG_LEVEL` | — | `INFO` | Logging verbosity (`DEBUG`/`INFO`/`WARNING`) |
| `GUNICORN_WORKERS` | — | `2` | Gunicorn worker processes |
| `GUNICORN_THREADS` | — | `2` | Threads per Gunicorn worker |
| `ALLOWED_ORIGINS` | — | same-origin | Comma-separated CORS origins |

Copy `.env.example` → `.env` and fill in the required values before running.

---

## 🔮 Future Enhancements

- [ ] **User accounts** — persistent favourites and history via SQLite / PostgreSQL
- [ ] **Recipe images** — IBM Cloud Object Storage integration for food photography
- [ ] **Voice input** — Web Speech API for hands-free ingredient entry
- [ ] **Meal planning** — Weekly plan builder with automatic shopping list aggregation
- [ ] **Multi-language** — Granite multilingual model for non-English cuisine names
- [ ] **Nutrition API** — USDA FoodData Central integration for verified macros
- [ ] **Social sharing** — Share recipes via unique URL
- [ ] **Feedback loop** — User ratings feed back into retrieval ranking

---

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m 'feat: add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

Please ensure your changes do not break the existing API contract and that no credentials are committed.

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgements

- [IBM Watsonx.ai](https://www.ibm.com/watsonx) — Granite foundation models and cloud AI infrastructure
- [ChromaDB](https://www.trychroma.com/) — Open-source vector database for semantic search
- [Sentence Transformers](https://www.sbert.net/) — `all-MiniLM-L6-v2` embedding model
- [Bootstrap 5](https://getbootstrap.com/) — Frontend CSS framework
- [Flask](https://flask.palletsprojects.com/) — Lightweight Python web framework

---

<div align="center">
  Made with ❤️ using <strong>IBM Granite · ChromaDB · Flask · Python</strong>
  <br/><br/>
  <a href="https://github.com/PokuriLahari/IBM_GRANITE_CHEFAI">⭐ Star this project if you find it useful!</a>
</div>
