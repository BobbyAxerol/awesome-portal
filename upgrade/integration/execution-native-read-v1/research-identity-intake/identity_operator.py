"""Private original08 operator adopted from Core's reviewed v2 proposal.

One genuine signed Paper identity request, official Edge ACL window, real Core
mTLS ENTER/RESOLVE/recovery. No identity listener, SQL user/grant seed, installer,
key/password generation or alternate authority. Main independently reviews and
supplies the pinned executable closure, private stdin and host reservation.

UNKNOWN is NOT teardown authority. The controller must retain this process and
its recovery socket/custody, or arrange a reviewed durable same-attempt handoff;
it must not use `timeout 300`/forced container removal as recovery. A <=300s
initial active budget is enforced. READY admits one JIT assertion or unused
abort; after RUN, input admits recovery only, never another OPEN/RUN.
SIGINT/SIGTERM requests custody, not a fabricated rollback. Lost stdin keeps the
official private Core recovery endpoint and bounded same-attempt readback alive.
Ambiguous ACL DDL still requires physical operator readback; this module never
sets SDK finished/state from a timeout or invents a DDL acknowledgement.
"""
from __future__ import annotations

import asyncio
import base64
import binascii
from contextlib import ExitStack
from datetime import datetime, timezone
from hashlib import sha256
import hmac
import importlib
import importlib.machinery
import importlib.util
import json
import logging
import os
from pathlib import Path
import re
import resource
import signal
import ssl
import stat
import sys
import time
from urllib.parse import unquote, urlsplit


ISSUER = "portal-control-api.native-manager-read"
SUBJECT = "usr_5a38d5dfb08b44748f5776fbe04a1434"
WORKSPACE = "ws_06G19F61YB8CFR7TEWMS7HQ660"
SYSTEM = "7674585245102796834"
ROLE = "ts_portal_research_identity"
INSTALLATION_PIN = "11b311b116263c9f13004eb07421c194819171938183555752d32ac2c889aca9"
RECEIPT_PIN = "dfe6994059e2c6b29780e28c1f18de32078227203a40d12e0e1e2487ca6bd500"
SQL_PIN = "305ba23619578935696bbcb6ce434b031746280101034f98accee9271d7ae370"
EDGE_PINS = {
    "identity_intake": "375b3305124113087b6d7231d8037274feda8c972f229141078d294b5dddfc27",
    "receipt_installation": "7d03ef66085446dee55637fabeb52ccb607897c88a7bc7ea85d2efc544cf4975",
    "identity_role_window": "5f1a0f293311f752d934de72666f8b2e9d671c899eec115d08d7ccd30265dec2",
}
HELPER_PIN = "89ed42edec78454142f8b1310e48d903b75fde9bdf667f8f8c0509359d30a707"
# One committed official helper. No historical/private repair import fallback.
EDGE_COMMIT = "6adc398b573e297b731863e5ed93f0f7f59ab2fd"
PM_PINS = {
    "services/portal_execution_owner/identity/human.py": "9c1f2929e09d65fac5fd65ade31c8fe1b6e874aa6190a2351255213570bb0932",
    "services/portal_execution_owner/identity/manager.py": "510f780020c1ea5cf4513ca723c433fea0fef1cc78971a8e81af0d392417bb7e",
    "services/portal_execution_owner/identity/users.py": "3662621feec536ce6f09886acc01c5c72199c0a6ad59d43acf852e080085a8e0",
    "services/portfolio_management/portal_human_candidate.py": "7352c1fb462d70731539f29e2ff1ae3f5cb2f8be95b5bb01a6da91e3d1be3418",
    "services/portfolio_management/portal_human_transport.py": "86f1911baffa719d344808c3d3f16c8adc18a896207d8313cca8faf233358888",
    "services/portfolio_management/portal_human_recovery.py": "972f172e72853fa871d83d68a4506061161f21f43f2b61a9b1693b4e08a9a88e",
    "services/portfolio_management/http_request_binding.py": "722fca48d9fcd838f61fa1b0664528cc7e634b8b260a09ea9b54523b832f3f22",
    "services/portfolio_management/native_fence.py": "ec7016f26ced2c2cba19e6c03b83ad70b2576d235078d64ccaa80beaaca87186",
    "services/portfolio_management/native_registry_catalogue.py": "2f3e4fb148ddc13f54006e3648718a8763c794e95f2475fe4d5c21bd01a27752",
    "services/portfolio_management/existing_identity_mapping.py": "dbe93c32f4db98432a4173abb870bc755b014a328354ce054b7f0bc7aafb20a0",
    "services/portfolio_management/__init__.py": "53c1012837d74fcc1dc479b6181da3acbcd5b2c71c4cdddeceec61963f816e0b",
    "services/portal_execution_owner/__init__.py": "6b08776bb2a25c856f424b348e21e1aeaf5c3cef5012fd64b50757520ad02d9b",
    "services/portal_execution_owner/identity/__init__.py": "bdbcd135596777825a8bf5726a12877f8e7f7690fc2d43f1b62f1cb028940461",
    "services/portal_execution_owner/identity/policy.py": "bafdd1bd87e0d04eca69ac7488b56ac486f24e4ac3aee0def2be9dcee1bf111a",
    "services/portal_execution_owner/query/__init__.py": "c0e0a6ecd6fa01d31a7126300fe3d30c4aafa99fa7a7a51b398229f69a570da0",
    "services/portal_execution_owner/query/adapter.py": "c5de4ad9fa72bcee4798fe0106917c0ae64b6725161c42a56bb160a9c63ba464",
    "services/portfolio_management/membership_contract.py": "4217d65f364186b45a83da49b76a3d05fadae2a7d05c66fcef5e947ad94328f6",
}
ARTIFACTS = frozenset({"installation", "candidate_sql", "human_jwks", "source_signing_key",
    "tls_ca", "client_cert", "client_key", "server_cert", "server_key", "trust_manifest",
    "core_handoff", "source_owner_ack"})
PRIVATE_ARTIFACTS = frozenset({"installation", "source_signing_key", "client_key", "server_key",
    "core_handoff", "source_owner_ack"})
CONFIG_KEYS = frozenset({"schema_version", "pm_source_root", "edge_source_root", "role_helper_root",
    "artifacts", "trust", "recovery", "window_start", "window_end", "active_budget_seconds",
    "minimum_enter_remaining_ms"})
TRUST_KEYS = frozenset({"human_audience", "human_key_id", "source_issuer", "source_audience",
    "source_key_id", "workload_id", "core_origin", "core_server_leaf_sha256", "core_client_leaf_sha256"})
PM_FILES = frozenset({"trust.json", "ca.pem", "tls.crt.pem", "tls.key.pem", "signer.pub.pem",
    "signer.key.pem", "peer-tls.crt.pem", "peer-signer.pub.pem", "human-jwks.json"})
PM_ARTIFACT_FILES = {"trust_manifest":"trust.json", "tls_ca":"ca.pem", "client_cert":"tls.crt.pem",
    "server_cert":"tls.crt.pem", "client_key":"tls.key.pem", "server_key":"tls.key.pem",
    "source_signing_key":"signer.key.pem", "human_jwks":"human-jwks.json"}
