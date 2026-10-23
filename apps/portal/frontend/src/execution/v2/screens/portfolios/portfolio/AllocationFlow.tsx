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
import type { ManagerDataset } from "../../../readers/managerDataset";
import { Money, envWord } from "../format";
import type { TabCtx } from "./ctx";
import { flowBlocks, flowRows, type FlowRow } from "./flowModel";
import type { Environment } from "./model";

import "../../../css/portfolios.css";

const valueOf = (read: { phase: string } & Record<string, unknown>): ManagerDataset | null =>
  read.phase === "ready" ? (read.value as ManagerDataset) : read.phase === "loading" || read.phase === "error" ? ((read.last as ManagerDataset | null) ?? null) : null;

const COLUMNS: readonly CardsColumn<FlowRow>[] = [
  { key: "deployment", label: "Deployment", render: (r) => r.deploymentId },
  { key: "alpha", label: "Alpha", render: (r) => r.alpha },
  { key: "account", label: "Account", render: (r) => r.account ?? <span className="exec-pf-na">Not available</span> },
  { key: "budget", label: "Budget", numeric: true, render: (r) => <Money value={r.budget} currency={r.currency} absent={<span className="exec-pf-na">Not published</span>} /> },
  { key: "exposure", label: "Exposure", numeric: true, render: (r) => <Money value={r.exposure} currency={r.currency} absent={<span className="exec-pf-na">Not published</span>} /> },
  { key: "margin", label: "Margin", numeric: true, render: (r) => <Money value={r.margin} currency={r.currency} absent={<span className="exec-pf-na" title="No initial margin is published for this deployment's account">Not published</span>} /> },
  { key: "pnl", label: "Net PnL", numeric: true, render: (r) => <Money value={r.pnl} currency={r.currency} signed absent={<span className="exec-pf-na">Not available</span>} /> },
];

export function AllocationFlow({ ctx, environment }: { ctx: TabCtx; environment: Environment }) {
  const slot = ctx.reads.flows[environment];
  const statements = valueOf(slot.statements as never);
  const alphas = valueOf(slot.alphas as never);
  const models = useMemo(() => flowBlocks(environment, statements, alphas, ctx.deployments), [environment, statements, alphas, ctx.deployments]);
  const rows = useMemo(() => flowRows(environment, ctx.deployments, ctx.accounts), [environment, ctx.deployments, ctx.accounts]);
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
      <CapitalFlow label={label} blocks={models.map((m) => m.block)} basis="Amounts in each block's own currency. A budget is a limit, not cash. Blocks are never summed." state={state} />
      <ul className="exec-pf-flow-facts" aria-label={`Facts without a band, ${envWord(environment)}`}>
        {models.flatMap((m) => m.facts.map((fact) => (
          <li key={`${m.block.id}:${fact.label}`}>
            <span className="exec-pf-dim">{fact.label} · {m.partition.currency}</span>{" "}
            <Money value={fact.value} currency={m.partition.currency} absent={<span className="exec-pf-na">Not published</span>} />
          </li>
        )))}
      </ul>
      {rows.length > 0 ? <CardsTable label={`Deployments in the ${envWord(environment)} flow`} columns={COLUMNS} rows={rows} rowKey={(r) => r.deploymentId} /> : null}
    </section>
  );
}
