/**
 * Canary control room, mounted with a port fake that answers `getCanaryVersioned`
 * the way the HTTP port does (the real dispatcher over a body). Lanes: the dark
 * bodies are the published fixtures (BFF-shaped); the lit bodies and the typed
 * rows are FIXTURE_LAB (view-level), because the contract's rows are free objects
 * and the published fixture is source-dark.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { readCanaryByVersion } from "../../readers/dispatch";
import { useContextFactsValue } from "../../shell/contextFacts";
import { STAGE_WHY } from "../stage/reasons";
import CanaryScreen, { CANARY_SCREEN_KEY } from "./index";
import { EnvelopeTab } from "./EnvelopeTab";
import { BeforeScaleUp } from "./Rail";
import { PositionsOrdersTab } from "./PositionsOrdersTab";
import { ReconciliationTab } from "./ReconGuardTabs";
import { readCanaryView, type CanaryView, type OrderRow, type PositionRow } from "./readCanary";
import { DEP, answering, canaryPort, parentBody, populatedV1, populatedWithFacts, refusing, v1Body } from "./canary.testbase";

afterEach(cleanup);

const NO_DASH = /(^|\s)[-–—](\s|$)|N\/A/;

function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{pathname + search}</output>;
}
function Facts() {
  return <output data-testid="facts">{JSON.stringify(useContextFactsValue())}</output>;
}
const where = () => screen.getByTestId("where").textContent ?? "";

function mount(port: ReturnType<typeof canaryPort>, entry = `/deployments/live/${DEP}/canary`) {
  const view = render(
    <MemoryRouter initialEntries={[entry]}>
      <CanaryScreen api={port} deploymentId={DEP} />
      <Where />
      <Facts />
    </MemoryRouter>,
  );
  return { view, port };
}
const ready = () => screen.findByRole("heading", { level: 1, name: "Canary control room" });
const tabs = () => within(screen.getByRole("tablist", { name: "Canary sections" }));
const root = () => document.querySelector<HTMLElement>('[data-screen="canary-v2"]')!;

async function openTab(name: string) {
  fireEvent.click(tabs().getByRole("tab", { name }));
  await waitFor(() => expect(tabs().getByRole("tab", { name }).getAttribute("aria-selected")).toBe("true"));
}

function viewOf(raw: unknown): CanaryView {
  const result = readCanaryView(readCanaryByVersion(raw));
  if (result.kind !== "view") throw new Error(result.text);
  return result.view;
}
const withRouter = (node: ReactNode) => render(<MemoryRouter>{node}</MemoryRouter>);

describe("screen contract", () => {
  it("is the canary flag's screen", () => {
    expect(CANARY_SCREEN_KEY).toBe("canary");
  });

  it("opens in a loading state with loading chips, then the guard frame", async () => {
    mount(canaryPort(answering(v1Body())));
    expect(root().getAttribute("data-state")).toBe("loading");
    expect(screen.getAllByText("Loading").length).toBeGreaterThan(0);
    await ready();
    const header = document.querySelector<HTMLElement>(".exec-stage-guard")!;
    expect(header.getAttribute("data-stage")).toBe("canary");
    expect(header.getAttribute("data-frame")).toBe("double");
    expect(header.textContent).toContain("Real capital at risk");
    expect(root().getAttribute("data-state")).toBe("ready");
  });

  it("reads once, with the deployment and no workspace unless the URL names one", async () => {
    const { port } = mount(canaryPort(answering(v1Body())));
    await ready();
    expect(port.calls).toEqual([{ id: DEP, options: undefined }]);
  });

  it("passes the URL's workspace_id to the read", async () => {
    const { port } = mount(canaryPort(answering(v1Body())), `/deployments/live/${DEP}/canary?workspace_id=ws_TEST_ONLY`);
    await ready();
    expect(port.calls[0].options).toEqual({ workspaceId: "ws_TEST_ONLY" });
  });
});

describe("dark V1 body: honest absence everywhere", () => {
  it("chips are request ids, KPIs are Not available, nothing prints a dash, N/A or a bare 0", async () => {
    mount(canaryPort(answering(v1Body())));
    await ready();
    const chips = document.querySelector<HTMLElement>(".exec-stage-chips")!;
    expect(chips.textContent).toContain("Runtime");
    expect(chips.textContent).toContain("Not published (FE-067)");
    expect(chips.textContent).toContain("Not published (FE-072)");
    expect(chips.textContent).not.toMatch(/Running|Clean|Reconciled/);
    const kpis = within(screen.getByRole("group", { name: "Canary figures" }));
    for (const label of ["Capital consumed", "Gross notional", "Daily PnL", "Open orders", "Broker equity"]) {
      const cell = kpis.getByText(label).closest(".exec-blk-kpi")!;
      expect(cell.textContent, label).toContain("Not available");
      expect(cell.textContent, label).not.toMatch(/\b0\b/);
    }
    for (const label of ["Envelope", "Positions & orders", "Reconciliation", "Guard rule"]) {
      await openTab(label);
      expect(document.body.textContent ?? "", label).not.toMatch(NO_DASH);
    }
  });

  it("the trial says what it does not know: no day 0, no countdown, both dates Not published (FE-071)", async () => {
    mount(canaryPort(answering(v1Body())));
    await ready();
    const trial = screen.getByRole("group", { name: "Trial schedule" });
    expect(trial.textContent).toContain("Trial day not stated");
    expect(trial.textContent).toContain("duration 14 days");
    expect(trial.textContent).not.toMatch(/day 0|days left|in \d+ days/);
    expect(trial.textContent?.match(/Not published \(FE-071\)/g)).toHaveLength(2);
  });

  it("the series panel is Not published (FE-029): no chart, no invented line", async () => {
    mount(canaryPort(answering(v1Body())));
    await ready();
    const panel = screen.getByRole("heading", { name: "Live vs Paper vs Backtest" }).closest("section")!;
    expect(panel.textContent).toContain("Not published (FE-029)");
    expect(panel.querySelector("svg")).toBeNull();
  });

  it("Envelope: a draft is Proposed with the exact caps; Limit is the compliance panel's own caps, Consumed and Used are Not published (FE-071); no gauge is drawn", async () => {
    mount(canaryPort(answering(v1Body())));
    await ready();
    const table = screen.getByRole("table", { name: "Canary envelope caps" });
    expect(within(table).getByRole("columnheader", { name: "Proposed" })).toBeTruthy();
    expect(within(table).queryByRole("columnheader", { name: "Approved" })).toBeNull();
    expect(table.textContent).toContain("5,000.00");
    expect(table.textContent).toContain("10,000.00");
    expect(table.textContent).toContain("250.00");
    // The published compliance limits fill the Limit column (the same four caps as the envelope's, printed twice); Duration has none.
    const bodyRows = Array.from(table.querySelectorAll("tbody tr"));
    const cell = (label: string) => bodyRows.map((row) => row.querySelector(`td[data-l="${label}"]`)?.textContent?.replace(/^Not published \(FE-071\).*$/, "NP"));
    expect(cell("Limit")).toEqual(["5,000.00", "10,000.00", "250.00", "20", "NP"]);
    expect(cell("Consumed")).toEqual(Array(5).fill("NP"));
    expect(screen.getByText("Base risk profile: not verified.")).toBeTruthy();
    expect(table.textContent).toContain("Capital cap (USDT)");
    expect(table.textContent).toContain("Open orders (max)");
    expect(table.querySelector('[role="img"]')).toBeNull();
    expect(table.textContent).not.toMatch(/\d+(\.\d+)?%/);
    const panel = table.closest("section")!;
    expect(panel.textContent).toContain("Not published (FE-071)");
    expect(panel.textContent).toContain("Envelope verdict");
    expect(panel.textContent).not.toContain("Within envelope");
  });

  it("Positions & orders: the panel's state and Not published (FE-072), no empty table", async () => {
    mount(canaryPort(answering(v1Body())));
    await ready();
    await openTab("Positions & orders");
    expect(where()).toContain("tab=positions-orders");
    const body = screen.getByRole("tabpanel");
    expect(body.textContent).toContain("Not published (FE-072)");
    expect(body.querySelector("table")).toBeNull();
  });

  it("Reconciliation: the three columns, every figure Not available, nothing subtracted", async () => {
    mount(canaryPort(answering(v1Body())));
    await ready();
    await openTab("Reconciliation");
    const triad = screen.getByRole("group", { name: "Reconciliation" });
    for (const name of ["Internal", "Broker", "Difference"]) expect(within(triad).getByRole("heading", { name })).toBeTruthy();
    expect(triad.textContent).toContain("Not available");
    expect(screen.getByRole("tabpanel").textContent).toContain("Not published (FE-072)");
  });

  it("Guard rule: scale-up blocked, protective allowed, from the two flags", async () => {
    mount(canaryPort(answering(v1Body())));
    await ready();
    await openTab("Guard rule");
    const table = screen.getByRole("table", { name: "Canary guard rule" });
    expect(within(table).getByText("Broker snapshot is stale")).toBeTruthy();
    expect(table.textContent).toContain("Blocked");
    expect(table.textContent).toContain("Allowed");
    expect(screen.getByRole("tabpanel").textContent).toContain("does not block protective actions");
  });
});

describe("the four decisions (D6, D9): drawn, disabled, explained, never enabled", () => {
  it("Hold, Reduce, Rollback and Request scale are disabled with the dictionary's one-line reason and a My access link", async () => {
    mount(canaryPort(answering(v1Body())));
    await ready();
    const panel = screen.getByRole("heading", { name: "Promotion decision" }).closest("section")!;
    for (const label of ["Hold", "Reduce", "Rollback", "Request scale"]) {
      const button = within(panel).getByRole("button", { name: label }) as HTMLButtonElement;
      expect(button.disabled, label).toBe(true);
      const reasonId = button.getAttribute("aria-describedby");
      expect(reasonId, label).toBeTruthy();
      expect(document.getElementById(reasonId!)?.textContent, label).toBe(STAGE_WHY.liveClosed);
      expect(within(panel).getByRole("link", { name: `My access: ${label}` }).getAttribute("href")).toContain("/administration/profile-access");
      fireEvent.click(button);
    }
    expect(where()).toBe(`/deployments/live/${DEP}/canary`);
  });

  it("every disabled button on every tab names its reason (disabledReason gate, in the DOM)", async () => {
    mount(canaryPort(answering(populatedV1())));
    await ready();
    for (const label of ["Envelope", "Positions & orders", "Reconciliation", "Guard rule"]) {
      await openTab(label);
      for (const button of Array.from(root().querySelectorAll("button:disabled"))) {
        const id = button.getAttribute("aria-describedby");
        expect(id, `${label}: ${button.textContent}`).toBeTruthy();
        expect((document.getElementById(id!)?.textContent ?? "").length, label).toBeGreaterThan(0);
      }
    }
  });

  it("even a body that says the production command is active enables nothing", async () => {
    const body = populatedV1();
    body.command_policy.production_command_active = true;
    mount(canaryPort(answering(body)));
    await ready();
    expect(screen.getAllByRole("button").filter((b) => ["Hold", "Reduce", "Rollback", "Request scale"].includes(b.textContent ?? "")).every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
  });
});

describe("what is blocking and rollback readiness", () => {
  it("blockers are sentences; the codes are only under Provenance", async () => {
    mount(canaryPort(answering(v1Body())));
    await ready();
    const panel = screen.getByRole("heading", { name: "Before scale-up" }).closest("section")!;
    const list = within(panel).getByRole("list", { name: "Before scale-up" });
    expect(list.textContent).toContain("Production commands are closed on this build, so no decision can be sent.");
    expect(list.textContent).toContain("The Canary owner has not signed off yet.");
    expect(list.textContent).not.toMatch(/PRODUCTION_COMMAND_INACTIVE/);
    const provenance = panel.querySelector("details")!;
    expect(provenance.textContent).toContain("PRODUCTION_COMMAND_INACTIVE");
    expect(provenance.textContent).toContain("deployment dep_88");
    expect(provenance.textContent).toContain("risk profile risk-profile-rev-12");
    // the lineage link is the body's own in-app path
    expect(within(provenance as HTMLElement).getByRole("link", { name: "AP-152" }).getAttribute("href")).toBe("/governance/approvals/AP-152/r2");
  });

  it.each(["//evil.example", "/\\evil.example", "/\tevil", "javascript:x", "https://x"])("the rail never links a hostile lineage href %j, even one handed to the view directly", (hostile) => {
    const view = viewOf(v1Body());
    withRouter(<BeforeScaleUp view={{ ...view, lineage: view.lineage.map((l) => ({ ...l, href: hostile })) }} />);
    const rail = screen.getByRole("heading", { name: "Before scale-up" }).closest("section")!;
    expect(rail.querySelectorAll("a")).toHaveLength(0);
    expect(rail.textContent).toContain("AP-152");
  });

  it("Rollback readiness: four checks, dates Not published (FE-071), and no Ready anywhere", async () => {
    mount(canaryPort(answering(v1Body())));
    await ready();
    const panel = screen.getByRole("heading", { name: "Rollback readiness" }).closest("section")!;
    const items = within(panel).getAllByRole("listitem");
    expect(items.map((i) => i.querySelector(".exec-cny-rb-name")?.textContent)).toEqual(["Flatten plan prepared", "Paper twin running", "Broker data fresh", "Last rollback drill"]);
    expect(panel.textContent).toContain("Checked Not published (FE-071)");
    expect(panel.textContent).not.toMatch(/Ready|Passed/);
  });
});

describe("lit body (FIXTURE_LAB): figures, a fresh broker, trial day 6 of 14", () => {
  it("prints each figure exactly, with its currency; the count has none; PnL is toned negative", async () => {
    mount(canaryPort(answering(populatedV1())));
    await ready();
    const kpis = within(screen.getByRole("group", { name: "Canary figures" }));
    const cell = (label: string) => kpis.getByText(label).closest(".exec-blk-kpi") as HTMLElement;
    expect(cell("Capital consumed").textContent).toContain("3,820.00");
    expect(cell("Capital consumed").textContent).toContain("USDT");
    expect(cell("Capital consumed").textContent).toContain("Proposed cap 5,000.00");
    expect(cell("Gross notional").textContent).toContain("6,120.40");
    expect(cell("Open orders").textContent).toContain("Max 20");
    expect(cell("Open orders").textContent).not.toContain("USDT");
    const pnl = cell("Daily PnL").querySelector(".exec-blk-num")!;
    expect(pnl.textContent).toBe("-38.60");
    expect(pnl.getAttribute("data-tone")).toBe("negative");
    expect(pnl.getAttribute("data-full")).toBe("-38.60");
  });

  it("never divides: 3,820.00 of a 5,000.00 cap does not appear as 76 anywhere", async () => {
    mount(canaryPort(answering(populatedV1())));
    await ready();
    for (const label of ["Envelope", "Positions & orders", "Reconciliation", "Guard rule"]) {
      await openTab(label);
      expect(document.body.textContent ?? "", label).not.toMatch(/\b76(\.\d+)?\s?%|76% of/);
    }
  });

  it("trial day 6 of 14: fourteen ticks, one of them now, five done; the exit review is still Not published", async () => {
    mount(canaryPort(answering(populatedV1())));
    await ready();
    const trial = screen.getByRole("group", { name: "Trial schedule" });
    expect(trial.textContent).toContain("Trial day 6 of 14");
    const ticks = trial.querySelectorAll(".exec-cny-ticks i");
    expect(ticks).toHaveLength(14);
    expect(trial.querySelectorAll('i[data-state="now"]')).toHaveLength(1);
    expect(trial.querySelectorAll('i[data-state="on"]')).toHaveLength(5);
    expect(trial.textContent).toContain("Exit review opens Not published (FE-071)");
  });

  it("a fresh broker: the freshness chip carries its time and the rollback check its last update; no stale banner", async () => {
    mount(canaryPort(answering(populatedV1())));
    await ready();
    expect(document.querySelector(".exec-stage-chips")!.textContent).toContain("Fresh · 17 Oct 12:04Z");
    const rollback = screen.getByRole("heading", { name: "Rollback readiness" }).closest("section")!;
    expect(rollback.textContent).toContain("Broker data fresh");
    expect(rollback.textContent).toContain("Last update 17 Oct 12:04Z");
    expect(document.querySelector('[data-banner="guarded"]')).toBeNull();
  });

  it("a stale broker: the guarded banner says scale-up is blocked and protective actions stay open", async () => {
    mount(canaryPort(answering(populatedV1({ brokerFreshness: "STALE" }))));
    await ready();
    expect(screen.getByText("Broker data is stale. Scale-up is blocked. Protective actions stay open.")).toBeTruthy();
    await openTab("Guard rule");
    expect(screen.getByRole("table", { name: "Canary guard rule" }).textContent).toContain("Stale");
  });

  it("publishes the envelope's currency to the context bar", async () => {
    mount(canaryPort(answering(populatedV1())));
    await ready();
    expect(JSON.parse(screen.getByTestId("facts").textContent ?? "{}")).toMatchObject({ ccy: "USDT" });
  });
});

describe("V2 following-parent body: the proposal only", () => {
  it("says so, prints the proposed caps with every digit, and states no figure it does not have", async () => {
    mount(canaryPort(answering(parentBody("canary"))));
    await ready();
    expect(root().getAttribute("data-body")).toBe("v2");
    expect(screen.getByText("This response states the Canary proposal only. Runtime figures are not part of it.")).toBeTruthy();
    const kpis = within(screen.getByRole("group", { name: "Canary figures" }));
    const gaps = Array.from(screen.getByRole("group", { name: "Canary figures" }).querySelectorAll(".exec-blk-np"));
    expect(gaps.map((g) => g.textContent)).toEqual(Array(5).fill("Not published (FE-072)"));
    expect(kpis.getByText("Capital consumed")).toBeTruthy();
    const table = screen.getByRole("table", { name: "Canary envelope caps" });
    expect(within(table).getByRole("columnheader", { name: "Proposed" })).toBeTruthy();
    expect(table.querySelector('[data-full="9007199254740993.123456789123456789"]')).not.toBeNull();
    expect(table.querySelector('[data-full="0.000000000000000001"]')).not.toBeNull();
    expect(screen.getByRole("group", { name: "Trial schedule" }).textContent).toContain("proposed duration 7 days");
    const blockers = screen.getByRole("list", { name: "Before scale-up" });
    expect(blockers.textContent).toContain("The envelope is a draft: it is proposed, not effective.");
    expect(document.body.textContent ?? "").not.toMatch(NO_DASH);
  });

  it("an absent proposal says Not available with the server's reason code, and draws no table", async () => {
    mount(canaryPort(answering(parentBody("canary_absent"))));
    await ready();
    expect(screen.queryByRole("table", { name: "Canary envelope caps" })).toBeNull();
    expect(screen.getByText("Not available · PARENT_FIELD_PURPOSE_NOT_QUALIFIED")).toBeTruthy();
  });

  it("the four decisions are still drawn, disabled", async () => {
    mount(canaryPort(answering(parentBody("canary"))));
    await ready();
    for (const label of ["Hold", "Reduce", "Rollback", "Request scale"]) expect((screen.getByRole("button", { name: label }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("states", () => {
  it("unsupported: the dispatcher's sentence, no control room", async () => {
    const body = v1Body();
    body.schema_version = "execution.canary-control-room.v9";
    mount(canaryPort(answering(body)));
    expect(await screen.findByText(/execution\.canary-control-room\.v9/)).toBeTruthy();
    expect(root().getAttribute("data-state")).toBe("unsupported");
    expect(screen.queryByRole("group", { name: "Canary figures" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Hold" })).toBeNull();
  });

  it("a V2 body under a V1 version is refused, not read as either", async () => {
    const body = parentBody("canary");
    body.schema_version = "execution.canary-control-room.v1";
    mount(canaryPort(answering(body)));
    await waitFor(() => expect(root().getAttribute("data-state")).toBe("unsupported"));
    expect(document.querySelector(".exec-state-reason")?.textContent).toContain("carries a V2 shape, so it is not read as either");
  });

  it("denied (403): 'You can't open this page', See what you can access, Alpha Fleet", async () => {
    mount(canaryPort(refusing("denied", "The server refused this read.")));
    expect(await screen.findByText("You can't open this page.")).toBeTruthy();
    expect(root().getAttribute("data-state")).toBe("denied");
    expect(screen.getByRole("link", { name: "See what you can access" }).getAttribute("href")).toContain("/administration/profile-access");
    expect(screen.getByRole("link", { name: "Alpha Fleet" }).getAttribute("href")).toContain("/deployments/alphas");
    expect(screen.queryByRole("group", { name: "Canary figures" })).toBeNull();
  });

  it("unavailable keeps the guard frame, says why, and Retry reads again", async () => {
    const port = canaryPort(refusing("unavailable", "The canary control room is not reachable."));
    mount(port);
    expect(await screen.findByText("The canary control room is not reachable.")).toBeTruthy();
    expect(root().getAttribute("data-state")).toBe("unavailable");
    expect(document.querySelector(".exec-stage-guard")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(port.calls).toHaveLength(2));
  });

  it("stale (429) and terminal are their own states with their reasons", async () => {
    mount(canaryPort(refusing("stale", "Too many reads. Try again in a moment.")));
    expect(await screen.findByText("Too many reads. Try again in a moment.")).toBeTruthy();
    expect(root().getAttribute("data-state")).toBe("stale");
    cleanup();
    mount(canaryPort(refusing("terminal", "The read failed for good.")));
    expect(await screen.findByText("The read failed for good.")).toBeTruthy();
    expect(root().getAttribute("data-state")).toBe("terminal");
  });

  it("a read that throws is unavailable, not a crash", async () => {
    mount(canaryPort(async () => { throw new Error("boom"); }));
    expect(await screen.findByText("The read failed before the Portal answered.")).toBeTruthy();
  });

  it("Refresh reads again", async () => {
    const port = canaryPort(answering(v1Body()));
    mount(port);
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(port.calls).toHaveLength(2));
  });
});

describe("tabs and navigation", () => {
  it("a V1 label in the URL opens the tab and is rewritten to the slug", async () => {
    mount(canaryPort(answering(v1Body())), `/deployments/live/${DEP}/canary?tab=Guard%20rule`);
    await ready();
    await waitFor(() => expect(where()).toContain("tab=guard-rule"));
    expect(tabs().getByRole("tab", { name: "Guard rule" }).getAttribute("aria-selected")).toBe("true");
  });

  it("an unknown tab opens Envelope and says so", async () => {
    mount(canaryPort(answering(v1Body())), `/deployments/live/${DEP}/canary?tab=nonsense`);
    await ready();
    expect(tabs().getByRole("tab", { name: "Envelope" }).getAttribute("aria-selected")).toBe("true");
    expect((await screen.findByText(/nonsense/)).textContent).toMatch(/nonsense/);
  });

  it("arrow keys move between the four tabs and Home/End jump (keyboard)", async () => {
    mount(canaryPort(answering(v1Body())));
    await ready();
    const list = screen.getByRole("tablist", { name: "Canary sections" });
    const first = tabs().getByRole("tab", { name: "Envelope" });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    await waitFor(() => expect(tabs().getByRole("tab", { name: "Positions & orders" }).getAttribute("aria-selected")).toBe("true"));
    fireEvent.keyDown(list, { key: "End" });
    await waitFor(() => expect(tabs().getByRole("tab", { name: "Guard rule" }).getAttribute("aria-selected")).toBe("true"));
    expect(document.activeElement).toBe(tabs().getByRole("tab", { name: "Guard rule" }));
  });

  it("the spine: Live navigates to the Live screen of this deployment; Canary stays; R1 opens the Approval Inbox when the body has no link", async () => {
    mount(canaryPort(answering(parentBody("canary"))));
    await ready();
    const spine = screen.getByRole("list", { name: "Lifecycle" });
    fireEvent.click(within(spine).getByRole("button", { name: /Canary/ }));
    expect(where()).toBe(`/deployments/live/${DEP}/canary`);
    fireEvent.click(within(spine).getByRole("button", { name: /R1/ }));
    expect(where()).toBe("/governance/approvals");
  });

  it("the spine's Live node goes to /deployments/live/:id and carries the workspace", async () => {
    mount(canaryPort(answering(v1Body())), `/deployments/live/${DEP}/canary?workspace_id=ws_TEST_ONLY`);
    await ready();
    fireEvent.click(within(screen.getByRole("list", { name: "Lifecycle" })).getByRole("button", { name: /Live/ }));
    expect(where()).toContain(`/deployments/live/${DEP}`);
    expect(where()).toContain("workspace_id=ws_TEST_ONLY");
  });

  it("the crumb links Alpha Fleet and names the deployment; the alpha name is Not published (FE-066)", async () => {
    mount(canaryPort(answering(v1Body())));
    await ready();
    const crumb = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(crumb).getByRole("link", { name: "Alpha Fleet" }).getAttribute("href")).toBe("/deployments/alphas");
    expect(crumb.textContent).toContain(DEP);
    expect(document.querySelector(".exec-stage-sub")!.textContent).toContain("Not published (FE-066)");
  });
});

describe("components against typed rows and published ratios (FIXTURE_LAB, view-level)", () => {
  const positions = (n: number): PositionRow[] =>
    Array.from({ length: n }, (_, i) => ({ symbol: `SYM${i}`, side: i % 2 === 0 ? "long" : "short", quantity: "1.2000", entry: "3412.50", mark: "3421.10", unrealised: i % 2 === 0 ? "10.32" : "-4.55", leverage: "1.1" }));
  const orders = (n: number): OrderRow[] =>
    Array.from({ length: n }, (_, i) => ({ symbol: `ORD${i}`, type: "Limit", side: "buy", quantity: "0.4000", price: "3380.00", sinceMs: Date.UTC(2026, 9, 17, 11, 58), ackLatencyMs: "212" }));

  it("Positions & orders: 250 loaded rows draw 200 and say '200 of 5,000'; the hi-fi columns are all there", () => {
    const view = viewOf(v1Body());
    withRouter(<PositionsOrdersTab view={{ ...view, positions: { panel: view.positions.panel, rows: positions(250), total: 5000, published: null }, orders: { panel: view.orders.panel, rows: orders(1), total: 1, published: null } }} />);
    const table = screen.getByRole("table", { name: "Canary positions" });
    expect(within(table).getAllByRole("row")).toHaveLength(201);
    expect(screen.getByText("200 of 5,000")).toBeTruthy();
    for (const column of ["Symbol", "Side", "Quantity", "Entry", "Mark", "Unrealised PnL", "Leverage"]) expect(within(table).getByRole("columnheader", { name: column })).toBeTruthy();
    // every cell carries its column label for the 390px card layout
    expect(Array.from(table.querySelectorAll("tbody td")).every((td) => td.getAttribute("data-l"))).toBe(true);
    const orderTable = screen.getByRole("table", { name: "Canary open orders" });
    expect(orderTable.textContent).toContain("212 ms");
    expect(orderTable.textContent).toContain("17 Oct 11:58Z");
    expect(screen.getByText("1 of 1")).toBeTruthy();
    expect(table.textContent).not.toMatch(NO_DASH);
  });

  it("no exact total: the line says it is not published; an empty list says the source reported none", () => {
    const view = viewOf(v1Body());
    withRouter(<PositionsOrdersTab view={{ ...view, positions: { panel: view.positions.panel, rows: positions(3), total: null, published: null }, orders: { panel: view.orders.panel, rows: [], total: 0, published: null } }} />);
    expect(screen.getByText("3 shown · total not published")).toBeTruthy();
    expect(screen.getByText("The source reported none.")).toBeTruthy();
  });

  it("an unreadable decimal in a typed row prints as unreadable, never as 0", () => {
    const view = viewOf(v1Body());
    const bad = positions(1).map((p) => ({ ...p, quantity: "1e5", entry: "01" }));
    withRouter(<PositionsOrdersTab view={{ ...view, positions: { panel: view.positions.panel, rows: bad, total: 1, published: null }, orders: view.orders }} />);
    expect(screen.getByRole("table", { name: "Canary positions" }).textContent).toContain("Not available · unreadable value");
  });

  it("the gauge is drawn only from a ratio the server published, and shows that ratio", () => {
    const view = viewOf(v1Body());
    const limits = view.envelope!.limits.map((l, i) => (i === 0 ? { ...l, usedRatio: "0.76" } : l));
    withRouter(<EnvelopeTab view={{ ...view, envelope: { ...view.envelope!, limits } }} />);
    const gauges = screen.getAllByRole("img", { name: /used$/ });
    expect(gauges).toHaveLength(1);
    expect(gauges[0].getAttribute("aria-label")).toBe("Capital cap (USDT): 76.00% used");
    // the other four caps still say Not published (FE-071)
    expect(screen.getByRole("table", { name: "Canary envelope caps" }).textContent?.match(/Not published \(FE-071\)/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("a suppressed broker panel withholds the Broker and Difference columns", () => {
    const view = viewOf(populatedV1({ brokerState: "suppressed" }));
    withRouter(<ReconciliationTab view={view} />);
    expect(screen.getAllByText("Hidden while the figures disagree.")).toHaveLength(2);
  });
});

describe("a lit V1 body: rows under the source's own names, compliance figures, a ready rollback (FIXTURE_LAB)", () => {
  it("Positions & orders: the rows are drawn with the source's own field names and exact text; typed columns stay Not published (FE-072)", async () => {
    mount(canaryPort(answering(populatedWithFacts())));
    await ready();
    await openTab("Positions & orders");
    const table = screen.getByRole("table", { name: "Canary positions" });
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Symbol", "Side", "Qty", "Entry price", "Hedged", "Note"]);
    const first = Array.from(table.querySelectorAll("tbody tr"))[0]!;
    expect(Array.from(first.querySelectorAll("td")).map((td) => td.textContent)).toEqual(["BTCUSDT", "LONG", "0.0120", "64000.10", "No", "Not available"]);
    expect(screen.getByText("2 of 2")).toBeTruthy();
    expect(screen.getByText("1 of 1")).toBeTruthy();
    expect(screen.getAllByText("Columns are the source's own field names.", { exact: false })).toHaveLength(2);
    expect(table.closest("section")!.textContent).toContain("Not published (FE-072)");
    expect(table.textContent).not.toMatch(NO_DASH);
    expect(Array.from(table.querySelectorAll("tbody td")).every((td) => td.getAttribute("data-l"))).toBe(true);
  });

  it("rows of an unavailable panel are not drawn, even if the body carries some", async () => {
    const body = populatedWithFacts();
    body.positions.envelope.panel_state = "unavailable";
    body.positions.envelope.data = null;
    mount(canaryPort(answering(body)));
    await ready();
    await openTab("Positions & orders");
    expect(screen.queryByRole("table", { name: "Canary positions" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Positions" }).closest("section")!.textContent).toContain("Source unavailable");
  });

  it("Envelope: the consumed figure sits on its cap, other keys and the headroom are listed with their names", async () => {
    mount(canaryPort(answering(populatedWithFacts())));
    await ready();
    const table = screen.getByRole("table", { name: "Canary envelope caps" });
    const cells = (label: string) => Array.from(table.querySelectorAll("tbody tr")).map((row) => row.querySelector(`td[data-l="${label}"]`)?.textContent?.replace(/^Not published \(FE-071\).*$/, "NP"));
    expect(cells("Consumed")).toEqual(["3,820.00", "NP", "NP", "1", "NP"]);
    const other = screen.getByRole("list", { name: "Other published figures" });
    expect(other.textContent).toContain("Headroom, capital cap 1,180.00");
    expect(other.textContent).toContain("Consumed, fees paid 4.25");
    // No ratio is made from a consumed figure and a cap: the Used column stays Not published.
    expect(table.querySelector('[role="img"]')).toBeNull();
    expect(table.textContent).not.toMatch(/\d+(\.\d+)?%/);
  });

  it("Rollback readiness: Ready appears only for the server's true on a ready panel with nothing against it", async () => {
    mount(canaryPort(answering(populatedWithFacts())));
    await ready();
    const panel = screen.getByRole("heading", { name: "Rollback readiness" }).closest("section")!;
    expect(within(panel).getByText("Ready")).toBeTruthy();
    cleanup();
    const stale = populatedWithFacts();
    stale.rollback_readiness.blocker_codes = ["ROLLBACK_DRILL_STALE"];
    mount(canaryPort(answering(stale)));
    await ready();
    const contradicted = screen.getByRole("heading", { name: "Rollback readiness" }).closest("section")!;
    expect(within(contradicted).queryByText("Ready")).toBeNull();
    expect(within(contradicted).getByText("Not confirmed")).toBeTruthy();
  });
});

describe("keyboard and focus", () => {
  it("disabled decisions are not in the tab order, their reasons and My access links are", async () => {
    mount(canaryPort(answering(v1Body())));
    await ready();
    const panel = screen.getByRole("heading", { name: "Promotion decision" }).closest("section")!;
    const reachable = Array.from(panel.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), summary"));
    expect(reachable.map((el) => el.textContent)).toEqual(["My access", "My access", "My access", "My access", "How promotion works"]);
    await act(async () => undefined);
  });
});
