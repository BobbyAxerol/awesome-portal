/**
 * Overview: identity KPIs from published facts, the equity series, capital as
 * current facts, concentration and what needs attention.
 *
 * The money KPIs of the hi-fi (NAV, Net PnL, Return, Drawdown) are cells that
 * name the request that will publish them. The equity series is the retained
 * snapshot series the EDS-07 chart route serves: it is account equity, not
 * NAV, and the caption says so; a drawdown pane is absent for the same reason
 * the KPI is.
 */
import { useState } from "react";

import { EquityPanel } from "../../../charts";
import { SectionPanel } from "../../../blocks";
import { Flag } from "../../../Flag";
import { formatAsOf } from "../../../boundary";
import { readUtcEpochMs } from "../../../../screenDataContract";
import { PF_FE, npReason, npText, type Unpublished } from "../fe";
import { Absent, MoneyList, Np, envWord } from "../format";
import type { TabCtx } from "./ctx";
import { chartState, equitySeries, serverEnvelope } from "./model";
import { InternalLink, PfKpi, PfKpiStrip, ReadGate } from "./parts";

import "../../../css/portfolios.css";

const SEGMENTS = [
  { id: "equity", label: "Equity", fact: null },
  { id: "pnl", label: "Net PnL", fact: PF_FE.netPnl },
  { id: "ret", label: "Return", fact: PF_FE.ret },
] as const;

function EquityCard({ ctx }: { ctx: TabCtx }) {
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <SectionPanel
      title="Equity"
      aside={
        <span className="exec-pf-seg" role="group" aria-label="Series">
          {SEGMENTS.map((seg) => (
            <button
              key={seg.id}
              type="button"
              className="exec-pf-segbtn"
              aria-pressed={seg.fact === null}
              disabled={seg.fact !== null}
              title={seg.fact ? npReason(seg.fact, "Only the retained equity snapshots are published.") : undefined}
              aria-describedby={seg.fact ? "exec-pf-seg-reason" : undefined}
            >
              {seg.label}
            </button>
          ))}
        </span>
      }
    >
      <p id="exec-pf-seg-reason" className="exec-pf-sr">Net PnL: {npText(PF_FE.netPnl)}. Return: {npText(PF_FE.ret)}.</p>
      <ReadGate state={ctx.reads.chart} idle={<p className="exec-pf-note">The equity series is read once the portfolio resolves.</p>}>
        {(payload, stale) => {
          const series = equitySeries(payload);
          const shown = series.find((s) => s.id === picked) ?? series[0];
          const envelope = serverEnvelope(payload);
          const from = readUtcEpochMs(payload.coverage.fromMs);
          const to = readUtcEpochMs(payload.coverage.toMs);
          const state = chartState(payload);
          const label = shown ? `${shown.label}${shown.currency ? ` · ${shown.currency}` : ""}` : "Portfolio equity";
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
              {shown === undefined ? (
                <EquityPanel
                  label="Portfolio equity"
                  points={[]}
                  state={state.kind === "unavailable" ? state : { kind: "unavailable", copy: "Not available", reason: "The chart read published no series." }}
                />
              ) : (
                <EquityPanel
                  label={label}
                  seriesName={shown.label}
                  points={shown.points}
                  currency={shown.currency ?? undefined}
                  state={state}
                  domain={from !== null && to !== null ? { from, to } : undefined}
                  serverEnvelope={envelope ?? undefined}
                  drawdown={{ kind: "absent", copy: npText(PF_FE.drawdown), reason: "Drawdown needs the NAV series" }}
                />
              )}
              {shown && shown.unreadable > 0 ? <p className="exec-pf-note">{shown.unreadable} points could not be read and were not drawn.</p> : null}
              <div className="exec-pf-caption">
                <Flag kind="neutral" label="Retained snapshots" size="sm" />
                <span>{ctx.window === "ALL" ? "Whole retained range" : `Last ${ctx.window}`}</span>
                <span>Account equity, not NAV</span>
                <span>Benchmark: Not available</span>
                {payload.clocks.asOfMs !== null && readUtcEpochMs(payload.clocks.asOfMs) !== null ? <span>As of {formatAsOf(readUtcEpochMs(payload.clocks.asOfMs)!)}</span> : null}
              </div>
            </div>
          );
        }}
      </ReadGate>
    </SectionPanel>
  );
}

