/**
 * Screen 03 · the Stage log tab (FE-S03-06, HiFi release-v1.1).
 *
 * One row per reported fold, in the HiFi's column grid. Start, end and state
 * come from the fold row; objective, selected trial and params digest from
 * the fold's published `selection` (CG-P11-03). A global study selects one
 * bundle for every fold, so its objective is the study's, labelled so; a
 * fixed profile ran no search and has no objective at all. A fold whose
 * selection is not published keeps a shell that says so (DQ-14).
 */

import type { CSSProperties } from "react";

import { NOT_PUBLISHED_SELECTION, type FoldSelection, type ProgressSnapshot } from "./progressClient";
import { formatMetric, shortDigest } from "./researchFormat";
import { NotPublished } from "./RunMetaStrip";

const MONO = "var(--font-mono)";

/** Why the selection columns are empty, said once per cell tooltip. */
export const LEDGER_NOT_PUBLISHED_REASON =
  "The source has not published this fold's selection (objective, selected trial, params digest).";

/** A global study's objective is study-wide; a fixed profile has none. */
export const GLOBAL_OBJECTIVE_NOTE = "One global study selected this bundle for every fold; the objective is study-wide.";

/**
 * 03-M: which selection scopes ran no search. `IMPORTED_FIXED_PROFILE` is an
 * imported alpha's fixed profile — the same absence of a study as
 * `FIXED_PROFILE`, so it must not print a per-fold "study N / M" line. Keyed by
 * the generated union (not a prefix match) so a scope the contract adds later
 * fails to compile here instead of defaulting to "a search ran".
 */
const SCOPE_RAN_NO_SEARCH: Record<NonNullable<FoldSelection["scope"]>, boolean> = {
  GLOBAL_STUDY: false,
  /* A real study runs inside each outer fold: a search ran, so the per-fold "study N / M" line stays. */
  PER_FOLD_STUDY: false,
  FIXED_PROFILE: true,
  IMPORTED_FIXED_PROFILE: true,
};

/** Whether this scope is a fixed profile: no search ran, no objective exists. */
export function isFixedProfileScope(scope: FoldSelection["scope"] | undefined): boolean {
  return scope !== null && scope !== undefined && SCOPE_RAN_NO_SEARCH[scope];
}

/** `HH:MM:SSZ` from a server timestamp; never the local clock. */
export function utcClock(ms: number | null): string | null {
  return ms === null ? null : `${new Date(ms).toISOString().slice(11, 19)}Z`;
}

const COLUMNS: readonly [label: string, width: number | null, align: "left" | "right", pad?: number][] = [
  ["fold", 64, "left"],
  ["study started", 110, "left"],
  ["trials", 88, "right"],
  ["best J₁", 80, "right"],
  ["selected", 90, "right"],
  ["params digest", 110, "left", 14],
  ["frozen at", 110, "left"],
  ["state", null, "left", 14],
];

function cell(index: number): CSSProperties {
  const [, width, align, pad] = COLUMNS[index];
  return width === null
    ? { flex: 1, paddingLeft: pad ?? 0, minWidth: 90 }
    : { width, flex: "none", textAlign: align, paddingLeft: pad ?? 0 };
}

export interface StageLedgerProps {
  folds: ProgressSnapshot["folds"];
  /** Latest published trial per fold, shown only on a running fold. */
  foldTrials: Readonly<Record<number, number>>;
  cursor: number | null;
  /** The study's trial counter, shown on a global-study fold. */
  studyTrials?: { done: number; declared: number } | null;
}

