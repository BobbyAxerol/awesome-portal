/**
 * Alpha 360 · Insight Charts — the hi-fi's twelve tiles, in the hi-fi's order
 * (P0-3).
 *
 * Before this the screen listed whatever analytics capabilities the server
 * happened to publish, numbered in the order they arrived: seven canvases under
 * four names the hi-fi never uses. The reviewed design fixes both the identity
 * and the position of each tile, and an operator who has learned that panel 8
 * is execution density reads panel 8 without reading its title.
 *
 * So the twelve are built by name here. Each one either draws from published
 * rows or states, in the source's own words, what is missing — and the tiles
 * the Portal adds on top of the hi-fi keep their place *after* the twelve
 * rather than displacing them.
 */
import type { ReactNode } from "react";

import { BarsChart, DensityHeatmap, LinesChart } from "./components/marketChart";
import { HistogramChart } from "./components/visuals";
import { formatExact } from "./formatExact";
import {
  DENSITY_DAYS, HIFI_TILES, costDrag, densityGrid, returnHistogram, venueContribution, venueQuality,
} from "./hifiTiles";
import type { QueryAnalytics } from "./api/profileRead";
import type { RelationFacts } from "./api/managerRelations";
import type { InsightTile } from "./screens/AlphaThreeSixty";
import type { Authority, ChartEnvelope } from "./contracts";

type Row = Record<string, unknown>;

const HOURS = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0"));

const text = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value
    : typeof value === "number" && Number.isFinite(value) ? String(value) : null;

const decimal = (value: unknown): number | null => {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(n) ? n : null;
};

const count = (value: number) => formatExact(String(Math.round(value)), "count").display;
const money = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 2 });
const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

