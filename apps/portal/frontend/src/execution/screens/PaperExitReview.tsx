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

import type { ApprovalId, DeploymentId, EvidenceMark, PanelStatus, Sla } from "../contracts";
import { StatusChip } from "../components/badges";
import { SlaCell } from "../components/evidence";
import { PanelState } from "../components/states";

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

const MARK_TONE: Record<EvidenceMark, "good" | "warn" | "bad" | "mute"> = {
  pass: "good",
  watch: "warn",
  fail: "bad",
  insufficient: "mute",
};

const MARK_LABEL: Record<EvidenceMark, string> = {
  pass: "PASS",
  watch: "WATCH",
  fail: "FAIL",
  insufficient: "INSUFFICIENT_DATA",
};

function Findings({ panel }: { panel: EvidencePanelSpec }) {
  if (panel.status && panel.status !== "ok") {
    return <PanelState status={panel.status} reason={panel.reason} />;
  }
  return (
    <ul className="exec-exit-findings">
      {panel.findings.map((f) => (
        <li key={f.label} data-outcome={f.outcome}>
          <StatusChip label={MARK_LABEL[f.outcome]} tone={MARK_TONE[f.outcome]} />
          <span>{f.label}</span>
          {/* An unanswered question that follows the deployment forward is
              stated here so it is not lost between two screens. */}
          {f.outcome === "insufficient" && f.carriesTo ? (
            <span className="exec-exit-carries">carries into {f.carriesTo}</span>
          ) : null}
          {f.href ? (
            <a className="exec-exit-source" href={f.href}>
              {f.sourceLabel ?? "check source"} →
            </a>
          ) : (
            // Stated, not omitted. An unlinked number on a promotion screen is
            // the difference between evidence and an assertion.
            <span className="exec-exit-unlinked">no source link</span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function PaperExitReview({
  reviewId,
  deploymentId,
  subject,
  promoteTo,
  gateMet,
  gateSummary,
  policyId,
  lineage,
  quorumMet,
  quorumRequired,
  approverRole,
  sla,
  panels,
  activationPlan,
  conditions,
  recommendation,
  status = "ok",
  reason,
  partialReason,
  decided,
  onDecide,
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
  quorumMet: number;
  quorumRequired: number;
  approverRole?: string;
  sla?: Sla;
  /** The 2×2. Four panels by convention; the grid takes any number. */
  panels: readonly EvidencePanelSpec[];
  activationPlan?: ReactNode;
  conditions?: ReactNode;
  /** Server's recommended next eligible action, not the client's guess. */
  recommendation?: string;
  status?: PanelStatus;
  reason?: string;
  partialReason?: string;
  decided?: { outcome: ExitOutcome; by: string; at: string } | null;
  onDecide?: (outcome: ExitOutcome) => void;
}) {
  if (status !== "ok" && status !== "partial" && status !== "stale") {
    return (
      <section className="exec-exit" aria-label={`Paper exit review ${reviewId}`}>
        <div className="exec-gate-kicker">PAPER_EXIT · {reviewId}</div>
        <PanelState status={status} reason={reason ?? "This review cannot be shown."} />
      </section>
    );
  }

  const blocking = panels.flatMap((p) => p.findings).filter((f) => f.outcome === "fail").length;
  const carried = panels
    .flatMap((p) => p.findings)
    .filter((f) => f.outcome === "insufficient" && f.carriesTo);

  // Promotion needs the server's gate AND no blocking finding. Extend and
  // reject are always available: a reviewer looking at an unmet gate must be
  // able to act on it, and both of those actions are safe.
  const promoteBlocked = !gateMet || blocking > 0;

  return (
    <section className="exec-exit" aria-label={`Paper exit review ${reviewId}`}>
      <header className="exec-gate-head">
        <div className="exec-gate-kicker">PAPER_EXIT · {reviewId}</div>
        <div className="exec-tile-title">
          {subject} <span className="exec-gate-rc">→ promote to {promoteTo}?</span>
        </div>
        <div className="exec-gate-meta">
          <StatusChip label={gateMet ? "GATE MET" : "GATE UNMET"} tone={gateMet ? "good" : "warn"} />
          <span>{deploymentId}</span>
          {policyId ? <span>observation policy {policyId}</span> : null}
          <span>
            quorum {quorumMet}/{quorumRequired}
          </span>
          {approverRole ? <span>needs you ({approverRole})</span> : null}
          {sla ? <SlaCell sla={sla} /> : null}
        </div>
        {gateSummary ? <div className="exec-exit-summary">{gateSummary}</div> : null}
        {lineage?.length ? (
          <div className="exec-exit-lineage">
            {lineage.map((l) => (
              <span key={l.label}>
                <span className="exec-exit-lineage-label">{l.label}</span>{" "}
                {l.href ? <a href={l.href}>{l.value}</a> : l.value}
              </span>
            ))}
          </div>
        ) : null}
      </header>

      {status === "partial" ? (
        <div className="exec-gate-banner">
          {partialReason ?? "Part of this evidence could not be read. Absence of a finding is not a pass."}
        </div>
      ) : null}
      {status === "stale" ? (
        <div className="exec-gate-banner">
          {reason ?? "This evidence is older than its freshness budget. Refresh before deciding."}
        </div>
      ) : null}

      {decided ? (
        <div className="exec-gate-banner exec-gate-decided">
          {EXIT_OUTCOME[decided.outcome].label} by {decided.by} at {decided.at}.{" "}
          {EXIT_OUTCOME[decided.outcome].writes}.
        </div>
      ) : null}

      <div className="exec-exit-grid">
        {panels.map((panel) => (
          <div className="exec-gate-panel" key={panel.title}>
            <div className="exec-tile-title">
              {panel.title}
              {panel.source ? <span className="exec-gate-rc"> · {panel.source}</span> : null}
            </div>
            <Findings panel={panel} />
          </div>
        ))}
      </div>

      {activationPlan ? <div className="exec-gate-panel">{activationPlan}</div> : null}
      {conditions ? <div className="exec-gate-panel">{conditions}</div> : null}

      {carried.length > 0 ? (
        <div className="exec-exit-carry-note">
          {carried.length} unanswered {carried.length === 1 ? "question" : "questions"} will follow
          this deployment into {carried[0].carriesTo}. Promotion does not resolve them.
        </div>
      ) : null}

      {decided ? null : (
        <div className="exec-gate-decision">
          <button
            type="button"
            className="exec-btn-apply"
            disabled={promoteBlocked}
            onClick={() => onDecide?.("PROMOTE")}
          >
            {EXIT_OUTCOME.PROMOTE.label}
          </button>
          {/* Never blocked. A reviewer facing an unmet gate must be able to act,
              and extending or rejecting are both safe from any state. */}
          <button type="button" className="exec-btn-ghost" onClick={() => onDecide?.("EXTEND_OBSERVATION")}>
            {EXIT_OUTCOME.EXTEND_OBSERVATION.label}
          </button>
          <button type="button" className="exec-btn-ghost" onClick={() => onDecide?.("REJECT")}>
            {EXIT_OUTCOME.REJECT.label}
          </button>
        </div>
      )}

      {promoteBlocked && !decided ? (
        <div className="exec-disabled-reason">
          {!gateMet ? "Promotion blocked — the observation gate is not met. " : null}
          {blocking > 0
            ? `Promotion blocked — ${blocking} blocking ${blocking === 1 ? "finding" : "findings"}.`
            : null}
        </div>
      ) : null}

      {recommendation ? (
        <div className="exec-exit-recommendation">Recommended next action: {recommendation}</div>
      ) : null}
    </section>
  );
}
