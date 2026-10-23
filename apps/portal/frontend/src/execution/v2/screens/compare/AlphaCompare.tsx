/**
 * Compare, Alphas tab (hi-fi "Portfolios / Alphas"). Same screen, another subject kind.
 *
 * Identity comes from the Alpha Fleet read (the alphas the Fleet publishes). The metric rows are the Manager dataset of each picked alpha
 * (`getManagerDataset({surface: "ALPHA", id})`): one line per dataset row (an alpha version in one portfolio) and per economic partition,
 * exactly as the dataset publishes them. Nothing is added across rows, partitions, currencies or the Real-funded and Simulated books,
 * and a currency is never converted; a Return or a score is the server's figure. The overlay chart is the manager series port asked for
 * ALPHA subjects (`execution-manager-series.v1` subject_type ALPHA, WP-K): 2 to 4 alphas, one measure (NAV, Net PnL, Return or Drawdown), and the
 * server's own `comparison` (ALIGNED / INCOMPARABLE / UNAVAILABLE) decides whether a line is drawn. Nothing is rebased, summed or converted here, and
 * a series the port does not publish stays the typed absence it answers with.
 */
import { useMemo, useState, type ReactNode } from "react";

import type { ExecutionApi } from "../../../api/ports";
import { PanelSkeleton, PanelState } from "../../../components/states";
import { NaWhy, SectionPanel } from "../../blocks";
import { CardsTable, type CardsColumn } from "../../cardsTable";
import { ChartTools, CompareOverlay, type CompareSeries, type NotComparable } from "../../charts";
import { ChartUnavailable } from "../../charts/ChartStateView";
import type { ManagerRow } from "../../readers/managerDataset";
import type { ManagerEnvironment } from "../../readers/managerDataset";
import type { ManagerMetricRead } from "../../readers/managerMetric";
import type { ManagerSeriesMetric, ManagerSeriesQuery } from "../../readers/managerSeries";
import { METRIC_WORD, MISMATCH_SENTENCE, UNAVAILABLE_SENTENCE, chartPointsOf, chartStateOf, chartUnit, commonCaption, isSigned, sourceNotPublished } from "../series/seriesModel";
import { useManagerSeries } from "../series/useManagerSeries";
import { PartitionFigures } from "../fleet/PartitionFigures";
import { PercentValue } from "../alpha/DatasetFigures";
import { useManagerDataset, type DatasetReadState } from "../manager/useManagerDataset";
import { PF_FE } from "../portfolios/fe";
import { Absent } from "../portfolios/format";
import { ScoreBandChip } from "../portfolios/ScoreCell";
import { bandOf, truncateDecimal } from "../portfolios/registerMetrics";
import { useRead } from "../portfolios/useRead";
import { COMPARE_MAX } from "../portfolios/selection";

const TONES = ["series", "series-2", "series-3", "series-4"] as const;
const GLYPHS = ["circle", "square", "diamond", "triangle"] as const;
const CHIP_CAP = 100;

const queryFor = (id: string | undefined, environment: ManagerEnvironment) => (id === undefined ? null : ({ surface: "ALPHA" as const, id, environment, limit: 50 }));

/** Four fixed slots (a compare holds at most four picks), as the portfolio side does: a slot with no id makes no request. */
function useAlphaDatasets(api: ExecutionApi, enabled: boolean, ids: readonly string[], environment: ManagerEnvironment): ReadonlyMap<string, DatasetReadState> {
  const a = useManagerDataset(api, enabled && ids[0] !== undefined, queryFor(ids[0], environment));
  const b = useManagerDataset(api, enabled && ids[1] !== undefined, queryFor(ids[1], environment));
  const c = useManagerDataset(api, enabled && ids[2] !== undefined, queryFor(ids[2], environment));
  const d = useManagerDataset(api, enabled && ids[3] !== undefined, queryFor(ids[3], environment));
  return useMemo(() => {
    const out = new Map<string, DatasetReadState>();
    [a, b, c, d].forEach((state, index) => { const id = ids[index]; if (id !== undefined) out.set(id, state); });
    return out;
  }, [a, b, c, d, ids]);
}

interface MetricRow { id: string; label: string; cell(id: string, read: DatasetReadState | undefined): ReactNode }