CORE_ORIGIN = "https://core.elp210.candidate.invalid:28444"
SOURCE_RECOVERY = "https://pm.elp210.candidate.invalid:28446"
RECOVERY_BIND = "10.70.0.2"
# One process-local availability bit, not a receipt, acknowledgement or new
# output sink. Lost controller stdout must never unwind a live custody scope.
_OUTPUT_AVAILABLE = True


class RunnerError(ValueError):
    pass


def require(ok, code):
    if not ok:
        raise RunnerError(code)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"),
        ensure_ascii=False, allow_nan=False).encode()


def decode(raw):
    def pairs(items):
        d = dict(items)
        require(len(d) == len(items), "INPUT_DUPLICATE_KEYS")
        return d
    try:
        return json.loads(raw, object_pairs_hook=pairs,
            parse_constant=lambda _: (_ for _ in ()).throw(RunnerError("INPUT_NONFINITE")))
    except (ValueError, TypeError, UnicodeError, RecursionError):
        raise RunnerError("INPUT_INVALID") from None


def emit(state, **facts):
    # Only explicit bounded record-free facts; never serialize an exception or
    # the configuration, token, password, DSN, signing key or complete attempt.
    # Transport/serialization failures are deliberately non-throwing, including
    # when called from the loop's exception callback. Once an OPEN may have
    # started, propagating a BrokenPipeError would drop live ExitStack custody.
    global _OUTPUT_AVAILABLE
    if not _OUTPUT_AVAILABLE:
        return False
    try:
        raw = canonical({"schema_version": "portal.research-identity-operator-result.v2",
            "state": state, **facts})
        require(len(raw) <= 8192, "RESULT_LIMIT")
        sys.stdout.buffer.write(raw + b"\n")
        sys.stdout.buffer.flush()
        return True
    except Exception:
        _OUTPUT_AVAILABLE = False
        return False


