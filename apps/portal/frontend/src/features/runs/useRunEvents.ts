/**
 * Run events over SSE, with polling kept underneath.
 *
 * `GET /api/runs/{id}/events` pushes one frame per state transition and a final
 * frame when the run reaches a terminal state. Listening to it means a state
 * change shows up as fast as the backend knows it, instead of up to a poll
 * interval later.
 *
 * The stream is an accelerator, never the only path:
 *
 *  - if `EventSource` does not exist (jsdom, an old browser) or the connection
 *    fails, the hook reports `streaming: false` and the caller keeps its normal
 *    poll cadence — the screen degrades in speed, not in truth;
 *  - while streaming, the caller is expected to *slow* polling rather than stop
 *    it. A connection that opens and then goes quiet is indistinguishable from a
 *    run that is simply not progressing, so a slow floor poll is what keeps the
 *    screen from silently freezing;
 *  - the stream closes at the terminal frame. Nothing further can arrive, and an
 *    open connection per finished run would leak one socket per visit.
 *
 * The frames carry a state, not a full run: this invalidates the queries that own
 * that data and lets them re-read. Patching a run object from an event would put
 * a second, guessed copy of run state in the cache.
 *
 * Note the deployment shape (BAR-07): the gateway proxies this path straight to
 * portal-api because the façade answers SSE_NOT_MIGRATED by design. So the stream
 * exists behind the gateway but not on the façade — one more reason the polling
 * floor stays.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { isTerminal } from "../../lib/api";

/** A frame from the stream. `final` marks the terminal notification. */
interface RunEventFrame {
  state?: string;
  final?: boolean;
}

export function useRunEvents(runId: string, options: { enabled?: boolean } = {}) {
  const enabled = options.enabled ?? true;
  const queryClient = useQueryClient();
  const [streaming, setStreaming] = useState(false);

  useEffect(() => {
    setStreaming(false);
    if (!enabled || !runId) return;
    // Read off the global at effect time so a test can install a stub, and so an
    // environment without SSE simply falls through to polling.
    const Source = globalThis.EventSource;
    if (typeof Source !== "function") return;

    let closed = false;
    const source = new Source(`/api/runs/${encodeURIComponent(runId)}/events`);
    const close = () => {
      if (closed) return;
      closed = true;
      source.close();
      setStreaming(false);
    };

    source.onopen = () => setStreaming(true);

    source.onmessage = (event: MessageEvent) => {
      let frame: RunEventFrame = {};
      try {
        frame = JSON.parse(String(event.data)) as RunEventFrame;
      } catch {
        // A frame we cannot read is not a reason to tear down the stream, and
        // not a reason to invent a state either.
        return;
      }
      setStreaming(true);
      for (const key of ["run", "progress", "ledger", "console"]) {
        void queryClient.invalidateQueries({ queryKey: [key, runId] });
      }
      void queryClient.invalidateQueries({ queryKey: ["runs"] });
      if (frame.final === true || (typeof frame.state === "string" && isTerminal(frame.state))) {
        // Nothing more can arrive on a terminal run.
        close();
      }
    };

    // `error` covers both a dropped connection and the server's own
    // `event: error` frame. Either way the screen goes back to polling only.
    source.onerror = () => setStreaming(false);

    return close;
  }, [enabled, queryClient, runId]);

  return { streaming };
}

/**
 * Poll interval for a run screen: the fast cadence when SSE is not carrying the
 * updates, a slow floor when it is.
 */
export function runPollInterval(streaming: boolean, fast: number, floor = 8000) {
  return streaming ? floor : fast;
}
