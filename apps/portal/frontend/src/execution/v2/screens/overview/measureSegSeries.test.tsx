/**
 * OV-6 · the Performance panel's measure switch over the fund series port (FE-013). Lane BFF_DOUBLE: the series route is the published
 * fixtures behind a stubbed `fetch` (seriesDouble.testbase); the screen is the real Overview over the S2 double. A fixture is not
 * a source acceptance: `REAL_READ_QUALIFIED` is NOT_RUN (the financial series source is MISSING on the producer).
 *
 * Net PnL and Return are enabled only when the port serves the fund (the NAV read says its source is published). RETURN prints as
 * the series reader prints a ratio (a plain ratio, no `%`) until the server publishes a scale. Equity is never enabled.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetOverviewDouble, setOverviewDoubleVariants } from "../../../../../e2e/bffDoubleOverview";
import { httpApi, serveDoubles } from "../../../../../e2e/screensV2Harness";
import { newSeriesDouble, wrapFetch, type SeriesDoubleState } from "../series/seriesDouble.testbase";
import OverviewScreen from "./index";

let series: SeriesDoubleState = newSeriesDouble("unavailable");
beforeEach(() => {
  resetOverviewDouble();
  setOverviewDoubleVariants({ fleet: "multi-currency" });
  serveDoubles();
  series = newSeriesDouble("unavailable");
  vi.stubGlobal("fetch", wrapFetch(globalThis.fetch, series));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const mount = (entry = "/execution?env=paper&window=30d") =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <OverviewScreen api={httpApi()} sseFactory={null} />
    </MemoryRouter>,
  );
const seg = () => screen.findByRole("group", { name: "Performance measure" });
const button = (group: HTMLElement, name: string) => within(group).getByRole("button", { name }) as HTMLButtonElement;
const performance = () => screen.getByRole("region", { name: "Performance" });
const metricsAsked = () => series.calls.map((call) => call.metric);

describe("the fund series is not served: the switch is off, with its reason, and asks for nothing", () => {
  it("source NOT_PUBLISHED: Net PnL, Return and Equity are disabled 'Not published (FE-025)' and only the NAV is asked", async () => {
    series.variant = "unavailable";
    mount();
    const group = await seg();
    await waitFor(() => expect(series.calls).toHaveLength(1));
    for (const name of ["Net PnL", "Return", "Equity"]) {
      const b = button(group, name);
      expect(b.disabled, name).toBe(true);
      expect(b.title, name).toContain("Not published (FE-025)");
      expect(document.getElementById(b.getAttribute("aria-describedby") ?? "")?.textContent, name).toBe("Not published (FE-025)");
    }
    fireEvent.click(button(group, "Return"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(metricsAsked()).toEqual(["NAV"]);
  });

  it.each(["status:503", "garbage"] as const)("a fund series read that fails (%s) leaves the switch off", async (variant) => {
    series.variant = variant;
    mount();
    const group = await seg();
    await waitFor(() => expect(series.calls).toHaveLength(1));
    await waitFor(() => expect(performance().textContent).toContain("The series could not be read"));
    expect(["Net PnL", "Return", "Equity"].every((name) => button(group, name).disabled)).toBe(true);
  });
});

describe("the fund series is served (source published)", () => {
  const ready = async () => {
    series.variant = "populated";
    mount();
    const group = await seg();
    await waitFor(() => expect(button(group, "Net PnL").disabled).toBe(false));
    await waitFor(() => expect(performance().querySelector("[data-testid='series-caption']")).not.toBeNull());
    return group;
  };

  it("enables Net PnL and Return; Equity stays 'Not published (FE-025)'; nothing is pressed (the NAV line is shown)", async () => {
    const group = await ready();
    expect(button(group, "Net PnL").getAttribute("aria-pressed")).toBe("false");
    expect(button(group, "Return").disabled).toBe(false);
    const equity = button(group, "Equity");
    expect(equity.disabled).toBe(true);
    expect(equity.title).toContain("Not published (FE-025)");
    expect(equity.title).toContain("no published fund series");
    expect(performance().querySelector("[data-testid='series-caption']")!.textContent).toContain("NAV in USDT");
  });

  it("Net PnL asks the port for NET_PNL on the FUND over the same environment and window, and draws it in its currency", async () => {
    const group = await ready();
    fireEvent.click(button(group, "Net PnL"));
    await waitFor(() => expect(metricsAsked()).toEqual(["NAV", "NET_PNL"]));
    expect(series.calls[1]).toEqual({ environment: "paper", metric: "NET_PNL", subjects: [{ subject_type: "FUND" }], window: "30D", partition: null });
    await waitFor(() => expect(performance().querySelector("[data-testid='series-caption']")?.textContent).toContain("Net PnL in USDT"));
    expect(button(group, "Net PnL").getAttribute("aria-pressed")).toBe("true");
    expect(performance().querySelector("svg")).not.toBeNull();
  });

  // How a RETURN value is printed (plain ratio at this base; FRACTION/PERCENT with '%' once ratio_scale lands, FE-I) belongs to
  // seriesModel and its own tests. This screen never formats a figure: the panel does. So this test pins only that the metric
  // is asked for, that no currency is attached to a ratio, and that the panel is the shared series panel.
  it("Return asks the port for RETURN on the FUND, with no currency on a ratio, drawn by the shared series panel", async () => {
    const group = await ready();
    fireEvent.click(button(group, "Return"));
    await waitFor(() => expect(metricsAsked()).toEqual(["NAV", "RETURN"]));
    await waitFor(() => expect(performance().querySelector("[data-testid='series-caption']")?.textContent).toContain("Return"));
    expect(performance().textContent).not.toMatch(/USDT/);
    expect(performance().querySelector(".exec-ser")).not.toBeNull();
    expect(button(group, "Return").getAttribute("aria-pressed")).toBe("true");
  });

  it("pressing the pressed measure returns to the NAV line without asking for the NAV again", async () => {
    const group = await ready();
    fireEvent.click(button(group, "Net PnL"));
    await waitFor(() => expect(metricsAsked()).toEqual(["NAV", "NET_PNL"]));
    await waitFor(() => expect(performance().querySelector("[data-testid='series-caption']")?.textContent).toContain("Net PnL in USDT"));
    fireEvent.click(button(group, "Net PnL"));
    await waitFor(() => expect(performance().querySelector("[data-testid='series-caption']")?.textContent).toContain("NAV in USDT"));
    expect(button(group, "Net PnL").getAttribute("aria-pressed")).toBe("false");
    expect(metricsAsked()).toEqual(["NAV", "NET_PNL"]);
  });

  it("a measure the port then refuses is a typed 'Not available', never a flat line, and the other measures stay reachable", async () => {
    const group = await ready();
    series.variant = "status:503";
    fireEvent.click(button(group, "Return"));
    await waitFor(() => expect(performance().textContent).toContain("The series could not be read"));
    expect(performance().querySelector("svg path[data-main]")).toBeNull();
    expect(button(group, "Net PnL").disabled).toBe(false);
  });

  it("a measure the port answers UNAVAILABLE keeps the typed reason", async () => {
    const group = await ready();
    series.variant = "unavailable";
    fireEvent.click(button(group, "Net PnL"));
    await waitFor(() => expect(performance().textContent).toContain("SERIES_SOURCE_NOT_PUBLISHED"));
    expect(performance().querySelector("svg path[data-main]")).toBeNull();
  });
});
