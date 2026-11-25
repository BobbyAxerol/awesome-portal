/**
 * Reader conformance for `managerDataset.ts` / `managerMetric.ts` (Rules 9.8.3, tiers L0 to L3).
 *
 * Contract: `packages/contracts/openapi/execution-manager-models.openapi.json`, `ManagerDataset` and `ManagerMetric`;
 * fixtures `execution-manager-dataset.{synthetic,rows.synthetic,all-window.synthetic}` and
 * `execution-manager-metric.derived-reasons.synthetic`. Every payload below is built from those fixtures
 * (`managerDataset.testbase.ts`), never written by hand.
 *
 * L0  the four fixtures verbatim: they validate against the published schema AND are read; the digest of every file
 *     is unchanged at the end. The other `execution-manager-*` families (score revision, score history, scoped,
 *     realtime) are other contracts: every body in them reads as the typed `unsupported_shape`, never a dataset.
 * L1  state matrices against an oracle written from the header contract (managerDataset.ts, managerMetric.ts):
 *       M1  metric: availability x value x reason_code x methodology_ref x unit/currency (cartesian 192; pairwise)
 *       M2  metric caveats: completeness x freshness x source_confidence x methodology_ref
 *       P   economic partitions: layout x metric currency x headline (no cross-currency total)
 *       W   selected_window x score slot x slot reason x scores.reason_code (ALL is a gap, never a window)
 *       Q   query_options: one metric key at a time, sort x metric_keys x partition-required x window x row metrics
 *       S   query_options: search fields x modes x sortable name
 *       G   page and cursor envelope: limit x filtered count x returned count x next x previous
 *     The metric and window matrices agree with the schema exactly (reader accepts iff the schema does); P and G
 *     contain reader-only rules and report how many schema-valid states the reader refuses.
 * L2  200 rows, keyset pages with cursors, 200 groups, 200 partitions, ~1 MiB of fat metrics, 70,000-character text,
 *     and the bounds (children, metrics per partition, reasons, groups).
 * L3  generated negatives (the testkit generators over a rich base): every case is refused or the typed
 *     `unsupported_shape`, never throws, never leaks its probe, and the reader is judged against the published
 *     schema (testkit validateAgainst on a copy without `propertyNames`/`discriminator`):
 *       - reader never accepts what the schema refuses (counted; one named exception, MD-L1, is not generated);
 *       - where the reader is stricter than the schema it is on purpose, the group is named and counted:
 *           MD-S1  display safety of every text (whitespace-only, bidi, zero-width, C1)
 *           MD-S2  (retired) negative zero is now refused by the schema itself (MD-5 option C), so it is no longer stricter-than-schema
 *           MD-S3  a window is not backwards (from_ms > to_ms)
 *           MD-S4  partition metric key is a lower-case token; at most 64 metrics per partition
 *           MD-S5  a row-level money figure that names a currency IS one partition's figure (identity, BE-P1 MD-8; replaced "same currency as every partition", which refused a pinned-partition body)
 *           MD-S6  a partition appears once (identity = domain, currency, basis, native profile; proof ref is evidence); a metric's currency is its partition's
 *           MD-S7  page: returned == rows <= limit, <= filtered; a NON-EMPTY page with no cursor either way is the whole result (empty past-the-end page exempt); cursor text
 *           MD-S8  at most 10,000 children in a body (a 1 MiB body cannot hold more)
 *           (MD-S9, a preset the source does not publish carries no window, is a SCHEMA rule since BE-P1 and left this list)
 *           MD-S10 a row appears once; a stage set has no repeats
 *           MD-S11 group key: a groupable field, once; group appears once; unique_row_count <= filtered count
 *           MD-S12 clocks stay inside the Date range (schema: up to 2^53-1)
 *           MD-S13 lifecycle arithmetic (BE-P4): days_in_stage == floor((as_of - entered_at_ms)/day), entered_at_ms <= as_of_ms when days exist, an entry time needs a published current_stage
 *       - one group is LOOSER on purpose: MD-L1, `score_details` / `composition_details` / `regime_details` are
 *         accepted as bounded arrays of objects naming their slot and COUNTED, never read (other families);
 *       - MD-1 .. MD-8 (BE-P1): the server now refuses to emit a body that breaks them; the schema says what JSON Schema
 *         can (MD-3 exact repeat, MD-4, MD-7 field enum + a field once in a key, MD-6 exact repeat, MD-1 empty page) and
 *         those are normal `it`; what it cannot say stays `it.fails` (MD-1, MD-2, MD-6 row_key, MD-7 count, MD-8) and
 *         MD-5 (negative zero): owner decision C (2026-10-20): canonical zero on emit; the response schema refuses -0.
 */
import { afterAll, describe, expect, it } from "vitest";

import { listCanonical, loadCanonical } from "../testkit/loadCanonical";
import { cartesian, coverage, describeCoverage, dimension, dimensionOf, getPath, pairwise, setPath } from "../testkit/matrix";
import {
  arrayCases, decimalCases, enumCases, integerCases, leaked, pollutionCases, prototypeIsClean, requiredCases, rootCases, schemaVersionCases, stringCases,
} from "../testkit/negative";
import { cloneRows, fillToBytes, MIB, pad, serializedBytes, splitIntoPages, timed, cursorFilter } from "../testkit/scale";
import {
  ALL_HISTORY_WINDOW_NOT_PUBLISHED,
  EXACT_METRIC_WINDOW_NOT_PUBLISHED,
  MANAGER_DATASET_SCHEMA,
  MANAGER_ENVIRONMENTS,
  MANAGER_GROUP_FIELDS,
  MANAGER_METRIC_KEYS,
  MANAGER_PARTITIONED_METRIC_KEYS,
  MANAGER_INDEPENDENT_WINDOW_KEYS,
  MANAGER_SORT_FIELDS,
  MANAGER_STAGES,
  MANAGER_SURFACES,
  MAX_CHILDREN_PER_ROW,
  MAX_CHILDREN_TOTAL,
  MAX_CURSOR,
  MAX_DATASET_REASONS,
  MAX_FILTERED_COUNT,
  MAX_GROUPS,
  MAX_ITEMS,
  readManagerDataset,
  type ManagerDataset,
} from "./managerDataset";
import {
  absentMetric,
  clone,
  DATASET_FIXTURES,
  datasetViolations,
  FIXTURE_ALL,
  FIXTURE_EMPTY,
  FIXTURE_INVARIANT_CASES,
  FIXTURE_LIFECYCLE_LIVE,
  FIXTURE_PARTITIONS,
  FIXTURE_METRIC,
  FIXTURE_ROWS,
  fixtureValue,
  fixturesDigest,
  metricViolations,
  moneyMetric,
  partition,
  richDataset,
  type Draft,
} from "./managerDataset.testbase";
import {
  MANAGER_AVAILABILITIES,
  MANAGER_COMPLETENESS,
  MANAGER_ECONOMIC_DOMAINS,
  MANAGER_FRESHNESS,
  MANAGER_SOURCE_CONFIDENCE,
  MAX_METRIC_REASONS,
  MAX_PARTITION_METRICS,
  MAX_PARTITIONS,
  MAX_PROVENANCE_REFS,
  readManagerMetric,
} from "./managerMetric";

/* ── budgets (stated, generous: the suite shares a machine with other lanes) ── */
const BUDGET_200_ROWS_MS = 400;
const BUDGET_1_MIB_MS = 1500;
const BUDGET_PAGES_MS = 600;

const digestBefore = fixturesDigest();
afterAll(() => {
  expect(fixturesDigest()).toBe(digestBefore);
});

const RICH: Draft = richDataset();

function datasetOf(raw: unknown): ManagerDataset | null {
  const read = readManagerDataset(raw);
  return read !== null && read.kind === "dataset" ? read.dataset : null;
}
const metricOf = (raw: unknown) => readManagerMetric(raw);

/** Reader and schema judge one payload; the pair is what the counts below group. */
const judge = (value: unknown) => ({ invalid: datasetViolations(value).length > 0, accepted: datasetOf(value) !== null });

/* ═════════════════════════ L0 ═════════════════════════ */
describe("L0 · canonical, verbatim", () => {
  it("the dataset fixtures are the synthetic lane, validate against the published schema, and are read", () => {
    for (const name of DATASET_FIXTURES) {
      const file = loadCanonical<{ lane: string; value: Draft }>(name);
      expect(file.lane, name).toMatch(/TEST_ONLY/);
      expect(file.value.schema_version, name).toBe(MANAGER_DATASET_SCHEMA);
      expect(datasetViolations(file.value), name).toEqual([]);
      expect(datasetOf(file.value), name).not.toBeNull();
    }
  });

  it("the metric fixture validates against ManagerMetric and is read: PARTIAL with no figure is an absence", () => {
    const metric = fixtureValue(FIXTURE_METRIC);
    expect(metricViolations(metric)).toEqual([]);
    const read = metricOf(metric)!;
    expect(read.kind).toBe("absent");
    expect(read.availability).toBe("PARTIAL");
    expect("exact" in read).toBe(false);
  });

  it("the fixture facts: which surface, environment, window and rows each one publishes", () => {
    const empty = datasetOf(fixtureValue(FIXTURE_EMPTY))!;
    const rows = datasetOf(fixtureValue(FIXTURE_ROWS))!;
    const all = datasetOf(fixtureValue(FIXTURE_ALL))!;
    expect([empty, rows, all].map((d) => [d.surface, d.environment, d.items.length, d.selectedWindow?.kind ?? null])).toEqual([
      ["FLEET", "paper", 0, null], ["FLEET", "paper", 1, null], ["FLEET", "paper", 1, "gap"],
    ]);
    // None of them has groups or capital statements: those shapes are exercised by the rich base below.
    expect([empty, rows, all].map((d) => [d.groups.length, d.capitalStatements.length])).toEqual([[0, 0], [0, 0], [0, 0]]);
  });

  it("G3: the profile-selection fixture holds real dataset bodies (not another contract): each satisfies the published schema, reads as a dataset and states its profile", () => {
    const cases = loadCanonical<{ cases: { query: { profile_id: string }; response: Draft }[] }>("execution-manager-profile-selection.synthetic.valid.json").cases;
    expect(cases.length).toBeGreaterThanOrEqual(2);
    for (const c of cases) {
      expect(datasetViolations(c.response)).toEqual([]);
      const read = readManagerDataset(c.response);
      expect(read !== null && read.kind === "dataset" && read.dataset.profileId).toBe(c.query.profile_id);
    }
  });

  it("every other execution-manager-* family is another contract: its bodies read as unsupported_shape", () => {
    const others = listCanonical().filter((file) => file.startsWith("execution-manager-") && !DATASET_FIXTURES.some((d) => file.startsWith(`${d}.`)) && !file.startsWith(`${FIXTURE_METRIC}.`) && !file.startsWith("execution-manager-profile-selection."));
    expect(others.length).toBeGreaterThanOrEqual(15);
    const versions = new Map<string, number>();
    const walk = (node: unknown, file: string): void => {
      if (Array.isArray(node)) node.forEach((item) => walk(item, file));
      else if (typeof node === "object" && node !== null) {
        const body = node as Draft;
        if (typeof body.schema_version === "string") {
          versions.set(body.schema_version, (versions.get(body.schema_version) ?? 0) + 1);
          expect(readManagerDataset(body), `${file} ${body.schema_version}`).toEqual({ kind: "unsupported_shape", schemaVersion: body.schema_version });
        } else for (const child of Object.values(body)) walk(child, file);
      }
    };
    for (const file of others) walk(loadCanonical(file), file);
    // Not covered by this reader: score revision view, score history, scoped records, realtime snapshot, series (managerSeries.ts).
    expect([...versions.keys()].sort()).toEqual([
      "execution.manager-realtime-snapshot.v2", "portal.execution.manager-scoped.v1", "portal.execution.manager-score-history.v1", "portal.execution.manager-score-revision.v1",
      "portal.execution.manager-series.v1",
    ]);
  });

  it("the closed words the reader holds are the ones the schema publishes", () => {
    const empty = fixtureValue(FIXTURE_ROWS);
    expect(MANAGER_SURFACES).toContain(empty.surface);
    expect(MANAGER_ENVIRONMENTS).toContain(empty.environment);
    expect([...MANAGER_AVAILABILITIES]).toEqual(["AVAILABLE", "PARTIAL", "UNAVAILABLE", "NOT_APPLICABLE"]);
    expect([...MANAGER_ECONOMIC_DOMAINS]).toEqual(["ACTUAL", "PAPER", "SANDBOX"]);
    expect([...MANAGER_STAGES]).toEqual(["PAPER", "SANDBOX", "CANARY", "LIVE"]);
    expect(empty.query_options.metric_keys.every((key: string) => (MANAGER_METRIC_KEYS as readonly string[]).includes(key))).toBe(true);
    expect(empty.query_options.sort_fields.every((key: string) => (MANAGER_SORT_FIELDS as readonly string[]).includes(key))).toBe(true);
    expect(empty.query_options.group_fields.every((key: string) => (MANAGER_GROUP_FIELDS as readonly string[]).includes(key))).toBe(true);
  });

  it("the rich base built from the rows fixture is schema-valid and read, two currencies kept apart", () => {
    expect(datasetViolations(RICH)).toEqual([]);
    const dataset = datasetOf(RICH)!;
    expect(dataset.items).toHaveLength(2);
    expect(dataset.groups).toHaveLength(1);
    expect(dataset.capitalStatements.map((s) => s.partition.currency)).toEqual(["USDT", "EUR"]);
  });
});

