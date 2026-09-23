/**
 * The Research inspection cursor codec — `p02-cursor.v2` (RF01-F5, audit F-01).
 *
 * One browser implementation of the rules in
 * `upgrade/research_loop/evidence/P02/cursor-codec.md`, shared by Screen 00
 * (the journey read's query) and Screens 04–08 (the evidence hash). Before
 * this there were two: the journey client followed P02, the evidence cursor
 * coerced numbers and silently dropped whatever it did not know, so a link
 * carrying `study` or `pick` lost them on its way into Screen 04.
 *
 * What the codec does and does not do:
 *
 *  - every value is an opaque identifier; nothing here reads a number. A screen
 *    may interpret `fold`, `trial` or `seq` only against the set its own
 *    contract published;
 *  - `stage` is presentation-only and the one closed-set key;
 *  - a key it refuses is reported as a problem the screen shows, never dropped
 *    without a word;
 *  - `seq` and its legacy alias `event_seq` fold to one `seq`, and two
 *    different values are a conflict, not a preference.
 */

export const CURSOR_CODEC = "p02-cursor.v2" as const;

export const CURSOR_STAGES = [
  "summary",
  "split",
  "search",
  "freeze",
  "execute",
  "claim",
  "atlas",
] as const;

export type CursorStage = (typeof CURSOR_STAGES)[number];

/** The ordered v2 vocabulary. Order is the canonical serialisation order. */
export const INSPECTION_CURSOR_KEYS = [
  "stage",
  "fold",
  "study",
  "trial",
  "pick",
  "params",
  "trade",
  "seq",
  "event_seq",
  "mode",
  "schedule",
  "route",
  "playback_ordinal",
] as const;

export type InspectionCursorKey = (typeof INSPECTION_CURSOR_KEYS)[number];
export type InspectionCursor = Partial<Record<InspectionCursorKey, string>>;

export type CursorProblemCode =
  | "CURSOR_UNSUPPORTED_KEY"
  | "CURSOR_DUPLICATE_KEY"
  | "CURSOR_VALUE_INVALID"
  | "CURSOR_SEQUENCE_CONFLICT"
  /** A valid identifier this screen cannot place in its own published set. */
  | "CURSOR_VALUE_UNREADABLE";

export interface CursorProblem {
  code: CursorProblemCode;
  key: string;
}

/** The server's `Identifier`: bounded, opaque, never JSON. */
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/;
const KEYS = new Set<string>(INSPECTION_CURSOR_KEYS);

export function isCursorStage(value: string): value is CursorStage {
  return (CURSOR_STAGES as readonly string[]).includes(value);
}

export interface DecodedCursor {
  cursor: InspectionCursor;
  problems: CursorProblem[];
}

/**
 * Decodes a hash or query string.
 *
 * `passThrough` names keys that belong to the address but not to the codec —
 * `run_id` and `workspace_id` on the journey query — so they are neither
 * decoded nor reported.
 */
export function decodeInspectionCursor(
  raw: string | URLSearchParams,
  { passThrough = [] }: { passThrough?: readonly string[] } = {},
): DecodedCursor {
  const params = typeof raw === "string" ? new URLSearchParams(raw.replace(/^[#?]/, "")) : raw;
  const cursor: InspectionCursor = {};
  const problems: CursorProblem[] = [];
  const seen = new Set<string>();

  for (const [key, value] of params.entries()) {
    if (passThrough.includes(key)) continue;
    if (!KEYS.has(key)) {
      problems.push({ code: "CURSOR_UNSUPPORTED_KEY", key });
      continue;
    }
    if (seen.has(key)) {
      /* A repeated key is two claims about one position; keep neither. */
      if (!problems.some((problem) => problem.key === key && problem.code === "CURSOR_DUPLICATE_KEY")) {
        problems.push({ code: "CURSOR_DUPLICATE_KEY", key });
      }
      delete cursor[key as InspectionCursorKey];
      continue;
    }
    seen.add(key);
    if (!IDENTIFIER.test(value) || (key === "stage" && !isCursorStage(value))) {
      problems.push({ code: "CURSOR_VALUE_INVALID", key });
      continue;
    }
    cursor[key as InspectionCursorKey] = value;
  }

  if (cursor.seq !== undefined && cursor.event_seq !== undefined && cursor.seq !== cursor.event_seq) {
    problems.push({ code: "CURSOR_SEQUENCE_CONFLICT", key: "seq" });
    delete cursor.seq;
    delete cursor.event_seq;
  } else if (cursor.event_seq !== undefined) {
    cursor.seq = cursor.event_seq;
    delete cursor.event_seq;
  }

  return { cursor, problems };
}

/** Canonical form: codec order, one `seq`, empty keys left out. No leading `#`/`?`. */
export function encodeInspectionCursor(cursor: InspectionCursor): string {
  const params = new URLSearchParams();
  for (const key of INSPECTION_CURSOR_KEYS) {
    if (key === "event_seq") continue;
    const value = key === "seq" ? (cursor.seq ?? cursor.event_seq) : cursor[key];
    if (value !== undefined && value !== "") params.set(key, value);
  }
  return params.toString();
}

/** The sentence a screen shows for one refused key. Fixed copy; the key is named. */
export function cursorProblemText(problem: CursorProblem): string {
  switch (problem.code) {
    case "CURSOR_UNSUPPORTED_KEY":
      return `This link carries “${problem.key}”, which is not part of the inspection cursor. It was not applied.`;
    case "CURSOR_DUPLICATE_KEY":
      return `This link names “${problem.key}” more than once. Neither value was applied.`;
    case "CURSOR_VALUE_INVALID":
      return `This link's “${problem.key}” is not a valid value. It was not applied.`;
    case "CURSOR_SEQUENCE_CONFLICT":
      return "This link carries two different event positions (seq and event_seq). Neither was applied.";
    case "CURSOR_VALUE_UNREADABLE":
      return `This link's “${problem.key}” is not one this screen can open. The default is shown instead.`;
  }
}
