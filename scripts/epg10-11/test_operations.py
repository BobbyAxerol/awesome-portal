"""T11 routing/config/coverage negatives; no actual alert installation claimed."""
import copy
import os
from pathlib import Path
import unittest
from unittest.mock import patch

import operations


class OperationsHandoff(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.root = Path(os.environ['EPG10_OPERATIONS_SOURCE_ROOT'])
        cls.manifest = operations.load(cls.root, operations.MANIFEST)
        cls.registry = operations.load(cls.root, operations.REGISTRY)

    def altered(self, doc):
        def load(_, relative):
            return doc if relative == operations.MANIFEST else self.registry
        return patch.object(operations, 'load', side_effect=load)

    def test_all_42_families_15_alerts_11_xlc_and_references(self):
        result = operations.validate(self.root)
        self.assertEqual((result['catalogue_families'], result['alerts'], result['xlc']), (42, 15, 11))

    def test_each_alert_fires_recovers_and_missing_signal_is_not_clear(self):
        for alert in self.manifest['alerts']:
            for value, expected in [(alert['fire'][0], 'FIRING'),
                                    (alert['clear'][0], 'RECOVERED'),
                                    ('MISSING_TELEMETRY', 'UNKNOWN_CONTAIN')]:
                with self.subTest(alert=alert['id'], value=value):
                    result = operations.transition(alert, value)
                    self.assertEqual(result['state'], expected)
                    self.assertEqual(result['owner'], alert['owner'])
                    self.assertEqual(result['reason'], alert['id'])
                    self.assertTrue(result['action'])

    def test_runtime_grants_and_invented_budget_rejected(self):
        for field in self.manifest['activation']:
            doc = copy.deepcopy(self.manifest)
            doc['activation'][field] = True
            with self.altered(doc), self.assertRaises(ValueError):
                operations.validate(self.root)
        doc = copy.deepcopy(self.manifest)
        doc['production_budget'] = {'cpu': 1000}
        with self.altered(doc), self.assertRaises(ValueError):
            operations.validate(self.root)

    def test_missing_duplicate_or_fabricated_retention_rejected(self):
        for kind in ('missing', 'duplicate', 'ttl', 'floor', 'owner', 'history', 'quality'):
            doc = copy.deepcopy(self.manifest)
            if kind == 'missing':
                doc['retention'].pop()
            elif kind == 'duplicate':
                doc['retention'].append(doc['retention'][0])
            else:
                key = {'ttl': 'retention_seconds', 'floor': 'archive_floor',
                       'owner': 'owner', 'history': 'source_history_scope', 'quality': 'quality'}[kind]
                doc['retention'][0][key] = 'INVENTED'
            with self.subTest(kind=kind), self.altered(doc), self.assertRaises(ValueError):
                operations.validate(self.root)

    def test_missing_owner_action_and_ambiguous_clear_rejected(self):
        for kind in ('owner', 'action', 'recovery', 'overlap', 'unknown', 'missing'):
            doc = copy.deepcopy(self.manifest)
            alert = doc['alerts'][0]
            if kind == 'overlap':
                alert['clear'] = alert['fire']
            elif kind == 'unknown':
                alert['clear'].append('UNKNOWN')
            elif kind == 'missing':
                doc['alerts'].pop()
            else:
                alert[kind] = ''
            with self.subTest(kind=kind), self.altered(doc), self.assertRaises(ValueError):
                operations.validate(self.root)

    def test_reference_escape_missing_and_xlc_gap_rejected(self):
        for value in ('/home/bobby/secure/private', '../escape', 'missing-file.md'):
            doc = copy.deepcopy(self.manifest)
            doc['references'].append(value)
            with self.altered(doc), self.assertRaises(ValueError):
                operations.validate(self.root)
        doc = copy.deepcopy(self.manifest)
        del doc['xlc']['XLC-11']
        with self.altered(doc), self.assertRaises(ValueError):
            operations.validate(self.root)

    def test_no_inherited_pass_as_new_connected_acceptance(self):
        doc = copy.deepcopy(self.manifest)
        doc['acceptance'][0]['connected'] = 'PASS'
        with self.altered(doc), self.assertRaises(ValueError):
            operations.validate(self.root)

    def test_missing_acceptance_or_unknown_return_is_not_a_release(self):
        for kind in ('missing', 'duplicate', 'unknown-return'):
            doc = copy.deepcopy(self.manifest)
            if kind == 'missing':
                doc['acceptance'].pop()
            elif kind == 'duplicate':
                doc['acceptance'][1]['id'] = 'T11-01'
            else:
                doc['acceptance'][0]['returns'] = ['SELF_APPROVED']
            with self.subTest(kind=kind), self.altered(doc), self.assertRaises(ValueError):
                operations.validate(self.root)

    def test_non_symbolic_payload_cannot_be_alert_input(self):
        for value in ({'private': 'payload'}, None, 300, True):
            with self.assertRaises(ValueError):
                operations.transition(self.manifest['alerts'][0], value)


if __name__ == '__main__':
    unittest.main()
