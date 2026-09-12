/**
 * One clock for the whole execution surface — owner decision 2026-08-30.
 *
 * Raw ISO-8601 (`2026-08-22T12:00:20Z`) is machine punctuation, not a
 * timestamp a reviewer reads under time pressure. Every visible instant
 * renders to the second: `2026-08-22 12:00:20 UTC`.
 *
 * Seconds, not milliseconds — owner decision 2026-09-08, replacing the
 * `datetime64[ms]` form chosen on 08-30. Three trailing digits appeared on
 * every row of every table and were read by nobody; they cost a column of
 * width and pushed the values that are read out of alignment. Where a
 * sub-second instant genuinely matters the exact source string is still
 * carried in the element's title, so nothing is lost, only unprinted.
 *
 * Timezone policy (owner, 2026-08-30): the venue data standard is UTC+0 and
 * the UI never converts to the reader's local offset — with venues across
 * timezones (crypto UTC, Vietnam ICT) a single anchor is the only display
 * that stays comparable across screens. The suffix names the anchor so each
 * reader maps to their venue themselves:
 *   - `...Z` instants render with ` UTC`;
 *   - offset-less instants (venue-local, e.g. the VN session clock) render
 *     with no suffix — inventing a zone label the data does not declare
 *     would be a lie.
 */
import { formatUtcEpochMs, readUtcEpochMs } from "./screenDataContract";

/**
 * A published instant, to the millisecond, as a datetime rather than a wire
 * string.
 *
 * `utcStamp` stops at the second, which is right for an as-of line and wrong
 * for a blotter: two orders 0.27s apart would print the same time. The Blotter
 * was printing the raw ISO instead — `2026-09-11T13:04:52.178632Z`, complete
 * with the `T`, the `Z` and six decimals, wrapped over two lines in an 8rem
 * column. This keeps the precision a reader can use and returns the untouched
 * original for the title, so the microseconds are one hover away rather than
 * gone.
 */
export function utcInstant(iso: string | null | undefined): { display: string; exact: string | null } {
  if (!iso) return { display: "not published", exact: null };
  const raw = iso.trim();
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:?\d{2})?$/.exec(raw);
  if (!m) return { display: raw, exact: null };
  const millis = (m[3] ?? "").padEnd(3, "0").slice(0, 3);
  const zone = m[4] === undefined || m[4] === "Z" ? " UTC" : ` ${m[4]}`;
  const display = `${m[1]} ${m[2]}.${millis}${zone}`;
  // Only worth a title when it actually carries more than the display does.
  return { display, exact: display.replace(" UTC", "Z").replace(" ", "T") === raw ? null : raw };
}

export function utcStamp(iso: string | number | null | undefined): string {
  if (typeof iso === "number") {
    const epoch = readUtcEpochMs(iso);
    return epoch === null ? "not published" : formatUtcEpochMs(epoch);
  }
  // The branch above already says "not published" for the same absence;
  // this one used to say it with a dash.
  if (!iso) return "not published";
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?(?:\.(\d{1,3})\d*)?(Z)?$/.exec(iso.trim());
  if (!m) return iso;
  return `${m[1]} ${m[2]}:${m[3] ?? "00"}${m[5] ? " UTC" : ""}`;
}
