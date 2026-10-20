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
import type { SelfContextCandidate } from "../readers/accessSelfContext";
import { selfNavigationGate, type SelfNavGate } from "./selfNavGate";
import { useSelfContext } from "./useSelfContext";
import { httpSelfNavigationPort, type SelfNavigationOutcome, type SelfNavigationPort, type SelfNavigationProblem } from "./selfNavigationPort";

/** `setTimeout` holds a signed 32-bit delay; a longer one fires at once. A longer ceiling is waited out in slices of this size. */
export const MAX_TIMEOUT_MS = 2_147_483_647;

export interface UseSelfNavigationOptions {
  /** False (flag off, no session): idle, no request. */
  enabled: boolean;
  /** The signed-in session's id. Not sent; part of the scope key so another session starts clean. */
  sessionKey: string | null;
  /** The workspace in the address. `null`: the self-context is asked which workspace is the member's (BE-P7); never a default of ours. */
  workspaceId: string | null;
  environment: AccessEnvironment;
  /** Test seam. Defaults to the same-origin HTTP port. */
  port?: SelfNavigationPort;
  /** Test seam: UTC epoch ms. */
  now?: () => number;
}

/**
 * `choosing`: the address names no workspace and the Portal says the member belongs to several (the chooser is offered, nothing is
 * read until the member picks). `absent`: the Portal says there is no workspace to read (`NONE`, or too many to list).
 */
export type SelfNavigationPhase = "idle" | "loading" | "live" | "expired" | "failed" | "choosing" | "absent";

/** The words the context path adds to the rail. NEW copy (not yet approved): recorded in the BE-P7 consumer receipt. */
export const SELF_CONTEXT_COPY = {
  none: "No workspace membership.",
  tooMany: "Too many workspace memberships to choose from.",
} as const;

export interface SelfNavigationView {
  phase: SelfNavigationPhase;
  /** The rail's input. `live` only inside the ceiling; `none`/`expired` carry no token. */
  gate: SelfNavGate;
  /** Why the rail is shut, for a read that is expired, failed or absent (and, while it re-reads after expiry, `busy`). Else `null`. */
  unavailable: { reason: string; busy: boolean } | null;
  /** The candidate workspaces to choose from, in the order the Portal published them. Only while `choosing`; else `null`. */
  chooser: { candidates: readonly SelfContextCandidate[] } | null;
  /**
   * The self-only "My access" entry is on offer: the navigation projection is LIVE (its own `self_entry.permission` is `ALLOWED`) and,
   * when the workspace came from the self-context, that context's entry is `ALLOWED` too. Carries the workspace the page opens for.
   * `null` fails closed (loading, expired, failed, denied, absent).
   */
  selfEntry: { workspaceId: string } | null;
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
  const { enabled, sessionKey, environment } = options;
  const defaultPort = useMemo(() => httpSelfNavigationPort(), []);
  const portRef = useRef<SelfNavigationPort>(options.port ?? defaultPort);
  portRef.current = options.port ?? defaultPort;
  const nowRef = useRef<() => number>(options.now ?? Date.now);
  nowRef.current = options.now ?? Date.now;

  // The workspace: the address names it, or (only when it names none) the self-context resolves it. The context is never asked while
  // the address has a workspace, and a context that is not `RESOLVED` names none: a member with several workspaces CHOOSES, the
  // rail is never scoped by a guess.
  const addressWorkspace = options.workspaceId;
  const context = useSelfContext({ enabled: enabled && addressWorkspace === null, sessionKey, port: options.port, now: options.now });
  const resolved = context.context?.defaultWorkspace.state === "RESOLVED" ? context.context.defaultWorkspace.workspaceId : null;
  const workspaceId = addressWorkspace ?? resolved;

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

  const navigationView = useMemo<Omit<SelfNavigationView, "chooser" | "selfEntry" | "retry">>(() => {
    if (scopeKey === null) return { phase: "idle", gate: NO_GATE, unavailable: null };
    if (slot === null) return { phase: "loading", gate: NO_GATE, unavailable: null };
    switch (slot.phase) {
      case "loading":
        return {
          phase: "loading",
          gate: NO_GATE,
          unavailable: slot.after === null ? null : { reason: slot.after.reason, busy: true },
        };
      case "failed":
        return { phase: "failed", gate: NO_GATE, unavailable: { reason: slot.reason, busy: false } };
      case "ready": {
        const gate = selfNavigationGate(slot.navigation, nowMs);
        if (gate.kind === "expired") return { phase: "expired", gate, unavailable: { reason: gate.message, busy: false } };
        return { phase: "live", gate, unavailable: null };
      }
    }
    // `expired` and `slot` are the only inputs that change the answer; the clock is read into `nowMs` once per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, slot, expired]);

  const retryBoth = useCallback(() => {
    context.retry();
    retry();
  }, [context.retry, retry]); // eslint-disable-line react-hooks/exhaustive-deps

  const contextPhase = context.phase;
  const contextValue = context.context;
  const contextFailure = context.failure;
  return useMemo<SelfNavigationView>(() => {
    const base = { chooser: null, selfEntry: null, retry: retryBoth } as const;
    // The address names a workspace (or nothing is asked): the navigation read alone, as before.
    if (addressWorkspace !== null || contextPhase === "idle") {
      const live = navigationView.phase === "live" && workspaceId !== null;
      return { ...navigationView, ...base, selfEntry: live ? { workspaceId } : null };
    }
    // The address names none: the self-context decides, and only a RESOLVED context scopes the navigation read.
    switch (contextPhase) {
      case "loading":
        return { phase: "loading", gate: NO_GATE, unavailable: contextFailure, ...base };
      case "failed":
      case "expired":
        return { phase: contextPhase, gate: NO_GATE, unavailable: contextFailure, ...base };
      case "ready": {
        const chosen = contextValue!.defaultWorkspace;
        switch (chosen.state) {
          case "RESOLVED": {
            const live = navigationView.phase === "live" && contextValue!.selfEntry.permission === "ALLOWED";
            return { ...navigationView, ...base, selfEntry: live ? { workspaceId: chosen.workspaceId } : null };
          }
          case "AMBIGUOUS":
            // Never auto-picked: the candidates are offered in the order published and the member chooses.
            return { phase: "choosing", gate: NO_GATE, unavailable: null, ...base, chooser: { candidates: chosen.candidates } };
          case "NONE":
            return { phase: "absent", gate: NO_GATE, unavailable: { reason: SELF_CONTEXT_COPY.none, busy: false }, ...base };
          case "UNAVAILABLE":
            return { phase: "absent", gate: NO_GATE, unavailable: { reason: SELF_CONTEXT_COPY.tooMany, busy: false }, ...base };
        }
      }
    }
    // The context object is read through the three values above; `navigationView` and the workspace are the other inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addressWorkspace, workspaceId, contextPhase, contextValue, contextFailure, navigationView, retryBoth]);
}