/* ═════════════════════════ L1 ═════════════════════════ */
describe("L1 · matrix M1 · metric: availability x value x reason x methodology x unit", () => {
  const BASE = moneyMetric();
  const UNITS: [string, string, string | null][] = [["MONEY/USDT", "MONEY", "USDT"], ["MONEY/null", "MONEY", null], ["SCORE/null", "SCORE", null], ["SCORE/USDT", "SCORE", "USDT"]];
  const DIMS = [
    dimension("availability", ["availability"], [...MANAGER_AVAILABILITIES]),
    dimension("value", ["value"], [null, "7.5", "0"]),
    dimension("reason_code", ["reason_code"], [null, "WHY"]),
    dimension("methodology_ref", ["methodology_ref"], [null, "M1"]),
    dimensionOf("unit", UNITS.map(([label, unit, currency]) => ({ label, apply: (d: Draft) => { d.unit = unit; d.currency = currency; } }))),
  ];
  const states = cartesian(BASE, DIMS);
  const accept = (p: Record<string, string>) => (p.availability === "AVAILABLE" ? p.value !== "null" : p.value === "null" && p.reason_code !== "null") && p.unit !== "MONEY/null";

  it("prints the matrix size", () => {
    console.info(describeCoverage("manager M1 (metric) cartesian", coverage(DIMS, states)));
    expect(states).toHaveLength(4 * 3 * 2 * 2 * 4);
    expect(states.filter((s) => accept(s.picks))).toHaveLength(
      // AVAILABLE: 2 values x 2 reasons x 2 methodologies x 3 units; other: null value x reason WHY x 2 x 3 units x 3 availabilities.
      2 * 2 * 2 * 3 + 3 * 1 * 2 * 3,
    );
  });

  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, state) => {
    const read = metricOf(state.value);
    expect(read !== null).toBe(accept(state.picks));
    // Reader and schema agree exactly on the metric envelope.
    expect(metricViolations(state.value).length === 0).toBe(accept(state.picks));
    if (read === null) return;
    expect(read.availability).toBe(state.picks.availability);
    expect(read.reasonCode).toBe(state.value.reason_code);
    expect(read.methodologyRef).toBe(state.value.methodology_ref);
    expect(read.currency).toBe(state.value.currency);
    if (read.availability === "AVAILABLE") {
      // The value is the source's string, untouched; zero is a value, not an absence.
      expect(read.kind).toBe("value");
      if (read.kind === "value") {
        expect(read.exact).toBe(state.value.value);
        expect(read.zero).toBe(state.value.value === "0");
        expect(read.caveats.includes("NO_METHODOLOGY")).toBe(state.value.methodology_ref === null);
      }
    } else {
      // Anything else is an absence with its reason in the copy; no value key exists to print.
      expect(read.kind).toBe("absent");
      expect("exact" in read).toBe(false);
      if (read.kind === "absent") expect(read.copy.endsWith(` · ${state.value.reason_code}`)).toBe(true);
    }
  });

  it("pairwise subset of the same axes meets every pair in fewer states", () => {
    const pairs = pairwise(BASE, DIMS, { exclude: (p) => !accept(p) });
    const cover = coverage(DIMS, pairs, { exclude: (p) => !accept(p) });
    console.info(describeCoverage("manager M1 (metric) pairwise over valid states", cover));
    expect(cover.pairsCovered).toBe(cover.pairsPossible);
    expect(pairs.length).toBeLessThan(states.filter((s) => accept(s.picks)).length);
    for (const pair of pairs) expect(metricOf(pair.value)).not.toBeNull();
  });
});

describe("L1 · matrix M2 · caveats restate the published quality, never improve it", () => {
  const DIMS = [
    dimension("completeness", ["quality", "completeness"], [...MANAGER_COMPLETENESS]),
    dimension("freshness", ["quality", "freshness"], [...MANAGER_FRESHNESS]),
    dimension("source_confidence", ["source_confidence"], [...MANAGER_SOURCE_CONFIDENCE]),
    dimension("methodology_ref", ["methodology_ref"], [null, "M1"]),
  ];
  const states = cartesian(moneyMetric({ value: "5" }), DIMS);
  it("prints the matrix size", () => {
    console.info(describeCoverage("manager M2 (caveats) cartesian", coverage(DIMS, states)));
    expect(states).toHaveLength(3 * 3 * 3 * 2);
  });
  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, state) => {
    const read = metricOf(state.value)!;
    expect(metricViolations(state.value)).toEqual([]);
    expect(read.kind).toBe("value");
    if (read.kind !== "value") return;
    const want = [
      ...(state.picks.methodology_ref === "null" ? ["NO_METHODOLOGY"] : []),
      ...(state.picks.completeness !== "COMPLETE" ? ["INCOMPLETE"] : []),
      ...(state.picks.freshness !== "FRESH" ? ["NOT_FRESH"] : []),
      ...(state.picks.source_confidence !== "VERIFIED" ? ["NOT_VERIFIED"] : []),
    ];
    expect(read.caveats).toEqual(want);
    // Unknown is never ok: only COMPLETE + FRESH + VERIFIED + a methodology has no caveat.
    expect(read.caveats.length === 0).toBe(state.picks.completeness === "COMPLETE" && state.picks.freshness === "FRESH" && state.picks.source_confidence === "VERIFIED" && state.picks.methodology_ref !== "null");
  });
});

describe("L1 · matrix P · economic partitions: layout x metric currency x headline (no cross-currency total)", () => {
  const LAYOUTS: Record<string, [string, string][]> = {
    none: [],
    usdt: [["USDT", "a"]],
    "usdt+eur": [["USDT", "a"], ["EUR", "b"]],
    "usdt+usdt2": [["USDT", "a"], ["USDT", "b"]],
    "usdt twice": [["USDT", "a"], ["USDT", "a"]],
  };
  const INSIDE = ["own currency", "foreign currency", "no currency"] as const;
  // MD-8 (BE-P1): a headline that names a currency IS one partition's figure. "copy" is that figure; "own figure" is a number
  // above the partitions that no partition publishes (a total, a pin that never happened): refused.
  const HEADLINE = ["absent", "copy of first partition", "copy of last partition", "own figure USDT 42.5"] as const;
  const DIMS = [
    dimensionOf("layout", Object.entries(LAYOUTS).map(([label, parts]) => ({ label, apply: (d: Draft) => { d.layout = parts; } }))),
    dimensionOf("inside", INSIDE.map((label) => ({ label, apply: (d: Draft) => { d.inside = label; } }))),
    dimensionOf("headline", HEADLINE.map((label) => ({ label, apply: (d: Draft) => { d.headline = label; } }))),
  ];
  const build = (spec: Draft): Draft => {
    const body = clone(RICH);
    const row = body.items[1];
    row.economic_partitions = (spec.layout as [string, string][]).map(([currency, tag]) => {
      const metric = spec.inside === "own currency" ? moneyMetric({ currency }) : spec.inside === "foreign currency" ? moneyMetric({ currency: "GBP" }) : absentMetric();
      return { partition: partition("PAPER", currency, tag), metrics: { net_pnl: metric } };
    });
    const parts = row.economic_partitions as Draft[];
    const own = moneyMetric({ currency: "USDT", value: "42.5" });
    row.metrics.net_pnl = spec.headline === "absent" ? absentMetric()
      : spec.headline === "copy of first partition" ? clone(parts[0]?.metrics.net_pnl ?? own)
      : spec.headline === "copy of last partition" ? clone(parts[parts.length - 1]?.metrics.net_pnl ?? own)
      : own;
    return body;
  };
  const states = cartesian({} as Draft, DIMS).map((s) => ({ ...s, value: build(s.value) }));
  const accept = (p: Record<string, string>) => {
    if (p.layout === "usdt twice") return false; // the same partition twice
    const parts = LAYOUTS[p.layout]!;
    if (p.inside === "foreign currency" && parts.length > 0) return false; // a GBP figure in a USDT/EUR partition
    if (p.headline === "absent") return true;
    if (p.headline === "own figure USDT 42.5") return false; // a money figure no partition publishes
    return parts.length > 0; // a copy needs a partition to copy; with none, the stand-in is an own figure
  };

  it("prints the matrix size", () => {
    console.info(describeCoverage("manager P (partitions) cartesian", coverage(DIMS, states)));
    expect(states).toHaveLength(5 * 3 * 4);
  });

  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, state) => {
    const read = datasetOf(state.value);
    expect(read !== null).toBe(accept(state.picks));
    // The schema refuses the one layout that repeats a partition object (uniqueItems, MD-3 closed by BE-P1); every other
    // state is schema-valid, and the rules that still refuse some of them are the reader's (counted below: MD-2, MD-8).
    if (state.picks.layout === "usdt twice") expect(datasetViolations(state.value)).not.toEqual([]);
    else expect(datasetViolations(state.value)).toEqual([]);
    if (read === null) return;
    const row = read.items[1]!;
    // The partitions come back in published order and separate; there is nothing to total.
    expect(row.economicPartitions.map((p) => p.partition.currency)).toEqual(LAYOUTS[state.picks.layout]!.map(([currency]) => currency));
    // A headline that names a currency is exactly one partition's figure (a pinned partition above another currency is fine).
    const headline = row.metrics.net_pnl!;
    if (headline.currency !== null) expect(row.economicPartitions.some((p) => JSON.stringify(p.metrics.get("net_pnl")) === JSON.stringify(headline))).toBe(true);
  });

  it("counts: the reader refuses these schema-valid states on purpose (MD-S5 headline identity, MD-S6 partition rules)", () => {
    const refused = states.filter((s) => !accept(s.picks));
    const valid = states.filter((s) => datasetViolations(s.value).length === 0);
    const refusedBySchemaToo = refused.filter((s) => datasetViolations(s.value).length > 0);
    const repeated = states.filter((s) => s.picks.layout === "usdt twice");
    console.info(`manager P: ${states.length} states, schema accepts ${valid.length}, reader refuses ${refused.length} (${refused.length - refusedBySchemaToo.length} of them schema-valid)`);
    // Only the repeated partition object is a schema refusal; the reader refuses it as well.
    expect(valid).toHaveLength(states.length - repeated.length);
    expect(refusedBySchemaToo.every((s) => s.picks.layout === "usdt twice")).toBe(true);
    expect(refused.every((s) => datasetOf(s.value) === null)).toBe(true);
    expect(refused.length).toBe(states.length - states.filter((s) => accept(s.picks)).length);
  });

  it("a pinned partition: the headline is the USDT figure while the row still lists its EUR partition (the case the old MD-S5 refused)", () => {
    const body = clone(RICH);
    const row = body.items[1];
    row.metrics.net_pnl = clone(row.economic_partitions[0].metrics.net_pnl);
    expect(datasetViolations(body)).toEqual([]);
    const read = datasetOf(body)!;
    expect(read.items[1]!.economicPartitions.map((p) => p.partition.currency)).toEqual(["USDT", "EUR"]);
    expect(read.items[1]!.metrics.net_pnl).toMatchObject({ kind: "value", currency: "USDT", exact: "100.25" });
    // One digit off the partition's figure is a figure no partition publishes: refused, not rounded into place.
    row.metrics.net_pnl.value = "100.26";
    expect(datasetViolations(body)).toEqual([]);
    expect(datasetOf(body)).toBeNull();
  });

  it("pairwise subset of the same axes meets every pair in fewer states", () => {
    const pairs = pairwise({} as Draft, DIMS).map((s) => ({ ...s, value: build(s.value) }));
    const cover = coverage(DIMS, pairs);
    console.info(describeCoverage("manager P (partitions) pairwise", cover));
    expect(cover.pairsCovered).toBe(cover.pairsPossible);
    expect(pairs.length).toBeLessThan(states.length);
  });
});

