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

function currentSource(importDigest = seal.retainedImportDigest) {
  const sorted = (kind: Kind) => [...(real.rows[kind] ?? [])].sort((left, right) => left.sourceOrdinal - right.sourceOrdinal);
  const repository = {
    sealForRead: vi.fn().mockResolvedValue(seal),
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

function subject(options: { binding?: "PUBLISHABLE" | "SCRATCH"; manifestDigest?: string; importDigest?: string } = {}) {
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
  };
  const evidence = { bundle: vi.fn().mockResolvedValue({ hub: wfoHub(options.binding), series: new Map() }) };
  const unused = { detail: vi.fn().mockRejectedValue(new Error("a WFO report never reads a P04 hub")) };
  const service = new ResearchReportService(
    repository as never, evidence as never, unused as never, unused as never, unused as never, unused as never,
    currentSource(options.importDigest),
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
});

/** CG-P18-09 · canonical report fixtures for Screen 09. */
describe("CG-P18-09 · published report fixtures", () => {
  const root = resolve(process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts"), "fixtures");
  const files = {
    wfo: "research-report.wfo-retained.valid.json",
    scratch: "research-report.wfo-scratch.valid.json",
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
    for (const name of [files.wfo, files.scratch]) {
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
