#!/usr/bin/env python3
"""DRAFT, NOT RUN. STEP 3 / STEP 4 read-only probe of the OKX Paper Manager and, later, of its source proxy and Edge TLS front.

Modelled on renew_manager_tls.qualify() but restricted to the new endpoints. It never writes a file, never prints a token, a key or a business value, and records only
counts, status codes, hashes of public certificates and booleans.

  manager   (owner, NO sudo)  TLS + token + catalogue probe of 127.0.0.1:8323 (facade) and 127.0.0.1:8324 (issuer) with the Manager proxy-client identity
  proxy     (sudo -n)         the same read path through the NEW source proxy (default 172.23.0.1:8454, option B; `--endpoint host:port` for option A) with the Edge->proxy identity files (root:portal-runtime 0640)
  edge-tls  (no sudo)         10.70.0.2:8446 completes TLS 1.3 and REFUSES a client without a certificate (no Control API identity exists on this host)

Private material: `manager` loads RUNTIME/source-proxy-manager-client.pem (certificate AND private key in one file, mode 0600 owner bobby, the same file renew_manager_tls.qualify()
loads) through ssl.SSLContext.load_cert_chain, i.e. the key is read only inside the TLS library, never by this script's code. It needs no sudo. `proxy` loads
/srv/primus/portal/execution-edge/source-proxy-client.pem the same way and therefore needs `sudo -n` (the file is root:portal-runtime 0640 and bobby is not in that group).
The cross-profile negative case asks the RUNNING Paper issuer (127.0.0.1:8024) for one short-lived token and presents it to the OKX facade; it is on by default, `--no-cross-profile` skips it.
Exit status 0 only if every check passed; the JSON report goes to stdout.
"""
from __future__ import annotations

import base64
import http.client
import json
import re
import socket
import ssl
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path("/home/bobby/secure/portal-manager-read-v2")
RUNTIME = ROOT / "runtime"
EDGE_DIR = Path("/srv/primus/portal/execution-edge")
PROFILE = "PAPER_OKX_SWAP"
VENUE, MODE = "OKX", "paper"
SEAL = "sha256:14bb84b495bca93807486b4edac1f9fb45488485ee6e80842970a4848312eb29"
RELATIONS = 67
DB_NAME = "trading_system"
OID_SHA = "5a35755d64384917a6c86adc8bc5eba5dadb17b90c761e35e24903c4e57cd97b"
MIN_LEDGER = 175
CONTRACT = "trading-system.portal-execution.manager-v2.runtime.v1"
BASE = "/portal/execution/v2/manager"
MAX_BYTES = 1_048_576
FACADE, ISSUER = ("127.0.0.1", 8323), ("127.0.0.1", 8324)
PAPER_ISSUER = ("127.0.0.1", 8024)
MAX_TOKEN_LIFETIME = 300       # the Managers' configured maximum (issuer TTL is 120 s); NOT 60
PROXY = ("172.23.0.1", 8454)      # option B (default); option A: --endpoint 172.30.0.1:8444
EDGE_FRONT = ("10.70.0.2", 8446)


class ProbeFailure(Exception):
    pass


def require(condition, code):
    if not condition:
        raise ProbeFailure(code)


def tls_context(ca: Path | None, identity: Path | None):
    context = ssl.create_default_context(cafile=str(ca)) if ca else ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    if not ca:
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
    context.minimum_version = context.maximum_version = ssl.TLSVersion.TLSv1_3
    if identity is not None:
        context.load_cert_chain(str(identity))
    return context


class Transport:
    """Real HTTPS transport. Tests replace it with a fake that has the same `get` signature."""

    def __init__(self, ca: Path | None, identity: Path | None):
        self.context = tls_context(ca, identity)

    def get(self, endpoint, path, *, server_name, headers=None):
        host, port = endpoint
        raw = socket.create_connection((host, port), timeout=5)
        connection = http.client.HTTPSConnection(host, port, context=self.context, timeout=5)
        try:
            connection.sock = self.context.wrap_socket(raw, server_hostname=server_name)   # verify the certificate name, connect to the address
            connection.request("GET", path, headers=headers or {})
            reply = connection.getresponse()
            body = reply.read(MAX_BYTES + 1)
            require(len(body) <= MAX_BYTES, "RESPONSE_BOUND_EXCEEDED")
            return reply.status, {k.lower(): v for k, v in reply.getheaders()}, body
        finally:
            connection.close()


def refused(call) -> bool:
    """A connection that must be refused: TLS alert, reset or an explicit 4xx from the TLS terminator."""
    try:
        status, _, _ = call()
        return status in (400, 401, 403, 495, 496)
    except (ssl.SSLError, ConnectionError, socket.timeout, http.client.HTTPException, OSError):
        return True


