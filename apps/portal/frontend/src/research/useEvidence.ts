/**
 * Screen 04's container — the Hub, its lazy series and the retained passport.
 *
 * What it owns, and why each rule exists:
 *
 *  - **One Hub read on mount.** The Hub is the spine of the screen: metrics,
 *    claim, certificate, stages, series links and the run's typed absences.
 *    It is immutable at a revision, so a reread sends `If-None-Match` and a
 *    `304` keeps the copy in hand instead of repainting it.
 *  - **A series is read when a panel asks for it, once.** The handoff forbids
 *    eager-fetching all six: a reader who never opens the distribution panel
 *    never pays for it, and a chart nobody is looking at cannot be the reason
 *    a page is slow.
 *  - **A series at another revision is discarded.** It is not drawn, not
 *    cached and not treated as an error: the Hub is reread, and that one
 *    series is asked for again at the fresh revision. Exactly once — a
 *    mismatch that survives a reread is shown as a panel state rather than
 *    retried in a loop.
 *  - **The retained passport is a second, optional read.** RS-02 admits one
 *    Advanced-WFO profile. For a run bound to any other profile it answers a
 *    typed `200` not-applicable (RF-05 CG-P13-09) — an answer, not an error —
 *    and a `409` names its lane state; both stay the panel's typed state and
 *    never reach the route.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  NOT_MODIFIED,
  evidenceApi,
  isLaneNotApplicable,
  seriesMatchesHub,
  toEvidenceRefusal,
  type CurrentSourceEvidence,
  type CurrentSourceEvidenceSeries,
  type CurrentSourceNotApplicable,
  type EvidenceHub,
  type RetainedSeriesKind,
  type EvidenceRefusal,
  type EvidenceSeries,
  type SeriesKind,
} from "./evidenceClient";
import { researchState, type ResearchState } from "./state";
import { refusalState } from "./researchRefusal";

/** What one series panel knows about its own series. */
export type SeriesSlot =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; series: EvidenceSeries }
  | { state: "refused"; refusal: EvidenceRefusal }
  | { state: "revision-mismatch" };

export type PassportSlot =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; evidence: CurrentSourceEvidence }
  /** RF-05: the lane can never hold this run; nothing is pending. */
  | { state: "not-applicable"; answer: CurrentSourceNotApplicable }
  | { state: "refused"; refusal: EvidenceRefusal };

/** W3: the retained lane's equity relation (one read, after the passport answered). */
export type RetainedSeriesSlot =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; series: CurrentSourceEvidenceSeries }
  | { state: "refused"; refusal: EvidenceRefusal };

export interface EvidenceController {
  hub: EvidenceHub | null;
  refusal: EvidenceRefusal | null;
  state: ResearchState;
  series: ReadonlyMap<SeriesKind, SeriesSlot>;
  /** Asks for one series if no panel has asked yet. Safe to call every render. */
  ensureSeries: (kind: SeriesKind) => void;
  passport: PassportSlot;
  ensurePassport: () => void;
  retainedSeries: RetainedSeriesSlot;
  ensureRetainedSeries: () => void;
  /** W3b: the retained lane's derived series (distribution, monthly, rolling), asked per panel, once. */
  retainedKinds: ReadonlyMap<RetainedSeriesKind, RetainedSeriesSlot>;
  ensureRetainedKind: (kind: RetainedSeriesKind) => void;
  /** Rereads the Hub — the one action a `409` or a transport failure offers. */
  reread: () => void;
}

