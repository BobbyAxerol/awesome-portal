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
import { isEvidenceWindow, parseWindow, type EvidenceWindow } from "./evidenceWindow";

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
   * W5 §3.1: the evidence window, an FE view key. `null` = the reader never
   * chose one (written only when named). It lives in the hash but outside the
   * `p02-cursor.v2` codec: stripped before decoding, re-added when serialising,
   * so the server contract and the journey read never see it.
   */
  window: EvidenceWindow | null;
  /**
   * RF01-F5: cursor keys these screens do not interpret (`study`, `pick`,
   * `trade`, `mode`, `playback_ordinal`). Carried verbatim so a link that passes
   * through Screen 04 leaves with everything it arrived with. Absent when empty.
   * A `trial`/`seq` that is not a positive integer is NOT carried (W5 §3.7): it
   * is reported and dropped from the address.
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
  window: null,
};

/** The arrival hand-off target: the θ* the run's progress read published (fold, trial, params digest). */
export interface HandoffTarget {
  fold: number;
  trial: number;
  params: string;
}

/** A codec problem, optionally with the offending value (for the one-line notice). */
export type EvidenceCursorProblem = CursorProblem & { value?: string };

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
  problems: EvidenceCursorProblem[];
  /** RF-06 corrections the parse itself made (fold 0 → 1), for the notice. */
  notes: CursorNote[];
  /** Which interpreted keys the hash actually named (FE-X-10). */
  named: { stage: boolean; fold: boolean; window: boolean };
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
    }
  /** W5 §3.7: the published trial list lacks the trial the link named (hub / S06). */
  | { code: "CURSOR_TRIAL_NOT_FOUND"; value: string }
  /** W5 §3.7: `seq` is outside the loaded replay window (S08). `to` = last position. */
  | { code: "CURSOR_SEQ_OUT_OF_RANGE"; from: number; to: number };

