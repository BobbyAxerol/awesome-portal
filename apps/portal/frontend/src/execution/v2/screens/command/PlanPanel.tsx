/**
 * Step 1: the plan, as the server published it. Nothing is read until the reader asks (no effect on mount), and nothing here is computed:
 * cost and impact are `Not published (FE-020)` unless a contract adds a figure.
 */
import { useEffect, useRef } from "react";

import { BLOCKED_REASON_TEXT, type BlockedReason } from "../../../adminCatalog";
import { formatUtcEpochMs } from "../../../screenDataContract";
import { notPublishedText } from "../../blocks";
import { Flag } from "../../Flag";
import { F0_NO_EFFECT, showable } from "./model";
import { Facts } from "./parts";
import { READ_DISABLED_REASON } from "./port";
import type { CommandFlow } from "./useCommandFlow";

function blockerSentence(code: string): string | null {
  return Object.prototype.hasOwnProperty.call(BLOCKED_REASON_TEXT, code) ? BLOCKED_REASON_TEXT[code as BlockedReason] : null;
}

export function PlanPanel({ flow }: { flow: CommandFlow }) {
  const root = useRef<HTMLDivElement>(null);
  const readRef = useRef<HTMLButtonElement>(null);
  const { plan } = flow;
  // "New plan" and "Start again" removed the control that had focus: the first control of a fresh flow is where it goes.
  useEffect(() => {
    if (flow.focus.tick > 0 && flow.focus.target === "plan") readRef.current?.focus();
  }, [flow.focus]);
  // A plan that has just arrived is where attention belongs, including for a keyboard user who pressed "Read the plan".
  useEffect(() => {
    if (plan.status === "ready") root.current?.focus({ preventScroll: false });
  }, [plan.status]);

  if (plan.status === "idle" || plan.status === "loading") {
    const blocked = flow.blockedReason !== null;
    return (
      <div className="exec-cf-panel" data-step="plan" data-state={plan.status}>
        <p className="exec-cf-meta" title="Reading a plan changes nothing and sends nothing.">No plan has been read</p>
        <div className="exec-cf-acts">
          <button
            ref={readRef}
            type="button"
            className="exec-cf-btn"
            data-variant="primary"
            aria-disabled={blocked || plan.status === "loading"}
            title={blocked ? READ_DISABLED_REASON : plan.status === "loading" ? "Reading the plan." : undefined}
            onClick={() => {
              if (!blocked && plan.status === "idle") flow.readPlan();
            }}
          >
            {plan.status === "loading" ? "Reading the plan…" : "Read the plan"}
          </button>
        </div>
        {blocked ? <p className="exec-cf-why" role="status">{READ_DISABLED_REASON}</p> : null}
      </div>
    );
  }

  if (plan.status === "failed") {
    return (
      <div className="exec-cf-panel" data-step="plan" data-state="failed" data-tone={plan.load.tone} role="alert">
        <p className="exec-cf-res-head">
          <Flag kind={plan.load.tone === "denied" ? "rejected" : "attention"} label={plan.load.tone === "denied" ? "Not allowed" : "No plan"} />
          <span>{plan.load.sentence}</span>
        </p>
        {plan.load.tone !== "denied" ? (
          <div className="exec-cf-acts">
            <button type="button" className="exec-cf-btn" onClick={flow.reset}>Start again</button>
          </div>
        ) : null}
      </div>
    );
  }

  const { view } = plan;
  // Starting over would drop a typed reason without asking, so it is only offered while nothing has been typed or sent.
  const editable = !flow.dirty;
  return (
    <div ref={root} className="exec-cf-panel" data-step="plan" data-state="ready" tabIndex={-1} aria-label={`Plan: ${view.title}`}>
      <p className="exec-cf-res-head">
        <Flag kind={view.confirmable.ok ? "neutral" : "attention"} label={view.lane === "F0" ? "Blocked plan" : view.confirmable.ok ? "Preview" : "Preview refused"} />
        <span className="exec-cf-id">{showable(view.title, 120)}</span>
        {view.replayed ? <Flag kind="operation" label="Replayed" /> : null}
        {flow.expired ? <Flag kind="stale" label="Expired" /> : null}
      </p>
      {view.replayed ? (
        <p className="exec-cf-meta" data-notice="replayed">The server already knew this request key and returned the existing plan. Nothing new was recorded.</p>
      ) : null}
      <Facts rows={view.facts} label="What this plan is" />

      <div className="exec-cf-block">
        <h4 className="exec-cf-sub">Blocked by</h4>
        {view.blockers.length === 0 ? (
          <p className="exec-cf-meta">The plan publishes no blocker.</p>
        ) : (
          <ul className="exec-cf-list" aria-label="Blockers">
            {view.blockers.map((code) => (
              <li key={code}>
                <span className="exec-cf-id">{showable(code, 120)}</span>
                {blockerSentence(code) !== null ? <span className="exec-cf-meta"> {blockerSentence(code)}</span> : null}
              </li>
            ))}
          </ul>
        )}
        {view.warnings.length > 0 ? (
          <ul className="exec-cf-list" aria-label="Warnings">
            {view.warnings.map((code) => <li key={code}><Flag kind="attention" label="Warning" size="sm" /> <span className="exec-cf-id">{showable(code, 120)}</span></li>)}
          </ul>
        ) : null}
      </div>

      <div className="exec-cf-block" data-block="impact">
        <h4 className="exec-cf-sub">Cost and impact</h4>
        <p className="exec-cf-body"><b>{notPublishedText(view.impact.request)}</b> The plan publishes no cost, fee or impact figure, and none is computed on this page.</p>
      </div>

      <Facts
        label="Validity"
        rows={[{ label: "Valid until", value: view.expiresAtMs === null ? "No expiry published" : formatUtcEpochMs(view.expiresAtMs) }]}
      />
      {view.lane === "F0" ? <p className="exec-cf-meta">{F0_NO_EFFECT}</p> : null}
      {view.confirmable.ok && view.confirmable.note !== null ? <p className="exec-cf-meta">{view.confirmable.note}</p> : null}
      {!view.confirmable.ok ? <p className="exec-cf-why" role="status">{view.confirmable.reason}</p> : null}

      {editable ? (
        <div className="exec-cf-acts">
          <button type="button" className="exec-cf-btn" onClick={flow.reset}>Read a different plan</button>
        </div>
      ) : null}
    </div>
  );
}
