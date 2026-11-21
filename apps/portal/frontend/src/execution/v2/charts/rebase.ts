import { readChartDecimal, subtractDecimal } from "./decimal";
import type { SeriesPoint } from "./types";

/**
 * Rebase a money-like series to zero at its first published value by exact
 * subtraction (`v - first`). Gaps stay gaps. Use it for PnL overlays; a return
 * (a ratio) cannot be rebased exactly on the client and must come rebased from
 * the server (for example Modified Dietz since window start).
 */
export function rebaseToFirst(points: readonly SeriesPoint[]): SeriesPoint[] {
  let base: string | null = null;
  for (const p of points) {
    if (p.v === null) continue;
    const read = readChartDecimal(p.v);
    if (read !== null) {
      base = read;
      break;
    }
  }
  return points.map((p) => {
    if (p.v === null || base === null) return p;
    const read = readChartDecimal(p.v);
    return read === null ? p : { t: p.t, v: subtractDecimal(read, base) };
  });
}
