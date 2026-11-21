/**
 * Screen 11 · P22 publication read, its R1 mirror, and the one publish write.
 *
 * There is exactly one read — `researchReleaseCandidatePublicationGetV1` — for a
 * sealed candidate. It carries the publication state, the server's
 * `may_publish` / `blocked_reason` gate and, once delivered, the R1 approval
 * read under the caller's own authority (`approval_read`). There is no mirror
 * route; nothing here asks for one.
 *
 * Reading:
 *
 *  - once when a sealed candidate is on screen, again every `PUBLICATION_POLL_MS`
 *    while the publication is `DELIVERED` (the mirror is live) or `PENDING`,
 *    and only while the tab is visible;
 *  - a transient failure (no answer, 408, 429, 5xx) is never a verdict: the
 *    last good read stays on screen as `stale` with its own `as_of_utc_ms`
 *    (or `unavailable` when there is none) and the read is tried again on a
 *    bounded backoff (`PUBLICATION_BACKOFF_MS`), still only while visible;
 *  - `401` (session), `403`/`404` (denied — one state and one sentence, so a
 *    non-member and an unknown candidate read the same, audit F-04) and
 *    `400`/other `4xx` (terminal) stop the reads: asking again cannot change
 *    the answer. Nothing already read is kept past a denial. A `401` also goes
 *    to the shell's Frame 01D sign-in path (`reportSessionExpired`, FG-05).
 *
 * Publishing: one confirmed click sends the pack digest the server returned
 * and the methodology claim the server listed (the reader's choice when it
 * lists several). The idempotency key and the R1 summary are the server's.
 * The answer is itself a publication read and is shown as sent; the
 * composition and the publication are then read again. A refusal follows spec
 * 11 §3 (`toRcPublishRefusal`): denied locks every write, a conflict re-reads,
 * unavailable waits for the reader, terminal ends the request. Every typed
 * refusal other than a denial is followed by one publication read, so the
 * screen shows what the server recorded (Codex P22 closeout: "reread the GET
 * after the typed response"); a request that never arrived is not.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { reportSessionExpired } from "../auth/sessionExpiry";
import { PortalApiError } from "../lib/api";
import { releaseCandidateApi, toRcPublishRefusal, type RcPublication, type RcWriteRefusal } from "./releaseCandidateClient";
import type { RcWriter } from "./useReleaseCandidate";

/** Spec 11 §3: the mirror is read every 60 s while PUBLISHED and visible. */
export const PUBLICATION_POLL_MS = 60_000;
/** A transient failure is tried again after these waits (the last one repeats). */
export const PUBLICATION_BACKOFF_MS = [15_000, 30_000, 60_000, 120_000, 300_000] as const;

export interface RcReadFailure {
  status: number;
  code: string | null;
  requestId: string | null;
}

export type RcPublicationView =
  /** No sealed candidate on screen: nothing to read. */
  | { state: "idle" }
  | { state: "loading" }
  | { state: "fresh"; publication: RcPublication }
  /** A transient failure after a good read: the good read stays, marked with its own as-of. */
  | { state: "stale"; publication: RcPublication; failure: RcReadFailure; retryInMs: number }
  /** A transient failure with nothing read yet. */
  | { state: "unavailable"; failure: RcReadFailure; retryInMs: number }
  | { state: "session"; failure: RcReadFailure }
  /** 403 and 404 alike (F-04): the screen cannot tell a non-member from an unknown candidate. */
  | { state: "denied"; failure: RcReadFailure }
  | { state: "terminal"; failure: RcReadFailure };

export type RcPublishSlot =
  | { state: "idle" }
  | { state: "pending" }
  | { state: "answered"; answer: RcPublication }
  | { state: "refused"; refusal: RcWriteRefusal };

export interface RcPublicationController {
  view: RcPublicationView;
  /** The last publication read the screen may print (fresh or stale), or null. */
  publication: RcPublication | null;
  /** Publication reads this hook has sent. */
  requestCount: number;
  /** True while a timer for the next read is armed. */
  polling: boolean;
  write: RcPublishSlot;
  /** Read again now (the reader's "read again"). */
  retry: () => void;
  /** Publish the sealed candidate; `claim` is used only when the server lists several. */
  publish: (claim: string | null) => void;
}

/** Transient: asking again may change the answer. */
export function isTransient(status: number): boolean {
  return status === 0 || status === 408 || status === 429 || status >= 500;
}

export function failureOf(error: unknown): RcReadFailure {
  return error instanceof PortalApiError
    ? { status: error.status, code: error.code, requestId: error.requestId }
    : { status: 0, code: null, requestId: null };
}

/**
 * What a failed read leaves on screen. Pure, so the decision is proven without
 * a timer: transient keeps the prior read as `stale` (or `unavailable`) and
 * names the next wait; anything else is its own terminal state and drops it.
 */
export function nextPublicationView(prior: RcPublication | null, error: unknown, attempt: number): RcPublicationView {
  const failure = failureOf(error);
  if (isTransient(failure.status)) {
    const retryInMs = PUBLICATION_BACKOFF_MS[Math.min(attempt, PUBLICATION_BACKOFF_MS.length - 1)]!;
    return prior ? { state: "stale", publication: prior, failure, retryInMs } : { state: "unavailable", failure, retryInMs };
  }
  if (failure.status === 401) return { state: "session", failure };
  if (failure.status === 403 || failure.status === 404) return { state: "denied", failure };
  return { state: "terminal", failure };
}

