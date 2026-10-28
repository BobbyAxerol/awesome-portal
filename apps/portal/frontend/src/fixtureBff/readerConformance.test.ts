// @vitest-environment node
/**
 * READER CONFORMANCE OVER THE FIXTURES (UXM-07 step B-T2). The class of defect this guards: the fixture serves a body that the screen's own CLOSED
 * V2 reader rejects, so the page prints "Unavailable: ... could not be read" while every cross-screen tie (worldTies.test.ts) is green.
 *
 * How it works: the real fixture server is started in-process (populated profile, positive scenario, medium scale) and the screens' own
 * port, `createHttpApi` (src/execution/api/httpApi.ts), is pointed at it. Every method of that port parses the served body with the screen's
 * closed reader (v2/readers/*, the api/* adapters); a body a reader refuses comes back as a typed failure (`ok:false`) or as an `unsupported`
 * answer. This file calls the port for every V2 screen read, with the query shapes the screens send (taken from the hooks) and the ids the served
 * bodies link to (crawled), and asserts each answer is ACCEPTED. It edits no double and no reader.
 *
 * Mechanism for a known red (same as worldTies.test.ts OPEN_TIES): a group listed in OPEN_GROUPS runs as `it.fails`; it passes while the group
 * is red and fails with "now green: delete <ID> from OPEN_GROUPS" the moment it turns green.
 *
 * Catalogue rows: WORLD_TIE_CATALOGUE_2026-10-28.md W110+. Receipt: READER_CONFORMANCE_OVER_FIXTURES_2026-10-28.md.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFixtureServer, loadConfig, resetFixtureGlobals } from "../../../fixture-bff/app";
import { resetScenario } from "../../../fixture-bff/scenario";
import { createHttpApi } from "../execution/api/httpApi";
import type { ExecutionApi } from "../execution/api/ports";
import { canonicalHref } from "../execution/links";
import { ROOT_CAPITAL_ACTIONS } from "../execution/v2/screens/access/useRootCapitalEligibility";
import { readRosterPageFromServer, readDetailFromServer } from "../execution/v2/screens/users/rosterReader";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
const WS = "ws_TEST_ONLY";
const WS_V2 = "ws_TEST_SCOPED_V2";

/** The groups of the receipt (WORLD_TIE_CATALOGUE W110+): id, what is read. One defect = one group, so a known red never hides a new one. */
const GROUPS: readonly { id: string; title: string }[] = [
  { id: "W110", title: "portfolio register: FLEET group_by=portfolio_id per environment, window and page size" },
  { id: "W110k", title: "portfolio register list (GET /portfolios): the closed list reader accepts the served list" },
  { id: "W111", title: "fleet: alpha fleet list, fleet datasets (every scope, filter, group, the ALL lens), sparklines" },
  { id: "W112", title: "alpha 360: resource (v1/v2 dispatch), lifecycle, ALPHA datasets, activity, charts, replay, candles, stage drift" },
  { id: "W113", title: "portfolio 360, compare, overview: PORTFOLIO and FUND datasets, NAV / Net PnL / Return series, capital reads" },
  { id: "W114", title: "operations queue: plain, every filter, every target the queue lists, incident root, children, audit, composition" },
  { id: "W114k", title: "operations queue with a variant target id (dep_live_01_mismatch, _gap, _stale, _dark)" },
  { id: "W115", title: "approvals: queue, history, R1 / R2 / Live / exit detail (v1 + v2 workspace), evidence, waivers, exit parent" },
  { id: "W116", title: "blotter: unscoped, deployment / alpha / account scoped, stage=PAPER, the N22 refusal, funnel, groups" },
  { id: "W117", title: "accounts: bindings per environment, binding detail and exposure, account 360, activity" },
  { id: "W118", title: "users: roster pages and filters, account detail" },
  { id: "W119", title: "stage pages for every deployment id and variant: Paper, Sandbox, Canary, Live (v1 and the home workspace)" },
  { id: "W120", title: "overview and digest: command-center composition and snapshot, digest, source health, tasks" },
  { id: "W121", title: "FE-069 alpha catalogue (research run library)" },
  { id: "W122", title: "shell and admin reads: self context, eligibility batch, stage eligibility, command catalogue, manifest, contracts, activation" },
  { id: "W123", title: "crawl: every in-app href the served bodies emit lands on a read the closed reader accepts (a typed refusal is a dead link here)" },
  { id: "W124", title: "no served 200 body prints 'undefined' or 'null' as an id, a link segment or a label" },
  { id: "W127", title: "entity search (Cmd K) body: no duplicate hit id inside a group" },
  { id: "W128", title: "pending-recall discovery body validates against its published schema" },
  { id: "W129", title: "alpha resource v2 body in the ws_TEST_SCOPED_V2 workspace is accepted by the v2 reader" },
  { id: "W130", title: "Sandbox and Canary stage variants (_dark) in the ws_TEST_SCOPED_V2 workspace do not crash the server" },
  { id: "W131", title: "every alpha the Fleet lists opens: its alpha 360 resource, lifecycle and dataset exist" },
];

/**
 * Groups still red. A line is deleted when its owner lands the fix (the test then says which). W110k and W114k are the two reds the last browser round
 * found (known, being fixed by B-A3 and B-S3). W127 to W131 were found by this guard on the tip; they are reported to the coordinator, not routed here.
 */
const OPEN_GROUPS: Readonly<Record<string, string>> = {
};

interface Verdict { group: string; name: string; ok: boolean; why: string; urls: string[]; refusal?: boolean }
let server: Server;
let base = "";
let api: ExecutionApi;
const verdicts: Verdict[] = [];
const served: { url: string; status: number; text: string }[] = [];
const realFetch = globalThis.fetch;

/** A refusal the reader could not have parsed: the body was served but the closed reader said no. */
const UNREADABLE = /could not be read|V2_MALFORMED|unsupported|HTTP_5\d\d|threw|not one the Portal accepts|no answer|PORTAL_READ_FAILED|MALFORMED|SCHEMA|CONTRACT/i;

