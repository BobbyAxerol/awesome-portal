// @vitest-environment node
/**
 * The reads the V2 screens added after the doubles were written, served from the canonical fixtures (lane BFF_DOUBLE /
 * FIXTURE_LAB; a fixture is never a source acceptance):
 *
 *   manager/series (7 fixtures), manager/fleet, governance/stage-action-eligibility, governance/approvals/request-lookup,
 *   pending-recalls, and the four advisory self reads (self-navigation, eligibility, eligibility/batch, self-context).
 *
 * Every answer is judged by the REAL http client and its answers-this-question guard (a body that answers another question
 * is `unavailable`), by the published schema where the route table names one (`server.test.ts` does that for the HTTP server), and
 * the opt-in rule is pinned: without `screensV2` every new route is still the V1 stubs' 501 gap, and the pure answerer says
 * "not mine" (so the recorded golden, which has none of these routes, is untouched by construction).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { answerFixtureRequest, V2_OPTIONS } from "../../e2e/bffAnswerer";
import { answerExecutionBff } from "../../e2e/bffDouble";
import { SELF_ACCESS_DOUBLE_WORKSPACES as WS, setSelfContextCase, SELF_CONTEXT_CASES } from "../../e2e/bffDoubleSelfAccess";
import { SERIES_DOUBLE_WORKSPACES as SERIES_WS, seriesFixtureFor } from "../../e2e/bffDoubleManager";
import { createHttpApi } from "../execution/api/httpApi";
import type { ExecutionApi } from "../execution/api/ports";
import type { DeliveryPolicy } from "../execution/profile";
import { readAccessEligibility, readAccessSelfNavigation } from "../execution/v2/readers/accessSelf";
import { readAccessEligibilityBatch } from "../execution/v2/readers/accessSelfBatch";
import { seriesBodyFor } from "../execution/v2/screens/series/seriesDouble.testbase";
import { FIXTURE_POPULATED } from "../execution/v2/readers/managerSeries.testbase";

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

const seen: string[] = [];
function serve(options = V2_OPTIONS): ExecutionApi {
  vi.stubGlobal("fetch", async (input: string) => {
    const url = new URL(String(input), "http://portal.test");
    seen.push(`${url.pathname}${url.search}`);
    const answered = answerFixtureRequest({ method: "GET", path: url.pathname, search: url.search, headers: {}, body: null }, options);
    if (answered === null) return new Response(JSON.stringify({ error: { code: "bff_double_gap" } }), { status: 501, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify(answered.body), { status: answered.status, headers: { "content-type": "application/json" } });
  });
  return createHttpApi({ policy: OPEN, readScope: {} });
}

afterEach(() => {
  vi.unstubAllGlobals();
  seen.length = 0;
  setSelfContextCase(SELF_CONTEXT_CASES[0]);
});

const PORTFOLIOS = [{ subjectType: "PORTFOLIO", subjectId: "pf_a" }, { subjectType: "PORTFOLIO", subjectId: "pf_b" }] as const;

/* ── manager/series ─────────────────────────────────────────────────────── */

