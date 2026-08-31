/**
 * Alpha 360° fixtures (hi-fi 2a + 2b, CAST).
 *
 * Two shapes on purpose. `alpha360()` is the wireframe's cast — four venues,
 * three deployments — and must render exactly as drawn, with no cap caption.
 * `alpha360AtScale()` is the runtime's, taken from `workload-profile.md`
 * rather than invented: 85 accounts, 82 DNSE symbols, 16 Binance shards, and
 * `orders`/`fills` with no retention policy at all.
 *
 * The second is the one that matters. The first proves a design; the second
 * proves it survives contact with the Trading System.
 */
import { TILE_CHARTS, alphaStageEquity } from "./alpha360.smoke";
import type {
  AccountingRow,
  AlphaScope,
  AlphaThreeSixtyProps,
  AuditRow,
  DeploymentRow,
  InsightTile,
  OrderRow,
  PositionRow,
  SessionRow,
  VenueRow,
} from "./screens/AlphaThreeSixty";
import type { ChartEnvelope, KeysetPage } from "./contracts";
import { ALPHA_INSIGHT_SMOKE, smokeEnvelope, smokeSeriesFor } from "./alpha360.smoke";
/**
 * Fixture DATA, not behaviour (EL-V2-03): the screen's handlers are required
 * in its props, and a fixture factory that stubbed them would be the exact
 * enabled-no-op this phase removes. Callers supply handlers — the preview
 * controllers on product routes, explicit spies in tests.
 */
export type AlphaThreeSixtyData = Omit<AlphaThreeSixtyProps, "onScopeChange" | "onTabChange" | "onLoadOlder" | "onOpenDeployment" | "onOpenAccount">;


const CHART: ChartEnvelope = {
  window: "30d",
  interval: "1h",
  currency: "USDT",
  asOf: "2026-08-22T10:42:01Z",
  authority: "DERIVED",
  formulaVersion: "equity_projection.v1",
  sourceRows: 43_800,
  returnedRows: 4_368,
  downsampleMethod: "lttb",
  coverage: 0.98,
};

const SCOPE: AlphaScope = {
  portfolio: "PF-CRYPTO",
  mode: "All",
  venue: "All",
  window: "30d",
};

const VENUES: VenueRow[] = [
  { venue: "BINANCE", stages: { LIVE_CANARY: "dep_88" }, brokerSync: "OK", syncDetail: "0.9s" },
  {
    venue: "OKX",
    stages: { SANDBOX_VALIDATION: "dep_91" },
    brokerSync: "OK",
    syncDetail: "41s / policy 60s",
    note: "HALTED",
  },
  { venue: "DERIBIT", stages: { PAPER_OBSERVATION: "dep_94" }, brokerSync: "UNKNOWN", note: "N/A (paper)" },
  { venue: "VN MARKET", stages: {}, brokerSync: "UNKNOWN", note: "planned · market hours 09:00–14:45 ICT" },
];

const DEPLOYMENTS: DeploymentRow[] = [
  {
    deploymentId: "dep_88", venue: "BINANCE", mode: "live", stage: "LIVE_CANARY",
    accountId: "acct-canary-grid", allocation: "5,000.00", pnl: "+112.40",
    drawdown: "−0.80%", readiness: "READY", currency: "USDT",
  },
  {
    deploymentId: "dep_91", venue: "OKX", mode: "sandbox", stage: "SANDBOX_VALIDATION",
    accountId: "acct-sbx-grid-okx", allocation: "10,000.00", pnl: null,
    drawdown: null, readiness: "BLOCKED", currency: "USDT",
  },
  {
    deploymentId: "dep_94", venue: "DERIBIT", mode: "paper", stage: "PAPER_OBSERVATION",
    accountId: "acct-paper-grid-drb", allocation: "60,000.00", pnl: "+1,842.00",
    drawdown: "−1.40%", readiness: "READY", currency: "USDC",
  },
];

const TILE_TITLES = [
  "Equity by stage", "Drawdown & underwater", "Rolling corr vs benchmark",
  "Venue contribution", "Execution quality by venue", "Order funnel",
  "Trade return histogram", "Execution density day × hour", "Regime-shaded equity",
  "Paper vs Live drift", "Risk utilization", "Cost drag waterfall",
];

/**
 * Twelve tiles, three of which cannot be drawn.
 *
 * That ratio is deliberate and comes from the runtime: 734 of 1,468 feeds are
 * missing and 21 are stale, so a screen that opened with twelve healthy charts
 * would be a screen nobody had run against this system.
 */
const HONEST_TILES: InsightTile[] = TILE_TITLES.map((title, i) => ({
  index: i + 1,
  title,
  envelope: { ...CHART, formulaVersion: `${title.split(" ")[0].toLowerCase()}.v1` },
  state: i === 4 ? "insufficient_data" : i === 9 ? "insufficient_data" : i === 7 ? "unavailable" : "ok",
  reason:
    i === 4
      ? "DERIBIT has 12 fills in this window; execution quality needs 100."
      : i === 9
        ? "Slippage has no linked run identifier, so paper and live cannot be compared."
        : i === 7
          ? "The kline shard for this venue is publishing no data (734 of 1,468 feeds missing)."
          : null,
}));

