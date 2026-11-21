/**
 * D1 / audit X1 and X-1 — the run and the screen in the shell topbar.
 *
 * The hi-fi's topbar reads `Research / QuantBT Backtest / R-WFO-118 / Stage 1
 * · Split`; the shipped one stopped at the feature on every stage screen. The
 * missing tail is a shell concern, not a screen one: the run id is already in
 * the address, and the run's short label is already in the shared registry
 * that `ShortId` reads. Deriving it here means no Research screen has to be
 * edited to put its own run in the topbar — and none of them can disagree
 * about how it is written.
 *
 * A screen may still name its own tail through the presentation context
 * (`entityLabel`); Screen 04's cursor lives in the hash, so only that screen
 * knows which stage is open. The shell supplies the tail only when the screen
 * named none.
 */

import { useSyncExternalStore } from "react";
import { matchPath } from "react-router-dom";

import { shortId } from "../research/researchFormat";
import { runLabelFor } from "../research/runLabels";

/** The canonical run-scoped address family (`features/quantbt/routes.ts`). */
const RUN_ROUTE = "/research/quantbt/runs/:runId/*";

/**
 * The screen each run-scoped segment is called in the topbar.
 *
 * Spelled out rather than derived from the registry title, because the hi-fi
 * writes the four deep dives as their stage (`Stage 1 · Split`) and the
 * registry writes them as feature screens. A segment absent here contributes
 * no tail at all — the shell never invents a screen name from a URL.
 */
export const RUN_SCREEN_CRUMBS: Readonly<Record<string, string>> = {
  progress: "Run Progress",
  evidence: "Evidence Flow",
  split: "Stage 1 · Split",
  search: "Stage 2 · Search",
  freeze: "Stage 3 · Freeze",
  execute: "Stage 4 · Execute",
  report: "Run Report",
  "release-candidate": "Release candidate",
};

/**
 * The segments whose screens make NO read that carries the run's label on the
 * P04 hub lane (G3 · D1-O1 follow-up).
 *
 * Screens 03 and 04 read the run's identity, Screens 09, 11 and 13 publish the
 * label in their own read, and Screen 10 reads it off the lineage — each feeds
 * the shared registry by itself. Stages 1–4 read the P14–P17 hub, which names
 * the run by id only; a retained Delta WFO run reaches its label through the
 * identity read a retained answer triggers, but a fixed-profile run never asks
 * for one, so a cold link to `…/execute` printed `rrun_464bf9c3` where
 * `R-P04-018` belongs. The shell asks the Run Library for the one row instead
 * (see `useRunLabelRead`), and only for these four screens.
 */
export const RUN_LABEL_READ_SEGMENTS: ReadonlySet<string> = new Set(["split", "search", "freeze", "execute"]);

export interface ResearchRunCrumb {
  /** `R-WFO-118` when a read published one, else the short id. */
  label: string;
  /** The full id, for the accessible name and the hover. */
  runId: string;
  /** Where the run crumb goes: the run's Evidence Flow hub. */
  route: string;
  /** The screen inside the run, or `null` when this segment names none. */
  screen: string | null;
  /** True on a screen whose own reads publish no run label, so the shell must ask for it. */
  needsLabelRead: boolean;
}

/**
 * The run crumb for a pathname, or `null` when the address is not run-scoped.
 *
 * `runLabelFor` is read rather than subscribed to here so this stays a pure
 * function of the path; the caller subscribes (see `useResearchRunCrumb`).
 */
export function researchRunCrumb(pathname: string): ResearchRunCrumb | null {
  const match = matchPath({ path: RUN_ROUTE, end: false }, pathname);
  const runId = match?.params.runId;
  if (typeof runId !== "string" || runId.length === 0) return null;
  /* `runs/new` is the wizard, not a run. */
  if (runId === "new") return null;
  const rest = (match?.params["*"] ?? "").split("/")[0] ?? "";
  const known = runLabelFor(runId);
  return {
    label: known ?? shortId(runId) ?? runId,
    runId,
    route: `/research/quantbt/runs/${encodeURIComponent(runId)}/evidence`,
    screen: RUN_SCREEN_CRUMBS[rest] ?? null,
    needsLabelRead: RUN_LABEL_READ_SEGMENTS.has(rest),
  };
}

/* ------------------------------------------------- unknown run (W4D)
 * A run the workspace does not list (404 = 403, F-04) is plain text in the
 * crumb: a link would only lead to the same "not available" hub. A screen that
 * learned the run is not available says so here; the TopBar subscribes. */
const unknownRuns = new Set<string>();
const unknownListeners = new Set<() => void>();

export function markRunUnknown(runId: string | null | undefined): void {
  if (typeof runId !== "string" || runId.length === 0 || unknownRuns.has(runId)) return;
  unknownRuns.add(runId);
  unknownListeners.forEach((listener) => listener());
}

export function isRunUnknown(runId: string | null | undefined): boolean {
  return typeof runId === "string" && unknownRuns.has(runId);
}

/** Test seam. */
export function forgetUnknownRuns(): void {
  if (unknownRuns.size === 0) return;
  unknownRuns.clear();
  unknownListeners.forEach((listener) => listener());
}

export function useRunUnknown(runId: string | null | undefined): boolean {
  return useSyncExternalStore(
    (listener) => {
      unknownListeners.add(listener);
      return () => {
        unknownListeners.delete(listener);
      };
    },
    () => isRunUnknown(runId),
    () => false,
  );
}
