// @vitest-environment node
/**
 * The product's own reading path against the fixture BFF.
 *
 * The REAL http client (`createHttpApi`) and the REAL readers, with `fetch` pointed at a fixture
 * server booted in this process at the standalone scale. A screen sees exactly this: a request goes
 * over HTTP, the body goes through the V2 and V1 readers, and the result is either a value or a
 * typed refusal. Every call below must be a value; a refusal means the fixture body is not one the
 * product reads.
 */
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createHttpApi } from "../execution/api/httpApi";
import type { ExecutionApi, Result } from "../execution/api/ports";
import type { DeliveryPolicy } from "../execution/profile";
import { readAccessEffective } from "../execution/v2/readers/accessEffective";
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

let origin = "";
let server: import("node:http").Server;
let api: ExecutionApi;
const realFetch = globalThis.fetch;

beforeAll(async () => {
  server = createFixtureServer(loadConfig({ PORT: "0", FIXTURE_HOST: "127.0.0.1", FIXTURE_SCALE: "medium" }));
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  // The client asks for same-origin paths; the browser would resolve them against the page, so do the same.
  vi.stubGlobal("fetch", (input: string | URL | Request, init?: RequestInit) =>
    realFetch(typeof input === "string" && input.startsWith("/") ? `${origin}${input}` : input, init));
  api = createHttpApi({ policy: OPEN, readScope: {} });
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

const ENV = "live" as const;

describe("the product reads the fixture BFF", () => {
  it("Alpha Fleet: 40 alphas over keyset pages, V2 reader accepts every page", async () => {
    const first = await value(api.getAlphaFleet({ limit: 50 }));
    expect(first.page.rows).toHaveLength(40);
    expect(first.summary?.alphaCount).toBe(40);
    const paged = await value(api.getAlphaFleet({ limit: 15 }));
    expect(paged.page.rows).toHaveLength(15);
    expect(paged.page.nextCursor).not.toBeNull();
    const second = await value(api.getAlphaFleet({ limit: 15, after: paged.page.nextCursor! }));
    expect(second.page.rows[0]!.alphaId).not.toBe(paged.page.rows[0]!.alphaId);
    const filtered = await value(api.getAlphaFleet({ stage: "LIVE", health: "ATTENTION" }));
    expect(filtered.page.rows.length).toBeGreaterThan(0);
  });

  it("Portfolios, Portfolio 360 and Compare inputs", async () => {
    const list = await value(api.listPortfolios());
    expect(list.items).toHaveLength(25);
    expect(list.truncated).toBe(false);
    for (const id of ["pf_TEST_ONLY_core", "pf_TEST_ONLY_yen", "pf_scale_001", "pf_scale_012"]) {
      await value(api.getPortfolio360Resource(id));
    }
    const live = list.items.find((item) => item.portfolioId.startsWith("pf_scale_") && item.environments.includes(ENV));
    if (live) await value(api.getPortfolioCapital(live.portfolioId, ENV));
    await value(api.getFinancialChart({ environment: ENV, subjectKind: "portfolio", subjectId: "pf_TEST_ONLY_core" }));
  });

  it("Accounts and Account 360", async () => {
    const bindings = await value(api.getBindings({ environment: "live", limit: 50 }));
    expect(bindings.page.totalCount).toBe(50);
    const generated = bindings.page.rows.find((item) => item.accountId.startsWith("acc_scale_"))!;
    await value(api.getBindingDetail(generated.bindingId, "live"));
    await value(api.getAccount360Resource(generated.accountId));
    await value(api.getAccount360Resource("acc_bnc_core"));
    await value(api.getBindingResource("bnc_main@BINANCE"));
    await value(api.getAccountBroker360("acc_bnc_core"));
    await value(api.getSubjectActivity({ environment: "live", subjectKind: "account", subjectId: "acc_bnc_core", relation: "orders" }));
  });

  it("Alpha 360", async () => {
    for (const id of ["alpha_btc_trend", "alpha_scale_001"]) await value(api.getAlpha360Resource(id));
    await value(api.getStageDrift("av_2041"));
    await value(api.getAlphaActivity("alpha_btc_trend", "paper"));
    await value(api.getObservedTimeline({ environment: "paper", subjectKind: "alpha", subjectId: "alpha_btc_trend" }));
    await value(api.getFinancialChart({ environment: "paper", subjectKind: "alpha", subjectId: "alpha_btc_trend" }));
    await value(api.getEquitySparklines("paper"));
    await value(api.getManagerRelationPage({ routeId: "orders", environment: "paper" }));
  });

  it("Operations queue (V2 reader) and Incident root", async () => {
    const queue = await value(api.listOperationalQueueV2({}));
    expect(queue.kind).toBe("queue");
    if (queue.kind === "queue") expect(queue.queue.page.rows.length).toBeGreaterThan(0);
    const incident = await value(api.getIncidentRootV2("inc_fixture_44"));
    expect(incident.kind).toBe("incident");
  });

  it("Blotter: exact page, filters and the bracket legs", async () => {
    const page = await value(api.getBlotterProfile({ limit: 50 }));
    expect(page.state).toBe("ready");
    await value(api.getBlotterProfile({ limit: 25, status_bucket: "REJECTED", venue: "BINANCE" }));
    await value(api.getScreenProfile("blotter"));
    await value(api.getConditionalGroup("grp_00300", "paper"));
  });

  it("Overview, Command Center and Admin actions", async () => {
    for (const screen of ["paper", "sandbox", "live"] as const) await value(api.getScreenProfile(screen));
    await value(api.getCommandCenterSnapshot());
    for (const name of ["command-center", "operations", "waivers", "admin-action-drawer"] as const) await value(api.getOperationalComposition(name));
    await value(api.getOperatorTasks());
    await value(api.getActivationCapabilities());
    await value(api.getSourceHealthRead());
    await value(api.getSourceHealth("paper"));
    await value(api.getMirrorIntegrity("paper"));
  });

  it("Cockpit: inbox, reviews and history", async () => {
    const inbox = await value(api.listApprovals({ filter: "ALL", limit: 50 }));
    expect(inbox.page.rows.length).toBe(30);
    await value(api.getGateR1("AP-201"));
    await value(api.getGateR2("AP-352"));
    await value(api.getLiveReview("AP-311"));
    await value(api.getApprovalHistory());
    await value(api.getWaivers({ state: "OPEN" }));
  });

  it("the platform reads", async () => {
    await value(api.getRuntimeManifest());
    await value(api.getScreenContracts());
  });

  it("a command plan is a typed BLOCKED answer, not an error and not a success", async () => {
    const plan = await api.planCommand({
      workspaceId: "workspace_execution_manager", requestKey: "req_1", commandKey: "account/sync", environment: "PAPER",
      target: { type: "ACCOUNT", id: "acc_bnc_core" }, expectedTargetVersion: 1, payload: {},
    });
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      // The client reads the canonical BLOCKED body as blocked, and as nothing sent to a source.
      expect(plan.value.status).toBe("BLOCKED");
      expect(plan.value.sourceSideEffectRequested).toBe(false);
    }
  });

  it("the Access screen's reader accepts every state the access double serves", async () => {
    const states: Record<string, string> = {
      ws_TEST_ONLY: "POLICY_PENDING",
      ws_TEST_GRANTS: "AVAILABLE",
      ws_TEST_EMPTY: "AVAILABLE",
    };
    for (const [workspace, availability] of Object.entries(states)) {
      const response = await realFetch(`${origin}/api/admin/profile-access/v2/effective?workspace_id=${workspace}`);
      expect(response.status).toBe(200);
      const read = readAccessEffective(await response.json());
      expect(read?.kind, workspace).toBe("effective");
      if (read?.kind === "effective") expect(read.effective.availability).toBe(availability);
    }
    // The refusals are the server's typed problems, not a body.
    expect((await realFetch(`${origin}/api/admin/profile-access/v2/effective?workspace_id=ws_TEST_DENIED`)).status).toBe(403);
    expect((await realFetch(`${origin}/api/admin/profile-access/v2/effective`)).status).toBe(400);
  });

  it("the session capabilities open the V2 screens", async () => {
    const response = await realFetch(`${origin}/api/admin/access/self`);
    const body = (await response.json()) as { capabilities: string[]; user_id: string };
    expect(body.capabilities).toEqual(expect.arrayContaining(["execution.portfolios.read", "execution.accounts.read", "execution.operations.read", "portal.execution.blotter.read"]));
    expect(body.user_id).toBe("principal-visual-baseline");
  });
});
