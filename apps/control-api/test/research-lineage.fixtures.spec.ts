/**
 * W6b CG-P19-01 · canonical Screen-10 fixtures.
 *
 * Every body is the service's own answer for a persisted-row snapshot, so a
 * frontend test that loads one reads what the server would say.
 * `W6B_WRITE_FIXTURES=1` rewrites them; every run validates the committed
 * files against Zod and the published OpenAPI component.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { ResearchAttemptLineageResponseSchema, type ResearchAttemptLineageResponse } from "../src/research/lineage.contract";
import {
  attempt, digest, effective, libraryItem, requested, resetClock, rows, scope, snapshot, subject, user, version,
} from "./research-lineage.builders";
import { openApiValidator } from "./research-rf05-openapi";

const root = resolve(process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts"), "fixtures");
const FILES = {
  healthy: "research-attempt-lineage.healthy.valid.json",
  partial: "research-attempt-lineage.partial.valid.json",
  empty: "research-attempt-lineage.empty.valid.json",
  bounded: "research-attempt-lineage.bounded.valid.json",
  problems: "research-attempt-lineage.problems.valid.json",
} as const;
const responseValidator = openApiValidator("research-attempt-lineage.openapi.json", "AttemptLineageResponse");
const problemValidator = openApiValidator("research-attempt-lineage.openapi.json", "Problem");

const AV1 = "av-p19-momentum-0-9-2";
const AV2 = "av-p19-momentum-0-9-3";
const RC_DRAFT = { kind: "ACTOR_DRAFT", release_candidate_id: null, draft_id: "rcd_01JB2C3D4E5F6G7H8J9KMNPQRS", delivery_state: null, approval_state: null, sealed_at_utc_ms: null };

/** Screen 01's three cells for a run that stopped: lifecycle cells, no OOS Sharpe or decay. */
function stopped(status: "FAILED" | "CANCELLED") {
  const absent = { state: "NOT_PUBLISHED", reason_code: `P12_${status}_RUN_HAS_NO_PERFORMANCE_FACT` };
  return [
    { key: "failed_at", label: "failed at", role: "FAILED_AT", value: null, tone: "BAD", availability: absent, scope: null, definition_id: null },
    { key: "failure_reason", label: "reason", role: "FAILURE_REASON", value: null, tone: "BAD", availability: absent, scope: null, definition_id: null },
    { key: "runtime", label: "runtime", role: "RUNTIME", value: null, tone: "BAD", availability: absent, scope: null, definition_id: null },
  ];
}

