/**
 * The four cells every table on this surface is built from.
 *
 * Before these, each screen decided for itself how to print an instant and a
 * decimal, so the Alpha 360's order table showed
 * `2026-07-28T00:30:06.551061Z` and `0.079000000000000000` beside a workbench
 * that showed `2026-07-28 00:30:06 UTC` and `0.079`. Same two facts, two
 * screens, four spellings.
 *
 * What they hold to:
 *
 *   * **The exact original is never lost.** Every cell carries the source's
 *     own string in its `title`, so the eighteen decimals are one hover away.
 *     Trimming is display; the value is not touched.
 *   * **Absent is never zero.** A missing figure says so in the unverified
 *     ink; a zero is a claim about the world.
 *   * **Numbers are tabular and right-aligned**, so a column reads as a
 *     column and two figures of different length still line up on the point.
 */
import { formatExact, type ExactUnit } from "../formatExact";
import { utcStamp } from "../time";

/** An instant, to the second, in UTC — the one clock the surface uses. */
export function Stamp({ at, absent = "not published" }: { at: string | number | null | undefined; absent?: string }) {
  if (at === null || at === undefined || at === "") {
    return <span className="exec-gate-unverified">{absent}</span>;
  }
  const shown = utcStamp(at);
  return <span className="exec-num" title={String(at)}>{shown}</span>;
}

/**
 * A published figure, in the display scale of its class.
 *
 * The source hands these over as exact decimal strings and some carry eighteen
 * places, tail float noise included — Alpha 360 was printing
 * `16436.209421702120000063 USDT`. Rendering that verbatim is not extra
 * honesty: it claims a precision the source does not have, and it costs the
 * reader the magnitude, which is what they opened the screen for. `formatExact`
 * rounds half-up on the string and never in float, refuses to show a non-zero
 * as zero, and the exact original stays one hover away in `title`.
 *
 * Exported because three screens had each grown their own copy that printed
 * the raw string.
 */
export function Num({ value, unit = "money", absent = "not available", dp }: { value: string | null | undefined; unit?: ExactUnit; absent?: string; dp?: number }) {
  if (value === null || value === undefined || value === "") {
    // Never a zero. On a screen of money a zero is a claim of no money, which
    // is the opposite of not knowing.
    return <span className="exec-gate-unverified">{absent}</span>;
  }
  const shown = formatExact(value, unit, dp === undefined ? undefined : { dp });
  return <span className="exec-num" title={shown.full === shown.display ? undefined : shown.full}>{shown.display}</span>;
}

/**
 * A value that is published as text, not as a quantity — a timestamp already
 * rendered by its source, an identifier — with the same absent branch. It must
 * never be grouped or rounded, which is why it does not go through `Num`.
 */
export function Published({ value, absent = "not published" }: { value: string | null | undefined; absent?: string }) {
  if (value === null || value === undefined || value === "") {
    return <span className="exec-gate-unverified">{absent}</span>;
  }
  return <span className="exec-num">{value}</span>;
}

const Exact = Num;

/** A capital figure: grouped, two decimals minimum, eight at most. */
export function Money({ value, absent = "not published", currency }: { value: string | null | undefined; absent?: string; currency?: string | null }) {
  return (
    <>
      <Exact value={value} unit="money" absent={absent} />
      {value && currency ? <span className="exec-cell-ccy"> {currency}</span> : null}
    </>
  );
}

/** An instrument quantity: the value's own scale, capped at eight places. */
export function Qty({ value, absent = "not published", dp }: { value: string | null | undefined; absent?: string; dp?: number }) {
  return <Exact value={value} unit="qty" absent={absent} dp={dp} />;
}

/** A ratio or rate, two to four places. */
export function Ratio({ value, absent = "not published" }: { value: string | null | undefined; absent?: string }) {
  return <Exact value={value} unit="ratio" absent={absent} />;
}

/** A whole count. Zero is a real count and is printed. */
export function Count({ value, absent = "not counted" }: { value: number | string | null | undefined; absent?: string }) {
  if (value === null || value === undefined || value === "") {
    return <span className="exec-gate-unverified">{absent}</span>;
  }
  return <Exact value={String(value)} unit="count" absent={absent} />;
}
