/**
 * React binding of the scoped stream controller (UXM-08, FIXTURE ONLY).
 *
 * It starts the controller when `enabled` and `connection` are set, restarts it when the connection (the authorized
 * context) changes, stops it on unmount, and forwards tab visibility so a hidden tab owes at most one read. It opens no
 * transport: frames reach the controller only through the returned `receive`, which the fixture lane calls from its own
 * buttons. A real transport adapter is a later, separate step that needs a published operation and a qualified source.
 */
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";

import {
  createStreamController,
  systemClock,
  type Clock,
  type SnapshotPort,
  type StreamController,
  type StreamPort,
} from "./scopedStreamController";
import type { StreamConfig, StreamState } from "./scopedStreamMachine";

export interface UseScopedStreamOptions<T> {
  /** Stable identity (memoize it): a new port builds a new controller. */
  snapshot: SnapshotPort<T>;
  /** The authorized context this view is bound to (for example workspace and environment); `null` starts nothing. */
  connection: string | null;
  enabled?: boolean;
  stream?: StreamPort;
  clock?: Clock;
  config?: StreamConfig;
  /** The view no longer shows scoped data: drop any cache that kept a copy. */
  onClear?: () => void;
}

export interface ScopedStreamHandle<T> {
  state: StreamState<T>;
  receive(raw: unknown, arrivedOn: string): void;
  retry(): void;
  controller: StreamController<T>;
}

export function useScopedStream<T>(options: UseScopedStreamOptions<T>): ScopedStreamHandle<T> {
  const { snapshot, connection, enabled = true, stream, clock = systemClock, config, onClear } = options;
  const controller = useMemo(
    () => createStreamController<T>({ snapshot, clock, stream, config }),
    [snapshot, clock, stream, config],
  );
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);

  const onClearRef = useRef(onClear);
  onClearRef.current = onClear;
  useEffect(() => controller.onClear(() => onClearRef.current?.()), [controller]);

  useEffect(() => {
    if (!enabled || connection === null) return;
    controller.start(connection);
    return () => controller.stop();
  }, [controller, enabled, connection]);

  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;
    const sync = () => controller.setHidden(document.visibilityState === "hidden");
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [controller, enabled]);

  return useMemo(
    () => ({ state, receive: controller.receive, retry: controller.retry, controller }),
    [state, controller],
  );
}
