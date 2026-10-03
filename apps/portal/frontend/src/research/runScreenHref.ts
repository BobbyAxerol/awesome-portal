/**
 * The ONE link builder for a run's screens (W5 §3.1-3.2).
 *
 * `runScreenHref(runId, screen, cursor, over?)` is the only place that knows
 * the run path table and which cursor keys each destination carries. No
 * component may concatenate `/runs/${id}/...#` itself, and `runLinks.ts`
 * (`hubHref`, `reportHref`, ...) delegates here.
 *
 * Rules
 *  - A link with no cursor in hand carries none: `cursor === null` and no
 *    `over` gives the bare path (never a hard-coded `fold=1`).
 *  - `over` is merged on top of `cursor` (e.g. `{ fold: 3 }` for a per-fold row).
 *  - The destination fixes `stage` for its own screen; the hub keeps the
 *    cursor's stage unless `over.stage` names one.
 *  - `window` is a hash key (never `?window=`). It is written only when named.
 *  - `seq` goes only to S08 (execute) and to the hub on its execute tab.
 *  - Report / release candidate (S09 / S11) take `stage=claim`, fold, trial,
 *    params, and the window (so Back from the report returns to the same view;
 *    the report itself ignores it). No schedule / route / seq / carried.
 *  - Progress is not a cursor screen: it takes `fold` only.
 *
 * Pure; no React.
 */

import { QUANTBT_ROOT } from "../features/quantbt/routes";
import { cursorHash, type CursorKeyName, type EvidenceCursor, type EvidenceStage } from "./evidenceCursor";

export type RunScreen = "hub" | "split" | "search" | "freeze" | "execute" | "report" | "release-candidate" | "progress";

/** Path segment after `/runs/:id` for each screen ("" = none). */
const PATH_TAIL: Record<RunScreen, string> = {
  hub: "evidence",
  split: "split",
  search: "search",
  freeze: "freeze",
  execute: "execute",
  report: "report",
  "release-candidate": "release-candidate",
  progress: "progress",
};

const STAGE_KEYS: ReadonlyArray<CursorKeyName | "carried"> = ["stage", "fold", "trial", "params", "schedule", "route", "window", "carried"];

/** The destination's own stage; `null` = keep the cursor's. */
const FIXED_STAGE: Record<RunScreen, EvidenceStage | null> = {
  hub: null,
  split: "split",
  search: "search",
  freeze: "freeze",
  execute: "execute",
  report: "claim",
  "release-candidate": "claim",
  progress: null,
};

/** Keys carried per destination (§3.2 last column). `hub` adds `seq` only on its execute tab. */
const KEYS: Record<RunScreen, ReadonlySet<CursorKeyName | "carried">> = {
  hub: new Set(STAGE_KEYS),
  split: new Set(STAGE_KEYS),
  search: new Set(STAGE_KEYS),
  freeze: new Set(STAGE_KEYS),
  execute: new Set([...STAGE_KEYS, "seq"]),
  report: new Set(["stage", "fold", "trial", "params", "window"]),
  "release-candidate": new Set(["stage", "fold", "trial", "params", "window"]),
  progress: new Set(["fold"]),
};
const HUB_EXECUTE_KEYS: ReadonlySet<CursorKeyName | "carried"> = new Set([...STAGE_KEYS, "seq"]);

/** `/research/quantbt/runs/:id[/tail]` — the path half of every run link. */
export function runScreenPath(runId: string, screen: RunScreen | ""): string {
  const base = `${QUANTBT_ROOT}/runs/${encodeURIComponent(runId)}`;
  return screen === "" ? base : `${base}/${PATH_TAIL[screen]}`;
}

export function runScreenHref(
  runId: string,
  screen: RunScreen,
  cursor: EvidenceCursor | null,
  over?: Partial<EvidenceCursor>,
): string {
  const path = runScreenPath(runId, screen);
  if (cursor === null && over === undefined) return path;
  const merged = { ...(cursor ?? BLANK), ...over } as EvidenceCursor;
  const stage = FIXED_STAGE[screen] ?? merged.stage;
  const keys = screen === "hub" && stage === "execute" ? HUB_EXECUTE_KEYS : KEYS[screen];
  /* No cursor in hand: only what `over` names is written (a bare fold is never invented). */
  const wire = cursor === null ? onlyNamed(merged, over ?? {}, keys, FIXED_STAGE[screen]) : cursorHash({ ...merged, stage }, keys);
  return `${path}${wire}`;
}

const BLANK: EvidenceCursor = {
  stage: "summary",
  fold: 1,
  trial: null,
  params: null,
  schedule: null,
  route: null,
  seq: null,
  window: null,
};

/** With no base cursor, write the keys `over` named (and the destination's stage when it has one). */
function onlyNamed(
  merged: EvidenceCursor,
  over: Partial<EvidenceCursor>,
  keys: ReadonlySet<CursorKeyName | "carried">,
  fixedStage: EvidenceStage | null,
): string {
  const named = new Set<CursorKeyName | "carried">();
  for (const key of Object.keys(over) as Array<CursorKeyName | "carried">) if (keys.has(key)) named.add(key);
  if (named.size === 0) return "";
  if (fixedStage !== null || over.stage !== undefined) named.add("stage");
  return cursorHash({ ...merged, stage: fixedStage ?? merged.stage }, named);
}
