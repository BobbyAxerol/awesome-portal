/**
 * The request matrix behind the fixture BFF tests.
 *
 * One list of requests is walked by two drivers: the OLD path (the Playwright
 * stub `stubExecutionBff`, called through a fake page) and the NEW path (the
 * pure `answerFixtureRequest`). The golden file records what the old path
 * answered before the refactor; the equivalence test asserts the new path
 * answers the same. Test support only: nothing in the product imports this.
 */
import { createHash } from "node:crypto";

import type { BffDoubleOptions } from "../../e2e/bffDouble";

export const PREFIX = "/api/v1/execution";

export const OPTION_SETS: { key: string; options: BffDoubleOptions }[] = [
  { key: "default", options: {} },
  { key: "operationsV2", options: { operationsV2: true } },
  { key: "screensV2", options: { screensV2: true } },
  { key: "operationsV2+screensV2", options: { operationsV2: true, screensV2: true } },
];

const ENVS = ["paper", "sandbox", "live"] as const;

/** Plain GETs, relative to the execution prefix. */
export const GET_PATHS: string[] = [
  "/retained-review",
  "/governance/review-capture-capabilities?workspace_id=workspace_execution_manager",
  "/runtime-manifest",
  "/screen-contracts",
  "/activation/capabilities",
  "/governance/approvals/history?workspace_id=workspace_execution_manager",
  ...ENVS.map((e) => `/durable-mirror/integrity?environment=${e}`),
  "/durable-mirror/integrity",
  "/compositions/command-center",
  "/compositions/operations?workspace_id=workspace_execution_manager",
  "/compositions/waivers?state=OPEN&limit=50",
  "/compositions/admin-action-drawer",
  "/compositions/not-a-surface",
  "/command-center",
  "/command-center/realtime-snapshot",
  "/command-center/stream",
  "/screens/paper",
  "/screens/sandbox",
  "/screens/live",
  "/screens/blotter",
  "/screens/blotter?limit=25&status_bucket=FILLED",
  "/screens/blotter?limit=10&symbol=BTCUSDT&venue=BINANCE&side=BUY",
  "/screens/blotter?after=not-a-cursor",
  "/screens/paper/dep_94",
  "/screens/paper/dep_vnm/vn-market",
  "/screens/accounts/acc_bnc_core",
  "/resources/alphas/alpha_a",
  "/resources/alphas/alpha_btc_trend",
  "/resources/alphas/alpha_empty",
  "/resources/alphas/alpha_denied",
  "/resources/alphas/alpha_down",
  "/resources/portfolios/pf_main",
  "/resources/portfolios/pf_TEST_ONLY_core",
  "/resources/portfolios/pf_TEST_ONLY_satellite",
  "/resources/portfolios/pf_TEST_ONLY_yen",
  "/resources/portfolios/pf_TEST_ONLY_empty",
  "/resources/portfolios/pf_TEST_ONLY_error",
  "/resources/portfolios/pf_TEST_ONLY_missing",
  "/resources/accounts/acc_a",
  "/resources/accounts/acc_bnc_core",
  "/resources/accounts/acc_bnc_sub",
  "/resources/accounts/acc_bnc_sat",
  "/resources/accounts/acc_okx_main",
  "/resources/accounts/acc_pap_sim",
  "/resources/accounts/acc_tn_bnc",
  "/resources/accounts/acc_err",
  "/resources/accounts/acc_unknown",
  "/resources/bindings/bnc_main@BINANCE",
  "/resources/alphas/alpha_btc_trend/orders?environment=paper&limit=2",
  "/resources/alphas/alpha_btc_trend/fills?environment=paper&limit=3",
  "/resources/accounts/acc_bnc_core/orders?environment=live&limit=2",
  "/resources/accounts/acc_bnc_core/fills?environment=live",
  "/resources/accounts/acc_pap_sim/orders?environment=paper",
  ...ENVS.map((e) => `/profiles/${e}/realtime-snapshot`),
  ...ENVS.map((e) => `/profiles/${e}/stream`),
  "/derivations/source-health",
  ...ENVS.map((e) => `/derivations/source-health?environment=${e}`),
  "/derivations/source-health?environment=nope",
  ...ENVS.map((e) => `/derivations/deployments/dep_a/execution-quality?environment=${e}`),
  ...ENVS.map((e) => `/derivations/portfolios/pf_main/capital?environment=${e}`),
  ...ENVS.map((e) => `/derivations/portfolios/pf_TEST_ONLY_core/capital?environment=${e}`),
  "/derivations/portfolios/pf_TEST_ONLY_yen/capital?environment=paper",
  "/derivations/portfolios/pf_TEST_ONLY_core/capital",
  ...ENVS.map((e) => `/derivations/alphas/alpha_a/activity?environment=${e}`),
  "/derivations/alphas/alpha_btc_trend/activity?environment=paper",
  "/derivations/alphas/alpha_a/anything-else?environment=paper",
  "/derivations/conditional-groups/grp_00137?environment=paper",
  "/derivations/conditional-groups/grp_nope?environment=paper",
  "/views/equity-chart?environment=paper&subject_kind=alpha&subject_id=alpha_a&metric=equity&viewport_px=960",
  "/views/equity-chart?environment=paper&subject_kind=alpha&subject_id=alpha_btc_trend&metric=equity",
  "/views/equity-chart?environment=live&subject_kind=portfolio&subject_id=pf_TEST_ONLY_core&metric=equity",
  "/views/equity-chart?environment=paper&subject_kind=portfolio&subject_id=pf_TEST_ONLY_yen&metric=equity",
  "/views/equity-chart?environment=live&subject_kind=portfolio&subject_id=pf_TEST_ONLY_satellite&metric=equity",
  "/views/equity-chart?environment=live&subject_kind=account&subject_id=acc_bnc_core&metric=equity",
  "/views/equity-chart?environment=live&subject_kind=account&subject_id=acc_pap_sim&metric=equity",
  "/views/observed-timeline?environment=paper&subject_kind=alpha&subject_id=alpha_btc_trend",
  "/views/observed-timeline?environment=paper&subject_kind=account&subject_id=acc_a",
  "/market/venue-candles?environment=paper&venue=BINANCE&symbol=ETHUSDT&interval=1h&from_ms=1&to_ms=2",
  "/market/venue-candles?venue=OKX&interval=15m",
  "/market/candles?environment=paper&symbol=ETHUSDT&interval=1h",
  ...[
    "orders", "fills", "strategies", "strategy-deployments", "order-brackets", "order-bracket-legs",
    "conditional-order-groups", "conditional-order-group-legs", "portfolio-capital-ledger",
    "portfolio-equity-snapshots", "sizing-decisions", "execution-sessions", "command-journal",
    "broker-account-sync-current-state", "reconciliation-findings",
  ].map((r) => `/manager/current/${r}?environment=paper&limit=200`),
  "/manager/current/orders?environment=live&limit=5",
  "/manager/current/orders",
  "/manager/current/not-in-the-catalogue?environment=paper&limit=200",
  "/alphas/equity-sparklines?environment=paper",
  "/alphas/av_2041/stage-drift",
  "/alphas/alpha_btc_trend/stage-drift?days=3",
  "/alphas/alpha_a/query-analytics",
  "/portfolios/pf_main/query-analytics",
  "/commands/tasks",
  "/commands/catalog",
  "/alphas",
  "/alphas?search=Basis",
  "/alphas?stage=LIVE",
  "/alphas?owner=Lan-002&health=READY",
  "/alphas?sort=-updated_at",
  "/alphas?sort=stage_rank:desc,alpha_label",
  "/alphas?sort=bogus",
  "/alphas?limit=2",
  "/alphas?limit=0",
  "/alphas?after=nope",
  "/alphas?limit=2&after=alpha_b",
  "/alphas?limit=2&before=alpha_d",
  "/portfolios",
  "/broker-bindings",
  "/broker-bindings?environment=live",
  "/broker-bindings?environment=paper",
  "/broker-bindings?environment=sandbox",
  "/broker-bindings?environment=nope",
  "/broker-bindings?environment=live&limit=2",
  "/broker-bindings?environment=live&search=okx&venue=OKX&state=ACTIVE",
  "/broker-bindings?environment=live&limit=2&after=bnd1.garbage",
  "/broker-bindings/bnc_main@BINANCE?environment=live",
  "/broker-bindings/pap_sim@BINANCE?environment=live",
  "/broker-bindings/nope?environment=live",
  "/broker-bindings/bnc_main@BINANCE/exposure",
  "/broker-bindings/okx_main@OKX/exposure",
  "/broker-bindings/nope/exposure",
  "/governance/approvals",
  "/governance/approvals?filter=NEEDS_YOU",
  "/governance/approvals?view=OVERDUE&limit=1",
  "/governance/approvals?limit=2",
  "/governance/approvals/AP-201/r1",
  "/governance/approvals/AP-352/r2",
  "/governance/approvals/AP-900/live",
  "/governance/exit-reviews/EX-771",
  "/governance/waivers",
  "/governance/waivers?state=OPEN&limit=2",
  "/operations",
  "/operations?limit=3",
  "/operations?triage_state=UNACKNOWLEDGED&environment=LIVE",
  "/operations?target_type=PORTFOLIO",
  "/operations?target_type=PORTFOLIO&limit=2",
  "/operations?assigned_to=me",
  "/operations?bogus=1",
  "/operations?limit=999",
  "/operations?sort=created_at:asc&limit=4",
  "/operations?after=garbage",
  "/operations/incidents/inc_fixture_44",
  "/operations/incidents/inc_TEST_ONLY_mitigated",
  "/operations/incidents/inc_TEST_ONLY_resolved",
  "/operations/incidents/inc_LEGACY_SHAPE",
  "/operations/incidents/inc_NOT_FOUND",
  "/operations/op_1",
  "/deployments/dep_1/certification",
  "/deployments/dep_1/canary",
  "/deployments/dep_1/live",
  "/orders/ord_00137/funnel",
  "/orders/ord_00136/funnel",
  "/orders/ord_nope/funnel",
  "/portfolios/pf_main/correlation",
  "/portfolios/pf_TEST_ONLY_satellite/correlation",
  "/portfolios/pf_main/capital-ledger?environment=live",
  "/portfolios/pf_TEST_ONLY_core/capital-ledger?environment=live",
  "/portfolios/pf_TEST_ONLY_core/capital-ledger?environment=paper",
  "/portfolios/pf_TEST_ONLY_yen/capital-ledger?environment=paper",
  "/portfolios/pf_TEST_ONLY_error/capital-ledger?environment=live",
  "/portfolios/PF-CRYPTO/cross-equity",
  "/this/route/does/not/exist",
  "/",
];