async function healthy(): Promise<ResearchAttemptLineageResponse> {
  resetClock();
  const on = (version: string, label: string) => ({ alpha_version_id: version, alpha_version_label: label });
  const child = (id: string, parent: string, extra: Record<string, unknown> = {}) =>
    attempt(id, { parent_attempt_id: parent, parent_alpha_id: "alpha-p19", intent_kind: "CLONE_FOR_EXPERIMENT", ...extra });
  const att01 = attempt("att_01", on(AV1, "av_0_9_2"));
  const att02 = child("att_02", "att_01", { ...on(AV1, "av_0_9_2"), requested_spec: requested([], "per_fold_decay"), effective_spec: effective("per_fold_decay") });
  const att03 = child("att_03", "att_02", {
    ...on(AV2, "av_0_9_3"), requested_spec: requested([], "per_fold_causal"), effective_spec: effective("per_fold_causal"),
    execution_profile_id: "p10.delta-signal-notional-wfo.v1",
  });
  const att04 = child("att_04", "att_03", {
    ...on(AV2, "av_0_9_3"),
    requested_spec: requested([{ name: "entry_z", kind: "pin", value: 1.4 }], "per_fold_causal", 11),
    effective_spec: effective("per_fold_causal", 11),
    exposure_count: 2, exposure_roles: ["OUTER_OOS", "SELECTION_INPUT"], latest_source_as_of: new Date("2026-09-22T02:00:00.000Z"),
    technical_retry_count: 1,
  });
  const att05 = child("att_05", "att_03", {
    ...on(AV2, "av_0_9_3"), state: "ABANDONED", primary_run_state: "CANCELLED", reason: "decay unstable across seeds; kept for the record.",
    requested_spec: requested([{ name: "window", kind: "sweep", low: 12, high: 96 }], "per_fold_causal"), effective_spec: effective("per_fold_causal"),
  });
  const att06 = child("att_06", "att_03", {
    ...on(AV2, "av_0_9_3"), state: "DRAFT", primary_run_id: null, primary_run_state: null, effective_spec_digest: null,
    engine_release_id: null, dataset_binding_digest: null, requested_spec: null, effective_spec: null, execution_profile_id: null,
  });
  const att07 = attempt("att_07", { ...on(AV2, "av_0_9_3"), state: "FAILED", primary_run_state: "FAILED" });
  const value = snapshot({
    versions: [
      version(AV1, "SUPERSEDED", { first_attempt_id: "att_01", declared_contract: { ...version(AV1, "SUPERSEDED").declared_contract, version: "0.9.2" } }),
      version(AV2, "ACTIVE", {
        first_attempt_id: "att_03", supersedes_alpha_version_id: AV1,
        declared_contract: { ...version(AV2, "ACTIVE").declared_contract, version: "0.9.3" },
        promotion_attempt_id: "att_04", promotion_run_id: "run-att_04", promotion_source_contract_rev: "p22.release-approval.v1",
        promotion_source_digest: digest("9"), promotion_source_as_of: new Date("2026-09-22T03:00:00.000Z"),
      }),
    ],
    alpha: { alpha_id: "alpha-p19", name: "Momentum BTC", active_version_id: AV2, active_version_state: "ACTIVE" },
    attempts: [att01, att02, att03, att04, att05, att06, att07],
    childRuns: [{
      attempt_id: "att_04", run_id: "run-att_04-audit", run_kind: "AUDIT", relationship_kind: "AUDIT_OF_SELECTION",
      parent_run_id: "run-att_04", state: "READY", created_at: new Date("2026-09-22T02:30:00.000Z"),
    }],
    counts: { total_attempts: 7, draft_attempts: 1, submitted_attempts: 6, failed_attempts: 1, abandoned_attempts: 1, child_runs: 1, technical_retries: 1 },
    libraryRows: rows("run-att_01", "run-att_02", "run-att_03", "run-att_04", "run-att_05", "run-att_07"),
    retainedMetrics: [{ run_id: "run-att_03", artifact_revision: 1, metrics: { mean_oos_sharpe: "1.19", mean_decay: "0.21" } }],
    exercised: [
      { alpha_version_id: AV1, execution_route: "signal_notional", optimization_mode: "mode_1_decay", optimization_schedule: "global", parameter_space_overrides: [], attempts: 1 },
      { alpha_version_id: AV1, execution_route: "signal_notional", optimization_mode: "mode_1_decay", optimization_schedule: "per_fold_decay", parameter_space_overrides: [], attempts: 1 },
      { alpha_version_id: AV2, execution_route: "signal_notional", optimization_mode: "mode_1_decay", optimization_schedule: "global", parameter_space_overrides: [], attempts: 1 },
      { alpha_version_id: AV2, execution_route: "signal_notional", optimization_mode: "mode_1_decay", optimization_schedule: "per_fold_causal", parameter_space_overrides: [], attempts: 1 },
      { alpha_version_id: AV2, execution_route: "signal_notional", optimization_mode: "mode_1_decay", optimization_schedule: "per_fold_causal", parameter_space_overrides: [{ name: "entry_z", kind: "pin", value: 1.4 }], attempts: 1 },
      { alpha_version_id: AV2, execution_route: "signal_notional", optimization_mode: "mode_1_decay", optimization_schedule: "per_fold_causal", parameter_space_overrides: [{ name: "window", kind: "sweep", low: 12, high: 96 }], attempts: 1 },
      { alpha_version_id: AV2, execution_route: null, optimization_mode: null, optimization_schedule: null, parameter_space_overrides: null, attempts: 1 },
    ],
  });
  const certified = (runId: string, grade: "B" | "C", claim: string) => libraryItem(runId, {
    certificate: { grade, availability: { state: "AVAILABLE", reason_code: null } },
    claim: { state: "ISSUED", text: claim, availability: { state: "AVAILABLE", reason_code: null } },
  });
  const items = {
    "run-att_01": certified("run-att_01", "C", "Retrospective claim only — the schedule capped it at C."),
    "run-att_02": certified("run-att_02", "C", "Selection-adjusted: OOS entered selection, so the claim got weaker."),
    "run-att_03": libraryItem("run-att_03", {
      stats: libraryItem("run-att_03").stats.map((cell) => ({ ...cell, value: null, scope: null, definition_id: null, availability: { state: "NOT_PUBLISHED", reason_code: "P13_SOURCE_EVIDENCE_NOT_PUBLISHED" } })),
      claim: { state: "NOT_ISSUED", text: "The Delta walk-forward study sealed its artifacts but did not issue a release claim.", availability: { state: "AVAILABLE", reason_code: null } },
    }),
    "run-att_04": { ...certified("run-att_04", "B", "Strict outer OOS — the strongest claim this mode can issue while the holdout stays sealed."), rc: RC_DRAFT, rc_availability: { state: "AVAILABLE", reason_code: null } },
    // A cancelled/failed run has no performance cells on Screen 01 either.
    "run-att_05": libraryItem("run-att_05", { stats: stopped("CANCELLED"), claim: { state: null, text: null, availability: { state: "NOT_PUBLISHED", reason_code: "SOURCE_CANCELLED_BEFORE_CLAIM" } } }),
    "run-att_07": libraryItem("run-att_07", { stats: stopped("FAILED"), claim: { state: null, text: null, availability: { state: "NOT_PUBLISHED", reason_code: "SOURCE_CLAIM_NOT_PUBLISHED" } } }),
  };
  const response = await subject(value, items as never).service.read(scope, "alpha-p19", { limit: 128 }, user as never);
  return response;
}

