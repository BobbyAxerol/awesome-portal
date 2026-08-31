/**
 * Phase 5 — Paper Exit Review (hi-fi 4b), UI states only.
 *
 * The screen that decides whether a deployment leaves Paper. It is built around
 * four evidence panels and a three-branch decision, and the honesty rules are
 * concentrated in two places.
 *
 * **`met` is the server's, never inferred.** The hi-fi shows `30/30 gate met`
 * and `22/30 — gate unmet` as two different screens. This component never
 * computes one from the other: an observation policy can require more than
 * coverage arithmetic — restart cycles, freshness violations, a minimum trade
 * count — and a client that decides "30 ≥ 30, therefore met" will eventually
 * declare a gate met that the policy considers open.
 *
 * **A finding has three outcomes, not two.** The hi-fi's drift panel carries
 * `within band`, a `WATCH, non-blocking` item, and `slippage INSUFFICIENT_DATA
 * — carries into sandbox certification`. Insufficient is not a pass and not a
 * failure: it is a question that follows the deployment into the next stage.
 * Collapsing it either way loses the follow-up.
 */
import type { ReactNode } from "react";

import type { Eligibility } from "../api/rows";
import type { ApprovalId, DeploymentId, EvidenceMark, PanelStatus, Sla } from "../contracts";
import { ConditionList, type TypedCondition } from "../components/conditions";
import { EvidencePanel, SlaCell, type EvidenceRow } from "../components/evidence";
import { LifecycleRail, type RailStep } from "../components/lifecycle";
import { PanelState } from "../components/states";
import { useState } from "react";
import type { PaperDemo } from "../paper.smoke";
import { ExecutionDecisionBar } from "../components/decisionBar";
import { ExecutionSectionTitle } from "../components/typography";
import {
  ExecutionContextRail,
  ExecutionDecisionStrip,
  ExecutionPageHeader,
  ExecutionProvenanceDrawer,
  ExecutionWorkspace,
  shortDigest,
  type HeaderBadge,
  type RailBlocker,
} from "../components/workspace";


export interface ExitFinding {
  label: string;
  outcome: EvidenceMark;
  /** Where an `insufficient` finding goes next, e.g. sandbox certification. */
  carriesTo?: string | null;
  /**
   * Where this number can be checked — the sessions tab, the blotter, the
   * portfolio panel. §5's "Must work" line asks for it on **every** evidence
   * number, and the reason is that this screen decides a promotion: a figure
   * with nowhere to check it is an assertion, and an assertion is not evidence.
   */
  href?: string | null;
  sourceLabel?: string | null;
}

export interface EvidencePanelSpec {
  title: string;
  /** `obs_29`, `run_5498` — what produced this evidence. */
  source?: string | null;
  findings: readonly ExitFinding[];
  /** Panels can fail independently of the review. */
  status?: PanelStatus;
  reason?: string;
}

/** The three branches. Each writes a different state — see `EXIT_OUTCOME`. */
export type ExitOutcome = "PROMOTE" | "EXTEND_OBSERVATION" | "REJECT";

/**
 * The three branches, labelled with their consequence rather than their verb.
 *
 * §5 names them precisely — "Extend observation +14d", "Reject — back to Paper
 * HELD", "Approve promotion" — and the specifics are the point. "Reject" alone
 * does not tell a reviewer the deployment stops trading; "back to Paper HELD"
 * does, and that is the difference between an informed decision and a verb.
 */
export const EXIT_OUTCOME: Record<ExitOutcome, { label: string; writes: string }> = {
  PROMOTE: {
    label: "Approve promotion",
    writes: "promotion request created; the deployment stays in Paper until it is applied",
  },
  EXTEND_OBSERVATION: {
    label: "Extend observation +14d",
    writes: "observation window extended by 14 days; the deployment continues in Paper",
  },
  REJECT: {
    label: "Reject — back to Paper HELD",
    writes: "exit denied; the deployment returns to Paper HELD and the reason is recorded",
  },
};

