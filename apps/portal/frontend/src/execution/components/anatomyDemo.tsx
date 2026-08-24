/**
 * The EL-V2-02 evidence fixture: every workspace primitive composed once, on
 * the Paper canonical cast, in the three density layouts.
 *
 * This is not the Paper screen (that is EL-V2-04). It is the proof that the
 * anatomy is reusable and that density changes spacing, disclosure, columns
 * and row height — never the type hierarchy: the title is 24px sans in the
 * sparse column, the balanced grid and the dense canvas alike.
 */
import { useState } from "react";

import {
  ExecutionContextRail,
  ExecutionDecisionStrip,
  ExecutionPageHeader,
  ExecutionProvenanceDrawer,
  ExecutionTabs,
  ExecutionTerminal,
  ExecutionWorkspace,
  shortDigest,
  type ExecutionLayout,
  type TerminalRow,
} from "./workspace";
import { ExecutionEvidenceCaption, ExecutionSectionTitle } from "./typography";

const DIGEST = "sha256:9f3c1a7b2e4d5c6f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1e2";

const ROWS: TerminalRow[] = [
  { ts: "10:44:02.114", phase: "PLAN", object: "cmd_9f12", message: "generated · expected revision 14 pinned · expires 60s", severity: "ok" },
  { ts: "10:44:02.480", phase: "APPLY", object: "op_1251", message: "202 accepted — not terminal success", severity: "warn" },
  { ts: "10:44:02.688", phase: "VERIFY", object: "sub-intent 1", message: "2/2 cancels ACKed by lifecycle", severity: "ok" },
  { ts: "10:44:09.301", phase: "VERIFY", object: "sub-intent 2", message: "1/2 closes filled · residue BTCUSDT 0.0100 (broker max-qty chunking)", severity: "warn" },
  { ts: "10:44:11.002", phase: "GAP", object: "stream", message: "sequence gap 4,412 → 4,415 · resnapshot scheduled", severity: "warn" },
];

function Demo({ layout }: { layout: ExecutionLayout }) {
  const [tab, setTab] = useState("overview");
  const [following, setFollowing] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const rail = (
    <ExecutionContextRail
      next={{
        title: "Next: Paper Exit Review",
        detail: "Observation gate met — 30/30 days · 312/300 trades · 2/2 cycles.",
        action: (
          <button type="button" className="exec-role-control exec-btn-apply" onClick={() => setCopied("exit")}>
            Request exit review
          </button>
        ),
      }}
      blockers={[
        { label: "slippage INSUFFICIENT_DATA (12 fills)", detail: "carries into sandbox certification", severity: "watch" },
        { label: "fee drag +0.006pt", detail: "WATCH · non-blocking", severity: "watch" },
      ]}
      freshness={<span className="exec-role-meta">EXECUTION · as_of 10:42:01Z · age 1.2s</span>}
      provenance={
        <ExecutionProvenanceDrawer
          items={[
            { label: "artifact", short: shortDigest(DIGEST), full: DIGEST },
            { label: "R1", short: "AP-101", href: "#" },
            { label: "R2", short: "AP-207", href: "#" },
            { label: "deployment", short: "dep_74" },
          ]}
          onCopy={(full) => setCopied(full)}
        />
      }
    />
  );

  return (
    <div data-anatomy-layout={layout}>
      <ExecutionWorkspace layout={layout} rail={layout === "sparse" ? undefined : rail}>
        <ExecutionPageHeader
          title="Carry v3.2"
          id="dep_74"
          badges={[
            { label: "PAPER_OBSERVATION", axis: "stage" },
            { label: "ACTIVE", axis: "runtime", tone: "good" },
            { label: "READY", axis: "readiness", tone: "good" },
          ]}
          purpose="Is this deployment tracking approved evidence, and is it ready to leave Paper?"
          primaryAction={
            <button type="button" className="exec-role-control exec-btn-apply" onClick={() => setCopied("exit")}>
              Request exit review
            </button>
          }
        />
        <ExecutionDecisionStrip
          metrics={[
            { label: "Equity", value: "51,842.18", unit: "USDT" },
            { label: "Net PnL (30d)", value: "+1,842.18", unit: "USDT", tone: "good" },
            { label: "Max drawdown", value: "−2.14%" },
            { label: "Allocation", value: "50,000.00", unit: "USDT" },
            { label: "Projection age", value: null, note: "as_of 10:42:01Z" },
          ]}
        />
        <ExecutionTabs
          tabs={[
            { key: "overview", label: "Overview" },
            { key: "positions", label: "Positions", count: 2 },
            { key: "orders", label: "Orders", count: 5 },
            { key: "evidence", label: "Evidence" },
          ]}
          active={tab}
          onChange={setTab}
          urlKey={layout === "balanced" ? "demo" : undefined}
        >
          {tab === "overview" ? (
            <div className="exec-role-body">
              <ExecutionSectionTitle>Equity vs approved evidence</ExecutionSectionTitle>
              <p>Chart body arrives in EL-V2-04. This panel exists to show the section role sitting under the title role.</p>
              <ExecutionEvidenceCaption summary="30d · 1h · USDT · equity_projection.v1 · 720/720 buckets">
                Joined to run_5512 by artifact digest. Approved band from research evidence; gaps stay gaps; no smoothing.
              </ExecutionEvidenceCaption>
            </div>
          ) : null}
          {tab === "positions" ? <p className="exec-role-body">2 positions — table lands with the Paper slice.</p> : null}
          {tab === "orders" ? <p className="exec-role-body">5 orders — cursor pagination, virtualized.</p> : null}
          {tab === "evidence" ? (
            <ExecutionTerminal
              title="Command verification"
              rows={ROWS}
              verdict="PARTIAL"
              source="command journal · op_1251"
              following={following}
              onToggleFollow={() => setFollowing((f) => !f)}
              onCopy={(text) => setCopied(text.slice(0, 24))}
              onExport={(rows) => setCopied(`export:${rows.length}`)}
              onClear={() => setCopied("cleared")}
              expanded={expanded}
              onToggleExpand={() => setExpanded((e) => !e)}
            />
          ) : null}
        </ExecutionTabs>
        {copied ? <p className="exec-role-meta" data-demo-last-action={copied}>last action: {copied.length > 40 ? `${copied.slice(0, 40)}…` : copied}</p> : null}
      </ExecutionWorkspace>
    </div>
  );
}

export function AnatomyDemo() {
  return (
    <div className="exec-fixtures-stack">
      <Demo layout="balanced" />
      <Demo layout="sparse" />
      <Demo layout="dense" />
    </div>
  );
}