async function partial(): Promise<ResearchAttemptLineageResponse> {
  resetClock();
  const noManifest = { requested_spec: null, effective_spec: null };
  const older = [
    attempt("att_p041", { ...noManifest, parent_attempt_id: "att_p012", parent_alpha_id: "alpha-p19", intent_kind: "CLONE_FOR_EXPERIMENT" }),
    attempt("att_p042", { ...noManifest, parent_attempt_id: "att_p041", parent_alpha_id: "alpha-p19", intent_kind: "CLONE_FOR_EXPERIMENT" }),
    attempt("att_p043", { ...noManifest, state: "FAILED", primary_run_state: "FAILED" }),
  ];
  const children = Array.from({ length: 33 }, (_, index) => ({
    attempt_id: "att_p042", run_id: `run-att_p042-diag-${String(index).padStart(2, "0")}`, run_kind: "DIAGNOSTIC",
    relationship_kind: "DIAGNOSTIC_OF_RUN", parent_run_id: "run-att_p042", state: "READY",
    created_at: new Date(Date.UTC(2026, 8, 22, 3, index)),
  }));
  const value = snapshot({
    attempts: older, childRuns: children, hasMore: false, window: "OLDER_PAGE",
    versions: [version("av-p19-1", "ACTIVE", { first_attempt_id: "att_p001" })],
    counts: { total_attempts: 140, draft_attempts: 0, submitted_attempts: 140, failed_attempts: 9, abandoned_attempts: 4, child_runs: 33, technical_retries: 2 },
    libraryRows: [],
    exercised: [{ alpha_version_id: "av-p19-1", execution_route: null, optimization_mode: null, optimization_schedule: null, parameter_space_overrides: null, attempts: 140 }],
  });
  return subject(value, {}, { read: vi.fn().mockRejectedValue(new Error("atlas not configured")) })
    .service.read(scope, "alpha-p19", { limit: 3 }, user as never);
}

async function empty(): Promise<ResearchAttemptLineageResponse> {
  resetClock();
  return subject(snapshot({
    attempts: [], libraryRows: [], exercised: [],
    counts: { total_attempts: 0, draft_attempts: 0, submitted_attempts: 0, failed_attempts: 0, abandoned_attempts: 0, child_runs: 0, technical_retries: 0 },
  })).service.read(scope, "alpha-p19", { limit: 128 }, user as never);
}

async function bounded(): Promise<ResearchAttemptLineageResponse> {
  resetClock();
  const newest = Array.from({ length: 128 }, (_, index) => {
    const ordinal = index + 13;
    return attempt(`att_${String(ordinal).padStart(3, "0")}`, {
      created_at: new Date(Date.UTC(2026, 7, 1) + ordinal * 3_600_000),
      created_at_cursor: new Date(Date.UTC(2026, 7, 1) + ordinal * 3_600_000).toISOString().replace("Z", "000Z"),
      state: ordinal % 11 === 0 ? "ABANDONED" : ordinal % 7 === 0 ? "FAILED" : "READY",
      requested_spec: requested([], ["global", "per_fold_decay", "per_fold_causal"][ordinal % 3]!),
    });
  });
  return subject(snapshot({
    attempts: newest, hasMore: true, libraryRows: rows(...newest.map((row) => row.primary_run_id as string)),
    versions: [version("av-p19-1", "ACTIVE", { first_attempt_id: "att_001" })],
    counts: { total_attempts: 140, draft_attempts: 0, submitted_attempts: 140, failed_attempts: 18, abandoned_attempts: 11, child_runs: 0, technical_retries: 0 },
    exercised: [
      { alpha_version_id: "av-p19-1", execution_route: "signal_notional", optimization_mode: "mode_1_decay", optimization_schedule: "global", parameter_space_overrides: [], attempts: 47 },
      { alpha_version_id: "av-p19-1", execution_route: "signal_notional", optimization_mode: "mode_1_decay", optimization_schedule: "per_fold_decay", parameter_space_overrides: [], attempts: 47 },
      { alpha_version_id: "av-p19-1", execution_route: "signal_notional", optimization_mode: "mode_1_decay", optimization_schedule: "per_fold_causal", parameter_space_overrides: [], attempts: 46 },
    ],
  })).service.read(scope, "alpha-p19", { limit: 128 }, user as never);
}

