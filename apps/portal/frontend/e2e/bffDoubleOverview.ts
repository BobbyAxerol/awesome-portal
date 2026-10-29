/**
 * Overview, Blotter and Admin Actions reads for the e2e BFF double
 * (UXM-07 S2, flag keys `overview`, `blotter`, `admin`).
 *
 * Serves a SPARSE-REALISTIC profile of the execution reads those three screens
 * make, built from the canonical contract fixtures plus small synthetic
 * additions (marked synthetic below). Every body is a real contract shape, and
 * every state a screen must keep apart has a variant.
 *
 * Wiring (the primary owns `answerExecutionBff`). These answers REPLACE the
 * canonical ones the V1 journeys read, so call this only behind an option, the
 * way `operationsV2` is gated, or the V1 baselines change:
 *
 *   if (options.screensV2) {
 *     const v2 = answerOverview(method, pathname, search, requestBody);   // full pathname, prefix included
 *     if (v2 !== null) return v2;
 *   }
 *
 * It answers `null` for anything it does not serve, so the caller falls through.
 * The Users reads live in `bffDoubleUsers.ts` (they are not under
 * `/api/v1/execution`).
 *
 * Variants (module state; `setOverviewDoubleVariants`, `resetOverviewDouble`):
 *
 * | key | values | what changes |
 * |---|---|---|
 * | `commandCenter` | `busy` (default), `quiet`, `partial`, `stale`, `feed-unavailable` | the canonical command-center snapshot of that name, inside the composition |
 * | `fleet` | `passthrough` (default: not served), `multi-currency`, `empty-summary`, `no-summary`, `error` | `GET /alphas`: three alphas in two currencies; the same with a summary that lists no currency; the same with no summary at all (the Fleet reader refuses that body, so the screen sees `unavailable`); or a 503 |
 * | `operations` | `v2` (default), `legacy` | `GET /operations` as the V2 queue (from `bffDoubleV2`), or the V1 body so the V2 reader answers `unsupported_shape` |
 * | `blotter` | `paged` (default), `partial`, `stale`, `empty`, `denied`, `error` | `GET /screens/blotter`: 137 orders over 3 keyset pages |
 * | `admin` | `relay-off` (default), `connected-read`, `partial`, `denied` | tasks, catalogue, composition and activation; `connected-read` makes `health` a CONNECTED local read |
 * | `stream` | `unpublished` (default), `published` | `published` sets `stream_available` in the command-center snapshot and serves `execution.manager-realtime-snapshot.v2` so the stream gate opens (synthetic: every canonical snapshot says false) |
 *
 * Blotter data (synthetic, deterministic): 137 orders newest first across 3
 * alphas, 3 accounts, 2 venues and 3 symbols; Filled, Partially filled,
 * Rejected, working (Accepted, Submitted) and Canceled; market orders carry no
 * price; prices and quantities keep their own decimals (`60890.00`, `0.0400`,
 * `1250`); fees are in USDT and, on every fifth fill, BNB (never summed). One
 * in twelve filled orders is a bracket with ENTRY, TAKE_PROFIT and STOP_LOSS
 * legs, served by the conditional-groups route at
 * `GET /derivations/conditional-groups/{group_id}`, which the main double does
 * not answer. Cursors are opaque and bound to the filter that issued them
 * (400 `PAPER_READ_CURSOR_INVALID` otherwise).
 *
 * Admin plan sequence: `POST /commands/plans` answers by call count, so a spec
 * can walk the strip: call 1 ACCEPTED, call 2 UNKNOWN, every later call the
 * canonical BLOCKED. `resetOverviewDouble` rewinds it. ACCEPTED and UNKNOWN are
 * synthetic: the real F0 relay only ever answers BLOCKED.
 */
import { deploymentOfView } from "./bffWorldVariants"; // R-A
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { COMMAND_CATALOGUE_FIXTURE, COMMAND_PLAN_FIXTURE } from "../src/execution/adminCatalog.fixtures";
import { BLOTTER_BUCKET } from "../src/execution/contracts";
import { ACTIVATION_CAPABILITIES, SOURCE_HEALTH_READ } from "../src/execution/derivedReads.fixtures";
import { answerOperationsV2 } from "./bffDoubleV2";
import { scaleCounts, scaled } from "./bffScale";
import { isPositiveMode } from "./bffPositiveMode";
import { MARKS, positionsOf, setOpenOrderProvider, worldAlphas } from "./bffWorld";
import { isRetired, PAPER_POLICY_MIN_TRADES, stageWindowOf } from "./bffWorldStage"; // WP-B2-O
import { ORDER_BOOK_AS_OF_ISO, RESERVED_PIECES, RETIRED, mustRest, reservedOrdersFor, retiredSubmitMs, orderClock, orderPath, worldStatus, type OrderClock } from "./bffWorldOrders"; // WP-B2-O
// ===== WP-B2-A begin
import { worldCommandCenter } from "./bffWorldGovernance";
// ===== WP-B2-A end

export interface OverviewAnswer {
  status: number;
  body: unknown;
  contentType?: string;
}

const CONTRACTS = join(dirname(fileURLToPath(import.meta.url)), "../../../../packages/contracts/fixtures");
const canonical = (name: string): Record<string, unknown> => JSON.parse(readFileSync(join(CONTRACTS, name), "utf8")) as Record<string, unknown>;
const clone = <T,>(value: T): T => structuredClone(value);

const CC = {
  busy: canonical("execution-command-center.busy.valid.json"),
  quiet: canonical("execution-command-center.empty.valid.json"),
  partial: canonical("execution-command-center.partial.valid.json"),
  stale: canonical("execution-command-center.stale.valid.json"),
  "feed-unavailable": canonical("execution-command-center.unavailable.valid.json"),
} as const;
const BLOTTER_BASE = canonical("execution-full-blotter.partial.valid.json");
const FUNNEL_BASE = canonical("execution-analytics.order-funnel.valid.json");
const TASKS_BASE = canonical("execution-command-tasks.valid.json");
const FLEET_BASE = canonical("execution-alpha-fleet-list.v2.valid.json");

