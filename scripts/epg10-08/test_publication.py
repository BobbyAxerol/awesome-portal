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


if __name__ == "__main__":
    unittest.main()
