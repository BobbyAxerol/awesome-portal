/**
 * R3-3 item 3 · the Portal-authored review capture, as one component.
 *
 * BE-R2-8 published four operations and no screen ever called them:
 * `review-capture-capabilities`, `r2/capture`, `paper-exit/create` and
 * `sandbox/capture-note`. This is the single entry point for all three
 * captures, because they differ only in which identity the record carries.
 *
 * Three things this component exists to get right.
 *
 * **It records a review; it does not grant one.** The response contract pins
 * `source_verdict: "NOT_ASSERTED"` and `source_side_effect_requested: false`,
 * and the capabilities list carries three further actions —
 * `R2_EXECUTION_GRANT`, `PAPER_EXIT_PROMOTE`, `SANDBOX_CERTIFY_SOURCE` — which
 * this component never offers. A capture that looked like a promotion would be
 * the exact impersonation R3-3 forbids, so the provenance line says so on
 * screen rather than in a comment.
 *
 * **The identity is the record's, not the typist's.** `expected_*_version` and
 * `expected_projection_digest` are optimistic-concurrency inputs: they come
 * from the record the reviewer is looking at. Asking a human to type a digest
 * would invite them to make one up, and a mistyped version silently becomes a
 * conflict they cannot explain. They are shown read-only so the reviewer can
 * see exactly what will be recorded, and the only thing typed is the sentence
 * only a human can write.
 *
 * **A retry replays; an edit does not.** The request key is generated once per
 * opened form, so pressing submit twice replays (`replayed: true`, nothing
 * duplicated) while an edited summary under the same key is a real conflict
 * the server refuses — and that refusal is shown, not swallowed.
 */
import { Fragment, useMemo, useState, type JSX } from "react";

import { PanelState } from "./states";
import type { ReviewCapture, ReviewCaptureCapabilities } from "../api/reviewCapture";

export type CaptureActionId = "R2_CREATE" | "PAPER_EXIT_CREATE" | "SANDBOX_NOTE";

/** The three the Portal must never offer: they belong to the source, not here. */
export const SOURCE_OWNED_ACTIONS = ["R2_EXECUTION_GRANT", "PAPER_EXIT_PROMOTE", "SANDBOX_CERTIFY_SOURCE"] as const;

export type CaptureCapability =
  | { state: "AVAILABLE"; inputs: string | null }
  | { state: "UNAVAILABLE"; reasonCode: string };

/**
 * What the server said about one action, or `null` when it listed none.
 *
 * `null` is not "available": a capabilities read that failed leaves the panel
 * unable to say whether the action is open, and guessing "yes" would put a
 * control on screen that the server may refuse.
 */
export function captureCapability(
  capabilities: ReviewCaptureCapabilities | null | undefined,
  action: CaptureActionId,
): CaptureCapability | null {
  const row = capabilities?.actions.find((entry) => entry.id === action);
  if (!row) return null;
  if (row.state === "AVAILABLE") return { state: "AVAILABLE", inputs: row.inputs ?? null };
  return { state: "UNAVAILABLE", reasonCode: row.reason_code ?? "NO_REASON_PUBLISHED" };
}

/** One read-only fact that will be written into the record. */
export interface CaptureIdentityRow {
  label: string;
  /** `null` means the record did not publish it — never substituted. */
  value: string | null;
}

export type CaptureOutcome =
  | { kind: "captured"; capture: ReviewCapture }
  | { kind: "failed"; reason: string };

const MIN_SUMMARY = 24;