describe("L1 · matrix W · selected_window x score slot x reasons (ALL is a gap, never a window)", () => {
  const SW: Record<string, Draft> = {
    null: null,
    "7D": { requested: "7D", resolved: { from_ms: 100, to_ms: 200 }, selection_basis: "EXACT_PUBLISHED_METRIC_WINDOW_ONLY", reason_code: null },
    custom: { requested: { from_ms: 100, to_ms: 200 }, resolved: { from_ms: 100, to_ms: 200 }, selection_basis: "EXACT_PUBLISHED_METRIC_WINDOW_ONLY", reason_code: null },
    ALL: { requested: "ALL", resolved: null, selection_basis: "EXACT_PUBLISHED_METRIC_WINDOW_ONLY", reason_code: ALL_HISTORY_WINDOW_NOT_PUBLISHED },
  };
  const RAW = ["pending", "available", "window_not_published matching", "window_not_published crossed"] as const;
  const REASONS = ["RUNTIME_SCORE_POLICY_AND_SOURCE_NOT_QUALIFIED", "QUALIFIED_PRECOMPUTED_SCORE", EXACT_METRIC_WINDOW_NOT_PUBLISHED, ALL_HISTORY_WINDOW_NOT_PUBLISHED];
  const expectedReason = (d: Draft) => (d.selected_window?.requested === "ALL" ? ALL_HISTORY_WINDOW_NOT_PUBLISHED : EXACT_METRIC_WINDOW_NOT_PUBLISHED);
  const crossed = (d: Draft) => (expectedReason(d) === ALL_HISTORY_WINDOW_NOT_PUBLISHED ? EXACT_METRIC_WINDOW_NOT_PUBLISHED : ALL_HISTORY_WINDOW_NOT_PUBLISHED);
  const DIMS = [
    dimensionOf("selected_window", Object.entries(SW).map(([label, value]) => ({ label, apply: (d: Draft) => { d.selected_window = clone(value); } }))),
    dimensionOf("raw", RAW.map((label) => ({
      label,
      apply: (d: Draft) => {
        if (label === "pending") d.scores.raw = { value: null, status: "policy_pending" };
        else if (label === "available") d.scores.raw = { value: "7.5", status: "available" };
        else d.scores.raw = { value: null, status: "window_not_published", reason_code: label.endsWith("matching") ? expectedReason(d) : crossed(d) };
      },
    }))),
    dimension("scores.reason_code", ["scores", "reason_code"], REASONS),
  ];
  const states = cartesian(RICH, DIMS);
  const accept = (p: Record<string, string>) => {
    const wnp = p.raw.startsWith("window_not_published");
    const windowReason = p["scores.reason_code"] === EXACT_METRIC_WINDOW_NOT_PUBLISHED || p["scores.reason_code"] === ALL_HISTORY_WINDOW_NOT_PUBLISHED;
    // One slot without its window: it needs a selected window and the matching slot reason, and scores.reason_code is
    // NOT a window reason (that is for all three slots, see the next test).
    if (wnp) return p.selected_window !== "null" && p.raw.endsWith("matching") && !windowReason;
    return !windowReason;
  };

  it("prints the matrix size", () => {
    console.info(describeCoverage("manager W (window) cartesian", coverage(DIMS, states)));
    expect(states).toHaveLength(4 * 4 * 4);
  });

  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, state) => {
    const read = datasetOf(state.value);
    expect(read !== null).toBe(accept(state.picks));
    // Reader and schema agree exactly on the window rules.
    expect(datasetViolations(state.value).length === 0).toBe(accept(state.picks));
    if (read === null) return;
    if (state.picks.selected_window === "ALL") {
      // ALL is a gap: there is no `resolved`, `fromMs` or `toMs` anywhere to draw.
      expect(read.selectedWindow).toEqual({ kind: "gap", requested: "ALL", reasonCode: ALL_HISTORY_WINDOW_NOT_PUBLISHED });
    } else if (state.picks.selected_window === "null") {
      expect(read.selectedWindow).toBeNull();
    } else {
      expect(read.selectedWindow!.kind).toBe("window");
    }
    expect(read.scores.raw.kind).toBe(state.picks.raw === "available" ? "value" : "absent");
  });

  it("all three slots window_not_published: scores.reason_code is exactly the window's reason", () => {
    for (const [label, sw] of Object.entries(SW).filter(([key]) => key !== "null")) {
      for (const reason of [EXACT_METRIC_WINDOW_NOT_PUBLISHED, ALL_HISTORY_WINDOW_NOT_PUBLISHED]) {
        const body = clone(RICH);
        body.selected_window = clone(sw);
        const slotReason = sw.requested === "ALL" ? ALL_HISTORY_WINDOW_NOT_PUBLISHED : EXACT_METRIC_WINDOW_NOT_PUBLISHED;
        for (const slot of ["raw", "composition", "direct_nav"]) body.scores[slot] = { value: null, status: "window_not_published", reason_code: slotReason };
        body.scores.reason_code = reason;
        expect(datasetOf(body) !== null, `${label} ${reason}`).toBe(reason === slotReason);
        expect(datasetViolations(body).length === 0, `schema ${label} ${reason}`).toBe(reason === slotReason);
      }
    }
  });
});

describe("L1 · matrix Q · query_options: one metric key at a time", () => {
  /** Which lists apply to a key (schema allOf: sort -> metric_keys -> partition-required, window independent). */
  const lists = (key: string) => ({
    partitioned: (MANAGER_PARTITIONED_METRIC_KEYS as readonly string[]).includes(key),
    independent: (MANAGER_INDEPENDENT_WINDOW_KEYS as readonly string[]).includes(key),
  });
  const withFlags = (key: string, flags: Record<string, boolean>): Draft => {
    const body = clone(RICH);
    const options = body.query_options;
    const toggle = (list: string[], on: boolean): string[] => (on ? [...list.filter((k) => k !== key), key] : list.filter((k) => k !== key));
    options.sort_fields = toggle(options.sort_fields, flags.sort!);
    options.metric_keys = toggle(options.metric_keys, flags.metric_keys!);
    options.economic_partition_required_for = toggle(options.economic_partition_required_for, flags.partition!);
    options.window.independent_metrics = toggle(options.window.independent_metrics, flags.window!);
    for (const row of body.items) {
      if (flags.rows) row.metrics[key] = row.metrics[key] ?? absentMetric();
      else delete row.metrics[key];
    }
    return body;
  };
  const cases = MANAGER_METRIC_KEYS.flatMap((key) => {
    const { partitioned, independent } = lists(key);
    const names = ["sort", "metric_keys", ...(partitioned ? ["partition"] : []), ...(independent ? ["window"] : []), "rows"];
    const out: { name: string; key: string; flags: Record<string, boolean>; ok: boolean }[] = [];
    for (let bits = 0; bits < 2 ** names.length; bits += 1) {
      const flags: Record<string, boolean> = { partition: false, window: false };
      names.forEach((name, i) => { flags[name === "rows" ? "rows" : name] = Boolean(bits & (1 << i)); });
      const values = names.map((name) => flags[name]);
      out.push({ name: `${key} ${names.map((n) => `${n}=${flags[n] ? "yes" : "no"}`).join(" ")}`, key, flags, ok: values.every((v) => v === values[0]) });
    }
    return out;
  });

  it("prints the matrix size", () => {
    console.info(`manager Q (query_options): ${cases.length} cases over ${MANAGER_METRIC_KEYS.length} keys, ${cases.filter((c) => c.ok).length} consistent`);
    expect(cases).toHaveLength(3 * 32 + 2 * 16 + 2 * 8);
  });

  it.each(cases.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    const body = withFlags(c.key, c.flags);
    // A key is sortable iff it is a metric key iff its partition is required iff its window is independent iff rows carry it.
    expect(datasetOf(body) !== null).toBe(c.ok);
    expect(datasetViolations(body).length === 0).toBe(c.ok);
  });
});

