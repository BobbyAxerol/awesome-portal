/** Console stream analysis (v0.1.1) — operational progress from the worker's
 *  captured optuna output. Used ONLY for display (fold status, ETA estimate);
 *  the structured audit ledger always comes from artifacts. */

export interface ConsoleStats {
  /** Number of Optuna studies started so far (= folds running for per-fold
   *  schedules, capped at the fold count by the caller). */
  studyStarts: number;
  /** Total "Trial N finished" lines seen across all studies. */
  trialsDone: number;
  /** Best trial id known per study index (null until known). */
  bestByStudy: Array<number | null>;
}

export function parseConsoleStats(lines: string[]): ConsoleStats {
  let studyStarts = 0;
  let trialsDone = 0;
  const bestByStudy: Array<number | null> = [];
  let pendingBest: number | null = null;

  for (const line of lines) {
    if (line.includes("A new study created")) {
      if (studyStarts > 0) bestByStudy[studyStarts - 1] = pendingBest;
      studyStarts += 1;
      pendingBest = null;
      continue;
    }
    if (/Trial\s+\d+\s+finished with value:/.test(line)) {
      trialsDone += 1;
    }
    const best = line.match(/Best is trial\s+(\d+)/);
    if (best) {
      pendingBest = Number(best[1]);
    }
  }
  if (studyStarts > 0) {
    bestByStudy[studyStarts - 1] = pendingBest;
  }
  return { studyStarts, trialsDone, bestByStudy };
}

/** Estimated completion time (seconds remaining), from completed work over
 *  total work. Returns null until at least 5% of the work is done. */
export function estimateEtaSeconds(
  completed: number,
  total: number,
  elapsedSeconds: number,
): number | null {
  if (total <= 0 || completed <= 0 || elapsedSeconds <= 0) return null;
  const fraction = completed / total;
  if (fraction < 0.05) return null;
  return Math.max(0, (elapsedSeconds / fraction) * (1 - fraction));
}

/** Map raw console lines to render rows with display-only fold separators. */
export interface ConsoleRow {
  kind: "separator" | "line";
  text: string;
  fold: number | null;
}

export function annotateConsoleLines(lines: string[]): ConsoleRow[] {
  const rows: ConsoleRow[] = [];
  let fold = 0;
  for (const line of lines) {
    if (line.includes("A new study created")) {
      fold += 1;
      rows.push({ kind: "separator", text: `fold ${fold} — study started`, fold });
      continue;
    }
    rows.push({ kind: "line", text: line, fold: fold || null });
  }
  return rows;
}
