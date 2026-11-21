/**
 * The BFF double for the five S3 stage screens (UXM-07 S3 W-E2E): Paper workbench, Sandbox certification,
 * Canary control room, Live operations and New request (page and drawer).
 *
 * Lane: BFF_DOUBLE / FIXTURE_LAB. Every body here is derived from a canonical fixture Codex published in
 * `packages/contracts/fixtures`, by cloning a row or overriding a field, never invented from nothing; the
 * unit suites of the screens build their port fakes from the same fixtures and the same logic (see
 * `v2/screens/workbench/workbench.harness.fixtures.ts`, `sandbox/testApi.ts`, `live/live.testbase.ts`).
 *
 * What is selectable, and how (all of it only with `screensV2`, so the V1 journeys and the recorded golden
 * keep the answers they have):
 *
 *   - which deployments get these answers: every id except the legacy ones the V1 journeys and the golden
 *     use (`dep_1`, `dep_94`, `dep_a`, `dep_vnm`);
 *   - which body a stage route answers, by the `workspace_id` of the read (the same convention the Access
 *     double uses):
 *       (none, anything else)  the V1 body. Sandbox: the published V1 body made RICH at the view-model level
 *                              (steps PASS/FAIL/UNAVAILABLE, findings, plans, timeline), still schema-valid.
 *                              Canary and Live: the published dark (`unavailable`) bodies, because the V1
 *                              schemas pin dark constants (S3 plan section 0, finding 1): a "lit" Canary or
 *                              Live cannot be wire-valid, so it exists only in the screens' unit suites.
 *       ws_TEST_SCOPED_V2      the V2 body (`portal.execution.following-parent.v2` for Sandbox and Canary,
 *                              `portal.execution.live-source-operations.v2` for Live, which pages its
 *                              orders and fills in three keyset pages through `?panel=&cursor=`). With `?include=` (BE-P12)
 *                              the V2 body also carries the opt-in members, from the canonical fixtures: `identity`
 *                              (all three), `stage_facts` (Live). Without it the body is the one it always was;
 *                              the V1 bodies ignore the parameter;
 *       ws_TEST_DENIED         403 ACCESS_DENIED;
 *       ws_TEST_NOTE_OFF       the capabilities read answers SANDBOX_NOTE UNAVAILABLE;
 *   - what a write answers, by the TEXT of the summary (writes only read the body when it carries one):
 *       "DUPLICATE ..."        409 duplicate open request naming AP-201;
 *       "REFUSE ..."           a typed refusal (422 CLAIM_NOT_ELIGIBLE / 409 SANDBOX_NOTE_VERSION_CONFLICT);
 *       "DENIED ..."           403;
 *       "REPLAY ..."           the success body with `replayed: true`;
 *       anything else          success, echoing the request key, the alpha and the certification.
 *     No state is kept: the same request answers the same way every time.
 *
 * Populated or dark, per decision D4 (honest absences): Paper is populated (orders including one UNKNOWN,
 * fills, positions, 200 equity snapshots, a partial quality read, the observation gate); Sandbox is populated
 * at the view-model level on the V1 body and positive on the V2 body; Canary and Live are DARK on the V1
 * bodies and populated only on the V2 bodies (which carry what Codex published: a draft envelope, retained
 * observations).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { fromCents, inWorldClock, toCents } from "./bffWorld";
import { equityOf } from "./bffWorldBooks";
import { resolveStageDeployment } from "./bffWorldStage";

interface Answer {
  status: number;
  body: unknown;
  contentType?: string;
}

type Row = Record<string, unknown>;

const CONTRACTS = join(dirname(fileURLToPath(import.meta.url)), "../../../../packages/contracts/fixtures");
const canonical = (name: string): unknown => inWorldClock(JSON.parse(readFileSync(join(CONTRACTS, name), "utf8"))); // F4: the canonical file is written at 17 Oct 12:04Z; the double serves it at the world clock
const fresh = <T>(name: string): T => canonical(name) as T;

const ok = (body: unknown): Answer => ({ status: 200, body });
const problem = (status: number, code: string, message: string): Answer => ({ status, body: { error: { code, message } } });

/* ── who gets these answers, and which body ───────────────────────────────── */

export const STAGE_V2_WORKSPACE = "ws_TEST_SCOPED_V2";
export const STAGE_DENIED_WORKSPACE = "ws_TEST_DENIED";
export const STAGE_NOTE_OFF_WORKSPACE = "ws_TEST_NOTE_OFF";

/** The deployment ids the V1 journeys and the recorded golden use: they keep the V1-era answers. */
const LEGACY_DEPLOYMENT = /^dep_(?:\d+|a|vnm)$/;
export const isStageDeployment = (id: string): boolean => !LEGACY_DEPLOYMENT.test(id);

const SAFE_ID = /[^A-Za-z0-9._:-]/g;
const safeId = (id: string): string => id.replace(SAFE_ID, "_").slice(0, 120);

/* ── Paper workbench: GET /screens/paper/{id}[/vn-market] ─────────────────── */

