/**
 * Overview: identity KPIs from published facts, the equity series, capital as
 * current facts, concentration and what needs attention.
 *
 * NAV (FE-013) is the portfolio's published NAV series (`getManagerSeries`, BE-P4): AVAILABLE draws the line and the NAV
 * cells are its latest point exactly as sent, with the methodology and window in the caption; EMPTY says "No points in this
 * window"; UNAVAILABLE prints the typed reason (a source that is not published keeps `Not published (FE-013)`).
 * Net PnL, Return and Drawdown are cells that name the request that will publish them. The equity series is the retained
 * snapshot series the EDS-07 chart route serves: it is account equity, not
 * NAV, and the caption says so; a drawdown pane is absent for the same reason
 * the KPI is.
 */
import { useState } from "react";

import { ChartTools, EquityPanel, domainOfSeries, type ChartDomain } from "../../../charts";
import { GapWhy, NotAvailableLine, SectionPanel, type UnavailableFact } from "../../../blocks";
import { Flag } from "../../../Flag";
import { formatAsOf, formatInstant } from "../../../boundary";
import { readUtcEpochMs } from "../../../../screenDataContract";
import { PF_FE } from "../fe";
import type { ManagerPartitionedMetrics } from "../../../readers/managerMetric";
import type { ManagerGroup } from "../../../readers/managerDataset";
import { PartitionFigures, figureSource, publishes } from "../PartitionFigures";
import { ScoreList } from "../ScoreCell";
import { SCORE_KEYS } from "../registerMetrics";
import { ContributorsBody } from "../../overview/Contributors";
import { contributorsView } from "../../overview/contributorsModel";
import { isDescribed, latestPoint, seriesValueText, UNAVAILABLE_SENTENCE } from "../../series/seriesModel";
import { Absent, MoneyList, Np } from "../format";
import { BudgetBar, ShareBar } from "../CapitalBlocks";
import { PerformanceCard } from "./Performance";
import type { TabCtx } from "./ctx";
import { FlowRibbonChips, FlowRibbonLanes, FlowRibbonNotes, useRibbonLanes } from "./FlowRibbon";
import { chartState, equitySeries, serverEnvelope } from "./model";
import { InternalLink, PfKpi, PfKpiStrip, ReadGate } from "./parts";

import "../../../css/portfolios.css";
import "../../../css/overview.css";

/**
 * The NAV figure: the latest point of the portfolio's published NAV series, exactly as sent, with its methodology. EMPTY is `No points
 * in this window`; a series whose source is not published (or a read that has not answered) keeps `Not published (FE-013)`; any other
 * typed reason is printed with its code. Never a derived or defaulted number, never added across Real-funded and Simulated.
 */
function NavFigure({ ctx, withNote = true }: { ctx: TabCtx; withNote?: boolean }) {
  const read = ctx.reads.nav;
  const series = read.phase === "ready" ? read.value : read.phase === "loading" || read.phase === "error" ? read.last : null;
  const entry = series?.series[0];
  if (series === null || entry === undefined || (entry.state === "UNAVAILABLE" && entry.reasonCode === "SERIES_SOURCE_NOT_PUBLISHED")) return <Np fact={PF_FE.nav} />;
  if (entry.state === "UNAVAILABLE") return <Absent reason={`${UNAVAILABLE_SENTENCE[entry.reasonCode]} (${entry.reasonCode})`} />;
  if (!isDescribed(entry)) return null;
  const last = latestPoint(entry);
  if (last === null) return <span className="exec-pf-dim">No points in this window</span>;
  return (
    <span title={last.exact}>
      {seriesValueText({ ...entry, currency: null }, last.exact)}
      {entry.currency ? <small className="exec-pf-unit">{entry.currency}</small> : null}
      {withNote ? <small className="exec-pf-dim exec-pf-stamp">{formatInstant(last.tsMs)}</small> : null}
    </span>
  );
}

