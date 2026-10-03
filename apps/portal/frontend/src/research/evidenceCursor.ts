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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";

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
  /** RF-06 corrections the parse itself made (fold 0 → 1), for the notice. */
  notes: CursorNote[];
  /** Which interpreted keys the hash actually named (FE-X-10). */
  named: { stage: boolean; fold: boolean };
}

/* -------------------------------------------------------------------------
 * Cursor notes — RF-06 FE-S04-06, FE-S06-05, FE-S06-06
 *
 * A problem (above, from the codec) is a key the link carried that the codec
 * refused. A note is different: the key was readable, but this screen moved
 * or declined it against what the run published — a fold beyond the observed
 * set, a mode the run was not submitted with. Each one is said, never done
 * silently.
 * ---------------------------------------------------------------------- */

export type CursorNote =
  | {
      code: "CURSOR_FOLD_CLAMPED";
      from: number;
      to: number;
      /** `BELOW_FIRST` / `BEYOND_LAST` / `NOT_OBSERVED` against an observed set; `OUT_OF_RANGE` against the read's own bound. */
      reason: "BELOW_FIRST" | "BEYOND_LAST" | "NOT_OBSERVED" | "OUT_OF_RANGE";
    }
  | {
      code: "CURSOR_KEY_NOT_APPLIED";
      key: "mode" | "schedule";
      value: string;
      /** The run's own published value, or null when the run published none. */
      run: string | null;
    };

export function cursorNoteText(note: CursorNote): string {
  if (note.code === "CURSOR_FOLD_CLAMPED") {
    switch (note.reason) {
      case "BELOW_FIRST":
        return `This link asked for fold ${note.from}. Folds start at ${note.to}, so fold ${note.to} is shown.`;
      case "BEYOND_LAST":
        return `This link asked for fold ${note.from}, beyond the last observed fold. The last observed fold, ${note.to}, is shown.`;
      case "NOT_OBSERVED":
        return `This link asked for fold ${note.from}, which this run did not observe. Fold ${note.to} is shown.`;
      case "OUT_OF_RANGE":
        return `This link asked for fold ${note.from}, outside the range this read accepts. Fold ${note.to} is shown instead.`;
    }
  }
  return note.run === null
    ? `This link asks for ${note.key} “${note.value}”, but this run published no ${note.key} to check it against. It was not applied.`
    : `This link asks for ${note.key} “${note.value}”; this run's ${note.key} is “${note.run}”, fixed at submit. The run's own ${note.key} is shown and the link's is not carried on.`;
}

/**
 * Golden cases 8–9 of spec 04 §30: a fold beyond the observed set is the last
 * observed fold, a fold below it is the first. A fold between observed folds
 * steps back to the nearest observed one below it. With no observed set there
 * is nothing to clamp against, and the fold is left alone.
 */
export function clampFold(
  fold: number,
  observed: readonly number[],
): { fold: number; note: CursorNote | null } {
  const set = [...new Set(observed.filter((value) => Number.isSafeInteger(value) && value >= 1))].sort((a, b) => a - b);
  if (set.length === 0 || set.includes(fold)) return { fold, note: null };
  const first = set[0];
  const last = set[set.length - 1];
  if (fold < first) return { fold: first, note: { code: "CURSOR_FOLD_CLAMPED", from: fold, to: first, reason: "BELOW_FIRST" } };
  if (fold > last) return { fold: last, note: { code: "CURSOR_FOLD_CLAMPED", from: fold, to: last, reason: "BEYOND_LAST" } };
  const below = set.filter((value) => value < fold).pop() ?? first;
  return { fold: below, note: { code: "CURSOR_FOLD_CLAMPED", from: fold, to: below, reason: "NOT_OBSERVED" } };
}

/* -------------------------------------------------------------------------
 * Observed folds, per run — RF-06 fold clamping across S04–S06
 *
 * The hub publishes the folds a run observed (`fold_navigation`); S05 learns
 * them from the retained fold plan. S06's read publishes none. So that a fold
 * the run never observed is clamped the same way on every screen of one run,
 * each published set is remembered for that run when a screen clamps against
 * it, and a screen whose own read publishes no set clamps against the one the
 * run already published. Nothing is inferred: with no published set there is
 * nothing to clamp against, and the fold is left alone.
 * ---------------------------------------------------------------------- */

const observedByRun = new Map<string, readonly number[]>();

export function rememberObservedFolds(runId: string, observed: readonly number[]): void {
  if (!runId) return;
  const set = [...new Set(observed.filter((value) => Number.isSafeInteger(value) && value >= 1))].sort((a, b) => a - b);
  if (set.length > 0) observedByRun.set(runId, set);
}

