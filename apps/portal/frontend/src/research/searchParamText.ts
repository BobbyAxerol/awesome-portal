/**
 * Screen 06 — a parameter value as text (QA D4).
 *
 * Optuna serializes floats with their binary noise: `2.4000000000000004`,
 * `0.8999999999999999`. The value is read from the retained ledger as a string
 * and shown to 12 significant digits, which removes the noise without ever
 * rounding a value a researcher chose (no declared step is that fine). The
 * server's exact string stays the digest's truth and rides in `title` where a
 * caller wants it. Integers, categories and anything unparseable pass through.
 */
export function cleanParamText(value: string): string {
  if (!/^-?\d+\.\d{10,}(e[+-]?\d+)?$/i.test(value)) return value;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return value;
  return String(Number(parsed.toPrecision(12)));
}

/** `name=value` pairs of one trial, noise removed. */
export function cleanParameters(parameters: Readonly<Record<string, string>> | undefined): Record<string, string> | undefined {
  if (!parameters) return undefined;
  return Object.fromEntries(Object.entries(parameters).map(([name, value]) => [name, cleanParamText(value)]));
}
