/**
 * Render tests for the U02 semantic components.
 *
 * The point of these is not that a badge renders — it is that the seven
 * required states stay *distinguishable in the DOM*, and that a metric with no
 * authority never emits a digit.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { CapabilityAvailability, SummaryMetric } from "../portal/contracts";
import { AvailabilityBadge, EnvironmentBadge, FreshnessIndicator, MaturityBadge, MetricCell, MetricValue } from "./semantic";
import { StateView } from "./ui";

afterEach(cleanup);

function availability(
  overrides: Partial<CapabilityAvailability> = {},
): CapabilityAvailability {
  return {
    as_of: null,
    authority: { contract: "test.v1", endpoint: null, service: "portal-api" },
    checked_at: "2026-08-15T18:00:00Z",
    detail: null,
    provenance: { content_digest: null, source_revision: null },
    reason_code: null,
    retryable: false,
    stale_after_seconds: null,
    state: "available",
    ...overrides,
  };
}

function metric(overrides: Partial<SummaryMetric> = {}): SummaryMetric {
  return {
    availability: availability(),
    segment: null,
    source_artifact_digest: null,
    timezone: null,
    unit: "runs",
    value: 3,
    ...overrides,
  };
}

describe("AvailabilityBadge", () => {
  it("tags the DOM with the runtime state for every contract value", () => {
    for (const state of [
      "available",
      "degraded",
      "stale",
      "unavailable",
      "denied",
      "commissioned",
    ] as const) {
      const { container, unmount } = render(<AvailabilityBadge state={state} />);
      expect(container.querySelector(`[data-availability="${state}"]`)).not.toBeNull();
      unmount();
    }
  });

  it("surfaces the reason code as an accessible explanation", () => {
    const { container } = render(
      <AvailabilityBadge state="denied" reasonCode="PERMISSION_DENIED" />,
    );
    const badge = container.querySelector("[data-availability='denied']");
    expect(badge?.getAttribute("title")).toContain("read access");
  });
});

describe("MaturityBadge", () => {
  it("renders nothing for AVAILABLE so it does not add noise", () => {
    const { container } = render(<MaturityBadge maturity="AVAILABLE" />);
    expect(container.firstChild).toBeNull();
  });

  it("marks commissioned with a dashed SOON badge", () => {
    const { container } = render(<MaturityBadge maturity="COMMISSIONED" />);
    const badge = container.querySelector("[data-maturity='COMMISSIONED']");
    expect(badge?.textContent).toBe("SOON");
    expect(badge?.className).toContain("badge-maturity-dashed");
  });
});

describe("EnvironmentBadge", () => {
  it("prints the environment in upper case", () => {
    render(<EnvironmentBadge environment="research" />);
    expect(screen.getByText("RESEARCH")).toBeTruthy();
  });
});

describe("FreshnessIndicator", () => {
  it("says so when the source published no as-of", () => {
    render(<FreshnessIndicator availability={availability()} />);
    expect(screen.getByText(/as-of not published/)).toBeTruthy();
  });

  it("shows relative age with an absolute tooltip", () => {
    const { container } = render(
      <FreshnessIndicator
        availability={availability({ as_of: "2026-08-15T17:58:00Z" })}
        now={new Date("2026-08-15T18:00:00Z")}
      />,
    );
    const node = container.firstElementChild;
    expect(node?.textContent).toBe("2m ago");
    expect(node?.getAttribute("data-stale")).toBe("false");
    expect(node?.getAttribute("title")).toBeTruthy();
  });

  it("flags staleness only against a declared window", () => {
    const { container } = render(
      <FreshnessIndicator
        availability={availability({ as_of: "2026-08-15T17:00:00Z", stale_after_seconds: 600 })}
        now={new Date("2026-08-15T18:00:00Z")}
      />,
    );
    expect(container.firstElementChild?.getAttribute("data-stale")).toBe("true");
  });
});

describe("MetricValue", () => {
  it("renders a real zero", () => {
    const { container } = render(<MetricValue metric={metric({ value: 0 })} />);
    expect(container.querySelector(".metric-value")?.textContent).toBe("0");
  });

  it("renders a state badge — not a digit — when the value is null", () => {
    const { container } = render(
      <MetricValue
        metric={metric({
          value: null,
          availability: availability({ state: "unavailable", reason_code: "LOCAL_ONLY_STATE" }),
        })}
      />,
    );
    expect(container.querySelector(".metric-value")).toBeNull();
    expect(container.querySelector(".metric-absent")).not.toBeNull();
    expect(container.textContent).not.toMatch(/\b0\b|N\/A/);
  });

  it("renders a state badge when there is no metric at all", () => {
    const { container } = render(<MetricValue metric={null} />);
    expect(container.querySelector(".metric-value")).toBeNull();
    expect(container.textContent).not.toMatch(/\b0\b/);
  });

  it("hides the unit when there is no value to attach it to", () => {
    const { container } = render(
      <MetricCell
        // A label that does not itself contain the unit word, so the assertion
        // below can only be satisfied by the unit really being withheld.
        label="Executed backtests"
        unit="runs"
        metric={metric({ value: null, availability: availability({ state: "denied" }) })}
      />,
    );
    expect(container.textContent).not.toContain("runs");
  });

  it("shows the unit alongside a real value", () => {
    const { container } = render(<MetricCell label="Total runs" unit="runs" metric={metric()} />);
    expect(container.textContent).toContain("runs");
    expect(container.querySelector(".metric-value")?.textContent).toBe("3");
  });
});

describe("StateView", () => {
  it("keeps every required state distinguishable in the DOM", () => {
    const seen = new Set<string>();
    for (const kind of [
      "empty",
      "partial",
      "stale",
      "denied",
      "unavailable",
      "commissioned",
      "failed",
      "cancelled",
    ] as const) {
      const { container, unmount } = render(<StateView kind={kind} />);
      const node = container.querySelector(`[data-state="${kind}"]`);
      expect(node, `missing state ${kind}`).not.toBeNull();
      const text = node?.textContent ?? "";
      expect(seen.has(text), `state ${kind} reuses copy "${text}"`).toBe(false);
      seen.add(text);
      unmount();
    }
  });

  it("marks loading as a live region rather than a data state", () => {
    const { container } = render(<StateView kind="loading" />);
    expect(container.querySelector("[role='status']")).not.toBeNull();
    expect(container.querySelector("[data-state]")).toBeNull();
  });

  it("offers retry only where retrying is meaningful", () => {
    const noop = () => {};
    expect(render(<StateView kind="denied" onRetry={noop} />).container.querySelector("button")).toBeNull();
    cleanup();
    expect(render(<StateView kind="failed" onRetry={noop} />).container.querySelector("button")).not.toBeNull();
  });
});
