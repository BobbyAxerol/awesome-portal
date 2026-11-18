#!/usr/bin/env python3
"""EPG10-02 offline contract gates. No network, database, runtime or grant."""
import copy
import hashlib
import json
from pathlib import Path
import unittest

from jsonschema import Draft202012Validator, RefResolver

ROOT = Path(__file__).resolve().parents[1]
PACK = ROOT / "services/portal-execution-edge-rs/contracts/execution-catalogue-v1"
SCHEMA = json.loads((PACK / "shared/execution-v2-foundation.v1.schema.json").read_text())
FIXTURES = json.loads((PACK / "shared/execution-v2-foundation.synthetic.valid.json").read_text())
REGISTRY = json.loads((PACK / "registry.json").read_text())
DEPENDENCIES = json.loads((PACK / "metric-dependencies.json").read_text())
FIELDS = json.loads((PACK / "field-dictionary.json").read_text())
EXTENSION = json.loads((PACK / "catalogue.v1.schema.json").read_text())
GOLDEN = json.loads((PACK / "golden.json").read_text())
PM_MAP = json.loads((PACK / "pm-controls-map.json").read_text())
MAPPING = json.loads((PACK / "mapping-golden.json").read_text())


def validator(kind):
    return Draft202012Validator({"$ref": f"#/$defs/{kind}", "$defs": SCHEMA["$defs"]})


def fact(kind):
    return copy.deepcopy(next(f["value"] for case in FIXTURES["cases"]
                              for f in case["facts"] if f["type"] == kind and f["valid"]))


def extension_validator(kind):
    schema = {"$ref": f"#/$defs/{kind}", "$defs": EXTENSION["$defs"]}
    resolver = RefResolver.from_schema(schema, store={SCHEMA["$id"]: SCHEMA})
    return Draft202012Validator(schema, resolver=resolver)


