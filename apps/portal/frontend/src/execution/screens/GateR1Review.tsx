/**
 * Phase 2 — Gate R1 Review (hi-fi 1a), UI states only.
 *
 * Lane A, same as the inbox: props and fixtures, real integration on
 * `EX-BE-05a`. The decision itself is a Portal-owned workflow record, so this
 * screen never needs the Trading System.
 *
 * The screen exists to make one refusal impossible to work around: an approver
 * cannot approve their own artifact. Separation of duties is not a warning here,
 * it is a locked decision bar with the reason printed next to it — spec §5.1
 * treats a bypass as an explicit audited owner-only action, never something a
 * reviewer can talk themselves into.
 *
 * The second thing it gets right is the difference between a blocking finding
 * and a warning. The hi-fi's checklist has both, and "capacity evidence limited"
 * is deliberately not a blocker. Collapsing them into one list of problems would
 * either stop a legitimate approval or wave through a real one.
 */
import type { ReactNode } from "react";

import type { ApprovalId, EvidenceMark, PanelStatus, Sla } from "../contracts";
import { StatusChip } from "../components/badges";
import { SlaCell } from "../components/evidence";
import { PanelState } from "../components/states";

/** One line of the artifact passport. Immutable, hash-addressed where possible. */
export interface PassportEntry {
  label: string;
  value: string;
  /** `✓ verified`, `✓ reproduced`, `PASS` — a claim the server checked. */
  verification?: string | null;
  /** Extra identity: `· supersedes av_1988`. */
  note?: string | null;
}

export interface ChecklistItem {
  label: string;
  outcome: EvidenceMark;
  /** Shown under a `watch` item: what a reviewer could do about it. */
  suggestion?: string | null;
}

/**
 * Why the decision bar is locked, in the order a reviewer should hear it.
 *
 * `SELF_APPROVAL` first because it is the one no amount of evidence fixes.
 */
export type DecisionLock = "SELF_APPROVAL" | "BLOCKING_FINDINGS" | "EXPIRED" | "NOT_ELIGIBLE";

const LOCK_REASON: Record<DecisionLock, string> = {
  SELF_APPROVAL: "Approve blocked — self-approval prohibited.",
  BLOCKING_FINDINGS: "Approve blocked — the checklist has blocking findings.",
  EXPIRED: "This request expired. It must be resubmitted rather than decided now.",
  NOT_ELIGIBLE: "You do not hold a role that can decide this gate.",
};

function markChip(outcome: EvidenceMark): ReactNode {
  const tone = outcome === "pass" ? "good" : outcome === "fail" ? "bad" : outcome === "watch" ? "warn" : "mute";
  const label = outcome === "insufficient" ? "INSUFFICIENT" : outcome.toUpperCase();
  return <StatusChip label={label} tone={tone} />;
}