function EquityCard({ ctx }: { ctx: TabCtx }) {
  const [picked, setPicked] = useState<string | null>(null);
  const [lanes, toggleLane] = useRibbonLanes();
  return (
    <SectionPanel title="Equity" aside={ctx.window === "ALL" ? "All history" : `Last ${ctx.window}`}>
      <ReadGate state={ctx.reads.chart} idle={<p className="exec-pf-note">The equity series is read once the portfolio resolves.</p>}>
        {(payload, stale) => {
          const series = equitySeries(payload);
          const shown = series.find((s) => s.id === picked) ?? series[0];
          const envelope = serverEnvelope(payload);
          const from = readUtcEpochMs(payload.coverage.fromMs);
          const to = readUtcEpochMs(payload.coverage.toMs);
          const state = chartState(payload);
          const label = shown ? `${shown.label}${shown.currency ? ` · ${shown.currency}` : ""}` : "Portfolio equity";
          // One window for the equity and the ribbon: the chart's own coverage, else the drawn series' extent.
          const axis: ChartDomain | null = from !== null && to !== null ? { from, to } : shown ? domainOfSeries(shown.points) : null;
          const ribbon = <FlowRibbonLanes ctx={ctx} domain={axis} lanes={lanes} />;
          return (
            <div className="exec-pf-chart" data-stale={stale ? "true" : undefined}>
              {series.length > 1 ? (
                <label className="exec-pf-field">
                  <span className="exec-pf-sr">Equity series</span>
                  <select className="exec-pf-select" value={shown?.id ?? ""} onChange={(event) => setPicked(event.target.value)}>
                    {series.map((s) => <option key={s.id} value={s.id}>{s.label}{s.currency ? ` · ${s.currency}` : ""}</option>)}
                  </select>
                </label>
              ) : null}
              {series.length > 1 ? (
                <p className="exec-pf-note">
                  {series.length} series are published, in {[...new Set(series.map((s) => s.currency ?? "no currency"))].join(", ")}. Each is drawn on its own and none is combined with another.
                </p>
              ) : null}
              <FlowRibbonChips ctx={ctx} domain={axis} lanes={lanes} onToggle={toggleLane} />
              {shown === undefined ? (
                <EquityPanel
                  label="Portfolio equity"
                  points={[]}
                  state={state.kind === "unavailable" ? state : { kind: "unavailable", copy: "Not available", reason: "The chart read published no series." }}
                  ribbon={ribbon}
                />
              ) : (
                <ChartTools label={label} columns={state.kind === "unavailable" ? [] : [{ key: shown.id, label: shown.label, points: shown.points, currency: shown.currency ?? undefined }]}>
                  <EquityPanel
                    label={label}
                    seriesName={shown.label}
                    points={shown.points}
                    currency={shown.currency ?? undefined}
                    state={state}
                    domain={axis ?? undefined}
                    ribbon={ribbon}
                    serverEnvelope={envelope ?? undefined}
                  />
                </ChartTools>
              )}
              {shown && shown.unreadable > 0 ? <p className="exec-pf-note">{shown.unreadable} points could not be read and were not drawn.</p> : null}
              <FlowRibbonNotes ctx={ctx} />
              <div className="exec-pf-caption">
                <Flag kind="neutral" label="Retained snapshots" size="sm" />
                <span>Account equity, not NAV</span><GapWhy name="Why there is no benchmark" rows={["Benchmark: not available"]} next={null} />
                {payload.clocks.asOfMs !== null && readUtcEpochMs(payload.clocks.asOfMs) !== null ? <span>As of {formatAsOf(readUtcEpochMs(payload.clocks.asOfMs)!)}</span> : null}
              </div>
            </div>
          );
        }}
      </ReadGate>
    </SectionPanel>
  );
}

/** What the Overview does not carry and has no tile or panel for, said once (ids and reasons in the line's title). */
const UNPUBLISHED_OVERVIEW: readonly UnavailableFact[] = [
  { label: "Funding source", id: "FE-032", why: "No per-source attribution" },
  { label: "Stage, decision, incident and recall lanes", id: "FE-031", why: "No source is published (FE-032 as well); the chart draws the Flow lane only" },
  { label: "Score", id: "FE-011", why: "Policy not set" },
];
const OTHER_GAPS: readonly UnavailableFact[] = UNPUBLISHED_OVERVIEW.filter((fact) => fact.label !== "Score");

/**
 * Capital statements (hi-fi right column): "Cash flows" (initial, added, returned, net external flows, Net PnL, NAV) and "Budget, not cash"
 * (approved, allocated, recalling, headroom), one line per economic partition and never totalled; then the allocation bar. A row no
 * partition publishes says so with its id (FE-017); nothing is summed or derived from another figure here.
 */
const CASH_ROWS: readonly { label: string; key?: string; nav?: true; total?: true; signed?: true }[] = [
  { label: "Initial funds", key: "initial_funds" },
  { label: "Added funds", key: "added_funds" },
  { label: "Returned", key: "returned_capital" },
  { label: "Net external flows", key: "net_external_flows", total: true },
  { label: "Net PnL", key: "net_pnl", signed: true },
  { label: "NAV", nav: true, total: true },
];
const BUDGET_ROWS: readonly { label: string; key: string }[] = [
  { label: "Approved", key: "current_budget" },
  { label: "Allocated", key: "allocation" },
  { label: "Recalling", key: "recalling" },
  { label: "Headroom", key: "headroom" },
];
/** Statement keys the dataset publishes beyond the hi-fi rows, each with a row of its own (one line per economic partition, never totalled). */
const STATEMENT_ROWS: readonly { key: string; label: string }[] = [
  { key: "balance_total", label: "Balance total" },
];

