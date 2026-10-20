/**
 * The R2 parent of a deployment, read once for the Paper exit request control (RV-10).
 *
 * One read per (deployment, workspace), started when the exit gate is shown. Nothing is asked without a workspace or on a port that
 * predates the read (the control then keeps its typed gap). The answer is a fact about THIS deployment and workspace; an answer that
 * arrives after either changed is dropped, never shown as the new one's.
 */
import { useEffect, useState } from "react";

import type { ExecutionApi } from "../../../api/ports";
import type { PaperExitParentRead } from "../../readers/paperExitParent";

export type ExitParentState =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "failed"; reason: string }
  | { state: "read"; read: PaperExitParentRead };

export function useExitParent(api: ExecutionApi | null, deploymentId: string, workspaceId: string | null, enabled: boolean): ExitParentState {
  const key = `${workspaceId ?? ""}|${deploymentId}`;
  const [answer, setAnswer] = useState<{ key: string; value: ExitParentState } | null>(null);
  const live = enabled && api !== null && workspaceId !== null && typeof api.getPaperExitParent === "function";
  useEffect(() => {
    if (!live || api === null) return undefined;
    let cancelled = false;
    void Promise.resolve()
      .then(() => api.getPaperExitParent({ deploymentId, ...(workspaceId === null ? {} : { workspaceId }) }))
      .then((result) => {
        if (cancelled) return;
        setAnswer({ key, value: result.ok ? { state: "read", read: result.value } : { state: "failed", reason: result.reason } });
      })
      .catch(() => {
        if (!cancelled) setAnswer({ key, value: { state: "failed", reason: "The R2 review could not be read." } });
      });
    return () => {
      cancelled = true;
    };
  }, [api, deploymentId, workspaceId, key, live]);
  if (!live) return { state: "idle" };
  return answer !== null && answer.key === key ? answer.value : { state: "loading" };
}
