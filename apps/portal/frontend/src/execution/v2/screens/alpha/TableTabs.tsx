/**
 * The table tabs of Alpha 360: Deployments, Research Evidence, Regime Fit,
 * Positions and Reconciliation.
 *
 * Every figure is a published string. What the backend has not published
 * (stage dates FE-027, deployer FE-021, receipts FE-032, run binding FE-029,
 * regime FE-011) is a sentence with its request id in the cell, never a dash
 * and never a zero. A table shows at most `ROW_CAP` rows and says "top N of
 * total" when it cuts.
 */
import { Link } from "react-router-dom";

import { CardsTable, type CardsColumn } from "../../cardsTable";
import { Flag } from "../../Flag";
import { NaWhy, NotAvailableLine, SectionPanel, type UnavailableFact } from "../../blocks";
import { PanelState } from "../../../components/states";
import { formatAsOf } from "../../boundary";
import { Dec, At, Na } from "./cells";
import { ROW_CAP, type DeploymentFinancial, type DeploymentRow, type PositionRow, type ReconRow } from "./model";
import { Np, WhyMark } from "./np";
import type { AlphaView } from "./view";

/** The words of a body whose relation rows were cut at its byte bound: never "none", never a table. */
function Withheld({ what, reason }: { what: string; reason: string }) {
  return <PanelState status="partial" reason={`${what} are not in this response: the Portal cut it at its size bound (${reason}).`} />;
}

function CapNote({ shown, total, noun }: { shown: number; total: number; noun: string }) {
  if (total <= shown) return null;
  return <p className="exec-alp2-cap"><span>Top {shown} of {total} {noun}</span></p>;
}

/* ── deployments ──────────────────────────────────────────────────────────── */

/** One figure of a deployment's published snapshot row: the exact decimal, or `Not available` with the server's reason. */
function FinancialCell({ f, member, fallbackCurrency, signed = false }: { f: DeploymentFinancial; member: "netPnl" | "equity"; fallbackCurrency: string | null; signed?: boolean }) {
  const value = f[member];
  if (f.state === "UNAVAILABLE" || value === null) return <NaWhy reason={f.reason} />;
  const at = member === "netPnl" && f.atMs !== null ? <small className="exec-alp2-dim"> {formatAsOf(f.atMs)}</small> : null;
  return (
    <>
      <Dec value={value} currency={f.currency ?? fallbackCurrency} signed={signed} />
      {at}
      {f.state === "PARTIAL" && member === "netPnl" ? <WhyMark name="Snapshot, reason" reason={f.reason} /> : null}
    </>
  );
}

export interface DeploymentsTabProps {
  rows: readonly DeploymentRow[];
  canSeeAccounts: boolean;
  linkTo: (href: string) => string;
  /** SCOPED_V2: the money columns the body does not state read `Not published (FE-005)` with its reason; a stage inside the Live book is not named. */
  scopedNoTotals?: string | null;
  /** Rows the body carried that have no deployment id (said under the table, not dropped silently). */
  unplaced?: number;
  /** Set when the response is the bounded shape. */
  withheld?: string | null;
}