/**
 * Findings render through `EvidencePanel`, the component DS §9 assigns to this
 * screen. The link slot is the reason: an evidence row that states a verdict
 * without linking what produced it is an opinion, and this screen decides a
 * promotion.
 *
 * The one thing carried alongside is where an `insufficient` finding goes next,
 * which is a claim about the future rather than about the evidence and so does
 * not belong inside the row.
 */
function Findings({ panel }: { panel: EvidencePanelSpec }) {
  if (panel.status && panel.status !== "ok") {
    return <PanelState status={panel.status} reason={panel.reason} />;
  }
  const rows: EvidenceRow[] = panel.findings.map((f) => ({
    label: f.label,
    mark: f.outcome,
    evidence: f.href
      ? { label: f.sourceLabel ?? "check source", href: f.href }
      : undefined,
  }));
  const carried = panel.findings.filter((f) => f.outcome === "insufficient" && f.carriesTo);
  const unlinked = panel.findings.filter((f) => !f.href).length;
  return (
    <>
      <EvidencePanel rows={rows} />
      {carried.map((f) => (
        <div className="exec-exit-carries" key={f.label}>
          {f.label} carries into {f.carriesTo}
        </div>
      ))}
      {unlinked > 0 ? (
        <div className="exec-exit-unlinked">
          {unlinked} {unlinked === 1 ? "finding has" : "findings have"} no source link
        </div>
      ) : null}
    </>
  );
}

