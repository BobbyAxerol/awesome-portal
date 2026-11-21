// @vitest-environment node
/**
 * The S3 stage doubles (`e2e/bffDoubleStage.ts`) through the product's own reading path.
 *
 * The REAL http client and the REAL readers (the version dispatch of Sandbox, Canary and Live, the Paper profile
 * reader, the capture and approval readers, the Run Library reader), with `fetch` pointed at a fixture server booted
 * in this process. Every call must come back as a value of the kind the double promises; a refusal or an
 * `unsupported` would mean the double hands the screens a body they do not read. Then the legacy ids are held to the
 * answers they had before the stage doubles existed, which is what keeps the recorded golden and the V1 journeys.
 */
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { answerExecutionBff } from "../../e2e/bffDouble";
import { liveCursor, paperOrders, STAGE_V2_WORKSPACE } from "../../e2e/bffDoubleStage";
import { createHttpApi } from "../execution/api/httpApi";
import type { ExecutionApi, Result } from "../execution/api/ports";
import type { DeliveryPolicy } from "../execution/profile";
import { readRunOptions } from "../execution/runSuggestions";
import { buildWorkbench } from "../execution/v2/screens/workbench/model";
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
  server = createFixtureServer(loadConfig({ PORT: "0", FIXTURE_HOST: "127.0.0.1", FIXTURE_SCALE: "small" }));
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
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
async function refusal<T>(call: Promise<Result<T>>): Promise<{ status: string; reason: string }> {
  const result = await call;
  if (result.ok) throw new Error("expected a refusal, got a value");
  return result;
}

const PAPER = "dep_paper_01";

describe("Paper workbench", () => {
  it("reads as a populated profile with one UNKNOWN order, 200 equity snapshots and a partial quality", async () => {
    const envelope = await value(api.getPaperWorkbenchProfile(PAPER, "paper"));
    const quality = await value(api.getDeploymentQuality(PAPER, "paper"));
    const model = buildWorkbench(envelope, quality);
    expect(model.deployment?.deploymentId).toBe(PAPER);
    expect(model.orders.rows).toHaveLength(paperOrders().length);
    expect(model.orders.rows.filter((row) => row.state.label === "Unknown")).toHaveLength(1);
    expect(model.orders.rows.some((row) => row.state.label === "Rejected")).toBe(true);
    expect(model.equity.points).toHaveLength(200);
    expect(model.equity.state.kind).toBe("ready");
    expect(model.equity.serverEnvelope).toMatchObject({ sourceCount: 1438, shownCount: 200 });
    expect(model.positions.table.rows.length).toBeGreaterThanOrEqual(3);
    expect(quality.state).toBe("PARTIAL");
    // The counts the quality read states are the rows the profile carries.
    expect(quality.data.orderPopulation).toBe(String(model.orders.rows.length));
    expect(quality.data.fillPopulation).toBe(String(model.fills.rows.length));
  });

  it("the VN market variant is the same rows on the VN body", async () => {
    const envelope = await value(api.getPaperWorkbenchProfile(PAPER, "vnm"));
    expect(buildWorkbench(envelope, null).orders.rows).toHaveLength(paperOrders().length);
  });
});

