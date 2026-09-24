/**
 * Screen 03 · the Stage log tab (FE-S03-06, HiFi release-v1.1).
 *
 * One row per reported fold, in the HiFi's column grid. The progress read
 * publishes each fold's start, end and state; it does not publish the study's
 * trial count, best J₁, selected trial or params digest. Those cells are
 * shells that say so (DQ-14) — a dash would read as "zero" or "none", and a
 * value copied from the HiFi would be a study nobody ran.
 */

import type { CSSProperties } from "react";

import type { ProgressSnapshot } from "./progressClient";
import { NotPublished } from "./RunMetaStrip";

const MONO = "var(--font-mono)";

/** Why the selection columns are empty, said once per cell tooltip. */
export const LEDGER_NOT_PUBLISHED_REASON =
  "The progress read publishes each fold's start, end and state only — not its trial count, best J₁, selected trial or params digest.";

export const LEDGER_FOOT =
  "ledger — one row per reported fold · trials, best J₁, selection and params digest are not published by the progress read";

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
}

export function StageLedger({ folds, foldTrials, cursor }: StageLedgerProps) {
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
              <span role="cell" style={cell(2)}>
                {running && trial !== undefined ? `latest ${trial.toLocaleString("en-US")}` : missing}
              </span>
              <span role="cell" style={cell(3)}>
                {missing}
              </span>
              <span role="cell" style={cell(4)}>
                {missing}
              </span>
              <span role="cell" style={cell(5)}>
                {missing}
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
      <div
        style={{
          padding: "6px 12px",
          borderTop: "1px solid var(--line-soft)",
          fontFamily: MONO,
          fontSize: 10,
          color: "var(--ink-faint)",
        }}
      >
        {LEDGER_FOOT}
      </div>
    </div>
  );
}