export function StageLedger({ folds, foldTrials, cursor, studyTrials = null }: StageLedgerProps) {
  const missing = <NotPublished reason={LEDGER_NOT_PUBLISHED_REASON} what="n/p" />;
  return (
    <div
      data-stage-ledger
      role="table"
      aria-label="Stage log — one row per reported fold"
      style={{
        border: "1px solid var(--line)",
        borderRadius: 6,
        background: "var(--paper-raised)",
        overflowX: "auto",
      }}
    >
      <div
        role="row"
        style={{
          display: "flex",
          minWidth: 760,
          fontSize: 9.5,
          letterSpacing: ".06em",
          textTransform: "uppercase",
          color: "var(--ink-faint)",
          borderBottom: "1px solid var(--line-soft)",
          padding: "6px 12px",
        }}
      >
        {COLUMNS.map(([label], index) => (
          <span key={label} role="columnheader" style={cell(index)}>
            {label}
          </span>
        ))}
      </div>
      {folds.length === 0 ? (
        <div style={{ padding: "6px 12px", fontSize: 10.5, color: "var(--ink-faint)" }} data-ledger-empty>
          No fold has reported yet.
        </div>
      ) : (
        folds.map((fold) => {
          const running = fold.state === "RUNNING";
          const current = cursor === fold.fold;
          const tone = fold.state === "DONE" ? "var(--good)" : fold.state === "FAILED" ? "var(--bad)" : "var(--accent)";
          const trial = foldTrials[fold.fold];
          const selection = fold.selection ?? NOT_PUBLISHED_SELECTION;
          const available = selection.state === "AVAILABLE";
          const global = available && selection.scope === "GLOBAL_STUDY";
          const trialsCell = running && trial !== undefined
            ? `latest ${trial.toLocaleString("en-US")}`
            : global && studyTrials
              ? `${studyTrials.done.toLocaleString("en-US")} · global`
              : available && isFixedProfileScope(selection.scope)
                ? "1 · fixed"
                : null;
          return (
            <div
              key={fold.fold}
              role="row"
              data-ledger-row={fold.fold}
              style={{
                display: "flex",
                alignItems: "baseline",
                minWidth: 760,
                padding: "5px 12px",
                borderBottom: "1px solid var(--paper-sunken)",
                fontFamily: MONO,
                fontSize: 10.5,
                ...(running || current
                  ? { background: "var(--accent-soft)", borderLeft: "2px solid var(--accent)", paddingLeft: 10 }
                  : {}),
              }}
            >
              <span role="cell" style={cell(0)}>
                fold_{String(fold.fold).padStart(2, "0")}
              </span>
              <span role="cell" style={{ ...cell(1), color: "var(--ink-soft)" }}>
                {utcClock(fold.started_at_utc_ms) ?? <NotPublished what="n/p" />}
              </span>
              <span role="cell" style={cell(2)} data-ledger-trials={fold.fold}>
                {trialsCell ?? missing}
              </span>
              <span
                role="cell"
                style={{ ...cell(3), color: "var(--good)" }}
                data-ledger-objective={fold.fold}
                title={global ? `${selection.objective ?? ""} · ${GLOBAL_OBJECTIVE_NOTE}` : selection.objective ?? undefined}
              >
                {!available ? (
                  missing
                ) : selection.objective === null ? (
                  <NotPublished reason="A fixed profile ran no search, so it has no objective." what="no search" />
                ) : (
                  <>
                    {formatMetric(selection.objective, "ratio") ?? selection.objective}
                    {global ? <span style={{ color: "var(--ink-faint)" }}> g</span> : null}
                  </>
                )}
              </span>
              <span role="cell" style={cell(4)} data-ledger-selected={fold.fold}>
                {available && selection.trial !== null ? `#${selection.trial.toLocaleString("en-US")}` : missing}
              </span>
              <span
                role="cell"
                style={{ ...cell(5), color: "var(--accent)" }}
                data-ledger-digest={fold.fold}
                title={selection.params_digest ?? undefined}
              >
                {available && selection.params_digest !== null ? `prm_${shortDigest(selection.params_digest, 6)}` : missing}
              </span>
              <span role="cell" style={{ ...cell(6), color: "var(--ink-soft)" }}>
                {utcClock(fold.completed_at_utc_ms) ?? (
                  <span style={{ color: "var(--ink-faint)" }}>{running ? "running" : "not reported"}</span>
                )}
              </span>
              <span role="cell" style={{ ...cell(7), color: tone, fontSize: 10 }}>
                {fold.state}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}
