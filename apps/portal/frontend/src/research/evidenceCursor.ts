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

export const EVIDENCE_STAGES = [
  "summary",
  "split",
  "search",
  "freeze",
  "execute",
  "claim",
  "atlas",
] as const;

export type EvidenceStage = (typeof EVIDENCE_STAGES)[number];

export interface EvidenceCursor {
  stage: EvidenceStage;
  /** 1-based fold index, as spec 04 §3 writes it. */
  fold: number;
  trial: number | null;
  params: string | null;
  schedule: string | null;
  route: string | null;
  seq: number | null;
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

function isStage(value: string): value is EvidenceStage {
  return (EVIDENCE_STAGES as readonly string[]).includes(value);
}

/** A hash key that is present but not a positive integer is dropped, not guessed. */
function positiveInt(raw: string | null): number | null {
  if (raw === null) return null;
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return value >= 1 ? value : null;
}

/**
 * Opaque hash values are echoed, never parsed.
 *
 * `params` is the canonical digest the server minted, `schedule` and `route`
 * are ids it published. The cursor carries them from screen to screen without
 * ever looking inside, so it cannot become a second source of them.
 */
function opaque(raw: string | null): string | null {
  if (raw === null) return null;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function parseCursor(hash: string): EvidenceCursor {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const stage = params.get("stage");
  return {
    stage: stage !== null && isStage(stage) ? stage : DEFAULT_CURSOR.stage,
    fold: positiveInt(params.get("fold")) ?? DEFAULT_CURSOR.fold,
    trial: positiveInt(params.get("trial")),
    params: opaque(params.get("params")),
    schedule: opaque(params.get("schedule")),
    route: opaque(params.get("route")),
    seq: positiveInt(params.get("seq")),
  };
}

/**
 * Serialises a cursor back to a hash.
 *
 * `stage` and `fold` are always written — spec 04 §3 says a mount with no hash
 * writes the full key set, so a reader who copies the URL after landing gets a
 * link that means the same thing. The optional keys are written only when they
 * hold a value, because `params=` with nothing after it is a claim that the
 * digest is empty rather than unread.
 */
export function serializeCursor(cursor: EvidenceCursor): string {
  const params = new URLSearchParams();
  params.set("stage", cursor.stage);
  params.set("fold", String(cursor.fold));
  if (cursor.trial !== null) params.set("trial", String(cursor.trial));
  if (cursor.params !== null) params.set("params", cursor.params);
  if (cursor.schedule !== null) params.set("schedule", cursor.schedule);
  if (cursor.route !== null) params.set("route", cursor.route);
  if (cursor.seq !== null) params.set("seq", String(cursor.seq));
  return `#${params.toString()}`;
}

/** The href a deep dive link carries: the target screen plus this exact cursor. */
export function deepDiveHref(path: string, cursor: EvidenceCursor): string {
  return `${path}${serializeCursor(cursor)}`;
}

export interface EvidenceCursorController {
  cursor: EvidenceCursor;
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
    const onHashChange = () => setCursor((previous) => ({ ...previous, ...parseCursor(window.location.hash) }));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const update = useCallback((patch: Partial<EvidenceCursor>) => {
    setCursor((previous) => ({ ...previous, ...patch }));
  }, []);

  return {
    cursor,
    /* Stage is one key of the cursor. Everything else survives the change —
       the invariant spec 04 §2.4 and test T03 are about. */
    setStage: useCallback((stage: EvidenceStage) => update({ stage }), [update]),
    setFold: useCallback((fold: number) => update({ fold: Math.max(1, Math.trunc(fold)) }), [update]),
    update,
    reset: useCallback(() => setCursor(seed), [seed]),
  };
}
