"""TEST_ONLY operator validation/control-flow; NOT connected identity evidence.

All signatures/certificates below are generated disposable TEST_ONLY fixtures.
Lifecycle tests replace the SDK, pool, source connection and listener explicitly.
Exactly two loopback tests additionally use real CPython asyncio TLS1.3/socket
transports on 127.0.0.1 ephemeral port0 and scoped temporary certificate files.
Their SDK callbacks are still TEST_ONLY; they prove transport drain behavior,
not physical identity COMMIT, genuine Core ACK, grants or operational mTLS.
No operational file, credential, database, trust, session or listener is used.
The unchanged official helper's existing 89-case evidence is not counted here.
"""
import asyncio
import base64
from contextlib import ExitStack, asynccontextmanager
import copy
from datetime import datetime, timedelta, timezone
from hashlib import sha256
import io
import ipaddress
import json
import os
from pathlib import Path, PurePosixPath
import ssl
import stat
import sys
import tempfile
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import patch
from uuid import uuid4

import identity_operator as operator


def raw(value):
    return operator.canonical(value)


def pin(value):
    return sha256(value).hexdigest()


def assertion(*, request=None, lease_id="TEST_ONLY-lease", expires=None):
    if request is None:
        request = (b'{ "schema_version": "pma.current-human-identity-request.v1", '
                   b'"request_id": "' + str(uuid4()).encode() + b'" }')
    return {"action": "ASSERTION", "proof": {"state": "ISSUED",
        "human_token": "TEST_ONLY_NOT_A_JWT", "raw_request_base64":
        base64.b64encode(request).decode(), "lease_id": lease_id,
        "expires_at_ms": expires or (int(datetime.now(timezone.utc).timestamp()) + 30) * 1000}}


class TEST_ONLY_CustodyStop(BaseException):
    """Dispose only in-memory doubles, never an operational custody process."""


class TEST_ONLY_Socket:
    """Metadata-only transport socket; never opens a descriptor or network."""
    def __init__(self, fd=-1, error=None):
        self.fd, self.error = fd, error

    def fileno(self):
        if self.error is not None:
            raise self.error
        return self.fd


class TEST_ONLY_Writer:
    """Socket readback double; optional close proof is controlled by the test."""
    def __init__(self, socket=None, *, close_proves_closed=True):
        self.socket = socket if socket is not None else TEST_ONLY_Socket()
        self.close_proves_closed = close_proves_closed
        self.events = []

    def get_extra_info(self, name):
        if name != "socket":
            raise AssertionError("TEST_ONLY unexpected transport metadata")
        return self.socket

    def close(self):
        self.events.append("close")

    async def wait_closed(self):
        self.events.append("closed")
        if self.close_proves_closed:
            self.socket.fd = -1


class TEST_ONLY_Path(PurePosixPath):
    """Metadata-only path double; never creates the pinned production directory."""
    def resolve(self):
        return self

    def lstat(self):
        return SimpleNamespace(st_mode=stat.S_IFDIR | 0o700, st_uid=os.geteuid())

    def is_dir(self):
        return True

    def exists(self):
        return False

    def is_symlink(self):
        return False


def intake_fixture():
    """Entirely synthetic owner-return shape, not an owner acknowledgement."""
    now = int(datetime.now(timezone.utc).timestamp()) * 1000
    end = now + 120000
    core = dict(issuer="urn:TEST_ONLY:core", audience="urn:TEST_ONLY:pm",
        key_id="TEST_ONLY:core", hostname="core.elp210.candidate.invalid",
        certificate_sha256="sha256:" + "1" * 64, signer_spki_sha256="sha256:" + "2" * 64)
    pm = dict(issuer="urn:TEST_ONLY:pm", audience="urn:TEST_ONLY:core",
        key_id="TEST_ONLY:pm", workload_id="TEST_ONLY:pm",
        hostname="pm.elp210.candidate.invalid", certificate_sha256="sha256:" + "3" * 64,
        signer_spki_sha256="sha256:" + "4" * 64)
    manifest = dict(schema_version="elp210.candidate-trust.v1",
        qualification="CANDIDATE_ONLY_NOT_BUSINESS_AUTHORITY", candidate_id="TEST_ONLY-candidate",
        workspace_id=operator.WORKSPACE, environment="paper", created_at_ms=now - 1000,
        expires_at_ms=end + 1000, core=core, pm=pm,
        ca_certificate_sha256="sha256:" + "5" * 64,
        authority=dict(mapping="NOT_INSTALLED", grants="NOT_INSTALLED",
            application_policy="NOT_INSTALLED", field_policy="NOT_INSTALLED",
            business_reads=False, commands=False, live=False))
    directory = "/home/bobby/secure/portal-core-c7-return-20261019-" + "b" * 12
    members = {name: ("TEST_ONLY-" + name).encode() for name in operator.PM_FILES}
    members["trust.json"] = raw(manifest)
    artifacts = {name: {"path": "/TEST_ONLY/" + name, "sha256": "0" * 64}
                 for name in operator.ARTIFACTS}
    for artifact, name in operator.PM_ARTIFACT_FILES.items():
        artifacts[artifact] = dict(path=directory + "/" + name, sha256=pin(members[name]))
    artifacts["core_handoff"]["path"] = directory + "/core-installation-handoff.json"
    config = dict(schema_version="portal.research-identity-operator-config.v2",
        pm_source_root="/TEST_ONLY/pm", edge_source_root="/TEST_ONLY/edge",
        role_helper_root="/TEST_ONLY/helper", artifacts=artifacts,
        trust=dict(human_audience=pm["issuer"], human_key_id=core["key_id"],
            source_issuer=pm["issuer"], source_audience=operator.ISSUER,
            source_key_id=pm["key_id"], workload_id=pm["workload_id"],
            core_origin=operator.CORE_ORIGIN, core_server_leaf_sha256="1" * 64,
            core_client_leaf_sha256="1" * 64),
        recovery=dict(host=operator.RECOVERY_BIND, port=28446),
        window_start=datetime.fromtimestamp((now - 1000) / 1000, timezone.utc).isoformat(),
        window_end=datetime.fromtimestamp(end / 1000, timezone.utc).isoformat(),
        active_budget_seconds=120, minimum_enter_remaining_ms=1000)
    handoff = dict(schema_version="portal.research-core-owner-return.v1",
        authority="TRANSFER_ONLY_SOURCE_OWNER_ACK_REQUIRED_BEFORE_OPEN", source_commit="b" * 40,
        runtime=dict(id="c" * 64, image="sha256:" + "d" * 64, running=True,
            config_sha256="e" * 64, effective_config_sha256="f" * 64,
            actual_config_mount_environment_network_port_match=True),
        core_installation_receipt_sha256="1" * 64, migration_receipt_sha256="2" * 64,
        schema_receipt_sha256="3" * 64, trust=manifest,
        trust_manifest_sha256=pin(raw(manifest)), research_subject=operator.SUBJECT,
        workspace_id=operator.WORKSPACE, environment="paper",
        source_database_system_identifier=operator.SYSTEM, source_role=operator.ROLE,
        core_reverse_origin=operator.CORE_ORIGIN, source_recovery_origin=operator.SOURCE_RECOVERY,
        source_limits=dict(cpu=2, memory_mib=1536, initial_active_seconds=300),
        pm_files=[dict(name=name, sha256=pin(value)) for name, value in sorted(members.items())])
    raws = {"trust_manifest": raw(manifest), "core_handoff": raw(handoff)}
    ack = dict(schema_version="portal.research-source-owner-intake-ack.v1",
        operator_ref="TEST_ONLY-not-an-actual-ack", acknowledged_at_ms=now - 1000,
        expires_at_ms=end, configuration_binding_sha256=operator.scope_digest(config),
        core_handoff_sha256=pin(raws["core_handoff"]), source_database="live_data_executor",
        source_system_identifier=operator.SYSTEM, source_role=operator.ROLE,
        helper_sha256=operator.EDGE_PINS["identity_role_window"],
        acknowledgement="REVIEWED_INTAKE_AND_FINITE_WINDOW_ONLY", commands=False, live=False)
    raws["source_owner_ack"] = raw(ack)
    return SimpleNamespace(config=config, raws=raws, manifest=manifest, handoff=handoff,
        ack=ack, members=members, now=now, end=end)


