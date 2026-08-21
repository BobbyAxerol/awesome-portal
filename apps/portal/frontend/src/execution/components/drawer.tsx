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

import type { OperationStatus } from "../contracts";
import { OperationStatusChip } from "./badges";

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

export function CommandPlanDrawer({
  title,
  meta,
  plan,
  step,
  verifyEntries,
  outcome,
  danger = false,
  confirmWord,
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
  onGeneratePlan?: () => void;
  onApply?: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");

  const blockingCheck = plan?.checks.find((check) => check.outcome === "fail");
  const expired = plan ? plan.expiresInSeconds <= 0 : false;
  const confirmed = !confirmWord || confirmation === confirmWord;
  const reasonGiven = reason.trim().length > 0;

  // Every condition is reported to the operator, not just the first: a button
  // that says only "disabled" makes them guess which of four things to fix.
  const blockers: string[] = [];
  if (!plan) blockers.push("generate a plan first");
  if (expired) blockers.push("plan expired — generate a new one");
  if (blockingCheck) blockers.push(`policy check failed: ${blockingCheck.label}`);
  if (!reasonGiven) blockers.push("a reason is required");
  if (!confirmed) blockers.push(`type ${confirmWord} to confirm`);

  const applyDisabled = blockers.length > 0;

  return (
    <section className="exec-drawer" aria-label={title}>
      <header>
        <div className="exec-tile-title">{title}</div>
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