/* ── variants ──────────────────────────────────────────────────────────── */

export interface OverviewDoubleVariants {
  commandCenter: keyof typeof CC;
  fleet: "passthrough" | "multi-currency" | "empty-summary" | "no-summary" | "error";
  operations: "v2" | "legacy";
  blotter: "paged" | "partial" | "stale" | "empty" | "denied" | "error";
  admin: "relay-off" | "connected-read" | "partial" | "denied";
  stream: "unpublished" | "published";
}

const DEFAULTS: OverviewDoubleVariants = { commandCenter: "busy", fleet: "passthrough", operations: "v2", blotter: "paged", admin: "relay-off", stream: "unpublished" };
let variants: OverviewDoubleVariants = { ...DEFAULTS };
let planCalls = 0;
let planMode: "sequence" | "blocked" = "sequence";

/**
 * `sequence` (default, what the specs walk): call 1 ACCEPTED, call 2 UNKNOWN, then the canonical
 * BLOCKED. `blocked`: every plan is the canonical BLOCKED answer, whatever the call count, so the
 * answer is the same for the same request (the standalone server's mode; `resetOverviewDouble` leaves it).
 */
export function setOverviewPlanMode(mode: "sequence" | "blocked"): void {
  planMode = mode;
}

export function setOverviewDoubleVariants(next: Partial<OverviewDoubleVariants>): void {
  variants = { ...variants, ...next };
}

export function resetOverviewDouble(): void {
  variants = { ...DEFAULTS };
  planCalls = 0;
}

const ok = (body: unknown): OverviewAnswer => ({ status: 200, body });
const problem = (status: number, code: string, message: string): OverviewAnswer => ({ status, body: { error: { code, message }, request_id: "req_double_screens_v2" } });
const DENIED = (): OverviewAnswer => problem(403, "FORBIDDEN", "This account may not read this.");

/* ── composition ───────────────────────────────────────────────────────── */

const READ_AT = "2026-10-17T12:04:00.000Z";

function composition(surface: "command-center" | "admin-action-drawer"): OverviewAnswer {
  const admin = surface === "admin-action-drawer";
  if (admin && variants.admin === "denied") return DENIED();
  return ok({
    schema_version: "execution.operational-composition.v1",
    logical_operation_id: admin ? "executionAdminActionDrawerV1" : "executionCommandCenterV1",
    record_authority: "PORTAL_CONTROL",
    source_authority: "PORTAL_CONTROL_PLUS_ACCEPTED_TRADING_SYSTEM_OBSERVATIONS",
    workspace_id: "workspace_execution_manager",
    read_at: READ_AT,
    read_at_ms: Date.parse(READ_AT),
    composite_revision: `sha256:${(admin ? "admin" : "cc").padEnd(64, "0")}`,
    source_health: SOURCE_HEALTH_READ,
    redacted_command_journal: {
      state: "AVAILABLE",
      reason_code: null,
      retention: "E2E_REDACTED_JOURNAL",
      rows: admin
        ? [
            { command_id: "cmd_double_01", accepted_at: "2026-10-17T11:40:00.000Z", state: "BLOCKED", venue: "BINANCE", environment: "PAPER" },
            { command_id: "cmd_double_02", accepted_at: "2026-10-17T11:20:00.000Z", state: "BLOCKED", venue: "OKX", environment: "SANDBOX" },
          ]
        : [],
    },
    canary_twin_comparison: { state: "UNAVAILABLE", reason_code: "E5_CANARY_TWIN_COMPARISON_NOT_QUALIFIED" },
    command_authority: { state: "UNCHANGED_FAIL_CLOSED", source_side_effect_requested: false },
    data: admin
      ? {
          task_catalogue: tasks(),
          command_authority: { state: "FAIL_CLOSED", relay_active: false, source_side_effect_requested: false },
        }
      : { command_center: commandCenter() },
  });
}

function commandCenter(): Record<string, unknown> {
  let body = clone(CC[variants.commandCenter]) as Record<string, unknown>;
  // ===== WP-B2-A begin: in the positive world the busy snapshot's cards, totals and cells are COMPUTED from the world (operations, incidents, approvals, fleet), not canonical constants
  if (isPositiveMode() && variants.commandCenter === "busy") body = worldCommandCenter(body);
  // ===== WP-B2-A end
  if (variants.stream === "published") {
    body.snapshot = { ...(body.snapshot as Record<string, unknown>), stream_available: true, projection_epoch: "e2e-cc", projection_sequence: 1, cursor: "e2e-cc:1" };
  }
  return body;
}

/* ── fleet (synthetic) ─────────────────────────────────────────────────── */

