/**
 * Alpha 360° tests (phase 15).
 *
 * Two scales, deliberately. The wireframe's cast proves the design; the
 * runtime's proves it survives the Trading System. Where a test asserts a
 * number it comes from `workload-profile.md` — 85 accounts, 82 symbols, 16
 * Binance shards, and no retention policy on orders, fills or domain_events.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ALPHA_TABS, AlphaThreeSixty } from "./screens/AlphaThreeSixty";
import {
  accountingAtScale,
  alpha360,
  alpha360AtScale,
  auditAtScale,
  deploymentsAtScale,
  positionsAtScale,
  sessionsAtScale,
  venuesAtScale,
} from "./alpha360.fixtures";
import { alphaHandlers } from "./testHandlers";

afterEach(cleanup);

describe("Alpha 360° — one scope, obeyed by every tab", () => {
  it("offers all nine tabs", () => {
    render(<AlphaThreeSixty {...alphaHandlers()} {...alpha360()} />);
    for (const tab of ALPHA_TABS) {
      expect(screen.getByRole("tab", { name: tab })).toBeTruthy();
    }
    expect(ALPHA_TABS).toHaveLength(9);
  });

  it("reports a scope change once, rather than each tab holding its own", () => {
    const onScopeChange = vi.fn();
    render(<AlphaThreeSixty {...alphaHandlers()} {...alpha360()} onScopeChange={onScopeChange} />);
    const venue = screen.getByLabelText("Venue") as HTMLSelectElement;
    venue.value = "OKX";
    venue.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onScopeChange).toHaveBeenCalledWith(
      expect.objectContaining({ venue: "OKX", portfolio: "PF-CRYPTO", window: "30d" }),
    );
  });

  it("takes its venue list from the registry rather than a hardcoded set", () => {
    const props = alpha360({ venueOptions: ["All", "NEW-VENUE"] });
    render(<AlphaThreeSixty {...alphaHandlers()} {...props} />);
    const venue = screen.getByLabelText("Venue");
    expect(within(venue).getByText("NEW-VENUE")).toBeTruthy();
    expect(within(venue).queryByText("BINANCE")).toBeNull();
  });

  it("names the scope on the panel that is filtered by it", () => {
    render(<AlphaThreeSixty {...alphaHandlers()} {...alpha360()} />);
    expect(screen.getByText(/Deployments in scope — All/)).toBeTruthy();
  });

  it("renders one tab at a time and says which", () => {
    const { rerender } = render(<AlphaThreeSixty {...alphaHandlers()} {...alpha360()} />);
    expect(screen.getByText(/Deployment map/)).toBeTruthy();
    rerender(<AlphaThreeSixty {...alphaHandlers()} {...alpha360({ tab: "Risk" })} />);
    expect(screen.queryByText(/Deployment map/)).toBeNull();
    expect(screen.getByText("Risk utilization")).toBeTruthy();
  });
});

describe("Alpha 360° — figures that are not known say so", () => {
  it("renders an uncounted KPI as absent with its reason, never as zero", () => {
    render(<AlphaThreeSixty {...alphaHandlers()} {...alpha360()} />);
    expect(screen.getByText("not counted in this window")).toBeTruthy();
    expect(screen.queryByText("0 Findings")).toBeNull();
  });

  it("keeps per-venue contribution in each venue's own currency", () => {
    // Scoped to the contribution panel: the same figures also appear in the
    // deployments table, which is correct — one is the venue's contribution
    // and the other is that deployment's pnl, and they happen to coincide.
    const { container } = render(<AlphaThreeSixty {...alphaHandlers()} {...alpha360()} />);
    const panel = [...container.querySelectorAll(".exec-gate-panel")].find((p) =>
      p.textContent?.includes("Per-venue contribution"),
    ) as HTMLElement;
    // Each venue carries its own currency label — including two that share
    // one, which is why this counts labels rather than looking one up.
    const currencies = [...panel.querySelectorAll("dd")].map((dd) =>
      dd.textContent?.match(/USDT|USDC|VND/)?.[0],
    );
    expect(currencies).toEqual(["USDT", "USDC", "USDT"]);
    expect(within(panel).getByText("+1,842.00")).toBeTruthy();
    expect(within(panel).getByText("(halted)")).toBeTruthy();
    // And there is no total row. Three venues, three figures, no fourth.
    expect(panel.querySelectorAll("dd")).toHaveLength(3);
    expect(panel.textContent).not.toMatch(/\bTotal\b|\bΣ\b/);
    // No total: USDT and USDC do not add up, and a single figure over both
    // would be a number with no unit pretending to have one.
    expect(screen.getByText(/never silently summed here/)).toBeTruthy();
  });

  it("shows a deployment with no pnl as absent rather than flat", () => {
    render(<AlphaThreeSixty {...alphaHandlers()} {...alpha360()} />);
    const row = screen.getByText("dep_91").closest("tr") as HTMLElement;
    // Worded, not dashed: a dash on a numeric column reads like a value, and
    // "—" was carrying three different meanings across these screens.
    expect(within(row).getAllByText("not published").length).toBeGreaterThanOrEqual(2);
    expect(within(row).getByText("BLOCKED")).toBeTruthy();
  });

  it("draws an insufficient tile as a state with its reason, not as a blank frame", () => {
    render(<AlphaThreeSixty {...alphaHandlers()} {...alpha360({ tab: "Insight Charts" })} />);
    expect(screen.getByText(/DERIBIT has 12 fills in this window/)).toBeTruthy();
    expect(screen.getByText(/734 of 1,468 feeds missing/)).toBeTruthy();
  });

  it("gives all twelve tiles a mandatory envelope caption", () => {
    const { container } = render(<AlphaThreeSixty {...alphaHandlers()} {...alpha360({ tab: "Insight Charts" })} />);
    const captions = container.querySelectorAll(".exec-tile-caption");
    expect(captions).toHaveLength(12);
    // The caption is what separates a full series from an aggregated one.
    expect(captions[0].textContent).toContain("43800 → 4368 samples");
  });

  it("marks the canary envelope so it is not read against the profile limit", () => {
    const { container } = render(<AlphaThreeSixty {...alphaHandlers()} {...alpha360({ tab: "Risk" })} />);
    expect(container.querySelector('[data-canary="true"]')).toBeTruthy();
    expect(screen.getByText("canary envelope")).toBeTruthy();
  });

  it("reads a paper venue's reconciliation as not applicable, not as clean", () => {
    render(<AlphaThreeSixty {...alphaHandlers()} {...alpha360({ tab: "Reconciliation" })} />);
    expect(screen.getByText("N/A (paper)")).toBeTruthy();
    expect(screen.getByText("not counted")).toBeTruthy();
    // Not "never": that claims reconciliation has not run, and an absent
    // timestamp is not that claim.
    expect(screen.getAllByText("not published").length).toBeGreaterThan(0);
  });
});

describe("Alpha 360° — at the volume the Trading System actually holds", () => {
  it("renders the wireframe's four venues exactly as drawn, with no caption", () => {
    render(<AlphaThreeSixty {...alphaHandlers()} {...alpha360()} />);
    expect(screen.queryByText(/showing .* of .* venues/)).toBeNull();
  });

  it("caps 22 venues and keeps the shard that stopped publishing", () => {
    const { container } = render(<AlphaThreeSixty {...alphaHandlers()} {...alpha360({ venues: venuesAtScale() })} />);
    const rows = container.querySelectorAll(".exec-alpha-map tbody tr");
    expect(rows.length).toBeLessThanOrEqual(16);
    // Row 19 of 22 — a head-cap would have dropped the only broken venue.
    expect(screen.getByText("no publish for 14m")).toBeTruthy();
    expect(screen.getByText(/showing 16 of 22 venues/)).toBeTruthy();
  });

  it("caps 60 deployments and keeps the blocked one at row 51", () => {
    const { container } = render(
      <AlphaThreeSixty {...alphaHandlers()} {...alpha360({ deployments: deploymentsAtScale() })} />,
    );
    const rows = container.querySelectorAll(".exec-alpha-deployments tbody tr");
    expect(rows.length).toBeLessThanOrEqual(24);
    expect(screen.getByText("dep_2051")).toBeTruthy();
    expect(screen.getByText("BLOCKED")).toBeTruthy();
  });

  it("caps 255 accounting rows and keeps the account that did not report", () => {
    const rows = accountingAtScale();
    expect(rows).toHaveLength(255); // 85 accounts × 3 currencies
    const { container } = render(<AlphaThreeSixty {...alphaHandlers()} {...alpha360({ tab: "Accounting", accounting: rows })} />);
    expect(container.querySelectorAll(".exec-360-sync tbody tr").length).toBeLessThanOrEqual(40);
    expect(screen.getAllByText("not available").length).toBeGreaterThanOrEqual(2);
  });

  it("caps 400 session events and keeps the recovery that never completed", () => {
    render(<AlphaThreeSixty {...alphaHandlers()} {...alpha360({ tab: "Sessions", sessions: sessionsAtScale() })} />);
    // Row 350 of 400. It is the only row in a session log that changes what
    // anyone does next.
    expect(screen.getByText("INCOMPLETE")).toBeTruthy();
    expect(screen.getByText("nothing recorded")).toBeTruthy();
  });

  it("pages positions rather than capping them, because fills have no retention", () => {
    const { container } = render(
      <AlphaThreeSixty {...alphaHandlers()} {...alpha360({ tab: "Positions", positions: positionsAtScale() })} />,
    );
    // A cap would imply a population you could have seen all of. 48,213 and
    // growing is not that.
    expect(screen.getByText("48,213")).toBeTruthy();
    expect(screen.queryByText(/showing .* of .* positions/)).toBeNull();
    expect(container.querySelector(".exec-table-nav")).toBeTruthy();
  });

  it("pages the command journal, which has no retention policy either", () => {
    render(<AlphaThreeSixty {...alphaHandlers()} {...alpha360({ tab: "Audit", audit: auditAtScale() })} />);
    expect(screen.getByText("1,284,991")).toBeTruthy();
  });

  it("survives every tab at runtime scale without a cap notice on a paged tab", () => {
    for (const tab of ALPHA_TABS) {
      const { unmount } = render(<AlphaThreeSixty {...alphaHandlers()} {...alpha360AtScale({ tab })} />);
      expect(screen.getByRole("tabpanel", { name: tab })).toBeTruthy();
      unmount();
    }
  });
});

describe("Alpha 360° — states the runtime opens in", () => {
  it("renders a panel state rather than a half-built screen when the alpha cannot be read", () => {
    render(<AlphaThreeSixty {...alphaHandlers()} {...alpha360({ status: "denied", reason: "Not your alpha." })} />);
    expect(screen.getByText("Not your alpha.")).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "Overview" })).toBeNull();
  });

  it("says a position has no mark rather than showing a stale one as current", () => {
    render(<AlphaThreeSixty {...alphaHandlers()} {...alpha360({ tab: "Positions" })} />);
    expect(screen.getByText("not marked")).toBeTruthy();
  });

  it("shows a venue with no deployment at a stage as none, not as a hole", () => {
    const { container } = render(<AlphaThreeSixty {...alphaHandlers()} {...alpha360()} />);
    expect(container.querySelectorAll(".exec-alpha-empty").length).toBeGreaterThan(0);
  });
});
