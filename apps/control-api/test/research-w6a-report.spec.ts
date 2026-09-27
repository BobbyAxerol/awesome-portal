/**
 * W6a · P18 frozen core v2 on both lanes (CG-P18-01…11).
 *
 * The WFO lane is assembled from the real QuantBT 1.1.1 Delta
 * signal-notional WFO seal W5b retained (BTCUSDT 1h, 2 folds, 3 trials,
 * seed 42): an in-memory repository with the current-source repository's
 * page semantics stands in for PostgreSQL, so the report reads exactly what
 * Screens 04–08 read. The P04 lane uses the P18 service spec's hub fixture.
 *
 * CG-P18-09: `W6A_WRITE_FIXTURES=1` rewrites the canonical report fixtures
 * from these assemblies; every run validates the committed bodies against
 * Zod and the published OpenAPI so a frontend test can load them.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";

import type { CurrentSourceSealRow, CurrentSourceStoredRow } from "../src/research/current-source.repository";
import { ResearchCurrentSourceService } from "../src/research/current-source.service";
import { sha256ResearchJson } from "../src/research/preflight.service";
import {
  ResearchReportDetailResponseSchema,
  ResearchReportExportStatusSchema,
  type ResearchReportDetailResponse,
  type ResearchReportFrozenCoreV2,
} from "../src/research/report.contract";
import type { StoredResearchReport } from "../src/research/report.repository";
import { ResearchReportService } from "../src/research/report.service";
import { openApiValidator } from "./research-rf05-openapi";

type Kind = "OBSERVATION" | "FOLD" | "TRIAL" | "CANDIDATE" | "SELECTION";
interface Fixture {
  run_id: string;
  table_rows: Record<Kind, number>;
  manifest_digest: string;
  source_transform_digest: string;
  summary: Record<string, unknown>;
  rows: Record<Kind, CurrentSourceStoredRow[]>;
}

const real = JSON.parse(gunzipSync(readFileSync(join(__dirname, "research-w5b-real-replay.fixture.json.gz"))).toString("utf8")) as Fixture;
const scope = { workspaceId: "ws-w6a", actorUserId: "usr-w6a" };
const digest = (char: string) => char.repeat(64);
const available = { state: "AVAILABLE", reason_code: null } as const;
const reportValidator = openApiValidator("research-report.openapi.json", "ReportDetail");

const seal: CurrentSourceSealRow = {
  runId: real.run_id,
  artifactRevision: 1,
  sourceAdapterId: "rs02.quantbt-signal-notional-wfo.v1",
  profileId: "rs02.delta-signal-notional-wfo.v1",
  manifestDigest: real.manifest_digest,
  sourceTransformDigest: real.source_transform_digest,
  retainedImportDigest: digest("f"),
  requestedSpecDigest: digest("1"),
  effectiveSpecDigest: digest("2"),
  datasetBindingDigest: digest("3"),
  tableRows: real.table_rows,
  totalRows: Object.values(real.table_rows).reduce((sum, count) => sum + count, 0),
  summary: real.summary,
  retainedAtUtcMs: 1_790_269_236_911,
};

function currentSource(importDigest = seal.retainedImportDigest, summaryAnalytics?: Record<string, unknown>) {
  const sorted = (kind: Kind) => [...(real.rows[kind] ?? [])].sort((left, right) => left.sourceOrdinal - right.sourceOrdinal);
  const repository = {
    sealForRead: vi.fn().mockResolvedValue(summaryAnalytics
      ? { ...seal, summary: { ...seal.summary, summary_analytics: summaryAnalytics } }
      : seal),
    runState: vi.fn(),
    rows: vi.fn(async (_scope: unknown, _runId: string, _revision: number, kind: Kind, selection: { afterOrdinal?: number; atOrdinal?: number; limit: number }) => {
      const all = sorted(kind);
      const from = selection.afterOrdinal !== undefined ? all.filter((row) => row.sourceOrdinal > selection.afterOrdinal!)
        : selection.atOrdinal !== undefined ? all.filter((row) => row.sourceOrdinal >= selection.atOrdinal!) : all;
      const page = from.slice(0, selection.limit);
      const first = page[0]?.sourceOrdinal;
      const last = page.at(-1)?.sourceOrdinal;
      return {
        rows: page,
        hasMore: last !== undefined && all.some((row) => row.sourceOrdinal > last),
        hasPrevious: first !== undefined && all.some((row) => row.sourceOrdinal < first),
        totalRows: all.length,
      };
    }),
    observationSeries: vi.fn(async () => ({ rows: sorted("OBSERVATION"), sampling: "FULL" as const, extremaEmitted: true })),
    verifyRetainedImport: vi.fn().mockResolvedValue(importDigest),
  };
  return new ResearchCurrentSourceService(repository as never, {
    FEATURE_RESEARCH_CURRENT_SOURCE: "true",
    QUERY_CURSOR_ACTIVE_KEY_ID: "query-k1",
    QUERY_CURSOR_KEYS_JSON: '{"query-k1":"current-source-test-key-is-at-least-32-bytes"}',
    QUERY_CURSOR_TTL_SECONDS: 900,
  } as never);
}

/** The P13 hub of a WFO run: unsealed (revision null), but it carries stages and the P10/P08 identity. */
function wfoHub(binding: "PUBLISHABLE" | "SCRATCH" = "PUBLISHABLE") {
  const stage = (key: string, start: number) => ({ key, state: "DONE", started_at_utc_ms: start, completed_at_utc_ms: start + 1_000 });
  return {
    run_id: real.run_id,
    revision: null,
    stages: [stage("S1", 1_790_269_200_000), stage("S2", 1_790_269_202_000), stage("S3", 1_790_269_204_000), stage("S4", 1_790_269_206_000), stage("S5", 1_790_269_208_000)],
    core: {
      data: { dataset_id: "crypto-binance-1m", symbol: "BTCUSDT", timeframe: "1h", oos_observation_count: null },
      run_identity: {
        status: { value: "READY", availability: available },
        binding: binding === "PUBLISHABLE"
          ? { alpha_id: "delta-rsi-polynomial-alpha", alpha_name: "Delta-RSI Polynomial Alpha", alpha_version_id: "av_delta_rsi_polynomial_alpha_1_0_0", availability: available }
          : { alpha_id: null, alpha_name: null, alpha_version_id: null, availability: { state: "NOT_APPLICABLE", reason_code: "P13_SCRATCH_RUN_HAS_NO_PUBLISHABLE_ALPHA_BINDING" } },
        created_at_utc_ms: { value: 1_790_269_199_000, availability: available },
        mode: { value: "mode_1_decay", availability: available },
        schedule: { value: "global", availability: available },
        route: { id: { value: "signal_notional", availability: available }, contract: { value: null, availability: { state: "NOT_PUBLISHED", reason_code: "P13_ROUTE_CONTRACT_NOT_PUBLISHED" } } },
        config_digest: { value: digest("6"), availability: available },
        seed: { value: 42, availability: available },
      },
    },
  };
}

