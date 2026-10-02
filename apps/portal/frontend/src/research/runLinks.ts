/**
 * W1 §1.4 — one builder per destination, cursor-aware.
 *
 * Rule: a link carries the cursor of the screen it sits on; a link with no
 * cursor in hand carries none (never a hardcoded `fold=1`, never
 * `DEFAULT_CURSOR` for a back-link). Cursor fields carried: stage (set by the
 * destination's meaning), fold, trial, params, schedule, route, seq, carried.*
 * and `?window=` (query).
 *
 * Pure; no React. Stage-fixed destinations (report/RC -> claim, execute ->
 * execute, split/search/freeze -> their own stage) overwrite a stale `stage`.
 */

import { QUANTBT_ROOT } from "../features/quantbt/routes";
import { serializeCursor, type EvidenceCursor, type EvidenceStage } from "./evidenceCursor";
import { withWindow, type EvidenceWindow } from "./evidenceWindow";

export interface LinkCursor {
  cursor?: EvidenceCursor | null;
  window?: EvidenceWindow | null;
}

export type RunPathTail =
  | ""
  | "progress"
  | "evidence"
  | "report"
  | "release-candidate"
  | "split"
  | "search"
  | "freeze"
  | "execute"
  | "overview";

export const runPath = (runId: string, tail: RunPathTail): string =>
  `${QUANTBT_ROOT}/runs/${encodeURIComponent(runId)}${tail === "" ? "" : `/${tail}`}`;

/** Path + (cursor hash with the destination's stage) + (?window=). No cursor in hand -> neither hash. */
function carry(path: string, c: LinkCursor | undefined, stage: EvidenceStage | null): string {
  const cursor = c?.cursor ?? null;
  const base = cursor === null ? path : `${path}${serializeCursor(stage === null ? cursor : { ...cursor, stage })}`;
  return withWindow(base, c?.window ?? null);
}

/** Hub. The stage is the cursor's own unless the caller names one; never defaulted. */
export const hubHref = (runId: string, c?: LinkCursor & { stage?: EvidenceStage }): string =>
  carry(runPath(runId, "evidence"), c, c?.stage ?? null);

export const reportHref = (runId: string, c?: LinkCursor): string => carry(runPath(runId, "report"), c, "claim");

export const rcHref = (runId: string, c?: LinkCursor): string => carry(runPath(runId, "release-candidate"), c, "claim");

export const progressHref = (runId: string, c?: LinkCursor): string => carry(runPath(runId, "progress"), c, null);

export const executeHref = (runId: string, c?: LinkCursor): string => carry(runPath(runId, "execute"), c, "execute");

export const splitHref = (runId: string, c?: LinkCursor): string => carry(runPath(runId, "split"), c, "split");

export const searchHref = (runId: string, c?: LinkCursor): string => carry(runPath(runId, "search"), c, "search");

export const freezeHref = (runId: string, c?: LinkCursor): string => carry(runPath(runId, "freeze"), c, "freeze");

export const overviewHref = (runId: string): string => runPath(runId, "overview");

export const libraryHref = (): string => `${QUANTBT_ROOT}/runs`;

/** Screen 02 seeded from this run (same target `newRunFromHref` has). */
export const newRunHref = (fromRunId: string): string => `${QUANTBT_ROOT}/runs/new?from=${encodeURIComponent(fromRunId)}`;

export interface LineageLinkOptions {
  attempt?: string | null;
  av?: string | null;
  /** Select the attempt that holds this run (a lookup on the returned graph). */
  run?: string | null;
  /** `1` = show every probe attempt. */
  probes?: boolean;
}

/** S10 link. `?run=` is added only where a run id is in hand. */
export function lineageRunHref(alphaId: string, o: LineageLinkOptions = {}): string {
  const params = new URLSearchParams();
  if (o.av) params.set("av", o.av);
  if (o.attempt) params.set("attempt", o.attempt);
  if (o.run) params.set("run", o.run);
  if (o.probes) params.set("probes", "1");
  const query = params.toString();
  return `${QUANTBT_ROOT}/alphas/${encodeURIComponent(alphaId)}/lineage${query ? `?${query}` : ""}`;
}

/** Where each exit of `RunExitBar` goes. `hub`/`report` carry the cursor; the rest carry none. */
export function exitHref(exit: "progress" | "new-run" | "library" | "hub" | "report", runId: string, c?: LinkCursor): string {
  switch (exit) {
    case "progress":
      return progressHref(runId);
    case "new-run":
      return newRunHref(runId);
    case "library":
      return libraryHref();
    case "hub":
      return hubHref(runId, c);
    case "report":
      return reportHref(runId, c);
  }
}