def open_reference(ref, *, private, maximum=131072):
    require(type(ref) is dict and set(ref) == {"path", "sha256"}
        and type(ref["path"]) is str and Path(ref["path"]).is_absolute()
        and type(ref["sha256"]) is str and re.fullmatch("[a-f0-9]{64}", ref["sha256"]),
        "REFERENCE_INVALID")
    fd = os.open(ref["path"], os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        meta = os.fstat(fd)
        require(stat.S_ISREG(meta.st_mode) and meta.st_nlink == 1
            and 0 < meta.st_size <= maximum and not meta.st_mode & 0o022
            and meta.st_uid in ({os.geteuid()} if private else {0, os.geteuid()})
            and (not private or stat.S_IMODE(meta.st_mode) in (0o400, 0o600)),
            "REFERENCE_PROTECTION_INVALID")
        raw = os.read(fd, maximum + 1)
        require(len(raw) == meta.st_size and sha256(raw).hexdigest() == ref["sha256"],
            "REFERENCE_PIN_CHANGED")
        os.lseek(fd, 0, os.SEEK_SET)
        return fd, raw
    except BaseException:
        os.close(fd)
        raise


def source_bytes(path, expected):
    # Source is public reviewed executable data, never credential material.
    fd, raw = open_reference({"path": str(path), "sha256": expected}, private=False, maximum=262144)
    os.close(fd)
    return raw


def load_closure(config):
    """Verify the complete frozen Python closure BEFORE executing its packages."""
    pm, edge, helper = (Path(config[k]) for k in (
        "pm_source_root", "edge_source_root", "role_helper_root"))
    require(sys.flags.isolated == 1 and sys.dont_write_bytecode,
        "SOURCE_ISOLATED_NO_BYTECODE_REQUIRED")
    require(all(p.is_absolute() and p.resolve() == p for p in (pm, edge, helper)), "SOURCE_ROOT_REQUIRED")
    require(not any(name == "services" or name.startswith("services.") for name in sys.modules),
        "SOURCE_NAMESPACE_ALREADY_IMPORTED")
    services_root = pm / "services"
    require(services_root.is_dir() and services_root.resolve() == services_root
        and not (services_root / "__init__.py").exists()
        and not (services_root / "__init__.py").is_symlink(), "SOURCE_NAMESPACE_CHANGED")
    for relative, pin in PM_PINS.items():
        path = pm / relative
        require(path.resolve() == path, "SOURCE_PATH_CHANGED")
        source_bytes(path, pin)
    for name, pin in EDGE_PINS.items():
        path = edge / (name + ".py")
        require(path.resolve() == path, "SOURCE_PATH_CHANGED")
        source_bytes(path, pin)
    source_bytes(helper / "role_credentials.py", HELPER_PIN)
    # A fixed namespace executes no ambient services/__init__.py and cannot
    # extend itself through another sys.path entry. All 17 files are pinned
    # before even a selected package initializer or sibling module can run.
    namespace_spec = importlib.machinery.ModuleSpec("services", loader=None, is_package=True)
    namespace_spec.submodule_search_locations = [str(services_root)]
    namespace = importlib.util.module_from_spec(namespace_spec)
    namespace.__path__ = [str(services_root)]
    sys.modules["services"] = namespace
    for name, path in (("role_credentials", helper / "role_credentials.py"),
        *((name, edge / (name + ".py")) for name in EDGE_PINS)):
        require(name not in sys.modules, "SOURCE_ALREADY_IMPORTED")
        spec = importlib.util.spec_from_file_location(name, path)
        require(spec is not None and spec.loader is not None, "SOURCE_LOAD_FAILED")
        module = importlib.util.module_from_spec(spec)
        sys.modules[name] = module
        spec.loader.exec_module(module)
    for relative, pin in PM_PINS.items():
        name = relative[:-3].replace("/", ".")
        if name.endswith(".__init__"):
            name = name[:-9]  # Packages are not duplicate package.__init__ modules.
        module = importlib.import_module(name)
        filename = getattr(module, "__file__", None)
        require(type(filename) is str and Path(filename).resolve() == pm / relative,
            "SOURCE_ORIGIN_CHANGED")
        source_bytes(Path(filename), pin)
    require(sys.modules.get("services") is namespace
        and list(namespace.__path__) == [str(services_root)], "SOURCE_NAMESPACE_CHANGED")
    return (sys.modules["receipt_installation"], sys.modules["identity_intake"],
        sys.modules["identity_role_window"])


def bounded_controller():
    # Controller still owns the actual shared-host reservation. These observed
    # cgroup bounds prevent this private runner silently running on an uncapped
    # host; they are not fabricated production capacity or coexistence proof.
    try:
        quota, period = Path("/sys/fs/cgroup/cpu.max").read_text().split()
        memory = Path("/sys/fs/cgroup/memory.max").read_text().strip()
        pids = Path("/sys/fs/cgroup/pids.max").read_text().strip()
        require(quota != "max" and 0 < int(quota) <= 2 * int(period)
            and 0 < int(memory) <= 1536 * 1024**2 and 0 < int(pids) <= 128,
            "CONTROLLER_CAPS_REQUIRED")
    except (OSError, ValueError):
        raise RunnerError("CONTROLLER_CAPS_REQUIRED") from None


def selected_dsns(owner, identity, password):
    values = []
    for raw, user in ((owner, "bobby"), (identity, ROLE)):
        require(type(raw) is str and 0 < len(raw) <= 8192 and not any(c.isspace() for c in raw),
            "PRIVATE_DSN_REQUIRED")
        p = urlsplit(raw)
        require(p.scheme in {"postgres", "postgresql"} and p.hostname and p.port
            and unquote(p.username or "") == user and p.path == "/live_data_executor"
            and not p.fragment and not p.query, "PRIVATE_DSN_SCOPE_REJECTED")
        values.append(p)
    require((values[0].hostname, values[0].port) == (values[1].hostname, values[1].port)
        and hmac.compare_digest(unquote(values[1].password or ""), password),
        "IDENTITY_DSN_BINDING_REJECTED")


def ssl_contexts(fds, raws):
    client = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    server = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    for context in (client, server):
        context.minimum_version = context.maximum_version = ssl.TLSVersion.TLSv1_3
        context.verify_mode = ssl.CERT_REQUIRED
        context.load_verify_locations(cadata=raws["tls_ca"].decode("ascii"))
    client.check_hostname = True
    # Use already verified owned descriptors; do not re-open mutable path refs.
    client.load_cert_chain("/proc/self/fd/" + str(fds["client_cert"]),
        "/proc/self/fd/" + str(fds["client_key"]))
    server.load_cert_chain("/proc/self/fd/" + str(fds["server_cert"]),
        "/proc/self/fd/" + str(fds["server_key"]))
    return client, server


async def private_input():
    reader = asyncio.StreamReader(limit=262144)
    protocol = asyncio.StreamReaderProtocol(reader)
    transport, _ = await asyncio.get_running_loop().connect_read_pipe(lambda: protocol, sys.stdin.buffer)
    raw = await reader.readline()
    require(raw.endswith(b"\n") and len(raw) <= 262144, "INPUT_LIMIT")
    return reader, transport, decode(raw)


def exact(value, keys):
    return type(value) is dict and set(value) == set(keys)


def hex_pin(value):
    return type(value) is str and re.fullmatch(r"[a-f0-9]{64}", value) is not None


def prefixed(value):
    require(hex_pin(value), "TRUST_LEAF_PIN_INVALID")
    return "sha256:" + value


def scope_digest(config):
    # ACK cannot include its own hash recursively. Its independently supplied
    # CLI pin authenticates selection, not a claim that this process authored it.
    scope = dict(config, artifacts={k:v for k,v in config["artifacts"].items()
        if k != "source_owner_ack"})
    return sha256(canonical(scope)).hexdigest()


def validate_intake(config, raws, *, source_owner_ack_sha256, now_ms, end_ms):
    """Consume owner returns as pinned INPUT, never manufacture owner acceptance.

    These private v2 input schemas require owner/main review before adoption.
    File syntax/hash equality is not independent verification of a deployment.
    The source owner selects its ACK pin separately from the transfer/config.
    """
    require(hex_pin(source_owner_ack_sha256) and
        sha256(raws["source_owner_ack"]).hexdigest() == source_owner_ack_sha256,
        "SOURCE_OWNER_ACK_PIN_REQUIRED")
    t = config["trust"]
    manifest = decode(raws["trust_manifest"])
    require(exact(manifest, {"schema_version","qualification","candidate_id","workspace_id","environment",
        "created_at_ms","expires_at_ms","core","pm","ca_certificate_sha256","authority"})
        and manifest["schema_version"] == "elp210.candidate-trust.v1"
        and manifest["qualification"] == "CANDIDATE_ONLY_NOT_BUSINESS_AUTHORITY"
        and type(manifest["candidate_id"]) is str
        and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}",manifest["candidate_id"])
        and manifest["workspace_id"] == WORKSPACE and manifest["environment"] == "paper"
        and type(manifest["created_at_ms"]) is int and type(manifest["expires_at_ms"]) is int
        and manifest["created_at_ms"] <= now_ms < end_ms <= manifest["expires_at_ms"]
        and exact(manifest["authority"], {"mapping","grants","application_policy","field_policy",
            "business_reads","commands","live"})
        and all(manifest["authority"][k] == "NOT_INSTALLED" for k in
            ("mapping","grants","application_policy","field_policy"))
        and all(manifest["authority"][k] is False for k in ("business_reads","commands","live")),
        "PM_TRUST_MANIFEST_SCOPE_INVALID")
    core, pm = manifest["core"], manifest["pm"]
    require(exact(core,{"issuer","audience","key_id","hostname","certificate_sha256","signer_spki_sha256"})
        and exact(pm,{"issuer","audience","key_id","hostname","certificate_sha256","signer_spki_sha256","workload_id"})
        and core["hostname"] == "core.elp210.candidate.invalid"
        and pm["hostname"] == "pm.elp210.candidate.invalid"
        and t["human_audience"] == t["source_issuer"] == pm["issuer"]
        and t["human_key_id"] == core["key_id"] and t["source_audience"] == ISSUER
        and t["source_key_id"] == pm["key_id"] and t["workload_id"] == pm["workload_id"]
        and t["core_origin"] == CORE_ORIGIN
        and prefixed(t["core_server_leaf_sha256"]) == core["certificate_sha256"]
        and prefixed(t["core_client_leaf_sha256"]) == core["certificate_sha256"],
        "PM_TRUST_BINDING_INVALID")
    # Consume the already-reviewed transfer operator's actual output, not a new
    # receipt format manufactured by this operator. This remains pinned owner
    # INPUT: source acceptance and operational settlement are separate facts.
    handoff = decode(raws["core_handoff"])
    require(exact(handoff,{"schema_version","authority","source_commit","runtime",
        "core_installation_receipt_sha256","migration_receipt_sha256","schema_receipt_sha256",
        "trust","trust_manifest_sha256","research_subject","workspace_id","environment",
        "source_database_system_identifier","source_role","core_reverse_origin",
        "source_recovery_origin","source_limits","pm_files"})
        and handoff["schema_version"] == "portal.research-core-owner-return.v1"
        and handoff["authority"] == "TRANSFER_ONLY_SOURCE_OWNER_ACK_REQUIRED_BEFORE_OPEN"
        and handoff["trust"] == manifest
        and handoff["trust_manifest_sha256"] == sha256(raws["trust_manifest"]).hexdigest()
        and handoff["research_subject"] == SUBJECT and handoff["workspace_id"] == WORKSPACE
        and handoff["environment"] == "paper" and handoff["source_database_system_identifier"] == SYSTEM
        and handoff["source_role"] == ROLE and handoff["core_reverse_origin"] == CORE_ORIGIN
        and handoff["source_recovery_origin"] == SOURCE_RECOVERY
        and handoff["source_limits"] == {"cpu":2,"memory_mib":1536,"initial_active_seconds":300}
        and type(handoff["source_commit"]) is str and re.fullmatch(r"[a-f0-9]{40}",handoff["source_commit"])
        and all(hex_pin(handoff[k]) for k in ("core_installation_receipt_sha256",
            "migration_receipt_sha256","schema_receipt_sha256")),
        "ACTUAL_TRANSFER_OWNER_RETURN_REQUIRED")
    runtime = handoff["runtime"]
    require(exact(runtime,{"id","image","running","config_sha256","effective_config_sha256",
        "actual_config_mount_environment_network_port_match"})
        and hex_pin(runtime["id"]) and type(runtime["image"]) is str
        and re.fullmatch(r"sha256:[a-f0-9]{64}",runtime["image"])
        and runtime["running"] is True and hex_pin(runtime["config_sha256"])
        and hex_pin(runtime["effective_config_sha256"])
        and runtime["actual_config_mount_environment_network_port_match"] is True,
        "ACTUAL_CORE_INSTALLATION_METADATA_REQUIRED")
    require(type(handoff["pm_files"]) is list and len(handoff["pm_files"]) == 9
        and all(exact(ref,{"name","sha256"}) and type(ref["name"]) is str
            and ref["name"] in PM_FILES and hex_pin(ref["sha256"]) for ref in handoff["pm_files"]),
        "PM_ONLY_TRANSFER_MANIFEST_REQUIRED")
    files = {ref["name"]:ref["sha256"] for ref in handoff["pm_files"]}
    require(set(files) == PM_FILES, "PM_ONLY_TRANSFER_MEMBERS_CHANGED")
    directory = Path(config["artifacts"]["trust_manifest"]["path"]).parent
    meta = directory.lstat()
    require(directory.is_absolute() and directory.resolve() == directory and stat.S_ISDIR(meta.st_mode)
        and meta.st_uid == os.geteuid() and not meta.st_mode & 0o077,
        "PM_ONLY_TRANSFER_DIRECTORY_REQUIRED")
    require(Path(config["artifacts"]["core_handoff"]["path"]) == directory/"core-installation-handoff.json"
        and directory == Path("/home/bobby/secure/portal-core-c7-return-20261019-"+handoff["source_commit"][:12]),
        "ACTUAL_CORE_TRANSFER_DESTINATION_REQUIRED")
    for name, pin in files.items():
        fd, _value = open_reference({"path":str(directory/name),"sha256":pin},
            private=name.endswith(".key.pem"))
        os.close(fd)
    for artifact, name in PM_ARTIFACT_FILES.items():
        require(Path(config["artifacts"][artifact]["path"]) == directory/name
            and config["artifacts"][artifact]["sha256"] == files[name],
            "PM_ONLY_TRANSFER_REFERENCE_CHANGED")
    ack = decode(raws["source_owner_ack"])
    require(exact(ack,{"schema_version","operator_ref","acknowledged_at_ms","expires_at_ms",
        "configuration_binding_sha256","core_handoff_sha256",
        "source_database","source_system_identifier","source_role","helper_sha256","acknowledgement",
        "commands","live"})
        and ack["schema_version"] == "portal.research-source-owner-intake-ack.v1"
        and type(ack["operator_ref"]) is str and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}",ack["operator_ref"])
        and type(ack["acknowledged_at_ms"]) is int and type(ack["expires_at_ms"]) is int
        and 0 < ack["acknowledged_at_ms"] <= now_ms < ack["expires_at_ms"] == end_ms
        and ack["configuration_binding_sha256"] == scope_digest(config)
        and ack["core_handoff_sha256"] == sha256(raws["core_handoff"]).hexdigest()
        and ack["source_database"] == "live_data_executor" and ack["source_system_identifier"] == SYSTEM
        and ack["source_role"] == ROLE and ack["helper_sha256"] == EDGE_PINS["identity_role_window"]
        and ack["acknowledgement"] == "REVIEWED_INTAKE_AND_FINITE_WINDOW_ONLY"
        and ack["commands"] is False and ack["live"] is False,
        "INDEPENDENT_SOURCE_OWNER_ACK_REQUIRED")
    return manifest


