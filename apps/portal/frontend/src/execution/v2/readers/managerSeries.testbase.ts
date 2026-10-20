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
/** FE-013 (BE-P8): a RETURN stated as a FRACTION on both subjects; two subjects on different scales; a return whose source states no scale. */
export const FIXTURE_RETURN = "execution-manager-series.return.synthetic";
export const FIXTURE_RETURN_SCALE_MIXED = "execution-manager-series.return-scale-mixed.synthetic";
export const FIXTURE_RETURN_UNSCALED = "execution-manager-series.return-scale-not-published.synthetic";
export const RETURN_FIXTURES = [FIXTURE_RETURN, FIXTURE_RETURN_SCALE_MIXED, FIXTURE_RETURN_UNSCALED] as const;
/** The stored form of a RETURN (a publication, not a response body). */
export const FIXTURE_PUBLICATION_RETURN = "execution-manager-series-publication.return.synthetic";
/** The metric <-> unit negatives: `cases[].ops` applied to `bases[case.base]`; `stored_cases` apply to a publication. */
export const FIXTURE_METRIC_UNIT = "execution-manager-series.metric-unit.synthetic.negative.json";

export const DAY = 86_400_000;
export const clone = <T,>(value: T): T => structuredClone(value);

export function fixtureValue(name: string): Draft {
  return loadCanonical<{ value: Draft }>(name).value;
}

export function fixturesDigest(): string {
  return [...SERIES_FIXTURES, ...RETURN_FIXTURES, FIXTURE_PUBLICATION, FIXTURE_PUBLICATION_RETURN, FIXTURE_QUERY, FIXTURE_METRIC_UNIT].map((name) => canonicalDigest(name)).join(":");
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
    ratio_scale: e.ratio_scale, methodology_ref: e.methodology_ref, window: e.window,
  });
  if (series.length === 1) return { state: "SINGLE_SUBJECT", reason_code: null, ...none, common: described[0] ? commonOf(described[0]) : null };
  const first = described[0];
  if (first) {
    const checks: [string, (e: Draft) => boolean][] = [
      ["CURRENCY_MIXED", (e) => e.currency !== first.currency],
      ["ECONOMIC_PARTITION_MIXED", (e) => e.partition.economic_domain !== first.partition.economic_domain || e.partition.native_profile_ref !== first.partition.native_profile_ref],
      ["BASIS_MIXED", (e) => e.basis !== first.basis],
      ["UNIT_MIXED", (e) => e.unit !== first.unit],
      ["RATIO_SCALE_MIXED", (e) => e.ratio_scale !== first.ratio_scale],
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

/** One case of the metric <-> unit negative fixture: its body (the case's base with its ops applied) and what the producer said. */
export interface MetricUnitCase { id: string; rule: string; refused_by: string; code: string; body: Draft }

type MetricUnitFile = { bases: Record<string, string>; cases: Draft[]; stored_cases: Draft[] };

function applyOps(body: Draft, ops: Draft[]): Draft {
  for (const op of ops) {
    if (op.op !== "set") throw new Error(`unknown op ${String(op.op)}`);
    const path = op.path as (string | number)[];
    let node = body;
    for (const key of path.slice(0, -1)) node = node[key];
    node[path[path.length - 1]!] = structuredClone(op.value);
  }
  return body;
}

/** The response cases (`stored: false`) or the stored publication cases (`stored: true`), each already applied to a fresh base. */
export function metricUnitCases(stored = false): MetricUnitCase[] {
  const file = loadCanonical<MetricUnitFile>(FIXTURE_METRIC_UNIT);
  return (stored ? file.stored_cases : file.cases).map((c) => ({
    id: c.id, rule: c.rule, refused_by: c.refused_by, code: c.code,
    body: applyOps(loadCanonical<{ value: Draft }>(file.bases[c.base]!).value, c.ops),
  }));
}