describe("manager/series answers the question asked, from the seven canonical fixtures", () => {
  const cases: [string, "NAV" | "RETURN", string | undefined, string, string | null][] = [
    ["populated", "NAV", undefined, "ALIGNED", null],
    ["empty", "NAV", SERIES_WS.empty, "UNAVAILABLE", "SUBJECT_SERIES_UNAVAILABLE"],
    ["unavailable", "NAV", SERIES_WS.unavailable, "UNAVAILABLE", "SUBJECT_SERIES_UNAVAILABLE"],
    ["currency-mixed", "NAV", SERIES_WS.currencyMixed, "INCOMPARABLE", "CURRENCY_MIXED"],
    ["return", "RETURN", undefined, "ALIGNED", null],
    ["return-scale-mixed", "RETURN", SERIES_WS.returnScaleMixed, "INCOMPARABLE", "RATIO_SCALE_MIXED"],
    ["return-scale-not-published", "RETURN", SERIES_WS.returnScaleNotPublished, "UNAVAILABLE", "SUBJECT_SERIES_UNAVAILABLE"],
  ];
  it.each(cases)("%s", async (_name, metric, workspaceId, state, reason) => {
    const api = serve();
    const result = await api.getManagerSeries({ environment: "live", metric, window: "90D", subjects: PORTFOLIOS, ...(workspaceId ? { workspaceId } : {}) });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.value.series.map((entry) => entry.subject)).toEqual(PORTFOLIOS.map((s) => ({ subjectType: "PORTFOLIO", subjectId: s.subjectId })));
    expect(result.value.environment).toBe("live");
    expect(result.value.metric).toBe(metric);
    expect(result.value.selectedWindow.requested).toBe("90D");
    // The comparison is the contract's own verdict on the entries; for one-subject fixtures asked for two it is rebuilt from the entries.
    if (state === "ALIGNED" || state === "INCOMPARABLE") expect(result.value.comparison.state).toBe(state);
    if (reason !== null && state === "INCOMPARABLE") expect((result.value.comparison as { reasonCode: string }).reasonCode).toBe(reason);
  });

  it("selects exactly the seven published fixtures", () => {
    const picked = new Set<string>();
    for (const [, metric, ws] of cases) picked.add(seriesFixtureFor(metric, ws ?? null));
    expect([...picked].sort()).toEqual(["currencyMixed", "empty", "populated", "return", "returnScaleMixed", "returnScaleNotPublished", "unavailable"]);
  });

  it("a FUND subject carries the workspace's own id, a pinned workspace is echoed", async () => {
    const api = serve();
    const fund = await api.getManagerSeries({ environment: "paper", metric: "NAV", window: "30D", subjects: [{ subjectType: "FUND" }], workspaceId: "ws_asked" });
    expect(fund.ok && fund.value.workspaceId).toBe("ws_asked");
    expect(fund.ok && fund.value.series[0]!.subject).toEqual({ subjectType: "FUND", subjectId: "ws_asked" });
  });

  it("every window form is echoed as asked; ALL is a typed gap whatever the source holds", async () => {
    const api = serve();
    for (const window of ["7D", "30D", "90D"] as const) {
      const r = await api.getManagerSeries({ environment: "paper", metric: "NAV", window, subjects: PORTFOLIOS });
      expect(r.ok && r.value.selectedWindow.requested).toBe(window);
    }
    const explicit = await api.getManagerSeries({ environment: "paper", metric: "NAV", window: { fromMs: 1797408000000, toMs: 1800000000000 }, subjects: PORTFOLIOS });
    expect(explicit.ok).toBe(true);
    const all = await api.getManagerSeries({ environment: "paper", metric: "NAV", window: "ALL", subjects: PORTFOLIOS });
    expect(all.ok && all.value.series.every((entry) => entry.state === "UNAVAILABLE")).toBe(true);
    expect(all.ok && all.value.selectedWindow.reasonCode).toBe("ALL_HISTORY_WINDOW_NOT_PUBLISHED");
  });

  it("NET_PNL has no canonical fixture: every subject is the typed UNAVAILABLE entry, never a relabelled NAV", async () => {
    const api = serve();
    const r = await api.getManagerSeries({ environment: "paper", metric: "NET_PNL", window: "30D", subjects: PORTFOLIOS });
    expect(r.ok && r.value.series.map((entry) => entry.state)).toEqual(["UNAVAILABLE", "UNAVAILABLE"]);
  });

  it("a pinned partition that is not the fixture's makes that entry the typed UNAVAILABLE entry", async () => {
    const api = serve();
    const published = { economicDomain: "PAPER", currency: "USDT", basis: "TEST_ONLY:nav-ledger", nativeProfileRef: "TEST_ONLY:paper-ledger", domainProofRef: "TEST_ONLY:domain-proof" } as const;
    const same = await api.getManagerSeries({ environment: "paper", metric: "NAV", window: "30D", subjects: PORTFOLIOS, economicPartition: published });
    expect(same.ok && same.value.series.map((entry) => entry.state)).toEqual(["AVAILABLE", "AVAILABLE"]);
    const other = await api.getManagerSeries({ environment: "paper", metric: "NAV", window: "30D", subjects: PORTFOLIOS, economicPartition: { ...published, currency: "VND" } });
    expect(other.ok && other.value.series.map((entry) => entry.state)).toEqual(["UNAVAILABLE", "UNAVAILABLE"]);
  });

  it("is the same body the unit-lane double builds for the same question (NAV, populated)", () => {
    const params = new URLSearchParams({ environment: "live", metric: "NAV", subjects: JSON.stringify([{ subject_type: "PORTFOLIO", subject_id: "pf_a" }, { subject_type: "PORTFOLIO", subject_id: "pf_b" }]), window: JSON.stringify("90D") });
    const mine = answerExecutionBff("GET", "/api/v1/execution/manager/series", params, { screensV2: true });
    expect(mine.status).toBe(200);
    expect(mine.body).toEqual(seriesBodyFor(params, "populated"));
    expect(FIXTURE_POPULATED).toContain("populated");
  });

  it("refuses what the server refuses with a 400, and answers nothing for another method", () => {
    const get = (query: string) => answerExecutionBff("GET", "/api/v1/execution/manager/series", new URLSearchParams(query), { screensV2: true });
    const good = { environment: "paper", metric: "NAV", subjects: JSON.stringify([{ subject_type: "FUND" }]), window: JSON.stringify("30D") };
    expect(get(new URLSearchParams(good).toString()).status).toBe(200);
    for (const bad of [
      { ...good, environment: "staging" }, { ...good, metric: "SHARPE" }, { ...good, subjects: "[]" }, { ...good, subjects: "nope" },
      { ...good, subjects: JSON.stringify([{ subject_type: "FUND" }, { subject_type: "FUND" }]) },
      { ...good, subjects: JSON.stringify([{ subject_type: "FUND", subject_id: "x" }]) },
      { ...good, subjects: JSON.stringify([1, 2, 3, 4, 5].map((n) => ({ subject_type: "PORTFOLIO", subject_id: `p${n}` }))) },
      { ...good, window: JSON.stringify("1D") }, { ...good, window: JSON.stringify({ from_ms: 5, to_ms: 1 }) },
      { ...good, economic_partition: JSON.stringify({ currency: "USDT" }) }, { ...good, extra: "1" },
    ]) expect(get(new URLSearchParams(bad).toString()).status, JSON.stringify(bad)).toBe(400);
    expect(answerExecutionBff("POST", "/api/v1/execution/manager/series", new URLSearchParams(good), { screensV2: true }).status).toBe(501);
  });
});

