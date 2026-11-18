#!/usr/bin/env python3
"""Exact Manager leaf-expiry repair; never human-policy or command activation.

Prepare only stages private same-identity certificates. Activate requires the
approved nine-service window, no foreign measurement lock, exact source/image
pins, strict TLS and application probes. No DB/JWT/image/config change.
"""
import argparse
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import socket
import signal
import ssl
import stat
import subprocess
import tempfile
import time
from urllib.parse import quote
import http.client

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

ROOT = Path('/home/bobby/secure/portal-manager-read-v2')
RUNTIME = ROOT / 'runtime'
PROXY = Path('/srv/primus/portal/source-proxy')
CA_KEY = Path('/home/bobby/secure/portal-manager-read-v1/mtls-ca-private.pem')
CA_SHA = 'e4a0ff8f882f073e600dc3ec99b862b9bd88a953a91e694d347ee0c71883ddfe'
LOCK = Path('/home/bobby/.local/state/host-measurement-window.lock')
SERVICES = (
    'portal-manager-read-paper-v2-portal_manager_read-1',
    'portal-manager-read-paper-v2-portal_manager_issuer-1',
    'trading-system-manager-read-sandbox-portal_manager_read-1',
    'trading-system-manager-read-sandbox-portal_manager_issuer-1',
    'trading-system-manager-read-live-portal_manager_read-1',
    'trading-system-manager-read-live-portal_manager_issuer-1',
    'portal-execution-edge-source-proxy-1',
    'portal-execution-edge-sandbox-source-proxy-1',
    'portal-execution-edge-live-source-proxy-1',
)
TARGETS = (RUNTIME / 'facade-server-cert.pem', RUNTIME / 'issuer-server-cert.pem',
           RUNTIME / 'source-proxy-manager-client.pem', PROXY / 'manager-v2-client.pem')
PROFILES = (('172.23.0.1', 'paper', 'PAPER_BINANCE_USDM'),
            ('172.24.0.1', 'sandbox', 'SANDBOX_BINANCE_USDM'),
            ('172.25.0.1', 'live', 'LIVE_BINANCE_USDM'))
MAX_BYTES = 1_048_576
RUNTIME_CONTRACT = 'trading-system.portal-execution.manager-v2.runtime.v1'
_operation_guard = lambda: None


def require(condition, code):
    if not condition:
        raise ValueError(code)


def private_read(path):
    path = Path(path)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        info = os.fstat(fd)
        require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and
                stat.S_IMODE(info.st_mode) in (0o600, 0o640) and
                0 < info.st_size <= MAX_BYTES, 'PRIVATE_FILE_INVALID')
        data = os.read(fd, MAX_BYTES + 1)
        require(len(data) == info.st_size, 'PRIVATE_FILE_CHANGED_OR_OVERSIZED')
        return data
    finally:
        os.close(fd)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def public_key(key):
    return key.public_bytes(serialization.Encoding.DER,
                            serialization.PublicFormat.SubjectPublicKeyInfo)


def renew(original, key, ca, ca_key, now):
    """Renew only validity/serial/signature; all identities/extensions/keys stay."""
    require(isinstance(key, Ed25519PrivateKey) and isinstance(ca_key, Ed25519PrivateKey),
            'PINNED_KEY_TYPE_REQUIRED')
    require(public_key(key.public_key()) == public_key(original.public_key()),
            'LEAF_KEY_MISMATCH')
    require(public_key(ca_key.public_key()) == public_key(ca.public_key()), 'CA_KEY_MISMATCH')
    require(original.issuer == ca.subject and not original.extensions.get_extension_for_class(
        x509.BasicConstraints).value.ca, 'LEAF_AUTHORITY_INVALID')
    require(ca.extensions.get_extension_for_class(x509.BasicConstraints).value.ca,
            'SIGNER_NOT_CA')
    ca.public_key().verify(original.signature, original.tbs_certificate_bytes)
    until = now + timedelta(days=30)
    require(ca.not_valid_before.replace(tzinfo=timezone.utc) <= now and
            ca.not_valid_after.replace(tzinfo=timezone.utc) > until, 'CA_VALIDITY_INSUFFICIENT')
    builder = (x509.CertificateBuilder().subject_name(original.subject)
        .issuer_name(ca.subject).public_key(original.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(minutes=5)).not_valid_after(until))
    for extension in original.extensions:
        builder = builder.add_extension(extension.value, extension.critical)
    cert = builder.sign(ca_key, algorithm=None)
    ca.public_key().verify(cert.signature, cert.tbs_certificate_bytes)
    return cert.public_bytes(serialization.Encoding.PEM)


