/**
 * Performance: the actual equity path, the simulated paths apart from it, and
 * the research frame.
 *
 * Three facets, as in the hi-fi, and they never share an axis:
 *  - Actual: the book's own equity series, exact decimals, per currency
 *    partition. Paper and Sandbox books are drawn hatched and worded as
 *    simulated. Windowed return and drawdown are not published (FE-006,
 *    FE-025), so the panel prints the words, not a figure derived from the
 *    line.
 *  - Forward simulated: each stage's own daily closes (stage drift), one row
 *    each, "never stitched into actual". Returns per stage are FE-006.
 *  - Research OOS: the bound run is not published (FE-029).
 */
import type { ReactNode } from "react";

import { PanelState } from "../../../components/states";
import type { ObservedTimeline } from "../../../api/observedTimeline";
import type { EventKind } from "../../charts";
import type { ManagerMetricRead } from "../../readers/managerMetric";
import type { FinancialChartPayload } from "../../../api/financialChart";
import type { StageDrift } from "../../../hifiInsight";
import { CardsTable, type CardsColumn } from "../../cardsTable";
import { Flag } from "../../Flag";
import { NaWhy, NotAvailableLine, SectionPanel } from "../../blocks";
import { ChartTools, DivBars, EquityPanel, Spark, type DivBarRow } from "../../charts";
import { ENV_LABEL, type ExecEnv } from "../../urlState";
import { Na } from "./cells";
import { DaysValue, RowFigure, WindowedFigures, type DatasetReadState } from "./DatasetFigures";

const NO_NAMES: ReadonlyMap<string, string> = new Map();
import { ROW_CAP, stageWord, type DeploymentRow, type EquityPanelInput, type StagePath } from "./model";
import { Np } from "./np";
import type { PagedRead, Read } from "./useAlphaReads";
import { useRibbon, type RibbonData } from "./ribbonModel";
import type { LifeEvent } from "./lifecycleModel";

export type PerformanceView = "act" | "sim" | "oos";
export const PERFORMANCE_VIEWS: readonly { id: PerformanceView; label: string }[] = [
  { id: "act", label: "Actual" },
  { id: "sim", label: "Forward simulated" },
  { id: "oos", label: "Research OOS" },
];

export interface PerformanceTabProps {
  /** The deployment rows of the read, either variant. */
  rows: readonly DeploymentRow[];
  /** Set on a SCOPED_V2 read: the body's reason for stating no money total (then no bar is drawn from a row). */
  noTotals?: string | null;
  /** The Manager dataset read for this alpha and Book (windowed figures); absent when the caller does not read it. */
  dataset?: DatasetReadState;
  /** Portfolio display names by id (from the alpha body); an id with no stated name prints as the id. */
  names?: ReadonlyMap<string, string>;
  env: ExecEnv;
  equity: Read<FinancialChartPayload>;
  drift: Read<StageDrift>;
  inputs: readonly EquityPanelInput[];
  paths: readonly StagePath[];
  view: PerformanceView;
  onView: (view: PerformanceView) => void;
  /** The observed timeline (decisions) and the dataset's lifecycle events: the ribbon pinned on the chart is the same one the Activity tab draws. */
  timeline?: PagedRead<ObservedTimeline>;
  life?: { events: readonly LifeEvent[]; missing: readonly EventKind[] };
}

const NO_LIFE = { events: [] as readonly LifeEvent[], missing: ["stage", "decision", "incident", "recall", "flow"] as readonly EventKind[] };
const NO_TIMELINE: PagedRead<ObservedTimeline> = { read: { phase: "idle" }, loadingMore: false, moreError: null, hasMore: false, loadMore: () => undefined };