/** Chains: follow a keyset cursor from the first page. */
export const CHAINS: { start: string; param: string; hops: number }[] = [
  { start: "/screens/blotter?limit=20", param: "after", hops: 3 },
  { start: "/operations?limit=4", param: "after", hops: 3 },
  { start: "/alphas?limit=2", param: "after", hops: 3 },
  { start: "/broker-bindings?environment=live&limit=1", param: "after", hops: 3 },
  { start: "/governance/approvals?limit=2", param: "after", hops: 3 },
  { start: "/resources/alphas/alpha_btc_trend/orders?environment=paper&limit=3", param: "after", hops: 2 },
  { start: "/resources/accounts/acc_bnc_core/orders?environment=live&limit=1", param: "after", hops: 2 },
];

export interface PostCase {
  path: string;
  method: string;
  body?: unknown;
}

/** Writes and unmodelled methods, in a FIXED order (the plan double counts calls). */
export const POSTS: PostCase[] = [
  { method: "POST", path: "/governance/approvals" },
  { method: "POST", path: "/governance/sandbox/capture-note" },
  { method: "POST", path: "/commands/plans" },
  { method: "POST", path: "/commands/plans" },
  { method: "POST", path: "/commands/plans" },
  { method: "POST", path: "/commands/plans" },
  { method: "POST", path: "/approvals/AP-1/capital-preview" },
  { method: "POST", path: "/alphas/alpha_a/insight-previews" },
  { method: "POST", path: "/operations/op_1/acknowledge" },
  { method: "POST", path: "/operations/op_1/resolve" },
  { method: "POST", path: "/operations/op_1/apply" },
  { method: "POST", path: "/commands/tasks/health/run" },
  { method: "POST", path: "/governance/r2/capture" },
  { method: "POST", path: "/not/modelled" },
  { method: "PUT", path: "/alphas" },
  { method: "DELETE", path: "/alphas/alpha_a" },
  { method: "PATCH", path: "/operations/op_1" },
];

