/**
 * Tolerant row mappers: N22 profile-read `NarrowRecord` rows → the reviewed
 * screens' typed rows.
 *
 * The contract publishes rows as narrow records without a field schema; the
 * canonical fixtures demonstrate snake_case keys (`order_id`, `quantity`,
 * `mode`). Every accessor here reads a documented snake_case key and falls
 * back to null — an absent field renders as the screen's own "not published"
 * state, never as an invented value.
 */
import type { KeysetPage } from "../contracts";
import type { WorkbenchFill, WorkbenchOrder, WorkbenchPosition, WorkbenchSession } from "../screens/PaperWorkbench";

type Row = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : typeof v === "number" ? String(v) : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** A page over rows the envelope published in full — no cursor is invented. */
export function pageOf<T>(rows: readonly T[], totalCount: number | null = rows.length): KeysetPage<T> {
  return {
    rows,
    totalCount,
    filteredCount: totalCount,
    nextCursor: null,
    prevCursor: null,
    hasMore: false,
  };
}

export function workbenchOrderRow(row: Row): WorkbenchOrder {
  return {
    orderId: str(row.order_id) ?? "order id not published",
    at: str(row.submitted_at) ?? str(row.updated_at) ?? str(row.created_at) ?? str(row.at) ?? "",
    symbol: str(row.symbol) ?? str(row.instrument_id) ?? "",
    orderType: str(row.order_type) ?? "",
    side: str(row.side) ?? "",
    quantity: str(row.quantity) ?? "",
    filledQuantity: str(row.filled_quantity),
    price: str(row.price),
    status: str(row.status) ?? "",
    rejectReason: str(row.error_message) ?? str(row.error_code) ?? str(row.reject_reason),
    fee: str(row.fee),
    feeCurrency: str(row.fee_currency),
  };
}

export function workbenchFillRow(row: Row): WorkbenchFill {
  return {
    fillId: str(row.fill_id) ?? "fill id not published",
    at: str(row.trade_time) ?? str(row.created_at) ?? str(row.at) ?? "",
    symbol: str(row.symbol) ?? str(row.instrument_id) ?? "",
    quantity: str(row.quantity) ?? "",
    price: str(row.price) ?? "",
    fee: str(row.commission) ?? str(row.fee),
    liquidity: str(row.liquidity_side) ?? str(row.liquidity),
  };
}

export function workbenchPositionRow(row: Row): WorkbenchPosition {
  return {
    symbol: str(row.symbol) ?? str(row.instrument_id) ?? "symbol not published",
    side: str(row.side) === "SHORT" ? "SHORT" : "LONG",
    quantity: str(row.signed_qty) ?? str(row.quantity) ?? "",
    entry: str(row.avg_px_open) ?? str(row.entry_price) ?? str(row.entry),
    mark: str(row.mark_price) ?? str(row.mark),
    unrealised: str(row.unrealized_pnl) ?? str(row.unrealised_pnl) ?? str(row.unrealised),
  };
}

export function workbenchSessionRow(row: Row): WorkbenchSession {
  return {
    sessionId: str(row.execution_session_id) ?? str(row.session_id) ?? "session id not published",
    startedAt: str(row.started_at) ?? "",
    state: str(row.state) ?? "state not published",
    orders: num(row.submitted_count) ?? num(row.orders),
    fills: num(row.filled_count) ?? num(row.fills),
    detail: str(row.detail) ?? (num(row.risk_rejected_count) !== null ? `risk rejected ${num(row.risk_rejected_count)}` : null),
  };
}