def verify_crypto_binding(manifest, raws, *, transfer_directory):
    """Offline verification only; no fixture keys or live authority invented."""
    from cryptography import x509
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
    from cryptography.x509.oid import ExtendedKeyUsageOID
    ca = x509.load_pem_x509_certificate(raws["tls_ca"])
    client = x509.load_pem_x509_certificate(raws["client_cert"])
    server = x509.load_pem_x509_certificate(raws["server_cert"])
    key = serialization.load_pem_private_key(raws["source_signing_key"],password=None)
    require(isinstance(key,Ed25519PrivateKey) and isinstance(ca.public_key(),Ed25519PublicKey)
        and ca.extensions.get_extension_for_class(x509.BasicConstraints).value.ca,
        "PM_CA_OR_SIGNER_REQUIRED")
    ca.public_key().verify(ca.signature,ca.tbs_certificate_bytes)
    der = lambda value:value.public_bytes(serialization.Encoding.DER)
    spki = lambda value:value.public_bytes(serialization.Encoding.DER,serialization.PublicFormat.SubjectPublicKeyInfo)
    require("sha256:"+sha256(der(ca)).hexdigest() == manifest["ca_certificate_sha256"]
        and "sha256:"+sha256(spki(key.public_key())).hexdigest() == manifest["pm"]["signer_spki_sha256"]
        and ca.not_valid_before.replace(tzinfo=timezone.utc).timestamp()*1000 <= time.time()*1000
        and ca.not_valid_after.replace(tzinfo=timezone.utc).timestamp()*1000 >= manifest["expires_at_ms"],
        "PM_CRYPTO_DIGEST_MISMATCH")
    for cert in (client,server):
        require(cert.issuer == ca.subject and not cert.extensions.get_extension_for_class(x509.BasicConstraints).value.ca,
            "PM_LEAF_ISSUER_INVALID")
        ca.public_key().verify(cert.signature,cert.tbs_certificate_bytes)
        eku = cert.extensions.get_extension_for_class(x509.ExtendedKeyUsage).value
        require(ExtendedKeyUsageOID.CLIENT_AUTH in eku and ExtendedKeyUsageOID.SERVER_AUTH in eku
            and manifest["pm"]["hostname"] in cert.extensions.get_extension_for_class(x509.SubjectAlternativeName).value.get_values_for_type(x509.DNSName)
            and cert.not_valid_before.replace(tzinfo=timezone.utc).timestamp()*1000 <= time.time()*1000
            and cert.not_valid_after.replace(tzinfo=timezone.utc).timestamp()*1000 >= manifest["expires_at_ms"]
            and "sha256:"+sha256(der(cert)).hexdigest() == manifest["pm"]["certificate_sha256"],
            "PM_LEAF_BINDING_INVALID")
    for name in ("client_key","server_key"):
        tls_key = serialization.load_pem_private_key(raws[name],password=None)
        require(isinstance(tls_key,Ed25519PrivateKey) and spki(tls_key.public_key()) == spki(client.public_key()),
            "PM_TLS_KEY_MISMATCH")
    jwks = decode(raws["human_jwks"])
    require(exact(jwks,{"keys"}) and type(jwks["keys"]) is list and len(jwks["keys"]) == 1,
        "CORE_HUMAN_JWKS_REQUIRED")
    jwk = jwks["keys"][0]
    require(type(jwk) is dict and set(jwk) <= {"kty","crv","x","kid","alg","use"}
        and {"kty","crv","x","kid"} <= set(jwk) and jwk["kty"] == "OKP" and jwk["crv"] == "Ed25519"
        and jwk["kid"] == manifest["core"]["key_id"] and type(jwk["x"]) is str
        and re.fullmatch(r"[A-Za-z0-9_-]{43}",jwk["x"]), "CORE_HUMAN_JWKS_INVALID")
    pub = Ed25519PublicKey.from_public_bytes(base64.urlsafe_b64decode(jwk["x"]+"="))
    require("sha256:"+sha256(spki(pub)).hexdigest() == manifest["core"]["signer_spki_sha256"],
        "CORE_HUMAN_JWKS_PIN_MISMATCH")
    # Check PM-only public peer material too; possessing transferred bytes is
    # neither a claim that Core is installed nor an independent owner ACK.
    directory = Path(transfer_directory)
    files = {ref["name"]:ref["sha256"] for ref in decode(raws["core_handoff"])["pm_files"]}
    peer = {}
    for name in ("peer-tls.crt.pem","peer-signer.pub.pem","signer.pub.pem"):
        fd,value = open_reference({"path":str(directory/name),
            "sha256":files[name]},private=False)
        try:
            peer[name] = value
        finally:
            os.close(fd)
    core_cert = x509.load_pem_x509_certificate(peer["peer-tls.crt.pem"])
    core_signer = serialization.load_pem_public_key(peer["peer-signer.pub.pem"])
    pm_signer = serialization.load_pem_public_key(peer["signer.pub.pem"])
    require(core_cert.issuer == ca.subject and isinstance(core_cert.public_key(),Ed25519PublicKey)
        and not core_cert.extensions.get_extension_for_class(x509.BasicConstraints).value.ca,
        "CORE_LEAF_ISSUER_INVALID")
    ca.public_key().verify(core_cert.signature,core_cert.tbs_certificate_bytes)
    core_eku = core_cert.extensions.get_extension_for_class(x509.ExtendedKeyUsage).value
    require(ExtendedKeyUsageOID.CLIENT_AUTH in core_eku and ExtendedKeyUsageOID.SERVER_AUTH in core_eku
        and manifest["core"]["hostname"] in core_cert.extensions.get_extension_for_class(x509.SubjectAlternativeName).value.get_values_for_type(x509.DNSName)
        and core_cert.not_valid_before.replace(tzinfo=timezone.utc).timestamp()*1000 <= time.time()*1000
        and core_cert.not_valid_after.replace(tzinfo=timezone.utc).timestamp()*1000 >= manifest["expires_at_ms"]
        and "sha256:"+sha256(der(core_cert)).hexdigest() == manifest["core"]["certificate_sha256"]
        and isinstance(core_signer,Ed25519PublicKey) and spki(core_signer) == spki(pub)
        and isinstance(pm_signer,Ed25519PublicKey) and spki(pm_signer) == spki(key.public_key())
        and len({spki(ca.public_key()),spki(client.public_key()),spki(core_cert.public_key()),
            spki(core_signer),spki(pm_signer)}) == 5,
        "PM_ONLY_PUBLIC_PEER_BINDING_INVALID")
    return key