def write_new(path, data, mode=0o600, owner=None):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
    try:
        if owner is not None:
            os.fchown(fd, *owner)
        os.fchmod(fd, mode)
        with os.fdopen(fd, 'wb', closefd=False) as stream:
            stream.write(data)
            stream.flush()
            os.fsync(fd)
    finally:
        os.close(fd)


def command(args, timeout=30, guarded=True):
    if guarded:
        _operation_guard()
    result = subprocess.run(args, capture_output=True, timeout=timeout, check=False)
    require(result.returncode == 0 and len(result.stdout) <= 4 * MAX_BYTES,
            'SCOPED_COMMAND_FAILED')
    return result.stdout


def roster(guarded=True):
    # Whitelist metadata at Docker; never collect credentials/environment.
    template = ('{"name":{{json .Name}},"id":{{json .Id}},"image":{{json .Image}},'
                '"config":{{json (index .Config.Labels "com.docker.compose.config-hash")}},'
                '"running":{{json .State.Running}}}')
    raw = [json.loads(line) for line in command(
        ['docker', 'inspect', '--format', template, *SERVICES], guarded=guarded).splitlines()]
    require(len(raw) == len(SERVICES), 'ROSTER_INCOMPLETE')
    by_name = {item['name'].lstrip('/'): item for item in raw}
    require(set(by_name) == set(SERVICES), 'ROSTER_MISMATCH')
    return [{**by_name[n], 'name': n} for n in SERVICES]


def check_lock():
    if LOCK.exists():
        require(LOCK.stat().st_size <= 4096, 'MEASUREMENT_LOCK_INVALID')
        payload = json.loads(LOCK.read_text())
        until = datetime.fromisoformat(payload['until_utc'].replace('Z', '+00:00'))
        require(until <= datetime.now(timezone.utc), 'FOREIGN_MEASUREMENT_LOCK_ACTIVE')
        # Never delete a foreign lock in a repair helper, even if expired.
        raise ValueError('EXPIRED_LOCK_PRESENT_REMOVE_ONLY_AFTER_OWNER_CHECK')


