"""Actual frozen public-source loader qualification; no connected authority.

Run with --closure-root pointing to an owner-prepared public closure containing
pm/ and edge/identity_operator.py. Faults affect only exact disposable copies.
Every loader observation uses a fresh isolated, no-bytecode Python subprocess;
no PM pins, globals, credentials, environment or authority are substituted.
No runtime, pool, listener, identity, grant, Core receipt or ACK is created.
"""
import argparse
import ast
from contextlib import contextmanager
from hashlib import sha256
import importlib.machinery
import importlib.util
import json
import os
from pathlib import Path
import py_compile
import subprocess
import sys
import tempfile
import unittest


LIFECYCLE_SHA256 = "1ee3a15db548c2a472fe195a23af6905da36ca690eebcc7e3e5d774de2a8a632"
CONFIG = None
NATIVE_FILE = "services/portfolio_management/native_business_read_runtime.py"


# This program runs only in a fresh -I -B process. It verifies and executes the
# SAME adapter bytes, then exercises the real loader and real 21 PM modules.
# Audit guards refuse resource creation rather than replace any SDK function.
CHILD = r'''
from hashlib import sha256
import asyncio
import json
from pathlib import Path
import sys
import threading
import types

adapter_path, closure_root, ambient = map(str, sys.argv[1:])
raw = Path(adapter_path).read_bytes()
if sha256(raw).hexdigest() != "1ee3a15db548c2a472fe195a23af6905da36ca690eebcc7e3e5d774de2a8a632":
    raise SystemExit("TEST_ONLY_ADAPTER_PIN_CHANGED")
if not sys.flags.isolated or not sys.dont_write_bytecode:
    raise SystemExit("TEST_ONLY_ISOLATION_REQUIRED")
if any(name == "services" or name.startswith("services.") for name in sys.modules):
    raise SystemExit("TEST_ONLY_UNEXPECTED_AMBIENT_NAMESPACE")
resources = []
blocked = {"socket.__new__", "socket.connect", "socket.bind", "subprocess.Popen",
           "os.system", "os.fork", "os.posix_spawn"}
def guard(event, args):
    if event in blocked:
        resources.append(event)
        raise RuntimeError("TEST_ONLY_RESOURCE_CREATION_REFUSED")
sys.addaudithook(guard)
threads_before = {thread.ident for thread in threading.enumerate()}
adapter = types.ModuleType("_qualified_native_read_lifecycle")
adapter.__file__ = adapter_path
exec(compile(raw, adapter_path, "exec"), adapter.__dict__)
if any(name == "services" or name.startswith("services.") for name in sys.modules):
    raise SystemExit("TEST_ONLY_ADAPTER_IMPORT_CREATED_PM_NAMESPACE")
if ambient == "yes":
    sys.modules["services"] = types.ModuleType("services")
code, origins = "OK", 0
try:
    runtime, helpers = adapter.load_native_closure(
        Path(closure_root) / "pm",
        operator_path=Path(closure_root) / "edge" / "identity_operator.py")
    pins = {**helpers.PM_PINS, **adapter.NATIVE_PM_PINS}
    assert len(helpers.PM_PINS) == 17 and len(pins) == 21
    expected = {"services"}
    for relative, expected_hash in pins.items():
        name = relative[:-3].replace("/", ".")
        if name.endswith(".__init__"):
            name = name[:-9]
        expected.add(name)
        module = sys.modules[name]
        path = Path(module.__file__)
        assert path == Path(closure_root) / "pm" / relative
        assert sha256(path.read_bytes()).hexdigest() == expected_hash
        origins += 1
    assert runtime is sys.modules["services.portfolio_management.native_business_read_runtime"]
    actual = {name for name in sys.modules if name == "services" or name.startswith("services.")}
    assert actual == expected
except adapter.NativeReadLifecycleError as error:
    code = str(error)
    assert len(code) <= 96 and code.startswith("NATIVE_") and code.replace("_", "").isalnum()
except BaseException as error:
    code = "UNEXPECTED_" + type(error).__name__
names = sorted(name for name in sys.modules if name == "services" or name.startswith("services."))
threads_unchanged = threads_before == {thread.ident for thread in threading.enumerate()}
print(json.dumps(dict(code=code, pm_namespace=names, verified_origins=origins,
    resource_attempts=resources, threads_unchanged=threads_unchanged,
    isolated=bool(sys.flags.isolated), no_bytecode=bool(sys.dont_write_bytecode)), sort_keys=True))
'''


