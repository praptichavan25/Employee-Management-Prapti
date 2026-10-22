# gunicorn.conf.py — PHOENIX production WSGI configuration
import os

# Network binding: honour $PORT env var (required by Render/Railway/Heroku)
port = os.environ.get("PORT", "5001")
bind = f"0.0.0.0:{port}"

# Worker processes: 2× CPU cores is a sensible default for I/O-bound Flask
workers = int(os.environ.get("WEB_CONCURRENCY", 2))
worker_class = "sync"

# Timeouts
timeout = 120           # Kill workers that hang for >2 minutes
graceful_timeout = 30   # Give workers 30 s to finish in-flight requests on restart
keepalive = 5           # Keep idle connections open for 5 s

# Logging
accesslog = "-"         # Write access log to stdout (captured by hosting platform)
errorlog = "-"          # Write error log to stderr
loglevel = os.environ.get("LOG_LEVEL", "info")

# Security: do not expose gunicorn server header
forwarded_allow_ips = "*"   # Trust X-Forwarded-* from the reverse proxy
