/**
 * Screen 11's approval mirror poll (P22).
 *
 * The composition of a PUBLISHED candidate carries one mirror read. While the
 * candidate is PUBLISHED and the tab is visible, the mirror is read again every
 * `MIRROR_POLL_MS` (spec 11 §3); nothing else polls on this screen.
 *
 *  - `401`/`403`/`404` stop the poll for the life of the screen (`denied`) and
 *    drop every mirror fact: nothing already read is used to bypass a scope
 *    that has changed (403 and 404 read the same, audit F-04);
 *  - a `5xx`, a network failure or any other refusal keeps the last mirror read
 *    in this session and marks it `stale` with that read's own `as_of_utc_ms`;
 *    with no prior read it is `unavailable`;
 *  - a hidden tab or an unmounted screen clears the timer and aborts the read.
 *
 * The prior read is whatever this hook last held: the composition's mirror or
 * an earlier poll, both read in this session for the same run and workspace
 * (the container is keyed on the run). The browser never computes a status,
 * an SLA countdown or a count from it.
 */

import { useEffect, useRef, useState } from "react";

import { releaseCandidateApi, type RcCompose, type RcMirror } from "./releaseCandidateClient";
import { PortalApiError } from "../lib/api";

/** Spec 11 §3: the mirror is polled every 60 s while PUBLISHED and visible. */
export const MIRROR_POLL_MS = 60_000;

export type RcMirrorView =
  | { state: "fresh" }
  | { state: "stale"; asOfUtcMs: number; status: number; code: string | null; requestId: string | null }
  | { state: "unavailable"; status: number; code: string | null; requestId: string | null }
  | { state: "denied"; status: number; code: string | null; requestId: string | null };

export interface RcMirrorController {
  /** The mirror to print, or null when none may be shown. */
  mirror: RcMirror | null;
  view: RcMirrorView;
  /** Mirror reads this hook has sent (the composition's own read not included). */
  requestCount: number;
  /** True while the 60 s timer is armed. */
  polling: boolean;
}

/**
 * What a refused mirror read leaves on screen. Pure, so the decision can be
 * proven without a timer: denial drops the prior read; anything else keeps it
 * as `stale` when one exists and is `unavailable` otherwise.
 */
export function nextMirrorView(prior: RcMirror | null, error: unknown): { mirror: RcMirror | null; view: RcMirrorView } {
  const status = error instanceof PortalApiError ? error.status : 0;
  const code = error instanceof PortalApiError ? error.code : null;
  const requestId = error instanceof PortalApiError ? error.requestId : null;
  if (status === 401 || status === 403 || status === 404) {
    return { mirror: null, view: { state: "denied", status, code, requestId } };
  }
  if (prior !== null) {
    return { mirror: prior, view: { state: "stale", asOfUtcMs: prior.as_of_utc_ms, status, code, requestId } };
  }
  return { mirror: null, view: { state: "unavailable", status, code, requestId } };
}

function visible(): boolean {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

export function useReleaseCandidateMirror(input: {
  compose: RcCompose | null;
  writesLocked: boolean;
  workspaceId?: string;
}): RcMirrorController {
  const seed = input.compose?.mirror ?? null;
  const published = input.compose?.state === "PUBLISHED";
  const releaseCandidateId = seed?.release_candidate_id ?? null;

  /* What this hook holds, keyed on the composition mirror it was derived from. */
  const [held, setHeld] = useState<{ seed: RcMirror | null; mirror: RcMirror | null; view: RcMirrorView }>({
    seed,
    mirror: seed,
    view: { state: "fresh" },
  });
  const [requestCount, setRequestCount] = useState(0);
  const [polling, setPolling] = useState(false);
  const [denied, setDenied] = useState(false);

  const seedRef = useRef<RcMirror | null>(seed);
  const mirrorRef = useRef<RcMirror | null>(seed);
  const deniedRef = useRef(false);

  /*
   * A new composition read brings its own mirror: print it in the same render
   * (no frame where a published candidate reads as "not answered"), unless
   * access was withdrawn. The effect then records it as the held read.
   */
  const current = held.seed !== seed && !denied ? { seed, mirror: seed, view: { state: "fresh" } as RcMirrorView } : held;
  const { mirror, view } = current;
  useEffect(() => {
    if (deniedRef.current) return;
    seedRef.current = seed;
    mirrorRef.current = seed;
    setHeld({ seed, mirror: seed, view: { state: "fresh" } });
  }, [seed]);

  const active = published && releaseCandidateId !== null && !input.writesLocked && !denied;
  const { workspaceId } = input;

  useEffect(() => {
    if (!active || releaseCandidateId === null) {
      setPolling(false);
      return;
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    let reader: AbortController | null = null;
    let stopped = false;

    const clear = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      reader?.abort();
      reader = null;
      setPolling(false);
    };

    const arm = () => {
      if (stopped || timer !== null || !visible()) return;
      setPolling(true);
      timer = setTimeout(tick, MIRROR_POLL_MS);
    };

    const tick = () => {
      timer = null;
      const controller = new AbortController();
      reader = controller;
      setRequestCount((n) => n + 1);
      releaseCandidateApi
        .mirror(releaseCandidateId, { workspaceId, signal: controller.signal })
        .then((answer) => {
          if (controller.signal.aborted || stopped) return;
          mirrorRef.current = answer;
          setHeld({ seed: seedRef.current, mirror: answer, view: { state: "fresh" } });
          arm();
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted || stopped) return;
          const next = nextMirrorView(mirrorRef.current, error);
          mirrorRef.current = next.mirror;
          setHeld({ seed: seedRef.current, mirror: next.mirror, view: next.view });
          if (next.view.state === "denied") {
            deniedRef.current = true;
            stopped = true;
            setPolling(false);
            setDenied(true);
            return;
          }
          arm();
        });
    };

    const onVisibility = () => {
      if (visible()) arm();
      else clear();
    };

    document.addEventListener("visibilitychange", onVisibility);
    arm();
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisibility);
      clear();
    };
  }, [active, releaseCandidateId, workspaceId]);

  /* A write refused for access withdraws what was read under the old scope, too. */
  if (input.writesLocked && !denied) {
    return { mirror: null, view: { state: "denied", status: 0, code: null, requestId: null }, requestCount, polling: false };
  }
  return { mirror: denied ? null : mirror, view, requestCount, polling };
}