describe("Sandbox", () => {
  it("V1 by default: the rich body, one certification, a workflow version the note is bound to", async () => {
    const read = await value(api.getSandboxCertificationVersioned("dep_sandbox_01"));
    expect(read.kind).toBe("v1");
    if (read.kind !== "v1") return;
    expect(read.value.certificationId).toBe("scert_dep_sandbox_01");
    expect(read.value.steps.map((step) => step.evaluationState)).toEqual(["PASS", "PASS", "PASS", "FAIL", "PASS", "UNAVAILABLE", "UNAVAILABLE"]);
    expect(read.value.findings.rows).toHaveLength(2);
    expect(read.value.workflowVersion).toBe(1);
    expect(read.value.deploymentId).toBe("dep_sandbox_01");
  });

  it("V2 in the SCOPED_V2 workspace", async () => {
    const read = await value(api.getSandboxCertificationVersioned("dep_sandbox_01", { workspaceId: STAGE_V2_WORKSPACE }));
    expect(read.kind).toBe("v2");
  });

  it("a denied workspace is a denial, not an empty screen", async () => {
    expect((await refusal(api.getSandboxCertificationVersioned("dep_sandbox_01", { workspaceId: "ws_TEST_DENIED" }))).status).toBe("denied");
  });

  it("the note: success echoes workspace and certification, REPLAY replays, REFUSE and DENIED are typed", async () => {
    const note = (summary: string, key = "note-key") => ({
      workspace_id: "ws_TEST_ONLY",
      request_key: key,
      summary,
      certification_id: "scert_dep_sandbox_01",
      expected_workflow_version: 1,
    });
    const first = await value(api.captureSandboxNote(note("Reviewed the fee difference.")));
    expect(first).toMatchObject({ action: "SANDBOX_NOTE", replayed: false, workspace_id: "ws_TEST_ONLY", certification_id: "scert_dep_sandbox_01", deployment_id: "dep_sandbox_01", workflow_version: 1 });
    expect((await value(api.captureSandboxNote(note("REPLAY of the first note.")))).replayed).toBe(true);
    expect((await refusal(api.captureSandboxNote(note("REFUSE this note please.")))).reason).toContain("SANDBOX_NOTE_VERSION_CONFLICT");
    expect((await refusal(api.captureSandboxNote(note("DENIED for this session.")))).status).toBe("denied");
  });

  it("the capture capabilities: AVAILABLE by default, UNAVAILABLE in the note-off workspace, denied in the denied one", async () => {
    const open = await value(api.getReviewCaptureCapabilities("ws_TEST_ONLY"));
    expect(open.actions.find((a) => a.id === "SANDBOX_NOTE")?.state).toBe("AVAILABLE");
    const off = await value(api.getReviewCaptureCapabilities("ws_TEST_NOTE_OFF"));
    expect(off.actions.find((a) => a.id === "SANDBOX_NOTE")).toMatchObject({ state: "UNAVAILABLE", reason_code: "SANDBOX_NOTE_NOT_OPEN_FOR_THIS_ACTOR" });
    expect((await refusal(api.getReviewCaptureCapabilities("ws_TEST_DENIED"))).status).toBe("denied");
  });
});

describe("Canary", () => {
  it("V1 is the published dark body; V2 is the following-parent body", async () => {
    const dark = await value(api.getCanaryVersioned("dep_canary_01"));
    expect(dark.kind).toBe("v1");
    if (dark.kind === "v1") expect(dark.value.deploymentId).toBe("dep_canary_01");
    expect((await value(api.getCanaryVersioned("dep_canary_01", { workspaceId: STAGE_V2_WORKSPACE }))).kind).toBe("v2");
  });
});

describe("Live", () => {
  it("V1 is the published dark body", async () => {
    expect((await value(api.getLiveFullVersioned("dep_live_01"))).kind).toBe("v1");
  });

  it("V2 pages orders and fills in three keyset pages; the continuation is the server's and an expired one restarts", async () => {
    const first = await value(api.getLiveFullVersioned("dep_live_01", { workspaceId: STAGE_V2_WORKSPACE }));
    expect(first.kind).toBe("v2");
    if (first.kind !== "v2") return;
    const orders = first.value.panels.orders;
    expect(orders.records).toHaveLength(20);
    expect(orders.hasMore).toBe(true);
    expect(orders.nextCursor).toBe(liveCursor("orders", 1));
    const second = await value(api.getLiveFullVersioned("dep_live_01", { workspaceId: STAGE_V2_WORKSPACE, panel: "orders", cursor: orders.nextCursor! }));
    if (second.kind !== "v2") throw new Error("page 2 is not V2");
    expect(second.value.panels.orders.nextCursor).toBe(liveCursor("orders", 2));
    const third = await value(api.getLiveFullVersioned("dep_live_01", { workspaceId: STAGE_V2_WORKSPACE, panel: "orders", cursor: second.value.panels.orders.nextCursor! }));
    if (third.kind !== "v2") throw new Error("page 3 is not V2");
    expect(third.value.panels.orders.hasMore).toBe(false);
    expect(third.value.panels.orders.nextCursor).toBeNull();
    // 60 distinct rows over the three pages: ids never repeat.
    const ids = [first, second, third].flatMap((page) => (page.kind === "v2" ? page.value.panels.orders.records.map((r) => r.observationId) : []));
    expect(new Set(ids).size).toBe(60);
    // A cursor past the last page, or another panel's, is the 409 the screen restarts from.
    const stale = await refusal(api.getLiveFullVersioned("dep_live_01", { workspaceId: STAGE_V2_WORKSPACE, panel: "orders", cursor: liveCursor("orders", 3) }));
    expect(stale.reason).toContain("LIVE_SOURCE_CURSOR_EXPIRED");
    expect((await refusal(api.getLiveFullVersioned("dep_live_01", { workspaceId: STAGE_V2_WORKSPACE, panel: "orders", cursor: liveCursor("fills", 1) }))).reason).toContain("LIVE_SOURCE_CURSOR_EXPIRED");
  });
});