function ActualFacet({ env, equity, inputs, drift, rb }: Pick<PerformanceTabProps, "env" | "equity" | "inputs" | "drift"> & { rb: RibbonData }) {
  const loading = equity.phase === "loading" || equity.phase === "idle" || (inputs.length === 0 && drift.phase === "loading");
  if (loading) return <PanelState status="loading" />;
  if (inputs.length === 0) {
    const reason = equity.phase === "error" ? equity.reason : "No equity series is published for this book.";
    return (
      <EquityPanel
        label={`Equity, ${ENV_LABEL[env]}`}
        points={[]}
        state={{ kind: "unavailable", copy: "Not available", reason }}
      />
    );
  }
  return (
    <div className="exec-alp2-equity-stack">
      {inputs.map((input, index) => (
        <div key={input.key} className="exec-alp2-equity">
          {index === 0 ? rb.chips : null}
          <ChartTools
            label={`Equity, ${ENV_LABEL[env]}${input.currency ? `, ${input.currency}` : ""}`}
            columns={input.state.kind === "unavailable" ? [] : [{ key: input.key, label: input.label, points: input.points, currency: input.currency ?? undefined }]}
          >
            <EquityPanel
              label={`Equity, ${ENV_LABEL[env]}${input.currency ? `, ${input.currency}` : ""}`}
              seriesName={input.label}
              points={input.points}
              currency={input.currency ?? undefined}
              state={input.state}
              segments={input.segments}
              height={240}
              {...(index === 0 ? { ribbon: rb.ribbon, domain: rb.domain ?? undefined, drawdown: { kind: "absent" as const, copy: "Not published (FE-025)", reason: "The source publishes no drawdown series for this book; the windowed maximum is the tile above when it is published." } } : {})}
            />
          </ChartTools>
          {/* The book is the segmented control above, the sampling is the chart's own envelope line, and the windowed figures are the one "Not available" line of the screen. */}
          {index === 0 && rb.gaps !== null ? <p className="exec-alp2-cap">{rb.gaps}</p> : null}
          {input.gapCount > 0 ? <p className="exec-alp2-cap"><span>{input.gapCount} {input.gapCount === 1 ? "gap" : "gaps"} the source declared</span></p> : null}
        </div>
      ))}
    </div>
  );
}

function SimulatedFacet({ paths, drift }: Pick<PerformanceTabProps, "paths" | "drift">) {
  if (drift.phase === "loading" || drift.phase === "idle") return <PanelState status="loading" />;
  if (drift.phase === "error") return <PanelState status={drift.status} reason={drift.reason} />;
  const columns: CardsColumn<StagePath>[] = [
    { key: "stage", label: "Stage", render: (p) => stageWord(p.stage) },
    {
      key: "domain",
      label: "Domain",
      render: (p) => <Flag kind={p.stage === "live" ? "ok" : "na"} label={p.stage === "live" ? "Real-funded" : "Simulated"} size="sm" />,
    },
    { key: "closes", label: "Closes", numeric: true, render: (p) => (p.deployed ? String(p.closes) : <Na why={p.reason ?? undefined} />) },
    { key: "gaps", label: "Gap days", numeric: true, render: (p) => (p.deployed ? String(p.gapDays) : null) },
    {
      key: "path",
      label: "Path",
      render: (p) =>
        p.deployed && p.closes > 0 ? <Spark values={p.values} label={`${stageWord(p.stage)} daily closes`} tone={p.stage === "live" ? "series" : "sim"} width={96} height={20} /> : null,
    },
  ];
  return (
    <>
      <CardsTable columns={columns} rows={paths} rowKey={(p) => p.stage} label="Equity path per stage" />
      <p className="exec-alp2-cap">
        <span>Own path per stage</span>
        <span>Never stitched into actual</span>
        <span>Daily closes; a gap day is a close the source did not publish</span>
      </p>
    </>
  );
}

function OosFacet() {
  return <NotAvailableLine facts={[{ label: "Bound run", id: "FE-029" }, { label: "OOS return", id: "FE-029" }, { label: "Artifact available", id: "FE-029" }]} />;
}

/** Current net PnL by deployment, one chart per currency: partitions are never merged. */
function Contribution({ rows, noTotals }: { rows: readonly DeploymentRow[]; noTotals: string | null }) {
  if (rows.length === 0) return <Na why="No deployment is published." />;
  if (noTotals !== null) {
    // SCOPED_V2: the body states no per-deployment money and a total would be implied. Say so once; draw nothing.
    return (
      <p className="exec-alp2-line">
        <Np id="FE-005">Net PnL by deployment</Np>
        <span className="exec-alp2-why">{noTotals}</span>
      </p>
    );
  }
  const currencies = [...new Set(rows.map((r) => r.currency ?? ""))].sort();
  return (
    <div className="exec-alp2-contrib">
      {currencies.map((currency) => {
        const mine = rows.filter((r) => (r.currency ?? "") === currency);
        const bars: DivBarRow[] = mine.slice(0, ROW_CAP).map((r) => ({ id: r.id, label: `${r.stageLabel} · ${r.id}`, value: r.netPnl }));
        return <DivBars key={currency} label={`Current net PnL by deployment, ${currency}`} rows={bars} currency={currency} total={mine.length} />;
      })}
    </div>
  );
}