class CatalogueContract(unittest.TestCase):
    def assert_valid(self, kind, value):
        errors = list(validator(kind).iter_errors(value))
        self.assertFalse(errors, str(errors[0]) if errors else "")

    def assert_invalid(self, kind, value):
        self.assertTrue(list(validator(kind).iter_errors(value)))

    def test_t02_01_complete_registry_and_bounded_pagination_spec(self):
        self.assertTrue(extension_validator("Registry").is_valid(REGISTRY))
        missing_owner = copy.deepcopy(REGISTRY)
        del missing_owner["families"][0]["owner"]
        self.assertFalse(extension_validator("Registry").is_valid(missing_owner))
        families = REGISTRY["families"]
        self.assertEqual(len(families), 42)
        self.assertEqual(len({f["id"] for f in families}), 42)
        self.assertEqual(sum(f["guide"] == "EDGE4.3" for f in families), 39)
        for f in families:
            self.assertTrue(extension_validator("Family").is_valid(f))
            for name in ("owner", "grain", "writer_refs", "source_query_refs", "history_scope", "publication_gates"):
                self.assertTrue(f[name], (f["id"], name))
            for ref in f["authority_refs"]:
                self.assertIn(ref, REGISTRY["source_groups"])
            self.assertEqual(f["availability"], "UNAVAILABLE")
            self.assertFalse(f["enabled_environments"])
            self.assertFalse(f["history_full"])
        page = REGISTRY["pagination"]
        self.assertTrue(page["scope_before_pagination"])
        self.assertIsNone(page["total_row_cap"])
        self.assertIn("SERIALIZED_BYTES", page["limits"])
        self.assertFalse(REGISTRY["new_runtime_exports_enabled"])

    def test_t02_02_large_exact_decimal_null_zero_time(self):
        for value in ("0", "-0.000", "900719925474099312345678901234567890.000000000000000000000000000000000001"):
            self.assert_valid("Decimal", value)
            self.assertEqual(json.loads(json.dumps(value)), value)
        for value in (0.1, 1, "1e2", "NaN", "01", ".1", "1.", "1" * 129):
            self.assert_invalid("Decimal", value)
        for value in (0, 9007199254740991):
            self.assert_valid("UtcMilliseconds", value)
        for value in (-1, 9007199254740992, "1", 1.1):
            self.assert_invalid("UtcMilliseconds", value)
        self.assert_valid("PmCounter", "9223372036854775807")
        for value in (9223372036854775807, "9223372036854775808", "01"):
            self.assert_invalid("PmCounter", value)
        metric = fact("MetricCapsule")
        metric["value"] = None
        metric["availability"] = {"state": "UNAVAILABLE", "reason_code": "SOURCE_NOT_AVAILABLE"}
        self.assert_valid("MetricCapsule", metric)

    def test_t02_03_history_and_runtime_truth_are_independent(self):
        adapters = {a["id"]: a for a in REGISTRY["adapters"]}
        current = adapters["legacy-current-to-catalogue.v1"]["to"]
        self.assertEqual(current["history_capability"], "CURRENT_ONLY")
        self.assertEqual(current["history_request_availability"], "UNAVAILABLE")
        self.assertEqual(adapters["legacy-implementation-to-catalogue.v1"]["to"]["availability"], "UNAVAILABLE")
        self.assertIn("fixed Paper", REGISTRY["source_semantic_delta"]["p16"])
        for f in REGISTRY["families"]:
            self.assertIsNone(f["coverage_proof_ref"])
            self.assertIsNone(f["retention"]["duration_ms"])

    def test_t02_04_cursor_all_bindings_declared(self):
        cursor = REGISTRY["pagination"]["cursor"]
        for dimension in ("DATASET", "PRINCIPAL", "FULL_SCOPE", "FILTER", "AUTH_REVISION", "EPOCH", "GENERATION", "SNAPSHOT", "SCHEMA", "EXPIRY"):
            self.assertIn(dimension, cursor)
        self.assertEqual(REGISTRY["pagination"]["history_before_retention_floor"], "RESYNC_REQUIRED")

    def test_t02_05_compatibility_and_pm_verbatim(self):
        self.assert_valid("StreamEnvelope", MAPPING["source"])
        self.assert_valid("BrowserSnapshotMetadata", MAPPING["expected"])
        self.assertTrue(extension_validator("ScopedBrowser").is_valid(MAPPING["scope_stage"]))
        self.assertNotEqual(MAPPING["source"]["continuation"], MAPPING["scope_stage"]["snapshot"]["resume_cursor"])
        schema = PACK / "shared/execution-v2-foundation.v1.schema.json"
        fixtures = PACK / "shared/execution-v2-foundation.synthetic.valid.json"
        self.assertEqual(hashlib.sha256(schema.read_bytes()).hexdigest(), "7a28e0545005789da1a54d304dbf242a2413d464aa905b83d5641e40821c4828")
        self.assertEqual(hashlib.sha256(fixtures.read_bytes()).hexdigest(), "7b3044c2f4c990633a4550ab2c521f0fdf0108f9e70027bcbc1c2df02643cb75")
        edge = fact("StreamEnvelope")
        self.assert_valid("StreamEnvelope", edge)
        edge["contract_version"] = "edge.v2"
        self.assert_invalid("StreamEnvelope", edge)
        edge = fact("StreamEnvelope")
        edge["new_implicit_semantics"] = 0
        self.assert_invalid("StreamEnvelope", edge)
        pm = fact("PmaCapitalCommand")
        self.assert_valid("PmaCapitalCommand", pm)
        self.assert_valid("PmaCandidateCapitalCommand", pm)
        raw = json.dumps(pm, ensure_ascii=False, separators=(",", ":")).encode()
        transport = {"payload_utf8": raw.decode(), "digest": hashlib.sha256(raw).hexdigest()}
        self.assertEqual(transport["payload_utf8"].encode(), raw)
        self.assertEqual(transport["digest"], hashlib.sha256(raw).hexdigest())
        pm["schema_version"] = "pma.operator-report.v1.1"
        self.assert_invalid("PmaCapitalCommand", pm)
        compatibility = REGISTRY["compatibility"]
        self.assertEqual(compatibility["p16_existing_resources"], "EXACT_UNCHANGED_ADDITIONS_ONLY")
        # Old registry reader selects known fields; optional opaque extensions
        # carry no required semantics and do not alter strict shared DTOs.
        future = copy.deepcopy(REGISTRY)
        future["compatibility"]["optional_extensions"]["future_display_hint"] = "test-only"
        self.assertEqual(future["families"], REGISTRY["families"])
        self.assertEqual(future["compatibility"]["required_features"], compatibility["required_features"])

    def test_t02_06_status_enum_mapping_and_nondisclosure(self):
        mapping = next(a for a in REGISTRY["adapters"] if a["from"] == "OUT_OF_SCOPE")
        self.assertEqual(mapping["to"], {"state": "DENIED", "reason_code": "RESOURCE_NOT_AVAILABLE"})
        self.assert_valid("Availability", mapping["to"])
        self.assertEqual(set(mapping["to"]), {"state", "reason_code"})
        self.assert_invalid("Availability", {"state": "AVAILABLE", "reason_code": "hidden"})
        self.assert_invalid("Availability", {"state": "OUT_OF_SCOPE", "reason_code": "hidden"})
        quality = fact("StreamEnvelope")["quality"]
        quality["freshness"] = "UNRESOLVED"
        self.assert_invalid("Quality", quality)

    def test_t02_07_metric_windows_currency_denominator_and_provenance(self):
        metric = fact("MetricCapsule")
        self.assert_valid("MetricCapsule", metric)
        self.assertEqual(json.loads(json.dumps(metric)), metric)
        for field in ("requested_window", "effective_window", "currency", "provenance_ref", "calculation_revision", "policy_revision", "quality", "domain_proof"):
            broken = copy.deepcopy(metric)
            del broken[field]
            self.assert_invalid("MetricCapsule", broken)
        metric.update(value="3.0", unit="PERCENT", denominator="0", denominator_kind="OPENING_CAPITAL")
        self.assert_invalid("MetricCapsule", metric)
        metric["denominator"] = "10"
        self.assert_valid("MetricCapsule", metric)
        metric["economic_domain"] = "MIXED"
        self.assert_invalid("MetricCapsule", metric)
        for entry in FIELDS["fields"]:
            self.assert_valid("FieldCatalogueEntry", entry)
            self.assertEqual(entry["visible_in"], ["MANAGER"])
        evidence = copy.deepcopy(GOLDEN["metric_evidence"])
        self.assertTrue(extension_validator("MetricEvidence").is_valid(evidence))
        self.assertEqual(json.loads(json.dumps(evidence)), evidence)
        self.assertEqual(evidence["source_set"]["correction_view"], "RESTATED")
        self.assertEqual(evidence["source_set"]["scope"]["authorization_revision"], "test:auth-1")
        evidence["research_evidence_used"] = True
        self.assertFalse(extension_validator("MetricEvidence").is_valid(evidence))
        evidence["research_run_ref"] = "test:run"
        self.assertTrue(extension_validator("MetricEvidence").is_valid(evidence))

    def test_t02_08_pm_r2_independent_dimensions(self):
        mapped = {target: PM_MAP["source"][source] for source, target in PM_MAP["field_map"].items()}
        self.assertEqual(mapped, PM_MAP["expected"])
        self.assertEqual([mapped[key] for key in ("management_budget", "margin_risk_requirement", "exposure_cap", "economic_backing", "new_risk_capacity", "amount_locked", "recall_pending")], ["80", "20", "200", "100", "60", "5", "7"])
        self.assertEqual(mapped["profile"], PM_MAP["source"]["profile"])
        self.assertEqual(PM_MAP["header"]["currency"], "USDT")
        self.assertFalse(PM_MAP["canonical_pm_business_payload_mutated"])
        self.assertEqual(PM_MAP["exposure_policy"]["availability"], "UNAVAILABLE")
        self.assertTrue(extension_validator("PmR2Read").is_valid(GOLDEN["pm_r2"]))
        for field in ("nominal_budget", "margin_risk_requirement", "economic_backing", "exposure_cap", "new_risk_capacity", "amount_locked", "recall_pending"):
            broken = copy.deepcopy(GOLDEN["pm_r2"])
            broken[field] = "-0.1"
            self.assertFalse(extension_validator("PmR2Read").is_valid(broken), field)
        values = {k: GOLDEN["pm_r2"][k] for k in ("nominal_budget", "margin_risk_requirement", "exposure_cap", "economic_backing", "new_risk_capacity")}
        self.assertEqual(json.loads(json.dumps(values)), values)
        self.assertGreater(int(values["exposure_cap"]), int(values["economic_backing"]))
        for dimension in ("nominal_budget", "margin_risk_requirement", "exposure_cap", "economic_backing", "new_risk_capacity", "amount_locked", "recall_pending"):
            self.assertIn(dimension, FIELDS["pm_dimensions"])
        self.assertIn("no global1x", FIELDS["pm_dimensions"]["exposure_cap"])
        pm = fact("PmaCapitalCommand")
        for key in pm["expected_versions"]:
            self.assertIsInstance(pm["expected_versions"][key], str)
        pm["expected_versions"][next(iter(pm["expected_versions"]))] = 1
        self.assert_invalid("PmaCandidateCapitalCommand", pm)

    def test_t02_09_archive_stage_lifecycle_and_typed_units(self):
        self.assert_valid("FinancialStage", "CANARY")
        self.assert_invalid("Environment", "canary")
        self.assert_invalid("FinancialStage", "ARCHIVED")
        archive = fact("ArchiveDisposition")
        self.assert_valid("ArchiveDisposition", archive)
        archive["automatic_liquidation"] = True
        self.assert_invalid("ArchiveDisposition", archive)
        archive["automatic_liquidation"] = False
        archive["clone_lineage"] = {"origin_deployment_id": "test:origin", "origin_alpha_version_id": "test:alpha-v1", "clone_reason": "ARCHIVE_MONITOR", "effective_at_ms": 100, "approved_config_digest": "sha256:" + "1"*64}
        self.assert_valid("ArchiveDisposition", archive)
        self.assertEqual(json.loads(json.dumps(archive)), archive)
        archive["clone_lineage"]["clone_reason"] = "PROMOTE_LIVE"
        self.assert_invalid("ArchiveDisposition", archive)
        self.assertTrue(extension_validator("Dimensions").is_valid(GOLDEN["dimensions"]))
        wrong_stage = copy.deepcopy(GOLDEN["dimensions"])
        wrong_stage["financial_stage"] = "PAPER"
        self.assertFalse(extension_validator("Dimensions").is_valid(wrong_stage))
        self.assertTrue(extension_validator("RegimeFit").is_valid(GOLDEN["regime"]))
        regime = copy.deepcopy(GOLDEN["regime"])
        del regime["parameter_binding_ref"]
        self.assertFalse(extension_validator("RegimeFit").is_valid(regime))
        regime = copy.deepcopy(GOLDEN["regime"])
        regime["win_probability"] = "0.8"
        self.assertFalse(extension_validator("RegimeFit").is_valid(regime))

    def test_t02_10_score_full_metadata_fixed_formula_pending_config(self):
        score = fact("ScoreCapsule")
        self.assert_valid("ScoreCapsule", score)
        self.assertEqual(json.loads(json.dumps(score)), score)
        for name in ("P", "R", "B", "atomic"):
            self.assertIn(name, score["components"])
        self.assertEqual(len(score["components"]["atomic"]), 6)
        self.assertTrue(DEPENDENCIES["formula_approved"])
        self.assertFalse(DEPENDENCIES["runtime_config_approved"])
        policy = fact("ScorePolicy")
        self.assert_valid("ScorePolicy", policy)
        self.assertEqual(policy["runtime_config_state"], "policy_pending")
        policy["weights"]["P"] = "0.46"
        self.assert_invalid("ScorePolicy", policy)
        broken = copy.deepcopy(score)
        broken["status"] = "policy_pending"
        broken["value"] = "70"
        self.assert_invalid("ScoreCapsule", broken)
        # Comparable population basis and subject binding are not equal IDs.
        score["comparable_basis_id"] = "test:common-basis"
        score["subject_binding_id"] = "test:individual-subject"
        self.assert_valid("ScoreCapsule", score)
        required = {p["id"] for p in DEPENDENCIES["source_proofs"]}
        self.assertTrue({"canonical_nav", "external_flow_grid", "cost_coverage", "fx_policy", "fill_notional", "opening_capital", "compatible_watermarks", "stress_policy", "consolidation_manifest", "approved_runtime_config"} <= required)
        self.assertEqual(len(DEPENDENCIES["atoms"]), 6)
        atoms = {a["id"]: a for a in DEPENDENCIES["atoms"]}
        self.assertIn("arithmetic mean", atoms["add"]["proof"])
        self.assertIn("E0 excluded", atoms["add"]["proof"])
        self.assertIn("no annualization", atoms["sharpe_period"]["proof"])
        self.assertIn("ONE fixed-path", atoms["stress_excess_twr"]["proof"])
        self.assertTrue({"fill_notional", "opening_capital", "fx_policy", "cashflow_free_subperiod_returns"} <= set(atoms["stress_excess_twr"]["source"]))
        self.assertNotIn("normalized_stress_windows", atoms["stress_excess_twr"]["source"])
        all_nodes = set(DEPENDENCIES["dependencies"]) | required
        for node in DEPENDENCIES["dependencies"].values():
            self.assertFalse(set(node) - all_nodes)
        for atom in DEPENDENCIES["atoms"]:
            self.assertFalse(set(atom["source"]) - all_nodes)
        for proof in DEPENDENCIES["source_proofs"]:
            self.assertTrue(proof["owner"] and proof["source"] and proof["required"] and proof["gap"])
        for field in FIELDS["fields"]:
            self.assertTrue(any(f["field_id"] == field["field_id"] for f in FIELDS["field_sources"]))
        evidence = copy.deepcopy(GOLDEN["metric_evidence"])
        evidence["runtime_config_approved"] = True
        self.assertFalse(extension_validator("MetricEvidence").is_valid(evidence))
        evidence.update(runtime_config_ref="sha256:"+"1"*64, approved_policy_id="test:policy", calibration_ref="test:calibration")
        self.assertTrue(extension_validator("MetricEvidence").is_valid(evidence))

    def test_t02_11_direct_portfolio_has_no_raw_q_or_lambda_dependency(self):
        graph = DEPENDENCIES["dependencies"]
        visited = set()
        def visit(node):
            if node in visited:
                return
            visited.add(node)
            for child in graph.get(node, []):
                visit(child)
        visit("portfolio_score")
        self.assertFalse(visited & set(DEPENDENCIES["prohibited_direct_portfolio_dependencies"]))
        score = fact("ScoreCapsule")
        score["lambda"] = "0.5"
        self.assert_invalid("ScoreCapsule", score)
        score = fact("ScoreCapsule")
        score.update(kind="DIRECT_NAV", research_binding_ref=None)
        self.assert_valid("ScoreCapsule", score)

    def test_partner_fx01_through_25_all_vectors(self):
        Draft202012Validator.check_schema(SCHEMA)
        Draft202012Validator.check_schema(EXTENSION)
        self.assertEqual([c["id"] for c in FIXTURES["cases"]], [f"FX-{n:02}" for n in range(1,26)])
        self.assertFalse(FIXTURES["production_config"])
        for case in FIXTURES["cases"]:
            for index, f in enumerate(case["facts"]):
                with self.subTest(case=case["id"], vector=index, kind=f["type"]):
                    self.assertEqual(validator(f["type"]).is_valid(f["value"]), f["valid"])


if __name__ == "__main__":
    unittest.main()
