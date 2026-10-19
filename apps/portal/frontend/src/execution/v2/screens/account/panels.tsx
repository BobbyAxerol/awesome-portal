/**
 * The Account 360 panels that read the account resource: authority KPIs,
 * sleeves, margin, positions, allocations, fees and funding, and the
 * reconciliation (Triad and sync history).
 *
 * Every figure is a published string printed through `MetricText`. Three
 * authorities stay in three places: the internal ledger for this sleeve, the
 * native (venue) report for the whole account, and the portal's budget for the
 * sleeve (not published yet). Nothing here adds sleeves up, converts a
 * currency, or derives a difference.
 */
import { Link, useSearchParams } from "react-router-dom";

import type { BindingExposure } from "../../../analytics";
import type { ProfileEnvelope } from "../../../api/profileRead";
import { CardsTable, type CardsColumn } from "../../cardsTable";
import { Flag } from "../../Flag";
import { KpiStrip, Kpi, SectionPanel, Triad } from "../../blocks";
import { withContext } from "../../urlState";
import {
  FE, SYNC_SHOWN, alphaHref, balanceFacts, brokerFacts, coverageFlag, deploymentHref, diffFacts, headroomFacts,
  ledgerPnl, marginFacts, portfolioHref, positionCount, sleeveRows, stageWord, triadModel,
  type AccountView, type AllocationFacts, type PositionFacts, type Population, type SleeveRow, type SyncEntry,
} from "./model";
import { Fact, Na, NotComputed, Np, Value, When } from "./parts";

export interface PanelContext {
  profile: ProfileEnvelope;
  view: AccountView;
  accountId: string;
  currency: string | null;
  population: Population;
}

/* ── three authorities ──────────────────────────────────────────────────── */

export function AuthorityKpis({ ctx, physicalOnly }: { ctx: PanelContext; physicalOnly: boolean }) {
  const { profile, accountId, currency, population } = ctx;
  const bal = balanceFacts(profile, accountId, currency);
  const pnl = ledgerPnl(profile, accountId, currency);
  const broker = brokerFacts(profile, currency);
  return (
    <KpiStrip label="Authorities" columns={physicalOnly ? 1 : 3}>
      {physicalOnly ? null : (
        <Kpi label="Internal ledger · this sleeve" metric={bal?.total} suffix={currency ?? undefined} basis={bal ? "Account balance" : undefined}>
          {bal ? <>As of <When at={bal.asOf} /></> : undefined}
          <span className="exec-acct-sub2">Unrealized PnL, current: <Value metric={pnl?.unrealized} signed /></span>
        </Kpi>
      )}
      <Kpi label="Native custody · whole account" metric={broker?.buyingPower} suffix={currency ?? undefined} basis={broker ? "Buying power reported by the venue" : undefined}>
        {broker ? <>Venue report as of <When at={broker.asOf} /></> : undefined}
        {population.shared ? <span className="exec-acct-sub2">Shared by {population.expected ?? population.published} sleeves</span> : null}
        <span className="exec-acct-sub2">Native equity: <Na why="Venue field not reported" /></span>
      </Kpi>
      {physicalOnly ? null : (
        <div className="exec-blk-kpi">
          <dt className="exec-blk-kpi-label">Budget · this sleeve</dt>
          <dd className="exec-blk-kpi-body">
            <span className="exec-blk-kpi-value"><Np fact={FE.budget} /></span>
            <span className="exec-blk-kpi-note">
              Published position rows: <Value metric={positionCount(profile, accountId)} />
            </span>
          </dd>
        </div>
      )}
    </KpiStrip>
  );
}

/* ── sleeves ────────────────────────────────────────────────────────────── */

export function SleevesPanel({ ctx }: { ctx: PanelContext }) {
  const [params] = useSearchParams();
  const rows = sleeveRows(ctx.profile, ctx.view, ctx.currency);
  const { population } = ctx;
  const columns: CardsColumn<SleeveRow>[] = [
    {
      key: "sleeve",
      label: "Sleeve",
      render: (row) => row.current
        ? <span className="exec-acct-name">{row.label}</span>
        : <Link className="exec-acct-link" to={withContext(`/deployments/accounts/${encodeURIComponent(row.accountId)}`, params)}>{row.label}</Link>,
    },
    { key: "portfolio", label: "Portfolio", render: (row) => (row.portfolio === null ? <Na /> : row.portfolio) },
    { key: "internal", label: "Internal balance", numeric: true, render: (row) => <Value metric={row.internal} suffix={ctx.currency ?? undefined} /> },
    { key: "native", label: "Native attribution", numeric: true, render: () => <NotComputed why="Native balance spans all sleeves" /> },
  ];
  return (
    <SectionPanel title="Sleeves on this binding" aside="Physical" flush>
      <CardsTable columns={columns} rows={rows} rowKey={(row) => row.accountId} label="Sleeves on this binding" selectedKey={ctx.accountId} />
      <p className="exec-acct-cap">
        Not totalled. Native balance is not split among sleeves.
        {population.partial ? ` ${population.published} of ${population.expected} sleeves are published here.` : ""}
      </p>
    </SectionPanel>
  );
}