interface Opts { link?: boolean; informational?: boolean }
/**
 * `null` when the answer is accepted. A typed refusal carrying the server's own code (404 ACCOUNT_NOT_FOUND, 503 ANALYTICS_UPSTREAM_ROUTE_ABSENT) is the
 * reader working: it is accepted and listed as a refusal, unless the read is the target of a link (`link`), where a refusal is a dead link.
 */
function rejection(answer: Any, opts: Opts): { why: string | null; refusal: boolean } {
  if (answer === null || answer === undefined) return { why: "no answer", refusal: false };
  if (answer.ok === false) {
    const why = `${answer.status ?? "failed"}: ${answer.reason ?? answer.word ?? "no reason"}`;
    if (UNREADABLE.test(why) || opts.link === true) return { why, refusal: false };
    return { why: null, refusal: true };
  }
  if (answer.kind === "failed") return { why: `failed: ${answer.word}`, refusal: false };
  const value = answer.ok === true ? answer.value : answer;
  for (const node of [value, value?.read, value?.page]) {
    if (node && typeof node === "object" && node.kind === "unsupported") return { why: `unsupported: ${node.reason ?? ""} (${node.schemaVersion ?? "no schema_version"})`, refusal: false };
  }
  return { why: null, refusal: false };
}
async function record(group: string, name: string, run: () => Promise<Any>, opts: Opts = {}): Promise<void> {
  const from = served.length;
  const urls = (): string[] => served.slice(from).map((x) => `${x.status} ${x.url}`);
  try {
    const answer = await run();
    const { why, refusal } = rejection(answer, opts);
    verdicts.push({ group: opts.informational ? "W126" : group, name, ok: why === null, why: why ?? "", urls: why === null && !refusal ? [] : urls(), refusal });
  } catch (error) {
    verdicts.push({ group, name, ok: false, why: `threw ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`, urls: urls() });
  }
}
const get = async (path: string): Promise<Any> => { const r = await realFetch(`${base}${path}`); try { return await r.json(); } catch { return null; } };
const E = "/api/v1/execution";

beforeAll(async () => {
  server = createFixtureServer(loadConfig({ PORT: "0", FIXTURE_HOST: "127.0.0.1", FIXTURE_REVIEW_PROFILE: "populated", FIXTURE_SCALE: "medium" }));
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  // the screens' port fetches same-origin paths; point them at the in-process server and keep every served body for the text scan and the crawl
  globalThis.fetch = (async (input: Any, init?: Any) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const response = await realFetch(url.startsWith("/") ? `${base}${url}` : url, init);
    const text = await response.clone().text();
    served.push({ url, status: response.status, text });
    return response;
  }) as typeof fetch;
  api = createHttpApi({ policy: null });
  await runAll();
}, 600_000);
afterAll(async () => {
  globalThis.fetch = realFetch;
  server.closeAllConnections();
  await new Promise<void>((done) => server.close(() => done()));
  resetFixtureGlobals();
  resetScenario();
});

const ENV_OF_STAGE: Record<string, "paper" | "sandbox" | "live"> = { PAPER: "paper", SANDBOX: "sandbox", CANARY: "live", LIVE: "live" };
const ENV_OF_ACCOUNT: Record<string, "paper" | "sandbox" | "live"> = { acc_pap_sim: "paper", acc_tn_bnc: "sandbox" };
const envOfAccount = (id: string): "paper" | "sandbox" | "live" => ENV_OF_ACCOUNT[id] ?? "live";
/** The variants each stage screen defines (bffSimulatedStage.ts header). */
const VARIANTS: Record<string, string[]> = { live: ["_dark", "_mismatch", "_stale", "_gap"], canary: ["_dark", "_stale"], sandbox: ["_dark", "_mismatch"], paper: ["_dark"] };