const ORDER_COUNT = 40;
const EQUITY_ROWS = 200;
const AS_OF = "2026-08-22T12:59:00Z"; // WORLD: the world clock (13:00Z), so no order or point of this page is later than its own as-of
const READ_AT = "2026-08-22T13:00:00Z";
const HOUR = 3_600_000;
const END_MS = Date.UTC(2026, 7, 22, 12, 56, 0);

const pad = (n: number, width = 5): string => String(n).padStart(width, "0");
const iso = (ms: number): string => new Date(ms).toISOString();

/** One order state per index, with exactly one UNKNOWN, a few REJECTED and open ones, the rest FILLED. */
function orderStatus(i: number): string {
  if (i === 3) return "UNKNOWN";
  if (i % 9 === 2) return "REJECTED";
  if (i % 11 === 6) return "SUBMITTED";
  return "FILLED";
}

export function paperOrders(): Row[] {
  return Array.from({ length: ORDER_COUNT }, (_, i) => ({
    order_id: `ord_${pad(i)}`,
    client_order_id: `c-0044-${pad(i, 4)}`,
    instrument_id: "BTCUSDT",
    side: i % 2 === 0 ? "BUY" : "SELL",
    status: orderStatus(i),
    quantity: (0.04 + (i % 5) * 0.02).toFixed(2),
    price: (67_000 + i * 12.5).toFixed(2),
    submitted_at: iso(END_MS - (ORDER_COUNT - i) * 40 * 60_000),
  }));
}

const ORDERS = paperOrders();

export function paperFills(): Row[] {
  return ORDERS
    .filter((order) => order.status === "FILLED")
    .map((order, i) => ({
      fill_id: `fill_${pad(i)}`,
      client_order_id: order.client_order_id,
      order_id: order.order_id,
      quantity: order.quantity,
      price: order.price,
      commission: (Number(order.price) * Number(order.quantity) * 0.0004).toFixed(2),
      commission_currency: "USDT",
      trade_time: iso(Date.parse(String(order.submitted_at)) + 2 * 60_000),
    }));
}

const FILL_COUNT = ORDERS.filter((o) => o.status === "FILLED").length;

export function equityRows(): Row[] {
  let peak = 0;
  return Array.from({ length: EQUITY_ROWS }, (_, i) => {
    const equity = 100_000 + i * 35 + Math.sin(i / 9) * 900;
    peak = Math.max(peak, equity);
    const drawdown = (equity - peak) / peak;
    return {
      ts: iso(END_MS - (EQUITY_ROWS - 1 - i) * HOUR),
      currency: "USDT",
      equity: equity.toFixed(2),
      net_pnl: (equity - 100_000).toFixed(2),
      fee_total: (12.4 + i * 0.35).toFixed(2),
      funding_pnl: null,
      cash_free: (equity - 10_600).toFixed(2),
      cash_locked: "10600.00",
      total_fills: Math.min(i + 1, FILL_COUNT),
      state_digest: "9c1e04b7a2f1ffff",
      snapshot_reason: "PERIODIC",
      source: "paper-0044",
      drawdown: drawdown === 0 ? "0" : drawdown.toFixed(4),
    };
  });
}

/** The deployment profile of the Paper workbench: a populated partial body (capabilities say what is dark). */
export function paperProfile(deploymentId: string, variant: "standard" | "vn-market"): Row {
  const wire = fresh<Row>(variant === "vn-market" ? "execution-paper-workbench-vnm.partial.valid.json" : "execution-paper-workbench.partial.valid.json");
  const deployment = {
    deployment_id: deploymentId,
    // Real ids of the other doubles, so the workbench's links land on screens that have data.
    strategy_id: "alpha_btc_trend",
    portfolio_id: "pf_TEST_ONLY_core",
    account_id: "acc_pap_sim",
    venue: "binance",
    mode: "paper",
    active: true,
    updated_at: AS_OF,
  };
  const positions = [
    { instrument_id: "BTCUSDT", side: "LONG", quantity: "0.12", avg_px_open: "67420.50", mark_price: "67500.00", unrealized_pnl: "9.54", updated_at: AS_OF },
    { instrument_id: "ETHUSDT", side: "SHORT", quantity: "1.50", avg_px_open: "2610.40", mark_price: "2598.10", unrealized_pnl: "18.45", updated_at: AS_OF },
    { instrument_id: "SOLUSDT", side: "FLAT", quantity: "0", avg_px_open: "0", mark_price: "152.30", unrealized_pnl: "0", updated_at: AS_OF },
  ];
  return {
    ...wire,
    read_at: READ_AT,
    as_of: AS_OF,
    resource: { ...((wire.resource as Row) ?? {}), id: deploymentId },
    data: {
      ...((wire.data as Row) ?? {}),
      deployment,
      deployments: [deployment],
      observation_gate: {
        state: "PARTIAL",
        observed_days: 3,
        policy_minimum_observed_days: 14,
        trade_count: FILL_COUNT,
        policy_minimum_trade_count: 60,
        session_count: 1,
        window_bounded: true,
        reason_code: "SOURCE_RETENTION_SHORT",
        policy_stage: "PAPER_OBSERVATION",
        policy_version: "paper.v1",
      },
      positions,
      orders: ORDERS.map((o) => ({ ...o })),
      fills: paperFills(),
      account_equity: equityRows(),
      history_windows: { account_equity: { days: 90, basis: "PORTAL_SGP_HISTORY_MIRROR", returned_rows: equityRows().length, source_rows: 1438, truncated: false, downsample: { method: "PER_SERIES_BUCKET_EXTREMA", bucket_seconds: 3600, series_count: 1, input_rows: 1438, output_rows: equityRows().length } } },
    },
  };
}

