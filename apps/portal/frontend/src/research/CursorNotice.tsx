/**
 * What the inspection cursor codec refused in the arriving link (RF01-F5), and
 * what the screen corrected or declined against the run (RF-06).
 *
 * P02 rule 1 makes a duplicate or unsupported key a typed error. A screen that
 * swallowed it would open somewhere the link did not point and never say so;
 * this names each refused key in fixed copy and lets the screen stand. RF-06
 * adds the second kind: a readable key the run contradicts — a fold it never
 * observed, a mode it was not submitted with — is moved or declined, and the
 * same notice says which and why.
 */

import type { CursorProblem } from "./inspectionCursor";
import { cursorNoteText, type CursorNote } from "./evidenceCursor";

/**
 * W5 §3.7: one short line per refused value, never an explanation. The value is
 * named when the parse kept it (`value`); the rest of the story is the screen's.
 */
export function problemLine(problem: CursorProblem & { value?: string }): string {
  const named = problem.value !== undefined ? `${problem.key} “${problem.value}”` : problem.key;
  switch (problem.code) {
    case "CURSOR_UNSUPPORTED_KEY":
      return `Link key ignored: ${problem.key}.`;
    case "CURSOR_DUPLICATE_KEY":
      return `Link key repeated, ignored: ${problem.key}.`;
    case "CURSOR_SEQUENCE_CONFLICT":
      return "Link seq conflict, ignored.";
    case "CURSOR_VALUE_INVALID":
    case "CURSOR_VALUE_UNREADABLE":
      return `Link value ignored: ${named}.`;
  }
}

export function CursorNotice({
  problems,
  notes = [],
}: {
  problems: readonly (CursorProblem & { value?: string })[];
  notes?: readonly CursorNote[];
}) {
  if (problems.length === 0 && notes.length === 0) return null;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-[6px] border px-3 py-1.5 text-[11.5px] leading-[1.55]"
      style={{ borderColor: "var(--line)", background: "var(--paper-sunken)", color: "var(--ink-soft)" }}
      data-cursor-notice
    >
      {problems.map((problem) => (
        <span key={`${problem.code}:${problem.key}`} data-cursor-problem={problem.code}>
          {problemLine(problem)}
        </span>
      ))}
      {notes.map((note) => (
        <span key={JSON.stringify(note)} data-cursor-note={note.code}>
          {cursorNoteText(note)}
        </span>
      ))}
    </div>
  );
}

/**
 * The notice placed above a routed screen, on the screen's own column.
 *
 * `frame` is for screens that own their HiFi frame (`data-own-frame`): the
 * shell gutter is gone there, so the notice takes the screen's own max width
 * and 24 px side padding and lines up with its header.
 */
export function RouteCursorNotice({
  problems,
  notes = [],
  frame,
}: {
  problems: readonly (CursorProblem & { value?: string })[];
  notes?: readonly CursorNote[];
  frame?: 1440 | 1560;
}) {
  if (problems.length === 0 && notes.length === 0) return null;
  const column =
    frame === 1560
      ? "mx-auto w-full min-w-0 max-w-[1560px] px-6 pt-4"
      : frame === 1440
        ? "mx-auto w-full min-w-0 max-w-[1440px] px-6 pt-4"
        : "mx-auto w-full min-w-0 max-w-[1280px] px-2 pb-2";
  return (
    <div className={column}>
      <CursorNotice problems={problems} notes={notes} />
    </div>
  );
}
