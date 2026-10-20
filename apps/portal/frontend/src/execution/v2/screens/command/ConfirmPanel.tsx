/**
 * Step 2: the typed confirmation and the one Submit button.
 *
 * Deliberately not here: no auto-submit anywhere and no form-level submit. The only call to the port is `flow.submit()` (or `flow.retry()`
 * for an unknown send) and the only callers are button clicks. The form's submit event is swallowed and Enter in a field is swallowed, so a
 * keystroke can never send. The button is aria-disabled, not disabled, so focus stays on it while a send is in flight. The sentence beside
 * the button and the button are one answer (`submitGate`), so they cannot disagree.
 */
import { useEffect, useId, useRef } from "react";

import { Flag } from "../../Flag";
import { MAX_REASON, reasonCounter, stillNeeded } from "./model";
import type { CommandFlow } from "./useCommandFlow";

export const SUBMIT_LABEL = "Submit to the fixture port";

export function ConfirmPanel({ flow }: { flow: CommandFlow }) {
  const base = useId();
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  // A dismissed refusal or a discard removed the control that had focus: the reason is where the reader works next.
  useEffect(() => {
    if (flow.focus.tick > 0 && flow.focus.target === "reason") reasonRef.current?.focus();
  }, [flow.focus]);
  if (flow.plan.status !== "ready") return null;
  const view = flow.plan.view;
  const { validation, gate } = flow;
  // An unknown send locks the payload: its idempotency key belongs to exactly these fields.
  const locked = flow.settled || flow.submitting || flow.uncertain;
  const reasonBad = validation.reason.state === "long" || validation.reason.state === "hostile";
  const wordBad = flow.fields.confirmWord !== "" && !validation.wordMatches;
  const reasonId = `${base}-why`;

  const flag = (() => {
    if (gate.open) return <Flag kind="ok" label="Ready" />;
    switch (gate.kind) {
      case "policy": return <Flag kind="attention" label="Not connected" />;
      case "sending": return <Flag kind="pending" label="Sending" />;
      case "uncertain": return <Flag kind="unknown" label="Unconfirmed" />;
      case "settled": return <Flag kind="neutral" label="Answered" />;
      case "expired": return <Flag kind="stale" label="Expired" />;
      case "held": return <Flag kind="na" label="On hold" />;
      case "plan": return <Flag kind="attention" label="Plan" />;
      default: return <Flag kind="na" label="Incomplete" />;
    }
  })();
  const sentence = gate.open ? "Everything needed is filled." : gate.kind === "incomplete" ? stillNeeded(validation.needs) : gate.reason;

  return (
    <form
      className="exec-cf-form"
      noValidate
      aria-label="Confirm the command"
      // No form-level submit: a native submit event (Enter in a field, a script) is swallowed and goes nowhere.
      onSubmit={(e) => e.preventDefault()}
    >
      <fieldset className="exec-cf-fields" disabled={locked}>
        <legend className="exec-cf-sr">Confirmation</legend>

        <div className="exec-cf-fld">
          <label htmlFor={`${base}-reason`} className="exec-cf-label">
            <span>Reason</span>
            <span id={`${base}-count`} className="exec-cf-label-meta exec-cf-mono" data-state={validation.reason.state}>{reasonCounter(validation.reason.count)}</span>
          </label>
          <textarea
            ref={reasonRef}
            id={`${base}-reason`}
            className="exec-cf-control"
            rows={4}
            value={flow.fields.reason}
            placeholder="Why this command, on this target, now."
            aria-invalid={reasonBad || undefined}
            aria-describedby={`${base}-count ${base}-reason-help`}
            onChange={(e) => flow.setReason(e.target.value)}
          />
          <p id={`${base}-reason-help`} className={reasonBad ? "exec-cf-error" : "exec-cf-meta"}>
            {validation.reason.state === "hostile"
              ? `Remove hidden or direction-changing characters (${validation.reason.hostile.join(", ")}). The record is read as plain text.`
              : validation.reason.state === "long"
                ? `Too long: ${MAX_REASON.toLocaleString("en-US")} characters at most.`
                : "The reason is kept with the command. The Portal stores it, not the payload."}
          </p>
        </div>

        <div className="exec-cf-fld">
          <label htmlFor={`${base}-word`} className="exec-cf-label">
            <span>Type <span className="exec-cf-id">{view.confirmWord}</span> to confirm</span>
          </label>
          <input
            id={`${base}-word`}
            className="exec-cf-control exec-cf-mono"
            value={flow.fields.confirmWord}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={wordBad || undefined}
            aria-describedby={wordBad ? `${base}-word-help` : undefined}
            onChange={(e) => flow.setConfirmWord(e.target.value)}
            // Enter in a single-line field must never send: the click on Submit is the only road.
            onKeyDown={(e) => {
              if (e.key === "Enter") e.preventDefault();
            }}
          />
          {wordBad ? <p id={`${base}-word-help`} className="exec-cf-error">That is not the command. Type it exactly, capitals and punctuation included.</p> : null}
        </div>

        <div className="exec-cf-fld exec-cf-check">
          <input
            id={`${base}-ack`}
            type="checkbox"
            checked={flow.fields.impactAck}
            onChange={(e) => flow.setImpactAck(e.target.checked)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.preventDefault();
            }}
          />
          <label htmlFor={`${base}-ack`}>
            I understand the plan publishes no cost or impact figure ({view.impact.request}) and that none was computed for me.
          </label>
        </div>
      </fieldset>

      {flow.settled ? null : (
        <div className="exec-cf-bar">
          <div className="exec-cf-bar-text">
            <div>{flag}</div>
            <p className="exec-cf-need">{sentence}</p>
          </div>
          <div className="exec-cf-bar-act">
            {/* aria-disabled, not disabled: a disabled button drops keyboard focus to the page while a send is in flight. */}
            <button
              type="button"
              className="exec-cf-submit"
              aria-disabled={!gate.open}
              aria-describedby={gate.open ? undefined : reasonId}
              title={gate.open ? undefined : gate.reason}
              onClick={() => {
                if (gate.open) flow.submit();
              }}
            >
              {SUBMIT_LABEL}
            </button>
            <span id={reasonId} className="exec-cf-why" role={gate.open ? undefined : "status"}>
              {gate.open ? "Nothing is sent until you click Submit. The fixture port never reaches a network." : gate.reason}
            </span>
          </div>
        </div>
      )}
    </form>
  );
}
