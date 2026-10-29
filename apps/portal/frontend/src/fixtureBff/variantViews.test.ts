// @vitest-environment node
/**
 * R-A (Codex disposition, 29 Oct 2026): variant ids are synthetic FIXTURE views, declared in e2e/bffWorldVariants.ts, never read out of an id's suffix.
 * Not a production relationship, not an authorization rule; no production payload carries the mapping (the fixture-only route /__fixture/variants does).
 */
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createFixtureServer, loadConfig, resetFixtureGlobals } from "../../../fixture-bff/app";
import { resetScenario } from "../../../fixture-bff/scenario";
import { baseDeploymentId, variantOf, worldIdOf } from "../../e2e/bffSimulatedStage";
import { standingOf } from "../../e2e/bffWorldStage";
import { deploymentOfView, variantViewOf, variantViews, viewOfDeployment } from "../../e2e/bffWorldVariants";

let server: import("node:http").Server;
let base = "";
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
const get = async (path: string) => { const r = await fetch(`${base}${path}`); return { status: r.status, body: await r.json() as any }; }; // eslint-disable-line @typescript-eslint/no-explicit-any

describe("a declared variant resolves to its declared base", () => {
  const NAMED: readonly [string, string, string][] = [
    ["dep_live_01_mismatch", "dep_live_01", "mismatch"], ["dep_live_01_gap", "dep_live_01", "gap"], ["dep_live_01_stale", "dep_live_01", "stale"], ["dep_live_01_dark", "dep_live_01", "dark"],
    ["dep_canary_01_stale", "dep_canary_01", "stale"], ["dep_canary_01_breach", "dep_canary_01", "breach"], ["dep_canary_01_dark", "dep_canary_01", "dark"],
    ["dep_sandbox_01_mismatch", "dep_sandbox_01", "mismatch"], ["dep_sandbox_01_dark", "dep_sandbox_01", "dark"], ["dep_paper_01_dark", "dep_paper_01", "dark"],
    ["dep_paper_01_halted", "dep_paper_01", "halted"], ["dep_paper_01_vn", "dep_paper_01", "vn"], ["dep_d1_mismatch", "dep_d1", "mismatch"],
  ];
  for (const [variant, baseId, word] of NAMED) {
    it(`${variant} is a declared view of ${baseId}`, () => {
      expect(viewOfDeployment(variant)).toBe(baseId);
      expect(variantViewOf(variant)).toMatchObject({ view_of_deployment_id: baseId, variant: word, fixture: true });
      expect(baseDeploymentId(variant)).toBe(baseId);
      expect(variantOf(variant)).toBe(word);
    });
  }
});

describe("nothing else resolves", () => {
  it("a base id and an unknown id are not variants", () => {
    for (const id of ["dep_live_01", "dep_canary_01", "dep_nope", "dep_88", ""]) {
      expect(viewOfDeployment(id)).toBeNull();
      expect(deploymentOfView(id)).toBe(id);
      expect(variantOf(id)).toBe("ok");
    }
  });
  it("a look-alike suffix that the world does not declare does NOT resolve (suffix stripping is gone)", () => {
    for (const id of ["dep_x_dark", "dep_nope_mismatch", "dep_live_01_breach", "dep_live_01_mismatch_x", "dep_canary_01_gap", "dep_paper_01_gap", "dep_live_01_MISMATCH"]) {
      expect(viewOfDeployment(id), id).toBeNull();
      expect(deploymentOfView(id), id).toBe(id);
      expect(baseDeploymentId(id), id).toBe(id);
    }
  });
  it("every declared view names a deployment of the same stage family and a base that is itself not a view", () => {
    const views = variantViews();
    expect(views.length).toBeGreaterThan(40);
    for (const view of views) {
      expect(variantViewOf(view.view_of_deployment_id)).toBeNull();
      expect(view.id).toBe(`${view.view_of_deployment_id}_${view.variant}`);
    }
  });
  it("retired views retain their declared deployment, never another alpha's current book", () => {
    const retired = variantViews().filter((view) => standingOf(view.view_of_deployment_id)?.status === "completed");
    expect(retired.length).toBeGreaterThan(0);
    for (const view of retired) {
      const standing = standingOf(view.view_of_deployment_id)!;
      expect(worldIdOf(view.id, standing.stage), view.id).toBe(view.view_of_deployment_id);
    }
  });
});