def prepare():
    check_lock()  # Preparation also respects the read-only foreign window.
    ca_bytes = private_read(RUNTIME / 'mtls-ca-cert.pem')
    ca = x509.load_pem_x509_certificate(ca_bytes)
    require(ca.fingerprint(hashes.SHA256()).hex() == CA_SHA, 'PINNED_CA_CHANGED')
    ca_key = serialization.load_pem_private_key(private_read(CA_KEY), None)
    before = roster()
    require(all(x['running'] for x in before), 'SERVICE_NOT_RUNNING')
    originals = [private_read(path) for path in TARGETS]
    require(originals[2] == originals[3], 'PROXY_IDENTITY_COPIES_DIVERGED')
    keys = [private_read(RUNTIME / 'facade-server-key.pem'),
            private_read(RUNTIME / 'issuer-server-key.pem'),
            re.search(rb'-----BEGIN PRIVATE KEY-----.*?-----END PRIVATE KEY-----',
                      originals[2], re.S).group(0) + b'\n']
    now = datetime.now(timezone.utc)
    bundle = Path(tempfile.mkdtemp(prefix='renewal-epg10-08-', dir=ROOT))
    os.chmod(bundle, 0o700)
    manifest = {'schema': 'epg10.manager-tls-renewal.v1', 'created_utc': now.isoformat(),
                'runtime_acceptance': False, 'runtime_mutations': 0,
                'ca_sha256': CA_SHA, 'roster': before, 'targets': []}
    try:
        # Fresh same-identity recovery; expired originals are forensic only.
        for label in ('primary', 'fallback'):
            values = [renew(x509.load_pem_x509_certificate(originals[i]),
                            serialization.load_pem_private_key(keys[i], None), ca, ca_key, now)
                      for i in range(3)]
            values[2] += keys[2]
            for i in range(4):
                write_new(bundle / f'{label}-{i}.pem', values[min(i, 2)])
        for i, path in enumerate(TARGETS):
            info = path.stat()
            write_new(bundle / f'original-{i}.pem', originals[i])
            manifest['targets'].append({'path': str(path), 'original_sha256': sha(originals[i]),
                'primary_sha256': sha(private_read(bundle / f'primary-{i}.pem')),
                'fallback_sha256': sha(private_read(bundle / f'fallback-{i}.pem')),
                'mode': stat.S_IMODE(info.st_mode), 'uid': info.st_uid, 'gid': info.st_gid})
        validate_staged(bundle, manifest)
        write_new(bundle / 'manifest.json', json.dumps(manifest, sort_keys=True).encode())
    except Exception:
        # Exact newly allocated private directory only, never live credentials.
        for label in ('primary', 'fallback', 'original'):
            for i in range(4):
                (bundle / f'{label}-{i}.pem').unlink(missing_ok=True)
        (bundle / 'manifest.json').unlink(missing_ok=True)
        bundle.rmdir()
        raise
    return {'status': 'PREPARED_NOT_ACTIVATED', 'private_bundle': str(bundle),
            'manifest_sha256': sha(private_read(bundle / 'manifest.json')),
            'keys_jwt_ca_db_config_images_unchanged': True, 'runtime_mutations': 0}


def replace_exact(path, payload, info):
    _operation_guard()
    require(not path.is_symlink() and path.is_file(), 'TARGET_PATH_CHANGED')
    fd, name = tempfile.mkstemp(prefix='.epg10-08-', dir=path.parent)
    temp = Path(name)
    try:
        os.fchown(fd, info['uid'], info['gid'])
        os.fchmod(fd, info['mode'])
        with os.fdopen(fd, 'wb') as stream:
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
        _operation_guard()
        os.replace(temp, path)
    finally:
        if temp.exists():
            temp.unlink()


def reload_contexts():
    # Existing containers only: never compose up/recreate or depend on removed
    # historical worktree paths. All persistent mounts/images/configs retained.
    for name in SERVICES[:6]:
        command(['docker', 'restart', '--time', '10', name], timeout=45)
    for name in SERVICES[6:]:
        command(['docker', 'exec', name, 'nginx', '-t'])
        command(['docker', 'exec', name, 'nginx', '-s', 'reload'])


def tls_context(ca, identity=None):
    context = ssl.create_default_context(cafile=str(ca))
    context.minimum_version = context.maximum_version = ssl.TLSVersion.TLSv1_3
    if identity is not None:
        context.load_cert_chain(str(identity))
    return context


def request(host, port, path, context, method='GET'):
    _operation_guard()
    connection = http.client.HTTPSConnection(host, port, context=context, timeout=5)
    try:
        connection.request(method, path)
        reply = connection.getresponse()
        payload = reply.read(MAX_BYTES + 1)
        require(len(payload) <= MAX_BYTES, 'RESPONSE_BOUND_EXCEEDED')
        return reply.status, payload
    finally:
        connection.close()


