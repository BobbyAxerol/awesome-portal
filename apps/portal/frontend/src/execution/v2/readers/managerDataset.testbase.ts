/**
 * Test base shared by `managerDataset.test.ts` and `managerDataset.conformance.test.ts` (tests only; not imported by
 * any screen). It builds every payload from the canonical fixtures Codex publishes (`loadCanonical`), never by hand,
 * and judges payloads against the published OpenAPI schema through the testkit checker.
 *
 * The testkit checker (testkit/schema.ts) judges the published OpenAPI document itself: `propertyNames` (the metric key
 * enum of `items[].metrics`), `maxProperties` and `discriminator` are understood, so no copy of the document is made.
 */
import { canonicalDigest, loadCanonical } from "../testkit/loadCanonical";
import { validateAgainst } from "../testkit/schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Draft = any;

export const OPENAPI = "../openapi/execution-manager-models.openapi.json";
export const DATASET_POINTER = "/components/schemas/ManagerDataset";
export const METRIC_POINTER = "/components/schemas/ManagerMetric";

export const FIXTURE_EMPTY = "execution-manager-dataset.synthetic";
export const FIXTURE_ROWS = "execution-manager-dataset.rows.synthetic";
export const FIXTURE_ALL = "execution-manager-dataset.all-window.synthetic";
/** BE-P1: two rows, two currencies in separate partitions, one group, per-currency capital statements. */
export const FIXTURE_PARTITIONS = "execution-manager-dataset.partitions.synthetic";
/** BE-P1: the negative cases MD-1..MD-8 as operations on FIXTURE_PARTITIONS (not a `.valid.json`, so not a dataset body). */
export const FIXTURE_INVARIANT_CASES = "execution-manager-dataset.invariants.synthetic.negative.json";
export const FIXTURE_METRIC = "execution-manager-metric.derived-reasons.synthetic";
export const DATASET_FIXTURES = [FIXTURE_EMPTY, FIXTURE_ROWS, FIXTURE_ALL, FIXTURE_PARTITIONS] as const;

export const clone = <T,>(value: T): T => structuredClone(value);

/** The `value` of a published `{lane, value}` fixture: a fresh parse every call. */
export function fixtureValue(name: string): Draft {
  return loadCanonical<{ value: Draft }>(name).value;
}

export function fixturesDigest(): string {
  return [...DATASET_FIXTURES, FIXTURE_METRIC, FIXTURE_INVARIANT_CASES].map((name) => canonicalDigest(name)).join(":");
}

/* ───────────── schema judgement ───────────── */

/** Violations of the published `ManagerDataset` schema; empty when the body conforms. */
export function datasetViolations(value: unknown): string[] {
  try {
    return validateAgainst(OPENAPI, DATASET_POINTER, value);
  } catch (error) {
    // `uniqueItems` compares items by their JSON text (testkit checker); a BigInt cannot be written as JSON, so a body
    // holding one inside a list that must be unique is not a JSON body at all: a violation, not a crash.
    if (error instanceof TypeError && /BigInt/.test(error.message)) return ["not JSON: a BigInt value"];
    throw error;
  }
}

/** Violations of the published `ManagerMetric` schema. */
export function metricViolations(value: unknown): string[] {
  return validateAgainst(OPENAPI, METRIC_POINTER, value);
}

/* ───────────── builders ───────────── */

/** A published AVAILABLE money metric (the `net_pnl` of the rows fixture), with overrides. */
export function moneyMetric(overrides: Draft = {}): Draft {
  return {
    ...clone(fixtureValue(FIXTURE_ROWS).items[0].metrics.net_pnl),
    ...overrides,
  };
}

/** A published UNAVAILABLE metric with no unit (the `allocation` of the rows fixture). */
export function absentMetric(overrides: Draft = {}): Draft {
  return { ...clone(fixtureValue(FIXTURE_ROWS).items[0].metrics.allocation), ...overrides };
}

export const partition = (domain: string, currency: string, tag = "a"): Draft => ({
  economic_domain: domain,
  currency,
  basis: "TEST_ONLY:net-ledger",
  native_profile_ref: `TEST_ONLY:${domain.toLowerCase()}-ledger-${tag}`,
  domain_proof_ref: "TEST_ONLY:not-economic-authority",
});

/**
 * The rich base: the rows fixture grown into a page of two rows, one group, two currency partitions of capital and
 * paged by neither cursor. Built from the published fixture; schema-valid (a test asserts it).
 *
 * Row A is the fixture row (a USDT headline above one USDT partition). Row B holds two currencies in two partitions and
 * therefore publishes NO headline figure for `net_pnl`: that is how "no cross-currency total" looks on the wire.
 */
export function richDataset(): Draft {
  const body = fixtureValue(FIXTURE_ROWS);
  const rowA = body.items[0];
  const rowB = clone(rowA);
  rowB.row_key = '["TEST_ONLY:alpha-b","TEST_ONLY:av-b","TEST_ONLY:portfolio"]';
  rowB.alpha_id = "TEST_ONLY:alpha-b";
  rowB.alpha_version_id = "TEST_ONLY:av-b";
  rowB.name = "TEST_ONLY · two currencies";
  rowB.children[0].alpha_id = "TEST_ONLY:alpha-b";
  rowB.children[0].alpha_version_id = "TEST_ONLY:av-b";
  rowB.children[0].deployment_id = "TEST_ONLY:deployment-b";
  rowB.metrics.net_pnl = absentMetric({ reason_code: "MULTI_CURRENCY_NO_SINGLE_TOTAL" });
  rowB.metrics.unrealized_pnl = absentMetric({ reason_code: "MULTI_CURRENCY_NO_SINGLE_TOTAL" });
  const eur = moneyMetric({ currency: "EUR", value: "-12.5" });
  rowB.economic_partitions = [
    { partition: partition("PAPER", "USDT", "usdt"), metrics: { net_pnl: moneyMetric({ value: "100.25" }) } },
    { partition: partition("PAPER", "EUR", "eur"), metrics: { net_pnl: clone(eur) } },
  ];
  body.items = [rowA, rowB];
  body.page = { limit: 100, returned_count: 2, authorized_filtered_count: 2, next_cursor: null, previous_cursor: null };
  body.groups = [{
    key: [{ field: "portfolio_id", value: "TEST_ONLY:portfolio" }],
    unique_row_count: 2,
    totals_scope: "FULL_AUTHORIZED_FILTERED_QUERY",
    economic_partitions: [
      { partition: partition("PAPER", "USDT", "usdt"), metrics: { net_pnl: moneyMetric({ value: "100.25" }) } },
      { partition: partition("PAPER", "EUR", "eur"), metrics: { net_pnl: clone(eur) } },
    ],
  }];
  body.capital_statements = [
    { partition: partition("PAPER", "USDT", "usdt"), metrics: { balance_total: moneyMetric({ value: "1000.50" }) } },
    { partition: partition("PAPER", "EUR", "eur"), metrics: { balance_total: moneyMetric({ currency: "EUR", value: "900" }) } },
  ];
  return body;
}
