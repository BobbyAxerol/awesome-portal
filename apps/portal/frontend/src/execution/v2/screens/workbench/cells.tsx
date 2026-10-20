/**
 * Cells for the Paper workbench: a published figure, a published instant, an
 * absence. Every digit comes from `formatExact` through the boundary reader.
 * A figure the source did not publish prints `Not available` (the reason is its
 * title); one it published in a shape the reader refuses prints `Not available`
 * with "Unreadable" beside it, because that is a defect, not an absence;
 * neither is ever a zero or a dash.
 */
import type { ReactNode } from "react";

import type { UtcEpochMs } from "../../../screenDataContract";
import { formatAsOf } from "../../boundary";
import type { Figure } from "./model";

export const NOT_AVAILABLE = "Not available";

export function Na({ why, visible = false }: { why?: string | null; visible?: boolean }) {
  return (
    <span className="exec-blk-na" title={why ? why : undefined}>
      {NOT_AVAILABLE}
      {visible && why ? <span className="exec-wb-why">{why}</span> : null}
    </span>
  );
}

export interface FigProps {
  value: Figure;
  currency?: string | null;
  /** Prefix `+` on a positive value and tone it by its published sign (a PnL, not a balance). */
  signed?: boolean;
  /** Reason carried in the title of `Not available` when the source published nothing. */
  why?: string;
}

/** A published figure, or the reason there is none. */
export function Fig({ value, currency, signed = false, why }: FigProps): ReactNode {
  if (value.kind === "absent") return <Na why={why} />;
  if (value.kind === "unreadable") return <Na why="Unreadable value" visible />;
  const { decimal } = value;
  const tone = signed && decimal.tone !== "neutral" ? decimal.tone : undefined;
  return (
    <span className="exec-blk-metric">
      <span className="exec-blk-num" data-tone={tone} data-full={decimal.full} title={decimal.full}>
        {signed && decimal.tone === "positive" ? "+" : ""}
        {decimal.display}
      </span>
      {currency ? <small className="exec-blk-unit"> {currency}</small> : null}
    </span>
  );
}

/** A UTC instant in the V2 house style (`17 Oct 09:14Z`), or `Not available`. */
export function At({ ms, why }: { ms: UtcEpochMs | null; why?: string }): ReactNode {
  if (ms === null) return <Na why={why} />;
  return <time dateTime={new Date(ms).toISOString()}>{formatAsOf(ms)}</time>;
}
