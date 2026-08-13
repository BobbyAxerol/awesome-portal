#!/usr/bin/env python3
"""Optional local backend for the Primus Spark Quant Ecosystem Portal.

Keeps the portal a single self-contained HTML file: without this server the
page works fine with browser-localStorage persistence. Run this server to get
shared, file-backed persistence for the Task Board and Migration Roadmap.

Usage:
    python3 server.py [--port 8000] [--file portal.html]

Endpoints:
    GET  /                 -> serves the portal HTML
    GET  /<filename>       -> serves the portal HTML (any name)
    GET  /api/health       -> {"ok": true, "tasks": N, "roadmap": N}
    GET  /api/tasks        -> {"initialized": bool, "items": [task, ...]}
    PUT  /api/tasks        -> replace all tasks (body: JSON array)
    GET  /api/roadmap      -> {"initialized": bool, "items": [phase, ...]}
    PUT  /api/roadmap      -> replace all phases (body: JSON array)

"initialized" is true once a client has pushed data. On the very first run the
portal frontend seeds the defaults (BASE_TASKS / ROADMAP_PHASES) itself, so an
empty server store never wipes the baseline plan.

Data is stored as pretty-printed JSON next to this script under ./data/.
Only stdlib is used — no pip install required.
"""
from __future__ import annotations

import argparse
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

BASE = Path(__file__).resolve().parent
DATA_DIR = BASE / "data"

PORTAL_DEFAULT = BASE / "quant_trading_ecosystem_architecture_migration_portal_vi.html"


def load_collection(name: str) -> dict:
    """Return {"initialized": bool, "items": list} for the given collection."""
    path = DATA_DIR / f"{name}.json"
    if not path.exists():
        return {"initialized": False, "items": []}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {"initialized": False, "items": []}
    if isinstance(data, dict) and isinstance(data.get("items"), list):
        return {"initialized": bool(data.get("initialized")), "items": data["items"]}
    if isinstance(data, list):  # legacy plain-array store
        return {"initialized": True, "items": data}
    return {"initialized": False, "items": []}


def save_collection(name: str, items: list) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    (DATA_DIR / f"{name}.json").write_text(
        json.dumps({"initialized": True, "items": items}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


class PortalHandler(BaseHTTPRequestHandler):
    server_version = "QuantPortal/1.0"

    def _send_json(self, status: int, payload) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, PUT, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def _send_file(self) -> None:
        try:
            body = self.server.portal_file.read_bytes()
        except OSError:
            self.send_error(500, "Portal HTML file not found")
            return
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self) -> bytes:
        length = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(length) if length else b""

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, PUT, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/api/health":
            self._send_json(200, {
                "ok": True,
                "service": "quant-ecosystem-portal",
                "tasks": len(load_collection("tasks")["items"]),
                "roadmap": len(load_collection("roadmap")["items"]),
            })
        elif self.path == "/api/tasks":
            self._send_json(200, load_collection("tasks"))
        elif self.path == "/api/roadmap":
            self._send_json(200, load_collection("roadmap"))
        else:
            self._send_file()

    def do_PUT(self) -> None:  # noqa: N802
        if self.path not in ("/api/tasks", "/api/roadmap"):
            self.send_error(404)
            return
        try:
            items = json.loads(self._read_body().decode("utf-8"))
            if not isinstance(items, list):
                raise ValueError("expected a JSON array")
        except (ValueError, UnicodeDecodeError):
            self._send_json(400, {"ok": False, "error": "Body must be a JSON array"})
            return
        name = "tasks" if self.path == "/api/tasks" else "roadmap"
        save_collection(name, items)
        self._send_json(200, {"ok": True, "saved": len(items)})

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("[quant-portal] %s - %s\n" % (self.address_string(), fmt % args))


def main() -> None:
    parser = argparse.ArgumentParser(description="Quant Ecosystem Portal local backend")
    parser.add_argument("--port", type=int, default=8000, help="listen port (default 8000)")
    parser.add_argument("--file", default=str(PORTAL_DEFAULT), help="path to the portal HTML file")
    args = parser.parse_args()

    portal_file = Path(args.file).expanduser().resolve()
    if not portal_file.exists():
        sys.exit(f"Portal file not found: {portal_file}")

    server = ThreadingHTTPServer(("127.0.0.1", args.port), PortalHandler)
    server.portal_file = portal_file
    print(f"Quant Ecosystem Portal -> http://127.0.0.1:{args.port}")
    print(f"Portal HTML: {portal_file}")
    print(f"Data dir  : {DATA_DIR}  (tasks.json / roadmap.json)")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
