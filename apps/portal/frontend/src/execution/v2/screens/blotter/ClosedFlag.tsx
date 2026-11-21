/**
 * The chip of a closed record (a canceled order or leg): the same chip as `Flag` (its classes and the grey of the `na` kind), with a
 * "no entry" shape and the spoken word "Closed". The shared kind table has no closed kind, and the only one near it, `paused`, draws a
 * pause shape and announces "Paused": a canceled order is not waiting to resume. Local to the Blotter on purpose.
 */
import "../../css/flag.css";

export const CLOSED_GLYPH = "⊘";

export function ClosedFlag({ label, size = "sm" }: { label: string; size?: "sm" | "md" }) {
  return (
    <span className="exec-flag" data-k="na" data-size={size} data-closed="true">
      <span className="exec-flag-glyph" aria-hidden="true">{CLOSED_GLYPH}</span>
      <span className="exec-flag-sr">Closed: </span>
      {label}
    </span>
  );
}
