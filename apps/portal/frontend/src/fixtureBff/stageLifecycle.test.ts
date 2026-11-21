// @vitest-environment node
/** WP-P: every deployment id the positive world emits (Fleet children, Account 360, Alpha 360) has a lifecycle record whose stage is the dataset's stage. */
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFixtureServer, loadConfig, resetFixtureGlobals } from "../../../fixture-bff/app";
import { resetScenario } from "../../../fixture-bff/scenario";
import { stageOf } from "../../e2e/bffSimulatedStage";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;
const E = "/api/v1/execution";
let server: Server;
let base = "";
const get = async (path: string): Promise<Body> => (await fetch(`${base}${path}`)).json();

beforeAll(async () => {
  server = createFixtureServer(loadConfig({ PORT: "0", FIXTURE_HOST: "127.0.0.1", FIXTURE_REVIEW_PROFILE: "populated", FIXTURE_SCALE: "medium" }));
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((done) => server.close(() => done()));
  resetFixtureGlobals();
  resetScenario();
});

describe("lifecycle record of every deployment id", () => {
  it("the stage the stage screens use for an id is the stage the Fleet states for it", async () => {
    const stages = new Map<string, string>();
    for (const environment of ["paper", "sandbox", "live"]) {
      const fleet = await get(`${E}/manager/fleet?environment=${environment}&limit=200`);
      for (const row of fleet.items) for (const child of row.children) stages.set(child.deployment_id, String(child.stage).toLowerCase());
    }
    expect(stages.size).toBeGreaterThan(30);
    const wrong: string[] = [];
    for (const [id, stage] of stages) {
      // asked with a stage the id is NOT in: a record-less id would answer the asked stage
      const asked = stage === "paper" ? "live" : "paper";
      if (stageOf(id, asked) !== stage) wrong.push(`${id}: fleet ${stage}, stage record ${stageOf(id, asked)}`);
    }
    expect(wrong).toEqual([]);
  });

  it("deployment ids on Account 360 and Alpha 360 have a record", async () => {
    const ids = new Set<string>();
    for (const account of ["acc_bnc_core", "acc_bnc_sat", "acc_bnc_sub", "acc_okx_main", "acc_pap_sim", "acc_tn_bnc"]) {
      const body = await get(`${E}/resources/accounts/${account}`);
      for (const row of body.data?.deployments ?? []) ids.add(row.deployment_id);
    }
    for (const alpha of ["alpha_a", "alpha_b", "alpha_btc_trend", "alpha_scale_001", "alpha_scale_006"]) {
      const body = await get(`${E}/resources/alphas/${alpha}`);
      for (const row of body.data?.deployments ?? []) ids.add(row.deployment_id);
    }
    expect(ids.size).toBeGreaterThan(5);
    const unknown = [...ids].filter((id) => stageOf(id, "paper") === "paper" && stageOf(id, "live") === "live");
    expect(unknown).toEqual([]);
  });
});
