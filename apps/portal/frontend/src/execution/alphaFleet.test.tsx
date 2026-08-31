import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AlphaFleet } from "./screens/AlphaFleet";
import { FLEET_SMOKE_DATA, fleetSmoke } from "./alphaFleet.smoke";

afterEach(cleanup);

describe("Alpha Fleet — entry screen for WF 2a (smoke until BR-EX-49)", () => {
  it("renders every alpha of the fleet once and says the data is smoke", () => {
    render(<AlphaFleet demo={fleetSmoke()} />);
    for (const row of FLEET_SMOKE_DATA.rows) expect(screen.getByText(row.alpha)).toBeTruthy();
    expect(screen.getByText(/SMOKE DATA/)).toBeTruthy();
  });
  it("a stage chip narrows the list to alphas holding a deployment at that stage", () => {
    render(<AlphaFleet demo={fleetSmoke()} />);
    fireEvent.click(screen.getByRole("button", { name: /^Canary/ }));
    expect(screen.getByText("Grid v2.1")).toBeTruthy();
    expect(screen.getByText("MM v1.1")).toBeTruthy();
    expect(screen.queryByText("Carry v3.2")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Research/ }));
    expect(screen.getByText("MeanRev v0.3")).toBeTruthy();
    expect(screen.queryByText("Grid v2.1")).toBeNull();
  });
  it("keeps blocked research rows visible and figure-less", () => {
    render(<AlphaFleet demo={fleetSmoke()} />);
    const row = screen.getByText("MeanRev v0.3").closest("tr")!;
    expect(within(row).getByText(/audit replay failed/)).toBeTruthy();
    expect(within(row).queryByText(/\d+,\d+/)).toBeNull();
  });
  it("expands an alpha to its deployments and collapses it again", () => {
    render(<AlphaFleet demo={fleetSmoke()} />);
    const grid = screen.getByText("Grid v2.1").closest("tr")!;
    expect(screen.getByText("dep_live")).toBeTruthy();
    fireEvent.click(grid);
    expect(screen.queryByText("dep_live")).toBeNull();
  });
  it("never sums currencies: VND and USDC stay beside their own figures", () => {
    render(<AlphaFleet demo={fleetSmoke()} />);
    expect(screen.getAllByText("VND").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/USDC paper — not summed/)).toBeTruthy();
  });
});