function rowsOf(read: DatasetReadState | undefined): { rows: readonly ManagerRow[]; keys: readonly string[] } | ReactNode {
  if (read === undefined || read.phase === "idle" || read.phase === "loading") return <span className="exec-pf-dim">Loading</span>;
  if (read.phase === "error") return <Absent reason={`The Manager dataset could not be read (${read.reason}).`} />;
  if (read.value.items.length === 0) return <Absent reason="The dataset has no row for this alpha in this book." />;
  return { rows: read.value.items, keys: read.value.queryOptions.metricKeys };
}
const isRows = (value: unknown): value is { rows: readonly ManagerRow[]; keys: readonly string[] } => typeof value === "object" && value !== null && "rows" in value && "keys" in value;

/** A partition-level key of every dataset row: one line per row, named by its portfolio, one cell per partition inside it. */
function perRow(read: DatasetReadState | undefined, metricKey: string, gap: { fe: string; what: string }, cell?: (metric: ManagerMetricRead | null) => ReactNode, signed = false): ReactNode {
  const got = rowsOf(read);
  if (!isRows(got)) return got;
  const having = got.rows.filter((row) => row.economicPartitions.some((entry) => entry.metrics.has(metricKey)));
  if (having.length === 0) return <Absent reason={`Not published (${gap.fe}): the dataset publishes no ${metricKey} for this alpha.`} />;
  return (
    <span className="exec-cmpr-lines">
      {having.map((row) => (
        <span key={row.rowKey} className="exec-cmpr-line">
          {got.rows.length > 1 ? <span className="exec-pf-dim">{row.portfolioId} </span> : null}
          <PartitionFigures partitions={row.economicPartitions} metricKey={metricKey} metricKeys={null} gap={gap} cell={cell} signed={signed} />
        </span>
      ))}
    </span>
  );
}

function ScoreOf({ read }: { read: DatasetReadState | undefined }): ReactNode {
  const got = rowsOf(read);
  if (!isRows(got)) return got;
  const scored = got.rows.filter((row) => row.metrics.score !== undefined);
  if (scored.length === 0) return <NaWhy reason={`Not published (${PF_FE.score.fe}): the dataset carries no score for this alpha.`} text="Not scored" className="exec-pf-dim" />;
  return (
    <span className="exec-cmpr-lines">
      {scored.map((row) => {
        const metric = row.metrics.score!;
        if (metric.kind === "absent") return <NaWhy key={row.rowKey} reason={`${metric.copy}`} text="Not scored" className="exec-pf-dim" />;
        return (
          <span key={row.rowKey} className="exec-cmpr-line" title={`${metric.exact} · ${metric.policyRevision}`}>
            <span className="exec-mgr-num">{truncateDecimal(metric.exact)}</span> <ScoreBandChip band={bandOf(metric.exact)} />
          </span>
        );
      })}
    </span>
  );
}

const METRICS: readonly MetricRow[] = [
  { id: "netpnl", label: "Net PnL", cell: (_id, read) => perRow(read, "net_pnl", PF_FE.netPnl, undefined, true) },
  { id: "return", label: "Return", cell: (_id, read) => perRow(read, "return_30d_pct", PF_FE.ret, (metric) => <PercentValue metric={metric} />) },
  { id: "drawdown", label: "Max drawdown", cell: (_id, read) => perRow(read, "max_drawdown_pct", PF_FE.drawdown, (metric) => <PercentValue metric={metric} signed={false} />) },
  { id: "score", label: "Score", cell: (_id, read) => <ScoreOf read={read} /> },
  { id: "allocation", label: "Allocation", cell: (_id, read) => perRow(read, "allocation", { fe: "BQ-FLEET-ALLOC", what: "Allocation" }) },
];

export interface AlphaCompareProps {
  api: ExecutionApi;
  enabled: boolean;
  env: ManagerEnvironment;
  picks: readonly string[];
  onPicks: (ids: readonly string[]) => void;
  windowLabel: string;
  /** The window the series is asked for (the address's window preset). Without it the overlay stays the typed absence. */
  window?: "7D" | "30D" | "90D" | "ALL";
}

/** The four measures the alpha overlay offers (WP-K: DRAWDOWN is a published series kind, never worked out from NAV here). */
const OVERLAY_MEASURES = ["NAV", "NET_PNL", "RETURN", "DRAWDOWN"] as const satisfies readonly ManagerSeriesMetric[];

