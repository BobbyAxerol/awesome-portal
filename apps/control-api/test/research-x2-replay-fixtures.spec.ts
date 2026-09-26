/**
 * X2 · B6 — canonical P04 hub-lane replay fixtures (`research.replay.v1`),
 * published like W5b's retained-lane ones (CG-P17-01 closed the retained
 * lane only).
 *
 * The bodies are what `ResearchReplayService` serves over the real QuantBT
 * 1.1.1 P04 Delta-RSI evidence receipt (`four_month_oos`, the RF-05 fixture:
 * BTCUSDT 1h, OOS from 2026-04-01) after `ResearchEvidenceService` ingests it
 * — the same path a P04 run takes on the terminal callback. Every run
 * validates the committed bodies against Zod and the published OpenAPI;
 * `X2_WRITE_FIXTURES=1` rewrites them.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { ResearchEvidenceService } from "../src/research/evidence.service";
import { sha256ResearchJson } from "../src/research/preflight.service";
import type { ResearchProgressIngress } from "../src/research/progress.contract";
import { ResearchReplayResponseSchema } from "../src/research/replay.contract";
import { ResearchReplayService } from "../src/research/replay.service";
import { p13RealReceiptFixture } from "./research-evidence.fixture";
import { openApiValidator } from "./research-rf05-openapi";

const scope = { workspaceId: "x2-workspace", actorUserId: "x2-user" };
const RUN = "run_x2_p04_real";
const binding = {
  requested_spec_digest: "a".repeat(64), effective_spec_digest: "b".repeat(64),
  dataset_binding_digest: "c".repeat(64), manifest_digest: "d".repeat(64),
};
const replayValidator = openApiValidator("research-replay.openapi.json", "Replay");
const root = join(process.env.PORTAL_CONTRACTS_DIR ?? join(__dirname, "../../../packages/contracts"), "fixtures");
const files = {
  first: "research-replay.p04-real.first-window.valid.json",
  seek: "research-replay.p04-real.far-seek.valid.json",
  absent: "research-replay.p04-not-published.valid.json",
} as const;

/** The real receipt ingested exactly as the terminal callback would, then read back as the hub bundle. */
async function replayService(options: { published?: boolean } = {}) {
  const persist = vi.fn().mockResolvedValue(undefined);
  const repository = { persist, inputBinding: vi.fn().mockResolvedValue(binding), hub: vi.fn(), series: vi.fn(), bundle: vi.fn() };
  const evidence = new ResearchEvidenceService(repository as never, { FEATURE_RESEARCH_EVIDENCE: "true" } as never);
  const receipt = p13RealReceiptFixture("four_month_oos");
  await evidence.ingest({ ...scope, jobId: "job_x2", workerAttemptId: "attempt_x2", leaseEpoch: 1 }, {
    run_id: RUN, event: { event_type: "run_completed", sequence: 9, payload: { evidence_digest: sha256ResearchJson(receipt) } }, evidence: receipt,
  } as unknown as ResearchProgressIngress);
  const write = persist.mock.calls[0]![1] as Record<string, any>;
  const published = options.published ?? true;
  const hub = {
    kind: "DURABLE" as const, runId: RUN, runState: "READY", runCreatedAtUtcMs: 1_775_000_000_000,
    alphaId: "delta-rsi-polynomial-alpha", alphaName: "Delta-RSI Polynomial Alpha", alphaVersionId: "av_delta_rsi_polynomial_alpha_1_0_0",
    requestedSpec: null, requestedSpecDigest: binding.requested_spec_digest, effectiveSpecDigest: binding.effective_spec_digest,
    datasetBindingDigest: binding.dataset_binding_digest, manifestDigest: binding.manifest_digest,
    progressSnapshot: null, jobState: published ? "SUCCEEDED" : "RUNNING",
    revision: published ? write.projectionRevision : null, projection: published ? write.projection : null,
    readiness: published ? write.readiness : "NOT_READY", sourceEvidenceDigest: published ? write.sourceEvidenceDigest : null,
    receivedAt: new Date("2026-09-26T00:00:00Z"), asOfUtcMs: 1_790_380_800_000,
  };
  const series = new Map<string, unknown>();
  if (published) {
    for (const item of write.series as Array<Record<string, any>>) {
      series.set(item.kind, {
        revision: write.projectionRevision, kind: item.kind, availabilityState: item.availabilityState, reasonCode: item.reasonCode,
        sourceObservationCount: item.sourceObservationCount, emittedPointCount: item.emittedPointCount,
        sampling: item.sampling, digest: item.digest, values: item.values,
      });
    }
  }
  repository.bundle.mockImplementation(async () => ({ hub, series }));
  return new ResearchReplayService(evidence, {
    FEATURE_RESEARCH_REPLAY: "true",
    QUERY_CURSOR_ACTIVE_KEY_ID: "query-k1",
    QUERY_CURSOR_KEYS_JSON: '{"query-k1":"research-replay-test-signing-key-at-least-thirty-two-bytes"}',
    QUERY_CURSOR_TTL_SECONDS: 900,
  } as never);
}

describe("X2 · B6 · published P04 hub-lane replay fixtures (research.replay.v1)", () => {
  it("serves the real P04 receipt's OOS equity: a first window and a far seek that lands on its own ordinal", async () => {
    const service = await replayService();
    const first = await service.detail(scope, RUN, { limit: 50 });
    expect(first.route.state).not.toBe("NOT_PUBLISHED");
    expect(first.equity_replay.items.length).toBeGreaterThan(0);
    const total = first.equity_replay.source_sample?.emitted_point_count ?? first.equity_replay.items.length;
    const seek = await service.detail(scope, RUN, { limit: 10, at_ordinal: Math.max(0, total - 3) });
    expect(seek.equity_replay.state_at_cursor).toMatchObject({ playback_ordinal: Math.max(0, total - 3) });
    // The hub replay is equity only: it never synthesises an order or fill ledger.
    expect(first.source_absences.order_ledger.state).toBe("NOT_PUBLISHED");
    expect(JSON.stringify(first)).not.toMatch(/"fills?":\s*\[\s*\{/);
  });

  it("writes (opt-in) and validates the committed fixtures against Zod and OpenAPI", async () => {
    if (process.env.X2_WRITE_FIXTURES === "1") {
      const service = await replayService();
      const first = await service.detail(scope, RUN, { limit: 50 });
      const total = first.equity_replay.source_sample?.emitted_point_count ?? first.equity_replay.items.length;
      writeFileSync(join(root, files.first), `${JSON.stringify(first)}\n`);
      writeFileSync(join(root, files.seek), `${JSON.stringify(await service.detail(scope, RUN, { limit: 10, at_ordinal: Math.max(0, total - 3) }))}\n`);
      writeFileSync(join(root, files.absent), `${JSON.stringify(await (await replayService({ published: false })).detail(scope, RUN, { limit: 50 }))}\n`);
    }
    for (const name of Object.values(files)) {
      const body = JSON.parse(readFileSync(join(root, name), "utf8"));
      expect(ResearchReplayResponseSchema.safeParse(body).success, name).toBe(true);
      replayValidator.assert(body);
    }
    const absent = JSON.parse(readFileSync(join(root, files.absent), "utf8"));
    expect(absent).toMatchObject({ revision: null, readiness: "NOT_READY", equity_replay: { state: "NOT_PUBLISHED", items: [] } });
  });
});
