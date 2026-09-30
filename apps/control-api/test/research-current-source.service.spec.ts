import { describe, expect, it, vi } from "vitest";

import { ResearchCurrentSourceService } from "../src/research/current-source.service";
import type { ResearchCurrentSourceNotApplicableResponse } from "../src/research/current-source.contract";

/** RF-05: these fixtures are sealed RS-02 runs; a not-applicable lane answer here is a test failure. */
function sealed<T>(value: T | ResearchCurrentSourceNotApplicableResponse): T {
  if ((value as { schema_version?: string }).schema_version === "research.current-source-not-applicable.v1") {
    throw new Error("expected a sealed current-source response");
  }
  return value as T;
}
import {
  currentSourceImportDigest,
  type CurrentSourceSealRow,
} from "../src/research/current-source.repository";

const scope = { workspaceId: "rs02-workspace", actorUserId: "rs02-user" };

const seal: CurrentSourceSealRow = {
  runId: "run-rs02",
  artifactRevision: 1,
  sourceAdapterId: "rs02.quantbt-advanced-wfo.v1",
  profileId: "rs02.delta-wfo-global.v1",
  manifestDigest: "a".repeat(64),
  sourceTransformDigest: "b".repeat(64),
  retainedImportDigest: "f".repeat(64),
  requestedSpecDigest: "c".repeat(64),
  effectiveSpecDigest: "d".repeat(64),
  datasetBindingDigest: "e".repeat(64),
  tableRows: { OBSERVATION: 3, FOLD: 2, TRIAL: 2, CANDIDATE: 1, SELECTION: 1 },
  totalRows: 9,
  retainedAtUtcMs: 1_725_000_000_000,
  summary: {
    schema_version: "research.current-source-summary.v1",
    derived_scope: "OUTER_TEST_UNION_INCLUSIVE_V1",
    metrics: {
      initial_equity: "100", final_equity: "110", net_return_fraction: "0.1", max_drawdown_fraction: "-0.02",
    },
    selection: { trial_id: "trial-1", objective: "0.1", parameters: { window: "20" } },
    data_use: {
      warmup: { state: "NOT_PUBLISHED", reason_code: "SOURCE_DID_NOT_PUBLISH_WARMUP" },
      purge: { state: "NOT_PUBLISHED", reason_code: "SOURCE_DID_NOT_PUBLISH_PURGE" },
      embargo: { state: "NOT_PUBLISHED", reason_code: "SOURCE_DID_NOT_PUBLISH_EMBARGO" },
      strict_outer_oos_selection: { state: "NOT_PUBLISHED", reason_code: "SOURCE_DID_NOT_PUBLISH_STRICT_OOS" },
    },
    derived: {
      monthly_returns: {
        source_observation_count: 3, emitted_point_count: 1, total_period_count: 1,
        omitted_leading_period_count: 1, omitted_transport_period_count: 0, sampling: "FULL",
        values: [{ month_start_utc_ms: 1_704_067_200_000, return_fraction: "0.1" }],
      },
      rolling_returns_20: {
        source_observation_count: 0, emitted_point_count: 0, window_observations: 20,
        sampling: "NOT_APPLICABLE", values: [],
      },
      return_distribution: {
        state: "AVAILABLE", reason_code: null, source_observation_count: 3, emitted_point_count: 2,
        sampling: "FULL_RETURN_HISTOGRAM_V2",
        values: [
          { lower_inclusive: "-0.02", upper: "0", upper_inclusive: "false", count: "1" },
          { lower_inclusive: "0", upper: "0.05", upper_inclusive: "true", count: "2" },
        ],
      },
    },
  },
};

const observations = [0, 1, 2].map((ordinal) => ({
  sourceOrdinal: ordinal,
  sourceId: `2024-01-0${ordinal + 1}T00:00:00Z`,
  occurredAtUtcMs: 1_704_067_200_000 + ordinal * 86_400_000,
  payload: {
    source_index_utc: `2024-01-0${ordinal + 1}T00:00:00Z`,
    at_utc_ms: 1_704_067_200_000 + ordinal * 86_400_000,
    equity: String(100 + ordinal * 5), return_fraction: ordinal === 0 ? "0" : "0.05",
    accepted_position: "0.4", drawdown_fraction: ordinal === 1 ? "-0.02" : "0", signal_target: "0.5",
  },
}));