/** The execution-quality derivation for a stage deployment: counts that agree with the profile's rows, latency dark. */
export function withStageQuality(base: Row): Row {
  const orders = ORDERS;
  const filled = orders.filter((o) => o.status === "FILLED").length;
  const rejected = orders.filter((o) => o.status === "REJECTED").length;
  return {
    ...base,
    data: {
      ...((base.data as Row) ?? {}),
      execution_session_population: "1",
      order_population: String(orders.length),
      fill_population: String(filled),
      submitted_count: String(orders.length),
      risk_rejected_count: "0",
      broker_rejected_count: String(rejected),
      filled_count: String(filled),
      rejected_count: String(rejected),
      reject_rate: { numerator: String(rejected), denominator: String(orders.length) },
    },
  };
}

/* ── Sandbox: GET /deployments/{id}/certification ─────────────────────────── */

/** The published V1 body made rich the way the Sandbox suites do (`testApi.ts` `v1Rich`): still schema-valid. */
function sandboxV1(deploymentId: string): Row {
  const body = fresh<Row>("execution-sandbox-certification.unavailable.valid.json");
  const cert = body.certification as Row;
  body.certification = { ...cert, certification_id: `scert_${safeId(deploymentId)}`, deployment_id: deploymentId };
  const states = ["PASS", "PASS", "PASS", "FAIL", "PASS", "UNAVAILABLE", "UNAVAILABLE"];
  (body.steps as Row[]).forEach((step, index) => {
    step.evaluation_state = states[index];
    step.strip_state = index < 3 ? "DONE" : index === 3 ? "CURRENT" : "PENDING";
    step.summary = states[index] === "PASS" ? `Step ${index + 1} evidence accepted.` : states[index] === "FAIL" ? "2 findings are still open." : "Cleanup evidence has not arrived yet.";
    step.source_verification_state = states[index] === "PASS" ? "VERIFIED" : "UNAVAILABLE";
    step.evidence_hash = states[index] === "PASS" ? `sha256:${"c".repeat(64)}` : null;
    step.evidence_schema_version = states[index] === "PASS" ? "sandbox-evidence.v1" : null;
    step.as_of = states[index] === "PASS" ? new Date(Date.UTC(2026, 7, 21, 18, 46 + index)).toISOString() : null;
    step.expires_at = states[index] === "PASS" ? "2026-08-28T18:46:00.000Z" : null;
    step.blocker_code = states[index] === "PASS" ? null : `SANDBOX_STEP_${String(step.step_key)}_${states[index]}`;
  });
  body.progress = {
    passed_count: 4,
    total_count: 7,
    eligible: false,
    evidence_set_hash: `sha256:${"d".repeat(64)}`,
    blocker_codes: ["SANDBOX_STEP_RECONCILIATION_FAIL", "SANDBOX_STEP_CLEANUP_UNAVAILABLE", "SANDBOX_STEP_EXIT_REVIEW_UNAVAILABLE"],
  };
  body.findings = {
    total_count: 2,
    returned_count: 2,
    truncated: false,
    rows: [
      { finding_id: "fnd_TEST_ONLY_1", severity: "WARNING", source_authority: "DERIVED", finding_code: "FEE_DIFF", summary: "Fee total differs by 0.01 USDT", blocking: false, evidence_hash: null, as_of: null, resolved_at: null, created_at: "2026-08-22T12:58:00.000Z" },
      { finding_id: "fnd_TEST_ONLY_2", severity: "INFO", source_authority: "DERIVED", finding_code: "FILL_LATE", summary: "Fill 3 arrived 4 s late", blocking: false, evidence_hash: null, as_of: null, resolved_at: null, created_at: "2026-08-22T12:11:00.000Z" },
    ],
  };
  body.timeline = {
    total_count: 2,
    returned_count: 2,
    truncated: false,
    rows: [
      { event_id: "evt_TEST_ONLY_2", actor_user_id: "usr_TEST_ONLY_a", action: "SUBMIT", workflow_version_before: 1, workflow_version_after: 2, created_at: "2026-08-22T12:58:00.000Z" },
      { event_id: "evt_TEST_ONLY_1", actor_user_id: "usr_TEST_ONLY_a", action: "CREATE", workflow_version_before: 0, workflow_version_after: 1, created_at: "2026-08-21T18:51:00.000Z" },
    ],
  };
  body.promotion_plans = [
    { plan_id: "plan_TEST_ONLY_1", target_stage: "CANARY", evidence_set_hash: `sha256:${"e".repeat(64)}`, status: "BLOCKED", blocker_codes: ["SANDBOX_NOT_ELIGIBLE"], source_side_effect_requested: false, created_at: "2026-08-22T13:06:00.000Z" },
  ];
  return body;
}

