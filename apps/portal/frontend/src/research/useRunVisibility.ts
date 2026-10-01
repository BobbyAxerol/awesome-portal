/**
 * F1 (S09, 400-trial audit) — is this run one the reader's workspace lists?
 *
 * `GET …/report` answers 404 `RESEARCH_REPORT_NOT_FOUND` with the same body for
 * three different truths: the run does not exist, the run is not this reader's
 * (the server deliberately does not tell the two apart — audit F-04), and the
 * run is the reader's own but no report was sealed for it. Printing "you don't
 * have access" for the third is false.
 *
 * The one served fact that separates them is the Run Library's poll-by-ids
 * (`?ids=<run_id>`): it returns the row when the run is in the reader's
 * workspace and an empty page when it is not. This hook asks that, only when
 * the caller says the report answered 404, and only once. It never decides
 * anything itself — the screen reads the answer, the status word is the
 * server's.
 *
 * The read also teaches the shared label registry the run's `R-…` label, which
 * a 404 never could, so the sheet's title chip and the shell crumb stop
 * printing the 37-character id.
 */

import { useEffect, useState } from "react";

import { runLibraryApi } from "./runLibraryClient";

export type RunVisibility =
  | { state: "idle" }
  | { state: "reading" }
  /** The workspace lists this run; `status` is the library row's own status word. */
  | { state: "listed"; status: string | null }
  /** The library answered and the run is not in this workspace's rows. */
  | { state: "not-listed" }
  /** The library read failed or answered an unusable body: nothing is concluded. */
  | { state: "unread" };

export function useRunVisibility(runId: string, enabled: boolean, workspaceId?: string): RunVisibility {
  const [visibility, setVisibility] = useState<RunVisibility>({ state: "idle" });

  useEffect(() => {
    if (!enabled || runId.length === 0) {
      setVisibility({ state: "idle" });
      return;
    }
    const controller = new AbortController();
    setVisibility({ state: "reading" });
    runLibraryApi
      .list({ ids: [runId], ...(workspaceId ? { workspace_id: workspaceId } : {}) }, controller.signal)
      .then((answer) => {
        if (controller.signal.aborted) return;
        const items: unknown = (answer as { items?: unknown }).items;
        if (!Array.isArray(items)) {
          setVisibility({ state: "unread" });
          return;
        }
        const row = (items as { run_id?: unknown; status?: unknown }[]).find((item) => item?.run_id === runId);
        setVisibility(
          row === undefined ? { state: "not-listed" } : { state: "listed", status: typeof row.status === "string" ? row.status : null },
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) setVisibility({ state: "unread" });
      });
    return () => controller.abort();
  }, [enabled, runId, workspaceId]);

  return visibility;
}
