# RecipeAI — IBM Code Engine Deployment Guide

## Overview

| Item | Value |
|---|---|
| Runtime | Python 3.11 + Gunicorn |
| WSGI workers | 2 (sync) × 2 threads |
| Port | 8080 |
| Region | au-syd |
| Registry | IBM Container Registry (ICR) |
| LLM | ibm/granite-8b-code-instruct via Watsonx.ai |
| Vector DB | ChromaDB (ephemeral per container, rebuilt on cold start) |

---

## Prerequisites

```bash
# Install IBM Cloud CLI
curl -fsSL https://clis.cloud.ibm.com/install/linux | sh

# Install required plugins
ibmcloud plugin install code-engine
ibmcloud plugin install container-registry

# Log in
ibmcloud login --apikey $IBM_API_KEY -r au-syd
ibmcloud target -r au-syd -g Default
```

---

## 1 — Build and push the Docker image

### 1a. Log in to IBM Container Registry

```bash
ibmcloud cr login
ibmcloud cr namespace-add recipeai          # create once; skip if exists
```

### 1b. Build and push

```bash
IMAGE=au.icr.io/recipeai/recipeai-app:latest

docker build -t $IMAGE .
docker push $IMAGE
```

> **First build:** ~8–12 min (downloads torch + sentence-transformers, pre-caches
> the embedding model). Subsequent builds with unchanged `requirements.txt` use
> the Docker layer cache and take ~1–2 min.

---

## 2 — Create the Code Engine project

```bash
ibmcloud ce project create --name recipeai-prod
ibmcloud ce project select  --name recipeai-prod
```

---

## 3 — Create the registry secret

```bash
ibmcloud ce secret create-registry \
  --name icr-secret \
  --server au.icr.io \
  --username iamapikey \
  --password $IBM_API_KEY
```

---

## 4 — Create the application secrets

All sensitive values are stored as a Code Engine secret — never in the image.

```bash
ibmcloud ce secret create --name recipeai-secrets \
  --from-literal IBM_API_KEY="$IBM_API_KEY" \
  --from-literal IBM_PROJECT_ID="$IBM_PROJECT_ID" \
  --from-literal FLASK_SECRET_KEY="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
```

---

## 5 — Deploy the application

```bash
ibmcloud ce application create \
  --name          recipeai \
  --image         au.icr.io/recipeai/recipeai-app:latest \
  --registry-secret icr-secret \
  --port          8080 \
  --cpu           2 \
  --memory        4G \
  --min-scale     1 \
  --max-scale     3 \
  --timeout       180 \
  --env           FLASK_ENV=production \
  --env           FLASK_PORT=8080 \
  --env           IBM_URL=https://au-syd.ml.cloud.ibm.com \
  --env           MODEL_ID=ibm/granite-8b-code-instruct \
  --env           CHROMA_PERSIST_DIR=/app/chroma_db \
  --env           TOP_K_RESULTS=5 \
  --env           EMBEDDING_MODEL=all-MiniLM-L6-v2 \
  --env           LOG_LEVEL=INFO \
  --env           GUNICORN_WORKERS=2 \
  --env           GUNICORN_THREADS=2 \
  --env-from-secret recipeai-secrets
```

### Resource sizing rationale

| Resource | Value | Reason |
|---|---|---|
| CPU | 2 vCPU | torch embedding uses 1–1.5 vCPU; leaves headroom for Flask |
| Memory | 4 GiB | 2 Gunicorn workers × ~1.5 GiB (model + ChromaDB) = ~3 GiB + OS |
| Min scale | 1 | Avoids cold-start embedding rebuild on first request |
| Timeout | 180 s | Granite generation can take up to 2 min |

---

## 6 — Get the public URL

```bash
ibmcloud ce application get --name recipeai --output url
```

Test the health endpoint:

```bash
curl https://<your-app-url>.au-syd.codeengine.appdomain.cloud/api/health
```

Expected response:

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

## 7 — Redeployment

After pushing a new image:

```bash
# Push new image (same tag)
docker build -t au.icr.io/recipeai/recipeai-app:latest .
docker push    au.icr.io/recipeai/recipeai-app:latest

# Trigger rolling update (zero downtime with min-scale ≥ 1)
ibmcloud ce application update --name recipeai \
  --image au.icr.io/recipeai/recipeai-app:latest
```

To update only environment variables (no rebuild):

```bash
ibmcloud ce application update --name recipeai --env LOG_LEVEL=DEBUG
```

To update a secret:

```bash
ibmcloud ce secret update --name recipeai-secrets \
  --from-literal IBM_API_KEY="<new-key>"
# Then restart the app to pick up the new value:
ibmcloud ce application restart --name recipeai
```

---

## 8 — ChromaDB: Option B (ephemeral, rebuild on cold start)

The vector database is **not committed to the image**. On each new container
instance, `VectorStore.initialize()` checks the document count:

- If `count >= 4998` → embeddings already exist, startup completes in ~5 s.
- If `count == 0` (first start or new container) → embeds 4,998 recipes in
  ~2–3 min, then caches to `/app/chroma_db`.

**Why Option B over Option A (committing chroma_db)?**

| | Option A (commit) | Option B (rebuild) |
|---|---|---|
| Image size | +~200 MB | No change |
| First cold start | Instant | ~2–3 min |
| After model change | Must rebuild image | Automatic |
| Code Engine ephemeral FS | Works until container restart | Works, rebuilds after restart |
| **Verdict** | Good for rapid iteration | **Better for Code Engine** (no large binary files in repo/image) |

For true persistence across container restarts, mount an **IBM Cloud File Storage**
persistent volume at `/app/chroma_db`. Contact your IBM Cloud account team for
Code Engine persistent volume support.

---

## 9 — Scaling

```bash
# Scale to zero when idle (saves cost, but first request triggers cold start):
ibmcloud ce application update --name recipeai --min-scale 0

# Keep 1 instance always warm:
ibmcloud ce application update --name recipeai --min-scale 1

# Handle more concurrent users:
ibmcloud ce application update --name recipeai --max-scale 5
```

---

## 10 — Logs

```bash
# Stream live logs
ibmcloud ce application logs --name recipeai --follow

# Last 100 lines
ibmcloud ce application logs --name recipeai --tail 100
```

---

## 11 — Environment variable reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `IBM_API_KEY` | ✅ | — | IBM Cloud IAM API key |
| `IBM_PROJECT_ID` | ✅ | — | Watsonx.ai project ID |
| `FLASK_SECRET_KEY` | ✅ | — | Flask session signing key (random 32-byte hex) |
| `IBM_URL` | — | `https://au-syd.ml.cloud.ibm.com` | Watsonx.ai regional endpoint |
| `MODEL_ID` | — | `ibm/granite-8b-code-instruct` | Watsonx.ai model |
| `CHROMA_PERSIST_DIR` | — | `/app/chroma_db` | ChromaDB data directory |
| `TOP_K_RESULTS` | — | `5` | Number of recipes retrieved per query |
| `EMBEDDING_MODEL` | — | `all-MiniLM-L6-v2` | SentenceTransformer model name |
| `GUNICORN_WORKERS` | — | `2` | Gunicorn worker processes |
| `GUNICORN_THREADS` | — | `2` | Threads per worker |
| `LOG_LEVEL` | — | `INFO` | Logging verbosity (DEBUG/INFO/WARNING) |
| `ALLOWED_ORIGINS` | — | same-origin | Comma-separated CORS origins |
| `FLASK_ENV` | — | `production` | Enables Secure session cookies |

---

## 12 — Local smoke test before deploying

```bash
# Build image locally
docker build -t recipeai-local .

# Run with your .env values
docker run --rm -p 8080:8080 \
  --env-file .env \
  -e FLASK_PORT=8080 \
  recipeai-local

# Test health
curl http://localhost:8080/api/health

# Test a recipe recommendation
curl -X POST http://localhost:8080/api/recommend \
  -H "Content-Type: application/json" \
  -d '{"ingredients":["chicken","garlic","tomato"]}'
```