function fleet(): OverviewAnswer {
  if (variants.fleet === "error") return problem(503, "FLEET_PROJECTION_UNAVAILABLE", "The fleet projection is unavailable.");
  const body = clone(FLEET_BASE) as Record<string, unknown> & { page: Record<string, unknown>; summary?: unknown };
  const base = (body.page.rows as Record<string, unknown>[])[0]!;
  const row = (id: string, label: string, stage: string, currency: string, allocation: string, net: string, exposure: string, health: string) => ({
    ...clone(base),
    alpha_id: id,
    alpha_label: label,
    stage,
    stages: [stage],
    health,
    allocations: [{ currency, value: allocation }],
    balances: [{ currency, total: allocation, free: allocation, locked: "0" }],
    position_pnl: [{ currency, realized: net, unrealized: "0", net }],
    exposure: [{ currency, value: exposure }],
    deployments: [],
  });
  const rows = [
    row("alpha_a", "Carry A", "LIVE", "USDT", "120000.00", "21430.55", "84210.1250", "READY"),
    row("alpha_b", "Basis B", "PAPER", "USDT", "30000.50", "-1840.25", "0", "ATTENTION"),
    row("alpha_c", "Momentum C", "SANDBOX", "USD", "15000", "0.00001234", "2500.5", "READY"),
  ];
  body.page = { ...body.page, rows, total_count: 3, filtered_count: 3, next_cursor: null, prev_cursor: null, has_more: false, has_previous: false };
  if (variants.fleet === "no-summary") delete body.summary;
  else if (variants.fleet === "empty-summary") {
    body.summary = { alpha_count: 3, deployment_count: 0, portfolio_count: 1, needs_attention_count: 1, research_only_count: 0, stage_counts: {}, allocation_by_currency: [], exposure_by_currency: [], current_position_pnl_by_currency: [], metric_basis: "CURRENT_SOURCE_FACTS" };
  } else {
    body.summary = {
      alpha_count: 3,
      deployment_count: 0,
      portfolio_count: 1,
      needs_attention_count: 1,
      research_only_count: 0,
      stage_counts: { LIVE: 1, PAPER: 1, SANDBOX: 1 },
      allocation_by_currency: [{ currency: "USDT", value: "150000.50" }, { currency: "USD", value: "15000" }],
      exposure_by_currency: [{ currency: "USDT", value: "84210.1250" }, { currency: "USD", value: "2500.5" }],
      current_position_pnl_by_currency: [
        { currency: "USDT", realized: "19590.30", unrealized: "0", net: "19590.30" },
        { currency: "USD", realized: "0.00001234", unrealized: "0", net: "0.00001234" },
      ],
      metric_basis: "CURRENT_SOURCE_FACTS",
    };
  }
  return ok(body);
}

/* ── admin ─────────────────────────────────────────────────────────────── */

function tasks(): Record<string, unknown> {
  const body = clone(TASKS_BASE) as Record<string, unknown> & { tasks: Record<string, unknown>[]; classification_counts: Record<string, number> };
  if (variants.admin === "connected-read") {
    const health = body.tasks.find((t) => t.task_id === "health")!;
    health.state = "CONNECTED";
    health.reason_code = null;
    health.unlisted_reason = null;
    body.classification_counts = { ...body.classification_counts, CONNECTED: 1, SUPPORTED_BUT_INACTIVE: (body.classification_counts.SUPPORTED_BUT_INACTIVE ?? 1) - 1 };
  }
  if (variants.admin === "partial") body.tasks = body.tasks.slice(0, 20);
  return body;
}

function catalogue(): OverviewAnswer {
  if (variants.admin === "denied") return DENIED();
  return ok(COMMAND_CATALOGUE_FIXTURE);
}

function plan(search: URLSearchParams | null, requestBody: unknown): OverviewAnswer {
  void search;
  planCalls += 1;
  const base = clone(COMMAND_PLAN_FIXTURE) as Record<string, unknown>;
  const asked = (requestBody ?? {}) as { command_key?: string };
  const withKey = { ...base, command_key: asked.command_key ?? base.command_key };
  // The standalone server pins the honest answer: the real relay only ever answers BLOCKED.
  if (planMode === "blocked") return ok(withKey);
  if (planCalls === 1) {
    return ok({ ...withKey, operation_id: "op_DOUBLE_PLAN_ACCEPTED", status: "ACCEPTED", blockers: [], relay_capability: "ENABLED", source_side_effect_requested: false });
  }
  if (planCalls === 2) {
    return ok({ ...withKey, operation_id: "op_DOUBLE_PLAN_UNKNOWN", status: "UNKNOWN", blockers: [], relay_capability: "ENABLED", source_side_effect_requested: true });
  }
  return ok({ ...withKey, operation_id: `op_DOUBLE_PLAN_BLOCKED_${planCalls}` });
}

function runTask(taskId: string): OverviewAnswer {
  if (taskId !== "health" || variants.admin !== "connected-read") return problem(409, "TASK_NOT_CONNECTED", "This task is not connected.");
  return ok({
    schema_version: "execution.command-run-result.v1",
    task_id: taskId,
    classification: "CONNECTED",
    transport: "SGP_LOCAL_PROJECTION",
    source_request_sent: false,
    response_digest: `sha256:${"a".repeat(64)}`,
    result: { services: [{ name: "projection", state: "OK" }, { name: "query", state: "OK" }, { name: "live updates", state: "STALE" }] },
  });
}

/* ── blotter (synthetic, deterministic) ────────────────────────────────── */

interface Instrument { symbol: string; price: string; priceDp: number; qty: string; qtyDp: number }
const ALPHAS = ["adaptive_hma_cpp_00115m", "carry_basis_v3", "grid_mean_v1"] as const;
const ACCOUNTS = ["acc_paper_binance_01", "acc_paper_binance_02", "acc_paper_okx_01"] as const;
const VENUES = ["BINANCE", "BINANCE", "OKX"] as const;
const INSTRUMENTS: readonly Instrument[] = [
  { symbol: "BTCUSDT", price: "60890.00", priceDp: 2, qty: "0.0400", qtyDp: 4 },
  { symbol: "ETHUSDT", price: "2481.35", priceDp: 2, qty: "1.250", qtyDp: 3 },
  { symbol: "DOGEUSDT", price: "0.16120", priceDp: 5, qty: "1250", qtyDp: 0 },
];
const STATUS_PATTERN = ["FILLED", "FILLED", "ACCEPTED", "PARTIALLY_FILLED", "FILLED", "REJECTED", "FILLED", "CANCELED", "SUBMITTED", "FILLED"] as const;
export const BLOTTER_DOUBLE_COUNT = 137;
const NEWEST_MS = Date.parse("2026-10-17T12:00:00.000Z");

const pad = (n: number, w = 5) => String(n).padStart(w, "0");
const iso = (ms: number) => new Date(ms).toISOString();