class OperatorValidationTests(unittest.TestCase):
    def test_helper_pin_is_exact_published_source(self):
        self.assertEqual(operator.EDGE_COMMIT, "6adc398b573e297b731863e5ed93f0f7f59ab2fd")
        for name, expected in operator.EDGE_PINS.items():
            self.assertEqual(pin(Path(__file__).with_name(name + ".py").read_bytes()), expected)
        self.assertEqual(operator.ISSUER, "portal-control-api.native-manager-read")

    def test_duplicate_nonfinite_and_invalid_json_are_closed_errors(self):
        for value in (b'{"a":1,"a":2}', b'{"a":NaN}', b'{', b'\xff'):
            with self.subTest(value=value), self.assertRaises(operator.RunnerError):
                operator.decode(value)

    def test_jit_thirty_second_assertion_preserves_exact_raw_bytes(self):
        command = assertion()
        proof, original = operator.jit_assertion(command)
        self.assertIs(proof, command["proof"])
        self.assertEqual(original, base64.b64decode(proof["raw_request_base64"]))
        self.assertNotEqual(original, raw(json.loads(original)))
        self.assertLessEqual(proof["expires_at_ms"] - int(datetime.now(timezone.utc).timestamp()*1000), 30000)

    def test_jit_rejects_wrong_action_extra_fields_and_proof_shape(self):
        command = assertion()
        mutations = [dict(command, action="OPEN"), dict(command, extra=True),
            dict(command, proof=dict(command["proof"], state="UNKNOWN")),
            dict(command, proof=dict(command["proof"], expires_at_ms=1)),
            dict(command, proof=dict(command["proof"], human_token="")),
            dict(command, proof=dict(command["proof"], human_token="x" * 8193)),
            dict(command, proof=dict(command["proof"], lease_id="")),
            dict(command, proof=dict(command["proof"], expires_at_ms=True))]
        for value in mutations:
            with self.subTest(action=value["action"]), self.assertRaises(operator.RunnerError):
                operator.jit_assertion(value)

    def test_jit_rejects_invalid_noncanonical_or_oversize_base64(self):
        for encoded in ("?", "YQ===", base64.b64encode(b"x" * 4097).decode()):
            command = assertion()
            command["proof"]["raw_request_base64"] = encoded
            with self.subTest(encoded_length=len(encoded)), self.assertRaises(operator.RunnerError):
                operator.jit_assertion(command)

    def test_output_failure_latches_without_unwinding_custody(self):
        class TEST_ONLY_Broken:
            def write(self, _):
                raise BrokenPipeError("TEST_ONLY-controller-disconnected")
        with patch.object(operator, "_OUTPUT_AVAILABLE", True), \
             patch.object(operator.sys, "stdout", SimpleNamespace(buffer=TEST_ONLY_Broken())):
            self.assertFalse(operator.emit("CUSTODY_REQUIRED", mapping_released=False))
            self.assertFalse(operator._OUTPUT_AVAILABLE)
            self.assertFalse(operator.emit("CUSTODY_REQUIRED"))

    def test_result_limit_is_nonthrowing_and_never_prints_payload(self):
        buffer = io.BytesIO()
        with patch.object(operator, "_OUTPUT_AVAILABLE", True), \
             patch.object(operator.sys, "stdout", SimpleNamespace(buffer=buffer)):
            self.assertFalse(operator.emit("TEST_ONLY", value="x" * 9000))
            self.assertEqual(buffer.getvalue(), b"")

    def test_finite_cgroup_caps_are_guarded_not_capacity_evidence(self):
        values = {"cpu.max": "200000 100000", "memory.max": str(1536 * 1024**2),
                  "pids.max": "128"}
        def fake_path(name):
            return SimpleNamespace(read_text=lambda: values[PurePosixPath(name).name])
        with patch.object(operator, "Path", side_effect=fake_path):
            operator.bounded_controller()

    def test_unbounded_overbound_nonpositive_and_malformed_cgroups_fail_closed(self):
        baseline = {"cpu.max": "200000 100000", "memory.max": str(1536 * 1024**2),
                    "pids.max": "128"}
        for field, value in (("cpu.max", "max 100000"), ("cpu.max", "200001 100000"),
                ("cpu.max", "0 100000"), ("cpu.max", "bad"),
                ("memory.max", "max"), ("memory.max", "0"),
                ("memory.max", str(1536 * 1024**2 + 1)), ("pids.max", "max"),
                ("pids.max", "0"), ("pids.max", "129")):
            values = dict(baseline, **{field: value})
            def fake_path(name):
                return SimpleNamespace(read_text=lambda: values[PurePosixPath(name).name])
            with self.subTest(field=field, value=value), patch.object(operator, "Path", side_effect=fake_path):
                with self.assertRaisesRegex(operator.RunnerError, "CONTROLLER_CAPS_REQUIRED"):
                    operator.bounded_controller()

    def test_missing_cgroup_files_fail_closed(self):
        class TEST_ONLY_MissingPath:
            def read_text(self):
                raise OSError("TEST_ONLY-missing")
        with patch.object(operator, "Path", return_value=TEST_ONLY_MissingPath()):
            with self.assertRaisesRegex(operator.RunnerError, "CONTROLLER_CAPS_REQUIRED"):
                operator.bounded_controller()

    def test_selected_dsns_keep_target_role_and_password_binding(self):
        owner = "postgresql://bobby@TEST_ONLY.invalid:5432/live_data_executor"
        identity = "postgresql://" + operator.ROLE + ":TEST_ONLY@TEST_ONLY.invalid:5432/live_data_executor"
        operator.selected_dsns(owner, identity, "TEST_ONLY")
        for changed_owner, changed_identity, password in (
            (owner.replace("live_data_executor", "other"), identity, "TEST_ONLY"),
            (owner, identity.replace("TEST_ONLY.invalid", "other.invalid"), "TEST_ONLY"),
            (owner, identity, "wrong"), (owner + "?sslmode=disable", identity, "TEST_ONLY"),
            (owner.replace("bobby", operator.ROLE), identity, "TEST_ONLY")):
            with self.subTest(password=password), self.assertRaises(operator.RunnerError):
                operator.selected_dsns(changed_owner, changed_identity, password)

    def validate(self, fixture, *, ack_pin=None):
        with patch.object(operator, "Path", TEST_ONLY_Path), \
             patch.object(operator, "open_reference", return_value=(999, b"TEST_ONLY")), \
             patch.object(operator.os, "close"):
            return operator.validate_intake(fixture.config, fixture.raws,
                source_owner_ack_sha256=ack_pin or pin(fixture.raws["source_owner_ack"]),
                now_ms=fixture.now, end_ms=fixture.end)

    def test_synthetic_owner_return_validates_without_becoming_authority(self):
        f = intake_fixture()
        self.assertEqual(self.validate(f), f.manifest)
        self.assertFalse(f.manifest["authority"]["business_reads"])

    def test_independent_ack_pin_and_exact_configuration_are_required(self):
        f = intake_fixture()
        with self.assertRaisesRegex(operator.RunnerError, "SOURCE_OWNER_ACK_PIN_REQUIRED"):
            self.validate(f, ack_pin="0" * 64)
        f.config["active_budget_seconds"] -= 1
        with self.assertRaisesRegex(operator.RunnerError, "INDEPENDENT_SOURCE_OWNER_ACK_REQUIRED"):
            self.validate(f)

    def test_transfer_scope_rejects_subject_database_or_role_substitution(self):
        for field, value in (("research_subject", "TEST_ONLY-other"),
                             ("source_database_system_identifier", "1"),
                             ("source_role", "TEST_ONLY-other")):
            f = intake_fixture()
            f.handoff[field] = value
            f.raws["core_handoff"] = raw(f.handoff)
            with self.subTest(field=field), self.assertRaisesRegex(operator.RunnerError,
                    "ACTUAL_TRANSFER_OWNER_RETURN_REQUIRED"):
                self.validate(f)

    def test_candidate_urn_cannot_replace_genuine_human_issuer(self):
        f = intake_fixture()
        f.config["trust"]["source_audience"] = f.manifest["core"]["issuer"]
        with self.assertRaisesRegex(operator.RunnerError, "PM_TRUST_BINDING_INVALID"):
            self.validate(f)

    def test_business_live_or_mapping_authority_is_not_implied(self):
        for field, value in (("live", True), ("commands", True), ("mapping", "INSTALLED")):
            f = intake_fixture()
            f.manifest["authority"][field] = value
            f.raws["trust_manifest"] = raw(f.manifest)
            with self.subTest(field=field), self.assertRaisesRegex(operator.RunnerError,
                    "PM_TRUST_MANIFEST_SCOPE_INVALID"):
                self.validate(f)