/* ── margin ─────────────────────────────────────────────────────────────── */

export function MarginPanel({ ctx }: { ctx: PanelContext }) {
  const { profile, currency, view } = ctx;
  const margin = marginFacts(profile, ctx.accountId, currency);
  const head = headroomFacts(profile, currency);
  const cover = head ? coverageFlag(head.verdict) : null;
  const cross = /cross/i.test(view.identity.marginMode ?? "");
  return (
    <SectionPanel title="Margin" aside="Whole account">
      <dl className="exec-acct-facts">
        <Fact label="Margin ratio"><Np fact={FE.marginRatio} /></Fact>
        <Fact label="Initial margin">
          {margin?.perInstrumentOnly ? <Na why="Published per instrument only" /> : <Value metric={margin?.initial} suffix={currency ?? undefined} />}
        </Fact>
        <Fact label="Maintenance">
          {margin?.perInstrumentOnly ? <Na why="Published per instrument only" /> : <Value metric={margin?.maintenance} suffix={currency ?? undefined} />}
        </Fact>
        <Fact label="Free balance"><Value metric={head?.free} suffix={currency ?? undefined} /></Fact>
        <Fact label="Headroom"><Value metric={head?.headroom} suffix={currency ?? undefined} signed /></Fact>
        <Fact label="Coverage">{cover ? <Flag kind={cover.kind} label={cover.label} size="sm" /> : <Na />}</Fact>
      </dl>
      {cross ? (
        <details className="exec-acct-prov">
          <summary>Cross margin</summary>
          <p className="exec-acct-note">Cross margin: a liquidation can hit every sleeve.</p>
        </details>
      ) : null}
    </SectionPanel>
  );
}

/* ── positions ──────────────────────────────────────────────────────────── */

export function PositionsPanel({ ctx, scope, onScope }: { ctx: PanelContext; scope: "sleeve" | "account"; onScope(next: "sleeve" | "account"): void }) {
  const rows = ctx.view.positions;
  const columns: CardsColumn<PositionFacts>[] = [
    { key: "symbol", label: "Symbol", render: (row) => row.symbol ?? <Na /> },
    { key: "side", label: "Side", render: (row) => row.side ?? <Na /> },
    { key: "qty", label: "Quantity", numeric: true, render: (row) => <Value metric={row.quantity} /> },
    { key: "notional", label: "Notional", numeric: true, render: (row) => <Value metric={row.notional} suffix={row.currency ?? undefined} /> },
    { key: "pnl", label: "Unrealized PnL", numeric: true, render: (row) => <Value metric={row.unrealized} suffix={row.currency ?? undefined} signed /> },
  ];
  return (
    <SectionPanel
      title="Positions"
      aside={
        <span className="exec-acct-seg" role="group" aria-label="Positions scope">
          <button type="button" className="exec-acct-segbtn" aria-pressed={scope === "sleeve"} onClick={() => onScope("sleeve")}>This sleeve</button>
          <button type="button" className="exec-acct-segbtn" aria-pressed={scope === "account"} onClick={() => onScope("account")}>Whole account</button>
        </span>
      }
      flush
    >
      {scope === "account" ? (
        <div className="exec-acct-pad"><Na why="No source attributes native positions to sleeves" /></div>
      ) : (
        <>
          <dl className="exec-acct-sidebar">
            <Fact label="Long notional"><Np fact={FE.gross} /></Fact>
            <Fact label="Short notional"><Np fact={FE.gross} /></Fact>
            <Fact label="Gross notional"><Np fact={FE.gross} /></Fact>
          </dl>
          <CardsTable
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
            label="Positions of this sleeve"
            empty={<span className="exec-acct-note">No position rows are published for this sleeve.</span>}
          />
          <p className="exec-acct-cap">Notional per position is as published. Totals by side are not published and are not added up here.</p>
        </>
      )}
    </SectionPanel>
  );
}

/* ── allocations ────────────────────────────────────────────────────────── */