const PROBLEMS = {
  400: { error: { code: "RESEARCH_LINEAGE_INVALID", message: "Invalid Research Attempt Lineage request." }, request_id: "req-p19-400" },
  401: { error: { code: "AUTH_REQUIRED", message: "Authentication required." }, request_id: "req-p19-401" },
  403: { error: { code: "RESEARCH_LINEAGE_FORBIDDEN", message: "Access denied." }, request_id: "req-p19-403" },
  404: { error: { code: "RESEARCH_LINEAGE_NOT_FOUND", message: "Research Alpha was not found." }, request_id: "req-p19-404" },
  503: { error: { code: "RESEARCH_LINEAGE_UNAVAILABLE", message: "Attempt Lineage is temporarily unavailable." }, request_id: "req-p19-503" },
};

describe("CG-P19-01 · published Attempt Lineage fixtures", () => {
  it("writes (opt-in) and validates the committed fixtures", async () => {
    if (process.env.W6B_WRITE_FIXTURES === "1") {
      const bodies: Array<[string, unknown]> = [
        [FILES.healthy, await healthy()],
        [FILES.partial, await partial()],
        [FILES.empty, await empty()],
        [FILES.bounded, await bounded()],
        [FILES.problems, PROBLEMS],
      ];
      // The 128-node page is written compactly; the others stay readable.
      for (const [name, body] of bodies) writeFileSync(join(root, name), `${JSON.stringify(body, null, name === FILES.bounded ? undefined : 2)}\n`);
    }
    const read = (name: string) => JSON.parse(readFileSync(join(root, name), "utf8"));
    for (const name of [FILES.healthy, FILES.partial, FILES.empty, FILES.bounded]) {
      const body = read(name);
      expect(ResearchAttemptLineageResponseSchema.safeParse(body).success, name).toBe(true);
      responseValidator.assert(body);
    }
    for (const problem of Object.values(read(FILES.problems))) problemValidator.assert(problem);

    // The committed bodies still equal the service's answer (no hand edits).
    expect(read(FILES.healthy)).toEqual(await healthy());
    expect(read(FILES.bounded).coverage).toEqual((await bounded()).coverage);

    const h = read(FILES.healthy) as ResearchAttemptLineageResponse;
    expect(h.alpha.versions.map((row) => [row.label, row.lifecycle_state])).toEqual([["av_0_9_2", "SUPERSEDED"], ["av_0_9_3", "ACTIVE"]]);
    expect(h.attempts).toHaveLength(7);
    expect(h.alpha.versions[1]!.promotion_pick).toMatchObject({ state: "PUBLISHED", attempt_id: "att_04", release_candidate: { kind: "ACTOR_DRAFT" } });
    expect(h.attempts.find((row) => row.attempt_id === "att_04")).toMatchObject({ promotion_state: "PICKED", presentation_kind: "STORIED", exposure: { state: "RECORDED" } });
    expect(h.attempts.find((row) => row.attempt_id === "att_03")!.semantic_diff.gates_reset).toBe(true);
    expect(h.attempts.find((row) => row.attempt_id === "att_07")).toMatchObject({ presentation_kind: "PROBE", promotion_state: "NOT_PICKED" });
    const p = read(FILES.partial) as ResearchAttemptLineageResponse;
    expect(p.coverage).toMatchObject({ state: "PARTIAL", window: "OLDER_PAGE", older_cursor: null });
    expect(p.attempts.find((row) => row.attempt_id === "att_p042")!.child_runs_coverage.state).toBe("PARTIAL");
    expect(p.alpha.versions[0]!.untried.availability.state).toBe("NOT_PUBLISHED");
    const e = read(FILES.empty) as ResearchAttemptLineageResponse;
    expect([e.attempts.length, e.alpha.versions.length]).toEqual([0, 1]);
    const b = read(FILES.bounded) as ResearchAttemptLineageResponse;
    expect([b.counts.returned_attempts, b.counts.total_attempts, b.coverage.window]).toEqual([128, 140, "NEWEST"]);
    expect(b.coverage.older_cursor).toMatch(/^lc1\./);
  });
});
