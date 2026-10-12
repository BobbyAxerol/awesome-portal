/**
 * One calm "nothing here" card for governance screens: an icon, a display title, one sentence, optional actions and an optional fold for the longer
 * explanation. Replaces the per-screen stacks of mono lines, codes and ghost frames; the server's own code rides along as a tooltip, never as copy.
 */
import type { ReactNode } from "react";

const ICONS = {
  inbox: <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M4 15h6l1.5 3h5L18 15h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /><path d="M6.5 15 9 6h10l2.5 9v6a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-6Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>,
  doc: <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M8 4h8l5 5v14a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M16 4v5h5M10.5 15h7M10.5 19h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  scale: <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M14 5v18M8 23h12M6 9h16M6 9l-3 7a3 3 0 0 0 6 0L6 9Zm16 0-3 7a3 3 0 0 0 6 0l-3-7Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>,
} as const;

export function QuietEmpty({
  icon = "inbox",
  title,
  line,
  lineTitle,
  actions,
  more,
  label,
  prominent = true,
}: {
  icon?: keyof typeof ICONS;
  title: string;
  line?: string | null;
  /** Evidence, not copy — a code or id shown on hover. */
  lineTitle?: string | null;
  actions?: ReactNode;
  /** The longer explanation, folded. */
  more?: ReactNode;
  label?: string;
  prominent?: boolean;
}) {
  return (
    <section className="exec-qe" aria-label={label} data-prominent-empty={prominent ? "true" : undefined}>
      <span className="exec-qe-icon" aria-hidden="true">{ICONS[icon]}</span>
      <h2 className="exec-qe-title">{title}</h2>
      {line ? <p className="exec-qe-line" title={lineTitle ?? undefined}>{line}</p> : null}
      {actions ? <div className="exec-qe-actions" data-next-step>{actions}</div> : null}
      {more ? <details className="exec-qe-more"><summary>Why?</summary>{more}</details> : null}
    </section>
  );
}
