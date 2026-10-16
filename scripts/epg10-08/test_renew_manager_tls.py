#!/usr/bin/env python3
"""TEST_ONLY renewal guards; no operational credentials, Docker or network.

All certificates and keys are generated in memory. File tests use only a
TemporaryDirectory owned by that test. Run in the approved isolated test lane,
never through an active foreign host-measurement window.
"""
from contextlib import ExitStack
from datetime import datetime, timedelta, timezone
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch

from cryptography import x509
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID, ObjectIdentifier


SPEC = importlib.util.spec_from_file_location(
    'epg08_test_only_renewal', Path(__file__).with_name('renew_manager_tls.py'))
renewal = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(renewal)


class CertificateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.now = datetime(2026, 10, 16, 12, 0, tzinfo=timezone.utc)
        cls.ca_key = Ed25519PrivateKey.generate()
        cls.leaf_key = Ed25519PrivateKey.generate()
        cls.other_key = Ed25519PrivateKey.generate()
        cls.ca_name = x509.Name([x509.NameAttribute(
            NameOID.COMMON_NAME, 'TEST_ONLY Manager renewal CA')])
        cls.ca = cls.make_ca()
        cls.leaf = cls.make_leaf()

    @classmethod
    def make_ca(cls, *, before=None, after=None, is_ca=True):
        return (x509.CertificateBuilder().subject_name(cls.ca_name)
                .issuer_name(cls.ca_name).public_key(cls.ca_key.public_key())
                .serial_number(x509.random_serial_number())
                .not_valid_before(before or cls.now - timedelta(days=90))
                .not_valid_after(after or cls.now + timedelta(days=365))
                .add_extension(x509.BasicConstraints(ca=is_ca, path_length=None), True)
                .sign(cls.ca_key, algorithm=None))

    @classmethod
    def make_leaf(cls, *, signer=None, issuer=None):
        return (x509.CertificateBuilder()
                .subject_name(x509.Name([x509.NameAttribute(
                    NameOID.COMMON_NAME, 'TEST_ONLY manager-facade')]))
                .issuer_name(issuer or cls.ca_name)
                .public_key(cls.leaf_key.public_key())
                .serial_number(x509.random_serial_number())
                .not_valid_before(cls.now - timedelta(days=50))
                .not_valid_after(cls.now - timedelta(days=20))
                .add_extension(x509.BasicConstraints(ca=False, path_length=None), True)
                .add_extension(x509.SubjectAlternativeName([
                    x509.DNSName('manager-facade'),
                    x509.UniformResourceIdentifier('spiffe://test-only/manager/facade')]), False)
                .add_extension(x509.ExtendedKeyUsage([
                    ExtendedKeyUsageOID.SERVER_AUTH]), False)
                .add_extension(x509.SubjectKeyIdentifier.from_public_key(
                    cls.leaf_key.public_key()), False)
                .add_extension(x509.UnrecognizedExtension(
                    ObjectIdentifier('1.3.6.1.4.1.55555.8'), b'TEST_ONLY_extension'), False)
                .sign(signer or cls.ca_key, algorithm=None))

    def renew(self, original=None, key=None, ca=None, ca_key=None):
        return renewal.renew(original or self.leaf, key or self.leaf_key,
                             ca or self.ca, ca_key or self.ca_key, self.now)

    def test_renewal_preserves_identity_extensions_and_spki_with_30_day_bound(self):
        updated = x509.load_pem_x509_certificate(self.renew())
        self.assertEqual(updated.subject, self.leaf.subject)
        self.assertEqual(updated.issuer, self.leaf.issuer)
        self.assertEqual(list(updated.extensions), list(self.leaf.extensions))
        self.assertEqual(renewal.public_key(updated.public_key()),
                         renewal.public_key(self.leaf.public_key()))
        self.assertNotEqual(updated.serial_number, self.leaf.serial_number)
        self.assertEqual(updated.not_valid_before.replace(tzinfo=timezone.utc),
                         self.now - timedelta(minutes=5))
        self.assertEqual(updated.not_valid_after.replace(tzinfo=timezone.utc),
                         self.now + timedelta(days=30))
        self.ca.public_key().verify(updated.signature, updated.tbs_certificate_bytes)

    def test_primary_and_fallback_have_distinct_serials_but_same_identity(self):
        first = x509.load_pem_x509_certificate(self.renew())
        fallback = x509.load_pem_x509_certificate(self.renew())
        self.assertNotEqual(first.serial_number, fallback.serial_number)
        self.assertEqual(first.subject, fallback.subject)
        self.assertEqual(list(first.extensions), list(fallback.extensions))
        self.assertEqual(renewal.public_key(first.public_key()),
                         renewal.public_key(fallback.public_key()))

    def test_wrong_leaf_key_is_rejected(self):
        with self.assertRaisesRegex(ValueError, '^LEAF_KEY_MISMATCH$'):
            self.renew(key=self.other_key)

    def test_wrong_ca_key_is_rejected(self):
        with self.assertRaisesRegex(ValueError, '^CA_KEY_MISMATCH$'):
            self.renew(ca_key=self.other_key)

    def test_original_foreign_signature_is_rejected_even_with_matching_issuer(self):
        with self.assertRaises(InvalidSignature):
            self.renew(original=self.make_leaf(signer=self.other_key))

    def test_foreign_issuer_is_rejected(self):
        foreign = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'TEST_ONLY foreign')])
        with self.assertRaisesRegex(ValueError, '^LEAF_AUTHORITY_INVALID$'):
            self.renew(original=self.make_leaf(issuer=foreign))

    def test_ca_cannot_be_renewed_as_a_leaf(self):
        with self.assertRaisesRegex(ValueError, '^LEAF_AUTHORITY_INVALID$'):
            self.renew(original=self.ca, key=self.ca_key)

    def test_signer_certificate_must_be_a_ca(self):
        with self.assertRaisesRegex(ValueError, '^SIGNER_NOT_CA$'):
            self.renew(ca=self.make_ca(is_ca=False))

    def test_wrong_private_key_type_is_rejected(self):
        for kwargs in ({'key': object()}, {'ca_key': object()}):
            with self.subTest(key=next(iter(kwargs))):
                with self.assertRaisesRegex(ValueError, '^PINNED_KEY_TYPE_REQUIRED$'):
                    self.renew(**kwargs)

    def test_ca_must_be_current_and_extend_strictly_past_renewal_end(self):
        candidates = [
            self.make_ca(before=self.now + timedelta(seconds=1)),
            self.make_ca(after=self.now + timedelta(days=29)),
            self.make_ca(after=self.now + timedelta(days=30)),
        ]
        for index, ca in enumerate(candidates):
            with self.subTest(candidate=index):
                with self.assertRaisesRegex(ValueError, '^CA_VALIDITY_INSUFFICIENT$'):
                    self.renew(ca=ca)


class PrivateFileTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='epg08-test-only-files-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.file = self.root / 'TEST_ONLY_blob'
        self.file.write_bytes(b'TEST_ONLY noncredential bytes')
        self.file.chmod(0o600)

    def test_only_approved_private_modes_are_read(self):
        for mode in (0o600, 0o640):
            with self.subTest(mode=oct(mode)):
                self.file.chmod(mode)
                self.assertEqual(renewal.private_read(self.file), self.file.read_bytes())

    def test_insecure_permissions_are_rejected(self):
        for mode in (0o400, 0o644, 0o660, 0o700, 0o777):
            with self.subTest(mode=oct(mode)):
                self.file.chmod(mode)
                with self.assertRaisesRegex(ValueError, '^PRIVATE_FILE_INVALID$'):
                    renewal.private_read(self.file)

    def test_symlink_is_not_followed(self):
        link = self.root / 'TEST_ONLY_symlink'
        link.symlink_to(self.file)
        with self.assertRaises(OSError):
            renewal.private_read(link)

    def test_hardlinked_input_is_rejected(self):
        link = self.root / 'TEST_ONLY_hardlink'
        os.link(self.file, link)
        with self.assertRaisesRegex(ValueError, '^PRIVATE_FILE_INVALID$'):
            renewal.private_read(self.file)

    def test_empty_and_oversized_inputs_are_rejected(self):
        with patch.object(renewal, 'MAX_BYTES', 32):
            for value in (b'', b'x' * 33):
                with self.subTest(size=len(value)):
                    self.file.write_bytes(value)
                    with self.assertRaisesRegex(ValueError, '^PRIVATE_FILE_INVALID$'):
                        renewal.private_read(self.file)

    def test_short_read_is_not_accepted(self):
        with patch.object(renewal.os, 'read', return_value=b'TEST_ONLY_short'):
            with self.assertRaisesRegex(ValueError, '^PRIVATE_FILE_CHANGED_OR_OVERSIZED$'):
                renewal.private_read(self.file)


class ActivationGuardTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='epg08-test-only-activation-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.bundle = self.root / 'renewal-epg10-08-TEST_ONLY'
        self.lock = self.root / 'TEST_ONLY_measurement.lock'

    def assert_lock_stops_before_any_mutation(self, content, expected):
        self.lock.write_text(content)
        with patch.object(renewal, 'ROOT', self.root), patch.object(renewal, 'LOCK', self.lock), \
                patch.object(renewal, 'private_read') as read, \
                patch.object(renewal, 'roster') as roster, \
                patch.object(renewal, 'replace_exact') as replace, \
                patch.object(renewal, 'reload_contexts') as reload, \
                patch.object(renewal, 'qualify') as qualify:
            with self.assertRaises(expected):
                renewal.activate(self.bundle)
            for operation in (read, roster, replace, reload, qualify):
                operation.assert_not_called()
        self.assertTrue(self.lock.exists(), 'Never remove a foreign lock')

    def test_future_measurement_lock_denies_activation_before_private_reads(self):
        until = datetime.now(timezone.utc) + timedelta(hours=1)
        self.assert_lock_stops_before_any_mutation(
            json.dumps({'until_utc': until.isoformat()}), ValueError)

    def test_expired_lock_requires_owner_check_and_is_not_removed(self):
        until = datetime.now(timezone.utc) - timedelta(hours=1)
        self.assert_lock_stops_before_any_mutation(
            json.dumps({'until_utc': until.isoformat()}), ValueError)

    def test_malformed_and_oversized_measurement_locks_fail_closed(self):
        for content in ('{malformed', '{}', '{"until_utc":"not-a-date"}', 'x' * 4097):
            with self.subTest(content_kind=content[:24]):
                self.assert_lock_stops_before_any_mutation(content, (ValueError, KeyError))

    def test_live_staged_service_and_target_drift_deny_before_publication(self):
        for drift, error in (('live', 'LIVE_INPUT_CHANGED'), ('staged', 'STAGED_INPUT_CHANGED'),
                             ('service', 'SERVICE_ID_IMAGE_CONFIG_CHANGED'),
                             ('target', 'TARGET_ROSTER_CHANGED')):
            with self.subTest(drift=drift):
                targets = tuple(self.root / f'TEST_ONLY_live_{i}' for i in range(4))
                original = b'TEST_ONLY original'
                staged = b'TEST_ONLY staged'
                expected_roster = [{'name': 'TEST_ONLY_service', 'image': 'TEST_ONLY_image'}]
                manifest = {'roster': expected_roster, 'targets': [
                    {'path': str(path), 'original_sha256': renewal.sha(original),
                     'primary_sha256': renewal.sha(staged), 'fallback_sha256': renewal.sha(staged)}
                    for path in targets]}
                if drift == 'target':
                    manifest['targets'][0]['path'] = str(self.root / 'TEST_ONLY_foreign')

                def read(path):
                    if path == self.bundle / 'manifest.json':
                        return json.dumps(manifest).encode()
                    if path in targets:
                        return b'TEST_ONLY changed' if drift == 'live' else original
                    return b'TEST_ONLY changed' if drift == 'staged' else staged

                actual_roster = [] if drift == 'service' else expected_roster
                with patch.object(renewal, 'ROOT', self.root), \
                        patch.object(renewal, 'TARGETS', targets), \
                        patch.object(renewal, 'check_lock'), \
                        patch.object(renewal, 'private_read', side_effect=read), \
                        patch.object(renewal, 'roster', return_value=actual_roster), \
                        patch.object(renewal, 'replace_exact') as replace, \
                        patch.object(renewal, 'reload_contexts') as reload, \
                        patch.object(renewal, 'qualify') as qualify, \
                        patch.object(renewal.importlib.util, 'spec_from_file_location') as load:
                    with self.assertRaisesRegex(ValueError, '^' + error + '$'):
                        renewal.activate(self.bundle)
                    for operation in (replace, reload, qualify, load):
                        operation.assert_not_called()


class ResponseAndErrorTests(unittest.TestCase):
    def test_response_size_is_bounded_and_connection_always_closed(self):
        connection = MagicMock()
        reply = connection.getresponse.return_value
        reply.status = 200
        reply.read.return_value = b'x' * 9
        with patch.object(renewal, 'MAX_BYTES', 8), \
                patch.object(renewal.http.client, 'HTTPSConnection', return_value=connection):
            with self.assertRaisesRegex(ValueError, '^RESPONSE_BOUND_EXCEEDED$'):
                renewal.request('TEST_ONLY.invalid', 443, '/TEST_ONLY', object())
        reply.read.assert_called_once_with(9)
        connection.close.assert_called_once_with()

    def test_scoped_command_failure_does_not_surface_raw_output(self):
        result = SimpleNamespace(returncode=1, stdout=b'TEST_ONLY sensitive detail',
                                 stderr=b'TEST_ONLY private diagnostic')
        with patch.object(renewal.subprocess, 'run', return_value=result):
            with self.assertRaisesRegex(ValueError, '^SCOPED_COMMAND_FAILED$'):
                renewal.command(['TEST_ONLY_NEVER_EXECUTED'])

    def test_cli_only_exposes_allowlisted_codes_not_arbitrary_error_details(self):
        cases = [(ValueError('PINNED_CA_CHANGED'), 'PINNED_CA_CHANGED'),
                 (ValueError('TEST_ONLY sensitive detail'), 'REPAIR_FAILED_PRIVATE_DIAGNOSTIC_REQUIRED'),
                 (RuntimeError('TEST_ONLY_PRIVATE_VALUE'), 'REPAIR_FAILED_PRIVATE_DIAGNOSTIC_REQUIRED')]
        for error, expected in cases:
            with self.subTest(error_type=type(error).__name__, expected=expected):
                output = io.StringIO()
                with patch('sys.argv', ['renew_manager_tls.py', '--prepare']), \
                        patch.object(renewal, 'prepare', side_effect=error), \
                        patch('sys.stdout', output):
                    self.assertEqual(renewal.main(), 2)
                self.assertEqual(json.loads(output.getvalue()), {
                    'status': 'NOT_ACCEPTED', 'code': expected, 'full_phase08_accepted': False})