def literal_assignment(raw, name):
    """Read real pinned source constants without importing or changing them."""
    for item in ast.parse(raw).body:
        if isinstance(item, ast.Assign) and any(
                isinstance(target, ast.Name) and target.id == name for target in item.targets):
            return ast.literal_eval(item.value)
    raise AssertionError("TEST_ONLY_SOURCE_CONSTANT_MISSING")


class NativeSourceClosureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if CONFIG is None:
            raise AssertionError("TEST_ONLY_EXPLICIT_CLOSURE_ROOT_REQUIRED")
        cls.closure_root, cls.adapter_path = CONFIG
        for path in (cls.closure_root, cls.adapter_path):
            if not path.is_absolute() or path.resolve(strict=True) != path:
                raise AssertionError("TEST_ONLY_CANONICAL_PUBLIC_PATH_REQUIRED")
        raw = cls.adapter_path.read_bytes()
        if sha256(raw).hexdigest() != LIFECYCLE_SHA256:
            raise AssertionError("TEST_ONLY_ADAPTER_PIN_CHANGED")
        operator_path = cls.closure_root / "edge" / "identity_operator.py"
        operator_raw = operator_path.read_bytes()
        if sha256(operator_raw).hexdigest() != literal_assignment(raw, "OPERATOR_SHA256"):
            raise AssertionError("TEST_ONLY_OPERATOR_PIN_CHANGED")
        cls.pins = {**literal_assignment(operator_raw, "PM_PINS"),
                    **literal_assignment(raw, "NATIVE_PM_PINS")}
        if len(cls.pins) != 21:
            raise AssertionError("TEST_ONLY_REAL_SOURCE_CLOSURE_CHANGED")
        cls.public_files = {"edge/identity_operator.py": operator_raw}
        for relative, expected in cls.pins.items():
            value = (cls.closure_root / "pm" / relative).read_bytes()
            if sha256(value).hexdigest() != expected:
                raise AssertionError("TEST_ONLY_REAL_SOURCE_PIN_CHANGED")
            cls.public_files["pm/" + relative] = value

    @contextmanager
    def disposable_copy(self):
        # Only these 22 verified PUBLIC source files are copied. No recursive
        # copy of a runtime root, configuration, environment or private bundle.
        directory = tempfile.TemporaryDirectory(prefix="TEST_ONLY-native-source-")
        root = Path(directory.name)
        try:
            for relative, raw in self.public_files.items():
                path = root / relative
                path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                parent = path.parent
                while parent != root:
                    parent.chmod(0o700)
                    parent = parent.parent
                descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
                with os.fdopen(descriptor, "wb") as output:
                    output.write(raw)
            root.chmod(0o700)
            yield root
        finally:
            directory.cleanup()
            self.assertFalse(root.exists(), "TEST_ONLY_SOURCE_COPY_CLEANUP_INCOMPLETE")

    def observe(self, root, *, expected="OK", ambient=False):
        result = subprocess.run([sys.executable, "-I", "-B", "-c", CHILD,
            str(self.adapter_path), str(root), "yes" if ambient else "no"],
            stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, timeout=15, check=False)
        self.assertEqual(result.returncode, 0, "TEST_ONLY_CHILD_FAILED")
        self.assertLessEqual(len(result.stdout), 8192, "TEST_ONLY_CHILD_OUTPUT_BOUND")
        self.assertEqual(result.stderr, "", "TEST_ONLY_UNEXPECTED_CHILD_STDERR")
        evidence = json.loads(result.stdout)
        self.assertEqual(evidence["code"], expected)
        self.assertTrue(evidence["isolated"] and evidence["no_bytecode"])
        self.assertEqual(evidence["resource_attempts"], [])
        self.assertTrue(evidence["threads_unchanged"])
        if expected != "OK":
            self.assertEqual(evidence["pm_namespace"], ["services"] if ambient else [])
            self.assertEqual(evidence["verified_origins"], 0)
        return evidence

    def test_valid_real_21_pm_modules_origins_and_no_import_resources(self):
        evidence = self.observe(self.closure_root)
        self.assertEqual(evidence["verified_origins"], 21)
        self.assertEqual(len(evidence["pm_namespace"]), 22)

    def test_changed_native_pm_hash_is_rejected_before_any_pm_import(self):
        with self.disposable_copy() as root:
            path = root / "pm" / NATIVE_FILE
            path.write_bytes(path.read_bytes() + b"\n# TEST_ONLY changed public source\n")
            self.observe(root, expected="NATIVE_SOURCE_PIN_CHANGED")

    def test_group_writable_0660_source_is_rejected_before_any_pm_import(self):
        with self.disposable_copy() as root:
            (root / "pm" / NATIVE_FILE).chmod(0o660)
            self.observe(root, expected="NATIVE_SOURCE_PROTECTION_INVALID")

    def test_group_writable_0770_directory_is_rejected_before_any_pm_import(self):
        with self.disposable_copy() as root:
            (root / "pm" / "services" / "portfolio_management").chmod(0o770)
            self.observe(root, expected="NATIVE_SOURCE_PROTECTION_INVALID")

    def test_symlinked_source_is_rejected_before_any_pm_import(self):
        with self.disposable_copy() as root:
            path = root / "pm" / NATIVE_FILE
            retained = root / "TEST_ONLY-original-native.py"
            path.replace(retained)
            path.symlink_to(retained)
            self.observe(root, expected="NATIVE_SOURCE_PATH_INVALID")

    def test_services_initializer_injection_is_not_executed(self):
        with self.disposable_copy() as root:
            (root / "pm" / "services" / "__init__.py").write_bytes(
                b"raise AssertionError('TEST_ONLY injected initializer must not execute')\n")
            self.observe(root, expected="NATIVE_SOURCE_NAMESPACE_CHANGED")

    def test_explicit_ambient_services_namespace_is_rejected_unchanged(self):
        self.observe(self.closure_root, expected="NATIVE_SOURCE_NAMESPACE_ALREADY_IMPORTED", ambient=True)

    def test_existing_cached_or_loose_bytecode_is_rejected_before_any_pm_import(self):
        for cached in (True, False):
            with self.subTest(cached=cached), self.disposable_copy() as root:
                source = root / "pm" / NATIVE_FILE
                target = (Path(importlib.util.cache_from_source(str(source))) if cached
                          else source.with_suffix(".pyc"))
                target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                py_compile.compile(str(source), cfile=str(target), doraise=True)
                self.assertTrue(target.is_file())
                self.observe(root, expected="NATIVE_SOURCE_BYTECODE_PRESENT")

    def test_same_basename_extension_shadow_is_rejected_before_any_pm_import(self):
        with self.disposable_copy() as root:
            source = root / "pm" / NATIVE_FILE
            shadow = source.with_name(source.stem + importlib.machinery.EXTENSION_SUFFIXES[0])
            shadow.write_bytes(b"TEST_ONLY invalid extension must never be loaded\n")
            self.observe(root, expected="NATIVE_SOURCE_IMPORT_SHADOW_PRESENT")


def main():
    global CONFIG
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--closure-root", type=Path, required=True)
    parser.add_argument("--lifecycle-source", type=Path,
        default=Path(__file__).absolute().with_name("native_read_lifecycle.py"))
    options = parser.parse_args()
    CONFIG = (options.closure_root, options.lifecycle_source)
    result = unittest.TextTestRunner(verbosity=2).run(
        unittest.defaultTestLoader.loadTestsFromTestCase(NativeSourceClosureTests))
    print(json.dumps(dict(scope="REAL_PUBLIC_SOURCE_CLOSURE_NOT_CONNECTED",
        tests=result.testsRun, failures=len(result.failures), errors=len(result.errors),
        skipped=len(result.skipped)), sort_keys=True))
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    raise SystemExit(main())
