/*
 * The browser tab title of each Research Loop screen — the HiFi `<title>`
 * (release-v1.1, line 11 of every file). Evidence Flow and Run Report carry the
 * run in the title in the HiFi; the other per-run screens get the same suffix so
 * several runs open in tabs stay distinguishable. The run is written the way
 * every screen writes it: the server's label when a read published one, else
 * the short id.
 */
import { useEffect } from "react";
import { runLabelOrShortId, useRunLabel } from "./runLabels";

const RUN_SCREENS: Readonly<Record<string, string>> = {
  progress: "QuantBT — Run Progress",
  evidence: "QuantBT Evidence Flow",
  split: "QuantBT Stage 1 — Split & Windows",
  search: "QuantBT Stage 2 — Search & Selection",
  freeze: "QuantBT Stage 3 — Freeze",
  execute: "QuantBT Stage 4 — Execute Replay",
  report: "Backtest Evidence Report",
  "release-candidate": "QuantBT — Release Candidate & Publish",
};

/** Screens whose HiFi title is only the screen name (no run in it). */
const PLAIN: ReadonlyArray<readonly [RegExp, string]> = [
  [/\/research\/quantbt\/journey\/?$/, "QuantBT — Journey Map"],
  [/\/research\/quantbt\/runs\/?$/, "QuantBT — Run Library"],
  [/\/research\/quantbt\/runs\/new\/?$/, "QuantBT — New Run"],
  [/\/research\/quantbt\/atlas\/?$/, "QuantBT — Engine Atlas"],
  [/\/research\/quantbt\/alpha-import\/?$/, "QuantBT — Alpha Import"],
  [/\/research\/quantbt\/compare\/?$/, "QuantBT — Compare"],
  [/\/research\/quantbt\/alphas\/[^/]+\/lineage\/?$/, "QuantBT — Attempt Lineage"],
  [/\/research\/quantbt\/alphas\/[^/]+\/compare\/?$/, "QuantBT — Compare"],
  [/\/research\/quantbt\/release-candidates\/[^/]+\/?$/, "QuantBT — Release Candidate & Publish"],
];

/** The run a Research Loop per-run path names, or `null`. */
export function runIdFromPath(pathname: string): string | null {
  const match = /\/research\/quantbt\/runs\/([^/]+)\/(progress|evidence|split|search|freeze|execute|report|release-candidate)\/?$/.exec(pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

/** `null` for a path that is not a Research Loop screen (the shell keeps its own title). */
export function researchDocumentTitle(pathname: string, runLabel: string | null): string | null {
  for (const [pattern, title] of PLAIN) if (pattern.test(pathname)) return title;
  const match = /\/research\/quantbt\/runs\/[^/]+\/([^/]+)\/?$/.exec(pathname);
  const base = match ? RUN_SCREENS[match[1]] : undefined;
  if (!base) return null;
  return runLabel ? `${base} — ${runLabel}` : base;
}

/** Sets `document.title` for the mounted Research Loop screen and restores the previous one on leave. */
export function useResearchDocumentTitle(pathname: string): void {
  const runId = runIdFromPath(pathname);
  useRunLabel(runId); // re-render when the label read lands
  const title = researchDocumentTitle(pathname, runId ? runLabelOrShortId(runId) : null);
  useEffect(() => {
    if (title === null) return undefined;
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