describe("L1 · matrix L · row lifecycle (BE-P4): current_stage x stage_presence x reason x entry pair", () => {
  const DAY = 86_400_000;
  const PRESENCE: Record<string, string[]> = { none: [], LIVE: ["LIVE"], CANARY: ["CANARY"], "CANARY+LIVE": ["CANARY", "LIVE"] };
  const STAGE = [null, "CANARY", "LIVE"] as const;
  const REASON = [null, "MULTIPLE_ACTIVE_STAGES", "STAGE_FIELD_NOT_PUBLISHED"] as const;
  const ENTRY = ["unpublished", "published, days agree", "published, days wrong"] as const;
  const DIMS = [
    dimensionOf("presence", Object.entries(PRESENCE).map(([label, v]) => ({ label, apply: (d: Draft) => { d.items[0].stage_presence = [...v]; } }))),
    dimensionOf("current_stage", STAGE.map((v) => ({ label: String(v), apply: (d: Draft) => { d.items[0].current_stage = v; } }))),
    dimensionOf("reason", REASON.map((v) => ({ label: String(v), apply: (d: Draft) => { d.items[0].stage_lifecycle_reasons.current_stage = v; } }))),
    dimensionOf("entry", ENTRY.map((label) => ({
      label,
      apply: (d: Draft) => {
        const row = d.items[0];
        if (label === "unpublished") Object.assign(row, { entered_at_ms: null, days_in_stage: null });
        else Object.assign(row, { entered_at_ms: 10 * DAY - 3 * DAY, days_in_stage: label === "published, days agree" ? 3 : 4 });
        row.stage_lifecycle_reasons.entered_at_ms = label === "unpublished" ? "STAGE_ENTRY_TIME_NOT_PUBLISHED" : null;
        row.stage_lifecycle_reasons.days_in_stage = label === "unpublished" ? "STAGE_ENTRY_TIME_NOT_PUBLISHED" : null;
      },
    }))),
  ];
  const base = (() => {
    const body = fixtureValue(FIXTURE_LIFECYCLE_LIVE);
    body.as_of_ms = 10 * DAY;
    body.items = [body.items[0]];
    body.page = { limit: 100, returned_count: 1, authorized_filtered_count: 1, next_cursor: null, previous_cursor: null };
    body.groups = [];
    return body;
  })();
  const states = cartesian(base, DIMS);
  /** The reader's own rules on top of the schema: arithmetic and "an entry time needs a published stage" (MD-S13). */
  const readerOnly = (p: Record<string, string>) => p.entry === "published, days wrong" || (p.entry !== "unpublished" && p.current_stage === "null");

  it("prints the matrix size", () => {
    console.info(describeCoverage("manager L (lifecycle) cartesian", coverage(DIMS, states)));
    expect(states).toHaveLength(4 * 3 * 3 * 3);
  });

  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, state) => {
    const schemaOk = datasetViolations(state.value).length === 0;
    const read = datasetOf(state.value);
    // The reader never accepts what the schema refuses, and refuses on its own only for the named MD-S13 rules.
    if (!schemaOk) expect(read).toBeNull();
    else expect(read !== null).toBe(!readerOnly(state.picks));
    if (read !== null) {
      const row = read.items[0]!;
      expect(row.currentStage).toBe(state.value.items[0].current_stage);
      expect(row.enteredAtMs).toBe(state.value.items[0].entered_at_ms);
      expect(row.daysInStage).toBe(state.value.items[0].days_in_stage);
    }
  });

  it("counts: schema-valid states, reader-accepted states, and the reader-only refusals (MD-S13)", () => {
    const schemaOk = states.filter((s) => datasetViolations(s.value).length === 0);
    const accepted = states.filter((s) => datasetOf(s.value) !== null);
    const strict = schemaOk.filter((s) => datasetOf(s.value) === null);
    console.info(`manager L: ${states.length} states, schema accepts ${schemaOk.length}, reader accepts ${accepted.length}, reader-only refusals ${strict.length}`);
    expect(accepted.every((s) => datasetViolations(s.value).length === 0)).toBe(true);
    expect(strict.every((s) => readerOnly(s.picks))).toBe(true);
    expect(accepted.length).toBeGreaterThan(0);
    expect(strict.length).toBeGreaterThan(0);
  });
});
describe("L1 · matrix S · search fields x modes x sortable name", () => {
  const SORT = ["name sortable", "name not sortable"] as const;
  const FIELDS: Record<string, string[]> = { none: [], name: ["name"] };
  const MODES: Record<string, string[]> = { none: [], PREFIX: ["PREFIX"], "both": ["PREFIX", "CONTAINS"], "reversed": ["CONTAINS", "PREFIX"], twice: ["PREFIX", "PREFIX"] };
  const DIMS = [
    dimensionOf("sort", SORT.map((label) => ({ label, apply: (d: Draft) => { const rest = d.query_options.sort_fields.filter((f: string) => f !== "name"); d.query_options.sort_fields = label === "name sortable" ? [...rest, "name"] : rest; } }))),
    dimensionOf("fields", Object.entries(FIELDS).map(([label, v]) => ({ label, apply: (d: Draft) => { d.query_options.search.fields = [...v]; } }))),
    dimensionOf("modes", Object.entries(MODES).map(([label, v]) => ({ label, apply: (d: Draft) => { d.query_options.search.modes = [...v]; } }))),
  ];
  const states = cartesian(RICH, DIMS);
  const accept = (p: Record<string, string>) =>
    (p.sort === "name sortable") === (p.fields === "name") && (p.fields === "none" ? p.modes === "none" : p.modes === "both" || p.modes === "reversed");
  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, state) => {
    expect(datasetOf(state.value) !== null).toBe(accept(state.picks));
    expect(datasetViolations(state.value).length === 0).toBe(accept(state.picks));
  });
});

describe("L1 · matrix G · page and cursor envelope", () => {
  const DIMS = [
    dimension("limit", ["page", "limit"], [1, 2, 100, 200, 0, 201]),
    dimension("filtered", ["page", "authorized_filtered_count"], [1, 2, 9, 10_000, 10_001]),
    dimension("returned", ["page", "returned_count"], [2, 1]),
    dimension("next", ["page", "next_cursor"], [null, "n_cur"]),
    dimension("prev", ["page", "previous_cursor"], [null, "p_cur"]),
  ];
  const states = cartesian(RICH, DIMS);
  /** Reader rules; the page carries two rows. */
  const accept = (p: Record<string, string>) => {
    const limit = Number(p.limit);
    const filtered = Number(p.filtered);
    const returned = Number(p.returned);
    const noCursor = p.next === "null" && p.prev === "null";
    return limit >= 1 && limit <= 200 && filtered <= 10_000 && returned === 2 && returned <= limit && returned <= filtered && (!noCursor || returned === filtered);
  };
  /** Schema rules: bounds only. */
  const schemaAccepts = (p: Record<string, string>) => Number(p.limit) >= 1 && Number(p.limit) <= 200 && Number(p.filtered) <= 10_000;

  it("prints the matrix size", () => {
    console.info(describeCoverage("manager G (page) cartesian", coverage(DIMS, states)));
    expect(states).toHaveLength(6 * 5 * 2 * 2 * 2);
  });

  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, state) => {
    const read = datasetOf(state.value);
    expect(read !== null).toBe(accept(state.picks));
    expect(datasetViolations(state.value).length === 0).toBe(schemaAccepts(state.picks));
    // Whatever the reader accepts, the schema accepts.
    if (read !== null) {
      expect(datasetViolations(state.value)).toEqual([]);
      expect(read.hasMore).toBe(state.picks.next !== "null");
      expect(read.page.returnedCount).toBe(read.items.length);
    }
  });

  it("counts: states the schema accepts and the reader refuses (MD-S7, pinned as MD-1)", () => {
    const schemaOk = states.filter((s) => schemaAccepts(s.picks));
    const readerOk = states.filter((s) => accept(s.picks));
    console.info(`manager G: ${states.length} states, schema accepts ${schemaOk.length}, reader accepts ${readerOk.length}`);
    expect(readerOk.every((s) => schemaAccepts(s.picks))).toBe(true);
    expect(schemaOk.length - readerOk.length).toBeGreaterThan(0);
  });
});

