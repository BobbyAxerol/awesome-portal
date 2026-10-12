/**
 * Gate R1 — Research Evidence Review (HiFi 1a), on the V2 workspace anatomy.
 *
 * The question of the screen: is this artifact defensible enough to become a
 * Release Candidate? Everything that answers it is on the first screen; the
 * decision lives in a sticky bar that never leaves the viewport (EL-V2-05).
 *
 * Nothing here computes a verdict. Locks come from the checklist marks, the
 * separation-of-duty ids and the server's eligibility; the buttons only call
 * the verbs the backend publishes (approve / approve-with-condition / deny).
 * "Request changes" has no published verb and is therefore disabled with
 * its reason — BR-EX-36.
 */
import { useState, type ReactNode } from "react";
import type { ApprovalId, EvidenceMark, PanelStatus, Sla } from "../contracts";
import {
  ConditionComposer,
  ConditionList,
  EMPTY_DRAFT,
  type ConditionDraft,
  type TypedCondition,
} from "../components/conditions";
import { ExecutionDecisionBar } from "../components/decisionBar";
import { CheckStrip, GateAbsences, GateDecisionActions, GateStepper, GateVerdict, ProvenanceChain, type AbsenceItem } from "../components/gateFrame";

import { EmptyRecordFrame } from "../components/EmptyRecordFrame";
import { PanelState } from "../components/states";

export interface PassportEntry {
  label: string;
  value: string;
  verification?: string | null;
  note?: string | null;
}
export interface ChecklistItem {
  label: string;
  outcome: EvidenceMark;
  suggestion?: string | null;
  evidence?: { label: string; href?: string };
  /** §56: the Research source this finding rests on (`null` = none, with `refReason`); absent on historical responses. */
  ref?: { kind: "REPORT" | "RUN" | "FREEZE" | "AUDIT"; runId: string } | null;
  refReason?: string | null;
}

const REF_LABEL = { REPORT: "Report", RUN: "Run", FREEZE: "Freeze", AUDIT: "Audit" } as const;
const REF_TAIL = { REPORT: "report", RUN: "overview", FREEZE: "freeze", AUDIT: "audit" } as const;
const REF_REASON: Record<string, string> = {
  R1_FINDING_SOURCE_NOT_RECORDED: "the finding recorded no source",
  R1_FINDING_EVIDENCE_NOT_IN_MANIFEST: "its evidence is not in the verified manifest",
  R1_FINDING_MULTIPLE_EVIDENCE_SOURCES: "it rests on several sources, so none is linked",
  R1_EVIDENCE_SOURCE_NOT_LINKABLE: "its source is not a Research screen",
};
/** The run screen that proves a finding, keeping the approval's own workspace on the link. */
export function refHref(ref: NonNullable<ChecklistItem["ref"]>, workspaceId: string | null | undefined): string {
  const path = `/research/quantbt/runs/${encodeURIComponent(ref.runId)}/${REF_TAIL[ref.kind]}`;
  return workspaceId ? `${path}?workspace_id=${encodeURIComponent(workspaceId)}` : path;
}
/** HiFi "Selection & Known Limitations" — one row per statement, typed. */
export interface LimitationRow {
  kind: "lineage" | "warning" | "restriction" | "waiver";
  label: string;
  value: string;
  expires?: string | null;
}
export type DecisionLock = "SELF_APPROVAL" | "BLOCKING_FINDINGS" | "EXPIRED" | "NOT_ELIGIBLE";

const LOCK_REASON: Record<DecisionLock, string> = {
  SELF_APPROVAL: "Approve blocked — self-approval prohibited.",
  BLOCKING_FINDINGS: "Approve blocked — the checklist has blocking findings.",
  EXPIRED: "This request expired. It must be resubmitted rather than decided now.",
  NOT_ELIGIBLE: "You do not hold a role that can decide this gate.",
};
const DENY_BLOCKING_LOCKS: readonly DecisionLock[] = ["EXPIRED", "NOT_ELIGIBLE"];
const DENY_LOCK_REASON: Record<"EXPIRED" | "NOT_ELIGIBLE", string> = {
  EXPIRED: "Deny blocked — this request expired. There is nothing live to refuse.",
  NOT_ELIGIBLE: "Deny blocked — you do not hold a role that can decide this gate.",
};
/** The decision schema's floor: every verb, REQUEST_CHANGES included, needs a reason. */
export const REQUEST_CHANGES_NOTE_REASON =
  "Request changes needs a reason — write it in the reviewer note first (the decision schema requires one, min 8 characters).";
