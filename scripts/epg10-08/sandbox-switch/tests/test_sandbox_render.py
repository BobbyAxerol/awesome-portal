"""Unit tests of sandbox_render.py check/render scoping. Pure python: `inspect` and `image_env` are replaced by canned dicts, docker is never called.
Run: python3 -B -m unittest discover -s scripts/epg10-08/sandbox-switch/tests -p 'test_sandbox_render.py'
"""
import copy
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import sandbox_render as sr  # noqa: E402

IMAGE_ENV = {"PYTHONDONTWRITEBYTECODE": "1", "PYTHONPATH": "/app", "PYTHONUNBUFFERED": "1", "PATH": "/usr/bin"}
LOG = {"Type": "json-file", "Config": {"max-size": "10m"}}


def manager(image, extra_env=()):
    env = [f"{k}={v}" for k, v in IMAGE_ENV.items()] + ["TS_PORTAL_MANAGER_READ_RUNTIME_ENV_FILE=/run/secrets/manager-runtime.env"] + list(extra_env)
    return {
        "Image": image,
        "Config": {"Env": env, "Cmd": ["python", "old.py"], "Image": image, "User": "1001:1001"},
        "HostConfig": {"CapDrop": ["ALL"], "PortBindings": {"8023/tcp": [{"HostIp": "127.0.0.1", "HostPort": "8123"}]}, "LogConfig": LOG, "ReadonlyRootfs": True,
                       "RestartPolicy": {"Name": "unless-stopped"}, "SecurityOpt": ["no-new-privileges:true"], "Tmpfs": {"/tmp": "rw,size=1m"},
                       "NanoCpus": 500_000_000, "Memory": 536870912, "PidsLimit": 128},
        "Mounts": [{"Source": "/s/a", "Destination": "/run/secrets/a"}],
    }


def edge(image, extra_env=()):
    env = ["EDGE_ENVIRONMENT=sandbox", "EDGE_MANAGER_V2_PROFILE_ID=SANDBOX_BINANCE_USDM", "PATH=/usr/bin"] + list(extra_env)
    return {
        "Image": image,
        "Config": {"Env": env, "Cmd": ["serve"], "Entrypoint": ["/bin/edge"], "Image": image, "User": "1001:1001", "StopTimeout": 20,
                   "Healthcheck": {"Test": ["CMD", "x"], "Interval": 15 * 10**9, "Timeout": 3 * 10**9, "StartPeriod": 5 * 10**9, "Retries": 3}},
        "HostConfig": {"GroupAdd": ["987"], "CapDrop": ["ALL"], "CpuShares": 512, "NanoCpus": 10**9, "Init": True, "LogConfig": LOG, "Memory": 2 * 2**30,
                       "MemoryReservation": 2**29, "MemorySwap": 2 * 2**30, "NetworkMode": "execution-private", "PidsLimit": 256,
                       "PortBindings": {"8443/tcp": [{"HostIp": "10.70.0.2", "HostPort": "8444"}]}, "ReadonlyRootfs": True, "RestartPolicy": {"Name": "unless-stopped"},
                       "SecurityOpt": ["no-new-privileges:true"], "ShmSize": 67108864, "Tmpfs": {"/tmp": "rw,size=1m"}, "Ulimits": [{"Name": "nofile", "Soft": 1024, "Hard": 2048}]},
        "Mounts": [{"Source": "/s/secrets", "Destination": "/run/secrets"}],
    }


S1 = "TS_PORTAL_MANAGER_S1_SOURCE_ID=sha256:" + "a" * 64
RELEASE = [f"EDGE_MANAGER_CATALOGUE_RELEASE_FILE=/run/manager-release/catalogue.json", f"EDGE_MANAGER_CATALOGUE_RELEASE_SHA256={sr.RELEASE_SHA}"]
PIN = ["EDGE_MANAGER_SOURCE_DB_PIN_FILE=/run/manager-source-pin/pin.json", "EDGE_MANAGER_SOURCE_DB_PIN_SHA256=sha256:" + "b" * 64]


class World:
    """The containers `inspect` answers for; records every name it is asked about."""

    def __init__(self, sbx_manager, sbx_edge):
        self.c = {sr.SBX_MANAGER: sbx_manager, sr.SBX_EDGE: sbx_edge, sr.PAPER_MANAGER: manager("paper-img"), sr.LIVE_EDGE: edge("live-edge-img")}
        self.asked = []

    def inspect(self, name):
        self.asked.append(name)
        return copy.deepcopy(self.c[name])

    def run(self, fn, *a, **k):
        with mock.patch.object(sr, "inspect", self.inspect), mock.patch.object(sr, "image_env", lambda ref: dict(IMAGE_ENV)):
            return fn(*a, **k)


def approved(world_pre):
    """RENDER.sha256 as `render` would have written it from the PRE-switch world."""
    files = world_pre.run(sr.render_all)
    return {name: sr.sha(data) for name, data in files.items()}


def write_table(directory, table):
    (Path(directory) / "RENDER.sha256").write_text("".join(f"{h}  {n}\n" for n, h in table.items()))


