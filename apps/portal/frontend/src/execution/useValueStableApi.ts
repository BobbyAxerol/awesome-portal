/**
 * The Execution port of a route, keyed on the VALUE of what scopes it (UXM-10 F-8, RV-07).
 *
 * `screenDeliveryPolicy` builds a new policy object on every render of the routes, so `useMemo(() => createHttpApi({ policy }),
 * [policy])` made a new port after every URL change, and every screen effect that lists `api` read everything again: a tab
 * click, a selection or the `?tab=` slug rewrite each cost a round of GETs for a change that is only how the data is shown.
 * Now the port is keyed on the policy's value plus the caller's session scope (principal, session, role):
 *
 *   - a presentation-only change (tab, selection, sort, a rewritten slug) keeps the port, so no screen reads again;
 *   - a change of policy value or of the session makes a NEW port, which every screen sees as a new `api` and so reads again,
 *     and the OLD port is aborted (its in-flight GETs reject with AbortError) and the session-wide runtime catalogue is
 *     forgotten, so an answer for one scope is never shown, nor kept, under another;
 *   - a workspace or query change is not in the port at all: it is a prop of the screen (`workspaceId`, `binding`), and each
 *     screen's own read effect lists it, cancels the previous answer and ignores it if it arrives late.
 *
 * Nothing is cached here beyond the port object: `sharedRead` is in-flight only and keeps no result.
 */
import { useEffect, useMemo, useRef } from "react";

import { createHttpApi } from "./api/httpApi";
import type { ExecutionApi } from "./api/ports";
import type { DeliveryPolicy } from "./profile";
import { forgetExecutionRuntime } from "./useExecutionRuntime";

/** What scopes a port. Equal values give equal keys whatever the identity of the policy object. */
export function apiScopeKey(scope: string, policy: DeliveryPolicy | null): string {
  return JSON.stringify([scope, policy]);
}

type Make = typeof createHttpApi;

interface Port {
  controller: AbortController;
  api: ExecutionApi;
}

/** What a read answers when its port was replaced under it: a typed absence, never a value, never a throw into a screen. */
const SUPERSEDED = { ok: false, status: "unavailable", reason: "This read was cancelled because the session or the delivery policy changed." } as const;

/**
 * Some ports reject (AbortError) instead of answering `ok: false` when their signal is aborted. Once THIS port's own signal is
 * aborted, a rejection becomes the typed absence above, so a replaced port never raises an unhandled rejection in a screen
 * that is about to read again through the new one. Any other rejection passes through unchanged.
 */
function answeringOnAbort(api: ExecutionApi, signal: AbortSignal): ExecutionApi {
  const wrapped = new Map<PropertyKey, unknown>();
  return new Proxy(api, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver);
      if (typeof value !== "function") return value;
      let fn = wrapped.get(key);
      if (fn === undefined) {
        fn = (...args: unknown[]) => {
          const out = (value as (...a: unknown[]) => unknown)(...args);
          return out !== null && typeof out === "object" && typeof (out as PromiseLike<unknown>).then === "function"
            ? (out as Promise<unknown>).catch((error: unknown) => {
                if (signal.aborted) return SUPERSEDED;
                throw error;
              })
            : out;
        };
        wrapped.set(key, fn);
      }
      return fn;
    },
  });
}

export interface StableApiOptions {
  /** The factory (tests pass a counting one). */
  make?: Make;
  /** Forget the session-wide runtime catalogue when the port is replaced. True for the route's main port only. */
  forgetRuntime?: boolean;
}

export function useValueStableApi(policy: DeliveryPolicy | null, scope: string, { make = createHttpApi, forgetRuntime = true }: StableApiOptions = {}): ExecutionApi {
  const key = apiScopeKey(scope, policy);
  // Keyed on the value on purpose: `policy` is a fresh object each render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const port = useMemo<Port>(() => {
    const controller = new AbortController();
    return { controller, api: answeringOnAbort(make({ policy, signal: controller.signal }), controller.signal) };
  }, [key]);
  const live = useRef<Port | null>(null);
  useEffect(() => {
    const before = live.current;
    live.current = port;
    // The first port, and a re-run of this effect on the same port (StrictMode), abort nothing.
    if (before === null || before === port) return;
    before.controller.abort();
    if (forgetRuntime) forgetExecutionRuntime();
  }, [port]);
  return port.api;
}
