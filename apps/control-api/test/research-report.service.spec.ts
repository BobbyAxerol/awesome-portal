import { describe, expect, it, vi } from "vitest";

import { ResearchReportService } from "../src/research/report.service";
import type { ClaimedResearchReportExport, StoredResearchReport } from "../src/research/report.repository";
import { sha256ResearchJson } from "../src/research/preflight.service";

const scope = { workspaceId: "p18-workspace", actorUserId: "p18-user" };
const digest = (char: string) => char.repeat(64);

function availability(state: "AVAILABLE" | "NOT_PUBLISHED" = "AVAILABLE", reasonCode: string | null = null) {
  return { state, reason_code: reasonCode } as const;
}

function hubFixture() {
  const metric = (key: string, label: string, unit: "CURRENCY" | "FRACTION" | "COUNT", scopeValue: "OOS" | "CHILD_TAPE" | "NOT_PUBLISHED", origin: "ENGINE_DIRECT" | "SOURCE_DERIVED" | "NOT_PUBLISHED", value: string | null, source = availability(value === null ? "NOT_PUBLISHED" : "AVAILABLE", value === null ? "P18_METRIC_NOT_PUBLISHED" : null)) => ({
    key, label, unit, scope: scopeValue, frequency: "RUN_FINAL" as const, origin,
    definition_id: `research.metric.v1.${key.toLowerCase()}`, value, availability: source,
  });
  return {
    schema_version: "research.evidence-hub.v1",
    read_authority: "PORTAL_PERSISTED_RESEARCH",
    run_id: "run_p18", revision: `p13r1_${digest("a")}`, etag: `"p13r1_${digest("a")}"`,
    availability: availability(), readiness: "PARTIAL", as_of_utc_ms: 1_727_000_000_000,
    metric_registry_version: "research.metric-registry.v2",
    core: {
      source_adapter_id: "p04.delta-rsi.v1", engine_version: "1.1.1", input_scope: "P08_OPTIONAL_WARMUP_PLUS_IS_OOS_ONLY",
      source_transform_digest: digest("b"), requested_spec_digest: digest("c"), effective_spec_digest: digest("d"), dataset_binding_digest: digest("e"), manifest_digest: digest("f"),
      data: { dataset_id: "delta-rsi", symbol: "BTCUSDT", timeframe: "1h", oos_observation_count: 3 },
    },
    metrics: [
      metric("INITIAL_EQUITY", "Initial equity", "CURRENCY", "OOS", "ENGINE_DIRECT", "100"),
      metric("FINAL_EQUITY", "Final equity", "CURRENCY", "OOS", "ENGINE_DIRECT", "110"),
      metric("NET_RETURN_FRACTION", "Net return", "FRACTION", "OOS", "SOURCE_DERIVED", "0.1"),
      metric("MAX_DRAWDOWN_FRACTION", "Max drawdown", "FRACTION", "OOS", "SOURCE_DERIVED", "-0.02"),
      metric("TRADE_COUNT", "Trades", "COUNT", "CHILD_TAPE", "ENGINE_DIRECT", "3"),
      metric("BARS_PROCESSED", "Bars", "COUNT", "CHILD_TAPE", "ENGINE_DIRECT", "1000"),
      metric("BENCHMARK_RETURN_FRACTION", "Benchmark", "FRACTION", "NOT_PUBLISHED", "NOT_PUBLISHED", null),
      metric("FUNDING_TOTAL", "Funding", "CURRENCY", "NOT_PUBLISHED", "NOT_PUBLISHED", null),
    ],
    claim: { state: "NOT_PUBLISHED", text: null, cursor: null, methodology_certificate: { state: "NOT_PUBLISHED", grade: null, issued_at_utc_ms: null, reason_code: "P04_CLAIM_NOT_PUBLISHED" }, availability: availability("NOT_PUBLISHED", "P04_CLAIM_NOT_PUBLISHED") },
    stages: ["S1", "S2", "S3", "S4", "S5"].map((key) => ({ key, state: "DONE", started_at_utc_ms: 1_727_000_000_000, completed_at_utc_ms: 1_727_000_001_000 })),
    series: [], warnings: [{ definition_id: "research.warning.v1.fixed-profile", state: "ACTIVE", reason_code: "P04_FIXED_PROFILE", copy: "Fixed profile." }],
    source_absences: { audited_fills: availability("NOT_PUBLISHED", "P04_SOURCE_DID_NOT_PUBLISH_AUDITED_FILLS") },
  };
}

