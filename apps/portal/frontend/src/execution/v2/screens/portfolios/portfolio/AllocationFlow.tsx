/**
 * The capital flow of one environment on the Allocations tab (concept C2): the Sankey of funds in, NAV, the approved budget (a dashed
 * "Limit, not cash" link), alphas and deployments, then the table that carries what a band cannot (net external flows, recalling,
 * headroom, and per deployment its budget, exposure, margin and Net PnL). The diagram is a picture; `CapitalFlow` prints the same
 * facts as its own table, and this file adds the deployment table. Nothing is summed or derived: see `flowModel.ts`.
 */
import { useMemo } from "react";

import { PanelState } from "../../../../components/states";
import { CapitalFlow, type ChartState } from "../../../charts";
import { CardsTable, type CardsColumn } from "../../../cardsTable";
import type { CapitalLedger } from "../../../../analytics";
import type { ManagerDataset } from "../../../readers/managerDataset";
import { Money, envWord } from "../format";
import type { TabCtx } from "./ctx";
import type { FlowTime } from "../../../charts";
import { allocationTimesByAccount, deploymentsOf, flowBlocks, flowRows, type FlowRow } from "./flowModel";
import type { Environment } from "./model";

import "../../../css/portfolios.css";

const valueOf = (read: { phase: string } & Record<string, unknown>): ManagerDataset | null =>
  read.phase === "ready" ? (read.value as ManagerDataset) : read.phase === "loading" || read.phase === "error" ? ((read.last as ManagerDataset | null) ?? null) : null;

/** A flow's time in mono; an absence is the dim "Not published" / "No receipt" words, never a date. */
const TimeCell = ({ time }: { time: FlowTime }) => (time.short === null ? <span className="exec-pf-na">{time.text}</span> : <span className="exec-pf-flow-time">{time.text}</span>);

const COLUMNS: readonly CardsColumn<FlowRow>[] = [
  { key: "deployment", label: "Deployment", render: (r) => r.deploymentId },
  { key: "alpha", label: "Alpha", render: (r) => r.alpha },
  { key: "account", label: "Account", render: (r) => r.account ?? <span className="exec-pf-na">Not available</span> },
  { key: "time", label: "Allocated at", render: (r) => <TimeCell time={r.time} /> },
  { key: "budget", label: "Budget", numeric: true, render: (r) => <Money value={r.budget} currency={r.currency} absent={<span className="exec-pf-na">Not published</span>} /> },
  { key: "exposure", label: "Exposure", numeric: true, render: (r) => <Money value={r.exposure} currency={r.currency} absent={<span className="exec-pf-na">Not published</span>} /> },
  { key: "margin", label: "Margin", numeric: true, render: (r) => <Money value={r.margin} currency={r.currency} absent={<span className="exec-pf-na" title="No initial margin is published for this deployment's account">Not published</span>} /> },
  { key: "pnl", label: "Net PnL", numeric: true, render: (r) => <Money value={r.pnl} currency={r.currency} signed absent={<span className="exec-pf-na">Not available</span>} /> },
];

interface FactRow { label: string; value: string | null; currency: string; time: FlowTime }
const FACT_COLUMNS: readonly CardsColumn<FactRow>[] = [
  { key: "fact", label: "Fact", render: (r) => <span className="exec-pf-dim">{r.label} · {r.currency}</span> },
  { key: "amount", label: "Amount", numeric: true, render: (r) => <Money value={r.value} currency={r.currency} absent={<span className="exec-pf-na">Not published</span>} /> },
  { key: "time", label: "Time", render: (r) => <TimeCell time={r.time} /> },
];

/** What the diagram measures, and what a budget is: the one line under it. */
const BASIS = "Amounts in each block's own currency and never summed. An approved budget is a limit on what may be allocated, not cash: it is not added to funds, NAV or allocations. Times are UTC, the effective time each source publishes, none inferred.";

export function AllocationFlow({ ctx, environment }: { ctx: TabCtx; environment: Environment }) {
  const slot = ctx.reads.flows[environment];
  const statements = valueOf(slot.statements as never);
  const alphas = valueOf(slot.alphas as never);
  const ledgerRead = ctx.reads.ledgers[environment] as { phase: string; value?: { ledger: CapitalLedger }; last?: { ledger: CapitalLedger } | null };
  const ledger = ledgerRead.phase === "ready" ? ledgerRead.value?.ledger ?? null : ledgerRead.phase === "loading" || ledgerRead.phase === "error" ? ledgerRead.last?.ledger ?? null : null;
  const allocationAt = useMemo(() => allocationTimesByAccount(ledger, deploymentsOf(ctx.deployments, environment)), [ledger, ctx.deployments, environment]);
  const models = useMemo(() => flowBlocks(environment, statements, alphas, ctx.deployments, allocationAt), [environment, statements, alphas, ctx.deployments, allocationAt]);
  const rows = useMemo(() => flowRows(environment, ctx.deployments, ctx.accounts, allocationAt), [environment, ctx.deployments, ctx.accounts, allocationAt]);
  const label = `Capital flow · ${envWord(environment)}`;

  if (slot.statements.phase === "idle") return null;
  if (statements === null) {
    if (slot.statements.phase === "error") return <PanelState status={slot.statements.status} reason={slot.statements.reason} />;
    return <PanelState status="loading" />;
  }
  if (models.length === 0) return <p className="exec-pf-note">{label}: the dataset published no capital statement in {envWord(environment)}, so no flow is drawn.</p>;

  const incomplete = statements.quality.completeness !== "COMPLETE" || statements.quality.freshness !== "FRESH";
  const state: ChartState = incomplete
    ? { kind: statements.quality.freshness === "STALE" ? "stale" : "partial", reason: [`completeness ${statements.quality.completeness.toLowerCase()}`, `freshness ${statements.quality.freshness.toLowerCase()}`, ...statements.quality.reasons].join(", ") }
    : { kind: "ready" };
  return (
    <section className="exec-pf-flow" aria-label={label} data-environment={environment}>
      <CapitalFlow label={label} blocks={models.map((m) => m.block)} basis={BASIS} state={state} />
      <CardsTable
        label={`Facts without a band, ${envWord(environment)}`}
        columns={FACT_COLUMNS}
        rows={models.flatMap((m) => m.facts.map((fact): FactRow => ({ label: fact.label, value: fact.value, currency: m.partition.currency, time: fact.time })))}
        rowKey={(r) => `${r.label}:${r.currency}`}
      />
      {rows.length > 0 ? <CardsTable label={`Deployments in the ${envWord(environment)} flow`} columns={COLUMNS} rows={rows} rowKey={(r) => r.deploymentId} /> : null}
    </section>
  );
}
