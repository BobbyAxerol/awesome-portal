"""Unit tests of okx_render.py. Pure python: `inspect` is replaced by canned dicts, docker is never called, nothing under /home/bobby/secure is touched (SEC is a temp dir).
Run: python3 -B -m unittest discover -s scripts/epg10-08/okx-paper/tests -p 'test_okx_render.py'
"""
import contextlib
import hashlib
import io
import json
import stat
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import okx_render as orr  # noqa: E402

LOG = {"Type": "json-file", "Config": {"max-size": "10m", "max-file": "3"}}
FACADE_ENV = "TS_PORTAL_MANAGER_READ_PROFILE_ID=PAPER_BINANCE_USDM\nTS_PORTAL_MANAGER_READ_PROFILE_MODE=paper\nTS_PORTAL_MANAGER_READ_PROFILE_VENUE=BINANCE\nTS_PORTAL_MANAGER_READ_PORT=8023\n"
ISSUER_ENV = "TS_PORTAL_MANAGER_ISSUER_PORT=8024\nTS_PORTAL_MANAGER_READ_PROFILE_ID=PAPER_BINANCE_USDM\nTS_PORTAL_MANAGER_READ_PROFILE_MODE=paper\nTS_PORTAL_MANAGER_READ_PROFILE_VENUE=BINANCE\n"


def container(kind, root, env_text, files):
    port = "8023/tcp"
    mounts = [{"Source": str(root / name), "Destination": dest} for dest, name in files.items()]
    return {
        "Image": "sha256:x",
        "Config": {"Env": ["PYTHONDONTWRITEBYTECODE=1", "PYTHONPATH=/app", "PYTHONUNBUFFERED=1", "PATH=/usr/bin",
                           "TS_PORTAL_MANAGER_READ_RUNTIME_ENV_FILE=/run/secrets/manager-runtime.env",
                           "TS_PORTAL_MANAGER_ISSUER_RUNTIME_ENV_FILE=/run/secrets/manager-runtime.env",
                           "TS_PORTAL_MANAGER_S1_SOURCE_ID=sha256:" + "f" * 64],
                   "Cmd": ["python", f"{kind}.py"], "User": "1001:1001"},
        "HostConfig": {"CapDrop": ["ALL"], "PortBindings": {port: [{"HostIp": "127.0.0.1", "HostPort": "8023"}]}, "LogConfig": LOG, "ReadonlyRootfs": True,
                       "RestartPolicy": {"Name": "unless-stopped"}, "SecurityOpt": ["no-new-privileges:true"], "Tmpfs": {"/tmp": "rw,size=1m"},
                       "NanoCpus": 500_000_000 if kind == "facade" else 0, "Memory": 536870912 if kind == "facade" else 0, "PidsLimit": 128},
        "Mounts": mounts + [{"Source": str(root / "runtime.env"), "Destination": "/run/secrets/manager-runtime.env"}],
    }


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.paper = Path(self.tmp.name) / "paper"
        self.paper.mkdir()
        files = {}
        for table in (orr.FACADE_FILES, orr.ISSUER_FILES):
            for dest, (name, origin) in table.items():
                if origin is not None:
                    (self.paper / (origin[0][-8:] + name)).write_bytes(f"PAPER-SECRET-{name}".encode())
        self.facade_files = {dest: orr.PAPER_MANAGER[-8:] + name for dest, (name, o) in orr.FACADE_FILES.items() if o}
        self.issuer_files = {dest: orr.PAPER_ISSUER[-8:] + name for dest, (name, o) in orr.ISSUER_FILES.items() if o}
        (self.paper / "runtime.env").write_text(FACADE_ENV)
        self.facade = container("facade", self.paper, FACADE_ENV, self.facade_files)
        self.issuer = container("issuer", self.paper, ISSUER_ENV, self.issuer_files)
        (self.paper / "issuer.env").write_text(ISSUER_ENV)
        self.issuer["Mounts"][-1]["Source"] = str(self.paper / "issuer.env")
        self.world = {orr.PAPER_MANAGER: self.facade, orr.PAPER_ISSUER: self.issuer}
        patcher = mock.patch.object(orr, "inspect", side_effect=lambda name: self.world[name])
        patcher.start()
        self.addCleanup(patcher.stop)


