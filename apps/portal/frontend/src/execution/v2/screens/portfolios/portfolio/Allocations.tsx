/**
 * Allocations: two blocks, Real-funded and Simulated, never merged. Each holds
 * the capital by environment (current facts), the capital flow and the ledger.
 *
 * The flow draws STRUCTURE only: the nodes are the funding and budget steps of
 * the design plus the alphas and deployments the resource published, hatched,
 * with no amount and no band, under `Not published (FE-032)`. A node's name is
 * a name; no number is printed on or near it.
 *
 * The ledger is the append-only `getCapitalLedger` read: per entry the
 * movement, the server's direction word, the amount, and the allocation before
 * and after, each the published string. Receipts are FE-032.
 */
import { useMemo } from "react";

import type { CapitalLedger } from "../../../../analytics";
import { SectionPanel } from "../../../blocks";
import { CapitalFlow, type FlowBlock, type FlowNode } from "../../../charts";
import { CardsTable, type CardsColumn } from "../../../cardsTable";
import { utcStamp } from "../../../../time";
import { PF_FE, npText } from "../fe";
import { Money, Np, envWord } from "../format";
import type { TabCtx } from "./ctx";
import { ledgerIsEmpty, ledgerRows, unreadEntries, type DeploymentView, type Environment, type LedgerRowView } from "./model";
import { CapitalEnv } from "./CapitalEnv";
import { InternalLink, ReadGate } from "./parts";

import "../../../css/portfolios.css";

const FLOW_UNAVAILABLE = {
  kind: "unavailable" as const,
  copy: npText(PF_FE.flowEdges),
  reason: "Amounts and links are not published; the boxes are the published structure",
};

const LEDGER_ROW_CAP = 200;

/** Structure only. Names, never amounts: the chart's own rule is that no number leaks into this drawing. */
export function flowBlocks(domain: "real" | "simulated", deployments: readonly DeploymentView[]): readonly FlowBlock[] {
  const inDomain = deployments.filter((d) => d.domain === domain || d.domain === "mixed");
  const alphas = [...new Map(inDomain.map((d) => [d.strategyId ?? d.alphaLabel, d.alphaLabel])).entries()];
  const absent = npText(PF_FE.flowEdges);
  const funds: FlowNode[] = domain === "real"
    ? [
      { id: "initial", label: "Initial funds", column: 0, value: null, absent: npText(PF_FE.statements), hatched: true },
      { id: "added", label: "Added funds", column: 0, value: null, absent: npText(PF_FE.statements), hatched: true },
      { id: "pnl", label: "Net PnL since start", column: 0, value: null, absent: npText(PF_FE.netPnl), hatched: true },
      { id: "nav", label: "NAV", column: 1, value: null, absent: npText(PF_FE.nav), hatched: true },
      { id: "budget", label: "Approved budget", column: 2, value: null, absent: npText(PF_FE.statements), hatched: true },
    ]
    : [{ id: "virtual", label: "Virtual funds", column: 0, value: null, absent: npText(PF_FE.statements), hatched: true, tone: "sim" }];
  const alphaColumn = domain === "real" ? 3 : 1;
  const nodes: FlowNode[] = [
    ...funds,
    ...alphas.map<FlowNode>(([key, label]) => ({ id: `alpha:${key}`, label, column: alphaColumn, value: null, absent, hatched: true, ...(domain === "simulated" ? { tone: "sim" as const } : {}) })),
    ...inDomain.map<FlowNode>((d) => ({
      id: `dep:${d.deploymentId}`,
      label: `${d.deploymentId}${d.accountId ? ` · ${d.accountId}` : ""}`,
      column: alphaColumn + 1,
      value: null,
      absent,
      hatched: true,
      note: `Alpha: ${d.alphaLabel} · ${d.stageLabel}`,
      ...(domain === "simulated" ? { tone: "sim" as const } : {}),
    })),
  ];
  return [{ id: domain, label: domain === "real" ? "Real-funded" : "Simulated", basis: domain === "real" ? "real" : "simulated", nodes, edges: [] }];
}

function Flow({ domain, deployments, label }: { domain: "real" | "simulated"; deployments: readonly DeploymentView[]; label: string }) {
  const blocks = useMemo(() => flowBlocks(domain, deployments), [domain, deployments]);
  return (
    <CapitalFlow
      label={label}
      blocks={blocks}
      basis={domain === "real" ? "Amounts in each currency, Real-funded; not published" : "Amounts in each currency, Simulated; never added to Real-funded"}
      state={FLOW_UNAVAILABLE}
      structureWhenUnavailable
    />
  );
}

