/**
 * Phase 3 — Gate R2 Review (hi-fi 1b), UI states only.
 *
 * R2 asks a different question from R1. R1 asked whether the research is sound;
 * R2 asks whether this deployment is operationally ready — account, risk
 * profile, matcher config, capital, portfolio fit. So the screen is built around
 * two things R1 does not have:
 *
 *   1. **A dependency on R1.** R2 cannot stand on an R1 that has expired or been
 *      denied. The hi-fi prints "Blocked — R1 approval expired" and that is the
 *      whole point: approving operational readiness for research nobody currently
 *      vouches for produces a live deployment resting on a lapsed claim.
 *   2. **A capital preview.** A before/after table is the most dangerous panel on
 *      this surface, because it looks exactly like a record of something that
 *      happened. It carries DERIVED authority, a `PLAN PREVIEW` marker and the
 *      words "derived, not applied", and the component will not render it
 *      without them.
 *
 * Approving grants an authorization. It does not execute: the Execution cell
 * re-validates everything when the authorization is used.
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
import { SlaCell } from "../components/evidence";
import { ExecutionSurface } from "../ExecutionSurface";
import { PanelState } from "../components/states";

/** State of the R1 this R2 rests on. Only `APPROVED` lets R2 proceed. */
export type R1State = "APPROVED" | "APPROVED_WITH_CONDITION" | "EXPIRED" | "DENIED" | "PENDING" | "MISSING";

/**
 * Why an R1 blocks, in the words the hi-fi uses.
 *
 * Each takes the reference so the banner can name it, and the expired one takes
 * the date. "Expired" without a date is an assertion; "expired 2026-08-18" is
 * something a reviewer can check, and checking is the whole activity this
 * screen exists for.
 *
 * Each also ends with the remedy. The hi-fi's banner is the only place on the
 * screen that tells a reviewer what to do next, and a blocker with no way
 * forward turns into a support ticket.
 */
function r1Block(state: R1State, id: string | null, expiredAt: string | null): string | null {
  const ref = id ?? "the linked R1";
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

/**
 * One `before → after` row of the capital preview.
 *
 * `currency` is its own field, and the screen refuses to render a row without
 * one. Scale-refine note I-4: the capital diff is **per currency**, so a strip
 * that implies a single number is wrong the moment a portfolio holds two —
 * a USDT figure stacked above a VND figure reads as though they add up, and
 * nothing about the layout says otherwise. A percentage row is the exception
 * and declares itself with `currency: "%"`.
 */
export interface CapitalDelta {
  label: string;
  before: string;
  after: string;
  /** Currency code, or `%` for a ratio. `null` renders as a stated gap. */
  currency?: string | null;
  /** `within policy ceiling 55%` — the rule the after value was checked against. */
  note?: string | null;
  /** True when `after` breaches a policy ceiling. Blocks approval. */
  breach?: boolean;
}

export interface ReadinessGroup {
  title: string;
  /** `account policy rev 7` → `MARGIN · CROSS · 2x · settle USDT` */
  entries: readonly { label: string; value: string; revision?: string | null }[];
}

export type R2Lock =
  | "SELF_APPROVAL"
  | "R1_NOT_VALID"
  | "CAPITAL_BREACH"
  /** The engine returned the preview with `decision_eligible=false` (EX-BE-07a §2.2). */
  | "PREVIEW_NOT_DECIDABLE"
  | "EXPIRED"
  | "NOT_ELIGIBLE";

/**
 * Which locks stop a denial. Same rule as Gate R1: the plan author may refuse
 * their own plan, an invalid R1 is a reason to deny rather than an obstacle to
 * it, and a capital breach is the clearest reason of all. Only a request that
 * has stopped being decidable blocks a refusal.
 */
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
    "Approve blocked — the capital preview is not current enough to decide against. It stays visible below so the gap can be diagnosed.",
  EXPIRED: "This request expired and must be resubmitted.",
  NOT_ELIGIBLE: "You do not hold a role that can decide this gate.",
};