def jwt_claims(token: str) -> dict:
    """Unverified decode of the payload part only, to check the profile claims. The token itself is never printed."""
    part = token.split(".")[1]
    return json.loads(base64.urlsafe_b64decode(part + "=" * (-len(part) % 4)))


def envelope(payload: bytes, profile: str, seal: str | None = None) -> dict:
    body = json.loads(payload)
    require(isinstance(body, dict) and body.get("contract_version") == CONTRACT and body.get("authority") == "EXECUTION_CELL"
            and body.get("profile_id") == profile and body.get("availability") == "AVAILABLE" and isinstance(body.get("data"), dict)
            and re.fullmatch(r"sha256:[a-f0-9]{64}", body.get("catalogue_sha256", "")), "READ_ENVELOPE_INVALID")
    require(seal is None or body["catalogue_sha256"] == seal, "CATALOGUE_SEAL_MISMATCH")
    as_of = datetime.fromisoformat(body["as_of"].replace("Z", "+00:00")) if body.get("as_of") else None
    if as_of is not None:
        require(abs((datetime.now(timezone.utc) - as_of).total_seconds()) <= 300, "READ_TIMESTAMP_NOT_CURRENT")
    return body


def field_text(item: dict, name: str):
    field = item.get("fields", {}).get(name)
    return field.get("value") if isinstance(field, dict) else None


def read_checks(transport, facade, issuer, *, server_names=("manager-facade", "manager-issuer"), via_proxy=False):
    """Positive reads. `facade`/`issuer` are endpoints; with via_proxy the same path is read through the proxy (no token step, the proxy mints it)."""
    report = {"positive": []}
    headers = {"Accept": "application/json"}
    if not via_proxy:
        status, reply_headers, _ = transport.get(issuer, "/internal/issue", server_name=server_names[1])
        require(status == 204, "TOKEN_NOT_ISSUED")
        bearer = reply_headers.get("x-manager-authorization", "")
        require(bearer.startswith("Bearer ") and len(bearer) > 40, "TOKEN_HEADER_MISSING")
        claims = jwt_claims(bearer[7:])
        require((claims.get("profile_id"), claims.get("profile_mode"), claims.get("profile_venue")) == (PROFILE, MODE, VENUE), "TOKEN_PROFILE_CLAIMS_WRONG")
        require(0 < int(claims["exp"]) - int(claims["iat"]) <= MAX_TOKEN_LIFETIME, "TOKEN_LIFETIME")
        headers = {"Authorization": bearer, "Accept": "application/json"}
        report["token"] = {"issued": True, "profile_claims_ok": True}
    name = server_names[0]

    def read(path):
        status, _, payload = transport.get(facade, path, server_name=name, headers=headers)
        require(status == 200, "READ_FAILED")
        return payload

    catalogue = envelope(read(BASE + "/catalog"), PROFILE, SEAL)
    data = catalogue["data"]
    relations = data.get("relations")
    require(isinstance(relations, list) and len(relations) == RELATIONS == data.get("relation_count"), "RELATION_COUNT")
    identity = data.get("source_identity")
    require(isinstance(identity, dict) and identity.get("database_name") == DB_NAME and identity.get("database_oid_sha256") == OID_SHA
            and identity.get("ledger_status") == "READABLE" and isinstance(identity.get("schema_ledger_rows"), int)
            and identity["schema_ledger_rows"] >= MIN_LEDGER, "SOURCE_IDENTITY")
    report["positive"].append({"catalogue_relations": len(relations), "seal_ok": True, "identity_ok": True, "ledger_rows_at_least": MIN_LEDGER})
    capabilities = envelope(read(BASE + "/capabilities"), PROFILE, SEAL)["data"]
    require(capabilities.get("contract_revision") == CONTRACT and capabilities.get("active_profile_id") == PROFILE
            and isinstance(capabilities.get("capabilities"), list) and len(capabilities["capabilities"]) == 5
            and all(c.get("registered") is True for c in capabilities["capabilities"]), "CAPABILITIES")
    report["positive"].append({"capabilities": 5})
    # OKX scoping: accounts carries mode+venue (every returned row must be paper/OKX); instruments carries venue only.
    for relation, expected in (("accounts", {"mode": MODE, "venue": VENUE}), ("instruments", {"venue": VENUE})):
        page = envelope(read(f"{BASE}/records/public/{relation}?limit=1"), PROFILE, SEAL)["data"]
        items = page.get("items")
        require(isinstance(items, list) and len(items) <= 1 and page.get("relation", {}).get("relation") == relation, "PAGE_SHAPE")
        for item in items:
            for column, value in expected.items():
                require(field_text(item, column) == value, "SCOPING_" + column.upper())
        report["positive"].append({"relation": relation, "rows_checked": len(items), "scoping_ok": True})
    return report


