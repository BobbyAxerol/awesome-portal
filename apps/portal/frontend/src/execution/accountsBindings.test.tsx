import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AccountsBindings } from "./screens/AccountsBindings";
import { BindingDetail } from "./screens/BindingDetail";
import { ACCOUNTS_SMOKE_DATA, accountsSmoke } from "./accounts.smoke";

afterEach(cleanup);

describe("Accounts & Bindings — entry screen for WF 1g (smoke until BR-EX-52)", () => {
  it("lists every binding once and says the data is smoke", () => {
    render(<AccountsBindings demo={accountsSmoke()} />);
    for (const row of ACCOUNTS_SMOKE_DATA.rows) expect(screen.getAllByText(row.id).length).toBeGreaterThan(0);
    expect(screen.getByText(/SMOKE DATA/)).toBeTruthy();
  });
  it("a filter chip narrows to the bindings that carry it", () => {
    render(<AccountsBindings demo={accountsSmoke()} />);
    fireEvent.click(screen.getByRole("button", { name: /^Paper/ }));
    expect(screen.getByText("deribit_main_01")).toBeTruthy();
    expect(screen.queryByText("binance_main_01")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Issues/ }));
    expect(screen.getByText("binance_main_01")).toBeTruthy();
    expect(screen.getByText("okx_main_01")).toBeTruthy();
  });
  it("test funds and simulated equity never show a number", () => {
    render(<AccountsBindings demo={accountsSmoke()} />);
    const okx = screen.getByText("okx_main_01").closest("tr")!;
    expect(within(okx).getByText("test funds")).toBeTruthy();
    const drb = screen.getByText("deribit_main_01").closest("tr")!;
    expect(within(drb).getByText(/N\/A — simulated/)).toBeTruthy();
  });
  it("the binance binding expands to its three virtual accounts and collapses", () => {
    render(<AccountsBindings demo={accountsSmoke()} />);
    expect(screen.getByText("acct-live-grid-v21")).toBeTruthy();
    fireEvent.click(screen.getByText("binance_main_01").closest("tr")!);
    expect(screen.queryByText("acct-live-grid-v21")).toBeNull();
  });
});

describe("Binding Detail (smoke until BR-EX-53)", () => {
  it("draws the capital invariant bar with one segment per virtual account and the headroom edge", () => {
    const { container } = render(<BindingDetail bindingId="binance_main_01" demo={accountsSmoke()} />);
    expect(container.querySelectorAll(".exec-bd-seg")).toHaveLength(3);
    expect(container.querySelector(".exec-bd-head")).toBeTruthy();
    expect(screen.getByText(/withdraw NOT granted/)).toBeTruthy();
  });
  it("never shows key material — only a fingerprint", () => {
    const { container } = render(<BindingDetail bindingId="binance_main_01" demo={accountsSmoke()} />);
    expect(container.textContent).toMatch(/fingerprint 9c41…e2/);
    expect(container.textContent).not.toMatch(/api[_-]?key|secret[:=]/i);
  });
  it("an unknown binding is an honest unavailable state", () => {
    render(<BindingDetail bindingId="nope" demo={accountsSmoke()} />);
    expect(screen.getByText(/No binding detail was published for nope/)).toBeTruthy();
  });
});

describe("Accounts & Bindings — filters over the published bindings (P0-7)", () => {
  const binding = (bindingId: string, accountId: string, venue: string, state: string, credentialState: string) => ({
    bindingId, accountId, venue, state, credentialState, updatedAt: "2026-09-07T00:00:00.000Z",
  });
  const list = {
    environment: "paper", freshness: "FRESH", completeness: "COMPLETE",
    sourceAsOf: "2026-09-07T00:00:00.000Z", readAt: "2026-09-07T00:00:10.000Z",
    page: {
      rows: [
        binding("b_paper@BINANCE", "paper-binance-a", "BINANCE", "ACTIVE", "ACTIVE"),
        binding("b_sbx@OKX", "sandbox-okx-b", "OKX TESTNET", "ACTIVE", "ACTIVE"),
        binding("b_live@BINANCE", "live-binance-c", "BINANCE", "SUSPENDED", "ACTIVE"),
        // The source has not published this credential state yet. That is not
        // an issue — before 2026-09-07 it counted as one and every dev binding
        // showed up under Issues.
        binding("b_paper2@BINANCE", "paper-binance-d", "BINANCE", "ACTIVE", "NOT_PUBLISHED"),
      ],
      totalCount: 4, filteredCount: 4, nextCursor: null, prevCursor: null, hasMore: false, hasPrevious: false,
    },
  } as never;

  it("counts each filter over the published rows and narrows the table when one is pressed", () => {
    render(<AccountsBindings list={list} />);
    expect(screen.getByRole("button", { name: "All (4)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Paper (2)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Testnet (1)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Live-bound (1)" })).toBeTruthy();
    // one binding is SUSPENDED, so it is the only issue
    expect(screen.getByRole("button", { name: "Issues (1)" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Paper (2)" }));
    expect(screen.getAllByText("b_paper@BINANCE", { exact: false }).length).toBeGreaterThan(0);
    expect(screen.queryByText("b_live@BINANCE")).toBeNull();
  });

  it("distinguishes a filter that matches nothing from a workspace with no bindings at all", () => {
    const paperOnly = {
      ...(list as never as Record<string, unknown>),
      page: {
        rows: [binding("b_paper@BINANCE", "paper-binance-a", "BINANCE", "ACTIVE", "ACTIVE")],
        totalCount: 1, filteredCount: 1, nextCursor: null, prevCursor: null, hasMore: false, hasPrevious: false,
      },
    } as never;
    const { unmount } = render(<AccountsBindings list={paperOnly} />);
    fireEvent.click(screen.getByRole("button", { name: "Live-bound (0)" }));
    expect(screen.getByText("No binding matches Live-bound — 1 bindings exist under the other filters.")).toBeTruthy();
    unmount();

    const none = { ...(list as never as Record<string, unknown>), page: { rows: [], totalCount: 0, filteredCount: 0, nextCursor: null, prevCursor: null, hasMore: false, hasPrevious: false } } as never;
    render(<AccountsBindings list={none} />);
    expect(screen.getByText(/the source published an empty set/)).toBeTruthy();
  });
});
