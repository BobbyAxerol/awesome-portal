/**
 * W4 — the ONE short notice for a refused, denied, absent or failed read.
 *
 * `[glyph] <sentence of at most six words>  [one action]`. The diagnostics
 * (reason code, request id, the server's sentence) ride as the tooltip and the
 * accessible name of the glyph + sentence — never as printed text — and the
 * glyph is focusable, so a keyboard reader can reach them. It replaces the
 * panel `StateNotice`, `RefusalChips`, `RunNotFound`'s body, the Lineage / RC /
 * Compare / Atlas `Notice` wrappers and S14's refusal banner.
 *
 * A screen that is denied or terminal renders this and NOTHING else (no ghost
 * cards, no tabs, no disabled buttons).
 */
import type { ReactNode } from "react";

import type { RefusalDiagnostics } from "./researchRefusal";

/** The sentence per state — one fact, at most six words. */
export const NOTICE_SENTENCE: Readonly<Record<string, string>> = {
  denied: "Not available to you.",
  "not-found": "Not available to you.",
  session: "Session expired.",
  empty: "Nothing here yet.",
  conflict: "Changed. Read again.",
  stale: "Changed. Read again.",
  unavailable: "Not responding.",
  "failed-retryable": "Not accepted.",
  terminal: "Refused.",
  transport: "Not sent.",
};

const GLYPH: Readonly<Record<string, string>> = {
  loading: "·",
  empty: "∅",
  partial: "◐",
  stale: "◷",
  denied: "⊘",
  "not-found": "⊘",
  session: "⊘",
  unavailable: "⚠",
  "failed-retryable": "↻",
  conflict: "↻",
  terminal: "■",
  transport: "⚠",
  commissioned: "◇",
};

export interface ResearchNoticeProps {
  state: string;
  /** Overrides the per-state sentence (a typed lane sentence, or a screen-specific one). Keep it short. */
  sentence?: string | null;
  code?: string | null;
  requestId?: string | null;
  /** The server's own sentence, tooltip only. */
  detail?: string | null;
  /** Exactly one action: a link or a button. */
  action?: ReactNode;
  /** A withheld state is an alert; a demoted-but-present one is status. */
  withheld?: boolean;
  diagnostics?: RefusalDiagnostics | null;
  className?: string;
}

export function ResearchNotice({ state, sentence, code, requestId, detail, action, withheld = true, diagnostics, className }: ResearchNoticeProps) {
  const theCode = code ?? diagnostics?.code ?? null;
  const theRequest = requestId ?? diagnostics?.requestId ?? null;
  const theDetail = [diagnostics?.sentence ?? null, detail ?? null].filter((part, index, all): part is string => part !== null && part !== "" && all.indexOf(part) === index).join(" · ") || null;
  const words = sentence ?? NOTICE_SENTENCE[state] ?? state;
  const tip = [theCode, theRequest ? `request ${theRequest}` : null, theDetail].filter(Boolean).join(" · ");
  return (
    <div
      className={className ?? "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[6px] border px-3 py-2"}
      style={{ borderColor: "var(--line)", background: withheld ? "var(--paper-sunken)" : "var(--paper-raised)" }}
      data-research-state={state}
      data-research-notice=""
      data-refusal-code={theCode ?? undefined}
      data-refusal-request={theRequest ?? undefined}
      role={withheld ? "alert" : "status"}
    >
      <span
        tabIndex={tip ? 0 : undefined}
        title={tip || undefined}
        aria-label={tip ? `${words} ${tip}` : undefined}
        className="inline-flex items-baseline gap-2 text-[12px]"
        style={{ color: "var(--ink-soft)" }}
        data-notice-sentence=""
      >
        <span aria-hidden="true" className="mono text-[11px]" style={{ color: "var(--ink-faint)" }}>
          {GLYPH[state] ?? "·"}
        </span>
        {words}
      </span>
      {action ?? null}
    </div>
  );
}
