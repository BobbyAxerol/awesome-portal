/**
 * Overview with the Core Observed fallback (slice 3). Same harness as overview.test.tsx (BFF double, series route unpublished).
 * Observed bodies are the canonical TEST_ONLY_SYNTHETIC fixtures. The build key is injected through the `observed` prop; with it off
 * (or unset, the default build) the screen must be identical to today and must not even ask.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetOverviewDouble, setOverviewDoubleVariants } from "../../../../../e2e/bffDoubleOverview";
import type { ExecutionApi, Result } from "../../../api/ports";
import { httpApi, serveDoubles } from "../../../../../e2e/screensV2Harness";
import { OBSERVED_CODES, readObservedOverview, type ObservedOverview } from "../../readers/observedOverview";
import { loadCanonical } from "../../testkit/loadCanonical";
import { newSeriesDouble, wrapFetch } from "../series/seriesDouble.testbase";
import { sessionOf } from "../alpha/testApi";
import OverviewScreen from "./index";

const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("../../../../auth/session", () => ({ useSession: () => session.current }));

const cases = loadCanonical<{ cases: Record<string, unknown> }>("execution-observed-read.synthetic.valid.json").cases;
const body = (name: string): ObservedOverview => readObservedOverview(cases[name]) as ObservedOverview;

beforeEach(() => {
  session.current = { ...sessionOf(["governance.r1.read"]), principal: null };
  resetOverviewDouble();
  setOverviewDoubleVariants({ fleet: "multi-currency" });
  serveDoubles();
  vi.stubGlobal("fetch", wrapFetch(globalThis.fetch, newSeriesDouble("unavailable")));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const withObserved = (answer: Result<ObservedOverview>) => {
  const getObservedOverview = vi.fn(async () => answer);
  return { api: { ...httpApi(), withReadSignal: undefined, getObservedOverview } as ExecutionApi, getObservedOverview };
};
const refused = (httpStatus: number, code: string): Result<ObservedOverview> => ({ ok: false, status: "unavailable", reason: `${code}: refused`, httpStatus, code });

const mount = (api: ExecutionApi, observed?: boolean) =>
  render(<MemoryRouter initialEntries={["/execution"]}><OverviewScreen api={api} sseFactory={null} {...(observed === undefined ? {} : { observed })} /></MemoryRouter>);
const loaded = async () => {
  await screen.findByRole("heading", { name: /^Overview/ });
  await waitFor(() => {
    expect(screen.queryByRole("status", { name: /^Loading/ })).toBeNull();
    expect(document.body.textContent).not.toContain("acknowledgement: reading");
  });
};
const kpi = (label: string) => [...screen.getByLabelText("Fund figures").querySelectorAll(".exec-blk-kpi")].find((n) => n.querySelector("dt")?.textContent === label) as HTMLElement;
const value = (label: string) => kpi(label).querySelector(".exec-blk-kpi-value")?.textContent ?? "";
const note = (label: string) => kpi(label).querySelector(".exec-blk-kpi-note")?.textContent ?? "";
const tilesHtml = () => screen.getByLabelText("Fund figures").innerHTML + screen.getByRole("table", { name: "Capital" }).innerHTML;
const LABEL = "Observed, not TS-qualified";

describe("observed OFF (the default build)", () => {
  it("asks nothing and renders the same page whether the prop is unset or false", async () => {
    const unset = withObserved({ ok: true, value: body("paper") });
    const first = mount(unset.api);
    await loaded();
    const htmlUnset = tilesHtml();
    first.unmount();
    const off = withObserved({ ok: true, value: body("paper") });
    mount(off.api, false);
    await loaded();
    expect(unset.getObservedOverview).not.toHaveBeenCalled();
    expect(off.getObservedOverview).not.toHaveBeenCalled();
    expect(tilesHtml()).toBe(htmlUnset);
    expect(document.body.textContent).not.toContain(LABEL);
    expect(value("NAV")).toBe("Not published");
  });
});

describe("observed ON", () => {
  it("populated: NAV and cumulative Net PnL are filled and labelled; the zero is a zero; Return and Drawdown are Not available with a code, never 0", async () => {
    const { api, getObservedOverview } = withObserved({ ok: true, value: body("paper") });
    mount(api, true);
    await loaded();
    await waitFor(() => expect(value("NAV")).toContain("20000"));
    expect(getObservedOverview).toHaveBeenCalledWith({ environment: "live" });
    expect(value("NAV")).toContain("USD");
    expect(note("NAV")).toContain(LABEL);
    expect(value("Net PnL")).toMatch(/^0\s?USD/);
    expect(note("Net PnL")).toContain(LABEL);
    expect(note("Net PnL")).toContain("Cumulative, source-reported");
    expect(note("Net PnL")).not.toMatch(/Window|7D|30D|90D/);
    for (const label of ["Return", "Drawdown"]) {
      expect(value(label)).toContain("Not available");
      expect(value(label)).not.toMatch(/\d/);
      expect(note(label)).toContain(LABEL);
    }
    // the Capital NAV row carries the same labelled fallback
    expect(screen.getByRole("table", { name: "Capital" }).textContent).toContain(LABEL);
  });

  it("partial: a PARTIAL or STALE figure carries its qualifier", async () => {
    const { api } = withObserved({ ok: true, value: body("retained") });
    mount(api, true);
    await loaded();
    await waitFor(() => expect(note("NAV")).toContain(LABEL));
    expect(value("NAV") + value("Net PnL")).toMatch(/Partial|Stale/);
  });

  it("unavailable census: everything is Not available, no number", async () => {
    const { api } = withObserved({ ok: true, value: body("unavailable") });
    mount(api, true);
    await loaded();
    await waitFor(() => expect(note("NAV")).toContain(LABEL));
    for (const label of ["NAV", "Net PnL", "Return", "Drawdown"]) { expect(value(label)).toContain("Not available"); expect(value(label)).not.toMatch(/\d/); }
  });

  it.each([
    ["404 lane off", refused(404, OBSERVED_CODES.laneOff)],
    ["404 not available", refused(404, OBSERVED_CODES.notAvailable)],
    ["409 SCOPED_V2", refused(409, OBSERVED_CODES.scoped)],
    ["409 access changed twice", refused(409, OBSERVED_CODES.accessChanged)],
    ["503", refused(503, "CAPABILITY_UNAVAILABLE")],
  ])("%s degrades to today's Not published with no error text", async (_name, answer) => {
    const { api, getObservedOverview } = withObserved(answer);
    mount(api, true);
    await loaded();
    await waitFor(() => expect(getObservedOverview).toHaveBeenCalled());
    expect(value("NAV")).toBe("Not published");
    expect(value("Net PnL")).toBe("Not published");
    expect(document.body.textContent).not.toContain(LABEL);
    expect(document.body.textContent).not.toMatch(/EXECUTION_OBSERVED|EXECUTION_READ_ACCESS|SCOPED/);
  });

  it("a malformed answer (the port returns unavailable) degrades the same way", async () => {
    const { api } = withObserved({ ok: false, status: "unavailable", reason: "The Core Observed overview response could not be read." });
    mount(api, true);
    await loaded();
    expect(value("NAV")).toBe("Not published");
    expect(document.body.textContent).not.toContain("could not be read");
  });

  it("a port without the method asks nothing and shows today's page", async () => {
    mount({ ...httpApi(), withReadSignal: undefined, getObservedOverview: undefined } as unknown as ExecutionApi, true);
    await loaded();
    expect(value("NAV")).toBe("Not published");
  });
});