export function AlphaCompare({ api, enabled, env, picks, onPicks, windowLabel, window }: AlphaCompareProps) {
  const [measure, setMeasure] = useState<ManagerSeriesMetric>("NAV");
  const seriesQuery = useMemo<ManagerSeriesQuery | null>(
    () => (window === undefined || picks.length < 2 ? null : { environment: env, metric: measure, window, subjects: picks.map((subjectId) => ({ subjectType: "ALPHA" as const, subjectId })) }),
    [picks, measure, env, window],
  );
  const seriesRead = useManagerSeries(api, enabled && seriesQuery !== null, seriesQuery);
  const fleet = useRead(api, enabled, `compare-alpha-fleet|${env}`, (scoped) => scoped.getAlphaFleet({ environment: env, limit: CHIP_CAP }));
  const items = fleet.phase === "ready" ? fleet.value.page.rows : fleet.phase === "loading" || fleet.phase === "error" ? fleet.last?.page.rows ?? null : null;
  const reads = useAlphaDatasets(api, enabled, picks, env);
  const [filter, setFilter] = useState("");
  if (items === null) return fleet.phase === "error" ? <PanelState status={fleet.status} reason={fleet.reason} /> : <PanelSkeleton label="Loading the alphas" />;

  const labelOf = (id: string): string => items.find((item) => item.alphaId === id)?.alphaLabel ?? id;
  const needle = filter.trim().toLowerCase();
  const shown = items.filter((item) => needle === "" || [item.alphaLabel, item.alphaId, item.owner ?? ""].some((part) => part.toLowerCase().includes(needle))).slice(0, CHIP_CAP);
  const toggle = (id: string) => onPicks(picks.includes(id) ? picks.filter((x) => x !== id) : [...picks, id].slice(0, COMPARE_MAX));
  const columns: CardsColumn<MetricRow>[] = [
    { key: "metric", label: "Metric", render: (m) => m.label },
    ...picks.map<CardsColumn<MetricRow>>((id, index) => ({
      key: id, label: labelOf(id), numeric: true,
      head: <i className="exec-cmpr-sw" data-tone={TONES[index]} data-glyph={GLYPHS[index]} />,
      render: (m) => m.cell(id, reads.get(id)),
    })),
  ];
  return (
    <>
      <section className="exec-pf-panel" aria-label="Choose alphas">
        <div className="exec-pf-tool">
          <label className="exec-pf-field">
            <span className="exec-pf-sr">Filter alphas</span>
            <input className="exec-pf-input" type="search" placeholder="Filter alphas" value={filter} onChange={(event) => setFilter(event.target.value)} />
          </label>
          <span className="exec-pf-dim">Window {windowLabel}</span>
        </div>
        <div className="exec-cmpr-pick" role="group" aria-label="Alphas to compare">
          {shown.map((item) => {
            const at = picks.indexOf(item.alphaId);
            const on = at >= 0;
            const full = !on && picks.length >= COMPARE_MAX;
            return (
              <button key={item.alphaId} type="button" className="exec-cmpr-chip" data-tone={on ? TONES[at] : undefined} aria-pressed={on} disabled={full} title={full ? `At most ${COMPARE_MAX}` : undefined} onClick={() => toggle(item.alphaId)}>
                <i className="exec-cmpr-sw" data-glyph={on ? GLYPHS[at] : undefined} aria-hidden="true" />
                {item.alphaLabel}
                <small>{item.version}</small>
              </button>
            );
          })}
        </div>
        <p className="exec-pf-note" role="status">{picks.length < 2 ? "Pick two to four alphas to put them side by side." : `${picks.length} alphas picked.`}</p>
      </section>

      <SectionPanel
        title="Series"
        aside={
          <span className="exec-pf-seg" role="group" aria-label="Series measure">
            {OVERLAY_MEASURES.map((metric) => (
              <button key={metric} type="button" className="exec-pf-segbtn" aria-pressed={measure === metric} onClick={() => setMeasure(metric)}>{METRIC_WORD[metric]}</button>
            ))}
          </span>
        }
      >
        {seriesQuery === null ? (
          <ChartUnavailable
            label="Alpha comparison"
            copy={window === undefined ? "Not published (FE-033)" : "Pick two alphas"}
            reason={window === undefined ? "The series window is not known here. Nothing is drawn from other data, and nothing is rebased or added here." : "An aligned series needs two to four alphas. Nothing is rebased or worked out here."}
            height={160}
          />
        ) : (
          <AlphaOverlay seriesRead={seriesRead} measure={measure} labelOf={labelOf} />
        )}
      </SectionPanel>

      <SectionPanel title="Metrics">
        {picks.length === 0 ? (
          <p className="exec-pf-note">Pick alphas above to see their figures side by side.</p>
        ) : (
          <CardsTable label="Alpha metrics" columns={columns} rows={METRICS} rowKey={(m) => m.id} />
        )}
      </SectionPanel>
    </>
  );
}

