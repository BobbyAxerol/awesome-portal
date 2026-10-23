/**
 * Compare, Alphas tab (hi-fi "Portfolios / Alphas"). Same screen, another subject kind.
 *
 * Identity comes from the Alpha Fleet read (the alphas the Fleet publishes). The metric rows are the Manager dataset of each picked alpha
 * (`getManagerDataset({surface: "ALPHA", id})`): one line per dataset row (an alpha version in one portfolio) and per economic partition,
 * exactly as the dataset publishes them. Nothing is added across rows, partitions, currencies or the Real-funded and Simulated books,
 * and a currency is never converted; a Return or a score is the server's figure. The overlay chart is a typed absence: the manager series
 * port answers FUND and PORTFOLIO subjects only (`execution-manager-series.v1` subject_type), so an alpha series is a request (FE-033,
 * subject type ALPHA), never a line built from other data.
 */
import { useMemo, useState, type ReactNode } from "react";

import type { ExecutionApi } from "../../../api/ports";
import { PanelSkeleton, PanelState } from "../../../components/states";
import { NaWhy, SectionPanel } from "../../blocks";
import { CardsTable, type CardsColumn } from "../../cardsTable";
import { ChartUnavailable } from "../../charts/ChartStateView";
import type { ManagerRow } from "../../readers/managerDataset";
import type { ManagerEnvironment } from "../../readers/managerDataset";
import type { ManagerMetricRead } from "../../readers/managerMetric";
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
}

export function AlphaCompare({ api, enabled, env, picks, onPicks, windowLabel }: AlphaCompareProps) {
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

      <SectionPanel title="Series">
        <ChartUnavailable
          label="Alpha comparison"
          copy="Not published (FE-033)"
          reason="The series port answers fund and portfolio subjects only, so there is no aligned series for an alpha. Nothing is drawn from other data, and nothing is rebased or added here."
          height={160}
        />
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
