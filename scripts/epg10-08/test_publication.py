"""TEST_ONLY local source/path guards; never runtime or permission evidence."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("publication", Path(__file__).with_name("publication.py"))
publication = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publication)


class PublicationTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="epg10-08-publication-unit-")
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.packet = self.root / "packet"
        self.target = self.root / "target"
        self.packet.mkdir()
        self.target.mkdir()
        self.files = {f"apps/control-api/src/execution-v2/test-{i}.ts": {
            "before_sha256": None, "after_sha256": hashlib.sha256(b"test\n").hexdigest()
        } for i in range(26)}
        (self.packet / "qualified.patch").write_bytes(b"TEST_ONLY\n")
        self.save()

    def save(self):
        (self.packet / "manifest.json").write_text(json.dumps({
            "schema_version": "portal.epg10-08.qualified-source-handoff.v1",
            "patch_sha256": hashlib.sha256(b"TEST_ONLY\n").hexdigest(), "files": self.files}))

    def test_exact_preimage_check_is_read_only(self):
        with patch.object(publication.subprocess, "run") as run:
            run.return_value.returncode = 0
            result = publication.verify(self.packet, self.target)
        self.assertEqual(result["status"], "EXACT_PREIMAGE_PATCH_CHECK_PASS")
        self.assertEqual(list(self.target.iterdir()), [])
        self.assertEqual(run.call_args.args[0][1:4], ["apply", "--unidiff-zero", "--check"])

    def test_patch_tampering_refused_before_subprocess(self):
        (self.packet / "qualified.patch").write_bytes(b"changed")
        with patch.object(publication.subprocess, "run") as run:
            with self.assertRaisesRegex(ValueError, "PATCH_DIGEST_MISMATCH"):
                publication.verify(self.packet, self.target)
        run.assert_not_called()

    def test_changed_source_refused(self):
        path = self.target / next(iter(self.files))
        path.parent.mkdir(parents=True)
        path.write_bytes(b"peer work")
        with self.assertRaisesRegex(ValueError, "SOURCE_PREIMAGE_CONFLICT"):
            publication.verify(self.packet, self.target)
        self.assertEqual(path.read_bytes(), b"peer work")

    def test_partial_application_refused(self):
        path = self.target / next(iter(self.files))
        path.parent.mkdir(parents=True)
        path.write_bytes(b"test\n")
        with self.assertRaisesRegex(ValueError, "PARTIALLY_APPLIED_SOURCE_REFUSED"):
            publication.verify(self.packet, self.target)

    def test_already_applied_exact_is_noop(self):
        for relative in self.files:
            path = self.target / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b"test\n")
        with patch.object(publication.subprocess, "run") as run:
            result = publication.verify(self.packet, self.target)
        self.assertEqual(result["status"], "ALREADY_APPLIED_EXACT_SOURCE")
        run.assert_not_called()

    def test_parent_symlink_refused(self):
        (self.target / "apps").symlink_to(self.root, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, "SOURCE_SYMLINK_REFUSED"):
            publication.verify(self.packet, self.target)

    def test_traversal_and_non_source_refused(self):
        for path in ("../outside.ts", "/tmp/outside.ts", "apps/control-api/../outside.ts",
                     "apps/control-api/.env", "apps/control-api//file.ts"):
            with self.subTest(path=path):
                with self.assertRaisesRegex(ValueError, "SOURCE_PATH_REFUSED"):
                    publication.safe_path(self.target, path)

    def test_malformed_patch_refused(self):
        with patch.object(publication.subprocess, "run") as run:
            run.return_value.returncode = 1
            with self.assertRaisesRegex(ValueError, "PATCH_CHECK_FAILED"):
                publication.verify(self.packet, self.target)

    def complete_profile(self):
        relative = "apps/control-api/src/unchanged.ts"
        dependency = self.target / relative
        dependency.parent.mkdir(parents=True, exist_ok=True)
        dependency.write_bytes(b"TEST_ONLY dependency\n")
        closure = {name: value["after_sha256"] for name, value in self.files.items()}
        closure[relative] = hashlib.sha256(dependency.read_bytes()).hexdigest()
        raw = json.dumps(closure).encode()
        (self.packet / "qualified-source-pins.json").write_bytes(raw)
        manifest = json.loads((self.packet / "manifest.json").read_text())
        manifest.update(schema_version="portal.epg10-08.qualified-source-handoff.v2",
                        source_file_count=len(self.files),
                        qualified_source_manifest_sha256=hashlib.sha256(raw).hexdigest())
        (self.packet / "manifest.json").write_text(json.dumps(manifest))
        return dependency, manifest

    def test_complete_profile_checks_untouched_dependencies(self):
        self.complete_profile()
        with patch.object(publication.subprocess, "run") as run:
            run.return_value.returncode = 0
            self.assertEqual(publication.verify(self.packet, self.target)["status"], "EXACT_PREIMAGE_PATCH_CHECK_PASS")

    def test_complete_profile_changed_or_missing_dependency_refused(self):
        for mode in ("changed", "missing"):
            with self.subTest(mode=mode):
                dependency, _ = self.complete_profile()
                dependency.write_bytes(b"peer work") if mode == "changed" else dependency.unlink()
                with self.assertRaisesRegex(ValueError, "QUALIFIED_DEPENDENCY_CONFLICT"):
                    publication.verify(self.packet, self.target)

    def test_complete_profile_manifest_tampering_refused(self):
        self.complete_profile()
        (self.packet / "qualified-source-pins.json").write_bytes(b"{}")
        with self.assertRaisesRegex(ValueError, "QUALIFIED_MANIFEST_DIGEST_MISMATCH"):
            publication.verify(self.packet, self.target)

    def test_complete_profile_output_outside_qualified_source_refused(self):
        _, manifest = self.complete_profile()
        manifest["files"][next(iter(self.files))]["after_sha256"] = "0" * 64
        (self.packet / "manifest.json").write_text(json.dumps(manifest))
        with self.assertRaisesRegex(ValueError, "QUALIFIED_OUTPUT_DIGEST_MISMATCH"):
            publication.verify(self.packet, self.target)

    def test_complete_profile_declared_count_is_bounded_and_exact(self):
        _, manifest = self.complete_profile()
        for count in (0, 25, 65, True):
            with self.subTest(count=count):
                manifest["source_file_count"] = count
                (self.packet / "manifest.json").write_text(json.dumps(manifest))
                with self.assertRaisesRegex(ValueError, "SOURCE_SET_MISMATCH"):
                    publication.verify(self.packet, self.target)

    def test_complete_profile_dependency_cannot_escape_to_hidden_or_private_files(self):
        self.complete_profile()
        for name in ("apps/control-api/.private/key.json", "apps/control-api/key.pem", "apps/control-api/../private.ts"):
            with self.subTest(name=name):
                with self.assertRaisesRegex(ValueError, "SOURCE_PATH_REFUSED"):
                    publication.safe_path(self.target, name, dependency=True)


if __name__ == "__main__":
    unittest.main()
