/**
 * Paper workbench demo charts — the hi-fi's research-band, VN-session,
 * candle-overlay and correlation panels, drawn from `paper.smoke` series.
 * Lab-only: the product passes no `demoPlots`, and those panel slots state
 * the capability's own reason instead.
 */
import { corrSeries, paperCandles, researchBand, vnSessions } from "../paper.smoke";
import { CandlesChart, LinesChart } from "../components/marketChart";

/** Drift vs the backtest expectation: dashed expected, solid paper, ±1σ band. */
export function DriftChart() {
  const rows = researchBand(12, "2026-08-22", 0.02);
  return (
    <LinesChart
      height={150}
      series={[
        { name: "backtest expected", tone: "mute", dashed: true, width: 1.4, points: rows.map((r) => [r.t, r.bt] as const) },
        { name: "paper", tone: "good", width: 2, points: rows.map((r) => [r.t, r.pp] as const) },
      ]}
      band={{ points: rows.map((r) => [r.t, r.lo, r.hi] as const) }}
      yFormatter={(v) => `${v.toFixed(1)}pt`}
      provenance={{ authority: "DERIVED", asOf: "2026-08-22", formula: "drift.v1 · run_5512" }}
      ariaLabel="Paper against the backtest expectation, inside a one-sigma band"
    />
  );
}

/** Equity vs the approved run: expected band, backtest dashed, paper solid. */
export function CryptoEquity({ asOf }: { asOf: string | null }) {
  // The dip sits at index 19 = 2026-08-12: the KPI strip's −2.14% max drawdown
  // happened on a stated day, and the annotation sits on that day's trough
  // rather than floating where a label was pinned. Repeats the KPI, never
  // recomputes it.
  const rows = researchBand(30, "2026-08-22", 0.012, 19);
  const dd = rows[19];
  return (
    <LinesChart
      height={230}
      series={[
        { name: "backtest", tone: "mute", dashed: true, width: 1.4, points: rows.map((r) => [r.t, r.bt] as const) },
        { name: "paper", tone: "accent", width: 2, points: rows.map((r) => [r.t, r.pp] as const) },
      ]}
      band={{ points: rows.map((r) => [r.t, r.lo, r.hi] as const) }}
      annotation={{ t: dd.t, v: dd.pp, label: "DD −2.14% · Aug 12", tone: "bad" }}
      yFormatter={(v) => `${v.toFixed(1)}%`}
      provenance={{ authority: "EXECUTION", asOf: asOf ?? "—", formula: "equity_projection.v1" }}
      ariaLabel="Paper equity against the backtest line and the expected band"
    />
  );
}

/** VN equity: the line exists only inside a session; the closed windows are the venue's calendar, drawn as areas. */
export function VnEquity({ asOf }: { asOf: string | null }) {
  const vn = vnSessions();
  return (
    <LinesChart
      height={230}
      series={[{ name: "equity", tone: "accent", width: 2, points: vn.points }]}
      closedWindows={vn.closed}
      annotation={{ t: vn.frozen.t, v: vn.frozen.v, label: "frozen at close", tone: "accent" }}
      yFormatter={(v) => `${(v / 1_000_000).toFixed(0)}M`}
      provenance={{ authority: "EXECUTION", asOf: asOf ?? "—", formula: "equity_projection.v1" }}
      ariaLabel="Equity by session, shaded where the market is closed"
    />
  );
}

/** Real candles with the order journal on them — a marker answers the hover with its order. */
export function Overlay({ asOf }: { asOf: string | null }) {
  const { candles, markers } = paperCandles();
  return (
    <CandlesChart
      height={210}
      candles={candles}
      markers={markers}
      provenance={{ authority: "EXECUTION", asOf: asOf ?? "—", formula: "BINANCE data_layer snapshot ds_5512" }}
      ariaLabel="Candles with order and fill markers"
    />
  );
}

/** Rolling correlation vs portfolio and benchmark, around rho = 0. */
export function Correlation({ asOf }: { asOf: string | null }) {
  const rows = corrSeries("2026-08-22");
  return (
    <LinesChart
      height={170}
      series={[
        { name: "ρ vs portfolio", tone: "accent", width: 2, points: rows.map((r) => [r.t, r.pf] as const) },
        { name: "ρ vs benchmark", tone: "paper", dashed: true, width: 1.4, points: rows.map((r) => [r.t, r.bm] as const) },
      ]}
      zeroLine={{ label: "ρ = 0" }}
      yFormatter={(v) => v.toFixed(2)}
      provenance={{ authority: "DERIVED", asOf: asOf ?? "—", formula: "corr.v1 · cov_30d_v2" }}
      ariaLabel="Rolling correlation vs portfolio and benchmark"
    />
  );
}