def available(payload, profile, catalogue_sha=None):
    """Validate actual bounded wire envelopes, never retain business values."""
    body = json.loads(payload)
    require(isinstance(body, dict) and body.get('contract_version') == RUNTIME_CONTRACT and
            body.get('authority') == 'EXECUTION_CELL' and body.get('profile_id') == profile and
            body.get('availability') == 'AVAILABLE' and body.get('freshness') == 'FRESH' and
            body.get('completeness') in ('COMPLETE', 'PARTIAL') and
            isinstance(body.get('data'), dict) and
            re.fullmatch(r'sha256:[a-f0-9]{64}', body.get('catalogue_sha256', '')),
            'READ_ENVELOPE_INVALID')
    require(catalogue_sha is None or body['catalogue_sha256'] == catalogue_sha,
            'READ_CATALOGUE_CHANGED')
    as_of = datetime.fromisoformat(body['as_of'].replace('Z', '+00:00'))
    require(as_of.utcoffset() == timedelta(0) and
            abs((datetime.now(timezone.utc) - as_of).total_seconds()) <= 120,
            'READ_TIMESTAMP_NOT_CURRENT')
    return body


def page_data(body, *, relation=None, kind=None):
    data = body['data']
    require(isinstance(data.get('items'), list) and len(data['items']) <= 1 and
            all(isinstance(item, dict) for item in data['items']) and
            (data.get('next_cursor') is None or
             isinstance(data['next_cursor'], str) and 0 < len(data['next_cursor']) <= 4096) and
            (body['completeness'] == 'PARTIAL') == bool(data.get('next_cursor')),
            'READ_PAGE_INVALID')
    require((relation is None or data.get('relation') == relation) and
            (kind is None or data.get('kind') == kind), 'READ_TARGET_INVALID')


def qualify():
    ca = RUNTIME / 'mtls-ca-cert.pem'
    identity = RUNTIME / 'source-proxy-manager-client.pem'
    context = tls_context(ca, identity)
    certificates = []
    for port in (8023, 8024, 8123, 8124, 8223, 8224):
        _operation_guard()
        name = 'manager-facade' if port % 2 else 'manager-issuer'
        expected_file = RUNTIME / ('facade-server-cert.pem' if port % 2 else 'issuer-server-cert.pem')
        expected_sha = sha(x509.load_pem_x509_certificate(private_read(expected_file)).public_bytes(
            serialization.Encoding.DER))
        for attempt in range(10):
            try:
                with socket.create_connection(('127.0.0.1', port), timeout=5) as raw:
                    with context.wrap_socket(raw, server_hostname=name) as secured:
                        loaded_sha = sha(secured.getpeercert(binary_form=True))
                        require(loaded_sha == expected_sha, 'LOADED_CERTIFICATE_MISMATCH')
                        certificates.append({'port': port, 'tls': secured.version(),
                            'certificate_sha256': loaded_sha})
                break
            except (ConnectionError, socket.timeout):
                if attempt == 9:
                    raise
                time.sleep(0.2)
    edge = Path('/srv/primus/portal/execution-edge')
    context = tls_context(edge / 'source-proxy-ca.crt', edge / 'source-proxy-client.pem')
    profiles = []
    for host, profile, expected_profile_id in PROFILES:
        base = '/portal/execution/v2/manager'
        status, payload = request(host, 8444, base + '/catalog', context)
        require(status == 200, 'CATALOG_READ_FAILED')
        catalogue = available(payload, expected_profile_id)
        relations = catalogue.get('data', {}).get('relations')
        require(isinstance(relations, list) and relations and
                catalogue.get('profile_id') == expected_profile_id,
                'CATALOG_CONTRACT_FAILED')
        first = relations[0]['id']
        require(all(re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', first[k])
                    for k in ('schema', 'relation')), 'CATALOG_IDENTIFIER_INVALID')
        require(catalogue['data'].get('relation_count') == len(relations) and
                catalogue['data'].get('catalogue_revision') == catalogue['catalogue_sha256'],
                'CATALOG_COUNT_REVISION_INVALID')
        for path in ('/capabilities', '/records/' + quote(first['schema']) + '/' +
                     quote(first['relation']) + '?limit=1', '/projections/portfolio?limit=1'):
            status, payload = request(host, 8444, base + path, context)
            require(status == 200, 'BOUNDED_READ_FAILED')
            body = available(payload, expected_profile_id, catalogue['catalogue_sha256'])
            if path.startswith('/capabilities'):
                data = body['data']
                capabilities = data.get('capabilities')
                require(data.get('contract_revision') == RUNTIME_CONTRACT and
                        data.get('active_profile_id') == expected_profile_id and
                        isinstance(capabilities, list) and len(capabilities) == 5 and
                        all(c.get('registered') is True and c.get('source_binding') is True
                            for c in capabilities), 'CAPABILITIES_CONTRACT_INVALID')
            else:
                page_data(body, relation=first if path.startswith('/records/') else None,
                          kind='portfolio' if path.startswith('/projections/') else None)
        for method, path, expected in (('POST', '/catalog', 405), ('HEAD', '/catalog', 405),
                                       ('GET', '/not-allowed', 404)):
            status, _ = request(host, 8444, base + path, context, method)
            require(status == expected, 'ROUTE_DENIAL_FAILED')
        denied = False
        try:
            status, _ = request(host, 8444, base + '/catalog',
                               tls_context(edge / 'source-proxy-ca.crt'))
            denied = status in (400, 401, 403, 495, 496)
        except ssl.SSLError:
            denied = True
        require(denied, 'MISSING_MTLS_NOT_DENIED')
        profiles.append({'profile': profile, 'profile_id': expected_profile_id,
                         'positive_reads': 4, 'negative_cases': 4,
                         'catalogue_relations': len(relations), 'business_rows_recorded': False})
    return {'loaded_manager_tls': certificates, 'proxy_profiles': profiles,
            'human_current_policy_qualification': False, 'financial_effects': 0}