/* ── manager/fleet ──────────────────────────────────────────────────────── */

describe("manager/fleet applies the query it is asked", () => {
  it("serves the three environments from the three canonical fixtures", async () => {
    const api = serve();
    const paper = await api.getManagerDataset({ surface: "FLEET", environment: "paper" });
    const live = await api.getManagerDataset({ surface: "FLEET", environment: "live" });
    const sandbox = await api.getManagerDataset({ surface: "FLEET", environment: "sandbox", limit: 1 });
    expect(paper.ok && paper.value.items.map((row) => row.alphaId)).toEqual(["TEST_ONLY:alpha", "TEST_ONLY:alpha-b"]);
    expect(live.ok && live.value.items.map((row) => row.stagePresence)).toEqual([["CANARY", "LIVE"], ["LIVE"]]); // alpha_id order (alpha-canary-and-live, alpha-single-live)
    expect(sandbox.ok && sandbox.value.items).toEqual([]);
  });

  it("applies q, stage_filter, text filters, text sort, group_by and the page size; the guard accepts each", async () => {
    const api = serve();
    const q = await api.getManagerDataset({ surface: "FLEET", environment: "paper", q: "two", qMode: "CONTAINS" });
    expect(q.ok && q.value.items.map((row) => row.alphaId)).toEqual(["TEST_ONLY:alpha-b"]);
    const stage = await api.getManagerDataset({ surface: "FLEET", environment: "live", stageFilter: ["CANARY"] });
    expect(stage.ok && stage.value.items.map((row) => [row.alphaId, row.stagePresence, row.children.map((c) => c.stage)])).toEqual([["TEST_ONLY:alpha-canary-and-live", ["CANARY"], ["CANARY"]]]);
    const filtered = await api.getManagerDataset({ surface: "FLEET", environment: "live", filters: [{ field: "alpha_id", op: "IN", values: ["TEST_ONLY:alpha-single-live", "nope"] }] });
    expect(filtered.ok && filtered.value.page.authorizedFilteredCount).toBe(1);
    const sorted = await api.getManagerDataset({ surface: "FLEET", environment: "live", sort: [{ field: "current_stage", direction: "desc" }] });
    expect(sorted.ok && sorted.value.items.map((row) => row.currentStage)).toEqual(["LIVE", null]);
    const grouped = await api.getManagerDataset({ surface: "FLEET", environment: "live", groupBy: ["current_stage"] });
    expect(grouped.ok && grouped.value.groups.map((g) => g.uniqueRowCount)).toEqual([1, 1]);
    const ungrouped = await api.getManagerDataset({ surface: "FLEET", environment: "paper" });
    expect(ungrouped.ok && ungrouped.value.groups).toEqual([]);
    const limited = await api.getManagerDataset({ surface: "FLEET", environment: "paper", limit: 1 });
    expect(limited.ok && limited.value.page.limit).toBe(1);
  });

  it("pages by an opaque keyset cursor bound to the query", async () => {
    const api = serve();
    const first = await api.getManagerDataset({ surface: "FLEET", environment: "paper", limit: 1 });
    expect(first.ok && first.value.page.nextCursor).not.toBeNull();
    if (!first.ok || first.value.page.nextCursor === null) return;
    const next = await api.getManagerDataset({ surface: "FLEET", environment: "paper", limit: 1, after: first.value.page.nextCursor });
    expect(next.ok && next.value.items.map((row) => row.alphaId)).toEqual(["TEST_ONLY:alpha-b"]);
    expect(next.ok && next.value.page.nextCursor).toBeNull();
    // The cursor belongs to its query: asked with another filter it is a 409, which the port reports as unavailable.
    const changed = await api.getManagerDataset({ surface: "FLEET", environment: "paper", limit: 1, q: "x", qMode: "PREFIX", after: first.value.page.nextCursor });
    expect(changed.ok).toBe(false);
  });

  it("never answers a body that ignores what it cannot apply: window, partition, lifecycle, numeric fields are a typed 400", async () => {
    const api = serve();
    for (const query of [
      { window: "30D" as const }, { lifecycleFilter: "ACTIVE" },
      { sort: [{ field: "net_pnl" as const, direction: "asc" as const }] },
      { filters: [{ field: "net_pnl" as const, op: "GTE" as const, value: "1" }] },
    ]) {
      const result = await api.getManagerDataset({ surface: "FLEET", environment: "paper", ...query });
      expect(result.ok, JSON.stringify(query)).toBe(false);
    }
    const raw = answerExecutionBff("GET", "/api/v1/execution/manager/fleet", new URLSearchParams({ environment: "paper", window: JSON.stringify("30D") }), { screensV2: true });
    expect(raw).toMatchObject({ status: 400, body: { error: { code: "MANAGER_QUERY_NOT_SUPPORTED_BY_DOUBLE" } } });
  });

  it("the other five dataset routes are not served", () => {
    for (const path of ["fund-overview", "portfolios/pf_a/overview", "alphas/a/overview", "accounts/x/overview", "deployments/d/overview"]) {
      expect(answerFixtureRequest({ method: "GET", path: `/api/v1/execution/manager/${path}`, search: "?environment=paper", headers: {}, body: null }, V2_OPTIONS)).toBeNull();
    }
  });
});