function sourceReaders() {
  const hub = hubFixture();
  return {
    evidence: { bundle: vi.fn().mockResolvedValue({ hub, series: new Map([["EQUITY_OOS", {
      availability: availability(), source_sample: { source_observation_count: 3, emitted_point_count: 3, sampling: "FULL" },
      values: [
        { at_utc_ms: 1_727_000_000_000, equity: "100", drawdown_fraction: "0" },
        { at_utc_ms: 1_727_000_060_000, equity: "105", drawdown_fraction: "-0.01" },
        { at_utc_ms: 1_727_000_120_000, equity: "110", drawdown_fraction: "-0.02" },
      ],
    }]]) }) },
    split: { detail: vi.fn().mockResolvedValue({ revision: `p14r1_${digest("1")}`, availability: availability(), protocol: { kind: "THREE_WINDOW_CURRENT" } }) },
    search: { detail: vi.fn().mockResolvedValue({ revision: `p15r1_${digest("2")}`, source_profile: { state: "FIXED_PROFILE_NO_SEARCH", availability: availability() } }) },
    freeze: {
      detail: vi.fn().mockResolvedValue({
        revision: `p16r1_${digest("3")}`,
        freeze: { integrity: { state: "PARTIAL", availability: availability() } },
      }),
    },
    replay: { detail: vi.fn().mockResolvedValue({ revision: `p17r1_${digest("4")}`, route: { state: "RETROSPECTIVE_EQUITY_ONLY" } }) },
  };
}

function enabledConfig() {
  return {
    FEATURE_RESEARCH_REPORTS: "true", FEATURE_RESEARCH_EVIDENCE: "true", FEATURE_RESEARCH_SPLIT: "true",
    FEATURE_RESEARCH_SEARCH: "true", FEATURE_RESEARCH_FREEZE: "true", FEATURE_RESEARCH_REPLAY: "true",
    RESEARCH_REPORT_EXPORT_MAXIMUM_BYTES: 512 * 1024, RESEARCH_REPORT_EXPORT_LEASE_SECONDS: 90,
  };
}

function subject() {
  const readers = sourceReaders();
  let stored: StoredResearchReport | undefined;
  const repository = {
    seal: vi.fn().mockImplementation(async (_scope, runId, frozenCore) => {
      const frozenCoreDigest = sha256ResearchJson(frozenCore);
      stored ??= {
        runId, reportRevision: `p18r1_${frozenCoreDigest}`, frozenCoreDigest, frozenCore,
        sealedAtUtcMs: 1_727_000_002_000, annotation: { state: "NOT_PUBLISHED", text: null, sourceUpdatedAtUtcMs: null },
      };
      return stored;
    }),
    read: vi.fn().mockImplementation(async () => stored ?? null),
    requestExport: vi.fn(), readExport: vi.fn(), download: vi.fn(), claimOne: vi.fn(), completeClaim: vi.fn(), failClaim: vi.fn(),
  };
  const service = new ResearchReportService(repository as never, readers.evidence as never, readers.split as never, readers.search as never, readers.freeze as never, readers.replay as never, enabledConfig() as never);
  return { service, repository, readers, get stored() { return stored; } };
}

