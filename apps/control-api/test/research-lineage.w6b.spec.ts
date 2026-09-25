/**
 * W6b · P19 backend requests CG-P19-02…09, 13, 14 on the Attempt Lineage
 * service.  The repository is a fake that returns persisted-row shapes; the
 * Run Library mapping and the Engine Atlas are fakes with real DTO shapes.
 */
import { describe, expect, it, vi } from "vitest";

import { ResearchAttemptLineageResponseSchema } from "../src/research/lineage.contract";
import {
  attempt, digest, effective, libraryItem, requested, rows, scope, snapshot, subject, user, version,
} from "./research-lineage.builders";

describe("W6b CG-P19-02 · revision and ETag", () => {
  it("is stable across snapshot time and changes with any persisted fact", async () => {
    const base = snapshot({ libraryRows: rows("run-att-1") });
    const first = await subject(base).service.read(scope, "alpha-p19", { limit: 128 }, user as never);
    const later = await subject({ ...base, asOfUtcMs: 1_790_035_999_000 }).service.read(scope, "alpha-p19", { limit: 128 }, user as never);
    expect(first.lineage_revision).toMatch(/^p19r2_[0-9a-f]{64}$/);
    expect(first.etag).toBe(`"${first.lineage_revision}"`);
    expect(later.as_of_utc_ms).not.toBe(first.as_of_utc_ms);
    expect(later.etag).toBe(first.etag);
    const changed = await subject(snapshot({ attempts: [attempt("att-1", { state: "FAILED", primary_run_state: "FAILED" })] }))
      .service.read(scope, "alpha-p19", { limit: 128 }, user as never);
    expect(changed.etag).not.toBe(first.etag);
    expect(ResearchAttemptLineageResponseSchema.safeParse(first).success).toBe(true);
  });
});

describe("W6b CG-P19-09 · newest window and a signed older-page cursor", () => {
  it("issues an older_cursor only when more history exists and pages with it", async () => {
    const newest = snapshot({ attempts: [attempt("att-9"), attempt("att-10")], hasMore: true,
      counts: { total_attempts: 5, draft_attempts: 0, submitted_attempts: 5, failed_attempts: 0, abandoned_attempts: 0, child_runs: 0, technical_retries: 0 } });
    const { service, repository } = subject(newest);
    const page = await service.read(scope, "alpha-p19", { limit: 2 }, user as never);
    expect(repository.read).toHaveBeenCalledWith(scope, "alpha-p19", 2);
    expect(page.coverage).toMatchObject({ state: "PARTIAL", reason_code: "P19_BOUNDED_GRAPH_LIMIT_REACHED", window: "NEWEST" });
    expect(page.coverage.older_cursor).toMatch(/^lc1\.p19-k1\./);

    const older = subject(snapshot({ attempts: [attempt("att-7"), attempt("att-8")], hasMore: false, window: "OLDER_PAGE", counts: newest.counts }));
    const second = await older.service.read(scope, "alpha-p19", { limit: 2, cursor: page.coverage.older_cursor! }, user as never);
    expect(older.repository.read).toHaveBeenCalledWith(scope, "alpha-p19", 2, {
      createdAt: newest.attempts[0]!.created_at_cursor, attemptId: "att-9",
    });
    expect(second.coverage).toMatchObject({ state: "PARTIAL", window: "OLDER_PAGE", older_cursor: null });

    // Deterministic: the same boundary gives the same token, so the body can revalidate.
    const again = await subject(newest).service.read(scope, "alpha-p19", { limit: 2 }, user as never);
    expect(again.coverage.older_cursor).toBe(page.coverage.older_cursor);
  });

  it("refuses a tampered cursor or one issued for another Alpha, workspace or limit", async () => {
    const newest = snapshot({ hasMore: true });
    const token = (await subject(newest).service.read(scope, "alpha-p19", { limit: 1 }, user as never)).coverage.older_cursor!;
    const { service, repository } = subject();
    const tampered = `${token.slice(0, -2)}${token.endsWith("AA") ? "BB" : "AA"}`;
    for (const [alphaId, query, scoped] of [
      ["alpha-p19", { limit: 1, cursor: tampered }, scope],
      ["alpha-other", { limit: 1, cursor: token }, scope],
      ["alpha-p19", { limit: 2, cursor: token }, scope],
      ["alpha-p19", { limit: 1, cursor: token }, { ...scope, workspaceId: "ws-other" }],
      ["alpha-p19", { limit: 1, cursor: "not-a-cursor" }, scope],
    ] as const) {
      await expect(service.read(scoped, alphaId, query as never, user as never)).rejects.toMatchObject({ code: "RESEARCH_LINEAGE_INVALID", status: 400 });
    }
    expect(repository.read).not.toHaveBeenCalled();
  });
});