def manager_probe(transport_factory=Transport, paper_issuer=True):
    ca, identity = RUNTIME / "mtls-ca-cert.pem", RUNTIME / "source-proxy-manager-client.pem"
    transport = transport_factory(ca, identity)
    report = {"probe": "okx-manager", "profile": PROFILE}
    report.update(read_checks(transport, FACADE, ISSUER))
    anonymous = transport_factory(ca, None)
    negatives = {
        "facade_without_client_certificate_refused": refused(lambda: anonymous.get(FACADE, BASE + "/catalog", server_name="manager-facade")),
        "issuer_without_client_certificate_refused": refused(lambda: anonymous.get(ISSUER, "/internal/issue", server_name="manager-issuer")),
    }
    status, _, _ = transport.get(FACADE, BASE + "/catalog", server_name="manager-facade", headers={"Accept": "application/json"})
    negatives["facade_without_token_refused"] = status in (401, 403)
    if paper_issuer:
        status, reply_headers, _ = transport.get(PAPER_ISSUER, "/internal/issue", server_name="manager-issuer")
        require(status == 204, "PAPER_TOKEN_NOT_ISSUED")
        bearer = reply_headers.get("x-manager-authorization", "")
        status, _, _ = transport.get(FACADE, BASE + "/catalog", server_name="manager-facade", headers={"Authorization": bearer, "Accept": "application/json"})
        negatives["wrong_profile_claim_refused"] = status in (401, 403)
    report["negative"] = negatives
    require(all(negatives.values()), "NEGATIVE_CASE_NOT_REFUSED")
    report["ok"] = True
    return report


def proxy_probe(transport_factory=Transport, endpoint=None):
    proxy = endpoint or PROXY
    ca, identity = EDGE_DIR / "source-proxy-ca.crt", EDGE_DIR / "source-proxy-client.pem"
    transport = transport_factory(ca, identity)
    report = {"probe": "okx-proxy", "profile": PROFILE}
    report.update(read_checks(transport, proxy, proxy, server_names=(proxy[0], proxy[0]), via_proxy=True))
    negatives = {"proxy_without_client_certificate_refused": refused(lambda: transport_factory(ca, None).get(proxy, BASE + "/catalog", server_name=proxy[0]))}
    for path, expected in (("/not-allowed", (404,)),):
        status, _, _ = transport.get(proxy, BASE + path, server_name=proxy[0])
        negatives["unknown_route_denied"] = status in expected
    report["negative"] = negatives
    require(all(negatives.values()), "NEGATIVE_CASE_NOT_REFUSED")
    report["ok"] = True
    return report


def edge_tls_probe(transport_factory=Transport):
    anonymous = transport_factory(None, None)
    result = {"probe": "okx-edge-tls", "endpoint": "%s:%d" % EDGE_FRONT}
    result["no_client_certificate_refused"] = refused(lambda: anonymous.get(EDGE_FRONT, BASE + "/catalog", server_name=EDGE_FRONT[0]))
    context = tls_context(None, None)
    with socket.create_connection(EDGE_FRONT, timeout=5) as raw:
        # TLS 1.3 handshake without a client certificate: the server must request one; we only record the negotiated version.
        try:
            with context.wrap_socket(raw, server_hostname=EDGE_FRONT[0]) as secured:
                result["tls"] = secured.version()
        except ssl.SSLError:
            result["tls"] = "TLSv1.3 (handshake refused)"
    result["ok"] = result["no_client_certificate_refused"]
    return result


def main(argv):
    args = argv[2:]
    endpoint = None
    if "--endpoint" in args:
        i = args.index("--endpoint")
        try:
            host, port = args[i + 1].rsplit(":", 1)
            endpoint = (host, int(port))
        except (IndexError, ValueError):
            print(__doc__)
            return 64
        args = args[:i] + args[i + 2:]
    if len(argv) < 2 or argv[1] not in ("manager", "proxy", "edge-tls") or any(a not in ("--no-cross-profile",) for a in args):
        print(__doc__)
        return 64
    try:
        if argv[1] == "manager":
            report = manager_probe(paper_issuer="--no-cross-profile" not in args)
        elif argv[1] == "proxy":
            report = proxy_probe(endpoint=endpoint)
        else:
            report = edge_tls_probe()
    except (ProbeFailure, OSError, ssl.SSLError, ValueError, KeyError) as error:
        print(json.dumps({"ok": False, "failure": type(error).__name__ + ":" + str(error)[:80]}))
        return 1
    print(json.dumps(report, sort_keys=True))
    return 0 if report.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
