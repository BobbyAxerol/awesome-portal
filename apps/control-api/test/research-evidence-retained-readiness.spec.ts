import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { EvidenceHubRow } from "../src/research/evidence.repository";
import { ResearchEvidenceService } from "../src/research/evidence.service";
import { ResearchEvidenceController } from "../src/research/evidence.controller";
import { ResearchEvidenceError } from "../src/research/evidence.error";
import { ResearchProgressSnapshotSchema } from "../src/research/progress.contract";
import { ResearchEvidenceHubResponseSchema } from "../src/research/evidence.contract";
import { p13EvidenceSourceFixture } from "./research-evidence.fixture";
import { sha256ResearchJson } from "../src/research/preflight.service";
import { openApiValidator } from "./research-rf05-openapi";
import { failedAt } from "../src/research/run-state";

const scope = { workspaceId: "retained-workspace", actorUserId: "retained-user" };
const runId = "rrun_" + "a".repeat(32);
const source = JSON.parse(readFileSync(join(__dirname, "research-progress-w2.fixture.json"), "utf8"));
const contractsRoot = process.env.PORTAL_CONTRACTS_DIR ?? join(__dirname, "../../../packages/contracts");
const enrichment = () => JSON.parse(readFileSync(join(contractsRoot, "fixtures/research-enriched-analysis.healthy.valid.json"), "utf8"));

function hubRow(): EvidenceHubRow {
  const progress = ResearchProgressSnapshotSchema.parse({ ...structuredClone(source.snapshot), run_id: runId });
  return {
    kind: "DURABLE", runId, runState: "READY", jobState: "SUCCEEDED", runCreatedAtUtcMs: progress.created_at_utc_ms,
    alphaId: null, alphaName: null, alphaVersionId: null, displayLabel: "R-WFO-023",
    requestedSpec: { data: { dataset_id: "ds", symbol: "BTCUSDT", timeframe: "1h" } },
    preflightSnapshot: null, preflightTopology: null,
    requestedSpecDigest: "1".repeat(64), effectiveSpecDigest: "2".repeat(64), datasetBindingDigest: "3".repeat(64), manifestDigest: "4".repeat(64),
    progressSnapshot: progress, revision: null, projection: null, readiness: null, sourceEvidenceDigest: null,
    receivedAt: null, asOfUtcMs: progress.updated_at_utc_ms,
    retainedSource: {
      runId, sourceAdapterId: "rs02.quantbt-signal-notional-wfo.v1", profileId: "rs02.delta-signal-notional-wfo.v1",
      artifactRevision: 1, retainedImportDigest: "5".repeat(64), manifestDigest: "6".repeat(64),
      sealedArtifact: { artifactRevision: 1, manifestDigest: "6".repeat(64), state: "SEALED" },
      requestedSpecDigest: "1".repeat(64), effectiveSpecDigest: "2".repeat(64), datasetBindingDigest: "3".repeat(64),
      lifecycleStatus: "COMPLETED", terminalMaterialized: true,
    },
  };
}

function subject(row: EvidenceHubRow) {
  const repository = { hub: vi.fn().mockResolvedValue(row), bundle: vi.fn().mockResolvedValue({ hub: row, series: new Map() }) };
  const service = new ResearchEvidenceService(repository as never, { FEATURE_RESEARCH_EVIDENCE: "true" } as never);
  return { repository, service };
}

