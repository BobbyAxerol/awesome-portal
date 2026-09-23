/**
 * The evidence cursor — spec 04 §3, shared by Screens 04–08.
 *
 * One hub, one cursor, seven tabs. The cursor lives in the location hash so a
 * deep link carries it, a breadcrumb back from a deep dive restores it, and no
 * screen has to invent where the reader was.
 *
 * Three rules the spec fixes and this module enforces in one place:
 *
 *  - **Changes replace, never push.** Walking back through every fold the
 *    reader clicked is history rubbish; back should leave the screen.
 *  - **Changing tab does not move the cursor.** The stage is one key of the
 *    cursor, not a reset of it.
 *  - **The hash carries no fact the server did not publish.** `trial`,
 *    `params`, `schedule`, `route` and `seq` are absent until something
 *    typed supplies them — an absent key is left absent rather than defaulted
 *    to a plausible-looking digest.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  CURSOR_STAGES,
  decodeInspectionCursor,
  encodeInspectionCursor,
  isCursorStage,
  type CursorProblem,
  type CursorStage,
  type InspectionCursor,
  type InspectionCursorKey,
} from "./inspectionCursor";

/** The seven tabs of spec 04 — the `stage` key's closed set in `p02-cursor.v2`. */
export const EVIDENCE_STAGES = CURSOR_STAGES;

export type EvidenceStage = CursorStage;

export interface EvidenceCursor {
  stage: EvidenceStage;
  /** 1-based fold index, as spec 04 §3 writes it. */
  fold: number;
  trial: number | null;
  params: string | null;
  schedule: string | null;
  route: string | null;
  seq: number | null;
  /**
   * RF01-F5: cursor keys these screens do not interpret (`study`, `pick`,
   * `trade`, `mode`, `playback_ordinal`) and any `trial`/`seq` that is a valid
   * identifier but not a number here. Carried verbatim so a link that passes
   * through Screen 04 leaves with everything it arrived with. Absent when empty.
   */
  carried?: InspectionCursor;
}

export const DEFAULT_CURSOR: EvidenceCursor = {
  stage: "summary",
  fold: 1,
  trial: null,
  params: null,
  schedule: null,
  route: null,
  seq: null,
};

/** Keys these screens read into typed fields; every other codec key is carried. */
const INTERPRETED = new Set<InspectionCursorKey>(["stage", "fold", "trial", "params", "schedule", "route", "seq", "event_seq"]);

