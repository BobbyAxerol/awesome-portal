/**
 * SectionPanel / PanelHead (hi-fi kit `.panel` and `.ph`).
 *
 * The head is a real heading, so a screen reader can jump panel to panel; the
 * kit's uppercase is dropped (the V2 type roles do not allow it outside the
 * reviewed selectors).
 */
import { createElement, useId, type ReactNode } from "react";

import "../css/blocks.css";

export type PanelHeadLevel = 2 | 3 | 4 | 5;

export interface PanelHeadProps {
  /** Heading text. */
  title: string;
  /** Heading level; default 3. */
  level?: PanelHeadLevel;
  /** Id for `aria-labelledby` on the surrounding panel. */
  id?: string;
  /** Right-hand meta (as-of, count, a link). */
  aside?: ReactNode;
}

/** The panel's title bar. */
export function PanelHead({ title, level = 3, id, aside }: PanelHeadProps) {
  return (
    <header className="exec-blk-ph">
      {createElement(`h${level}`, { id, className: "exec-blk-ph-title" }, title)}
      {aside ? <span className="exec-blk-ph-aside">{aside}</span> : null}
    </header>
  );
}

export interface SectionPanelProps {
  /** Heading text; also the panel's accessible name. */
  title: string;
  level?: PanelHeadLevel;
  /** Right-hand meta in the head. */
  aside?: ReactNode;
  /** Remove the body padding, for a table that runs edge to edge. */
  flush?: boolean;
  children: ReactNode;
}

/** A bordered region with a head. */
export function SectionPanel({ title, level = 3, aside, flush = false, children }: SectionPanelProps) {
  const id = useId();
  return (
    <section className="exec-blk-panel" aria-labelledby={id} data-flush={flush ? "true" : undefined}>
      <PanelHead title={title} level={level} id={id} aside={aside} />
      <div className="exec-blk-panel-body">{children}</div>
    </section>
  );
}
