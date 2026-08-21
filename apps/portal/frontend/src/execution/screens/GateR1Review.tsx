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
import { useState, type ReactNode } from "react";

import type { ApprovalId, EvidenceMark, PanelStatus, Sla } from "../contracts";
import { StatusChip } from "../components/badges";
import {
  ConditionComposer,
  ConditionList,
  EMPTY_DRAFT,
  type ConditionDraft,
  type TypedCondition,
} from "../components/conditions";
import { EvidencePanel, SlaCell, type EvidenceRow } from "../components/evidence";
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
  /** What produced the finding. DS §9 puts EvidencePanel on this screen, and
   *  its whole rule is that a verdict without a link is an opinion. */
  evidence?: { label: string; href?: string };
}

/**
 * Why a decision control is locked, in the order a reviewer should hear it.
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

/**
 * Which locks stop a **denial**, as opposed to an approval.
 *
 * Approve and Deny are not two buttons behind one condition, and the earlier
 * version of this screen was wrong to treat Deny as never locked.
 *
 * Self-denial is allowed. Refusing your own artifact is not the conflict of
 * interest that separation of duties exists to prevent — it is the safe
 * direction, and the person who knows the work best is often the one who should
 * withdraw it. Blocking findings do not stop a denial either; they are a reason
 * to deny, not a reason to be unable to.
 *
 * What does stop a denial is the request no longer being a decidable thing.
 * `EXPIRED` means there is nothing live to refuse and a denial recorded against
 * it would be a decision on a request that already lapsed. `NOT_ELIGIBLE` means
 * this actor cannot decide the gate in either direction. A closed gate is
 * handled separately: its controls are removed rather than disabled.
 */
const DENY_BLOCKING_LOCKS: readonly DecisionLock[] = ["EXPIRED", "NOT_ELIGIBLE"];

const DENY_LOCK_REASON: Record<"EXPIRED" | "NOT_ELIGIBLE", string> = {
  EXPIRED: "Deny blocked — this request expired. There is nothing live to refuse.",
  NOT_ELIGIBLE: "Deny blocked — you do not hold a role that can decide this gate.",
};

/**
 * The checklist is an `EvidencePanel`, not a bespoke list.
 *
 * DS §9 assigns EvidencePanel to R1, R2, exit reviews and Sandbox Cert. An
 * earlier build had the component and then wrote a private list here anyway,
 * which is how one rule — a verdict without a link is an opinion — ends up
 * enforced on one screen and forgotten on the next three.
 */