/** An identifier that is also a positive integer; anything else is not a number here. */
function positiveInt(raw: string | undefined): number | null {
  if (raw === undefined || !/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return value >= 1 && Number.isSafeInteger(value) ? value : null;
}

interface Read {
  cursor: EvidenceCursor;
  problems: CursorProblem[];
}

function readHash(hash: string): Read {
  const { cursor: decoded, problems } = decodeInspectionCursor(hash);
  const carried: InspectionCursor = {};
  for (const [key, value] of Object.entries(decoded) as Array<[InspectionCursorKey, string]>) {
    if (!INTERPRETED.has(key)) carried[key] = value;
  }

  const fold = positiveInt(decoded.fold);
  if (decoded.fold !== undefined && fold === null) {
    /* `fold` always has a value on these screens, so an unreadable one cannot
       be carried silently — it is replaced by the default, and said so. */
    problems.push({ code: "CURSOR_VALUE_UNREADABLE", key: "fold" });
  }
  const trial = positiveInt(decoded.trial);
  if (decoded.trial !== undefined && trial === null) carried.trial = decoded.trial;
  const seq = positiveInt(decoded.seq);
  if (decoded.seq !== undefined && seq === null) carried.seq = decoded.seq;

  const cursor: EvidenceCursor = {
    stage: decoded.stage !== undefined && isCursorStage(decoded.stage) ? decoded.stage : DEFAULT_CURSOR.stage,
    fold: fold ?? DEFAULT_CURSOR.fold,
    trial,
    params: decoded.params ?? null,
    schedule: decoded.schedule ?? null,
    route: decoded.route ?? null,
    seq,
  };
  if (Object.keys(carried).length > 0) cursor.carried = carried;
  return { cursor, problems };
}

export function parseCursor(hash: string): EvidenceCursor {
  return readHash(hash).cursor;
}

/** What the codec refused in this hash — for the screen's notice, never dropped silently. */
export function parseCursorProblems(hash: string): CursorProblem[] {
  return readHash(hash).problems;
}

/**
 * Serialises a cursor back to a hash, in the codec's canonical order.
 *
 * `stage` and `fold` are always written — spec 04 §3 says a mount with no hash
 * writes the full key set, so a reader who copies the URL after landing gets a
 * link that means the same thing. The optional keys are written only when they
 * hold a value, because `params=` with nothing after it is a claim that the
 * digest is empty rather than unread. Carried keys ride along unchanged.
 */
export function serializeCursor(cursor: EvidenceCursor): string {
  const wire: InspectionCursor = { ...cursor.carried };
  wire.stage = cursor.stage;
  wire.fold = String(cursor.fold);
  if (cursor.trial !== null) wire.trial = String(cursor.trial);
  if (cursor.params !== null) wire.params = cursor.params;
  if (cursor.schedule !== null) wire.schedule = cursor.schedule;
  if (cursor.route !== null) wire.route = cursor.route;
  if (cursor.seq !== null) wire.seq = String(cursor.seq);
  return `#${encodeInspectionCursor(wire)}`;
}

/** The href a deep dive link carries: the target screen plus this exact cursor. */
export function deepDiveHref(path: string, cursor: EvidenceCursor): string {
  return `${path}${serializeCursor(cursor)}`;
}

export interface EvidenceCursorController {
  cursor: EvidenceCursor;
  /** RF01-F5: what the codec refused in the arriving hash, for the screen's notice. */
  problems: CursorProblem[];
  setStage: (stage: EvidenceStage) => void;
  setFold: (fold: number) => void;
  update: (patch: Partial<EvidenceCursor>) => void;
  reset: () => void;
}

/**
 * Owns the hash for one screen.
 *
 * `react-router`'s `useNavigate` is deliberately not used for the hash: the
 * router would add a history entry per fold. `history.replaceState` plus a
 * `hashchange` listener keeps back meaning "leave this run", which is what a
 * reader expects from a screen whose whole state is one cursor.
 */
export function useEvidenceCursor(defaults: Partial<EvidenceCursor> = {}): EvidenceCursorController {
  const seed = useMemo(() => ({ ...DEFAULT_CURSOR, ...defaults }), [defaults]);
  const [cursor, setCursor] = useState<EvidenceCursor>(() =>
    typeof window === "undefined" ? seed : { ...seed, ...parseCursor(window.location.hash) },
  );
  const [problems, setProblems] = useState<CursorProblem[]>(() =>
    typeof window === "undefined" ? [] : parseCursorProblems(window.location.hash),
  );

  /* Mount writes the full key set even when the reader arrived without a hash,
     so the address bar always describes what is on screen. */
  useEffect(() => {
    const next = serializeCursor(cursor);
    if (window.location.hash !== next) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${next}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs on every cursor change by design
  }, [cursor]);

  /* A hash edited by hand, or a back into an earlier replaceState, is still a
     legitimate way to move the cursor. */
  useEffect(() => {
    const onHashChange = () => {
      setCursor((previous) => ({ ...previous, ...parseCursor(window.location.hash) }));
      setProblems(parseCursorProblems(window.location.hash));
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const update = useCallback((patch: Partial<EvidenceCursor>) => {
    setCursor((previous) => {
      const next = { ...previous, ...patch };
      /* A key the reader just set is no longer the one the link carried. */
      if (previous.carried && patch.carried === undefined) {
        const carried = { ...previous.carried };
        for (const key of Object.keys(patch)) delete carried[key as InspectionCursorKey];
        if (Object.keys(carried).length > 0) next.carried = carried;
        else delete next.carried;
      }
      return next;
    });
  }, []);

  return {
    cursor,
    problems,
    /* Stage is one key of the cursor. Everything else survives the change —
       the invariant spec 04 §2.4 and test T03 are about. */
    setStage: useCallback((stage: EvidenceStage) => update({ stage }), [update]),
    setFold: useCallback((fold: number) => update({ fold: Math.max(1, Math.trunc(fold)) }), [update]),
    update,
    reset: useCallback(() => setCursor(seed), [seed]),
  };
}