async def next_private_command(reader, *, maximum=32768):
    raw = await reader.readline()
    require(raw.endswith(b"\n") and 0 < len(raw) <= maximum, "PRIVATE_COMMAND_INVALID")
    return decode(raw)


def jit_assertion(command):
    require(exact(command,{"action","proof"}) and command["action"] == "ASSERTION"
        and exact(command["proof"],{"state","human_token","raw_request_base64","lease_id","expires_at_ms"}),
        "JIT_ASSERTION_REQUIRED")
    proof = command["proof"]
    require(proof["state"] == "ISSUED" and type(proof["human_token"]) is str
        and 0 < len(proof["human_token"].encode()) <= 8192
        and type(proof["lease_id"]) is str and 0 < len(proof["lease_id"]) <= 128
        and type(proof["expires_at_ms"]) is int and proof["expires_at_ms"] > int(time.time()*1000)
        and type(proof["raw_request_base64"]) is str and 0 < len(proof["raw_request_base64"]) <= 5464,
        "JIT_ASSERTION_INVALID")
    try:
        raw = base64.b64decode(proof["raw_request_base64"],validate=True)
    except (ValueError,binascii.Error):
        raise RunnerError("JIT_ASSERTION_BYTES_INVALID") from None
    require(0 < len(raw) <= 4096 and base64.b64encode(raw).decode("ascii") == proof["raw_request_base64"],
        "JIT_ASSERTION_BYTES_INVALID")
    return proof,raw


async def custody_backoff(seconds=3):
    """Retain live custody through repeated cancellation in this SAME task."""
    until = time.monotonic() + seconds
    while True:
        remaining = until - time.monotonic()
        if remaining <= 0:
            return
        try:
            await asyncio.sleep(remaining)
            return
        except asyncio.CancelledError:
            continue


async def close_listener(server, deadline):
    """Bound local shutdown, never abort clients or infer a source outcome."""
    if server is None:
        return
    server.close()
    async with deadline(10):
        await server.wait_closed()


def listener_is_serving(server):
    """A retained Server object is not evidence of a listening endpoint."""
    if server is None:
        return False
    try:
        value = server.is_serving()
    except Exception:
        return False
    return type(value) is bool and value


def server_transport_count(server):
    """Read-only CPython asyncio compatibility guard, not source authority.

    The installed Python3.10 Server counts every attached TCP transport,
    including TLS handshakes before a stream handler exists. Its selector
    transport closes the socket BEFORE Server._detach decrements this count.
    Missing/changed introspection fails closed; an elapsed handshake deadline
    or wait_closed() alone is never proof of physical connection cleanup.
    """
    try:
        count = server._active_count
    except Exception:
        raise RunnerError("RECOVERY_SERVER_TRANSPORT_STATE_UNAVAILABLE") from None
    require(type(count) is int and count >= 0,
        "RECOVERY_SERVER_TRANSPORT_STATE_UNAVAILABLE")
    return count


async def open_and_run(window, owner, password):
    """One admitted SAME-task critical pair, without an intervening budget gate.

    A cancellation delivered inside OPEN remains OPEN_UNCONFIRMED. After OPEN
    returns, RUN records its genuine recovery state before its first suspension.
    Never start a second RUN or manufacture a pre-ENTER failure/finished flag.
    """
    await window.open(owner, password)
    return await window.run()


async def optional_mapping_observation(observer, *, human_issuer, subject):
    """Terminal metadata only; its failure cannot strand physical retirement."""
    try:
        return await observer.lookup(human_issuer=human_issuer, subject=subject)
    except (Exception, asyncio.CancelledError):
        emit("MAPPING_OBSERVATION_UNAVAILABLE", details_suppressed=True,
            business_authority_granted=False)
        return None


