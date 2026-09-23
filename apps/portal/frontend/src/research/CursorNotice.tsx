/**
 * What the inspection cursor codec refused in the arriving link (RF01-F5).
 *
 * P02 rule 1 makes a duplicate or unsupported key a typed error. A screen that
 * swallowed it would open somewhere the link did not point and never say so;
 * this names each refused key in fixed copy and lets the screen stand.
 */

import { cursorProblemText, type CursorProblem } from "./inspectionCursor";

export function CursorNotice({ problems }: { problems: readonly CursorProblem[] }) {
  if (problems.length === 0) return null;
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
    </div>
  );
}

/** The notice placed above a routed screen, on the screen's own column. */
export function RouteCursorNotice({ problems }: { problems: readonly CursorProblem[] }) {
  if (problems.length === 0) return null;
  return (
    <div className="mx-auto w-full min-w-0 max-w-[1280px] px-2 pb-2">
      <CursorNotice problems={problems} />
    </div>
  );
}
