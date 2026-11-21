/**
 * Is this run a natively searched one? (§55)
 *
 * A native run is ONE in-sample study with no outer fold: its Search, Freeze and Verify reads answer `400` to any `fold`, while every
 * scalar run needs the cursor's fold. The server publishes the fact on the run's own Progress read (`native_execution`), so the answer is
 * read there — once per run and workspace, kept in memory — and the screens send their first request already knowing whether to carry a
 * fold. `null` means "not known yet": the screen waits instead of guessing and sending a request the server would refuse. A progress
 * read that fails answers `false`, so a scalar run keeps exactly the behaviour it had.
 */

import { useEffect, useState } from "react";

import { progressApi } from "./progressClient";

const known = new Map<string, boolean>();

/** Test seam. */
export function forgetNativeRuns(): void {
  known.clear();
}

export function useRunNative(runId: string, workspaceId?: string): boolean | null {
  const key = `${workspaceId ?? ""}|${runId}`;
  const [answer, setAnswer] = useState<{ key: string; native: boolean } | null>(() => (known.has(key) ? { key, native: known.get(key)! } : null));
  useEffect(() => {
    if (known.has(key)) {
      setAnswer({ key, native: known.get(key)! });
      return undefined;
    }
    const controller = new AbortController();
    progressApi
      .read(runId, workspaceId, controller.signal)
      .then((read) => {
        const native = Boolean((read as { native_execution?: unknown } | null)?.native_execution);
        known.set(key, native);
        if (!controller.signal.aborted) setAnswer({ key, native });
      })
      .catch(() => {
        if (!controller.signal.aborted) setAnswer({ key, native: false });
      });
    return () => controller.abort();
  }, [key, runId, workspaceId]);
  return answer !== null && answer.key === key ? answer.native : null;
}
