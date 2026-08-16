/** Fold Gantt (v0.1.1) — shared by Run Progress (live) and result views.
 *  Renders the deterministic fold plan: train bars (accent-soft) + test bars
 *  (accent), expanding vs rolling windows, per-fold status from console
 *  progress counters. */
import { Check, Loader2 } from "lucide-react";

import type { RunFoldPlan } from "../lib/api";
import { fmtTimestamp } from "../lib/format";
import { activeTheme, canvasTokens, vizTokensFor } from "../styles/tokens";

const theme = activeTheme();
const L = {
  good: canvasTokens(theme).good,
  accent: canvasTokens(theme).accent,
  pending: vizTokensFor(theme).pending,
  train: vizTokensFor(theme).train,
};

export function FoldGantt({
  plan,
  studyStarts,
  bestByStudy,
  running,
}: {
  plan: RunFoldPlan;
  studyStarts: number;
  bestByStudy: Array<number | null>;
  running: boolean;
}) {
  const folds = plan.folds;
  const advanced = plan.protocol === "advanced_walk_forward";
  const advancedRows = advanced
    ? (folds as Array<{ fold_id: number; train_start: string; train_end: string; test_start: string; test_end: string }>)
    : [];
  const windows = advancedRows
    .map((f) => ({
      id: f.fold_id,
      start: new Date(f.train_start.slice(0, 10)).getTime(),
      end: new Date(f.test_end.slice(0, 10)).getTime(),
      trainStart: new Date(f.train_start.slice(0, 10)).getTime(),
      testStart: new Date(f.test_start.slice(0, 10)).getTime(),
    }))
    .filter((w) => Number.isFinite(w.start) && Number.isFinite(w.end));

  const min = windows.length ? Math.min(...windows.map((w) => w.start)) : Date.now();
  const max = windows.length ? Math.max(...windows.map((w) => w.end)) : Date.now() + 1;
  const span = Math.max(1, max - min);
  const pos = (t: number) => ((t - min) / span) * 100;

  if (!advanced) {
    const roles = ["is", "oos", "holdout_live"];
    const roleColors = ["var(--role-is)", "var(--role-oos)", "var(--role-holdout)"];
    return (
      <div className="card p-4">
        <div className="label mb-2">Window timeline — IS / OOS / Holdout Live</div>
        <div className="flex h-8 w-full gap-0.5 rounded-md">
          {folds.map((fold, index) => {
            const start = new Date((fold.start as string).slice(0, 10)).getTime();
            const end = new Date((fold.end as string).slice(0, 10)).getTime();
            const left = pos(start);
            const width = Math.max(1.5, pos(end) - left);
            return (
              <div
                key={fold.fold_id}
                className="h-4 rounded"
                style={{ width: `${width}%`, marginLeft: `${left}%`, background: roleColors[index % 3], opacity: 0.85 }}
              />
            );
          })}
        </div>
        <div className="mt-2 flex flex-wrap gap-3">
          {folds.map((fold, index) => (
            <span key={fold.fold_id} className="seg-legend">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ background: roleColors[index % 3] }} />
              {roles[index] ?? fold.role} · {fmtTimestamp(fold.start)} → {fmtTimestamp(fold.end)}
            </span>
          ))}
        </div>
      </div>
    );
  }

  const expanding = windows.length > 1 && new Set(windows.map((w) => w.trainStart)).size === 1;
  const current = Math.min(studyStarts, windows.length);

  return (
    <div className="card p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="label">Fold timeline — {expanding ? "expanding" : "rolling"} windows</span>
        <span className="mono text-[10px] text-ink-faint">
          train = accent-soft · test = accent · running = pulse · {windows.length} folds
        </span>
      </div>
      <div className="space-y-1">
        {windows.map((fold) => {
          const index = fold.id;
          const done = index < current - 1 || (running === false && index < current);
          const active = index === current - 1 && running;
          const best = bestByStudy[index];
          return (
            <div key={fold.id} className="grid grid-cols-[64px_1fr_auto] items-center gap-2">
              <span className="mono text-[11px] text-ink-soft">fold {fold.id + 1}</span>
              <div className="relative h-4 rounded-full bg-sunken">
                <div
                  className="absolute h-4 rounded-full"
                  style={{
                    left: `${pos(fold.trainStart)}%`,
                    width: `${pos(fold.testStart) - pos(fold.trainStart)}%`,
                    background: L.train,
                    opacity: active ? 1 : done ? 0.75 : 0.4,
                  }}
                />
                <div
                  className={`absolute h-4 rounded-full ${active ? "animate-pulse" : ""}`}
                  style={{
                    left: `${pos(fold.testStart)}%`,
                    width: `${pos(fold.end) - pos(fold.testStart)}%`,
                    background: active ? L.accent : done ? L.accent : L.pending,
                    opacity: active ? 1 : done ? 0.85 : 0.5,
                  }}
                />
              </div>
              <span className="mono flex items-center gap-2 text-[10px] text-ink-faint">
                <span title={advancedRows[fold.id]?.test_start ?? ""}>
                  {fmtTimestamp(advancedRows[fold.id]?.test_start ?? "").slice(5, 10)}
                </span>
                {active ? <Loader2 size={11} className="animate-spin text-accent" /> : done ? <Check size={11} className="text-good" /> : null}
                {best != null ? (
                  <span className="rounded-full bg-accent-2-soft px-1.5 text-[9px] font-semibold text-accent-2">best #{best}</span>
                ) : null}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