/** One short line per note — the explanation is the screen's, not the notice's. */
export function cursorNoteText(note: CursorNote): string {
  switch (note.code) {
    case "CURSOR_FOLD_CLAMPED":
      return `Link fold ${note.from} not in this run; fold ${note.to} shown.`;
    case "CURSOR_KEY_NOT_APPLIED":
      return note.run === null
        ? `Link ${note.key} “${note.value}” not applied.`
        : `Link ${note.key} “${note.value}” not applied; run is “${note.run}”.`;
    case "CURSOR_TRIAL_NOT_FOUND":
      return `Link value ignored: trial “${note.value}”.`;
    case "CURSOR_SEQ_OUT_OF_RANGE":
      return `Link value ignored: bar ${note.from.toLocaleString("en-US")} (last ${note.to.toLocaleString("en-US")}).`;
  }
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
  /* `window` is an FE view key: it leaves the hash before the codec sees it. */
  const params = new URLSearchParams(hash.replace(/^[#?]/, ""));
  const windowValues = params.getAll("window");
  params.delete("window");
  const { cursor: decoded, problems: codecProblems } = decodeInspectionCursor(params);
  const problems: EvidenceCursorProblem[] = codecProblems;
  let window: EvidenceWindow | null = null;
  if (windowValues.length > 1) problems.push({ code: "CURSOR_DUPLICATE_KEY", key: "window" });
  else if (windowValues.length === 1) {
    if (isEvidenceWindow(windowValues[0])) window = windowValues[0];
    else problems.push({ code: "CURSOR_VALUE_INVALID", key: "window", value: windowValues[0] });
  }

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
    problems.push({ code: "CURSOR_VALUE_UNREADABLE", key: "fold", value: decoded.fold });
  }
  /* W5 §3.7: a trial/seq that is an identifier but not a positive integer is
     reported and NOT carried, so "copy link" does not re-share it. */
  const trial = positiveInt(decoded.trial);
  if (decoded.trial !== undefined && trial === null) problems.push({ code: "CURSOR_VALUE_UNREADABLE", key: "trial", value: decoded.trial });
  const seq = positiveInt(decoded.seq);
  if (decoded.seq !== undefined && seq === null) problems.push({ code: "CURSOR_VALUE_UNREADABLE", key: "seq", value: decoded.seq });

  const cursor: EvidenceCursor = {
    stage: decoded.stage !== undefined && isCursorStage(decoded.stage) ? decoded.stage : DEFAULT_CURSOR.stage,
    fold: fold ?? DEFAULT_CURSOR.fold,
    trial,
    params: decoded.params ?? null,
    schedule: decoded.schedule ?? null,
    route: decoded.route ?? null,
    seq,
    window,
  };
  if (Object.keys(carried).length > 0) cursor.carried = carried;
  return {
    cursor,
    problems,
    notes,
    named: { stage: decoded.stage !== undefined && isCursorStage(decoded.stage), fold: fold !== null, window: window !== null },
  };
}

/**
 * W5 §3.5: a `?window=` on an old link is read ONCE on arrival (the hash wins
 * when it names a window too). The caller rewrites the address (`replaceState`)
 * so the query never lives on and Back does not return to it.
 */
function withLegacyWindow(read: Read, search: string): Read {
  if (!new URLSearchParams(search).has("window")) return read;
  if (read.cursor.window !== null) return read;
  const legacy = parseWindow(search);
  if (legacy === null) {
    const value = new URLSearchParams(search).get("window") ?? "";
    return { ...read, problems: [...read.problems, { code: "CURSOR_VALUE_INVALID", key: "window", value }] };
  }
  return { ...read, cursor: { ...read.cursor, window: legacy }, named: { ...read.named, window: true } };
}

/** The query with `window` removed (the legacy key lives only in the hash now). */
function withoutWindowQuery(search: string): string {
  const params = new URLSearchParams(search);
  if (!params.has("window")) return search;
  params.delete("window");
  const rest = params.toString();
  return rest === "" ? "" : `?${rest}`;
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
export function parseCursorProblems(hash: string): EvidenceCursorProblem[] {
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
  return cursorHash(cursor, null);
}

/** The cursor keys a link may carry (W5 §3.2 keys-by-screen table), besides `carried`. */
export type CursorKeyName = "stage" | "fold" | "trial" | "params" | "schedule" | "route" | "seq" | "window";

/**
 * The hash for a cursor, writing only the keys in `keys` (all when null).
 * `stage` and `fold` are written whenever they are allowed. Used by
 * `serializeCursor` (all keys) and by `runScreenHref` (the destination's keys).
 * `carried` rides along only when `keys` is null or includes `"carried"`.
 */
export function cursorHash(cursor: EvidenceCursor, keys: ReadonlySet<CursorKeyName | "carried"> | null): string {
  const allow = (key: CursorKeyName | "carried") => keys === null || keys.has(key);
  const wire: InspectionCursor = allow("carried") ? { ...cursor.carried } : {};
  if (allow("stage")) wire.stage = cursor.stage;
  if (allow("fold")) wire.fold = String(cursor.fold);
  if (allow("trial") && cursor.trial !== null) wire.trial = String(cursor.trial);
  if (allow("params") && cursor.params !== null) wire.params = cursor.params;
  if (allow("schedule") && cursor.schedule !== null) wire.schedule = cursor.schedule;
  if (allow("route") && cursor.route !== null) wire.route = cursor.route;
  if (allow("seq") && cursor.seq !== null) wire.seq = String(cursor.seq);
  const encoded = encodeInspectionCursor(wire);
  const window = allow("window") && cursor.window !== null ? `window=${cursor.window}` : "";
  return `#${[encoded, window].filter((part) => part !== "").join("&")}`;
}

/** The href a deep dive link carries: the target path plus this exact cursor (window included). */
export function deepDiveHref(path: string, cursor: EvidenceCursor): string {
  return `${path}${serializeCursor(cursor)}`;
}

export interface EvidenceCursorController {
  cursor: EvidenceCursor;
  /** RF01-F5: what the codec refused in the arriving hash, for the screen's notice. */
  problems: EvidenceCursorProblem[];
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
  /** W5: a screen records its own note (e.g. CURSOR_TRIAL_NOT_FOUND, CURSOR_SEQ_OUT_OF_RANGE) for the same notice. */
  addNote: (note: CursorNote) => void;
  setStage: (stage: EvidenceStage) => void;
  setFold: (fold: number) => void;
  /** `replace`: the change is a write-back (a window arriving), not a move the reader made — no history entry. */
  update: (patch: Partial<EvidenceCursor>, options?: { replace?: boolean }) => void;
  /**
   * "Reset to θ*": back to the cursor this screen was entered with (the Progress hand-off carries
   * fold, trial and params in the hash), never to fold 1. The tab the reader is on is kept.
   */
  reset: () => void;
  /** W5 §3.3: the θ* the run's progress read published, when one was passed in; the target of `reset`. */
  handoff: HandoffTarget | null;
  /** True when fold, trial and params already equal the hand-off (the reset button is then inert). */
  atHandoff: boolean;
}

export interface EvidenceCursorOptions {
  /**
   * W5 §3.3: the run's hand-off cursor (`useHandoffCursor`). When the arriving
   * hash names no `fold`, the cursor is seeded from it (one `replaceState`, no
   * push); if it arrives after first paint and the reader has not touched the
   * cursor, it is applied once with replace. A hash that names a fold wins.
   */
  handoff?: HandoffTarget | null;
}

/**
 * Owns the hash for one screen.
 *
 * `react-router`'s `useNavigate` is deliberately not used for the hash: the
 * router would add a history entry per fold. `history.replaceState` plus a
 * `hashchange` listener keeps back meaning "leave this run", which is what a
 * reader expects from a screen whose whole state is one cursor.
 */
export function useEvidenceCursor(
  defaults: Partial<EvidenceCursor> = {},
  options: EvidenceCursorOptions = {},
): EvidenceCursorController {
  /* The run the cursor belongs to — used only to remember a published observed-fold set. */
  const { runId } = useParams<{ runId: string }>();
  /* Callers pass an object literal; the seed is keyed on its values so a
     re-render does not reset anything. */
  const seedKey = JSON.stringify(defaults);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the serialised defaults
  const seed = useMemo(() => ({ ...DEFAULT_CURSOR, ...defaults }), [seedKey]);
  const handoff = options.handoff ?? null;
  const [initial] = useState(() => {
    if (typeof window === "undefined") return null;
    const read = withLegacyWindow(seedCursor(window.location.hash, seed), window.location.search);
    /* W5 §3.3: no fold in the arriving hash and a hand-off in hand -> open on θ*, not on fold 1. */
    if (!read.named.fold && handoff !== null) {
      return { ...read, cursor: { ...read.cursor, fold: handoff.fold, trial: handoff.trial, params: handoff.params }, handoffApplied: true };
    }
    return { ...read, handoffApplied: false };
  });
  const [cursor, setCursor] = useState<EvidenceCursor>(() => initial?.cursor ?? seed);
  const [problems, setProblems] = useState<EvidenceCursorProblem[]>(() => initial?.problems ?? []);
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
  /* W5 §3.3: set by any reader move (not a write-back), so a late hand-off never overrides a choice. */
  const touched = useRef(false);
  const handoffApplied = useRef(initial?.handoffApplied ?? false);
  const arrivedWithFold = useRef(initial?.named.fold ?? false);

  /* Mount writes the full key set even when the reader arrived without a hash,
     so the address bar always describes what is on screen. */
  useEffect(() => {
    const next = serializeCursor(cursor);
    const push = pushNext.current;
    pushNext.current = false;
    /* W5 §3.5: the legacy `?window=` was absorbed into the cursor; the rewrite drops it from the query (replace, never an entry). */
    const search = withoutWindowQuery(window.location.search);
    const legacy = search !== window.location.search;
    if (window.location.hash !== next || legacy) {
      const url = `${window.location.pathname}${search}${next}`;
      if (push && !legacy) window.history.pushState(null, "", url);
      else window.history.replaceState(null, "", url);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs on every cursor change by design
  }, [cursor]);

  /* W5 §3.3: a hand-off that arrives after first paint seeds the cursor once, if the reader has not moved it. */
  const handoffKey = handoff === null ? null : `${handoff.fold}|${handoff.trial}|${handoff.params}`;
  useEffect(() => {
    if (handoff === null || handoffApplied.current || touched.current || arrivedWithFold.current) return;
    handoffApplied.current = true;
    setCursor((previous) => ({ ...previous, fold: handoff.fold, trial: handoff.trial, params: handoff.params }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the hand-off's values
  }, [handoffKey]);

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
    if (options?.replace !== true) {
      touched.current = true;
      /* A fold or a window the reader picks is one history entry (Back returns to the one before it). */
      if (
        (patch.fold !== undefined && patch.fold !== latest.current.fold) ||
        (patch.window !== undefined && patch.window !== latest.current.window)
      ) {
        pushNext.current = true;
      }
    }
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
    addNote,
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
    handoff,
    atHandoff: handoff !== null && cursor.fold === handoff.fold && cursor.trial === handoff.trial && cursor.params === handoff.params,
    /* W5 §3.3: back to the hand-off cursor (θ*), never to fold 1 when one exists; the tab and the window the reader is on are kept. */
    reset: useCallback(
      () =>
        setCursor((previous) => {
          const base: EvidenceCursor =
            handoff !== null
              ? { ...DEFAULT_CURSOR, ...(initial?.cursor.carried ? { carried: initial.cursor.carried } : {}), fold: handoff.fold, trial: handoff.trial, params: handoff.params }
              : (initial?.cursor ?? seed);
          return { ...base, stage: previous.stage, window: previous.window };
        }),
      // `initial` is read once at mount: the arrival cursor is the fallback to return to.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [seed, handoffKey],
    ),
  };
}