/** The observed folds a read of this run published in this session, or `null`. */
export function observedFoldsFor(runId: string): readonly number[] | null {
  return observedByRun.get(runId) ?? null;
}

/** Test seam. */
export function forgetObservedFolds(): void {
  observedByRun.clear();
}

function readHash(hash: string): Read {
  const { cursor: decoded, problems } = decodeInspectionCursor(hash);
  const carried: InspectionCursor = {};
  for (const [key, value] of Object.entries(decoded) as Array<[InspectionCursorKey, string]>) {
    if (!INTERPRETED.has(key)) carried[key] = value;
  }

  const notes: CursorNote[] = [];
  let fold = positiveInt(decoded.fold);
  if (decoded.fold !== undefined && fold === null && /^0+$/.test(decoded.fold)) {
    /* Golden case 9: `#fold=0` clamps to fold 1 — a readable number below
       the first fold, not an unreadable value. */
    fold = 1;
    notes.push({ code: "CURSOR_FOLD_CLAMPED", from: 0, to: 1, reason: "BELOW_FIRST" });
  } else if (decoded.fold !== undefined && fold === null) {
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
  return {
    cursor,
    problems,
    notes,
    named: { stage: decoded.stage !== undefined && isCursorStage(decoded.stage), fold: fold !== null },
  };
}

/**
 * FE-X-10: the cursor a screen opens with.
 *
 * `parseCursor` fills an absent `stage` with the hub's default, `summary`.
 * A deep dive must not: Screen 05 opened without a hash is on the split
 * stage, and the way back to the hub should land on the split tab. So the
 * screen's own seed wins for every interpreted key the hash did not name,
 * and the hash wins for every key it did.
 */
export function seedCursor(hash: string, seed: EvidenceCursor): Read {
  const read = readHash(hash);
  const cursor: EvidenceCursor = { ...read.cursor };
  if (!read.named.stage) cursor.stage = seed.stage;
  if (!read.named.fold) cursor.fold = seed.fold;
  return { ...read, cursor };
}

export function parseCursor(hash: string): EvidenceCursor {
  return readHash(hash).cursor;
}

/** What the codec refused in this hash — for the screen's notice, never dropped silently. */
export function parseCursorProblems(hash: string): CursorProblem[] {
  return readHash(hash).problems;
}

/** What the parse corrected in this hash (fold 0 → 1) — for the screen's notice. */
export function parseCursorNotes(hash: string): CursorNote[] {
  return readHash(hash).notes;
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
  /** RF-06: what this screen corrected or declined against the run, for the same notice. */
  notes: CursorNote[];
  /**
   * FE-S04-06: moves an unobserved fold onto the observed set (golden cases
   * 8–9) and records a note. A no-op when the fold is observed or the set is
   * empty. Safe to call from an effect on every render of the set.
   */
  clampToObserved: (observed: readonly number[]) => void;
  /**
   * Moves the fold to `to` because the read cannot accept the one the link
   * carried (FE-S06-06), and says so.
   */
  replaceFold: (to: number, reason: "OUT_OF_RANGE") => void;
  /**
   * FE-S06-05: drops a key the run contradicts (or cannot confirm) so it is
   * not forwarded into every outgoing link, and says so.
   */
  decline: (key: "mode" | "schedule", run: string | null) => void;
  setStage: (stage: EvidenceStage) => void;
  setFold: (fold: number) => void;
  /** `replace`: the change is a write-back (a window arriving), not a move the reader made — no history entry. */
  update: (patch: Partial<EvidenceCursor>, options?: { replace?: boolean }) => void;
  /**
   * "Reset to θ*": back to the cursor this screen was entered with (the Progress hand-off carries
   * fold, trial and params in the hash), never to fold 1. The tab the reader is on is kept.
   */
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
  /* The run the cursor belongs to — used only to remember a published observed-fold set. */
  const { runId } = useParams<{ runId: string }>();
  /* Callers pass an object literal; the seed is keyed on its values so a
     re-render does not reset anything. */
  const seedKey = JSON.stringify(defaults);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the serialised defaults
  const seed = useMemo(() => ({ ...DEFAULT_CURSOR, ...defaults }), [seedKey]);
  const [initial] = useState(() => (typeof window === "undefined" ? null : seedCursor(window.location.hash, seed)));
  const [cursor, setCursor] = useState<EvidenceCursor>(() => initial?.cursor ?? seed);
  const [problems, setProblems] = useState<CursorProblem[]>(() => initial?.problems ?? []);
  const [notes, setNotes] = useState<CursorNote[]>(() => initial?.notes ?? []);
  const addNote = useCallback((note: CursorNote) => {
    setNotes((previous) =>
      previous.some((existing) => JSON.stringify(existing) === JSON.stringify(note)) ? previous : [...previous, note],
    );
  }, []);

  const latest = useRef(cursor);
  latest.current = cursor;
  /* QA S05 U15: a fold the reader picks is a history entry (Back returns to the fold before it);
     typing, scrubbing, clamps and the mount write keep replacing. */
  const pushNext = useRef(false);

  /* Mount writes the full key set even when the reader arrived without a hash,
     so the address bar always describes what is on screen. */
  useEffect(() => {
    const next = serializeCursor(cursor);
    const push = pushNext.current;
    pushNext.current = false;
    if (window.location.hash !== next) {
      const url = `${window.location.pathname}${window.location.search}${next}`;
      if (push) window.history.pushState(null, "", url);
      else window.history.replaceState(null, "", url);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs on every cursor change by design
  }, [cursor]);

  /* A hash edited by hand, or a back into an earlier replaceState, is still a
     legitimate way to move the cursor. */
  useEffect(() => {
    const onHashChange = () => {
      /* An edited hash that names no stage keeps the stage in hand (FE-X-10). */
      const observed = observedFoldsFor(runId ?? "");
      const read = seedCursor(window.location.hash, DEFAULT_CURSOR);
      /* QA S04-U3: a fold the run never observed is clamped here too, with the same notice a fresh load gets. */
      const clamped = observed !== null ? clampFold(seedCursor(window.location.hash, latest.current).cursor.fold, observed) : null;
      setCursor((previous) => {
        const next = seedCursor(window.location.hash, previous).cursor;
        return clamped !== null && clamped.note !== null ? { ...next, fold: clamped.fold } : next;
      });
      setProblems(read.problems);
      setNotes(clamped !== null && clamped.note !== null ? [...read.notes, clamped.note] : read.notes);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [runId]);

  const update = useCallback((patch: Partial<EvidenceCursor>, options?: { replace?: boolean }) => {
    if (options?.replace !== true && patch.fold !== undefined && patch.fold !== latest.current.fold) pushNext.current = true;
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

  const clampToObserved = useCallback(
    (observed: readonly number[]) => {
      rememberObservedFolds(runId ?? "", observed);
      setCursor((previous) => {
        const { fold, note } = clampFold(previous.fold, observed);
        if (note === null) return previous;
        addNote(note);
        return { ...previous, fold };
      });
    },
    [addNote, runId],
  );

  const replaceFold = useCallback(
    (to: number, reason: "OUT_OF_RANGE") => {
      setCursor((previous) => {
        if (previous.fold === to) return previous;
        addNote({ code: "CURSOR_FOLD_CLAMPED", from: previous.fold, to, reason });
        return { ...previous, fold: to };
      });
    },
    [addNote],
  );

  const decline = useCallback(
    (key: "mode" | "schedule", run: string | null) => {
      setCursor((previous) => {
        const value = key === "schedule" ? previous.schedule : (previous.carried?.mode ?? null);
        if (value === null) return previous;
        addNote({ code: "CURSOR_KEY_NOT_APPLIED", key, value, run });
        const next: EvidenceCursor = { ...previous };
        if (key === "schedule") next.schedule = null;
        if (previous.carried && key in previous.carried) {
          const carried = { ...previous.carried };
          delete carried[key];
          if (Object.keys(carried).length > 0) next.carried = carried;
          else delete next.carried;
        }
        return next;
      });
    },
    [addNote],
  );

  return {
    cursor,
    problems,
    notes,
    clampToObserved,
    replaceFold,
    decline,
    /* Stage is one key of the cursor. Everything else survives the change —
       the invariant spec 04 §2.4 and test T03 are about. */
    setStage: useCallback(
      (stage: EvidenceStage) => {
        /* QA S04-U1: an embedded stage body mounts in the same commit as the tab change and
           seeds its own cursor from the hash — which still named the old tab. Its first write
           (`seq=1`) then put the old stage back. The hash names the new tab before it mounts. */
        if (typeof window !== "undefined") {
          const next = serializeCursor({ ...latest.current, stage });
          if (window.location.hash !== next) {
            window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${next}`);
          }
        }
        update({ stage });
      },
      [update],
    ),
    setFold: useCallback((fold: number) => update({ fold: Math.max(1, Math.trunc(fold)) }), [update]),
    update,
    reset: useCallback(
      () => setCursor((previous) => ({ ...(initial?.cursor ?? seed), stage: previous.stage })),
      // `initial` is read once at mount: the arrival cursor is the thing to return to.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [seed],
    ),
  };
}