describe("the mapping is fixture-only and reaches the navigation", () => {
  it("GET /__fixture/variants publishes the declared graph, labelled fixture", async () => {
    const answer = await get("/__fixture/variants");
    expect(answer.status).toBe(200);
    expect(answer.body.fixture).toBe(true);
    expect(answer.body.basis).toMatch(/NOT_A_PRODUCTION_RELATIONSHIP/);
    expect(answer.body.views.find((v: { id: string }) => v.id === "dep_live_01_mismatch")).toMatchObject({ view_of_deployment_id: "dep_live_01" });
  });
  it("returns only the requested view and independently refuses the denied workspace", async () => {
    const one = await get("/__fixture/variants?view_id=dep_live_01_gap&workspace_id=ws_TEST_ONLY_a");
    expect(one.status).toBe(200);
    expect(one.body.view).toMatchObject({ id: "dep_live_01_gap", view_of_deployment_id: "dep_live_01", fixture: true });
    expect(one.body.views).toBeUndefined();
    const denied = await get("/__fixture/variants?view_id=dep_live_01_gap&workspace_id=ws_TEST_DENIED");
    expect(denied.status).toBe(403);
    expect(denied.body.view).toBeUndefined();
  });
  it("no production payload carries the member: the room, the queue and the blotter do not name it", async () => {
    for (const path of ["/api/v1/execution/deployments/dep_live_01_mismatch/live", "/api/v1/execution/operations?target_id=dep_live_01_mismatch", "/api/v1/execution/screens/blotter?deployment_id=dep_live_01_mismatch&limit=5"]) {
      expect(JSON.stringify((await get(path)).body), path).not.toContain("view_of_deployment_id");
    }
  });
  it("the blotter and the Operations link of a variant room land on the base deployment's non-empty lists", async () => {
    const own = await get("/api/v1/execution/screens/blotter?deployment_id=dep_live_01&limit=200");
    for (const variant of ["dep_live_01_mismatch", "dep_live_01_gap", "dep_live_01_stale", "dep_live_01_dark"]) {
      const blotter = await get(`/api/v1/execution/screens/blotter?deployment_id=${variant}&limit=200`);
      expect(blotter.body.data.orders.length, variant).toBe(own.body.data.orders.length);
      expect(blotter.body.data.orders.length).toBeGreaterThan(0);
      const ops = await get(`/api/v1/execution/operations?target_id=${variant}&limit=50`);
      expect(ops.body.page.rows.length, variant).toBeGreaterThan(0);
      expect(ops.body.page.rows.every((row: { target: { id: string } }) => row.target.id === "dep_live_01")).toBe(true);
    }
  });
  it("an UNDECLARED look-alike lists nothing (it is not stripped to the base)", async () => {
    const blotter = await get("/api/v1/execution/screens/blotter?deployment_id=dep_live_01_breach&limit=50");
    expect(blotter.body.data.orders).toHaveLength(0);
    const ops = await get("/api/v1/execution/operations?target_id=dep_live_01_breach&limit=50");
    expect(ops.body.page.rows).toHaveLength(0);
  });
  it("a declared view does not bypass a destination's workspace refusal", async () => {
    for (const path of [
      "/api/v1/execution/deployments/dep_live_01_gap/live?workspace_id=ws_TEST_DENIED",
      "/api/v1/execution/operations?target_id=dep_live_01_gap&workspace_id=ws_TEST_DENIED",
      "/api/v1/execution/screens/blotter?deployment_id=dep_live_01_gap&workspace_id=ws_TEST_DENIED",
    ]) {
      const result = await get(path);
      expect(result.status, path).toBe(403);
      expect(JSON.stringify(result.body), path).not.toContain("dep_live_01");
    }
  });
  it("same-workspace association: the declared graph is the one world of the lane (every base is a deployment of the fleet)", async () => {
    const fleet = await get("/api/v1/execution/alphas?limit=200");
    const ids = new Set<string>(fleet.body.page.rows.flatMap((a: { deployments?: { deployment_id: string }[] }) => (a.deployments ?? []).map((d) => d.deployment_id)));
    for (const view of variantViews().slice(0, 60)) expect(ids.has(view.view_of_deployment_id), view.id).toBe(true);
  });
});