def validate_staged(bundle, manifest):
    """Revalidate both recovery sets immediately before operational writes."""
    ca = x509.load_pem_x509_certificate(private_read(RUNTIME / 'mtls-ca-cert.pem'))
    require(ca.fingerprint(hashes.SHA256()).hex() == CA_SHA and
            manifest.get('ca_sha256') == CA_SHA and
            ca.extensions.get_extension_for_class(x509.BasicConstraints).value.ca,
            'PINNED_CA_CHANGED')
    now = datetime.now(timezone.utc)
    require(ca.not_valid_before.replace(tzinfo=timezone.utc) <= now and
            ca.not_valid_after.replace(tzinfo=timezone.utc) > now + timedelta(days=1),
            'CA_VALIDITY_INSUFFICIENT')
    for i in range(4):
        original = x509.load_pem_x509_certificate(private_read(TARGETS[i]))
        original_key = serialization.load_pem_private_key(private_read(
            (RUNTIME / 'facade-server-key.pem', RUNTIME / 'issuer-server-key.pem',
             TARGETS[2], TARGETS[3])[i]), None)
        serials = []
        for label in ('primary', 'fallback'):
            blob = private_read(bundle / f'{label}-{i}.pem')
            leaf = x509.load_pem_x509_certificate(blob)
            require(leaf.subject == original.subject and leaf.issuer == ca.subject and
                    list(leaf.extensions) == list(original.extensions) and
                    public_key(leaf.public_key()) == public_key(original.public_key()) ==
                    public_key(original_key.public_key()) and
                    leaf.not_valid_before.replace(tzinfo=timezone.utc) <= now and
                    now + timedelta(days=1) < leaf.not_valid_after.replace(tzinfo=timezone.utc) <
                    ca.not_valid_after.replace(tzinfo=timezone.utc), 'STAGED_CERTIFICATE_INVALID')
            ca.public_key().verify(leaf.signature, leaf.tbs_certificate_bytes)
            if i >= 2:
                key = serialization.load_pem_private_key(blob, None)
                require(public_key(key.public_key()) == public_key(original_key.public_key()),
                        'STAGED_CLIENT_KEY_CHANGED')
            serials.append(leaf.serial_number)
        require(serials[0] != serials[1], 'RECOVERY_CERTIFICATE_NOT_INDEPENDENT')


@contextmanager
def bounded_stage(seconds):
    def expired(_signum, _frame):
        raise TimeoutError('REPAIR_STAGE_DEADLINE')
    previous = signal.signal(signal.SIGALRM, expired)
    signal.setitimer(signal.ITIMER_REAL, seconds)
    try:
        yield
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, previous)


