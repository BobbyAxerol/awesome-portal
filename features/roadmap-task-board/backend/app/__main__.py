"""Run the FastAPI portal backend with ``python -m backend.app``."""
from __future__ import annotations

import os

import uvicorn


if __name__ == "__main__":
    uvicorn.run(
        "backend.app.main:app",
        host=os.getenv("PORTAL_HOST", "127.0.0.1"),
        port=int(os.getenv("PORTAL_PORT", "8000")),
        reload=os.getenv("PORTAL_RELOAD", "").lower() in {"1", "true", "yes"},
    )
