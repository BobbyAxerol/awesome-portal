/**
 * One Core Observed read for the Overview (`getObservedOverview`), only when the build names `observed` (the caller passes `enabled`).
 * One read on open and on Refresh (the nonce), never polled. Typed refusals degrade to `hidden` with no text: lane off (404), workspace
 * miss (404) and SCOPED_V2 (409) leave today's `Not published` wording; `access_changed` (409) is re-read once, then hidden. Anything
 * else is `hidden` too: an Observed fallback that cannot be read must not add error copy to a page that works without it.
 */
import { useEffect, useState } from "react";

import type { ExecutionApi } from "../../../api/ports";
import { classifyObservedFailure, type ObservedOverview, type ObservedOverviewEnvironment } from "../../readers/observedOverview";

export type ObservedReadState = { phase: "idle" } | { phase: "loading" } | { phase: "hidden" } | { phase: "ready"; value: ObservedOverview };

export function useObservedOverview(api: ExecutionApi, enabled: boolean, environment: ObservedOverviewEnvironment | null, nonce: number): ObservedReadState {
  const [state, setState] = useState<ObservedReadState>({ phase: "idle" });
  useEffect(() => {
    if (!enabled || environment === null || typeof api.getObservedOverview !== "function") { setState({ phase: "idle" }); return undefined; }
    let cancelled = false;
    setState({ phase: "loading" });
    const run = async (retry: boolean): Promise<void> => {
      let result;
      try { result = await api.getObservedOverview({ environment }); } catch { if (!cancelled) setState({ phase: "hidden" }); return; }
      if (cancelled) return;
      if (result.ok) { setState({ phase: "ready", value: result.value }); return; }
      if (retry && classifyObservedFailure(result) === "access_changed") { await run(false); return; }
      setState({ phase: "hidden" });
    };
    void run(true);
    return () => { cancelled = true; };
  }, [api, enabled, environment, nonce]);
  return state;
}
