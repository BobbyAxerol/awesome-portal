/**
 * W5a · P16-T02 (per-fold causal boundary, checked fold by fold) and
 * P16-T11 (the final-audit target is the frozen selection: the out-of-sample
 * generation child of QuantBT's child audit is the frozen θ*, no reselect,
 * no fold-last default).
 *
 * Fixtures: the W5b real signal-notional WFO seal (child audit retained) and
 * the W3 real WFO seal (retained before P17-T14 — no child audit).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";

import {
  ResearchCurrentSourceChildAuditQuerySchema,
  ResearchCurrentSourceFreezeResponseSchema,
  type ResearchCurrentSourceFreezeResponse,
  type ResearchCurrentSourceNotApplicableResponse,
  type ResearchCurrentSourceReplayChildAuditResponse,
} from "../src/research/current-source.contract";
import type { CurrentSourceSealRow, CurrentSourceStoredRow } from "../src/research/current-source.repository";
import { ResearchCurrentSourceService } from "../src/research/current-source.service";
import { FOLD_ORDERING_REASONS, foldOrdering, quantbtCandidateId } from "../src/research/fold-ordering";
import { DEFAULT_PARAMETER_BINDING_REGISTRY } from "../src/research/parameter-binding.registry";
import { openApiValidator } from "./research-rf05-openapi";
import { p11StageEvents } from "../src/research/p11-stage-events";

type Kind = "OBSERVATION" | "FOLD" | "TRIAL" | "CANDIDATE" | "SELECTION";
interface Fixture {
  run_id: string;
  table_rows: Record<Kind, number>;
  manifest_digest: string;
  source_transform_digest: string;
  summary: Record<string, any>;
  rows: Record<Kind, CurrentSourceStoredRow[]>;
}

const w5b = JSON.parse(gunzipSync(readFileSync(join(__dirname, "research-w5b-real-replay.fixture.json.gz"))).toString("utf8")) as Fixture;
const w3 = JSON.parse(readFileSync(join(__dirname, "research-w3-real-hmd-seal.fixture.json"), "utf8")) as Fixture;
const scope = { workspaceId: "ws-w5a", actorUserId: "usr-w5a" };
const config = {
  FEATURE_RESEARCH_CURRENT_SOURCE: "true",
  QUERY_CURSOR_ACTIVE_KEY_ID: "query-k1",
  QUERY_CURSOR_KEYS_JSON: '{"query-k1":"current-source-test-key-is-at-least-32-bytes"}',
  QUERY_CURSOR_TTL_SECONDS: 900,
};
const freezeValidator = openApiValidator("research-current-source.openapi.json", "Freeze");
const candidateKinds = DEFAULT_PARAMETER_BINDING_REGISTRY.byRetainedLaneProfile("rs02.delta-signal-notional-wfo.v1")!.candidateParameterKinds;

function sealOf(fixture: Fixture, summary = fixture.summary): CurrentSourceSealRow {
  return {
    runId: fixture.run_id,
    artifactRevision: 1,
    sourceAdapterId: "rs02.quantbt-signal-notional-wfo.v1",
    profileId: "rs02.delta-signal-notional-wfo.v1",
    manifestDigest: fixture.manifest_digest,
    sourceTransformDigest: fixture.source_transform_digest,
    retainedImportDigest: "f".repeat(64),
    requestedSpecDigest: "1".repeat(64),
    effectiveSpecDigest: "2".repeat(64),
    datasetBindingDigest: "3".repeat(64),
    tableRows: fixture.table_rows,
    totalRows: Object.values(fixture.table_rows).reduce((sum, count) => sum + count, 0),
    summary,
    retainedAtUtcMs: 1_790_269_236_911,
  };
}

function serviceFor(fixture: Fixture, rows: Partial<Record<Kind, CurrentSourceStoredRow[]>> = fixture.rows, summary = fixture.summary) {
  const sorted = (kind: Kind) => [...(rows[kind] ?? [])].sort((a, b) => a.sourceOrdinal - b.sourceOrdinal);
  const repository = {
    sealForRead: vi.fn().mockResolvedValue(sealOf(fixture, summary)),
    runState: vi.fn(),
    stageEventClocks: vi.fn().mockResolvedValue(p11StageEvents()),
    admittedRequestedSpec: vi.fn().mockResolvedValue(null),
    rows: vi.fn(async (_s: unknown, _r: string, _v: number, kind: Kind, selection: { limit: number }) => {
      const all = sorted(kind);
      return { rows: all.slice(0, selection.limit), hasMore: all.length > selection.limit, hasPrevious: false, totalRows: all.length };
    }),
    rowBySourceId: vi.fn(async (_s: unknown, _r: string, _v: number, kind: Kind, id: string) => (rows[kind] ?? []).find((row) => row.sourceId === id) ?? null),
    verifyRetainedImport: vi.fn().mockResolvedValue("f".repeat(64)),
  };
  return { repository, service: new ResearchCurrentSourceService(repository as never, config as never) };
}

function sealed<T>(value: T | ResearchCurrentSourceNotApplicableResponse): T {
  expect((value as { schema_version?: string }).schema_version).not.toBe("research.current-source-not-applicable.v1");
  return value as T;
}

async function freeze(service: ResearchCurrentSourceService, runId: string) {
  const value = sealed<ResearchCurrentSourceFreezeResponse>(await service.freeze(scope, runId));
  expect(ResearchCurrentSourceFreezeResponseSchema.safeParse(value).success).toBe(true);
  freezeValidator.assert(value);
  return value;
}

describe("P16-T02 · the causal boundary is checked per fold, on two axes, never passed by a global study", () => {
  it("each retained fold gets its own data-time boundary and a typed NOT_CAUSAL_GLOBAL_SELECTION from QuantBT's claim", async () => {
    const { service } = serviceFor(w3);
    const ordering = (await freeze(service, w3.run_id)).fold_ordering;
    expect(ordering.axes).toEqual(["DATA_TIME", "WALL_CLOCK"]);
    expect(ordering.selection_scope).toBe("GLOBAL");
    expect(ordering.optimization_schedule).toBe("global");
    expect(ordering.source_claims).toEqual({
      chronological_claim: "not_causal_multi_fold_global_calibration",
      causality_claim: "retrospective_global_calibration",
      oos_used_for_selection: true,
    });
    expect(ordering.wall_clock).toEqual({ state: "NOT_PUBLISHED", reason_code: FOLD_ORDERING_REASONS.wallClock });
    expect(ordering.folds.map((fold) => fold.fold_id)).toEqual(w3.rows.FOLD.map((row) => row.sourceId));
    for (const fold of ordering.folds) {
      const retained = w3.rows.FOLD.find((row) => row.sourceId === fold.fold_id)!.payload as Record<string, number>;
      expect(fold.data_time).toEqual({
        is: { start_utc_ms: retained.train_start_utc_ms, end_utc_ms: retained.train_end_utc_ms },
        oos: { start_utc_ms: retained.test_start_utc_ms, end_utc_ms: retained.test_end_utc_ms },
        boundary: "IS_ENDS_BEFORE_OOS",
        reason_code: null,
      });
      expect(fold.verdict).toBe("NOT_CAUSAL_GLOBAL_SELECTION");
      expect(fold.reason_code).toBe("SELECTION_SAW_EVERY_OUTER_FOLD");
    }
    expect(ordering.counts).toMatchObject({ folds: 2, not_causal_global_selection: 2, not_evaluated: 0, not_published: 0 });
    expect(JSON.stringify(ordering)).not.toMatch(/"PASS"/);
  });

  it("a fold whose IS overlaps its OOS is named on that fold only; a missing window is a typed absence", async () => {
    const rows = structuredClone(w3.rows);
    (rows.FOLD[1]!.payload as Record<string, unknown>).train_end_utc_ms = (rows.FOLD[1]!.payload as Record<string, number>).test_start_utc_ms;
    (rows.FOLD[0]!.payload as Record<string, unknown>).test_start_utc_ms = null;
    const { service } = serviceFor(w3, rows);
    const [first, second] = (await freeze(service, w3.run_id)).fold_ordering.folds;
    expect(first!.data_time).toMatchObject({ boundary: "NOT_PUBLISHED", reason_code: FOLD_ORDERING_REASONS.windowNotPublished });
    expect(second!.data_time.boundary).toBe("IS_OVERLAPS_OOS");
  });

  it("a per_fold_causal schedule is NOT_EVALUATED with the not-admitted reason; a seal without facts is NOT_PUBLISHED", () => {
    const facts = structuredClone(w3.summary.source_facts);
    facts.search.optimization_schedule = "per_fold_causal";
    const input = [{ sourceOrdinal: 0, foldId: "0", trainStartUtcMs: 0, trainEndUtcMs: 1, testStartUtcMs: 2, testEndUtcMs: 3, childAudit: undefined }];
    const perFold = foldOrdering(input, facts, { rvol: "1.2" });
    expect(perFold.selection_scope).toBe("PER_FOLD");
    expect(perFold.folds[0]).toMatchObject({ verdict: "NOT_EVALUATED", reason_code: FOLD_ORDERING_REASONS.perFoldNotAdmitted });
    const legacy = foldOrdering(input, undefined, { rvol: "1.2" });
    expect(legacy.folds[0]).toMatchObject({ verdict: "NOT_PUBLISHED", reason_code: FOLD_ORDERING_REASONS.sealPredatesFacts });
    expect(legacy.source_claims).toEqual({ chronological_claim: null, causality_claim: null, oos_used_for_selection: null });
  });
});

describe("P16-T11 · the final-audit target is the frozen selection", () => {
  it("QuantBT's candidate identity of the frozen θ* is reproduced exactly", () => {
    expect(quantbtCandidateId(w5b.summary.selection.parameters, candidateKinds)).toBe("2671e27b827ab2701d52e6ce");
    expect(quantbtCandidateId({ mode: "sma" }, candidateKinds)).toBeNull();
    expect(quantbtCandidateId({}, candidateKinds)).toBeNull();
    expect(quantbtCandidateId({ rvol: "1" }, undefined)).toBeNull();
    expect(quantbtCandidateId({ window: "54.5" }, candidateKinds)).toBeNull();
  });

  it("every fold's out-of-sample generation child in the replay child audit is the frozen selection — no reselect, no fold-last", async () => {
    const { service } = serviceFor(w5b);
    const value = await freeze(service, w5b.run_id);
    const frozen = quantbtCandidateId(value.frozen_selection.parameters, candidateKinds);
    expect(value.fold_ordering.frozen_candidate.candidate_id).toBe(frozen);
    expect(value.fold_ordering.counts).toMatchObject({ folds: 2, oos_child_match: 2, oos_child_mismatch: 0 });
    for (const fold of value.fold_ordering.folds) {
      const audit = sealed<ResearchCurrentSourceReplayChildAuditResponse>(
        await service.replayChildAudit(scope, w5b.run_id, ResearchCurrentSourceChildAuditQuerySchema.parse({ fold: fold.fold_id })),
      );
      const generation = audit.records.filter((record) => record.context === "out-of-sample generation");
      expect(generation).toHaveLength(1);
      expect(generation[0]!.candidate_id).toBe(frozen);
      expect(fold.oos_generation_child).toEqual({
        state: "MATCH", reason_code: null, audit_ordinal: generation[0]!.audit_ordinal, candidate_id: frozen,
      });
    }
    // The in-sample search saw other candidates; only the frozen one generated OOS bars.
    const searched = new Set(w5b.rows.FOLD.flatMap((row) => (row.payload.child_audit as { records: Array<{ candidate_id: string }> }).records.map((r) => r.candidate_id)));
    expect(searched.size).toBeGreaterThan(1);
  });

  it("restores a Python integral float without changing the sealed parameter digest or hiding real mismatches", async () => {
    // Independent QuantBT 1.1.1 _strategy_candidate_id on the real 400-trial
    // preview selection: rvol=1.0, all six integer axes keep their int kind.
    const parameters = { rvol: "1", rsi_l: "14", window: "54", len_vol: "28",
      len_atr1: "20", len_atr2: "47", slpercent: "1.6", signalLength: "15" };
    expect(quantbtCandidateId(parameters, candidateKinds)).toBe("00b18de5ca922d3223fc317e");
    const rows = structuredClone(w5b.rows);
    const summary = structuredClone(w5b.summary);
    summary.selection.parameters = parameters;
    for (const row of rows.FOLD) {
      const records = (row.payload.child_audit as { records: Array<{ context: string; candidate_id: string }> }).records;
      records.find((record) => record.context === "out-of-sample generation")!.candidate_id = "00b18de5ca922d3223fc317e";
    }
    const { service } = serviceFor(w5b, rows, summary);
    const value = await freeze(service, w5b.run_id);
    expect(value.frozen_selection.parameters).toEqual(parameters);
    expect(value.fold_ordering.counts).toMatchObject({ oos_child_match: 2, oos_child_mismatch: 0 });
  });

  it("an OOS child that is not the frozen θ* is a MISMATCH on that fold, never re-targeted", async () => {
    const rows = structuredClone(w5b.rows);
    const records = (rows.FOLD[1]!.payload.child_audit as { records: Array<{ context: string; candidate_id: string }> }).records;
    records.find((record) => record.context === "out-of-sample generation")!.candidate_id = "baf7c707c2436a55bb012a15";
    const { service } = serviceFor(w5b, rows);
    const ordering = (await freeze(service, w5b.run_id)).fold_ordering;
    expect(ordering.folds.map((fold) => fold.oos_generation_child.state)).toEqual(["MATCH", "MISMATCH"]);
    expect(ordering.counts).toMatchObject({ oos_child_match: 1, oos_child_mismatch: 1 });
  });

  it("a seal retained before the child audit says so per fold", async () => {
    const { service } = serviceFor(w3);
    const ordering = (await freeze(service, w3.run_id)).fold_ordering;
    for (const fold of ordering.folds) {
      expect(fold.oos_generation_child).toEqual({ state: "NOT_RETAINED", reason_code: FOLD_ORDERING_REASONS.childAuditNotRetained, audit_ordinal: null, candidate_id: null });
    }
  });
});
