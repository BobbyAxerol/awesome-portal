// @vitest-environment node
/** WP-P: the in-memory command story. One id set through plan, apply, status, retry and the audit feed; deterministic reset; refused under FIXTURE_WRITES=refuse. */
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createFixtureServer, loadConfig, resetFixtureGlobals } from "../../../fixture-bff/app";
import { resetScenario } from "../../../fixture-bff/scenario";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;
const S = "/__fixture/command-story";
const E = "/api/v1/execution";

async function boot(writes: "doubles" | "refuse"): Promise<{ server: Server; base: string }> {
  const server = createFixtureServer(loadConfig({ PORT: "0", FIXTURE_HOST: "127.0.0.1", FIXTURE_REVIEW_PROFILE: "populated", FIXTURE_SCALE: "medium", FIXTURE_WRITES: writes }));
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  return { server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}
const stop = async (server: Server): Promise<void> => {
  server.closeAllConnections();
  await new Promise<void>((done) => server.close(() => done()));
  resetFixtureGlobals();
  resetScenario();
};

describe("command story (FIXTURE_WRITES=doubles)", () => {
  let server: Server;
  let base = "";
  const call = async (method: string, path: string, body?: unknown): Promise<{ status: number; body: Body }> => {
    const response = await fetch(`${base}${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  beforeAll(async () => { ({ server, base } = await boot("doubles")); });
  beforeEach(async () => { await call("POST", "/__fixture/scenario", { reset: true }); });
  afterAll(() => stop(server));

  it("plan, apply, status keep one id set; the receipt exists only once applied", async () => {
    const planned = await call("POST", `${S}/plan`, { command_key: "capital.top_up", request_key: "rk_test_1" });
    expect(planned.status).toBe(201);
    expect(planned.body).toMatchObject({ operation_id: "op_FIXTURE_LAB_story_001", command_key: "capital.top_up", request_key: "rk_test_1", state: "PLANNED", receipt_ref: null, source_side_effect_requested: false, fixture: true });
    const status0 = await call("GET", `${S}/${planned.body.operation_id}/status`);
    expect(status0.body.state).toBe("PLANNED");
    const applied = await call("POST", `${S}/${planned.body.operation_id}/apply`, {});
    expect(applied.body).toMatchObject({ state: "APPLIED", operation_id: planned.body.operation_id, request_key: "rk_test_1", receipt_ref: `FIXTURE_LAB:receipt-${planned.body.operation_id}-applied` });
    expect((await call("GET", `${S}/${planned.body.operation_id}/status`)).body.receipt_ref).toBe(applied.body.receipt_ref);
  });

  it("an UNKNOWN first outcome is retried to APPLIED; the same request key plans the same operation", async () => {
    const first = await call("POST", `${S}/plan`, { request_key: "rk_dup" });
    expect((await call("POST", `${S}/plan`, { request_key: "rk_dup" })).body.operation_id).toBe(first.body.operation_id);
    const id = first.body.operation_id as string;
    expect((await call("POST", `${S}/${id}/apply`, { simulate_unknown_first: true })).body).toMatchObject({ state: "UNKNOWN", receipt_ref: null });
    const retried = await call("POST", `${S}/${id}/retry`);
    expect(retried.body).toMatchObject({ state: "APPLIED" });
    expect(retried.body.attempts.map((attempt: Body) => [attempt.kind, attempt.outcome])).toEqual([["APPLY", "UNKNOWN"], ["RETRY", "APPLIED"]]);
  });

  it("typed refusals: unknown operation 404, apply twice 409, retry of a non-UNKNOWN 409", async () => {
    expect((await call("GET", `${S}/op_nope/status`)).status).toBe(404);
    const id = (await call("POST", `${S}/plan`, {})).body.operation_id as string;
    await call("POST", `${S}/${id}/apply`, {});
    expect((await call("POST", `${S}/${id}/apply`, {})).status).toBe(409);
    expect((await call("POST", `${S}/${id}/retry`)).status).toBe(409);
  });

  it("the audit feed carries the story with the same receipt; a scenario reset empties it and restarts the ids", async () => {
    const id = (await call("POST", `${S}/plan`, {})).body.operation_id as string;
    const receipt = (await call("POST", `${S}/${id}/apply`, {})).body.receipt_ref as string;
    const audit = await call("GET", `${E}/operations/audit?limit=250`);
    const rows = audit.body.items.filter((row: Body) => row.subject.id === id);
    expect(rows.map((row: Body) => row.action).sort()).toEqual(["APPLIED", "PLANNED"]);
    expect(rows.find((row: Body) => row.action === "APPLIED").receipt_ref).toBe(receipt);
    await call("POST", "/__fixture/scenario", { scenario: "stale" });
    expect((await call("GET", `${S}/${id}/status`)).status).toBe(404);
    await call("POST", "/__fixture/scenario", { reset: true });
    expect((await call("POST", `${S}/plan`, {})).body.operation_id).toBe("op_FIXTURE_LAB_story_001");
  });

  it("never reaches the product command routes: the plan route is still the blocked fixture answer", async () => {
    const response = await call("POST", `${E}/commands/plans`, { command_key: "capital.top_up" });
    expect(response.body.status).toBe("BLOCKED");
  });
});

describe("command story under the default FIXTURE_WRITES=refuse", () => {
  it("is refused like every other write", async () => {
    const { server, base } = await boot("refuse");
    try {
      const response = await fetch(`${base}${S}/plan`, { method: "POST", body: "{}" });
      expect(response.status).toBe(405);
    } finally { await stop(server); }
  });
});
