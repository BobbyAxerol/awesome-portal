/**
 * Cells shared by the Alpha 360 tabs: a published decimal, a published instant,
 * an absence. Every digit comes from `formatExact` through the boundary reader;
 * a value the reader refuses (a number, an exponent, `-0`) prints
 * `Not available`, never a guess and never a zero.
 */
import type { ReactNode } from "react";

import type { ExactUnit } from "../../../formatExact";
import { readUtcEpochMs } from "../../../screenDataContract";
import { formatAsOf, readDecimal } from "../../boundary";

export const NOT_AVAILABLE = "Not available";

export function Na({ why }: { why?: string }) {
  return (
    <span className="exec-blk-na">
      {NOT_AVAILABLE}
      {why ? <span className="exec-alp2-why">{why}</span> : null}
    </span>
  );
}

export interface DecProps {
  value: string | null | undefined;
  unit?: ExactUnit;
  /** Decimal places for quantities (the instrument step). */
  dp?: number;
  currency?: string | null;
  /** Prefix `+` on a positive value. */
  signed?: boolean;
  /** Reason printed under `Not available`. */
  why?: string;
}

/** A published exact decimal, or `Not available`. */
export function Dec({ value, unit = "money", dp, currency, signed = false, why }: DecProps): ReactNode {
  if (value === null || value === undefined) return <Na why={why} />;
  const decimal = readDecimal(value, { unit, dp });
  if (decimal === null) return <Na why="Unreadable value" />;
  const plus = signed && decimal.tone === "positive" ? "+" : "";
  return (
    <span className="exec-blk-metric">
      <span className="exec-blk-num" data-tone={signed && decimal.tone !== "neutral" ? decimal.tone : undefined} data-full={decimal.full} title={decimal.full}>
        {plus}
        {decimal.display}
      </span>
      {currency ? <small className="exec-blk-unit"> {currency}</small> : null}
    </span>
  );
}

/** An ISO instant string, printed in the V2 house style, or `Not available`. */
export function At({ iso }: { iso: string | null | undefined }): ReactNode {
  if (iso === null || iso === undefined) return <Na />;
  const ms = Date.parse(iso);
  const at = Number.isNaN(ms) ? null : readUtcEpochMs(ms);
  if (at === null) return <Na why="Unreadable time" />;
  return <time dateTime={new Date(at).toISOString()}>{formatAsOf(at)}</time>;
}
