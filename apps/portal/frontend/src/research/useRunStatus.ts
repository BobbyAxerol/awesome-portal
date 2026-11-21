/**
 * W1 §1.2 — what status does the reader's workspace list for this run?
 *
 * Generalises `useRunVisibility` (S09, audit F1): the one served fact that
 * separates "unknown / not yours" from "yours, but no sealed report" is the Run
 * Library's poll-by-ids. Same single `list({ids:[runId]})` call; it adds the
 * seal flag and attempt id so S10/S11 can use it without another request.
 *
 * It decides nothing: the screen feeds `status` to `runTerminalState`.
 * A short per-run cache seeds the next screen's first paint (S09 -> S11 -> S10)
 * while the read confirms it; it expires so a queued run does not look queued
 * for the session.
 */

import { useEffect, useState } from "react";

import { runLibraryApi } from "./runLibraryClient";
import type { RunStatusWire } from "./runTerminalState";

export type RunStatusRead =
  | { state: "idle" }
  | { state: "reading" }
  | {
      state: "listed";
      /** The library row's own status word (null when it carried none). */
      status: RunStatusWire | null;
      /** `rc.kind === "LOCAL_SEAL"`; null when the row has no rc field. */
      sealed: boolean | null;
      label: string | null;
      attemptId: string | null;
      /** `source_kind = LEGACY_1_0_8_METADATA`. */
      legacy: boolean;
    }
  | { state: "not-listed" }
  | { state: "unread" };

type Settled = Extract<RunStatusRead, { state: "listed" | "not-listed" }>;

const CACHE_MS = 10_000;
/** Off by default: a first-paint seed from an earlier screen is opt-in (a route/shell calls `setRunStatusSeed(true)`). */
let seedEnabled = false;
export function setRunStatusSeed(on: boolean): void {
  seedEnabled = on;
}
const cache = new Map<string, { at: number; value: Settled }>();

/** Test hook: forget every cached answer. */
export function clearRunStatusCache(): void {
  cache.clear();
}

function keyOf(runId: string, workspaceId?: string): string {
  return `${workspaceId ?? ""}|${runId}`;
}

export function useRunStatus(runId: string, enabled: boolean, workspaceId?: string): RunStatusRead {
  const [read, setRead] = useState<RunStatusRead>({ state: "idle" });

  useEffect(() => {
    if (!enabled || runId.length === 0) {
      setRead({ state: "idle" });
      return;
    }
    const key = keyOf(runId, workspaceId);
    const hit = cache.get(key);
    const controller = new AbortController();
    // Stale-while-revalidate: a recent answer paints at once (no "reading" flash
    // when S09 -> S11 -> S10 hop), and the single read below still confirms it.
    setRead(seedEnabled && hit !== undefined && Date.now() - hit.at < CACHE_MS ? hit.value : { state: "reading" });
    runLibraryApi
      .list({ ids: [runId], ...(workspaceId ? { workspace_id: workspaceId } : {}) }, controller.signal)
      .then((answer) => {
        if (controller.signal.aborted) return;
        const items: unknown = (answer as { items?: unknown }).items;
        if (!Array.isArray(items)) {
          setRead({ state: "unread" });
          return;
        }
        const row = (
          items as {
            run_id?: unknown;
            status?: unknown;
            rc?: { kind?: unknown } | null;
            display_label?: unknown;
            attempt_id?: unknown;
            source_kind?: unknown;
          }[]
        ).find((item) => item?.run_id === runId);
        const value: Settled =
          row === undefined
            ? { state: "not-listed" }
            : {
                state: "listed",
                status: typeof row.status === "string" ? (row.status as RunStatusWire) : null,
                sealed: row.rc === undefined ? null : row.rc?.kind === "LOCAL_SEAL",
                label: typeof row.display_label === "string" ? row.display_label : null,
                attemptId: typeof row.attempt_id === "string" ? row.attempt_id : null,
                legacy: row.source_kind === "LEGACY_1_0_8_METADATA",
              };
        cache.set(key, { at: Date.now(), value });
        setRead(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setRead({ state: "unread" });
      });
    return () => controller.abort();
  }, [enabled, runId, workspaceId]);

  return read;
}