/** The portfolio's dataset: the last good read while a refresh runs; `null` until one answered (or when the surface is not served). */
const datasetOf = (ctx: TabCtx) => {
  const read = ctx.reads.dataset;
  return read.phase === "ready" ? read.value : read.phase === "loading" || read.phase === "error" ? read.last : null;
};

function CapitalCard({ ctx }: { ctx: TabCtx }) {
  const statements = datasetOf(ctx)?.capitalStatements ?? [];
  const row = (label: string, key: string | undefined, nav: boolean, total: boolean, signed: boolean) => (
    <tr key={label} data-total={total ? "true" : undefined}>
      <th scope="row">{label}</th>
      <td>{nav ? <NavFigure ctx={ctx} withNote={false} /> : key !== undefined && publishes(statements, key) ? <PartitionFigures list={statements} metricKey={key} signed={signed} labels="several" /> : <Np fact={PF_FE.statements} />}</td>
    </tr>
  );
  return (
    <SectionPanel title="Capital" aside="Statements">
      <table className="exec-pf-captable exec-pf-statements" aria-label="Capital statements">
        <tbody>
          <tr className="exec-pf-grp"><th scope="colgroup" colSpan={2}>Cash flows</th></tr>
          {CASH_ROWS.map((r) => row(r.label, r.key, r.nav === true, r.total === true, r.signed === true))}
          {STATEMENT_ROWS.filter((r) => publishes(statements, r.key)).map((r) => row(r.label, r.key, false, false, false))}
          <tr className="exec-pf-grp"><th scope="colgroup" colSpan={2}>Budget, not cash</th></tr>
          {BUDGET_ROWS.map((r) => row(r.label, r.key, false, false, false))}
        </tbody>
      </table>
      <BudgetBar list={statements} title="Allocated of approved budget" />
      <p className="exec-pf-note exec-pf-source">
        By funding source: <GapWhy className="exec-blk-np-word" gap="FE-032" text="Not published" name="Not published, reason (funding source)" rows={["No per-source attribution is published for the portfolio's capital (FE-032)."]} />
      </p>
    </SectionPanel>
  );
}

/**
 * Concentration: the HHI the dataset publishes, and the stacked bar of the alpha shares the server publishes
 * (`allocation_share_pct` of the groups by `alpha_id`; a width is that published number, never a share worked out here).
 */
function ConcentrationCard({ list, groups }: { list: readonly ManagerPartitionedMetrics[] | null; groups: readonly ManagerGroup[] }) {
  return (
    <SectionPanel title="Concentration" aside="HHI">
      {list !== null ? <PartitionFigures list={list} metricKey="concentration_hhi" /> : <p className="exec-pf-note"><Np fact={PF_FE.concentration} /></p>}
      {groups.length > 0 ? <ShareBar groups={groups} /> : <p className="exec-pf-note">Alpha shares are not published for this portfolio, so no bar is drawn.</p>}
    </SectionPanel>
  );
}