async function runAll(): Promise<void> {
  const envs = ["live", "paper", "sandbox"] as const;
  const windows = ["7D", "30D", "90D"] as const;
  const workspaces: (string | undefined)[] = [undefined, WS];
  const fleet = await get(`${E}/alphas?limit=200`);
  const alphaRows: Any[] = fleet?.page?.rows ?? [];
  const deployments: { id: string; stage: string; alphaId: string }[] = alphaRows.flatMap((r) => (r.deployments ?? []).map((d: Any) => ({ id: d.deployment_id, stage: d.stage, alphaId: r.alpha_id })));
  for (const d of deployments) stageById.set(d.id, d.stage);
  const portfolioIds: string[] = ((await get(`${E}/portfolios`))?.items ?? []).map((p: Any) => p.portfolio_id);
  // an alpha the Fleet lists but whose 360 does not exist is one defect (W131), not one failure per read
  const unknownAlphas = new Set<string>();
  for (const row of alphaRows) if ((await realFetch(`${base}${E}/resources/alphas/${row.alpha_id}`)).status !== 200) unknownAlphas.add(row.alpha_id);
  const alphaGroup = (id: string): string => (unknownAlphas.has(id) ? "W131" : "W112");

  // ── W110 / W110k portfolio register
  for (const w of workspaces) await record("W110k", `listPortfolios ws=${w ?? "-"}`, () => api.listPortfolios(w ? { workspaceId: w } : undefined));
  for (const env of envs) for (const window of windows) for (const limit of [1, 200]) {
    await record("W110", `FLEET group_by=portfolio_id ${env} ${window} limit ${limit}`, () => api.getManagerDataset({ surface: "FLEET", environment: env, window, groupBy: ["portfolio_id"], limit } as Any));
  }

  // ── W111 fleet
  for (const q of [{ limit: 50 }, { limit: 200 }, { search: "carry", environment: "all", limit: 8 }, ...["PAPER", "SANDBOX", "CANARY", "LIVE"].map((stage) => ({ stage, limit: 200 })), { owner: "Bobby Vu", limit: 50 }, { health: "ATTENTION", limit: 50 }]) {
    await record("W111", `getAlphaFleet ${JSON.stringify(q)}`, () => api.getAlphaFleet(q as Any));
  }
  for (const env of [...envs, "ALL"] as const) {
    for (const limit of [1, 50]) await record("W111", `FLEET dataset ${env} limit ${limit}`, () => api.getManagerDataset({ surface: "FLEET", environment: env, limit } as Any));
  }
  for (const env of envs) {
    await record("W111", `FLEET ${env} 30D`, () => api.getManagerDataset({ surface: "FLEET", environment: env, window: "30D", limit: 50 } as Any));
    await record("W111", `FLEET ${env} group_by=alpha_id`, () => api.getManagerDataset({ surface: "FLEET", environment: env, window: "30D", groupBy: ["alpha_id"], limit: 50 } as Any));
    await record("W111", `FLEET ${env} q=carry`, () => api.getManagerDataset({ surface: "FLEET", environment: env, q: "carry", qMode: "CONTAINS", limit: 50 } as Any));
    await record("W111", `getEquitySparklines ${env}`, () => api.getEquitySparklines(env));
  }
  for (const stage of ["CANARY", "LIVE"]) await record("W111", `FLEET live stage_filter ${stage}`, () => api.getManagerDataset({ surface: "FLEET", environment: "live", stageFilter: [stage], limit: 50 } as Any));

  // ── W112 / W131 alpha 360 (the Fleet's own links open these)
  for (const row of alphaRows.slice(0, 45)) {
    const id: string = row.alpha_id;
    const group = alphaGroup(id);
    const env = ENV_OF_STAGE[row.stage] ?? "live";
    const link = { link: true };
    // W131 holds one verdict per alpha the Fleet lists (an alpha that opens is a pass here, so the group never reads nothing once its reds are fixed)
    await record("W131", `the Fleet's link to ${id} opens`, () => api.getAlpha360ResourceVersioned(id), link);
    for (const w of [undefined, WS]) await record(group, `getAlpha360ResourceVersioned ${id} ws=${w ?? "-"}`, () => api.getAlpha360ResourceVersioned(id, w ? { workspaceId: w } : undefined), link);
    await record(group, `getAlphaLifecycle ${id} ${env}`, () => api.getAlphaLifecycle!(id, env, WS), link);
    await record(group, `getAlphaLifecycle ${id} ${env} no ws`, () => api.getAlphaLifecycle!(id, env), link);
    for (const window of [undefined, "30D"] as const) await record(group, `ALPHA dataset ${id} ${env} ${window ?? "-"}`, () => api.getManagerDataset({ surface: "ALPHA", id, environment: env, ...(window ? { window } : {}), workspaceId: WS } as Any), link);
    await record(group, `ALPHA dataset ${id} ${env} limit 50`, () => api.getManagerDataset({ surface: "ALPHA", id, environment: env, limit: 50 } as Any), link);
    await record(group, `getAlpha360Resource ${id}`, () => api.getAlpha360Resource(id), link);
    await record(group, `getSubjectActivityVersioned ${id} orders`, () => api.getSubjectActivityVersioned({ environment: env, subjectKind: "alpha", subjectId: id, relation: "orders", limit: 100 } as Any));
    await record(group, `getFinancialChart alpha ${id}`, () => api.getFinancialChart({ environment: env, subjectKind: "alpha", subjectId: id, metric: "equity", viewportPx: 960 } as Any));
    await record(group, `getAlphaActivity ${id}`, () => api.getAlphaActivity(id, env));
    await record(group, `getObservedTimeline alpha ${id}`, () => api.getObservedTimeline({ environment: env, subjectKind: "alpha", subjectId: id, limit: 100 } as Any));
    await record(group, `getStageDrift ${id}`, () => api.getStageDrift(id));
  }
  for (const id of ["alpha_a", "alpha_b", "alpha_btc_trend"]) {
    // the scoped workspace lane (ws_TEST_SCOPED_V2): the v2 resource reader
    await record("W129", `getAlpha360ResourceVersioned ${id} ws=${WS_V2}`, () => api.getAlpha360ResourceVersioned(id, { workspaceId: WS_V2 }), { link: true });
  }
  await record("W112", "getMarketCandles ETHUSDT 1h", () => api.getMarketCandles({ environment: "live", symbol: "ETHUSDT", interval: "1h", limit: 200 } as Any));
  await record("W112", "getMarketCandles BTCUSDT 5m", () => api.getMarketCandles({ environment: "live", symbol: "BTCUSDT", interval: "5m", limit: 200 } as Any));

  // ── W113 portfolio 360, compare, overview
  for (const id of portfolioIds.slice(0, 30)) {
    await record("W113", `getPortfolio360Resource ${id}`, () => api.getPortfolio360Resource(id), { link: true });
    for (const env of envs) {
      await record("W113", `PORTFOLIO dataset ${id} ${env} group_by=portfolio_id`, () => api.getManagerDataset({ surface: "PORTFOLIO", id, environment: env, window: "30D", groupBy: ["portfolio_id"], limit: 1 } as Any));
      await record("W113", `PORTFOLIO dataset ${id} ${env} group_by=alpha_id`, () => api.getManagerDataset({ surface: "PORTFOLIO", id, environment: env, window: "30D", groupBy: ["alpha_id"], limit: 1 } as Any));
    }
  }
  for (const id of portfolioIds.slice(0, 6)) {
    for (const metric of ["NAV", "NET_PNL", "RETURN"] as const) await record("W113", `getManagerSeries PORTFOLIO ${id} ${metric}`, () => api.getManagerSeries({ environment: "live", metric, subjects: [{ subjectType: "PORTFOLIO", subjectId: id }], window: "30D" } as Any));
    for (const env of envs) {
      await record("W113", `getPortfolioCapital ${id} ${env}`, () => api.getPortfolioCapital(id, env));
      await record("W113", `getCapitalLedger ${id} ${env}`, () => api.getCapitalLedger(id, env));
      await record("W113", `getCorrelation ${id} ${env}`, () => api.getCorrelation(id, env));
      await record("W113", `getCrossEquity ${id} ${env}`, () => api.getCrossEquity(id, env));
    }
  }
  for (const env of envs) for (const window of windows) {
    await record("W113", `FUND dataset ${env} ${window}`, () => api.getManagerDataset({ surface: "FUND", environment: env, window, workspaceId: WS } as Any));
    await record("W113", `getManagerSeries FUND NAV ${env} ${window}`, () => api.getManagerSeries({ environment: env, metric: "NAV", subjects: [{ subjectType: "FUND" }], window } as Any));
  }
  if (portfolioIds.length >= 2) await record("W113", "getManagerSeries compare 2 portfolios NAV", () => api.getManagerSeries({ environment: "live", metric: "NAV", subjects: portfolioIds.slice(0, 2).map((subjectId) => ({ subjectType: "PORTFOLIO", subjectId })), window: "30D" } as Any));

  // ── W114 / W114k operations
  const queue = await get(`${E}/operations?limit=200`);
  const targets: { type: string; id: string }[] = [...new Map((queue?.page?.rows ?? []).map((o: Any) => [`${o.target?.type}:${o.target?.id}`, o.target])).values()].filter(Boolean) as Any;
  const incidentIds: string[] = [...new Set<string>((queue?.page?.rows ?? []).flatMap((o: Any) => (o.incident_links?.items ?? []).map((i: Any) => i.incident_id ?? i.id)).filter(Boolean))];
  const liveDeps = deployments.filter((d) => d.stage === "LIVE" || d.stage === "CANARY").map((d) => d.id);
  for (const w of workspaces) {
    await record("W114", `queue plain ws=${w ?? "-"}`, () => api.listOperationalQueueV2({ ...(w ? { workspaceId: w } : {}) }));
    await record("W114", `queue limit 1 ws=${w ?? "-"}`, () => api.listOperationalQueueV2({ limit: 1, ...(w ? { workspaceId: w } : {}) }));
    await record("W114", `queue UNACKNOWLEDGED limit 1 ws=${w ?? "-"}`, () => api.listOperationalQueueV2({ triageState: "UNACKNOWLEDGED", limit: 1, ...(w ? { workspaceId: w } : {}) }));
  }
  for (const q of [{ environment: "LIVE" }, { environment: "PAPER" }, { severity: "CRITICAL" }, { sourceStatus: "FAILED" }, { verificationResult: "DENIED" }, { sort: "created_at:asc" }, { limit: 50 }, { limit: 200 }, { triageState: "ACKNOWLEDGED" }, { triageState: "RESOLVED" }]) {
    await record("W114", `queue ${JSON.stringify(q)}`, () => api.listOperationalQueueV2({ workspaceId: WS, ...q } as Any));
  }
  for (const t of targets.slice(0, 25)) await record("W114", `queue target ${t.type} ${t.id}`, () => api.listOperationalQueueV2({ workspaceId: WS, targetType: t.type, targetId: t.id, limit: 10 } as Any));
  for (const id of ["dep_live_01", ...liveDeps.slice(0, 10)]) {
    await record("W114", `queue target_id=${id}`, () => api.listOperationalQueueV2({ workspaceId: WS, targetId: id, limit: 50 } as Any));
    for (const suffix of ["_mismatch", "_gap", "_stale", "_dark"]) {
      await record("W114k", `queue target_id=${id}${suffix}`, () => api.listOperationalQueueV2({ workspaceId: WS, targetId: `${id}${suffix}`, limit: 50 } as Any));
      await record("W114k", `queue DEPLOYMENT target_id=${id}${suffix}`, () => api.listOperationalQueueV2({ workspaceId: WS, targetType: "DEPLOYMENT", targetId: `${id}${suffix}`, limit: 10 } as Any));
    }
  }
  for (const id of incidentIds.slice(0, 12)) {
    await record("W114", `getIncidentRootV2 ${id}`, () => api.getIncidentRootV2(id, WS), { link: true });
    await record("W114", `getIncidentChildren ${id}`, () => api.getIncidentChildren!(id, WS), { link: true });
    // the drawer also asks for the V1 detail, best effort ("a failed detail read leaves each section with its own typed absence"): informational
    await record("W114", `getIncident (V1 detail, best effort) ${id}`, () => api.getIncident(id, WS), { informational: true });
  }
  await record("W114", "getOperationsAudit", () => api.getOperationsAudit!({ workspaceId: WS, limit: 100 }));
  await record("W114", "getOperationalComposition operations", () => api.getOperationalComposition("operations", { workspace_id: WS }));
  for (const t of targets.filter((x) => x.type !== "ACCOUNT").slice(0, 8)) {
    await record("W128", `getPendingRecallDiscovery ${t.type} ${t.id}`, () => api.getPendingRecallDiscovery({ workspaceId: WS, resourceKind: t.type, resourceId: t.id, environment: "live" } as Any));
  }

  // ── W115 approvals
  const approvals = await get(`${E}/governance/approvals?limit=200`);
  const approvalRows: Any[] = approvals?.page?.rows ?? [];
  for (const filter of ["ALL", "PENDING", "MINE", "OVERDUE"]) {
    for (const w of workspaces) await record("W115", `listApprovals ${filter} ws=${w ?? "-"}`, () => api.listApprovals({ filter, limit: 30, ...(w ? { workspaceId: w } : {}) }));
  }
  await record("W115", "getApprovalHistory", () => api.getApprovalHistory(WS));
  for (const row of approvalRows.slice(0, 40)) {
    const gate = String(row.gate ?? "").toLowerCase();
    for (const w of [undefined, WS, WS_V2]) {
      if (gate === "r1") await record("W115", `getGateR1 ${row.id} ws=${w ?? "-"}`, () => api.getGateR1(row.id, w), { link: true });
      if (gate === "r2") {
        await record("W115", `getGateR2 ${row.id} ws=${w ?? "-"}`, () => api.getGateR2(row.id, w), { link: true });
        await record("W115", `getGovernanceParent r2 ${row.id} ws=${w ?? "-"}`, () => api.getGovernanceParent("r2", row.id, w), { link: true });
      }
      if (gate === "live") {
        await record("W115", `getLiveReview ${row.id} ws=${w ?? "-"}`, () => api.getLiveReview(row.id, w), { link: true });
        await record("W115", `getGovernanceParent live ${row.id} ws=${w ?? "-"}`, () => api.getGovernanceParent("live", row.id, w), { link: true });
      }
    }
    await record("W115", `getApprovalEvidence ${row.id}`, () => api.getApprovalEvidence!(row.id, WS));
  }
  await record("W115", "getWaivers", () => api.getWaivers({ limit: 50 } as Any));
  await record("W115", "getReviewCaptureCapabilities", () => api.getReviewCaptureCapabilities(WS));
  await record("W115", "getPaperExitParent dep_paper_01", () => api.getPaperExitParent({ deploymentId: "dep_paper_01", workspaceId: WS }));

  // ── W116 blotter
  const depLive = deployments.find((d) => d.stage === "LIVE")?.id ?? "dep_live_01";
  const blotterQueries: Record<string, Any> = {
    unscoped: {}, "limit 200": { limit: 200 }, sorted: { sort: "updated_at_desc" }, "status_bucket OPEN": { status_bucket: "OPEN" }, "status_bucket FILLED": { status_bucket: "FILLED" },
    "symbol ETHUSDT": { symbol: "ETHUSDT" }, "side SELL": { side: "SELL" }, venue: { venue: "BINANCE" },
    [`deployment ${depLive}`]: { deployment_id: depLive }, "account acc_bnc_core": { account_id: "acc_bnc_core" }, "alpha alpha_a": { alpha_id: "alpha_a" },
    "stage PAPER": { stage: "PAPER" }, "stage PAPER + deployment": { stage: "PAPER", deployment_id: "dep_paper_01" }, "stage PAPER + alpha": { stage: "PAPER", alpha_id: "alpha_a" },
  };
  for (const [name, q] of Object.entries(blotterQueries)) await record("W116", `getBlotterProfile ${name}`, () => api.getBlotterProfile(q));
  for (const d of liveDeps.slice(0, 6)) for (const suffix of ["_gap", "_mismatch", "_stale", "_dark"]) await record("W116", `getBlotterProfile deployment ${d}${suffix}`, () => api.getBlotterProfile({ deployment_id: `${d}${suffix}` }));
  for (const row of alphaRows.slice(0, 20)) await record("W116", `getBlotterProfile alpha ${row.alpha_id}`, () => api.getBlotterProfile({ alpha_id: row.alpha_id }));
  for (const acc of ["acc_bnc_core", "acc_bnc_sat", "acc_bnc_can", "acc_pap_sim", "acc_tn_bnc"]) await record("W116", `getBlotterProfile account ${acc}`, () => api.getBlotterProfile({ account_id: acc }));
  // N22: any stage other than PAPER is refused by the server; the port must turn that typed refusal into a readable refusal, not a malformed-body failure
  for (const stage of ["SANDBOX", "CANARY", "LIVE"] as const) {
    await record("W116", `N22 refusal stage ${stage} (a typed refusal, not 'could not be read')`, async () => {
      const answer = await api.getBlotterProfile({ stage });
      if (answer.ok === false && !UNREADABLE.test(answer.reason)) return { ok: true, value: answer };
      return answer.ok ? { ok: false, status: "unavailable", reason: "the server answered a stage other than PAPER with a body (no N22 refusal)" } : answer;
    });
  }
  await record("W116", "getScreenProfile blotter", () => api.getScreenProfile("blotter"));
  for (const id of ["ord_00001", "ord_00297", "ord_00217"]) await record("W116", `getOrderFunnel ${id}`, () => api.getOrderFunnel(id));
  for (const g of ["grp_00300", "grp_00001"]) await record("W116", `getConditionalGroup ${g}`, () => api.getConditionalGroup(g, "paper"));

  // ── W117 accounts
  const bindings: { id: string; env: "paper" | "sandbox" | "live" }[] = [];
  for (const env of envs) {
    const list = await get(`${E}/broker-bindings?environment=${env}&limit=50`);
    for (const b of list?.page?.rows ?? list?.items ?? []) bindings.push({ id: b.binding_id ?? b.id, env });
    await record("W117", `getBindings ${env}`, () => api.getBindings({ environment: env, limit: 50 }));
    await record("W117", `getBindings ${env} search`, () => api.getBindings({ environment: env, search: "bnc", limit: 8, workspace_id: WS }));
  }
  for (const b of bindings.slice(0, 18)) {
    await record("W117", `getBindingDetail ${b.id} ${b.env}`, () => api.getBindingDetail(b.id, b.env), { link: true });
    await record("W117", `getBindingResource ${b.id}`, () => api.getBindingResource(b.id));
    await record("W117", `getBindingExposure ${b.id}`, () => api.getBindingExposure(b.id));
  }
  for (const acc of ["acc_bnc_core", "acc_bnc_sat", "acc_bnc_can", "acc_pap_sim", "acc_tn_bnc"]) {
    const env = envOfAccount(acc);
    await record("W117", `getAccount360Resource ${acc}`, () => api.getAccount360Resource(acc), { link: true });
    await record("W117", `getAccountBroker360 ${acc}`, () => api.getAccountBroker360(acc));
    await record("W117", `getSubjectActivity account ${acc} ${env}`, () => api.getSubjectActivity({ environment: env, subjectKind: "account", subjectId: acc, relation: "orders", limit: 100 } as Any), { link: true });
    await record("W117", `getObservedTimeline account ${acc} ${env}`, () => api.getObservedTimeline({ environment: env, subjectKind: "account", subjectId: acc, limit: 100 } as Any));
  }

  // ── W118 users
  const roster = await readRosterPageFromServer({ limit: 50 }).catch(() => null);
  for (const q of [{ limit: 50 }, { limit: 200 }, { limit: 10 }, { limit: 50, q: "hoa" }, { limit: 50, q: "Nguyen" }, { limit: 50, role: "ADMIN" }, { limit: 50, state: "ACTIVE" }, { limit: 50, state: "INVITED" }, { limit: 50, state: "DISABLED" }, { limit: 50, role: "USER", state: "ACTIVE" }]) {
    await record("W118", `roster ${JSON.stringify(q)}`, async () => { await readRosterPageFromServer(q as Any); return { ok: true }; });
  }
  for (const a of ((roster as Any)?.accounts ?? (roster as Any)?.rows ?? []).slice(0, 6)) await record("W118", `roster detail ${a.username}`, async () => { await readDetailFromServer(a.userId ?? a.user_id ?? a.id); return { ok: true }; });
  await record("W118", "roster detail usr_0001", async () => { await readDetailFromServer("usr_0001"); return { ok: true }; });

  // ── W119 stage pages: every deployment id of the Fleet and every variant the screen defines
  for (const d of deployments.slice(0, 80)) {
    const kind = d.stage.toLowerCase();
    for (const suffix of ["", ...(VARIANTS[kind] ?? [])]) {
      const id = `${d.id}${suffix}`;
      if (kind === "paper") {
        await record("W119", `getPaperWorkbenchProfile ${id}`, () => api.getPaperWorkbenchProfile(id), { link: true });
        await record("W119", `getPaperWorkbenchProfile ${id} vnm`, () => api.getPaperWorkbenchProfile(id, "vnm"));
      }
      for (const w of [undefined, WS]) {
        const opt = w ? { workspaceId: w } : undefined;
        if (kind === "sandbox") await record("W119", `getSandboxCertificationVersioned ${id} ws=${w ?? "-"}`, () => api.getSandboxCertificationVersioned(id, opt), { link: true });
        if (kind === "canary") await record("W119", `getCanaryVersioned ${id} ws=${w ?? "-"}`, () => api.getCanaryVersioned(id, opt), { link: true });
        if (kind === "live") await record("W119", `getLiveFullVersioned ${id} ws=${w ?? "-"}`, () => api.getLiveFullVersioned(id, opt), { link: true });
      }
      if (kind === "sandbox") await record("W119", `getSandboxCertification ${id}`, () => api.getSandboxCertification(id), { link: true });
      if (kind === "canary") await record("W119", `getCanaryControlRoom ${id}`, () => api.getCanaryControlRoom(id), { link: true });
      if (kind === "live") await record("W119", `getLiveFullOperations ${id}`, () => api.getLiveFullOperations(id), { link: true });
      // the scoped-workspace lane: its V2 parent bodies
      if (suffix === "_dark" && (kind === "sandbox" || kind === "canary")) {
        await record("W130", `${kind === "sandbox" ? "getSandboxCertificationVersioned" : "getCanaryVersioned"} ${id} ws=${WS_V2}`, () => (kind === "sandbox" ? api.getSandboxCertificationVersioned(id, { workspaceId: WS_V2 }) : api.getCanaryVersioned(id, { workspaceId: WS_V2 })), { link: true });
      }
    }
    await record("W119", `getDeploymentQuality ${d.id}`, () => api.getDeploymentQuality(d.id, ENV_OF_STAGE[d.stage] ?? "live"));
  }
  await record("W119", "getLiveFullVersioned dep_live_01 include=identity", () => api.getLiveFullVersioned("dep_live_01", { workspaceId: WS_V2, include: ["identity"] } as Any));
  for (const kind of ["sandbox", "canary"] as const) {
    const id = deployments.find((d) => d.stage.toLowerCase() === kind)?.id;
    if (id) await record("W130", `${kind} ${id} ws=${WS_V2} (non-variant)`, () => (kind === "sandbox" ? api.getSandboxCertificationVersioned(id, { workspaceId: WS_V2 }) : api.getCanaryVersioned(id, { workspaceId: WS_V2 })), { link: true });
  }

  // ── W120 overview and digest
  await record("W120", "getOperationalComposition command-center", () => api.getOperationalComposition("command-center"));
  await record("W120", "getOperationalComposition command-center ws", () => api.getOperationalComposition("command-center", { workspace_id: WS }));
  await record("W120", "getCommandCenterSnapshot", () => api.getCommandCenterSnapshot());
  await record("W120", "getVisitDigest", () => api.getVisitDigest());
  await record("W120", "getVisitDigest ws", () => api.getVisitDigest(WS));
  await record("W120", "getSourceHealthRead", () => api.getSourceHealthRead());
  for (const env of envs) await record("W120", `getSourceHealth ${env}`, () => api.getSourceHealth(env));
  await record("W120", "getOperatorTasks", () => api.getOperatorTasks());

  // ── W121 FE-069
  await record("W121", "getRunLibraryAlphaCataloguePage", async () => {
    const answer = await api.getRunLibraryAlphaCataloguePage!({} as Any);
    return answer.kind === "page" ? { ok: true, value: answer } : { ok: false, status: "unavailable", reason: `catalogue ${(answer as Any).word}` };
  });

  // ── W122 shell and admin
  // the root the caller's own grants name (the Access screen reads it from the effective grants)
  const effective = JSON.stringify(await get(`/api/admin/profile-access/v2/effective?workspace_id=${WS}`));
  const rootId = /"root_id":"([^"]+)"/.exec(effective)?.[1] ?? "FIXTURE_LAB:root-1";
  await record("W122", "getSelfContext", () => api.getSelfContext());
  await record("W122", "getStageActionEligibility", () => api.getStageActionEligibility());
  await record("W122", "getStageActionEligibility ws", () => api.getStageActionEligibility(WS));
  await record("W122", "getSelfEligibilityBatch", () => api.getSelfEligibilityBatch({ workspaceId: WS, environment: "live", resources: [{ kind: "ROOT", id: rootId }], actions: ROOT_CAPITAL_ACTIONS } as Any)); // the Access screen asks about its root with the capital actions
  for (const tier of [undefined, "R3_LIVE_PROTECTIVE"]) await record("W122", `getCommandCatalogue ${tier ?? "ALL"}`, () => api.getCommandCatalogue(tier ? ({ riskTier: tier } as Any) : undefined));
  await record("W127", "searchEntities carry (all kinds)", () => api.searchEntities!({ q: "carry", limit: 8, workspaceId: WS }));
  await record("W127", "searchEntities core", () => api.searchEntities!({ q: "core", limit: 8, workspaceId: WS }));
  await record("W127", "searchEntities AP-352", () => api.searchEntities!({ q: "AP-352", limit: 8, workspaceId: WS }));
  await record("W122", "getRuntimeManifest", () => api.getRuntimeManifest());
  await record("W122", "getScreenContracts", () => api.getScreenContracts());
  await record("W122", "getActivationCapabilities", () => api.getActivationCapabilities());
  for (const env of envs) await record("W122", `getMirrorIntegrity ${env}`, () => api.getMirrorIntegrity(env));
  await record("W122", "getOperationalComposition admin-action-drawer", () => api.getOperationalComposition("admin-action-drawer"));

  await crawl();
  textScan();
}

