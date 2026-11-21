/**
 * The life cycle of the self-context read (FE-057/058/038, BE-P7 `1449455e`): which workspace does the server resolve for this member
 * when the address names none? Asked ONLY then; the hook that owns the navigation read (`useSelfNavigation`) composes it.
 *
 * The rules are the navigation hook's, each with a test, because the body has the same shape of risk (a stale answer under a new
 * session shows another member's workspace):
 *
 * - SCOPE IS THE SESSION. The read takes no query, so its scope key is the session alone. The view is derived from
 *   `slot.key === scopeKey` DURING render: the first frame under another session shows nothing.
 * - LATE ANSWERS. Every read carries a token; leaving the scope or unmounting aborts and bumps it, so an answer that arrives
 *   afterwards is dropped whatever it says.
 * - SINGLE FLIGHT. At most one read is in flight; Retry and a second mount of the same question join it.
 * - NO RETRY BY ITSELF, NO POLLING, NO STORAGE. A failure waits for the user's Retry. The only clocks are ONE timeout at the
 *   session ceiling `valid_until_ms` (re-armed in slices) and a no-request re-check when the tab comes back.
 * - EXPIRY IS A CLOSE, NOT A LEASE. At `valid_until_ms` (end-exclusive) the answer is discarded (no workspace, no chooser) and the
 *   hook re-reads AT MOST ONCE until the user presses Retry.
 * - NEVER A GUESS. The hook publishes the context the Portal sent and nothing else: no default workspace is invented, no candidate
 *   is picked, and a context that cannot be read is a failure with its reason.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";

import { selfProjectionExpiry } from "../readers/accessSelf";
import type { AccessSelfContext } from "../readers/accessSelfContext";
import { httpSelfNavigationPort, type SelfContextOutcome, type SelfNavigationPort } from "./selfNavigationPort";

/** `setTimeout` holds a signed 32-bit delay; a longer one fires at once. A longer ceiling is waited out in slices of this size. */
const MAX_TIMEOUT_MS = 2_147_483_647;

export interface UseSelfContextOptions {
  /** False (flag off, no session, or the address already names a workspace): idle, no request. */
  enabled: boolean;
  /** The signed-in session's id. Not sent; it is the scope key, so another session starts clean. */
  sessionKey: string | null;
  port?: SelfNavigationPort;
  /** Test seam: UTC epoch ms. */
  now?: () => number;
}

export type SelfContextPhase = "idle" | "loading" | "ready" | "expired" | "failed";

export interface SelfContextView {
  phase: SelfContextPhase;
  /** The context, only while `ready` (inside the session ceiling). Never a stale one. */
  context: AccessSelfContext | null;
  /** Why there is no context, for an `expired` or `failed` read (and `busy` while it re-reads). Else `null`. */
  failure: { reason: string; busy: boolean } | null;
  /** Ask again. Joins a read already in flight; restores the one automatic expiry re-read. */
  retry(): void;
}

type Slot =
  | { key: string; phase: "loading"; after: string | null }
  | { key: string; phase: "ready"; context: AccessSelfContext }
  | { key: string; phase: "failed"; reason: string };

function problemText(outcome: { code: string | null; requestId: string | null }): string {
  return `${outcome.code ? ` Code ${outcome.code}.` : ""}${outcome.requestId ? ` Request ${outcome.requestId}.` : ""}`;
}

/** The one sentence for an outcome that is not a body. */
export function contextFailureReason(outcome: Exclude<SelfContextOutcome, { kind: "ok" }>): string {
  if (outcome.kind === "denied") {
    return outcome.status === 401
      ? `The Portal did not accept this session for the workspace read (401).${problemText(outcome)}`
      : `The Portal did not permit the workspace read for this session (403).${problemText(outcome)}`;
  }
  return `${outcome.reason}${problemText(outcome)}`;
}


