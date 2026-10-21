/**
 * A sentence with its request ids and reason codes kept out of sight: `Not published (FE-015) · SOME_REASON_CODE` reads as
 * `Not published` on screen, while the id and the code stay in the text for assistive tech and copy (visually hidden) and in
 * the tooltip of the caller. The text content is unchanged, so nothing that reads it changes.
 */
import { Fragment, type ReactNode } from "react";

import { GapWhy } from "./notPublished";

import "../css/blocks.css";

// A request id group `(FE-015)`, `(FE-005, FE-025)`, `(FE-005/006)`, or a ` · UPPER_SNAKE` reason code.
const HIDDEN = /(\s?\((?:[A-Z][A-Z0-9]*-\d+(?:[/, ]+(?:[A-Z][A-Z0-9]*-)?\d+)*)\)|\s·\s[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)/g;

export function QuietIds({ text }: { text: string }): ReactNode {
  const parts = text.split(HIDDEN);
  if (parts.length === 1) return text;
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <span key={index} className="exec-blk-sr">{part}</span>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}

/**
 * `QuietIds` plus the way to reach what it hides (RV-06): the ids and reason codes stay out of the headline, and a "?" after the
 * text opens them by keyboard and touch instead of a `title`. A text with nothing hidden is the plain text (nothing to open).
 * `rows` overrides what the disclosure says; the default is the whole sentence, ids and codes included.
 */
export function QuietIdsWhy({ text, rows, gap }: { text: string; rows?: readonly string[]; gap?: string }): ReactNode {
  const parts = text.split(HIDDEN);
  if (parts.length === 1) return text;
  const shown = parts.filter((_, index) => index % 2 === 0).join("").trim();
  return (
    <>
      <QuietIds text={text} />
      <GapWhy name={`Why: ${shown}`} rows={rows ?? [text]} gap={gap} />
    </>
  );
}
