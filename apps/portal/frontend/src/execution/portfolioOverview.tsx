/**
 * Portfolio 360 · Overview — the three panels the hi-fi draws (P0-4).
 *
 * The tab had a KPI strip and nothing else on real data: the equity chart, the
 * cross-portfolio comparison and the configuration log were drawn in the hi-fi
 * and never built. All three are computable from rows the Portal already
 * drains, so none of them waits on a new contract:
 *
 *   * equity comes from `portfolio-equity-snapshots`,
 *   * the comparison from the same relation across the other portfolios,
 *   * the configuration log from `portfolio-capital-ledger`, whose movements
 *     carry actor, reason and the before/after allocation.
 *
 * The benchmark line is the one part with no source, so it is named `Soon`
 * rather than drawn from a proxy: a benchmark inferred from the portfolio's own
 * equity would compare a series against itself and always look flat.
 */
import type { ReactNode } from "react";

import { LinesChart } from "./components/marketChart";
import { PanelState } from "./components/states";
import { formatExact } from "./formatExact";
import { utcStamp } from "./time";
import type { RelationFacts } from "./api/managerRelations";

type Row = Record<string, unknown>;

const text = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value
    : typeof value === "number" && Number.isFinite(value) ? String(value) : null;

const decimal = (value: unknown): number | null => {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(n) ? n : null;
};

const ms = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export interface EquityPoint { t: number; equity: number }

/** One portfolio's equity snapshots, oldest first, one currency at a time. */
export function equitySeriesOf(rows: readonly Row[], portfolioId: string): { points: EquityPoint[]; currency: string | null } {
  const points: EquityPoint[] = [];
  let currency: string | null = null;
  for (const row of rows) {
    if (text(row.portfolio_id) !== portfolioId) continue;
    const at = ms(row.ts ?? row.created_at);
    const equity = decimal(row.equity);
    if (at === null || equity === null) continue;
    currency ??= text(row.currency);
    points.push({ t: at, equity });
  }
  points.sort((left, right) => left.t - right.t);
  return { points, currency };
}

export interface PortfolioStanding {
  portfolioId: string;
  /** the published decimals, exactly as they arrived */
  firstText: string;
  lastText: string;
  /** the source's own net for the latest snapshot; the browser computes none */
  netText: string | null;
  currency: string | null;
  points: number;
}

/**
 * Every portfolio in the drained snapshots: its first and last published
 * equity, and the source's own net beside them.
 *
 * The browser does no arithmetic here. Subtracting the first equity from the
 * last would be the browser deciding a capital number the engine is
 * authoritative for, which the analytics gate forbids by name — and the
 * snapshot already carries `net_pnl`, so there is nothing to derive.
 */
export function crossPortfolioStandings(rows: readonly Row[]): PortfolioStanding[] {
  const byPortfolio = new Map<string, { firstAt: number; lastAt: number; firstText: string; lastText: string; netText: string | null; currency: string | null; count: number }>();
  for (const row of rows) {
    const portfolioId = text(row.portfolio_id);
    const at = ms(row.ts ?? row.created_at);
    const equityText = text(row.equity);
    if (!portfolioId || at === null || equityText === null) continue;
    const existing = byPortfolio.get(portfolioId);
    if (!existing) {
      byPortfolio.set(portfolioId, {
        firstAt: at, lastAt: at, firstText: equityText, lastText: equityText,
        netText: text(row.net_pnl), currency: text(row.currency), count: 1,
      });
      continue;
    }
    if (at < existing.firstAt) { existing.firstAt = at; existing.firstText = equityText; }
    if (at > existing.lastAt) { existing.lastAt = at; existing.lastText = equityText; existing.netText = text(row.net_pnl); }
    existing.count += 1;
  }
  return [...byPortfolio.entries()]
    .map(([portfolioId, value]) => ({
      portfolioId,
      firstText: value.firstText,
      lastText: value.lastText,
      netText: value.netText,
      currency: value.currency,
      points: value.count,
    }))
    .sort((left, right) => right.points - left.points);
}

export interface ConfigMovement {
  at: number;
  movement: string;
  actor: string | null;
  reason: string | null;
  amount: string | null;
  currency: string | null;
  before: string | null;
  after: string | null;
  strategyId: string | null;
}

/** Capital movements of one portfolio, newest first: who changed what, and why. */
export function configurationLogOf(rows: readonly Row[], portfolioId: string, limit = 25): ConfigMovement[] {
  const out: ConfigMovement[] = [];
  for (const row of rows) {
    if (text(row.portfolio_id) !== portfolioId) continue;
    const at = ms(row.created_at ?? row.ts);
    if (at === null) continue;
    out.push({
      at,
      movement: text(row.movement_type) ?? "movement not published",
      actor: text(row.actor),
      reason: text(row.reason),
      amount: text(row.amount),
      currency: text(row.currency),
      before: text(row.before_allocated),
      after: text(row.after_allocated),
      strategyId: text(row.strategy_id),
    });
  }
  out.sort((left, right) => right.at - left.at);
  return out.slice(0, limit);
}

const money = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 2 });

