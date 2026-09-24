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

import { cursorProblemText, type CursorProblem } from "./inspectionCursor";
import { cursorNoteText, type CursorNote } from "./evidenceCursor";

export function CursorNotice({
  problems,
  notes = [],
}: {
  problems: readonly CursorProblem[];
  notes?: readonly CursorNote[];
}) {
  if (problems.length === 0 && notes.length === 0) return null;
  return (
    <div
      role="status"
      className="flex flex-col gap-0.5 rounded-[6px] border px-3 py-2"
      style={{ borderColor: "var(--line)", background: "var(--paper-sunken)" }}
      data-cursor-notice
    >
      <span className="mono text-[10px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
        link
      </span>
      {problems.map((problem) => (
        <span
          key={`${problem.code}:${problem.key}`}
          className="text-[11.5px] leading-[1.55]"
          style={{ color: "var(--ink-soft)" }}
          data-cursor-problem={problem.code}
        >
          {cursorProblemText(problem)}
        </span>
      ))}
      {notes.map((note) => (
        <span
          key={JSON.stringify(note)}
          className="text-[11.5px] leading-[1.55]"
          style={{ color: "var(--ink-soft)" }}
          data-cursor-note={note.code}
        >
          {cursorNoteText(note)}
        </span>
      ))}
    </div>
  );
}

/** The notice placed above a routed screen, on the screen's own column. */
export function RouteCursorNotice({
  problems,
  notes = [],
}: {
  problems: readonly CursorProblem[];
  notes?: readonly CursorNote[];
}) {
  if (problems.length === 0 && notes.length === 0) return null;
  return (
    <div className="mx-auto w-full min-w-0 max-w-[1280px] px-2 pb-2">
      <CursorNotice problems={problems} notes={notes} />
    </div>
  );
}
