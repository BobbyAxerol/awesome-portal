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

import type { AlphaFleetItem } from "../../../api/profileRead";
import { CardsTable, type CardsColumn } from "../../cardsTable";
import { Flag } from "../../Flag";
import { SectionPanel } from "../../blocks";
import { PanelState } from "../../../components/states";
import { Dec, At, Na } from "./cells";
import { ROW_CAP, type DeploymentRow, type PositionRow, type ReconRow } from "./model";
import { Np } from "./np";

function CapNote({ shown, total, noun }: { shown: number; total: number; noun: string }) {
  if (total <= shown) return null;
  return <p className="exec-alp2-cap"><span>Top {shown} of {total} {noun}</span></p>;
}

/* ── deployments ──────────────────────────────────────────────────────────── */

export function DeploymentsTab({ rows, canSeeAccounts, linkTo }: { rows: readonly DeploymentRow[]; canSeeAccounts: boolean; linkTo: (href: string) => string }) {
  const shown = rows.slice(0, ROW_CAP);
  const columns: CardsColumn<DeploymentRow>[] = [
    { key: "stage", label: "Stage", render: (r) => <span className="exec-alp2-stage" data-stage={r.stage ?? "unknown"}><i aria-hidden="true" />{r.stageLabel}</span> },
    { key: "deployment", label: "Deployment", render: (r) => <Link className="exec-blk-link" to={linkTo(r.href)}>{r.id}</Link> },
    {
      key: "account",
      label: "Account · portfolio",
      render: (r) => (
        <>
          {canSeeAccounts ? <Link className="exec-blk-link" to={linkTo(`/deployments/accounts/${encodeURIComponent(r.accountId)}`)}>{r.accountId}</Link> : <Na />}
          {r.portfolio ? <span className="exec-alp2-dim"> · {r.portfolio}</span> : null}
        </>
      ),
    },
    { key: "runtime", label: "Runtime", render: (r) => <Flag kind={r.runtime.kind} label={r.runtime.label} size="sm" /> },
    { key: "venue", label: "Venue", render: (r) => r.venue },
    { key: "allocation", label: "Allocated, current", numeric: true, render: (r) => <Dec value={r.allocation} currency={r.currency} /> },
    { key: "net", label: "Net PnL, current", numeric: true, render: (r) => <Dec value={r.netPnl} currency={r.currency} signed /> },
    { key: "dates", label: "Dates", render: () => <Np id="FE-027" /> },
  ];
  if (canSeeAccounts) columns.push({ key: "by", label: "Deployed by", render: () => <Np id="FE-021" /> });
  columns.push({ key: "receipts", label: "Receipts", numeric: true, render: () => <Np id="FE-032" /> });
  return (
    <SectionPanel title="Deployments" aside={`${rows.length} ${rows.length === 1 ? "deployment" : "deployments"}`} flush>
      <CardsTable
        columns={columns}
        rows={shown}
        rowKey={(r) => r.id}
        label="Deployments of this alpha"
        empty={<PanelState status="empty" reason="The source published no deployment for this alpha." />}
      />
      <CapNote shown={shown.length} total={rows.length} noun="deployments" />
      <p className="exec-alp2-cap">
        {canSeeAccounts ? null : <span>Only deployments in your slice</span>}
        <span>No allocation total: rows sit in different partitions</span>
      </p>
    </SectionPanel>
  );
}

/* ── evidence ─────────────────────────────────────────────────────────────── */

export function EvidenceTab({ item, researchReason }: { item: AlphaFleetItem | null; researchReason: string | null }) {
  return (
    <SectionPanel title="Research Evidence">
      <table className="exec-alp2-kv">
        <tbody>
          <tr><th scope="row">Alpha version</th><td>{item ? `${item.alphaLabel} v${item.version}` : <Na />}</td></tr>
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
            <tr><th scope="row">Alpha</th><td className="exec-blk-id">{item?.alphaId ?? "Not available"}</td></tr>
            <tr><th scope="row">Version</th><td className="exec-blk-id">{item?.version ?? "Not available"}</td></tr>
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

export function PositionsTab({ rows, canSeeAccounts, linkTo }: { rows: readonly PositionRow[]; canSeeAccounts: boolean; linkTo: (href: string) => string }) {
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
      <CardsTable
        columns={columns}
        rows={shown}
        rowKey={(r) => r.key}
        label="Current positions of this alpha"
        empty={<PanelState status="empty" reason="No position is present for this alpha in the retained projection window." />}
      />
      <CapNote shown={shown.length} total={rows.length} noun="positions" />
    </SectionPanel>
  );
}

/* ── reconciliation ───────────────────────────────────────────────────────── */

export function ReconciliationTab({ rows }: { rows: readonly ReconRow[] }) {
  const shown = rows.slice(0, ROW_CAP);
  const columns: CardsColumn<ReconRow>[] = [
    { key: "venue", label: "Venue", render: (r) => r.venue },
    { key: "kind", label: "Finding", render: (r) => r.kind },
    { key: "status", label: "Result", render: (r) => <Flag kind={r.status.kind} label={r.status.label} size="sm" /> },
    { key: "resolved", label: "Resolved", render: (r) => (r.resolvedAt === null ? <Na why="Not resolved" /> : <At iso={new Date(r.resolvedAt).toISOString()} />) },
  ];
  return (
    <SectionPanel title="Reconciliation" aside="Ledger and venue only" flush>
      <CardsTable
        columns={columns}
        rows={shown}
        rowKey={(r) => r.key}
        label="Reconciliation findings"
        empty={<PanelState status="empty" reason="No reconciliation finding is present for this alpha. This is an empty source result, not an unavailable screen." />}
      />
      <CapNote shown={shown.length} total={rows.length} noun="findings" />
    </SectionPanel>
  );
}
