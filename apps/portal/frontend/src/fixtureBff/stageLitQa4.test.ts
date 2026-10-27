// @vitest-environment node
/**
 * WP-F3 QA4 round, read through the product's own readers on the canonical (positive) world: the canary's Limit column is the published limit
 * (a compliance row with a non-canonical decimal is refused whole and the screen then shows the DRAFT caps), typed rows are not refused, the
 * Paper gate and the Execution quality tiles count the same book as the tabs, and no sandbox step passes on expired evidence.
 */
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createHttpApi } from "../execution/api/httpApi";
import type { ExecutionApi } from "../execution/api/ports";
import type { DeliveryPolicy } from "../execution/profile";
import { limitRows } from "../execution/v2/screens/canary/model";
import { readCanaryView } from "../execution/v2/screens/canary/readCanary";
import { liveModelOf } from "../execution/v2/screens/live/model";
import { buildWorkbench } from "../execution/v2/screens/workbench/model";
import { createFixtureServer, loadConfig, resetFixtureGlobals } from "../../../fixture-bff/app";

const OPEN: DeliveryPolicy = {
  policyRevision: 4, queryEnabled: true, projectionIngestionEnabled: true, sseEnabled: true, governanceWriteEnabled: true,
  paperCommandsEnabled: true, sandboxCommandsEnabled: true, liveProtectiveCommandsEnabled: true, liveRiskIncreasingCommandsEnabled: true,
};
let server: import("node:http").Server;
let api: ExecutionApi;
let raw: (path: string) => Promise<Record<string, any>>;
const realFetch = globalThis.fetch;

beforeAll(async () => {
  server = createFixtureServer(loadConfig({ PORT: "0", FIXTURE_HOST: "127.0.0.1", FIXTURE_SCALE: "medium", FIXTURE_REVIEW_PROFILE: "populated", FIXTURE_SCENARIO: "positive" }));
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  vi.stubGlobal("fetch", (input: string | URL | Request, init?: RequestInit) => realFetch(typeof input === "string" && input.startsWith("/") ? `${origin}${input}` : input, init));
  api = createHttpApi({ policy: OPEN, readScope: {} });
  raw = async (path) => (await realFetch(`${origin}/api/v1/execution${path}`)).json() as Promise<Record<string, any>>;
}, 30_000);
afterAll(async () => {
  vi.unstubAllGlobals();
  await new Promise<void>((done) => server.close(() => done()));
  resetFixtureGlobals();
});

const num = (text: string): number => Number(text.replace(/,/g, ""));

describe("R5-03 the Limit column is the published limit", () => {
  for (const id of ["dep_canary_01", "dep_c1", "dep_canary_01_breach"]) {
    it(`${id}: every cap row is read (not refused), Limit >= Approved, and each row has the server's used ratio`, async () => {
      const result = await api.getCanaryVersioned(id);
      if (!result.ok) throw new Error(result.reason);
      const read = readCanaryView(result.value);
      if (read.kind !== "view") throw new Error("unsupported");
      const rows = limitRows(read.view).filter((r) => r.key !== "duration");
      expect(rows).toHaveLength(4);
      for (const row of rows) {
        expect(row.limit, `${id} ${row.key}`).not.toBeNull();
        expect(row.usedRatio, `${id} ${row.key}`).toBeDefined();
        if (row.limit?.kind === "value" && row.value?.kind === "value") expect(num(row.limit.decimal.full)).toBeGreaterThanOrEqual(num(row.value.decimal.full));
      }
    });
  }
});

describe("R5-10 typed rows are read, not refused", () => {
  it("canary positions and orders are typed rows", async () => {
    const result = await api.getCanaryVersioned("dep_canary_01");
    if (!result.ok) throw new Error(result.reason);
    const read = readCanaryView(result.value);
    if (read.kind !== "view") throw new Error("unsupported");
    expect(read.view.positions.rows).not.toBeNull();
    expect(read.view.orders.rows).not.toBeNull();
  });
  it("live positions and orders are typed rows", async () => {
    const result = await api.getLiveFullVersioned("dep_live_01", { include: ["identity", "stage_facts"] });
    if (!result.ok) throw new Error(result.reason);
    const built = liveModelOf(result.value);
    if (built.kind !== "model") throw new Error("unsupported");
    expect(built.model.v1Rows?.positions.kind).toBe("typed-positions");
    expect(built.model.v1Rows?.orders.kind).toBe("typed-orders");
  });
});

describe("R4 Paper: one count source, one clock", () => {
  it("the gate's trades, the quality tiles and the Fills tab count the same book; nothing is dated after the page's as-of", async () => {
    const envelope = await api.getPaperWorkbenchProfile("dep_paper_01", "paper");
    const quality = await api.getDeploymentQuality("dep_paper_01", "paper");
    if (!envelope.ok || !quality.ok) throw new Error("refused");
    const model = buildWorkbench(envelope.value, quality.value);
    // A Paper stage the alpha has left is a completed record (its own trade count); the gate of a stage still running counts the book the tabs list.
    if (model.gate.verdict !== "met") expect(model.gate.trades).toBe(model.fills.rows.length);
    else expect(model.gate.observedDays).toBeGreaterThanOrEqual(14);
    expect(quality.value.data.fillPopulation).toBe(String(model.fills.rows.length));
    expect(quality.value.data.orderPopulation).toBe(String(model.orders.rows.length));
    const body = await raw("/screens/paper/dep_paper_01");
    const asOf = Date.parse(body.as_of);
    for (const row of body.data.account_equity as Record<string, any>[]) expect(Date.parse(row.ts)).toBeLessThanOrEqual(asOf);
    expect(body.data.stage_facts.reconciliation.as_of.value).toBe(body.as_of);
  });
});

describe("R4-11 no step passes on expired evidence", () => {
  it("every recorded step expires after the page's as-of", async () => {
    const body = await raw("/deployments/dep_sandbox_01/certification");
    const asOf = Date.parse(body.stage_facts.reconciliation.as_of.value);
    // a certification the alpha has completed is a historical record; an open one never passes a step on expired evidence
    if (body.certification.workflow_state !== "APPROVED") for (const step of body.steps as Record<string, any>[]) if (step.expires_at !== null) expect(Date.parse(step.expires_at)).toBeGreaterThan(asOf);
  });
});

describe("R5-05 / R5-06 a live deployment with no canary of its own claims no canary and no missing evidence", () => {
  it("Carry A: no predecessor link, no 'canary exit evidence is not available' blocker, a real artifact digest", async () => {
    const body = await raw("/deployments/dep_live_01/live");
    expect((body.lineage as Record<string, any>[]).find((l) => l.kind === "CANARY_ENVELOPE")!.href).toBeNull();
    expect(JSON.stringify(body.lifecycle.blocker_codes)).not.toContain("CANARY_EXIT_EVIDENCE_UNAVAILABLE");
    expect((body.lineage as Record<string, any>[]).find((l) => l.kind === "ARTIFACT")!.value).not.toMatch(/^sha256:a{64}$/);
  });
});
