/**
 * The one "more information" mark: a lucide Info glyph, drawn as SVG so it
 * renders the same in every browser and font (a Unicode "ⓘ" or a CSS-drawn
 * "i" did not). It carries no text of its own — the element that owns the
 * tooltip keeps its `title` / accessible name; this is only the visible cue.
 */
import { Info } from "lucide-react";

export function InfoMark({ size = 11 }: { size?: number }) {
  return (
    <Info
      size={size}
      aria-hidden="true"
      data-info-mark
      className="inline-block align-[-1px]"
      style={{ color: "var(--ink-faint)" }}
    />
  );
}
