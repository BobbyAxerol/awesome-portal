/**
 * Screen 02 · Walk-forward step · Suggest / Apply / Reset (S02 linked-window setup).
 *
 * Suggest asks the server for an editable indexed-bar hint for the selected runnable profile. Apply writes it into
 * the draft, Reset puts back exactly what Apply replaced. Nothing is written without a click, except into a draft
 * whose window fields are all empty (the first suggestion for a context is applied once, like the coverage prefill
 * it replaces). It is never a preflight or a run authorisation: the preflight stays the authority.
 */

import { useEffect, useRef } from "react";

import { humaniseTokens, setupReasonWords } from "./humanise";
import type { RunDraft } from "./runDraft";
import type { RunSetupState } from "./useRunSetup";
import { setupContextFrom } from "./useRunSetup";
import type { WindowSuggestion } from "./setupClient";
import { autoApplyAllowed, suggestionToDayEdges, suggestionToDraftPatch, useWindowSuggestion, type DraftWindowPatch } from "./useWindowSuggestion";

function utcLabel(ms: number): string {
  return `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export function WindowSetupBar({
  draft,
  patch,
  setup,
  profileId,
  unavailableReason = null,
  workspaceId,
  range = null,
  onProposal,
}: {
  draft: RunDraft;
  patch: (change: Partial<RunDraft>) => void;
  setup: RunSetupState;
  /** The selected profile's id when it is enabled; null otherwise (nothing can be suggested for a disabled profile). */
  profileId: string | null;
  /** The server's typed reason when every profile of this protocol is disabled for this Alpha. */
  unavailableReason?: string | null;
  workspaceId?: string;
  /** The verified range (epoch ms): the suggestion is snapped to whole UTC days inside it. */
  range?: { from: number; to: number } | null;
  /** Hands the served suggestion up, so the calendar can offer it as its "Recommended" chip. */
  onProposal?: (proposal: WindowSuggestion | null) => void;
}) {
  const context = setupContextFrom(draft, workspaceId);
  const options = setup.status === "served" ? setup.options : null;
  const autoAsked = useRef<string | null>(null);
  const suggestion = useWindowSuggestion({
    context,
    options,
    profileId,
    draft,
    days: true,
    onStale: setup.invalidate,
    onAutoApply: (change: DraftWindowPatch) => patch(change),
  });
  const { state } = suggestion;
  const scope = context !== null && options !== null && profileId !== null ? `${JSON.stringify(context)}|${options.source_revision}|${profileId}|${draft.protocol}` : null;

  /* The first suggestion of a context asks itself, once, and only while every window field is empty. */
  useEffect(() => {
    if (scope === null || autoAsked.current === scope || state.kind !== "idle" || !autoApplyAllowed(draft)) return;
    autoAsked.current = scope;
    suggestion.suggest();
    /* An aborted ask (the effect torn down before the answer: a re-mount, a StrictMode probe) leaves nothing asked: it may ask again. */
    return () => {
      if (autoAsked.current === scope) autoAsked.current = null;
    };
  }, [scope, state.kind, draft, suggestion]);

  const served = suggestion.proposal;
  useEffect(() => {
    onProposal?.(served);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [served]);

  if (setup.status === "absent" || (setup.status === "idle" && context === null)) return null;

  const proposal = suggestion.proposal;
  const preview = proposal !== null ? suggestionToDraftPatch(proposal, draft, { days: true, range }) : null;
  const dayEdges = proposal !== null ? suggestionToDayEdges(proposal, range) : null;
  const available = proposal?.metadata.state === "AVAILABLE" ? proposal.metadata : null;
  const patchWindow = available?.patch ?? null;
  const span =
    patchWindow === null
      ? null
      : patchWindow.protocol === "three_window_decay"
        ? { from: patchWindow.windows.is.start_utc_ms, to: patchWindow.windows.holdout.end_exclusive_utc_ms }
        : { from: patchWindow.walk_forward.start_utc_ms, to: patchWindow.walk_forward.end_exclusive_utc_ms };
  const canAsk = profileId !== null && options !== null && state.kind !== "pending";
  const why =
    profileId === null
      ? options !== null
        ? "Pick a runnable mode and schedule first: no single profile fits yet."
        : null
      : null;

  const note: { text: string; title?: string; tone: "soft" | "warn" } | null =
    unavailableReason !== null
      ? { text: `Not runnable · ${setupReasonWords(unavailableReason)}`, tone: "warn" }
      : state.kind === "pending"
      ? { text: "Suggesting…", tone: "soft" }
      : state.kind === "not-published"
        ? { text: `No suggestion · ${humaniseTokens(state.reasonCode ?? "NOT_PUBLISHED")}`, tone: "warn" }
        : state.kind === "stale"
          ? { text: "Setup changed on the server · reloading", tone: "warn" }
          : state.kind === "refused"
            ? { text: `Refused · ${humaniseTokens(state.reasonCode ?? state.code)}`, title: state.fieldPath !== null ? `field ${state.fieldPath.join(".")}` : undefined, tone: "warn" }
            : state.kind === "error"
              ? { text: "Suggestion unavailable · try again", tone: "warn" }
              : state.kind === "blocked"
                ? { text: humaniseTokens(String(state.reason)), tone: "soft" }
                : span !== null
                  ? {
                      text: dayEdges !== null ? `${dayEdges.a.slice(0, 10)} → ${dayEdges.d.slice(0, 10)} UTC` : `${utcLabel(span.from)} → ${utcLabel(span.to)}`,
                      title: "An editable hint from the indexed bars (70/20/10 by observed bar rank, or half the initial IS for Advanced). Not an optimum, not a preflight; the preflight decides.",
                      tone: "soft",
                    }
                  : null;

  return (
    <div className="flex flex-wrap items-center gap-2" data-window-setup data-suggestion-state={state.kind}>
      <button type="button" className="btn-ghost mono text-[10px]" data-action="suggest-windows" disabled={!canAsk} title={why ?? "Ask the server for an editable window split from the indexed bars."} onClick={() => suggestion.suggest()}>
        Suggest
      </button>
      <button
        type="button"
        className="btn-ghost mono text-[10px]"
        data-action="apply-suggestion"
        disabled={preview === null || preview.state !== "patch"}
        title={preview === null ? "Suggest first: there is nothing to apply yet." : preview.state !== "patch" ? "The server published no suggestion to apply." : "Write the suggestion into the windows; Reset puts back what it replaced."}
        onClick={() => {
          const change = suggestion.apply();
          if (change !== null) patch(change);
        }}
      >
        Apply
      </button>
      <button
        type="button"
        className="btn-ghost mono text-[10px]"
        data-action="reset-suggestion"
        disabled={!suggestion.canReset}
        title={suggestion.canReset ? "Put back the values Apply replaced." : "Nothing has been applied yet."}
        onClick={() => {
          const change = suggestion.reset();
          if (change !== null) patch(change);
        }}
      >
        Reset
      </button>
      {note !== null ? (
        <span className="mono text-[9.5px]" style={{ color: note.tone === "warn" ? "var(--warn)" : "var(--ink-soft)" }} title={note.title} data-suggestion-note>
          {note.text}
        </span>
      ) : null}
    </div>
  );
}