function parts(manifestDigest = real.manifest_digest) {
  return {
    artifactRevision: 1,
    manifestDigest,
    parts: ["candidates", "folds", "observations", "selection", "trials"].map((tableKind, index) => ({
      tableKind, partOrdinal: 1, relativePath: `tables/${tableKind}/part-000001.parquet`, partDigest: String(index + 1).repeat(64).slice(0, 64),
    })),
  };
}

function subject(options: {
  summaryAnalytics?: Record<string, unknown>;
  binding?: "PUBLISHABLE" | "SCRATCH";
  manifestDigest?: string;
  importDigest?: string;
  /** X2 · P18-T10: the run's P19 lineage relation (undefined = the repository cannot answer). */
  relation?: { relationshipKind: string; parentRunId: string | null; auditChildren: Array<{ runId: string; state: string }> } | null | undefined;
} = {}) {
  let stored: StoredResearchReport | undefined;
  const repository = {
    seal: vi.fn(async (_scope: unknown, runId: string, frozenCore: StoredResearchReport["frozenCore"]) => {
      const frozenCoreDigest = sha256ResearchJson(frozenCore);
      stored = {
        runId, reportRevision: `p18r1_${frozenCoreDigest}`, frozenCoreDigest, frozenCore,
        sealedAtUtcMs: 1_790_269_240_000, annotation: { state: "NOT_PUBLISHED", text: null, sourceUpdatedAtUtcMs: null },
      };
      return stored;
    }),
    read: vi.fn(async () => stored ?? null),
    sealedArtifactParts: vi.fn().mockResolvedValue(parts(options.manifestDigest)),
    auditRelation: vi.fn().mockResolvedValue(
      "relation" in options ? options.relation : { relationshipKind: "PRIMARY", parentRunId: null, auditChildren: [] },
    ),
  };
  const evidence = { bundle: vi.fn().mockResolvedValue({ hub: wfoHub(options.binding), series: new Map() }) };
  const unused = { detail: vi.fn().mockRejectedValue(new Error("a WFO report never reads a P04 hub")) };
  const service = new ResearchReportService(
    repository as never, evidence as never, unused as never, unused as never, unused as never, unused as never,
    currentSource(options.importDigest, options.summaryAnalytics),
    {
      FEATURE_RESEARCH_REPORTS: "true", FEATURE_RESEARCH_CURRENT_SOURCE: "true",
      RESEARCH_REPORT_EXPORT_MAXIMUM_BYTES: 512 * 1024, RESEARCH_REPORT_EXPORT_LEASE_SECONDS: 90,
    } as never,
  );
  return { service, repository, evidence, unused };
}

function v2(report: ResearchReportDetailResponse): ResearchReportFrozenCoreV2 {
  if (report.frozen_core.schema_version !== "research.report-frozen-core.v2") throw new Error("expected a v2 core");
  return report.frozen_core;
}