/**
 * SMOKE (temporary, see `alpha360.smoke.ts`): an ok tile with no published
 * series gets a synthetic one so the grid can be reviewed. `false` returns
 * the honest tiles untouched. Delete with BR-EX-34.
 */
export function withSmokeSeries(tiles: readonly InsightTile[], enabled: boolean): InsightTile[] {
  if (!enabled) return [...tiles];
  return tiles.map((tile) => {
    if (tile.state === "ok" && !tile.series)
      return { ...tile, series: smokeSeriesFor(tile.index, tile.title), envelope: smokeEnvelope(tile.envelope) };
    // Tiles 8 and 10 draw declared smoke frames (TILE_CHARTS) in place of
    // their honest states — flagged here so the single switch governs them.
    if (tile.index === 8) return { ...tile, smokeChart: "density" as const };
    if (tile.index === 10) return { ...tile, smokeChart: "drift" as const };
    return tile;
  });
}

export const TILES: InsightTile[] = withSmokeSeries(HONEST_TILES, ALPHA_INSIGHT_SMOKE);

function page<T>(rows: readonly T[], total: number, cursor: string | null): KeysetPage<T> {
  return {
    rows,
    totalCount: total,
    filteredCount: total,
    hasMore: cursor !== null,
    nextCursor: cursor,
    prevCursor: null,
    hasPrevious: false,
  };
}

const POSITIONS: PositionRow[] = [
  {
    deploymentId: "dep_88", venue: "BINANCE", symbol: "BTCUSDT", side: "LONG",
    quantity: "0.0080", entry: "61,120.00", mark: "61,455.00", unrealised: "+38.20", currency: "USDT",
  },
  {
    deploymentId: "dep_94", venue: "DERIBIT", symbol: "BTC-PERP", side: "LONG",
    quantity: "0.0400", entry: "60,890.00", mark: "61,455.00", unrealised: "+22.60", currency: "USDC",
  },
  {
    deploymentId: "dep_94", venue: "DERIBIT", symbol: "ETH-PERP", side: "SHORT",
    quantity: "1.2000", entry: "2,995.00", mark: null, unrealised: null, currency: "USDC",
  },
];

export function alpha360(over: Partial<AlphaThreeSixtyData> = {}): AlphaThreeSixtyData {
  return {
    demoStageSeries: alphaStageEquity(),
    demoTiles: TILE_CHARTS,
    alphaId: "av_2041",
    alphaName: "Grid v2.1",
    artifactDigest: "sha256:41bb7d…c4",
    owner: "Stan",
    r1Id: "AP-118",
    r2Id: "AP-152",
    passportHref: "/deployments/alphas/av_2041?tab=Audit",
    envelope: { authority: "EXECUTION", asOf: "2026-08-22T10:42:01Z", freshness: "OK" },
    venueOptions: ["All", "BINANCE", "OKX", "DERIBIT", "VN MARKET"],
    portfolioOptions: ["PF-CRYPTO", "PF-MAIN"],
    modeOptions: ["All", "paper", "sandbox", "live"],
    windowOptions: ["24h", "7d", "30d", "90d"],
    scope: SCOPE,
    tab: "Overview",
    venues: VENUES,
    kpis: [
      { label: "Net PnL (scope)", value: "+1,954.40", unit: "USDT" },
      { label: "Drawdown", value: "−1.40%" },
      { label: "Allocation Σ", value: "75,000.00", unit: "USDT" },
      { label: "Exposure", value: "18,400.00", unit: "USDT" },
      { label: "Deployments", value: "3" },
      // Absent, with a reason. A zero here would claim the check ran clean.
      { label: "Findings", value: null, absentReason: "not counted in this window" },
    ],
    contributions: [
      { venue: "BINANCE", value: "+112.40", currency: "USDT" },
      { venue: "DERIBIT", value: "+1,842.00", currency: "USDC" },
      { venue: "OKX", value: "0.00", currency: "USDT", note: "(halted)" },
    ],
    equity: {
      envelope: {
        ...CHART,
        formulaVersion: "equity_projection.v1",
        // The caption that makes the overlay honest: a downsampled series
        // must say so, and the join key says which series may share an axis.
        downsampleMethod: "lttb · joined by artifact digest",
      },
    },
    deployments: DEPLOYMENTS,
    tiles: TILES,
    positions: page(POSITIONS, 3, null),
    orders: page<OrderRow>([], 0, null),
    audit: page<AuditRow>([], 0, null),
    accounting: [
      { accountId: "acct-canary-grid", currency: "USDT", allocated: "5,000.00", used: "3,100.00", realised: "+112.40", fees: "1.84" },
      { accountId: "acct-paper-grid-drb", currency: "USDC", allocated: "60,000.00", used: "41,200.00", realised: "+1,842.00", fees: "12.40" },
    ],
    sessions: [
      { at: "2026-08-22T04:00:00Z", deploymentId: "dep_88", event: "restart", recovered: "2 open orders", complete: true },
    ],
    reconciliation: [
      { venue: "BINANCE", policy: "live 5s", lastRun: "2026-08-22T10:42:01Z", freshness: "OK", findings: 0 },
      { venue: "DERIBIT", policy: "paper", lastRun: null, freshness: "N/A (paper)", findings: null },
    ],
    risk: [
      { label: "notional", value: "52%", limit: "100%" },
      { label: "leverage", value: "1.3x", limit: "2.0x", canaryEnvelope: true },
      { label: "daily loss", value: "20%", limit: "100%" },
    ],
    ...over,
  };
}

