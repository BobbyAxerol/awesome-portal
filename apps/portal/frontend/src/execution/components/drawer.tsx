/**
 * CommandPlanDrawer — plan → apply → verify, the only path to a mutation.
 *
 * Spec §14.3 and guide §6: approvals grant authority, they do not execute.
 * Every button that changes state anywhere in the Execution Loop routes through
 * this component, which enforces four things the hi-fi shows and a hand-rolled
 * form would quietly drop:
 *
 *   1. Apply is unreachable until a plan exists, and the plan expires.
 *   2. A reason is required and travels with the operation into the audit log.
 *   3. The equivalent CLI is displayed, never executed — the browser has no
 *      shell (guide §5).
 *   4. `202` opens the verify timeline; it does not close the drawer as
 *      success. PARTIAL never renders green.
 *
 * Phase 0 builds the shell and its state machine. Phase 6 wires it to
 * control-api.
 */
import { useState } from "react";

import type { DeliveryProfile, OperationStatus, RiskTier, VerificationResult } from "../contracts";
import { isSettled, newRequestKey } from "../adapter";
import {
  commandBlockedReason,
  commandProfileInconsistency,
  type DeliveryPolicy,
} from "../profile";
import { OperationStatusChip, VerificationChip } from "./badges";

export type DrawerStep = "plan" | "apply" | "verify";

export interface CommandPlan {
  /** Plan handle, e.g. `cmd_9f12`. */
  id: string;
  /** Seconds until the plan expires; apply must be blocked past it. */
  expiresInSeconds: number;
  /** Exact request the apply will send, as the CLI prints it. */
  requestPreview: string;
  /** Display-only equivalent CLI invocation. */
  equivalentCli: string;
  /** Policy checks; a warning does not block, a failure does. */
  checks: readonly { label: string; outcome: "pass" | "warning" | "fail" }[];
}

export interface VerifyEntry {
  label: string;
  status: OperationStatus;
}

const STEP_LABEL: Record<DrawerStep, string> = {
  plan: "PLAN",
  apply: "APPLY",
  verify: "VERIFY",
};

const STEPS: readonly DrawerStep[] = ["plan", "apply", "verify"];

/**
 * What each tier demands, in the operator's words (master plan §9.2).
 *
 * R3 and R4 are described separately rather than as "live commands" because
 * they are two different permissions: protecting a position and enlarging one.
 */
const RISK_TIER_NOTE: Record<RiskTier, string> = {
  R0: "Read. Normal session and scope check.",
  R1: "Paper operational command. Reason, fresh projection, idempotency, audit.",
  R2: "Sandbox promotion or certification. Fresh auth, evidence gate, second approver.",
  R3: "Live PROTECTIVE action such as halt or reduce. Phishing-resistant step-up, one-operation token.",
  R4: "Live RISK-INCREASING action such as enable or expand. WebAuthn, dual approval, envelope constraints.",
};

