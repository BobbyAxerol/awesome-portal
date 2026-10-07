/**
 * Screen 13 · two runs on one explicit window (`researchWindowCompareGetV1`).
 *
 * Asked only when the URL names exactly two runs AND a window. One read per (runs, window, fold, workspace), aborted when any of them
 * changes, stale answers dropped, never polled: the answer is bound to an immutable revision. A server without the route is
 * `unavailable` (the pair compare above keeps working); a refusal keeps its status and code and is worded by the screen, not by the server.
 */

import { useEffect, useMemo, useState } from "react";

import { PortalApiError } from "../lib/api";
import { windowExecutionApi, type WindowCompare, type WindowScope } from "./windowExecutionClient";

export type WindowCompareState =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; data: WindowCompare }
  | { state: "unavailable" }
  | { state: "refused"; status: number | null; code: string | null };

const isMissingRoute = (error: unknown): boolean => error instanceof PortalApiError && [404, 405, 501].includes(error.status) && (error.code === null || !error.code.startsWith("RESEARCH_"));

export function useWindowCompare(runs: readonly [string, string] | null, scope: WindowScope | null, workspaceId?: string): WindowCompareState {
  const key = runs === null || scope === null ? null : JSON.stringify([runs, scope.window, scope.foldId ?? null, workspaceId ?? null]);
  const [answer, setAnswer] = useState<{ key: string; value: WindowCompareState } | null>(null);

  useEffect(() => {
    if (key === null || runs === null || scope === null) return undefined;
    const controller = new AbortController();
    windowExecutionApi
      .compare(runs[0], runs[1], scope, { workspaceId, signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setAnswer({ key, value: { state: "ready", data } });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setAnswer({
          key,
          value: isMissingRoute(error)
            ? { state: "unavailable" }
            : { state: "refused", status: error instanceof PortalApiError ? error.status : null, code: error instanceof PortalApiError ? error.code : null },
        });
      });
    return () => controller.abort();
    // The key carries every input; the arrays and the scope object change identity on every render.
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return useMemo<WindowCompareState>(() => {
    if (key === null) return { state: "idle" };
    return answer !== null && answer.key === key ? answer.value : { state: "loading" };
  }, [key, answer]);
}