/** The statements the hi-fi lists, in its two groups. Every figure is `Not published` with the request that will publish it. */
const CASH_ROWS: readonly { label: string; fact: Unpublished; total?: boolean }[] = [
  { label: "Initial funds", fact: PF_FE.statements },
  { label: "Added funds", fact: PF_FE.statements },
  { label: "Returned", fact: PF_FE.statements },
  { label: "Net external flows", fact: PF_FE.statements, total: true },
  { label: "Net PnL, since start", fact: PF_FE.netPnl },
  { label: "NAV", fact: PF_FE.nav, total: true },
];
const BUDGET_ROWS: readonly { label: string; fact: Unpublished }[] = [
  { label: "Approved budget", fact: PF_FE.statements },
  { label: "Recalling", fact: PF_FE.statements },
  { label: "Headroom", fact: PF_FE.statements },
];

/**
 * Statements only. The per-currency capital table (allocation and balances) is
 * the Allocations tab's, once: it does not fit a 360px panel and printing it
 * twice made the Overview and Allocations disagree about which one was whole.
 */
function CapitalCard() {
  return (
    <SectionPanel title="Capital">
      <div className="exec-pf-stack">
        <table className="exec-pf-statements" aria-label="Capital statements">
          <caption className="exec-pf-cap">Statements</caption>
          <tbody>
            <tr className="exec-pf-grp"><th colSpan={2} scope="colgroup">Cash flows</th></tr>
            {CASH_ROWS.map((row) => (
              <tr key={row.label} data-total={row.total ? "true" : undefined}><th scope="row">{row.label}</th><td><Np fact={row.fact} /></td></tr>
            ))}
            <tr className="exec-pf-grp"><th colSpan={2} scope="colgroup">Budget · not cash</th></tr>
            {BUDGET_ROWS.map((row) => (
              <tr key={row.label}><th scope="row">{row.label}</th><td><Np fact={row.fact} /></td></tr>
            ))}
          </tbody>
        </table>
        <details>
          <summary>By funding source</summary>
          <p className="exec-pf-note"><Np fact={PF_FE.flowEdges}>No per-source attribution</Np></p>
        </details>
      </div>
    </SectionPanel>
  );
}

function Attention({ ctx }: { ctx: TabCtx }) {
  const deployments = ctx.deployments.filter((d) => d.healthKind !== "ok");
  const accounts = ctx.accounts.filter((a) => a.syncKind !== "ok" || (a.openFindings !== null && a.openFindings > 0));
  return (
    <SectionPanel title="Needs attention" aside={<InternalLink to={ctx.routes.operations} search={ctx.search}>Operations</InternalLink>}>
      {deployments.length === 0 && accounts.length === 0 ? (
        <p className="exec-pf-note">Every deployment reports Ready and every account Synced in the projection. This is the published state, not a guarantee.</p>
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
        <PfKpi label="Alphas" note="From the deployments in this portfolio">{alphaCount}</PfKpi>
        <PfKpi label="Deployments" note={identity.holdingsCount !== null ? `${identity.holdingsCount} holdings counted by the server` : undefined}>{deployments.length}</PfKpi>
        <PfKpi label="Accounts" note="Account balances are never this portfolio's capital">{accounts.length}</PfKpi>
        <PfKpi label="Allocated (current)" note="Per currency, as published; not a window">
          <MoneyList entries={identity.allocationByCurrency} empty={<Absent reason="no allocation published" />} />
        </PfKpi>
      </PfKpiStrip>
      <PfKpiStrip label="Performance, not yet published">
        <PfKpi label="NAV" note="Real-funded and Simulated are never added"><Np fact={PF_FE.nav} /></PfKpi>
        <PfKpi label={`Net PnL · ${ctx.window}`} note="After fees and funding"><Np fact={PF_FE.netPnl} /></PfKpi>
        <PfKpi label={`Return · ${ctx.window}`} note="Methodology as published per source"><Np fact={PF_FE.ret} /></PfKpi>
        <PfKpi label="Drawdown" note="Needs a NAV series"><Np fact={PF_FE.drawdown} /></PfKpi>
      </PfKpiStrip>
      <div className="exec-pf-grid2">
        <EquityCard ctx={ctx} />
        <CapitalCard />
      </div>
      <div className="exec-pf-grid2">
        <SectionPanel title="Concentration" aside={<Np fact={PF_FE.concentration} />}>
          <p className="exec-pf-note">
            Shares of {alphaCount} {alphaCount === 1 ? "alpha" : "alphas"} across {environments.length === 0 ? "no environment" : environments.map(envWord).join(" and ")} need the Manager grouping, so none is drawn and none is worked out here.
          </p>
        </SectionPanel>
        <Attention ctx={ctx} />
      </div>
    </div>
  );
}
