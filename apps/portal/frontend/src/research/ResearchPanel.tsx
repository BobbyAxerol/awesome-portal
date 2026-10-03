/**
 * Research Loop — the panel state boundary (P03 composition scope).
 *
 * Every Research panel keeps its frame in every state. The body is what
 * changes, never the page: replacing a rich panel with a centred message is the
 * Execution failure RL-L02 records, and it costs the reader every other fact
 * the panel was carrying.
 *
 * This is a second *skin*, not a second vocabulary. The semantics come from
 * `researchState()` over `lib/portalState.ts`'s `ComponentState`, the same
 * words Execution uses. What differs is the visual system: Execution Carbon is
 * dark and lives under `exec-*`; Research is the Portal's paper theme, whose
 * tokens match the hi-fi palette value for value, so nothing here needs a raw
 * hex code.
 *
 * `stale` and `partial` deliberately keep rendering their children underneath
 * the notice. A four-minute-old number an operator knows is old is still worth
 * more than a blank where the number was.
 */

import type { ReactNode } from "react";

import { NOTICE_SENTENCE, ResearchNotice } from "./ResearchNotice";
import {
  refusalDiagnostics,
  type ResearchRefusal,
  type ResearchStateWithDiagnostics,
} from "./researchRefusal";
import type { ResearchState } from "./state";

export interface ResearchPanelProps {
  title: string;
  /** Small right-aligned provenance line: source name, revision, as-of. */
  meta?: ReactNode;
  /** Resolved state for this panel's own named request. */
  state: ResearchStateWithDiagnostics;
  /** Real content. Rendered whenever the state retains content. */
  children?: ReactNode;
  /** Actions the server has admitted. Hidden whenever content is withheld. */
  actions?: ReactNode;
  /**
   * The way back from a failed read — "read again", never a content action.
   * Shown only in `unavailable`, `failed-retryable` and `stale`, where asking
   * again can change the answer (RF01-F2). Content actions such as Export stay
   * in `actions` and keep the FE-P03-01 rule.
   */
  recovery?: ReactNode;
  /** Minimum body height so the frame does not collapse while loading. */
  minBodyHeight?: number;
  /** S00 reading canvas keeps the state boundary without a nested card. */
  variant?: "framed" | "plain";
}

/**
 * Whether the body still shows its real content. `available`, `stale` and
 * `partial` do; the rest do not, because their content is either absent or
 * withheld and drawing it would be a claim we cannot support.
 */
function showsContent(state: ResearchState): boolean {
  return state.state === "available" || state.retainsContent;
}

/** QA S03_S05 NEW-2: a state name that reads as a code gets a word; the state stays on the tooltip. */
export const STATE_WORD: Record<string, string> = { "failed-retryable": "not accepted" };

function StateNotice({ state }: { state: ResearchStateWithDiagnostics }) {
  const isWithheld = !showsContent(state);
  /* A refusal state has ONE short fixed sentence; partial / commissioned keep
     their typed reason (that is the content). The long sentence is the tooltip. */
  /* `empty` is also a typed "nothing yet" the screens word themselves (e.g. a step waiting on the one before): its reason is the content. */
  /* Only a state that came from a real refusal (it carries `diagnostics`, even null) gets the fixed short sentence; a state a screen worded itself keeps its own reason (that is its content). */
  const refusalState = state.state in NOTICE_SENTENCE && state.state !== "empty" && "diagnostics" in state;
  return (
    <ResearchNotice
      state={state.state}
      sentence={refusalState ? (state.reason && state.reason.trim().split(/\s+/).length <= 6 ? state.reason : null) : (state.reason || null)}
      diagnostics={state.diagnostics ?? null}
      detail={refusalState ? [state.reason, state.diagnostics ? null : state.detail].filter(Boolean).join(" · ") || null : state.diagnostics ? null : state.detail}
      withheld={isWithheld}
    />
  );
}