export function GateR1Review({
  approvalId,
  alphaLabel,
  releaseCandidate,
  quorumMet,
  quorumRequired,
  policyVersion,
  creator,
  actor,
  sla,
  passport,
  checklist,
  locks = [],
  status = "ok",
  reason,
  evidence,
  onApprove,
  onDeny,
  onRequestCondition,
}: {
  approvalId: ApprovalId;
  /** `RSI v1.7` */
  alphaLabel: string;
  /** `RC-41` */
  releaseCandidate?: string;
  quorumMet: number;
  quorumRequired: number;
  policyVersion: string;
  /** Who produced the artifact. Compared against `actor` for the SoD line. */
  creator: string;
  actor: string;
  sla?: Sla;
  passport: readonly PassportEntry[];
  checklist: readonly ChecklistItem[];
  /** Every reason the decision bar is locked, not only the first. */
  locks?: readonly DecisionLock[];
  status?: PanelStatus;
  reason?: string;
  /** The equity-across-window-roles panel, or its state when absent. */
  evidence?: ReactNode;
  onApprove?: () => void;
  onDeny?: () => void;
  onRequestCondition?: () => void;
}) {
  if (status !== "ok") {
    return (
      <section className="exec-gate" aria-label={`Gate R1 review ${approvalId}`}>
        <PanelState status={status} reason={reason ?? "This review cannot be shown."} />
      </section>
    );
  }

  const selfApproval = creator === actor;
  // Derived rather than trusted from the caller: a screen that renders a clean
  // SoD line because a prop said so would be one bad prop away from permitting
  // the thing this screen exists to refuse.
  const effectiveLocks = selfApproval
    ? Array.from(new Set<DecisionLock>(["SELF_APPROVAL", ...locks]))
    : locks;

  const blocking = checklist.filter((c) => c.outcome === "fail").length;
  const warnings = checklist.filter((c) => c.outcome === "watch").length;
  const insufficient = checklist.filter((c) => c.outcome === "insufficient").length;
  const locked = effectiveLocks.length > 0;

  return (
    <section className="exec-gate" aria-label={`Gate R1 review ${approvalId}`}>
      <header className="exec-gate-head">
        <div className="exec-gate-kicker">GATE R1 · Research Evidence Approval</div>
        <div className="exec-tile-title">
          {alphaLabel}
          {releaseCandidate ? <span className="exec-gate-rc"> · {releaseCandidate}</span> : null}
        </div>
        <div className="exec-gate-meta">
          <StatusChip
            label={`PENDING ${quorumMet}/${quorumRequired}`}
            tone={quorumMet >= quorumRequired ? "good" : "mute"}
          />
          <span>{approvalId}</span>
          <span>policy {policyVersion}</span>
          {sla ? <SlaCell sla={sla} /> : null}
        </div>

        <div className="exec-gate-sod" data-violation={selfApproval ? "true" : undefined}>
          {selfApproval
            ? `separation-of-duty VIOLATION — you created this artifact (${actor})`
            : `separation-of-duty OK — creator (${creator}) ≠ you (${actor})`}
        </div>
      </header>

      <div className="exec-gate-panel">
        <div className="exec-tile-title">Artifact passport — immutable</div>
        <dl className="exec-gate-passport">
          {passport.map((entry) => (
            <div key={entry.label}>
              <dt>{entry.label}</dt>
              <dd>
                <span className="exec-gate-value">{entry.value}</span>
                {entry.note ? <span className="exec-gate-note"> {entry.note}</span> : null}
                {entry.verification ? (
                  <span className="exec-gate-verified"> {entry.verification}</span>
                ) : (
                  // A passport line whose claim was not checked is a stated gap.
                  // Leaving it blank would read as checked-and-fine.
                  <span className="exec-gate-unverified"> not verified</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="exec-gate-panel">
        <div className="exec-tile-title">Decision checklist — policy {policyVersion}</div>
        <ul className="exec-gate-checklist">
          {checklist.map((item) => (
            <li key={item.label} data-outcome={item.outcome}>
              {markChip(item.outcome)} <span>{item.label}</span>
              {item.suggestion ? (
                <span className="exec-gate-suggestion"> → {item.suggestion}</span>
              ) : null}
            </li>
          ))}
        </ul>
        {/* Counted separately because they mean different things. A warning that
            gets counted as a blocker stops a legitimate approval; a blocker
            counted as a warning waves a real one through. */}
        <div className="exec-gate-tally">
          blocking items: <strong>{blocking}</strong> · warnings: <strong>{warnings}</strong>
          {insufficient > 0 ? (
            <>
              {" "}
              · insufficient evidence: <strong>{insufficient}</strong>
            </>
          ) : null}
        </div>
      </div>

      {evidence ? <div className="exec-gate-panel">{evidence}</div> : null}

      <div className="exec-gate-decision">
        <button type="button" className="exec-btn-apply" disabled={locked} onClick={onApprove}>
          Approve
        </button>
        <button type="button" className="exec-btn-ghost" onClick={onRequestCondition}>
          Approve with condition
        </button>
        {/* Deny is never locked. A reviewer who cannot approve can always
            refuse, and blocking that would leave a bad request sitting in the
            queue with nobody able to clear it. */}
        <button type="button" className="exec-btn-ghost" onClick={onDeny}>
          Deny
        </button>
      </div>

      {locked ? (
        <div className="exec-disabled-reason">
          {effectiveLocks.map((lock) => LOCK_REASON[lock]).join(" ")}
        </div>
      ) : null}
    </section>
  );
}