class CheckScoping(unittest.TestCase):
    def setUp(self):
        self.pre = World(manager("old-mgr"), edge("old-edge"))
        self.table = approved(self.pre)
        self.tmp = tempfile.TemporaryDirectory()
        write_table(self.tmp.name, self.table)
        self.out = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def check(self, world, only="", live=False):
        return world.run(sr.cmd_check, self.out, only, live)

    def test_pre_switch_everything_matches(self):
        for only in ("", "manager", "edge"):
            self.check(self.pre, only)

    def test_edge_check_never_inspects_the_manager_even_when_it_is_on_the_new_image(self):
        """The reported flaw: after the Manager step the Manager carries the S1 env, which used to abort an `--only edge` check."""
        world = World(manager("new-mgr", [S1]), edge("old-edge"))
        self.check(world, "edge")
        self.assertEqual(sorted(set(world.asked)), sorted([sr.SBX_EDGE, sr.LIVE_EDGE]))
        with self.assertRaises(SystemExit):           # the same world still stops an unscoped / manager-scoped non-live render, as designed
            self.check(world, "manager")

    def test_manager_check_inspects_only_the_manager_and_its_paper_reference(self):
        world = World(manager("old-mgr"), edge("anything", ["SURPRISE=1"]))
        self.check(world, "manager")
        self.assertEqual(sorted(set(world.asked)), sorted([sr.SBX_MANAGER, sr.PAPER_MANAGER]))

    def test_real_drift_of_the_scoped_container_is_detected_and_the_other_one_is_ignored(self):
        world = World(manager("old-mgr"), edge("old-edge", ["NEW_THING=1"]))
        with self.assertRaises(SystemExit) as caught:
            self.check(world, "edge")
        self.assertIn("edge-sandbox", str(caught.exception))
        self.check(world, "manager")                  # the edge drift does not leak into the manager check

    def test_unknown_group_is_refused(self):
        with self.assertRaises(SystemExit):
            self.check(self.pre, "worker")


def post_switch_world(memo="0", guard=False):
    """Live state after the switch: Manager on the new image with the S1 env; Edge on the new image with the release pin, memo TTL as given, optional pin variables."""
    ttl = f"EDGE_MANAGER_CATALOGUE_CACHE_TTL_MS={memo}"
    return World(manager("new-mgr", [S1]), edge(sr.NEW_EDGE_IMAGE, RELEASE + [ttl] + (PIN if guard else [])))


class LiveCheck(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        base = World(manager("old-mgr"), edge("old-edge"))
        # approved forward renders come from the post-switch shape: a render of the live Edge must equal the approved file for ANY overlay state
        self.table = approved(base)
        ref = post_switch_world()
        forward = ref.run(sr.render_all, "edge", True)
        self.table["edge-sandbox.rendered.json"] = sr.sha(forward["edge-sandbox.rendered.json"])
        mgr = ref.run(sr.render_all, "manager", True)
        self.table["manager-sandbox.rendered.json"] = sr.sha(mgr["manager-sandbox.rendered.json"])
        write_table(self.tmp.name, self.table)
        self.out = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_live_edge_matches_in_every_overlay_state(self):
        for memo in ("0", "30000"):
            for guard in (False, True):
                world = post_switch_world(memo, guard)
                world.run(sr.cmd_check, self.out, "edge", True)

    def test_live_check_skips_rollback_files_but_non_live_does_not(self):
        world = post_switch_world()
        world.run(sr.cmd_check, self.out, "edge", True)
        with self.assertRaises(SystemExit) as caught:
            world.run(sr.cmd_check, self.out, "edge", False)
        self.assertIn("rollback", str(caught.exception))

    def test_live_manager_accepts_only_the_s1_env_extra(self):
        post_switch_world().run(sr.cmd_check, self.out, "manager", True)
        bad = World(manager("new-mgr", [S1, "OTHER=1"]), edge("x"))
        with self.assertRaises(SystemExit):
            bad.run(sr.cmd_check, self.out, "manager", True)

    def test_live_edge_with_an_unrelated_env_change_is_drift(self):
        world = World(manager("new-mgr", [S1]), edge(sr.NEW_EDGE_IMAGE, RELEASE + ["EDGE_MANAGER_CATALOGUE_CACHE_TTL_MS=0", "EDGE_SURPRISE=1"]))
        with self.assertRaises(SystemExit):
            world.run(sr.cmd_check, self.out, "edge", True)

    def test_live_edge_with_a_different_release_sha_is_drift_even_though_it_is_forced_in_the_render(self):
        # the render forces the approved release values; the shell gate compares the live value separately. The render alone must not hide a missing release mount.
        world = post_switch_world()
        world.c[sr.SBX_EDGE]["Mounts"] = [{"Source": "/s/other", "Destination": "/run/secrets"}]
        with self.assertRaises(SystemExit):
            world.run(sr.cmd_check, self.out, "edge", True)


class Cli(unittest.TestCase):
    def test_cli_accepts_the_documented_forms_only(self):
        for argv in (["check", "--out", "/x", "--only", "edge", "--live"], ["check", "--out", "/x", "--live", "--only", "manager"], ["check", "--out", "/x"]):
            with mock.patch.object(sys, "argv", ["sandbox_render.py"] + argv), mock.patch.object(sr, "cmd_check") as check:
                sr.main()
                check.assert_called_once()
        for argv in (["check", "--out", "/x", "--only", "worker"], ["check", "--out", "/x", "--bogus"], ["render"], ["render", "--out", "/x", "--only", "edge"]):
            with mock.patch.object(sys, "argv", ["sandbox_render.py"] + argv):
                with self.assertRaises(SystemExit):
                    sr.main()

    def test_render_all_without_scope_still_produces_the_five_approved_file_names_in_order(self):
        world = World(manager("old-mgr"), edge("old-edge"))
        self.assertEqual(list(world.run(sr.render_all)), ["manager-sandbox.rendered.json", "manager-sandbox.rollback.rendered.json",
                                                          "edge-sandbox.rendered.json", "override-edge-memo-on.yaml", "edge-sandbox.rollback.rendered.json"])


if __name__ == "__main__":
    unittest.main()
