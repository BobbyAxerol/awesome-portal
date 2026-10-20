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
import { PanelState } from "../../../components/states";
import type { FinancialChartPayload } from "../../../api/financialChart";
import type { StageDrift } from "../../../hifiInsight";
import { CardsTable, type CardsColumn } from "../../cardsTable";
import { Flag } from "../../Flag";
import { SectionPanel } from "../../blocks";
import { ChartTools, DivBars, EquityPanel, Spark, type DivBarRow } from "../../charts";
import { ENV_LABEL, type ExecEnv } from "../../urlState";
import { Na } from "./cells";
import { ROW_CAP, stageWord, type DeploymentRow, type EquityPanelInput, type StagePath } from "./model";
import { Np } from "./np";
import type { Read } from "./useAlphaReads";

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
  env: ExecEnv;
  equity: Read<FinancialChartPayload>;
  drift: Read<StageDrift>;
  inputs: readonly EquityPanelInput[];
  paths: readonly StagePath[];
  view: PerformanceView;
  onView: (view: PerformanceView) => void;
}

function ActualFacet({ env, equity, inputs, drift }: Pick<PerformanceTabProps, "env" | "equity" | "inputs" | "drift">) {
  const loading = equity.phase === "loading" || equity.phase === "idle" || (inputs.length === 0 && drift.phase === "loading");
  if (loading) return <PanelState status="loading" />;
  if (inputs.length === 0) {
    const reason = equity.phase === "error" ? equity.reason : "No equity series is published for this book.";
    return (
      <EquityPanel
        label={`Equity, ${ENV_LABEL[env]}`}
        points={[]}
        state={{ kind: "unavailable", copy: "Not available", reason }}
        drawdown={{ kind: "absent", copy: "Not published (FE-025)" }}
      />
    );
  }
  return (
    <div className="exec-alp2-equity-stack">
      {inputs.map((input) => (
        <div key={input.key} className="exec-alp2-equity">
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
              drawdown={{ kind: "absent", copy: "Not published (FE-025)" }}
              height={240}
            />
          </ChartTools>
          <p className="exec-alp2-cap">
            <span>{ENV_LABEL[env]} book</span>
            <span>{input.basis}</span>
            {input.gapCount > 0 ? <span>{input.gapCount} {input.gapCount === 1 ? "gap" : "gaps"} the source declared</span> : null}
            <span>Windowed return: <Np id="FE-006" /></span>
            <span>Window: <Np id="FE-025" /></span>
          </p>
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
    { key: "return", label: "Return", numeric: true, render: () => <Np id="FE-006" /> },
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
  return (
    <table className="exec-alp2-kv">
      <tbody>
        <tr><th scope="row">Bound run</th><td><Np id="FE-029" /></td></tr>
        <tr><th scope="row">OOS return</th><td><Np id="FE-029" /></td></tr>
        <tr><th scope="row">Artifact available</th><td><Np id="FE-029" /></td></tr>
      </tbody>
    </table>
  );
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
        {view === "act" ? <ActualFacet env={env} equity={props.equity} inputs={props.inputs} drift={props.drift} /> : null}
        {view === "sim" ? <SimulatedFacet paths={props.paths} drift={props.drift} /> : null}
        {view === "oos" ? <OosFacet /> : null}
        {view === "act" && props.inputs.length > 0 ? null : (
          <p className="exec-alp2-cap">
            <span>Window: <Np id="FE-025" /></span>
          </p>
        )}
      </SectionPanel>

      <div className="exec-alp2-grid2">
        <SectionPanel title="Contribution" aside="Current">
          <Contribution rows={rows} noTotals={props.noTotals ?? null} />
        </SectionPanel>
        <SectionPanel title="Cost drag">
          <table className="exec-alp2-kv">
            <tbody>
              <tr><th scope="row">Fees and funding</th><td><Np id="FE-025">Per-alpha attribution</Np></td></tr>
              <tr><th scope="row">Slippage</th><td><Na why="Fill benchmark not published" /></td></tr>
            </tbody>
          </table>
        </SectionPanel>
      </div>

      <SectionPanel title="Forward observation" aside={<Flag kind="partial" label="Not an actual track record" size="sm" />}>
        <div className="exec-alp2-duo" role="group" aria-label="Forward and actual days">
          <span><span className="exec-alp2-duo-l">Forward</span><span className="exec-alp2-duo-v"><Np id="FE-029">Days observed forward</Np></span></span>
          <span><span className="exec-alp2-duo-l">Actual</span><span className="exec-alp2-duo-v"><Np id="FE-029">Days actually traded</Np></span></span>
        </div>
        <table className="exec-alp2-kv">
          <tbody>
            <tr><th scope="row">Mixed return</th><td><Np id="FE-029">Continuity manifest</Np></td></tr>
            <tr><th scope="row">Mixed score</th><td><Np id="FE-011" /></td></tr>
          </tbody>
        </table>
      </SectionPanel>

      <p className="exec-alp2-cap">
        <span>
          4 charts are not available yet: rolling correlation, return histogram, risk utilization, paper versus live drift (
          <Np id="FE-029" />)
        </span>
      </p>
    </div>
  );
}