class OperatorClosureTests(unittest.TestCase):
    """TEST_ONLY module/spec doubles: no official source or package executes."""
    def setUp(self):
        self.config = dict(pm_source_root="/TEST_ONLY/pm", edge_source_root="/TEST_ONLY/edge",
                           role_helper_root="/TEST_ONLY/helper")
        self.verified, self.executed, self.imported = [], [], []

    def closure(self, *, preload=None, fail_pin=None, wrong_origin=False,
                tamper_namespace=False, isolated=1, no_bytecode=True, ambient_initializer=False):
        test, stack = self, ExitStack()
        stack.enter_context(patch.dict(sys.modules))
        for name in list(sys.modules):
            if name == "services" or name.startswith("services.") or name in operator.EDGE_PINS or name == "role_credentials":
                del sys.modules[name]
        if preload:
            sys.modules[preload] = ModuleType(preload)
        stack.enter_context(patch.object(operator.sys, "flags", SimpleNamespace(isolated=isolated)))
        stack.enter_context(patch.object(operator.sys, "dont_write_bytecode", no_bytecode))
        class TEST_ONLY_SourcePath(TEST_ONLY_Path):
            def exists(self):
                return ambient_initializer and self.name == "__init__.py"
        stack.enter_context(patch.object(operator, "Path", TEST_ONLY_SourcePath))
        def verify(path, expected):
            test.verified.append((str(path), expected))
            if fail_pin and str(path).endswith(fail_pin):
                raise operator.RunnerError("TEST_ONLY_SOURCE_PIN_CHANGED")
            return b"TEST_ONLY_NEVER_EXECUTED"
        stack.enter_context(patch.object(operator, "source_bytes", side_effect=verify))
        class TEST_ONLY_Loader:
            def __init__(self, name, path):
                self.name, self.path = name, path
            def exec_module(self, module):
                test.assertEqual(len(test.verified), len(operator.PM_PINS) + len(operator.EDGE_PINS) + 1)
                module.__file__ = str(self.path)
                test.executed.append(self.name)
        def spec(name, path):
            return SimpleNamespace(name=name, loader=TEST_ONLY_Loader(name, path))
        def module(specification):
            value = ModuleType(specification.name)
            value.__spec__ = specification
            return value
        stack.enter_context(patch.object(operator.importlib.util, "spec_from_file_location", side_effect=spec))
        stack.enter_context(patch.object(operator.importlib.util, "module_from_spec", side_effect=module))
        locations = {}
        for relative in operator.PM_PINS:
            name = relative[:-3].replace("/", ".")
            if name.endswith(".__init__"):
                name = name[:-9]
            locations[name] = "/TEST_ONLY/pm/" + relative
        def imported(name):
            test.imported.append(name)
            value = ModuleType(name)
            value.__file__ = "/TEST_ONLY/wrong.py" if wrong_origin else locations[name]
            if tamper_namespace:
                sys.modules["services"].__path__.append("/TEST_ONLY/ambient")
            return value
        stack.enter_context(patch.object(operator.importlib, "import_module", side_effect=imported))
        return stack

    def test_all_seventeen_transitive_files_are_pinned_before_any_execution(self):
        self.assertEqual(len(operator.PM_PINS), 17)
        self.assertTrue({"services/portal_execution_owner/identity/policy.py",
            "services/portal_execution_owner/query/adapter.py",
            "services/portfolio_management/membership_contract.py"} <= set(operator.PM_PINS))
        with self.closure():
            modules = operator.load_closure(self.config)
            self.assertEqual(len(modules), 3)
            self.assertEqual(sys.modules["services"].__path__, ["/TEST_ONLY/pm/services"])
        self.assertEqual(len(self.executed), 4)
        self.assertEqual(len(self.imported), 17)
        self.assertFalse(any(name.endswith(".__init__") for name in self.imported))

    def test_any_preloaded_services_namespace_is_refused_before_import(self):
        for name in ("services", "services.TEST_ONLY_ambient"):
            with self.subTest(name=name), self.closure(preload=name):
                with self.assertRaisesRegex(operator.RunnerError, "SOURCE_NAMESPACE_ALREADY_IMPORTED"):
                    operator.load_closure(self.config)
        self.assertEqual(self.executed, [])
        self.assertEqual(self.verified, [])

    def test_isolated_no_bytecode_process_is_required_before_import(self):
        for isolated, no_bytecode in ((0, True), (1, False)):
            with self.subTest(isolated=isolated, no_bytecode=no_bytecode), \
                 self.closure(isolated=isolated, no_bytecode=no_bytecode):
                with self.assertRaisesRegex(operator.RunnerError, "SOURCE_ISOLATED_NO_BYTECODE_REQUIRED"):
                    operator.load_closure(self.config)
        self.assertEqual(self.executed, [])

    def test_ambient_services_initializer_cannot_execute(self):
        with self.closure(ambient_initializer=True):
            with self.assertRaisesRegex(operator.RunnerError, "SOURCE_NAMESPACE_CHANGED"):
                operator.load_closure(self.config)
        self.assertEqual(self.executed, [])

    def test_last_transitive_pin_failure_prevents_every_execution(self):
        with self.closure(fail_pin="membership_contract.py"):
            with self.assertRaisesRegex(operator.RunnerError, "TEST_ONLY_SOURCE_PIN_CHANGED"):
                operator.load_closure(self.config)
        self.assertEqual(self.executed, [])
        self.assertEqual(self.imported, [])

    def test_imported_module_origin_must_match_frozen_source(self):
        with self.closure(wrong_origin=True):
            with self.assertRaisesRegex(operator.RunnerError, "SOURCE_ORIGIN_CHANGED"):
                operator.load_closure(self.config)

    def test_namespace_cannot_extend_to_ambient_path_after_import(self):
        with self.closure(tamper_namespace=True):
            with self.assertRaisesRegex(operator.RunnerError, "SOURCE_NAMESPACE_CHANGED"):
                operator.load_closure(self.config)


class OperatorCryptoTests(unittest.TestCase):
    def setUp(self):
        from cryptography import x509
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
        from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID
        self.serialization = serialization
        self.keys = {name: Ed25519PrivateKey.generate() for name in
                     ("ca", "pm_tls", "core_tls", "pm_signer", "core_signer")}
        now = datetime.now(timezone.utc).replace(microsecond=0)
        ca_name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "TEST_ONLY_CA")])
        def certificate(name, hostname=None):
            ca = name == "ca"
            subject = ca_name if ca else x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, hostname)])
            builder = (x509.CertificateBuilder().subject_name(subject).issuer_name(ca_name)
                .public_key(self.keys[name].public_key()).serial_number(x509.random_serial_number())
                .not_valid_before(now - timedelta(minutes=1)).not_valid_after(now + timedelta(hours=1))
                .add_extension(x509.BasicConstraints(ca=ca, path_length=0 if ca else None), critical=True))
            if not ca:
                builder = (builder.add_extension(x509.SubjectAlternativeName([x509.DNSName(hostname)]), False)
                    .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.CLIENT_AUTH,
                                                         ExtendedKeyUsageOID.SERVER_AUTH]), False))
            return builder.sign(self.keys["ca"], algorithm=None)
        self.certs = dict(ca=certificate("ca"),
            pm_tls=certificate("pm_tls", "pm.elp210.candidate.invalid"),
            core_tls=certificate("core_tls", "core.elp210.candidate.invalid"))
        self.fixture = intake_fixture()
        m = self.fixture.manifest
        m["expires_at_ms"] = int((now + timedelta(minutes=30)).timestamp()) * 1000
        def pem_public(key):
            return key.public_bytes(serialization.Encoding.PEM,
                                    serialization.PublicFormat.SubjectPublicKeyInfo)
        def pem_private(key):
            return key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                     serialization.NoEncryption())
        def spki(key):
            return key.public_bytes(serialization.Encoding.DER,
                                    serialization.PublicFormat.SubjectPublicKeyInfo)
        self.raws = dict(tls_ca=self.certs["ca"].public_bytes(serialization.Encoding.PEM),
            client_cert=self.certs["pm_tls"].public_bytes(serialization.Encoding.PEM),
            server_cert=self.certs["pm_tls"].public_bytes(serialization.Encoding.PEM),
            client_key=pem_private(self.keys["pm_tls"]), server_key=pem_private(self.keys["pm_tls"]),
            source_signing_key=pem_private(self.keys["pm_signer"]))
        m["ca_certificate_sha256"] = "sha256:" + pin(self.certs["ca"].public_bytes(serialization.Encoding.DER))
        for who in ("pm", "core"):
            m[who]["certificate_sha256"] = "sha256:" + pin(
                self.certs[who + "_tls"].public_bytes(serialization.Encoding.DER))
            m[who]["signer_spki_sha256"] = "sha256:" + pin(spki(self.keys[who + "_signer"].public_key()))
        x = self.keys["core_signer"].public_key().public_bytes(
            serialization.Encoding.Raw, serialization.PublicFormat.Raw)
        self.raws["human_jwks"] = raw(dict(keys=[dict(kty="OKP", crv="Ed25519", alg="EdDSA", use="sig",
            kid=m["core"]["key_id"], x=base64.urlsafe_b64encode(x).rstrip(b"=").decode())]))
        self.peer = {"peer-tls.crt.pem": self.certs["core_tls"].public_bytes(serialization.Encoding.PEM),
            "peer-signer.pub.pem": pem_public(self.keys["core_signer"].public_key()),
            "signer.pub.pem": pem_public(self.keys["pm_signer"].public_key())}
        self.raws["core_handoff"] = raw(dict(pm_files=[dict(name=name, sha256=pin(value))
            for name, value in self.peer.items()]))

    def verify(self):
        def read(ref, **_):
            return 999, self.peer[Path(ref["path"]).name]
        with patch.object(operator, "open_reference", side_effect=read), patch.object(operator.os, "close"):
            return operator.verify_crypto_binding(self.fixture.manifest, self.raws,
                                                 transfer_directory="/TEST_ONLY/in-memory")

    def test_generated_test_only_ca_cert_keys_and_jwks_match(self):
        result = self.verify()
        self.assertEqual(result.public_key().public_bytes(self.serialization.Encoding.Raw,
            self.serialization.PublicFormat.Raw), self.keys["pm_signer"].public_key().public_bytes(
                self.serialization.Encoding.Raw, self.serialization.PublicFormat.Raw))

    def test_wrong_pm_private_key_is_refused(self):
        self.raws["client_key"] = self.raws["source_signing_key"]
        with self.assertRaisesRegex(operator.RunnerError, "PM_TLS_KEY_MISMATCH"):
            self.verify()

    def test_wrong_jwks_signer_pin_is_refused(self):
        self.fixture.manifest["core"]["signer_spki_sha256"] = "sha256:" + "0" * 64
        with self.assertRaisesRegex(operator.RunnerError, "CORE_HUMAN_JWKS_PIN_MISMATCH"):
            self.verify()

    def test_wrong_pm_leaf_digest_is_refused(self):
        self.fixture.manifest["pm"]["certificate_sha256"] = "sha256:" + "0" * 64
        with self.assertRaisesRegex(operator.RunnerError, "PM_LEAF_BINDING_INVALID"):
            self.verify()

    def test_public_peer_signer_cannot_be_substituted(self):
        self.peer["peer-signer.pub.pem"] = self.peer["signer.pub.pem"]
        with self.assertRaisesRegex(operator.RunnerError, "PM_ONLY_PUBLIC_PEER_BINDING_INVALID"):
            self.verify()