class PackageTests(unittest.TestCase):
    def test_package_files_match_the_pinned_hashes_and_the_seal(self):
        for name, expected in orr.PACKAGE_SHA256.items():
            self.assertEqual(hashlib.sha256((orr.PACKAGE / name).read_bytes()).hexdigest(), expected, name)
        catalogue = json.loads((orr.PACKAGE / "relation-catalogue.json").read_text())
        self.assertEqual(catalogue["catalogue_sha256"], orr.SEAL)
        authority = catalogue["authority"]
        self.assertEqual((authority["profile_id"], authority["profile_venue"], authority["profile_mode"], authority["database"]),
                         (orr.PROFILE_ID, orr.PROFILE_VENUE, orr.PROFILE_MODE, "trading_system"))
        release = json.loads((orr.PACKAGE / "manager-catalogue-release.json").read_text())
        self.assertEqual(release["catalogue_sha256"], "sha256:" + orr.SEAL)
        self.assertEqual(len(release["relations"]), 67)
        descriptor = json.loads((orr.PACKAGE / "profile-selection.json").read_text())
        self.assertEqual((descriptor["profile_id"], descriptor["venue"], descriptor["environment"]), (orr.PROFILE_ID, "OKX", "paper"))

    def test_s1_source_id_is_the_stage_m0_formula_and_reproduces_the_paper_value(self):
        # Paper's value f9764913... = the same formula with the 12 Nov catalogue seal 6d4c4a65...; the draft only swaps the seal.
        paper = dict(orr.S1_DESCRIPTOR, catalogue_sha256="6d4c4a6505c0" + "0" * 52)
        self.assertNotEqual("sha256:" + orr.sha(orr.canonical(paper)), orr.s1_source_id())
        self.assertEqual(orr.s1_source_id(), "sha256:ac7c1cd2081f78e3ee7c04772cf7c109d8e5ad271c4f65eef4f63c0e55c5b175")
        self.assertEqual(orr.S1_DESCRIPTOR["catalogue_sha256"], orr.SEAL)


class RenderTests(Base):
    def test_two_services_new_project_new_ports_same_hardening_and_only_the_s1_env_differs(self):
        rendered = orr.render(self.facade, self.issuer)
        self.assertEqual(rendered["name"], "trading-system-manager-read-paper-okx")
        self.assertEqual(set(rendered["services"]), {"portal_manager_read", "portal_manager_issuer"})
        facade, issuer = rendered["services"]["portal_manager_read"], rendered["services"]["portal_manager_issuer"]
        self.assertEqual([(p["host_ip"], p["published"], p["target"]) for p in facade["ports"]], [("127.0.0.1", "8323", 8023)])
        self.assertEqual([(p["host_ip"], p["published"], p["target"]) for p in issuer["ports"]], [("127.0.0.1", "8324", 8023)])
        for service in (facade, issuer):
            self.assertEqual((service["cap_drop"], service["read_only"], service["security_opt"], service["user"], service["restart"]),
                             (["ALL"], True, ["no-new-privileges:true"], "1001:1001", "unless-stopped"))
            self.assertTrue(all(v["read_only"] and v["bind"] == {"create_host_path": False} and v["source"].startswith(orr.SEC + "/") for v in service["volumes"]))
        self.assertEqual((facade["cpus"], facade["mem_limit"], facade["pids_limit"]), (0.5, "536870912", 128))
        self.assertNotIn("cpus", issuer)
        self.assertEqual(facade["environment"]["TS_PORTAL_MANAGER_S1_SOURCE_ID"], orr.s1_source_id())
        self.assertNotIn("TS_PORTAL_MANAGER_S1_SOURCE_ID", issuer["environment"])
        self.assertEqual(facade["image"], orr.MANAGER_IMAGE)

    def test_no_secret_value_and_no_paper_path_leaks_into_the_render(self):
        text = orr.render_all()["manager-paper-okx.rendered.json"].decode()
        self.assertNotIn("PAPER-SECRET", text)
        self.assertNotIn(str(self.paper), text)
        self.assertNotIn("portal-manager-m0-r2", text)

    def test_unknown_s1_env_key_stops_the_render(self):
        self.facade["Config"]["Env"].append("TS_PORTAL_MANAGER_S1_OTHER=1")
        with self.assertRaises(SystemExit):
            orr.render(self.facade, self.issuer)

    def test_check_detects_drift_and_matches_an_unchanged_world(self):
        out = Path(self.tmp.name) / "out"
        with contextlib.redirect_stdout(io.StringIO()):
            orr.cmd_render(out)
            orr.cmd_check(out)
        self.facade["HostConfig"]["NanoCpus"] = 1_000_000_000
        with self.assertRaises(SystemExit):
            orr.cmd_check(out)
        with self.assertRaises(FileExistsError):
            orr.cmd_render(out)   # never overwrites