class EnvelopeAndPageTests(unittest.TestCase):
    def setUp(self):
        self.profile = 'TEST_ONLY_PROFILE'
        self.digest = 'sha256:' + 'a' * 64
        self.body = {
            'contract_version': renewal.RUNTIME_CONTRACT, 'authority': 'EXECUTION_CELL',
            'profile_id': self.profile, 'availability': 'AVAILABLE', 'freshness': 'FRESH',
            'completeness': 'COMPLETE', 'data': {'items': [], 'next_cursor': None},
            'catalogue_sha256': self.digest,
            'as_of': datetime.now(timezone.utc).isoformat(),
        }

    def test_available_current_exact_profile_envelope_is_accepted(self):
        self.assertEqual(renewal.available(json.dumps(self.body), self.profile, self.digest),
                         self.body)
        renewal.page_data(self.body)

    def test_false_200_wrong_profile_contract_authority_or_stale_quality_is_denied(self):
        changes = [('availability', 'UNAVAILABLE'), ('freshness', 'STALE'),
                   ('profile_id', 'TEST_ONLY_OTHER_PROFILE'), ('authority', 'UNKNOWN'),
                   ('contract_version', 'TEST_ONLY_WRONG_CONTRACT'),
                   ('completeness', 'UNKNOWN'), ('data', []),
                   ('catalogue_sha256', 'sha256:not-a-digest')]
        for field, value in changes:
            with self.subTest(field=field):
                body = {**self.body, field: value}
                with self.assertRaisesRegex(ValueError, '^READ_ENVELOPE_INVALID$'):
                    renewal.available(json.dumps(body), self.profile)

    def test_catalogue_revision_drift_is_not_accepted_as_a_positive_read(self):
        with self.assertRaisesRegex(ValueError, '^READ_CATALOGUE_CHANGED$'):
            renewal.available(json.dumps(self.body), self.profile, 'sha256:' + 'b' * 64)

    def test_old_future_and_non_utc_source_timestamps_are_rejected(self):
        now = datetime.now(timezone.utc)
        timestamps = [(now - timedelta(seconds=130)).isoformat(),
                      (now + timedelta(seconds=130)).isoformat(),
                      now.astimezone(timezone(timedelta(hours=7))).isoformat()]
        for timestamp in timestamps:
            with self.subTest(timestamp=timestamp):
                with self.assertRaisesRegex(ValueError, '^READ_TIMESTAMP_NOT_CURRENT$'):
                    renewal.available(json.dumps({**self.body, 'as_of': timestamp}), self.profile)

    def test_page_one_row_and_partial_cursor_are_bound_to_the_exact_target(self):
        relation = {'schema': 'TEST_ONLY_schema', 'relation': 'TEST_ONLY_relation'}
        body = {**self.body, 'completeness': 'PARTIAL', 'data': {
            'items': [{'TEST_ONLY': True}], 'next_cursor': 'TEST_ONLY_cursor',
            'relation': relation, 'kind': 'portfolio'}}
        renewal.page_data(body, relation=relation, kind='portfolio')
        for kwargs in ({'relation': {'schema': 'other', 'relation': 'other'}},
                       {'kind': 'account'}):
            with self.subTest(target=kwargs):
                with self.assertRaisesRegex(ValueError, '^READ_TARGET_INVALID$'):
                    renewal.page_data(body, **kwargs)

    def test_oversized_rows_bad_cursor_or_partial_completeness_mismatch_are_denied(self):
        cases = [('COMPLETE', {'items': [{}, {}], 'next_cursor': None}),
                 ('COMPLETE', {'items': ['not-an-object'], 'next_cursor': None}),
                 ('COMPLETE', {'items': [], 'next_cursor': ''}),
                 ('PARTIAL', {'items': [], 'next_cursor': 'x' * 4097}),
                 ('COMPLETE', {'items': [], 'next_cursor': 'TEST_ONLY_cursor'}),
                 ('PARTIAL', {'items': [], 'next_cursor': None})]
        for index, (completeness, data) in enumerate(cases):
            with self.subTest(case=index):
                with self.assertRaisesRegex(ValueError, '^READ_PAGE_INVALID$'):
                    renewal.page_data({**self.body, 'completeness': completeness, 'data': data})


class StagedCertificateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        CertificateTests.setUpClass()

    def setUp(self):
        fixture = CertificateTests
        self.now = datetime.now(timezone.utc)
        self.runtime = Path('/TEST_ONLY_NEVER_READ/runtime')
        self.bundle = Path('/TEST_ONLY_NEVER_READ/renewal-epg10-08-fixture')
        self.targets = tuple(self.runtime / f'TEST_ONLY_target_{i}.pem' for i in range(4))
        self.manifest = {'ca_sha256': fixture.ca.fingerprint(hashes.SHA256()).hex()}
        self.key = fixture.leaf_key.private_bytes(serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
        self.blobs = {self.runtime / 'mtls-ca-cert.pem': fixture.ca.public_bytes(serialization.Encoding.PEM),
                      self.runtime / 'facade-server-key.pem': self.key,
                      self.runtime / 'issuer-server-key.pem': self.key}
        original = fixture.leaf.public_bytes(serialization.Encoding.PEM)
        for i, target in enumerate(self.targets):
            self.blobs[target] = original + (self.key if i >= 2 else b'')
            for label in ('primary', 'fallback'):
                certificate = renewal.renew(fixture.leaf, fixture.leaf_key, fixture.ca,
                                             fixture.ca_key, self.now)
                self.blobs[self.bundle / f'{label}-{i}.pem'] = certificate + (self.key if i >= 2 else b'')

    def validate(self):
        with patch.object(renewal, 'RUNTIME', self.runtime), \
                patch.object(renewal, 'TARGETS', self.targets), \
                patch.object(renewal, 'CA_SHA', self.manifest['ca_sha256']), \
                patch.object(renewal, 'private_read', side_effect=self.blobs.__getitem__):
            renewal.validate_staged(self.bundle, self.manifest)

    def variant(self, *, subject=None, key=None, until=None, signer=None):
        fixture = CertificateTests
        builder = (x509.CertificateBuilder().subject_name(subject or fixture.leaf.subject)
                   .issuer_name(fixture.ca.subject).public_key((key or fixture.leaf_key).public_key())
                   .serial_number(x509.random_serial_number())
                   .not_valid_before(self.now - timedelta(minutes=5))
                   .not_valid_after(until or self.now + timedelta(days=30)))
        for extension in fixture.leaf.extensions:
            builder = builder.add_extension(extension.value, extension.critical)
        return builder.sign(signer or fixture.ca_key, algorithm=None).public_bytes(serialization.Encoding.PEM)

    def test_both_independent_current_same_identity_sets_validate_without_io(self):
        self.validate()

    def test_staged_expired_short_lived_changed_identity_or_key_is_rejected(self):
        path = self.bundle / 'primary-0.pem'
        original = self.blobs[path]
        changed_subject = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'TEST_ONLY changed')])
        variants = [self.variant(until=self.now - timedelta(seconds=1)),
                    self.variant(until=self.now + timedelta(hours=1)),
                    self.variant(subject=changed_subject), self.variant(key=CertificateTests.other_key)]
        for index, blob in enumerate(variants):
            with self.subTest(case=index):
                self.blobs[path] = blob
                with self.assertRaisesRegex(ValueError, '^STAGED_CERTIFICATE_INVALID$'):
                    self.validate()
        self.blobs[path] = original

    def test_staged_foreign_signature_is_rejected(self):
        self.blobs[self.bundle / 'primary-0.pem'] = self.variant(signer=CertificateTests.other_key)
        with self.assertRaises(InvalidSignature):
            self.validate()

    def test_staged_client_private_key_must_match_the_existing_identity(self):
        foreign = CertificateTests.other_key.private_bytes(serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
        self.blobs[self.bundle / 'primary-2.pem'] = self.variant() + foreign
        with self.assertRaisesRegex(ValueError, '^STAGED_CLIENT_KEY_CHANGED$'):
            self.validate()

    def test_fallback_must_be_distinct_not_a_copy_of_primary_certificate(self):
        self.blobs[self.bundle / 'fallback-0.pem'] = self.blobs[self.bundle / 'primary-0.pem']
        with self.assertRaisesRegex(ValueError, '^RECOVERY_CERTIFICATE_NOT_INDEPENDENT$'):
            self.validate()


class OperationAndContainmentTests(unittest.TestCase):
    def test_operation_guard_prevents_subprocess_file_publication_and_network(self):
        with patch.object(renewal, '_operation_guard', side_effect=ValueError('TEST_ONLY_LEASE_LOST')), \
                patch.object(renewal.subprocess, 'run') as run, \
                patch.object(renewal.tempfile, 'mkstemp') as create, \
                patch.object(renewal.os, 'replace') as replace, \
                patch.object(renewal.http.client, 'HTTPSConnection') as connection:
            operations = [lambda: renewal.command(['TEST_ONLY_NEVER_EXECUTED']),
                          lambda: renewal.replace_exact(Path('/TEST_ONLY_NEVER_READ'), b'', {}),
                          lambda: renewal.request('TEST_ONLY.invalid', 443, '/', object())]
            for operation in operations:
                with self.assertRaisesRegex(ValueError, '^TEST_ONLY_LEASE_LOST$'):
                    operation()
            for mutation in (run, create, replace, connection):
                mutation.assert_not_called()

    def test_prepare_checks_lock_before_private_material_or_staging(self):
        with patch.object(renewal, 'check_lock', side_effect=ValueError('FOREIGN_MEASUREMENT_LOCK_ACTIVE')), \
                patch.object(renewal, 'private_read') as read, \
                patch.object(renewal.tempfile, 'mkdtemp') as stage:
            with self.assertRaisesRegex(ValueError, '^FOREIGN_MEASUREMENT_LOCK_ACTIVE$'):
                renewal.prepare()
            read.assert_not_called()
            stage.assert_not_called()

    def test_publish_checks_guard_before_any_private_read_or_replacement(self):
        with patch.object(renewal, '_operation_guard', side_effect=ValueError('REPAIR_OPERATION_DEADLINE')), \
                patch.object(renewal, 'private_read') as read, \
                patch.object(renewal, 'replace_exact') as replace, \
                patch.object(renewal, 'reload_contexts') as reload:
            with self.assertRaisesRegex(ValueError, '^REPAIR_OPERATION_DEADLINE$'):
                renewal.publish(Path('/TEST_ONLY_NEVER_READ'), {'targets': [{}]}, 'primary')
            for operation in (read, replace, reload):
                operation.assert_not_called()

    def test_deadline_raises_and_always_restores_previous_signal_handler(self):
        previous = object()
        with patch.object(renewal.signal, 'signal', side_effect=[previous, None]) as handler, \
                patch.object(renewal.signal, 'setitimer') as timer:
            with self.assertRaisesRegex(TimeoutError, '^REPAIR_STAGE_DEADLINE$'):
                with renewal.bounded_stage(10):
                    handler.call_args_list[0].args[1](None, None)
            self.assertEqual(handler.call_args_list[-1].args,
                             (renewal.signal.SIGALRM, previous))
            self.assertEqual([call.args for call in timer.call_args_list],
                             [(renewal.signal.ITIMER_REAL, 10), (renewal.signal.ITIMER_REAL, 0)])

    def test_containment_attempts_all_six_even_if_one_stop_command_fails(self):
        states = [{'running': False} for _ in renewal.SERVICES[:6]]
        states.extend({'running': True} for _ in renewal.SERVICES[6:])
        with patch.object(renewal, 'command', side_effect=[RuntimeError('TEST_ONLY failure')] + [b''] * 5) as stop, \
                patch.object(renewal, 'roster', return_value=states) as inspect:
            with self.assertRaisesRegex(ValueError, '^REPAIR_AND_FALLBACK_FAILED_AFFECTED_MANAGERS_STOPPED$'):
                renewal.contain_failure()
            self.assertEqual([call.args[0][-1] for call in stop.call_args_list], list(renewal.SERVICES[:6]))
            self.assertTrue(all(call.args[0][:4] == ['docker', 'stop', '--time', '10']
                                for call in stop.call_args_list))
            inspect.assert_called_once_with(guarded=False)

    def test_containment_does_not_claim_stopped_when_a_manager_still_runs(self):
        states = [{'running': i == 0} for i in range(len(renewal.SERVICES))]
        with patch.object(renewal, 'command', return_value=b'') as stop, \
                patch.object(renewal, 'roster', return_value=states):
            with self.assertRaisesRegex(ValueError, '^REPAIR_FAILED_CONTAINMENT_UNCONFIRMED$'):
                renewal.contain_failure()
            self.assertEqual(stop.call_count, 6)

    def test_containment_requires_actual_roster_not_only_successful_stop_intent(self):
        with patch.object(renewal, 'command', return_value=b'') as stop, \
                patch.object(renewal, 'roster', side_effect=RuntimeError('TEST_ONLY inspection unavailable')):
            with self.assertRaises(RuntimeError):
                renewal.contain_failure()
            self.assertEqual(stop.call_count, 6)


class PrivateRoundTripTests(unittest.TestCase):
    """Real TEST_ONLY crypto/files/lock; operational I/O is always mocked."""
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='epg08-test-only-roundtrip-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / 'TEST_ONLY_secure'
        self.root.mkdir(mode=0o700)
        self.runtime = self.root / 'runtime'
        self.proxy = self.root / 'TEST_ONLY_proxy'
        self.runtime.mkdir(mode=0o700)
        self.proxy.mkdir(mode=0o700)
        self.lock = self.root / 'TEST_ONLY_measurement.lock'
        now = datetime.now(timezone.utc)
        ca_key = Ed25519PrivateKey.generate()
        ca_name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'TEST_ONLY roundtrip CA')])
        ca = (x509.CertificateBuilder().subject_name(ca_name).issuer_name(ca_name)
              .public_key(ca_key.public_key()).serial_number(x509.random_serial_number())
              .not_valid_before(now - timedelta(days=90)).not_valid_after(now + timedelta(days=365))
              .add_extension(x509.BasicConstraints(ca=True, path_length=None), True)
              .sign(ca_key, algorithm=None))

        def write(path, data):
            path.write_bytes(data)
            path.chmod(0o600)

        def private_bytes(key):
            return key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                     serialization.NoEncryption())

        self.ca_key_path = self.root / 'TEST_ONLY_ca_private.pem'
        write(self.ca_key_path, private_bytes(ca_key))
        write(self.runtime / 'mtls-ca-cert.pem', ca.public_bytes(serialization.Encoding.PEM))
        for label, stem, client in (('manager-facade', 'facade-server', False),
                                     ('manager-issuer', 'issuer-server', False),
                                     ('TEST_ONLY_proxy_client', 'source-proxy-manager-client', True)):
            key = Ed25519PrivateKey.generate()
            leaf = (x509.CertificateBuilder()
                    .subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, label)]))
                    .issuer_name(ca_name).public_key(key.public_key())
                    .serial_number(x509.random_serial_number())
                    .not_valid_before(now - timedelta(days=50))
                    .not_valid_after(now - timedelta(days=20))
                    .add_extension(x509.BasicConstraints(ca=False, path_length=None), True)
                    .add_extension(x509.SubjectAlternativeName([x509.DNSName(label)]), False)
                    .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.CLIENT_AUTH
                        if client else ExtendedKeyUsageOID.SERVER_AUTH]), False)
                    .sign(ca_key, algorithm=None)).public_bytes(serialization.Encoding.PEM)
            if client:
                write(self.runtime / f'{stem}.pem', leaf + private_bytes(key))
                write(self.proxy / 'manager-v2-client.pem', leaf + private_bytes(key))
            else:
                write(self.runtime / f'{stem}-cert.pem', leaf)
                write(self.runtime / f'{stem}-key.pem', private_bytes(key))
        self.targets = (self.runtime / 'facade-server-cert.pem', self.runtime / 'issuer-server-cert.pem',
                        self.runtime / 'source-proxy-manager-client.pem', self.proxy / 'manager-v2-client.pem')
        self.original_inputs = {path: path.read_bytes() for path in self.root.rglob('*.pem')}
        self.scope = ExitStack()
        self.addCleanup(self.scope.close)
        self.addCleanup(self.overwrite_test_files)
        self.scope.enter_context(patch.multiple(renewal, ROOT=self.root, RUNTIME=self.runtime,
            PROXY=self.proxy, CA_KEY=self.ca_key_path, CA_SHA=ca.fingerprint(hashes.SHA256()).hex(),
            LOCK=self.lock, TARGETS=self.targets))
        self.roster = [{'name': name, 'id': f'TEST_ONLY_{index}', 'image': 'TEST_ONLY_image',
                        'config': 'TEST_ONLY_config', 'running': True}
                       for index, name in enumerate(renewal.SERVICES)]
        self.scope.enter_context(patch.object(renewal, 'roster', return_value=self.roster))
        self.scope.enter_context(patch.object(renewal, 'command',
            side_effect=AssertionError('TEST_ONLY_NO_OPERATIONAL_COMMAND_ALLOWED')))
        self.scope.enter_context(patch.object(renewal.socket, 'create_connection',
            side_effect=AssertionError('TEST_ONLY_NO_NETWORK_ALLOWED')))
        self.scope.enter_context(patch.object(renewal.http.client, 'HTTPSConnection',
            side_effect=AssertionError('TEST_ONLY_NO_HTTP_ALLOWED')))

    def overwrite_test_files(self):
        # Logical overwrite of this test's small files only; no SSD-erasure claim.
        for path in self.root.rglob('*'):
            if path.is_file() and not path.is_symlink():
                with path.open('r+b') as stream:
                    stream.write(b'\0' * path.stat().st_size)
                    stream.flush()
                    os.fsync(stream.fileno())

    def assert_original_inputs_unchanged(self):
        for path, expected in self.original_inputs.items():
            self.assertEqual(path.read_bytes(), expected, path.name)

    def test_prepare_roundtrip_has_thirteen_private_files_valid_sets_and_no_live_change(self):
        result = renewal.prepare()
        bundle = Path(result['private_bundle'])
        self.assertEqual(result['status'], 'PREPARED_NOT_ACTIVATED')
        self.assertEqual(result['runtime_mutations'], 0)
        expected = {f'{label}-{i}.pem' for label in ('primary', 'fallback', 'original') for i in range(4)}
        self.assertEqual({path.name for path in bundle.iterdir()}, expected | {'manifest.json'})
        self.assertEqual(bundle.stat().st_mode & 0o777, 0o700)
        self.assertTrue(all(path.stat().st_mode & 0o777 == 0o600 for path in bundle.iterdir()))
        manifest = json.loads(renewal.private_read(bundle / 'manifest.json'))
        renewal.validate_staged(bundle, manifest)
        self.assertEqual(result['manifest_sha256'], renewal.sha(renewal.private_read(bundle / 'manifest.json')))
        self.assert_original_inputs_unchanged()
        self.assertFalse(self.lock.exists())

    def test_prepare_partial_write_failure_removes_only_its_new_bundle(self):
        sentinel = self.root / 'TEST_ONLY_keep'
        sentinel.write_bytes(b'TEST_ONLY retained unrelated file')
        original_write = renewal.write_new
        calls = 0

        def fail_third_write(*args, **kwargs):
            nonlocal calls
            calls += 1
            if calls == 3:
                raise OSError('TEST_ONLY injected partial-stage failure')
            return original_write(*args, **kwargs)

        with patch.object(renewal, 'write_new', side_effect=fail_third_write):
            with self.assertRaises(OSError):
                renewal.prepare()
        self.assertEqual(calls, 3)
        self.assertEqual(list(self.root.glob('renewal-epg10-08-*')), [])
        self.assertEqual(sentinel.read_bytes(), b'TEST_ONLY retained unrelated file')
        self.assert_original_inputs_unchanged()

    def test_activate_publishes_four_primary_test_files_under_real_temporary_lock(self):
        bundle = Path(renewal.prepare()['private_bundle'])
        original_replace = renewal.replace_exact

        def proof():
            self.assertTrue(self.lock.exists())
            self.assertEqual(json.loads(self.lock.read_text())['owner'], 'epg10-08-manager-tls-repair')
            return {'TEST_ONLY_qualified': True}

        with patch.object(renewal, 'replace_exact', wraps=original_replace) as replace, \
                patch.object(renewal, 'reload_contexts') as reload, \
                patch.object(renewal, 'qualify', side_effect=proof):
            result = renewal.activate(bundle)
        self.assertEqual(result['status'], 'MANAGER_TLS_REPAIRED_NOT_HUMAN_POLICY_ACCEPTANCE')
        self.assertEqual(replace.call_count, 4)
        reload.assert_called_once_with()
        for i, path in enumerate(self.targets):
            self.assertEqual(path.read_bytes(), renewal.private_read(bundle / f'primary-{i}.pem'))
        self.assertFalse(self.lock.exists())
        self.assertEqual(list(self.runtime.glob('.epg10-08-*')), [])
        self.assertEqual(list(self.proxy.glob('.epg10-08-*')), [])

    def test_activate_failed_primary_qualifies_and_installs_valid_fallback_not_expired_originals(self):
        bundle = Path(renewal.prepare()['private_bundle'])
        original_replace = renewal.replace_exact
        with patch.object(renewal, 'replace_exact', wraps=original_replace) as replace, \
                patch.object(renewal, 'reload_contexts') as reload, \
                patch.object(renewal, 'qualify', side_effect=[ValueError('TEST_ONLY_PRIMARY_FAILED'),
                                                          {'TEST_ONLY_qualified': True}]) as qualify, \
                patch.object(renewal, 'contain_failure') as contain:
            with self.assertRaisesRegex(ValueError, '^PRIMARY_FAILED_VALID_FALLBACK_LOADED$'):
                renewal.activate(bundle)
        self.assertEqual(replace.call_count, 8)
        self.assertEqual(reload.call_count, 2)
        self.assertEqual(qualify.call_count, 2)
        contain.assert_not_called()
        for i, path in enumerate(self.targets):
            self.assertEqual(path.read_bytes(), renewal.private_read(bundle / f'fallback-{i}.pem'))
            self.assertNotEqual(path.read_bytes(), self.original_inputs[path])
            leaf = x509.load_pem_x509_certificate(path.read_bytes())
            self.assertGreater(leaf.not_valid_after.replace(tzinfo=timezone.utc), datetime.now(timezone.utc))
        self.assertFalse(self.lock.exists())