/* ═════════════════════════ L2 ═════════════════════════ */
describe("L2 · scale", () => {
  const rowsOf = (n: number): Draft[] => cloneRows(RICH.items[0], n, (row, i) => {
    row.row_key = `["alpha_${pad(i)}","av_${pad(i)}","pf"]`;
    row.alpha_id = `alpha_${pad(i)}`;
    row.alpha_version_id = `av_${pad(i)}`;
    row.name = `Alpha ${pad(i)}`;
    row.children[0].alpha_id = row.alpha_id;
    row.children[0].deployment_id = `dep_${pad(i)}`;
  });
  const bodyWith = (rows: Draft[], total = rows.length): Draft => {
    const body = clone(RICH);
    body.items = rows;
    body.page = { limit: 200, returned_count: rows.length, authorized_filtered_count: total, next_cursor: null, previous_cursor: null };
    body.groups = [];
    return body;
  };

  it("reads 200 rows (the page limit), in order, inside the budget", () => {
    const body = bodyWith(rowsOf(MAX_ITEMS));
    expect(datasetViolations(body)).toEqual([]);
    const { value, ms } = timed(() => datasetOf(body));
    console.info(`manager 200 rows (${(serializedBytes(body) / 1024).toFixed(0)} KiB): ${ms.toFixed(0)} ms (budget ${BUDGET_200_ROWS_MS} ms)`);
    expect(value!.items.map((r) => r.rowKey)).toEqual(body.items.map((r: Draft) => r.row_key));
    expect(value!.items.every((r) => r.economicPartitions.length === 1)).toBe(true);
    expect(ms).toBeLessThan(BUDGET_200_ROWS_MS);
  });

  it("201 rows are over the page limit: the schema refuses them and so does the reader", () => {
    const body = bodyWith(rowsOf(MAX_ITEMS + 1));
    body.page.returned_count = MAX_ITEMS;
    expect(datasetViolations(body).join()).toMatch(/items: more than 200 items/);
    expect(datasetOf(body)).toBeNull();
    const bigCount = bodyWith(rowsOf(MAX_ITEMS + 1));
    bigCount.page.returned_count = MAX_ITEMS + 1;
    expect(datasetOf(bigCount)).toBeNull();
  });

  it("keyset pages: 450 rows in pages of 200, each read, each cursor bound to the filter it was cut under", () => {
    const rows = rowsOf(450);
    const filterKey = "fleet|paper|net_pnl";
    const { pages, cursors } = splitIntoPages(rows, 200, filterKey, (row: Draft) => row.row_key, (pageRows, info) => {
      const body = bodyWith(pageRows, info.total);
      body.page.next_cursor = info.nextCursor;
      body.page.previous_cursor = info.prevCursor;
      return body;
    });
    expect(pages.map((p) => p.items.length)).toEqual([200, 200, 50]);
    const { value: reads, ms } = timed(() => pages.map((page) => datasetOf(page)));
    console.info(`manager 3 pages of a 450-row query: ${ms.toFixed(0)} ms (budget ${BUDGET_PAGES_MS} ms)`);
    expect(reads.every((r) => r !== null)).toBe(true);
    expect(reads.map((r) => [r!.hasMore, r!.page.previousCursor === null])).toEqual([[true, true], [true, false], [false, false]]);
    expect(reads.map((r) => r!.page.authorizedFilteredCount)).toEqual([450, 450, 450]);
    expect(new Set(cursors).size).toBe(cursors.length);
    for (const cursor of cursors) expect(cursorFilter(cursor)).toBe(filterKey);
    expect(ms).toBeLessThan(BUDGET_PAGES_MS);
    for (const page of pages) expect(datasetViolations(page)).toEqual([]);
    // The rows of the three pages are the 450 rows, once each.
    expect(reads.flatMap((r) => r!.items.map((row) => row.rowKey))).toEqual(rows.map((row: Draft) => row.row_key));
  });

  it("a cursor of the schema's 4096 characters reads; one over is refused", () => {
    const body = bodyWith(rowsOf(2), 9);
    body.page.next_cursor = "c".repeat(MAX_CURSOR);
    expect(datasetViolations(body)).toEqual([]);
    expect(datasetOf(body)).not.toBeNull();
    body.page.next_cursor = "c".repeat(MAX_CURSOR + 1);
    expect(datasetViolations(body).length).toBeGreaterThan(0);
    expect(datasetOf(body)).toBeNull();
  });

  it("reads ~1 MiB of fat metrics (32 provenance refs and 64 reasons each) inside the budget", () => {
    const fat = (factor: number): Draft => {
      const rows = rowsOf(Math.min(factor, MAX_ITEMS));
      for (const row of rows) {
        // MD-8: a headline is one partition's figure, so the partition's copy is edited the same way.
        const partitionMetrics = row.economic_partitions.flatMap((entry: Draft) => Object.values(entry.metrics) as Draft[]);
        for (const metric of [...Object.values(row.metrics), ...partitionMetrics] as Draft[]) {
          metric.provenance_refs = Array.from({ length: MAX_PROVENANCE_REFS }, (_, i) => `TEST_ONLY:source-receipt-${pad(i, 3)}-${"x".repeat(40)}`);
          metric.quality.reasons = Array.from({ length: MAX_METRIC_REASONS }, (_, i) => `TEST_ONLY:reason-${pad(i, 3)}-${"y".repeat(40)}`);
        }
      }
      return bodyWith(rows);
    };
    const { value: body, factor, bytes } = fillToBytes(fat, MIB, MAX_ITEMS);
    expect(bytes).toBeGreaterThanOrEqual(MIB);
    const { value, ms } = timed(() => datasetOf(body));
    console.info(`manager ${(bytes / MIB).toFixed(2)} MiB, ${factor} rows x 3 fat metrics: ${ms.toFixed(0)} ms (budget ${BUDGET_1_MIB_MS} ms)`);
    expect(value!.items).toHaveLength(factor);
    expect(value!.items[0]!.metrics.net_pnl!.provenanceRefs).toHaveLength(MAX_PROVENANCE_REFS);
    expect(ms).toBeLessThan(BUDGET_1_MIB_MS);
    expect(datasetViolations(body)).toEqual([]);
  });

  it("children: 10,000 in a row is the schema's bound, 10,000 in a body is the reader's (MD-S8)", () => {
    const withChildren = (counts: number[]): Draft => {
      const rows = rowsOf(counts.length);
      rows.forEach((row, r) => { row.children = cloneRows(row.children[0], counts[r]!, (child, i) => { child.deployment_id = `dep_${r}_${pad(i)}`; }); });
      return bodyWith(rows);
    };
    const at = withChildren([MAX_CHILDREN_PER_ROW]);
    expect(MAX_CHILDREN_TOTAL).toBe(MAX_CHILDREN_PER_ROW);
    expect(datasetViolations(at)).toEqual([]);
    const { value, ms } = timed(() => datasetOf(at));
    console.info(`manager ${MAX_CHILDREN_PER_ROW} children (${(serializedBytes(at) / MIB).toFixed(2)} MiB): ${ms.toFixed(0)} ms`);
    expect(value!.items[0]!.children).toHaveLength(MAX_CHILDREN_PER_ROW);
    // One more in the row is outside the schema; the same count spread over two rows is inside it and outside the reader's body bound.
    const over = withChildren([MAX_CHILDREN_PER_ROW + 1]);
    expect(datasetViolations(over).length).toBeGreaterThan(0);
    expect(datasetOf(over)).toBeNull();
    const split = withChildren([5001, 5000]);
    expect(datasetViolations(split)).toEqual([]);
    expect(datasetOf(split)).toBeNull();
    expect(datasetOf(withChildren([5000, 5000]))).not.toBeNull();
  });

  it("bounded groups: 200 groups read; 201 are refused by the schema and the reader", () => {
    const groupsOf = (n: number): Draft[] => cloneRows(RICH.groups[0], n, (group, i) => { group.key = [{ field: "portfolio_id", value: `pf_${pad(i)}` }]; group.unique_row_count = 2; });
    const body = clone(RICH);
    body.groups = groupsOf(MAX_GROUPS);
    expect(datasetViolations(body)).toEqual([]);
    const { value, ms } = timed(() => datasetOf(body));
    console.info(`manager 200 groups x 2 partitions: ${ms.toFixed(0)} ms`);
    expect(value!.groups).toHaveLength(MAX_GROUPS);
    expect(ms).toBeLessThan(BUDGET_200_ROWS_MS);
    body.groups = groupsOf(MAX_GROUPS + 1);
    expect(datasetViolations(body).join()).toMatch(/groups: more than 200 items/);
    expect(datasetOf(body)).toBeNull();
  });

  it("bounded partitions: 200 capital statements read; 201 are refused; 64 metrics in a partition read, 65 are the reader's bound (MD-S4)", () => {
    const statementsOf = (n: number): Draft[] => Array.from({ length: n }, (_, i) => ({ partition: partition("PAPER", "USDT", pad(i)), metrics: { balance_total: moneyMetric({ value: `${i + 1}` }) } }));
    const body = clone(RICH);
    body.capital_statements = statementsOf(MAX_PARTITIONS);
    expect(datasetViolations(body)).toEqual([]);
    expect(datasetOf(body)!.capitalStatements).toHaveLength(MAX_PARTITIONS);
    body.capital_statements = statementsOf(MAX_PARTITIONS + 1);
    expect(datasetViolations(body).join()).toMatch(/capital_statements: more than 200 items/);
    expect(datasetOf(body)).toBeNull();
    const metricsOf = (n: number): Draft => Object.fromEntries(Array.from({ length: n }, (_, i) => [`metric_${pad(i, 3)}`, moneyMetric({ value: `${i}` })]));
    const wide = clone(RICH);
    wide.capital_statements = [{ partition: partition("PAPER", "USDT"), metrics: metricsOf(MAX_PARTITION_METRICS) }];
    expect(datasetViolations(wide)).toEqual([]);
    expect(datasetOf(wide)!.capitalStatements[0]!.metrics.size).toBe(MAX_PARTITION_METRICS);
    wide.capital_statements[0].metrics = metricsOf(MAX_PARTITION_METRICS + 1);
    expect(datasetViolations(wide)).toEqual([]);
    expect(datasetOf(wide)).toBeNull();
  });

  it("reasons: 32 on the dataset (schema) and 64 on a metric (schema) read; one more is refused in both", () => {
    const reasons = (n: number) => Array.from({ length: n }, (_, i) => `R_${pad(i)}`);
    const dataset = (n: number): Draft => { const b = clone(RICH); b.quality.reasons = reasons(n); return b; };
    expect(datasetOf(dataset(MAX_DATASET_REASONS))).not.toBeNull();
    expect(datasetViolations(dataset(MAX_DATASET_REASONS + 1)).length).toBeGreaterThan(0);
    expect(datasetOf(dataset(MAX_DATASET_REASONS + 1))).toBeNull();
    // A metric allows twice as many as the dataset: the two limits are not mixed up.
    const metric = (n: number): Draft => { const m = moneyMetric(); m.quality.reasons = reasons(n); return m; };
    expect(metricOf(metric(MAX_METRIC_REASONS))).not.toBeNull();
    expect(metricOf(metric(MAX_METRIC_REASONS + 1))).toBeNull();
    expect(metricViolations(metric(MAX_METRIC_REASONS + 1)).length).toBeGreaterThan(0);
  });

  it("a 70,000 character text anywhere is refused fast, not scanned", () => {
    const paths: (string | number)[][] = [
      ["workspace_id"], ["snapshot_id"], ["items", 0, "row_key"], ["items", 0, "name"], ["items", 0, "children", 0, "deployment_id"],
      ["items", 0, "metrics", "net_pnl", "basis"], ["items", 0, "metrics", "net_pnl", "reason_code"], ["items", 0, "metrics", "net_pnl", "provenance_refs", 0],
      ["capital_statements", 0, "partition", "currency"], ["capital_statements", 0, "metrics", "balance_total", "unit"], ["groups", 0, "key", 0, "value"],
      ["lineage", "revision"], ["quality", "reasons", 0], ["scores", "raw", "value"],
    ];
    for (const path of paths) {
      const body = clone(RICH);
      if (path[0] === "scores") body.scores.raw = { value: "7", status: "available" };
      setPath(body, path, path[0] === "scores" ? "9".repeat(70_000) : "a".repeat(70_000));
      const { value, ms } = timed(() => readManagerDataset(body));
      expect(value, path.join(".")).toBeNull();
      expect(ms, path.join(".")).toBeLessThan(100);
    }
    const cursor = clone(RICH);
    cursor.page.authorized_filtered_count = 9;
    cursor.page.next_cursor = "a".repeat(70_000);
    expect(timed(() => readManagerDataset(cursor)).ms).toBeLessThan(100);
    expect(readManagerDataset(cursor)).toBeNull();
    const decimal = moneyMetric({ value: "9".repeat(70_000) });
    expect(timed(() => metricOf(decimal)).ms).toBeLessThan(100);
    expect(metricOf(decimal)).toBeNull();
  });

  it("a very deep object is refused without a stack overflow", () => {
    let deep: Draft = {};
    const root = deep;
    for (let level = 0; level < 5000; level += 1) { deep.n = {}; deep = deep.n; }
    expect(() => readManagerDataset(root)).not.toThrow();
    expect(readManagerDataset(root)).toEqual({ kind: "unsupported_shape", schemaVersion: null });
    const body = clone(RICH);
    body.page = root;
    expect(readManagerDataset(body)).toBeNull();
  });
});

/* ═════════════════════════ L3 ═════════════════════════ */
interface Case { name: string; category: string; value: unknown; probe: string | null }

/** The negatives' base: the rich base with every optional-looking field set, so a path exists to be broken. */
const NEG: Draft = (() => {
  const body = clone(RICH);
  body.selected_window = { requested: "30D", resolved: { from_ms: 1000, to_ms: 2000 }, selection_basis: "EXACT_PUBLISHED_METRIC_WINDOW_ONLY", reason_code: null };
  body.page = { limit: 100, returned_count: 2, authorized_filtered_count: 9, next_cursor: "cursor_next", previous_cursor: "cursor_prev" };
  body.scores.raw = { value: "71.5", status: "available" };
  body.scores.composition = { value: "60", status: "provisional" };
  body.items[0].metrics.net_pnl.window = { from_ms: 1000, to_ms: 2000 };
  body.items[0].metrics.net_pnl.denominator = "10.5";
  // MD-8: the headline is the partition's figure; the base keeps them one fact (the corpus then breaks the headline alone).
  body.items[0].economic_partitions[0].metrics.net_pnl = clone(body.items[0].metrics.net_pnl);
  return body;
})();

describe("L3 · the negative base", () => {
  it("is schema-valid and read, so every failure below comes from the one mutation", () => {
    expect(datasetViolations(NEG)).toEqual([]);
    expect(datasetOf(NEG)).not.toBeNull();
  });
});

const NET = ["items", 0, "metrics", "net_pnl"] as const;
const PART = ["capital_statements", 0, "partition"] as const;
/** enumCases lower-cases the first valid word; where that is already the word the case is the base, not a negative. */
const enumsOf = (path: readonly (string | number)[], valid: readonly string[]): Case[] =>
  enumCases(NEG, path, valid).filter((c) => !valid.includes(getPath(c.value, path) as string));

