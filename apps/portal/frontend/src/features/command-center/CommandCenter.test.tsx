/**
 * U03 exit-gate tests for the Command Center.
 *
 * Driven by the canonical fixtures rather than hand-made objects, so what is
 * asserted here is the real contract: for each shipped scenario the screen
 * must land in a distinguishable state and must never turn a missing number
 * into a zero.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PortalContext } from "../../app/context";
import type { PortalRegistryDocument, PortalSummaryV1 } from "../../portal/contracts";
import { CommandCenter } from "./CommandCenter";

const FIXTURES = join(process.cwd(), "../registry/fixtures");

const registry: PortalRegistryDocument = JSON.parse(
  readFileSync(join(FIXTURES, "registry.public.json"), "utf8"),
);

function summaryFixture(name: string): PortalSummaryV1 {
  return JSON.parse(readFileSync(join(FIXTURES, `summary.${name}.json`), "utf8"));
}

const originalFetch = globalThis.fetch;

function mountWith(summary: PortalSummaryV1 | { status: number; requestId?: string }) {
  globalThis.fetch = (async () => {
    if ("status" in summary) {
      return new Response(
        JSON.stringify({
          error: { code: "SUMMARY_CONTRACT_FAILURE", message: "aggregator failed" },
          request_id: summary.requestId ?? "req-test",
        }),
        {
          status: summary.status,
          headers: { "X-Request-ID": summary.requestId ?? "req-test" },
        },
      );
    }
    return new Response(JSON.stringify(summary), { status: 200 });
  }) as unknown as typeof fetch;

  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PortalContext.Provider value={{ registry, environment: "research" }}>
          <CommandCenter />
        </PortalContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Sections are addressed by their stable feature id, not by their label —
 *  the label is backend copy and may change without changing the contract. */
function sectionFor(featureId: string): HTMLElement {
  const heading = document.getElementById(`section-${featureId}`);
  const section = heading?.closest("section");
  if (!section) throw new Error(`section not rendered for ${featureId}`);
  return section as HTMLElement;
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("Command Center — healthy", () => {
  it("renders real counts from the summary authority", async () => {
    mountWith(summaryFixture("healthy"));
    const section = await waitFor(() => sectionFor("QUANTBT_RESEARCH"));
    expect(within(section).getByText("Tổng số run").parentElement?.textContent).toContain("3");
  });

  it("shows the registry maturity counts, not a frontend tally", async () => {
    const fixture = summaryFixture("healthy");
    mountWith(fixture);
    await waitFor(() => expect(screen.getByText("COMMISSIONED")).toBeTruthy());
    const commissioned = screen.getByText("COMMISSIONED").parentElement;
    expect(commissioned?.textContent).toContain(String(fixture.registry_counts.by_maturity.COMMISSIONED));
  });

  it("offers the highest-priority item as the primary action", async () => {
    const fixture = summaryFixture("healthy");
    mountWith(fixture);
    const link = await screen.findByRole("link", { name: "Mở mục ưu tiên cao nhất" });
    expect(link.getAttribute("href")).toBe(fixture.priority_items[0].route);
  });
});

describe("Command Center — empty", () => {
  it("renders a real zero as a number", async () => {
    mountWith(summaryFixture("empty"));
    const section = await waitFor(() => sectionFor("QUANTBT_RESEARCH"));
    expect(within(section).getByText("Tổng số run").parentElement?.textContent).toContain("0");
  });

  it("says the zero is evidenced rather than unknown", async () => {
    mountWith(summaryFixture("empty"));
    await waitFor(() => expect(screen.getAllByText(/số 0 thật từ authority/).length).toBeGreaterThan(0));
  });
});

describe("Command Center — partial (Planning local-only)", () => {
  it("keeps QuantBT numbers while marking Planning unavailable", async () => {
    mountWith(summaryFixture("partial"));
    const quantbt = await waitFor(() => sectionFor("QUANTBT_RESEARCH"));
    expect(within(quantbt).getByText("Tổng số run").parentElement?.textContent).toContain("3");

    const planning = sectionFor("PLANNING");
    expect(planning.querySelector("[data-availability='unavailable']")).not.toBeNull();
  });

  it("renders no digit at all inside the Planning card", async () => {
    mountWith(summaryFixture("partial"));
    const planning = await waitFor(() => sectionFor("PLANNING"));
    const metricValues = planning.querySelectorAll(".metric-value");
    expect(metricValues.length).toBe(0);
  });

  it("explains the local-only reason instead of leaving a blank card", async () => {
    mountWith(summaryFixture("partial"));
    const planning = await waitFor(() => sectionFor("PLANNING"));
    expect(planning.textContent).toContain("local-first");
  });
});

describe("Command Center — denied", () => {
  it("marks Planning denied and offers no automatic retry", async () => {
    mountWith(summaryFixture("denied"));
    const planning = await waitFor(() => sectionFor("PLANNING"));
    expect(planning.querySelector("[data-availability='denied']")).not.toBeNull();
    expect(within(planning).queryByRole("button", { name: "Thử lại" })).toBeNull();
    expect(planning.querySelectorAll(".metric-value").length).toBe(0);
  });
});

describe("Command Center — stale", () => {
  it("flags the section stale while still showing its real numbers", async () => {
    mountWith(summaryFixture("stale"));
    const quantbt = await waitFor(() => sectionFor("QUANTBT_RESEARCH"));
    expect(quantbt.querySelector("[data-availability='stale']")).not.toBeNull();
    expect(within(quantbt).getByText("Tổng số run").parentElement?.textContent).toContain("3");
  });
});

describe("Command Center — unavailable", () => {
  it("shows no metric value anywhere when both sources are down", async () => {
    mountWith(summaryFixture("unavailable"));
    await waitFor(() => expect(sectionFor("QUANTBT_RESEARCH")).toBeTruthy());
    expect(document.querySelectorAll(".metric-value").length).toBe(0);
  });

  it("states explicitly that nothing was substituted with zero", async () => {
    mountWith(summaryFixture("unavailable"));
    await waitFor(() =>
      expect(screen.getAllByText(/Không có giá trị nào được thay bằng 0/).length).toBeGreaterThan(0),
    );
  });
});

describe("Command Center — terminal failure", () => {
  it("renders the request id so the failure can be reported", async () => {
    mountWith({ status: 500, requestId: "req-abc-123" });
    await waitFor(() => expect(screen.getByText(/request_id req-abc-123/)).toBeTruthy());
    expect(document.querySelectorAll(".metric-value").length).toBe(0);
  });

  it("offers retry for a retryable failure", async () => {
    mountWith({ status: 500 });
    await waitFor(() => expect(screen.getByRole("button", { name: "Thử lại" })).toBeTruthy());
  });

  it("does not offer retry for a permission failure", async () => {
    mountWith({ status: 403 });
    await waitFor(() => expect(screen.getByText(/Summary contract lỗi/)).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Thử lại" })).toBeNull();
  });
});

describe("Command Center — state separation", () => {
  it("produces a distinguishable overall badge per fixture", async () => {
    const seen = new Map<string, string>();
    for (const name of ["healthy", "partial", "unavailable"]) {
      mountWith(summaryFixture(name));
      const badge = await waitFor(() => {
        const node = document.querySelector(".portal-module-header [data-availability]");
        if (!node) throw new Error("overall availability badge not rendered yet");
        return node;
      });
      seen.set(name, badge.getAttribute("data-availability") ?? "");
      cleanup();
    }
    expect(seen.get("healthy")).toBe("available");
    expect(seen.get("partial")).toBe("degraded");
    expect(seen.get("unavailable")).toBe("unavailable");
  });
});
