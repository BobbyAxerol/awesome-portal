/**
 * The one read behind the Canary control room: `getCanaryVersioned`, once per
 * (deployment, workspace, refresh) key. Nothing refreshes by itself (D11): the
 * reader presses Refresh, or leaves and comes back.
 *
 * The three things a read can be stay apart: in flight, refused (with the typed
 * status and the server's reason), and answered. An answer may still be
 * `unsupported`; that is the reader's call (`readCanaryView`), not this hook's.
 */
import { useEffect, useState } from "react";

import type { ExecutionApi } from "../../../api/ports";
import type { PanelStatus } from "../../../contracts";
import type { CanaryVersionRead, StageInclude } from "../../readers/dispatch";

/** BE-P12: the V2 screen asks for the identity of the deployment; the legacy body ignores it and the default request is otherwise unchanged. */
const CANARY_INCLUDE: readonly StageInclude[] = ["identity"];

export type CanaryRead =
  | { phase: "loading" }
  | { phase: "error"; status: Exclude<PanelStatus, "ok" | "loading">; reason: string }
  | { phase: "ready"; read: CanaryVersionRead };

export function useCanaryRead(api: ExecutionApi, deploymentId: string, workspaceId: string | undefined, refresh: number): CanaryRead {
  const key = `${deploymentId}|${workspaceId ?? ""}|${refresh}`;
  const [state, setState] = useState<{ key: string; api: ExecutionApi; value: CanaryRead }>({ key, api, value: { phase: "loading" } });

  useEffect(() => {
    const abort = new AbortController();
    setState({ key, api, value: { phase: "loading" } });
    const scoped = api.withReadSignal?.(abort.signal) ?? api;
    void scoped
      .getCanaryVersioned(deploymentId, workspaceId === undefined ? { include: CANARY_INCLUDE } : { workspaceId, include: CANARY_INCLUDE })
      .then((result) => {
        if (abort.signal.aborted) return;
        setState({
          key,
          api,
          value: result.ok
            ? { phase: "ready", read: result.value }
            : { phase: "error", status: result.status === "loading" ? "unavailable" : result.status, reason: result.reason },
        });
      })
      .catch(() => {
        if (!abort.signal.aborted) {
          setState({ key, api, value: { phase: "error", status: "unavailable", reason: "The read failed before the Portal answered." } });
        }
      });
    return () => abort.abort();
    // `key` carries deploymentId, workspaceId and refresh.
  }, [api, key, deploymentId, workspaceId]);

  // Hide an old answer for one frame after the subject changed.
  return state.key === key && state.api === api ? state.value : { phase: "loading" };
}