export interface PortfolioOverviewInput {
  portfolioId: string;
  relations: RelationFacts | null | undefined;
  loading: boolean;
  asOf: string | null;
}

/** The three Overview panels, or honest states in their place. */
export function portfolioOverviewPanels(input: PortfolioOverviewInput): {
  equityVsBenchmark: ReactNode;
  crossPortfolio: ReactNode;
  configurationLog: ReactNode;
} {
  const snapshots = input.relations?.facts.portfolio_equity_snapshots;
  const ledger = input.relations?.facts.portfolio_capital_ledger;
  const reason = input.loading
    ? "the portfolio relations are still draining"
    : "Soon · PORTFOLIO_EQUITY_SNAPSHOTS_NOT_READABLE";
  const status = input.loading ? "loading" as const : "unavailable" as const;

  const equity = snapshots ? equitySeriesOf(snapshots, input.portfolioId) : null;
  const standings = snapshots ? crossPortfolioStandings(snapshots) : [];
  const movements = ledger ? configurationLogOf(ledger, input.portfolioId) : [];

  return {
    equityVsBenchmark: (
      <section className="exec-gate-panel" aria-label="Equity vs benchmark">
        <h3 className="exec-section-title">Equity vs benchmark</h3>
        {equity && equity.points.length > 1 ? (
          <>
            <LinesChart
              series={[{ name: `portfolio equity${equity.currency ? ` · ${equity.currency}` : ""}`, tone: "good", points: equity.points.map((point) => [new Date(point.t).toISOString(), point.equity] as const) }]}
              height={170}
              yFormatter={money}
              provenance={{ authority: "EXECUTION", asOf: input.asOf ?? "—", formula: "portfolio_equity_snapshots" }}
              ariaLabel="Portfolio equity over the drained snapshot window"
            />
            <p className="exec-blotter-note">
              {equity.points.length} published snapshots · benchmark line: Soon · BENCHMARK_SERIES_NOT_PUBLISHED
            </p>
          </>
        ) : (
          <PanelState status={status} reason={equity ? "the source published fewer than two equity snapshots for this portfolio" : reason} />
        )}
      </section>
    ),
    crossPortfolio: (
      <section className="exec-gate-panel" aria-label="Cross-portfolio">
        <h3 className="exec-section-title">Cross-portfolio</h3>
        {standings.length > 0 ? (
          <table className="exec-360-sync">
            <caption className="sr-only">Every portfolio in the drained snapshots, first and last equity</caption>
            <thead>
              <tr><th scope="col">portfolio</th><th scope="col">first equity</th><th scope="col">last equity</th><th scope="col">net · source</th><th scope="col">snapshots</th></tr>
            </thead>
            <tbody>
              {standings.map((row) => (
                <tr key={row.portfolioId} data-self={row.portfolioId === input.portfolioId ? "true" : undefined}>
                  <th scope="row">{row.portfolioId}{row.currency ? <span className="exec-blotter-note"> · {row.currency}</span> : null}</th>
                  <td className="exec-num">{formatExact(row.firstText, "money").display}</td>
                  <td className="exec-num">{formatExact(row.lastText, "money").display}</td>
                  <td className="exec-num">{row.netText === null ? <span className="exec-blotter-note">net not published</span> : formatExact(row.netText, "money").display}</td>
                  <td className="exec-num">{row.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <PanelState status={status} reason={reason} />
        )}
        <p className="exec-blotter-note">each portfolio in its own base currency · never summed across currencies · net is the source\u2019s own figure, not a browser subtraction</p>
      </section>
    ),
    configurationLog: (
      <section className="exec-gate-panel" aria-label="Configuration log">
        <h3 className="exec-section-title">Configuration log</h3>
        {movements.length > 0 ? (
          <table className="exec-360-sync">
            <caption className="sr-only">Capital movements of this portfolio, newest first</caption>
            <thead>
              <tr><th scope="col">when</th><th scope="col">movement</th><th scope="col">actor</th><th scope="col">amount</th><th scope="col">allocated before → after</th><th scope="col">reason</th></tr>
            </thead>
            <tbody>
              {movements.map((row) => (
                <tr key={`${row.at}-${row.movement}-${row.strategyId ?? ""}`}>
                  <td className="exec-num">{utcStamp(new Date(row.at).toISOString())}</td>
                  <td>{row.movement}{row.strategyId ? <span className="exec-blotter-note"> · {row.strategyId}</span> : null}</td>
                  <td>{row.actor ?? <span className="exec-blotter-note">actor not published</span>}</td>
                  <td className="exec-num">{row.amount ?? "—"}{row.currency ? <span className="exec-blotter-note"> {row.currency}</span> : null}</td>
                  <td className="exec-num">{row.before ?? "—"} → {row.after ?? "—"}</td>
                  <td>{row.reason ?? <span className="exec-blotter-note">reason not published</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <PanelState status={status} reason={ledger ? "the source published no capital movement for this portfolio" : "Soon · PORTFOLIO_CAPITAL_LEDGER_NOT_READABLE"} />
        )}
      </section>
    ),
  };
}