class OperatorAsyncUnitTests(unittest.IsolatedAsyncioTestCase):
    async def test_private_command_rejects_missing_newline_oversize_and_duplicates(self):
        for value in (b'{}', b'x' * 32769 + b'\n', b'{"action":1,"action":2}\n', b''):
            reader = asyncio.StreamReader(limit=65536)
            reader.feed_data(value)
            reader.feed_eof()
            with self.subTest(length=len(value)), self.assertRaises(operator.RunnerError):
                await operator.next_private_command(reader)

    async def test_custody_command_allowlist_is_closed(self):
        for action in ("STATUS", "RECOVER_SAME_ATTEMPT", "RETRY_RETIREMENT", "RETRY_LOCAL_CLEANUP"):
            reader = asyncio.StreamReader()
            reader.feed_data(raw(dict(action=action)) + b"\n")
            with self.subTest(action=action):
                self.assertEqual(await operator.next_custody_action(reader), action)

    async def test_malformed_or_scope_changing_custody_input_is_not_terminal(self):
        for value in (b'{bad}\n', b'{}', b'x' * 32769 + b'\n',
                      raw(dict(action="OPEN")) + b"\n",
                      raw(dict(action="RECOVER_SAME_ATTEMPT", attempt="other")) + b"\n"):
            reader = asyncio.StreamReader(limit=65536)
            reader.feed_data(value)
            reader.feed_eof()
            with self.subTest(length=len(value)), patch.object(operator, "emit") as notice:
                self.assertEqual(await operator.next_custody_action(reader), "STATUS")
                self.assertFalse(notice.call_args.kwargs["forced_teardown_allowed"])

    async def test_eof_or_reader_timeout_requests_only_same_attempt_recovery(self):
        class TEST_ONLY_TimeoutReader:
            async def readline(self):
                raise asyncio.TimeoutError()
        self.assertEqual(await operator.next_custody_action(TEST_ONLY_TimeoutReader()), "RECOVER_SAME_ATTEMPT")
        reader = asyncio.StreamReader()
        reader.feed_eof()
        async def pause(*_):
            return None
        with patch.object(operator, "custody_backoff", side_effect=pause):
            self.assertEqual(await operator.next_custody_action(reader), "RECOVER_SAME_ATTEMPT")

    async def test_repeated_real_task_cancellation_does_not_escape_backoff(self):
        task = asyncio.create_task(operator.custody_backoff(0.05))
        await asyncio.sleep(0)
        task.cancel()
        await asyncio.sleep(0)
        task.cancel()
        await asyncio.sleep(0)
        self.assertFalse(task.done())
        await asyncio.wait_for(task, 1)

    async def test_listener_close_is_same_task_and_deadline_bounded(self):
        creator, events = asyncio.current_task(), []
        class TEST_ONLY_Server:
            def close(self):
                events.append("close")
            async def wait_closed(self):
                self_test.assertIs(asyncio.current_task(), creator)
                events.append("closed")
        @asynccontextmanager
        async def deadline(seconds):
            self.assertEqual(seconds, 10)
            events.append("bounded")
            yield
        self_test = self
        await operator.close_listener(TEST_ONLY_Server(), deadline)
        self.assertEqual(events, ["close", "bounded", "closed"])
        await operator.close_listener(None, deadline)

    async def test_failed_listener_close_is_retryable_not_fake_closed(self):
        events = []
        class TEST_ONLY_Server:
            def close(self):
                events.append("close")
            async def wait_closed(self):
                events.append("wait")
                if events.count("wait") == 1:
                    raise asyncio.TimeoutError()
        @asynccontextmanager
        async def deadline(_):
            yield
        server = TEST_ONLY_Server()
        with self.assertRaises(asyncio.TimeoutError):
            await operator.close_listener(server, deadline)
        await operator.close_listener(server, deadline)
        self.assertEqual(events.count("wait"), 2)

    async def test_listener_readiness_uses_actual_serving_state(self):
        self.assertFalse(operator.listener_is_serving(None))
        self.assertFalse(operator.listener_is_serving(SimpleNamespace(is_serving=lambda: False)))
        self.assertTrue(operator.listener_is_serving(SimpleNamespace(is_serving=lambda: True)))

    async def test_failed_handler_drain_can_retry_without_clearing_custody(self):
        attempts = []
        class TEST_ONLY_Recovery:
            active = 0
            async def _handle(self, *_):
                return None
        @asynccontextmanager
        async def deadline(_):
            attempts.append("drain")
            if len(attempts) == 1:
                raise asyncio.TimeoutError()
            yield
        handlers = operator.RecoveryHandlers(TEST_ONLY_Recovery(), deadline)
        with self.assertRaises(asyncio.TimeoutError):
            await handlers.drain()
        self.assertTrue(handlers.accepting)
        await handlers.drain()
        self.assertEqual(attempts, ["drain", "drain"])

    async def test_open_and_run_are_one_await_chain_in_original_task(self):
        events, owner, password = [], object(), "TEST_ONLY-password"
        creator = asyncio.current_task()
        class TEST_ONLY_Window:
            async def open(self, actual_owner, actual_password):
                self_test.assertIs(asyncio.current_task(), creator)
                self_test.assertIs(actual_owner, owner)
                self_test.assertEqual(actual_password, password)
                events.append("OPEN")
                await asyncio.sleep(0)
            async def run(self):
                self_test.assertIs(asyncio.current_task(), creator)
                events.append("RUN")
                return "TEST_ONLY-result"
        self_test = self
        self.assertEqual(await operator.open_and_run(TEST_ONLY_Window(), owner, password), "TEST_ONLY-result")
        self.assertEqual(events, ["OPEN", "RUN"])

    async def test_combined_open_cancellation_propagates_without_second_gate(self):
        events = []
        class TEST_ONLY_Window:
            async def open(self, *_):
                events.append("OPEN")
                raise asyncio.CancelledError()
            async def run(self):
                events.append("RUN")
        with self.assertRaises(asyncio.CancelledError):
            await operator.open_and_run(TEST_ONLY_Window(), None, "TEST_ONLY")
        self.assertEqual(events, ["OPEN"])

    async def test_optional_observation_failure_or_cancellation_cannot_block_retirement(self):
        class TEST_ONLY_Observer:
            def __init__(self, error):
                self.error = error
            async def lookup(self, **_):
                raise self.error
        for error in (OSError("TEST_ONLY"), asyncio.CancelledError()):
            with self.subTest(error=type(error).__name__), patch.object(operator, "emit"):
                self.assertIsNone(await operator.optional_mapping_observation(TEST_ONLY_Observer(error),
                    human_issuer="TEST_ONLY", subject="TEST_ONLY"))

    async def test_optional_observation_success_keeps_bounded_mapping(self):
        expected = dict(ts_user_id=str(uuid4()), mapping_version="1")
        class TEST_ONLY_Observer:
            async def lookup(self, **scope):
                self_test.assertEqual(scope, dict(human_issuer="TEST_ONLY", subject="TEST_ONLY"))
                return expected
        self_test = self
        self.assertEqual(await operator.optional_mapping_observation(TEST_ONLY_Observer(),
            human_issuer="TEST_ONLY", subject="TEST_ONLY"), expected)

    async def test_recovery_handlers_stay_tracked_through_writer_close(self):
        serving, release, closing = asyncio.Event(), asyncio.Event(), asyncio.Event()
        class TEST_ONLY_Recovery:
            active = 0
            async def _handle(self, _, writer):
                serving.set()
                writer.close()
                await writer.wait_closed()
        class TEST_ONLY_Writer:
            socket = TEST_ONLY_Socket(41)
            def get_extra_info(self, name):
                return self.socket if name == "socket" else None
            def close(self):
                closing.set()
            async def wait_closed(self):
                await release.wait()
                self.socket.fd = -1
        @asynccontextmanager
        async def deadline(_):
            yield
        recovery = TEST_ONLY_Recovery()
        handlers = operator.RecoveryHandlers(recovery, deadline)
        task = asyncio.create_task(recovery._handle(None, TEST_ONLY_Writer()))
        await serving.wait()
        await closing.wait()
        self.assertIn(task, handlers.tasks)
        drain = asyncio.create_task(handlers.drain())
        await asyncio.sleep(0)
        self.assertFalse(drain.done())
        release.set()
        await task
        await drain
        self.assertEqual(handlers.tasks, set())

    async def test_recovery_gate_denies_new_handler_without_source_or_ack(self):
        events = []
        class TEST_ONLY_Recovery:
            active = 0
            async def _handle(self, *_):
                events.append("UNEXPECTED_SOURCE")
        class TEST_ONLY_Writer:
            socket = TEST_ONLY_Socket()
            def get_extra_info(self, name):
                return self.socket if name == "socket" else None
            def close(self):
                events.append("close")
            async def wait_closed(self):
                events.append("closed")
        @asynccontextmanager
        async def deadline(_):
            yield
        recovery = TEST_ONLY_Recovery()
        handlers = operator.RecoveryHandlers(recovery, deadline)
        handlers.accepting = False
        await recovery._handle(None, TEST_ONLY_Writer())
        self.assertEqual(events, ["close", "closed"])
        self.assertEqual(handlers.tasks, set())

    async def test_recovery_handler_error_releases_tracking_for_retry(self):
        calls = []
        class TEST_ONLY_Recovery:
            active = 0
            async def _handle(self, *_):
                calls.append("serve")
                if len(calls) == 1:
                    raise OSError("TEST_ONLY-first-handler")
        @asynccontextmanager
        async def deadline(_):
            yield
        recovery = TEST_ONLY_Recovery()
        handlers = operator.RecoveryHandlers(recovery, deadline)
        with self.assertRaises(OSError):
            await recovery._handle(None, TEST_ONLY_Writer())
        self.assertEqual(handlers.tasks, set())
        await recovery._handle(None, TEST_ONLY_Writer())
        self.assertEqual(calls, ["serve", "serve"])

    async def test_sdk_return_and_empty_tasks_do_not_prove_physical_socket_closed(self):
        class TEST_ONLY_Recovery:
            active = 0
            async def _handle(self, *_):
                return None
        @asynccontextmanager
        async def deadline(_):
            yield
        recovery = TEST_ONLY_Recovery()
        handlers = operator.RecoveryHandlers(recovery, deadline)
        socket = TEST_ONLY_Socket(41)
        await recovery._handle(None, TEST_ONLY_Writer(socket, close_proves_closed=False))
        self.assertEqual(handlers.tasks, set())
        self.assertEqual(recovery.active, 0)
        with self.assertRaises(asyncio.TimeoutError):
            await asyncio.wait_for(handlers.drain(server=SimpleNamespace(_active_count=0)), 0.03)
        self.assertIn(socket, handlers.sockets)
        socket.fd = -1
        await handlers.drain(server=SimpleNamespace(_active_count=0))
        self.assertEqual(handlers.sockets, [])

    async def test_prehandler_tls_transport_blocks_drain_until_same_server_detaches(self):
        class TEST_ONLY_Recovery:
            active = 0
            async def _handle(self, *_):
                raise AssertionError("TEST_ONLY no SDK handler should run")
        @asynccontextmanager
        async def deadline(_):
            yield
        handlers = operator.RecoveryHandlers(TEST_ONLY_Recovery(), deadline)
        server = SimpleNamespace(_active_count=1)
        with self.assertRaises(asyncio.TimeoutError):
            await asyncio.wait_for(handlers.drain(server=server), 0.03)
        self.assertFalse(handlers.tasks)
        self.assertFalse(handlers.sockets)
        server._active_count = 0
        await handlers.drain(server=server)

    async def test_missing_and_invalid_server_transport_readback_fail_closed(self):
        class TEST_ONLY_Recovery:
            active = 0
            async def _handle(self, *_):
                return None
        @asynccontextmanager
        async def deadline(_):
            yield
        for server in (SimpleNamespace(), SimpleNamespace(_active_count=-1),
                SimpleNamespace(_active_count=True), SimpleNamespace(_active_count="0")):
            handlers = operator.RecoveryHandlers(TEST_ONLY_Recovery(), deadline)
            with self.subTest(server=vars(server)), self.assertRaisesRegex(
                    operator.RunnerError, "RECOVERY_SERVER_TRANSPORT_STATE_UNAVAILABLE"):
                await handlers.drain(server=server)
        class TEST_ONLY_BrokenServer:
            @property
            def _active_count(self):
                raise OSError("TEST_ONLY metadata unavailable")
        handlers = operator.RecoveryHandlers(TEST_ONLY_Recovery(), deadline)
        with self.assertRaisesRegex(operator.RunnerError, "RECOVERY_SERVER_TRANSPORT_STATE_UNAVAILABLE"):
            await handlers.drain(server=TEST_ONLY_BrokenServer())

    async def test_missing_or_failed_socket_capture_is_latched_and_never_admits_sdk(self):
        calls = []
        class TEST_ONLY_Recovery:
            active = 0
            async def _handle(self, *_):
                calls.append("UNEXPECTED_SOURCE")
        class TEST_ONLY_BrokenWriter(TEST_ONLY_Writer):
            def get_extra_info(self, _):
                raise OSError("TEST_ONLY socket metadata unavailable")
        @asynccontextmanager
        async def deadline(_):
            yield
        for writer in (TEST_ONLY_Writer(), TEST_ONLY_BrokenWriter()):
            if type(writer) is TEST_ONLY_Writer:
                writer.socket = None
                writer.close_proves_closed = False
            recovery = TEST_ONLY_Recovery()
            handlers = operator.RecoveryHandlers(recovery, deadline)
            with self.assertRaisesRegex(operator.RunnerError, "RECOVERY_SOCKET_STATE_UNAVAILABLE"):
                await recovery._handle(None, writer)
            self.assertEqual(handlers.tasks, set())
            with self.assertRaisesRegex(operator.RunnerError, "RECOVERY_SOCKET_STATE_UNAVAILABLE"):
                await handlers.drain(server=SimpleNamespace(_active_count=0))
        self.assertEqual(calls, [])

    async def test_error_and_invalid_socket_fileno_cannot_claim_closed(self):
        class TEST_ONLY_Recovery:
            active = 0
            async def _handle(self, *_):
                return None
        @asynccontextmanager
        async def deadline(_):
            yield
        for socket in (TEST_ONLY_Socket(error=OSError("TEST_ONLY unavailable")),
                TEST_ONLY_Socket(True), TEST_ONLY_Socket(-2), TEST_ONLY_Socket("closed")):
            recovery = TEST_ONLY_Recovery()
            handlers = operator.RecoveryHandlers(recovery, deadline)
            with self.assertRaisesRegex(operator.RunnerError, "RECOVERY_SOCKET_STATE_UNAVAILABLE"):
                await recovery._handle(None, TEST_ONLY_Writer(socket, close_proves_closed=False))
            with self.subTest(value=socket.fd), self.assertRaisesRegex(
                    operator.RunnerError, "RECOVERY_SOCKET_STATE_UNAVAILABLE"):
                await handlers.drain(server=SimpleNamespace(_active_count=0))

    async def test_active_sdk_blocks_drain_and_invalid_active_readback_fails_closed(self):
        class TEST_ONLY_Recovery:
            active = 1
            async def _handle(self, *_):
                return None
        @asynccontextmanager
        async def deadline(_):
            yield
        recovery = TEST_ONLY_Recovery()
        handlers = operator.RecoveryHandlers(recovery, deadline)
        with self.assertRaises(asyncio.TimeoutError):
            await asyncio.wait_for(handlers.drain(server=SimpleNamespace(_active_count=0)), 0.03)
        recovery.active = 0
        await handlers.drain(server=SimpleNamespace(_active_count=0))
        for value in (True, -1, "0"):
            recovery.active = value
            with self.subTest(value=value), self.assertRaisesRegex(
                    operator.RunnerError, "RECOVERY_ACTIVE_STATE_UNAVAILABLE"):
                await handlers.drain(server=SimpleNamespace(_active_count=0))

    async def test_cancelled_sdk_handler_retains_open_socket_until_physical_close(self):
        entered = asyncio.Event()
        class TEST_ONLY_Recovery:
            active = 0
            async def _handle(self, *_):
                entered.set()
                await asyncio.Event().wait()
        @asynccontextmanager
        async def deadline(_):
            yield
        recovery = TEST_ONLY_Recovery()
        handlers = operator.RecoveryHandlers(recovery, deadline)
        socket = TEST_ONLY_Socket(41)
        task = asyncio.create_task(recovery._handle(
            None, TEST_ONLY_Writer(socket, close_proves_closed=False)))
        await entered.wait()
        task.cancel()
        outcomes = await asyncio.gather(task, return_exceptions=True)
        self.assertIsInstance(outcomes[0], asyncio.CancelledError)
        self.assertFalse(handlers.tasks)
        with self.assertRaises(asyncio.TimeoutError):
            await asyncio.wait_for(handlers.drain(server=SimpleNamespace(_active_count=0)), 0.03)
        socket.fd = -1
        await handlers.drain(server=SimpleNamespace(_active_count=0))

    async def test_rejected_writer_wait_closed_is_not_physical_socket_proof(self):
        calls = []
        class TEST_ONLY_Recovery:
            active = 0
            async def _handle(self, *_):
                calls.append("UNEXPECTED_SOURCE")
        @asynccontextmanager
        async def deadline(_):
            yield
        recovery = TEST_ONLY_Recovery()
        handlers = operator.RecoveryHandlers(recovery, deadline)
        handlers.accepting = False
        socket = TEST_ONLY_Socket(41)
        writer = TEST_ONLY_Writer(socket, close_proves_closed=False)
        await recovery._handle(None, writer)
        self.assertEqual(writer.events, ["close", "closed"])
        self.assertEqual(calls, [])
        with self.assertRaises(asyncio.TimeoutError):
            await asyncio.wait_for(handlers.drain(server=SimpleNamespace(_active_count=0)), 0.03)
        socket.fd = -1
        await handlers.drain(server=SimpleNamespace(_active_count=0))


