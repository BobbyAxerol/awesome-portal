/**
 * W1 §1.3 — one line for a run that has nothing to show: the banner (long
 * sentence in the tooltip), then the exits as plain links, primary first.
 * Renders nothing for a completed run, so successful screens are untouched.
 */

import { ResearchScopedLink as Link } from "./ResearchScopedLink";

import type { EvidenceCursor } from "./evidenceCursor";
import { exitHref } from "./runLinks";
import type { RunExitId, RunTerminalState } from "./runTerminalState";

export interface RunExitBarProps {
  runId: string;
  state: RunTerminalState;
  /** Carried into hub/report links only. */
  cursor?: EvidenceCursor | null;
  /** Shown for phase "unread". */
  onRetry?: () => void;
  /** A screen drops the exit that points at itself. */
  hide?: readonly RunExitId[];
  className?: string;
}

const LABEL: Record<RunExitId, string> = {
  progress: "Progress",
  "new-run": "New run",
  library: "Library",
  hub: "Hub",
  report: "Report",
};

const TITLE: Partial<Record<RunExitId, string>> = {
  "new-run": "Same draft, fresh preflight",
};

const TONE_VAR: Record<RunTerminalState["tone"], string> = {
  good: "var(--good, currentColor)",
  accent: "var(--accent, currentColor)",
  warn: "var(--warn, currentColor)",
  bad: "var(--bad, currentColor)",
  quiet: "var(--ink-soft, currentColor)",
};

export function RunExitBar({ runId, state, cursor = null, onRetry, hide = [], className }: RunExitBarProps) {
  if (state.banner === null && state.exits.length === 0) return null;
  const unread = state.phase === "unread";
  const exits = state.exits.filter((exit) => !hide.includes(exit));
  if (state.phase === "unavailable") {
    /* D8: one centred, body-size state: the sentence, the id in mono, one exit as a button. */
    return (
      <div
        data-run-exit-bar=""
        role="status"
        className={className}
        style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "48px 16px", textAlign: "center", fontSize: "var(--text-body, 14px)" }}
      >
        {state.banner !== null && (
          <span data-run-phase={state.phase} title={state.tip ?? undefined} aria-label={state.tip !== null ? `${state.banner} ${state.tip}` : undefined} style={{ color: "var(--ink)", fontWeight: 600 }}>
            {state.banner}
          </span>
        )}
        <span className="mono" data-run-id={runId} style={{ color: "var(--ink-soft)", overflowWrap: "anywhere" }}>{runId}</span>
        {exits.map((exit) => (
          <Link key={exit} to={exitHref(exit, runId, { cursor })} data-exit={exit} title={TITLE[exit]} className="btn-ghost" style={{ display: "inline-flex", alignItems: "center", minHeight: 36, padding: "0 16px" }}>
            {LABEL[exit]}
          </Link>
        ))}
      </div>
    );
  }
  return (
    <div
      data-run-exit-bar=""
      role={unread ? "alert" : "status"}
      className={className}
      style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 14px", minHeight: 24 }}
    >
      {state.banner !== null && (
        <span
          data-run-phase={state.phase}
          title={state.tip ?? undefined}
          aria-label={state.tip !== null ? `${state.banner} ${state.tip}` : undefined}
          style={{ color: TONE_VAR[state.tone], fontWeight: 600 }}
        >
          {state.banner}
        </span>
      )}
      {unread && onRetry !== undefined && (
        <button type="button" data-action="retry" onClick={onRetry} title="Read this run again" style={{ minHeight: 24 }}>
          Retry
        </button>
      )}
      {exits.map((exit) => (
        <Link
          key={exit}
          to={exitHref(exit, runId, { cursor })}
          data-exit={exit}
          title={TITLE[exit]}
          style={{ display: "inline-flex", alignItems: "center", minHeight: 24 }}
        >
          {LABEL[exit]}
        </Link>
      ))}
    </div>
  );
}