const folds = [0, 1].map((ordinal) => ({
  sourceOrdinal: ordinal, sourceId: `fold-${ordinal}`, occurredAtUtcMs: null,
  payload: {
    fold_id: `fold-${ordinal}`,
    train_start_utc_ms: 1_704_067_200_000 + ordinal * 86_400_000,
    train_end_utc_ms: 1_704_153_600_000 + ordinal * 86_400_000,
    test_start_utc_ms: 1_704_240_000_000 + ordinal * 86_400_000,
    test_end_utc_ms: 1_704_326_400_000 + ordinal * 86_400_000,
  },
}));

const trials = [0, 1].map((ordinal) => ({
  sourceOrdinal: ordinal, sourceId: `trial-${ordinal}`, occurredAtUtcMs: null,
  payload: { trial_id: `trial-${ordinal}`, state: "COMPLETE", objective: `0.${ordinal + 1}`, parameters: { window: String(10 + ordinal) } },
}));

const candidates = [{
  sourceOrdinal: 0, sourceId: "candidate-0", occurredAtUtcMs: null,
  payload: { candidate_id: "candidate-0", objective: "0.2", parameters: { window: "20" } },
}];

function page(rows: Array<{ sourceOrdinal: number; sourceId: string; occurredAtUtcMs: number | null; payload: Record<string, unknown> }>, totalRows = rows.length) {
  return { rows, hasMore: false, hasPrevious: false, totalRows };
}

function service(repository: Record<string, unknown>) {
  return new ResearchCurrentSourceService(repository as never, {
    FEATURE_RESEARCH_CURRENT_SOURCE: "true",
    QUERY_CURSOR_ACTIVE_KEY_ID: "query-k1",
    QUERY_CURSOR_KEYS_JSON: '{"query-k1":"current-source-test-key-is-at-least-32-bytes"}',
    QUERY_CURSOR_TTL_SECONDS: 900,
  } as never);
}

