/**
 * Flag — a status chip whose meaning comes from `kind`, not from its label.
 *
 * Colour is never the only cue: the glyph is a second one and the visible word
 * a third. The glyph is decorative (aria-hidden); when a caller supplies its
 * own label, the kind's announced text is spoken first so "Synced" still
 * reaches a screen reader as "Applied: Synced". Not interactive on purpose, a
 * flag reports state and does not take actions.
 */
import "./css/flag.css";
import { FLAG_KIND_TABLE, type FlagKind } from "./flagKinds";

export interface FlagProps {
  kind: FlagKind;
  /** Defaults to the kind's canonical label. */
  label?: string;
  /** `sm` is for table cells. */
  size?: "sm" | "md";
}

export function Flag({ kind, label, size = "md" }: FlagProps) {
  const spec = FLAG_KIND_TABLE[kind];
  const text = label?.trim() || spec.label;
  const announced = text !== spec.announce && text !== spec.label;
  return (
    <span className="exec-flag" data-k={kind} data-size={size}>
      <span className="exec-flag-glyph" aria-hidden="true">
        {spec.glyph}
      </span>
      {announced ? <span className="exec-flag-sr">{spec.announce}: </span> : null}
      {text}
    </span>
  );
}