const DECIMALS: Case[] = [
  ...decimalCases(NEG, [...NET, "value"]),
  ...decimalCases(NEG, [...NET, "denominator"]),
  ...decimalCases(NEG, ["items", 1, "economic_partitions", 0, "metrics", "net_pnl", "value"]),
  ...decimalCases(NEG, ["capital_statements", 0, "metrics", "balance_total", "value"]),
  ...decimalCases(NEG, ["scores", "raw", "value"]),
  ...decimalCases(NEG, ["scores", "composition", "value"]),
];
const ENUMS: Case[] = [
  ...enumsOf(["surface"], MANAGER_SURFACES),
  ...enumsOf(["environment"], MANAGER_ENVIRONMENTS),
  ...enumsOf(["quality", "completeness"], MANAGER_COMPLETENESS),
  ...enumsOf(["quality", "freshness"], MANAGER_FRESHNESS),
  ...enumsOf([...NET, "availability"], MANAGER_AVAILABILITIES),
  ...enumsOf([...NET, "source_confidence"], MANAGER_SOURCE_CONFIDENCE),
  ...enumsOf([...NET, "quality", "completeness"], MANAGER_COMPLETENESS),
  ...enumsOf([...NET, "quality", "freshness"], MANAGER_FRESHNESS),
  ...enumsOf([...PART, "economic_domain"], MANAGER_ECONOMIC_DOMAINS),
  ...enumsOf(["items", 0, "stage_presence", 0], ["PAPER"]),
  ...enumsOf(["items", 0, "children", 0, "stage"], ["PAPER"]),
  ...enumsOf(["scores", "raw", "status"], ["available", "provisional"]),
  ...enumsOf(["scores", "regime", "status"], ["unavailable", "supported", "weak_support", "out_of_support", "insufficient_data", "stale", "unbound"]),
  ...enumsOf(["scores", "reason_code"], ["RUNTIME_SCORE_POLICY_AND_SOURCE_NOT_QUALIFIED", "QUALIFIED_PRECOMPUTED_SCORE"]),
  ...enumsOf(["selected_window", "requested"], ["7D", "30D", "90D", "ALL"]),
  ...enumsOf(["query_options", "temporal_mode"], ["CURRENT_ONLY"]),
  ...enumsOf(["query_options", "sort_fields", 0], MANAGER_SORT_FIELDS),
  ...enumsOf(["query_options", "group_fields", 0], MANAGER_GROUP_FIELDS),
  ...enumsOf(["query_options", "metric_keys", 0], MANAGER_METRIC_KEYS),
  ...enumsOf(["query_options", "search", "modes", 0], ["PREFIX", "CONTAINS"]),
  ...enumsOf(["query_options", "window", "presets", 0, "data_state"], ["METRIC_SPECIFIC", "NOT_PUBLISHED"]),
  ...enumsOf(["groups", 0, "key", 0, "field"], MANAGER_GROUP_FIELDS),
];
const INTEGERS: Case[] = [
  ...integerCases(NEG, ["as_of_ms"]),
  ...integerCases(NEG, ["recorded_through_ms"]),
  ...integerCases(NEG, ["facts_through_ms"]),
  ...integerCases(NEG, ["page", "limit"]),
  ...integerCases(NEG, ["page", "returned_count"]),
  ...integerCases(NEG, ["page", "authorized_filtered_count"]),
  ...integerCases(NEG, ["groups", 0, "unique_row_count"]),
  ...integerCases(NEG, [...NET, "window", "from_ms"]),
  ...integerCases(NEG, ["selected_window", "resolved", "to_ms"]),
];
const STRINGS: Case[] = [
  ...stringCases(NEG, ["workspace_id"]),
  ...stringCases(NEG, ["snapshot_id"]),
  ...stringCases(NEG, ["items", 0, "row_key"]),
  ...stringCases(NEG, ["items", 0, "alpha_id"]),
  ...stringCases(NEG, ["items", 0, "name"]),
  ...stringCases(NEG, ["items", 0, "children", 0, "deployment_id"]),
  ...stringCases(NEG, ["items", 0, "children", 0, "binding_ref"]),
  ...stringCases(NEG, [...PART, "currency"]),
  ...stringCases(NEG, [...PART, "native_profile_ref"]),
  ...stringCases(NEG, [...NET, "unit"]),
  ...stringCases(NEG, [...NET, "basis"]),
  ...stringCases(NEG, [...NET, "currency"]),
  ...stringCases(NEG, [...NET, "methodology_ref"]),
  ...stringCases(NEG, [...NET, "calculation_revision"]),
  ...stringCases(NEG, [...NET, "policy_revision"]),
  ...stringCases(NEG, [...NET, "provenance_refs", 0]),
  ...stringCases(NEG, ["quality", "reasons", 0]),
  ...stringCases(NEG, ["groups", 0, "key", 0, "value"]),
  ...stringCases(NEG, ["lineage", "source_set_ref"]),
  ...stringCases(NEG, ["lineage", "revision"]),
  ...stringCases(NEG, ["lineage", "supersedes_revision"]),
  ...stringCases(NEG, ["page", "next_cursor"]),
  ...stringCases(NEG, ["page", "previous_cursor"]),
];
const ARRAYS: Case[] = [
  ...arrayCases(NEG, ["items"], { idKey: "row_key" }),
  ...arrayCases(NEG, ["items", 0, "children"]),
  ...arrayCases(NEG, ["items", 0, "stage_presence"]),
  ...arrayCases(NEG, ["items", 1, "economic_partitions"]),
  ...arrayCases(NEG, ["groups"]),
  ...arrayCases(NEG, ["capital_statements"]),
  ...arrayCases(NEG, [...NET, "provenance_refs"]),
  ...arrayCases(NEG, [...NET, "quality", "reasons"]),
  ...arrayCases(NEG, ["quality", "reasons"]),
  ...arrayCases(NEG, ["query_options", "sort_fields"]),
  ...arrayCases(NEG, ["query_options", "metric_keys"]),
  ...arrayCases(NEG, ["query_options", "window", "presets"]),
  ...arrayCases(NEG, ["query_options", "unavailable_fields"]),
];
const REQUIRED: Case[] = requiredCases(NEG, [
  ...["schema_version", "selected_window", "query_options", "surface", "workspace_id", "environment", "record_authority", "source_authority", "snapshot_id", "as_of_ms",
    "recorded_through_ms", "facts_through_ms", "quality", "coverage", "economic_aggregation", "query_policy", "page", "items", "groups", "capital_statements",
    "statement_scope", "scores", "funding_bucket_pnl", "lineage"].map((k) => [k] as const),
  ["page", "limit"], ["page", "next_cursor"], ["quality", "reasons"], ["scores", "raw"], ["scores", "raw", "status"], ["scores", "raw", "value"], ["scores", "regime", "value"],
  ["scores", "calculation_path"], ["lineage", "supersedes_revision"], ["lineage", "reducer_revision"], ["funding_bucket_pnl", "value"], ["query_policy", "maximum_response_bytes"],
  ["selected_window", "requested"], ["selected_window", "resolved"], ["selected_window", "reason_code"], ["selected_window", "selection_basis"],
  ["query_options", "search"], ["query_options", "search", "normalization"], ["query_options", "window", "presets"], ["query_options", "stage_environment"], ["query_options", "unavailable_fields"],
  ["items", 0, "row_key"], ["items", 0, "metrics"], ["items", 0, "children"], ["items", 0, "economic_partitions"], ["items", 0, "name"], ["items", 0, "children", 0, "binding_ref"],
  ["groups", 0, "key"], ["groups", 0, "totals_scope"], ["groups", 0, "economic_partitions"],
  ["capital_statements", 0, "partition"], ["capital_statements", 0, "metrics"], ["capital_statements", 0, "partition", "domain_proof_ref"],
  ...["value", "unit", "currency", "basis", "window", "denominator", "methodology_ref", "availability", "reason_code", "quality", "source_confidence", "provenance_refs", "calculation_revision", "policy_revision"]
    .map((k) => [...NET, k] as const),
]);
const SCHEMA_SWAP = schemaVersionCases(NEG, ["schema_version"], MANAGER_DATASET_SCHEMA, [
  "portal.execution.manager-score-revision.v1", "portal.execution.manager-score-history.v1", "portal.execution.manager-scoped.v1", "execution.manager-realtime-snapshot.v2",
  "portal.execution.manager-dataset.v2",
]);
const POLLUTION = pollutionCases(NEG, [[], ["page"], ["items", 0], ["items", 0, "metrics"], [...NET], ["capital_statements", 0, "metrics"], ["scores"], ["query_options"], ["lineage"]]);
const ALL_NEG: Case[] = [...DECIMALS, ...ENUMS, ...INTEGERS, ...STRINGS, ...ARRAYS, ...REQUIRED, ...SCHEMA_SWAP, ...POLLUTION];

describe("L3 · negative", () => {
  it("reports the case counts", () => {
    const by = new Map<string, number>();
    for (const c of ALL_NEG) by.set(c.category, (by.get(c.category) ?? 0) + 1);
    console.info(`manager L3: ${ALL_NEG.length} cases (${[...by.entries()].map(([k, v]) => `${k} ${v}`).join(", ")}), ${rootCases().length} root cases`);
    expect(ALL_NEG.length).toBeGreaterThan(900);
  });

  it.each(ALL_NEG.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    expect(() => readManagerDataset(c.value)).not.toThrow();
    const read = readManagerDataset(c.value);
    expect(leaked(read, c.probe)).toBe(false);
    expect(prototypeIsClean()).toBe(true);
    if (c.category === "schema-swapped") {
      expect(read === null || read.kind === "unsupported_shape").toBe(true);
      return;
    }
    if (c.category === "prototype-pollution") {
      // A planted key is an unnamed key (or an invalid metric): the read is refused, never reads the marker.
      expect(read).toBeNull();
    }
  });

  it("an unknown word never reads as a success state: no enum case yields a dataset", () => {
    for (const c of ENUMS) {
      const read = readManagerDataset(c.value);
      expect(read === null || read.kind === "unsupported_shape", c.name).toBe(true);
    }
  });

  it("a number where a decimal belongs is never read: every number-as-decimal case is refused", () => {
    const numbers = DECIMALS.filter((c) => c.category === "number-as-decimal" || c.category === "exponent");
    expect(numbers.length).toBeGreaterThan(60);
    // A score slot is a decimal-pattern string in the schema too; a JS number never reads.
    for (const c of numbers) expect(datasetOf(c.value), c.name).toBeNull();
  });

  it.each(rootCases().map((c) => [c.name, c] as const))("%s is never a dataset", (_name, c) => {
    expect(() => readManagerDataset(c.value)).not.toThrow();
    const read = readManagerDataset(c.value);
    expect(read === null || read.kind === "unsupported_shape").toBe(true);
    if (typeof c.value !== "object" || c.value === null) expect(read).toBeNull();
  });
});

