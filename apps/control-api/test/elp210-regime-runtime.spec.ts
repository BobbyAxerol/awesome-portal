import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import * as calculator from "../src/execution-v2/manager-regime";
import { managerRegimePublication, type ManagerRegimePublication } from "../src/execution-v2/manager-regime-publication.contract";
import { loadApprovedManagerRegimePolicy, loadVerifiedManagerRegimeEvidence, ManagerRegimeRuntime,
  managerRegimePublicationCurrent, revokeApprovedManagerRegimePolicy,
  revokeVerifiedManagerRegimeEvidence } from "../src/execution-v2/manager-regime-runtime";
import { clone, digest, limits, fixture, policyInput, evidenceInput, handles, calculate } from "./helpers/manager-regime";

const reason = (result: { status: string; reason_codes?: string[] }, expected: string) =>
  expect(result).toMatchObject({ status: "NOT_PUBLISHED", reason_codes: expect.arrayContaining([expected]) });

describe("ELP2-10 private Regime adapter proposal (synthetic pins; no product/source qualification)", () => {
  it("uses actual byte loaders and calculator, with descriptive typed provenance and no scalar score", async () => {
    const h = await calculate();
    const contracts = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts");
    const sample = JSON.parse(readFileSync(resolve(contracts,
      "fixtures/execution-manager-regime.synthetic.valid.json"), "utf8"));
    expect(sample).toEqual({ lane: "TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT", value: h.publication });
    expect(h.publication.result).toMatchObject({ status: "supported", neighbor_count: 3, distinct_episode_count: 3,
      qualification: "RUNTIME_APPROVED", preview: null, research_binding_id: h.f.evidence.research_binding.research_binding_id });
    expect(h.publication.provenance).toMatchObject({ source_revision: "TEST_ONLY:source-r1", source_as_of_ms: 1000,
      computed_at_ms: 1001, policy_revision: "TEST_ONLY:policy-revision1" });
    expect(managerRegimePublication.parse(h.publication)).toEqual(h.publication);
    expect(managerRegimePublicationCurrent(h.policy, h.evidence, h.publication, 1001)).toBe(true);
    expect(h.publication.result).not.toHaveProperty("value");
    expect(JSON.stringify(h.publication)).not.toMatch(/forecast|expected_return|win_probability|model_confidence/);
  });
  it("retains a genuine zero historical outcome instead of converting it to absence", async () => {
    const f = fixture(); f.evidence.references.forEach(r => { r.net_twr = "0"; });
    const { publication } = await calculate(f);
    expect(publication.result.stage_breakdown[0].matched_outcome_summary).toMatchObject({ mean: "0", median: "0", min: "0", max: "0" });
  });
  it("keeps forward-simulated evidence weak and distinct from actual", async () => {
    const { publication } = await calculate(fixture("paper"));
    expect(publication.result).toMatchObject({ status: "weak_support", neighbor_count: 3,
      reason_codes: expect.arrayContaining(["SIMULATED_EVIDENCE_ONLY"]) });
    expect(publication.result.stage_breakdown[0]).toMatchObject({ stage: "Paper", evidence_kind: "forward_simulated", status: "weak_support" });
  });
  it("keeps historical research and actual in separate stage summaries, not a pooled ESS/outcome", async () => {
    const f = fixture(), r = f.evidence.references[0]; r.source_kind = "research"; r.stage = "ResearchOOS";
    r.evidence_kind = "research_simulated"; r.deployment = null;
    const { publication } = await calculate(f);
    expect(publication.result.stage_breakdown.map(s => [s.stage, s.neighbor_count])).toEqual([["ResearchOOS", 1], ["Live", 2]]);
    expect(publication.result).not.toHaveProperty("effective_sample_size");
    expect(publication.result).not.toHaveProperty("matched_outcome_summary");
  });
  it.each(["reconciliation", "complete_costs", "split_boundaries", "embargo"] as const)("missing %s receipt withholds eligibility rather than fabricating zero", async field => {
    const h = await calculate(fixture(), p => p.references.forEach(r => { r[field] = null; }));
    expect(h.publication.result).toMatchObject({ status: "insufficient_data", neighbor_count: 0, stage_breakdown: [] });
    expect(h.publication.result.reason_codes.length).toBeGreaterThan(0);
  });
  it.each(["empty", "missing-current", "stale", "out-of-support", "incomplete-horizon"] as const)("public DTO preserves actual calculator's %s result", async scenario => {
    const f = fixture();
    if (scenario === "empty") f.evidence.references = [];
    if (scenario === "missing-current") f.evidence.current.values[0].value = null;
    if (scenario === "stale") Object.assign(f.evidence.current, { feature_cutoff_ms: 800, closed_through_ms: 800, available_at_ms: 800 });
    if (scenario === "out-of-support") f.evidence.current.values[0].value = "1000";
    if (scenario === "incomplete-horizon") f.evidence.references.forEach(r => { r.outcome_end_ms--; });
    const h = await calculate(f), r = h.publication.result;
    expect(r.status).toBe(scenario === "stale" ? "stale" : scenario === "out-of-support" ? "out_of_support" : "insufficient_data");
    expect(r.neighbor_count).toBe(0); expect(r.stage_breakdown).toEqual([]); expect(managerRegimePublication.safeParse(h.publication).success).toBe(true);
    if (scenario === "out-of-support") { expect(r.eligible_reference_count).toBe(3); expect(Number(r.nearest_distance)).toBeGreaterThan(3); }
    expect(managerRegimePublicationCurrent(h.policy, h.evidence, h.publication, 1001)).toBe(true);
  });
  it("rejects hash/scope mismatch and bounds bytes before parsing schemas", () => {
    const f = fixture(), p = policyInput(f), e = evidenceInput(f);
    reason(loadApprovedManagerRegimePolicy({ ...p, artifact_bytes: `${p.artifact_bytes} ` }), "REGIME_POLICY_ARTIFACT_HASH_MISMATCH");
    reason(loadVerifiedManagerRegimeEvidence({ ...e, artifact_bytes: `${e.artifact_bytes} ` }), "REGIME_EVIDENCE_ARTIFACT_HASH_MISMATCH");
    reason(loadApprovedManagerRegimePolicy({ ...p, artifact_bytes: new Uint8Array(65_537) }), "REGIME_ARTIFACT_BYTE_LIMIT");
    reason(loadVerifiedManagerRegimeEvidence({ ...e, scope: { ...e.scope, workspace_id: "TEST_ONLY:peer-workspace" } }), "REGIME_EVIDENCE_SCOPE_MISMATCH");
  });
  it("rejects source-supplied approval flags and filesystem locators even with matching synthetic byte pins", () => {
    const f = fixture(); (f.evidence.research_binding as unknown as Record<string, unknown>).verified = true;
    reason(loadVerifiedManagerRegimeEvidence(evidenceInput(f)), "REGIME_ARTIFACT_INVALID");
    const other = fixture(); other.evidence.references[0].source_locator = "/home/bobby/private/source.json";
    reason(loadVerifiedManagerRegimeEvidence(evidenceInput(other)), "REGIME_ARTIFACT_INVALID");
  });
  it.each(["alpha", "version", "hidden-population", "census"] as const)("rejects %s mismatch before any reference count can publish", axis => {
    const f = fixture();
    if (axis === "alpha") f.evidence.binding.alpha_id = "TEST_ONLY:peer";
    if (axis === "version") f.evidence.binding.alpha_version_id = "TEST_ONLY:peer-version";
    if (axis === "hidden-population") f.evidence.references[0].population[0].tuple.account_id = "TEST_ONLY:peer-account";
    const input = evidenceInput(f); if (axis === "census") input.source_pin.reference_census_digest = digest("wrong-census");
    const result = loadVerifiedManagerRegimeEvidence(input); expect(result.status).toBe("NOT_PUBLISHED");
  });
  it("requires independent policy/source inputs and exact approved feature-definition compatibility", async () => {
    const f = fixture(), pi = policyInput(f), ei = evidenceInput(f);
    reason(loadApprovedManagerRegimePolicy({ ...pi, approval_pin: null }), "REGIME_POLICY_NOT_APPROVED");
    reason(loadVerifiedManagerRegimeEvidence({ ...ei, source_pin: null }), "REGIME_SOURCE_NOT_ACCEPTED");
    const h = handles(f, p => { p.feature_definition_hash = digest("another-feature-definition"); });
    reason(await new ManagerRegimeRuntime(limits, () => 1001).calculate(h.task), "REGIME_POLICY_EVIDENCE_NOT_CURRENT_OR_INCOMPATIBLE");
  });
  it.each(["future-policy", "future-current"] as const)("fails closed on %s current knowledge-time misuse", scenario => {
    const f = fixture();
    if (scenario === "future-policy") { const p = policyInput(f); p.approval_pin.available_at_ms = 1002;
      expect(loadApprovedManagerRegimePolicy(p).status).toBe("NOT_PUBLISHED"); return; }
    if (scenario === "future-current") f.evidence.current.closed_through_ms = 1001;
    expect(loadVerifiedManagerRegimeEvidence(evidenceInput(f)).status).toBe("NOT_PUBLISHED");
  });
  it("keeps a known deployment backdate unbound rather than manufacturing support", async () => {
    const f = fixture(); f.evidence.references[0].deployment!.effective_from_ms = 50;
    const { publication } = await calculate(f);
    expect(publication.result.status).toBe("unbound");
    expect(publication.result.reason_codes).toContain("DEPLOYMENT_BINDING_BACKDATED");
    expect(publication.result.neighbor_count).toBe(0);
  });
  it("retains pre-archive historical observations without inventing a new monitor", async () => {
    const f = fixture(); f.evidence.strategy_lifecycle = "archived";
    f.evidence.archive_boundary = { alpha_id: f.evidence.binding.alpha_id, archived_at_ms: 600,
      available_at_ms: 600, manifest_hash: digest("archive"), source_locator: "TEST_ONLY:archive" };
    const h = await calculate(f); expect(h.publication.result.status).toBe("supported");
    expect(h.f.evidence.references.every(r => r.deployment!.archive_monitoring === null)).toBe(true);
    const input = evidenceInput(f); input.source_pin.archive_boundary_manifest = null;
    reason(loadVerifiedManagerRegimeEvidence(input), "REGIME_ARCHIVE_BOUNDARY_UNVERIFIED");
  });
  it("requires independently approved separate Paper monitoring after archive", async () => {
    const f = fixture("paper"); f.evidence.strategy_lifecycle = "archived";
    f.evidence.archive_boundary = { alpha_id: f.evidence.binding.alpha_id, archived_at_ms: 160, available_at_ms: 160,
      manifest_hash: digest("archive"), source_locator: "TEST_ONLY:archive" };
    const missing = await calculate(f);
    expect(missing.publication.result.neighbor_count).toBe(0);
    expect(missing.publication.result.reason_codes).toContain("ARCHIVED_MONITORING_APPROVAL_UNVERIFIED");
    f.evidence.references.forEach(r => {
      r.deployment!.created_at_ms = 170; r.deployment!.effective_from_ms = 180;
      r.deployment!.archive_monitoring = { approval_id: "TEST_ONLY:separate-monitor-approval",
        archive_manifest_hash: f.evidence.archive_boundary!.manifest_hash, deployment_id: r.deployment!.deployment_id,
        binding: clone(f.evidence.research_binding), approved_at_ms: 165, available_at_ms: 165, source_locator: "TEST_ONLY:monitor-approval" };
    });
    const approved = await calculate(f);
    expect(approved.publication.result).toMatchObject({ status: "weak_support", neighbor_count: 3 });
    expect(approved.f.evidence.strategy_lifecycle).toBe("archived");
  });
  it("rejects cloned handles rather than trusting JSON-equivalent approval claims", async () => {
    const h = handles(), runtime = new ManagerRegimeRuntime(limits, () => 1001);
    reason(await runtime.calculate({ ...h.task, policy: clone(h.policy) }), "REGIME_POLICY_NOT_APPROVED");
    reason(await runtime.calculate({ ...h.task, evidence: clone(h.evidence) }), "REGIME_SOURCE_NOT_ACCEPTED");
  });
  it("captures caller data before yield and keeps loaded artifact bytes immutable", async () => {
    const h = handles(), runtime = new ManagerRegimeRuntime(limits, () => 1001), pending = runtime.calculate(h.task);
    h.task.binding.subject_id = "TEST_ONLY:changed"; h.task.source_revision = "TEST_ONLY:changed";
    h.f.evidence.current.values[0].value = "1000"; h.f.evidence.references.length = 0;
    const r = await pending; if (r.status !== "READY") throw new Error(JSON.stringify(r));
    expect(r.publication.result.status).toBe("supported");
    expect(r.publication.provenance.source_revision).toBe("TEST_ONLY:source-r1");
  });
  it("rejects original task getters and nonplain prototypes before any getter is invoked", async () => {
    const h = handles(), runtime = new ManagerRegimeRuntime(limits, () => 1001); let calls = 0;
    const getterTask = { ...h.task }; Object.defineProperty(getterTask, "policy", { enumerable: true,
      get: () => { calls++; return h.policy; } });
    reason(await runtime.calculate(getterTask), "REGIME_RUNTIME_INPUT_INVALID"); expect(calls).toBe(0);
    const nonplain = Object.assign(Object.create({ inherited: true }), h.task) as typeof h.task;
    reason(await runtime.calculate(nonplain), "REGIME_RUNTIME_INPUT_INVALID");
  });
  it("has bounded admission/cancellation with no queued second calculation", async () => {
    const h = handles(), runtime = new ManagerRegimeRuntime(limits, () => 1001), controller = new AbortController();
    const pending = runtime.calculate(h.task, controller.signal);
    // The capacity refusal is immediate, but awaiting it would yield to the first calculation.
    // Abort while that first operation is actually pending, not after its success.
    const second = runtime.calculate(h.task);
    controller.abort();
    reason(await second, "REGIME_RUNTIME_CAPACITY");
    reason(await pending, "REGIME_RUNTIME_CANCELLED");
    reason(await runtime.calculate(h.task, controller.signal), "REGIME_RUNTIME_CANCELLED");
  });
  it.each(["policy", "evidence", "clock"] as const)("rechecks %s after yield using current authority rather than computed_at", async axis => {
    const h = handles(); let now = 1001; const runtime = new ManagerRegimeRuntime(limits, () => now), pending = runtime.calculate(h.task);
    if (axis === "policy") revokeApprovedManagerRegimePolicy(h.policy);
    if (axis === "evidence") revokeVerifiedManagerRegimeEvidence(h.evidence);
    if (axis === "clock") now = 10_000;
    const r = await pending; expect(r.status).toBe("NOT_PUBLISHED");
    if (r.status === "NOT_PUBLISHED") expect(r.reason_codes).toContain(axis === "clock" ?
      "REGIME_POLICY_EVIDENCE_NOT_CURRENT_OR_INCOMPATIBLE" : "REGIME_APPROVAL_REVOKED");
  });
  it("honors explicit reference/output bounds rather than trimming source facts", async () => {
    const h = handles();
    reason(await new ManagerRegimeRuntime({ ...limits, maximum_references: 2 }, () => 1001).calculate(h.task), "REGIME_RUNTIME_INPUT_BOUND");
    reason(await new ManagerRegimeRuntime({ ...limits, maximum_output_bytes: 128 }, () => 1001).calculate(h.task), "REGIME_RUNTIME_OUTPUT_BOUND");
  });
  it("current-proof checks do not recalculate and reject expired/revoked or differently scoped provenance", async () => {
    const h = await calculate(), spy = vi.spyOn(calculator, "calculateManagerRegimeFit");
    try {
      expect(managerRegimePublicationCurrent(h.policy, h.evidence, h.publication, 1001)).toBe(true);
      expect(managerRegimePublicationCurrent(h.policy, h.evidence, h.publication, 1101)).toBe(false);
      const bad: ManagerRegimePublication = clone(h.publication); bad.provenance.source_revision = "TEST_ONLY:other-revision";
      expect(managerRegimePublicationCurrent(h.policy, h.evidence, bad, 1001)).toBe(false);
      revokeVerifiedManagerRegimeEvidence(h.evidence);
      expect(managerRegimePublicationCurrent(h.policy, h.evidence, h.publication, 1001)).toBe(false);
      expect(spy).not.toHaveBeenCalled();
    } finally { spy.mockRestore(); }
  });
  it("public schema rejects scalar/probability/preview and inconsistent published counts", async () => {
    const { publication } = await calculate();
    for (const patch of [{ value: "80" }, { win_probability: "0.9" }, { preview: {} }, { neighbor_count: 0 }]) {
      const modified = clone(publication) as unknown as { result: Record<string, unknown> };
      Object.assign(modified.result, patch); expect(managerRegimePublication.safeParse(modified).success).toBe(false);
    }
  });
  // Regressions for independently reviewed known-at and stage-correlation corrections.
  it("does not promote CANARY-only authority to Live-supported evidence", async () => {
    const f = fixture(); f.evidence.binding.stage_filter = ["CANARY"];
    f.evidence.population.forEach(m => { m.stage = "CANARY"; });
    f.evidence.references.forEach(r => r.population.forEach(m => { m.stage = "CANARY"; }));
    expect(loadVerifiedManagerRegimeEvidence(evidenceInput(f)).status).toBe("NOT_PUBLISHED");
  });
  it.each([["research", "binding"], ["research", "proof"], ["deployment", "binding"], ["deployment", "proof"]] as const)
    ("excludes one future %s %s fact/proof while retaining valid neighbors", async (kind, axis) => {
      const f = fixture(), r = f.evidence.references[0];
      if (kind === "research") { r.source_kind = "research"; r.stage = "ResearchOOS"; r.evidence_kind = "research_simulated"; r.deployment = null; }
      if (axis === "binding") r.binding.artifact_available_at_ms = 1002;
      const h = await calculate(f, axis === "proof" ? p => { p.references[0].reconciliation!.available_at_ms = 1002; } : undefined);
      expect(h.publication.result.neighbor_count).toBe(2);
      expect(h.publication.result.reference_window_ids).not.toContain(r.reference_window_id);
      expect(h.publication.result.status).toBe("weak_support");
      expect(h.publication.result.reason_codes).toContain("REFERENCE_PROOF_NOT_AVAILABLE_AS_OF");
      expect(h.f.evidence.references[0].binding.artifact_available_at_ms).toBe(axis === "binding" ? 1002 : 70);
    });
  it("keeps an entirely future reference corpus typed insufficient rather than poisoning a known current binding", async () => {
    const h = await calculate(fixture(), p => p.references.forEach(r => { r.outcome_manifest.available_at_ms = 1002; }));
    expect(h.publication.result).toMatchObject({ status: "insufficient_data", neighbor_count: 0, stage_breakdown: [] });
    expect(h.publication.result.reason_codes).toContain("REFERENCE_PROOF_NOT_AVAILABLE_AS_OF");
  });
});
