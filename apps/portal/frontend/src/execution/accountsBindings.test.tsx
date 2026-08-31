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
