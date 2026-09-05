/**
 * One clock for the whole execution surface — owner decision 2026-08-30.
 *
 * Raw ISO-8601 (`2026-08-22T12:00:20Z`) is machine punctuation, not a
 * timestamp a reviewer reads under time pressure. Every visible instant
 * renders as `datetime64[ms]`: `2026-08-22 12:00:20.000 UTC`.
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

export function utcStamp(iso: string | number | null | undefined): string {
  if (typeof iso === "number") {
    const epoch = readUtcEpochMs(iso);
    return epoch === null ? "—" : formatUtcEpochMs(epoch);
  }
  if (!iso) return "—";
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?(?:\.(\d{1,3})\d*)?(Z)?$/.exec(iso.trim());
  if (!m) return iso;
  const ms = (m[4] ?? "").padEnd(3, "0");
  return `${m[1]} ${m[2]}:${m[3] ?? "00"}.${ms}${m[5] ? " UTC" : ""}`;
}
