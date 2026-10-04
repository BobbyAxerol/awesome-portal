/**
 * W1 §1.4 — one builder per destination, cursor-aware. W5 §3.1: every builder
 * delegates to `runScreenHref`, which owns the path table and the keys each
 * destination carries (see its header). Exported names and signatures are
 * unchanged.
 *
 * Rule: a link carries the cursor of the screen it sits on; a link with no
 * cursor in hand carries none (never a hardcoded `fold=1`, never
 * `DEFAULT_CURSOR` for a back-link). `window` is a hash key of the cursor; a
 * `window` passed beside it overrides the cursor's own (null = keep the cursor's).
 *
 * Pure; no React.
 */

import { QUANTBT_ROOT } from "../features/quantbt/routes";
import type { EvidenceCursor, EvidenceStage } from "./evidenceCursor";
import type { EvidenceWindow } from "./evidenceWindow";
import { runScreenHref, runScreenPath, type RunScreen } from "./runScreenHref";

export interface LinkCursor {
  /** Explicit navigation scope, never an authorization assertion. */
  workspaceId?: string;
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
  tail === "overview" ? `${runScreenPath(runId, "")}/overview` : runScreenPath(runId, tail === "evidence" ? "hub" : tail);

function link(runId: string, screen: RunScreen, c: LinkCursor | undefined, stage?: EvidenceStage): string {
  const over: Partial<EvidenceCursor> = {};
  /* A stage named beside no cursor is not a cursor: the link stays bare (never `#stage=` alone). */
  if (stage !== undefined && c?.cursor != null) over.stage = stage;
  if (c?.window != null) over.window = c.window;
  return withWorkspace(runScreenHref(runId, screen, c?.cursor ?? null, Object.keys(over).length > 0 ? over : undefined), c?.workspaceId);
}

/** Preserve existing query/hash without accepting an arbitrary URL. */
export function withWorkspace(href: string, workspaceId?: string): string {
  if (!workspaceId || !href.startsWith("/") || href.startsWith("//")) return href;
  const hashAt = href.indexOf("#");
  const hash = hashAt < 0 ? "" : href.slice(hashAt);
  const path = hashAt < 0 ? href : href.slice(0, hashAt);
  const queryAt = path.indexOf("?");
  const params = new URLSearchParams(queryAt < 0 ? "" : path.slice(queryAt + 1));
  params.set("workspace_id", workspaceId);
  return `${queryAt < 0 ? path : path.slice(0, queryAt)}?${params}${hash}`;
}

/** Hub. The stage is the cursor's own unless the caller names one; never defaulted. */
export const hubHref = (runId: string, c?: LinkCursor & { stage?: EvidenceStage }): string => link(runId, "hub", c, c?.stage);

export const reportHref = (runId: string, c?: LinkCursor): string => link(runId, "report", c);

export const rcHref = (runId: string, c?: LinkCursor): string => link(runId, "release-candidate", c);

export const progressHref = (runId: string, c?: LinkCursor): string => link(runId, "progress", c);

export const executeHref = (runId: string, c?: LinkCursor): string => link(runId, "execute", c);

export const splitHref = (runId: string, c?: LinkCursor): string => link(runId, "split", c);

export const searchHref = (runId: string, c?: LinkCursor): string => link(runId, "search", c);

export const freezeHref = (runId: string, c?: LinkCursor): string => link(runId, "freeze", c);

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