class FullQualificationTests(unittest.TestCase):
    def test_six_leaf_pins_and_all_profile_routes_use_observed_405_not_location_guess(self):
        CertificateTests.setUpClass()
        certificate = CertificateTests.leaf
        pem = certificate.public_bytes(serialization.Encoding.PEM)
        der = certificate.public_bytes(serialization.Encoding.DER)
        digest = 'sha256:' + 'c' * 64
        relation = {'schema': 'TEST_ONLY_schema', 'relation': 'TEST_ONLY_relation'}
        expected_profiles = {host: profile_id for host, _profile, profile_id in renewal.PROFILES}
        base = '/portal/execution/v2/manager'
        for wrong_post_denial in (False, True):
            with self.subTest(wrong_post_denial=wrong_post_denial):
                context = MagicMock()
                missing_identity = object()
                secured = context.wrap_socket.return_value.__enter__.return_value
                secured.getpeercert.return_value = der
                secured.version.return_value = 'TLSv1.3'

                def response(host, port, path, identity, method='GET'):
                    self.assertEqual(port, 8444)
                    profile_id = expected_profiles[host]
                    if identity is missing_identity:
                        return 403, b''
                    if method == 'POST':
                        return (403 if wrong_post_denial else 405), b''
                    if method == 'HEAD':
                        return 405, b''
                    if path == base + '/not-allowed':
                        return 404, b''
                    if path == base + '/catalog':
                        data = {'relations': [{'id': relation}], 'relation_count': 1,
                                'catalogue_revision': digest}
                    elif path == base + '/capabilities':
                        data = {'contract_revision': renewal.RUNTIME_CONTRACT,
                                'active_profile_id': profile_id,
                                'capabilities': [{'registered': True, 'source_binding': True} for _ in range(5)]}
                    elif path == base + '/records/TEST_ONLY_schema/TEST_ONLY_relation?limit=1':
                        data = {'items': [], 'next_cursor': None, 'relation': relation}
                    elif path == base + '/projections/portfolio?limit=1':
                        data = {'items': [], 'next_cursor': None, 'kind': 'portfolio'}
                    else:
                        self.fail('Unexpected TEST_ONLY qualification route')
                    return 200, json.dumps({'contract_version': renewal.RUNTIME_CONTRACT,
                        'authority': 'EXECUTION_CELL', 'profile_id': profile_id,
                        'availability': 'AVAILABLE', 'freshness': 'FRESH', 'completeness': 'COMPLETE',
                        'catalogue_sha256': digest, 'as_of': datetime.now(timezone.utc).isoformat(),
                        'data': data}).encode()

                with patch.object(renewal, '_operation_guard'), \
                        patch.object(renewal, 'private_read', return_value=pem), \
                        patch.object(renewal.socket, 'create_connection') as connect, \
                        patch.object(renewal, 'tls_context', side_effect=lambda _ca, identity=None:
                                     context if identity is not None else missing_identity), \
                        patch.object(renewal, 'request', side_effect=response) as request:
                    if wrong_post_denial:
                        with self.assertRaisesRegex(ValueError, '^ROUTE_DENIAL_FAILED$'):
                            renewal.qualify()
                    else:
                        proof = renewal.qualify()
                        self.assertEqual(len(proof['loaded_manager_tls']), 6)
                        self.assertTrue(all(item['certificate_sha256'] == renewal.sha(der)
                                            for item in proof['loaded_manager_tls']))
                        self.assertEqual(len(proof['proxy_profiles']), 3)
                        self.assertTrue(all(item['positive_reads'] == 4 and item['negative_cases'] == 4
                                            and not item['business_rows_recorded']
                                            for item in proof['proxy_profiles']))
                        self.assertEqual(request.call_count, 24)
                        self.assertEqual(proof['financial_effects'], 0)
                        self.assertFalse(proof['human_current_policy_qualification'])
                    self.assertEqual(connect.call_count, 6)
                    self.assertEqual(context.wrap_socket.call_count, 6)


if __name__ == '__main__':
    unittest.main()