class OperatorLoopbackTLSTests(unittest.IsolatedAsyncioTestCase):
    """Actual CPython transport proof; no actual PM SDK, Core, DB or identity."""
    async def asyncSetUp(self):
        from cryptography import x509
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
        from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID
        self.server, self.handlers = None, None
        self.writers, self.drains, self.transport_errors = [], [], []
        self.allowed_transport_errors = set()
        self.loop = asyncio.get_running_loop()
        self.previous_exception_handler = self.loop.get_exception_handler()
        def capture_error(_loop, context):
            # Only fixture exception TYPE, never context/exception repr or keys.
            error = context.get("exception")
            self.transport_errors.append(type(error).__name__ if error is not None else "NO_EXCEPTION")
        self.loop.set_exception_handler(capture_error)
        self.addCleanup(self.loop.set_exception_handler, self.previous_exception_handler)
        directory = tempfile.TemporaryDirectory(prefix="TEST_ONLY-operator-loopback-")
        self.addCleanup(directory.cleanup)
        self.cert_directory = Path(directory.name)
        ca_key, leaf_key = Ed25519PrivateKey.generate(), Ed25519PrivateKey.generate()
        now = datetime.now(timezone.utc).replace(microsecond=0)
        ca_name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "TEST_ONLY_LOOPBACK_CA")])
        ca = (x509.CertificateBuilder().subject_name(ca_name).issuer_name(ca_name)
            .public_key(ca_key.public_key()).serial_number(x509.random_serial_number())
            .not_valid_before(now - timedelta(minutes=1)).not_valid_after(now + timedelta(minutes=5))
            .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
            .sign(ca_key, algorithm=None))
        leaf = (x509.CertificateBuilder()
            .subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "TEST_ONLY_LOOPBACK")]))
            .issuer_name(ca_name).public_key(leaf_key.public_key())
            .serial_number(x509.random_serial_number()).not_valid_before(now - timedelta(minutes=1))
            .not_valid_after(now + timedelta(minutes=5))
            .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
            .add_extension(x509.SubjectAlternativeName(
                [x509.IPAddress(ipaddress.ip_address("127.0.0.1"))]), critical=False)
            .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]), critical=False)
            .sign(ca_key, algorithm=None))
        cert_path, key_path = self.cert_directory / "TEST_ONLY.crt.pem", self.cert_directory / "TEST_ONLY.key.pem"
        for path, value in (
                (cert_path, leaf.public_bytes(serialization.Encoding.PEM)),
                (key_path, leaf_key.private_bytes(serialization.Encoding.PEM,
                    serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))):
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, "wb") as output:
                output.write(value)
        self.server_tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        self.server_tls.minimum_version = self.server_tls.maximum_version = ssl.TLSVersion.TLSv1_3
        self.server_tls.load_cert_chain(str(cert_path), str(key_path))
        self.client_tls = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        self.client_tls.minimum_version = self.client_tls.maximum_version = ssl.TLSVersion.TLSv1_3
        self.client_tls.verify_mode = ssl.CERT_REQUIRED
        self.client_tls.check_hostname = True
        self.client_tls.load_verify_locations(cadata=ca.public_bytes(serialization.Encoding.PEM).decode("ascii"))

    @asynccontextmanager
    async def deadline(self, seconds):
        # Real test-local deadline, not the SDK's timeout/authority semantics.
        task, expired = asyncio.current_task(), False
        def expire():
            nonlocal expired
            expired = True
            task.cancel()
        handle = self.loop.call_later(seconds, expire)
        try:
            yield
        except asyncio.CancelledError:
            if expired:
                raise asyncio.TimeoutError() from None
            raise
        finally:
            handle.cancel()

    async def until(self, predicate):
        async def observe():
            while not predicate():
                await asyncio.sleep(0.005)
        await asyncio.wait_for(observe(), 2)

    def start_drain(self):
        task = asyncio.create_task(self.handlers.drain(server=self.server))
        self.drains.append(task)
        return task

    async def asyncTearDown(self):
        # Cleanup is ONLY these disposable loopback resources. No operational
        # custody process, SDK state, existing listener or peer is ever touched.
        cleanup_errors = []
        if self.server is not None:
            self.server.close()
        for writer in self.writers:
            writer.close()
        for writer in self.writers:
            try:
                await asyncio.wait_for(writer.wait_closed(), 1)
            except Exception as error:
                if type(error).__name__ not in self.allowed_transport_errors:
                    cleanup_errors.append(type(error).__name__)
                # Test-failure fallback for this exact fixture transport only.
                writer.transport.abort()
        for task in self.drains:
            if not task.done():
                task.cancel()
        if self.drains:
            await asyncio.gather(*self.drains, return_exceptions=True)
        if self.server is not None:
            await asyncio.wait_for(self.server.wait_closed(), 1)
            await self.until(lambda: operator.server_transport_count(self.server) == 0)
        if self.handlers is not None:
            await self.until(lambda: not self.handlers.tasks)
        await asyncio.sleep(0)
        unexpected = [name for name in self.transport_errors if name not in self.allowed_transport_errors]
        self.assertEqual(cleanup_errors, [])
        self.assertEqual(unexpected, [])

    async def test_real_tls_incomplete_handshake_stays_counted_after_listener_close(self):
        self.allowed_transport_errors = {"ConnectionResetError"}
        sdk_calls = []
        class TEST_ONLY_Recovery:
            active = 0
            async def _handle(self, *_):
                sdk_calls.append("UNEXPECTED_HANDLER")
        recovery = TEST_ONLY_Recovery()
        self.handlers = operator.RecoveryHandlers(recovery, self.deadline)
        self.server = await asyncio.start_server(recovery._handle, "127.0.0.1", 0,
            ssl=self.server_tls, ssl_handshake_timeout=2)
        port = self.server.sockets[0].getsockname()[1]
        _reader, client = await asyncio.wait_for(asyncio.open_connection("127.0.0.1", port), 1)
        self.writers.append(client)
        await self.until(lambda: operator.server_transport_count(self.server) == 1)
        self.server.close()
        await asyncio.wait_for(self.server.wait_closed(), 1)
        self.assertFalse(self.server.is_serving())
        self.assertEqual(sdk_calls, [])
        self.assertFalse(self.handlers.tasks)
        self.assertFalse(self.handlers.sockets)
        self.assertEqual(operator.server_transport_count(self.server), 1)
        drain = self.start_drain()
        with self.assertRaises(asyncio.TimeoutError):
            await asyncio.wait_for(asyncio.shield(drain), 0.08)
        self.assertFalse(drain.done())
        client.close()
        await asyncio.wait_for(client.wait_closed(), 1)
        await self.until(lambda: operator.server_transport_count(self.server) == 0)
        await asyncio.wait_for(drain, 1)
        self.assertEqual(sdk_calls, [])

    async def test_real_tls_returned_handler_keeps_original_socket_until_close_and_detach(self):
        returned, sdk_calls, sockets = asyncio.Event(), [], []
        outer = self
        class TEST_ONLY_Recovery:
            active = 0
            async def _handle(self, _reader, writer):
                sdk_calls.append("RETURN_WITH_OPEN_SOCKET")
                outer.writers.append(writer)
                sockets.append(writer.get_extra_info("socket"))
                returned.set()
                # Deliberately keep the REAL test socket open after SDK return.
        recovery = TEST_ONLY_Recovery()
        self.handlers = operator.RecoveryHandlers(recovery, self.deadline)
        self.server = await asyncio.start_server(recovery._handle, "127.0.0.1", 0,
            ssl=self.server_tls, ssl_handshake_timeout=2)
        port = self.server.sockets[0].getsockname()[1]
        _reader, client = await asyncio.wait_for(asyncio.open_connection("127.0.0.1", port,
            ssl=self.client_tls, server_hostname="127.0.0.1", ssl_handshake_timeout=2), 2)
        self.writers.append(client)
        await asyncio.wait_for(returned.wait(), 1)
        await self.until(lambda: not self.handlers.tasks)
        self.assertEqual(sdk_calls, ["RETURN_WITH_OPEN_SOCKET"])
        source_socket = sockets[0]
        self.assertGreaterEqual(source_socket.fileno(), 0)
        self.assertIn(source_socket, self.handlers.sockets)
        self.assertEqual(recovery.active, 0)
        self.server.close()
        await asyncio.wait_for(self.server.wait_closed(), 1)
        self.assertEqual(operator.server_transport_count(self.server), 1)
        drain = self.start_drain()
        with self.assertRaises(asyncio.TimeoutError):
            await asyncio.wait_for(asyncio.shield(drain), 0.08)
        self.assertFalse(drain.done())
        for writer in self.writers:
            writer.close()
        await asyncio.wait_for(asyncio.gather(*(writer.wait_closed() for writer in self.writers)), 1)
        await self.until(lambda: source_socket.fileno() == -1
            and operator.server_transport_count(self.server) == 0)
        await asyncio.wait_for(drain, 1)
        self.assertEqual(self.handlers.sockets, [])
        self.assertFalse(self.handlers.tasks)