class RecoveryHandlers:
    """Own the original pinned handler's lifetime, including writer shutdown.

    This is bookkeeping around the official SDK handler, not another wire/auth
    implementation. Reject new admission while physical retirement owns its
    pool; retain both socket and original handlers on uncertain drain/retire.
    """
    def __init__(self, recovery, deadline):
        self.recovery, self.deadline = recovery, deadline
        self.accepting, self.tasks, self.sockets = True, set(), []
        self.original_handler = recovery._handle
        recovery._handle = self.handle

    def prune_closed_sockets(self):
        retained = []
        for sock in self.sockets:
            try:
                descriptor = sock.fileno()
            except Exception:
                raise RunnerError("RECOVERY_SOCKET_STATE_UNAVAILABLE") from None
            require(type(descriptor) is int and descriptor >= -1,
                "RECOVERY_SOCKET_STATE_UNAVAILABLE")
            if descriptor != -1:
                retained.append(sock)
        self.sockets = retained

    async def handle(self, reader, writer):
        task = asyncio.current_task()
        self.tasks.add(task)
        try:
            # Retain the ORIGINAL underlying socket before the SDK starts. A
            # returned handler (whose bounded writer close can time out) is not
            # evidence that its physical transport has actually released it.
            try:
                sock = writer.get_extra_info("socket")
            except Exception:
                sock = None
            self.sockets.append(sock)
            if self.accepting and sock is not None:
                await self.original_handler(reader, writer)
            else:
                writer.close()
                async with self.deadline(3):
                    await writer.wait_closed()
        finally:
            self.tasks.discard(task)
            self.prune_closed_sockets()

    async def drain(self, *, server=None):
        async with self.deadline(10):
            while True:
                self.prune_closed_sockets()
                active = self.recovery.active
                require(type(active) is int and active >= 0,
                    "RECOVERY_ACTIVE_STATE_UNAVAILABLE")
                attached = 0 if server is None else server_transport_count(server)
                if not self.tasks and active == 0 and not self.sockets and attached == 0:
                    return
                await asyncio.sleep(0.05)


async def next_custody_action(reader):
    """Only recovery/cleanup/status after admission; EOF is not terminal proof.

    Reader timeout/EOF permits a bounded fresh SAME-attempt recovery readback.
    The genuine Core mTLS recovery endpoint remains the independent ownership
    channel. No command can supply a proof, change an attempt or authorize DDL.
    """
    try:
        line = await asyncio.wait_for(reader.readline(), 3)
    except asyncio.TimeoutError:
        return "RECOVER_SAME_ATTEMPT"
    if not line:
        await custody_backoff()
        return "RECOVER_SAME_ATTEMPT"
    try:
        require(len(line) <= 32768 and line.endswith(b"\n"),
            "RECOVERY_OPERATOR_INPUT_INVALID")
        command = decode(line)
        require(exact(command, {"action"}) and command["action"] in {
            "RECOVER_SAME_ATTEMPT", "RETRY_RETIREMENT", "RETRY_LOCAL_CLEANUP", "STATUS"},
            "RECOVERY_OPERATOR_ACTION_REFUSED")
        return command["action"]
    except Exception:
        emit("RECOVERY_OPERATOR_ACTION_REFUSED", details_suppressed=True,
            forced_teardown_allowed=False, mapping_released=False)
        return "STATUS"


async def retain_physical_readback(reader, window, *, operator_config_sha256, handlers, server=None):
    """Keep live custody after ambiguous DDL; never retry or fake its outcome.

    A private STATUS command stays usable. On stdin EOF, the already-bound Core
    source recovery endpoint and selected owner DB/readback custody remain;
    operators reconcile exact physical role/receipt/ACL metadata out-of-band.
    This function deliberately cannot accept caller-authored settlement JSON.
    """
    def notice():
        emit("OPERATOR_READBACK_REQUIRED", window_state=window.state,
            operator_config_sha256=operator_config_sha256,
            lease_id=window.prepared.attempt.lease_id,
            attempt_id=window.prepared.attempt.attempt_id,
            binding_digest=window.prepared.attempt.binding_digest,
            recovery_handlers=len(handlers.tasks),
            private_core_recovery_endpoint_retained=listener_is_serving(server),
            recovery_custody_retained=True,
            next_action="PHYSICAL_SOURCE_ROLE_RECEIPT_ACL_READBACK_REQUIRED_NO_DDL_RETRY",
            mapping_released=False, forced_teardown_allowed=False)
    notice()
    while True:
        try:
            action = await next_custody_action(reader)
        except (Exception, asyncio.CancelledError):
            # A controller transport failure does not release this live scope.
            await custody_backoff()
            continue
        if action == "STATUS":
            notice()
        # Even a fresh recovery/retirement command is not physical DDL readback.
        # Preserve the original object graph; no automatic OPEN/RETIRE retry.


