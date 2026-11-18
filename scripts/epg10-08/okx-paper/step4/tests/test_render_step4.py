"""Offline tests of render_step4.py: canned inspect dicts, docker never called.
Run: python3 -B -m unittest discover -s scripts/epg10-08/okx-paper/step4/tests -p 'test_render_step4.py'
"""
import json
import re
import sys
import unittest
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import render_step4 as r  # noqa: E402

LOG = {"Type": "json-file", "Config": {"max-size": "10m"}}
HEALTH = {"Test": ["CMD", "x"], "Interval": 15 * 10**9, "Timeout": 3 * 10**9, "StartPeriod": 15 * 10**9, "Retries": 4}


def paper_edge():
    env = ["PATH=/usr/bin", "EDGE_ENVIRONMENT=paper", "EDGE_MANAGER_V2_PROFILE_ID=PAPER_BINANCE_USDM", "EDGE_DELEGATION_AUDIENCE=portal-execution-edge-paper",
           "EDGE_SOURCE_ORIGIN=https://172.23.0.1:8444", "EDGE_REALTIME_SSE_ENABLED=true", "EDGE_REALTIME_ACTIVATION_MANIFEST_FILE=/run/secrets/x.json",
           "EDGE_MANAGER_EVENT_LEDGER_ADMISSION_FILE=/run/secrets/y.json", "EDGE_PROJECTION_DATABASE_URL_FILE=/run/secrets/z", "EDGE_ANALYTICS_QUERY_ENABLED=true",
           "EDGE_MANAGER_SOURCE_DB_PIN_FILE=/run/manager-source-pin/pin.json", "EDGE_MANAGER_SOURCE_DB_PIN_SHA256=sha256:" + "a" * 64, "EDGE_TLS_CERTIFICATE_FILE=/run/secrets/edge-server.crt"]
    return {"Image": "img", "Config": {"Env": env, "Cmd": ["serve"], "Entrypoint": ["/e"], "User": "65532:65532", "StopTimeout": 15, "Healthcheck": HEALTH},
            "HostConfig": {"GroupAdd": ["987"], "CapDrop": ["ALL"], "CpuShares": 0, "NanoCpus": 2 * 10**9, "Init": True, "LogConfig": LOG, "Memory": 2 * 2**30, "MemoryReservation": 0,
                           "MemorySwap": 2 * 2**30, "PidsLimit": 128, "ReadonlyRootfs": True, "RestartPolicy": {"Name": "unless-stopped"}, "SecurityOpt": ["no-new-privileges:true"],
                           "ShmSize": 67108864, "Tmpfs": {"/tmp": "rw"}, "Ulimits": [{"Name": "nofile", "Soft": 1, "Hard": 2}]}}


class Render(unittest.TestCase):
    """OPTION A (new bridge, new leaf): the alternative."""

    def setUp(self):
        self.live = {"HostConfig": {"CpuShares": 512, "MemoryReservation": 5}}
        r.image_env = lambda ref: {"PATH": "/usr/bin"}
        r.use_option("a")
        self.edge = r.render_edge(paper_edge(), self.live, r.PLACEHOLDER)["services"]["execution-edge"]

    def tearDown(self):
        r.use_option("b")

    def test_identity_ports_and_feature_flags(self):
        e = self.edge["environment"]
        self.assertEqual((e["EDGE_ENVIRONMENT"], e["EDGE_MANAGER_V2_PROFILE_ID"], e["EDGE_DELEGATION_AUDIENCE"]), ("paper", "PAPER_OKX_SWAP", "portal-execution-edge-paper-okx"))
        self.assertEqual(e["EDGE_SOURCE_ORIGIN"], "https://172.30.0.1:8444")
        self.assertEqual(e["EDGE_MANAGER_CATALOGUE_CACHE_TTL_MS"], "0")
        for k in ("EDGE_REALTIME_SSE_ENABLED", "EDGE_ANALYTICS_QUERY_ENABLED", "EDGE_MANAGER_PROJECTION_ENABLED", "EDGE_MANAGER_EVENT_LEDGER_ENABLED", "EDGE_COMMAND_RELAY_ENABLED", "EDGE_SHADOW_QUERY_ENABLED"):
            self.assertEqual(e[k], "false", k)
        self.assertEqual(self.edge["ports"], [{"host_ip": "10.70.0.2", "mode": "ingress", "protocol": "tcp", "published": "8446", "target": 8443}])

    def test_no_pin_no_feature_files_and_paper_secrets_kept_by_name(self):
        e = self.edge["environment"]
        self.assertFalse([k for k in e if "SOURCE_DB_PIN" in k or "ACTIVATION_MANIFEST" in k or "LEDGER_ADMISSION" in k or "PROJECTION_DATABASE_URL" in k])
        self.assertEqual(e["EDGE_TLS_CERTIFICATE_FILE"], "/run/secrets/edge-server.crt")
        self.assertEqual([v["source"] for v in self.edge["volumes"]][0], "/srv/primus/portal/execution-edge")
        self.assertTrue(all(v["read_only"] for v in self.edge["volumes"]))
        self.assertEqual(self.edge["pull_policy"], "never")

    def test_nginx_and_locations_are_resolved_and_point_at_the_new_endpoints(self):
        nginx = r.render_nginx().decode()
        self.assertIn("listen 172.30.0.1:8444 ssl;", nginx)
        self.assertIn("/run/secrets/source-proxy-server-okx.crt", nginx)
        self.assertNotIn("/run/secrets/source-proxy-server.crt", nginx)
        self.assertFalse(re.search(r"__[A-Z0-9_]+__", nginx))
        locations = r.render_locations().decode()
        self.assertIn("127.0.0.1:8323", locations); self.assertIn("127.0.0.1:8324/internal/issue", locations)
        self.assertNotIn("8023", locations); self.assertNotIn("8024", locations)

    def test_proxy_compose_is_host_network_with_new_conf_files_only(self):
        sbx = {"Config": {"Image": "proxy@sha256:x", "Cmd": ["nginx"], "Entrypoint": ["/e"], "User": "101:101", "Healthcheck": HEALTH},
               "HostConfig": {"GroupAdd": ["987"], "CapDrop": ["ALL"], "NanoCpus": 5 * 10**8, "LogConfig": LOG, "Memory": 1, "PidsLimit": 64, "ReadonlyRootfs": True,
                              "RestartPolicy": {"Name": "unless-stopped"}, "SecurityOpt": [], "Tmpfs": {"/tmp": "rw"}}}
        service = r.render_proxy(sbx)["services"]["source-proxy"]
        self.assertEqual(service["network_mode"], "host")
        sources = [v["source"] for v in service["volumes"]]
        self.assertEqual(sources, ["/srv/primus/portal/source-proxy", "/srv/primus/portal/source-proxy/nginx.manager-okx.conf", "/srv/primus/portal/source-proxy/manager-v2-locations-okx.conf"])

    def test_bridge_subnet_avoids_the_vpc_resolver_range(self):
        self.assertEqual(r.NETWORK_SUBNET, "172.30.0.0/24")
        self.assertFalse(r.NETWORK_SUBNET.startswith("172.31."))