export function AllocationsPanel({ ctx }: { ctx: PanelContext }) {
  const [params] = useSearchParams();
  const columns: CardsColumn<AllocationFacts>[] = [
    {
      key: "alpha",
      label: "Alpha",
      render: (row) => row.alpha === null ? <Na /> : <Link className="exec-acct-link" to={withContext(alphaHref(row.alpha), params)}>{row.alpha}</Link>,
    },
    {
      key: "deployment",
      label: "Deployment",
      render: (row) => row.deployment === null ? <Na /> : <Link className="exec-acct-link" to={withContext(deploymentHref(row.deployment, row.mode), params)}>{row.deployment}</Link>,
    },
    { key: "stage", label: "Stage", render: (row) => stageWord(row.mode) },
    {
      key: "portfolio",
      label: "Portfolio",
      render: (row) => row.portfolio === null ? <Na /> : <Link className="exec-acct-link" to={withContext(portfolioHref(row.portfolio), params)}>{row.portfolio}</Link>,
    },
    { key: "allocation", label: "Allocation", numeric: true, render: (row) => <Value metric={row.allocation} suffix={row.currency ?? undefined} /> },
  ];
  return (
    <SectionPanel title="Allocations" aside="Logical" flush>
      <CardsTable
        columns={columns}
        rows={ctx.view.allocations}
        rowKey={(row) => row.id}
        label="Allocations on this account"
        empty={<span className="exec-acct-note">No allocation row is published for this account.</span>}
      />
      <p className="exec-acct-cap">Logical allocations. They are no claim on the native balance.</p>
    </SectionPanel>
  );
}

/* ── fees and funding ───────────────────────────────────────────────────── */

export function FeesPanel({ ctx }: { ctx: PanelContext }) {
  const pnl = ledgerPnl(ctx.profile, ctx.accountId, ctx.currency);
  return (
    <SectionPanel title="Fees & funding" aside="This sleeve">
      <dl className="exec-acct-facts">
        <Fact label="Fees, over a window"><Np fact={FE.window} /></Fact>
        <Fact label="Funding, over a window"><Np fact={FE.window} /></Fact>
        <Fact label="Borrow, over a window"><Np fact={FE.window} /></Fact>
      </dl>
      <h3 className="exec-acct-h">Current source row</h3>
      <dl className="exec-acct-facts">
        <Fact label="Fees, current"><Value metric={pnl?.fees} suffix={ctx.currency ?? undefined} /></Fact>
        <Fact label="Funding, current"><Value metric={pnl?.funding} suffix={ctx.currency ?? undefined} signed /></Fact>
        <Fact label="As of"><When at={pnl?.asOf} /></Fact>
      </dl>
      <p className="exec-acct-cap">Current figures are what the latest ledger row states. They are not a window and are not summed.</p>
    </SectionPanel>
  );
}

/* ── reconciliation ─────────────────────────────────────────────────────── */

function inSyncFlag(inSync: boolean | null) {
  if (inSync === null) return <Flag kind="unknown" size="sm" label="No verdict" />;
  return inSync ? <Flag kind="ok" size="sm" label="In sync" /> : <Flag kind="attention" size="sm" label="Differs" />;
}

export function ReconciliationPanel({ ctx, exposure }: { ctx: PanelContext; exposure: BindingExposure | null }) {
  const { profile, accountId, currency, population } = ctx;
  const model = triadModel(profile, accountId, currency, population.shared);
  const diff = diffFacts(profile, currency);
  return (
    <>
      <SectionPanel title="Internal · Broker · Difference" aside="Difference only where scopes match">
        <Triad rows={model.rows} internal={model.internal} broker={model.broker} />
        <p className="exec-acct-line">
          <span className="exec-acct-k">Published verdict{currency ? ` (${currency})` : ""}</span> {inSyncFlag(diff ? diff.inSync : null)}
          {diff === null && population.shared ? <span className="exec-acct-note"> Shared binding: the balance difference is not computed.</span> : null}
        </p>
        {exposure && exposure.completeness !== "COMPLETE" ? (
          <p className="exec-acct-note" role="status"><Flag kind="partial" size="sm" /> The binding population is {exposure.completeness.toLowerCase()}; read these differences as part of the picture.</p>
        ) : null}
      </SectionPanel>
      <SyncHistory entries={ctx.view.sync} />
    </>
  );
}

export function SyncHistory({ entries }: { entries: readonly SyncEntry[] }) {
  const shown = entries.slice(0, SYNC_SHOWN);
  const columns: CardsColumn<SyncEntry>[] = [
    { key: "when", label: "When (UTC)", render: (row) => (row.at === null ? <Na why="Time not published" /> : <When at={row.at} />) },
    { key: "source", label: "Source", render: (row) => row.source },
    { key: "result", label: "Result", render: (row) => <Flag kind={row.status.kind} label={row.status.label} size="sm" /> },
    { key: "bp", label: "Buying power", numeric: true, render: (row) => (row.source === "BROKER" ? <Value metric={row.detail} /> : <Na why="Broker rows only" />) },
  ];
  return (
    <SectionPanel title="Sync history" aside={`${shown.length} of ${entries.length}`} flush>
      <CardsTable
        columns={columns}
        rows={shown}
        rowKey={(row) => row.id}
        label="Sync history"
        empty={<span className="exec-acct-note">No sync row is published for this account.</span>}
      />
      {entries.length > shown.length ? <p className="exec-acct-cap">Showing the newest {shown.length} of {entries.length} published rows. Rows are listed as the source gave them; gaps in time are not filled.</p> : null}
    </SectionPanel>
  );
}