/** Whole units at `dp` decimals to an exact string: (1250000, 4) -> "125.0000". */
function fromUnits(units: bigint, dp: number): string {
  const text = units.toString().padStart(dp + 1, "0");
  return dp === 0 ? text : `${text.slice(0, -dp)}.${text.slice(-dp)}`;
}
function toUnits(text: string, dp: number): bigint {
  const [i, f = ""] = text.split(".");
  return BigInt(`${i}${f.padEnd(dp, "0")}`);
}

interface Row { order: Record<string, unknown>; fills: Record<string, unknown>[]; legs: Record<string, unknown>[]; group: Record<string, unknown> | null; status: string; symbol: string; venue: string; side: string; clock?: OrderClock | null }


// ===== WP-P begin (blotter of the world: every order belongs to a deployment of the world, at the world's one mark per symbol)
interface WorldBook { deployment: string; alpha: string; account: string; venue: string; mode: string; inst: Instrument; stage: string; window: { fromMs: number; toMs: number } | null }
const WORLD_INSTRUMENTS: Readonly<Record<string, Omit<Instrument, "price">>> = {
  BTCUSDT: { symbol: "BTCUSDT", priceDp: 2, qty: "0.0400", qtyDp: 4 }, ETHUSDT: { symbol: "ETHUSDT", priceDp: 2, qty: "1.250", qtyDp: 3 },
  SOLUSDT: { symbol: "SOLUSDT", priceDp: 2, qty: "12.00", qtyDp: 2 }, BNBUSDT: { symbol: "BNBUSDT", priceDp: 2, qty: "3.500", qtyDp: 3 },
};
/** The deployments the blotter draws its orders from: the native books first, then the generated ones, each at the symbol its first position holds. */
function worldBlotterBooks(): WorldBook[] {
  const books: WorldBook[] = [];
  for (const alpha of worldAlphas()) for (const d of alpha.deployments) {
    const symbol = positionsOf(d.id)[0]?.symbol ?? "BTCUSDT";
    books.push({ deployment: d.id, alpha: alpha.id, account: d.accountId, venue: d.venue, mode: d.environment, stage: isRetired(d.id) ? RETIRED : d.stage, window: isRetired(d.id) ? stageWindowOf(d.id) : null, inst: { ...WORLD_INSTRUMENTS[symbol]!, price: MARKS[symbol]! } });
  }
  return books;
}
// ===== WP-P end
/** WORLD: the open orders (accepted, submitted, partly filled) the blotter holds for one deployment: the Live page, the Canary room and Alpha 360 read these very rows. */
let openBook: Map<string, WorldOpenOrder[]> | null = null;
let openBookSource: Row[] | null = null;
export interface WorldOpenOrder { id: string; symbol: string; side: "buy" | "sell"; type: string; quantity: string; price: string; status: string; sinceMs: number }
// ===== WP-B2-S3 begin (QA8 N8b-03): a stage-page variant id (`dep_live_01_gap`) names a state of the deployment `dep_live_01`; its blotter scope is that deployment's
export const deploymentOfVariant = (id: string): string => deploymentOfView(id); // R-A: the DECLARED variant graph (bffWorldVariants.ts), no suffix is stripped
// ===== WP-B2-S3 end
/** WORLD: the blotter summary of a scope is COUNTED from the blotter's own rows (environment, optionally one deployment), so its chips and funnel equal the rows the screen lists. */
export function worldBlotterCounts(environment: string, deploymentId: string | null): { submitted: number; filled: number; partial: number; working: number; cancelled: number; rejected: number } {
  const rows = rowsFor(false).map((r) => r.order as unknown as Record<string, unknown>).filter((o) => o.mode === environment && (deploymentId === null || o.deployment_id === deploymentOfVariant(deploymentId)));
  const count = (...states: string[]): number => rows.filter((o) => states.includes(String(o.status))).length;
  return { submitted: rows.length, filled: count("FILLED"), partial: count("PARTIALLY_FILLED"), working: count("ACCEPTED", "SUBMITTED"), cancelled: count("CANCELED"), rejected: count("REJECTED") };
}
export function worldOpenOrders(deploymentId: string): WorldOpenOrder[] {
  const source = rowsFor(false);
  if (openBook === null || openBookSource !== source) {
    openBook = new Map();
    openBookSource = source;
    for (const row of source) {
      const o = row.order;
      if (!["ACCEPTED", "SUBMITTED", "PARTIALLY_FILLED"].includes(String(o.status)) || typeof o.deployment_id !== "string" || o.price === null) continue;
      const list = openBook.get(o.deployment_id) ?? [];
      list.push({ id: String(o.order_id), symbol: String(o.symbol), side: String(o.side).toLowerCase() === "buy" ? "buy" : "sell", type: String(o.order_type), quantity: String(o.quantity), price: String(o.price), status: String(o.status), sinceMs: Date.parse(String(o.submitted_at)) });
      openBook.set(o.deployment_id, list);
    }
  }
  return openBook.get(deploymentId) ?? [];
}
setOpenOrderProvider(worldOpenOrders);
function buildRows(partial: boolean, count: number): Row[] {
  const rows: Row[] = [];
  const worldBooks = isPositiveMode() ? worldBlotterBooks() : null;
  // A larger book (the standalone server's FIXTURE_SCALE) also leaves some commissions unpublished.
  const larger = count !== BLOTTER_DOUBLE_COUNT;
  // ===== WP-B2-O begin (retired stages: every order of a deployment whose stage its alpha has left lies inside its stage window; a retired Paper stage holds the gate's minimum fills in the book itself)
  const retiredPaper = worldBooks === null ? [] : worldBooks.filter((b) => b.stage === RETIRED && b.mode === "paper");
  const reservedTotal = Math.min(retiredPaper.length * reservedOrdersFor(PAPER_POLICY_MIN_TRADES), Math.max(0, count - 80));
  const tailStart = count - reservedTotal;
  const bookAt = (i: number): WorldBook | null => worldBooks === null ? null : retiredPaper.length > 0 && i >= tailStart ? retiredPaper[(i - tailStart) % retiredPaper.length]! : worldBooks[i % worldBooks.length]!;
  const slotsOf = new Map<string, number[]>();
  for (let i = 0; i < count; i += 1) { const b = bookAt(i); if (b !== null && b.window !== null) slotsOf.set(b.deployment, [...(slotsOf.get(b.deployment) ?? []), i]); }
  // ===== WP-B2-O end
  const filledSeen = new Map<string, number>(); // WP-B2-S3
  // ===== WP-B2-S3 begin (QA7 N4-04): a retired book holds an EVEN number of filled orders (all of one size, alternating buy / sell, so it nets flat): when its drawn statuses leave an odd number, its first unreserved filled order was cancelled instead
  const cancelForParity = new Set<number>();
  if (worldBooks !== null) {
    const filledSlots = new Map<string, number[]>();
    for (let i = 0; i < count; i += 1) {
      const b = bookAt(i);
      if (b === null || b.window === null || b.stage !== RETIRED) continue;
      const reservedSlot = i >= tailStart && retiredPaper.length > 0;
      if (reservedSlot || worldStatus(i, worldBooks.length, b.stage, STATUS_PATTERN[i % 10]!) === "FILLED") filledSlots.set(b.deployment, [...(filledSlots.get(b.deployment) ?? []), i]);
    }
    for (const slots of filledSlots.values()) if (slots.length % 2 === 1) { const free = slots.find((slot) => !(slot >= tailStart && retiredPaper.length > 0)); if (free !== undefined) cancelForParity.add(free); }
  }
  // ===== WP-B2-S3 end
  for (let i = 0; i < count; i += 1) {
    const w = bookAt(i); // WORLD: every order belongs to a deployment of the world (one account, one mark)
    const inst = w === null ? INSTRUMENTS[i % 3]! : w.inst;
    const k = i % 3;
    // ===== WP-B2-O begin (the state of an order is a rule of the world: bffWorldOrders)
    const drawn = STATUS_PATTERN[i % 10]!;
    const reserved = w !== null && i >= tailStart && retiredPaper.length > 0;
    const status = w === null ? drawn : reserved ? "FILLED" : cancelForParity.has(i) ? "CANCELED" : worldStatus(i, worldBooks!.length, w.stage, drawn); // WP-B2-S3: parity
    const rests = w !== null && (reserved || mustRest(i, worldBooks!.length, w.stage));
    // ===== WP-B2-O end
    let side = i % 2 === 0 ? "BUY" : "SELL";
    // ===== WP-B2-S3 begin (QA7 N4-04): a stage the alpha has left nets flat: its filled orders alternate buy / sell in its own book (the global index would give one deployment one side)
    if (w !== null && w.window !== null && w.stage === RETIRED && status === "FILLED") { const seen = filledSeen.get(w.deployment) ?? 0; filledSeen.set(w.deployment, seen + 1); side = seen % 2 === 0 ? "BUY" : "SELL"; }
    // ===== WP-B2-S3 end
    const market = i % 4 === 1 && !rests;
    const stop = i % 11 === 0 && !market && !rests;
    const number = count - i;
    const orderId = `ord_${pad(number)}`;
    const client = `cl-${pad(number)}`;
    // ===== WP-B2-O begin (the clock of an order: submit < grant < ack < fills <= the world's now; whole seconds)
    const riskRejected = status === "REJECTED" && i % 2 === 0;
    const pieceCount = status === "PARTIALLY_FILLED" ? 1 : status === "FILLED" ? (reserved ? RESERVED_PIECES : 1 + (i % 3)) : 0;
    const mine = w === null || w.window === null ? null : slotsOf.get(w.deployment)!;
    const clock = w === null ? null : orderClock(i, status, pieceCount, riskRejected, mine === null ? undefined : retiredSubmitMs(w.window!, mine.length, mine.indexOf(i), i));
    const t = clock === null ? NEWEST_MS - i * 7 * 60_000 - (i % 5) * 1000 : clock.submittedMs;
    const settledMs = clock === null ? null : clock.updatedMs;
    // ===== WP-B2-O end
    const priceUnits = toUnits(inst.price, inst.priceDp) + BigInt(i % 17) * 10n ** BigInt(Math.max(0, inst.priceDp - 2));
    const order: Record<string, unknown> = {
      order_id: orderId,
      client_order_id: client,
      venue_order_id: status === "REJECTED" ? null : `v-${pad(number * 7, 7)}`,
      strategy_id: (w?.alpha ?? ALPHAS[k]),
      account_id: (w?.account ?? ACCOUNTS[k]),
      execution_session_id: `sess_${k + 1}`,
      mode: w?.mode ?? "paper",
      venue: (w?.venue ?? VENUES[k]),
      instrument_id: `${inst.symbol}.${(w?.venue ?? VENUES[k])}`,
      symbol: inst.symbol,
      side,
      order_type: market ? "MARKET" : stop ? "STOP_LIMIT" : "LIMIT",
      time_in_force: market ? "IOC" : "GTC",
      quantity: inst.qty,
      price: market ? null : fromUnits(priceUnits, inst.priceDp),
      trigger_price: stop ? fromUnits(priceUnits + 5n * 10n ** BigInt(Math.max(0, inst.priceDp - 1)), inst.priceDp) : null,
      status,
      reduce_only: false,
      post_only: false,
      submitted_at: iso(t),
      updated_at: iso(settledMs ?? t + 2000),
      error_code: status === "REJECTED" ? (i % 2 === 0 ? "RISK_ORDER_SIZE_CAP" : "VENUE_PRICE_BAND") : null,
      error_message: status === "REJECTED" ? (i % 2 === 0 ? "The order size was above the deployment cap." : "The venue refused the price because it was outside the allowed band.") : null,
      ...(w === null ? {} : { deployment_id: w.deployment }),
      risk_grant_id: status === "REJECTED" && i % 2 === 0 ? null : `grant_${pad(number)}`,
    };
    // Fills: only orders that traded. Quantities split exactly; the last piece takes the remainder.
    const fills: Record<string, unknown>[] = [];
    if (status === "FILLED" || status === "PARTIALLY_FILLED") {
      const total = toUnits(inst.qty, inst.qtyDp);
      const target = status === "PARTIALLY_FILLED" ? total / 2n : total;
      const pieces = pieceCount;
      let left = target;
      for (let p = 0; p < pieces; p += 1) {
        const q = p === pieces - 1 ? left : target / BigInt(pieces);
        left -= q;
        const n = fills.length + 1;
        const bnb = (i + p) % 5 === 4;
        fills.push({
          fill_id: `fil_${pad(number)}_${n}`,
          event_id: `evt_${pad(number)}_${n}`,
          trade_time: iso(clock === null ? t + 1500 + p * 4000 : clock.fillMs[p]!), // WP-B2-O
          trade_id: `tr_${pad(number)}_${n}`,
          client_order_id: client,
          venue_order_id: order.venue_order_id,
          strategy_id: (w?.alpha ?? ALPHAS[k]),
          account_id: (w?.account ?? ACCOUNTS[k]),
          execution_session_id: `sess_${k + 1}`,
          mode: w?.mode ?? "paper",
          venue: (w?.venue ?? VENUES[k]),
          instrument_id: order.instrument_id,
          side,
          price: fromUnits(priceUnits - BigInt(p), inst.priceDp),
          quantity: fromUnits(q, inst.qtyDp),
          commission: (partial && (i + p) % 3 === 0) || (larger && (i + p) % 9 === 4) ? null : bnb ? "0.00042100" : "0.0123",
          commission_currency: bnb ? "BNB" : "USDT",
          liquidity_side: market ? "TAKER" : "MAKER",
          realized_pnl: "0",
        });
      }
    }
    // Bracket: one in twelve filled orders.
    let legs: Record<string, unknown>[] = [];
    let group: Record<string, unknown> | null = null;
    if (status === "FILLED" && i % 12 === 0) {
      const gid = `grp_${pad(number)}`;
      const exit = (role: string, seq: string, trigger: bigint, state: string) => ({
        group_id: gid, leg_id: `${gid}_${role.toLowerCase()}`, parent_leg_id: `${gid}_entry`, role, sequence: seq,
        client_order_id: `${client}-${role === "TAKE_PROFIT" ? "tp" : "sl"}`, venue_order_id: null, side: side === "BUY" ? "SELL" : "BUY",
        position_side: "BOTH", order_type: "STOP_MARKET", quantity: inst.qty, filled_quantity: "0", price: null,
        trigger_price: fromUnits(trigger, inst.priceDp), trigger_reference: "LAST", time_in_force: "GTC", good_till_date: null,
        reduce_only: true, post_only: false, state, average_fill_price: null, version: 1, created_at: iso(settledMs ?? t + 1000), updated_at: iso(settledMs ?? t + 3000), // WP-B2-O
      });
      legs = [
        { group_id: gid, leg_id: `${gid}_entry`, parent_leg_id: null, role: "ENTRY", sequence: "1", client_order_id: client, venue_order_id: order.venue_order_id,
          side, position_side: "BOTH", order_type: order.order_type, quantity: inst.qty, filled_quantity: inst.qty, price: order.price, trigger_price: null,
          trigger_reference: null, time_in_force: "GTC", good_till_date: null, reduce_only: false, post_only: false, state: "FILLED",
          average_fill_price: order.price, version: 1, created_at: iso(t), updated_at: iso(settledMs ?? t + 2000) }, // WP-B2-O
        exit("TAKE_PROFIT", "2", priceUnits + 11n * 10n ** BigInt(inst.priceDp), "ARMED"),
        exit("STOP_LOSS", "3", priceUnits - 6n * 10n ** BigInt(inst.priceDp), "ARMED"),
      ];
      group = {
        group_id: gid, strategy_id: (w?.alpha ?? ALPHAS[k]), account_id: (w?.account ?? ACCOUNTS[k]), execution_session_id: `sess_${k + 1}`, mode: w?.mode ?? "paper", venue: (w?.venue ?? VENUES[k]),
        instrument_id: order.instrument_id, symbol: inst.symbol, position_side: "BOTH", contingency_type: "OUO", activation_policy: "ON_ENTRY_FILL",
        state: "ACTIVE", winner_leg_id: null, target_quantity: inst.qty, filled_quantity: inst.qty, open_quantity: "0", excess_quantity: "0",
        version: 1, created_at: iso(t), updated_at: iso(settledMs ?? t + 3000), // WP-B2-O
      };
    }
    rows.push({ order, fills, legs, group, status, symbol: inst.symbol, venue: (w?.venue ?? VENUES[k]), side, clock });
  }
  // WP-B2-O: newest first by the order's own submit (retired stages are weeks old, so they close the book); a stable sort leaves the live book as drawn
  if (worldBooks !== null) rows.sort((a, b) => Date.parse(String(b.order.submitted_at)) - Date.parse(String(a.order.submitted_at)));
  return rows;
}