function visible(): boolean {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

function held(view: RcPublicationView): RcPublication | null {
  return view.state === "fresh" || view.state === "stale" ? view.publication : null;
}

export function useReleaseCandidatePublication(
  releaseCandidateId: string | null,
  options: {
    workspaceId?: string;
    writer?: RcWriter;
    /** Writes are off (a refusal for access elsewhere on this screen). */
    writesLocked?: boolean;
    /** A publish was refused for access: lock every write of the screen. */
    onDenied?: () => void;
    /** A publish answered or conflicted: the composition should be read again. */
    onSettled?: () => void;
  } = {},
): RcPublicationController {
  const { workspaceId, writesLocked = false } = options;
  const [view, setView] = useState<RcPublicationView>(releaseCandidateId ? { state: "loading" } : { state: "idle" });
  const [requestCount, setRequestCount] = useState(0);
  const [polling, setPolling] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [write, setWrite] = useState<RcPublishSlot>({ state: "idle" });

  const viewRef = useRef(view);
  viewRef.current = view;
  const ownWriter = useRef(false);
  const writer = options.writer ?? ownWriter;
  const mounted = useRef(true);
  const callbacks = useRef({ onDenied: options.onDenied, onSettled: options.onSettled });
  callbacks.current = { onDenied: options.onDenied, onSettled: options.onSettled };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (releaseCandidateId === null) {
      setView({ state: "idle" });
      setPolling(false);
      return;
    }
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let reader: AbortController | null = null;
    let failures = 0;
    /** The wait before the next read; null means no further read is due. */
    let due: number | null = 0;

    /* Another candidate: nothing read for the last one is shown for this one. */
    setView((prior) => {
      const kept = held(prior);
      return kept && kept.release_candidate_id === releaseCandidateId ? prior : { state: "loading" };
    });

    const disarm = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      setPolling(false);
    };

    const arm = (delay: number | null) => {
      due = delay;
      if (stopped || delay === null || timer !== null || !visible()) {
        if (delay === null) setPolling(false);
        return;
      }
      if (delay === 0) {
        read();
        return;
      }
      setPolling(true);
      timer = setTimeout(() => {
        timer = null;
        read();
      }, delay);
    };

    const read = () => {
      due = null;
      setPolling(false);
      const controller = new AbortController();
      reader = controller;
      setRequestCount((n) => n + 1);
      releaseCandidateApi
        .publication(releaseCandidateId, { workspaceId, signal: controller.signal })
        .then((answer) => {
          if (stopped || controller.signal.aborted) return;
          failures = 0;
          setView({ state: "fresh", publication: answer });
          arm(answer.state === "DELIVERED" || answer.state === "PENDING" ? PUBLICATION_POLL_MS : null);
        })
        .catch((error: unknown) => {
          if (stopped || controller.signal.aborted) return;
          const next = nextPublicationView(held(viewRef.current), error, failures);
          if (next.state === "session") reportSessionExpired();
          setView(next);
          if (next.state === "stale" || next.state === "unavailable") {
            failures += 1;
            arm(next.retryInMs);
          } else {
            arm(null);
          }
        })
        .finally(() => {
          if (reader === controller) reader = null;
        });
    };

    const onVisibility = () => {
      if (!visible()) {
        disarm();
        return;
      }
      if (reader === null && timer === null) arm(due);
    };

    document.addEventListener("visibilitychange", onVisibility);
    arm(0);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisibility);
      disarm();
      reader?.abort();
    };
  }, [releaseCandidateId, workspaceId, generation]);

  const retry = useCallback(() => setGeneration((n) => n + 1), []);

  const publish = useCallback(
    (claim: string | null) => {
      const current = held(viewRef.current);
      if (releaseCandidateId === null || current === null || writer.current || writesLocked) return;
      if (!current.may_publish || current.blocked_reason !== null) return;
      const claims = current.source.eligible_methodology_claim_ids;
      const choice = claims.length === 1 ? claims[0]! : claim;
      if (choice === null || !claims.includes(choice)) return;
      writer.current = true;
      setWrite({ state: "pending" });
      releaseCandidateApi
        .publish(
          releaseCandidateId,
          {
            schema_version: "research.release-candidate-publish-request.v1",
            expected_pack_digest: current.pack_digest,
            methodology_claim_id: choice,
          },
          { workspaceId },
        )
        .then((answer) => {
          if (!mounted.current) return;
          /* The answer is the server's publication read: show it as sent, then read both again. */
          setView({ state: "fresh", publication: answer });
          setWrite({ state: "answered", answer });
          setGeneration((n) => n + 1);
          callbacks.current.onSettled?.();
        })
        .catch((error: unknown) => {
          if (!mounted.current) return;
          const refusal = toRcPublishRefusal(error);
          setWrite({ state: "refused", refusal });
          if (refusal.outcome === "denied") callbacks.current.onDenied?.();
          if (refusal.outcome === "conflict") {
            setGeneration((n) => n + 1);
            callbacks.current.onSettled?.();
          } else if (refusal.outcome !== "denied" && refusal.status !== 0) {
            /* A typed 400/422/5xx: read what the server recorded; nothing is sent again. */
            setGeneration((n) => n + 1);
          }
        })
        .finally(() => {
          writer.current = false;
        });
    },
    [releaseCandidateId, workspaceId, writer, writesLocked],
  );

  return { view, publication: held(view), requestCount, polling, write, retry, publish };
}
