# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — dependency builder
# Installs all Python packages into an isolated prefix so they can be copied
# cleanly into the final stage.  This layer is cached as long as
# requirements.txt doesn't change.
# ─────────────────────────────────────────────────────────────────────────────
FROM python:3.11-slim AS builder

WORKDIR /install

# System build dependencies (needed for chromadb / torch C extensions)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

RUN pip install --upgrade pip --quiet && \
    pip install --prefix=/install/pkg --no-cache-dir -r requirements.txt


# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — runtime image
# Minimal image that only contains the application code and installed packages.
# ─────────────────────────────────────────────────────────────────────────────
FROM python:3.11-slim AS runtime

# libgomp1 is needed at runtime by torch
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 curl \
    && rm -rf /var/lib/apt/lists/*

# Non-root user for security
RUN useradd -m -u 1001 appuser

WORKDIR /app

# Copy installed packages from builder
COPY --from=builder /install/pkg /usr/local

# Copy application source
COPY --chown=appuser:appuser . .

# Remove dev-only files that must not be in the image
RUN rm -f .env _validate_a.py _find_skipped.py

# ── ChromaDB strategy: Option B (rebuild on first run) ─────────────────────
# The chroma_db/ directory on the host is NOT baked into the image.
# On Code Engine, mount a persistent volume at /app/chroma_db OR let the
# container rebuild embeddings automatically on first start (4 998 recipes,
# ~2–3 min on first deployment, then cached for the container lifetime).
# The CHROMA_PERSIST_DIR env var controls the path.
RUN mkdir -p /app/chroma_db && chown appuser:appuser /app/chroma_db

# Sentence-transformers downloads the embedding model from HuggingFace on
# first use.  Pre-download it during the build so container startup is fast
# and no outbound HF traffic is needed at runtime.
ENV SENTENCE_TRANSFORMERS_HOME=/app/.sentence_transformers
RUN python -c "from sentence_transformers import SentenceTransformer; \
               SentenceTransformer('all-MiniLM-L6-v2')" && \
    chown -R appuser:appuser /app/.sentence_transformers

USER appuser

# Expose the port Gunicorn will bind to
EXPOSE 8080

# Environment variable defaults (override at deploy time via Code Engine secrets)
ENV FLASK_ENV=production \
    FLASK_HOST=0.0.0.0 \
    FLASK_PORT=8080 \
    DEBUG=false \
    CHROMA_PERSIST_DIR=/app/chroma_db \
    TOP_K_RESULTS=5 \
    EMBEDDING_MODEL=all-MiniLM-L6-v2 \
    IBM_URL=https://au-syd.ml.cloud.ibm.com \
    MODEL_ID=ibm/granite-8b-code-instruct \
    TRANSFORMERS_OFFLINE=1 \
    HF_DATASETS_OFFLINE=1

# Health-check: Code Engine / container orchestrators poll this
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
    CMD curl -sf http://localhost:8080/api/health || exit 1

# Start Gunicorn via the config file
CMD ["gunicorn", "--config", "gunicorn.conf.py", "app:app"]