function parentV2(key: "sandbox" | "canary", deploymentId: string): Row {
  const body = (fresh<Row>("execution-positive-parent.synthetic.valid.json")[key] ?? {}) as Row;
  const anchors = (body.anchors as Row) ?? {};
  const next: Row = { ...body, observed_at_ms: LIVE_OBSERVED_MS, anchors: { ...anchors, deployment_id: deploymentId } };
  if (key === "canary") return worldCanary(next, deploymentId);
  if (key === "sandbox") {
    next.certification = { ...((body.certification as Row) ?? {}), certification_id: `scert_${safeId(deploymentId)}` };
  }
  return next;
}

/** Which V1/V2/denied answer a stage read gets: the workspace of the read decides. */
type StageRoute = "certification" | "canary" | "live";

/**
 * `?include=` (BE-P12), SCOPED_V2 only: the opt-in members a stage body carries. The members come from the canonical fixtures
 * (`sandbox_identity`, `canary_identity` of the positive-parent file; `with_members` of the live-source file); a read that
 * does not ask gets the body it always got, byte for byte. Sandbox and Canary publish `identity`; Live publishes `identity`
 * and `stage_facts`. A repeated parameter, an empty or repeated token, or one the route does not publish is a 400, as on the
 * server; the legacy (V1) body ignores the parameter, so it is not read there at all.
 */
const INCLUDE_TOKENS: Record<StageRoute, readonly string[]> = { certification: ["identity"], canary: ["identity"], live: ["identity", "stage_facts"] };

function includeAsked(route: StageRoute, search: URLSearchParams): ReadonlySet<string> | null {
  const values = search.getAll("include");
  if (values.length === 0) return new Set();
  if (values.length > 1) return null;
  const tokens = values[0]!.split(",");
  const allowed = INCLUDE_TOKENS[route];
  if (new Set(tokens).size !== tokens.length || tokens.some((token) => !allowed.includes(token))) return null;
  return new Set(tokens);
}

const includeRefused = (): Answer => problem(400, "EXECUTION_READ_QUERY_INVALID", "include is a comma list of distinct tokens this read publishes.");

/** The parent body with the identity the fixture publishes, when asked. */
function withParentMembers(body: Row, key: "sandbox" | "canary", asked: ReadonlySet<string>, deploymentId: string): Row {
  if (!asked.has("identity")) return body;
  const published = (fresh<Row>("execution-positive-parent.synthetic.valid.json")[`${key}_identity`] ?? {}) as Row;
  return { ...body, identity: worldIdentity(published.identity, deploymentId) };
}

function stageAnswer(route: StageRoute, deploymentId: string, search: URLSearchParams): Answer {
  const workspace = search.get("workspace_id");
  if (workspace === STAGE_DENIED_WORKSPACE) return problem(403, "ACCESS_DENIED", "Your session may not read this deployment's stage screen.");
  if (workspace === STAGE_V2_WORKSPACE) {
    const asked = includeAsked(route, search);
    if (asked === null) return includeRefused();
    if (route === "certification") return ok(withParentMembers(parentV2("sandbox", deploymentId), "sandbox", asked, deploymentId));
    if (route === "canary") return ok(withParentMembers(parentV2("canary", deploymentId), "canary", asked, deploymentId));
    return liveV2(deploymentId, search, asked);
  }
  if (route === "certification") return ok(sandboxV1(deploymentId));
  if (route === "canary") {
    const body = fresh<Row>("execution-canary-control-room.unavailable.valid.json");
    return ok({ ...body, deployment: { ...((body.deployment as Row) ?? {}), deployment_id: deploymentId } });
  }
  const body = fresh<Row>("execution-live-full-operations.unavailable.valid.json");
  return ok({ ...body, deployment: { ...((body.deployment as Row) ?? {}), deployment_id: deploymentId } });
}

/* ── the world's own figures on the V2 stage bodies (F2 D1/D5) ────────────────
 *
 * The canonical V2 fixtures Codex published (`execution-positive-parent`, `execution-live-source`) carry the precision-boundary values
 * on purpose: `9007199254740993.123456789123456789` (2^53 plus a fraction), `0.000000000000000001` for a cap or a quantity, the
 * placeholders `TEST_ONLY:BTC-USDT`, `TEST_ONLY:venue`, `TEST_ONLY:USD` and `alpha_TEST_ONLY_identity`. They are right for the contract
 * and unit suites, which load them straight from the file, and wrong for a world a person browses: a Canary envelope capped at 9.0 quadrillion
 * USDT, a Live position of quantity 0 with that entry price, an alpha called "alpha_TEST_ONLY_identity". The fixture world therefore
 * serves the same BODY SHAPE with the figures of the deployment the page is about: its allocation, its Net PnL, its venue and account,
 * its alpha and portfolio. The file on disk is untouched, so every test that reads it keeps its boundary assertion.
 *
 * What is derived, all in exact integer arithmetic (cents; a quantity of 0.50 is exact in the 4-place decimals below):
 *   Canary envelope  capital cap = allocation, gross notional cap = 1.5 x allocation, daily loss cap = 1% of allocation;
 *   Live position    quantity 0.50 LONG BTCUSDT, entry 67,000.00, mark = entry + unrealised / 0.50 (so quantity x (mark - entry) IS the
 *                    deployment's unrealised PnL), realised PnL = the deployment's realised;
 *   Account balance  total = allocation + realised + unrealised = `equityOf`, the figure the equity projection of the same deployment ends on.
 * A deployment the world does not hold gets the Live room's own booking (`dep_live_01`, 40,000.00).
 */
