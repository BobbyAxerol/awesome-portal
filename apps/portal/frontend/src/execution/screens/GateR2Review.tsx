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
import { Fragment, useState, type ReactNode } from "react";
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
import { PanelState } from "../components/states";
import { shortDigest } from "../components/workspace";
import { REQUEST_CHANGES_DENIED_REASON, REQUEST_CHANGES_NOTE_REASON } from "./GateR1Review";
import { GOV_CHARTS } from "../governance.smoke";

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
  onRequestChanges,
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
  eligibility?: { canApprove: boolean; canApproveWithCondition: boolean; canDeny: boolean; canRequestChanges?: boolean };
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
  onRequestChanges?: () => void;
  /** Kept for the container; the hi-fi page has no provenance drawer. */
  onCopyProvenance?: (full: string) => void;
}) {
  const [draft, setDraft] = useState<ConditionDraft>(EMPTY_DRAFT);
  if (status !== "ok" && status !== "partial" && status !== "stale") {
    return (
      <section className="exec-gate exec-gov" aria-label={`Gate R2 review ${approvalId}`} data-hifi-exact="gate-r2-1b">
        <div className="exec-gate-kicker">GATE R2 · Operational Readiness</div>
        <PanelState status={status} reason={reason ?? "This review cannot be shown."} />
      </section>
    );
  }
  const selfApproval = planAuthor === actor;
  const blockedReason = r1Block(r1State, r1Id, r1State === "EXPIRED" ? (r1Expiry ?? null) : null, r1LineagePublished);
  const breach = capital.some((c) => c.breach);
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
  const serverAllowsRequestChanges = eligibility?.canRequestChanges === true;
  const noteReady = (note ?? "").trim().length >= 8;
  const requestChangesLocked = !serverAllowsRequestChanges || !noteReady || !onRequestChanges;
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

  const verdict = locked && conditionLocked ? "BLOCKED" : `PENDING ${quorumMet}/${quorumRequired}`;
  const sodLine = selfApproval
    ? `separation-of-duty VIOLATION — plan author (${planAuthor}) cannot be the sole approver, and that is you`
    : `separation-of-duty: plan author (${planAuthor}) cannot be sole approver — OK, you are ${actor}`;
  const slaRemaining =
    sla && sla.budgetMinutes > 0 && sla.ageMinutes >= 0
      ? Math.max(0, Math.round((sla.budgetMinutes - sla.ageMinutes) / 60))
      : null;

  return (
    <section className="exec-gate exec-gov" aria-label={`Gate R2 review ${approvalId}`} data-hifi-exact="gate-r2-1b">
      <div className="exec-gov-head">
        <span className="exec-inbox-gate" data-gate="R2">GATE R2</span>
        <h1 className="exec-gov-h1">Operational Readiness <span className="exec-gov-dim">—</span> {subject}</h1>
        {status === "stale" ? <span className="exec-gov-chip" data-fill="bad">STALE</span> : null}
        {status === "partial" ? <span className="exec-gov-chip" data-fill="warn">PARTIAL</span> : null}
        <span className="exec-gov-wf">WF 1b</span>
      </div>
      <div className="exec-gov-metaline">
        <span className="exec-gov-chip" data-fill={r1State === "APPROVED" || r1State === "APPROVED_WITH_CONDITION" ? "good" : "bad"}>
          R1 {r1State}
          {r1Id ? (
            <>
              {" · "}
              {r1Href ? (
                <a href={r1Href}>{r1Id}</a>
              ) : (
                <span title="No link to the R1 decision was published.">{r1Id}</span>
              )}
            </>
          ) : null}
        </span>
        {deploymentCandidate ? <span>deployment candidate {deploymentCandidate}</span> : null}
        {releaseCandidate ? (
          <span>
            release candidate {releaseCandidate}
            {artifactDigest ? <> · digest {shortDigest(artifactDigest)}</> : null}
          </span>
        ) : null}
        <span>policy {policyVersion}</span>
        <span data-tone={selfApproval ? "bad" : "warn"}>{sodLine}</span>
        <span className="exec-gov-meta">
          R1 evidence {r1Digest ? shortDigest(r1Digest) : <span className="exec-gate-unverified">not published</span>}
        </span>
        <span className="exec-gov-meta">
          R1 {r1State === "EXPIRED" ? "expired" : "expires"}{" "}
          {r1Expiry ?? <span className="exec-gate-unverified">not published</span>}
          {r1DecidedBy ? ` · decided by ${r1DecidedBy}${r1DecidedAt ? ` ${r1DecidedAt}` : ""}` : ""}
        </span>
        <span className="exec-gov-spacer" />
        <span className="exec-gov-meta">
          PENDING {quorumMet}/{quorumRequired}
          {slaRemaining !== null ? ` · SLA ${slaRemaining}h remaining` : ""}
          {capitalEnvelope?.asOf ? ` · preview as_of ${capitalEnvelope.asOf}` : ""}
        </span>
      </div>
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
      <div className="exec-gov-grid2">
        <div className="exec-gov-panel" data-smoke="true">
          <div className="exec-gov-panelhead"><span className="exec-gov-paneltitle">Portfolio fit</span></div>
          <div className="exec-gate-fitbody">
            <div className="exec-gate-fitweight">
              <span>target capital weight</span>
              <b className="exec-num">{GOV_CHARTS.r2Fit.targetWeightPct.toFixed(1)}%</b>
            </div>
            <div className="exec-gate-fitbar" aria-hidden="true"><span style={{ width: `${Math.min(100, GOV_CHARTS.r2Fit.targetWeightPct * 4)}%` }} /></div>
            <div className="exec-gov-kv" data-flush="true">
              {GOV_CHARTS.r2Fit.rows.map((r) => (
                <Fragment key={r.k}>
                  <span className="exec-gov-k">{r.k}</span>
                  <span className="exec-gov-v" data-tone={"tone" in r ? r.tone : undefined}>{r.v}{"tail" in r && r.tail ? <span className="exec-gate-note">{r.tail}</span> : null}</span>
                </Fragment>
              ))}
            </div>
            <p className="exec-af-smoke">! SMOKE DATA — {GOV_CHARTS.r2Fit.foot}. Reference shape for BR-EX-67. Delete when BR-EX-67 ships</p>
          </div>
        </div>
        {readiness.map((group) => (
          <div className="exec-gov-panel" key={group.title}>
            <div className="exec-gov-panelhead"><span className="exec-gov-paneltitle">{group.title}</span></div>
            <div className="exec-gov-kv">
              {group.entries.map((e) => (
                <Fragment key={e.label}>
                  <span className="exec-gov-k">{e.label}</span>
                  <span className="exec-gov-v">
                    {e.value}
                    {e.revision ? <span className="exec-gate-note"> {e.revision}</span> : <span className="exec-gate-unverified"> revision not stated</span>}
                  </span>
                </Fragment>
              ))}
            </div>
          </div>
        ))}
        {readiness.length === 0 ? <PanelState status="empty" reason="No readiness groups were published." /> : null}
      </div>
      <div className="exec-gov-panel">
        {/* SMOKE until BR-EX-67: criteria are POLICY DATA — thresholds from the
            versioned gate policy, verdicts computed server-side (hi-fi 1b note).
            The browser renders, never re-derives. */}
        <div className="exec-gov-panelhead">
          <span className="exec-gov-paneltitle">Gate criteria — policy vs evidence</span>
          <span className="exec-gate-policychip" title="SMOKE — the versioned gate policy reference ships with BR-EX-67">{GOV_CHARTS.r2Criteria.policy}</span>
          <span className="exec-gov-spacer" />
          <button type="button" className="exec-gov-reglink" disabled title="The policy registry route ships with BR-EX-67.">policy registry →</button>
        </div>
        <div className="exec-scroll-x">
          <table className="exec-360-sync exec-gate-criteria">
            <thead>
              <tr>
                <th scope="col">criterion</th>
                <th scope="col" data-numeric="true">threshold</th>
                <th scope="col" data-numeric="true">run_5512</th>
                <th scope="col">verdict</th>
              </tr>
            </thead>
            <tbody>
              {GOV_CHARTS.r2Criteria.rows.map((row) => (
                <tr key={row.criterion} data-verdict={row.verdict}>
                  <th scope="row">{row.criterion}</th>
                  <td className="exec-num">{row.threshold}</td>
                  <td className="exec-num">{row.observed}</td>
                  <td>
                    {row.verdict === "PASS" ? (
                      <span className="exec-gov-verified">✓ PASS</span>
                    ) : (
                      <span className="exec-gate-waiverable">! WAIVERABLE {row.note ?? ""}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="exec-role-meta exec-gate-criteriafoot">{GOV_CHARTS.r2Criteria.foot} · evidence: {GOV_CHARTS.r2Criteria.evidence.map((e) => e.label).join(" · ")}</p>
      </div>
      <div className="exec-gate-stagechips" role="group" aria-label="Stage eligibility, derived from gate policies">
        <span className="exec-gov-meta">Stage eligibility (derived from gate policies)</span>
        {GOV_CHARTS.r2Stages.map((c) => (
          <span key={c.stage} className="exec-gate-stagechip" data-state={c.state}>
            {c.stage} — {c.detail}
          </span>
        ))}
        <span className="exec-gov-meta">each chip = that stage's gate policy, evaluated against today's evidence · SMOKE, BR-EX-67</span>
      </div>
      <div className="exec-gov-grid2" data-ratio="1.35">
        {capital.length > 0 ? (
          <div className="exec-preview-panel exec-gov-inverse">
            <div className="exec-gov-panelhead">
              <span className="exec-gov-paneltitle">Capital change preview — execution vocabulary</span>
              <span className="exec-gov-spacer" />
              <span className="exec-gate-policychip" data-inverse="true">
                <b>EXECUTION</b> · PLAN PREVIEW{capitalEnvelope?.asOf ? ` · as_of ${capitalEnvelope.asOf}` : ""} · derived, not applied
              </span>
              {capitalEnvelope ? <AuthorityBadge envelope={capitalEnvelope} /> : null}
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
                <span className="exec-gov-paneltitle">Why this preview cannot be decided against</span>
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
        )}
        <div className="exec-gov-panel">
          <div className="exec-gov-panelhead"><span className="exec-gov-paneltitle">Observation policy</span></div>
          {observationPolicy ? (
            <div className="exec-gate-obsbody">{observationPolicy}</div>
          ) : (
            <PanelState status="empty" reason="No observation policy was published for this request." />
          )}
        </div>
      </div>
      <div className="exec-gov-panel">
        <div className="exec-gov-panelhead"><span className="exec-gov-paneltitle">Decision — structured, immutable once submitted</span></div>
        <div className="exec-gate-decisionbody">
          <ConditionList conditions={conditions ?? []} emptyNote="No conditions attached yet." />
          {onAttachCondition ? (
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
        </div>
      </div>
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
            your decision counts as 1 of {quorumRequired} required approvers ·{" "}
            {artifactDigest ? <>evidence digest {shortDigest(artifactDigest)} · </> : null}
            decision is recorded against policy {policyVersion} · conditions are typed objects with owner, deadline and expiry, never free text
          </>
        }
        trail={trail}
        actions={
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
            <button type="button" className="exec-role-control exec-btn-apply" disabled={locked} onClick={onApprove}>
              Approve
            </button>
          </>
        }
      />
    </section>
  );
}
