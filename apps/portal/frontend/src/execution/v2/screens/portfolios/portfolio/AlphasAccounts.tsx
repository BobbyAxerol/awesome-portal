/**
 * Alphas and Accounts.
 *
 * Alphas is the Alpha Fleet table filtered to this portfolio (`AlphasFleet`: same Manager dataset
 * rows, same cells). Below it the Contribution chart keeps what the Fleet does not carry: current
 * position PnL per deployment, one chart per currency, never added up. Share of PnL needs a window
 * and is `Not published`.
 *
 * Accounts lists the venue accounts the deployments run on. A balance is the
 * ACCOUNT's, which may serve other portfolios; it sits beside the account and
 * is never presented as this portfolio's capital or added to anything.
 */
import { DivBars } from "../../../charts";
import { SectionPanel } from "../../../blocks";
import { CardsTable, type CardsColumn } from "../../../cardsTable";
import { Flag } from "../../../Flag";
import { PortfolioAlphasFleet } from "./AlphasFleet";
import { PF_FE } from "../fe";
import { Absent, Money, Np } from "../format";
import type { TabCtx } from "./ctx";
import { contributionByCurrency, type AccountView } from "./model";
import { CapNote, InternalLink, capped } from "./parts";

import "../../../css/portfolios.css";
import { formatInstant } from "../../../boundary";

export function AlphasTab({ ctx }: { ctx: TabCtx }) {
  const contribution = contributionByCurrency(ctx.deployments);
  return (
    <div className="exec-pf-grid2 exec-pf-grid2--tables">
      <SectionPanel
        title="Alphas"
        aside={<><InternalLink to={`${ctx.routes.fleet}?portfolio=${encodeURIComponent(ctx.portfolioId)}`} search={ctx.search}>Open in Alpha Fleet</InternalLink></>}
      >
        <PortfolioAlphasFleet ctx={ctx} />
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
            <p className="exec-pf-note">Share of PnL over a window is <Np fact={PF_FE.share} />. Each currency is its own chart. The chart reads the portfolio resource's per-deployment position PnL; the list beside it is the Alpha Fleet's dataset.</p>
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