describe("W6b CG-P19-03 · storied/probe by research.lineage-presentation.v1", () => {
  it("classifies from persisted facts and counts the split per version and overall", async () => {
    const root = attempt("att-1");
    const probe = attempt("att-2");
    const material = attempt("att-3", {
      parent_attempt_id: "att-1", parent_alpha_id: "alpha-p19", intent_kind: "CLONE_FOR_EXPERIMENT",
      requested_spec: requested([], "per_fold_causal", 11), effective_spec: effective("per_fold_causal", 11),
    });
    const oneKey = attempt("att-4", {
      parent_attempt_id: "att-1", parent_alpha_id: "alpha-p19", intent_kind: "CLONE_FOR_EXPERIMENT",
      requested_spec: requested([], "global", 12), effective_spec: effective("global", 12),
    });
    const sealed = attempt("att-5");
    const value = snapshot({
      attempts: [root, probe, material, oneKey, sealed],
      libraryRows: rows("run-att-1", "run-att-2", "run-att-3", "run-att-4", "run-att-5"),
      counts: { total_attempts: 5, draft_attempts: 0, submitted_attempts: 5, failed_attempts: 0, abandoned_attempts: 0, child_runs: 0, technical_retries: 0 },
    });
    const items = {
      "run-att-5": libraryItem("run-att-5", {
        rc: { kind: "LOCAL_SEAL", release_candidate_id: "rc_01JABCDEFGHJKMNPQRSTVWXYZ0", draft_id: null, delivery_state: "NOT_DELIVERED", approval_state: "NOT_APPROVED", sealed_at_utc_ms: 1_790_035_100_000 },
        rc_availability: { state: "AVAILABLE", reason_code: null },
      }),
    };
    const response = await subject(value, items).service.read(scope, "alpha-p19", { limit: 128 }, user as never);
    const kind = Object.fromEntries(response.attempts.map((node) => [node.attempt_id, [node.presentation_kind, node.presentation_reasons]]));
    expect(kind).toEqual({
      "att-1": ["STORIED", ["VERSION_FIRST_ATTEMPT"]],
      "att-2": ["PROBE", []],
      "att-3": ["STORIED", ["MATERIAL_CHANGES"]],
      "att-4": ["PROBE", []],
      "att-5": ["STORIED", ["RELEASE_CANDIDATE"]],
    });
    expect(response.counts).toMatchObject({ storied_returned: 3, probe_returned: 2 });
    expect(response.alpha.versions[0]!.presentation).toEqual({ storied: 3, probe: 2, basis: "RETURNED_ATTEMPTS" });
    expect(response.presentation_rule).toEqual({
      version: "research.lineage-presentation.v1",
      storied_when: ["PROMOTION_PICK", "RELEASE_CANDIDATE", "VERSION_FIRST_ATTEMPT", "GATES_RESET", "MATERIAL_CHANGES"],
      material_change_threshold: 2,
    });
    // CG-P19-04: the same relation the Run Library shows, as a reference.
    expect(response.attempts[4]!.release_candidate).toEqual({
      kind: "LOCAL_SEAL", release_candidate_id: "rc_01JABCDEFGHJKMNPQRSTVWXYZ0", draft_id: null, run_id: "run-att-5",
      delivery_state: "NOT_DELIVERED", approval_state: "NOT_APPROVED", sealed_at_utc_ms: 1_790_035_100_000,
    });
    expect(response.attempts[0]!.release_candidate_availability).toEqual({ state: "NOT_PUBLISHED", reason_code: "P21_NO_PERSISTED_RELEASE_CANDIDATE" });
  });

  it("marks a version boundary GATES_RESET", async () => {
    const root = attempt("att-1");
    const upgraded = attempt("att-2", {
      parent_attempt_id: "att-1", parent_alpha_id: "alpha-p19", alpha_version_id: "av-p19-2", alpha_version_label: "av_0_9_2",
    });
    const response = await subject(snapshot({
      versions: [version("av-p19-1", "SUPERSEDED", { first_attempt_id: "att-1" }), version("av-p19-2", "ACTIVE", { first_attempt_id: "att-0", supersedes_alpha_version_id: "av-p19-1" })],
      attempts: [root, upgraded],
      counts: { total_attempts: 3, draft_attempts: 0, submitted_attempts: 3, failed_attempts: 0, abandoned_attempts: 0, child_runs: 0, technical_retries: 0 },
    })).service.read(scope, "alpha-p19", { limit: 128 }, user as never);
    expect(response.attempts[1]).toMatchObject({ presentation_kind: "STORIED", presentation_reasons: ["GATES_RESET"] });
    // CG-P19-07: the RF-03 successor answers "why superseded".
    expect(response.alpha.versions[0]!.supersession).toEqual({
      state: "RECORDED", superseded_by_version_id: "av-p19-2", superseded_by_label: "av_0_9_2", reason_code: null,
    });
    expect(response.alpha.versions[1]!.supersession.state).toBe("NOT_APPLICABLE");
  });
});