export function DeploymentsTab({ rows, canSeeAccounts, linkTo, scopedNoTotals = null, unplaced = 0, withheld = null }: DeploymentsTabProps) {
  const shown = rows.slice(0, ROW_CAP);
  const scoped = scopedNoTotals !== null;
  const columns: CardsColumn<DeploymentRow>[] = [
    { key: "stage", label: "Stage", render: (r) => <span className="exec-alp2-stage" data-stage={r.stage ?? "unknown"}><i aria-hidden="true" />{r.stageLabel}{r.stage === null && scoped ? <WhyMark name="Stage, reason" reason="Canary or Live is not stated by the scoped body" /> : null}</span> },
    { key: "deployment", label: "Deployment", render: (r) => <Link className="exec-blk-link" to={linkTo(r.href)}>{r.id}</Link> },
    {
      key: "account",
      label: "Account · portfolio",
      render: (r) => (
        <>
          {canSeeAccounts && r.accountId !== null ? <Link className="exec-blk-link" to={linkTo(`/deployments/accounts/${encodeURIComponent(r.accountId)}`)}>{r.accountId}</Link> : <Na />}
          {r.portfolio ? <span className="exec-alp2-dim"> · {r.portfolio}</span> : null}
        </>
      ),
    },
    { key: "runtime", label: "Runtime", render: (r) => <Flag kind={r.runtime.kind} label={r.runtime.label} size="sm" /> },
    { key: "venue", label: "Venue", render: (r) => r.venue ?? <Na /> },
    { key: "allocation", label: "Allocated, current", numeric: true, render: (r) => (scoped && r.allocation === null ? <span><Np id="FE-005" /><WhyMark name="Totals, reason" reason={scopedNoTotals} /></span> : <Dec value={r.allocation} currency={r.currency} />) },
    {
      key: "net",
      label: "Net PnL, current",
      numeric: true,
      render: (r) => (scoped
        ? r.financial !== undefined ? <FinancialCell f={r.financial} member="netPnl" fallbackCurrency={r.currency} signed /> : <span><Np id="FE-005" /><WhyMark name="Totals, reason" reason={scopedNoTotals} /></span>
        : <Dec value={r.netPnl} currency={r.currency} signed />),
    },
    { key: "equity", label: "Equity", numeric: true, render: (r) => (r.financial !== undefined ? <FinancialCell f={r.financial} member="equity" fallbackCurrency={r.currency} /> : <NaWhy />) },
  ];
  // The equity column exists only when the body publishes a snapshot entry for some deployment.
  const withEquity = rows.some((r) => r.financial !== undefined);
  if (!withEquity) columns.splice(columns.findIndex((c) => c.key === "equity"), 1);
  // Dates, deployer and receipts have no source: ONE line under the table, not a "Not published" cell per row and column (UX audit A).
  const missing: UnavailableFact[] = [
    { label: "Dates", id: "FE-027" },
    ...(canSeeAccounts ? [{ label: "Deployed by", id: "FE-021" as const }] : []),
    { label: "Receipts", id: "FE-032" },
  ];
  return (
    <SectionPanel title="Deployments" aside={withheld ? undefined : `${rows.length} ${rows.length === 1 ? "deployment" : "deployments"}`} flush>
      {withheld ? <Withheld what="Deployments" reason={withheld} /> : (
        <>
      <CardsTable
        columns={columns}
        rows={shown}
        rowKey={(r) => (r.env === undefined ? r.id : `${r.env}:${r.id}`)}
        label="Deployments of this alpha"
        empty={<PanelState status="empty" reason="The source published no deployment for this alpha." />}
      />
      <CapNote shown={shown.length} total={rows.length} noun="deployments" />
      <NotAvailableLine facts={missing} className="exec-alp2-nal" />
      <p className="exec-alp2-cap">
        {canSeeAccounts ? null : <span>Only deployments in your slice</span>}
        <span>No allocation total: rows sit in different partitions</span>
        {withEquity ? <span>One snapshot row per deployment, not summed</span> : null}
        {unplaced > 0 ? <span>{unplaced} {unplaced === 1 ? "row" : "rows"} without a deployment id not shown</span> : null}
      </p>
        </>
      )}
    </SectionPanel>
  );
}

/* ── evidence ─────────────────────────────────────────────────────────────── */

export function EvidenceTab({ view, researchReason }: { view: AlphaView | null; researchReason: string | null }) {
  const here = view !== null && view.present ? view : null;
  return (
    <SectionPanel title="Research Evidence">
      {here !== null && here.name === null && here.version === null ? null : (
        <table className="exec-alp2-kv">
          <tbody>
            <tr><th scope="row">Alpha version</th><td>{here ? here.titleWithVersion : <Na />}</td></tr>
          </tbody>
        </table>
      )}
      <NotAvailableLine
        facts={[
          { label: "Bound research run", id: "FE-029" },
          { label: "Parameters", id: "FE-029" },
          { label: "Parameter bundle", id: "FE-029" },
          { label: "Evidence", id: "FE-029" },
          { label: "Provenance", id: "FE-029" },
          { label: "Artifact available", id: "FE-029" },
        ]}
        className="exec-alp2-nal"
      />
      {researchReason !== null ? (
        <p className="exec-alp2-cap"><span>Research binding: <span className="exec-blk-id">{researchReason}</span></span></p>
      ) : null}
      <details className="exec-alp2-details">
        <summary>Provenance</summary>
        <table className="exec-alp2-kv">
          <tbody>
            <tr><th scope="row">Alpha</th><td className="exec-blk-id">{here?.alphaId ?? "Not available"}</td></tr>
            <tr><th scope="row">Version</th><td className="exec-blk-id">{here?.version ?? (here ? "Not published" : "Not available")}</td></tr>
          </tbody>
        </table>
      </details>
    </SectionPanel>
  );
}

/* ── regime ───────────────────────────────────────────────────────────────── */

const REGIME_AXES = ["Volatility", "Trend", "Liquidity"] as const;