export function PaperExitReview({
  eligibility,
  reviewId,
  subject,
  promoteTo,
  gateMet,
  gateSummary,
  policyId,
  lineage,
  rail: rail_,
  conditions,
  quorumMet,
  quorumRequired,
  approverRole,
  sla,
  panels,
  activationPlan,
  plan,
  recommendation,
  status = "ok",
  reason,
  partialReason,
  decided,
  onDecide,
  onCopyProvenance,
  trail,
  demo,
}: {
  reviewId: ApprovalId;
  deploymentId: DeploymentId;
  /** `Grid v2.1 · dep_94 · DERIBIT` */
  subject: string;
  /** `SANDBOX_VALIDATION` */
  promoteTo: string;
  /**
   * Server-evaluated. Never derived from the coverage numbers below: the policy
   * may require more than they show.
   */
  gateMet: boolean;
  /** `30 / 30 days · 312 / 300 trades · 2 / 2 restart cycles` */
  gateSummary?: string;
  policyId?: string;
  /**
   * artifact · R1 · R2 · observation policy · evidence-pack digest (§5).
   * The chain that says what this promotion rests on; without it the reviewer
   * is asked to trust four earlier decisions they cannot see.
   */
  lineage?: readonly { label: string; value: string; href?: string | null }[];
  /**
   * The promotion rail. DS §4 lists exit reviews among LifecycleRail's users
   * and the hi-fi draws it: `R1 ✓ AP-118 → R2 ✓ AP-152 → PAPER ● 30/30 →
   * SANDBOX — → CANARY — → LIVE —`. It is what tells a reviewer where this
   * promotion sits in a chain rather than as an isolated decision.
   */
  rail?: readonly RailStep[];
  /** Typed conditions carried into or attached by this review (DS §4). */
  conditions?: readonly TypedCondition[];
  quorumMet: number;
  quorumRequired: number;
  approverRole?: string;
  sla?: Sla;
  /** The 2×2. Four panels by convention; the grid takes any number. */
  panels: readonly EvidencePanelSpec[];
  activationPlan?: ReactNode;
  /** `governance.paper-exit.v1` activation_plan — PREVIEW_ONLY, structured. */
  plan?: { mode: string; targetStage: string; authoritySemantics: string; externalSideEffectRequested: boolean } | null;
  /** Server's recommended next eligible action, not the client's guess. */
  recommendation?: string;
  status?: PanelStatus;
  reason?: string;
  partialReason?: string;
  decided?: { outcome: ExitOutcome; by: string; at: string } | null;
  /** What the server says this actor may do. Absent is not permission. */
  eligibility?: Eligibility | null;
  onDecide?: (outcome: ExitOutcome) => void;
  /** provenance drawer Copy — simulated control, through the ledger */
  onCopyProvenance: (full: string) => void;
  /** DecisionTrail from the container while a decision is in flight. */
  trail?: ReactNode;
  demo?: PaperDemo | null;
}) {
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);
  const smoke = demo ?? null;
  if (status !== "ok" && status !== "partial" && status !== "stale") {
    return (
      <section className="exec-exit" aria-label={`Paper exit review ${reviewId}`}>
        <div className="exec-gate-kicker">PAPER_EXIT · {reviewId}</div>
        <PanelState status={status} reason={reason ?? "This review cannot be shown."} />
      </section>
    );
  }

  const blocking = panels.flatMap((p) => p.findings).filter((f) => f.outcome === "fail").length;

  // A panel that could not be read contributes NO findings, and zero blocking
  // findings reads as "nothing blocks". That is the quiet failure this screen
  // is most exposed to: an unavailable risk panel and a clean risk panel look
  // identical to the promote button.
  //
  // `ok` and `empty` are answers — "here is the evidence" and "we looked and
  // there is none". Every other state means the question was not answered, and
  // an unanswered question cannot support a promotion.
  const unread = panels.filter((p) => p.status != null && p.status !== "ok" && p.status !== "empty");
  const carried = panels
    .flatMap((p) => p.findings)
    .filter((f) => f.outcome === "insufficient" && f.carriesTo);

  // Two different reasons a button can be dead, and they are not
  // interchangeable.
  //
  //   * The GATE is evidence: the observation window is short, a finding
  //     blocks. It stops promotion and nothing else — a reviewer looking at an
  //     unmet gate must still be able to extend or reject, because those are
  //     the two responses an unmet gate calls for.
  //   * AUTHORITY is the server's verdict on this actor. It can stop any of the
  //     three, including extend and reject. This screen used to treat those two
  //     as unconditionally safe, which is true of their effect and false of
  //     their permission: the requester deciding their own review is a
  //     separation-of-duties violation whichever branch they pick.
  //
  // So the gate gates promotion, and eligibility gates all three.
  //
  // Evidence that is partial or stale at the review level blocks promotion for
  // the same reason: the screen already says "absence of a finding is not a
  // pass", and leaving the button live contradicts its own banner.
  const evidenceIncomplete = status === "partial" || status === "stale" || unread.length > 0;
  const serverAllowsPromote = eligibility?.canApprove === true;
  const promoteBlocked = !gateMet || blocking > 0 || !serverAllowsPromote || evidenceIncomplete;
  const extendBlocked = eligibility?.canExtendObservation !== true;
  const rejectBlocked = eligibility?.canReject !== true;

  // Absent eligibility and a refusal look the same to a reader, so say which.
  const sodViolation = eligibility?.separationOfDuties === "VIOLATION";
  const authorityNote = !eligibility
    ? "No eligibility was published for this review, so no decision is offered. This is a missing answer, not a refusal."
    : sodViolation
      ? "Separation of duties — you may not decide a review you requested."
      : null;

  const decisionReasons: string[] = [];
  if (authorityNote) decisionReasons.push(authorityNote);
  if (!gateMet) decisionReasons.push("Promotion blocked — the observation gate is not met.");
  if (blocking > 0)
    decisionReasons.push(`Promotion blocked — ${blocking} blocking ${blocking === 1 ? "finding" : "findings"}.`);
  if (unread.length > 0)
    decisionReasons.push(
      `Promotion blocked — ${unread.length === 1 ? "this panel" : "these panels"} could not be read: ${unread
        .map((p) => p.title)
        .join(", ")}. Extending or rejecting stays available.`,
    );
  if (status === "partial" && unread.length === 0)
    decisionReasons.push("Promotion blocked — part of this evidence could not be read.");
  if (status === "stale")
    decisionReasons.push("Promotion blocked — this evidence is stale. Reload before deciding a promotion.");
  if (gateMet && blocking === 0 && !evidenceIncomplete && !serverAllowsPromote && !authorityNote)
    decisionReasons.push("Promotion blocked — you do not hold authority to approve this promotion.");
  if (extendBlocked && !authorityNote)
    decisionReasons.push("Extending the observation window is not available to you.");
  if (rejectBlocked && !authorityNote) decisionReasons.push("Rejecting to PAPER_HELD is not available to you.");
  const badges: HeaderBadge[] = [
    { label: "PAPER_EXIT", axis: "stage" },
    { label: gateMet ? "GATE MET" : "GATE UNMET", axis: "readiness", tone: gateMet ? "good" : "warn" },
    ...(status === "stale" ? [{ label: "STALE", axis: "broker-sync", tone: "bad" } as HeaderBadge] : []),
    ...(status === "partial" ? [{ label: "PARTIAL", axis: "broker-sync", tone: "warn" } as HeaderBadge] : []),
  ];
  const blockers: RailBlocker[] = [
    ...panels
      .flatMap((p) => p.findings)
      .filter((f) => f.outcome === "fail")
      .map((f) => ({ label: f.label, detail: f.sourceLabel ?? null, severity: "blocking" as const })),
    ...carried.map((f) => ({ label: f.label, detail: `follows the deployment into ${f.carriesTo}`, severity: "watch" as const })),
    ...unread.map((p) => ({ label: `${p.title} not read`, detail: p.status ?? null, severity: "blocking" as const })),
  ];
  const decision = decided ? (
    <div className="exec-gate-banner exec-gate-decided" role="status">
      {EXIT_OUTCOME[decided.outcome].label} by {decided.by} at {decided.at}.{" "}
      {EXIT_OUTCOME[decided.outcome].writes}.
    </div>
  ) : (
    <div className="exec-gate-decision">
      <button
        type="button"
        className="exec-role-control exec-btn-apply"
        disabled={promoteBlocked}
        onClick={() => onDecide?.("PROMOTE")}
      >
        {EXIT_OUTCOME.PROMOTE.label}
      </button>
      {/* Not blocked by the gate — blocked only by authority. */}
      <button
        type="button"
        className="exec-role-control exec-btn-ghost"
        disabled={extendBlocked}
        onClick={() => onDecide?.("EXTEND_OBSERVATION")}
      >
        {EXIT_OUTCOME.EXTEND_OBSERVATION.label}
      </button>
      <button
        type="button"
        className="exec-role-control exec-btn-ghost"
        disabled={rejectBlocked}
        onClick={() => onDecide?.("REJECT")}
      >
        {EXIT_OUTCOME.REJECT.label}
      </button>
    </div>
  );
  const contextRail = (
    <ExecutionContextRail
      next={{
        title: decided ? "Decided" : `Decide: promote to ${promoteTo}?`,
        detail: (
          <>
            {recommendation ? (
              <div className="exec-exit-recommendation">Recommended next action: {recommendation}</div>
            ) : null}

          </>
        ),
        action: decided ? decision : undefined,
      }}
      blockers={blockers}
      freshness={
        <span className="exec-role-meta">
          quorum {quorumMet}/{quorumRequired}
          {approverRole ? ` · needs you (${approverRole})` : ""}
          {sla ? (
            <>
              {" · "}
              <SlaCell sla={sla} />
            </>
          ) : null}
        </span>
      }
      provenance={
        lineage?.length && !smoke ? (
          <ExecutionProvenanceDrawer
            items={lineage.map((l) => ({
              label: l.label,
              short: l.value.startsWith("sha256:") ? shortDigest(l.value) : l.value,
              full: l.value.startsWith("sha256:") ? l.value : null,
              href: l.href ?? null,
            }))}
            onCopy={onCopyProvenance}
          />
        ) : undefined
      }
    />
  );
  return (
    <section className={smoke ? "exec-exit exec-px exec-gov" : "exec-exit exec-gov"} data-hifi-exact={smoke ? "paper-exit-review" : undefined} aria-label={`Paper exit review ${reviewId}`}>
      <ExecutionWorkspace layout="balanced" rail={contextRail}>
        {smoke ? (
          <>
            {/* The hi-fi asks the decision in the title: EX-771 — Grid v2.1 ·
                dep_94 · DERIBIT → promote to SANDBOX_VALIDATION? */}
            <header className="exec-masthead exec-px-masthead">
              <span className="exec-px-kind">PAPER_EXIT</span>
              <div className="exec-px-h1" role="heading" aria-level={1}>
                {reviewId} <span className="exec-px-dim">—</span> {subject}{" "}
                <span className="exec-px-dim">→ promote to</span> {promoteTo}?
              </div>
              <span className="exec-px-gate" data-tone={gateMet ? "good" : "warn"}>{gateMet ? "GATE MET" : "GATE UNMET"}</span>
              {status === "stale" ? <span className="exec-px-gate" data-tone="bad">STALE</span> : null}
              {status === "partial" ? <span className="exec-px-gate" data-tone="warn">PARTIAL</span> : null}
              <span className="exec-px-wf">WF 4b</span>
              {/* Full coverage can sit beside an unmet gate: the policy knows
                  things these numbers do not show, so they stay on the
                  masthead and never become the verdict. */}
              {gateSummary ? <span className="exec-px-summary">{gateSummary}</span> : null}
            </header>
            <div className="exec-px-meta">
              {lineage?.map((l, i) => {
                const digest = l.value.startsWith("sha256:");
                const shown = digest ? shortDigest(l.value) : l.value;
                const firstDigest = digest && lineage.findIndex((e) => e.value.startsWith("sha256:")) === i;
                return (
                  <span key={l.label}>
                    {l.label} {l.href ? <a href={l.href}>{shown}</a> : <b>{shown}</b>}
                    {/* The full digest is never printed — head-6/tail-2 on
                        screen, the whole thing on the clipboard. */}
                    {firstDigest ? (
                      // A control that leaves no trace reads as broken. The
                      // clipboard is the effect; the label is the receipt.
                      <button
                        type="button"
                        className="exec-px-copy"
                        data-copied={copied ? "true" : undefined}
                        onClick={() => { onCopyProvenance(l.value); setCopied(true); }}
                      >
                        {copied ? "Copied · full digest" : "Copy"}
                      </button>
                    ) : null}
                  </span>
                );
              })}
              {/* Only when the lineage did not already say it — the hi-fi prints
                  the policy once, and so does the contract. */}
              {policyId && !lineage?.some((l) => l.value === policyId) ? <span>observation policy <b>{policyId}</b></span> : null}
              <span className="exec-px-spacer" />
              <span className="exec-px-quorum">
                quorum {quorumMet}/{quorumRequired}
                {approverRole ? ` · needs you (${approverRole})` : ""}
                {sla ? <> · SLA <SlaCell sla={sla} /> remaining</> : null}
              </span>
            </div>
          </>
        ) : (
          <ExecutionPageHeader
            title={subject}
            id={reviewId}
            badges={badges}
            purpose={gateSummary ?? undefined}
            secondary={policyId ? <span className="exec-role-meta">observation policy {policyId}</span> : undefined}
          />
        )}
        {status === "partial" ? (
          <div className="exec-gate-banner" role="status">
            {partialReason ?? "Part of this evidence could not be read. Absence of a finding is not a pass."}
          </div>
        ) : null}
        {status === "stale" ? (
          <div className="exec-gate-banner" role="status">
            {reason ?? "This evidence is older than its freshness budget. Refresh before deciding."}
          </div>
        ) : null}
        {rail_?.length ? <LifecycleRail steps={rail_} /> : null}
        <ExecutionDecisionStrip
          metrics={[
            { label: "Blocking findings", value: String(blocking), tone: blocking > 0 ? "bad" : "good" },
            { label: "Carried questions", value: String(carried.length), tone: carried.length > 0 ? "warn" : undefined },
            { label: "Quorum", value: `${quorumMet}/${quorumRequired}` },
            { label: "Conditions", value: String(conditions?.length ?? 0) },
            {
              label: "Panels read",
              value: `${panels.length - unread.length}/${panels.length}`,
              note: unread.length ? "not all read" : null,
            },
          ]}
        />
        {carried.length > 0 ? (
          <p className="exec-exit-carry-note exec-role-body">
            {carried.length} carried {carried.length === 1 ? "question follows" : "questions follow"} into {carried[0].carriesTo} — promotion does not resolve {carried.length === 1 ? "it" : "them"}.
          </p>
        ) : null}
        <>
            <div className="exec-px-grid" data-cols="auto">
              {panels.map((panel) => (
                <div className="exec-gate-panel exec-px-panel" key={panel.title}>
                  <ExecutionSectionTitle>
                    {panel.title}
                    {panel.source ? <span className="exec-gate-rc"> · {panel.source}</span> : null}
                  </ExecutionSectionTitle>
                  <Findings panel={panel} />
                </div>
              ))}
            </div>
            <div className="exec-px-grid" data-cols="two">
              {plan || activationPlan ? (
                <div className="exec-gov-inverse exec-gate-panel exec-px-panel exec-px-plan">
                  <ExecutionSectionTitle>Sandbox activation plan — preview</ExecutionSectionTitle>
                  {plan ? (
                    <div className="exec-gov-kv" data-flush="true">
                      <span className="exec-gov-k">mode</span>
                      <span className="exec-gov-v">{plan.mode}</span>
                      <span className="exec-gov-k">target stage</span>
                      <span className="exec-gov-v">{plan.targetStage}</span>
                      <span className="exec-gov-k">authority</span>
                      <span className="exec-gov-v">{plan.authoritySemantics.replace(/_/g, " ").toLowerCase()}</span>
                      <span className="exec-gov-k">external side effect</span>
                      <span className="exec-gov-v">{plan.externalSideEffectRequested ? "REQUESTED" : "none requested"}</span>
                    </div>
                  ) : (
                    activationPlan
                  )}
                  {smoke ? <p className="exec-px-plannote">{smoke.exit.planNote}</p> : null}
                </div>
              ) : (
                <div className="exec-gate-panel exec-px-panel">
                  <ExecutionSectionTitle>Sandbox activation plan — preview</ExecutionSectionTitle>
                  <PanelState status="empty" reason="No activation plan was published for this review." />
                </div>
              )}
              <div className="exec-gate-panel exec-px-panel">
                <ExecutionSectionTitle>Conditions &amp; recommendation <a className="exec-gov-headlink" href="/governance/waivers">fleet-wide →</a></ExecutionSectionTitle>
                <ConditionList conditions={conditions ?? []} emptyNote="No conditions carried into this review." />
                {recommendation ? (
                  <p className="exec-px-recommend"><b>Recommended next action:</b> {recommendation}</p>
                ) : null}
                <label className="exec-px-note">
                  <span className="exec-px-notelabel">Reviewer note</span>
                  <textarea
                    className="exec-px-notebox"
                    value={note}
                    rows={2}
                    placeholder="Recorded with the decision — it is not sent on its own."
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>
              </div>
            </div>
        </>
        {smoke ? <p className="exec-af-smoke">! {smoke.warning}</p> : null}
        <ExecutionDecisionBar
          label={`Paper exit decision ${reviewId}`}
          verdict={decided ? EXIT_OUTCOME[decided.outcome].label : promoteBlocked && extendBlocked && rejectBlocked ? "BLOCKED" : promoteBlocked ? "PROMOTE BLOCKED" : "READY"}
          tone={decided ? "good" : promoteBlocked && extendBlocked && rejectBlocked ? "bad" : promoteBlocked ? "warn" : "good"}
          reasons={decided ? [] : decisionReasons}
          footnote={<>promote → {promoteTo} · {EXIT_OUTCOME.EXTEND_OBSERVATION.label} · reject → PAPER_HELD · decision writes an immutable record</>}
          trail={trail}
          actions={decided ? null : decision}
        />
      </ExecutionWorkspace>
    </section>
  );
}