describe("W6b CG-P19-14 · promotion standing is a lifecycle/source fact", () => {
  it("never names a winner without a published pick", async () => {
    const response = await subject(snapshot({
      versions: [version("av-p19-1", "SUPERSEDED", { first_attempt_id: "att-1" }), version("av-p19-2", "ACTIVE")],
      attempts: [
        attempt("att-1"),
        attempt("att-2", { alpha_version_id: "av-p19-2", alpha_version_label: "av_0_9_2" }),
        attempt("att-3", { alpha_version_id: "av-p19-2", alpha_version_label: "av_0_9_2", state: "FAILED", primary_run_state: "FAILED" }),
      ],
      counts: { total_attempts: 3, draft_attempts: 0, submitted_attempts: 3, failed_attempts: 1, abandoned_attempts: 0, child_runs: 0, technical_retries: 0 },
    })).service.read(scope, "alpha-p19", { limit: 128 }, user as never);
    expect(response.attempts.map((node) => [node.attempt_id, node.promotion_state, node.promotion_reason_code])).toEqual([
      ["att-1", "CLOSED", "P19_VERSION_NOT_ACTIVE_PROMOTION_CLOSED"],
      ["att-2", "AWAITING_PICK", "P19_SOURCE_DID_NOT_PUBLISH_PROMOTION_PICK"],
      ["att-3", "CLOSED", "P19_ATTEMPT_STATE_CANNOT_PROMOTE"],
    ]);
    expect(response.alpha.versions[1]!.promotion_pick).toMatchObject({
      state: "NOT_PUBLISHED",
      source_authority: { owner: "P22_RELEASE_CANDIDATE_APPROVAL", state: "NOT_CONNECTED" },
      release_candidate: null,
    });
  });

  it("names exactly the attempt a source-attested pick names", async () => {
    const response = await subject(snapshot({
      versions: [version("av-p19-1", "ACTIVE", {
        first_attempt_id: "att-1", promotion_attempt_id: "att-2", promotion_run_id: "run-att-2",
        promotion_source_contract_rev: "p22.approval.v1", promotion_source_digest: digest("9"),
        promotion_source_as_of: new Date("2026-09-22T00:06:00.000Z"),
      })],
      attempts: [attempt("att-1"), attempt("att-2")],
      libraryRows: rows("run-att-1", "run-att-2"),
      counts: { total_attempts: 2, draft_attempts: 0, submitted_attempts: 2, failed_attempts: 0, abandoned_attempts: 0, child_runs: 0, technical_retries: 0 },
    })).service.read(scope, "alpha-p19", { limit: 128 }, user as never);
    expect(response.attempts.map((node) => node.promotion_state)).toEqual(["NOT_PICKED", "PICKED"]);
    expect(response.attempts[1]!.presentation_reasons).toContain("PROMOTION_PICK");
    expect(response.alpha.versions[0]!.promotion_pick).toMatchObject({
      state: "PUBLISHED", source_authority: { state: "CONNECTED" },
      release_candidate: null, release_candidate_availability: { state: "NOT_PUBLISHED", reason_code: "P21_NO_PERSISTED_RELEASE_CANDIDATE" },
    });
  });
});

