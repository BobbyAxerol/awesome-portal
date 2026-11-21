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
  progress: "Progress",
  evidence: "Evidence",
  split: "Split",
  search: "Search",
  freeze: "Freeze",
  execute: "Execute",
  report: "Report",
  "release-candidate": "Release candidate",
};

/** Screens named by the screen alone. ONE pattern everywhere: `<Screen> · <Run label>`; no product prefix. */
const PLAIN: ReadonlyArray<readonly [RegExp, string]> = [
  [/\/research\/quantbt(?:\/(?:journey\/?)?)?$/, "Journey"],
  [/\/research\/quantbt\/runs\/?$/, "Library"],
  [/\/research\/quantbt\/runs\/new\/?$/, "New run"],
  [/\/research\/quantbt\/atlas\/?$/, "Atlas"],
  [/\/research\/quantbt\/alpha-import\/?$/, "Import alpha"],
  [/\/research\/quantbt\/compare\/?$/, "Compare"],
];

/** Alpha-scoped screens: the alpha id from the address is the label. */
const ALPHA_SCREENS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\/research\/quantbt\/alphas\/([^/]+)\/lineage\/?$/, "Lineage"],
  [/\/research\/quantbt\/alphas\/([^/]+)\/compare\/?$/, "Compare"],
];

/** The run a Research Loop per-run path names, or `null`. */
export function runIdFromPath(pathname: string): string | null {
  const match = /\/research\/quantbt\/runs\/([^/]+)\/(progress|evidence|split|search|freeze|execute|report|release-candidate)\/?$/.exec(pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

/** `null` for a path that is not a Research Loop screen (the shell keeps its own title). */
export function researchDocumentTitle(pathname: string, runLabel: string | null): string | null {
  for (const [pattern, title] of PLAIN) if (pattern.test(pathname)) return title;
  for (const [pattern, title] of ALPHA_SCREENS) {
    const alpha = pattern.exec(pathname);
    if (alpha) return `${title} · ${decodeURIComponent(alpha[1])}`;
  }
  const rc = /\/research\/quantbt\/release-candidates\/([^/]+)\/?$/.exec(pathname);
  if (rc) return "Release candidate";
  const match = /\/research\/quantbt\/runs\/[^/]+\/([^/]+)\/?$/.exec(pathname);
  const base = match ? RUN_SCREENS[match[1]] : undefined;
  if (!base) return null;
  return runLabel ? `${base} · ${runLabel}` : base;
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
