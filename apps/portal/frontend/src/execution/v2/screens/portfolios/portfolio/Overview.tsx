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
import { PF_FE, npText } from "../fe";
import { ManagerSeriesPanel } from "../../series/ManagerSeriesPanel";
import { isDescribed, latestPoint, seriesValueText, UNAVAILABLE_SENTENCE } from "../../series/seriesModel";
import { Absent, MoneyList, Np } from "../format";
import type { TabCtx } from "./ctx";
import { FlowRibbonChips, FlowRibbonLanes, FlowRibbonNotes, useRibbonLanes } from "./FlowRibbon";
import { chartState, equitySeries, serverEnvelope } from "./model";
import { InternalLink, PfKpi, PfKpiStrip, ReadGate } from "./parts";

import "../../../css/portfolios.css";

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
      {seriesValueText(entry, last.exact)}
      {withNote ? <small className="exec-pf-dim exec-pf-stamp">{formatInstant(last.tsMs)}</small> : null}
    </span>
  );
}

function NavCard({ ctx }: { ctx: TabCtx }) {
  return (
    <SectionPanel title="NAV" aside={ctx.window === "ALL" ? "All history" : `Last ${ctx.window}`}>
      <ManagerSeriesPanel label="Portfolio NAV" read={ctx.reads.nav} gapCopy={npText(PF_FE.nav)} height={220} tools />
    </SectionPanel>
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

/** What the Overview does not carry, said once (ids and reasons in the line's title). */
const UNPUBLISHED_OVERVIEW: readonly UnavailableFact[] = [
  { label: "Net PnL", id: "FE-005", why: "Windowed; needs FE-025" },
  { label: "Return", id: "FE-006", why: "Windowed; methodology per source" },
  { label: "Drawdown", id: "FE-013", why: "Needs the NAV series" },
  { label: "Concentration", id: "FE-005", why: "Shares need the Manager grouping, so none is drawn or worked out here" },
  { label: "Capital statements", id: "FE-017", why: "Initial, added and returned funds, net external flows, approved budget, recalling, headroom" },
  { label: "Funding source", id: "FE-032", why: "No per-source attribution" },
  { label: "Stage, decision, incident and recall lanes", id: "FE-031", why: "No source is published (FE-032 as well); the chart draws the Flow lane only" },
  { label: "Score", id: "FE-011" },
];

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
  return (
    <div className="exec-pf-stack">
      {simulated ? <p className="exec-pf-banner" data-tone="info">Simulated capital. It is never added to Real-funded figures.</p> : null}
      <PfKpiStrip label="Portfolio identity">
        <PfKpi label="Alphas">{alphaCount}</PfKpi>
        <PfKpi label="Deployments" note={identity.holdingsCount !== null ? `${identity.holdingsCount} holdings` : undefined}>{deployments.length}</PfKpi>
        <PfKpi label="Accounts">{accounts.length}</PfKpi>
        <PfKpi label="Allocated (current)">
          <MoneyList entries={identity.allocationByCurrency} empty={<Absent reason="no allocation published" />} />
        </PfKpi>
        <PfKpi label="NAV"><NavFigure ctx={ctx} /></PfKpi>
      </PfKpiStrip>
      <NotAvailableLine facts={UNPUBLISHED_OVERVIEW} className="exec-pf-na-line" />
      <NavCard ctx={ctx} />
      <EquityCard ctx={ctx} />
      <Attention ctx={ctx} />
    </div>
  );
}
