/**
 * React binding of the Fleet stream session (ELP2-09; FIXTURE_LAB evidence only).
 *
 * The hook acquires the shared session of its scope while `enabled`, attaches its consumer, forwards tab visibility, and
 * releases on unmount or when the scope changes (the last release stops the session, which aborts the connection and every read).
 * It opens nothing by itself: with `enabled` false there is no session, no request and no timer.
 *
 * Polling is not motion and neither is a stream: nothing here reads `prefers-reduced-motion` or the automation switch
 * (`smokeMotionAllowed`). The only thing that pauses it is a hidden tab, because nobody is looking.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { acquireFleetStream, scopeKeyOf, type FleetSessionDeps, type FleetStreamConsumer, type FleetStreamSession } from "./fleetStreamSession";
import type { FleetStreamScope } from "./fleetStreamTransport";
import type { FleetStreamView } from "./fleetStreamView";

const NO_VIEW: FleetStreamView = { chip: null, phase: "idle", transport: "idle" };
const noop = () => undefined;

export interface UseFleetStreamOptions {
  scope: FleetStreamScope;
  enabled: boolean;
  /** Stable identity (memoize it): a new consumer re-attaches. */
  consumer: FleetStreamConsumer;
  /** Tests inject a fetch, timers and a clock. Stable identity. */
  deps?: FleetSessionDeps;
}

export interface FleetStreamHandle {
  view: FleetStreamView;
  startOver(): void;
}

export function useFleetStream({ scope, enabled, consumer, deps }: UseFleetStreamOptions): FleetStreamHandle {
  const [session, setSession] = useState<FleetStreamSession | null>(null);
  const key = scopeKeyOf(scope);

  useEffect(() => {
    if (!enabled) return undefined;
    const lease = acquireFleetStream(scope, deps);
    const detach = lease.session.attach(consumer);
    lease.session.start();
    setSession(lease.session);
    return () => {
      detach();
      lease.release();
      setSession(null);
    };
    // `scope` is read through `key`: its fields are strings, and a new object with the same fields is the same scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key, consumer, deps]);

  useEffect(() => {
    if (session === null || typeof document === "undefined") return undefined;
    const sync = () => session.setHidden(document.visibilityState === "hidden");
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [session]);

  const subscribe = useCallback((listener: () => void) => (session === null ? noop : session.subscribe(listener)), [session]);
  const getView = useCallback(() => (session === null ? NO_VIEW : session.getView()), [session]);
  const view = useSyncExternalStore(subscribe, getView, () => NO_VIEW);
  const startOver = useCallback(() => session?.startOver(), [session]);
  return { view, startOver };
}
