/**
 * W1 · the life cycle of the self-navigation read (FE-057/058; Codex return `self-access-consumer-return-2026-10-19`).
 *
 * One question per scope, where a scope is exactly (session, workspace, environment). The hook turns the port's answer into the
 * rail's input (`SelfNavGate`, selfNavGate.ts) and into the one honest sentence a shut rail prints. Its rules, each with a test:
 *
 * - SCOPE ISOLATION. The projection in hand belongs to one scope key. The view is derived from `slot.key === scopeKey` DURING
 *   render, so the first frame under a new workspace, environment or session already shows nothing: the previous projection is
 *   never visible under the new scope, not even for a frame while an effect catches up.
 * - LATE ANSWERS. Every read carries a token; leaving the scope (or unmounting) aborts the request and bumps the token, so an
 *   answer that arrives afterwards is discarded whatever it says. An answer whose own workspace/environment is not the one asked
 *   is a failure (`navigationAnswers`), never silently shown.
 * - SINGLE FLIGHT. At most one read per scope is in flight; Retry, the expiry re-read and a second mount of the same question
 *   join it instead of starting another.
 * - 409 ONCE. HTTP 409 is Core's private final-egress fence crossing; the read is repeated ONCE, immediately. A second 409 is a
 *   failure with its reason. No other status is retried automatically: 401/403/5xx/network wait for the user's Retry.
 * - NO POLLING, NO STORAGE. No interval, no localStorage/sessionStorage/IndexedDB: the body is `no-store` and dies with the
 *   page. The only clocks are (a) ONE timeout armed at the session ceiling `valid_until_ms` (re-armed in slices when the delay
 *   exceeds what `setTimeout` can hold) and (b) a synchronous re-check on tab focus / visibility, which makes no request unless
 *   the ceiling has in fact passed.
 * - EXPIRY IS A CLOSE, NOT A LEASE. Once the client clock reaches `valid_until_ms` the gate yields no token (selfNavGate), the
 *   rail prints why, and the hook re-reads AT MOST ONCE per scope to see whether the Portal now says something else. If that
 *   answer is expired, failed or refused again, nothing more happens until the user presses Retry (which restores the one
 *   automatic re-read). A server that answered ceilings 1 ms ahead therefore cannot make a timer storm.
 * - NOTHING IS ASKED WITHOUT A SCOPE. No session, no workspace in the address, or the flag off: the phase is `idle`, no request,
 *   no notice, and the rail is today's (session capabilities alone).
 */
import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";

import type { AccessEnvironment } from "../readers/accessEffective";
import { navigationAnswers, selfProjectionExpiry, type AccessSelfNavigation } from "../readers/accessSelf";
import { selfNavigationGate, type SelfNavGate } from "./selfNavGate";
import { httpSelfNavigationPort, type SelfNavigationOutcome, type SelfNavigationPort, type SelfNavigationProblem } from "./selfNavigationPort";

/** `setTimeout` holds a signed 32-bit delay; a longer one fires at once. A longer ceiling is waited out in slices of this size. */
export const MAX_TIMEOUT_MS = 2_147_483_647;

export interface UseSelfNavigationOptions {
  /** False (flag off, no session): idle, no request. */
  enabled: boolean;
  /** The signed-in session's id. Not sent; part of the scope key so another session starts clean. */
  sessionKey: string | null;
  /** The workspace in the address. `null`: nothing is asked (the session publishes none today). */
  workspaceId: string | null;
  environment: AccessEnvironment;
  /** Test seam. Defaults to the same-origin HTTP port. */
  port?: SelfNavigationPort;
  /** Test seam: UTC epoch ms. */
  now?: () => number;
}

export type SelfNavigationPhase = "idle" | "loading" | "live" | "expired" | "failed";

export interface SelfNavigationView {
  phase: SelfNavigationPhase;
  /** The rail's input. `live` only inside the ceiling; `none`/`expired` carry no token. */
  gate: SelfNavGate;
  /** Why the rail is shut, for a read that is expired or failed (and, while it re-reads after expiry, `busy`). Else `null`. */
  unavailable: { reason: string; busy: boolean } | null;
  /** Ask again for the current scope. Joins a read already in flight; restores the one automatic expiry re-read. */
  retry(): void;
}

type ExpiredNote = { reason: string };

type Slot =
  | { key: string; phase: "loading"; after: ExpiredNote | null }
  | { key: string; phase: "ready"; navigation: AccessSelfNavigation }
  | { key: string; phase: "failed"; reason: string };

const NO_GATE: SelfNavGate = { kind: "none", tokens: new Set<string>() };

const scopeKeyOf = (sessionKey: string, workspaceId: string, environment: AccessEnvironment) => `${sessionKey}\u0000${workspaceId}\u0000${environment}`;

function problemText(problem: SelfNavigationProblem): string {
  return `${problem.code ? ` Code ${problem.code}.` : ""}${problem.requestId ? ` Request ${problem.requestId}.` : ""}`;
}

/** The one sentence for an outcome that is not a body. Every wording says what the Portal said, never why a person lacks access. */
function failureReason(outcome: Exclude<SelfNavigationOutcome, { kind: "ok" }>): string {
  switch (outcome.kind) {
    case "conflict":
      return `The Portal could not settle the navigation read after one retry (409).${problemText(outcome)}`;
    case "denied":
      return outcome.status === 401
        ? `The Portal did not accept this session for the navigation read (401).${problemText(outcome)}`
        : `The Portal did not permit the navigation read for this session (403).${problemText(outcome)}`;
    case "unavailable":
      return `${outcome.reason}${problemText(outcome)}`;
  }
}

