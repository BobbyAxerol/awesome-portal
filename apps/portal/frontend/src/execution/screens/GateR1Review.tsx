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
import { Fragment, useState, type ReactNode } from "react";
import type { ApprovalId, EvidenceMark, PanelStatus, Sla } from "../contracts";
import {
  ConditionComposer,
  ConditionList,
  EMPTY_DRAFT,
  type ConditionDraft,
  type TypedCondition,
} from "../components/conditions";
import { ExecutionDecisionBar } from "../components/decisionBar";
import { BarsChart, LinesChart } from "../components/marketChart";
import { GOV_CHARTS } from "../governance.smoke";

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
export const REQUEST_CHANGES_DENIED_REASON =
  "Request changes — the server did not grant this verb for this actor.";



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
  note,
  onNoteChange,
  trail,
  onAttachCondition,
  onApprove,
  onDeny,
  onRequestCondition,
  onRequestChanges,
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
  /** Reviewer note — becomes the decision reason. */
  note?: string;
  onNoteChange?: (next: string) => void;
  /** DecisionTrail from the container while a decision is in flight. */
  trail?: ReactNode;
  onAttachCondition?: (condition: TypedCondition) => void;
  onApprove?: () => void;
  onDeny?: () => void;
  onRequestCondition: () => void;
  onRequestChanges?: () => void;
  /** Kept for the container; the hi-fi page has no provenance drawer. */
  onCopyProvenance?: (full: string) => void;
}) {
  const [draft, setDraft] = useState<ConditionDraft>(EMPTY_DRAFT);
  if (status !== "ok" && status !== "partial" && status !== "stale") {
    return (
      <section className="exec-gate exec-gov" aria-label={`Gate R1 review ${approvalId}`} data-hifi-exact="gate-r1-1a">
        <div className="exec-gate-kicker">GATE R1 · Research Evidence Approval</div>
        <PanelState status={status} reason={reason ?? "This review cannot be shown."} />
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
  const locked = effectiveLocks.length > 0;
  const denyLocks = effectiveLocks.filter((lock): lock is "EXPIRED" | "NOT_ELIGIBLE" =>
    (DENY_BLOCKING_LOCKS as readonly string[]).includes(lock),
  );
  const serverAllowsApprove = eligibility?.canApprove === true;
  const serverAllowsCondition = eligibility?.canApproveWithCondition === true;
  const serverAllowsDeny = eligibility?.canDeny === true;
  const serverAllowsRequestChanges = eligibility?.canRequestChanges === true;
  const noteReady = (note ?? "").trim().length >= 8;
  const requestChangesLocked = !serverAllowsRequestChanges || !noteReady || !onRequestChanges;
  const approveLocked = locked || !serverAllowsApprove;
  const conditionLocked = locked || !serverAllowsCondition;
  const denyLocked = denyLocks.length > 0 || !serverAllowsDeny;

  const reasons: string[] = [
    ...effectiveLocks.map((lock) => LOCK_REASON[lock]),
    ...denyLocks.map((lock) => DENY_LOCK_REASON[lock]),
  ];
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

  return (
    <section className="exec-gate exec-gov" aria-label={`Gate R1 review ${approvalId}`} data-hifi-exact="gate-r1-1a">
      {/* Hi-fi 1a head: gate chip · question-title · pending chip · WF marker. */}
      <div className="exec-gov-head">
        <span className="exec-inbox-gate" data-gate="R1">GATE R1</span>
        <h1 className="exec-gov-h1">Research Evidence Approval <span className="exec-gov-dim">—</span> {alphaLabel}</h1>
        <span className="exec-gov-chip" data-fill={decided ? (decided.outcome === "DENIED" ? "bad" : "good") : "warn"}>
          {decided ? decided.outcome.replace(/_/g, " ") : `PENDING ${quorumMet}/${quorumRequired}`}
        </span>
        {status === "stale" ? <span className="exec-gov-chip" data-fill="bad">STALE</span> : null}
        {status === "partial" ? <span className="exec-gov-chip" data-fill="warn">PARTIAL</span> : null}
        <span className="exec-gov-wf">WF 1a</span>
      </div>
      <div className="exec-gov-metaline">
        <span>request {approvalId}</span>
        {releaseCandidate ? <span>release candidate {releaseCandidate}</span> : null}
        <span>policy {policyVersion}</span>
        <span data-tone={selfApproval ? "bad" : "good"}>{sodLine}</span>
        <span className="exec-gov-spacer" />
        <span className="exec-gov-meta">
          quant reviewer decision{slaRemaining !== null ? ` · SLA ${slaRemaining}h remaining` : sla ? "" : " · SLA not published"}
        </span>
      </div>
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
      <div className="exec-gov-grid2" data-ratio="1.15">
        <div className="exec-gov-panel">
          <div className="exec-gov-panelhead"><span className="exec-gov-paneltitle">Artifact passport — immutable</span></div>
          <div className="exec-gov-kv">
            {passport.map((entry) => (
              <Fragment key={entry.label}>
                <span className="exec-gov-k">{entry.label}</span>
                <span className="exec-gov-v">
                  {entry.value}
                  {entry.note ? <span className="exec-gate-note"> {entry.note}</span> : null}{" "}
                  {entry.verification ? (
                    <span className="exec-gov-verified">{entry.verification}</span>
                  ) : (
                    <span className="exec-gate-unverified">not verified</span>
                  )}
                </span>
              </Fragment>
            ))}
          </div>
        </div>
        <div className="exec-gov-panel">
          <div className="exec-gov-panelhead">
            <span className="exec-gov-paneltitle">Decision checklist</span>
            {/* SMOKE until BR-EX-67 publishes the gate-policy reference. */}
            <span className="exec-gate-policychip" title="SMOKE — the versioned gate policy reference ships with BR-EX-67">{GOV_CHARTS.r1Policy}</span>
            <span className="exec-gov-spacer" />
            <button type="button" className="exec-gov-reglink" disabled title="The policy registry route ships with BR-EX-67.">policy registry →</button>
          </div>
          <div className="exec-gate-checklines">
            {checklist.map((item) => (
              <span key={item.label} data-mark={item.outcome}>
                <b>{item.outcome === "pass" ? "✓" : item.outcome === "watch" ? "!" : item.outcome === "fail" ? "✕" : "…"}</b> {item.label}
                {item.suggestion ? <span className="exec-gate-note"> — {item.suggestion}</span> : null}
              </span>
            ))}
            <span className="exec-gate-checkfoot">
              blocking items: <b>{blocking}</b> · warnings: <b data-tone="warn">{warnings}</b>
              {insufficient > 0 ? <> · insufficient: <b data-tone="warn">{insufficient}</b></> : null}
              {warnings > 0 ? " → suggested condition below" : null}
            </span>
          </div>
        </div>
      </div>
      {evidence ?? <R1EvidenceSmoke />}
      <div className="exec-gov-grid2">
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
            <>
              <button
                type="button"
                className="exec-role-control exec-btn-ghost"
                disabled={requestChangesLocked}
                title={
                  !serverAllowsRequestChanges || !onRequestChanges
                    ? REQUEST_CHANGES_DENIED_REASON
                    : !noteReady
                      ? REQUEST_CHANGES_NOTE_REASON
                      : undefined
                }
                onClick={onRequestChanges}
              >
                Request changes
              </button>
              <button type="button" className="exec-role-control exec-btn-ghost" disabled={denyLocked} onClick={onDeny}>
                Deny
              </button>
              <button
                type="button"
                className="exec-role-control exec-btn-ghost"
                disabled={conditionLocked || (conditions?.length ?? 0) === 0}
                title={(conditions?.length ?? 0) === 0 ? "Attach at least one condition first — this decision carries nothing without one" : undefined}
                onClick={onRequestCondition}
              >
                Approve with condition
              </button>
              <button type="button" className="exec-role-control exec-btn-apply" disabled={approveLocked} onClick={onApprove}>
                Approve
              </button>
            </>
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
export function R1EvidenceSmoke() {
  return (
    <div className="exec-grid-2" data-ratio="1.5">
      <section className="exec-chart-tile" aria-label="Equity across window roles">
        <h3 className="exec-section-title">Equity across window roles</h3>
        <p className="exec-gate-rolelegend" aria-hidden="true"><span data-tone="mute">— IS</span><span data-tone="accent">— Outer OOS</span><span data-tone="warn">— holdout</span></p>
        <LinesChart
          height={230}
          series={GOV_CHARTS.r1Equity.series}
          verticalLines={GOV_CHARTS.r1Equity.boundaries}
          annotation={GOV_CHARTS.r1Equity.maxDd}
          yFormatter={(v) => v.toFixed(1)}
          provenance={{ authority: "RESEARCH", asOf: "run_5512", formula: "window roles fixed by claim clm_31" }}
          ariaLabel="Equity across in-sample, outer out-of-sample and holdout windows"
        />
        <p className="exec-af-smoke">! SMOKE DATA — {GOV_CHARTS.r1Equity.foot} · reference shape for BR-EX-67 evidence_series. Delete when BR-EX-67 ships</p>
      </section>
      <section className="exec-chart-tile" aria-label="WFO stability — Sharpe per fold">
        <h3 className="exec-section-title">WFO stability — Sharpe per fold</h3>
        <BarsChart
          height={230}
          points={GOV_CHARTS.wfo.folds}
          thresholdLine={{ y: GOV_CHARTS.wfo.threshold, label: `threshold ${GOV_CHARTS.wfo.threshold.toFixed(1)}`, tone: "mute" }}
          highlight={{ index: GOV_CHARTS.wfo.worst.index, label: GOV_CHARTS.wfo.worst.label, tone: "warn" }}
          yFormatter={(v) => v.toFixed(2)}
          provenance={{ authority: "RESEARCH", asOf: "run_5512", formula: "wfo_stability.v1" }}
          ariaLabel="Walk-forward Sharpe per fold against the stability threshold"
        />
        <p className="exec-af-smoke">! SMOKE DATA — {GOV_CHARTS.wfo.foot} · reference shape for BR-EX-67 evidence_series. Delete when BR-EX-67 ships</p>
      </section>
    </div>
  );
}
