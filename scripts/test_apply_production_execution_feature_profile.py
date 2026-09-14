#!/usr/bin/env python3
"""Focused regression tests for the production feature-profile editor."""

from __future__ import annotations

import importlib.util
import pathlib
import tempfile
import unittest


ROOT = pathlib.Path(__file__).resolve().parent
REPOSITORY_ROOT = ROOT.parent
SPEC = importlib.util.spec_from_file_location("feature_profile", ROOT / "apply-production-execution-feature-profile.py")
assert SPEC is not None and SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class FeatureProfileTests(unittest.TestCase):
    def test_production_workflow_supplies_marker_pinned_images_to_compose(self) -> None:
        workflow = (REPOSITORY_ROOT / ".github/workflows/production-feature-profile.yml").read_text(encoding="utf-8")
        self.assertIn("marker_image()", workflow)
        for key in (
            "PORTAL_API_IMAGE",
            "PORTAL_WEB_IMAGE",
            "PORTAL_CONTROL_API_IMAGE",
            "PORTAL_ROADMAP_API_IMAGE",
        ):
            self.assertIn(f'$(marker_image {key})', workflow)
            self.assertIn(f'{key}="${{{key.lower()}}}"', workflow)

        # A failed Compose render must be a no-op: it is intentionally placed
        # before the temporary result file and the profile editor invocation.
        self.assertLess(
            workflow.index("compose_next config -q < /dev/null"),
            workflow.index('result_file="$(mktemp)"'),
        )
        self.assertLess(
            workflow.index("trap 'rollback \"$?\"' ERR"),
            workflow.rindex('sudo -n python3 "${DEPLOY_PATH}/scripts/apply-production-execution-feature-profile.py"'),
        )

        self.assertIn("execution-durable-mirror-write-only-v1", workflow)
        self.assertIn("BACKFILL_RUN_ID", workflow)
        self.assertIn("compose_next stop control-api", workflow)
        self.assertIn("execution-durable-mirror-reseed.js --apply", workflow)
        self.assertLess(
            workflow.index("compose_next stop control-api"),
            workflow.index("execution-durable-mirror-reseed.js --apply"),
        )

    def test_public_panels_profile_preserves_unknown_secret_and_closes_mirror(self) -> None:
        original = "# host-only\nPORTAL_CONTROL_DB_PASSWORD='keep-me'\nCONTROL_API_FEATURE_EXECUTION_PUBLIC_MARKET_CANDLES=false\nCONTROL_API_FEATURE_EXECUTION_MARKET_CONTEXT=true\nOTHER_FLAG=value\n"
        rewritten = MODULE.rewrite_dotenv(original, MODULE.PROFILES["execution-public-panels-v1"])
        self.assertIn("PORTAL_CONTROL_DB_PASSWORD='keep-me'", rewritten)
        self.assertIn("OTHER_FLAG=value", rewritten)
        self.assertIn("CONTROL_API_FEATURE_EXECUTION_PUBLIC_MARKET_CANDLES=true", rewritten)
        self.assertIn("CONTROL_API_FEATURE_EXECUTION_COMMAND_CENTER_SNAPSHOT=true", rewritten)
        self.assertIn("CONTROL_API_FEATURE_EXECUTION_DURABLE_MIRROR=false", rewritten)
        self.assertIn("CONTROL_API_FEATURE_EXECUTION_DURABLE_MIRROR_READS=false", rewritten)
        self.assertIn("CONTROL_API_FEATURE_EXECUTION_MARKET_CONTEXT=false", rewritten)

    def test_writer_only_profile_starts_mirror_without_read_cutover(self) -> None:
        rewritten = MODULE.rewrite_dotenv(
            "CONTROL_API_FEATURE_EXECUTION_DURABLE_MIRROR=false\n"
            "CONTROL_API_FEATURE_EXECUTION_DURABLE_MIRROR_READS=false\n",
            MODULE.PROFILES["execution-durable-mirror-write-only-v1"],
        )
        self.assertIn("CONTROL_API_FEATURE_EXECUTION_DURABLE_MIRROR=true", rewritten)
        self.assertIn("CONTROL_API_FEATURE_EXECUTION_DURABLE_MIRROR_READS=false", rewritten)
        self.assertIn("CONTROL_API_FEATURE_EXECUTION_PUBLIC_MARKET_CANDLES=true", rewritten)
        self.assertIn("CONTROL_API_FEATURE_EXECUTION_COMMAND_CENTER_SNAPSHOT=true", rewritten)

    def test_profile_cannot_turn_off_an_active_mirror_writer(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            env_path = root / ".env.production"
            env_path.write_text(
                "CONTROL_API_FEATURE_EXECUTION_DURABLE_MIRROR=true\n"
                "CONTROL_API_FEATURE_EXECUTION_DURABLE_MIRROR_READS=false\n",
                encoding="utf-8",
            )
            env_path.chmod(0o600)
            with self.assertRaisesRegex(MODULE.ProfileError, "writer is active"):
                MODULE.backup_and_apply(env_path, root / "transition", "execution-public-panels-v1", "a" * 40)

    def test_apply_creates_private_backup_and_restore_is_exact(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            env_path = root / ".env.production"
            env_path.write_text("PORTAL_STACK_NAME=portal-stable-v1-0-1\nCONTROL_API_FEATURE_EXECUTION_PUBLIC_MARKET_CANDLES=false\n", encoding="utf-8")
            env_path.chmod(0o600)
            original_owner = env_path.stat().st_uid
            transition = root / "transition"
            result = MODULE.backup_and_apply(env_path, transition, "execution-public-panels-v1", "a" * 40)
            self.assertTrue(result["rollback_backup_path"])
            self.assertEqual(set(result["changed_keys"]), set(MODULE.FEATURE_KEYS))
            self.assertEqual(env_path.stat().st_uid, original_owner)
            self.assertIn("CONTROL_API_FEATURE_EXECUTION_PUBLIC_MARKET_CANDLES=true", env_path.read_text(encoding="utf-8"))
            restored = MODULE.restore_backup(env_path, transition, str(result["rollback_backup_path"]))
            self.assertEqual(restored["restored_backup"], pathlib.Path(str(result["rollback_backup_path"])).name)
            self.assertIn("CONTROL_API_FEATURE_EXECUTION_PUBLIC_MARKET_CANDLES=false", env_path.read_text(encoding="utf-8"))

    def test_source_or_manifest_mismatch_refuses_before_edit(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            (root / "releases" / ("a" * 40)).mkdir(parents=True)
            manifest = root / "releases" / ("a" * 40) / "release-manifest.json"
            manifest.write_text("{}\n", encoding="utf-8")
            manifest.chmod(0o600)
            env_path = root / ".env.production"
            env_path.write_text(
                "PORTAL_STACK_NAME=portal-stable-v1-0-1\nPORTAL_HTTP_PORT=18081\n",
                encoding="utf-8",
            )
            env_path.chmod(0o600)
            marker = root / "deployed-release.env"
            marker.write_text("SOURCE_COMMIT=" + ("b" * 40) + "\n", encoding="utf-8")
            marker.chmod(0o600)
            with self.assertRaisesRegex(MODULE.ProfileError, "source commit"):
                MODULE.validate_release(root, "a" * 40, MODULE.sha256_file(manifest), require_canonical_path=False)


if __name__ == "__main__":
    unittest.main(verbosity=2)