const FALLBACK_BOOK = { allocation: "40000.00", realized: "980.40", unrealized: "140.40", venue: "BINANCE", accountId: "acct_binance_02", alphaId: "alpha_a", alphaName: "Carry A", portfolioName: "Core", currency: "USDT" } as const;

function bookOf(deploymentId: string): { allocation: string; realized: string; unrealized: string; venue: string; accountId: string; alphaId: string; alphaName: string; portfolioName: string; currency: string } {
  const found = resolveStageDeployment(deploymentId);
  if (found === null) return { ...FALLBACK_BOOK };
  const { alpha, deployment } = found;
  return { allocation: deployment.allocation, realized: deployment.realized, unrealized: deployment.unrealized, venue: deployment.venue, accountId: deployment.accountId, alphaId: alpha.id, alphaName: alpha.label, portfolioName: deployment.portfolioName, currency: deployment.currency };
}

/** A cents amount as an exact decimal string with at most `places` fraction digits (4 = ten-thousandths), trailing zeros kept to cents. */
function decimalOf(units: bigint, scale: bigint, places: number): string {
  const negative = units < 0n;
  const abs = negative ? -units : units;
  const whole = abs / scale;
  const fraction = String(abs % scale).padStart(places, "0").replace(/0+$/, "").padEnd(2, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

/** The instant of a Live read: just inside the world clock (13:00Z), so no row and no stamp of the page is later than its own as-of. The canonical file says 18 Oct 00:00Z, a day AFTER the world. */
const LIVE_OBSERVED_MS = Date.UTC(2026, 7, 22, 12, 59, 0);
/** Row `n` of a paged panel (oldest first): one minute apart, the last one a minute before the read. */
const liveRowMs = (n: number): number => LIVE_OBSERVED_MS - (LIVE_PAGES * LIVE_PAGE_SIZE - n) * 60_000;
const ENTRY_CENTS = 6_700_000n;
const QUANTITY_TENTHS = 5n; // 0.5

/**
 * The identity member the V2 body carries when asked: the deployment's own alpha id and portfolio name. The published schema CLOSES the alpha
 * name (`alpha_name` is null with the constant reason `ALPHA_NAME_NOT_PUBLISHED`; `server.test.ts` caught it when the name was first overlaid), so
 * the name and its reason stay as the contract publishes them and only the two values it does publish become the world's.
 */
function worldIdentity(identity: unknown, deploymentId: string): unknown {
  if (!isRow(identity)) return identity;
  const book = bookOf(deploymentId);
  return { ...identity, alpha_id: book.alphaId, portfolio_name: book.portfolioName };
}

function worldCanary(body: Row, deploymentId: string): Row {
  const proposal = body.proposal;
  if (!isRow(proposal)) return body;
  const book = bookOf(deploymentId);
  const allocation = toCents(book.allocation);
  return {
    ...body,
    proposal: { ...proposal, currency: book.currency, capital_cap: fromCents(allocation), gross_notional_cap: fromCents((allocation * 3n) / 2n), daily_loss_cap: fromCents(allocation / 100n) },
  };
}

/** One Live `data` block: the records keep their ids, states and paging; the figures and the labels are the deployment's. */
function worldLiveData(data: Row, deploymentId: string): Row {
  const book = bookOf(deploymentId);
  const unrealized = toCents(book.unrealized);
  const markCents = ENTRY_CENTS + (unrealized * 10n) / QUANTITY_TENTHS; // quantity 0.5: mark - entry = unrealised / 0.5
  const notionalTenThousandths = (markCents * QUANTITY_TENTHS * 100n) / 10n; // cents x tenths -> ten-thousandths of a unit
  const labels = { venue: book.venue, account_id: book.accountId, instrument_id: "BTCUSDT" };
  const figures: Record<string, Row> = {
    positions: { signed_qty: "0.50", quantity: "0.50", avg_px_open: fromCents(ENTRY_CENTS), mark_price: fromCents(markCents), notional: decimalOf(notionalTenThousandths, 10_000n, 4), realized_pnl: fromCents(toCents(book.realized)), unrealized_pnl: fromCents(unrealized) },
    sessions: { submitted_count: "412", risk_rejected_count: "0", filled_count: "389" },
    orders: { quantity: "0.50", price: fromCents(ENTRY_CENTS) },
    fills: { quantity: "0.50", price: fromCents(ENTRY_CENTS) },
    account_balances: { total: fromCents(equityOf({ id: deploymentId, ...book })), locked: "0.00", currency: book.currency },
    margin_balances: { initial: fromCents(toCents(book.allocation) / 10n), currency: book.currency },
  };
  const next: Row = { ...data };
  for (const name of Object.keys(figures)) {
    const panel = data[name];
    if (!isRow(panel) || !Array.isArray(panel.records)) continue;
    next[name] = {
      ...panel,
      records: (panel.records as Row[]).map((record) => {
        const values = isRow(record.values) ? record.values : {};
        const labelled: Row = { ...values };
        for (const [key, text] of Object.entries(labels)) if (key in values) labelled[key] = text;
        for (const [key, text] of Object.entries(figures[name]!)) if (key in values && values[key] !== null) labelled[key] = text;
        if ("updated_at_ms" in values) labelled.updated_at_ms = LIVE_OBSERVED_MS - 60_000;
        return { ...record, values: labelled };
      }),
    };
  }
  return next;
}

/* ── Live V2: GET /deployments/{id}/live?panel=&cursor= (keyset, 3 pages) ──── */

const LIVE_PAGED = ["orders", "fills"] as const;
const LIVE_PAGES = 3;
const LIVE_PAGE_SIZE = 20;
const CURSOR_TAIL = "A".repeat(43);

/** `lps2.<panel>.<8 digits: the page the cursor leads to>.<10 digits>.<43 chars>`: the shape the reader accepts. */
export const liveCursor = (panel: string, page: number): string => `lps2.${panel}.${pad(page, 8)}.1234567890.${CURSOR_TAIL}`;

function cursorPage(panel: string, cursor: string): number | null {
  const match = /^lps2\.([A-Za-z0-9_-]{1,32})\.([0-9]{1,8})\.[0-9]{10}\.[A-Za-z0-9_-]{43}$/.exec(cursor);
  if (match === null || match[1] !== panel) return null;
  const page = Number(match[2]);
  return Number.isInteger(page) && page >= 1 && page < LIVE_PAGES ? page : null;
}

function observationId(panel: string, n: number): string {
  const offset = panel === "orders" ? 0 : 0x10000;
  return `por1_${(offset + n + 1).toString(16).padStart(64, "0")}`;
}

function livePage(base: Row, panel: (typeof LIVE_PAGED)[number], page: number): Row {
  const template = ((base.records as Row[])[0] ?? null) as Row | null;
  if (template === null) return base;
  const records = Array.from({ length: LIVE_PAGE_SIZE }, (_, i) => {
    const n = page * LIVE_PAGE_SIZE + i;
    const values = { ...((template.values as Row) ?? {}) };
    if (panel === "orders") {
      values.order_id = `order_TEST_ONLY_${pad(n, 4)}`;
      values.side = n % 2 === 0 ? "BUY" : "SELL";
      values.quantity = (0.5 + (n % 7) * 0.25).toFixed(2);
      values.price = (67_000 + n * 3.5).toFixed(2);
      values.updated_at_ms = liveRowMs(n);
      values.created_at_ms = liveRowMs(n) - 10 * 60_000;
    } else {
      values.fill_id = `fill_TEST_ONLY_${pad(n, 4)}`;
      values.side = n % 2 === 0 ? "BUY" : "SELL";
      values.quantity = (0.5 + (n % 7) * 0.25).toFixed(2);
      values.price = (67_000 + n * 3.5).toFixed(2);
      values.trade_time_ms = liveRowMs(n);
    }
    return { observation_id: observationId(panel, n), values };
  });
  const next = page + 1 < LIVE_PAGES ? liveCursor(panel, page + 1) : null;
  return { ...base, state: "PARTIAL", reason_code: "AUTHORIZED_RETAINED_OBSERVATIONS_ONLY", records, returned_count: records.length, has_more: next !== null, next_cursor: next };
}

function liveV2(deploymentId: string, search: URLSearchParams, asked: ReadonlySet<string> = new Set()): Answer {
  const panel = search.get("panel");
  const cursor = search.get("cursor");
  let requested: { panel: (typeof LIVE_PAGED)[number]; page: number } | null = null;
  if (panel !== null) {
    if (!(LIVE_PAGED as readonly string[]).includes(panel)) return problem(400, "LIVE_PANEL_NOT_PAGEABLE", "That panel has one page in this fixture.");
    if (cursor !== null && cursor !== "") {
      const page = cursorPage(panel, cursor);
      if (page === null) return problem(409, "LIVE_SOURCE_CURSOR_EXPIRED", "That continuation is no longer valid; read the panel again from its first page.");
      requested = { panel: panel as (typeof LIVE_PAGED)[number], page };
    }
  } else if (cursor !== null && cursor !== "") {
    return problem(400, "LIVE_CURSOR_NEEDS_PANEL", "A continuation belongs to one panel.");
  }
  const body = (fresh<Row>("execution-live-source.synthetic.valid.json").populated ?? {}) as Row;
  const data = worldLiveData({ ...((body.data as Row) ?? {}) }, deploymentId);
  // Every read answers all eleven panels; the orders and fills panels are paged, the requested one at its page.
  for (const name of LIVE_PAGED) {
    data[name] = livePage((data[name] as Row) ?? {}, name, requested !== null && requested.panel === name ? requested.page : 0);
  }
  const members = (fresh<Row>("execution-live-source.synthetic.valid.json").with_members ?? {}) as Row;
  return ok({
    ...body, deployment_id: deploymentId, observed_at_ms: LIVE_OBSERVED_MS, data,
    ...(asked.has("identity") ? { identity: worldIdentity(members.identity, deploymentId) } : {}),
    ...(asked.has("stage_facts") ? { stage_facts: members.stage_facts } : {}),
  });
}

/* ── Review capture capabilities (the workspace picks the answer) ─────────── */

export function captureCapabilities(search: URLSearchParams): Answer | null {
  const workspace = search.get("workspace_id");
  if (workspace === STAGE_DENIED_WORKSPACE) return problem(403, "ACCESS_DENIED", "Your session may not read the capture actions of this workspace.");
  if (workspace !== STAGE_NOTE_OFF_WORKSPACE) return null;
  const actions = [
    { id: "SANDBOX_NOTE", state: "UNAVAILABLE", reason_code: "SANDBOX_NOTE_NOT_OPEN_FOR_THIS_ACTOR" },
    { id: "R2_CREATE", state: "UNAVAILABLE", reason_code: "R2_REVIEW_NOT_OPEN_FOR_THIS_WORKSPACE" },
    { id: "PAPER_EXIT_CREATE", state: "UNAVAILABLE", reason_code: "PAPER_EXIT_REVIEW_NOT_OPEN_FOR_THIS_WORKSPACE" },
    { id: "R2_EXECUTION_GRANT", state: "UNAVAILABLE", reason_code: "SOURCE_OWNED_NOT_PORTAL_AUTHORED" },
    { id: "PAPER_EXIT_PROMOTE", state: "UNAVAILABLE", reason_code: "SOURCE_OWNED_NOT_PORTAL_AUTHORED" },
    { id: "SANDBOX_CERTIFY_SOURCE", state: "UNAVAILABLE", reason_code: "SOURCE_OWNED_NOT_PORTAL_AUTHORED" },
  ];
  return ok({ schema_version: "governance.review-capture-capabilities.v1", authority: "PORTAL", source_side_effect_requested: false, actions });
}

/* ── writes: POST /governance/sandbox/capture-note and POST /governance/approvals ── */

const isRow = (value: unknown): value is Row => typeof value === "object" && value !== null && !Array.isArray(value);
const summaryOf = (body: Row): string => (typeof body.summary === "string" ? body.summary.trim() : "");

/**
 * The Sandbox note. `null` means "no body to read" (the golden's POSTs carry none): the caller keeps its canned answer.
 * The success echoes the request's workspace and certification, which the screen's port checks before it believes the answer.
 */
export function answerSandboxNote(body: unknown): Answer | null {
  if (!isRow(body)) return null;
  const { workspace_id: workspace, request_key: key, certification_id: certification, expected_workflow_version: version } = body;
  if (typeof workspace !== "string" || typeof key !== "string" || typeof certification !== "string" || typeof version !== "number" || summaryOf(body).length < 8) {
    return problem(422, "INVALID_REVIEW_CAPTURE_REQUEST", "workspace_id, request_key, certification_id, expected_workflow_version and a summary of at least 8 characters are required.");
  }
  const summary = summaryOf(body);
  if (summary.startsWith("DENIED")) return problem(403, "GOVERNANCE_ADMIN_REQUIRED", "Recording a review note needs the admin role in this workspace.");
  if (summary.startsWith("REFUSE")) return problem(409, "SANDBOX_NOTE_VERSION_CONFLICT", "The certification moved to another workflow version; read it again before writing a note.");
  // The certification id carries its deployment (`scert_<deployment id>`), so the read path can name it.
  const deployment = certification.startsWith("scert_") ? certification.slice("scert_".length) : "dep_fixture";
  return {
    status: 201,
    body: {
      schema_version: "governance.review-capture.v1",
      authority: "PORTAL",
      workspace_id: workspace,
      action: "SANDBOX_NOTE",
      replayed: summary.startsWith("REPLAY"),
      source_side_effect_requested: false,
      aggregate_id: certification,
      workflow_version: version,
      source_verdict: "NOT_ASSERTED",
      certification_id: certification,
      deployment_id: deployment,
      read_path: `/api/v1/execution/deployments/${deployment}/certification`,
      decision_reason_code: "ACCEPTED_SANDBOX_STEP_EVIDENCE_UNAVAILABLE",
    },
  };
}

/** A short stable digest of a key (FNV-1a), so the same request key names the same approval. */
function hex(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** The published problem for the create route carries request_id (approval-create schema); the generic stage `problem` does not. */
const createProblem = (status: number, code: string, message: string, extra: Record<string, unknown> = {}): Answer => ({ status, body: { error: { code, message }, request_id: "req_double_approval_create", ...extra } });

/** The R1 request. `null` when the body is not a request (the golden's POST carries none). */
export function answerApprovalCreate(body: unknown): Answer | null {
  if (!isRow(body) || typeof body.summary !== "string") return null;
  const summary = summaryOf(body);
  if (summary.startsWith("DENIED")) return createProblem(403, "APPROVAL_CREATE_DENIED", "Your session may not open an approval request in this workspace.");
  if (summary.startsWith("DUPLICATE")) {
    // The server's own shape (FE-074 `DuplicateOpenApprovalProblem`): the existing approval is `details.approval_id`, not part of the message.
    return createProblem(409, "DUPLICATE_OPEN_APPROVAL", "An open approval already exists for this alpha and evidence run.", { details: { approval_id: "AP-201" } });
  }
  if (summary.startsWith("REFUSE")) {
    return createProblem(422, "CLAIM_NOT_ELIGIBLE", "The methodology claim is not eligible for R1 on this run, so no request was opened.");
  }
  const created = fresh<Row>("execution-governance.approval-create.valid.json");
  const approval = created.approval as Row;
  const alpha = typeof body.alpha_id === "string" ? body.alpha_id : String(approval.subject_id);
  const key = typeof body.request_key === "string" ? body.request_key : "key";
  return {
    status: 201,
    body: {
      ...created,
      replayed: summary.startsWith("REPLAY"),
      approval: { ...approval, approval_id: `apr_${hex(key).toUpperCase()}`, subject_id: alpha, subject_label: alpha, quorum_required: 2 },
    },
  };
}

/* ── GET /api/v1/quantbt/runs?limit=50 (outside /api/v1/execution) ───────── */

const run = (id: string, alpha: string, name: string | null, day: number, claims: unknown): Row => ({
  run_id: id,
  status: "COMPLETED",
  created_at_utc_ms: Date.UTC(2026, 7, day + 5),
  binding: { alpha_id: alpha, alpha_name: name },
  ...(claims as Row),
});

const RUN_ITEMS: Row[] = [
  run("run_btc_trend_a2", "alpha_btc_trend", "BTC Trend", 16, {
    eligible_methodology_claim_ids: ["claim_btc_oos", "claim_btc_cost"],
    methodology_claims: [{ id: "claim_btc_oos", grade: "A", state: "ELIGIBLE" }, { id: "claim_btc_cost", grade: "B", state: "ELIGIBLE" }],
  }),
  run("run_btc_trend_a1", "alpha_btc_trend", "BTC Trend", 11, {
    eligible_methodology_claim_ids: ["claim_btc_oos"],
    methodology_claims: [{ id: "claim_btc_oos", grade: "A", state: "ELIGIBLE" }],
  }),
  run("run_eth_mom_b2", "alpha_eth_mom", "ETH Momentum", 14, { eligible_methodology_claim_ids: [] }),
  run("run_eth_mom_b1", "alpha_eth_mom", "ETH Momentum", 9, {
    eligible_methodology_claim_ids: ["claim_eth_walk"],
    methodology_claims: [{ id: "claim_eth_walk", grade: "A", state: "ELIGIBLE" }],
  }),
  run("run_sol_break_c1", "alpha_sol_break", "SOL Breakout", 13, {
    eligible_methodology_claim_ids: null,
    methodology_claims_availability: { reason_code: "R1_CLAIMS_NOT_PUBLISHED" },
  }),
  // Not offered by the picker: only COMPLETED runs that name their alpha are.
  { run_id: "run_sol_break_c0", status: "FAILED", created_at_utc_ms: Date.UTC(2026, 7, 17), binding: { alpha_id: "alpha_sol_break", alpha_name: "SOL Breakout" } },
  { run_id: "run_doge_d1", status: "RUNNING", created_at_utc_ms: Date.UTC(2026, 7, 22), binding: { alpha_id: "alpha_doge_mom", alpha_name: "DOGE Momentum" } },
];

export const QUANTBT_RUNS_PATH = "/api/v1/quantbt/runs";

/** The Run Library list the New request screen reads for its pickers (`readRunOptions`). */
export function answerQuantbtRuns(method: string, search: URLSearchParams): Answer | null {
  if (method !== "GET") return null;
  const limit = Number(search.get("limit") ?? 50);
  const take = Number.isInteger(limit) && limit >= 1 && limit <= 200 ? limit : 50;
  return ok({ items: RUN_ITEMS.slice(0, take), next_cursor: null });
}

/* ── the one entry the execution double calls ─────────────────────────────── */

/**
 * `null` is "not mine": the caller answers with what it always answered. `seg` is the path after `/api/v1/execution`
 * split on `/`. Only reached with `screensV2`.
 */
export function answerStage(method: string, path: string, seg: readonly string[], search: URLSearchParams, requestBody: unknown): Answer | null {
  if (method === "GET") {
    if (seg[0] === "screens" && seg[1] === "paper" && seg[2] !== undefined && isStageDeployment(seg[2])) {
      if (seg.length === 3) return ok(paperProfile(seg[2], "standard"));
      if (seg.length === 4 && seg[3] === "vn-market") return ok(paperProfile(seg[2], "vn-market"));
    }
    if (seg[0] === "deployments" && seg.length === 3 && seg[1] !== undefined && isStageDeployment(seg[1])) {
      if (seg[2] === "certification" || seg[2] === "canary" || seg[2] === "live") return stageAnswer(seg[2], seg[1], search);
    }
    if (path === "/governance/review-capture-capabilities") return captureCapabilities(search);
    return null;
  }
  if (method === "POST") {
    if (path === "/governance/sandbox/capture-note") return answerSandboxNote(requestBody);
    if (path === "/governance/approvals") return answerApprovalCreate(requestBody);
  }
  return null;
}
