/**
 * One read through the ExecutionApi port, with the four phases a panel needs.
 *
 * - `idle`: not asked (the panel is on another tab, or a precondition is
 *   missing). No request was made.
 * - `loading`: asked; `last` is the previous good value for the SAME key, so a
 *   refresh does not blink, and `null` for a new key (another question).
 * - `ready`: answered, with the port's warnings.
 * - `error`: the typed refusal, with the port's status and reason.
 *
 * The request is cancelled when the key changes or the screen unmounts. A key
 * change drops `last`: a value read for another portfolio must not stand in
 * for this one.
 *
 * UXM-08: when the view that owns the scope's stream says access was revoked
 * (`scopedEviction`), the value and `last` are dropped, the request in flight is
 * cancelled, a late answer is refused and the read says `denied` until its key or
 * port changes (another question).
 */
import { useEffect, useRef, useState } from "react";

import type { PanelStatus } from "../../../contracts";
import type { ExecutionApi, Result } from "../../../api/ports";
import { EVICTED_REASON, useScopedCacheEviction } from "../../scopedEviction";

export type ReadError = { status: Exclude<PanelStatus, "ok" | "loading">; reason: string };

export type ReadState<T> =
  | { phase: "idle" }
  | { phase: "loading"; last: T | null }
  | { phase: "ready"; value: T; warnings: readonly string[] }
  | ({ phase: "error"; last: T | null } & ReadError);

const scoped = (api: ExecutionApi, signal: AbortSignal): ExecutionApi => api.withReadSignal?.(signal) ?? api;

export function failure(result: Extract<Result<unknown>, { ok: false }>): ReadError {
  return { status: result.status === "loading" ? "unavailable" : result.status, reason: result.reason };
}

export function useRead<T>(
  api: ExecutionApi,
  enabled: boolean,
  key: string,
  run: (api: ExecutionApi) => Promise<Result<T>>,
): ReadState<T> {
  const [state, setState] = useState<ReadState<T>>(enabled ? { phase: "loading", last: null } : { phase: "idle" });
  const build = useRef(run);
  build.current = run;
  const lastGood = useRef<{ key: string; value: T } | null>(null);
  const flight = useRef<(() => void) | null>(null);

  useScopedCacheEviction(() => {
    lastGood.current = null;
    flight.current?.();
    flight.current = null;
    setState((now) => (now.phase === "idle" ? now : { phase: "error", last: null, status: "denied", reason: EVICTED_REASON }));
  });

  useEffect(() => {
    if (!enabled) {
      setState({ phase: "idle" });
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    flight.current = () => {
      cancelled = true;
      controller.abort();
    };
    const keep = lastGood.current !== null && lastGood.current.key === key ? lastGood.current.value : null;
    setState({ phase: "loading", last: keep });
    build.current(scoped(api, controller.signal)).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setState({ phase: "error", last: keep, ...failure(result) });
        return;
      }
      lastGood.current = { key, value: result.value };
      setState({ phase: "ready", value: result.value, warnings: result.warnings ?? [] });
    }).catch(() => {
      if (!cancelled) setState({ phase: "error", last: keep, status: "unavailable", reason: "PORTAL_READ_FAILED" });
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [api, enabled, key]);

  return state;
}

/** The value to draw from a state: the answer, or the previous good one while a new answer loads. */
export function valueOf<T>(state: ReadState<T>): T | null {
  if (state.phase === "ready") return state.value;
  if (state.phase === "loading" || state.phase === "error") return state.last;
  return null;
}
