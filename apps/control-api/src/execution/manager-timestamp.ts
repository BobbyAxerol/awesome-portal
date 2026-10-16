import { parseLegacyUtcMilliseconds } from "../execution-v2/foundation.contract";

/** Manager emits explicit-zone ISO instants (Python commonly uses six digits).
 * Public clocks are UTC milliseconds; identity must not merge distinct source
 * keys within a millisecond. Canonicalize before hashing, never expose this
 * preimage or mistake timestamp precision for event ordering. */
export function managerTimestamp(value: unknown): { milliseconds: number; identity: string } | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$(?![\s\S])/.exec(value);
  if (!match) return null;
  const fraction = (match[2] ?? "").padEnd(9, "0");
  try {
    const milliseconds = parseLegacyUtcMilliseconds(`${match[1]}.${fraction.slice(0, 3)}${match[3]}`);
    const subMilliseconds = fraction.slice(3);
    // Retain existing IDs for exact-ms keys. Equivalent offsets and fractional
    // spellings have one identity; micro/nanosecond distinctions survive.
    return { milliseconds, identity: subMilliseconds === "000000" ? String(milliseconds) : `${milliseconds}:${subMilliseconds}` };
  } catch {
    return null;
  }
}
