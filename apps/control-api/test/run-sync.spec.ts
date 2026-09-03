import { describe, expect, it } from "vitest";
import { ResearchRunSyncService, canonicalJson } from "../src/facade/run-sync.service";
import { RunsRepository } from "../src/repos/runs";
import { ControlApiConfig } from "../src/config";
import { PortalUser } from "../src/domain";

const user: PortalUser = {
  userId: "usr_bobby", username: "bobby", displayName: "Bobby", role: "ADMIN", status: "ACTIVE",
  mustChangePassword: false, failedLoginCount: 0, lockedUntil: null, sessionVersion: 1,
  createdAt: new Date(), updatedAt: new Date(), disabledAt: null,
};

const config = {
  FEATURE_PROXY_PORTAL: "true",
  PORTAL_API_BASE_URL: "http://portal-api:8000",
} as unknown as ControlApiConfig;

function repository(existing: Record<string, unknown> | null) {
  const upserts: Array<Record<string, unknown>> = [];
  return {
    upserts,
    repo: {
      findByRunId: async () => existing,
      upsert: async (input: Record<string, unknown>) => { upserts.push(input); },
    } as unknown as RunsRepository,
  };
}

const queuedRow = {
  runId: "run_1", workspaceId: "ws_1", ownerUserId: "usr_bobby", status: "QUEUED",
  protocol: null, strategyId: "alpha_a", datasetId: null, sourceCursor: "req_1",
  artifactSha256: null, artifactSchemaVersion: null, artifactCreatorUserId: null,
  methodologyClaimIds: [], updatedAt: new Date(),
};

const detail = {
  run_id: "run_1", status: "COMPLETED", strategy_id: "alpha_a",
  protocol: "three_window_decay", dataset_id: "crypto-binance-1m",
  artifact_schema_version: "1",
};
const summary = {
  selected_params: {
    artifact_schema_version: "1",
    causality_claim: "retrospective_global_calibration",
    validation_claim: "walk_forward_oos",
    frozen_at: "2026-08-19T04:48:11Z",
    mean_oos_sharpe: 2.31,
  },
};

function fetchDouble(routes: Record<string, unknown>) {
  const calls: string[] = [];
  const impl = (async (url: URL | string) => {
    const path = new URL(String(url)).pathname;
    calls.push(path);
    const body = routes[path];
    return new Response(JSON.stringify(body ?? { detail: "Not Found" }), {
      status: body ? 200 : 404,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { calls, impl };
}

describe("P4-I / F17 research run read-model refresh", () => {
  it("ingests completion, claims and a canonical artifact pin from the research service", async () => {
    const { upserts, repo } = repository(queuedRow);
    const { calls, impl } = fetchDouble({ "/api/runs/run_1": detail, "/api/runs/run_1/summary": summary });
    const service = new ResearchRunSyncService(config, repo, impl);
    expect(await service.refresh(user, "ws_1", "run_1")).toBe(true);
    expect(calls).toEqual(["/api/runs/run_1", "/api/runs/run_1/summary"]);
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({
      runId: "run_1",
      status: "COMPLETED",
      strategyId: "alpha_a",
      artifactSchemaVersion: "1",
      // The run owner is the creator of record when research names none.
      artifactCreatorUserId: "usr_bobby",
      methodologyClaimIds: ["retrospective_global_calibration", "walk_forward_oos"],
    });
    expect(upserts[0].artifactSha256).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("leaves the read model untouched when research still reports a non-terminal state", async () => {
    const { upserts, repo } = repository(queuedRow);
    const { impl } = fetchDouble({ "/api/runs/run_1": { ...detail, status: "OPTIMIZING_IS" } });
    const service = new ResearchRunSyncService(config, repo, impl);
    expect(await service.refresh(user, "ws_1", "run_1")).toBe(false);
    expect(upserts).toHaveLength(0);
  });

  it("swallows upstream failure and never writes — the typed refusal stays authoritative", async () => {
    const { upserts, repo } = repository(queuedRow);
    const failing = (async () => { throw new Error("upstream down"); }) as unknown as typeof fetch;
    const service = new ResearchRunSyncService(config, repo, failing);
    expect(await service.refresh(user, "ws_1", "run_1")).toBe(false);
    expect(upserts).toHaveLength(0);
  });

  it("does not re-fetch a run that is already terminal with artifact and claims", async () => {
    const { upserts, repo } = repository({
      ...queuedRow, status: "COMPLETED",
      artifactSha256: "sha256:" + "a".repeat(64),
      methodologyClaimIds: ["walk_forward_oos"],
    });
    const { calls, impl } = fetchDouble({});
    const service = new ResearchRunSyncService(config, repo, impl);
    expect(await service.refresh(user, "ws_1", "run_1")).toBe(false);
    expect(calls).toHaveLength(0);
    expect(upserts).toHaveLength(0);
  });

  it("refuses a workspace mismatch without touching the network", async () => {
    const { repo } = repository(queuedRow);
    const { calls, impl } = fetchDouble({});
    const service = new ResearchRunSyncService(config, repo, impl);
    expect(await service.refresh(user, "ws_other", "run_1")).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("canonicalJson is stable across key order so the pin never flaps", () => {
    const left = canonicalJson({ b: 1, a: { d: [1, 2], c: "x" } });
    const right = canonicalJson({ a: { c: "x", d: [1, 2] }, b: 1 });
    expect(left).toBe(right);
    expect(left).toBe('{"a":{"c":"x","d":[1,2]},"b":1}');
  });
});