describe("W6a · P18 report sealed from the retained WFO lane", () => {
  it("W6a fix: a W5b-retained fold row serves the split read without its child-audit block", async () => {
    const split = await currentSource().split(scope, real.run_id) as { fold_plan: { folds: Array<Record<string, unknown>> } };
    expect(real.rows.FOLD.every((row) => "child_audit" in row.payload)).toBe(true);
    expect(split.fold_plan.folds).toHaveLength(2);
    for (const fold of split.fold_plan.folds) expect(fold).not.toHaveProperty("child_audit");
  });

  it("seals a v2 core from the current-source reads and never touches a P04 hub", async () => {
    const { service, unused, repository } = subject();
    const report = await service.materialize(scope, real.run_id, "RS02_RETAINED_CURRENT_SOURCE");
    expect(ResearchReportDetailResponseSchema.safeParse(report).success).toBe(true);
    reportValidator.assert(report);
    const core = v2(report);
    expect(core.report_source).toBe("RS02_RETAINED_CURRENT_SOURCE");
    expect(Object.values(core.source_revisions).every((value) => /^rs02_[a-z-]+_[0-9a-f]{64}$/.test(value))).toBe(true);
    expect(unused.detail).not.toHaveBeenCalled();
    expect(repository.seal).toHaveBeenCalledTimes(1);
  });

  it("CG-P18-01 passport carries the claim strip under stable keys; CG-P18-02 certification is a typed absence", async () => {
    const core = v2(await subject().service.materialize(scope, real.run_id, "RS02_RETAINED_CURRENT_SOURCE"));
    expect(core.passport.map((item) => [item.key, item.state, item.text])).toEqual([
      ["validation_claim", "AVAILABLE", "walk_forward_oos"],
      ["chronological_claim", "AVAILABLE", "not_causal_multi_fold_global_calibration"],
      ["oos_used_for_selection", "AVAILABLE", "true"],
      ["holdout_state", "NOT_APPLICABLE", null],
      ["scoring_backend", "AVAILABLE", "endpoint"],
      ["mode_schedule", "AVAILABLE", "mode_1_decay × global"],
    ]);
    expect(core.passport[3]!.reason_code).toBe("P10_DELTA_WFO_PROFILE_HAS_NO_HOLDOUT_SEGMENT");
    expect(core.certification).toEqual({
      state: "NOT_PUBLISHED", grade: null, reason_code: "P18_NO_SOURCE_PUBLISHES_A_CERTIFICATION_GRADE",
      availability: { state: "NOT_PUBLISHED", reason_code: "P18_NO_SOURCE_PUBLISHES_A_CERTIFICATION_GRADE" },
    });
  });

  it("CG-P18-03/11 title and identity carry the §16.3 keys; a scratch run says NOT_PUBLISHABLE", async () => {
    const core = v2(await subject().service.materialize(scope, real.run_id, "RS02_RETAINED_CURRENT_SOURCE"));
    expect(core.title).toMatchObject({ text: "Delta-RSI Polynomial Alpha on BTCUSDT · 1h", availability: available });
    const byKey = Object.fromEntries(core.identity.map((item) => [item.key, item]));
    expect(core.identity.length).toBeLessThanOrEqual(24);
    expect(byKey.binding!.value).toBe("PUBLISHABLE");
    expect(byKey.protocol!.value).toBe("walk_forward_oos · 2 outer folds · purge 0 bars · embargo 0 bars");
    expect(byKey.runtime_authority!.value).toMatch(/^native_vectorized · final account /);
    expect(byKey.optimization!.value).toBe("mode_1_decay × global");
    expect(byKey.selected_params!.value).toMatch(/^[A-Za-z_0-9]+=[-0-9.]+( · [A-Za-z_0-9]+=[-0-9.]+)*$/);
    expect(byKey.random_seed!.value).toBe("42");

    const scratch = v2(await subject({ binding: "SCRATCH" }).service.materialize(scope, real.run_id, "RS02_RETAINED_CURRENT_SOURCE"));
    const scratchKey = Object.fromEntries(scratch.identity.map((item) => [item.key, item]));
    expect(scratchKey.binding!.value).toBe("scratch — NOT_PUBLISHABLE");
    expect(scratchKey.alpha).toMatchObject({ value: null, availability: { state: "NOT_APPLICABLE" } });
    expect(scratch.title).toMatchObject({ text: null, availability: { state: "NOT_PUBLISHED" } });
  });

  it("CG-P18-04/08 folds carry the fold-verdict rows in source order with the global parameter hand-off", async () => {
    const service = currentSource();
    const evidence = await service.evidence(scope, real.run_id) as { fold_verdicts: { rows: Array<{ fold_id: string; oos_sharpe: string | null; decay: string | null; return_fraction: string | null; verdict: string }> } };
    const core = v2(await subject().service.materialize(scope, real.run_id, "RS02_RETAINED_CURRENT_SOURCE"));
    expect(core.folds.state).toBe("AVAILABLE");
    expect(core.folds.rows.map((row) => row.source_ordinal)).toEqual([0, 1]);
    for (const row of core.folds.rows) {
      const source = evidence.fold_verdicts.rows.find((item) => item.fold_id === row.fold_id)!;
      expect(row.oos_sharpe.value).toBe(source.oos_sharpe);
      expect(row.decay.value).toBe(source.decay);
      expect(row.contribution_fraction.value).toBe(source.return_fraction);
      expect(row.verdict).toBe(source.verdict);
      expect(row.params.text).toBe(core.folds.params_handoff.text);
    }
    expect(core.folds.params_handoff.scope).toBe("GLOBAL_SELECTION_APPLIES_TO_EVERY_FOLD");
    expect(core.folds.rule?.version).toBe("research.fold-verdict.v1");
  });

  it("CG-P18-05 each stage check is one sourced fact and never a PASS without a source key", async () => {
    const core = v2(await subject().service.materialize(scope, real.run_id, "RS02_RETAINED_CURRENT_SOURCE"));
    const checks = Object.fromEntries(core.stages.map((item) => [item.key, item.check]));
    expect(checks.S1).toMatchObject({ result: "CAVEAT", source_key: "p10.delta_wfo_profile.segments" });
    expect(checks.S2).toMatchObject({ result: "CAVEAT", source_key: "walk_forward.oos_used_for_selection" });
    expect(checks.S3).toMatchObject({ result: "PASS", source_key: "rs02.freeze.integrity" });
    expect(checks.S5).toMatchObject({ source_key: "research.fold-verdict.v1" });
    for (const item of core.stages) if (item.check.result === "PASS") expect(item.check.source_key).not.toBeNull();
    const broken = v2(await subject({ importDigest: digest("0") }).service.materialize(scope, real.run_id, "RS02_RETAINED_CURRENT_SOURCE"));
    expect(broken.stages.find((item) => item.key === "S3")!.check.result).toBe("FAIL");
  });

  it("CG-P18-06 partitions one retained path into an IS segment and the stitched outer-test windows", async () => {
    const core = v2(await subject().service.materialize(scope, real.run_id, "RS02_RETAINED_CURRENT_SOURCE"));
    const firstTest = Math.min(...core.folds.rows.map((row) => row.test_start_utc_ms!));
    expect(core.equity).toMatchObject({ state: "AVAILABLE", scope: "RS02_STITCHED_OUTER_TEST_WINDOWS", sampling: "FULL", source_observation_count: 336 });
    expect(core.equity_is).toMatchObject({ state: "AVAILABLE", scope: "RS02_FINAL_ACCOUNT_BEFORE_FIRST_OUTER_TEST", source_observation_count: 720 });
    expect(core.equity_is.emitted_point_count).toBeLessThanOrEqual(300);
    expect(core.equity_is.sampling).toBe("EXTREMA_BUCKET_V1");
    expect(core.equity.points.every((point) => point.at_utc_ms >= firstTest)).toBe(true);
    expect(core.equity_is.points.every((point) => point.at_utc_ms < firstTest)).toBe(true);
  });

  it("CG-P18-07 artifacts bind to the sealed P05 parts of the retained manifest, never a download", async () => {
    const core = v2(await subject().service.materialize(scope, real.run_id, "RS02_RETAINED_CURRENT_SOURCE"));
    expect(core.artifacts.find((item) => item.key === "FOLD_PLAN")).toMatchObject({
      state: "SEALED", filename: "tables/folds/part-000001.parquet", part_count: 1,
      download: { state: "NOT_PUBLISHED", reason_code: "P05_SOURCE_BYTES_WERE_VERIFIED_AT_IMPORT_BUT_A_GET_NEVER_REOPENS_PRIVATE_ARTIFACT_BYTES" },
    });
    expect(core.artifacts.find((item) => item.key === "BUNDLE")).toMatchObject({ state: "SEALED", digest: real.manifest_digest, filename: null });
    const foreign = v2(await subject({ manifestDigest: digest("9") }).service.materialize(scope, real.run_id, "RS02_RETAINED_CURRENT_SOURCE"));
    expect(foreign.artifacts.find((item) => item.key === "FOLD_PLAN")).toMatchObject({
      state: "NOT_PUBLISHED", filename: null, availability: { reason_code: "P18_SEALED_PARTS_DO_NOT_MATCH_RETAINED_MANIFEST" },
    });
  });

  it("headline values are the retained reads verbatim; win rate is a typed absence, never 0", async () => {
    const core = v2(await subject().service.materialize(scope, real.run_id, "RS02_RETAINED_CURRENT_SOURCE"));
    const evidence = await currentSource().evidence(scope, real.run_id) as { fold_verdicts: { mean_oos_sharpe: string | null; rows: Array<{ oos_trades: string | null }> } };
    const byKey = Object.fromEntries(core.headline.map((item) => [item.key, item]));
    expect(byKey.OOS_SHARPE).toMatchObject({ value: evidence.fold_verdicts.mean_oos_sharpe, scope: "OOS_MEAN_OF_FOLDS" });
    expect(byKey.TRADES!.value).toBe(String(evidence.fold_verdicts.rows.reduce((sum, row) => sum + Number(row.oos_trades), 0)));
    expect(byKey.WIN_RATE).toMatchObject({ value: null, availability: { state: "NOT_PUBLISHED", reason_code: "QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_AUDITED_FILLS" } });
  });

  /* E14 · 9.7/9.8 on the retained lane. */

  it("E14 · 9.8: older seals without engine OOS return stay absent, not whole-account relabelled", async () => {
    const core = v2(await subject().service.materialize(scope, real.run_id, "RS02_RETAINED_CURRENT_SOURCE"));
    const evidence = await currentSource().evidence(scope, real.run_id) as { passport: { net_return_fraction: string | null } };
    expect(core.headline).toHaveLength(7);
    expect(core.headline[0]).toEqual({
      key: "NET_RETURN",
      label: "Net OOS return",
      scope: "OOS",
      value: null,
      availability: { state: "NOT_PUBLISHED", reason_code: "RS02_SOURCE_PREDATES_RETAINED_OOS_RETURN" },
    });
    /* The tile is the account path, which begins before the first outer test
       window — the footnote must not let it read as an OOS-only return. */
    expect(core.equity_is.scope).toBe("RS02_FINAL_ACCOUNT_BEFORE_FIRST_OUTER_TEST");
    expect(core.equity_is.state).toBe("AVAILABLE");
    expect(core.metrics.find(value => value.key === "NET_RETURN_FRACTION")?.value).toBe(evidence.passport.net_return_fraction);
    expect(core.headline_footnote).toContain("Older seals");
  });

  it("E11/E14 new sealed engine OOS fact reaches the named Evidence and frozen Report unchanged", async () => {
    const analytics = JSON.parse(readFileSync(resolve(process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts"), "fixtures/research-retained-analytics.fixed.valid.json"), "utf8"));
    analytics.in_sample_equity = { state: "NOT_PUBLISHED", reason_code: "QUANTBT_WFO_HAS_NO_SELECTED_CANDIDATE_IS_ACCOUNT",
      scope: "SELECTED_CANDIDATE_IS", source_locator: "QuantBT.walk_forward.output.final_account_not_candidate_IS",
      start_utc_ms: null, end_exclusive_utc_ms: null, source_observation_count: 0, emitted_point_count: 0, sampling: null, points: [] };
    const evidence = await currentSource(undefined, analytics).evidence(scope, real.run_id);
    expect(evidence).toHaveProperty("summary_analytics", analytics);
    openApiValidator("research-current-source.openapi.json", "Evidence").assert(evidence);
    const core = v2(await subject({ summaryAnalytics: analytics }).service.materialize(scope, real.run_id, "RS02_RETAINED_CURRENT_SOURCE"));
    expect(core.headline[0]).toMatchObject({ key: "NET_RETURN", label: "Net OOS return", scope: "OOS", value: "0.012", availability: available });
    expect(core.metrics.find(value => value.key === "NET_OOS_RETURN_FRACTION")).toMatchObject({ value: "0.012", scope: "OOS", origin: "ENGINE_DIRECT" });
    expect(core.metrics.find(value => value.key === "NET_RETURN_FRACTION")?.value).not.toBe("0.012");
  });

  it("E14 · 9.7: a lane whose search really ran carries no 'declared, not executed' qualifier", async () => {
    const core = v2(await subject().service.materialize(scope, real.run_id, "RS02_RETAINED_CURRENT_SOURCE"));
    const optimization = core.identity.find((field) => field.key === "optimization");
    expect(optimization).toMatchObject({ value: "mode_1_decay × global" });
    expect(optimization!.qualifier ?? null).toBeNull();
  });
});

/** CG-P18-09 · canonical report fixtures for Screen 09. */
describe("CG-P18-09 · published report fixtures", () => {
  const root = resolve(process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts"), "fixtures");
  const files = {
    wfo: "research-report.wfo-retained.valid.json",
    scratch: "research-report.wfo-scratch.valid.json",
    failed: "research-report.wfo-failed.valid.json",
    folds32: "research-report.wfo-32-folds.valid.json",
    exportJobs: "research-report.export-jobs.valid.json",
    problems: "research-report.problems.valid.json",
  } as const;

  it("writes (opt-in) and validates the committed fixtures", async () => {
    if (process.env.W6A_WRITE_FIXTURES === "1") {
      const wfo = await subject().service.materialize(scope, real.run_id, "RS02_RETAINED_CURRENT_SOURCE");
      const scratch = await subject({ binding: "SCRATCH" }).service.materialize(scope, real.run_id, "RS02_RETAINED_CURRENT_SOURCE");
      const revision = wfo.report_revision;
      const job = (state: "QUEUED" | "RUNNING" | "READY" | "FAILED") => ({
        schema_version: "research.report-export.v1", job_id: `rpex_01J0000000000000000000000${"QRYF".indexOf(state[0]!)}`,
        run_id: real.run_id, report_revision: revision, format: "REPORT_CSV", state, requested_at_utc_ms: 1_790_269_241_000,
        completed_at_utc_ms: state === "READY" || state === "FAILED" ? 1_790_269_242_000 : null,
        size_bytes: state === "READY" ? 4_096 : null, sha256: state === "READY" ? digest("c") : null,
        content_type: state === "READY" ? "text/csv" : null,
        filename: state === "READY" ? `quantbt-${real.run_id}-${revision}.csv` : null,
        download_href: state === "READY" ? `/api/v1/quantbt/runs/${real.run_id}/report/exports/rpex_01J0000000000000000000000${"QRYF".indexOf(state[0]!)}/download` : null,
        failure_code: state === "FAILED" ? "P18_EXPORT_TRANSFORM_FAILED" : null,
      });
      const problem = (status: number, code: string, message: string) => ({ status, body: { error: { code, message }, request_id: "req_fixture" } });
      writeFileSync(join(root, files.wfo), `${JSON.stringify(wfo)}\n`);
      writeFileSync(join(root, files.failed), `${JSON.stringify(await subject().service.materializeFailure(scope, real.run_id, failedFacts()))}\n`);
      writeFileSync(join(root, files.folds32), `${JSON.stringify(thirtyTwoFolds(wfo))}\n`);
      writeFileSync(join(root, files.scratch), `${JSON.stringify(scratch)}\n`);
      writeFileSync(join(root, files.exportJobs), `${JSON.stringify((["QUEUED", "RUNNING", "READY", "FAILED"] as const).map(job))}\n`);
      writeFileSync(join(root, files.problems), `${JSON.stringify([
        problem(400, "RESEARCH_REPORT_INVALID", "Research report request is invalid."),
        problem(401, "SESSION_REQUIRED", "Invalid session."),
        problem(403, "RESEARCH_REPORT_FORBIDDEN", "Access denied."),
        problem(404, "RESEARCH_REPORT_NOT_FOUND", "Research report was not found."),
        problem(409, "RESEARCH_REPORT_EXPORT_NOT_READY", "Research report export is not ready."),
        problem(503, "RESEARCH_REPORT_UNAVAILABLE", "Research Report is not enabled in this deployment."),
      ])}\n`);
    }
    const read = (name: string) => JSON.parse(readFileSync(join(root, name), "utf8"));
    for (const name of [files.wfo, files.scratch, files.failed, files.folds32]) {
      expect(ResearchReportDetailResponseSchema.safeParse(read(name)).success, name).toBe(true);
      reportValidator.assert(read(name));
    }
    const jobValidator = openApiValidator("research-report.openapi.json", "ExportJob");
    for (const job of read(files.exportJobs)) {
      expect(ResearchReportExportStatusSchema.safeParse(job).success).toBe(true);
      jobValidator.assert(job);
    }
    const problemValidator = openApiValidator("research-report.openapi.json", "Problem");
    for (const problem of read(files.problems)) problemValidator.assert(problem.body);
    expect(read(files.wfo).frozen_core.report_source).toBe("RS02_RETAINED_CURRENT_SOURCE");
  });
});

/* -------------------------------------------------------------------------
 * X2 · B5 — spec 09 T06 (failed run), P18-T10 (final audit), export formats,
 * and the 32-fold S09 fixture.
 * ---------------------------------------------------------------------- */

/** A terminal snapshot of a WFO run that failed in S2 (the shape P11 persists with `run_failed`). */
function failedSnapshot(failedAt: "S2" | "SEAL" = "S2") {
  const stage = (key: string, index: number) => {
    const done = failedAt === "SEAL" || index < 1;
    const running = failedAt === "S2" && index === 1;
    return {
      key, state: done ? "DONE" : running ? "RUNNING" : "PENDING",
      started_at_utc_ms: done || running ? 1_790_269_200_000 + index * 2_000 : null,
      completed_at_utc_ms: done ? 1_790_269_201_000 + index * 2_000 : null,
    };
  };
  return {
    schema_version: "research.progress-snapshot.v1",
    run_id: real.run_id,
    attempt_id: "att_x2_failed",
    lease_epoch: 1,
    status: "FAILED",
    created_at_utc_ms: 1_790_269_199_000,
    updated_at_utc_ms: 1_790_269_203_500,
    latest_sequence: 17,
    retention_floor_sequence: 0,
    stages: ["S1", "S2", "S3", "S4", "S5"].map(stage),
    overall: { pct: 22, elapsed_s: 4, eta_s: null, trials_done: 1, trials_declared: 3, tqdm_line: "trial 1/3" },
    budget: { used: "0.07", cap: "2", unit: "core-min", pct: 3 },
    folds: [],
    artifacts: [
      { name: "search/trials.parquet", state: "ABORTED", size: null, digest: null, reader_href: null },
      { name: "manifest.json", state: "PENDING", size: null, digest: null, reader_href: null },
    ],
    claim: { state: "NOT_ISSUED", text: "no claim", cursor: null, methodology_certificate: { state: "NOT_PUBLISHED", reason_code: "P11_SOURCE_DID_NOT_PUBLISH_METHODOLOGY_CERTIFICATE" }, handoff_cursor: null },
    readiness: { mandatory: "FAILED", optional: "NOT_APPLICABLE" },
    failure: { code: "QUANTBT_CHILD_EXITED", message: "optuna study aborted: child exited 137 (memory cap)" },
    source: { kind: "DURABLE_P10", coverage: "ACTUAL_HOOKS", partial: false },
  } as never;
}

function failedFacts(code = "QUANTBT_CHILD_EXITED", failedAt: "S2" | "SEAL" = "S2") {
  return {
    snapshot: failedSnapshot(failedAt),
    failure: { code, message: "optuna study aborted: child exited 137 (memory cap)" },
    terminalSequence: 17,
    failedAtUtcMs: 1_790_269_203_500,
  };
}

/** S09 T03: the real v2 WFO report with its fold table widened to 32 weekly folds (layout fixture). */
function thirtyTwoFolds(report: ResearchReportDetailResponse): ResearchReportDetailResponse {
  const core = v2(report);
  const [first, second] = core.folds.rows;
  const week = 7 * 24 * 3_600_000;
  const rows = Array.from({ length: 32 }, (_, index) => {
    const base = index % 2 === 0 ? first! : second!;
    return {
      ...base,
      fold_id: String(index),
      source_ordinal: index,
      test_start_utc_ms: first!.test_start_utc_ms! + index * week,
      test_last_bar_utc_ms: first!.test_start_utc_ms! + index * week + week - 3_600_000,
    };
  });
  return { ...report, frozen_core: { ...core, folds: { ...core.folds, rows } } };
}

describe("X2 · spec 09 T06 — a failed run gets a sheet that says so", () => {
  it("seals 'no claim — run failed at S2 Search' from the terminal snapshot: stages to the failure, ABORTED artifacts, no metric", async () => {
    const { service, repository } = subject();
    const report = await service.materializeFailure(scope, real.run_id, failedFacts());
    expect(ResearchReportDetailResponseSchema.safeParse(report).success).toBe(true);
    reportValidator.assert(report);
    const core = report.frozen_core;
    if (core.schema_version !== "research.report-failed-core.v1") throw new Error("expected a failed core");
    expect(core.outcome).toMatchObject({
      state: "FAILED", failed_stage: "S2", failed_stage_label: "S2 Search",
      headline: "no claim — run failed at S2 Search", failure_code: "QUANTBT_CHILD_EXITED",
      failure_message: "optuna study aborted: child exited 137 (memory cap)", terminal_sequence: 17,
    });
    expect(core.stages.map((stage) => [stage.key, stage.state, stage.check.result])).toEqual([
      ["S1", "DONE", "NOT_PUBLISHED"], ["S2", "RUNNING", "FAIL"], ["S3", "PENDING", "NOT_APPLICABLE"],
      ["S4", "PENDING", "NOT_APPLICABLE"], ["S5", "PENDING", "NOT_APPLICABLE"],
    ]);
    expect(core.stages[1]!.check.text).toBe("run failed here — QUANTBT_CHILD_EXITED: optuna study aborted: child exited 137 (memory cap)");
    expect(core.artifacts).toEqual([
      { name: "search/trials.parquet", state: "ABORTED", size: null, digest: null },
      { name: "manifest.json", state: "PENDING", size: null, digest: null },
    ]);
    expect(core.mandatory_bundle).toBe("FAILED");
    expect(core.equity.availability.reason_code).toBe("P18_FAILED_RUN_HAS_NO_EQUITY_TO_REPORT");
    expect(core.title.text).toBe("Delta-RSI Polynomial Alpha on BTCUSDT · 1h");
    expect(JSON.stringify(core)).not.toMatch(/"metrics"|"headline":\[|"folds"/);
    expect(repository.seal).toHaveBeenCalledTimes(1);
  });

  it("a cancelled run says cancelled; a run that ended after S5 failed at the seal", async () => {
    const cancelled = (await subject().service.materializeFailure(scope, real.run_id, failedFacts("USER_CANCELLED"))).frozen_core;
    expect(cancelled.schema_version === "research.report-failed-core.v1" && cancelled.outcome.headline).toBe("no claim — run cancelled at S2 Search");
    const seal = (await subject().service.materializeFailure(scope, real.run_id, failedFacts("SEAL_FAILED", "SEAL"))).frozen_core;
    if (seal.schema_version !== "research.report-failed-core.v1") throw new Error("expected a failed core");
    expect(seal.outcome).toMatchObject({ failed_stage: "SEAL", headline: "no claim — run failed at the seal" });
    expect(seal.stages.every((stage) => stage.check.result === "NOT_PUBLISHED")).toBe(true);
  });

  it("the terminal hook seals it best-effort: a storage failure never refuses the run's own failure", async () => {
    const { service, repository } = subject();
    const input = {
      run_id: real.run_id,
      event: { event_type: "run_failed", sequence: 17, occurred_at_utc_ms: 1_790_269_203_500, payload: { code: "QUANTBT_CHILD_EXITED", message: "x", usage: {} } },
      snapshot: failedSnapshot(),
    };
    await expect(service.materializeTerminal(scope, input, "RS02_RETAINED_CURRENT_SOURCE")).resolves.toBe(true);
    expect(repository.seal).toHaveBeenCalledTimes(1);
    repository.seal.mockRejectedValueOnce(Object.assign(new Error("db down"), { code: "RESEARCH_REPORT_UNAVAILABLE" }));
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await expect(service.materializeTerminal(scope, input)).resolves.toBe(false);
    expect(String(stderr.mock.calls[0]?.[0])).toContain("research_report_failed_run_materialize_failed");
    stderr.mockRestore();
  });

  it("exports a failed sheet to CSV with its outcome, stages and artifacts", async () => {
    const { service } = subject();
    const report = await service.materializeFailure(scope, real.run_id, failedFacts());
    const csv = (service as unknown as { csv: (payload: unknown) => string }).csv({
      frozen_core: report.frozen_core, approval_annotation: { state: "NOT_PUBLISHED", text: null, sourceUpdatedAtUtcMs: null },
    });
    expect(csv).toContain('"outcome","headline","Headline","no claim — run failed at S2 Search"');
    expect(csv).toContain('"artifact","search/trials.parquet","ABORTED"');
    expect(csv).toContain('"stage","S2","RUNNING"');
  });
});

describe("X2 · P18-T10 — reused original vs linked child, with source refs, never a second optimisation", () => {
  it("a PRIMARY run with no audit child is its own final audit: every fold's generation child ran the frozen candidate", async () => {
    const core = v2(await subject().service.materialize(scope, real.run_id, "RS02_RETAINED_CURRENT_SOURCE"));
    expect(core.final_audit).toMatchObject({
      kind: "REUSED_ORIGINAL", audit_target_kind: "SINGLE_PARAMETER_SET", final_audit_run_id: real.run_id, audited_run_id: real.run_id,
      relationship: "PRIMARY", optimizer_reinvoked: false, optimizer_basis: "EVERY_OOS_GENERATION_CHILD_RAN_THE_FROZEN_CANDIDATE",
    });
    expect(core.final_audit!.folds).toEqual([
      { fold_id: "0", audit_ordinal: 10, candidate_id: "2671e27b827ab2701d52e6ce", state: "MATCH" },
      { fold_id: "1", audit_ordinal: 11, candidate_id: "2671e27b827ab2701d52e6ce", state: "MATCH" },
    ]);
    expect(core.final_audit!.source_refs.map((ref) => ref.key)).toEqual(["selection", "frozen_candidate", "freeze", "replay"]);
    expect(core.final_audit!.source_refs[1]!.ref).toContain("2671e27b827ab2701d52e6ce");
  });

  it("a READY AUDIT_OF_SELECTION child in the lineage is the linked final audit", async () => {
    const core = v2(await subject({
      relation: { relationshipKind: "PRIMARY", parentRunId: null, auditChildren: [{ runId: "rrun_audit_1", state: "QUEUED" }, { runId: "rrun_audit_2", state: "READY" }] },
    }).service.materialize(scope, real.run_id, "RS02_RETAINED_CURRENT_SOURCE"));
    expect(core.final_audit).toMatchObject({ kind: "LINKED_CHILD", final_audit_run_id: "rrun_audit_2", audited_run_id: real.run_id, relationship: "AUDIT_OF_SELECTION", optimizer_reinvoked: false });
  });

  it("a lineage that cannot be read leaves the final audit a typed absence", async () => {
    const core = v2(await subject({ relation: null }).service.materialize(scope, real.run_id, "RS02_RETAINED_CURRENT_SOURCE"));
    expect(core.final_audit).toMatchObject({ kind: "NOT_PUBLISHED", reason_code: "P18_RUN_LINEAGE_RELATION_NOT_READ", optimizer_reinvoked: null });
  });
});

describe("X2 · B5 — PARQUET and ARCHIVE stay unavailable, with the real reasons (X2-D09)", () => {
  it("names the missing Parquet writer and the private-bytes/raw-rows boundary", async () => {
    const report = await subject().service.materialize(scope, real.run_id, "RS02_RETAINED_CURRENT_SOURCE");
    expect(report.exports.unavailable_formats).toEqual([
      { format: "PARQUET", reason_code: "P18_CONTROL_API_HAS_NO_PINNED_PARQUET_WRITER" },
      { format: "ARCHIVE", reason_code: "P18_ARCHIVE_WOULD_EXPOSE_PRIVATE_P05_BYTES_AND_RAW_MARKET_ROWS" },
    ]);
  });

  it("S09 T03 fixture: the 32-fold sheet keeps one row per fold in source order", () => {
    const root = resolve(process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts"), "fixtures");
    const report = JSON.parse(readFileSync(join(root, "research-report.wfo-32-folds.valid.json"), "utf8")) as ResearchReportDetailResponse;
    const core = v2(report);
    expect(core.folds.rows).toHaveLength(32);
    expect(core.folds.rows.map((row) => row.source_ordinal)).toEqual(Array.from({ length: 32 }, (_, index) => index));
  });
});
