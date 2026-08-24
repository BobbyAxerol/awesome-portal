from __future__ import annotations

import re
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[4]


def test_public_hostname_is_pinned_to_stable_and_dev_is_isolated() -> None:
    nginx = (REPO_ROOT / "deploy/nginx/portal-loopback.conf").read_text()

    assert re.search(
        r"upstream portal_stable_app\s*\{[^}]*127\.0\.0\.1:18081;",
        nginx,
        re.DOTALL,
    )
    assert re.search(
        r"upstream portal_dev_app\s*\{[^}]*127\.0\.0\.1:8080;",
        nginx,
        re.DOTALL,
    )
    stable = re.search(
        r"server\s*\{(?=[^}]*server_name portal\.primusspark\.com;).*?"
        r"proxy_pass http://portal_stable_app;.*?\n\}",
        nginx,
        re.DOTALL,
    )
    dev = re.search(
        r"server\s*\{(?=[^}]*server_name dev-portal\.primusspark\.com;).*?"
        r"proxy_pass http://portal_dev_app;.*?\n\}",
        nginx,
        re.DOTALL,
    )
    assert stable is not None
    assert dev is not None
    assert 'proxy_set_header Cf-Access-Jwt-Assertion "";' in dev.group(0)


def test_tunnel_keeps_access_on_stable_but_not_on_dev() -> None:
    tunnel = (REPO_ROOT / "deploy/cloudflared/config.example.yml").read_text()
    stable_start = tunnel.index("  - hostname: portal.primusspark.com")
    dev_start = tunnel.index("  - hostname: dev-portal.primusspark.com")
    fallback_start = tunnel.index("  - service: http_status:404")

    stable = tunnel[stable_start:dev_start]
    dev = tunnel[dev_start:fallback_start]
    assert "service: https://127.0.0.1:443" in stable
    assert "required: true" in stable
    assert "service: http://127.0.0.1:80" in dev
    assert "access:" not in dev