describe("New request", () => {
  const request = (summary: string, key = "req-key") => ({ requestKey: key, alphaId: "alpha_btc_trend", evidenceRunId: "run_btc_trend_a1", methodologyClaimId: "claim_btc_oos", summary });

  it("created, replayed, duplicate and the typed refusals are different outcomes", async () => {
    const created = await api.createApprovalRequest(request("Momentum with a venue calendar."));
    expect(created).toMatchObject({ kind: "created", subjectLabel: "alpha_btc_trend", quorumRequired: 2 });
    // The approval id follows the request key: the same key names the same approval.
    expect(await api.createApprovalRequest(request("Momentum with a venue calendar."))).toEqual(created);
    expect(await api.createApprovalRequest(request("REPLAY of an earlier submit."))).toMatchObject({ kind: "replayed" });
    expect(await api.createApprovalRequest(request("DUPLICATE of the open request."))).toMatchObject({ kind: "duplicate", existingApprovalId: "AP-201" });
    expect(await api.createApprovalRequest(request("REFUSE this request please."))).toMatchObject({ kind: "failed", reason: expect.stringContaining("CLAIM_NOT_ELIGIBLE") });
    expect(await api.createApprovalRequest(request("DENIED for this session."))).toMatchObject({ kind: "failed", status: "denied" });
  });

  it("the Run Library list: COMPLETED runs for three alphas, nothing for a failed or running one", async () => {
    const response = await fetch("/api/v1/quantbt/runs?limit=50");
    expect(response.status).toBe(200);
    const options = readRunOptions(await response.json());
    expect(new Set(options.map((o) => o.alphaId))).toEqual(new Set(["alpha_btc_trend", "alpha_eth_mom", "alpha_sol_break"]));
    expect(options.map((o) => o.runId)).not.toContain("run_sol_break_c0");
    expect(options.map((o) => o.runId)).not.toContain("run_doge_d1");
    // The three claim states the picker tells apart: listed, none listed, not publishable.
    const claims = (id: string) => options.find((o) => o.runId === id)?.claims;
    expect(claims("run_btc_trend_a1")).toHaveLength(1);
    expect(claims("run_btc_trend_a2")).toHaveLength(2);
    expect(claims("run_eth_mom_b2")).toEqual([]);
    expect(claims("run_sol_break_c1")).toBeNull();
  });
});

describe("what did not change", () => {
  const STAGE_PATHS: [string, string][] = [
    ["GET", "/screens/paper/dep_94"],
    ["GET", "/screens/paper/dep_vnm/vn-market"],
    ["GET", "/derivations/deployments/dep_a/execution-quality?environment=paper"],
    ["GET", "/deployments/dep_1/certification"],
    ["GET", "/deployments/dep_1/canary"],
    ["GET", "/deployments/dep_1/live"],
    ["GET", "/deployments/dep_1/live?workspace_id=ws_TEST_SCOPED_V2"],
    ["GET", "/governance/review-capture-capabilities?workspace_id=workspace_execution_manager"],
    ["POST", "/governance/approvals"],
    ["POST", "/governance/sandbox/capture-note"],
  ];
  const run = (screensV2: boolean, method: string, path: string, body?: unknown) => {
    const url = new URL(path, "http://portal.test");
    return JSON.stringify(answerExecutionBff(method, `/api/v1/execution${url.pathname}`, url.searchParams, { operationsV2: true, screensV2 }, body));
  };

  it("the legacy ids and a write with no body answer the same whether or not the stage doubles are on", () => {
    // `screensV2: false` never asks the stage doubles: it is the reference for what these requests answered before them.
    for (const [method, path] of STAGE_PATHS) expect(run(true, method, path), `${method} ${path}`).toBe(run(false, method, path));
  });

  it("a write with a body that is not a request (the stub passes none) keeps the canned answer", () => {
    expect(run(true, "POST", "/governance/approvals", {})).toBe(run(false, "POST", "/governance/approvals", {}));
    expect(run(true, "POST", "/governance/approvals", { summary: 7 })).toBe(run(false, "POST", "/governance/approvals", { summary: 7 }));
  });
});

