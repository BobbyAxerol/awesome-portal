import { useState } from "react";

import { shortId } from "./researchFormat";
import { useRunLabel } from "./runLabels";

/**
 * One way to print a server id on every Research screen (E1): short on
 * screen, the full value in the title, click to copy the full value. The
 * `data-full-id` attribute keeps the exact id for tests and for tools.
 *
 * D1: when a read has published the server's short run label for this id
 * (`R-WFO-118`), that is what the reader sees — the hi-fi names runs that way
 * in every header, and a 37-character `rrun_` breaks all of them. The label is
 * presentation only: the full id stays in `title`, in `data-full-id`, in the
 * accessible name and is what a click copies, so nothing that identifies the
 * run is lost. An id no read has labelled falls back to the short id rather
 * than to a number this browser made up.
 */
export function ShortId({
  id,
  className,
  label,
}: {
  id: string;
  className?: string;
  label?: string;
}) {
  const displayLabel = useRunLabel(id);
  const [copied, setCopied] = useState(false);
  const copy = () => {
    const clipboard =
      typeof navigator !== "undefined" ? navigator.clipboard : undefined;
    if (!clipboard) return;
    void clipboard.writeText(id).then(
      () => setCopied(true),
      () => undefined,
    );
  };
  return (
    <button
      type="button"
      className={className ? `mono ${className}` : "mono"}
      data-full-id={id}
      data-display-label={displayLabel ?? undefined}
      data-copied={copied || undefined}
      onClick={copy}
      title={copied ? `${id} — copied` : `${id} — click to copy`}
      aria-label={`${label ?? "id"} ${id}, copy`}
      style={{
        border: 0,
        padding: 0,
        background: "transparent",
        color: "inherit",
        fontSize: "inherit",
        fontWeight: "inherit",
        cursor: "copy",
        whiteSpace: "nowrap",
      }}
    >
      {displayLabel ?? shortId(id)}
    </button>
  );
}