def publish(bundle, manifest, label):
    for i, info in enumerate(manifest['targets']):
        _operation_guard()
        replace_exact(TARGETS[i], private_read(bundle / f'{label}-{i}.pem'), info)
    reload_contexts()
    proof = qualify()
    require(roster() == manifest['roster'], 'SERVICE_ID_IMAGE_CONFIG_CHANGED')
    return proof


def contain_failure():
    # Try every approved Manager independently; never claim containment on intent.
    for name in SERVICES[:6]:
        try:
            command(['docker', 'stop', '--time', '10', name], timeout=20)
        except Exception:
            pass
    state = roster(guarded=False)
    require(not any(item['running'] for item in state[:6]),
            'REPAIR_FAILED_CONTAINMENT_UNCONFIRMED')
    raise ValueError('REPAIR_AND_FALLBACK_FAILED_AFFECTED_MANAGERS_STOPPED')


def activate(bundle):
    global _operation_guard
    require(bundle.parent == ROOT and re.fullmatch(r'renewal-epg10-08-[A-Za-z0-9_]+',
            bundle.name) and not bundle.is_symlink(), 'PRIVATE_BUNDLE_PATH_INVALID')
    check_lock()  # No file publication/container start before this gate.
    manifest = json.loads(private_read(bundle / 'manifest.json'))
    require([x['path'] for x in manifest['targets']] == [str(p) for p in TARGETS],
            'TARGET_ROSTER_CHANGED')
    require(roster() == manifest['roster'], 'SERVICE_ID_IMAGE_CONFIG_CHANGED')
    for i, info in enumerate(manifest['targets']):
        require(sha(private_read(TARGETS[i])) == info['original_sha256'], 'LIVE_INPUT_CHANGED')
        for label in ('primary', 'fallback'):
            require(sha(private_read(bundle / f'{label}-{i}.pem')) == info[label + '_sha256'],
                    'STAGED_INPUT_CHANGED')
    validate_staged(bundle, manifest)
    spec = importlib.util.spec_from_file_location('epg08_observer',
                        Path(__file__).resolve().parents[1] / 'execution_edge_observe.py')
    observer = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(observer)
    with observer.measurement_lock(LOCK, 'epg10-08-manager-tls-repair', 1710,
                                  purpose='Owner-approved exact6Manager+3Proxy leaf repair') as lease:
        deadline = time.monotonic() + 1620
        def guard():
            observer.verify_lock(LOCK, lease)
            require(time.monotonic() < deadline, 'REPAIR_OPERATION_DEADLINE')
        _operation_guard = guard
        try:
            with bounded_stage(600):
                proof = publish(bundle, manifest, 'primary')
            return {'status': 'MANAGER_TLS_REPAIRED_NOT_HUMAN_POLICY_ACCEPTANCE', **proof}
        except Exception:
            # Never restore expired originals. Install the separately validated
            # valid same-identity fallback, reload only these same services.
            try:
                with bounded_stage(600):
                    publish(bundle, manifest, 'fallback')
            except Exception:
                with bounded_stage(180):
                    contain_failure()
            raise ValueError('PRIMARY_FAILED_VALID_FALLBACK_LOADED') from None
        finally:
            _operation_guard = lambda: None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prepare', action='store_true')
    parser.add_argument('--activate', type=Path)
    args = parser.parse_args()
    try:
        require(args.prepare != bool(args.activate), 'EXACT_ACTION_REQUIRED')
        result = prepare() if args.prepare else activate(args.activate)
        print(json.dumps(result, sort_keys=True))
        return 0
    except Exception as error:
        # No arbitrary crypto/HTTP/subprocess messages, token or DB error output.
        code = str(error) if type(error) is ValueError and re.fullmatch(
            r'[A-Z0-9_]{1,96}', str(error)) else 'REPAIR_FAILED_PRIVATE_DIAGNOSTIC_REQUIRED'
        print(json.dumps({'status': 'NOT_ACCEPTED', 'code': code,
                          'full_phase08_accepted': False}, sort_keys=True))
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