/* ═════════════════════════ L3 · schema agreement ═════════════════════════ */
describe("L3 · schema agreement (the published ManagerDataset schema, via testkit validateAgainst)", () => {
  /**
   * Schema-valid, reader refuses, found in the generated corpus. Each group is a documented FE rule, never an
   * accident, and the counts are pinned so a new accidental refusal (or a lost one) is a red test.
   */
  const SAFE_TEXT_VALUE = /<- ("\s+"|"[^"]*\u202e[^"]*"|"\\u0000")$/;
  const TEXT_PATHS = /^huge-string: (workspace_id|items\.0\.(row_key|alpha_id|name|children\.0\.(deployment_id|binding_ref))|capital_statements\.0\.partition\.(currency|native_profile_ref)|items\.0\.metrics\.net_pnl\.(unit|basis|currency|methodology_ref|calculation_revision|policy_revision|provenance_refs\.0|quality\.reasons\.0)|quality\.reasons\.0|groups\.0\.key\.0\.value|page\.(next_cursor|previous_cursor)) <-/;
  const STRICTER_GROUPS: { name: string; test: (c: Case) => boolean; count?: number }[] = [
    { name: "MD-S1 display safety: whitespace-only, bidi override, in any text", test: (c) => TEXT_PATHS.test(c.name) && SAFE_TEXT_VALUE.test(c.name) },
    // The base keeps the headline and its partition's figure as one fact (MD-8); a corpus case that edits the headline alone breaks it.
    { name: "MD-S5 a row money figure that names a currency is one partition's figure (edited headline alone)", test: (c) => /^[a-z-]+: items\.0\.metrics\.net_pnl\./.test(c.name) },
    { name: "MD-S7 page: returned_count is the number of rows (a cut or doubled list changes the rows, not the count)", test: (c) => /^(truncated|duplicate-id): items <-/.test(c.name) },
    { name: "MD-S7 cursor text: an empty cursor (whitespace-only, bidi and NUL cursors are MD-S1)", test: (c) => /: page\.(next_cursor|previous_cursor) <-/.test(c.name) },
  ];
  const corpus = ALL_NEG.filter((c) => c.category !== "prototype-pollution" && c.category !== "schema-swapped");

  it("reader never accepts what the schema refuses, over the whole generated negative corpus (counted)", () => {
    let invalid = 0;
    const looserNames: string[] = [];
    const stricterBy = new Map<string, number>();
    const unexplained: string[] = [];
    for (const c of corpus) {
      const { invalid: bad, accepted } = judge(c.value);
      if (bad) invalid += 1;
      if (bad && accepted) looserNames.push(c.name);
      if (!bad && !accepted) {
        const group = STRICTER_GROUPS.find((g) => g.test(c));
        if (group === undefined) unexplained.push(c.name);
        else stricterBy.set(group.name, (stricterBy.get(group.name) ?? 0) + 1);
      }
    }
    const stricter = [...stricterBy.values()].reduce((a, b) => a + b, 0) + unexplained.length;
    console.info(
      `manager L3 schema gap: ${corpus.length} cases, schema refuses ${invalid}; reader accepts ${looserNames.length} of those (looser); `
      + `reader refuses ${stricter} schema-valid ones (stricter): ${[...stricterBy.entries()].map(([k, v]) => `${k} ${v}`).join("; ")}`,
    );
    expect(invalid).toBeGreaterThan(500);
    expect(looserNames).toEqual([]);
    expect(unexplained).toEqual([]);
    expect(Object.fromEntries(stricterBy)).toEqual(PINNED_STRICTER);
  });

  it("and the schema-swapped cases are refused by the schema (or are the base) and are never a dataset", () => {
    const swapped = ALL_NEG.filter((c) => c.category === "schema-swapped");
    expect(swapped.length).toBeGreaterThan(0);
    for (const c of swapped) {
      const { invalid, accepted } = judge(c.value);
      expect(accepted, c.name).toBe(!invalid && accepted);
      if (invalid) expect(accepted, c.name).toBe(false);
    }
  });

  it("the planted-key cases are refused by the schema as well (a closed contract)", () => {
    for (const c of ALL_NEG.filter((x) => x.category === "prototype-pollution")) {
      const { invalid, accepted } = judge(c.value);
      expect(accepted, c.name).toBe(false);
      expect(invalid || !accepted, c.name).toBe(true);
    }
  });

  /* Looser on purpose: MD-L1. */
  it("MD-L1 (looser on purpose, pinned): details arrays are counted, their content is not read", () => {
    const body = clone(NEG);
    body.score_details = [{ slot: "RAW", anything: "not read" }];
    body.composition_details = [{ slot: "COMPOSITION" }];
    body.regime_details = [{ slot: "REGIME" }, { slot: "REGIME" }];
    // The schema refuses each of these (the objects are not the publications), the reader counts them.
    expect(datasetViolations(body).length).toBeGreaterThan(0);
    expect(datasetOf(body)!.unreadDetails).toEqual({ scoreDetails: 1, compositionDetails: 1, regimeDetails: 2 });
    // Still bounded and slot-named: 129 entries, a non-object and a wrong slot are refused.
    const many = clone(NEG);
    many.score_details = Array.from({ length: 129 }, () => ({ slot: "RAW" }));
    expect(datasetOf(many)).toBeNull();
    expect(datasetOf({ ...clone(NEG), score_details: ["x"] })).toBeNull();
    expect(datasetOf({ ...clone(NEG), score_details: [{ slot: "REGIME" }] })).toBeNull();
    expect(datasetOf({ ...clone(NEG), regime_details: {} })).toBeNull();
  });

  it("the closed contract: an unnamed key on any object the schema closes voids the read, in the schema too", () => {
    const paths: (string | number)[][] = [[], ["page"], ["quality"], ["lineage"], ["scores"], ["scores", "regime"], ["query_options"], ["query_options", "window"], ["selected_window"], ["items", 0], ["items", 0, "children", 0], [...NET], [...NET, "quality"], [...NET, "window"], [...PART], ["groups", 0], ["groups", 0, "key", 0], ["funding_bucket_pnl"], ["query_policy"]];
    for (const path of paths) {
      const body = clone(NEG);
      setPath(body, [...path, "surprise_field"], "x");
      // selected_window and a metric's window are anyOf (object | null): a stray key makes them match neither branch.
      expect(datasetViolations(body).join(), path.join(".")).toMatch(/surprise_field: not allowed|: matched no anyOf branch/);
      expect(readManagerDataset(body), path.join(".")).toBeNull();
    }
  });
});

/**
 * The generated corpus' stricter-than-schema counts, pinned: each number is the count of cases of that group in the
 * generated corpus (observed on the first green run, then explained group by group); a change means a rule moved.
 */
const PINNED_STRICTER: Record<string, number> = {
  "MD-S1 display safety: whitespace-only, bidi override, in any text": 41,
  "MD-S5 a row money figure that names a currency is one partition's figure (edited headline alone)": 4,
  "MD-S7 page: returned_count is the number of rows (a cut or doubled list changes the rows, not the count)": 1,
  "MD-S7 cursor text: an empty cursor (whitespace-only, bidi and NUL cursors are MD-S1)": 2,
};

/* ═════════════════════════ stricter, pinned by hand ═════════════════════════ */
describe("L3 · stricter than the schema, on purpose: each pinned case is schema-valid and refused by the reader", () => {
  const rlo = String.fromCharCode(0x202e);
  const zwsp = String.fromCharCode(0x200b);
  const cases: [string, (b: Draft) => void][] = [
    ["MD-S1 whitespace-only workspace_id", (b) => { b.workspace_id = "   "; }],
    ["MD-S1 bidi override in a metric basis", (b) => { b.items[0].metrics.net_pnl.basis = `net${rlo}x`; }],
    ["MD-S1 zero-width in a partition currency", (b) => { b.capital_statements[0].partition.currency = `US${zwsp}DT`; b.capital_statements[0].metrics.balance_total.currency = `US${zwsp}DT`; }],
    ["MD-S1 C1 control in a row_key (the schema leaves row_key unpatterned)", (b) => { b.items[0].row_key = "k\u0085x"; }],
    ["MD-S3 metric window from_ms after to_ms", (b) => { b.items[0].metrics.net_pnl.window = { from_ms: 2000, to_ms: 1000 }; }],
    ["MD-S3 selected_window resolved backwards", (b) => { b.selected_window.resolved = { from_ms: 2000, to_ms: 1000 }; }],
    ["MD-S4 partition metric key not a lower-case token", (b) => { b.capital_statements[0].metrics.Balance_Total = b.capital_statements[0].metrics.balance_total; }],
    [`MD-S4 ${MAX_PARTITION_METRICS + 1} metrics in one partition`, (b) => { b.capital_statements[0].metrics = Object.fromEntries(Array.from({ length: MAX_PARTITION_METRICS + 1 }, (_, i) => [`m_${i}`, moneyMetric()])); }],
    ["MD-S5 USDT headline above a EUR partition", (b) => { b.items[1].metrics.net_pnl = moneyMetric({ value: "1" }); }],
    // An exact repeat is a schema refusal now (uniqueItems, MD-3). The identity repeated with other content is not.
    ["MD-S6 the same partition twice in capital_statements, other figure", (b) => { const twin = clone(b.capital_statements[0]); twin.metrics.balance_total.value = "1"; b.capital_statements.push(twin); }],
    ["MD-S6 a EUR figure inside a USDT partition", (b) => { b.capital_statements[0].metrics.balance_total.currency = "EUR"; }],
    ["MD-S7 returned_count 1 for 2 rows", (b) => { b.page.returned_count = 1; }],
    ["MD-S7 returned_count above the limit", (b) => { b.page.limit = 1; }],
    ["MD-S7 more rows returned than the filtered query holds", (b) => { b.page.authorized_filtered_count = 1; b.page.next_cursor = "n"; }],
    ["MD-S7 no cursor either way but fewer rows than the filtered count", (b) => { b.page.next_cursor = null; b.page.previous_cursor = null; }],
    ["MD-S7 empty cursor", (b) => { b.page.next_cursor = ""; }],
    ["MD-S8 10,001 children in a body over two rows", (b) => { const kids = (n: number, tag: string) => cloneRows(b.items[0].children[0], n, (c, i) => { c.deployment_id = `d_${tag}_${i}`; }); b.items[0].children = kids(5001, "a"); b.items[1].children = kids(5000, "b"); }],
    ["MD-S10 a row twice", (b) => { b.items[1].row_key = b.items[0].row_key; }],
    ["MD-S10 a stage twice in a set", (b) => { Object.assign(b.items[0], { stage_presence: ["PAPER", "PAPER"], current_stage: null, stage_lifecycle_reasons: { ...b.items[0].stage_lifecycle_reasons, current_stage: "MULTIPLE_ACTIVE_STAGES" } }); }],
    // The schema's enum refuses a non-groupable field (MD-7). A groupable field the options do not offer is the reader's rule.
    ["MD-S11 a group over a field the options do not offer", (b) => { b.query_options.sort_fields = b.query_options.sort_fields.filter((k: string) => k !== "venue"); b.query_options.group_fields = b.query_options.group_fields.filter((k: string) => k !== "venue"); b.groups[0].key[0].field = "venue"; }],
    ["MD-S11 a group with more unique rows than the filtered query", (b) => { b.groups[0].unique_row_count = 10; }],
    // An exact repeat is a schema refusal (uniqueItems); the same key with another count is not.
    ["MD-S11 a group twice with another count", (b) => { const twin = clone(b.groups[0]); twin.unique_row_count = 1; b.groups.push(twin); }],
    ["MD-S12 as_of_ms beyond the Date range", (b) => { b.as_of_ms = 9_000_000_000_000_000; }],
    ["MD-S12 a metric window beyond the Date range", (b) => { b.items[0].metrics.net_pnl.window = { from_ms: 9_000_000_000_000_000, to_ms: 9_000_000_000_000_001 }; }],
    ["MD-S5 headline one digit off the pinned partition's figure", (b) => { b.items[1].metrics.net_pnl = moneyMetric({ value: "100.26" }); }],
    ["MD-S6 the same partition identity twice, differing only in domain_proof_ref (evidence, not identity)", (b) => { const twin = clone(b.capital_statements[0]); twin.partition.domain_proof_ref = "TEST_ONLY:other-proof"; b.capital_statements.push(twin); }],
    // MD-S13: the producer's Zod arithmetic for the lifecycle scalars (JSON Schema cannot state it).
    ["MD-S13 days_in_stage disagrees with the clocks", (b) => { b.as_of_ms = 10 * 86_400_000; Object.assign(b.items[0], { entered_at_ms: b.as_of_ms - 3 * 86_400_000, days_in_stage: 4, stage_lifecycle_reasons: { current_stage: null, entered_at_ms: null, days_in_stage: null } }); }],
    ["MD-S13 entered_at_ms after the cutoff (with a day count)", (b) => { b.as_of_ms = 10 * 86_400_000; Object.assign(b.items[0], { entered_at_ms: b.as_of_ms + 1, days_in_stage: 0, stage_lifecycle_reasons: { current_stage: null, entered_at_ms: null, days_in_stage: null } }); }],
    ["MD-S13 an entry time on a row with no published stage", (b) => { Object.assign(b.items[0], { current_stage: null, entered_at_ms: 1, days_in_stage: null, stage_lifecycle_reasons: { current_stage: "MULTIPLE_ACTIVE_STAGES", entered_at_ms: null, days_in_stage: "STAGE_ENTRY_TIME_NOT_PUBLISHED" } }); }],
  ];
  it.each(cases.map(([name, change]) => [name, change] as const))("%s", (name, change) => {
    const body = clone(NEG);
    change(body);
    const { invalid, accepted } = judge(body);
    expect(invalid, `schema should allow: ${name}`).toBe(false);
    expect(accepted, `reader should refuse: ${name}`).toBe(false);
  });
  it("prints the number of pinned groups", () => {
    const groups = new Set(cases.map(([name]) => name.split(" ")[0]));
    console.info(`manager stricter-than-schema (on purpose): ${cases.length} pinned cases in ${groups.size} named groups: ${[...groups].sort().join(", ")}`);
    // MD-S9 left this list (BE-P1, MD-4: the schema refuses an unpublished preset that carries a window); MD-S2 left it too (MD-5 option C: the schema refuses -0).
    expect(groups.size).toBe(11);
  });
});

