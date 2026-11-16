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

    def renew_for(self, days, ca_days=284):
        return renewal.renew(self.leaf, self.leaf_key, self.make_ca(after=self.now + timedelta(days=ca_days)),
                             self.ca_key, self.now, days)

    def test_explicit_validity_sets_not_after_and_default_is_unchanged(self):
        for days, explicit in ((30, False), (30, True), (270, True)):
            with self.subTest(days=days, explicit=explicit):
                pem = self.renew() if not explicit else self.renew_for(days)
                updated = x509.load_pem_x509_certificate(pem)
                self.assertEqual(updated.not_valid_after.replace(tzinfo=timezone.utc),
                                 self.now + timedelta(days=days))
        self.assertEqual(renewal.DEFAULT_VALIDITY_DAYS, 30)

    def test_explicit_validity_must_end_seven_days_before_the_ca(self):
        self.renew_for(277)  # exactly CA notAfter - 7 days is still allowed
        for days in (278, 280, 283):
            with self.subTest(days=days):
                with self.assertRaisesRegex(ValueError, '^LEAF_VALIDITY_EXCEEDS_CA_MARGIN$'):
                    self.renew_for(days)
        with self.assertRaisesRegex(ValueError, '^CA_VALIDITY_INSUFFICIENT$'):
            self.renew_for(284)

    def test_explicit_validity_range_is_one_to_3700_days(self):
        for days in (0, -1, 3701):
            with self.subTest(days=days):
                with self.assertRaisesRegex(ValueError, '^LEAF_VALIDITY_OUT_OF_RANGE$'):
                    self.renew_for(days, ca_days=4000)
        self.assertTrue(self.renew_for(3700, ca_days=3800))
        self.assertTrue(self.renew_for(1))

    def test_cli_new_ca_options_are_prepare_only_and_ca_days_default_to_3650(self):
        for argv, expected_code, called in (
                (['--prepare', '--new-ca', '--validity-days', '270'], None, (270, 3650)),
                (['--prepare', '--new-ca', '--ca-validity-days', '900'], None, (None, 900)),
                (['--prepare', '--new-ca', '--ca-validity-days', '0'], None, (None, 0)),
                (['--prepare', '--ca-validity-days', '900'], 'NEW_CA_OPTIONS_INVALID', None),
                (['--activate', '/TEST_ONLY_NEVER_READ', '--new-ca'], 'NEW_CA_OPTIONS_INVALID', None)):
            with self.subTest(argv=argv):
                output = io.StringIO()
                with patch('sys.argv', ['renew_manager_tls.py', *argv]), \
                        patch.object(renewal, 'prepare', return_value={}) as prepare, \
                        patch.object(renewal, 'activate') as activate, patch('sys.stdout', output):
                    code = renewal.main()
                activate.assert_not_called()
                if expected_code is None:
                    self.assertEqual(code, 0)
                    prepare.assert_called_once_with(called[0], new_ca_days=called[1])
                else:
                    self.assertEqual(json.loads(output.getvalue())['code'], expected_code)
                    prepare.assert_not_called()

    def test_served_certificate_chain_must_match_the_new_ca_when_one_is_given(self):
        leaf = CertificateTests.leaf  # TEST_ONLY leaf issued by the CertificateTests CA
        pem = leaf.public_bytes(serialization.Encoding.PEM)
        foreign = CertificateTests.other_key
        same_subject_other_key = (x509.CertificateBuilder().subject_name(CertificateTests.ca_name)
            .issuer_name(CertificateTests.ca_name).public_key(foreign.public_key())
            .serial_number(2).not_valid_before(CertificateTests.now - timedelta(days=1))
            .not_valid_after(CertificateTests.now + timedelta(days=1)).sign(foreign, algorithm=None))
        wrong_name = (x509.CertificateBuilder().subject_name(x509.Name([x509.NameAttribute(
            NameOID.COMMON_NAME, 'TEST_ONLY another CA')])).issuer_name(x509.Name([x509.NameAttribute(
            NameOID.COMMON_NAME, 'TEST_ONLY another CA')])).public_key(foreign.public_key())
            .serial_number(1).not_valid_before(CertificateTests.now - timedelta(days=1))
            .not_valid_after(CertificateTests.now + timedelta(days=1))
            .sign(foreign, algorithm=None))
        with patch.object(renewal, '_operation_guard'), patch.object(renewal, 'private_read', return_value=pem), \
                patch.object(renewal, 'tls_context', return_value=MagicMock()), \
                patch.object(renewal.socket, 'create_connection', side_effect=RuntimeError('TEST_ONLY_STOP')):
            with self.assertRaisesRegex(ValueError, '^SERVED_CHAIN_NOT_NEW_CA$'):
                renewal.qualify(wrong_name)  # different issuer subject
            with self.assertRaises(InvalidSignature):
                renewal.qualify(same_subject_other_key)  # same subject, different key
            with self.assertRaises(RuntimeError):  # chain check passed, then network (mocked) stops
                renewal.qualify(CertificateTests.ca)

    def test_cli_accepts_validity_days_only_with_prepare(self):
        for argv, expected_code, called in (
                (['--prepare', '--validity-days', '270'], None, 270),
                (['--prepare'], None, None),
                (['--activate', '/TEST_ONLY_NEVER_READ', '--validity-days', '270'],
                 'VALIDITY_DAYS_ONLY_WITH_PREPARE', False)):
            with self.subTest(argv=argv):
                output = io.StringIO()
                with patch('sys.argv', ['renew_manager_tls.py', *argv]), \
                        patch.object(renewal, 'prepare', return_value={}) as prepare, \
                        patch.object(renewal, 'activate') as activate, patch('sys.stdout', output):
                    code = renewal.main()
                activate.assert_not_called()
                if expected_code is None:
                    self.assertEqual(code, 0)
                    prepare.assert_called_once_with(called, new_ca_days=None)
                else:
                    self.assertEqual(code, 2)
                    self.assertEqual(json.loads(output.getvalue())['code'], expected_code)
                    prepare.assert_not_called()


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

    def test_public_trust_anchor_mode_is_accepted_only_when_the_caller_allows_it(self):
        self.file.chmod(0o644)
        with self.assertRaisesRegex(ValueError, '^PRIVATE_FILE_INVALID$'):
            renewal.private_read(self.file)
        self.assertEqual(renewal.private_read(self.file, renewal.PUBLIC_MODES), self.file.read_bytes())
        self.file.chmod(0o666)
        with self.assertRaisesRegex(ValueError, '^PRIVATE_FILE_INVALID$'):
            renewal.private_read(self.file, renewal.PUBLIC_MODES)

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
                    .add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(ca_key.public_key()), False)
                    .sign(ca_key, algorithm=None)).public_bytes(serialization.Encoding.PEM)
            if client:
                write(self.runtime / f'{stem}.pem', leaf + private_bytes(key))
                write(self.proxy / 'manager-v2-client.pem', leaf + private_bytes(key))
            else:
                write(self.runtime / f'{stem}-cert.pem', leaf)
                write(self.runtime / f'{stem}-key.pem', private_bytes(key))
        self.targets = (self.runtime / 'facade-server-cert.pem', self.runtime / 'issuer-server-cert.pem',
                        self.runtime / 'source-proxy-manager-client.pem', self.proxy / 'manager-v2-client.pem')
        self.old_ca = ca
        self.anchors = (self.runtime / 'mtls-ca-cert.pem', self.proxy / 'manager-v2-ca.crt')
        write(self.anchors[1], ca.public_bytes(serialization.Encoding.PEM))
        self.anchors[1].chmod(0o644)  # Public proxy CA file, like the real one.
        self.original_inputs = {path: path.read_bytes() for path in self.root.rglob('*.pem')}
        self.original_inputs[self.anchors[1]] = self.anchors[1].read_bytes()
        self.scope = ExitStack()
        self.addCleanup(self.scope.close)
        self.addCleanup(self.overwrite_test_files)
        self.scope.enter_context(patch.multiple(renewal, ROOT=self.root, RUNTIME=self.runtime,
            PROXY=self.proxy, CA_KEY=self.ca_key_path, CA_SHA=ca.fingerprint(hashes.SHA256()).hex(),
            LOCK=self.lock, TARGETS=self.targets, ANCHORS=self.anchors))
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

    def staged_leaf(self, bundle):
        return x509.load_pem_x509_certificate(renewal.private_read(bundle / 'primary-0.pem'))

    def test_prepare_default_manifest_records_30_days_and_matching_not_after(self):
        bundle = Path(renewal.prepare()['private_bundle'])
        manifest = json.loads(renewal.private_read(bundle / 'manifest.json'))
        self.assertEqual(manifest['validity_days'], 30)
        self.assertEqual(self.staged_leaf(bundle).not_valid_after.replace(tzinfo=timezone.utc),
                         datetime.fromisoformat(manifest['leaf_not_after_utc']))

    def test_prepare_with_validity_days_records_it_and_stages_matching_certificates(self):
        bundle = Path(renewal.prepare(270)['private_bundle'])
        manifest = json.loads(renewal.private_read(bundle / 'manifest.json'))
        self.assertEqual(manifest['validity_days'], 270)
        expected = datetime.fromisoformat(manifest['leaf_not_after_utc'])
        created = datetime.fromisoformat(manifest['created_utc'])
        self.assertEqual(expected, (created + timedelta(days=270)).replace(microsecond=0))
        for label in ('primary', 'fallback'):
            for i in range(4):
                leaf = x509.load_pem_x509_certificate(renewal.private_read(bundle / f'{label}-{i}.pem'))
                self.assertEqual(leaf.not_valid_after.replace(tzinfo=timezone.utc), expected)
        renewal.validate_staged(bundle, manifest)
        self.assert_original_inputs_unchanged()

    def test_activation_validation_refuses_manifest_not_after_that_differs_from_staged(self):
        bundle = Path(renewal.prepare(270)['private_bundle'])
        manifest = json.loads(renewal.private_read(bundle / 'manifest.json'))
        for delta in (timedelta(seconds=1), timedelta(days=-1), timedelta(days=30)):
            with self.subTest(delta=delta):
                changed = {**manifest, 'leaf_not_after_utc':
                           (datetime.fromisoformat(manifest['leaf_not_after_utc']) + delta).isoformat()}
                with self.assertRaisesRegex(ValueError, '^STAGED_VALIDITY_MISMATCH$'):
                    renewal.validate_staged(bundle, changed)

    def test_prepare_refuses_bad_validity_before_staging_anything(self):
        for days, code in ((0, 'LEAF_VALIDITY_OUT_OF_RANGE'), (3701, 'LEAF_VALIDITY_OUT_OF_RANGE'),
                           (360, 'LEAF_VALIDITY_EXCEEDS_CA_MARGIN')):  # CA ends in 365 days
            with self.subTest(days=days):
                with self.assertRaisesRegex(ValueError, '^' + code + '$'):
                    renewal.prepare(days)
                self.assertEqual(list(self.root.glob('renewal-epg10-08-*')), [])
        self.assert_original_inputs_unchanged()

    def prepare_new_ca(self, days=270, ca_days=3650):
        # The old CA private key must not be needed: point CA_KEY at a missing file.
        with patch.object(renewal, 'CA_KEY', self.root / 'TEST_ONLY_missing_old_ca_key'):
            result = renewal.prepare(days, new_ca_days=ca_days)
        bundle = Path(result['private_bundle'])
        return result, bundle, json.loads(renewal.private_read(bundle / 'manifest.json'))

    def load_new_ca(self, bundle):
        return x509.load_pem_x509_certificate(renewal.private_read(bundle / 'new-ca.pem'))

    def test_new_ca_prepare_stages_dual_trust_bundles_and_new_ca_signed_leaves(self):
        result, bundle, manifest = self.prepare_new_ca()
        new_ca = self.load_new_ca(bundle)
        names = {f'{label}-{i}.pem' for label in ('primary', 'fallback', 'original') for i in range(6)}
        self.assertEqual({path.name for path in bundle.iterdir()},
                         names | {'manifest.json', 'new-ca.pem', 'new-ca-key.pem'})
        self.assertEqual(bundle.stat().st_mode & 0o777, 0o700)
        self.assertTrue(all(path.stat().st_mode & 0o777 == 0o600 for path in bundle.iterdir()))
        self.assertTrue(manifest['new_ca'])
        self.assertEqual(manifest['new_ca_sha256'], new_ca.fingerprint(hashes.SHA256()).hex())
        self.assertEqual(result['new_ca_sha256'], manifest['new_ca_sha256'])
        self.assertEqual(manifest['ca_sha256'], self.old_ca.fingerprint(hashes.SHA256()).hex())
        self.assertEqual([t['path'] for t in manifest['targets']],
                         [str(p) for p in (*self.targets, *self.anchors)])
        self.assertNotIn('PRIVATE KEY', json.dumps(result) + json.dumps(manifest))
        # CA shape: self-signed, distinct subject, CA:TRUE pathlen 0, expiry = now + M days.
        self.assertEqual(new_ca.subject, new_ca.issuer)
        self.assertNotEqual(new_ca.subject, self.old_ca.subject)
        constraints = new_ca.extensions.get_extension_for_class(x509.BasicConstraints)
        self.assertTrue(constraints.critical and constraints.value.ca and constraints.value.path_length == 0)
        created = datetime.fromisoformat(manifest['created_utc'])
        self.assertEqual(new_ca.not_valid_after.replace(tzinfo=timezone.utc),
                         (created + timedelta(days=3650)).replace(microsecond=0))
        new_ca.public_key().verify(new_ca.signature, new_ca.tbs_certificate_bytes)
        # Trust bundles: old CA first, then new CA; both sets identical in content.
        for label in ('primary', 'fallback'):
            for i in (4, 5):
                pems = x509.load_pem_x509_certificates(renewal.private_read(bundle / f'{label}-{i}.pem'))
                self.assertEqual([c.fingerprint(hashes.SHA256()).hex() for c in pems],
                                 [manifest['ca_sha256'], manifest['new_ca_sha256']])
            for i in range(4):
                leaf = x509.load_pem_x509_certificate(renewal.private_read(bundle / f'{label}-{i}.pem'))
                original = x509.load_pem_x509_certificate(self.original_inputs[self.targets[i]])
                self.assertEqual(leaf.issuer, new_ca.subject)
                new_ca.public_key().verify(leaf.signature, leaf.tbs_certificate_bytes)
                self.assertEqual(leaf.subject, original.subject)
                self.assertEqual(renewal.public_key(leaf.public_key()), renewal.public_key(original.public_key()))
                self.assertEqual(renewal.identity_extensions(leaf, True), renewal.identity_extensions(original, True))
                aki = leaf.extensions.get_extension_for_class(x509.AuthorityKeyIdentifier).value
                self.assertEqual(aki.key_identifier, x509.SubjectKeyIdentifier.from_public_key(
                    new_ca.public_key()).digest)
                self.assertEqual(leaf.not_valid_after.replace(tzinfo=timezone.utc),
                                 datetime.fromisoformat(manifest['leaf_not_after_utc']))
        key = serialization.load_pem_private_key(renewal.private_read(bundle / 'new-ca-key.pem'), None)
        self.assertEqual(renewal.public_key(key.public_key()), renewal.public_key(new_ca.public_key()))
        renewal.validate_staged(bundle, manifest)
        self.assert_original_inputs_unchanged()

    def test_new_ca_leaf_cannot_outlive_new_ca_and_ranges_are_enforced(self):
        for kwargs, code in (({'days': 270, 'ca_days': 0}, 'NEW_CA_VALIDITY_OUT_OF_RANGE'),
                             ({'days': 270, 'ca_days': 3701}, 'NEW_CA_VALIDITY_OUT_OF_RANGE'),
                             ({'days': 3701, 'ca_days': 3650}, 'LEAF_VALIDITY_OUT_OF_RANGE'),
                             ({'days': 3644, 'ca_days': 3650}, 'LEAF_VALIDITY_EXCEEDS_CA_MARGIN'),
                             ({'days': 400, 'ca_days': 300}, 'CA_VALIDITY_INSUFFICIENT')):
            with self.subTest(**kwargs):
                with self.assertRaisesRegex(ValueError, '^' + code + '$'):
                    self.prepare_new_ca(**kwargs)
                self.assertEqual(list(self.root.glob('renewal-epg10-08-*')), [])
        self.assert_original_inputs_unchanged()

    def test_new_ca_prepare_refuses_an_anchor_that_is_not_exactly_the_pinned_old_ca(self):
        other = Ed25519PrivateKey.generate()
        name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'TEST_ONLY other CA')])
        now = datetime.now(timezone.utc)
        foreign = (x509.CertificateBuilder().subject_name(name).issuer_name(name)
                   .public_key(other.public_key()).serial_number(x509.random_serial_number())
                   .not_valid_before(now).not_valid_after(now + timedelta(days=5))
                   .add_extension(x509.BasicConstraints(ca=True, path_length=None), True)
                   .sign(other, algorithm=None)).public_bytes(serialization.Encoding.PEM)
        old = self.old_ca.public_bytes(serialization.Encoding.PEM)
        for blob in (foreign, old + foreign):  # wrong CA; already-dual (second prepare) bundle
            with self.subTest(size=len(blob)):
                self.anchors[1].write_bytes(blob)
                with self.assertRaisesRegex(ValueError, '^ANCHOR_NOT_PINNED_CA$'):
                    self.prepare_new_ca()
                self.assertEqual(list(self.root.glob('renewal-epg10-08-*')), [])

    def test_new_ca_validation_refuses_manifest_or_staged_tampering(self):
        _, bundle, manifest = self.prepare_new_ca()
        cases = [({**manifest, 'new_ca_sha256': 'a' * 64}, 'NEW_CA_INVALID'),
                 ({k: v for k, v in manifest.items() if k != 'new_ca_sha256'}, 'NEW_CA_INVALID'),
                 ({**manifest, 'leaf_not_after_utc': (datetime.fromisoformat(
                     manifest['leaf_not_after_utc']) + timedelta(days=1)).isoformat()},
                  'STAGED_VALIDITY_MISMATCH')]
        for changed, code in cases:
            with self.subTest(code=code):
                with self.assertRaisesRegex(ValueError, '^' + code + '$'):
                    renewal.validate_staged(bundle, changed)
        old = self.old_ca.public_bytes(serialization.Encoding.PEM)
        new = self.load_new_ca(bundle).public_bytes(serialization.Encoding.PEM)
        for blob in (old, new + old, old + new + old):  # old only, wrong order, extra certificate
            with self.subTest(trust_bundle_certificates=blob.count(b'BEGIN')):
                (bundle / 'fallback-5.pem').write_bytes(blob)
                with self.assertRaisesRegex(ValueError, '^STAGED_TRUST_BUNDLE_INVALID$'):
                    renewal.validate_staged(bundle, manifest)
        (bundle / 'fallback-5.pem').write_bytes(old + new)
        renewal.validate_staged(bundle, manifest)

    def test_new_ca_activate_publishes_six_files_then_probes_the_new_chain(self):
        _, bundle, manifest = self.prepare_new_ca()
        probed = []

        def proof(new_ca):
            probed.append(new_ca.fingerprint(hashes.SHA256()).hex())
            return {'TEST_ONLY_qualified': True}

        with patch.object(renewal, 'replace_exact', wraps=renewal.replace_exact) as replace, \
                patch.object(renewal, 'reload_contexts') as reload, \
                patch.object(renewal, 'qualify', side_effect=proof):
            result = renewal.activate(bundle)
        self.assertEqual(replace.call_count, 6)
        reload.assert_called_once_with()
        self.assertEqual(probed, [manifest['new_ca_sha256']])
        self.assertEqual(result['new_ca_sha256'], manifest['new_ca_sha256'])
        for i, path in enumerate((*self.targets, *self.anchors)):
            self.assertEqual(path.read_bytes(), renewal.private_read(bundle / f'primary-{i}.pem'))
        self.assertEqual(self.anchors[1].stat().st_mode & 0o777, 0o644)  # public mode preserved
        self.assertFalse(self.lock.exists())

    def test_new_ca_failed_primary_keeps_dual_bundles_and_installs_new_ca_fallback_leaves(self):
        _, bundle, manifest = self.prepare_new_ca()
        with patch.object(renewal, 'replace_exact', wraps=renewal.replace_exact) as replace, \
                patch.object(renewal, 'reload_contexts') as reload, \
                patch.object(renewal, 'qualify', side_effect=[ValueError('TEST_ONLY_PRIMARY_FAILED'),
                                                          {'TEST_ONLY_qualified': True}]), \
                patch.object(renewal, 'contain_failure') as contain:
            with self.assertRaisesRegex(ValueError, '^PRIMARY_FAILED_VALID_FALLBACK_LOADED$'):
                renewal.activate(bundle)
        self.assertEqual((replace.call_count, reload.call_count), (12, 2))
        contain.assert_not_called()
        new_ca = self.load_new_ca(bundle)
        for i, path in enumerate((*self.targets, *self.anchors)):
            self.assertEqual(path.read_bytes(), renewal.private_read(bundle / f'fallback-{i}.pem'))
        for anchor in self.anchors:
            self.assertEqual(len(x509.load_pem_x509_certificates(anchor.read_bytes())), 2)
        for path in self.targets[:2]:
            leaf = x509.load_pem_x509_certificate(path.read_bytes())
            self.assertEqual(leaf.issuer, new_ca.subject)
        self.assertFalse(self.lock.exists())

    def test_new_ca_activate_refuses_anything_not_in_the_manifest_before_publication(self):
        _, bundle, manifest = self.prepare_new_ca()
        manifest_path = bundle / 'manifest.json'
        original = manifest_path.read_bytes()
        cases = []
        for name, change, code in (
                ('anchor dropped', lambda m: m.update(targets=m['targets'][:4]), 'TARGET_ROSTER_CHANGED'),
                ('anchor swapped', lambda m: m['targets'].reverse(), 'TARGET_ROSTER_CHANGED'),
                ('new_ca flag removed', lambda m: m.pop('new_ca'), 'TARGET_ROSTER_CHANGED')):
            changed = json.loads(original)
            change(changed)
            cases.append((name, json.dumps(changed).encode(), code))
        for name, content, code in cases:
            with self.subTest(name):
                manifest_path.write_bytes(content)
                with patch.object(renewal, 'replace_exact') as replace, \
                        patch.object(renewal, 'reload_contexts') as reload:
                    with self.assertRaisesRegex(ValueError, '^' + code + '$'):
                        renewal.activate(bundle)
                    replace.assert_not_called()
                    reload.assert_not_called()
        manifest_path.write_bytes(original)
        self.anchors[1].write_bytes(self.original_inputs[self.anchors[1]] + b'\n')  # live anchor drifted
        with patch.object(renewal, 'replace_exact') as replace:
            with self.assertRaisesRegex(ValueError, '^LIVE_INPUT_CHANGED$'):
                renewal.activate(bundle)
            replace.assert_not_called()

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