function factRows(rows: readonly (readonly [string, string])[], caption: string): ReactNode {
  return (
    <table className="exec-tile-facts">
      <caption className="sr-only">{caption}</caption>
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}><th scope="row">{label}</th><td className="exec-num">{value}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * One tile's outcome: either a body drawn from rows, or a reason the source
 * gives. `soon` marks the reasons that are a schedule rather than a fault, so
 * the panel can say "Soon" (see `soon.ts`).
 */
interface TileOutcome {
  body?: ReactNode;
  state: "ok" | "insufficient_data" | "unavailable";
  reason?: string | null;
}

const missing = (reason: string): TileOutcome => ({ state: "unavailable", reason });
const thin = (reason: string): TileOutcome => ({ state: "insufficient_data", reason });

export interface HifiInsightInput {
  analytics: QueryAnalytics;
  /** the drained relation page set (EDS-11R1); fills and orders drive five tiles */
  relations?: RelationFacts | null;
  asOf: string | null;
  /** the scope the reader chose, echoed in each tile's envelope */
  window?: string;
  /**
   * Why the analytics branch could not be read at all, in the server's words.
   * When it is set every tile says that, rather than each guessing at its own
   * missing input: "the analytics branch is disabled" and "this alpha has no
   * equity series" are different facts and the reader acts on them differently.
   */
  analyticsUnavailable?: string | null;
  /**
   * The analytics envelope as the server sent it, before the resource's own
   * scoped facts were merged over it. The contribution tile reads its
   * performance rows from here: that branch belongs to the analytics read, and
   * the resource's copy is a different, subject-scoped snapshot.
   */
  published?: QueryAnalytics | null;
}

/** Fills and orders of this subject: the relation page set first, the N25 page as the fallback. */
function subjectRows(input: HifiInsightInput): { fills: readonly Row[]; orders: readonly Row[]; source: string } {
  const facts = input.analytics.sourceFacts ?? {};
  const relationFills = input.relations?.facts.fills;
  const relationOrders = input.relations?.facts.orders;
  if (relationFills && relationOrders) {
    return { fills: relationFills, orders: relationOrders, source: "Manager relation page set (EDS-11R1)" };
  }
  return { fills: facts.fills ?? [], orders: facts.orders ?? [], source: "retained projection page (N25)" };
}


/**
 * The source's own per-venue net, latest snapshot per venue and currency.
 *
 * `netText` keeps the published decimal exactly as it arrived: the number is
 * for the bar's height, the string is what the reader sees, and rounding the
 * second one to two places is how a blotter stops reconciling (DS §3).
 */
function performanceContribution(analytics: QueryAnalytics, published?: QueryAnalytics | null): { venue: string; currency: string; net: number; netText: string }[] {
  const latest = new Map<string, { row: Row; at: string }>();
  const rows = published?.sourceFacts?.performance ?? analytics.sourceFacts?.performance ?? [];
  for (const row of rows) {
    const venue = text(row.venue);
    const currency = text(row.currency);
    if (!venue || !currency) continue;
    const key = `${venue}\u0000${currency}`;
    const at = text(row.ts) ?? "";
    const held = latest.get(key);
    if (!held || at >= held.at) latest.set(key, { row, at });
  }
  return [...latest.values()].flatMap(({ row }) => {
    const net = decimal(row.net_pnl);
    const netText = text(row.net_pnl);
    return net === null || netText === null ? [] : [{ venue: text(row.venue)!, currency: text(row.currency)!, net, netText }];
  });
}

export function hifiInsightTiles(input: HifiInsightInput): InsightTile[] {
  const { analytics, asOf } = input;
  const { fills, orders, source } = subjectRows(input);
  const provenance = (formula: string) => ({
    authority: "DERIVED",
    asOf: asOf ?? "—",
    formula,
  });
  const envelopeOf = (formula: string | null): ChartEnvelope => ({
    authority: "DERIVED" as Authority,
    asOf: asOf ?? "",
    window: input.window ?? analytics.completeness ?? "window not stated",
    interval: "—",
    formulaVersion: formula ?? analytics.formulaVersion,
  });

  const outcome = (index: number): TileOutcome => {
    switch (index) {
      case 1: {
        // Equity by stage — the published series; the screen draws it through
        // its own EquityChart, so this tile only reports when it is absent.
        return analytics.chartSeries.length > 0
          ? { state: "ok" }
          : missing("EQUITY_SERIES_NOT_PUBLISHED");
      }
      case 2: {
        const dd = analytics.drawdownOverlap;
        const mine = dd?.alphas.find((alpha) => alpha.alphaId === analytics.subjectId) ?? null;
        if (!dd || !mine || mine.series.length === 0) return missing(dd?.reasonCode ?? "DRAWDOWN_NOT_PUBLISHED");
        return {
          state: "ok",
          body: (
            <>
              <LinesChart
                series={[{ name: "drawdown", tone: "bad", points: mine.series.map((point) => [point.t, point.drawdown] as const) }]}
                bands={dd.overlaps.slice(0, 16).map((overlap) => ({ from: overlap.from, to: overlap.to, label: `${overlap.alphaIds.length} alphas`, tone: "warn" as const }))}
                zeroLine={{ label: "0" }}
                height={150}
                yFormatter={(value) => `${(value * 100).toFixed(2)}%`}
                provenance={provenance(dd.formulaVersion ?? "drawdown_overlap.v1")}
                ariaLabel="Daily drawdown of this alpha with the portfolio's joint-drawdown windows shaded"
              />
              {factRows([
                ["max drawdown", `${mine.maxDrawdown ?? "not published"} @ ${mine.maxDrawdownAt ?? "—"}`],
                ["window", `${dd.windowDays ?? "?"}d · no smoothing`],
              ], "Drawdown and underwater")}
            </>
          ),
        };
      }
      case 3: {
        const correlation = analytics.correlation;
        if (!correlation || correlation.pairs.length === 0) return missing(correlation?.reasonCode ?? "CORRELATION_NOT_PUBLISHED");
        const me = analytics.subjectId;
        const mine = correlation.pairs
          .filter((pair) => pair.left === me || pair.right === me)
          .map((pair) => [pair.left === me ? pair.right : pair.left, pair.rho] as const)
          .sort((a, b) => b[1] - a[1]);
        const points = mine.length > 0 ? mine.slice(0, 14) : correlation.pairs.slice(0, 14).map((pair) => [`${pair.left} ↔ ${pair.right}`, pair.rho] as const);
        return {
          state: "ok",
          body: (
            <>
              <BarsChart
                points={points.map(([label, rho]) => [label.slice(0, 18), rho] as const)}
                height={150}
                yFormatter={(value) => value.toFixed(2)}
                provenance={provenance(correlation.formulaVersion ?? "portfolio-correlation-returns.v1")}
                ariaLabel="Correlation of this alpha against each other alpha in the window"
              />
              {factRows([
                ["window", `${correlation.windowDays ?? "?"}d · ${correlation.alphaIds.length} alphas`],
                ["benchmark", "Soon · BENCHMARK_SERIES_NOT_PUBLISHED"],
              ], "Rolling correlation")}
            </>
          ),
        };
      }
      case 4: {
        // The source publishes its own per-venue performance snapshot. That is
        // the number to show: computing a second one from fills would put two
        // different figures for the same thing on two screens. Fills are the
        // fallback, and the caption says which one is on screen.
        const published = performanceContribution(analytics, input.published);
        if (published.length > 0) {
          return {
            state: "ok",
            body: (
              <>
                <BarsChart
                  points={published.slice(0, 12).map((row) => [`${row.venue} ${row.currency}`, row.net] as const)}
                  height={150}
                  yFormatter={money}
                  provenance={provenance("latest source performance snapshot · net per venue and currency")}
                  ariaLabel="Net value per venue and currency, from the source's own performance snapshot"
                />
                {factRows(published.slice(0, 6).map((row) => [`${row.venue} · ${row.currency}`, `net ${formatExact(row.netText, "money").display}`] as const), "Venue contribution")}
              </>
            ),
          };
        }
        const rows = venueContribution(fills);
        if (rows.length === 0) return thin("no fill of this subject carries a realized value in the loaded page set");
        return {
          state: "ok",
          body: (
            <>
              <BarsChart
                points={rows.slice(0, 12).map((row) => [`${row.venue} ${row.currency}`, row.realized] as const)}
                height={150}
                yFormatter={money}
                provenance={provenance("venue_contribution from fills.realized_pnl")}
                ariaLabel="Realized value per venue and currency, never mixed across currencies"
              />
              {factRows(rows.slice(0, 6).map((row) => [`${row.venue} · ${row.currency}`, `${money(row.realized)} · ${count(row.fills)} fills`] as const), "Venue contribution")}
            </>
          ),
        };
      }
      case 5: {
        const rows = venueQuality(orders, fills);
        if (rows.length === 0) return thin("no order in the loaded page set names a venue");
        const quality = analytics.executionQuality ?? {};
        const latencyState = typeof quality.latency_state === "string" ? quality.latency_state : null;
        const latencyReason = typeof quality.latency_reason_code === "string" ? quality.latency_reason_code : null;
        return {
          state: "ok",
          body: (
            <>
              <BarsChart
                points={rows.flatMap((row) => [
                  [`${row.venue} filled`, row.filled] as const,
                  [`${row.venue} rejected`, row.rejected] as const,
                ])}
                height={150}
                yFormatter={count}
                provenance={provenance("execution_quality.v1 grouped by the venue on each row")}
                ariaLabel="Filled and rejected orders per venue"
              />
              {factRows([
                ...rows.slice(0, 4).map((row) => [
                  row.venue,
                  `${count(row.submitted)} submitted · ${count(row.fills)} fills · reject ${row.rejectRate === null ? "not computable" : pct(row.rejectRate)}`,
                ] as const),
                ["ack latency", latencyState === "UNAVAILABLE" && latencyReason ? `Soon · ${latencyReason}` : latencyState ?? "not published"],
              ], "Execution quality by venue")}
            </>
          ),
        };
      }
      case 6: {
        const funnel = analytics.orderFunnel;
        if (!funnel || funnel.totalOrders === null) return missing("ORDER_FUNNEL_NOT_PUBLISHED");
        const statuses = Object.entries(funnel.statusCounts);
        return {
          state: "ok",
          body: (
            <>
              <BarsChart
                points={[["total", funnel.totalOrders] as const, ...statuses.map(([status, value]) => [status.toLowerCase(), value] as const)]}
                height={150}
                yFormatter={count}
                provenance={provenance("order_funnel.v1")}
                ariaLabel="Order funnel: total orders and the count in each published status"
              />
              {factRows([
                ["total orders", count(funnel.totalOrders)],
                ...statuses.map(([status, value]) => [status.toLowerCase(), count(value)] as const),
              ], "Order funnel")}
            </>
          ),
        };
      }
      case 7: {
        const hist = returnHistogram(fills);
        if (!hist) return thin("no fill in the loaded page set carries a realized value");
        return {
          state: "ok",
          body: (
            <>
              <HistogramChart
                hist={{ label: "realized per fill", unit: "money", buckets: hist.buckets, p50: hist.p50, p95: hist.p95 }}
                height={150}
              />
              {factRows([
                ["trades priced", `${count(hist.trades)} · net of fees as the source published them`],
                ["p50 · p95", `${money(hist.p50)} · ${money(hist.p95)}`],
                ["fills without a realized value", count(hist.withoutPnl)],
              ], "Trade return histogram")}
            </>
          ),
        };
      }
      case 8: {
        const grid = densityGrid(fills);
        if (!grid) return thin("no fill in the loaded page set carries a trade time");
        return {
          state: "ok",
          body: (
            <>
              <DensityHeatmap
                days={[...DENSITY_DAYS]}
                hours={HOURS}
                cells={grid.cells}
                height={190}
                provenance={provenance("fills per UTC weekday × hour")}
                ariaLabel="Fills per UTC weekday and hour"
              />
              {factRows([
                ["fills placed", count(grid.total)],
                ["busiest cell", grid.busiest ? `${grid.busiest.day} ${String(grid.busiest.hour).padStart(2, "0")}:00 UTC · ${count(grid.busiest.count)} fills` : "—"],
                ["venue calendars", "Soon · VENUE_SESSION_CALENDAR_NOT_PUBLISHED"],
              ], "Execution density")}
            </>
          ),
        };
      }
      case 9: {
        return analytics.chartSeries.length > 0
          ? { state: "insufficient_data", reason: "regime labels are not published — the equity series is drawn unshaded on tile 1 · Soon · REGIME_LABELS_NOT_PUBLISHED" }
          : missing("EQUITY_SERIES_NOT_PUBLISHED");
      }
      case 10: {
        const modes = new Set(orders.map((order) => String(order.mode ?? "").toLowerCase()).filter(Boolean));
        return thin(modes.has("live")
          ? "paper and live rows exist but the drift formula is not published · Soon · PAPER_LIVE_DRIFT_NOT_PUBLISHED"
          : `no live deployment exists for this subject — the drift needs both sides · Soon · PAPER_LIVE_DRIFT_NOT_PUBLISHED · modes seen: ${[...modes].join(", ") || "none"}`);
      }
      case 11: {
        return missing("Soon · N17B_SOURCE_REJECTED — risk profiles and alpha risk config are refused by the Manager envelope today");
      }
      case 12: {
        const rows = costDrag(fills);
        if (rows.length === 0) return thin("no fill in the loaded page set carries a fee or a realized value");
        const first = rows[0];
        return {
          state: "ok",
          body: (
            <>
              <BarsChart
                points={[["gross", first.gross] as const, ["fees", -first.fees] as const, ["net", first.net] as const]}
                height={150}
                yFormatter={money}
                provenance={provenance("costdrag from fills.realized_pnl and fills.commission")}
                ariaLabel={`Cost drag in ${first.currency}: gross, fees and net`}
              />
              {factRows([
                ...rows.slice(0, 3).map((row) => [row.currency, `gross ${money(row.gross)} · fees ${money(row.fees)} · net ${money(row.net)}`] as const),
                ["funding", first.fundingPublished ? "published on the fill" : "Soon · FUNDING_NOT_PUBLISHED_ON_FILL"],
                ["slippage", "Soon · SLIPPAGE_TERM_OMITTED_UNTIL_EVIDENCED"],
              ], "Cost drag")}
            </>
          ),
        };
      }
      default:
        return missing("UNKNOWN_TILE");
    }
  };

  return HIFI_TILES.map((tile) => {
    const result = input.analyticsUnavailable
      ? { state: "unavailable" as const, reason: input.analyticsUnavailable }
      : outcome(tile.index);
    return {
      index: tile.index,
      title: tile.title,
      envelope: envelopeOf(null),
      state: result.state,
      reason: result.reason ?? (result.state === "ok" ? `${tile.caption} · ${source}` : tile.caption),
      body: result.body,
    };
  });
}
