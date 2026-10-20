/**
 * A sentence with its request ids kept out of sight: `Not published (FE-015). ADMIN-only write.` reads as
 * `Not published. ADMIN-only write.` on screen, while the id stays in the text for assistive tech and copy (visually
 * hidden) and in the tooltip of the caller. The text content is unchanged, so nothing that reads it changes.
 */
import { Fragment, type ReactNode } from "react";

import "../css/blocks.css";

const ID_GROUP = /(\s?\((?:FE-\d+(?:[/, ]+(?:FE-)?\d+)*)\))/g;

export function QuietIds({ text }: { text: string }): ReactNode {
  const parts = text.split(ID_GROUP);
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
