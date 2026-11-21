/**
 * Allocations: two blocks, Real-funded and Simulated, never merged. Each holds
 * the capital by environment (current facts), the capital flow and the ledger.
 *
 * The capital flow (WP-F1, concept C2) is the Sankey of `AllocationFlow` per environment, from the published statements and alpha groups;
 * the ledger receipts are not published (FE-032): one `Not available` line says so.
 *
 * The ledger is the append-only `getCapitalLedger` read: per entry the
 * movement, the server's direction word, the amount, and the allocation before
 * and after, each the published string. Receipts are FE-032.
 */
import type { CapitalLedger } from "../../../../analytics";
import { SectionPanel } from "../../../blocks";
import { PfNotAvailableLine } from "../PfNotAvailableLine";
import { CardsTable, type CardsColumn } from "../../../cardsTable";
import { PF_FE } from "../fe";
import { Money, envWord } from "../format";
import type { TabCtx } from "./ctx";
import { ledgerIsEmpty, ledgerRows, unreadEntries, type Environment, type LedgerRowView } from "./model";
import { CapitalEnv } from "./CapitalEnv";
import { AllocationFlow } from "./AllocationFlow";
import { InternalLink, ReadGate } from "./parts";

import "../../../css/portfolios.css";
import { formatInstant } from "../../../boundary";

const LEDGER_ROW_CAP = 200;

function ledgerColumns(ctx: TabCtx): readonly CardsColumn<LedgerRowView>[] {
  return [
    { key: "time", label: "Time · UTC", render: (row) => (row.entry.occurredAt === null ? <span className="exec-pf-na">Time not published</span> : formatInstant(row.entry.occurredAt)) },
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
      {ledgerIsEmpty(ledger) ? null : <p className="exec-pf-note">
        Append-only, newest first.
        {bounded.total !== null && bounded.returned !== null ? ` Showing ${shown.length} of ${bounded.total}.` : ` Showing ${shown.length}.`}
        {bounded.hasMore ? " The read is bounded to the latest entries and publishes no older page." : ""}
        {all.length > shown.length ? ` The first ${LEDGER_ROW_CAP} rows are drawn.` : ""}
      </p>}
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
          {envs.map((env) => <AllocationFlow key={`flow-${env}`} ctx={ctx} environment={env} />)}
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
      <PfNotAvailableLine facts={[{ label: "Ledger receipts", id: PF_FE.flowEdges.fe }]} />
      <Block domain="real" ctx={ctx} />
      <Block domain="simulated" ctx={ctx} />
    </div>
  );
}