class TEST_ONLY_Lifecycle:
    """Control-flow doubles only. No SDK, connection, TLS or receipt authority."""
    def __init__(self, test, *, wrong_lease=False, wrong_expiry=False, fail_ready=False,
                 run_error=False, recover_unknown=0, open_ambiguous=False,
                 retire_failures=0, owner_close_failures=0, pool_close_failures=0,
                 listener_wait_failures=0, serving=True, setup_failure=None):
        self.test = test
        self.events, self.records, self.windows = [], [], []
        self.command = assertion()
        self.wrong_lease, self.wrong_expiry, self.fail_ready = wrong_lease, wrong_expiry, fail_ready
        self.run_error, self.recover_unknown, self.open_ambiguous = run_error, recover_unknown, open_ambiguous
        self.retire_failures, self.owner_close_failures = retire_failures, owner_close_failures
        self.pool_close_failures, self.listener_wait_failures = pool_close_failures, listener_wait_failures
        self.serving, self.fd_closes = serving, []
        self.setup_failure = setup_failure
        self.custody_reported = asyncio.Event()
        self.pool = SimpleNamespace(close=self.close_pool, is_closing=lambda: self.pool_closed,
                                    get_size=lambda: 0)
        self.pool_closed = False
        self.owner = SimpleNamespace(close=self.close_owner)
        self.installation = raw(dict(schema_version="pma.native-business-read.installation.v1",
            target=dict(database="live_data_executor", system_identifier=operator.SYSTEM,
                schema_login="bobby", schema_role="bobby", source_fingerprint="TEST_ONLY-fingerprint"),
            native_catalogue_sha256="1" * 64))
        self.sql = b"TEST_ONLY_NOT_EXECUTABLE_SQL"
        f = intake_fixture()
        self.config = f.config
        self.raws = {name: b"TEST_ONLY" for name in operator.ARTIFACTS}
        self.raws.update(installation=self.installation, candidate_sql=self.sql, human_jwks=b'{"keys":[]}',
                         trust_manifest=b'{}', core_handoff=b'{}', source_owner_ack=b'{}')
        self.envelope = dict(config=self.config,
            owner_dsn="postgresql://bobby@TEST_ONLY.invalid:5432/live_data_executor",
            identity_dsn="postgresql://" + operator.ROLE + ":TEST_ONLY@TEST_ONLY.invalid:5432/live_data_executor",
            identity_password="TEST_ONLY")
        self.config_pin = pin(raw(self.config))
        self.fixture = f

    async def close_pool(self):
        self.events.append("pool.close")
        if self.pool_close_failures:
            self.pool_close_failures -= 1
            raise OSError("TEST_ONLY-pool-close")
        self.pool_closed = True

    async def close_owner(self, **_):
        self.events.append("owner.close")
        if self.owner_close_failures:
            self.owner_close_failures -= 1
            raise OSError("TEST_ONLY-owner-close")

    def emit(self, state, **facts):
        self.records.append((state, facts))
        if state in {"OPERATOR_READBACK_REQUIRED", "CUSTODY_REQUIRED"}:
            self.custody_reported.set()
        return not (self.fail_ready and state == "READY_NO_OPEN")

    def patches(self):
        outer, stack = self, ExitStack()
        class TEST_ONLY_Server:
            _active_count = 0
            def is_serving(self):
                return outer.serving
            def close(self):
                outer.events.append("server.close")
                outer.serving = False
            async def wait_closed(self):
                outer.events.append("server.closed")
                if outer.listener_wait_failures:
                    outer.listener_wait_failures -= 1
                    raise asyncio.TimeoutError()
        class TEST_ONLY_Recovery:
            active = 0
            def __init__(self, **_):
                if outer.setup_failure == "recovery":
                    raise ValueError("TEST_ONLY-recovery-construction")
            async def _handle(self, *_):
                raise AssertionError("TEST_ONLY no socket accepted")
            async def start(self, **_):
                outer.events.append("listener.READY")
                return TEST_ONLY_Server()
        class TEST_ONLY_Window:
            def __init__(self, prep, candidate, selection, token, request):
                outer.events.append("prepare")
                outer.test.assertEqual(request, base64.b64decode(outer.command["proof"]["raw_request_base64"]))
                outer.test.assertEqual(token, "TEST_ONLY_NOT_A_JWT")
                self.creator = asyncio.current_task()
                self.pool, self.state = outer.pool, "DORMANT"
                self.prepared = SimpleNamespace(attempt=SimpleNamespace(
                    lease_id="TEST_ONLY-wrong" if outer.wrong_lease else "TEST_ONLY-lease",
                    attempt_id="TEST_ONLY-original-attempt", binding_digest="TEST_ONLY-binding"),
                    principal=SimpleNamespace(expires_at=outer.command["proof"]["expires_at_ms"]//1000
                        + int(outer.wrong_expiry)), finished=False, resolution=self.resolution("UNKNOWN", False))
                outer.windows.append(self)
            def resolution(self, phase, ack):
                return SimpleNamespace(phase=phase, portal_acknowledged=ack,
                    source_receipt_id="TEST_ONLY-not-physical", source_receipt_digest="sha256:" + "0" * 64)
            def same_task(self):
                outer.test.assertIs(asyncio.current_task(), self.creator)
            async def open(self, *_):
                self.same_task()
                outer.events.append("OPEN")
                self.state = "OPEN_UNCONFIRMED" if outer.open_ambiguous else "OPEN"
                if outer.open_ambiguous:
                    raise OSError("TEST_ONLY-ambiguous-DDL")
            async def run(self):
                self.same_task()
                outer.events.append("RUN")
                self.state = "RECOVERY_REQUIRED"
                if outer.run_error:
                    raise asyncio.CancelledError()
                self.prepared.resolution = self.resolution("COMMITTED", True)
                self.prepared.finished = True
                return dict(ts_user_id="TEST_ONLY-not-an-actual-mapping", mapping_version="1")
            async def recover(self):
                self.same_task()
                outer.events.append(("RECOVER", id(self.prepared.attempt)))
                if outer.recover_unknown:
                    outer.recover_unknown -= 1
                    self.prepared.resolution = self.resolution("UNKNOWN", False)
                else:
                    self.prepared.resolution = self.resolution("ROLLED_BACK", True)
                return self.prepared.resolution
            async def retire(self, *_):
                self.same_task()
                outer.test.assertTrue(self.prepared.resolution.portal_acknowledged)
                outer.events.append("RETIRE")
                if outer.retire_failures:
                    outer.retire_failures -= 1
                    raise ValueError("TEST_ONLY-safe-retirement-retry")
                await outer.close_pool()
                self.state = "RETIRED"
                return dict(state="RETIRED")
        @asynccontextmanager
        async def deadline(_):
            outer.events.append("budget.start")
            try:
                yield
            finally:
                outer.events.append("budget.end")
        async def connect(*_, **__):
            return outer.owner
        async def identity_pool(*_, **__):
            return outer.pool
        async def fingerprint(_):
            return "TEST_ONLY-fingerprint"
        def candidate(*_):
            if outer.setup_failure == "candidate":
                raise ValueError("TEST_ONLY-candidate-construction")
            return object()
        def signal_handler(*_):
            outer.events.append("signal.add")
            if outer.setup_failure == "signal" and outer.events.count("signal.add") == 2:
                raise NotImplementedError("TEST_ONLY-signal-setup")
        def remove_signal_handler(*_):
            outer.events.append("signal.remove")
            return True
        fake_modules = {
            "asyncpg": dict(connect=connect),
            "services.portal_execution_owner.identity.human": dict(HumanTrustPolicy=lambda **_: object(),
                                                                  HumanVerifier=lambda _: object()),
            "services.portfolio_management.portal_human_candidate": dict(PortalHumanCandidate=candidate,
                SourceConfig=lambda **_: object(), _deadline=deadline),
            "services.portfolio_management.portal_human_transport": dict(PortalHumanHttpClient=lambda **_: object()),
            "services.portfolio_management.portal_human_recovery": dict(PortalHumanRecoveryServer=TEST_ONLY_Recovery),
            "services.portfolio_management.native_fence": dict(source_fingerprint=fingerprint),
            "services.portfolio_management.existing_identity_mapping": dict(ExistingIdentityMappingSource=lambda *_, **__: object())}
        modules = {}
        for name, values in fake_modules.items():
            module = ModuleType(name)
            module.__dict__.update(values)
            modules[name] = module
        closure = (SimpleNamespace(ReceiptPreparation=lambda *_, **__: object()),
            SimpleNamespace(ResearchIdentitySelection=lambda *_: object()),
            SimpleNamespace(identity_pool=identity_pool, IdentityRoleWindow=TEST_ONLY_Window))
        stack.enter_context(patch.dict(sys.modules, modules))
        replacements = dict(load_closure=lambda _: closure, bounded_controller=lambda: None,
            open_reference=lambda ref, **_: (999, self.raws[Path(ref["path"]).name]),
            validate_intake=lambda *_, **__: self.fixture.manifest,
            verify_crypto_binding=lambda *_, **__: object(), ssl_contexts=lambda *_: (object(), object()),
            INSTALLATION_PIN=pin(self.installation), SQL_PIN=pin(self.sql), emit=self.emit,
            _OUTPUT_AVAILABLE=True)
        for name, value in replacements.items():
            stack.enter_context(patch.object(operator, name, value))
        stack.enter_context(patch.object(operator.os, "close", side_effect=self.fd_closes.append))
        stack.enter_context(patch.object(asyncio.get_running_loop(), "add_signal_handler", side_effect=signal_handler))
        stack.enter_context(patch.object(asyncio.get_running_loop(), "remove_signal_handler", side_effect=remove_signal_handler))
        if self.setup_failure == "tracker":
            stack.enter_context(patch.object(operator, "RecoveryHandlers",
                side_effect=ValueError("TEST_ONLY-tracker-construction")))
        # File references are TEST_ONLY indices; production protection/hash and
        # cryptographic checks are covered separately, not silently called real.
        for name in self.config["artifacts"]:
            self.config["artifacts"][name]["path"] = "/TEST_ONLY/" + name
        self.config_pin = pin(raw(self.config))
        return stack

    async def run(self, commands):
        reader = asyncio.StreamReader(limit=65536)
        for command in commands:
            reader.feed_data(command if isinstance(command, bytes) else raw(command) + b"\n")
        reader.feed_eof()
        await operator.run(self.envelope, reader, approved_config_sha256=self.config_pin,
                           source_owner_ack_sha256="0" * 64)