describe("include (BE-P12): the opt-in members come from the canonical fixtures, only when asked", () => {
  const V2 = `workspace_id=${STAGE_V2_WORKSPACE}`;
  const answer = (route: string, deployment: string, query: string, screensV2 = true) =>
    answerExecutionBff("GET", `/api/v1/execution/deployments/${deployment}/${route}`, new URLSearchParams(query), { operationsV2: true, screensV2 }, undefined);
  const without = (body: unknown, ...keys: string[]) => {
    const copy = { ...(body as Record<string, unknown>) };
    for (const key of keys) delete copy[key];
    return copy;
  };

  it("a V2 read that does not ask is the body it was: no identity, no stage_facts", () => {
    for (const [route, id] of [["certification", "dep_sandbox_01"], ["canary", "dep_canary_01"], ["live", "dep_live_01"]] as const) {
      const body = answer(route, id, V2)!.body as Record<string, unknown>;
      expect(Object.keys(body), route).not.toContain("identity");
      expect(Object.keys(body), route).not.toContain("stage_facts");
    }
  });

  it("asking adds only the member(s) asked and changes nothing else", () => {
    for (const [route, id, asked] of [["certification", "dep_sandbox_01", "identity"], ["canary", "dep_canary_01", "identity"], ["live", "dep_live_01", "identity,stage_facts"]] as const) {
      const plain = answer(route, id, V2)!;
      const rich = answer(route, id, `${V2}&include=${asked}`)!;
      expect(rich.status).toBe(200);
      expect(without(rich.body, "identity", "stage_facts"), route).toEqual(plain.body);
      expect(Object.keys(rich.body as object).filter((k) => k === "identity" || k === "stage_facts"), route).toEqual(asked.split(","));
    }
    const identityOnly = answer("live", "dep_live_01", `${V2}&include=identity`)!.body as Record<string, unknown>;
    expect(Object.keys(identityOnly)).toContain("identity");
    expect(Object.keys(identityOnly)).not.toContain("stage_facts");
  });

  it("a repeated, empty, unknown or unpublished token is refused as the server refuses it, on the V2 body only", () => {
    for (const bad of ["include=identity,identity", "include=", "include=nope", "include=identity,", "include=identity&include=stage_facts"]) {
      expect(answer("live", "dep_live_01", `${V2}&${bad}`), bad).toMatchObject({ status: 400, body: { error: { code: "EXECUTION_READ_QUERY_INVALID" } } });
    }
    // stage_facts is a Live member: Sandbox and Canary do not publish it.
    expect(answer("certification", "dep_sandbox_01", `${V2}&include=stage_facts`)).toMatchObject({ status: 400 });
    expect(answer("canary", "dep_canary_01", `${V2}&include=identity,stage_facts`)).toMatchObject({ status: 400 });
    // The legacy body ignores the parameter: V1 answers are byte-identical with or without it.
    for (const [route, id] of [["certification", "dep_sandbox_01"], ["canary", "dep_canary_01"], ["live", "dep_live_01"], ["live", "dep_1"]] as const) {
      expect(JSON.stringify(answer(route, id, "include=identity,stage_facts")), route).toBe(JSON.stringify(answer(route, id, "")));
    }
  });

  // F2 D1/D5: the identity member keeps the published SHAPE (the schema closes the alpha name: null with ALPHA_NAME_NOT_PUBLISHED) but its alpha id
  // and portfolio name are the deployment's own from the world, not the canonical file's placeholders (`alpha_TEST_ONLY_identity`,
  // "TEST_ONLY portfolio name"), which the unit suites still read from the file.
  it("through the product's own client and readers: the members read as typed values", async () => {
    const sandbox = await value(api.getSandboxCertificationVersioned("dep_sandbox_01", { workspaceId: STAGE_V2_WORKSPACE, include: ["identity"] }));
    expect(sandbox.kind === "v2" && sandbox.value.identity).toMatchObject({ alphaId: "alpha_a", portfolioName: "Core" });
    const canary = await value(api.getCanaryVersioned("dep_canary_01", { workspaceId: STAGE_V2_WORKSPACE, include: ["identity"] }));
    expect(canary.kind === "v2" && canary.value.identity).toMatchObject({ alphaId: "alpha_b", portfolioName: "Core" });
    const live = await value(api.getLiveFullVersioned("dep_live_01", { workspaceId: STAGE_V2_WORKSPACE, include: ["identity", "stage_facts"] }));
    if (live.kind !== "v2") throw new Error("not V2");
    expect(live.value.identity).toMatchObject({ alphaId: "alpha_a" });
    expect(live.value.stageFacts!.reconciliation.verdict).toEqual({ availability: "AVAILABLE", value: "OPEN_FINDINGS" });
    expect(live.value.stageFacts!.reconciliation.openFindingCount.availability).toBe("NOT_PUBLISHED");
    // Not asked: the same read has neither.
    const plain = await value(api.getLiveFullVersioned("dep_live_01", { workspaceId: STAGE_V2_WORKSPACE }));
    expect(plain.kind === "v2" && [plain.value.identity, plain.value.stageFacts]).toEqual([null, null]);
  });
});