/** Stable per opened form: a retry replays, an edit under it conflicts. */
function newRequestKey(action: CaptureActionId): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${action.toLowerCase()}:${random}`;
}

export function ReviewCapturePanel({
  action,
  title,
  capability,
  capabilityReason,
  identity,
  onCapture,
  disabledReason,
}: {
  action: CaptureActionId;
  title: string;
  /** `null` when the capabilities read did not answer for this action. */
  capability: CaptureCapability | null;
  /** Why the capabilities read itself could not be made, if it could not. */
  capabilityReason?: string;
  identity: readonly CaptureIdentityRow[];
  onCapture: (summary: string, requestKey: string) => Promise<CaptureOutcome>;
  /** A screen-level reason that outranks the server's, e.g. a read that failed. */
  disabledReason?: string | null;
}): JSX.Element {
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<CaptureOutcome | null>(null);
  const [requestKey, setRequestKey] = useState(() => newRequestKey(action));

  // A record missing one of its own identity fields cannot be captured against:
  // the server would reject it, and filling the gap here would fabricate the
  // provenance the capture exists to record.
  const absent = useMemo(
    () => identity.filter((row) => row.value === null).map((row) => row.label),
    [identity],
  );

  if (capability === null) {
    return (
      <section className="exec-pf2-panel exec-rc" aria-label={title}>
        <header className="exec-pf2-head"><span className="exec-pf2-title">{title}</span></header>
        <PanelState
          status="unavailable"
          reason={capabilityReason
            ?? "The review-capture capabilities were not published, so this Portal cannot say whether the action is open."}
        />
      </section>
    );
  }

  if (capability.state === "UNAVAILABLE") {
    return (
      <section className="exec-pf2-panel exec-rc" aria-label={title}>
        <header className="exec-pf2-head"><span className="exec-pf2-title">{title}</span></header>
        {/* §3.5: a disabled mutation names why, in the server's own code. */}
        <PanelState status="denied" reason={`${capability.reasonCode} — the server does not currently offer this capture.`} />
      </section>
    );
  }

  const blocked = disabledReason ?? (absent.length > 0
    ? `the record did not publish ${absent.join(", ")}, and this capture is bound to those exact values`
    : summary.trim().length < MIN_SUMMARY
      ? `the summary needs at least ${MIN_SUMMARY} characters — it is the whole review`
      : null);

  const submit = async () => {
    if (blocked || busy) return;
    setBusy(true);
    try {
      const result = await onCapture(summary.trim(), requestKey);
      setOutcome(result);
      // A refusal keeps the key: the same intent retried must replay, not
      // duplicate. A success retires it so the next capture is a new record.
      if (result.kind === "captured") setRequestKey(newRequestKey(action));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="exec-pf2-panel exec-rc" aria-label={title}>
      <header className="exec-pf2-head">
        <span className="exec-pf2-title">{title}</span>
        <span className="exec-pf2-spacer" />
        <span className="exec-rc-authority">PORTAL · review evidence</span>
      </header>
      <p className="exec-rc-provenance">
        This records that a Portal review happened. The source verdict stays
        <b> NOT_ASSERTED</b> and no Trading System change is requested — it is not a pass,
        a certification or a promotion.
      </p>
      <div className="exec-gov-kv" data-flush="true">
        {/*
          * Fragments, not a wrapper element. A `display: contents` span let the
          * grid lay the cells out but broke `.exec-gov-kv > .exec-gov-k`, which
          * is a DIRECT-child selector — so the labels silently lost their
          * uppercase/faint treatment and stopped matching every other key/value
          * block on the surface.
          */}
        {identity.map((row) => (
          <Fragment key={row.label}>
            <span className="exec-gov-k">{row.label}</span>
            <span className="exec-gov-v">{row.value ?? <span className="exec-af-absent">not published</span>}</span>
          </Fragment>
        ))}
      </div>
      <label className="exec-px-note">
        <span className="exec-px-notelabel">Review summary (required — the sentence only you can write)</span>
        <textarea
          className="exec-px-notebox"
          rows={3}
          value={summary}
          disabled={busy}
          onChange={(event) => setSummary(event.target.value)}
          placeholder="What you checked, and what you concluded."
        />
      </label>
      <div className="exec-rc-foot">
        <button
          type="button"
          className="exec-btn-apply"
          disabled={Boolean(blocked) || busy}
          title={blocked ?? undefined}
          onClick={() => void submit()}
        >
          {busy ? "Recording…" : "Record review"}
        </button>
        {blocked ? <span className="exec-rc-blocked">{blocked}</span> : null}
      </div>
      {outcome?.kind === "captured" ? (
        <p className="exec-rc-outcome" role="status">
          {outcome.capture.replayed
            ? "This matched an earlier submit by request key, so nothing was duplicated."
            : "Recorded."}
          {" "}Workflow version {outcome.capture.workflow_version} ·{" "}
          {outcome.capture.decision_reason_code} ·{" "}
          <a href={outcome.capture.read_path}>read the record</a>
        </p>
      ) : null}
      {outcome?.kind === "failed" ? (
        <PanelState status="unavailable" reason={outcome.reason} />
      ) : null}
    </section>
  );
}