async def run(envelope, reader, *, approved_config_sha256, source_owner_ack_sha256):
    require(exact(envelope, {"config","owner_dsn","identity_dsn","identity_password"}), "INPUT_INVALID")
    c = envelope["config"]
    require(exact(c,CONFIG_KEYS) and c["schema_version"] == "portal.research-identity-operator-config.v2"
        and sha256(canonical(c)).hexdigest() == approved_config_sha256, "UNAPPROVED_OPERATOR_CONFIG")
    require(exact(c["trust"],TRUST_KEYS) and exact(c["artifacts"],ARTIFACTS)
        and exact(c["recovery"],{"host","port"})
        and c["recovery"]["host"] == RECOVERY_BIND and type(c["recovery"]["port"]) is int
        and c["recovery"]["port"] == 28446
        and type(c["active_budget_seconds"]) is int and 30 <= c["active_budget_seconds"] <= 300
        and type(c["minimum_enter_remaining_ms"]) is int and 1000 <= c["minimum_enter_remaining_ms"] <= 10000,
        "CONFIG_SHAPE_INVALID")
    start,end = (datetime.fromisoformat(c[k]) for k in ("window_start","window_end"))
    require(all(x.tzinfo is not None for x in (start,end)) and 0 < (end-start).total_seconds() <= 300
        and start <= datetime.now(timezone.utc) < end, "OPERATOR_WINDOW_CLOSED")
    require(type(envelope["identity_password"]) is str and 0 < len(envelope["identity_password"].encode()) <= 8192,
        "PRIVATE_INPUT_INVALID")
    selected_dsns(envelope["owner_dsn"],envelope["identity_dsn"],envelope["identity_password"])
    bounded_controller()
    prep_module,intake_module,window_module = load_closure(c)
    import asyncpg
    from services.portal_execution_owner.identity.human import HumanTrustPolicy,HumanVerifier
    from services.portfolio_management.portal_human_candidate import PortalHumanCandidate,SourceConfig,_deadline
    from services.portfolio_management.portal_human_transport import PortalHumanHttpClient
    from services.portfolio_management.portal_human_recovery import PortalHumanRecoveryServer
    from services.portfolio_management.native_fence import source_fingerprint
    from services.portfolio_management.existing_identity_mapping import ExistingIdentityMappingSource

    with ExitStack() as stack:
        fds,raws = {},{}
        for name in ARTIFACTS:
            fds[name],raws[name] = open_reference(c["artifacts"][name],private=name in PRIVATE_ARTIFACTS)
            stack.callback(os.close,fds[name])
        require(sha256(raws["installation"]).hexdigest() == INSTALLATION_PIN
            and sha256(raws["candidate_sql"]).hexdigest() == SQL_PIN, "INSTALLATION_BYTES_CHANGED")
        original = decode(raws["installation"])
        require(original.get("schema_version") == "pma.native-business-read.installation.v1"
            and "registry" not in original and original["target"]["database"] == "live_data_executor"
            and original["target"]["system_identifier"] == SYSTEM
            and original["target"]["schema_login"] == original["target"]["schema_role"] == "bobby",
            "ORIGINAL_INSTALLATION_TARGET_CHANGED")
        manifest = validate_intake(c,raws,source_owner_ack_sha256=source_owner_ack_sha256,
            now_ms=int(time.time()*1000),end_ms=int(end.timestamp()*1000))
        source_key = verify_crypto_binding(manifest,raws,
            transfer_directory=Path(c["artifacts"]["trust_manifest"]["path"]).parent)
        client_tls,server_tls = ssl_contexts(fds,raws)
        t = c["trust"]
        verifier = HumanVerifier([HumanTrustPolicy(issuer=ISSUER,audience=t["human_audience"],
            environment="paper",workspace_id=WORKSPACE,key_id=t["human_key_id"],
            public_jwks=decode(raws["human_jwks"]),maximum_lifetime_seconds=60)])
        client = PortalHumanHttpClient(origin=t["core_origin"],ssl_context=client_tls,
            server_fingerprint_sha256=t["core_server_leaf_sha256"],timeout_seconds=3)
        source_config = SourceConfig(issuer=t["source_issuer"],audience=t["source_audience"],
            key_id=t["source_key_id"],workload_id=t["workload_id"],private_key=source_key,
            network_timeout_seconds=3,pool_timeout_seconds=2,database_timeout_seconds=3,
            lock_timeout_ms=500,statement_timeout_ms=3000,proof_lifetime_seconds=30)
        prep = prep_module.ReceiptPreparation(raws["candidate_sql"],receipt_sha256=RECEIPT_PIN,
            native_sha256=original["native_catalogue_sha256"],registry_sha256=None,
            system_identifier=SYSTEM,window_start=start,window_end=end,test_only=False,semantic_acl=True)
        pool,server,owner,window,handlers = None,None,None,None,None
        stopped = asyncio.Event()
        loop = asyncio.get_running_loop()
        installed_signals = []
        begin = time.monotonic()
        def close_signals():
            # Only handlers installed by this isolated operator process. Leave
            # them until local cleanup succeeds, including partial setup failure.
            while installed_signals:
                loop.remove_signal_handler(installed_signals[-1])
                installed_signals.pop()
        def remaining_initial():
            remaining = min(c["active_budget_seconds"]-(time.monotonic()-begin),
                (end-datetime.now(timezone.utc)).total_seconds())
            require(remaining > 0 and not stopped.is_set(), "INITIAL_BUDGET_OR_STOP_REQUESTED")
            return remaining
        async def initial_operation(factory):
            async with _deadline(remaining_initial()):
                return await factory()
        async def close_unused():
            # Only before any official OPEN can have mutated authority.
            if handlers is not None:
                handlers.accepting = False
            await close_listener(server, _deadline)
            if handlers is not None:
                await handlers.drain(server=server)
            if pool is not None:
                await asyncio.wait_for(pool.close(),5)
                require(pool.is_closing() and pool.get_size() == 0, "UNUSED_POOL_NOT_CLOSED")
            if owner is not None:
                await owner.close(timeout=3)
            close_signals()
        result = None
        try:
            # Every step after obtaining the lazy owned pool is protected, not
            # only DB/listener operations: constructor or partial signal setup
            # failure must close this pool without ever opening the role.
            pool = await window_module.identity_pool(envelope["identity_dsn"],prep)
            candidate = PortalHumanCandidate(pool,verifier,client,source_config)
            selection = intake_module.ResearchIdentitySelection(ISSUER,SUBJECT,WORKSPACE,t["workload_id"])
            recovery = PortalHumanRecoveryServer(candidate=candidate,ssl_context=server_tls,
                portal_fingerprint_sha256=t["core_client_leaf_sha256"],
                trusted_bindings=frozenset({(ISSUER,WORKSPACE,"paper",t["workload_id"])}),
                timeout_seconds=3,max_inflight=1)
            handlers = RecoveryHandlers(recovery, _deadline)
            for sig in (signal.SIGINT,signal.SIGTERM):
                loop.add_signal_handler(sig,stopped.set)
                installed_signals.append(sig)
            # Resolve all slow source/artifact/owner/listener work before JIT.
            owner = await initial_operation(lambda:asyncpg.connect(envelope["owner_dsn"],timeout=2,command_timeout=3))
            require(await initial_operation(lambda:source_fingerprint(owner)) == original["target"]["source_fingerprint"],
                "SOURCE_DATABASE_INCARNATION_CHANGED")
            server = await initial_operation(lambda:recovery.start(host=RECOVERY_BIND,port=28446))
            # A retained object or swallowed close timeout is not readiness.
            # Validate the installed runtime introspection before requesting JIT.
            server_transport_count(server)
            require(listener_is_serving(server), "RECOVERY_LISTENER_NOT_SERVING")
            ready_delivered = emit("READY_NO_OPEN",operator_config_sha256=approved_config_sha256,
                source_owner_ack_sha256=source_owner_ack_sha256,
                core_handoff_sha256=sha256(raws["core_handoff"]).hexdigest(),
                edge_helper_sha256=EDGE_PINS["identity_role_window"],recovery_listener_bound=True,
                role_window_open=False,business_authority_granted=False,
                next_action="CORE_IPC_ISSUE_IDENTITY_THEN_DELIVER_EXACT_PRIVATE_ASSERTION")
            require(ready_delivered, "CONTROLLER_READY_OUTPUT_UNAVAILABLE")
            command = await initial_operation(lambda:next_private_command(reader))
            if command == {"action":"ABORT_UNUSED"}:
                await close_unused()
                emit("UNUSED_ABORTED",role_window_open=False,source_role_mutated=False,
                    recovery_handlers_remaining=0,mapping_released=False)
                return
            proof,raw_request = jit_assertion(command)
            # Constructor verifies the genuine JWT and prepares its ORIGINAL
            # attempt. It still performs no OPEN/identity mutation.
            window = window_module.IdentityRoleWindow(prep,candidate,selection,proof["human_token"],raw_request)
            require(window.prepared.attempt.lease_id == proof["lease_id"]
                and window.prepared.principal.expires_at*1000 == proof["expires_at_ms"]
                and window.prepared.principal.expires_at*1000-int(time.time()*1000) >= c["minimum_enter_remaining_ms"],
                "JIT_ASSERTION_EXPIRING_OR_CORRELATION_CHANGED")
            # Drop local envelope copies; verifier/SDK retains exactly what its
            # official context requires. Python does not promise memory erasure.
            del command,proof,raw_request
            validate_intake(c,raws,source_owner_ack_sha256=source_owner_ack_sha256,
                now_ms=int(time.time()*1000),end_ms=int(end.timestamp()*1000))
            require(_OUTPUT_AVAILABLE, "CONTROLLER_OUTPUT_LOST_BEFORE_OPEN")
            try:
                result = await initial_operation(lambda:open_and_run(
                    window, owner, envelope["identity_password"]))
            except BaseException:
                if window.state != "RECOVERY_REQUIRED":
                    raise
            # No automatic second RUN. At most the original three recovery
            # attempts fit the INITIAL budget; later private input is recovery-only.
            for _ in range(3):
                r = window.prepared.resolution
                if r.phase in ("COMMITTED","ROLLED_BACK") and r.portal_acknowledged is True:
                    break
                if stopped.is_set():
                    break
                try:
                    await initial_operation(window.recover)
                except BaseException:
                    if window.state != "RECOVERY_REQUIRED":
                        raise
                    break
            retry_retirement = True
            observation = None
            observation_attempted = False
            last_notice = None
            while True:
                r = window.prepared.resolution
                terminal = r.phase in ("COMMITTED", "ROLLED_BACK") and r.portal_acknowledged is True
                if terminal and retry_retirement:
                    if (r.phase == "COMMITTED" and result is None and not observation_attempted
                            and window.state != "RETIRED" and not pool.is_closing()):
                        observation_attempted = True
                        try:
                            observer = ExistingIdentityMappingSource(pool,db_login=ROLE,db_role=ROLE,
                                db_name="live_data_executor",timeout_seconds=5,acquire_timeout_seconds=2,
                                query_timeout_seconds=3,statement_timeout_ms=3000,lock_timeout_ms=500)
                            observation = await optional_mapping_observation(observer,
                                human_issuer=ISSUER, subject=SUBJECT)
                        except (Exception, asyncio.CancelledError):
                            # Construction/metadata is also optional, not authority.
                            emit("MAPPING_OBSERVATION_UNAVAILABLE", details_suppressed=True,
                                business_authority_granted=False)
                    try:
                        # Stop ADMISSION, drain THROUGH writer close, and only
                        # then ask the official helper to reread/retire authority.
                        handlers.accepting = False
                        await handlers.drain(server=server)
                        if window.state != "RETIRED":
                            await window.retire(owner)
                        await close_listener(server, _deadline)
                        await handlers.drain(server=server)
                        await owner.close(timeout=3)
                        close_signals()
                    except BaseException:
                        if window.state in {"OPEN_UNCONFIRMED", "RETIRE_UNCONFIRMED"}:
                            raise  # Never repeat ambiguous ACL DDL automatically.
                        retry_retirement = False
                        if window.state == "RECOVERY_REQUIRED" and not pool.is_closing():
                            handlers.accepting = True
                        emit("RETIREMENT_RETRY_REQUIRED", window_state=window.state,
                            source_role_retired=window.state == "RETIRED",
                            next_action=("RETRY_LOCAL_CLEANUP" if window.state == "RETIRED"
                                else "RETRY_RETIREMENT"),
                            forced_teardown_allowed=False, mapping_released=False,
                            details_suppressed=True)
                    else:
                        facts = dict(phase=r.phase,portal_acknowledged=True,
                            operator_config_sha256=approved_config_sha256,source_owner_ack_sha256=source_owner_ack_sha256,
                            lease_id=window.prepared.attempt.lease_id,attempt_id=window.prepared.attempt.attempt_id,
                            source_receipt_id=r.source_receipt_id,source_receipt_digest=r.source_receipt_digest,
                            elapsed_seconds=round(time.monotonic()-begin,3),source_role_retired=True,
                            recovery_handlers_remaining=len(handlers.tasks),business_authority_granted=False)
                        if result is not None and r.phase == "COMMITTED":
                            facts["mapping"] = {k:result[k] for k in ("ts_user_id","mapping_version")}
                        elif observation is not None:
                            facts["mapping_observation"] = observation
                        emit("RETIRED",**facts)
                        return
                notice = (window.state, r.phase, r.portal_acknowledged,
                    window.prepared.finished, len(handlers.tasks), pool.is_closing())
                if notice != last_notice:
                    emit("CUSTODY_REQUIRED",window_state=window.state,operator_config_sha256=approved_config_sha256,
                        lease_id=window.prepared.attempt.lease_id,attempt_id=window.prepared.attempt.attempt_id,
                        binding_digest=window.prepared.attempt.binding_digest,sdk_finished=window.prepared.finished,
                        phase=r.phase,portal_acknowledged=r.portal_acknowledged,
                        recovery_handlers=len(handlers.tasks),
                        private_core_recovery_endpoint_retained=listener_is_serving(server),
                        recovery_custody_retained=True,
                        next_action="SAME_ATTEMPT_RECOVERY_OR_KNOWN_TERMINAL_CLEANUP_RETRY",
                        forced_teardown_allowed=False,mapping_released=False)
                    last_notice = notice
                try:
                    action = await next_custody_action(reader)
                    if action == "STATUS":
                        last_notice = None
                        continue
                    if action == "RETRY_LOCAL_CLEANUP" and window.state == "RETIRED":
                        retry_retirement = True
                    elif action == "RETRY_RETIREMENT" and window.state == "RECOVERY_REQUIRED" and terminal:
                        retry_retirement = True
                    elif action == "RECOVER_SAME_ATTEMPT":
                        if window.state == "RETIRED":
                            retry_retirement = True  # Known role outcome; local cleanup only.
                        elif window.state == "RECOVERY_REQUIRED" and not pool.is_closing():
                            await window.recover()
                            retry_retirement = True
                        # A closed pool/ambiguous DDL is not licence to reopen it.
                    else:
                        emit("RECOVERY_OPERATOR_ACTION_REFUSED", details_suppressed=True,
                            forced_teardown_allowed=False,mapping_released=False)
                except (Exception, asyncio.CancelledError):
                    # Transient read/recovery failure retains the exact attempt
                    # and a usable control loop. No second RUN or fake outcome.
                    await custody_backoff()
        except BaseException:
            if window is None or window.state == "DORMANT":
                cleanup_notice = False
                while True:
                    try:
                        await close_unused()
                        emit("REFUSED_BEFORE_OPEN",role_window_open=False,source_role_mutated=False,
                            recovery_handlers_remaining=0,mapping_released=False)
                        return
                    except BaseException:
                        if not cleanup_notice:
                            emit("UNUSED_LOCAL_CLEANUP_INCOMPLETE",source_role_mutated=False,mapping_released=False,
                                forced_teardown_allowed=False)
                            cleanup_notice = True
                        # No OPEN can have run in this branch: retry only exact
                        # idempotent socket/pool/owner cleanup, never authority.
                        await custody_backoff()
            if window.state == "RETIRED":
                emit("RETIRED_LOCAL_CLEANUP_INCOMPLETE",source_role_retired=True,
                    recovery_handlers_remaining=len(handlers.tasks),mapping_released=False,forced_teardown_allowed=False)
            # OPEN/RETIRE uncertainty is real custody. Preserve resources and
            # original attempt; only reviewed operator readback may resolve it.
            await retain_physical_readback(reader, window,
                operator_config_sha256=approved_config_sha256, handlers=handlers, server=server)


async def main():
    require(len(sys.argv) == 5 and sys.argv[1] == "--config-sha256"
        and hex_pin(sys.argv[2]) and sys.argv[3] == "--source-owner-ack-sha256"
        and hex_pin(sys.argv[4]), "APPROVED_CONFIG_AND_INDEPENDENT_ACK_PINS_REQUIRED")
    logging.disable(logging.CRITICAL)
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    asyncio.get_running_loop().set_exception_handler(lambda _loop, _context:
        emit("BACKGROUND_RECOVERY_ERROR", details_suppressed=True))
    reader, transport, envelope = await private_input()
    try:
        await run(envelope, reader, approved_config_sha256=sys.argv[2],
            source_owner_ack_sha256=sys.argv[4])
    finally:
        transport.close()  # Only reached after terminal retirement/pre-OPEN refusal.


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except BaseException:
        # No traceback, repr, DB message, raw config/token or private path.
        emit("REFUSED_OR_INTERRUPTED", mapping_released=False,
            next_action="CHECK_PRIVATE_CONTROLLER_CUSTODY_BEFORE_TEARDOWN")
        raise SystemExit(2) from None