/** The overlay of one alpha series read, by what the server said (its comparison and each entry's typed state). */
function AlphaOverlay({ seriesRead, measure, labelOf }: { seriesRead: ReturnType<typeof useManagerSeries>; measure: ManagerSeriesMetric; labelOf: (id: string) => string }) {
  const series = seriesRead.phase === "ready" ? seriesRead.value : seriesRead.phase === "loading" || seriesRead.phase === "error" ? seriesRead.last : null;
  if (series === null) {
    if (seriesRead.phase === "loading") return <PanelSkeleton label="Loading the series" />;
    return <ChartUnavailable label="Alpha comparison" copy="Not available" reason={`The series could not be read${seriesRead.phase === "error" ? ` (${seriesRead.reason})` : ""}. Nothing is rebased or worked out here.`} height={160} />;
  }
  const comparison = series.comparison;
  const notes: NotComparable[] = series.series.map((entry) => ({
    id: entry.subject.subjectId,
    label: labelOf(entry.subject.subjectId),
    reason: entry.state === "UNAVAILABLE"
      ? `${UNAVAILABLE_SENTENCE[entry.reasonCode]} (${entry.reasonCode})`
      : `${entry.currency ?? `ratio, scale ${entry.ratioScale ?? "not stated"}`} · basis ${entry.basis} · methodology ${entry.methodologyRef} · ${entry.partition.economicDomain.toLowerCase()} book, ${entry.partition.nativeProfileRef}${entry.state === "EMPTY" ? " · no points in this window" : ""}`,
  }));
  if (comparison.state === "ALIGNED") {
    const drawn = series.series.flatMap((entry) => (entry.state === "AVAILABLE" ? [{ entry, id: entry.subject.subjectId }] : []));
    const worst = drawn.map(({ entry }) => chartStateOf(entry)).find((state) => state.kind !== "ready") ?? { kind: "ready" as const };
    const overlay: CompareSeries[] = drawn.map(({ entry, id }) => ({ id, label: labelOf(id), points: chartPointsOf(entry) }));
    const unit = chartUnit(drawn[0]!.entry);
    const currency = comparison.common.currency ?? undefined;
    const basis = commonCaption(series.metric, comparison);
    return (
      <>
        <ChartTools label="Alpha comparison" columns={overlay.slice(0, 4).map((s) => ({ key: s.id, label: s.label, points: s.points, unit, currency, signed: isSigned(measure) }))}>
          <CompareOverlay label="Alpha comparison" series={overlay} notComparable={[]} basis={basis} unit={unit} currency={currency} signed={isSigned(measure)} state={worst} />
        </ChartTools>
        <p className="exec-blk-sr" data-testid="basis-caption">Basis: {basis}</p>
      </>
    );
  }
  const none = (copy: string, reason: string) => (
    <CompareOverlay label="Alpha comparison" series={[]} notComparable={notes} basis="No aligned series" unit="pct" state={{ kind: "unavailable", copy, reason }} />
  );
  if (comparison.state === "INCOMPARABLE") return none("Not comparable", `${MISMATCH_SENTENCE[comparison.reasonCode]} (${comparison.reasonCode}). Each series is listed apart; none is converted, rebased or combined.`);
  const missing = series.series.find((entry) => entry.state === "UNAVAILABLE");
  return none(
    sourceNotPublished(series) || (missing !== undefined && missing.state === "UNAVAILABLE" && missing.reasonCode === "RATIO_SCALE_NOT_PUBLISHED") ? "Not published (FE-013/033)" : "Not available",
    missing !== undefined && missing.state === "UNAVAILABLE"
      ? `At least one pick has no series: ${UNAVAILABLE_SENTENCE[missing.reasonCode]} (${missing.reasonCode}). Nothing is drawn from the rest.`
      : "At least one pick has no points in this window, so the picks are not aligned. Nothing is drawn from the rest.",
  );
}
