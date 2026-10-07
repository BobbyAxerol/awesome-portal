/**
 * Screen 02 · "Run type": the versions of this Alpha that have something to run for the chosen dataset, symbol and timeframe, grouped by the
 * route they run (notional, percent equity, bracket, reactive, event-driven). Picking one switches the Alpha version (the recipes below follow).
 * Shown only when there is a choice; a version with no enabled recipe is not offered.
 */
import type { RunType } from "./useRunTypes";

export function RunTypePicker({ types, current, onPick, pending }: { types: readonly RunType[]; current: string; onPick: (versionId: string) => void; pending: boolean }) {
  if (types.length < 2) return pending ? <p className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-run-types="pending">reading run types…</p> : null;
  return (
    <div className="flex flex-col gap-1" data-run-types>
      <span className="mono text-[10px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>Run type</span>
      <div role="radiogroup" aria-label="Run type" className="flex flex-wrap gap-1.5">
        {types.map((type) => {
          const selected = type.versionId === current;
          return (
            <button
              key={type.versionId}
              type="button"
              role="radio"
              aria-checked={selected}
              data-run-type={type.versionId}
              data-selected={selected}
              title={`${type.versionLabel} · ${type.recipes} recipe${type.recipes === 1 ? "" : "s"}`}
              onClick={() => (selected ? undefined : onPick(type.versionId))}
              className="mono rounded-[5px] border px-2.5 py-1 text-[10px]"
              style={{
                borderColor: selected ? "var(--accent)" : "var(--line)",
                background: selected ? "var(--accent-soft)" : "var(--paper-raised)",
                color: selected ? "var(--accent)" : "var(--ink-soft)",
              }}
            >
              {type.label} <span style={{ color: "var(--ink-faint)" }}>{type.recipes}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
