import contextlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("observe_research_reader_hk",
    Path(__file__).with_name("observe-research-reader-hk.py"))
operator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(operator)


class ObservationOperatorTest(unittest.TestCase):
    def test_private_artifact_and_summary(self):
        with tempfile.TemporaryDirectory() as directory:
            raw = json.dumps({"schema_version": "pma.research-membership-rows.v1",
                "binding": operator.EXPECTED_BINDING, "source": operator.EXPECTED_SOURCE,
                "mapping": {"status": "ACTIVE"}, "heads": [], "receipts": []}).encode()
            stdout = io.StringIO()
            with patch.object(sys, "argv", ["operator", directory]), \
                    patch.object(operator.subprocess, "run", return_value=
                        subprocess.CompletedProcess([], 0, raw + b"\n", b"")), \
                    contextlib.redirect_stdout(stdout):
                operator.main()
            result = json.loads(stdout.getvalue())
            output = Path(result["path"])
            self.assertEqual(output.read_bytes(), raw)
            self.assertEqual(output.stat().st_mode & 0o777, 0o600)
            self.assertEqual((result["mapping"], result["paper_heads"]), ("ACTIVE", 0))
            self.assertNotIn("subject", stdout.getvalue())

    def test_wrong_binding_and_failed_process_never_write(self):
        with tempfile.TemporaryDirectory() as directory:
            raw = json.dumps({"schema_version": "pma.research-membership-rows.v1",
                "binding": {}, "source": operator.EXPECTED_SOURCE, "heads": [], "receipts": []}).encode()
            for code, value in ((0, raw), (1, b"private error")):
                with patch.object(sys, "argv", ["operator", directory]), \
                        patch.object(operator.subprocess, "run", return_value=
                            subprocess.CompletedProcess([], code, value, b"")):
                    with self.assertRaises(ValueError):
                        operator.main()
            self.assertEqual(list(Path(directory).iterdir()), [])

    def test_inactive_mapping_is_not_reported_active(self):
        with tempfile.TemporaryDirectory() as directory:
            raw = json.dumps({"schema_version": "pma.research-membership-rows.v1",
                "binding": operator.EXPECTED_BINDING, "source": operator.EXPECTED_SOURCE,
                "mapping": {"status": "DISABLED"}, "heads": [], "receipts": []}).encode()
            with patch.object(sys, "argv", ["operator", directory]), \
                    patch.object(operator.subprocess, "run", return_value=
                        subprocess.CompletedProcess([], 0, raw, b"")):
                with self.assertRaises(ValueError):
                    operator.main()
            self.assertEqual(list(Path(directory).iterdir()), [])


if __name__ == "__main__":
    unittest.main()
