/**
 * A3 / BR-EX-26 — the aggregate exposure verdict.
 *
 * The screen has been ready for this since it was built: `aggregate: null`
 * renders unavailable and it never sums the buckets. What was missing was the
 * reader, so a verdict could not have reached it even if the server sent one.
 *
 * These read forward-compatibly, the same way `sample_counts` does: the field
 * is absent from every published response today, and one test asserts it stays
 * absent so the day it lands this goes red rather than drifting.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { aggregateHeadroomFrom, readBindingExposure } from "./analytics";

const PUBLISHED = JSON.parse(
  readFileSync(
    join(
      __dirname,
      "../../../../../packages/contracts/fixtures/execution-analytics.binding-exposure.valid.json",
    ),
    "utf8",
  ),
);

const withAggregate = (aggregate: unknown) => {
  const raw = JSON.parse(JSON.stringify(PUBLISHED));
  raw.analytics.data.aggregate = aggregate;
  return readBindingExposure(raw)!;
};

const FULL = {
  verdict: "OK",
  headroom: "46800.00",
  virtual_total: "12000.00",
  physical_total: "58800.00",
  currency: "USDT",
  evaluated_by: "execution-cell",
  as_of: "2026-08-22T10:00:00Z",
};

describe("the published response carries no verdict yet (BR-EX-26)", () => {
  it("has none, so the screen's unavailable state is the honest one", () => {
    expect(PUBLISHED.analytics.data.aggregate).toBeUndefined();
    expect(readBindingExposure(PUBLISHED)!.aggregate).toBeNull();
  });

  it("still reads every field the response does carry", () => {
    const exposure = readBindingExposure(PUBLISHED)!;
    expect(exposure.bindingId).toBe("binding-1");
    expect(exposure.buckets).toHaveLength(1);
  });
});

describe("when it lands, it flows through without a screen change", () => {
  it("reads all five figures and attributes the claim", () => {
    const aggregate = withAggregate(FULL).aggregate!;
    expect(aggregate.verdict).toBe("OK");
    // Decimals stay strings, like every other figure on this surface.
    expect(aggregate.headroom).toBe("46800.00");
    expect(aggregate.virtualTotal).toBe("12000.00");
    expect(aggregate.physicalTotal).toBe("58800.00");
    expect(aggregate.evaluatedBy).toBe("execution-cell");
  });

  it("maps onto the shape the screen renders", () => {
    const mapped = aggregateHeadroomFrom(withAggregate(FULL).aggregate)!;
    expect(mapped).toEqual({
      virtualTotal: "12000.00",
      physicalTotal: "58800.00",
      headroom: "46800.00",
      currency: "USDT",
      verdict: "OK",
    });
  });
});

describe("nothing is inferred, in either direction", () => {
  it("treats an unrecognised verdict as no verdict, not as OK", () => {
    expect(withAggregate({ ...FULL, verdict: "PROBABLY_FINE" }).aggregate).toBeNull();
  });

  it("treats an absent verdict as no verdict", () => {
    expect(withAggregate({ headroom: "46800.00" }).aggregate).toBeNull();
    expect(withAggregate(null).aggregate).toBeNull();
  });

  it("refuses a partial verdict rather than rendering it with gaps", () => {
    // Half the working is still no working.
    for (const missing of ["headroom", "virtual_total", "physical_total", "currency"]) {
      const partial = { ...FULL } as Record<string, unknown>;
      delete partial[missing];
      expect(aggregateHeadroomFrom(withAggregate(partial).aggregate), missing).toBeNull();
    }
  });

  it("carries EXCEEDED through as itself", () => {
    expect(withAggregate({ ...FULL, verdict: "EXCEEDED" }).aggregate!.verdict).toBe("EXCEEDED");
  });

  it("carries UNKNOWN through rather than dropping it to null", () => {
    // UNKNOWN is a verdict the server made — a population it could not complete
    // cannot support OK or EXCEEDED, and saying so is different from silence.
    expect(withAggregate({ ...FULL, verdict: "UNKNOWN" }).aggregate!.verdict).toBe("UNKNOWN");
  });
});

describe("the browser never computes it", () => {
  it("does not derive a verdict from the buckets when the server sends none", () => {
    const exposure = readBindingExposure(PUBLISHED)!;
    // The buckets carry headroom figures; the aggregate stays null anyway.
    expect(exposure.buckets[0].headroom).toBeTruthy();
    expect(exposure.aggregate).toBeNull();
  });
});