export function useEvidence(runId: string, workspaceId?: string): EvidenceController {
  const [hub, setHub] = useState<EvidenceHub | null>(null);
  const [refusal, setRefusal] = useState<EvidenceRefusal | null>(null);
  const [series, setSeries] = useState<ReadonlyMap<SeriesKind, SeriesSlot>>(new Map());
  const [passport, setPassport] = useState<PassportSlot>({ state: "idle" });
  const [retainedSeries, setRetainedSeries] = useState<RetainedSeriesSlot>({ state: "idle" });
  const retainedAsked = useRef(false);
  const [retainedKinds, setRetainedKinds] = useState<ReadonlyMap<RetainedSeriesKind, RetainedSeriesSlot>>(new Map());
  const retainedKindsAsked = useRef<Set<RetainedSeriesKind>>(new Set());
  const [generation, setGeneration] = useState(0);

  /* The Hub in a ref as well as state: a series response has to be checked
     against the revision that is current *when it lands*, not the one that was
     current when the request was made. */
  const hubRef = useRef<EvidenceHub | null>(null);
  hubRef.current = hub;
  const asked = useRef<Set<SeriesKind>>(new Set());
  const retried = useRef<Set<SeriesKind>>(new Set());
  const passportAsked = useRef(false);

  /* --------------------------------------------------------------- the Hub */

  useEffect(() => {
    const controller = new AbortController();
    evidenceApi
      .hub(runId, { workspaceId, etag: hubRef.current?.etag ?? null, signal: controller.signal })
      .then((answer) => {
        /* `304` is the server saying the copy in hand is still exact. Keeping
           it is the whole point of asking with the ETag. */
        if (answer === NOT_MODIFIED) return;
        setHub(answer);
        setRefusal(null);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setRefusal(toEvidenceRefusal(error));
      });
    return () => controller.abort();
  }, [generation, runId, workspaceId]);

  const reread = useCallback(() => setGeneration((n) => n + 1), []);

  /* ------------------------------------------------------- the lazy series */

  const ensureSeries = useCallback(
    (kind: SeriesKind) => {
      if (hubRef.current === null) return;
      if (asked.current.has(kind)) return;
      asked.current.add(kind);

      const request = (): void => {
        setSeries((previous) => new Map(previous).set(kind, { state: "loading" }));
        evidenceApi
          .series(runId, kind, { workspaceId })
          .then((answer) => {
            if (answer === NOT_MODIFIED) return;
            const currentHub = hubRef.current;
            if (currentHub === null) return;
            if (seriesMatchesHub(currentHub, answer)) {
              setSeries((previous) => new Map(previous).set(kind, { state: "ready", series: answer }));
              return;
            }
            /* Discard, reread the Hub, then ask this one series again — once.
               A mismatch that survives that is the panel's state, not a loop. */
            if (retried.current.has(kind)) {
              setSeries((previous) => new Map(previous).set(kind, { state: "revision-mismatch" }));
              return;
            }
            retried.current.add(kind);
            setSeries((previous) => new Map(previous).set(kind, { state: "loading" }));
            evidenceApi
              .hub(runId, { workspaceId })
              .then((fresh) => {
                if (fresh !== NOT_MODIFIED) setHub(fresh);
                request();
              })
              .catch((error: unknown) => {
                setSeries((previous) =>
                  new Map(previous).set(kind, { state: "refused", refusal: toEvidenceRefusal(error) }),
                );
              });
          })
          .catch((error: unknown) => {
            setSeries((previous) =>
              new Map(previous).set(kind, { state: "refused", refusal: toEvidenceRefusal(error) }),
            );
          });
      };

      request();
    },
    [runId, workspaceId],
  );

  /* ---------------------------------------------------- the retained passport */

  const ensurePassport = useCallback(() => {
    if (passportAsked.current) return;
    passportAsked.current = true;
    setPassport({ state: "loading" });
    evidenceApi
      .currentSource(runId, { workspaceId })
      .then((answer) => {
        if (answer === NOT_MODIFIED) return;
        setPassport(
          isLaneNotApplicable(answer) ? { state: "not-applicable", answer } : { state: "ready", evidence: answer },
        );
      })
      .catch((error: unknown) => {
        /* RS-02 admits one profile and refuses the rest. That refusal is a
           fact about this run, so it stays inside the panel. */
        setPassport({ state: "refused", refusal: toEvidenceRefusal(error) });
      });
  }, [runId, workspaceId]);

  /* W3: the retained equity relation, asked only for a sealed retained run. */
  const ensureRetainedSeries = useCallback(() => {
    if (retainedAsked.current) return;
    retainedAsked.current = true;
    setRetainedSeries({ state: "loading" });
    evidenceApi
      .currentSourceSeries(runId, "EQUITY", { workspaceId })
      .then((answer) => {
        if (answer === NOT_MODIFIED || answer.schema_version !== "research.current-source-evidence-series.v1") return;
        setRetainedSeries({ state: "ready", series: answer });
      })
      .catch((error: unknown) => setRetainedSeries({ state: "refused", refusal: toEvidenceRefusal(error) }));
  }, [runId, workspaceId]);

  /* W3b: one retained derived series, asked when its panel needs it. */
  const ensureRetainedKind = useCallback(
    (kind: RetainedSeriesKind) => {
      if (retainedKindsAsked.current.has(kind)) return;
      retainedKindsAsked.current.add(kind);
      setRetainedKinds((previous) => new Map(previous).set(kind, { state: "loading" }));
      evidenceApi
        .currentSourceSeries(runId, kind, { workspaceId })
        .then((answer) => {
          if (answer === NOT_MODIFIED || answer.schema_version !== "research.current-source-evidence-series.v1") return;
          /* A body for another kind is never drawn in this panel: its rows have another shape. */
          if (answer.kind !== kind) {
            setRetainedKinds((previous) =>
              new Map(previous).set(kind, {
                state: "refused",
                refusal: toEvidenceRefusal(new Error(`The retained lane answered ${answer.kind} for ${kind}.`)),
              }),
            );
            return;
          }
          setRetainedKinds((previous) => new Map(previous).set(kind, { state: "ready", series: answer }));
        })
        .catch((error: unknown) =>
          setRetainedKinds((previous) => new Map(previous).set(kind, { state: "refused", refusal: toEvidenceRefusal(error) })),
        );
    },
    [runId, workspaceId],
  );

  /* A new run is a new question: every lazy answer belongs to the old one. */
  useEffect(() => {
    asked.current = new Set();
    retried.current = new Set();
    passportAsked.current = false;
    retainedAsked.current = false;
    retainedKindsAsked.current = new Set();
    setRetainedKinds(new Map());
    setSeries(new Map());
    setPassport({ state: "idle" });
    setRetainedSeries({ state: "idle" });
  }, [runId]);

  const state: ResearchState = refusal
    ? refusalState(refusal, hub !== null)
    : researchState(
        hub === null
          ? { kind: "in-flight", hasAcceptedResponse: false }
          : { kind: "ok", rowCount: hub.metrics.length },
      );

  return {
    hub,
    refusal,
    state,
    series,
    ensureSeries,
    passport,
    ensurePassport,
    retainedSeries,
    ensureRetainedSeries,
    retainedKinds,
    ensureRetainedKind,
    reread,
  };
}