class OptionB(unittest.TestCase):
    """OPTION B (default): no new bridge, no new certificate."""

    def setUp(self):
        r.image_env = lambda ref: {"PATH": "/usr/bin"}
        r.use_option("b")
        self.compose = r.render_edge(paper_edge(), {"HostConfig": {"CpuShares": 512, "MemoryReservation": 5}}, r.PLACEHOLDER)
        self.edge = self.compose["services"]["execution-edge-okx"]

    def test_joins_the_paper_bridge_as_external_at_a_fixed_address_without_the_paper_dns_alias(self):
        self.assertEqual(self.compose["networks"], {"execution-private": {"external": True, "name": "portal-execution-edge_execution-private"}})
        self.assertEqual(self.edge["networks"], {"execution-private": {"ipv4_address": "172.23.0.4"}})
        self.assertNotIn("execution-edge", self.compose["services"])        # the Paper Edge owns the alias `execution-edge` on that bridge
        self.assertEqual(self.edge["environment"]["EDGE_SOURCE_ORIGIN"], "https://172.23.0.1:8454")
        self.assertEqual(self.edge["environment"]["EDGE_MANAGER_V2_PROFILE_ID"], "PAPER_OKX_SWAP")

    def test_nginx_listens_on_the_new_port_with_the_existing_certificate_and_carries_only_manager_routes(self):
        nginx = r.render_nginx().decode()
        self.assertIn("listen 172.23.0.1:8454 ssl;", nginx)
        self.assertNotIn("8444", nginx)
        self.assertIn("/run/secrets/source-proxy-server.crt", nginx)
        self.assertNotIn("-okx.", nginx)
        self.assertNotIn("trading-system-read-header", nginx)
        self.assertNotIn("/v1/", nginx)
        self.assertNotIn("127.0.0.1:8000", nginx)
        self.assertIn("include /run/secrets/manager-v2-locations.conf;", nginx)
        self.assertIn("ssl_client_certificate /run/secrets/projection-ingestor-ca.crt;", nginx)
        self.assertIn("ssl_verify_client on;", nginx)
        self.assertIn("limit_req_zone", nginx)

    def test_locations_are_the_base_manager_pack_only_pointing_at_the_okx_manager(self):
        text = r.render_locations().decode()
        self.assertEqual(len(re.findall(r"^location ", text, re.M)), 6)         # issuer + catalog + capabilities + projections + two record routes
        self.assertNotIn("market/", text); self.assertNotIn("events/", text)     # the EDS-11R4/R5 extension of the Paper file is NOT replicated
        self.assertEqual(set(re.findall(r"127\.0\.0\.1:(\d+)", text)), {"8323", "8324"})
        self.assertNotIn("trading-system-read-header", text)


if __name__ == "__main__":
    unittest.main()