export interface Observed {
  status: number;
  contentType: string;
  /** Exactly the string the browser would have received. */
  bodyText: string;
  /** True when the answerer said "not mine" (the old path's 501 `bff_double_gap`). */
  gap?: boolean;
}

export interface GoldenEntry {
  status: number;
  contentType: string;
  sha256: string;
  bytes: number;
  gap: boolean;
}

export const digest = (text: string): string => createHash("sha256").update(text).digest("hex");

export function isGapBody(text: string): boolean {
  try {
    const parsed = JSON.parse(text) as { error?: { code?: string } };
    return parsed.error?.code === "bff_double_gap";
  } catch {
    return false;
  }
}

export type Driver = (method: string, pathAndQuery: string, body?: unknown) => Promise<Observed>;

/** The cursor a keyset page offers, wherever the page keeps it. */
export function nextCursor(bodyText: string): string | null {
  try {
    const body = JSON.parse(bodyText) as {
      page?: { next_cursor?: unknown };
      data?: { page?: { next_cursor?: unknown } };
    };
    const cursor = body.page?.next_cursor ?? body.data?.page?.next_cursor;
    return typeof cursor === "string" && cursor !== "" ? cursor : null;
  } catch {
    return null;
  }
}

/**
 * Walks the whole matrix with `driver` and returns `key -> observed`. The keys
 * are stable, so two drivers produce comparable maps. `reset` runs before the
 * stateful sequence (the plan double counts calls).
 */
export async function walkMatrix(
  driver: (optionsKey: string) => Driver,
  reset: () => void,
): Promise<Map<string, Observed>> {
  const out = new Map<string, Observed>();
  for (const { key } of OPTION_SETS) {
    const call = driver(key);
    reset();
    for (const path of GET_PATHS) out.set(`${key} GET ${path}`, await call("GET", `${PREFIX}${path}`));
    for (const chain of CHAINS) {
      let url = chain.start;
      for (let hop = 0; hop <= chain.hops; hop += 1) {
        const seen = await call("GET", `${PREFIX}${url}`);
        out.set(`${key} CHAIN ${chain.start} #${hop}`, seen);
        const cursor = nextCursor(seen.bodyText);
        if (cursor === null) break;
        const joiner = chain.start.includes("?") ? "&" : "?";
        url = `${chain.start}${joiner}${chain.param}=${encodeURIComponent(cursor)}`;
      }
    }
    reset();
    let n = 0;
    for (const post of POSTS) {
      n += 1;
      out.set(`${key} ${post.method} ${post.path} @${n}`, await call(post.method, `${PREFIX}${post.path}`, post.body));
    }
  }
  return out;
}
