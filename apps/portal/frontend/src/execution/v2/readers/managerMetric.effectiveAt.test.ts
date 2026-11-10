/**
 * UXM-07 WP-2: the optional `effective_at_ms` of `ManagerMetric` (additive; absent = not published, never inferred). The reader keeps it as
 * `effectiveAtMs` when it is a UTC-ms integer, reads `null` when the key is absent, and voids the metric when the key is present and invalid
 * (a string, a fraction, a negative, null, a number past the schema maximum): there is no partial trust.
 */
import { describe, expect, it } from "vitest";

import { readManagerDataset } from "./managerDataset";
import { readManagerMetric } from "./managerMetric";
import { FIXTURE_STATEMENT_TIMES, fixtureValue, moneyMetric } from "./managerDataset.testbase";

describe("ManagerMetric.effective_at_ms", () => {
  const AT = Date.UTC(2026, 6, 12, 12, 0);

  it("is carried as effectiveAtMs on a value and on an absence, and is null when the source published none", () => {
    expect(readManagerMetric(moneyMetric({ value: "1", effective_at_ms: AT }))).toMatchObject({ kind: "value", effectiveAtMs: AT });
    expect(readManagerMetric(moneyMetric({ value: "1" }))).toMatchObject({ kind: "value", effectiveAtMs: null });
    const absent = moneyMetric({ value: null, availability: "UNAVAILABLE", reason_code: "SOURCE_FACTS_NOT_PUBLISHED", effective_at_ms: AT });
    expect(readManagerMetric(absent)).toMatchObject({ kind: "absent", effectiveAtMs: AT });
  });

  it.each([["a string", String(AT)], ["a fraction", AT + 0.5], ["a negative", -1], ["null", null], ["past the schema maximum", Number.MAX_SAFE_INTEGER + 1], ["not a number", Number.NaN]])("voids the metric when the key is %s", (_name, bad) => {
    expect(readManagerMetric(moneyMetric({ value: "1", effective_at_ms: bad }))).toBeNull();
  });

  it("the published statement-times fixture reads: funds, return, budget and allocation carry a time in order, added funds none", () => {
    const read = readManagerDataset(fixtureValue(FIXTURE_STATEMENT_TIMES));
    expect(read).not.toBeNull();
    expect(read!.kind).toBe("dataset");
    const dataset = (read as { dataset: { asOfMs: number; capitalStatements: { metrics: ReadonlyMap<string, { effectiveAtMs: number | null }> }[] } }).dataset;
    const at = (key: string) => dataset.capitalStatements[0]!.metrics.get(key)!.effectiveAtMs;
    expect(at("added_funds")).toBeNull();
    expect(at("net_external_flows")).toBeNull();
    expect(at("initial_funds")!).toBeLessThan(at("returned_capital")!);
    expect(at("returned_capital")!).toBeLessThan(at("current_budget")!);
    expect(at("current_budget")!).toBeLessThan(at("allocation")!);
    expect(at("allocation")!).toBeLessThan(dataset.asOfMs);
  });
});
