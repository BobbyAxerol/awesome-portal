/**
 * UI review D10: every Execution tab names its own screen, `<screen> · <subject> · Quant Ecosystem Portal`.
 */
import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { executionDocumentTitle, executionScreenOf, useExecutionDocumentTitle } from "./executionTitle";

afterEach(cleanup);

const SUFFIX = "Quant Ecosystem Portal";
const registry: { screens: { screen_id: string; route: string }[] } = JSON.parse(readFileSync(join(process.cwd(), "../registry/fixtures/registry.public.json"), "utf8"));

describe("executionDocumentTitle", () => {
  it.each([
    ["/execution", "", `Overview · ${SUFFIX}`],
    ["/execution/operations", "", `Operations · ${SUFFIX}`],
    ["/execution/operations/incidents/inc_9", "", `Incident · inc_9 · ${SUFFIX}`],
    ["/execution/slice", "", `Scoped slice · ${SUFFIX}`],
    ["/governance/approvals", "?sel=AP-352", `Approvals · ${SUFFIX}`],
    ["/governance/approvals/new", "", `New request · ${SUFFIX}`],
    ["/governance/approvals/AP-201/r1", "", `R1 review · AP-201 · ${SUFFIX}`],
    ["/governance/waivers", "", `Waivers · ${SUFFIX}`],
    ["/administration/users", "", `Users · ${SUFFIX}`],
    ["/deployments/alphas", "", `Alpha Fleet · ${SUFFIX}`],
    ["/deployments/alphas/alpha_btc_trend", "", `Alpha 360 · alpha_btc_trend · ${SUFFIX}`],
    ["/deployments/alphas/alpha_btc_trend", "?tab=replay", `Trade Replay · alpha_btc_trend · ${SUFFIX}`],
    ["/deployments/alphas/alpha_btc_trend/replay", "", `Trade Replay · alpha_btc_trend · ${SUFFIX}`],
    ["/deployments/portfolios/pf_scale_006", "", `Portfolio 360 · pf_scale_006 · ${SUFFIX}`],
    ["/deployments/accounts/Binance-02", "", `Account 360 · Binance-02 · ${SUFFIX}`],
    ["/deployments/paper/dep_1", "", `Paper workbench · dep_1 · ${SUFFIX}`],
    ["/deployments/live/dep_2/canary", "", `Canary · dep_2 · ${SUFFIX}`],
    ["/deployments/live/dep_2", "", `Live · dep_2 · ${SUFFIX}`],
    ["/deployments/compare", "?in=a,b", `Compare · ${SUFFIX}`],
  ])("%s%s", (path, search, title) => {
    expect(executionDocumentTitle(path, search)).toBe(title);
  });

  it("decodes an encoded subject and survives a malformed one", () => {
    expect(executionScreenOf("/deployments/portfolios/pf%20a")?.subject).toBe("pf a");
    expect(executionScreenOf("/deployments/portfolios/%E0%A4%A")?.subject).toBe("%E0%A4%A");
  });

  it("a path that is not an Execution screen is left alone (Research keeps its own title)", () => {
    expect(executionDocumentTitle("/research/quantbt/runs")).toBeNull();
    expect(executionDocumentTitle("/")).toBeNull();
  });

  it("every Execution screen route of the registry has a name, and the screens the audit saw merged are told apart", () => {
    const missing = registry.screens
      .filter((screen) => screen.screen_id.startsWith("EXECUTION_") || /^\/(deployments|governance|execution)/.test(screen.route))
      .filter((screen) => executionScreenOf(screen.route.replace(/:[A-Za-z]+/g, "x")) === null)
      .map((screen) => `${screen.screen_id} ${screen.route}`);
    expect(missing).toEqual([]);
    const name = (route: string) => executionScreenOf(route)?.screen;
    expect(name("/deployments/alphas/x")).not.toBe(name("/deployments/alphas/x/replay"));
    expect(name("/deployments/live/x")).not.toBe(name("/deployments/live/x/canary"));
  });
});

describe("useExecutionDocumentTitle", () => {
  function Probe({ path, search = "", enabled = true }: { path: string; search?: string; enabled?: boolean }) {
    useExecutionDocumentTitle(path, search, enabled);
    return null;
  }
  it("sets the title on the first commit and puts the served title back on leaving", () => {
    document.title = "QuantBT Backtest Portal";
    const view = render(<Probe path="/execution" />);
    expect(document.title).toBe(`Overview · ${SUFFIX}`);
    view.rerender(<Probe path="/governance/waivers" />);
    expect(document.title).toBe(`Waivers · ${SUFFIX}`);
    view.unmount();
    expect(document.title).toBe("QuantBT Backtest Portal");
  });
  it("flag off, or a non-Execution path: the title is untouched", () => {
    document.title = "Kept";
    render(<Probe path="/execution" enabled={false} />);
    expect(document.title).toBe("Kept");
    cleanup();
    render(<Probe path="/research/quantbt" />);
    expect(document.title).toBe("Kept");
  });
});