export function useSelfNavigation(options: UseSelfNavigationOptions): SelfNavigationView {
  const { enabled, sessionKey, workspaceId, environment } = options;
  const defaultPort = useMemo(() => httpSelfNavigationPort(), []);
  const portRef = useRef<SelfNavigationPort>(options.port ?? defaultPort);
  portRef.current = options.port ?? defaultPort;
  const nowRef = useRef<() => number>(options.now ?? Date.now);
  nowRef.current = options.now ?? Date.now;

  const scopeKey = enabled && sessionKey !== null && workspaceId !== null ? scopeKeyOf(sessionKey, workspaceId, environment) : null;
  const scopeRef = useRef<{ key: string; sessionKey: string; workspaceId: string; environment: AccessEnvironment } | null>(null);

  const slotRef = useRef<Slot | null>(null);
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const setSlot = useCallback((next: Slot | null) => {
    slotRef.current = next;
    bump();
  }, []);

  const tokenRef = useRef(0);
  const inflight = useRef<{ key: string; controller: AbortController } | null>(null);
  /** Whether this scope may still make its one automatic read after an expiry. */
  const rereadLeft = useRef(true);

  const run = useCallback((after: ExpiredNote | null) => {
    const scope = scopeRef.current;
    if (scope === null) return;
    // Single flight: a read for this scope is already out; whoever asked again waits for the same answer.
    if (inflight.current?.key === scope.key) return;
    const controller = new AbortController();
    const token = ++tokenRef.current;
    inflight.current = { key: scope.key, controller };
    setSlot({ key: scope.key, phase: "loading", after });
    const question = { workspaceId: scope.workspaceId, environment: scope.environment, sessionKey: scope.sessionKey };
    void (async () => {
      let outcome = await portRef.current.read(question, controller.signal);
      // 409 is repeated exactly once, and only if this scope is still the one being asked about.
      if (outcome.kind === "conflict" && token === tokenRef.current && !controller.signal.aborted) {
        outcome = await portRef.current.read(question, controller.signal);
      }
      if (token !== tokenRef.current || controller.signal.aborted) return; // a late answer for a scope that has gone
      inflight.current = null;
      if (outcome.kind === "ok") {
        if (!navigationAnswers(outcome.navigation, { workspaceId: scope.workspaceId, environment: scope.environment })) {
          setSlot({ key: scope.key, phase: "failed", reason: "The answer was for a different workspace or environment than the one selected, so it is not shown." });
          return;
        }
        setSlot({ key: scope.key, phase: "ready", navigation: outcome.navigation });
        return;
      }
      setSlot({ key: scope.key, phase: "failed", reason: failureReason(outcome) });
    })();
  }, [setSlot]);

  // The scope: ask on entering one, drop everything on leaving it.
  useEffect(() => {
    if (scopeKey === null || sessionKey === null || workspaceId === null) {
      scopeRef.current = null;
      slotRef.current = null;
      return;
    }
    scopeRef.current = { key: scopeKey, sessionKey, workspaceId, environment };
    rereadLeft.current = true;
    run(null);
    return () => {
      tokenRef.current += 1;
      inflight.current?.controller.abort();
      inflight.current = null;
      scopeRef.current = null;
      slotRef.current = null;
    };
    // `run` is stable; the scope key is the whole identity of the question.
  }, [scopeKey, sessionKey, workspaceId, environment, run]);

  /** Synchronous: has the ceiling passed? If so, take the one automatic re-read, else just repaint the shut rail. */
  const checkExpiry = useCallback(() => {
    const slot = slotRef.current;
    if (slot === null || slot.phase !== "ready") return;
    const gate = selfNavigationGate(slot.navigation, nowRef.current());
    if (gate.kind !== "expired") return;
    if (rereadLeft.current) {
      rereadLeft.current = false;
      run({ reason: gate.message });
    } else bump();
  }, [run]);

  // One timeout at the ceiling, plus a no-request re-check when the tab comes back (timers are throttled in background tabs).
  const readyUntil = slotRef.current?.phase === "ready" && slotRef.current.key === scopeKey ? slotRef.current.navigation.validUntilMs : null;
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

  // The view. `slot.key !== scopeKey` is a slot of ANOTHER scope: it is not read, not even for one frame.
  const slot = slotRef.current !== null && slotRef.current.key === scopeKey ? slotRef.current : null;
  const nowMs = nowRef.current();
  const expired = slot !== null && slot.phase === "ready" && selfProjectionExpiry(slot.navigation, nowMs).state === "expired";

  return useMemo<SelfNavigationView>(() => {
    if (scopeKey === null) return { phase: "idle", gate: NO_GATE, unavailable: null, retry };
    if (slot === null) return { phase: "loading", gate: NO_GATE, unavailable: null, retry };
    switch (slot.phase) {
      case "loading":
        return {
          phase: "loading",
          gate: NO_GATE,
          unavailable: slot.after === null ? null : { reason: slot.after.reason, busy: true },
          retry,
        };
      case "failed":
        return { phase: "failed", gate: NO_GATE, unavailable: { reason: slot.reason, busy: false }, retry };
      case "ready": {
        const gate = selfNavigationGate(slot.navigation, nowMs);
        if (gate.kind === "expired") return { phase: "expired", gate, unavailable: { reason: gate.message, busy: false }, retry };
        return { phase: "live", gate, unavailable: null, retry };
      }
    }
    // `expired` and `slot` are the only inputs that change the answer; the clock is read into `nowMs` once per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, slot, expired, retry]);
}