class SecretsTests(Base):
    def run_secrets(self):
        sec = Path(self.tmp.name) / "okx-sec"
        buffer = io.StringIO()
        with contextlib.redirect_stdout(buffer):
            orr.cmd_secrets(sec)
        return sec, buffer.getvalue()

    def test_copies_by_name_new_cursor_key_only_profile_keys_changed_modes_0600_and_never_prints_content(self):
        sec, printed = self.run_secrets()
        self.assertEqual(stat.S_IMODE(sec.stat().st_mode), 0o700)
        names = {p.name for p in sec.iterdir()}
        wanted = {name for table in (orr.FACADE_FILES, orr.ISSUER_FILES) for name, _ in table.values()}
        self.assertEqual(names, wanted)
        for path in sec.iterdir():
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600, path.name)
        self.assertNotIn("PAPER-SECRET", printed)
        self.assertEqual((sec / "facade-db.dsn").read_bytes(), b"PAPER-SECRET-facade-db.dsn")   # byte copy: same login, same database
        self.assertEqual((sec / "relation-catalogue.json").read_bytes(), (orr.PACKAGE / "relation-catalogue.json").read_bytes())
        self.assertEqual((sec / "serving-policy.json").read_bytes(), (orr.PACKAGE / "serving-policy.json").read_bytes())
        facade_env = (sec / "facade-runtime.env").read_text().splitlines()
        self.assertEqual(facade_env, ["TS_PORTAL_MANAGER_READ_PROFILE_ID=PAPER_OKX_SWAP", "TS_PORTAL_MANAGER_READ_PROFILE_MODE=paper",
                                      "TS_PORTAL_MANAGER_READ_PROFILE_VENUE=OKX", "TS_PORTAL_MANAGER_READ_PORT=8023"])
        issuer_env = (sec / "issuer-runtime.env").read_text().splitlines()
        self.assertIn("TS_PORTAL_MANAGER_READ_PROFILE_ID=PAPER_OKX_SWAP", issuer_env)
        self.assertIn("TS_PORTAL_MANAGER_ISSUER_PORT=8024", issuer_env)
        key = (sec / "cursor.key").read_bytes()
        self.assertEqual(len(key), 44)
        self.assertNotEqual(key, b"PAPER-SECRET-cursor.key")

    def test_second_run_keeps_everything_and_a_changed_package_file_stops(self):
        sec, _ = self.run_secrets()
        before = {p.name: p.read_bytes() for p in sec.iterdir()}
        with contextlib.redirect_stdout(io.StringIO()) as out:
            orr.cmd_secrets(sec)
        self.assertEqual({p.name: p.read_bytes() for p in sec.iterdir()}, before)
        self.assertIn("keep   cursor.key", out.getvalue())
        with mock.patch.dict(orr.PACKAGE_SHA256, {"serving-policy.json": "0" * 64}), contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaises(SystemExit):
                orr.cmd_secrets(Path(self.tmp.name) / "other")

    def test_env_with_requires_each_key_exactly_once(self):
        with self.assertRaises(SystemExit):
            orr.env_with("TS_PORTAL_MANAGER_READ_PORT=1\n", orr.PROFILE_KEYS)
        with self.assertRaises(SystemExit):
            orr.env_with(FACADE_ENV, {"TS_PORTAL_MANAGER_READ_MISSING": "x"})


class DsnTests(unittest.TestCase):
    def check(self, dsn, mode=0o600):
        with tempfile.TemporaryDirectory() as tmp:
            sec = Path(tmp)
            path = sec / "facade-db.dsn"
            path.write_text(dsn)
            path.chmod(mode)
            with contextlib.redirect_stdout(io.StringIO()) as out:
                try:
                    orr.cmd_dsn(sec)
                    return True, out.getvalue()
                except SystemExit:
                    return False, out.getvalue()

    GOOD = "postgresql://ts_portal_manager_read_facade:pw@live_data_executor:5432/trading_system?sslmode=verify-full&sslrootcert=%2Frun%2Fsecrets%2Fts-postgres-ca.crt\n"

    def test_the_paper_shape_passes_and_prints_no_part_of_the_dsn(self):
        ok, printed = self.check(self.GOOD)
        self.assertTrue(ok)
        self.assertNotIn("pw", printed.replace("password present", ""))
        self.assertNotIn("live_data_executor", printed.replace("host live_data_executor:5432", ""))

    def test_sandbox_database_login_or_weak_ssl_or_mode_fail(self):
        for bad in (self.GOOD.replace("/trading_system?", "/trading_system_sandbox?"), self.GOOD.replace("ts_portal_manager_read_facade", "other"),
                    self.GOOD.replace("verify-full", "require")):
            self.assertFalse(self.check(bad)[0])
        self.assertFalse(self.check(self.GOOD, 0o640)[0])


if __name__ == "__main__":
    unittest.main()
