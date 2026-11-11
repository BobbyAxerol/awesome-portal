/**
 * BE-B1: the reader side of the two PERCENT partition keys (`win_rate_pct`, `max_drawdown_pct`), the emitted metric `effective_at_ms` and the
 * per-deployment `allocation_effective_at_ms` on a row child. All additive and optional: absent = not published, never inferred; present and
 * invalid voids the read of the thing that carries it (there is no partial trust).
 */
import { describe, expect, it } from "vitest";

import { readManagerDataset } from "./managerDataset";
import { FIXTURE_PERCENT_FIGURES, clone, fixtureValue } from "./managerDataset.testbase";

describe("BE-B1 percent figures and allocation time on the published fixture", () => {
  const read = (body: unknown) => {
    const result = readManagerDataset(body);
    return result !== null && result.kind === "dataset" ? result.dataset : null;
  };

  it("reads a win rate and a drawdown from a row's partition as PERCENT values, the win rate with its own time", () => {
    const dataset = read(fixtureValue(FIXTURE_PERCENT_FIGURES));
    expect(dataset).not.toBeNull();
    const row = dataset!.items[0]!;
    const metrics = row.economicPartitions[0]!.metrics;
    expect(metrics.get("win_rate_pct")).toMatchObject({ kind: "value", unit: "PERCENT", exact: "58.3" });
    expect(metrics.get("win_rate_pct")!.effectiveAtMs).toBeLessThan(dataset!.asOfMs);
    expect(metrics.get("max_drawdown_pct")).toMatchObject({ kind: "value", unit: "PERCENT" });
    expect(metrics.get("max_drawdown_pct")!.effectiveAtMs).toBeNull();
  });

  it("omission is Not published: the two-currency row has no win rate key at all", () => {
    const dataset = read(fixtureValue(FIXTURE_PERCENT_FIGURES))!;
    for (const partition of dataset.items[1]!.economicPartitions) expect(partition.metrics.has("win_rate_pct")).toBe(false);
  });

  it("carries the allocation time of a deployment on its child, and no property when the source stated none", () => {
    const dataset = read(fixtureValue(FIXTURE_PERCENT_FIGURES))!;
    expect(dataset.items[0]!.children[0]!.allocationEffectiveAtMs).toBeLessThan(dataset.asOfMs);
    expect(dataset.items[1]!.children[0]).not.toHaveProperty("allocationEffectiveAtMs");
  });

  it.each([["a string", "1"], ["a fraction", 1.5], ["a negative", -1], ["null", null], ["past the schema maximum", Number.MAX_SAFE_INTEGER + 1]])("voids the dataset when a child's allocation time is %s", (_name, bad) => {
    const body = clone(fixtureValue(FIXTURE_PERCENT_FIGURES));
    body.items[0].children[0].allocation_effective_at_ms = bad;
    expect(read(body)).toBeNull();
  });
});