export function CommandPlanDrawer({
  title,
  meta,
  plan,
  step,
  verifyEntries,
  outcome,
  danger = false,
  confirmWord,
  riskTier,
  policy,
  dataProfile,
  freshAuthSatisfied = true,
  secondApproverSatisfied = true,
  verification,
  outstandingUncertain = false,
  replannedAfterUncertain = false,
  requestKey,
  conflict = false,
  onGeneratePlan,
  onApply,
}: {
  title: string;
  /** Identity line: what this command will touch. */
  meta?: string;
  plan?: CommandPlan | null;
  step: DrawerStep;
  verifyEntries?: readonly VerifyEntry[];
  /** Terminal outcome once verify settles. */
  outcome?: "VERIFIED" | "PARTIAL" | "FAILED" | null;
  /** Destructive commands require a typed confirmation word. */
  danger?: boolean;
  confirmWord?: string;
  /** Master plan §9.2. Decides which controls Apply demands. */
  riskTier?: RiskTier;
  /** Registry revision 4 delivery policy for the screen this drawer sits on. */
  policy?: DeliveryPolicy | null;
  /**
   * Profile of the data on the surrounding screen. Used ONLY to report an
   * inconsistency — never to grant or withhold permission. See profile.ts.
   */
  dataProfile?: DeliveryProfile | null;
  /** R2+ requires re-authentication within the policy window. */
  freshAuthSatisfied?: boolean;
  /** R2 and R4 require a second person. Separation of duties, §5.1. */
  secondApproverSatisfied?: boolean;
  /** What verify observed. A second axis from the operation's workflow status. */
  verification?: VerificationResult | null;
  /** An UNCERTAIN operation is outstanding against the same target (§7.3). */
  outstandingUncertain?: boolean;
  /** The current plan was regenerated against fresh authority after that. */
  replannedAfterUncertain?: boolean;
  /** BR-EX-18. Belongs to the intent, not the click; reused across retries. */
  requestKey?: string;
  /** The server returned 409: this key was reused with a different payload. */
  conflict?: boolean;
  onGeneratePlan?: () => void;
  onApply?: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  // Generated once for this intent and kept across every retry. Regenerating it
  // per click is what turns one intent into three operations.
  const [ownKey] = useState(() => requestKey ?? newRequestKey());
  const key = requestKey ?? ownKey;

  const blockingCheck = plan?.checks.find((check) => check.outcome === "fail");
  const expired = plan ? plan.expiresInSeconds <= 0 : false;
  const confirmed = !confirmWord || confirmation === confirmWord;
  const reasonGiven = reason.trim().length > 0;

  // The registry's delivery policy is checked before anything the operator can
  // influence. A command the backend has switched off is not a form to fill in
  // correctly, and presenting it as one wastes the operator's time and teaches
  // them that blockers are negotiable.
  const policyBlock = riskTier ? commandBlockedReason(policy ?? null, riskTier) : null;

  // R2 and above demand controls the operator cannot type their way past. R3
  // and R4 are deliberately not one ladder: R3 is protective (halt, reduce) and
  // R4 is risk-increasing (enable, expand), so a step-up satisfied for an
  // emergency halt must never carry into a capital expansion (§9.2).
  const needsFreshAuth = riskTier === "R2" || riskTier === "R3" || riskTier === "R4";
  const needsSecondApprover = riskTier === "R2" || riskTier === "R4";

  // Every condition is reported to the operator, not just the first: a button
  // that says only "disabled" makes them guess which of four things to fix.
  const blockers: string[] = [];
  if (policyBlock) blockers.push(policyBlock);
  if (!plan) blockers.push("generate a plan first");
  if (expired) blockers.push("plan expired — generate a new one");
  if (blockingCheck) blockers.push(`policy check failed: ${blockingCheck.label}`);
  if (needsFreshAuth && !freshAuthSatisfied) {
    blockers.push(
      riskTier === "R4"
        ? "re-authenticate with a security key (WebAuthn) — required for a risk-increasing live command"
        : "re-authenticate — this tier requires fresh authentication",
    );
  }
  if (needsSecondApprover && !secondApproverSatisfied) {
    blockers.push("a second approver is required — the requester cannot approve their own command");
  }
  // BR-EX-21 as ruled. An UNCERTAIN result means the external effect may have
  // happened and we cannot tell. Re-issuing a risk-increasing command in that
  // state could double a position, so it blocks outright. A protective command
  // does not blanket-block — refusing to let an operator halt something because
  // an earlier halt is unresolved is the failure mode that costs the most — but
  // it must be replanned against fresh authority first.
  if (outstandingUncertain) {
    const protective = riskTier === "R3";
    if (!protective) {
      blockers.push(
        "an UNCERTAIN operation is outstanding against this target — a risk-increasing command is blocked until it is reconciled",
      );
    } else if (!replannedAfterUncertain) {
      blockers.push(
        "an UNCERTAIN operation is outstanding — regenerate the plan against fresh authority before applying a protective command",
      );
    }
  }
  if (conflict) {
    blockers.push(
      "this request key was already used with a different payload (409) — start a new command rather than editing this one",
    );
  }
  if (!reasonGiven) blockers.push("a reason is required");
  if (!confirmed) blockers.push(`type ${confirmWord} to confirm`);

  const applyDisabled = blockers.length > 0;

  // Reported, never acted on. Permission comes from delivery_policy alone; this
  // client does not invent an authorization rule out of a display field.
  const profileInconsistency = riskTier
    ? commandProfileInconsistency(dataProfile, policy ?? null, riskTier)
    : null;

  return (
    <section className="exec-drawer" aria-label={title}>
      <header>
        <div className="exec-tile-title">
          {title}
          {riskTier ? (
            <span className="exec-drawer-tier" data-tier={riskTier} title={RISK_TIER_NOTE[riskTier]}>
              {riskTier}
            </span>
          ) : null}
        </div>
        {meta ? <div className="exec-drawer-note">{meta}</div> : null}
      </header>

      <div className="exec-drawer-steps" role="list">
        {STEPS.map((candidate) => (
          <div
            key={candidate}
            role="listitem"
            className="exec-drawer-step"
            data-state={
              candidate === step
                ? "current"
                : STEPS.indexOf(candidate) < STEPS.indexOf(step)
                  ? "done"
                  : "pending"
            }
          >
            {STEP_LABEL[candidate]}
          </div>
        ))}
      </div>

      {plan ? (
        <>
          <div className="exec-drawer-note">
            plan <strong>{plan.id}</strong> ·{" "}
            {expired ? "expired" : `expires ${plan.expiresInSeconds}s`}
          </div>
          <pre className="exec-drawer-cli">{plan.requestPreview}</pre>
          <div>
            {plan.checks.map((check) => (
              <div className="exec-drawer-note" key={check.label}>
                {check.outcome === "pass" ? "✓" : check.outcome === "warning" ? "!" : "✗"}{" "}
                {check.label}
                {check.outcome === "warning" ? " — warning, not blocking" : null}
              </div>
            ))}
          </div>
          <div>
            <div className="exec-drawer-note">Equivalent CLI — display only:</div>
            <pre className="exec-drawer-cli">{plan.equivalentCli}</pre>
            <div className="exec-drawer-note">The browser never runs a shell.</div>
          </div>
        </>
      ) : (
        <div className="exec-drawer-note">No plan yet. Generating one does not change anything.</div>
      )}

      <label className="exec-drawer-note">
        Reason (required, recorded in the audit log)
        <input
          className="input"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          aria-label="Reason for this operation"
        />
      </label>

      {confirmWord ? (
        <label className="exec-drawer-note">
          Type <strong>{confirmWord}</strong> to confirm
          <input
            className="input"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            aria-label={`Type ${confirmWord} to confirm`}
          />
        </label>
      ) : null}

      <div className="exec-drawer-actions">
        <button type="button" className="exec-btn-ghost" onClick={onGeneratePlan}>
          Generate plan
        </button>
        <button
          type="button"
          className={danger ? "exec-btn-apply exec-btn-danger" : "exec-btn-apply"}
          disabled={applyDisabled}
          onClick={() => onApply?.(reason)}
        >
          Apply
        </button>
      </div>

      {applyDisabled ? (
        <div className="exec-disabled-reason">Apply is blocked: {blockers.join("; ")}.</div>
      ) : null}

      {profileInconsistency ? (
        <div className="exec-drawer-inconsistency">{profileInconsistency}</div>
      ) : null}

      <div className="exec-drawer-note exec-drawer-key">
        request key <strong>{key}</strong> — reused for every retry of this intent
      </div>

      {verification ? (
        <div className="exec-drawer-note">
          <VerificationChip result={verification} />{" "}
          {verification === "UNCERTAIN"
            ? "Not settled and it will not settle itself. Portal keeps reconciling and an incident is open; this never ages into EXPIRED, because the effect may have happened."
            : isSettled(verification)
              ? "Verification has settled."
              : "Still observing. Nothing has been confirmed."}
        </div>
      ) : null}

      {verifyEntries?.length ? (
        <div>
          {/* The first line of every verify timeline. A 202 means the request
              was accepted, and nothing about whether it worked. */}
          <div className="exec-drawer-note exec-drawer-accepted">202 — accepted, NOT success yet</div>
          {verifyEntries.map((entry) => (
            <div className="exec-drawer-note" key={entry.label}>
              <OperationStatusChip status={entry.status} /> {entry.label}
            </div>
          ))}
        </div>
      ) : null}

      {outcome ? (
        <div className="exec-drawer-note">
          {outcome === "PARTIAL" ? (
            <>
              <span className="exec-chip" data-tone="warn">
                PARTIAL
              </span>{" "}
              Some sub-intents did not complete. Residue is described above and can be re-applied
              with the same idempotency key.
            </>
          ) : outcome === "FAILED" ? (
            <span className="exec-chip" data-tone="bad">
              FAILED
            </span>
          ) : (
            <span className="exec-chip" data-tone="good">
              VERIFIED
            </span>
          )}
        </div>
      ) : null}
    </section>
  );
}
