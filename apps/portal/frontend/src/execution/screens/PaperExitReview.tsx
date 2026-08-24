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
import { ExecutionSurface } from "../ExecutionSurface";
import { PanelState } from "../components/states";
import { useState } from "react";
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

type ExitTab = "evidence" | "plan" | "conditions";

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
  deploymentId,
  subject,
  promoteTo,
  gateMet,
  gateSummary,
  policyId,
  lineage,
  rail: rail_,
  activationPlanDark = true,
  conditions,
  quorumMet,
  quorumRequired,
  approverRole,
  sla,
  panels,
  activationPlan,
  recommendation,
  status = "ok",
  reason,
  partialReason,
  decided,
  onDecide,
  onCopyProvenance,
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
  /** The activation plan is the screen's one inverted card (hi-fi 4b). */
  activationPlanDark?: boolean;
  /** Typed conditions carried into or attached by this review (DS §4). */
  conditions?: readonly TypedCondition[];
  quorumMet: number;
  quorumRequired: number;
  approverRole?: string;
  sla?: Sla;
  /** The 2×2. Four panels by convention; the grid takes any number. */
  panels: readonly EvidencePanelSpec[];
  activationPlan?: ReactNode;
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
}) {
  const [tab, setTab] = useState<ExitTab>("evidence");
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
            {!decided && decisionReasons.length ? (
              <div className="exec-disabled-reason">
                {decisionReasons.map((r) => (
                  <div key={r}>{r}</div>
                ))}
              </div>
            ) : null}
          </>
        ),
        action: decision,
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
        lineage?.length ? (
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
    <section className="exec-exit" aria-label={`Paper exit review ${reviewId}`}>
      <ExecutionWorkspace layout="balanced" rail={contextRail}>
        <ExecutionPageHeader
          title={subject}
          id={reviewId}
          badges={badges}
          purpose={`Promote ${deploymentId} to ${promoteTo}? ${gateSummary ?? ""}`.trim()}
          secondary={policyId ? <span className="exec-role-meta">observation policy {policyId}</span> : undefined}
        />
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
            {carried.length} unanswered {carried.length === 1 ? "question" : "questions"} will follow this
            deployment into {carried[0].carriesTo}. Promotion does not resolve them.
          </p>
        ) : null}
        <ExecutionTabs
          tabs={[
            { key: "evidence", label: "Evidence", count: panels.length },
            { key: "plan", label: "Activation plan" },
            { key: "conditions", label: "Conditions", count: conditions?.length ?? 0 },
          ]}
          active={tab}
          onChange={(key) => setTab(key as ExitTab)}
          label="Exit review sections"
        >
          {tab === "evidence" ? (
            <div className="exec-grid-auto">
              {panels.map((panel) => (
                <div className="exec-gate-panel" key={panel.title}>
                  <ExecutionSectionTitle>
                    {panel.title}
                    {panel.source ? <span className="exec-gate-rc"> · {panel.source}</span> : null}
                  </ExecutionSectionTitle>
                  <Findings panel={panel} />
                </div>
              ))}
            </div>
          ) : null}
          {tab === "plan" ? (
            activationPlan ? (
              activationPlanDark ? (
                <ExecutionSurface kind="deployments" className="exec-inverted exec-gate-panel">
                  {activationPlan}
                </ExecutionSurface>
              ) : (
                <div className="exec-gate-panel">{activationPlan}</div>
              )
            ) : (
              <PanelState status="empty" reason="No activation plan was published for this review." />
            )
          ) : null}
          {tab === "conditions" ? (
            <div className="exec-gate-panel">
              <ExecutionSectionTitle>Conditions &amp; recommendation</ExecutionSectionTitle>
              <ConditionList conditions={conditions ?? []} emptyNote="No conditions carried into this review." />
            </div>
          ) : null}
        </ExecutionTabs>
      </ExecutionWorkspace>
    </section>
  );
}