describe("P18 immutable Report and bounded reproducible export", () => {
  it("P18-T01/T02/T07/T09 seals exact P13--P17 identity once without engine rerun or unsupported metric claims", async () => {
    const subjectValue = subject();
    const report = await subjectValue.service.materialize(scope, "run_p18");
    expect(report).toMatchObject({ schema_version: "research.report-detail.v1", report_revision: expect.stringMatching(/^p18r1_[0-9a-f]{64}$/) });
    expect(report.frozen_core.source_revisions).toEqual({ evidence_revision: `p13r1_${digest("a")}`, split_revision: `p14r1_${digest("1")}`, search_revision: `p15r1_${digest("2")}`, freeze_revision: `p16r1_${digest("3")}`, replay_revision: `p17r1_${digest("4")}` });
    expect(report.frozen_core.metrics.find((item) => item.key === "FINAL_EQUITY")).toMatchObject({ value: "110", scope: "OOS" });
    expect(report.frozen_core.headline.find((item) => item.key === "OOS_SHARPE")).toMatchObject({ value: null, availability: { state: "NOT_PUBLISHED" } });
    expect(report.frozen_core.equity.points).toHaveLength(3);
    expect(report.frozen_core.folds).toMatchObject({ state: "NOT_PUBLISHED", rows: [] });
    for (const [key, reasonCode] of [
      ["RUN_SPEC", "P18_REQUESTED_SPEC_BYTES_NOT_PUBLISHED"],
      ["METRICS_SUMMARY", "P13_EVIDENCE_PROJECTION_IS_NOT_ARTIFACT_FILE"],
      ["BUNDLE", "P18_MANIFEST_BYTES_NOT_PUBLISHED"],
    ] as const) {
      expect(report.frozen_core.artifacts.find((item) => item.key === key)).toMatchObject({
        digest: null, state: "NOT_PUBLISHED", availability: { reason_code: reasonCode },
      });
    }
    expect(subjectValue.repository.seal).toHaveBeenCalledTimes(1);
    expect(Object.keys(subjectValue.readers)).toEqual(["evidence", "split", "search", "freeze", "replay"]);
    for (const reader of Object.values(subjectValue.readers)) expect(Object.keys(reader)).toEqual(["detail"].includes(Object.keys(reader)[0]!) ? ["detail"] : ["bundle"]);
  });

  it("P18-T04/T11 transforms the sealed core after restart-like worker claim without rereading evidence or recomputing it", async () => {
    const subjectValue = subject();
    await subjectValue.service.materialize(scope, "run_p18");
    const stored = subjectValue.stored!;
    const claim: ClaimedResearchReportExport = {
      workspaceId: scope.workspaceId, leaseToken: digest("9"), jobId: `rpex_01J00000000000000000000000`, runId: stored.runId,
      reportRevision: stored.reportRevision, format: "REPORT_JSON", state: "RUNNING", requestedAtUtcMs: 1, completedAtUtcMs: null,
      sizeBytes: null, sha256: null, contentType: null, filename: null, failureCode: null,
      frozenCoreDigest: stored.frozenCoreDigest, sealedAtUtcMs: stored.sealedAtUtcMs,
      frozenCore: stored.frozenCore, annotation: stored.annotation,
    };
    subjectValue.repository.claimOne.mockResolvedValue(claim);
    subjectValue.repository.completeClaim.mockImplementation(async (_claim, output) => ({ ...claim, state: "READY", completedAtUtcMs: 2, sizeBytes: output.bytes.byteLength, sha256: output.sha256, contentType: output.contentType, filename: output.filename, failureCode: null }));
    const result = await subjectValue.service.processOneExport();
    expect(result).toMatchObject({ processed: true, job: { state: "READY", content_type: "application/json" } });
    const output = subjectValue.repository.completeClaim.mock.calls[0]![1];
    expect(JSON.parse(output.bytes.toString("utf8"))).toMatchObject({ report_revision: stored.reportRevision, frozen_core_sha256: stored.frozenCoreDigest, sealed_at_utc_ms: stored.sealedAtUtcMs, frozen_core: { source_revisions: stored.frozenCore.source_revisions } });
    expect(subjectValue.readers.evidence.bundle).toHaveBeenCalledTimes(1);
    expect(subjectValue.readers.split.detail).toHaveBeenCalledTimes(1);
  });

  it("P18-T05/T06 keeps CSV/formula and filename handling bounded and server-derived", async () => {
    const subjectValue = subject();
    await subjectValue.service.materialize(scope, "run_p18");
    const stored = subjectValue.stored!;
    const malicious = structuredClone(stored.frozenCore);
    malicious.identity[0]!.value = "=HYPERLINK(\"https://bad.example\")";
    const claim: ClaimedResearchReportExport = {
      workspaceId: scope.workspaceId, leaseToken: digest("8"), jobId: `rpex_01J00000000000000000000001`, runId: "run_p18",
      reportRevision: stored.reportRevision, format: "REPORT_CSV", state: "RUNNING", requestedAtUtcMs: 1, completedAtUtcMs: null,
      sizeBytes: null, sha256: null, contentType: null, filename: null, failureCode: null,
      frozenCoreDigest: stored.frozenCoreDigest, sealedAtUtcMs: stored.sealedAtUtcMs,
      frozenCore: malicious, annotation: stored.annotation,
    };
    subjectValue.repository.claimOne.mockResolvedValue(claim);
    subjectValue.repository.completeClaim.mockImplementation(async (_claim, output) => ({ ...claim, state: "READY", completedAtUtcMs: 2, sizeBytes: output.bytes.byteLength, sha256: output.sha256, contentType: output.contentType, filename: output.filename, failureCode: null }));
    await subjectValue.service.processOneExport();
    const output = subjectValue.repository.completeClaim.mock.calls[0]![1];
    expect(output.bytes.byteLength).toBeLessThanOrEqual(512 * 1024);
    expect(output.bytes.toString("utf8")).toContain("'=HYPERLINK");
    expect(output.filename).toMatch(/^quantbt-run_p18-p18r1_[0-9a-f]{64}\.csv$/);
    expect(output.filename).not.toMatch(/[\\/]/);
  });

  it("fails closed while the independently admitted P18 reader is dark", async () => {
    const readers = sourceReaders();
    const service = new ResearchReportService({} as never, readers.evidence as never, readers.split as never, readers.search as never, readers.freeze as never, readers.replay as never, { ...enabledConfig(), FEATURE_RESEARCH_REPORTS: "false" } as never);
    await expect(service.read(scope, "run_p18")).rejects.toMatchObject({ code: "RESEARCH_REPORT_UNAVAILABLE", status: 503 });
  });
});