/* ── governance and pending control ────────────────────────────────────── */

describe("the advisory governance reads", () => {
  it("stage-action eligibility: the case by workspace, the workspace echoed, the refusals typed", async () => {
    const api = serve();
    const admin = await api.getStageActionEligibility();
    expect(admin.ok && admin.value.kind).toBe("stage_action_eligibility");
    const echoed = await api.getStageActionEligibility("ws_asked");
    expect(echoed.ok && echoed.value.kind === "stage_action_eligibility" && echoed.value.eligibility.workspaceId).toBe("ws_asked");
    const plain = await api.getStageActionEligibility("ws_TEST_PLAIN_USER");
    const row = (read: typeof admin) => (read.ok && read.value.kind === "stage_action_eligibility" ? read.value.eligibility.actions.find((a) => a.action === "sandbox.review_note") : undefined);
    // The case follows the workspace: an admin may write the note, a plain user is told the role is missing.
    expect(row(admin)?.eligible).toBe(true);
    expect(row(plain)).toMatchObject({ eligible: false, reasonClass: "ADMIN_ROLE_REQUIRED" });
    expect((await api.getStageActionEligibility("ws_TEST_DENIED")).ok).toBe(false);
    expect((await api.getStageActionEligibility("ws_TEST_UNAVAILABLE")).ok).toBe(false);
  });

  it("request-lookup: one stored request, no state; NONE / FOUND / MATCH / CONFLICT answer the question asked", async () => {
    const api = serve();
    const payload = { alphaId: "alpha_n29", evidenceRunId: "run_TEST_ONLY", methodologyClaimId: "claim_TEST_ONLY", summary: "Synthetic summary" };
    const states = async (query: Parameters<ExecutionApi["lookupApprovalRequest"]>[0]) => {
      const r = await api.lookupApprovalRequest(query);
      return r.ok && r.value.kind === "approval_request_lookup" ? [r.value.lookup.state, r.value.lookup.payloadCheck, r.value.lookup.requestKey, r.value.lookup.workspaceId] : r;
    };
    expect(await states({ requestKey: "req-NOT-STORED-1", workspaceId: "ws_a" })).toEqual(["NONE", "NOT_COMPARED", "req-NOT-STORED-1", "ws_a"]);
    expect(await states({ requestKey: "req-NOT-STORED-1", workspaceId: "ws_a", payload })).toEqual(["NONE", "NOT_COMPARED", "req-NOT-STORED-1", "ws_a"]);
    expect(await states({ requestKey: "req-TEST_ONLY-0001" })).toEqual(["FOUND", "NOT_COMPARED", "req-TEST_ONLY-0001", "ws_TEST_ONLY"]);
    expect(await states({ requestKey: "req-TEST_ONLY-0001", payload })).toEqual(["FOUND", "MATCH", "req-TEST_ONLY-0001", "ws_TEST_ONLY"]);
    expect(await states({ requestKey: "req-TEST_ONLY-0001", payload: { ...payload, alphaId: "alpha_other" } })).toEqual(["KEY_PAYLOAD_CONFLICT", "MISMATCH", "req-TEST_ONLY-0001", "ws_TEST_ONLY"]);
  });

  it("request-lookup refuses a partial payload, a bad key and an unknown parameter with a 400", () => {
    const ask = (query: string) => answerExecutionBff("GET", "/api/v1/execution/governance/approvals/request-lookup", new URLSearchParams(query), { screensV2: true }).status;
    expect(ask("request_key=req-1")).toBe(200);
    expect(ask("request_key=-bad")).toBe(400);
    expect(ask("request_key=req-1&alpha_id=a")).toBe(400);
    expect(ask("request_key=req-1&x=1")).toBe(400);
    expect(ask("")).toBe(400);
  });

  it("pending-recalls: the recalls the fixtures hold for exactly that resource, otherwise none, always naming the resource asked", async () => {
    const api = serve();
    const ask = async (kind: "PORTFOLIO" | "DEPLOYMENT", id: string, environment: "paper" | "live" = "paper") => {
      const r = await api.getPendingRecallDiscovery({ workspaceId: "ws_a", resourceKind: kind, resourceId: id, environment });
      return r.ok && r.value.kind === "pending_recall_discovery" ? r.value.discovery : r;
    };
    const open = await ask("PORTFOLIO", "TEST_ONLY:portfolio");
    expect("items" in open && open.items.map((i) => i.state)).toEqual(["WAITING_ENCUMBRANCE", "UNKNOWN"]);
    const deployment = await ask("DEPLOYMENT", "TEST_ONLY:deployment");
    expect("items" in deployment && deployment.items.map((i) => i.recipientAccountId)).toEqual(["TEST_ONLY:account"]);
    const other = await ask("PORTFOLIO", "pf_TEST_ONLY_core");
    expect("items" in other && [other.items.length, other.resource.id]).toEqual([0, "pf_TEST_ONLY_core"]);
    const elsewhere = await ask("PORTFOLIO", "TEST_ONLY:portfolio", "live");
    expect("items" in elsewhere && [elsewhere.items.length, elsewhere.environment]).toEqual([0, "live"]);
  });

  it("pending-recalls needs all four parameters", () => {
    const ask = (query: string) => answerExecutionBff("GET", "/api/v1/execution/pending-recalls", new URLSearchParams(query), { screensV2: true }).status;
    expect(ask("workspace_id=w&resource_kind=PORTFOLIO&resource_id=p&environment=paper")).toBe(200);
    expect(ask("workspace_id=w&resource_kind=ACCOUNT&resource_id=p&environment=paper")).toBe(400);
    expect(ask("resource_kind=PORTFOLIO&resource_id=p&environment=paper")).toBe(400);
    expect(ask("workspace_id=w&resource_kind=PORTFOLIO&resource_id=p&environment=paper&x=1")).toBe(400);
  });
});