describe("W6b CG-P19-05/07/08 · per-attempt facts", () => {
  it("prints the Run Library cells, falls back to the retained selected trial, and never invents a zero", async () => {
    const p04 = attempt("att-1");
    const wfo = attempt("att-2", { execution_profile_id: "p10.delta-signal-notional-wfo.v1" });
    const draft = attempt("att-3", { state: "DRAFT", primary_run_id: null, primary_run_state: null, requested_spec: null, effective_spec: null, execution_profile_id: null });
    const response = await subject(snapshot({
      attempts: [p04, wfo, draft],
      libraryRows: rows("run-att-1", "run-att-2"),
      retainedMetrics: [{ run_id: "run-att-2", artifact_revision: 1, metrics: { mean_oos_sharpe: "-5.354970424211971", mean_decay: "3.911439612138451" } }],
      counts: { total_attempts: 3, draft_attempts: 1, submitted_attempts: 2, failed_attempts: 0, abandoned_attempts: 0, child_runs: 0, technical_retries: 0 },
    }), {
      "run-att-2": libraryItem("run-att-2", {
        stats: [
          { key: "oos_sharpe", label: "OOS sharpe", role: "OOS_SHARPE", value: null, tone: "DEFAULT", availability: { state: "NOT_PUBLISHED", reason_code: "P13_SOURCE_EVIDENCE_NOT_PUBLISHED" }, scope: null, definition_id: null },
          { key: "decay", label: "Δ decay", role: "DECAY", value: null, tone: "DEFAULT", availability: { state: "NOT_PUBLISHED", reason_code: "P13_SOURCE_EVIDENCE_NOT_PUBLISHED" }, scope: null, definition_id: null },
          { key: "trade_count", label: "trades", role: "TRADE_COUNT", value: null, tone: "DEFAULT", availability: { state: "NOT_PUBLISHED", reason_code: "P13_SOURCE_EVIDENCE_NOT_PUBLISHED" }, scope: null, definition_id: null },
        ],
      }),
    }).service.read(scope, "alpha-p19", { limit: 128 }, user as never);
    const [first, second, third] = response.attempts;
    expect(first!.run_facts.oos_sharpe).toEqual({
      value: "0.7440081232022494", source: "P13_EVIDENCE_PROJECTION", scope: "OOS",
      definition_id: "research.metric.v3.oos_sharpe", availability: { state: "AVAILABLE", reason_code: null },
    });
    expect(first!.run_facts.decay).toEqual({
      value: null, source: null, scope: null, definition_id: null,
      availability: { state: "NOT_PUBLISHED", reason_code: "P13_IS_BOUNDARY_NOT_IN_CHILD_RECEIPT" },
    });
    expect(first!.run_facts.certificate).toEqual({ grade: null, availability: { state: "NOT_PUBLISHED", reason_code: "SOURCE_DID_NOT_PUBLISH_METHODOLOGY_CERTIFICATE" } });
    expect(first!.run_facts.claim.state).toBe("NOT_ISSUED");
    expect(first!.outcome).toEqual({
      text: "The fixed P10 qualification sealed its artifacts but did not issue a release claim.",
      source: "SOURCE_CLAIM_SENTENCE", availability: { state: "AVAILABLE", reason_code: null },
    });
    expect(first!.primary_run.execution_profile_id).toBe("p04.fixed-qualification.v1");
    expect(second!.run_facts.oos_sharpe).toMatchObject({ value: "-5.354970424211971", source: "RS02_RETAINED_SELECTED_TRIAL", scope: "SELECTED_TRIAL_MEAN_ACROSS_FOLDS" });
    expect(second!.run_facts.decay).toMatchObject({ value: "3.911439612138451", source: "RS02_RETAINED_SELECTED_TRIAL" });
    expect(second!.primary_run.execution_profile_id).toBe("p10.delta-signal-notional-wfo.v1");
    expect(third!.run_facts.oos_sharpe.availability).toEqual({ state: "NOT_APPLICABLE", reason_code: "P19_ATTEMPT_HAS_NO_PRIMARY_RUN" });
    expect(third!.spec_label).toEqual({ text: null, space: null, availability: { state: "NOT_PUBLISHED", reason_code: "P19_PERSISTED_PREFLIGHT_MANIFEST_NOT_AVAILABLE" } });
    // CG-P19-08: an allow-listed spec line and the declared space after overrides.
    expect(first!.spec_label).toEqual({
      text: "signal_notional · mode_1_decay × global",
      space: { parameters: 3, swept: 2, pinned: 1 },
      availability: { state: "AVAILABLE", reason_code: null },
    });
    // CG-P19-07: the version line is composed from those facts.
    expect(response.alpha.versions[0]!.outcome).toEqual({
      text: "cert not issued · no rc · no pick published", rule: "research.lineage-version-outcome.v1",
      availability: { state: "AVAILABLE", reason_code: null },
    });
  });

  it("uses the attempt's own reason as its outcome and pins an overridden parameter", async () => {
    const abandoned = attempt("att-1", {
      state: "ABANDONED", reason: "decay unstable across seeds",
      requested_spec: requested([{ name: "entry_z", kind: "pin", value: 1.4 }]),
    });
    const response = await subject(snapshot({ attempts: [abandoned], libraryRows: rows("run-att-1") })).service.read(scope, "alpha-p19", { limit: 128 }, user as never);
    expect(response.attempts[0]!.outcome).toEqual({ text: "decay unstable across seeds", source: "ATTEMPT_REASON", availability: { state: "AVAILABLE", reason_code: null } });
    expect(response.attempts[0]!.spec_label.space).toEqual({ parameters: 3, swept: 1, pinned: 2 });
    expect(response.attempts[0]!.promotion_state).toBe("CLOSED");
  });
});

