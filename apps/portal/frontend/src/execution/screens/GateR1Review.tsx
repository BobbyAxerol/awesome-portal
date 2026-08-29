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
import { BarsChart, LinesChart } from "../components/marketChart";
import { GOV_CHARTS } from "../governance.smoke";
import { EvidencePanel, SlaCell, type EvidenceRow } from "../components/evidence";
import { PanelState } from "../components/states";
import { ExecutionSectionTitle } from "../components/typography";
import {
  ExecutionContextRail,
  ExecutionDecisionStrip,
  ExecutionPageHeader,
  ExecutionProvenanceDrawer,
  ExecutionTabs,
  ExecutionWorkspace,
  shortDigest,
  type HeaderBadge,
  type RailBlocker,
} from "../components/workspace";

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

const R1_TABS = ["Checklist", "Passport", "Evidence", "Limitations", "Conditions"] as const;
type R1Tab = (typeof R1_TABS)[number];

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
  onCopyProvenance,
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
  onCopyProvenance: (full: string) => void;
}) {
  const [draft, setDraft] = useState<ConditionDraft>(EMPTY_DRAFT);
  const [tab, setTab] = useState<R1Tab>("Checklist");
  if (status !== "ok" && status !== "partial" && status !== "stale") {
    return (
      <section className="exec-gate" aria-label={`Gate R1 review ${approvalId}`}>
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

  const badges: HeaderBadge[] = [
    { label: "GATE R1", axis: "stage" },
    { label: `PENDING ${quorumMet}/${quorumRequired}`, axis: "readiness", tone: quorumMet >= quorumRequired ? "good" : "mute" },
    { label: selfApproval ? "SoD VIOLATION" : "SoD OK", axis: "other", tone: selfApproval ? "bad" : "good" },
    ...(status === "stale" ? [{ label: "STALE", axis: "broker-sync", tone: "bad" } as HeaderBadge] : []),
    ...(status === "partial" ? [{ label: "PARTIAL", axis: "broker-sync", tone: "warn" } as HeaderBadge] : []),
  ];
  const blockers: RailBlocker[] = [
    ...checklist
      .filter((c) => c.outcome !== "pass")
      .map((c) => ({
        label: c.label,
        detail: c.suggestion ?? (c.outcome === "fail" ? "blocking finding" : c.outcome === "watch" ? "warning · non-blocking" : "insufficient evidence"),
        severity: c.outcome === "fail" ? ("blocking" as const) : ("watch" as const),
      })),
    // Lock names only — the sentence lives once, in the decision bar.
    ...effectiveLocks.map((lock) => ({ label: `lock · ${lock.replace(/_/g, " ")}`, detail: null, severity: "blocking" as const })),
  ];
  const provenanceItems = [
    ...passport.map((entry) => {
      const isDigest = entry.value.startsWith("sha256:");
      return { label: entry.label, short: isDigest ? shortDigest(entry.value) : entry.value, full: isDigest ? entry.value : null };
    }),
    { label: "policy", short: policyVersion, full: null },
  ];
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

  const rail = (
    <ExecutionContextRail
      next={{
        title: decided ? "Decided" : approveLocked && conditionLocked ? "Approve blocked" : "Ready to decide",
        detail: (
          <span className="exec-role-body" data-violation={selfApproval ? "true" : undefined}>
            {sodLine}
          </span>
        ),
      }}
      blockers={blockers}
      freshness={
        <span className="exec-role-meta">
          {sla ? <SlaCell sla={sla} /> : "SLA not published"} · policy {policyVersion}
        </span>
      }
      provenance={<ExecutionProvenanceDrawer items={provenanceItems} onCopy={onCopyProvenance} />}
    />
  );

  return (
    <section className="exec-gate" aria-label={`Gate R1 review ${approvalId}`}>
      <ExecutionWorkspace layout="balanced" rail={rail}>
        <ExecutionPageHeader
          title={
            <>
              {alphaLabel}
              {releaseCandidate ? <span className="exec-gate-rc"> · {releaseCandidate}</span> : null}
            </>
          }
          id={approvalId}
          badges={badges}
          purpose="Is this artifact defensible enough to become a Release Candidate?"
          secondary={sla ? <SlaCell sla={sla} /> : undefined}
        />
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
        <ExecutionDecisionStrip
          metrics={[
            { label: "Blocking items", value: String(blocking), tone: blocking > 0 ? "bad" : "good" },
            { label: "Warnings", value: String(warnings), tone: warnings > 0 ? "warn" : undefined },
            { label: "Insufficient evidence", value: String(insufficient), tone: insufficient > 0 ? "warn" : undefined },
            { label: "Quorum", value: `${quorumMet}/${quorumRequired}` },
            { label: "Conditions", value: String(conditions?.length ?? 0) },
          ]}
        />
        <ExecutionTabs
          tabs={[
            { key: "Checklist", label: "Checklist", count: checklist.length },
            { key: "Passport", label: "Passport", count: passport.length },
            { key: "Evidence", label: "Evidence" },
            { key: "Limitations", label: "Limitations", count: limitations?.length ?? null },
            { key: "Conditions", label: "Conditions", count: conditions?.length ?? 0 },
          ]}
          active={tab}
          onChange={(key) => setTab(key as R1Tab)}
          label="Gate R1 sections"
        >
          {tab === "Checklist" ? (
            <div className="exec-gate-panel">
              <div className="exec-gate-panelhead">
                <ExecutionSectionTitle>Decision checklist — policy {policyVersion}</ExecutionSectionTitle>
                {/* SMOKE until BR-EX-67 publishes the gate-policy reference. */}
                <span className="exec-gate-policychip" title="SMOKE — the versioned gate policy reference ships with BR-EX-67">{GOV_CHARTS.r1Policy}</span>
              </div>
              <EvidencePanel rows={asEvidenceRows(checklist)} />
            </div>
          ) : null}
          {tab === "Passport" ? (
            <div className="exec-gate-panel">
              <ExecutionSectionTitle>Artifact passport — immutable</ExecutionSectionTitle>
              <div className="exec-scroll-x">
                <table className="exec-360-sync exec-gate-passport-table">
                  <thead>
                    <tr>
                      <th scope="col">field</th>
                      <th scope="col">value</th>
                      <th scope="col">verification</th>
                    </tr>
                  </thead>
                  <tbody>
                    {passport.map((entry) => (
                      <tr key={entry.label}>
                        <th scope="row">{entry.label}</th>
                        <td className="exec-num">
                          {entry.value}
                          {entry.note ? <span className="exec-gate-note"> {entry.note}</span> : null}
                        </td>
                        <td>
                          {entry.verification ? (
                            <span className="exec-gate-verified">{entry.verification}</span>
                          ) : (
                            <span className="exec-gate-unverified">not verified</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
          {tab === "Evidence" ? (
            <div className="exec-gate-panel">
              <ExecutionSectionTitle>Evidence — IS / OOS / holdout equity · WFO stability</ExecutionSectionTitle>
              {evidence ?? <R1EvidenceSmoke />}
            </div>
          ) : null}
          {tab === "Limitations" ? (
            <div className="exec-gate-panel">
              <ExecutionSectionTitle>Selection &amp; known limitations</ExecutionSectionTitle>
              {limitations?.length ? (
                <div className="exec-scroll-x">
                  <table className="exec-360-sync exec-limitations">
                    <thead>
                      <tr>
                        <th scope="col">kind</th>
                        <th scope="col">item</th>
                        <th scope="col">statement</th>
                        <th scope="col">expires</th>
                      </tr>
                    </thead>
                    <tbody>
                      {limitations.map((row) => (
                        <tr key={`${row.kind}:${row.label}`} data-kind={row.kind}>
                          <th scope="row">{row.kind}</th>
                          <td>{row.label}</td>
                          <td>{row.value}</td>
                          <td className="exec-num">{row.expires ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <PanelState status="empty" reason="No limitations, restrictions or waivers were published for this artifact. Absence is not a clean bill." />
              )}
            </div>
          ) : null}
          {tab === "Conditions" ? (
            <div className="exec-gate-panel">
              <ExecutionSectionTitle>Conditions</ExecutionSectionTitle>
              <ConditionList conditions={conditions ?? []} emptyNote="No conditions attached yet." />
              {onAttachCondition ? (
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
              ) : null}
            </div>
          ) : null}
        </ExecutionTabs>
        <ExecutionDecisionBar
          label={`Gate R1 decision ${approvalId}`}
          verdict={verdict}
          tone={verdictTone}
          reasons={isDecided ? [] : reasons}
          note={onNoteChange && !isDecided ? { value: note ?? "", onChange: onNoteChange, disabled: approveLocked && conditionLocked && denyLocked } : undefined}
          footnote={<>decision is recorded against policy {policyVersion} · conditions are typed objects with owner, deadline and expiry, never free text</>}
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
      </ExecutionWorkspace>
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
