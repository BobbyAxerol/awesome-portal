import { useState } from "react";

import { shortId } from "./researchFormat";

/**
 * One way to print a server id on every Research screen (E1): short on
 * screen, the full value in the title, click to copy the full value. The
 * `data-full-id` attribute keeps the exact id for tests and for tools.
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
      {shortId(id)}
    </button>
  );
}