export function PerformanceTab(props: PerformanceTabProps) {
  const { rows, env, view, onView } = props;
  const rb = useRibbon(props.timeline ?? NO_TIMELINE, props.life ?? NO_LIFE, props.paths, props.inputs[0] ?? null);
  // Cost drag and forward days are keys the Manager dataset may carry per row; without them the cell keeps its Not published request id.
  const fig = (metricKey: string, fallback: ReactNode, cell?: (metric: ManagerMetricRead | null) => ReactNode): ReactNode =>
    props.dataset ? <RowFigure read={props.dataset} names={props.names ?? NO_NAMES} metricKey={metricKey} fallback={fallback} cell={cell} /> : fallback;
  return (
    <div className="exec-alp2-stack">
      <SectionPanel
        title="Equity"
        aside={
          <span className="exec-alp2-seg" role="group" aria-label="Series">
            {PERFORMANCE_VIEWS.map((v) => (
              <button key={v.id} type="button" className="exec-alp2-segbtn" aria-pressed={view === v.id} onClick={() => onView(v.id)}>
                {v.label}
              </button>
            ))}
          </span>
        }
      >
        {view === "act" ? <ActualFacet env={env} equity={props.equity} inputs={props.inputs} drift={props.drift} rb={rb} /> : null}
        {view === "sim" ? <SimulatedFacet paths={props.paths} drift={props.drift} /> : null}
        {view === "oos" ? <OosFacet /> : null}
      </SectionPanel>

      <SectionPanel title="Contribution" aside="Current">
        <Contribution rows={rows} noTotals={props.noTotals ?? null} />
      </SectionPanel>

      {props.dataset ? <WindowedFigures read={props.dataset} names={props.names ?? NO_NAMES} /> : null}

      {/* Hi-fi keeps Cost drag and Forward observation as panels; every row says Not published. The four charts with no source stay on one line. */}
      <div className="exec-alp2-pair">
        <SectionPanel title="Cost drag" aside="Window">
          <table className="exec-alp2-gaptable" aria-label="Cost drag">
            <tbody>
              <tr><th scope="row">Fees</th><td>{fig("cost_drag_fees", <Np id="FE-025" />)}</td></tr>
              <tr><th scope="row">Funding</th><td>{fig("cost_drag_funding", <Np id="FE-025" />)}</td></tr>
              <tr><th scope="row">Slippage</th><td>{fig("cost_drag_slippage", <NaWhy reason="Fill benchmark not published" />)}</td></tr>
            </tbody>
          </table>
        </SectionPanel>
        <SectionPanel title="Forward observation" aside="Not an actual track record">
          <table className="exec-alp2-gaptable" aria-label="Forward observation">
            <tbody>
              <tr><th scope="row">Forward days</th><td>{fig("forward_observation_days", <Np id="FE-029" />, (metric) => <DaysValue metric={metric} />)}</td></tr>
              <tr><th scope="row">Actual days</th><td><Np id="FE-029" /></td></tr>
              <tr><th scope="row">Mixed return</th><td><Np id="FE-029" /></td></tr>
              <tr><th scope="row">Mixed score</th><td><Np id="FE-011" /></td></tr>
            </tbody>
          </table>
          <details className="exec-alp2-more">
            <summary>Manifest conditions</summary>
            <p className="exec-alp2-line"><Np id="FE-029">Continuity manifest conditions</Np></p>
          </details>
        </SectionPanel>
      </div>
      <NotAvailableLine
        facts={[
          { label: "Rolling correlation", id: "FE-029" },
          { label: "Return histogram", id: "FE-029" },
          { label: "Risk utilization", id: "FE-029" },
          { label: "Paper versus live drift", id: "FE-029" },
        ]}
      />
    </div>
  );
}
