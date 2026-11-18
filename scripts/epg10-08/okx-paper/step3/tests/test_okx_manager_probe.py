"""Offline tests of okx_manager_probe.py with a fake transport: no socket, no file, no key is touched.
Run: python3 -B -m unittest discover -s scripts/epg10-08/okx-paper/step3/tests -p 'test_okx_manager_probe.py'
"""
import base64
import json
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import okx_manager_probe as p  # noqa: E402


def b64(value):
    return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip("=")


def token(profile=p.PROFILE, venue=p.VENUE, mode=p.MODE, lifetime=45):
    return "Bearer " + ".".join([b64({"alg": "EdDSA"}), b64({"profile_id": profile, "profile_mode": mode, "profile_venue": venue, "iat": 1000, "exp": 1000 + lifetime}), "c2ln" * 12])


def env(data, profile=p.PROFILE, seal=p.SEAL):
    return json.dumps({"contract_version": p.CONTRACT, "authority": "EXECUTION_CELL", "profile_id": profile, "availability": "AVAILABLE", "freshness": "FRESH",
                       "completeness": "COMPLETE", "catalogue_sha256": seal, "as_of": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"), "data": data}).encode()


def good_catalogue(rows=p.RELATIONS, ledger=175, name=p.DB_NAME, oid=p.OID_SHA, readable="READABLE"):
    return {"relation_count": rows, "relations": [{"id": {"schema": "public", "relation": f"r{i}"}} for i in range(rows)],
            "source_identity": {"database_name": name, "database_oid_sha256": oid, "schema_ledger_rows": ledger, "ledger_status": readable}}


def page(relation, **fields):
    return {"relation": {"schema": "public", "relation": relation}, "items": [{"fields": {k: {"kind": "TEXT", "value": v} for k, v in fields.items()}}], "next_cursor": None}


class Fake:
    """Answers by (port, path); `rules` can override per test. `identity` says whether this transport carries a client certificate."""

    def __init__(self, identity=True, **override):
        self.identity, self.override, self.calls = identity, override, []

    def get(self, endpoint, path, *, server_name, headers=None):
        self.calls.append((endpoint, path))
        if "no_client_cert" in self.override and not self.identity:
            raise p.ssl.SSLError("certificate required")
        headers = headers or {}
        key = (endpoint[1], path.split("?")[0])
        if key[1] == "/internal/issue":
            if not self.identity:
                raise p.ssl.SSLError("certificate required")
            return 204, {"x-manager-authorization": token(**self.override.get("claims", {})) if endpoint[1] != 8024 else token(profile="PAPER_BINANCE_USDM", venue="BINANCE")}, b""
        if endpoint[1] in (8323, 8444, 8454) and not self.identity:
            raise p.ssl.SSLError("certificate required")
        auth = headers.get("Authorization", "")
        if endpoint[1] == 8323:
            if not auth:
                return 401, {}, b""
            if "BINANCE" in json.dumps(p.jwt_claims(auth[7:])):
                return 401, {}, b""
        if path.endswith("/not-allowed"):
            return 404, {}, b""
        if path.endswith("/catalog"):
            return 200, {}, env(self.override.get("catalogue", good_catalogue()), seal=self.override.get("seal", p.SEAL))
        if path.endswith("/capabilities"):
            caps = self.override.get("capabilities", {"contract_revision": p.CONTRACT, "active_profile_id": p.PROFILE, "capabilities": [{"registered": True}] * 5})
            return 200, {}, env(caps)
        if "/accounts" in path:
            return 200, {}, env(page("accounts", **self.override.get("accounts", {"mode": "paper", "venue": "OKX"})))
        if "/instruments" in path:
            return 200, {}, env(page("instruments", **self.override.get("instruments", {"venue": "OKX"})))
        return 404, {}, b""


def factory(**override):
    return lambda ca, identity: Fake(identity=identity is not None, **override)


class ManagerProbe(unittest.TestCase):
    def run_probe(self, **override):
        return p.manager_probe(factory(**override))

    def test_all_checks_pass_and_nothing_sensitive_is_reported(self):
        report = self.run_probe()
        self.assertTrue(report["ok"])
        self.assertEqual(report["positive"][0]["catalogue_relations"], 67)
        self.assertTrue(all(report["negative"].values()) and len(report["negative"]) == 4)
        text = json.dumps(report)
        self.assertNotIn("Bearer", text)
        self.assertNotIn("c2ln", text)

    def test_wrong_relation_count_seal_identity_or_ledger_fails(self):
        for override in ({"catalogue": good_catalogue(rows=66)}, {"seal": "sha256:" + "0" * 64}, {"catalogue": good_catalogue(name="trading_system_sandbox")},
                         {"catalogue": good_catalogue(oid="0" * 64)}, {"catalogue": good_catalogue(ledger=174)}, {"catalogue": good_catalogue(ledger=None, readable="NOT_READABLE")}):
            with self.assertRaises(p.ProbeFailure, msg=str(list(override))):
                self.run_probe(**override)

    def test_wrong_token_claims_capabilities_or_scoping_fail(self):
        for override in ({"claims": {"profile": "PAPER_BINANCE_USDM"}}, {"claims": {"venue": "BINANCE"}}, {"claims": {"mode": "live"}}, {"claims": {"lifetime": 301}},
                         {"capabilities": {"contract_revision": p.CONTRACT, "active_profile_id": "PAPER_BINANCE_USDM", "capabilities": [{"registered": True}] * 5}},
                         {"accounts": {"mode": "paper", "venue": "BINANCE"}}, {"accounts": {"mode": "live", "venue": "OKX"}}, {"instruments": {"venue": "BINANCE"}}):
            with self.assertRaises(p.ProbeFailure, msg=str(override)):
                self.run_probe(**override)

    def test_token_lifetime_up_to_the_manager_maximum_is_accepted(self):
        for lifetime in (45, 120, 300):
            self.assertTrue(self.run_probe(claims={"lifetime": lifetime})["ok"], lifetime)

    def test_negative_cases_must_be_refused(self):
        class Lax(Fake):
            def get(self, endpoint, path, *, server_name, headers=None):
                if not self.identity or endpoint[1] == 8323 and not (headers or {}).get("Authorization"):
                    return 200, {}, b"{}"          # a server that answers without a client certificate or token
                return super().get(endpoint, path, server_name=server_name, headers=headers)
        with self.assertRaises(p.ProbeFailure) as caught:
            p.manager_probe(lambda ca, identity: Lax(identity=identity is not None))
        self.assertIn("NEGATIVE_CASE_NOT_REFUSED", str(caught.exception))

    def test_cross_profile_case_can_be_skipped_and_needs_the_paper_issuer_otherwise(self):
        fake = {}
        def make(ca, identity):
            fake.setdefault("all", []).append(f := Fake(identity=identity is not None))
            return f
        report = p.manager_probe(make, paper_issuer=False)
        self.assertNotIn("wrong_profile_claim_refused", report["negative"])
        self.assertFalse(any(c[0][1] == 8024 for f in fake["all"] for c in f.calls))
        report = p.manager_probe(make, paper_issuer=True)
        self.assertTrue(report["negative"]["wrong_profile_claim_refused"])

    def test_paths_are_only_the_documented_ones(self):
        seen = []
        def make(ca, identity):
            f = Fake(identity=identity is not None); seen.append(f); return f
        p.manager_probe(make)
        paths = {c[1].split("?")[0] for f in seen for c in f.calls}
        self.assertEqual(paths, {"/internal/issue", p.BASE + "/catalog", p.BASE + "/capabilities", p.BASE + "/records/public/accounts", p.BASE + "/records/public/instruments"})
        self.assertEqual({c[0] for f in seen for c in f.calls}, {p.FACADE, p.ISSUER, p.PAPER_ISSUER})


class ProxyAndEdge(unittest.TestCase):
    def test_proxy_probe_reads_through_the_proxy_without_a_token_step(self):
        seen = []
        def make(ca, identity):
            f = Fake(identity=identity is not None); seen.append((ca, identity, f)); return f
        report = p.proxy_probe(make)
        self.assertTrue(report["ok"])
        self.assertFalse(any(c[1] == "/internal/issue" for _, _, f in seen for c in f.calls))
        self.assertEqual({c[0] for _, _, f in seen for c in f.calls}, {p.PROXY})
        self.assertEqual(p.PROXY, ("172.23.0.1", 8454))
        other = []
        report = p.proxy_probe(lambda ca, identity: other.append(1) or Fake(identity=identity is not None), endpoint=("172.30.0.1", 8444))
        self.assertTrue(report["ok"])

    def test_edge_tls_requires_refusal_without_a_client_certificate(self):
        class Open(Fake):
            def get(self, endpoint, path, *, server_name, headers=None):
                return 200, {}, b"{}"
        import unittest.mock as m
        with m.patch.object(p.socket, "create_connection", side_effect=OSError("no network in tests")):
            with self.assertRaises(OSError):
                p.edge_tls_probe(lambda ca, identity: Fake(identity=False))

    def test_jwt_claims_decode_and_cli_usage(self):
        self.assertEqual(p.jwt_claims(token()[7:])["profile_id"], p.PROFILE)
        self.assertEqual(p.main(["probe"]), 64)
        self.assertEqual(p.main(["probe", "manager", "--bogus"]), 64)
        self.assertEqual(p.main(["probe", "write"]), 64)


if __name__ == "__main__":
    unittest.main()
