/**
 * Risk and Health: exposure and margin as current facts per deployment and per
 * account, reconciliation as the sync and findings the resource carried, and
 * the correlation read, whose usual honest answer today is "no data source".
 *
 * Nothing here is a ratio the browser worked out: margin utilization and a
 * portfolio gross exposure need a denominator or a sum across currencies, so
 * they are named as not published instead of drawn.
 */
import { CorrelationState } from "./Correlation";
import { SectionPanel } from "../../../blocks";
import { CardsTable, type CardsColumn } from "../../../cardsTable";
import { Flag } from "../../../Flag";
import { PF_FE } from "../fe";
import { Absent, Money, Np } from "../format";
import type { TabCtx } from "./ctx";
import { contributionByCurrency, type AccountView, type DeploymentView } from "./model";
import { CapNote, InternalLink, capped } from "./parts";

import "../../../css/portfolios.css";
import { formatInstant } from "../../../boundary";

export function RiskTab({ ctx }: { ctx: TabCtx }) {
  const exposureColumns: CardsColumn<DeploymentView>[] = [
    { key: "deployment", label: "Deployment", render: (d) => <InternalLink to={ctx.routes.deployment(d.deploymentId, d.stage)} search={ctx.search}>{d.deploymentId}</InternalLink> },
    { key: "alpha", label: "Alpha", render: (d) => d.alphaLabel },
    { key: "allocation", label: "Allocation", numeric: true, render: (d) => <Money value={d.allocation} currency={d.currency} /> },
    { key: "exposure", label: "Gross exposure, now", numeric: true, render: (d) => <Money value={d.exposure} currency={d.currency} /> },
  ];
  const marginColumns: CardsColumn<AccountView>[] = [
    { key: "account", label: "Account", render: (a) => (ctx.mayOpenAccounts ? <InternalLink to={ctx.routes.account(a.accountId)} search={ctx.search}>{a.accountId}</InternalLink> : a.accountId) },
    {
      key: "initial",
      label: "Initial margin",
      numeric: true,
      render: (a) => (a.margins.length === 0 ? <Absent reason="no margin published" /> : <span className="exec-pf-ccylist">{a.margins.map((m) => <Money key={m.currency} value={m.initial} currency={m.currency} />)}</span>),
    },
    {
      key: "maintenance",
      label: "Maintenance margin",
      numeric: true,
      render: (a) => (a.margins.length === 0 ? <Absent reason="no margin published" /> : <span className="exec-pf-ccylist">{a.margins.map((m) => <Money key={m.currency} value={m.maintenance} currency={m.currency} />)}</span>),
    },
    { key: "utilization", label: "Utilization", numeric: true, render: () => <Absent reason="not published" /> },
  ];
  const reconColumns: CardsColumn<AccountView>[] = [
    { key: "account", label: "Account", render: (a) => (ctx.mayOpenAccounts ? <InternalLink to={ctx.routes.account(a.accountId)} search={ctx.search}>{a.accountId}</InternalLink> : a.accountId) },
    { key: "last", label: "Last synced · UTC", render: (a) => (a.lastSyncedAt === null ? <Absent reason="not published" /> : formatInstant(a.lastSyncedAt)) },
    { key: "status", label: "Status", render: (a) => <Flag kind={a.syncKind} label={a.syncLabel} size="sm" /> },
    { key: "findings", label: "Open findings", numeric: true, render: (a) => (a.openFindings === null ? <Absent reason="findings not carried" /> : String(a.openFindings)) },
  ];
  const currencies = contributionByCurrency(ctx.deployments).map((g) => g.currency);
  return (
    <div className="exec-pf-grid2">
      <div className="exec-pf-stack">
        <SectionPanel title="Exposure" aside="Current, per deployment">
          <table className="exec-pf-statements" aria-label="Exposure facts">
            <tbody>
              <tr><th scope="row">Drawdown now and max</th><td><Np fact={PF_FE.drawdown} /></td></tr>
              <tr><th scope="row">Portfolio gross exposure</th><td><Absent reason={currencies.length > 1 ? `not published; ${currencies.join(" and ")} figures are never added` : "not published; it is not worked out here"} /></td></tr>
              <tr><th scope="row">Exposure cap</th><td><Absent reason="no cap published" /></td></tr>
            </tbody>
          </table>
          {ctx.deployments.length === 0 ? (
            <p className="exec-pf-note">The resource published no deployment, so there is no exposure to show.</p>
          ) : (
            <><CardsTable label="Exposure by deployment" columns={exposureColumns} rows={capped(ctx.deployments)} rowKey={(d) => d.deploymentId} /><CapNote total={ctx.deployments.length} what="deployments" /></>
          )}
        </SectionPanel>
        <SectionPanel title="Margin" aside="Venue-reported, per account">
          {ctx.accounts.length === 0 ? <p className="exec-pf-note">No account published.</p> : <><CardsTable label="Margin by account" columns={marginColumns} rows={capped(ctx.accounts)} rowKey={(a) => a.accountId} /><CapNote total={ctx.accounts.length} what="accounts" /></>}
        </SectionPanel>
      </div>
      <div className="exec-pf-stack">
        <SectionPanel title="Reconciliation">
          {ctx.accounts.length === 0 ? <p className="exec-pf-note">No account published.</p> : <><CardsTable label="Reconciliation by account" columns={reconColumns} rows={capped(ctx.accounts)} rowKey={(a) => a.accountId} /><CapNote total={ctx.accounts.length} what="accounts" /></>}
        </SectionPanel>
        <SectionPanel title="Correlation">
          <CorrelationState ctx={ctx} />
        </SectionPanel>
      </div>
    </div>
  );
}
