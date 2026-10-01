/**
 * Screen 03 · the planned outer-OOS windows (CG-FG-S03-01), one thin rail above the fold Gantt.
 *
 * `run.planned_folds` is the P08 topology's admitted plan, published at admission: it says what
 * WILL be tested, not what ran. The observed folds (`progress.folds`) stay the Gantt's own rows;
 * this rail only colours a planned cell by the observed fold with the same number, so the plan and
 * the run read as one line. Nothing is derived: every printed bound is the server's timestamp, and
 * a plan the server did not publish is a typed absence with the server's own reason code.
 */

import type { ProgressRunIdentity } from "./progressClient";
import { NotPublished } from "./RunMetaStrip";
import { formatUtc } from "./researchFormat";

const MONO = "var(--font-mono)";

type Observed = ReadonlyArray<{ fold: number; state: string }>;

const TONE: Record<string, string> = {
  DONE: "var(--good)",
  RUNNING: "var(--accent)",
  FAILED: "var(--bad)",
};

const id = (fold: number) => `fold_${String(fold).padStart(2, "0")}`;

export function PlannedWindows({
  planned,
  observed,
}: {
  /** `read.run.planned_folds`; `undefined` while identity is unread or the server predates the field. */
  planned: ProgressRunIdentity["planned_folds"] | undefined;
  observed: Observed;
}) {
  if (planned === undefined) {
    return (
      <div data-planned-windows="absent" style={ROW}>
        <span>planned OOS windows</span> <NotPublished what="not published" reason="This progress read does not carry the planned fold windows." />
      </div>
    );
  }
  if (planned.state !== "AVAILABLE") {
    return (
      <div data-planned-windows="absent" data-reason-code={planned.reason_code ?? undefined} style={ROW}>
        <span>planned OOS windows</span> <NotPublished what="not published" reason={planned.reason_code} />
        {planned.reason_code ? <span style={{ color: "var(--ink-faint)" }}>{planned.reason_code}</span> : null}
      </div>
    );
  }
  const folds = planned.folds;
  if (folds.length === 0) return null;
  const first = folds[0]!;
  const last = folds[folds.length - 1]!;
  const stateOf = (fold: number) => observed.find((o) => o.fold === fold)?.state ?? null;
  return (
    <div data-planned-windows={folds.length} style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
      <div style={ROW}>
        <span>
          planned OOS windows <span style={{ color: "var(--ink)" }}>{folds.length}</span>
        </span>
        <span data-planned-span title="First planned test start and last planned test end, as admitted at the P08 topology">
          {formatUtc(first.test_start_utc_ms)} → {formatUtc(last.test_end_utc_ms)}
        </span>
      </div>
      <div role="list" aria-label="Planned OOS windows" style={{ display: "flex", gap: 2 }}>
        {folds.map((window) => {
          const state = stateOf(window.fold);
          const tone = state === null ? null : (TONE[state] ?? null);
          const text = `${id(window.fold)} · test ${formatUtc(window.test_start_utc_ms)} → ${formatUtc(window.test_end_utc_ms)} · ${state === null ? "planned" : state.toLowerCase()}`;
          return (
            <span
              key={window.fold}
              role="listitem"
              data-planned-fold={window.fold}
              data-planned-state={state ?? "PLANNED"}
              title={text}
              aria-label={text}
              style={{
                flex: 1,
                minWidth: 4,
                height: 10,
                borderRadius: 2,
                border: `1px ${tone === null ? "dashed" : "solid"} ${tone ?? "var(--line-strong)"}`,
                background: tone === null ? "transparent" : tone,
                opacity: state === "RUNNING" ? 0.55 : 1,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

const ROW = {
  display: "flex",
  flexWrap: "wrap",
  gap: "2px 14px",
  fontFamily: MONO,
  fontSize: 10.5,
  color: "var(--ink-soft)",
  marginBottom: 6,
} as const;