/** Built once per book size: the spec's 137 orders, or the standalone server's scale. */
const built = new Map<string, Row[]>();
function rowsFor(partial: boolean): Row[] {
  const count = scaleCounts().blotterOrders;
  const key = `${partial ? "partial" : "full"}:${count}:${isPositiveMode() ? `world:${scaled().alphas.length}` : "doubles"}`;
  let rows = built.get(key);
  if (!rows) {
    rows = buildRows(partial, count);
    built.set(key, rows);
  }
  return rows;
}

/** The orders and fills the blotter holds for one deployment of the world: the Paper workbench's Orders and Fills tabs list the SAME rows (same ids), so a link to the blotter finds its order. */
export function blotterBookOf(deploymentId: string): { orders: Record<string, unknown>[]; fills: Record<string, unknown>[] } {
  const mine = rowsFor(false).filter((row) => (row.order as unknown as Record<string, unknown>).deployment_id === deploymentId);
  return { orders: mine.map((row) => row.order as unknown as Record<string, unknown>), fills: mine.flatMap((row) => row.fills as unknown as Record<string, unknown>[]) };
}

function encodeCursor(index: number, signature: string): string {
  return Buffer.from(JSON.stringify({ i: index, s: signature }), "utf8").toString("base64url");
}
function decodeCursor(raw: string): { i: number; s: string } | null {
  try {
    const value = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as { i?: unknown; s?: unknown };
    return typeof value.i === "number" && Number.isInteger(value.i) && typeof value.s === "string" ? { i: value.i, s: value.s } : null;
  } catch {
    return null;
  }
}

