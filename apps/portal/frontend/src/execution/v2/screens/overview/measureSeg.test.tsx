/** OV-6 · the Performance panel's measure switch: three controls, all off, each pointing at its reason. */
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetOverviewDouble, setOverviewDoubleVariants } from "../../../../../e2e/bffDoubleOverview";
import { httpApi, serveDoubles } from "../../../../../e2e/screensV2Harness";
import OverviewScreen from "./index";

import { SectionPanel } from "../../blocks";
import { MeasureSeg } from "./MeasureSeg";

beforeEach(() => {
  resetOverviewDouble();
  setOverviewDoubleVariants({ fleet: "multi-currency" });
  serveDoubles();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("MeasureSeg", () => {
  it("offers Net PnL and Return as disabled buttons, each described by 'Not published (FE-025)'", () => {
    render(
      <SectionPanel title="Performance" lead={<MeasureSeg />}>
        <p>body</p>
      </SectionPanel>,
    );
    const group = screen.getByRole("group", { name: "Performance measure" });
    const buttons = within(group).getAllByRole("button") as HTMLButtonElement[];
    expect(buttons.map((b) => b.textContent)).toEqual(["Net PnL", "Return"]);
    for (const b of buttons) {
      expect(b.disabled).toBe(true);
      expect(b.title).toContain("Not published (FE-025)");
      expect(document.getElementById(b.getAttribute("aria-describedby") ?? "")?.textContent).toBe("Not published (FE-025)");
    }
    expect(screen.getByRole("region", { name: "Performance" })).toBeTruthy();
  });

  it("the Overview's Performance panel carries the switch next to its heading", async () => {
    render(
      <MemoryRouter initialEntries={["/execution"]}>
        <OverviewScreen api={httpApi()} sseFactory={null} />
      </MemoryRouter>,
    );
    const group = await screen.findByRole("group", { name: "Performance measure" });
    const heading = screen.getByRole("heading", { name: "Performance" });
    expect(heading.parentElement?.contains(group)).toBe(true);
    const buttons = within(group).getAllByRole("button") as HTMLButtonElement[];
    expect(buttons).toHaveLength(2);
    expect(buttons.every((b) => b.disabled && document.getElementById(b.getAttribute("aria-describedby") ?? "")?.textContent === "Not published (FE-025)")).toBe(true);
  });
});