/**
 * W123: the hrefs the served bodies emit, normalised the way the screens normalise them (`canonicalHref`), mapped to the reads the target screen makes.
 * A typed refusal on a link target is a dead link, so every crawled read counts refusals as rejections.
 */
async function crawl(): Promise<void> {
  const hrefs = new Set<string>();
  const take = (node: Any): void => {
    if (typeof node === "string") { if (/^\/(deployments|execution|governance|approvals|administration|accounts|portfolios|alphas)\b/.test(node) && !/\s/.test(node) && !/\/:[A-Za-z]/.test(node)) hrefs.add(node); return; } // a route template (`/deployments/alphas/:alphaId`, from the screen catalogue) is not a link
    if (Array.isArray(node)) { node.forEach(take); return; }
    if (node && typeof node === "object") for (const v of Object.values(node)) take(v);
  };
  // the link-bearing bodies a screen shows: compositions, queue rows, approvals, search hits, the digest, the alpha fleet
  const sources = [`${E}/compositions/command-center`, `${E}/compositions/operations`, `${E}/operations?limit=200`, `${E}/governance/approvals?limit=200`, `${E}/search?q=carry&limit=8&workspace_id=${WS}`, `${E}/search?q=core&limit=8&workspace_id=${WS}`,
    `${E}/alphas?limit=200`, `${E}/portfolios`, `${E}/visit-digest?workspace_id=${WS}`, `${E}/command-center`];
  for (const path of sources) take(await get(path));
  // every 200 body this run read (stage rooms and their variants, details, queues): the links the rooms emit are the ones the screens show
  for (const entry of served) { if (entry.status === 200) { try { take(JSON.parse(entry.text)); } catch { /* not json */ } } }
  const link = { link: true };
  const seen = new Set<string>();
  const unmapped: string[] = [];
  for (const raw of [...hrefs].sort()) {
    const href = canonicalHref(raw) ?? raw;
    const [pathname, query = ""] = href.split("?");
    const params = new URLSearchParams(query);
    const workspaceId = params.get("workspace_id") ?? undefined;
    const once = (key: string, run: () => Promise<Any>, group = "W123"): Promise<void> | undefined => { if (seen.has(key)) return undefined; seen.add(key); return record(group, `${raw}  [${key}]`, run, link); };
    let m: RegExpExecArray | null;
    if ((m = /^\/deployments\/alphas\/([^/]+)$/.exec(pathname))) {
      const id = m[1]!; const dep = params.get("deployment_id");
      const stage = dep ? deploymentsStage(dep) : null;
      const env = stage ? ENV_OF_STAGE[stage] ?? "live" : "live";
      await once(`alpha ${id} resource ws=${workspaceId ?? "-"}`, () => api.getAlpha360ResourceVersioned(id, workspaceId ? { workspaceId } : undefined));
      await once(`alpha ${id} lifecycle ${env}`, () => api.getAlphaLifecycle!(id, env, workspaceId));
      await once(`alpha ${id} dataset ${env}`, () => api.getManagerDataset({ surface: "ALPHA", id, environment: env, ...(workspaceId ? { workspaceId } : {}) } as Any));
    } else if ((m = /^\/deployments\/portfolios\/([^/]+)$/.exec(pathname))) {
      const id = m[1]!;
      await once(`portfolio ${id} resource`, () => api.getPortfolio360Resource(id));
      await once(`portfolio ${id} dataset live`, () => api.getManagerDataset({ surface: "PORTFOLIO", id, environment: "live", window: "30D", groupBy: ["portfolio_id"], limit: 1 } as Any));
    } else if ((m = /^\/deployments\/(?:accounts|account)\/([^/]+)$/.exec(pathname))) {
      await once(`account ${m[1]} resource`, () => api.getAccount360Resource(m![1]!));
    } else if ((m = /^\/deployments\/(paper|sandbox|canary|live)\/([^/]+?)(\/canary)?$/.exec(pathname))) {
      const kind = m[3] ? "canary" : m[1]!; const id = m[2]!; // /deployments/live/{id}/canary is the Canary room
      const opt = workspaceId ? { workspaceId } : undefined;
      if (kind === "paper") await once(`paper ${id}`, () => api.getPaperWorkbenchProfile(id));
      if (kind === "sandbox") await once(`sandbox ${id} ws=${workspaceId ?? "-"}`, () => api.getSandboxCertificationVersioned(id, opt));
      if (kind === "canary") await once(`canary ${id} ws=${workspaceId ?? "-"}`, () => api.getCanaryVersioned(id, opt));
      if (kind === "live") await once(`live ${id} ws=${workspaceId ?? "-"}`, () => api.getLiveFullVersioned(id, opt));
    } else if (pathname === "/deployments/blotter") {
      const q: Any = {};
      for (const [k, v] of params) if (["deployment_id", "account_id", "alpha_id", "stage", "symbol", "venue", "side", "status_bucket"].includes(k)) q[k] = v;
      await once(`blotter ${JSON.stringify(q)}`, () => api.getBlotterProfile(q));
    } else if (pathname === "/execution/operations") {
      const targetId = params.get("target_id") ?? undefined; const targetType = params.get("target_type") ?? undefined;
      await once(`operations queue target=${targetId ?? "-"} type=${targetType ?? "-"}`, () => api.listOperationalQueueV2({ ...(workspaceId ? { workspaceId } : {}), ...(targetId ? { targetId } : {}), ...(targetType ? { targetType } : {}), limit: 50 } as Any),
        // the "Open dry-run reconcile" link of a variant room: the same defect as W114k, counted there
        /_(mismatch|gap|stale|dark)$/.test(targetId ?? "") ? "W114k" : "W123");
    } else if ((m = /^\/execution\/operations\/incidents\/([^/]+)$/.exec(pathname))) {
      await once(`incident ${m[1]} root`, () => api.getIncidentRootV2(m![1]!, workspaceId));
      await once(`incident ${m[1]} children`, () => api.getIncidentChildren!(m![1]!, workspaceId));
    } else if ((m = /^\/governance\/approvals\/([A-Z]+-\d+)\/(r1|r2|live)$/.exec(pathname))) {
      const id = m[1]!;
      if (m[2] === "r1") await once(`approval ${id} r1`, () => api.getGateR1(id, workspaceId));
      if (m[2] === "r2") await once(`approval ${id} r2`, () => api.getGovernanceParent("r2", id, workspaceId));
      if (m[2] === "live") await once(`approval ${id} live`, () => api.getGovernanceParent("live", id, workspaceId));
    } else if ((m = /^\/governance\/exit-reviews\/([^/]+)$/.exec(pathname))) {
      await once(`exit review ${m[1]}`, () => api.getGovernanceParent("exit", m![1]!, workspaceId));
    } else unmapped.push(raw);
  }
  verdicts.push({ group: "W123", name: `crawl: ${hrefs.size} distinct hrefs, ${unmapped.length} without a read of their own (${[...new Set(unmapped.map((u) => u.split("?")[0]!.replace(/[A-Za-z0-9_-]*\d[A-Za-z0-9_-]*/g, ":id")))].slice(0, 12).join(", ")})`, ok: true, why: "", urls: [] });
}
const deploymentsStage = (id: string): string | null => stageById.get(id) ?? null;
const stageById = new Map<string, string>();

