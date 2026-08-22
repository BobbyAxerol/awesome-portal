/**
 * Full Blotter tests (phase 14).
 *
 * The blotter's failure mode is not a crash, it is a number that looks right.
 * So most of what follows checks that a figure on screen means what a reader
 * would take it to mean: that a count describes the population the rows came
 * from, that a filter did not quietly happen in the browser, and that a hop
 * nobody observed is not drawn as one that was.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { readOrderFunnel } from "./analytics";
import {
  FUNNEL_COMPLETE,
  FUNNEL_MISSING_BROKER_ACK,
  FUNNEL_SUBMIT_ONLY,
} from "./analytics.fixtures";
import {
  BLOTTER_CROSS_FILTER,
  BLOTTER_SELECTION,
  BLOTTER_TOTAL,
  blotterPage,
} from "./blotter.fixtures";
import type { Envelope } from "./contracts";
import { FullBlotter, OrderFunnelStrip, bucketOf, hopDelta } from "./screens/FullBlotter";

afterEach(cleanup);

const ENVELOPE: Envelope = {
  authority: "EXECUTION",
  asOf: "2026-08-22T10:42:01Z",
  freshness: "OK",
};

function blotter(over: Record<string, unknown> = {}) {
  return (
    <FullBlotter
      envelope={ENVELOPE}
      page={blotterPage()}
      filter="ALL"
      {...over}
    />
  );
}

describe("Full Blotter — numbers say what they mean", () => {
  it("never abbreviates a count, a price or a fee", () => {
    render(blotter());
    // 48,213 grouped, not "48.2k". A blotter that rounds cannot be reconciled
    // against a venue statement, which is its only job.
    expect(screen.getByText("48,213")).toBeTruthy();
    expect(screen.getByText("60,890.00")).toBeTruthy();
    expect(screen.getByText(/0\.4899/)).toBeTruthy();
  });

  it("keeps a partial fill's two quantities together", () => {
    render(blotter());
    // "0.9000" alone would read as the order size.
    expect(screen.getByText("0.9000/1.2000")).toBeTruthy();
  });

  it("states a market order's missing limit price rather than inventing one", () => {
    render(blotter());
    expect(screen.getByText("no limit price")).toBeTruthy();
  });

  it("shows a rejection reason on the row, not behind an interaction", () => {
    render(blotter());
    expect(screen.getByText(/risk: max position notional/)).toBeTruthy();
  });

  it("shows a selection beside the total, never instead of it", () => {
    // Both, always. "412 in selection" alone leaves a reader with no idea what
    // fraction of the book they are looking at.
    render(blotter({ page: blotterPage("FILLED"), crossFilter: BLOTTER_CROSS_FILTER }));
    expect(screen.getByText(String(BLOTTER_SELECTION))).toBeTruthy();
    expect(screen.getByText("48,213")).toBeTruthy();
  });

  it("takes both counts from the page rather than keeping its own", () => {
    // One source. A screen holding a second copy of a count is how a footer
    // and a table come to disagree.
    const page = blotterPage();
    expect(page.totalCount).toBe(BLOTTER_TOTAL);
    expect(page.filteredCount).toBe(BLOTTER_TOTAL);
    expect(blotterPage("FILLED").filteredCount).toBe(BLOTTER_SELECTION);
  });
});

describe("Full Blotter — the chips re-query, they do not hide rows", () => {
  it("reports a filter change instead of filtering what is loaded", () => {
    const onFilterChange = vi.fn();
    render(blotter({ onFilterChange }));
    screen.getByRole("button", { name: "Rejected" }).click();
    expect(onFilterChange).toHaveBeenCalledWith("REJECTED");
    // Still every row: the screen did not filter, the server will.
    expect(screen.getByText("ord_8712")).toBeTruthy();
  });

  it("says so on the screen, where a reader can check it", () => {
    render(blotter());
    expect(screen.getByText(/applied by the server/)).toBeTruthy();
  });

  it("marks the active chip", () => {
    render(blotter({ filter: "FILLED" }));
    expect(screen.getByRole("button", { name: "Filled" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "All" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("buckets a triggered stop as open, because it is live in the book", () => {
    expect(bucketOf("TRIGGERED")).toBe("OPEN");
    expect(bucketOf("PARTIALLY_FILLED")).toBe("PARTIAL");
    expect(bucketOf("DENIED")).toBe("REJECTED");
    // Reachable only through ALL, and that is recorded rather than silent.
    expect(bucketOf("CANCELED")).toBeNull();
  });

  it("resets a cross-filter and hands the count back to the caller", () => {
    const onResetCrossFilter = vi.fn();
    render(
      blotter({
        selectionCount: BLOTTER_SELECTION,
        crossFilter: BLOTTER_CROSS_FILTER,
        onResetCrossFilter,
      }),
    );
    screen.getByRole("button", { name: /Reset the cross-filter/ }).click();
    expect(onResetCrossFilter).toHaveBeenCalledOnce();
  });
});

describe("Full Blotter — the funnel draws what the source published", () => {
  it("renders all four stages for a complete order", () => {
    render(<OrderFunnelStrip funnel={readOrderFunnel(FUNNEL_COMPLETE)} status="ok" />);
    for (const hop of ["submit", "risk grant", "order ACK", "fill"]) {
      expect(screen.getByText(hop)).toBeTruthy();
    }
  });

  it("draws an unobserved broker ack as not observed, never as observed", () => {
    render(<OrderFunnelStrip funnel={readOrderFunnel(FUNNEL_MISSING_BROKER_ACK)} status="ok" />);
    expect(screen.getByText("not observed")).toBeTruthy();
    expect(screen.getByText(/A later stage does not imply an earlier one/)).toBeTruthy();
  });

  it("keeps three stages visible when only the submit was seen", () => {
    render(<OrderFunnelStrip funnel={readOrderFunnel(FUNNEL_SUBMIT_ONLY)} status="ok" />);
    expect(screen.getAllByText("not observed")).toHaveLength(3);
  });

  it("lists multiple fills in the server's order", () => {
    const { container } = render(
      <OrderFunnelStrip funnel={readOrderFunnel(FUNNEL_COMPLETE)} status="ok" />,
    );
    const fills = container.querySelector(".exec-funnel-fills")!;
    expect([...fills.querySelectorAll("li")].map((li) => li.textContent)).toEqual([
      expect.stringContaining("400"),
      expect.stringContaining("350"),
      expect.stringContaining("250"),
    ]);
  });

  it("shows a hop delta beside both timestamps it came from", () => {
    // A derived number is honest when the reader can check it. 09:15:02.114 to
    // 09:15:02.402 is 288ms, and both are on screen.
    render(<OrderFunnelStrip funnel={readOrderFunnel(FUNNEL_COMPLETE)} status="ok" />);
    expect(screen.getByText(/2026-08-22T09:15:02\.114Z/)).toBeTruthy();
    expect(screen.getByText(/2026-08-22T09:15:02\.402Z/)).toBeTruthy();
    expect(screen.getByText(/\+288ms/)).toBeTruthy();
  });

  it("returns null rather than zero for a delta it cannot compute", () => {
    // "+0ms" claims two events were simultaneous. Not knowing is weaker.
    expect(hopDelta(null, "2026-08-22T09:15:02.402Z")).toBeNull();
    expect(hopDelta("2026-08-22T09:15:02.114Z", null)).toBeNull();
    expect(hopDelta("2026-08-22T09:15:02.114Z", "2026-08-22T09:15:02.402Z")).toBe(288);
  });

  it("says the wireframe's two upstream hops are not carried by this endpoint", () => {
    render(<OrderFunnelStrip funnel={readOrderFunnel(FUNNEL_COMPLETE)} status="ok" />);
    expect(screen.getByText(/are upstream of the order/)).toBeTruthy();
  });

  it("renders a panel state rather than an empty rail while the funnel loads", () => {
    render(<OrderFunnelStrip funnel={null} status="loading" />);
    expect(screen.queryByText("submit")).toBeNull();
  });

  it("expands the funnel under the row that was clicked", () => {
    const { container } = render(
      blotter({
        expandedOrderId: "ord_88a2",
        funnel: readOrderFunnel(FUNNEL_COMPLETE),
        funnelStatus: "ok",
      }),
    );
    const panel = container.querySelector(".exec-blotter-funnel") as HTMLElement;
    expect(within(panel).getByText(/ord_88a2 — order funnel/)).toBeTruthy();
  });

  it("reports the clicked row rather than fetching a funnel itself", () => {
    const onExpand = vi.fn();
    render(blotter({ onExpand }));
    screen.getByText("ord_88a2").click();
    expect(onExpand).toHaveBeenCalledOnce();
    expect(onExpand.mock.calls[0][0].orderId).toBe("ord_88a2");
  });
});

describe("Full Blotter — keyset, never offset", () => {
  it("offers an older page by cursor and never a page number", () => {
    render(blotter({ onLoadOlder: vi.fn() }));
    expect(screen.getByText(/c_ab34/)).toBeTruthy();
    expect(screen.queryByText(/page 1/i)).toBeNull();
  });

  it("carries no older cursor once a filter has narrowed the page", () => {
    // The cursor belongs to the query that produced it; a filter change voids
    // it, and offering it would page into a different population.
    expect(blotterPage("REJECTED").nextCursor).toBeNull();
    expect(blotterPage().nextCursor).toBe("c_ab34e91f7720");
  });
});

describe("Full Blotter — a funnel at the volume a real order produces", () => {
  function manyFills(n: number) {
    return {
      analytics: {
        data: {
          order_id: "ord_big",
          stages: [
            {
              stage: "FILL",
              state: "OBSERVED",
              events: Array.from({ length: n }, (_, i) => ({
                stage: "FILL",
                source_authority: "BROKER",
                source_id: `fill-${i}`,
                occurred_at: `2026-08-22T09:${String(i % 60).padStart(2, "0")}:00.000Z`,
                quantity: `${i + 1}`,
                quality: {
                  source_authority: "BROKER",
                  freshness_state: "OK",
                  completeness: "COMPLETE",
                  as_of: null,
                },
              })),
            },
          ],
        },
      },
    };
  }

  it("caps 1,203 fills instead of turning one row into a page", () => {
    const { container } = render(
      <OrderFunnelStrip funnel={readOrderFunnel(manyFills(1203))} status="ok" />,
    );
    expect(container.querySelectorAll(".exec-funnel-fills li").length).toBeLessThanOrEqual(12);
    expect(screen.getByText(/showing 12 of 1,203 fills/)).toBeTruthy();
  });

  it("keeps the last fill, which is the one that closed the order", () => {
    // A head-cap is exactly the cap that drops it.
    const { container } = render(
      <OrderFunnelStrip funnel={readOrderFunnel(manyFills(1203))} status="ok" />,
    );
    const items = [...container.querySelectorAll(".exec-funnel-fills li")];
    expect(items.at(-1)!.textContent).toContain("1203");
  });

  it("leaves the hi-fi's three fills uncapped and unqualified", () => {
    render(<OrderFunnelStrip funnel={readOrderFunnel(FUNNEL_COMPLETE)} status="ok" />);
    expect(screen.queryByText(/showing 3 of/)).toBeNull();
  });
});
