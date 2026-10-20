/**
 * Test base shared by `managerSeries.test.ts` and `managerSeries.conformance.test.ts` (tests only; not imported by any
 * screen). Every payload is built from the canonical fixtures Codex publishes (`loadCanonical`), never by hand, and is
 * judged against the published JSON Schema through the testkit checker (the lane is FIXTURE_LAB: a fixture is never a
 * source acceptance).
 */
import { canonicalDigest, loadCanonical } from "../testkit/loadCanonical";
import { validateAgainst } from "../testkit/schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Draft = any;

export const SERIES_SCHEMA_FILE = "execution-manager-series.v1.schema.json";

export const FIXTURE_POPULATED = "execution-manager-series.populated.synthetic";
export const FIXTURE_EMPTY = "execution-manager-series.empty.synthetic";
export const FIXTURE_UNAVAILABLE = "execution-manager-series.unavailable.synthetic";
export const FIXTURE_MIXED = "execution-manager-series.currency-mixed.synthetic";
/** The stored form a producer must publish (not a response body) and the published query example. */
export const FIXTURE_PUBLICATION = "execution-manager-series-publication.synthetic";
export const FIXTURE_QUERY = "execution-manager-series-query.synthetic";
export const SERIES_FIXTURES = [FIXTURE_POPULATED, FIXTURE_EMPTY, FIXTURE_UNAVAILABLE, FIXTURE_MIXED] as const;

export const DAY = 86_400_000;
export const clone = <T,>(value: T): T => structuredClone(value);

export function fixtureValue(name: string): Draft {
  return loadCanonical<{ value: Draft }>(name).value;
}

export function fixturesDigest(): string {
  return [...SERIES_FIXTURES, FIXTURE_PUBLICATION, FIXTURE_QUERY].map((name) => canonicalDigest(name)).join(":");
}

/** Violations of the published `portal.execution.manager-series.v1` schema; empty when the body conforms. */
export function seriesViolations(value: unknown): string[] {
  try {
    return validateAgainst(SERIES_SCHEMA_FILE, "", value);
  } catch (error) {
    if (error instanceof TypeError && /BigInt/.test(error.message)) return ["not JSON: a BigInt value"];
    throw error;
  }
}

/** The independent oracle of the comparison (written from the contract text, not from the reader): used to build consistent bodies. */
export function oracleComparison(series: Draft[]): Draft {
  const none = { transform: "NONE_NO_REBASE_NO_CROSS_CURRENCY_SUM", axis_ms: null };
  const described = series.filter((e) => e.state !== "UNAVAILABLE");
  const commonOf = (e: Draft) => ({
    economic_domain: e.partition.economic_domain, native_profile_ref: e.partition.native_profile_ref, currency: e.currency, basis: e.basis, unit: e.unit,
    methodology_ref: e.methodology_ref, window: e.window,
  });
  if (series.length === 1) return { state: "SINGLE_SUBJECT", reason_code: null, ...none, common: described[0] ? commonOf(described[0]) : null };
  const first = described[0];
  if (first) {
    const checks: [string, (e: Draft) => boolean][] = [
      ["CURRENCY_MIXED", (e) => e.currency !== first.currency],
      ["ECONOMIC_PARTITION_MIXED", (e) => e.partition.economic_domain !== first.partition.economic_domain || e.partition.native_profile_ref !== first.partition.native_profile_ref],
      ["BASIS_MIXED", (e) => e.basis !== first.basis],
      ["UNIT_MIXED", (e) => e.unit !== first.unit],
      ["METHODOLOGY_MIXED", (e) => e.methodology_ref !== first.methodology_ref],
      ["WINDOW_MISMATCH", (e) => e.window.from_ms !== first.window.from_ms || e.window.to_ms !== first.window.to_ms],
    ];
    for (const [reason, differs] of checks) if (described.some(differs)) return { state: "INCOMPARABLE", reason_code: reason, ...none, common: null };
  }
  if (series.some((e) => e.state !== "AVAILABLE")) return { state: "UNAVAILABLE", reason_code: "SUBJECT_SERIES_UNAVAILABLE", ...none, common: null };
  const axis = [...new Set(series.flatMap((e) => e.points.map((p: Draft) => p.ts_ms as number)))].sort((a, b) => a - b);
  return { state: "ALIGNED", reason_code: null, transform: none.transform, common: commonOf(first), axis_ms: axis };
}

/** Rebuild `comparison` from the entries (what a consistent producer would send after the test changed an entry). */
export function withComparison(body: Draft): Draft {
  body.comparison = oracleComparison(body.series);
  return body;
}

/** A typed UNAVAILABLE entry for a subject, shaped like the published `unavailable` fixture. */
export function unavailableEntry(subject: Draft, reason = "SERIES_SOURCE_NOT_PUBLISHED"): Draft {
  const template = clone(fixtureValue(FIXTURE_UNAVAILABLE).series[1]);
  return { ...template, subject: clone(subject), reason_code: reason, quality: { ...template.quality, reasons: [reason] } };
}

/** The populated fixture with every derived field consistent after `change` (the comparison is rebuilt). */
export function populated(change: (body: Draft) => void = () => {}): Draft {
  const body = fixtureValue(FIXTURE_POPULATED);
  change(body);
  return withComparison(body);
}
