"""
gunicorn.conf.py
────────────────
Gunicorn configuration for production deployment on IBM Code Engine.

Tuning rationale
────────────────
• workers=2      : Code Engine starter plan = 2 vCPU / 4 GiB RAM.
                   RAG pipeline holds ~1.5 GiB (torch + ChromaDB) per worker.
                   2 × 1.5 GiB ≈ 3 GiB — safe with headroom.
• threads=2      : Watsonx.ai calls are I/O-bound; 2 threads lets each worker
                   handle 2 concurrent requests without blocking.
• timeout=180    : Granite generation can take up to 2 minutes.
                   Must exceed the 120 s requests.post timeout in granite.py.
• preload_app    : Load the Flask app once in the master process, fork workers.
                   Saves memory via copy-on-write; RAG pipeline runs once.
• graceful_timeout=30
                 : After SIGTERM, workers have 30 s to finish in-flight requests
                   before Gunicorn sends SIGKILL.  Granite calls time out at
                   120 s, but Code Engine's scale-down budget is 30 s, so long
                   requests are cancelled — this is intentional.

Graceful shutdown sequence (SIGTERM / Code Engine scale-down)
─────────────────────────────────────────────────────────────
1. Code Engine sends SIGTERM to the container (PID 1 = Gunicorn master).
2. Gunicorn master sends SIGTERM to all workers.
3. Each worker stops accepting new connections and finishes in-flight requests
   (up to graceful_timeout seconds).
4. worker_exit hook fires in each worker → ChromaDB released, HTTP session
   closed, logging flushed.
5. on_exit hook fires in the master → final log line emitted, logging flushed.
6. Gunicorn master exits cleanly.
"""

import logging
import os

logger = logging.getLogger("gunicorn.error")

# ── Binding ────────────────────────────────────────────────────────────────────
host = os.getenv("FLASK_HOST", "0.0.0.0")
port = os.getenv("FLASK_PORT", "8080")
bind = f"{host}:{port}"

# ── Workers ────────────────────────────────────────────────────────────────────
workers      = int(os.getenv("GUNICORN_WORKERS", "2"))
threads      = int(os.getenv("GUNICORN_THREADS", "2"))
worker_class = "sync"

# ── Timeouts ───────────────────────────────────────────────────────────────────
timeout          = 180   # worker killed if silent for this many seconds
graceful_timeout = 30    # seconds to finish in-flight requests after SIGTERM
keepalive        = 5

# ── Application loading ────────────────────────────────────────────────────────
preload_app = True   # load RAG pipeline once in master, share via fork

# ── Logging ───────────────────────────────────────────────────────────────────
# "-" streams to stdout/stderr — Code Engine captures these automatically.
accesslog         = "-"
errorlog          = "-"
loglevel          = os.getenv("LOG_LEVEL", "info")
access_log_format = '%(h)s "%(r)s" %(s)s %(b)s %(D)sµs'

# ── Security ───────────────────────────────────────────────────────────────────
limit_request_line   = 4096
limit_request_fields = 100

# ── Process naming ─────────────────────────────────────────────────────────────
proc_name = "recipeai"


# ─────────────────────────────────────────────────────────────────────────────
# Gunicorn server hooks — graceful shutdown
# ─────────────────────────────────────────────────────────────────────────────

def worker_exit(server, worker):
    """
    Called by Gunicorn inside each *worker process* just before it exits.

    This is the correct place to release per-worker resources because:
      • It runs in the worker's own process space (correct memory context).
      • It is called after all in-flight requests have been processed
        (or graceful_timeout has elapsed).
      • It fires on both normal exit and SIGTERM-triggered shutdown.

    Resources released here:
      1. ChromaDB PersistentClient  — flushes SQLite WAL, closes file handles.
      2. IBM requests.Session       — drains the urllib3 connection pool,
                                      sends TCP FIN on all idle sockets.
      3. Python logging             — flushes all buffered log handlers so
                                      the last log lines reach stdout before
                                      the process exits.
    """
    pid = worker.pid

    # 1. Release ChromaDB
    try:
        from vector_store import vector_store
        vector_store.close()
    except Exception as exc:
        server.log.warning("worker %s: ChromaDB close error: %s", pid, exc)

    # 2. Close IBM HTTP session
    try:
        from granite import close_http_session
        close_http_session()
    except Exception as exc:
        server.log.warning("worker %s: HTTP session close error: %s", pid, exc)

    # 3. Flush all Python log handlers
    for handler in logging.root.handlers:
        try:
            handler.flush()
        except Exception:
            pass

    server.log.info("worker %s: graceful shutdown complete.", pid)


def on_exit(server):
    """
    Called by Gunicorn inside the *master process* after all workers have
    exited.  Used to emit a final shutdown log line and flush the master's
    own log handlers so nothing is lost when the process terminates.
    """
    server.log.info("Gunicorn master exiting — all workers stopped.")
    for handler in logging.root.handlers:
        try:
            handler.flush()
        except Exception:
            pass
