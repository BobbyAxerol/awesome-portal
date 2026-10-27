// @vitest-environment node
/**
 * WP-F3 (register 2f3): the lit stage bodies of the populated review lane (`e2e/bffSimulatedStage.ts`) through the product's own
 * reading path: the REAL http client and the REAL readers, `fetch` pointed at a fixture server booted with the populated profile.
 * Every lit body must read (never `unsupported`), the screens' view models must print the figures, and every figure the real source
 * would derive (a ratio, a difference, an unrealised amount) is asserted here in integer arithmetic, so a simulated value can never
 * contradict itself. The V2 bodies and the `_dark` variant are untouched.
 */
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { STAGE_V2_WORKSPACE } from "../../e2e/bffDoubleStage";
import { baseDeploymentId, canonicalDecimal, difference, usedRatio, variantOf } from "../../e2e/bffSimulatedStage";
import { createHttpApi } from "../execution/api/httpApi";
import type { ExecutionApi, Result } from "../execution/api/ports";
import type { DeliveryPolicy } from "../execution/profile";
import { createFixtureServer, loadConfig, resetFixtureGlobals } from "../../../fixture-bff/app";

const OPEN: DeliveryPolicy = {
  policyRevision: 4,
  queryEnabled: true,
  projectionIngestionEnabled: true,
  sseEnabled: true,
  governanceWriteEnabled: true,
  paperCommandsEnabled: true,
  sandboxCommandsEnabled: true,
  liveProtectiveCommandsEnabled: true,
  liveRiskIncreasingCommandsEnabled: true,
};

let server: import("node:http").Server;
let api: ExecutionApi;
let raw: (path: string) => Promise<unknown>;
const realFetch = globalThis.fetch;

beforeAll(async () => {
  server = createFixtureServer(loadConfig({ PORT: "0", FIXTURE_HOST: "127.0.0.1", FIXTURE_SCALE: "medium", FIXTURE_REVIEW_PROFILE: "populated" }));
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  vi.stubGlobal("fetch", (input: string | URL | Request, init?: RequestInit) => realFetch(typeof input === "string" && input.startsWith("/") ? `${origin}${input}` : input, init));
  api = createHttpApi({ policy: OPEN, readScope: {} });
  raw = async (path) => (await realFetch(`${origin}/api/v1/execution${path}`)).json();
}, 30_000);

afterAll(async () => {
  vi.unstubAllGlobals();
  await new Promise<void>((done) => server.close(() => done()));
  resetFixtureGlobals();
});

async function value<T>(call: Promise<Result<T>>): Promise<T> {
  const result = await call;
  if (!result.ok) throw new Error(`refused: ${result.status}: ${result.reason}`);
  return result.value;
}

describe("variants", () => {
  it("the id decides the state", () => {
    expect(variantOf("dep_live_01")).toBe("ok");
    expect(variantOf("dep_live_01_mismatch")).toBe("mismatch");
    expect(variantOf("dep_canary_01_stale")).toBe("stale");
    expect(variantOf("dep_live_01_gap")).toBe("gap");
    expect(variantOf("dep_canary_01_breach")).toBe("breach");
    expect(variantOf("dep_x_dark")).toBe("dark");
    expect(variantOf("dep_b2")).toBe("mismatch");
    expect(variantOf("dep_c1")).toBe("halted");
    expect(baseDeploymentId("dep_live_01_mismatch")).toBe("dep_live_01");
    expect(baseDeploymentId("dep_live_01")).toBe("dep_live_01");
  });
});

describe("derived figures are exact", () => {
  it("canonical decimals drop trailing zeros and negative zero", () => {
    expect(canonicalDecimal("-420.50")).toBe("-420.5");
    expect(canonicalDecimal("4630.00")).toBe("4630");
    expect(canonicalDecimal("-0.00")).toBe("0");
  });
  it("the used ratio is consumed / approved at four places, half up", () => {
    expect(usedRatio("3820.00", "5000")).toBe("0.764");
    expect(usedRatio("6120.40", "10000")).toBe("0.612");
    expect(usedRatio("38.60", "250")).toBe("0.1544");
    expect(usedRatio("1", "20")).toBe("0.05");
    expect(usedRatio("5210.00", "5000")).toBe("1.042");
    expect(usedRatio("1", "3")).toBe("0.3333");
    expect(usedRatio("2", "3")).toBe("0.6667");
  });
  it("a difference is internal minus broker, exactly", () => {
    expect(difference("10184.20", "10184.21")).toBe("-0.01");
    expect(difference("12.34", "12.35")).toBe("-0.01");
    expect(difference("60118.40", "60118.40")).toBe("0");
  });
});

describe("the V2 bodies and the dark variant are untouched", () => {
  it("SCOPED_V2 stays the published parent body", async () => {
    const live = await value(api.getLiveFullVersioned("dep_live_01", { workspaceId: STAGE_V2_WORKSPACE }));
    expect(live.kind).toBe("v2");
    const canary = await value(api.getCanaryVersioned("dep_canary_01", { workspaceId: STAGE_V2_WORKSPACE }));
    expect(canary.kind).toBe("v2");
  });
  it("_dark answers the published dark body", async () => {
    const body = (await raw("/deployments/dep_live_01_dark/live")) as { source_integration_state: string; kpis: { value: unknown }[] };
    expect(body.source_integration_state).toBe("UNAVAILABLE");
    expect(body.kpis.every((k) => k.value === null)).toBe(true);
  });
});