/** What must never be printed as an id, a link segment or a label. */
export const printsPlaceholder = (text: string): boolean => /^(undefined|null|NaN|\[object Object\])$/.test(text) || /(^|[/=_:])(undefined|null)($|[/&?_#])/.test(text);

/** W124: no served 200 body prints "undefined" or "null" as an id, a link segment or a label. */
function textScan(): void {
  const seen = new Set<string>();
  for (const entry of served) {
    if (entry.status !== 200) continue;
    let body: Any;
    try { body = JSON.parse(entry.text); } catch { continue; }
    const walk = (node: Any, path: string): void => {
      if (typeof node === "string") { if (printsPlaceholder(node)) { const key = `${entry.url.split("?")[0]} ${path.replace(/\[\d+\]/g, "[]")} = ${node}`; if (!seen.has(key)) { seen.add(key); verdicts.push({ group: "W124", name: key, ok: false, why: `prints ${JSON.stringify(node)}`, urls: [`200 ${entry.url}`] }); } } return; }
      if (Array.isArray(node)) { node.forEach((x, i) => walk(x, `${path}[${i}]`)); return; }
      if (node && typeof node === "object") for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`);
    };
    walk(body, "$");
  }
  verdicts.push({ group: "W124", name: `scanned ${served.filter((x) => x.status === 200).length} served 200 bodies`, ok: true, why: "", urls: [] });
}

const groupVerdicts = (id: string): Verdict[] => verdicts.filter((v) => v.group === id);
const failuresOf = (id: string): string[] => groupVerdicts(id).filter((v) => !v.ok).map((v) => `${v.name} -> ${v.why}`);

describe("reader conformance (must hold)", () => {
  for (const group of GROUPS.filter((g) => !(g.id in OPEN_GROUPS))) {
    it(`${group.id} ${group.title}`, () => {
      expect(groupVerdicts(group.id).length, `${group.id} read nothing`).toBeGreaterThan(0);
      expect(failuresOf(group.id).slice(0, 25)).toEqual([]);
    });
  }
});

describe("reader conformance (open, known red)", () => {
  for (const group of GROUPS.filter((g) => g.id in OPEN_GROUPS)) {
    it.fails(`${group.id} ${group.title} [${OPEN_GROUPS[group.id]}]`, () => {
      expect(failuresOf(group.id), `now green: delete ${group.id} from OPEN_GROUPS`).toEqual([]);
    });
  }
  it("every open group still reads something (a group that reads nothing is not red, it is broken)", () => {
    for (const id of Object.keys(OPEN_GROUPS)) expect(groupVerdicts(id).length, `${id} read nothing`).toBeGreaterThan(0);
  });
});

describe("catalogue", () => {
  it("the placeholder scan catches what it must and nothing else", () => {
    for (const text of ["undefined", "null", "/deployments/live/undefined", "/deployments/alphas/null?x=1", "dep_undefined", "?target_id=undefined", "[object Object]"]) expect(printsPlaceholder(text), text).toBe(true);
    for (const text of ["dep_live_01", "nullable", "/deployments/live/dep_live_01", "Carry A", "undefined_behaviour_is_prose x", "NOT_NULL_OK"]) expect(printsPlaceholder(text), text).toBe(text === "undefined_behaviour_is_prose x");
  });
  it("every OPEN_GROUPS entry names a group", () => {
    for (const id of Object.keys(OPEN_GROUPS)) expect(GROUPS.map((g) => g.id)).toContain(id);
  });
  it("the catalogue has a row for every group", () => {
    const text = readFileSync(join(process.cwd(), "../../../upgrade/execution_loop/evidence/UXM-07/WORLD_TIE_CATALOGUE_2026-10-28.md"), "utf8");
    for (const group of GROUPS) expect(text, `${group.id} has no row in the catalogue`).toContain(`| ${group.id} |`);
  });
  it("writes the report when asked", () => {
    if (process.env.READER_CONFORMANCE_REPORT) writeFileSync(process.env.READER_CONFORMANCE_REPORT, JSON.stringify({ verdicts, served: served.length }, null, 1));
    expect(verdicts.length).toBeGreaterThan(100);
  });
});