function Attention({ ctx }: { ctx: TabCtx }) {
  const deployments = ctx.deployments.filter((d) => d.healthKind !== "ok");
  const accounts = ctx.accounts.filter((a) => a.syncKind !== "ok" || (a.openFindings !== null && a.openFindings > 0));
  return (
    <SectionPanel title="Needs attention" aside={<InternalLink to={ctx.routes.operations} search={ctx.search}>Operations</InternalLink>}>
      {deployments.length === 0 && accounts.length === 0 ? (
        <p className="exec-pf-note" title="Every deployment reports Ready and every account Synced in the projection. This is the published state, not a guarantee.">Nothing needs attention</p>
      ) : (
        <ul className="exec-pf-attn">
          {deployments.map((d) => (
            <li key={d.deploymentId}>
              <span className="exec-pf-attn-head">
                <Flag kind={d.healthKind} label={d.healthLabel} size="sm" />
                <InternalLink to={ctx.routes.deployment(d.deploymentId, d.stage)} search={ctx.search}>{d.deploymentId}</InternalLink>
              </span>
              <span className="exec-pf-dim">{d.alphaLabel} · {d.stageLabel}</span>
            </li>
          ))}
          {accounts.map((a) => (
            <li key={a.accountId}>
              <span className="exec-pf-attn-head">
                <Flag kind={a.syncKind === "ok" ? "attention" : a.syncKind} label={a.syncKind === "ok" ? "Open findings" : a.syncLabel} size="sm" />
                {ctx.mayOpenAccounts ? <InternalLink to={ctx.routes.account(a.accountId)} search={ctx.search}>{a.accountId}</InternalLink> : a.accountId}
              </span>
              {a.openFindings !== null && a.openFindings > 0 ? <span className="exec-pf-dim">{a.openFindings} open {a.openFindings === 1 ? "finding" : "findings"}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </SectionPanel>
  );
}

export function Overview({ ctx }: { ctx: TabCtx }) {
  const { identity, deployments, accounts, environments } = ctx;
  const alphaCount = new Set(deployments.map((d) => d.strategyId ?? d.alphaLabel)).size;
  const simulated = environments.some((env) => env !== "live");
  const netPnlList = figureSource(datasetOf(ctx), "net_pnl", identity.portfolioId);
  const returnList = figureSource(datasetOf(ctx), "return_30d_pct", identity.portfolioId);
  const drawdownList = figureSource(datasetOf(ctx), "max_drawdown_pct", identity.portfolioId);
  const hhiList = figureSource(datasetOf(ctx), "concentration_hhi", identity.portfolioId);
  const scoreList = figureSource(datasetOf(ctx), SCORE_KEYS.score, identity.portfolioId);
  const contributorsRead = ctx.reads.contributors;
  const contributorGroups = (contributorsRead.phase === "ready" ? contributorsRead.value : contributorsRead.phase === "loading" || contributorsRead.phase === "error" ? contributorsRead.last : null)?.groups ?? [];
  const contributors = contributorsView({
    served: ctx.reads.dataset.phase !== "idle",
    fundRead: ctx.reads.dataset,
    fund: datasetOf(ctx),
    grouped: contributorsRead,
  });
  return (
    <div className="exec-pf-stack">
      {simulated ? <p className="exec-pf-banner" data-tone="info">Simulated capital. It is never added to Real-funded figures.</p> : null}
      <PfKpiStrip label="Portfolio identity">
        <PfKpi label="NAV"><NavFigure ctx={ctx} /></PfKpi>
        <PfKpi label="Net PnL" note={netPnlList !== null ? `Window ${ctx.window}` : "Windowed; needs the window"}>
          {netPnlList !== null ? <PartitionFigures list={netPnlList} metricKey="net_pnl" signed /> : <Np fact={PF_FE.netPnl} />}
        </PfKpi>
        <PfKpi label="Return" note={returnList !== null ? `Window ${ctx.window}` : "Windowed; methodology per source"}>
          {returnList !== null ? <PartitionFigures list={returnList} metricKey="return_30d_pct" signed /> : <Np fact={PF_FE.ret} />}
        </PfKpi>
        <PfKpi label="Drawdown" note={drawdownList !== null ? `Max, window ${ctx.window}` : "Needs the NAV series"}>
          {drawdownList !== null ? <PartitionFigures list={drawdownList} metricKey="max_drawdown_pct" signed /> : <Np fact={PF_FE.drawdown} />}
        </PfKpi>
        <PfKpi label="Portfolio score" note={scoreList !== null ? `Direct from NAV, window ${ctx.window}` : "Direct from the portfolio NAV"}>
          {scoreList !== null ? <span className="exec-pf-kpi-score"><ScoreList list={scoreList} full /></span> : <Np fact={PF_FE.score} />}
        </PfKpi>
        <PfKpi label="Allocated (current)">
          <MoneyList entries={identity.allocationByCurrency} empty={<Absent reason="no allocation published" />} />
        </PfKpi>
        <PfKpi label="Deployments" note={`${alphaCount} ${alphaCount === 1 ? "alpha" : "alphas"} · ${accounts.length} ${accounts.length === 1 ? "account" : "accounts"}${identity.holdingsCount !== null ? ` · ${identity.holdingsCount} holdings` : ""}`}>{deployments.length}</PfKpi>
      </PfKpiStrip>
      <NotAvailableLine facts={scoreList !== null ? OTHER_GAPS : UNPUBLISHED_OVERVIEW} className="exec-pf-na-line" />
      <div className="exec-pf-grid2">
        <PerformanceCard ctx={ctx} />
        <CapitalCard ctx={ctx} />
      </div>
      <EquityCard ctx={ctx} />
      <SectionPanel title="Contributors" aside={contributors.kind === "ready" ? `By alpha \u00b7 window ${ctx.window}` : "Amount \u00b7 Return \u00b7 Score"}>
        <ContributorsBody view={contributors} />
      </SectionPanel>
      <div className="exec-pf-grid2">
        <Attention ctx={ctx} />
        <ConcentrationCard list={hhiList} groups={contributorGroups} />
      </div>
    </div>
  );
}
