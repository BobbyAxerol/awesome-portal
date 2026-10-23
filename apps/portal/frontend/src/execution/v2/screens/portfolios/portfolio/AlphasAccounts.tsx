/**
 * Alphas and Accounts.
 *
 * Alphas lists the portfolio's deployments under their alpha: allocation and
 * position PnL are the server's per-deployment strings, in the deployment's own
 * currency, and no per-alpha money is added up (an alpha can span currencies).
 * Share of PnL needs a window and is `Not published`.
 *
 * Accounts lists the venue accounts the deployments run on. A balance is the
 * ACCOUNT's, which may serve other portfolios; it sits beside the account and
 * is never presented as this portfolio's capital or added to anything.
 */
import { DivBars } from "../../../charts";
import { SectionPanel } from "../../../blocks";
import { CardsTable, type CardsColumn } from "../../../cardsTable";
import { Flag } from "../../../Flag";
import { PF_FE } from "../fe";
import { Absent, Money, Np } from "../format";
import type { TabCtx } from "./ctx";
import { contributionByCurrency, groupAlphas, type AccountView, type DeploymentView } from "./model";
import { CapNote, InternalLink, capped } from "./parts";

import "../../../css/portfolios.css";
import { formatInstant } from "../../../boundary";

export function AlphasTab({ ctx }: { ctx: TabCtx }) {
  const groups = groupAlphas(ctx.deployments);
  const columns: CardsColumn<DeploymentView>[] = [
    {
      key: "alpha",
      label: "Alpha",
      render: (d) => (
        <span className="exec-pf-name">
          {d.strategyId ? <InternalLink to={ctx.routes.alpha(d.strategyId)} search={ctx.search}>{d.alphaLabel}</InternalLink> : d.alphaLabel}
          <span className="exec-pf-id">{d.version ?? "version not published"}{d.owner ? ` · ${d.owner}` : ""}</span>
        </span>
      ),
    },
    { key: "deployment", label: "Deployment", render: (d) => <InternalLink to={ctx.routes.deployment(d.deploymentId, d.stage)} search={ctx.search}>{d.deploymentId}</InternalLink> },
    { key: "stage", label: "Stage", render: (d) => d.stageLabel },
    { key: "account", label: "Account", render: (d) => (d.accountId === null ? <Absent reason="no account published" /> : ctx.mayOpenAccounts ? <InternalLink to={ctx.routes.account(d.accountId)} search={ctx.search}>{d.accountId}</InternalLink> : d.accountId) },
    { key: "allocation", label: "Allocation", numeric: true, render: (d) => <Money value={d.allocation} currency={d.currency} /> },
    { key: "pnl", label: "Position PnL, now", numeric: true, render: (d) => <Money value={d.positionPnl} currency={d.currency} signed /> },
    { key: "share", label: "Share of PnL", numeric: true, render: () => <Np fact={PF_FE.share} /> },
    { key: "health", label: "Health", render: (d) => <Flag kind={d.healthKind} label={d.healthLabel} size="sm" /> },
  ];
  const contribution = contributionByCurrency(ctx.deployments);
  return (
    <div className="exec-pf-grid2 exec-pf-grid2--tables">
      <SectionPanel
        title="Alphas"
        aside={<>{groups.length} {groups.length === 1 ? "alpha" : "alphas"} · {ctx.deployments.length} {ctx.deployments.length === 1 ? "deployment" : "deployments"} · <InternalLink to={ctx.routes.fleet} search={ctx.search}>Open in Alpha Fleet</InternalLink></>}
      >
        {ctx.deployments.length === 0 ? (
          <p className="exec-pf-note">The resource published no deployment for this portfolio.</p>
        ) : (
          <><CardsTable label="Alphas and deployments" columns={columns} rows={capped(ctx.deployments)} rowKey={(d) => d.deploymentId} /><CapNote total={ctx.deployments.length} what="deployments" /></>
        )}
      </SectionPanel>
      <SectionPanel title="Contribution" aside="Position PnL now · not a window">
        {contribution.length === 0 ? (
          <p className="exec-pf-note">No deployment published a currency, so no contribution is drawn.</p>
        ) : (
          <div className="exec-pf-stack">
            {contribution.map((group) => (
              <DivBars
                key={group.currency}
                label={`Position PnL by deployment · ${group.currency}`}
                currency={group.currency}
                rows={group.rows.map((row) => ({ ...row, absent: "Not available" }))}
                unit="money"
              />
            ))}
            <p className="exec-pf-note">Share of PnL over a window is <Np fact={PF_FE.share} />. Each currency is its own chart.</p>
          </div>
        )}
      </SectionPanel>
    </div>
  );
}

export function AccountsTab({ ctx }: { ctx: TabCtx }) {
  const columns: CardsColumn<AccountView>[] = [
    {
      key: "account",
      label: "Account",
      render: (a) => (
        <span className="exec-pf-name">
          {ctx.mayOpenAccounts ? <InternalLink to={ctx.routes.account(a.accountId)} search={ctx.search}>{a.accountId}</InternalLink> : a.accountId}
          <span className="exec-pf-id">{a.venue ?? "venue not published"}{a.mode ? ` · ${a.mode}` : ""}</span>
        </span>
      ),
    },
    { key: "profile", label: "Profile", render: (a) => a.profile ?? <Absent reason="not published" /> },
    { key: "serves", label: "Serves here", render: (a) => `${a.servesHere} ${a.servesHere === 1 ? "deployment" : "deployments"}` },
    {
      key: "balance",
      label: "Venue balance, total",
      numeric: true,
      render: (a) => (a.balances.length === 0
        ? <Absent reason="no balance published" />
        : <span className="exec-pf-ccylist">{a.balances.map((b) => <Money key={b.currency} value={b.total} currency={b.currency} />)}</span>),
    },
    { key: "status", label: "Status", render: (a) => <Flag kind={a.syncKind} label={a.syncLabel} size="sm" /> },
    { key: "synced", label: "Last synced", render: (a) => (a.lastSyncedAt === null ? <Absent reason="not published" /> : formatInstant(a.lastSyncedAt)) },
  ];
  return (
    <div className="exec-pf-stack">
      <p className="exec-pf-banner" data-tone="info">
        A venue balance belongs to the account, which can serve sleeves outside this portfolio. It is shown beside the account and is never this portfolio's capital or added to it.
      </p>
      <SectionPanel title="Accounts" aside={`${ctx.accounts.length} ${ctx.accounts.length === 1 ? "account" : "accounts"}`}>
        {ctx.accounts.length === 0 ? (
          <p className="exec-pf-note">The resource published no account for this portfolio.</p>
        ) : (
          <><CardsTable label="Accounts" columns={columns} rows={capped(ctx.accounts)} rowKey={(a) => a.accountId} /><CapNote total={ctx.accounts.length} what="accounts" /></>
        )}
      </SectionPanel>
    </div>
  );
}