function asEvidenceRows(checklist: readonly ChecklistItem[]): EvidenceRow[] {
  return checklist.map((item) => ({
    label: item.label,
    mark: item.outcome,
    detail: item.suggestion ?? undefined,
    evidence: item.evidence ? { label: item.evidence.label, href: item.evidence.href } : undefined,
  }));
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
  partialReason,
  decided,
  eligibility,
  conditions,
  evidence,
  onAttachCondition,
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
  /**
   * The server's verdict on each control (`EX_BE_05A` §5). Authoritative in one
   * direction: it can withhold a control this screen would have allowed, but it
   * cannot grant one the screen's own checks refuse. A client whose derived
   * floor could be overridden from the wire would be a client whose safety
   * rules are advisory.
   */
  eligibility?: { canApprove: boolean; canApproveWithCondition: boolean; canDeny: boolean };
  status?: PanelStatus;
  reason?: string;
  /** What is missing when `partial`. The review still renders. */
  partialReason?: string;
  /**
   * Set once the gate has been decided. The screen becomes a record rather than
   * a form: every decision control goes, because offering Approve on something
   * already approved invites a second operation nobody asked for.
   */
  decided?: { outcome: "APPROVED" | "DENIED" | "APPROVED_WITH_CONDITION"; by: string; at: string } | null;
  /** Typed conditions attached to the decision (DS §4). */
  conditions?: readonly TypedCondition[];
  /** The equity-across-window-roles panel, or its state when absent. */
  evidence?: ReactNode;
  /** Attaching a condition is what makes "approve with condition" mean
   *  something (§2 "Must work": conditions attach to the decision object). */
  onAttachCondition?: (condition: TypedCondition) => void;
  onApprove?: () => void;
  onDeny?: () => void;
  onRequestCondition?: () => void;
}) {
  // `partial` and `stale` still render the review — a reviewer can read a
  // passport whose evidence chart timed out. The rest cannot be reasoned about
  // at all, so they replace the screen.
  if (status !== "ok" && status !== "partial" && status !== "stale") {
    return (
      <section className="exec-gate" aria-label={`Gate R1 review ${approvalId}`}>
        <div className="exec-gate-kicker">GATE R1 · Research Evidence Approval</div>
        <PanelState status={status} reason={reason ?? "This review cannot be shown."} />
      </section>
    );
  }

  const [draft, setDraft] = useState<ConditionDraft>(EMPTY_DRAFT);

  const selfApproval = creator === actor;
  // Derived rather than trusted from the caller: a screen that renders a clean
  // SoD line because a prop said so would be one bad prop away from permitting
  // the thing this screen exists to refuse.
  const effectiveLocks = selfApproval
    ? Array.from(new Set<DecisionLock>(["SELF_APPROVAL", ...locks]))
    : locks;

  // A decided gate is a record. Every control goes rather than being disabled:
  // a greyed Approve on an approved request reads as "not yet", which is the
  // opposite of what happened.
  const isDecided = Boolean(decided);
  const blocking = checklist.filter((c) => c.outcome === "fail").length;
  const warnings = checklist.filter((c) => c.outcome === "watch").length;
  const insufficient = checklist.filter((c) => c.outcome === "insufficient").length;
  const locked = effectiveLocks.length > 0;

  // Deny is gated by a strictly smaller set. Self-approval and blocking
  // findings are reasons to refuse, not reasons to be unable to.
  const denyLocks = effectiveLocks.filter((lock): lock is "EXPIRED" | "NOT_ELIGIBLE" =>
    (DENY_BLOCKING_LOCKS as readonly string[]).includes(lock),
  );
  // Server first, local floor second. Both must allow it.
  const serverAllowsApprove = eligibility ? eligibility.canApprove : true;
  const serverAllowsCondition = eligibility ? eligibility.canApproveWithCondition : true;
  const serverAllowsDeny = eligibility ? eligibility.canDeny : true;
  const approveLocked = locked || !serverAllowsApprove;
  const conditionLocked = locked || !serverAllowsCondition;
  const denyLocked = denyLocks.length > 0 || !serverAllowsDeny;

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

      {status === "partial" ? (
        <div className="exec-gate-banner">
          {partialReason ?? "Part of this review could not be read. What is shown below is real; do not treat the absence of a finding as a pass."}
        </div>
      ) : null}

      {status === "stale" ? (
        <div className="exec-gate-banner">
          {reason ?? "This review is older than its freshness budget. Refresh before deciding."}
        </div>
      ) : null}

      {decided ? (
        <div className="exec-gate-banner exec-gate-decided">
          {decided.outcome.replace(/_/g, " ")} by {decided.by} at {decided.at}. This gate is closed.
        </div>
      ) : null}

      <div className="exec-grid-2" data-ratio="1.15">
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
        <EvidencePanel rows={asEvidenceRows(checklist)} />
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
      </div>

      {evidence ? <div className="exec-gate-panel">{evidence}</div> : null}

      <div className="exec-gate-panel">
        <div className="exec-tile-title">Conditions</div>
        <ConditionList
          conditions={conditions ?? []}
          emptyNote="No conditions attached yet."
        />
        {onAttachCondition ? (
          <ConditionComposer
            draft={draft}
            onChange={setDraft}
            onAttach={(condition) => {
              onAttachCondition(condition);
              setDraft(EMPTY_DRAFT);
            }}
            // A composer for a decision this actor cannot make is a form that
            // wastes their time, so it follows the condition control exactly.
            disabled={conditionLocked}
            disabledReason="You cannot attach a condition to this decision."
          />
        ) : null}
      </div>

      {isDecided ? null : (
        <div className="exec-gate-decision">
          <button type="button" className="exec-btn-apply" disabled={approveLocked} onClick={onApprove}>
            Approve
          </button>
          <button
            type="button"
            className="exec-btn-ghost"
            disabled={conditionLocked}
            onClick={onRequestCondition}
          >
            Approve with condition
          </button>
          {/* Deny survives the locks that stop Approve — including
              self-approval, because withdrawing your own artifact is the safe
              direction. It does not survive the request ceasing to be
              decidable. */}
          <button type="button" className="exec-btn-ghost" disabled={denyLocked} onClick={onDeny}>
            Deny
          </button>
        </div>
      )}

      {(locked || !serverAllowsApprove || !serverAllowsDeny) && !isDecided ? (
        <div className="exec-disabled-reason">
          {effectiveLocks.map((lock) => LOCK_REASON[lock]).join(" ")}
          {denyLocks.length ? ` ${denyLocks.map((lock) => DENY_LOCK_REASON[lock]).join(" ")}` : null}
          {eligibility && !serverAllowsApprove && !locked
            ? " Approve blocked — the server did not grant it for this actor."
            : null}
          {eligibility && !serverAllowsDeny && !denyLocks.length
            ? " Deny blocked — the server did not grant it for this actor."
            : null}
        </div>
      ) : null}
    </section>
  );
}