describe("W6b CG-P19-06 · exercised and untried", () => {
  it("unions every attempt's declaration and lists Atlas routes nobody declared", async () => {
    const response = await subject(snapshot({
      exercised: [
        { alpha_version_id: "av-p19-1", execution_route: "signal_notional", optimization_mode: "mode_1_decay", optimization_schedule: "global",
          parameter_space_overrides: [{ name: "window", kind: "sweep", low: 12, high: 96 }], attempts: 3 },
        { alpha_version_id: "av-p19-1", execution_route: "signal_notional", optimization_mode: "mode_1_decay", optimization_schedule: "per_fold_decay",
          parameter_space_overrides: [{ name: "entry_z", kind: "pin", value: 1.4 }], attempts: 2 },
        { alpha_version_id: "av-p19-1", execution_route: null, optimization_mode: null, optimization_schedule: null, parameter_space_overrides: null, attempts: 1 },
      ],
    })).service.read(scope, "alpha-p19", { limit: 128 }, user as never);
    const version0 = response.alpha.versions[0]!;
    expect(version0.exercised).toEqual({
      routes: ["signal_notional"],
      modes: ["mode_1_decay × global", "mode_1_decay × per_fold_decay"],
      param_ranges: [
        { name: "entry_z", kind: "SWEEP", low: "0.6", high: "2.6", values: [] },
        { name: "fee_bps", kind: "PIN", low: "4", high: "4", values: [] },
        { name: "window", kind: "SWEEP", low: "12", high: "96", values: [] },
      ],
      attempts_considered: 5,
      attempts_without_manifest: 1,
      availability: { state: "PARTIAL", reason_code: "P19_PERSISTED_PREFLIGHT_MANIFEST_NOT_AVAILABLE" },
    });
    expect(version0.untried).toEqual({
      routes: [{ route_id: "intrabar_bracket", status_word: "SUPPORTED" }, { route_id: "dca_ladder", status_word: "LEGACY" }],
      availability: { state: "PARTIAL", reason_code: "P19_PERSISTED_PREFLIGHT_MANIFEST_NOT_AVAILABLE" },
    });
  });

  it("keeps untried a typed absence when the Atlas cannot be read", async () => {
    const response = await subject(snapshot(), {}, { read: vi.fn().mockRejectedValue(new Error("atlas down")) })
      .service.read(scope, "alpha-p19", { limit: 128 }, user as never);
    expect(response.alpha.versions[0]!.untried).toEqual({ routes: [], availability: { state: "NOT_PUBLISHED", reason_code: "P19_ENGINE_ATLAS_NOT_READABLE" } });
    expect(response.alpha.versions[0]!.exercised.availability).toEqual({ state: "NOT_PUBLISHED", reason_code: "P19_VERSION_HAS_NO_ATTEMPT" });
  });
});

describe("W6b CG-P19-13 · counts definitions travel with the answer", () => {
  it("defines every count and names its Run Library equivalent", async () => {
    const response = await subject().service.read(scope, "alpha-p19", { limit: 128 }, user as never);
    expect(response.counts_definitions.version).toBe("research.lineage-counts.v1");
    expect(response.counts_definitions.rows.map((row) => row.key)).toEqual(Object.keys(response.counts));
    expect(response.counts_definitions.rows.find((row) => row.key === "submitted_attempts")!.run_library_equivalent).toMatch(/counters\.logical_runs/);
  });
});