export function GateR2Review({
  approvalId,
  subject,
  r1Id,
  r1State,
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
  capitalDecidable,
  observationPolicy,
  conditions,
  grantName,
  status = "ok",
  reason,
  partialReason,
  locks = [],
  onAttachCondition,
  onApprove,
  onDeny,
  onRequestCondition,
}: {
  approvalId: ApprovalId;
  /** `Carry v3.2 → PF-MAIN · Paper · BINANCE` */
  subject: string;
  r1Id: ApprovalId | null;
  r1State: R1State;
  /** Where the R1 decision can be read. A reference nobody can open is a claim. */
  r1Href?: string | null;
  /**
   * When the R1 evidence lapses, or lapsed. §3 lists it among the R1 reference
   * panel's three fields for a reason: without it a reviewer cannot see how
   * stale the R1 is until it has already gone, and an R2 approved the day
   * before expiry is a different risk from one approved a month before.
   */
  r1Expiry?: string | null;
  /** Digest of the evidence the R1 was decided against. */
  r1Digest?: string | null;
  /** Who decided the R1, and when. */
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
  /**
   * Required whenever `capital` is non-empty. The preview is a computation, and
   * a computation without its authority and as_of is an unattributed number.
   */
  capitalEnvelope?: Envelope;
  /**
   * The engine's `decision_eligible` verdict on the capital preview.
   *
   * Tri-state on purpose. `undefined` means no preview was requested and the
   * lock does not apply; `false` is an explicit refusal from the engine. A
   * boolean defaulting to `true` would turn "we never asked" into "the engine
   * said yes", which is the one reading that must never happen by omission.
   */
  capitalDecidable?: boolean;
  observationPolicy?: ReactNode;
  /**
   * Typed conditions attached to this decision (DS §4). §3's exit criterion is
   * "R2 approval creates typed conditions", so the list is part of the screen
   * rather than something the drawer invents afterwards.
   */
  conditions?: readonly TypedCondition[];
  /** `paper_activation_authorization` — what approving actually grants. */
  grantName?: string;
  status?: PanelStatus;
  reason?: string;
  partialReason?: string;
  locks?: readonly R2Lock[];
  /** Attaching a condition is what makes "approve with condition" mean
   *  something (§2 "Must work": conditions attach to the decision object). */
  onAttachCondition?: (condition: TypedCondition) => void;
  onApprove?: () => void;
  onDeny?: () => void;
  onRequestCondition?: () => void;
}) {
  if (status !== "ok" && status !== "partial" && status !== "stale") {
    return (
      <section className="exec-gate" aria-label={`Gate R2 review ${approvalId}`}>
        <div className="exec-gate-kicker">GATE R2 · Operational Readiness</div>
        <PanelState status={status} reason={reason ?? "This review cannot be shown."} />
      </section>
    );
  }

  const [draft, setDraft] = useState<ConditionDraft>(EMPTY_DRAFT);

  const selfApproval = planAuthor === actor;
  const blockedReason = r1Block(r1State, r1Id, r1State === "EXPIRED" ? (r1Expiry ?? null) : null);
  const breach = capital.some((c) => c.breach);
  // §2.2: an ineligible preview blocks approval and nothing else. It is not
  // hidden — the numbers are how an operator works out what went stale — and it
  // does not block a denial, because refusing to approve against figures nobody
  // stands behind is exactly the decision this state should make easy.
  const previewNotDecidable = capitalDecidable === false;

  // Derived, in the same way Gate R1 derives its separation-of-duty lock. The
  // three conditions that must never depend on a caller remembering to pass a
  // lock are the three that would let an unsound approval through.
  const effectiveLocks = Array.from(
    new Set<R2Lock>([
      ...(selfApproval ? (["SELF_APPROVAL"] as R2Lock[]) : []),
      ...(blockedReason ? (["R1_NOT_VALID"] as R2Lock[]) : []),
      ...(breach ? (["CAPITAL_BREACH"] as R2Lock[]) : []),
      ...(previewNotDecidable ? (["PREVIEW_NOT_DECIDABLE"] as R2Lock[]) : []),
      ...locks,
    ]),
  );
  const locked = effectiveLocks.length > 0;
  const conditionLocked = locked;
  const denyLocks = effectiveLocks.filter((lock): lock is "EXPIRED" | "NOT_ELIGIBLE" =>
    (DENY_BLOCKING_LOCKS as readonly string[]).includes(lock),
  );
  const denyLocked = denyLocks.length > 0;

  return (
    <section className="exec-gate" aria-label={`Gate R2 review ${approvalId}`}>
      <header className="exec-gate-head">
        <div className="exec-gate-kicker">GATE R2 · Operational Readiness</div>
        <div className="exec-tile-title">{subject}</div>
        <div className="exec-gate-meta">
          {/* §3 "Must work": the R1 reference links to the R1 decision. A
              reviewer asked to rely on a prior approval has to be able to open
              it, and a reference that cannot be opened is only a claim. */}
          {r1Href ? (
            <a href={r1Href} className="exec-gate-r1link">
              <StatusChip
                label={r1Id ? `R1 ${r1State} · ${r1Id}` : `R1 ${r1State}`}
                tone={R1_TONE[r1State]}
              />
            </a>
          ) : (
            <StatusChip
              label={r1Id ? `R1 ${r1State} · ${r1Id}` : `R1 ${r1State}`}
              tone={R1_TONE[r1State]}
              title={r1Id ? "No link to the R1 decision was published." : undefined}
            />
          )}
          <StatusChip
            label={`PENDING ${quorumMet}/${quorumRequired}`}
            tone={quorumMet >= quorumRequired ? "good" : "mute"}
          />
          <span>{approvalId}</span>
          {deploymentCandidate ? <span>deployment candidate {deploymentCandidate}</span> : null}
          {releaseCandidate ? <span>release candidate {releaseCandidate}</span> : null}
          {artifactDigest ? <span>digest {artifactDigest}</span> : null}
          <span>policy {policyVersion}</span>
          {sla ? <SlaCell sla={sla} /> : null}
        </div>

        <div className="exec-gate-sod" data-violation={selfApproval ? "true" : undefined}>
          {selfApproval
            ? `separation-of-duty VIOLATION — plan author (${planAuthor}) cannot be the sole approver, and that is you`
            : `separation-of-duty: plan author (${planAuthor}) cannot be sole approver — OK, you are ${actor}`}
        </div>

        {/* The R1 block is a band rather than a footnote. It is the one condition
            on this screen that no amount of operational evidence can satisfy. */}
        {blockedReason ? (
          <div className="exec-gate-banner exec-gate-blocking">
            <strong className="exec-gate-blocking-lead">Blocked — R1 approval {r1State.toLowerCase().replace(/_/g, " ")}</strong>
            <span>{blockedReason}</span>
          </div>
        ) : null}
      </header>

      {status === "partial" ? (
        <div className="exec-gate-banner">
          {partialReason ?? "Part of this review could not be read. Absence of a finding is not a pass."}
        </div>
      ) : null}
      {status === "stale" ? (
        <div className="exec-gate-banner">
          {reason ?? "This review is older than its freshness budget. Refresh before deciding."}
        </div>
      ) : null}

      <div className="exec-grid-2">
      {/* §3: "right: R1 reference panel (decision, digest, expiry)". It was a
          chip in the meta strip, which carries the decision and nothing else —
          and the two fields it dropped are the two a reviewer needs to judge
          how much the R1 is still worth. */}
      <div className="exec-gate-panel">
        <div className="exec-tile-title">R1 reference</div>
        <dl className="exec-gate-passport">
          <div>
            <dt>decision</dt>
            <dd>
              <span className="exec-gate-value">{r1State.replace(/_/g, " ")}</span>
              {r1Id ? (
                r1Href ? (
                  <>
                    {" "}
                    <a href={r1Href}>{r1Id}</a>
                  </>
                ) : (
                  <span className="exec-gate-note"> {r1Id}</span>
                )
              ) : null}
              {r1DecidedBy ? (
                <span className="exec-gate-note">
                  {" "}
                  · {r1DecidedBy}
                  {r1DecidedAt ? ` ${r1DecidedAt}` : ""}
                </span>
              ) : null}
            </dd>
          </div>
          <div>
            <dt>evidence digest</dt>
            <dd>
              {r1Digest ? (
                <span className="exec-gate-value">{r1Digest}</span>
              ) : (
                // An R1 whose evidence cannot be identified is an R1 nobody can
                // re-check, which is most of what a reference is for.
                <span className="exec-gate-unverified">not published</span>
              )}
            </dd>
          </div>
          <div>
            <dt>expiry</dt>
            <dd>
              {r1Expiry ? (
                <span className={r1State === "EXPIRED" ? "exec-gate-unverified" : "exec-gate-value"}>
                  {r1Expiry}
                </span>
              ) : (
                <span className="exec-gate-unverified">not published</span>
              )}
            </dd>
          </div>
        </dl>
      </div>

      {readiness.map((group) => (
        <div className="exec-gate-panel" key={group.title}>
          <div className="exec-tile-title">{group.title}</div>
          <dl className="exec-gate-passport">
            {group.entries.map((e) => (
              <div key={e.label}>
                <dt>{e.label}</dt>
                <dd>
                  <span className="exec-gate-value">{e.value}</span>
                  {/* A config without its revision cannot be audited later. */}
                  {e.revision ? (
                    <span className="exec-gate-note"> · {e.revision}</span>
                  ) : (
                    <span className="exec-gate-unverified"> · revision not stated</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
      </div>

      {/* Grid B. The hi-fi gives the dark preview the wider half (1.35fr): it
          holds a four-row numeric table and the policy panel holds prose. */}
      <div className="exec-grid-2" data-ratio="1.35">
      {capital.length > 0 ? (
        <ExecutionSurface kind="deployments" className="exec-inverted exec-gate-panel">
          <div className="exec-tile-title">Capital change preview — execution vocabulary</div>
          {capitalEnvelope ? (
            <div className="exec-gate-meta">
              <AuthorityBadge envelope={capitalEnvelope} />
              <StatusChip label="PLAN PREVIEW" tone="warn" />
              <span>derived, not applied</span>
            </div>
          ) : (
            // Without an envelope this table is an unattributed claim about
            // money. It is refused rather than rendered bare.
            <PanelState
              status="unavailable"
              reason="The capital preview arrived without an authority envelope and cannot be shown."
            />
          )}
          {capitalEnvelope ? (
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
                    <th scope="row">{row.label}</th>
                    <td>
                      {row.currency ?? (
                        <span className="exec-gate-unverified">not stated</span>
                      )}
                    </td>
                    <td>{row.before}</td>
                    <td>
                      {row.after}
                      {row.note ? <span className="exec-gate-note"> — {row.note}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </ExecutionSurface>
      ) : null}

      {observationPolicy ? <div className="exec-gate-panel">{observationPolicy}</div> : null}
      </div>

      {/* Full width, below both grids — the hi-fi's Decision card. */}
      <div className="exec-gate-panel">
        <div className="exec-tile-title">Decision</div>
        <ConditionList
          conditions={conditions ?? []}
          emptyNote="No conditions attached yet."
        />
        {/* The hi-fi prints this under the decision card, and the last clause is
            the screen explaining its own model. It is the sentence that stops
            the next person asking for a free-text box. */}
        <div className="exec-gate-footnote">
          {artifactDigest ? <>evidence digest {artifactDigest} · </> : null}
          decision is recorded against policy {policyVersion} · conditions are typed objects with
          owner, deadline and expiry, never free text
        </div>
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

      {grantName ? (
        <div className="exec-gate-grant">
          Approve grants <strong>{grantName}</strong>. It does not execute — the Execution cell
          re-validates everything when the authorization is used.
        </div>
      ) : null}

      <div className="exec-gate-decision">
        <button type="button" className="exec-btn-apply" disabled={locked} onClick={onApprove}>
          Approve
        </button>
        <button type="button" className="exec-btn-ghost" onClick={onRequestCondition}>
          Approve with condition
        </button>
        <button type="button" className="exec-btn-ghost" disabled={denyLocked} onClick={onDeny}>
          Deny
        </button>
      </div>

      {locked ? (
        <div className="exec-disabled-reason">
          {effectiveLocks.map((lock) => LOCK_REASON[lock]).join(" ")}
          {denyLocked ? ` ${denyLocks.map((lock) => DENY_LOCK_REASON[lock]).join(" ")}` : null}
        </div>
      ) : null}
    </section>
  );
}