describe("B8 S04 Hub readiness follows actual retained lane authority", () => {
  it("W1 B-2 publishes Progress's exact failure basis only under FAILED lifecycle", async () => {
    const row = hubRow();
    row.runState = "FAILED"; row.jobState = "FAILED";
    const snapshot = ResearchProgressSnapshotSchema.parse(row.progressSnapshot);
    snapshot.stages[3]!.state = "RUNNING";
    snapshot.stages[3]!.completed_at_utc_ms = null;
    row.progressSnapshot = snapshot;
    const hub = await subject(row).service.hub(scope, runId);
    expect(hub.lifecycle!.failed_at).toEqual(failedAt(snapshot));
    expect(hub.lifecycle!.failed_at).toMatchObject({ stage: "S4", basis: "SOURCE_RUNNING_STAGE" });
    openApiValidator("research-evidence.openapi.json", "EvidenceHub").assert(hub);
    row.runState = "RUNNING"; row.jobState = "RUNNING";
    expect((await subject(row).service.hub(scope, runId)).lifecycle!.failed_at).toBeNull();
    row.runState = "FAILED"; row.jobState = "FAILED"; row.progressSnapshot = null;
    expect((await subject(row).service.hub(scope, runId)).lifecycle!.failed_at).toBeNull();
    row.progressSnapshot = { ...snapshot, run_id: "foreign_run" };
    expect((await subject(row).service.hub(scope, runId)).lifecycle!.failed_at).toBeNull();
  });
  it.each([
    ["rs02.quantbt-advanced-wfo.v1", "rs02.delta-wfo-global.v1", false],
    ["rs02.quantbt-advanced-wfo.v1", "rs02.delta-wfo-global.v1", true],
    ["rs02.quantbt-signal-notional-wfo.v1", "rs02.delta-signal-notional-wfo.v1", false],
    ["rs02.quantbt-signal-notional-wfo.v1", "rs02.delta-signal-notional-wfo.v1", true],
  ] as const)("sealed, run-bound %s/%s is AVAILABLE/PARTIAL (enrichment=%s)", async (sourceAdapterId, profileId, withEnrichment) => {
    const row = hubRow();
    Object.assign(row.retainedSource!, { sourceAdapterId, profileId });
    expect(row.retainedSource!.manifestDigest).not.toBe(row.manifestDigest);
    if (withEnrichment) row.enrichedAnalysis = enrichment();
    const original = structuredClone(row);
    const { service, repository } = subject(row);
    const hub = await service.hub(scope, runId);
    expect(hub.availability).toEqual({ state: "AVAILABLE", reason_code: null });
    expect(hub.readiness).toBe("PARTIAL");
    expect(hub.revision).toBeNull();
    expect(hub.revision_binding!.value).toBeNull();
    expect(hub.metrics.every(metric => metric.value === null && metric.availability.state === "NOT_PUBLISHED")).toBe(true);
    expect(hub.oos_performance!.metrics.every(metric => metric.value === null && metric.availability.state === "NOT_PUBLISHED")).toBe(true);
    expect(hub.series.every(series => series.href === null && series.availability.state === "NOT_PUBLISHED")).toBe(true);
    expect(hub.stages.map(stage => stage.state)).toEqual(["DONE", "DONE", "DONE", "DONE", "DONE"]);
    expect(hub.enriched_analysis_availability).toEqual(withEnrichment
      ? { state: "AVAILABLE", reason_code: null }
      : { state: "NOT_PUBLISHED", reason_code: "SEALED_ENRICHMENT_NOT_COMPUTED" });
    expect(hub).not.toHaveProperty("retainedSource");
    expect(ResearchEvidenceHubResponseSchema.safeParse(hub).success).toBe(true);
    openApiValidator("research-evidence.openapi.json", "EvidenceHub").assert(hub);
    expect(repository.hub).toHaveBeenCalledOnce();
    expect(row).toEqual(original);
    const bundled = await service.bundle(scope, runId, ["EQUITY_OOS", "MONTHLY_RETURNS"]);
    expect(bundled.hub.readiness).toBe("PARTIAL");
    for (const series of bundled.series.values()) {
      expect(series.availability.state).toBe("NOT_PUBLISHED");
      expect(series.values).toEqual([]);
    }
  });

  it("enrichment and issued claims alone cannot grant retained readiness", async () => {
    const row = hubRow();
    delete row.retainedSource;
    row.enrichedAnalysis = enrichment();
    const hub = await subject(row).service.hub(scope, runId);
    expect(hub.enriched_analysis_availability!.state).toBe("AVAILABLE");
    expect(hub.readiness).toBe("NOT_READY");
    expect(hub.availability.state).toBe("NOT_PUBLISHED");
  });

  it.each([
    ["foreign run", (row: EvidenceHubRow) => { row.retainedSource!.runId = "rrun_" + "b".repeat(32); }],
    ["wrong adapter/profile pair", (row: EvidenceHubRow) => { row.retainedSource!.sourceAdapterId = "rs02.quantbt-advanced-wfo.v1"; }],
    ["zero revision", (row: EvidenceHubRow) => { row.retainedSource!.artifactRevision = 0; }],
    ["invalid revision", (row: EvidenceHubRow) => { row.retainedSource!.artifactRevision = 1.1; }],
    ["invalid import digest", (row: EvidenceHubRow) => { row.retainedSource!.retainedImportDigest = "invalid"; }],
    ["artifact manifest mismatch", (row: EvidenceHubRow) => { row.retainedSource!.sealedArtifact!.manifestDigest = "0".repeat(64); }],
    ["artifact revision mismatch", (row: EvidenceHubRow) => { row.retainedSource!.sealedArtifact!.artifactRevision = 2; }],
    ["artifact not SEALED", (row: EvidenceHubRow) => { row.retainedSource!.sealedArtifact!.state = "CORRUPT"; }],
    ["missing sealed artifact", (row: EvidenceHubRow) => { row.retainedSource!.sealedArtifact = null; }],
    ["invalid artifact manifest", (row: EvidenceHubRow) => { row.retainedSource!.manifestDigest = "invalid"; row.retainedSource!.sealedArtifact!.manifestDigest = "invalid"; }],
    ["requested mismatch", (row: EvidenceHubRow) => { row.retainedSource!.requestedSpecDigest = "0".repeat(64); }],
    ["effective mismatch", (row: EvidenceHubRow) => { row.retainedSource!.effectiveSpecDigest = "0".repeat(64); }],
    ["dataset mismatch", (row: EvidenceHubRow) => { row.retainedSource!.datasetBindingDigest = "0".repeat(64); }],
    ["missing producer binding", (row: EvidenceHubRow) => { row.requestedSpecDigest = null; }],
    ["pending checkpoint", (row: EvidenceHubRow) => { row.retainedSource!.terminalMaterialized = false; }],
    ["FINISHING lifecycle", (row: EvidenceHubRow) => { row.retainedSource!.lifecycleStatus = "FINISHING"; }],
    ["FAILED lifecycle", (row: EvidenceHubRow) => { row.retainedSource!.lifecycleStatus = "FAILED"; row.jobState = "FAILED"; row.runState = "FAILED"; }],
    ["CANCELLED lifecycle", (row: EvidenceHubRow) => { row.retainedSource!.lifecycleStatus = "CANCELLED"; row.jobState = "CANCELLED"; row.runState = "CANCELLED"; }],
    ["live job", (row: EvidenceHubRow) => { row.jobState = "RUNNING"; }],
    ["unready run", (row: EvidenceHubRow) => { row.runState = "SEALING"; }],
    ["missing journal", (row: EvidenceHubRow) => { row.progressSnapshot = null; }],
    ["foreign journal", (row: EvidenceHubRow) => { (row.progressSnapshot as Record<string, unknown>).run_id = "other_run"; }],
    ["unsealed journal", (row: EvidenceHubRow) => { (row.progressSnapshot as any).readiness.mandatory = "SEALING"; }],
    ["not completed journal", (row: EvidenceHubRow) => { (row.progressSnapshot as Record<string, unknown>).status = "FINISHING"; }],
    ["pending source coverage", (row: EvidenceHubRow) => { (row.progressSnapshot as any).source.coverage = "PENDING_SOURCE_CALLBACK"; }],
    ["legacy metadata", (row: EvidenceHubRow) => { row.kind = "LEGACY"; }],
  ])("does not upgrade readiness for %s", async (_name, mutate) => {
    const row = hubRow();
    mutate(row);
    const hub = await subject(row).service.hub(scope, runId);
    expect(hub.readiness).toBe("NOT_READY");
    expect(hub.availability.state).not.toBe("AVAILABLE");
  });

  it("retains P04 projection precedence and does not re-author its immutable revision", async () => {
    const row = hubRow();
    const source = p13EvidenceSourceFixture();
    const persist = vi.fn();
    const repository = { inputBinding: vi.fn().mockResolvedValue(null), persist, hub: vi.fn() };
    const service = new ResearchEvidenceService(repository as never, { FEATURE_RESEARCH_EVIDENCE: "true" } as never);
    await service.ingest({ ...scope, jobId: "job", workerAttemptId: "attempt", leaseEpoch: 1 }, {
      run_id: runId, event: { event_type: "run_completed", sequence: 9, payload: { evidence_digest: sha256ResearchJson(source) } }, evidence: source,
    } as never);
    const write = persist.mock.calls[0]![1];
    Object.assign(row, { projection: write.projection, revision: write.projectionRevision, readiness: write.readiness, sourceEvidenceDigest: write.sourceEvidenceDigest });
    row.retainedSource!.terminalMaterialized = false;
    repository.hub.mockResolvedValue(row);
    const hub = await service.hub(scope, runId);
    expect(hub.revision).toBe(write.projectionRevision);
    expect(hub.readiness).toBe(write.readiness);
    expect(hub.metrics.find(metric => metric.key === "FINAL_EQUITY")!.value).toBe("110");
  });

  it("semantic ETag changes for real retained readiness, and revalidation remains scoped", async () => {
    const row = hubRow();
    const { repository, service } = subject(row);
    const ready = await service.hub(scope, runId);
    row.retainedSource!.terminalMaterialized = false;
    const changed = await service.hub(scope, runId);
    expect(changed.etag).not.toBe(ready.etag);
    row.retainedSource!.terminalMaterialized = true;
    row.asOfUtcMs += 1_000;
    expect((await service.hub(scope, runId)).etag).toBe(ready.etag);
    const membership = { isMember: vi.fn().mockResolvedValue(true) };
    const controller = new ResearchEvidenceController(service, membership as never);
    const request = { portalUser: { userId: scope.actorUserId }, portalWorkspaceId: scope.workspaceId,
      headers: { "if-none-match": ready.etag }, raw: { once: vi.fn(), off: vi.fn() } };
    const reply = () => ({ header: vi.fn(), code: vi.fn().mockReturnThis(), send: vi.fn() });
    const revalidated = reply();
    await controller.hub(request as never, revalidated as never, runId, {});
    expect(revalidated.code).toHaveBeenCalledWith(304);
    const count = repository.hub.mock.calls.length;
    membership.isMember.mockResolvedValue(false);
    await expect(controller.hub(request as never, reply() as never, runId, { workspace_id: "foreign" })).rejects.toMatchObject({ status: 404 });
    expect(repository.hub).toHaveBeenCalledTimes(count);
    repository.hub.mockRejectedValue(new ResearchEvidenceError("RESEARCH_EVIDENCE_FORBIDDEN", "Access denied.", 403));
    await expect(service.hub(scope, runId)).rejects.toMatchObject({ status: 403 });
  });
});