/* -------------------------------------------------------------------------
 * The runtime's shape, from workload-profile.md
 * ---------------------------------------------------------------------- */

/** 16 Binance shards + DNSE + the rest. The wireframe drew four. */
export function venuesAtScale(n = 22): VenueRow[] {
  return Array.from({ length: n }, (_, i) => ({
    venue: i < 16 ? `BINANCE-S${String(i).padStart(2, "0")}` : `VENUE-${i}`,
    stages: { LIVE_FULL: `dep_${1000 + i}` },
    // One shard stopped. It is row 19 of 22 and it is the whole reason to look.
    brokerSync: i === 19 ? "ERROR" : "OK",
    syncDetail: i === 19 ? "no publish for 14m" : "0.9s",
  }));
}

export function deploymentsAtScale(n = 60): DeploymentRow[] {
  return Array.from({ length: n }, (_, i) => ({
    deploymentId: `dep_${2000 + i}`,
    venue: `BINANCE-S${String(i % 16).padStart(2, "0")}`,
    mode: "live",
    stage: "LIVE_FULL" as const,
    accountId: `acct-${i}`,
    allocation: `${1000 + i}.00`,
    pnl: `+${i}.00`,
    drawdown: "−0.10%",
    // One halted deployment at row 51, past any head-cap.
    readiness: (i === 51 ? "BLOCKED" : "READY") as DeploymentRow["readiness"],
    currency: "USDT",
  }));
}

/** 82 DNSE symbols × several deployments. `fills` has no retention policy. */
export function positionsAtScale(n = 1_200, total = 48_213): KeysetPage<PositionRow> {
  return page(
    Array.from({ length: n }, (_, i) => ({
      deploymentId: `dep_${2000 + (i % 60)}`,
      venue: `BINANCE-S${String(i % 16).padStart(2, "0")}`,
      symbol: `SYM${String(i % 82).padStart(3, "0")}`,
      side: (i % 2 === 0 ? "LONG" : "SHORT") as "LONG" | "SHORT",
      quantity: `${(i + 1) / 10000}`,
      entry: `${60000 + i}.00`,
      mark: i % 97 === 0 ? null : `${60100 + i}.00`,
      unrealised: i % 97 === 0 ? null : `+${i}.00`,
      currency: "USDT",
    })),
    total,
    "c_pos_9f21",
  );
}

/** 85 accounts across three currencies. The wireframe drew two rows. */
export function accountingAtScale(accounts = 85): AccountingRow[] {
  const currencies = ["USDT", "USDC", "VND"];
  return accounts * currencies.length > 0
    ? Array.from({ length: accounts }, (_, a) =>
        currencies.map((currency, c) => ({
          accountId: `acct-${String(a).padStart(3, "0")}`,
          currency,
          // One account did not report — row 200 of 255, past any head-cap.
          allocated: a * 3 + c === 200 ? null : `${1000 + a}.00`,
          used: a * 3 + c === 200 ? null : `${500 + a}.00`,
          realised: `+${a}.00`,
          fees: `${a / 100}`,
        })),
      ).flat()
    : [];
}

export function sessionsAtScale(n = 400): SessionRow[] {
  return Array.from({ length: n }, (_, i) => ({
    at: `2026-08-${String(1 + (i % 28)).padStart(2, "0")}T04:00:00Z`,
    deploymentId: `dep_${2000 + (i % 60)}`,
    event: "restart",
    recovered: i === 350 ? null : `${i % 5} open orders`,
    // One recovery never completed, at row 350.
    complete: i !== 350,
  }));
}

/** `domain_events` has no retention policy either. */
export function auditAtScale(n = 500, total = 1_284_991): KeysetPage<AuditRow> {
  return page(
    Array.from({ length: n }, (_, i) => ({
      at: `2026-08-22T${String(i % 24).padStart(2, "0")}:00:00Z`,
      actor: `operator-${i % 7}`,
      command: "deployment halt",
      target: `dep_${2000 + (i % 60)}`,
      outcome: i % 50 === 0 ? "PARTIAL" : "VERIFIED",
    })),
    total,
    "c_audit_44b1",
  );
}

export function alpha360AtScale(over: Partial<AlphaThreeSixtyData> = {}): AlphaThreeSixtyData {
  return alpha360({
    venues: venuesAtScale(),
    deployments: deploymentsAtScale(),
    positions: positionsAtScale(),
    accounting: accountingAtScale(),
    sessions: sessionsAtScale(),
    audit: auditAtScale(),
    ...over,
  });
}