/** Layout-stable placeholder. Shapes, not content, so it stays out of the a11y tree. */
function PanelSkeleton({ height }: { height: number }) {
  return (
    <div role="status" aria-label="Loading">
      <div aria-hidden="true" className="flex flex-col gap-2" style={{ minHeight: height }}>
        {[72, 96, 60].map((width, index) => (
          <span
            key={index}
            className="block rounded-[4px]"
            style={{ background: "var(--paper-sunken)", height: 12, width: `${width}%` }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * States in which an action may be offered.
 *
 * Retaining content and being actionable are different questions. A panel whose
 * dependency is `unavailable` still shows the last numbers it had — that is
 * worth keeping — but offering a button there only teaches the reader that the
 * button fails. `terminal` is the same: the operation already ended.
 */
const ACTIONABLE = new Set(["available", "stale", "partial"]);

/** States in which reading again can change the answer. */
const RECOVERABLE = new Set(["unavailable", "failed-retryable", "stale"]);

export function ResearchPanel({
  title,
  meta,
  state,
  children,
  actions,
  variant = "framed",
  recovery,
  minBodyHeight = 72,
}: ResearchPanelProps) {
  const contentVisible = showsContent(state);
  const isLoading = state.state === "loading";
  const actionsVisible = ACTIONABLE.has(state.state) && actions !== undefined;
  const recoveryVisible = !isLoading && RECOVERABLE.has(state.state) && recovery !== undefined;

  return (
    <section
      className={variant === "plain" ? "flex flex-col" : "flex flex-col rounded-[6px] border"}
      style={variant === "plain" ? undefined : { borderColor: "var(--line)", background: "var(--paper-raised)" }}
      data-research-panel={title}
      data-state={state.state}
      // A named region: a screen reader should be able to reach this panel by
      // name and hear which state it is in, not land in an anonymous box.
      aria-label={title}
      aria-busy={isLoading || undefined}
    >
      {variant === "framed" ? <header
        className="flex flex-wrap items-baseline justify-between gap-2 border-b px-3 py-2"
        style={{ borderColor: "var(--line)" }}
      >
        <h3
          className="mono text-[10px] font-medium uppercase tracking-[.07em]"
          style={{ color: "var(--ink-faint)" }}
        >
          {title}
        </h3>
        {meta ? (
          <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }}>
            {meta}
          </span>
        ) : null}
      </header> : null}

      <div className={variant === "plain" ? "flex flex-col gap-2" : "flex flex-col gap-2 px-3 py-2.5"} style={{ minHeight: minBodyHeight }}>
        {isLoading ? <PanelSkeleton height={minBodyHeight} /> : null}
        {!isLoading && state.state !== "available" ? <StateNotice state={state} /> : null}
        {!isLoading && contentVisible ? children : null}
        {recoveryVisible ? (
          <div className="flex flex-wrap gap-2" data-research-recovery>
            {recovery}
          </div>
        ) : null}
        {actionsVisible ? <div className="flex flex-wrap gap-2 pt-1">{actions}</div> : null}
      </div>
    </section>
  );
}

/**
 * A value the server did not send.
 *
 * Returns the state word rather than a digit, so a missing number is visibly
 * missing. `0` and `—` both read as answers; neither is one.
 */
export function ResearchValue({
  value,
  unit,
  absentLabel = "not reported",
}: {
  value: string | null;
  unit?: string;
  absentLabel?: string;
}) {
  if (value === null) {
    return (
      <span className="mono text-[11px] italic" style={{ color: "var(--ink-faint)" }}>
        {absentLabel}
      </span>
    );
  }
  return (
    <span className="mono text-[12px]" style={{ color: "var(--ink)" }}>
      {value}
      {unit ? <span style={{ color: "var(--ink-faint)" }}> {unit}</span> : null}
    </span>
  );
}

/**
 * A refusal inside a sub-panel (a slot that failed while the screen stands).
 *
 * The fixed sentence reads as the answer; the code and request id follow as
 * faint chips and the server's sentence is their tooltip (RF01-F4, VD-FG-01-01).
 * Inline, so it can sit inside the paragraph a screen already wraps around it.
 */
export function RefusalNote({ refusal }: { refusal: ResearchRefusal }) {
  const diagnostics = refusalDiagnostics(refusal);
  const tip = diagnostics ? [diagnostics.code, diagnostics.requestId ? `request ${diagnostics.requestId}` : null, diagnostics.sentence].filter(Boolean).join(" · ") : "";
  return (
    <span data-refusal-detail="" data-refusal-code={diagnostics?.code ?? undefined} data-refusal-request={diagnostics?.requestId ?? undefined} title={tip || undefined} tabIndex={tip ? 0 : undefined}>
      {NOTICE_SENTENCE[refusal.state] ?? refusal.message}
    </span>
  );
}
