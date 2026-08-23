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
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  aggregateHeadroomFrom,
  envelopeFromAnalytics,
  readAnalyticsEnvelope,
  readBindingExposure,
} from "./analytics";
import { ExposureHeadroomContainer } from "./screens/containers";
import { createFixtureApi } from "./api/fixtureApi";
import type { ExecutionApi } from "./api/ports";

afterEach(cleanup);

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

/* ---------------------------------------------------------------------------
 * The container — where the verdict finally reaches a screen.
 * ------------------------------------------------------------------------ */

describe("the envelope conversion carries the right claim", () => {
  it("takes asOf from the input, not from when the connector read it", () => {
    const analytics = readAnalyticsEnvelope(PUBLISHED)!;
    const envelope = envelopeFromAnalytics(analytics);
    // Substituting readAt would turn a stale figure into a fresh-looking one.
    expect(envelope.asOf).toBe(analytics.inputAsOf);
    if (analytics.readAt && analytics.inputAsOf && analytics.readAt !== analytics.inputAsOf) {
      expect(envelope.asOf).not.toBe(analytics.readAt);
    }
  });

  it("takes freshness from the worst input rather than an average", () => {
    // The published fixture's floor is OK, so reading it from the fixture would
    // compare OK to OK and pass against a hard-coded constant. A STALE floor is
    // the only version of this test that proves anything.
    const raw = JSON.parse(JSON.stringify(PUBLISHED));
    raw.analytics.input_freshness_floor = "STALE";
    const analytics = readAnalyticsEnvelope(raw)!;
    expect(analytics.inputFreshnessFloor).toBe("STALE");
    expect(envelopeFromAnalytics(analytics).freshness).toBe("STALE");
  });

  it("carries the source profile through, so fixture cannot present as live", () => {
    // Same trap: the fixture publishes no `source_profile` at all, so both
    // sides of the comparison were null.
    const raw = JSON.parse(JSON.stringify(PUBLISHED));
    raw.analytics.source_profile = "fixture";
    const analytics = readAnalyticsEnvelope(raw)!;
    expect(analytics.sourceProfile).toBe("fixture");
    expect(envelopeFromAnalytics(analytics).deliveryProfile).toBe("fixture");
  });
});

describe("the headroom banner is fed from the port", () => {
  it("renders unavailable while the server publishes no verdict", async () => {
    render(<ExposureHeadroomContainer api={createFixtureApi()} bindingId="binding-1" />);
    // The published fixture carries no aggregate, so this is what a live
    // Account/Broker screen would show today.
    expect(await screen.findByText(/has not been published for this binding/)).toBeTruthy();
  });

  it("never falls back to summing the buckets", async () => {
    const { container } = render(
      <ExposureHeadroomContainer api={createFixtureApi()} bindingId="binding-1" />,
    );
    await screen.findByText(/has not been published/);
    // The buckets carry headroom figures; none of them reaches the banner.
    expect(container.textContent).not.toMatch(/\b90\b/);
  });

  it("renders the verdict once the server sends one", async () => {
    const base = createFixtureApi();
    const api: ExecutionApi = {
      ...base,
      async getBindingExposure(bindingId) {
        const result = await base.getBindingExposure(bindingId);
        if (!result.ok) return result;
        return {
          ...result,
          value: {
            ...result.value,
            exposure: withAggregate(FULL),
          },
        };
      },
    };
    render(<ExposureHeadroomContainer api={api} bindingId="binding-1" />);
    await waitFor(() => expect(screen.queryByText(/has not been published/)).toBeNull());
    expect(screen.getByText(/46,800|46800/)).toBeTruthy();
  });

  it("shows the port's failure rather than an unavailable verdict", async () => {
    render(
      <ExposureHeadroomContainer
        api={createFixtureApi({ unavailableEndpoints: ["getBindingExposure"] })}
        bindingId="binding-1"
      />,
    );
    // "The endpoint is down" and "no verdict was published" are different
    // things, and the banner's own copy is for the second.
    await waitFor(() => expect(screen.queryByText(/has not been published/)).toBeNull());
  });
});
