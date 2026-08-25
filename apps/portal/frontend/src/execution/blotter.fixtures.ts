/**
 * Full Blotter fixtures (hi-fi 4c, CAST deployments).
 *
 * Rows are typed props rather than a server contract, because there is no
 * published order-list endpoint yet — the funnel has one, the list does not.
 * See BR-EX-24. When it lands, only a mapper is added; the screen is already
 * shaped by these props, which is how Gate R1 and R2 absorbed EX-BE-05a.
 *
 * Every numeric is a string, at the precision the venue states it.
 */
import type { KeysetPage } from "./contracts";
import type { BlotterRow } from "./screens/FullBlotter";

const ROWS: BlotterRow[] = [
  {
    orderId: "ord_88a2",
    at: "10:41:58.114",
    deployment: "dep_94",
    venue: "DERIBIT",
    symbol: "BTC-PERP",
    orderType: "LIMIT",
    side: "BUY",
    quantity: "0.0400",
    price: "60,890.00",
    status: "FILLED",
    fee: "0.4899",
    feeCurrency: "USDT",
  },
  {
    orderId: "ord_88a1",
    at: "10:38:12.007",
    deployment: "dep_94",
    venue: "DERIBIT",
    symbol: "ETH-PERP",
    orderType: "LIMIT",
    side: "SELL",
    quantity: "1.2000",
    // Both sides of a partial fill. One figure would read as the order.
    filledQuantity: "0.9000",
    price: "2,995.00",
    status: "PARTIALLY_FILLED",
    fee: "0.3577",
    feeCurrency: "USDT",
  },
  {
    orderId: "ord_87f4",
    at: "10:31:05.660",
    deployment: "dep_88",
    venue: "BINANCE",
    symbol: "BTCUSDT",
    orderType: "MARKET",
    side: "BUY",
    quantity: "0.0080",
    // A market order has no limit price to state. Rendered as a stated gap
    // rather than the last trade, which would be a price nobody set.
    price: null,
    status: "FILLED",
    fee: "0.1958",
    feeCurrency: "USDT",
  },
  {
    orderId: "ord_87d1",
    at: "10:22:47.913",
    deployment: "dep_94",
    venue: "DERIBIT",
    symbol: "BTC-PERP",
    orderType: "LIMIT",
    side: "BUY",
    quantity: "0.1000",
    price: "60,700.00",
    status: "REJECTED",
    rejectReason: "risk: max position notional",
    fee: null,
    feeCurrency: null,
  },
  {
    orderId: "ord_87b8",
    at: "10:14:33.290",
    deployment: "dep_88",
    venue: "BINANCE",
    symbol: "BTCUSDT",
    orderType: "LIMIT",
    side: "SELL",
    quantity: "0.0080",
    price: "61,420.00",
    status: "FILLED",
    fee: "0.1966",
    feeCurrency: "USDT",
  },
  {
    orderId: "ord_8791",
    at: "09:58:03.001",
    deployment: "dep_88",
    venue: "BINANCE",
    symbol: "BTCUSDT",
    orderType: "STOP",
    side: "SELL",
    quantity: "0.0080",
    price: "60,400.00",
    status: "TRIGGERED",
    fee: null,
    feeCurrency: null,
  },
  {
    orderId: "ord_8766",
    at: "09:45:12.774",
    deployment: "dep_94",
    venue: "DERIBIT",
    symbol: "ETH-PERP",
    orderType: "LIMIT",
    side: "BUY",
    quantity: "0.8000",
    price: "2,962.40",
    status: "FILLED",
    fee: "0.2370",
    feeCurrency: "USDT",
  },
  {
    orderId: "ord_8712",
    at: "09:12:40.518",
    deployment: "dep_88",
    venue: "BINANCE",
    symbol: "BTCUSDT",
    orderType: "LIMIT",
    side: "BUY",
    quantity: "0.0080",
    price: "61,020.00",
    status: "FILLED",
    fee: "0.1953",
    feeCurrency: "USDT",
  },
];

/**
 * The server applies the bucket, so the fixture does too.
 *
 * Filtering here rather than in the screen is the point: this stands in for a
 * server-side filter, and a fixture that let the screen filter would let the
 * screen learn a habit it must not have at 10⁷ rows.
 */
export function blotterPage(
  filter: "ALL" | "FILLED" | "PARTIAL" | "REJECTED" | "OPEN" = "ALL",
  selectionCount = BLOTTER_SELECTION,
): KeysetPage<BlotterRow> {
  const buckets: Record<string, readonly string[]> = {
    FILLED: ["FILLED"],
    PARTIAL: ["PARTIALLY_FILLED"],
    REJECTED: ["REJECTED", "DENIED"],
    OPEN: ["INITIALIZED", "SUBMITTED", "ACCEPTED", "PENDING_UPDATE", "PENDING_CANCEL", "TRIGGERED"],
  };
  const rows = filter === "ALL" ? ROWS : ROWS.filter((r) => buckets[filter].includes(r.status));
  return {
    rows,
    // Both counts are the server's, over the whole dataset and the whole
    // filter — never over the eight rows that happen to be loaded.
    totalCount: BLOTTER_TOTAL,
    filteredCount: filter === "ALL" ? BLOTTER_TOTAL : selectionCount,
    hasMore: filter === "ALL",
    // A cursor belongs to the query that issued it. A filter change voids it,
    // so a narrowed page carries none rather than one that would page into a
    // different population.
    nextCursor: filter === "ALL" ? "c_ab34e91f7720" : null,
    prevCursor: null,
    hasPrevious: false,
  };
}

/** Server-counted over the whole dataset. */
export const BLOTTER_TOTAL = 48_213;
/** What a chart selection narrowed it to. */
export const BLOTTER_SELECTION = 412;
export const BLOTTER_CROSS_FILTER = "chart selection · Aug 12 10:00–14:00";

/**
 * `aggregates_by_currency` exactly as the canonical contract fixture
 * (packages/contracts/fixtures/execution-projection-page.valid.json) publishes
 * it — copied, not re-typed, so the strings stay the server's strings.
 */
export const AGGREGATES_BY_CURRENCY_RAW = [
  {
    "currency": "USDT",
    "row_count": 45500,
    "quantity_count": 45500,
    "quantity": "125000.250000000000000001",
    "notional_count": 45500,
    "notional": "4875000.750000000000000001",
    "invalid_numeric_count": 0
  }
] as const;
