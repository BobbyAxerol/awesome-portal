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
import { SectionPanel } from "../../blocks";
import { PanelState } from "../../../components/states";
import { Dec, At, Na } from "./cells";
import { ROW_CAP, type DeploymentRow, type PositionRow, type ReconRow } from "./model";
import { Np } from "./np";
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
    { key: "stage", label: "Stage", render: (r) => <span className="exec-alp2-stage" data-stage={r.stage ?? "unknown"} title={r.stage === null && scoped ? "Canary or Live is not stated by the scoped body" : undefined}><i aria-hidden="true" />{r.stageLabel}</span> },
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
    { key: "allocation", label: "Allocated, current", numeric: true, render: (r) => (scoped && r.allocation === null ? <span title={scopedNoTotals ?? undefined}><Np id="FE-005" /></span> : <Dec value={r.allocation} currency={r.currency} />) },
    { key: "net", label: "Net PnL, current", numeric: true, render: (r) => (scoped ? <span title={scopedNoTotals ?? undefined}><Np id="FE-005" /></span> : <Dec value={r.netPnl} currency={r.currency} signed />) },
    { key: "dates", label: "Dates", render: () => <Np id="FE-027" /> },
  ];
  if (canSeeAccounts) columns.push({ key: "by", label: "Deployed by", render: () => <Np id="FE-021" /> });
  columns.push({ key: "receipts", label: "Receipts", numeric: true, render: () => <Np id="FE-032" /> });
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
      <p className="exec-alp2-cap">
        {canSeeAccounts ? null : <span>Only deployments in your slice</span>}
        <span>No allocation total: rows sit in different partitions</span>
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
      <table className="exec-alp2-kv">
        <tbody>
          <tr><th scope="row">Alpha version</th><td>{here ? (here.name === null && here.version === null ? <Np id="FE-066">Name and version</Np> : here.titleWithVersion) : <Na />}</td></tr>
          <tr><th scope="row">Bound research run</th><td><Np id="FE-029" /></td></tr>
          <tr><th scope="row">Parameters</th><td><Np id="FE-029">Match against the deployed set</Np></td></tr>
          <tr><th scope="row">Parameter bundle</th><td><Np id="FE-029" /></td></tr>
          <tr><th scope="row">Evidence</th><td><Np id="FE-029">Original and revised evidence</Np></td></tr>
          <tr><th scope="row">Provenance</th><td><Np id="FE-029">In-sample, out-of-sample and holdout</Np></td></tr>
          <tr><th scope="row">Artifact available</th><td><Np id="FE-029" /></td></tr>
        </tbody>
      </table>
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
const REGIME_STAGES = ["Research OOS", "Paper", "Sandbox", "Real-funded"] as const;

export function RegimeTab() {
  return (
    <SectionPanel title="Regime fit" aside="Historical support, not a forecast">
      <p className="exec-alp2-line"><Flag kind="pending" label="Not evaluated" size="sm" /> <Np id="FE-011">Regime profile and support</Np></p>
      <div className="exec-alp2-pair">
        <table className="exec-alp2-kv" aria-label="Regime axes">
          <tbody>
            {REGIME_AXES.map((axis) => <tr key={axis}><th scope="row">{axis}</th><td><Np id="FE-011" /></td></tr>)}
          </tbody>
        </table>
        <table className="exec-alp2-kv" aria-label="Outcome by stage">
          <thead><tr><th scope="col">Stage</th><th scope="col">Outcome</th></tr></thead>
          <tbody>
            {REGIME_STAGES.map((stage) => <tr key={stage}><th scope="row">{stage}</th><td><Np id="FE-011" /></td></tr>)}
          </tbody>
        </table>
      </div>
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
    { key: "kind", label: "Finding", render: (r) => (r.kind === null ? <span title="The scoped reconciliation relation has no finding type"><Np id="FE-072" /></span> : r.kind) },
    { key: "status", label: "Result", render: (r) => <Flag kind={r.status.kind} label={r.status.label} size="sm" /> },
    {
      key: "resolved",
      label: "Resolved",
      render: (r) => (r.resolvedAt !== null ? <At iso={new Date(r.resolvedAt).toISOString()} /> : scoped ? <span title="The scoped reconciliation relation has no resolution time"><Np id="FE-072" /></span> : <Na why="Not resolved" />),
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
