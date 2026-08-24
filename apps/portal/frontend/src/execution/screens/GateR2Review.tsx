/**
 * Gate R2 — Portfolio & Operational Readiness (HiFi 1b), on the V2 anatomy.
 *
 * The question: is it safe to authorize Paper activation? R2 rests on a valid
 * R1; every lock is named, the capital preview is a preview (one PREVIEW
 * chip, elevation — never a theme change), and the decision sits in the sticky
 * bar. Approve grants an authorization only; activation is a separate admin
 * plan/apply — that sentence stays in the bar because it prevents a dangerous
 * misreading.
 */
import { useState, type ReactNode } from "react";
import type { ApprovalId, Envelope, PanelStatus, Sla } from "../contracts";
import { AuthorityBadge, StatusChip } from "../components/badges";
import {
  ConditionComposer,
  ConditionList,
  EMPTY_DRAFT,
  type ConditionDraft,
  type TypedCondition,
} from "../components/conditions";
import { ExecutionDecisionBar } from "../components/decisionBar";
import { SlaCell } from "../components/evidence";
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
import { REQUEST_CHANGES_REASON } from "./GateR1Review";

export type R1State = "APPROVED" | "APPROVED_WITH_CONDITION" | "EXPIRED" | "DENIED" | "PENDING" | "MISSING";

function r1Block(state: R1State, id: string | null, expiredAt: string | null, lineagePublished = true): string | null {
  const ref = id ?? "the linked R1";
  if (!lineagePublished) {
    return "This response does not carry the R1 lineage, so the authority this R2 rests on cannot be shown. Approve is disabled until the source publishes it (BR-EX-30).";
  }
  switch (state) {
    case "APPROVED":
    case "APPROVED_WITH_CONDITION":
      return null;
    case "EXPIRED":
      return `${ref}${expiredAt ? ` expired ${expiredAt}` : " has expired"}. This R2 review cannot be decided against stale research evidence; re-run Gate R1 or extend its waiver. Approve is disabled.`;
    case "DENIED":
      return `${ref} was denied. Operational readiness cannot be approved on research that was refused; a new R1 is required. Approve is disabled.`;
    case "PENDING":
      return `${ref} has not been decided yet. R2 rests on R1, so this review cannot be approved until it is. Approve is disabled.`;
    case "MISSING":
      return `No R1 approval is linked to this request. There is nothing for this R2 to rest on; link one or re-run Gate R1. Approve is disabled.`;
  }
}
const R1_TONE: Record<R1State, "good" | "warn" | "bad" | "mute"> = {
  APPROVED: "good",
  APPROVED_WITH_CONDITION: "warn",
  EXPIRED: "bad",
  DENIED: "bad",
  PENDING: "mute",
  MISSING: "bad",
};
export interface CapitalDelta {
  label: string;
  before: string;
  after: string;
  currency?: string | null;
  note?: string | null;
  breach?: boolean;
}
export interface ReadinessGroup {
  title: string;
  entries: readonly { label: string; value: string; revision?: string | null }[];
}
export type R2Lock = "SELF_APPROVAL" | "R1_NOT_VALID" | "CAPITAL_BREACH" | "PREVIEW_NOT_DECIDABLE" | "EXPIRED" | "NOT_ELIGIBLE";
const DENY_BLOCKING_LOCKS: readonly R2Lock[] = ["EXPIRED", "NOT_ELIGIBLE"];
const DENY_LOCK_REASON: Record<"EXPIRED" | "NOT_ELIGIBLE", string> = {
  EXPIRED: "Deny blocked — this request expired. There is nothing live to refuse.",
  NOT_ELIGIBLE: "Deny blocked — you do not hold a role that can decide this gate.",
};
const LOCK_REASON: Record<R2Lock, string> = {
  SELF_APPROVAL: "Approve blocked — the plan author cannot be the sole approver.",
  R1_NOT_VALID: "Approve blocked — see the R1 status above.",
  CAPITAL_BREACH: "Approve blocked — the capital preview breaches a policy ceiling.",
  PREVIEW_NOT_DECIDABLE:
    "Approve blocked — the capital preview is not current enough to decide against. It stays visible so the gap can be diagnosed.",
  EXPIRED: "This request expired and must be resubmitted.",
  NOT_ELIGIBLE: "You do not hold a role that can decide this gate.",
};
const R2_TABS = ["Capital preview", "Readiness", "Observation policy", "R1 reference", "Conditions"] as const;
type R2Tab = (typeof R2_TABS)[number];