/* ═════════════════════════ MD-1 .. MD-8: what the schema says and what only the producer and the reader hold ═════════════════════════ */
describe("MD-1 .. MD-8 (BE-P1): the producer refuses to emit these bodies; the schema says what JSON Schema can", () => {
  /*
   * Each gap is a rule the reader enforces. BE-P1 made the control-api refuse to emit a body that breaks it
   * (manager-dataset-invariants.ts, in managerDatasetResponse) and put into the published schema the part JSON Schema can
   * state. A "closed" case is refused by the schema now (normal `it`: schema refuses AND reader refuses). An "open" case
   * is one JSON Schema cannot state (equality of two fields, identity inside a list, a property of two items): it stays
   * `it.fails`, which passes while the schema stays silent and turns red the day a rule becomes expressible. MD-5 is not a
   * rule yet: it waits for an owner decision.
   */
  const closed: [string, string, (b: Draft) => void][] = [
    ["MD-1 empty page", "an empty items list has returned_count 0, a non-empty one at least 1 (the exact count is the producer's)", (b) => { b.page.returned_count = 0; }],
    ["MD-1 empty page, rows missing", "returned_count 2 over no rows is refused", (b) => { b.items = []; b.groups = []; }],
    ["MD-3", "a partition object repeated in a list (uniqueItems)", (b) => { b.capital_statements.push(clone(b.capital_statements[0])); }],
    ["MD-3 row", "a partition object repeated in a row's economic_partitions", (b) => { b.items[1].economic_partitions.push(clone(b.items[1].economic_partitions[0])); }],
    ["MD-4", "a preset the source does not publish carries no window (data_state NOT_PUBLISHED with resolved: object)", (b) => { b.query_options.window.presets[0].resolved = { from_ms: 1, to_ms: 2 }; }],
    ["MD-6 row", "a row repeated in items (uniqueItems)", (b) => { b.items.push(clone(b.items[0])); b.page.returned_count = 3; b.page.authorized_filtered_count = 3; }],
    ["MD-6 group", "a group repeated (uniqueItems)", (b) => { b.groups.push(clone(b.groups[0])); }],
    ["MD-7 field", "a group key names one of the eight groupable fields, not any text", (b) => { b.groups[0].key[0].field = "name"; }],
    ["MD-7 key", "a field twice in one group key", (b) => { b.groups[0].key.push({ field: "portfolio_id", value: "x" }); }],
  ];
  for (const [id, rule, change] of closed) {
    it(`${id} (closed in the schema, reader holds it too): ${rule}`, () => {
      const body = clone(NEG);
      change(body);
      expect(datasetViolations(body)).not.toEqual([]);
      expect(datasetOf(body)).toBeNull();
    });
  }
  it("MD-1 empty page: the empty case is exact in the schema (no rows, returned_count 0) and the fixtures stay valid", () => {
    const empty = fixtureValue(FIXTURE_EMPTY);
    expect(empty.items).toEqual([]);
    expect(empty.page.returned_count).toBe(0);
    expect(datasetViolations(empty)).toEqual([]);
    expect(datasetViolations({ ...clone(empty), page: { ...empty.page, returned_count: 1 } })).not.toEqual([]);
  });
  it("MD-4: an unpublished preset with no window, and a published one with bounds, are both valid", () => {
    const body = clone(NEG);
    expect(body.query_options.window.presets.every((p: Draft) => p.data_state === "NOT_PUBLISHED" && p.resolved === null)).toBe(true);
    expect(datasetViolations(body)).toEqual([]);
    body.query_options.window.presets[1] = { ...body.query_options.window.presets[1], data_state: "METRIC_SPECIFIC", resolved: { from_ms: 1, to_ms: 2592000001 }, reason_code: null };
    expect(datasetViolations(body)).toEqual([]);
  });

  const open: [string, string, (b: Draft) => void][] = [
    ["MD-1", "page.returned_count equals items.length, is at most limit and at most authorized_filtered_count", (b) => { b.page.returned_count = 1; }],
    ["MD-2", "a metric inside a partition names the partition's currency", (b) => { b.capital_statements[0].metrics.balance_total.currency = "EUR"; }],
    ["MD-6", "row_key is unique within a body (two different rows, one key)", (b) => { b.items[1].row_key = b.items[0].row_key; }],
    ["MD-7", "a group's unique_row_count is at most the filtered count", (b) => { b.groups[0].unique_row_count = 10; }],
    ["MD-8", "a row-level money figure is one partition's figure (no cross-currency headline)", (b) => { b.items[1].metrics.net_pnl = moneyMetric({ value: "1" }); }],
  ];
  for (const [id, rule, change] of open) {
    it(`${id} (reader holds it, the producer refuses to emit it): ${rule}`, () => {
      const body = clone(NEG);
      change(body);
      expect(datasetOf(body)).toBeNull();
    });
    it.fails(`${id} (JSON Schema cannot state it, expected to FAIL): the schema should refuse it`, () => {
      const body = clone(NEG);
      change(body);
      expect(datasetViolations(body)).not.toEqual([]);
    });
  }
  it("the published partition example is read as published, and each published negative case is judged by the schema as the file says", () => {
    const example = datasetOf(fixtureValue(FIXTURE_PARTITIONS))!;
    expect(example.items.map((row) => row.economicPartitions.map((p) => p.partition.currency))).toEqual([["USDT"], ["USDT", "EUR"]]);
    // The mixed row has no headline figure: two currencies are never one number.
    expect(example.items[1]!.metrics.net_pnl!.kind).toBe("absent");
    expect(example.groups).toHaveLength(1);
    expect(example.capitalStatements.map((entry) => entry.partition.currency)).toEqual(["USDT", "EUR"]);

    const file = loadCanonical<{ base: string; cases: { id: string; refused_by: string; ops: Draft[] }[] }>(FIXTURE_INVARIANT_CASES);
    expect(file.base).toBe(`${FIXTURE_PARTITIONS}.valid.json`);
    const apply = (ops: Draft[]): Draft => {
      const body = fixtureValue(FIXTURE_PARTITIONS);
      const at = (path: (string | number)[]): Draft => path.reduce((node: Draft, key) => node[key], body);
      for (const op of ops) {
        const parent = at(op.path.slice(0, -1));
        const key = op.path.at(-1);
        if (op.op === "set") parent[key] = clone(op.value);
        else if (op.op === "delete") delete parent[key];
        else if (op.op === "append") parent[key].push(clone(op.value));
        else if (op.op === "append_copy") parent[key].push(clone(at(op.from)));
        else if (op.op === "set_copy") parent[key] = clone(at(op.from));
        else throw new Error(`unknown operation ${op.op}`);
      }
      return body;
    };
    const accepted: string[] = [];
    for (const c of file.cases) {
      const body = apply(c.ops);
      // The checker here and the published Ajv verdict (BE-P1 contract test) agree: PRODUCER_ONLY means the schema is silent.
      expect(datasetViolations(body).length === 0, c.id).toBe(c.refused_by === "PRODUCER_ONLY");
      if (datasetOf(body) !== null) accepted.push(c.id);
    }
    // The reader refuses EVERY case (BE-P1 reader follow-up 2): it now identifies a partition by the producer's four fields, so a
    // repeat that differs only in its proof reference (evidence, not identity) is refused here too.
    expect(accepted).toEqual([]);
  });
  it("MD-5 (negative zero), owner decision C: the producer emits canonical zero, so the schema and the producer refuse -0 and the reader refuses it too", () => {
    const body = clone(NEG);
    body.items[0].metrics.net_pnl.value = "-0";
    expect(datasetViolations(body)).not.toEqual([]);
    expect(datasetOf(body)).toBeNull();
  });
});

/* ═════════════════════════ L1 closing: determinism and isolation ═════════════════════════ */
describe("determinism", () => {
  it("reading twice gives equal results and never mutates the input", () => {
    const body = clone(NEG);
    const before = JSON.stringify(body);
    const one = readManagerDataset(body);
    const two = readManagerDataset(body);
    expect(one).toEqual(two);
    expect(JSON.stringify(body)).toBe(before);
  });

  it("the read does not alias the input: editing the input afterwards does not change the read", () => {
    const body = clone(NEG);
    const dataset = datasetOf(body)!;
    body.items[0].children[0].deployment_id = "changed";
    body.quality.reasons.push("changed");
    expect(dataset.items[0]!.children[0]!.deploymentId).not.toBe("changed");
    expect(dataset.quality.reasons).not.toContain("changed");
  });

  it("MAX_FILTERED_COUNT is the schema's 10,000", () => {
    expect(MAX_FILTERED_COUNT).toBe(10_000);
    expect(MAX_PARTITIONS).toBe(200);
  });
});
