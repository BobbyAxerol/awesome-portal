/**
 * G3 · D1-O1 follow-up — ask for a run's label when no read on the screen
 * carries it.
 *
 * Stages 1–4 (Split, Search, Freeze, Execute) read the P14–P17 hub, which
 * names a run by id only. A retained Delta WFO run reaches its label through
 * the identity read a retained answer triggers (`useRunIdentity`); a
 * fixed-profile run never asks for one, so on a cold link its label never
 * arrived. The shell calls this for exactly those screens.
 *
 * The one read is the Run Library's poll-by-ids (`?ids=<run_id>`): one row,
 * which already carries `display_label` and already feeds the shared registry
 * through `runLibraryApi.list`. Nothing is inferred here — a refused or empty
 * answer leaves the registry as it was and every id keeps printing as its
 * short id, which is honest.
 *
 * It asks at most once per mount of a run, and not at all when a read has
 * already told the registry about the run (in-app navigation, or a retained
 * run whose identity landed first).
 */

import { useEffect } from "react";

import { runLibraryApi } from "./runLibraryClient";
import { runLabelKnown } from "./runLabels";

export function useRunLabelRead(runId: string | null | undefined, workspaceId?: string): void {
  useEffect(() => {
    if (!runId || runLabelKnown(runId)) return;
    const controller = new AbortController();
    runLibraryApi
      .list({ ids: [runId], ...(workspaceId ? { workspace_id: workspaceId } : {}) }, controller.signal)
      .catch(() => undefined);
    return () => controller.abort();
  }, [runId, workspaceId]);
}