export function GateR2Review({
  approvalId,
  subject,
  r1Id,
  r1State,
  r1LineagePublished = true,
  r1Href,
  r1Expiry,
  r1Digest,
  r1DecidedBy,
  r1DecidedAt,
  deploymentCandidate,
  releaseCandidate,
  artifactDigest,
  policyVersion,
  planAuthor,
  actor,
  quorumMet,
  quorumRequired,
  sla,
  readiness,
  capital,
  capitalEnvelope,
  eligibility,
  capitalReason,
  capitalDecidable,
  capitalBlockers = [],
  observationPolicy,
  conditions,
  grantName,
  status = "ok",
  reason,
  partialReason,
  locks = [],
  note,
  onNoteChange,
  trail,
  onAttachCondition,
  onApprove,
  onDeny,
  onRequestCondition,
  onCopyProvenance,
}: {
  approvalId: ApprovalId;
  subject: string;
  r1Id: ApprovalId | null;
  r1State: R1State;
  r1LineagePublished?: boolean;
  r1Href?: string | null;
  r1Expiry?: string | null;
  r1Digest?: string | null;
  r1DecidedBy?: string | null;
  r1DecidedAt?: string | null;
  deploymentCandidate?: string;
  releaseCandidate?: string;
  artifactDigest?: string;
  policyVersion: string;
  planAuthor: string;
  actor: string;
  quorumMet: number;
  quorumRequired: number;
  sla?: Sla;
  readiness: readonly ReadinessGroup[];
  capital: readonly CapitalDelta[];
  capitalEnvelope?: Envelope;
  eligibility?: { canApprove: boolean; canApproveWithCondition: boolean; canDeny: boolean };
  capitalReason?: string | null;
  capitalDecidable?: boolean;
  capitalBlockers?: readonly string[];
  observationPolicy?: ReactNode;
  conditions?: readonly TypedCondition[];
  grantName?: string;
  status?: PanelStatus;
  reason?: string;
  partialReason?: string;
  locks?: readonly R2Lock[];
  note?: string;
  onNoteChange?: (next: string) => void;
  trail?: ReactNode;
  onAttachCondition?: (condition: TypedCondition) => void;
  onApprove?: () => void;
  onDeny?: () => void;
  onRequestCondition: () => void;
  onCopyProvenance: (full: string) => void;
}) {
  const [draft, setDraft] = useState<ConditionDraft>(EMPTY_DRAFT);
  const [tab, setTab] = useState<R2Tab>("Capital preview");
  if (status !== "ok" && status !== "partial" && status !== "stale") {
    return (
      <section className="exec-gate" aria-label={`Gate R2 review ${approvalId}`}>
        <div className="exec-gate-kicker">GATE R2 · Operational Readiness</div>
        <PanelState status={status} reason={reason ?? "This review cannot be shown."} />
      </section>
    );
  }
  const selfApproval = planAuthor === actor;
  const blockedReason = r1Block(r1State, r1Id, r1State === "EXPIRED" ? (r1Expiry ?? null) : null, r1LineagePublished);
  const breach = capital.some((c) => c.breach);
  const breaches = capital.filter((c) => c.breach).length;
  const previewNotDecidable = capitalDecidable === false;
  const effectiveLocks = Array.from(
    new Set<R2Lock>([
      ...(selfApproval ? (["SELF_APPROVAL"] as R2Lock[]) : []),
      ...(blockedReason ? (["R1_NOT_VALID"] as R2Lock[]) : []),
      ...(breach ? (["CAPITAL_BREACH"] as R2Lock[]) : []),
      ...(previewNotDecidable ? (["PREVIEW_NOT_DECIDABLE"] as R2Lock[]) : []),
      ...locks,
    ]),
  );
  const serverAllowsApprove = eligibility?.canApprove === true;
  const serverAllowsCondition = eligibility?.canApproveWithCondition === true;
  const serverAllowsDeny = eligibility?.canDeny === true;
  const locked = effectiveLocks.length > 0 || !serverAllowsApprove;
  const conditionLocked = effectiveLocks.length > 0 || !serverAllowsCondition;
  const denyLocks = effectiveLocks.filter((lock): lock is "EXPIRED" | "NOT_ELIGIBLE" =>
    (DENY_BLOCKING_LOCKS as readonly string[]).includes(lock),
  );
  const denyLocked = denyLocks.length > 0 || !serverAllowsDeny;
  // The R1 sentence is printed once, in the banner; the bar points at it.
  const reasons: string[] = [
    ...effectiveLocks.map((lock) => LOCK_REASON[lock]),
    ...denyLocks.map((lock) => DENY_LOCK_REASON[lock]),
  ];
  if (!serverAllowsApprove && effectiveLocks.length === 0) reasons.push("Approve blocked — the server did not grant it for this actor.");
  if (!serverAllowsDeny && denyLocks.length === 0) reasons.push("Deny blocked — the server did not grant it for this actor.");

  const r1Label = r1Id ? `R1 ${r1State} · ${r1Id}` : `R1 ${r1State}`;
  const badges: HeaderBadge[] = [
    { label: "GATE R2", axis: "stage" },
    { label: r1Label, axis: "other", tone: R1_TONE[r1State] },
    { label: `PENDING ${quorumMet}/${quorumRequired}`, axis: "readiness", tone: quorumMet >= quorumRequired ? "good" : "mute" },
    { label: selfApproval ? "SoD VIOLATION" : "SoD OK", axis: "other", tone: selfApproval ? "bad" : "good" },
    ...(status === "stale" ? [{ label: "STALE", axis: "broker-sync", tone: "bad" } as HeaderBadge] : []),
    ...(status === "partial" ? [{ label: "PARTIAL", axis: "broker-sync", tone: "warn" } as HeaderBadge] : []),
  ];
  const blockers: RailBlocker[] = [
    ...effectiveLocks.map((lock) => ({ label: `lock · ${lock.replace(/_/g, " ")}`, detail: null, severity: "blocking" as const })),
    ...capital.filter((c) => c.breach).map((c) => ({ label: `${c.label} BREACH`, detail: c.note ?? `${c.before} → ${c.after}`, severity: "blocking" as const })),
  ];
  const provenanceItems = [
    ...(artifactDigest ? [{ label: "artifact", short: shortDigest(artifactDigest), full: artifactDigest }] : []),
    ...(r1Id ? [{ label: "R1", short: r1Id, href: r1Href ?? null, full: null }] : []),
    ...(r1Digest ? [{ label: "R1 evidence digest", short: shortDigest(r1Digest), full: r1Digest }] : []),
    ...(deploymentCandidate ? [{ label: "deployment candidate", short: deploymentCandidate, full: null }] : []),
    ...(releaseCandidate ? [{ label: "release candidate", short: releaseCandidate, full: null }] : []),
    { label: "policy", short: policyVersion, full: null },
  ];
  const verdict = locked && conditionLocked ? "BLOCKED" : `PENDING ${quorumMet}/${quorumRequired}`;
  const sodLine = selfApproval
    ? `separation-of-duty VIOLATION — plan author (${planAuthor}) cannot be the sole approver, and that is you`
    : `separation-of-duty: plan author (${planAuthor}) cannot be sole approver — OK, you are ${actor}`;

  const rail = (
    <ExecutionContextRail
      next={{
        title: locked && conditionLocked ? "Approve blocked" : "Ready to decide",
        detail: (
          <span className="exec-role-body" data-violation={selfApproval ? "true" : undefined}>
            {sodLine}
          </span>
        ),
      }}
      blockers={blockers}
      freshness={
        <span className="exec-role-meta">
          {sla ? <SlaCell sla={sla} /> : "SLA not published"}
          {` · R1 ${r1State === "EXPIRED" ? "expired" : "expires"} ${r1Expiry ?? "— not published"}`}
          {capitalEnvelope?.asOf ? ` · preview as_of ${capitalEnvelope.asOf}` : null}
        </span>
      }
      provenance={<ExecutionProvenanceDrawer items={provenanceItems} onCopy={onCopyProvenance} />}
    />
  );

  return (
    <section className="exec-gate" aria-label={`Gate R2 review ${approvalId}`}>
      <ExecutionWorkspace layout="balanced" rail={rail}>
        <ExecutionPageHeader
          title={subject}
          id={approvalId}
          badges={badges}
          purpose="Is it safe to authorize Paper activation for this deployment candidate?"
          secondary={
            r1Href ? (
              <a href={r1Href} className="exec-gate-r1link exec-role-meta">
                open {r1Id ?? "R1"}
              </a>
            ) : r1Id ? (
              <span className="exec-role-meta" title="No link to the R1 decision was published.">
                {r1Id} · no link published
              </span>
            ) : undefined
          }
        />
        {blockedReason ? (
          <div className="exec-gate-banner exec-gate-blocking" role="status">
            <strong className="exec-gate-blocking-lead">Blocked — R1 approval {r1State.toLowerCase().replace(/_/g, " ")}</strong>{" "}
            <span>{blockedReason}</span>
          </div>
        ) : null}
        {status === "partial" ? (
          <div className="exec-gate-banner" role="status">
            {partialReason ?? "Part of this review could not be read. Absence of a finding is not a pass."}
          </div>
        ) : null}
        {status === "stale" ? (
          <div className="exec-gate-banner" role="status">
            {reason ?? "This review is older than its freshness budget. Refresh before deciding."}
          </div>
        ) : null}
        <ExecutionDecisionStrip
          metrics={[
            { label: "Locks", value: String(effectiveLocks.length), tone: effectiveLocks.length ? "bad" : "good" },
            { label: "Capital breaches", value: String(breaches), tone: breaches ? "bad" : "good" },
            { label: "Quorum", value: `${quorumMet}/${quorumRequired}` },
            { label: "Conditions", value: String(conditions?.length ?? 0) },
          ]}
        />
        <ExecutionTabs
          tabs={[
            { key: "Capital preview", label: "Capital preview", count: capital.length },
            { key: "Readiness", label: "Readiness", count: readiness.length },
            { key: "Observation policy", label: "Observation policy" },
            { key: "R1 reference", label: "R1 reference" },
            { key: "Conditions", label: "Conditions", count: conditions?.length ?? 0 },
          ]}
          active={tab}
          onChange={(key) => setTab(key as R2Tab)}
          label="Gate R2 sections"
        >
          {tab === "Capital preview" ? (
            capital.length > 0 ? (
              <div className="exec-preview-panel">
                <div className="exec-preview-head">
                  <ExecutionSectionTitle>Capital change preview — execution vocabulary</ExecutionSectionTitle>
                  <StatusChip label="PLAN PREVIEW" tone="warn" />
                  {capitalEnvelope ? <AuthorityBadge envelope={capitalEnvelope} /> : null}
                  <span className="exec-role-meta">derived, not applied</span>
                </div>
                {capitalEnvelope ? (
                  <div className="exec-scroll-x">
                    <table className="exec-gate-capital">
                      <thead>
                        <tr>
                          <th scope="col" />
                          <th scope="col">currency</th>
                          <th scope="col">before</th>
                          <th scope="col">after approval</th>
                        </tr>
                      </thead>
                      <tbody>
                        {capital.map((row) => (
                          <tr key={row.label} data-breach={row.breach ? "true" : undefined}>
                            <th scope="row">
                              {row.label} {row.breach ? <StatusChip label="BREACH" tone="bad" /> : null}
                            </th>
                            <td>{row.currency ?? <span className="exec-gate-unverified">not stated</span>}</td>
                            <td className="exec-num">{row.before}</td>
                            <td className="exec-num">
                              {row.after}
                              {row.note ? <span className="exec-gate-note"> — {row.note}</span> : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <PanelState
                    status="unavailable"
                    reason={capitalReason ?? "The capital preview arrived without an authority envelope and cannot be shown."}
                  />
                )}
                {capitalEnvelope && capitalBlockers.length > 0 ? (
                  <div className="exec-gate-blockers">
                    <ExecutionSectionTitle>Why this preview cannot be decided against</ExecutionSectionTitle>
                    <ul>
                      {capitalBlockers.map((blocker) => (
                        <li key={blocker}>{blocker}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : (
              <PanelState status="unavailable" reason={capitalReason ?? "No capital preview was published for this request."} />
            )
          ) : null}
          {tab === "Readiness" ? (
            <div className="exec-grid-2">
              {readiness.map((group) => (
                <div className="exec-gate-panel" key={group.title}>
                  <ExecutionSectionTitle>{group.title}</ExecutionSectionTitle>
                  <div className="exec-scroll-x">
                    <table className="exec-360-sync exec-gate-passport-table">
                      <tbody>
                        {group.entries.map((e) => (
                          <tr key={e.label}>
                            <th scope="row">{e.label}</th>
                            <td className="exec-num">{e.value}</td>
                            <td>
                              {e.revision ? <span className="exec-gate-note">{e.revision}</span> : <span className="exec-gate-unverified">revision not stated</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
              {readiness.length === 0 ? <PanelState status="empty" reason="No readiness groups were published." /> : null}
            </div>
          ) : null}
          {tab === "Observation policy" ? (
            observationPolicy ? (
              <div className="exec-gate-panel">{observationPolicy}</div>
            ) : (
              <PanelState status="empty" reason="No observation policy was published for this request." />
            )
          ) : null}
          {tab === "R1 reference" ? (
            <div className="exec-gate-panel">
              <ExecutionSectionTitle>R1 reference</ExecutionSectionTitle>
              <table className="exec-360-sync exec-gate-passport-table">
                <tbody>
                  <tr>
                    <th scope="row">decision</th>
                    <td>
                      <StatusChip label={r1Label} tone={R1_TONE[r1State]} />
                      {r1Href && r1Id ? (
                        <>
                          {" "}
                          <a href={r1Href}>{r1Id}</a>
                        </>
                      ) : null}
                      {r1DecidedBy ? (
                        <span className="exec-gate-note">
                          {" "}
                          · {r1DecidedBy}
                          {r1DecidedAt ? ` ${r1DecidedAt}` : ""}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">evidence digest</th>
                    <td className="exec-num">{r1Digest ?? <span className="exec-gate-unverified">not published</span>}</td>
                  </tr>
                  <tr>
                    <th scope="row">expiry</th>
                    <td className="exec-num">
                      {r1Expiry ? (
                        <span className={r1State === "EXPIRED" ? "exec-gate-unverified" : undefined}>{r1Expiry}</span>
                      ) : (
                        <span className="exec-gate-unverified">not published</span>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
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
          label={`Gate R2 decision ${approvalId}`}
          verdict={verdict}
          tone={locked && conditionLocked ? "bad" : "warn"}
          reasons={reasons}
          note={onNoteChange ? { value: note ?? "", onChange: onNoteChange, disabled: locked && conditionLocked && denyLocked } : undefined}
          footnote={
            <>
              {grantName ? (
                <>
                  Approve grants <strong>{grantName}</strong> only — it does not execute; the Execution cell re-validates everything when the authorization is used.{" "}
                </>
              ) : null}
              {artifactDigest ? <>evidence digest {shortDigest(artifactDigest)} · </> : null}
              decision is recorded against policy {policyVersion} · conditions are typed objects with owner, deadline and expiry, never free text
            </>
          }
          trail={trail}
          actions={
            <>
              <button type="button" className="exec-role-control exec-btn-ghost" disabled title={REQUEST_CHANGES_REASON}>
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
              <button type="button" className="exec-role-control exec-btn-apply" disabled={locked} onClick={onApprove}>
                Approve
              </button>
            </>
          }
        />
      </ExecutionWorkspace>
    </section>
  );
}