/* ── the four self reads, through the pure answerer ──────────────────── */

describe("the advisory self reads", () => {
  const get = (path: string, query: string) => answerFixtureRequest({ method: "GET", path, search: query, headers: {}, body: null }, V2_OPTIONS);
  const BASE = "/api/admin/profile-access/v2";

  it("self-navigation and eligibility pass the strict readers", () => {
    const nav = get(`${BASE}/self-navigation`, "?workspace_id=ws_a&environment=paper");
    expect(nav?.status).toBe(200);
    expect(readAccessSelfNavigation(nav?.body)).not.toBeNull();
    expect(readAccessSelfNavigation(get(`${BASE}/self-navigation`, `?workspace_id=${WS.none}&environment=paper`)?.body)).not.toBeNull();
    const elig = get(`${BASE}/eligibility`, "?workspace_id=ws_TEST_ONLY&environment=paper&resource_kind=PORTFOLIO&resource_id=portfolio_TEST_ONLY&actions=portfolio.read");
    expect(readAccessEligibility(elig?.body)?.kind).toBe("eligibility");
    expect(get(`${BASE}/eligibility`, "?workspace_id=ws_TEST_ONLY&environment=paper&resource_kind=PORTFOLIO&resource_id=other&actions=portfolio.read")?.status).toBe(404);
  });

  it("the batch answers the fixture's question only, as portal.self-eligibility-batch.v2; the FE reader still reads v1 (KNOWN gap)", () => {
    const q = "?workspace_id=ws_TEST_ONLY&environment=paper&resources=PORTFOLIO:portfolio_TEST_ONLY,DEPLOYMENT:deployment_TEST_ONLY&actions=portfolio.read,capital.top_up";
    const body = get(`${BASE}/eligibility/batch`, q);
    expect(body?.status).toBe(200);
    expect((body?.body as { schema_version: string }).schema_version).toBe("portal.self-eligibility-batch.v2");
    // KNOWN: accessSelfBatch.ts is pinned to ...-batch.v1 and to a single `challenge`; the published contract is v2 with `challenges[]`.
    // This row turns red when the reader moves to v2: delete it then and assert kind "eligibility_batch".
    expect(readAccessEligibilityBatch(body?.body)).toMatchObject({ kind: "unsupported_shape" });
    const active = get(`${BASE}/eligibility/batch`, q.replace("ws_TEST_ONLY", "ws_TEST_STEP_UP_ACTIVE"));
    expect((active?.body as { session_step_up: { state: string } }).session_step_up.state).toBe("ACTIVE");
    // Another question than the fixture states is a typed 404, never an invented row.
    expect(get(`${BASE}/eligibility/batch`, q.replace("DEPLOYMENT:deployment_TEST_ONLY", "DEPLOYMENT:other"))?.status).toBe(404);
    expect(get(`${BASE}/eligibility/batch`, q.replace(",capital.top_up", ""))?.status).toBe(404);
    expect(get(`${BASE}/eligibility/batch`, "?workspace_id=ws_a&environment=paper&resources=PORTFOLIO:p&actions=nope")?.status).toBe(400);
  });

  it("self-context: every fixture case is selectable, the read takes no query", () => {
    for (const name of SELF_CONTEXT_CASES) {
      setSelfContextCase(name);
      const answered = get(`${BASE}/self-context`, "");
      expect(answered?.status, name).toBe(200);
      expect((answered?.body as { schema_version: string }).schema_version).toBe("portal.self-context.v1");
    }
    expect(get(`${BASE}/self-context`, "?workspace_id=ws_a")?.status).toBe(400);
  });

  it("is deterministic: the same request answers the same bytes", () => {
    const q = "?workspace_id=ws_a&environment=paper";
    expect(JSON.stringify(get(`${BASE}/self-navigation`, q)?.body)).toBe(JSON.stringify(get(`${BASE}/self-navigation`, q)?.body));
  });
});

/* ── opt-in: the V1 stubs keep their answers ─────────────────────────── */

describe("opt-in for the V2 lane", () => {
  const ROUTES = [
    "/api/v1/execution/manager/series?environment=paper&metric=NAV&subjects=%5B%7B%22subject_type%22%3A%22FUND%22%7D%5D&window=%2230D%22",
    "/api/v1/execution/manager/fleet?environment=paper",
    "/api/v1/execution/governance/stage-action-eligibility",
    "/api/v1/execution/governance/approvals/request-lookup?request_key=req-1",
    "/api/v1/execution/pending-recalls?workspace_id=w&resource_kind=PORTFOLIO&resource_id=p&environment=paper",
  ];
  it.each([[{}], [{ operationsV2: true }]])("%j: the stub still answers its 501 gap and the pure answerer says 'not mine'", (options) => {
    for (const route of ROUTES) {
      const url = new URL(route, "http://portal.test");
      expect(answerExecutionBff("GET", url.pathname, url.searchParams, options).status, route).toBe(501);
      expect(answerFixtureRequest({ method: "GET", path: url.pathname, search: url.search, headers: {}, body: null }, options), route).toBeNull();
    }
  });
});