export function useSelfContext(options: UseSelfContextOptions): SelfContextView {
  const { enabled, sessionKey } = options;
  const defaultPort = useMemo(() => httpSelfNavigationPort(), []);
  const portRef = useRef<SelfNavigationPort>(options.port ?? defaultPort);
  portRef.current = options.port ?? defaultPort;
  const nowRef = useRef<() => number>(options.now ?? Date.now);
  nowRef.current = options.now ?? Date.now;

  // A port without `readContext` is a port that predates the read: the address stays unscoped and idle, exactly as before.
  const hasRead = (options.port ?? defaultPort).readContext !== undefined;
  const scopeKey = enabled && sessionKey !== null && hasRead ? sessionKey : null;
  const scopeRef = useRef<{ key: string; sessionKey: string } | null>(null);

  const slotRef = useRef<Slot | null>(null);
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const setSlot = useCallback((next: Slot | null) => {
    slotRef.current = next;
    bump();
  }, []);

  const tokenRef = useRef(0);
  const inflight = useRef<{ key: string; controller: AbortController } | null>(null);
  const rereadLeft = useRef(true);

  const run = useCallback((after: string | null) => {
    const scope = scopeRef.current;
    const read = portRef.current.readContext;
    if (scope === null || read === undefined) return;
    if (inflight.current?.key === scope.key) return; // single flight
    const controller = new AbortController();
    const token = ++tokenRef.current;
    inflight.current = { key: scope.key, controller };
    setSlot({ key: scope.key, phase: "loading", after });
    void (async () => {
      const outcome = await read.call(portRef.current, { sessionKey: scope.sessionKey }, controller.signal);
      if (token !== tokenRef.current || controller.signal.aborted) return; // a late answer for a scope that has gone
      inflight.current = null;
      if (outcome.kind === "ok") setSlot({ key: scope.key, phase: "ready", context: outcome.context });
      else setSlot({ key: scope.key, phase: "failed", reason: contextFailureReason(outcome) });
    })();
  }, [setSlot]);

  useEffect(() => {
    if (scopeKey === null || sessionKey === null) {
      scopeRef.current = null;
      slotRef.current = null;
      return;
    }
    scopeRef.current = { key: scopeKey, sessionKey };
    rereadLeft.current = true;
    run(null);
    return () => {
      tokenRef.current += 1;
      inflight.current?.controller.abort();
      inflight.current = null;
      scopeRef.current = null;
      slotRef.current = null;
    };
  }, [scopeKey, sessionKey, run]);

  const checkExpiry = useCallback(() => {
    const slot = slotRef.current;
    if (slot === null || slot.phase !== "ready") return;
    if (selfProjectionExpiry(slot.context, nowRef.current()).state !== "expired") return;
    if (rereadLeft.current) {
      rereadLeft.current = false;
      run(EXPIRED_REASON);
    } else bump();
  }, [run]);

  const readyUntil = slotRef.current?.phase === "ready" && slotRef.current.key === scopeKey ? slotRef.current.context.validUntilMs : null;
  useEffect(() => {
    if (readyUntil === null) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      const delay = readyUntil - nowRef.current();
      if (!(delay > 0)) {
        checkExpiry();
        return;
      }
      timer = setTimeout(arm, Math.min(delay, MAX_TIMEOUT_MS));
    };
    arm();
    const onVisible = () => {
      if (document.visibilityState !== "hidden") checkExpiry();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      if (timer !== undefined) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [readyUntil, scopeKey, checkExpiry]);

  const retry = useCallback(() => {
    if (scopeRef.current === null) return;
    rereadLeft.current = true;
    run(null);
  }, [run]);

  const slot = slotRef.current !== null && slotRef.current.key === scopeKey ? slotRef.current : null;
  const nowMs = nowRef.current();
  const expired = slot !== null && slot.phase === "ready" && selfProjectionExpiry(slot.context, nowMs).state === "expired";

  return useMemo<SelfContextView>(() => {
    if (scopeKey === null) return { phase: "idle", context: null, failure: null, retry };
    if (slot === null) return { phase: "loading", context: null, failure: null, retry };
    switch (slot.phase) {
      case "loading":
        return { phase: "loading", context: null, failure: slot.after === null ? null : { reason: slot.after, busy: true }, retry };
      case "failed":
        return { phase: "failed", context: null, failure: { reason: slot.reason, busy: false }, retry };
      case "ready":
        if (selfProjectionExpiry(slot.context, nowMs).state === "expired") return { phase: "expired", context: null, failure: { reason: EXPIRED_REASON, busy: false }, retry };
        return { phase: "ready", context: slot.context, failure: null, retry };
    }
    // `expired` and `slot` are the only inputs that change the answer; the clock is read into `nowMs` once per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, slot, expired, retry]);
}

/** Said when the session ceiling of the context passed. Retry asks again. */
export const EXPIRED_REASON = "The workspace read for your session ended and is no longer shown. Retry to check again.";