class OperatorLifecycleTests(unittest.IsolatedAsyncioTestCase):
    async def test_ready_and_abort_unused_never_open_source_window(self):
        f = TEST_ONLY_Lifecycle(self)
        with f.patches():
            await f.run([dict(action="ABORT_UNUSED")])
        self.assertIn("listener.READY", f.events)
        self.assertEqual([state for state, _ in f.records], ["READY_NO_OPEN", "UNUSED_ABORTED"])
        self.assertNotIn("OPEN", f.events)
        self.assertTrue(f.pool_closed)

    async def test_failed_ready_output_never_admits_assertion_or_open(self):
        f = TEST_ONLY_Lifecycle(self, fail_ready=True)
        with f.patches():
            await f.run([f.command])
        self.assertNotIn("prepare", f.events)
        self.assertNotIn("OPEN", f.events)
        self.assertTrue(f.pool_closed)
        self.assertEqual(f.records[-1][0], "REFUSED_BEFORE_OPEN")

    async def test_preopen_setup_failures_close_exact_unused_pool(self):
        for phase in ("candidate", "recovery", "tracker", "signal"):
            f = TEST_ONLY_Lifecycle(self, setup_failure=phase)
            with self.subTest(phase=phase), f.patches():
                try:
                    await f.run([f.command])
                except (ValueError, NotImplementedError):
                    pass
            self.assertTrue(f.pool_closed)
            self.assertNotIn("OPEN", f.events)
            self.assertNotIn("READY_NO_OPEN", [state for state, _ in f.records])
            if phase == "signal":
                self.assertEqual(f.events.count("signal.add"), 2)
                self.assertEqual(f.events.count("signal.remove"), 1)

    async def test_listener_not_serving_cannot_claim_ready_or_open(self):
        f = TEST_ONLY_Lifecycle(self, serving=False)
        with f.patches():
            await f.run([f.command])
        self.assertNotIn("OPEN", f.events)
        self.assertNotIn("READY_NO_OPEN", [state for state, _ in f.records])
        self.assertTrue(f.pool_closed)

    async def test_unused_cleanup_failure_retries_without_open(self):
        f = TEST_ONLY_Lifecycle(self, pool_close_failures=2)
        async def pause(*_):
            return None
        with f.patches(), patch.object(operator, "custody_backoff", side_effect=pause):
            await f.run([dict(action="ABORT_UNUSED"), dict(action="RETRY_LOCAL_CLEANUP")])
        self.assertNotIn("OPEN", f.events)
        self.assertTrue(f.pool_closed)
        self.assertEqual(f.events.count("pool.close"), 3)
        self.assertTrue(any(state == "UNUSED_LOCAL_CLEANUP_INCOMPLETE" for state, _ in f.records))
        self.assertIn(f.records[-1][0], {"UNUSED_ABORTED", "REFUSED_BEFORE_OPEN"})

    async def test_known_terminal_retirement_failure_keeps_attempt_for_retry(self):
        f = TEST_ONLY_Lifecycle(self, retire_failures=1)
        with f.patches():
            await f.run([f.command, dict(action="RETRY_RETIREMENT")])
        self.assertEqual(f.events.count("OPEN"), 1)
        self.assertEqual(f.events.count("RUN"), 1)
        self.assertEqual(f.events.count("RETIRE"), 2)
        self.assertEqual(f.records[-1][0], "RETIRED")
        self.assertTrue(any(state == "RETIREMENT_RETRY_REQUIRED" for state, _ in f.records))

    async def test_retired_role_local_cleanup_retry_never_runs_identity_again(self):
        f = TEST_ONLY_Lifecycle(self, owner_close_failures=1)
        with f.patches():
            await f.run([f.command, dict(action="RETRY_LOCAL_CLEANUP")])
        self.assertEqual(f.events.count("OPEN"), 1)
        self.assertEqual(f.events.count("RUN"), 1)
        self.assertEqual(f.events.count("RETIRE"), 1)
        self.assertEqual(f.events.count("owner.close"), 2)
        self.assertEqual(f.records[-1][0], "RETIRED")
        custody = [facts for state, facts in f.records if state == "CUSTODY_REQUIRED"]
        self.assertTrue(custody)
        self.assertFalse(custody[-1]["private_core_recovery_endpoint_retained"])

    async def test_repeated_cancellation_during_readback_backoff_keeps_original_custody(self):
        f = TEST_ONLY_Lifecycle(self, open_ambiguous=True)
        entered, resumed, stop = asyncio.Event(), asyncio.Event(), asyncio.Event()
        actual_backoff = operator.custody_backoff
        calls = []
        async def pause(_seconds=3):
            entered.set()
            await actual_backoff(0.05)
        async def action(_reader):
            calls.append("read")
            if len(calls) == 1:
                raise OSError("TEST_ONLY-control-read-error")
            resumed.set()
            await stop.wait()
            raise TEST_ONLY_CustodyStop()
        with f.patches(), patch.object(operator, "custody_backoff", side_effect=pause), \
             patch.object(operator, "next_custody_action", side_effect=action):
            task = asyncio.create_task(f.run([f.command]))
            try:
                await asyncio.wait_for(entered.wait(), 1)
                original = f.windows[0]
                task.cancel()
                await asyncio.sleep(0)
                task.cancel()
                await asyncio.wait_for(resumed.wait(), 1)
                self.assertFalse(task.done())
                self.assertIs(f.windows[0], original)
                self.assertFalse(original.prepared.finished)
                self.assertFalse(f.pool_closed)
                self.assertEqual(f.fd_closes, [])
                self.assertNotIn("RETIRE", f.events)
            finally:
                stop.set()
                outcomes = await asyncio.gather(task, return_exceptions=True)
                self.assertIsInstance(outcomes[0], TEST_ONLY_CustodyStop)

    async def test_wrong_proof_correlation_refuses_before_open(self):
        for wrong in (dict(wrong_lease=True), dict(wrong_expiry=True)):
            f = TEST_ONLY_Lifecycle(self, **wrong)
            with self.subTest(wrong=wrong), f.patches():
                await f.run([f.command])
            self.assertNotIn("OPEN", f.events)
            self.assertEqual(f.records[-1][0], "REFUSED_BEFORE_OPEN")

    async def test_ready_precedes_one_combined_open_run_budget_and_terminal_retire(self):
        f = TEST_ONLY_Lifecycle(self)
        with f.patches():
            await f.run([f.command])
        self.assertEqual(f.events.count("OPEN"), 1)
        self.assertEqual(f.events.count("RUN"), 1)
        self.assertLess(f.events.index("listener.READY"), f.events.index("OPEN"))
        self.assertEqual(f.events[f.events.index("OPEN") + 1], "RUN")
        self.assertEqual(f.records[-1][0], "RETIRED")
        self.assertTrue(f.pool_closed)

    async def test_run_cancellation_recovers_same_original_attempt_before_retire(self):
        f = TEST_ONLY_Lifecycle(self, run_error=True)
        with f.patches():
            await f.run([f.command])
        calls = [event for event in f.events if isinstance(event, tuple)]
        self.assertTrue(calls)
        self.assertTrue(all(event == ("RECOVER", id(f.windows[0].prepared.attempt)) for event in calls))
        self.assertEqual(f.events.count("OPEN"), 1)
        self.assertEqual(f.events.count("RUN"), 1)
        self.assertEqual(f.records[-1][1]["phase"], "ROLLED_BACK")
        self.assertNotIn("mapping", f.records[-1][1])

    async def test_unknown_recovers_after_malformed_command_without_second_open_or_run(self):
        f = TEST_ONLY_Lifecycle(self, run_error=True, recover_unknown=3)
        with f.patches():
            await f.run([f.command, b'{malformed}\n', dict(action="OPEN"),
                         dict(action="RECOVER_SAME_ATTEMPT")])
        self.assertEqual(f.events.count("OPEN"), 1)
        self.assertEqual(f.events.count("RUN"), 1)
        self.assertTrue(any(state == "CUSTODY_REQUIRED" for state, _ in f.records))
        self.assertEqual(f.records[-1][0], "RETIRED")
        calls = [event for event in f.events if isinstance(event, tuple)]
        self.assertEqual(len({event[1] for event in calls}), 1)

    async def test_ambiguous_open_retains_custody_and_never_fakes_terminal(self):
        f = TEST_ONLY_Lifecycle(self, open_ambiguous=True)
        stop = asyncio.Event()
        async def hold(_reader):
            await stop.wait()
            raise TEST_ONLY_CustodyStop()
        with f.patches(), patch.object(operator, "next_custody_action", side_effect=hold):
            task = asyncio.create_task(f.run([f.command]))
            try:
                await asyncio.wait_for(f.custody_reported.wait(), 1)
                self.assertFalse(task.done())
                self.assertNotIn("RUN", f.events)
                self.assertNotIn("RETIRE", f.events)
                self.assertFalse(f.pool_closed)
                self.assertFalse(f.windows[0].prepared.finished)
                self.assertEqual(f.records[-1][0], "OPERATOR_READBACK_REQUIRED")
                self.assertFalse(f.records[-1][1]["mapping_released"])
            finally:
                # Only disposable in-memory doubles: this is not permission to
                # kill a production custody process or close its actual pool.
                stop.set()
                outcomes = await asyncio.gather(task, return_exceptions=True)
                self.assertIsInstance(outcomes[0], TEST_ONLY_CustodyStop)


if __name__ == "__main__":
    unittest.main()