function ledgerColumns(ctx: TabCtx): readonly CardsColumn<LedgerRowView>[] {
  return [
    { key: "time", label: "Time · UTC", render: (row) => (row.entry.occurredAt === null ? <span className="exec-pf-na">Time not published</span> : utcStamp(row.entry.occurredAt)) },
    { key: "event", label: "Event", render: (row) => row.movement },
    { key: "direction", label: "Direction", render: (row) => row.direction },
    {
      key: "account",
      label: "Account",
      render: (row) => (ctx.mayOpenAccounts
        ? <InternalLink to={ctx.routes.account(row.entry.accountId)} search={ctx.search}>{row.entry.accountId}</InternalLink>
        : row.entry.accountId),
    },
    { key: "amount", label: "Amount", numeric: true, render: (row) => <Money value={row.entry.amount} currency={row.currency} /> },
    { key: "before", label: "Allocated before", numeric: true, render: (row) => <Money value={row.entry.beforeAllocated} currency={row.currency} /> },
    { key: "after", label: "Allocated after", numeric: true, render: (row) => <Money value={row.entry.afterAllocated} currency={row.currency} /> },
    { key: "receipt", label: "Receipt", render: () => <Np fact={PF_FE.flowEdges} /> },
  ];
}

function LedgerTable({ ledger, environment, ctx }: { ledger: CapitalLedger; environment: Environment; ctx: TabCtx }) {
  const all = ledgerRows(ledger);
  const shown = all.slice(0, LEDGER_ROW_CAP);
  const { bounded } = ledger;
  const unread = unreadEntries(ledger);
  return (
    <div className="exec-pf-ledger">
      {ledgerIsEmpty(ledger) ? (
        <p className="exec-pf-note">The ledger published no entry in {envWord(environment)}. An empty ledger is a fact, not a zero balance.</p>
      ) : (
        <CardsTable label={`Capital ledger in ${envWord(environment)}`} columns={ledgerColumns(ctx)} rows={shown} rowKey={(row) => row.key} />
      )}
      {unread !== null && unread > 0 ? (
        <p className="exec-pf-banner" role="status">
          {unread} returned {unread === 1 ? "entry" : "entries"} could not be read and {unread === 1 ? "is" : "are"} not shown. The ledger above is incomplete.
        </p>
      ) : null}
      <p className="exec-pf-note">
        Append-only, newest first.
        {bounded.total !== null && bounded.returned !== null ? ` Showing ${shown.length} of ${bounded.total}.` : ` Showing ${shown.length}.`}
        {bounded.hasMore ? " The read is bounded to the latest entries and publishes no older page." : ""}
        {all.length > shown.length ? ` The first ${LEDGER_ROW_CAP} rows are drawn.` : ""}
      </p>
      {ledger.buckets.length > 0 ? (
        <ul className="exec-pf-list" aria-label="Ledger totals by currency">
          {ledger.buckets.map((b) => (
            <li key={b.currency}>
              {b.currency}: gross increase <Money value={b.grossIncrease} currency={b.currency} /> · gross decrease <Money value={b.grossDecrease} currency={b.currency} />
              {b.entryCount !== null ? <span className="exec-pf-dim"> · {b.entryCount} entries</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Ledger({ environment, ctx, anchor }: { environment: Environment; ctx: TabCtx; anchor: boolean }) {
  const read = ctx.reads.ledgers[environment];
  return (
    // `#ledger` is where the V1 `Capital Ledger` tab opens: the first ledger on the page.
    <section aria-label={`Capital ledger in ${envWord(environment)}`} id={anchor ? "ledger" : undefined}>
      <h4 className="exec-pf-env-title">Capital ledger · {envWord(environment)}</h4>
      <ReadGate state={read} idle={<p className="exec-pf-note">The ledger is read when the Allocations tab opens.</p>}>
        {(value) => <LedgerTable ledger={value.ledger} environment={environment} ctx={ctx} />}
      </ReadGate>
    </section>
  );
}

function Block({ domain, ctx }: { domain: "real" | "simulated"; ctx: TabCtx }) {
  const envs = ctx.environments.filter((env) => (domain === "real" ? env === "live" : env !== "live"));
  const title = domain === "real" ? "Real-funded" : "Simulated";
  const aside = domain === "real" ? "Live and Canary" : "Paper and Sandbox · never added to Real-funded";
  return (
    <SectionPanel title={title} aside={aside}>
      {envs.length === 0 ? (
        <p className="exec-pf-note">This portfolio has no {domain === "real" ? "Real-funded" : "Simulated"} book in the projection.</p>
      ) : (
        <div className="exec-pf-stack">
          {envs.map((env) => <CapitalEnv key={env} environment={env} read={ctx.reads.capital[env]} />)}
          <Flow domain={domain} deployments={ctx.deployments} label={`Capital flow · ${title}`} />
          {envs.map((env) => <Ledger key={env} environment={env} ctx={ctx} anchor={env === ctx.environments[0]} />)}
        </div>
      )}
    </SectionPanel>
  );
}

export function Allocations({ ctx }: { ctx: TabCtx }) {
  const simulated = ctx.environments.some((env) => env !== "live");
  return (
    <div className="exec-pf-stack">
      {simulated ? <p className="exec-pf-banner" data-tone="info">Simulated capital. It is never added to Real-funded figures.</p> : null}
      <Block domain="real" ctx={ctx} />
      <Block domain="simulated" ctx={ctx} />
    </div>
  );
}