function statusCounts(rows: readonly Row[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;
  return counts;
}

function blotter(search: URLSearchParams): OverviewAnswer {
  if (search.get("workspace_id") === "ws_TEST_DENIED") return DENIED();
  const v = variants.blotter;
  if (v === "denied") return DENIED();
  if (v === "error") return problem(503, "PAPER_READ_UPSTREAM_UNAVAILABLE", "The paper read is unavailable.");
  const source = rowsFor(v === "partial");
  // ===== WP-B2-B1 begin (the scope is the server's: stage / deployment_id / account_id / alpha_id narrow the ONE order book BEFORE paging; the totals, chips and funnel are the scope's own population)
  const stageParam = search.get("stage");
  if (stageParam !== null && stageParam !== "PAPER") {
    return stageParam === "SANDBOX" || stageParam === "CANARY" || stageParam === "LIVE"
      ? problem(400, "N22_BLOTTER_STAGE_NOT_AVAILABLE", "This Blotter route only serves the Paper stage.")
      : problem(400, "PAPER_READ_QUERY_INVALID", "The stage is not one of PAPER, SANDBOX, CANARY, LIVE.");
  }
  const scopeAxes = (["deployment_id", "account_id", "alpha_id"] as const).flatMap((axis) => { const value = search.get(axis); return value === null || value === "" ? [] : [[axis, value] as const]; });
  const inScope = (r: Row): boolean => {
    const o = r.order as unknown as Record<string, unknown>;
    return (stageParam === null || o.mode === "paper") && scopeAxes.every(([axis, value]) => (axis === "alpha_id" ? (o.alpha_id ?? o.strategy_id) : o[axis]) === (axis === "deployment_id" ? deploymentOfVariant(value) : value)); // WP-B2-S3
  };
  const all = v === "empty" ? [] : source.filter(inScope);
  const scopeSignature = stageParam === null && scopeAxes.length === 0 ? "" : `|${stageParam ?? ""}|${scopeAxes.map(([axis, value]) => `${axis}=${value}`).join("&")}`; // empty for an unscoped read: its cursors stay byte for byte what they were
  // ===== WP-B2-B1 end
  const bucket = search.get("status_bucket");
  const statuses = bucket && bucket in BLOTTER_BUCKET ? (BLOTTER_BUCKET[bucket as keyof typeof BLOTTER_BUCKET] as readonly string[]) : null;
  const symbol = search.get("symbol");
  const venue = search.get("venue");
  const side = search.get("side");
  const filtered = all.filter((r) => (statuses === null || statuses.includes(r.status)) && (!symbol || r.symbol === symbol) && (!venue || r.venue === venue) && (!side || r.side === side));
  const signature = `${bucket ?? ""}|${symbol ?? ""}|${venue ?? ""}|${side ?? ""}${scopeSignature}`; // WP-B2-B1: a cursor belongs to its scope
  const limit = Math.min(200, Math.max(1, Number(search.get("limit") ?? 50) || 50));
  let start = 0;
  const after = search.get("after");
  const before = search.get("before");
  const raw = after ?? before;
  if (raw !== null) {
    const cursor = decodeCursor(raw);
    if (cursor === null || cursor.s !== signature) return problem(400, "PAPER_READ_CURSOR_INVALID", "The cursor could not be read for this query.");
    start = after !== null ? cursor.i + 1 : Math.max(0, cursor.i - limit);
  }
  const end = Math.min(filtered.length, start + limit);
  const page = filtered.slice(start, end);
  const body = clone(BLOTTER_BASE) as Record<string, unknown> & { data: Record<string, unknown> };
  const exactQuery = body.data.exact_query as Record<string, unknown>;
  body.data = {
    ...body.data,
    orders: page.map((r) => r.order),
    fills: page.flatMap((r) => r.fills).slice(0, 100),
    conditional_groups: page.flatMap((r) => (r.group ? [r.group] : [])),
    conditional_legs: page.flatMap((r) => r.legs),
    page: { limit, next_cursor: end < filtered.length ? encodeCursor(end - 1, signature) : null, previous_cursor: start > 0 ? encodeCursor(start, signature) : null },
    query: { ...(body.data.query as Record<string, unknown>), filters: { status: null, status_bucket: bucket, venue, symbol, side, ...(stageParam === null ? {} : { stage: stageParam }), ...Object.fromEntries(scopeAxes) } }, // WP-B2-B1
    exact_total: all.length,
    filtered_total: filtered.length,
    aggregates: {
      status: v === "partial" ? { FILLED: statusCounts(all).FILLED ?? 0, REJECTED: statusCounts(all).REJECTED ?? 0 } : statusCounts(all),
      venue: { BINANCE: all.filter((r) => r.venue === "BINANCE").length, OKX: all.filter((r) => r.venue === "OKX").length },
    },
    exact_query: { ...exactQuery, coverage: { ...(exactQuery.coverage as Record<string, unknown>), returned_page_rows: page.length, current_population_rows: all.length, filtered_population_rows: filtered.length } },
  };
  body.state = v === "partial" ? "partial" : "ready";
  body.completeness = v === "partial" ? "PARTIAL" : "COMPLETE";
  body.freshness = v === "stale" ? "STALE" : "FRESH";
  // ===== WP-B2-O begin (the book's as-of IS the world clock, and so is the read time: every row is dated at or before it)
  const worldClock = isPositiveMode() && v !== "stale" ? ORDER_BOOK_AS_OF_ISO.replace(".000Z", "Z") : null;
  body.as_of = worldClock ?? (v === "stale" ? "2026-10-17T11:46:00Z" : "2026-10-17T12:00:00Z");
  body.read_at = worldClock ?? "2026-10-17T12:00:01Z";
  // ===== WP-B2-O end
  return ok(body);
}

function funnel(orderId: string): OverviewAnswer {
  const row = rowsFor(false).find((r) => r.order.order_id === orderId);
  if (!row) return problem(404, "ORDER_FUNNEL_ORDER_NOT_FOUND", "The order was not found.");
  const body = clone(FUNNEL_BASE) as Record<string, unknown> & { analytics: { data: { order_id: string; stages: Record<string, unknown>[]; event_count: number; returned_event_count: number } } };
  const submitted = Date.parse(String(row.order.submitted_at));
  // ===== WP-B2-O begin (the order path: each hop is a time of the order's own clock, in order, none after the fills; a hop the order never reached is not listed)
  const path = row.clock === undefined || row.clock === null ? null : orderPath(row.clock);
  const reached = path !== null ? path.findIndex((hop) => hop === null) === -1 ? path.length : path.findIndex((hop) => hop === null)
    : row.status === "REJECTED" ? 1 : row.status === "FILLED" || row.status === "PARTIALLY_FILLED" ? 4 : 3;
  // ===== WP-B2-O end
  const data = body.analytics.data;
  data.order_id = orderId;
  const stages = data.stages.slice(0, reached).map((stage, index) => {
    const events = (stage.events as Record<string, unknown>[]).map((event) => ({
      ...event,
      occurred_at: iso(path !== null ? path[index]! : submitted + index * 400), // WP-B2-O
      quantity: index === 3 ? String(row.fills[0]?.quantity ?? event.quantity) : null,
    }));
    return { ...stage, events };
  });
  // ===== WP-B2-O begin (the funnel is read at the world's now: its latest content instant is the clock, so the preview's rebase moves it with the blotter)
  if (path !== null) {
    (body as Record<string, unknown>).read_at = ORDER_BOOK_AS_OF_ISO.replace(".000Z", "Z");
    (body.analytics as Record<string, unknown>).input_as_of = ORDER_BOOK_AS_OF_ISO.replace(".000Z", "Z");
    for (const stage of stages) for (const event of stage.events as Record<string, unknown>[]) (event.quality as Record<string, unknown>).as_of = event.occurred_at;
  }
  // ===== WP-B2-O end
  data.stages = stages;
  data.event_count = stages.length;
  data.returned_event_count = stages.length;
  return ok(body);
}

function conditionalGroup(groupId: string): OverviewAnswer {
  const row = rowsFor(false).find((r) => r.group?.group_id === groupId);
  const found = row !== undefined;
  return ok({
    schema_version: "execution.derivation.conditional-legs.v1",
    logical_operation_id: "executionConditionalLegsV1",
    record_authority: "PORTAL_CONTROL",
    state: found ? "AVAILABLE" : "EMPTY",
    reason_code: found ? null : "EDS05_CONDITIONAL_GROUP_NOT_FOUND",
    source_side_effect_requested: false,
    data: {
      group_id: groupId,
      group: found ? row.group : null,
      legs: found ? row.legs.map(({ client_order_id: _c, venue_order_id: _v, ...leg }) => leg) : [],
      current_structure_only: true,
    },
  });
}

/* ── router ────────────────────────────────────────────────────────────── */

/**
 * `pathname` is the full request path (`/api/v1/execution/...`); `search` its
 * query. A POST's JSON body, when it matters, is passed as `requestBody`.
 * Answers `null` for anything not served here.
 */
export function answerOverview(method: string, pathname: string, search: URLSearchParams, requestBody?: unknown): OverviewAnswer | null {
  const path = pathname.replace(/^\/api\/v1\/execution/, "") || "/";
  const seg = path.split("/").filter(Boolean);

  if (method === "GET") {
    if (seg[0] === "compositions" && seg.length === 2) {
      if (seg[1] === "command-center") return composition("command-center");
      if (seg[1] === "admin-action-drawer") return composition("admin-action-drawer");
      return null;
    }
    if (path === "/alphas" && variants.fleet !== "passthrough") return fleet();
    if (path === "/operations") {
      if (variants.operations === "legacy") return ok({ schema_version: "execution.operations-queue.v1", queue: [] });
      return answerOperationsV2(method, path, search);
    }
    if (path === "/command-center/realtime-snapshot" && variants.stream === "published") {
      return ok({ schema_version: "execution.manager-realtime-snapshot.v2", cursor: "e2e-cc:1", projection_epoch: "e2e-cc", projection_sequence: 1, source_read_at: READ_AT, stream_available: true, data_state: "AVAILABLE" });
    }
    if (path === "/screens/blotter") return blotter(search);
    if (seg[0] === "orders" && seg[2] === "funnel" && seg.length === 3) return funnel(decodeURIComponent(seg[1]!));
    if (seg[0] === "derivations" && seg[1] === "conditional-groups" && seg.length === 3) return conditionalGroup(decodeURIComponent(seg[2]!));
    if (path === "/commands/tasks") return variants.admin === "denied" ? DENIED() : ok(tasks());
    if (path === "/commands/catalog") return catalogue();
    if (path === "/activation/capabilities") return variants.admin === "denied" ? DENIED() : ok(ACTIVATION_CAPABILITIES);
    return null;
  }
  if (method === "POST") {
    if (path === "/commands/plans") return variants.admin === "denied" ? DENIED() : plan(search, requestBody);
    if (seg[0] === "commands" && seg[1] === "tasks" && seg[3] === "run" && seg.length === 4) return runTask(decodeURIComponent(seg[2]!));
    return null;
  }
  return null;
}