export function RegimeTab() {
  return (
    <SectionPanel title="Regime fit" aside="Historical support, not a forecast">
      <p className="exec-alp2-line"><Flag kind="pending" label="Not evaluated" size="sm" /></p>
      <NotAvailableLine facts={[...REGIME_AXES, "Outcome by stage"].map((label) => ({ label, id: "FE-011" as const }))} className="exec-alp2-nal" />
    </SectionPanel>
  );
}

/* ── positions ────────────────────────────────────────────────────────────── */

export function PositionsTab({
  rows, canSeeAccounts, linkTo, unplaced = 0, withheld = null,
}: { rows: readonly PositionRow[]; canSeeAccounts: boolean; linkTo: (href: string) => string; unplaced?: number; withheld?: string | null }) {
  const shown = rows.slice(0, ROW_CAP);
  const columns: CardsColumn<PositionRow>[] = [
    { key: "symbol", label: "Symbol", render: (r) => r.symbol },
    { key: "side", label: "Side", render: (r) => r.side },
    {
      key: "account",
      label: "Account",
      render: (r) => (canSeeAccounts && r.accountId ? <Link className="exec-blk-link" to={linkTo(`/deployments/accounts/${encodeURIComponent(r.accountId)}`)}>{r.accountId}</Link> : <Na />),
    },
    { key: "qty", label: "Quantity", numeric: true, render: (r) => <Dec value={r.quantity} unit="qty" /> },
    { key: "entry", label: "Entry", numeric: true, render: (r) => <Dec value={r.entry} /> },
    { key: "mark", label: "Mark", numeric: true, render: (r) => <Dec value={r.mark} why="Not marked" /> },
    { key: "upnl", label: "Unrealized, current", numeric: true, render: (r) => <Dec value={r.unrealized} currency={r.currency} signed /> },
    { key: "notional", label: "Notional", numeric: true, render: (r) => <Dec value={r.notional} currency={r.currency} /> },
  ];
  return (
    <SectionPanel title="Positions" aside="Hedge legs shown apart" flush>
      {withheld ? <Withheld what="Positions" reason={withheld} /> : (
        <>
      <CardsTable
        columns={columns}
        rows={shown}
        rowKey={(r) => r.key}
        label="Current positions of this alpha"
        empty={<PanelState status="empty" reason="No position is present for this alpha in the retained projection window." />}
      />
      <CapNote shown={shown.length} total={rows.length} noun="positions" />
      {unplaced > 0 ? <p className="exec-alp2-cap"><span>{unplaced} {unplaced === 1 ? "row" : "rows"} without an instrument id not shown</span></p> : null}
        </>
      )}
    </SectionPanel>
  );
}

/* ── reconciliation ───────────────────────────────────────────────────────── */

export function ReconciliationTab({ rows, scoped = false, withheld = null }: { rows: readonly ReconRow[]; scoped?: boolean; withheld?: string | null }) {
  const shown = rows.slice(0, ROW_CAP);
  const columns: CardsColumn<ReconRow>[] = [
    { key: "venue", label: "Venue", render: (r) => r.venue },
    {
      key: "kind",
      label: "Finding",
      render: (r) => (
        <>
          {r.kind === null ? <span><Np id="FE-072" /><WhyMark name="Finding type, reason" reason="The scoped reconciliation relation has no finding type" /></span> : r.kind}
          {r.findingId ? <> <span className="exec-blk-id">{r.findingId}</span></> : null}
        </>
      ),
    },
    { key: "status", label: "Result", render: (r) => <Flag kind={r.status.kind} label={r.status.label} size="sm" /> },
    {
      key: "resolved",
      label: "Resolved",
      render: (r) => (r.resolvedAt !== null ? <At iso={new Date(r.resolvedAt).toISOString()} /> : scoped && r.status.label !== "Open" ? <span><Np id="FE-072" /><WhyMark name="Resolution time, reason" reason="The scoped reconciliation relation has no resolution time" /></span> : <Na why="Not resolved" />),
    },
  ];
  return (
    <SectionPanel title="Reconciliation" aside="Ledger and venue only" flush>
      {withheld ? <Withheld what="Reconciliation findings" reason={withheld} /> : (
        <>
      <CardsTable
        columns={columns}
        rows={shown}
        rowKey={(r) => r.key}
        label="Reconciliation findings"
        empty={<PanelState status="empty" reason="No reconciliation finding is present for this alpha. This is an empty source result, not an unavailable screen." />}
      />
      <CapNote shown={shown.length} total={rows.length} noun="findings" />
        </>
      )}
    </SectionPanel>
  );
}
