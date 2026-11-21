/** Validate identical DB JSON once within an in-flight shared read, not by digest. */
import type { ZodType, ZodTypeDef } from "zod";

function freezeJson(value: unknown, seen = new WeakSet<object>()): void {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  for (const child of Object.values(value)) freezeJson(child, seen);
  Object.freeze(value);
}

/** Internal DB snapshot/projection only; never membership/session cache. */
export function freezeReadValue<T>(value: T): T {
  freezeJson(value);
  return value;
}

export function immutableReadJsonParser<T>(schema: ZodType<T, ZodTypeDef, unknown>): (value: unknown) => T | null {
  // Only the exact DB-returned object is a key. New snapshots, strings and
  // equal-looking objects cannot reuse a validation. Weak keys retain no
  // workspace/run history and carry no membership or authorization decision.
  const verified = new WeakMap<object, T | null>();
  return (value) => {
    const shared = value !== null && typeof value === "object" && !Array.isArray(value);
    if (shared && verified.has(value)) return verified.get(value)!;
    let raw = value;
    try { if (typeof raw === "string") raw = JSON.parse(raw) as unknown; }
    catch { return null; }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const result = schema.safeParse(raw);
    const parsed = result.success ? result.data : null;
    if (shared) {
      freezeJson(value);
      freezeJson(parsed);
      verified.set(value, parsed);
    }
    return parsed;
  };
}