export const REQUEST_CHANGES_NO_CONDITION_REASON =
  "Request changes needs at least one remediation condition — attach it first (the decision schema requires one).";
export const REQUEST_CHANGES_DENIED_REASON =
  "Request changes — the server did not grant this verb for this actor.";



/**
 * PHASE 6 (round 2) · §3.5 — the two decision verbs were the only controls on
 * this bar without a reason. `Approve with condition` beside them already
 * carried one, so the bar taught the reader that a greyed button explains
 * itself, and then two of them did not.
 */
const DECISION_CLOSED = "The server did not grant this decision to you on this review, and published no reason for it.";

export function GateR1Review({
  approvalId,
  alphaLabel,
  releaseCandidate,
  quorumMet,
  quorumRequired,
  policyVersion,
  creator,
  actor,
  creatorId = null,
  actorId = null,
  sla,
  passport,
  /** Manifest entries that arrived unreadable — see below. */
  passportUnreadable = 0,
  checklist,
  limitations,
  locks = [],
  status = "ok",
  reason,
  partialReason,
  decided,
  eligibility,
  conditions,
  evidence,
  evidenceWorkspaceId = null,
  policyChip,
  note,
  onNoteChange,
  trail,
  onAttachCondition,
  decisionsBlockedReason = null,
  onApprove,
  onDeny,
  onRequestCondition,
  onRequestChanges,
  children,
}: {
  approvalId: ApprovalId;
  alphaLabel: string;
  releaseCandidate?: string;
  quorumMet: number;
  quorumRequired: number;
  policyVersion: string;
  creator: string;
  actor: string;
  creatorId?: string | null;
  actorId?: string | null;
  sla?: Sla;
  passport: readonly PassportEntry[];
  /**
   * How many manifest entries arrived and could not be read.
   *
   * Without it an empty `passport` drew a NAMED PANEL WITH NOTHING IN IT — no
   * rows, no state, no reason — on a populated screen, found on probe
   * 2026-09-11 against a real PENDING approval. "The source published no
   * passport" and "the source published one we could not parse" are different
   * claims and the reader could not tell which they were looking at.
   */
  passportUnreadable?: number;
  checklist: readonly ChecklistItem[];
  limitations?: readonly LimitationRow[] | null;
  locks?: readonly DecisionLock[];
  eligibility?: { canApprove: boolean; canApproveWithCondition: boolean; canDeny: boolean; canRequestChanges?: boolean };
  status?: PanelStatus;
  reason?: string;
  partialReason?: string;
  decided?: { outcome: "APPROVED" | "DENIED" | "APPROVED_WITH_CONDITION"; by: string; at: string } | null;
  conditions?: readonly TypedCondition[];
  /** Research evidence body (IS/OOS/holdout, WFO). Absent = not published. */
  evidence?: ReactNode;
  /** The approval's own workspace, kept on every source link so a Research screen reads the same record. */
  evidenceWorkspaceId?: string | null;
  policyChip?: string;
  /** Reviewer note — becomes the decision reason. */
  note?: string;
  onNoteChange?: (next: string) => void;
  /** DecisionTrail from the container while a decision is in flight. */
  trail?: ReactNode;
  onAttachCondition?: (condition: TypedCondition) => void;
  /** Set when the review published no workspace: a decision cannot be
   *  addressed, so every control is locked and says so rather than posting a
   *  request the server will refuse. */
  decisionsBlockedReason?: string | null;
  onApprove?: () => void;
  onDeny?: () => void;
  onRequestCondition: () => void;
  onRequestChanges?: () => void;
  /** Rendered above the decision dock: the next-step capture panel (R1 → R2 review). */
  children?: ReactNode;
  /** Kept for the container; the hi-fi page has no provenance drawer. */
  onCopyProvenance?: (full: string) => void;
}) {
  const [draft, setDraft] = useState<ConditionDraft>(EMPTY_DRAFT);
  if (status !== "ok" && status !== "partial" && status !== "stale") {
    return (
      <section className="exec-gate exec-gov" aria-label={`Gate R1 review ${approvalId}`} data-hifi-exact="gate-r1-1a">
        <div className="exec-gate-kicker">GATE R1 · Research Evidence Approval</div>
        <EmptyRecordFrame screen="gate-r1" status={status} reason={reason ?? "This review cannot be shown."} />
      </section>
    );
  }
  const selfApproval = Boolean(creatorId && actorId && creatorId === actorId);
  const blocking = checklist.filter((c) => c.outcome === "fail").length;
  const warnings = checklist.filter((c) => c.outcome === "watch").length;
  const insufficient = checklist.filter((c) => c.outcome === "insufficient").length;
  const effectiveLocks = Array.from(
    new Set<DecisionLock>([
      ...(selfApproval ? (["SELF_APPROVAL"] as DecisionLock[]) : []),
      ...(blocking > 0 ? (["BLOCKING_FINDINGS"] as DecisionLock[]) : []),
      ...locks,
    ]),
  );
  const isDecided = Boolean(decided);
  const locked = effectiveLocks.length > 0 || Boolean(decisionsBlockedReason);
  const denyLocks = effectiveLocks.filter((lock): lock is "EXPIRED" | "NOT_ELIGIBLE" =>
    (DENY_BLOCKING_LOCKS as readonly string[]).includes(lock),
  );
  const serverAllowsApprove = eligibility?.canApprove === true;
  const serverAllowsCondition = eligibility?.canApproveWithCondition === true;
  const serverAllowsDeny = eligibility?.canDeny === true;
  const serverAllowsRequestChanges = eligibility?.canRequestChanges === true;
  const noteReady = (note ?? "").trim().length >= 8;
  const closedByContext = Boolean(decisionsBlockedReason);
  const requestChangesLocked = !serverAllowsRequestChanges || !noteReady || !onRequestChanges || (conditions?.length ?? 0) === 0 || closedByContext;
  const approveLocked = locked || !serverAllowsApprove;
  const conditionLocked = locked || !serverAllowsCondition;
  const denyLocked = denyLocks.length > 0 || !serverAllowsDeny || closedByContext;


  /*
   * PHASE 6 (round 2) · verification pass — the tooltip must be about the verb
   * it sits on.
   *
   * `reasons` is the shared bar sentence and mixes both verbs, so Approve was
   * showing "Deny blocked — this request expired. There is nothing live to
   * refuse." A reviewer reading that on Approve learns the wrong thing about
   * why they cannot approve, which is worse than the bare tooltip it replaced.
   */
  const approveReasons = [...new Set([
    ...(decisionsBlockedReason ? [decisionsBlockedReason] : []),
    ...effectiveLocks.map((lock) => LOCK_REASON[lock]),
    ...(!serverAllowsApprove && effectiveLocks.length === 0
      ? ["Approve blocked — the server did not grant it for this actor."] : []),
  ])];
  const denyReasons = [...new Set([
    ...(decisionsBlockedReason ? [decisionsBlockedReason] : []),
    ...denyLocks.map((lock) => DENY_LOCK_REASON[lock]),
    // Only when nothing more specific was said: a lock already named the
    // cause, and repeating "Deny blocked" after it reads like a stutter.
    ...(!serverAllowsDeny && denyLocks.length === 0
      ? ["Deny blocked — the server did not grant it for this actor."] : []),
  ])];
  const reasons: string[] = [
    ...effectiveLocks.map((lock) => LOCK_REASON[lock]),
    ...denyLocks.map((lock) => DENY_LOCK_REASON[lock]),
  ];
  if (decisionsBlockedReason) reasons.unshift(decisionsBlockedReason);
  if (!serverAllowsApprove && !locked) reasons.push("Approve blocked — the server did not grant it for this actor.");
  if (!serverAllowsDeny && !denyLocks.length) reasons.push("Deny blocked — the server did not grant it for this actor.");

  const verdict = decided
    ? decided.outcome.replace(/_/g, " ")
    : approveLocked && conditionLocked
      ? "BLOCKED"
      : `PENDING ${quorumMet}/${quorumRequired}`;
  const verdictTone: "good" | "warn" | "bad" | "mute" = decided
    ? decided.outcome === "DENIED" ? "bad" : "good"
    : approveLocked && conditionLocked ? "bad" : "warn";
  const sodLine = selfApproval
    ? `separation-of-duty VIOLATION — you created this artifact (${actor})`
    : `separation-of-duty OK — creator (${creator}) ≠ you (${actor})`;
  const slaRemaining =
    sla && sla.budgetMinutes > 0 && sla.ageMinutes >= 0
      ? Math.max(0, Math.round((sla.budgetMinutes - sla.ageMinutes) / 60))
      : null;

  const absences: AbsenceItem[] = evidence
    ? []
    : [{ label: "evidence series", reason: "Evidence series are not published on governance.r1-review.v1 yet (BR-EX-67 evidence_series). The checklist verdicts above are the server's; the charts arrive with the field." }];

  return (
    <section className="exec-gate exec-gov" aria-label={`Gate R1 review ${approvalId}`} data-hifi-exact="gate-r1-1a">
      {/* Hi-fi 1a head: gate chip · question-title · pending chip · WF marker. */}
      <div className="exec-gov-head">
        <span className="exec-inbox-gate" data-gate="R1">GATE R1</span>
        <h1 className="exec-gov-h1">Research Evidence Approval <span className="exec-gov-dim">—</span> {alphaLabel}</h1>
        {status === "stale" ? <span className="exec-gov-chip" data-fill="bad">STALE</span> : null}
        {status === "partial" ? <span className="exec-gov-chip" data-fill="warn">PARTIAL</span> : null}
      </div>
      <GateStepper current="r1" done={releaseCandidate ? ["rc"] : []} />
      <div className="exec-gov-metaline">
        <span>request {approvalId}</span>
        {releaseCandidate ? <span>release candidate {releaseCandidate}</span> : null}
        <span>policy {policyVersion}</span>
      </div>
      <GateVerdict
        tone={decided ? (decided.outcome === "DENIED" ? "bad" : "good") : approveLocked && conditionLocked ? "bad" : warnings > 0 || insufficient > 0 ? "warn" : checklist.length === 0 ? "mute" : "good"}
        headline={
          decided
            ? `${decided.outcome.replace(/_/g, " ").toLowerCase()} — this gate is closed`
            : approveLocked && conditionLocked
              ? "You cannot approve this now — the reasons are beside the buttons"
              : checklist.length === 0
                ? "No checklist was published — nothing to weigh yet"
                : warnings > 0 || insufficient > 0
                  ? "Can be approved — the warnings suggest a condition"
                  : "No blocker — every check passed"
        }
        detail={decided ? `by ${decided.by} at ${decided.at}` : null}
        facts={[
          blocking > 0 ? <span data-tone="bad">{blocking} blocking</span> : null,
          warnings > 0 ? <span data-tone="warn">{warnings} warning{warnings === 1 ? "" : "s"}</span> : null,
          insufficient > 0 ? <span data-tone="warn">{insufficient} insufficient</span> : null,
          <span data-tone={selfApproval ? "bad" : "good"}>{sodLine}</span>,
          decided ? null : `your decision is 1 of ${quorumRequired} required (${quorumMet} so far)`,
          decided ? null : slaRemaining !== null ? `SLA ${slaRemaining}h remaining` : sla ? null : "SLA not published",
        ].filter((fact) => fact !== null)}
      >
        <CheckStrip checks={checklist.map((c) => ({ label: c.label, outcome: c.outcome }))} />
        <details className="exec-gf-details">
          <summary>Policy &amp; references</summary>
          <p className="exec-gov-meta">
            policy {policyVersion} · {policyChip ?? "gate policy reference not published · BR-EX-67"}{" "}
            <button type="button" className="exec-gov-reglink" disabled title="The policy registry route ships with BR-EX-67.">policy registry →</button>
          </p>
        </details>
      </GateVerdict>
      {selfApproval && !decided ? (
        <div className="exec-gate-banner exec-gate-blocking" role="status">
          <strong className="exec-gate-blocking-lead">Approve blocked — self-approval prohibited</strong>{" "}
          <span>
            Policy {policyVersion} requires the artifact creator to be excluded from its research approval. You may
            comment and request changes; another Quant Reviewer must decide.
          </span>
        </div>
      ) : null}
      {status === "partial" ? (
        <div className="exec-gate-banner" role="status">
          {partialReason ?? "Part of this review could not be read. What is shown below is real; do not treat the absence of a finding as a pass."}
        </div>
      ) : null}
      {status === "stale" ? (
        <div className="exec-gate-banner" role="status">
          {reason ?? "This review is older than its freshness budget. Refresh before deciding."}
        </div>
      ) : null}
      {decided ? (
        <div className="exec-gate-banner exec-gate-decided" role="status">
          {decided.outcome.replace(/_/g, " ")} by {decided.by} at {decided.at}. This gate is closed.
        </div>
      ) : null}
      <details className="exec-gov-panel exec-gf-details" data-passport>
        <summary className="exec-gov-panelhead">
          <span className="exec-gov-paneltitle">Artifact passport — immutable</span>
          <span className="exec-gov-meta">
            {passport.length > 0
              ? ` ${passport.filter((e) => e.verification).length} of ${passport.length} verified`
              : " none readable"}
          </span>
        </summary>
        {passport.length === 0 ? (
          <PanelState
            status={passportUnreadable > 0 ? "unavailable" : "empty"}
            reason={
              passportUnreadable > 0
                ? `${passportUnreadable} evidence manifest ${passportUnreadable === 1 ? "entry" : "entries"} arrived in a shape this reader could not parse, so no passport line can be shown. The entries exist; what is missing is our ability to read them.`
                : "No artifact passport was published for this approval, read from governance_approval_evidence."
            }
          />
        ) : null}
        {passport.length > 0 ? <ProvenanceChain nodes={passport.map((entry) => ({ label: entry.label, value: entry.value, verification: entry.verification, note: entry.note }))} /> : null}
      </details>
      <div className="exec-gov-grid2" data-ratio="1.15">
        <div className="exec-gov-panel">
          <div className="exec-gov-panelhead">
            <span className="exec-gov-paneltitle">Decision checklist</span>
          </div>
          <div className="exec-gate-checklines">
            {checklist.map((item) => (
              <span key={item.label} data-mark={item.outcome}>
                <b>{item.outcome === "pass" ? "✓" : item.outcome === "watch" ? "!" : item.outcome === "fail" ? "✕" : "…"}</b> {item.label}
                {item.suggestion ? <span className="exec-gate-note"> — {item.suggestion}</span> : null}
                {item.ref ? (
                  <a className="exec-gate-note" href={refHref(item.ref, evidenceWorkspaceId)} data-evidence-ref={item.ref.kind}> · {REF_LABEL[item.ref.kind]} · {item.ref.runId} ▸</a>
                ) : item.refReason ? (
                  <span className="exec-gate-note" data-evidence-ref-absent title={REF_REASON[item.refReason] ?? item.refReason}> · no source link</span>
                ) : null}
                {item.evidence ? (
                  item.evidence.href ? (
                    <a className="exec-gate-note" href={item.evidence.href}> · {item.evidence.label} ▸</a>
                  ) : (
                    <span className="exec-gate-note"> · {item.evidence.label}</span>
                  )
                ) : null}
              </span>
            ))}
            <span className="exec-gate-checkfoot">
              blocking items: <b>{blocking}</b> · warnings: <b data-tone="warn">{warnings}</b>
              {insufficient > 0 ? <> · insufficient: <b data-tone="warn">{insufficient}</b></> : null}
              {warnings > 0 ? " → suggested condition below" : null}
            </span>
          </div>
        </div>
        <div className="exec-gov-panel">
          <div className="exec-gov-panelhead"><span className="exec-gov-paneltitle">Known limitations &amp; proposed restrictions</span></div>
          {limitations?.length ? (
            <div className="exec-gate-checklines">
              {limitations.map((row) => (
                <span key={`${row.kind}:${row.label}`} data-kind={row.kind}>
                  {row.kind === "warning" ? <b data-tone="warn">!</b> : <b>{row.kind}:</b>} {row.label} — {row.value}
                  {row.expires ? <span className="exec-gate-note"> · expires {row.expires}</span> : null}
                </span>
              ))}
            </div>
          ) : (
            <PanelState status="empty" reason="No limitations, restrictions or waivers were published for this artifact. Absence is not a clean bill." />
          )}
        </div>
      </div>
      {evidence ?? null}
      <GateAbsences items={absences} />
      <div className="exec-gov-grid2">
        <div className="exec-gov-panel">
          <div className="exec-gov-panelhead"><span className="exec-gov-paneltitle">Decision — structured, immutable once submitted</span></div>
          <div className="exec-gate-decisionbody">
            <ConditionList conditions={conditions ?? []} emptyNote="No conditions attached yet." />
            {onAttachCondition && !isDecided ? (
              <details className="exec-gov-addcond">
                <summary>+ add condition</summary>
                <ConditionComposer
                draft={draft}
                onChange={setDraft}
                onAttach={(condition) => {
                  onAttachCondition(condition);
                  setDraft(EMPTY_DRAFT);
                }}
                disabled={conditionLocked}
                disabledReason="You cannot attach a condition to this decision."
              />
              </details>
            ) : null}
            <p className="exec-gov-meta">
              {releaseCandidate
                ? `approving creates a research_approval_id binding ${releaseCandidate} exactly — any code/param change afterwards invalidates it`
                : "approving creates a research_approval_id binding this candidate exactly — any code/param change afterwards invalidates it"}
            </p>
          </div>
        </div>
      </div>
      {children}
      <ExecutionDecisionBar
        label={`Gate R1 decision ${approvalId}`}
        verdict={verdict}
        tone={verdictTone}
        reasons={isDecided ? [] : reasons}
        note={onNoteChange && !isDecided ? { value: note ?? "", onChange: onNoteChange, disabled: approveLocked && conditionLocked && denyLocked } : undefined}
        footnote={<>your decision counts as 1 of {quorumRequired} required approvers · decision is recorded against policy {policyVersion} · conditions are typed objects with owner, deadline and expiry, never free text</>}
        trail={trail}
        actions={
          isDecided ? null : (
            <GateDecisionActions
              conditionCount={conditions?.length ?? 0}
              approve={{ label: "Approve", locked: approveLocked, title: approveLocked ? (approveReasons.join(" · ") || DECISION_CLOSED) : undefined, onClick: onApprove }}
              condition={{
                label: "Approve with condition",
                locked: conditionLocked || (conditions?.length ?? 0) === 0,
                title: (conditions?.length ?? 0) === 0 ? "Attach at least one condition first — this decision carries nothing without one" : undefined,
                onClick: onRequestCondition,
              }}
              deny={{ label: "Deny", locked: denyLocked, title: denyLocked ? (denyReasons.join(" · ") || DECISION_CLOSED) : undefined, onClick: onDeny }}
              requestChanges={{
                label: "Request changes",
                locked: requestChangesLocked,
                title: closedByContext ? decisionsBlockedReason ?? undefined
                  : !serverAllowsRequestChanges || !onRequestChanges ? REQUEST_CHANGES_DENIED_REASON
                    : !noteReady ? REQUEST_CHANGES_NOTE_REASON
                      : (conditions?.length ?? 0) === 0 ? REQUEST_CHANGES_NO_CONDITION_REASON : undefined,
                onClick: onRequestChanges,
              }}
            />
          )
        }
      />
    </section>
  );
}

/**
 * The hi-fi's two evidence charts, drawn from declared smoke until BR-EX-67
 * publishes `evidence_series` on `governance.r1-review.v1`. The checklist
 * marks above them are the server's; these frames are layout-true references.
 */