describe("RS-02 retained current-source named read models", () => {
  it("maps actual retained-source fields into five named screen models without a source call", async () => {
    const repository = {
      sealForRead: vi.fn().mockResolvedValue(seal),
      runState: vi.fn(),
      rows: vi.fn().mockImplementation((_scope, _runId, _revision, kind: string) => {
        if (kind === "OBSERVATION") return page(observations, 3);
        if (kind === "FOLD") return page(folds, 2);
        if (kind === "TRIAL") return page(trials, 2);
        if (kind === "CANDIDATE") return page(candidates, 1);
        throw new Error(`unexpected ${kind}`);
      }),
      observationSeries: vi.fn().mockResolvedValue({ rows: observations, sampling: "FULL", extremaEmitted: true }),
      verifyRetainedImport: vi.fn().mockResolvedValue("f".repeat(64)),
    };
    const current = service(repository);
    const evidence = sealed(await current.evidence(scope, "run-rs02"));
    const split = sealed(await current.split(scope, "run-rs02"));
    const search = sealed(await current.search(scope, "run-rs02", { limit: 100 }));
    const freeze = sealed(await current.freeze(scope, "run-rs02"));
    const initialReplay = sealed(await current.replay(scope, "run-rs02", { limit: 100 }));
    const replay = sealed(await current.replay(scope, "run-rs02", {
      limit: 100,
      at: initialReplay.replay.rows[1]!.playback_cursor,
    }));

    expect(evidence.passport.artifact_table_rows).toMatchObject({ observations: 3, trials: 2 });
    expect(split.fold_plan.folds).toHaveLength(2);
    expect(split.guards.train_test_disjoint).toMatchObject({
      verdict: "NOT_CHECKABLE", reason_code: "S05_TEMPORAL_GUARDS_NOT_PUBLISHED",
    });
    expect(search.ledger.trials).toHaveLength(2);
    expect(search.candidates.rows).toHaveLength(1);
    expect(search.selection.selected_trial_id).toBe("trial-1");
    expect(freeze.integrity).toMatchObject({
      state: "MATCH",
      retained_row_count: 9,
      verification_scope: "PORTAL_RETAINED_MANIFEST_ROW_COUNTS_AND_BATCH_RECEIPT",
    });
    expect(replay.replay.state_at_cursor).toMatchObject({
      state: "AVAILABLE_RETAINED_MODEL_SAMPLE", source_ordinal: 1, accepted_position: "0.4",
    });
    expect(replay.route_capabilities.model_positions.state).toBe("AVAILABLE");
    expect(replay.route_capabilities.fills.reason_code).toBe("QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_AUDITED_FILLS");
    const distribution = sealed(await current.evidenceSeries(scope, "run-rs02", "RETURN_DISTRIBUTION"));
    expect(distribution.values).toHaveLength(2);
    expect(repository.rows).toHaveBeenCalled();
  });

  it("LW-04: immutable pre-fix seals do not publish pre-OOS derived rows as OOS", async () => {
    const oldSeal = structuredClone(seal);
    delete (oldSeal.summary as Record<string, unknown>).derived_scope;
    const repository = { sealForRead: vi.fn().mockResolvedValue(oldSeal), runState: vi.fn() };
    const current = service(repository);
    for (const kind of ["MONTHLY_RETURNS", "ROLLING_RETURNS_20", "RETURN_DISTRIBUTION"] as const) {
      const response = sealed(await current.evidenceSeries(scope, "run-rs02", kind));
      expect(response.availability).toEqual({
        state: "NOT_PUBLISHED", reason_code: "PORTAL_DERIVED_SERIES_SCOPE_NOT_OOS",
      });
      expect(response.values).toEqual([]);
      expect(response.source_sample.emitted_point_count).toBe(0);
    }
    const modern = service({ sealForRead: vi.fn().mockResolvedValue(seal), runState: vi.fn() });
    const distribution = sealed(await modern.evidenceSeries(scope, "run-rs02", "RETURN_DISTRIBUTION"));
    expect(distribution.values).toHaveLength(2);
  });

  it("binds a playhead to its relation and reports a local receipt mismatch without reopening source bytes", async () => {
    const repository = {
      sealForRead: vi.fn().mockResolvedValue(seal), runState: vi.fn(),
      rows: vi.fn().mockImplementation((_scope, _runId, _revision, kind: string) => {
        if (kind === "OBSERVATION") return page(observations, 3);
        if (kind === "TRIAL") return page(trials, 2);
        if (kind === "CANDIDATE") return page(candidates, 1);
        // W5a P16-T02: the freeze read derives its per-fold ordering from FOLD.
        if (kind === "FOLD") return page(folds, 2);
        throw new Error(`unexpected ${kind}`);
      }),
      observationSeries: vi.fn().mockResolvedValue({ rows: observations, sampling: "FULL", extremaEmitted: true }),
      verifyRetainedImport: vi.fn().mockResolvedValue("0".repeat(64)),
    };
    const current = service(repository);
    const replay = sealed(await current.replay(scope, "run-rs02", { limit: 100 }));
    const search = sealed(await current.search(scope, "run-rs02", { limit: 100 }));
    const freeze = sealed(await current.freeze(scope, "run-rs02"));

    await expect(current.replay(scope, "run-rs02", {
      limit: 1,
      at: search.ledger.trials[0]!.playback_cursor,
    })).rejects.toMatchObject({ code: "RESEARCH_CURRENT_SOURCE_INVALID", status: 400 });
    await expect(current.replay({ ...scope, workspaceId: "other" }, "run-rs02", {
      limit: 1,
      at: replay.replay.rows[0]!.playback_cursor,
    })).rejects.toMatchObject({ code: "RESEARCH_CURRENT_SOURCE_INVALID", status: 400 });
    expect(freeze.integrity).toMatchObject({ state: "MISMATCH", observed_retained_import_digest: "0".repeat(64) });
    expect(freeze.source_artifact_bytes.reason_code).toBe("P05_SOURCE_BYTES_WERE_VERIFIED_AT_IMPORT_BUT_A_GET_NEVER_REOPENS_PRIVATE_ARTIFACT_BYTES");
  });

  it("canonicalizes the retained batch receipt independent of database row order", () => {
    const rows = [
      { table_kind: "TRIAL" as const, batch_ordinal: 1, batch_digest: "a".repeat(64), row_count: 2 },
      { table_kind: "OBSERVATION" as const, batch_ordinal: 0, batch_digest: "b".repeat(64), row_count: 3 },
      { table_kind: "TRIAL" as const, batch_ordinal: 0, batch_digest: "c".repeat(64), row_count: 2 },
    ];
    expect(currentSourceImportDigest(rows)).toBe(currentSourceImportDigest([...rows].reverse()));
    expect(currentSourceImportDigest(rows)).not.toBe(currentSourceImportDigest([
      ...rows.slice(0, 2), { ...rows[2]!, row_count: 3 },
    ]));
  });

  it("preserves current-source legacy/pending distinctions and refuses to run when dark", async () => {
    const legacy = service({
      sealForRead: vi.fn().mockResolvedValue(null),
      runState: vi.fn().mockResolvedValue({ sourceKind: "LEGACY_1_0_8_METADATA", effectiveStatus: "COMPLETED" }),
    });
    await expect(legacy.evidence(scope, "legacy-run")).rejects.toMatchObject({
      code: "RESEARCH_CURRENT_SOURCE_CONFLICT", status: 409,
    });
    const dark = new ResearchCurrentSourceService({ sealForRead: vi.fn() } as never, {
      FEATURE_RESEARCH_CURRENT_SOURCE: "false",
      QUERY_CURSOR_ACTIVE_KEY_ID: "query-k1",
      QUERY_CURSOR_KEYS_JSON: '{"query-k1":"current-source-test-key-is-at-least-32-bytes"}',
      QUERY_CURSOR_TTL_SECONDS: 900,
    } as never);
    await expect(dark.evidence(scope, "run-rs02")).rejects.toMatchObject({
      code: "RESEARCH_CURRENT_SOURCE_UNAVAILABLE", status: 503,
    });
  });

  it("binds replay paging cursors to the retained revision and workspace", async () => {
    const repository = {
      sealForRead: vi.fn().mockResolvedValue(seal), runState: vi.fn(), rows: vi.fn().mockResolvedValue({
        rows: observations.slice(0, 1), hasMore: true, hasPrevious: false, totalRows: 3,
      }), observationSeries: vi.fn(), verifyRetainedImport: vi.fn(),
    };
    const current = service(repository);
    const first = sealed(await current.replay(scope, "run-rs02", { limit: 1 }));
    const token = first.replay.page.next_cursor;
    expect(token).toMatch(/^kc1\./);
    await current.replay(scope, "run-rs02", { limit: 1, cursor: token! });
    await expect(current.replay({ ...scope, workspaceId: "other" }, "run-rs02", { limit: 1, cursor: token! }))
      .rejects.toMatchObject({ code: "RESEARCH_CURRENT_SOURCE_INVALID", status: 400 });
  });

  it("keeps the maximum admitted trial/candidate screen model below 1 MiB without raw source payloads", async () => {
    const parameters = Object.fromEntries(Array.from({ length: 24 }, (_, index) => [
      `parameter_${index}`, "9".repeat(96),
    ]));
    const maximumTrials = Array.from({ length: 64 }, (_, ordinal) => ({
      sourceOrdinal: ordinal,
      sourceId: `trial-max-${ordinal}`,
      occurredAtUtcMs: null,
      payload: { trial_id: `trial-max-${ordinal}`, state: "COMPLETE", objective: "0.1", parameters },
    }));
    const maximumCandidates = Array.from({ length: 64 }, (_, ordinal) => ({
      sourceOrdinal: ordinal,
      sourceId: `candidate-max-${ordinal}`,
      occurredAtUtcMs: null,
      payload: { candidate_id: `candidate-max-${ordinal}`, objective: "0.1", parameters },
    }));
    const maximumSeal: CurrentSourceSealRow = {
      ...seal,
      tableRows: { OBSERVATION: 3, FOLD: 2, TRIAL: 64, CANDIDATE: 64, SELECTION: 1 },
      totalRows: 134,
      summary: {
        ...seal.summary,
        selection: { trial_id: "trial-max-0", objective: "0.1", parameters },
      },
    };
    const repository = {
      sealForRead: vi.fn().mockResolvedValue(maximumSeal), runState: vi.fn(),
      rows: vi.fn().mockImplementation((_scope, _runId, _revision, kind: string) => {
        if (kind === "TRIAL") return page(maximumTrials, 64);
        if (kind === "CANDIDATE") return page(maximumCandidates, 64);
        // E5: the search read's pool block reads the fold plan for θ*'s per-fold decay.
        if (kind === "FOLD") return page(folds, 2);
        throw new Error(`unexpected ${kind}`);
      }),
    };

    const response = sealed(await service(repository).search(scope, "run-rs02", { limit: 200 }));
    expect(Buffer.byteLength(JSON.stringify(response), "utf8")).toBeLessThan(1_048_576);
    expect(response.candidates.rows).toHaveLength(64);
    expect(response.candidates.rows[0]).not.toHaveProperty("source_payload");
  });
});
