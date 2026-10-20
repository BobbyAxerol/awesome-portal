/**
 * Paper workbench screen against a fake of the ExecutionApi port (the two reads
 * it makes), through the PRODUCT readers: the honest chips, the lifecycle spine
 * that will not infer, the five tabs on one URL, every Not published cell with
 * its request id, the states a read can be in, the role variant, the single
 * read with Refresh, and the a11y names.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ExecutionApi } from "../../../api/ports";
import { V2_CAPABILITY, V2_ROLE_PRESETS } from "../../shell/roleNav";
import { ABSENT, dimension, dimensionOf, pairwise, type Draft } from "../../testkit/matrix";
import PaperWorkbenchScreen, { WORKBENCH_SCREEN_KEY, type PaperWorkbenchScreenProps } from "./index";
import {
  ACCOUNT, ALPHA_ID, DEP, PORTFOLIO, PORTFOLIO_NAME, STRATEGY, deferred, envelopeOf, fail, fakeApi, paperWire, qualityOf, qualityWire, sessionOf, type Fake, type FakeOptions, type Wire,
} from "./workbench.harness.fixtures";
import { whyText } from "../../gapWhyTestUtil";

const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("../../../../auth/session", () => ({ useSession: () => session.current }));

beforeEach(() => {
  session.current = sessionOf(V2_ROLE_PRESETS.manager);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Where() {
  const { pathname, search, hash } = useLocation();
  return <output data-testid="where">{pathname + search + hash}</output>;
}

interface Mount extends Fake {
  view: ReturnType<typeof render>;
}

function mount(options: FakeOptions & { entry?: string; props?: Partial<PaperWorkbenchScreenProps> } = {}): Mount {
  const { entry = `/deployments/paper/${DEP}`, props, ...fake } = options;
  const served = fakeApi(fake);
  const view = render(
    <MemoryRouter initialEntries={[entry]}>
      <PaperWorkbenchScreen api={served.api} deploymentId={DEP} {...props} />
      <Where />
    </MemoryRouter>,
  );
  return { ...served, view };
}

const where = () => screen.getByTestId("where").textContent ?? "";
const search = () => new URLSearchParams(where().split("?")[1]?.split("#")[0] ?? "");
const ready = () => screen.findByRole("heading", { level: 1, name: new RegExp(STRATEGY) });
const tabsList = () => within(screen.getByRole("tablist", { name: "Paper deployment sections" }));
const NO_DASH = /(^|\s)[-–—](\s|$)|N\/A/;
const text = () => document.body.textContent ?? "";
const chip = (name: string) => document.querySelector<HTMLElement>(`.exec-stage-chip[data-chip="${name}"]`)!;

async function openTab(label: string) {
  fireEvent.click(tabsList().getByRole("tab", { name: label }));
  await waitFor(() => expect(tabsList().getByRole("tab", { name: label }).getAttribute("aria-selected")).toBe("true"));
}

describe("screen contract", () => {
  it("is the workbench flag's screen", () => {
    expect(WORKBENCH_SCREEN_KEY).toBe("workbench");
  });

  it("reads the profile and the quality once each, for the paper variant, and shows a loading state first", async () => {
    const m = mount();
    expect(screen.getAllByRole("status", { name: "Loading" }).length).toBeGreaterThan(0);
    await ready();
    expect(m.calls.filter((c) => c.startsWith("profile"))).toEqual([`profile:${DEP}:paper`]);
    expect(m.calls.filter((c) => c.startsWith("quality"))).toEqual([`quality:${DEP}`]);
  });

  it("names the deployment by its strategy id (names are FE-066) with the Paper tag and the one h1", async () => {
    mount();
    const h1 = await ready();
    expect(h1.textContent).toContain("Paper");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    // No identity keys in this profile: the alpha is `Alpha Not available` (FE-066 in the title), no alpha id is shown, and the strategy id is NOT linked as an alpha.
    expect(text()).toContain("Alpha Not available");
    expect(text()).not.toContain("(FE-066)");
    expect(whyText(document.querySelector('.exec-wb-sub [data-gap="FE-066"]')!)).toContain("Not published (FE-066)");
    expect(screen.queryByRole("link", { name: STRATEGY })).toBeNull();
    expect(screen.queryByRole("link", { name: "← Alpha" })).toBeNull();
    expect(text()).not.toContain("Tracking approved evidence");
  });

  it("identity published (FE-066, S3-U5): the Alpha is linked by alpha_id, never by the strategy id; the portfolio shows its name; the alpha name stays Not published with its reason", async () => {
    mount({ profile: { ok: true, value: envelopeOf(paperWire({ identity: true })) } });
    await ready();
    expect(screen.getAllByRole("link", { name: "← Alpha" })[0]!.getAttribute("href")).toBe(`/deployments/alphas/${ALPHA_ID}`);
    expect(screen.getByRole("link", { name: STRATEGY }).getAttribute("href")).toBe(`/deployments/alphas/${ALPHA_ID}`);
    expect(document.querySelector(`a[href="/deployments/alphas/${STRATEGY}"]`)).toBeNull();
    expect(screen.getByRole("link", { name: PORTFOLIO_NAME }).getAttribute("href")).toBe(`/deployments/portfolios/${PORTFOLIO}`);
    expect(screen.queryByRole("link", { name: PORTFOLIO })).toBeNull();
    expect(text()).toContain(`Alpha ${ALPHA_ID}`);
    // The name is not announced a second time: the id stands alone and the request and the server's reason are its title.
    const gap = Array.from(document.querySelectorAll(".exec-wb-head .exec-wb-sub span")).find((n) => (n.textContent ?? "").includes(`Alpha ${ALPHA_ID}`) && n.querySelector("button[aria-expanded]") !== null)!;
    expect(text()).not.toContain("ALPHA_NAME_NOT_PUBLISHED");
    const why = whyText(gap);
    expect(why).toContain("ALPHA_NAME_NOT_PUBLISHED");
    expect(why).toContain("FE-066");
  });

  it("identity keys that break the schema's rules (a name without its id; some of the five missing) are refused whole: no link, no name", async () => {
    const wire = paperWire({ identity: true });
    delete wire.data.deployment.portfolio_name_reason_code;
    mount({ profile: { ok: true, value: envelopeOf(wire) } });
    await ready();
    expect(screen.queryByRole("link", { name: "← Alpha" })).toBeNull();
    expect(screen.queryByRole("link", { name: PORTFOLIO_NAME })).toBeNull();
    expect(screen.getByRole("link", { name: PORTFOLIO })).toBeTruthy();
  });

  it("opens on a read-scoped api so leaving the screen cancels the read", async () => {
    const m = mount();
    await ready();
    expect(m.signals.length).toBeGreaterThan(0);
  });

  it("is the VN variant when asked: the vnm profile is read and the calendar gap is named (FE-070)", async () => {
    const m = mount({ entry: `/deployments/paper/${DEP}/vn-market`, props: { variant: "vnm" } });
    await ready();
    expect(m.calls).toContain(`profile:${DEP}:vnm`);
    expect(text()).toContain("VN market calendar: Not available");
    expect(whyText(document.querySelector('.exec-wb-sub [data-gap="FE-070"]')!)).toContain("Not published (FE-070)");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("VN market");
  });
});

describe("the three chips never invent a state (D13a)", () => {
  it("Runtime and Reconciliation are one `Not available` chip (FE-067 in its title); the source flag rides in that title, no green Running", async () => {
    mount();
    await ready();
    expect(chip("runtime")).toBeNull();
    expect(chip("reconciliation")).toBeNull();
    expect(chip("gaps").textContent).toBe("Not availableRuntime, Reconciliation");
    expect(text()).not.toContain("(FE-067)");
    expect(whyText(chip("gaps"))).toContain("Runtime: Not published (FE-067)");
    expect(whyText(chip("gaps"))).toContain("Source flag: active");
    expect(whyText(chip("gaps"))).toContain("Reconciliation: Not published (FE-067)");
    expect(text()).not.toMatch(/\bRunning\b|\bReconciling\b/);
  });

  it("an inactive flag is worded as the source's flag, not as Halted", async () => {
    const wire = paperWire();
    wire.data.deployment.active = false;
    mount({ profile: { ok: true, value: envelopeOf(wire) } });
    await ready();
    expect(whyText(chip("gaps"))).toContain("Source flag: inactive");
    expect(text()).not.toMatch(/Halted|Stopped/);
  });

  it("an unreadable flag says nothing about activity", async () => {
    const wire = paperWire();
    wire.data.deployment.active = "yes";
    mount({ profile: { ok: true, value: envelopeOf(wire) } });
    await ready();
    expect(whyText(chip("gaps"))).not.toContain("Source flag");
  });

  it("freshness is the source's word and as-of; the browser prints no age", async () => {
    const wire = paperWire();
    wire.freshness = "STALE";
    mount({ profile: { ok: true, value: envelopeOf(wire) } });
    await ready();
    expect(chip("freshness").textContent).toContain("Stale");
    expect(chip("freshness").textContent).toContain("As of 17 Oct 09:14Z");
    expect(text()).not.toMatch(/Stale \d+\s?m|\d+ min/);
  });

  it("no published freshness is Not available, not Fresh", async () => {
    const wire = paperWire();
    delete wire.freshness;
    mount({ profile: { ok: true, value: envelopeOf(wire) } });
    await ready();
    expect(chip("freshness").textContent).toContain("Not available · No freshness published");
    expect(chip("freshness").textContent).not.toContain("Fresh");
  });

  it("while the profile loads each chip is a loading bar, announced once", async () => {
    const d = deferred<never>();
    mount({ profile: () => d.promise as never });
    await act(async () => {});
    expect(chip("runtime").getAttribute("data-state")).toBe("loading");
    expect(within(chip("runtime")).getByText("Loading")).toBeTruthy();
  });
});

describe("the lifecycle spine will not infer (D13b)", () => {
  it("marks only Paper as now; R1 and R2 are not Done; history is Not published (FE-027/028) in the spine's title", async () => {
    mount();
    await ready();
    const spine = screen.getByRole("list", { name: "Deployment lifecycle" });
    const nodes = within(spine).getAllByRole("listitem");
    expect(nodes).toHaveLength(6);
    expect(nodes.filter((n) => n.getAttribute("aria-current") === "step")).toHaveLength(1);
    expect(nodes.find((n) => n.getAttribute("aria-current") === "step")?.textContent).toContain("Paper");
    expect(spine.textContent).not.toContain("Done");
    expect(within(spine).getByLabelText("R1 gate, Unknown")).toBeTruthy();
    expect(within(spine).getByLabelText("R2 gate, Unknown")).toBeTruthy();
    expect(within(spine).getByLabelText("Sandbox, Later")).toBeTruthy();
    expect(spine.closest(".exec-wb-spine")!.getAttribute("title")).toBeNull();
    expect(whyText(spine.closest(".exec-wb-spine"))).toContain("Not published (FE-027/028): Stage history, gate criteria and decider");
    expect(text()).not.toContain("Stage history, gate criteria and decider");
  });

  it("names the server's gate verdict in the panel head and blocks the spine only when the server says BLOCKED", async () => {
    const wire = paperWire();
    wire.data.observation_gate.state = "BLOCKED";
    mount({ profile: { ok: true, value: envelopeOf(wire) } });
    await ready();
    expect(within(screen.getByRole("list", { name: "Deployment lifecycle" })).getByLabelText("Paper, Blocked")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Lifecycle" }).closest("section")!.textContent).toContain("Observation gate");
  });

  it("with the gate PARTIAL the spine says Paper is now, not blocked", async () => {
    mount();
    await ready();
    expect(within(screen.getByRole("list", { name: "Deployment lifecycle" })).getByLabelText("Paper, Now")).toBeTruthy();
  });
});

describe("the exit review request has one control, in the exit gate", () => {
  it("the lifecycle panel no longer repeats it", async () => {
    mount();
    await ready();
    expect(screen.queryByRole("button", { name: "Request exit review" })).toBeNull();
    expect(screen.getAllByRole("button", { name: /request review/i }).length).toBeLessThanOrEqual(1);
  });
});

describe("tabs on one URL", () => {
  it("lists the five tabs, opens Overview and keeps the default out of the URL", async () => {
    mount();
    await ready();
    const tabs = tabsList().getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Overview", "Orders", "Fills", "Positions", "Sessions"]);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(search().get("tab")).toBeNull();
    expect(screen.getByRole("tabpanel")).toBeTruthy();
  });

  it.each([["Orders", "orders"], ["Fills", "fills"], ["Positions", "positions"], ["Sessions", "sessions"]])("choosing %s writes ?tab=%s and Overview removes it", async (label, slug) => {
    mount();
    await ready();
    await openTab(label);
    expect(search().get("tab")).toBe(slug);
    await openTab("Overview");
    expect(search().get("tab")).toBeNull();
  });

  it("arrow keys move and wrap, Home and End jump; only the active tab is in the tab order", async () => {
    mount();
    await ready();
    const list = screen.getByRole("tablist", { name: "Paper deployment sections" });
    const active = () => tabsList().getAllByRole("tab").find((t) => t.getAttribute("aria-selected") === "true")!.textContent;
    fireEvent.keyDown(list, { key: "ArrowRight" });
    await waitFor(() => expect(active()).toBe("Orders"));
    fireEvent.keyDown(list, { key: "End" });
    await waitFor(() => expect(active()).toBe("Sessions"));
    fireEvent.keyDown(list, { key: "ArrowRight" });
    await waitFor(() => expect(active()).toBe("Overview"));
    fireEvent.keyDown(list, { key: "ArrowLeft" });
    await waitFor(() => expect(active()).toBe("Sessions"));
    fireEvent.keyDown(list, { key: "Home" });
    await waitFor(() => expect(active()).toBe("Overview"));
    expect(tabsList().getAllByRole("tab").filter((t) => t.getAttribute("tabindex") === "0")).toHaveLength(1);
  });

  it.each([["Orders", "Orders"], ["orders", "Orders"], ["Fills", "Fills"], ["Sessions", "Sessions"], ["accounting", "Overview"], ["evidence", "Overview"]])("an old link ?tab=%s opens %s and is rewritten in place", async (raw, label) => {
    mount({ entry: `/deployments/paper/${DEP}?tab=${raw}` });
    await ready();
    expect(tabsList().getByRole("tab", { name: label }).getAttribute("aria-selected")).toBe("true");
    await waitFor(() => expect(["orders", "fills", "sessions", null]).toContain(search().get("tab")));
    expect(search().get("tab")).not.toBe(raw === "Orders" ? "Orders" : "\u0000");
    expect(where()).not.toContain("tab=Orders");
  });

  it("a tab nobody knows opens Overview and says so in one line", async () => {
    mount({ entry: `/deployments/paper/${DEP}?tab=nonsense` });
    await ready();
    expect(tabsList().getByRole("tab", { name: "Overview" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText('Tab "nonsense" is not available. Showing overview.')).toBeTruthy();
    await waitFor(() => expect(search().get("tab")).toBeNull());
  });

  it("the anchor behind ?tab=accounting lands on the Accounting panel once it exists", async () => {
    const scrolled: string[] = [];
    Element.prototype.scrollIntoView = function scrollIntoView(this: Element) { scrolled.push(this.id); };
    mount({ entry: `/deployments/paper/${DEP}?tab=accounting` });
    await ready();
    await waitFor(() => expect(scrolled).toEqual(["exec-wb-accounting"]));
  });

  it("the anchor behind ?tab=evidence lands on the Exit gate panel", async () => {
    const scrolled: string[] = [];
    Element.prototype.scrollIntoView = function scrollIntoView(this: Element) { scrolled.push(this.id); };
    mount({ entry: `/deployments/paper/${DEP}?tab=evidence` });
    await ready();
    await waitFor(() => expect(scrolled).toEqual(["exec-wb-evidence"]));
  });

  it("carries the context params on every internal link", async () => {
    mount({ entry: `/deployments/paper/${DEP}?window=30d&workspace_id=ws_TEST_ONLY` });
    await ready();
    const hrefs = within(document.body).getAllByRole("link").map((a) => a.getAttribute("href") ?? "");
    const internal = hrefs.filter((h) => h.startsWith("/"));
    expect(internal.length).toBeGreaterThan(5);
    for (const href of internal) {
      expect(href, href).toContain("window=30d");
      expect(href, href).toContain("workspace_id=ws_TEST_ONLY");
    }
  });
});

describe("Overview", () => {
  it("draws equity with the published series and says the band is Not published (FE-029)", async () => {
    mount();
    await ready();
    expect(screen.getByRole("heading", { name: "Equity vs approved band" })).toBeTruthy();
    expect(screen.getByTestId("readout-value").textContent).toContain("101,800.00");
    expect(screen.getByRole("button", { name: "Expand Paper equity vs approved band" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Table, Paper equity vs approved band" })).toBeTruthy();
    // One line for the three unpublished facts; each request id is in its title.
    const gaps = screen.getByRole("heading", { name: "Equity vs approved band" }).closest("section")!.querySelector(".exec-blk-gaps")!;
    expect(gaps.textContent).toBe("Not available: Drawdown, Approved band, Window");
    for (const id of ["FE-013", "FE-029", "FE-025"]) expect(whyText(gaps)).toContain(`Not published (${id})`);
    expect(text()).not.toContain("snapshots published");
  });

  it("when there is nothing to draw the chart is a worded box, not an empty plot", async () => {
    mount({ profile: { ok: true, value: envelopeOf(paperWire({ equity: 0 })) } });
    await ready();
    expect(text()).toContain("No equity snapshot published.");
    expect(screen.queryByTestId("readout-value")).toBeNull();
  });

  it("Exit gate: the server's verdict, the published counts, three honest gaps, and a link to the review", async () => {
    mount();
    await ready();
    const panel = screen.getByRole("heading", { name: "Exit gate" }).closest("section")!;
    expect(panel.textContent).toContain("Partial");
    expect(within(panel).getByText("Partial").closest("td")!.getAttribute("title")).toBe("Set by the server");
    expect(panel.textContent).not.toContain("Set by the server");
    expect(panel.textContent).toContain("3 of 14 days");
    expect(panel.textContent).toContain("2 of 20 trades");
    expect(panel.textContent).toContain("Bounded by the source");
    expect(whyText(within(panel).getByText("Bounded by the source").closest("td")!)).toBe("SOURCE_RETENTION_SHORT");
    expect(panel.textContent).not.toContain("SOURCE_RETENTION_SHORT");
    // The three unpublished criteria are one line; the request ids are in its title.
    const gaps = panel.querySelector(".exec-blk-gaps")!;
    expect(gaps.textContent).toBe("Not available: Drift vs approved band, Fills reconcile, Cost drift");
    expect(panel.textContent).not.toContain("FE-0");
    expect(whyText(gaps)).toContain("Not published (FE-029)");
    expect(whyText(gaps)).toContain("Not published (FE-028)");
    expect(within(panel).getByRole("link", { name: "Open exit review" }).getAttribute("href")).toBe("/governance/exit-reviews");
    expect(panel.textContent).not.toMatch(/Insufficient data|Met\b/);
  });

  it("Runtime health: mode, open positions, last source update, fills counted, provenance", async () => {
    mount();
    await ready();
    const panel = screen.getByRole("heading", { name: "Runtime health" }).closest("section")!;
    expect(within(panel).getByRole("row", { name: /Mode · venue/ }).textContent).toContain("Paper · binance");
    expect(within(panel).getByRole("row", { name: /Open positions/ }).textContent).toContain("1");
    expect(within(panel).getByRole("row", { name: /Last source update/ }).textContent).toContain("17 Oct 09:14Z");
    expect(within(panel).getByRole("row", { name: /Fills counted/ }).textContent).toContain("2");
    const prov = panel.querySelector("details")!;
    expect(prov.textContent).toContain(DEP);
    expect(prov.textContent).toContain("digest 9c1e04b7a2f1");
    expect(prov.textContent).not.toContain("9c1e04b7a2f1ffff");
  });

  it("Accounting: published money, Funding Not available and Counted separately, cash as two figures", async () => {
    mount();
    await ready();
    const panel = screen.getByRole("heading", { name: "Accounting" }).closest("section")!;
    const row = (name: RegExp) => within(panel).getByRole("row", { name }).textContent ?? "";
    expect(row(/^Equity/)).toContain("101,800.00");
    expect(row(/Net PnL/)).toContain("+1,800.00");
    expect(row(/Fees/)).toContain("12.40");
    expect(row(/Funding/)).toContain("Not available");
    expect(whyText(within(panel).getByRole("row", { name: /Funding/ }).querySelector(".exec-blk-na")!)).toBe("Counted separately");
    expect(row(/Funding/)).not.toContain("Counted separately");
    expect(row(/Cash free/)).toContain("91,200.00 · 10,600.00");
    expect(panel.querySelector('[data-tone="positive"]')).toBeTruthy();
  });

  it("Accounting: a published funding figure prints, its row still titled Counted separately", async () => {
    const wire = paperWire();
    wire.data.account_equity[5].funding_pnl = "-3.10";
    mount({ profile: { ok: true, value: envelopeOf(wire) } });
    await ready();
    const funding = within(screen.getByRole("heading", { name: "Accounting" }).closest("section")!).getByRole("row", { name: /Funding/ });
    expect(funding.textContent).toContain("-3.10");
    expect(funding.querySelector("th")!.getAttribute("title")).toBe("Counted separately");
  });

  it("Execution quality: five counts as published, Partial flag, latency Not available with the source's own reason", async () => {
    mount();
    await ready();
    const panel = (await screen.findByRole("heading", { name: "Execution quality" })).closest("section")!;
    await waitFor(() => expect(within(panel).getByText("Sessions")).toBeTruthy());
    const kpis = within(within(panel).getByRole("group", { name: "Execution quality" }));
    for (const [label, value] of [["Sessions", "1"], ["Orders", "2"], ["Fills", "1"], ["Rejected", "0"]]) {
      expect(kpis.getByText(label).closest("div")!.textContent, label).toContain(value);
    }
    expect(panel.textContent).toContain("Of 2 submitted");
    // Latency is one `Not available: Latency` line; the source's own reason code is its title.
    const gap = panel.querySelector(".exec-blk-gaps")!;
    expect(gap.textContent).toBe("Not available: Latency");
    expect(panel.textContent).not.toContain("BROKER_TIMESTAMPS_NOT_PUBLISHED");
    expect(whyText(gap)).toContain("BROKER_TIMESTAMPS_NOT_PUBLISHED");
    expect(within(panel).getByText("Partial")).toBeTruthy();
  });

  it.each([
    ["unavailable", fail("unavailable", "The quality route is down."), "Unavailable", "The quality route is down."],
    ["denied", fail("denied", "Your session may not read quality."), "Withheld", "Your session may not read quality."],
  ])("Execution quality %s is its own state and does not touch the rest of the page", async (_name, result, title, reason) => {
    mount({ quality: result as never });
    await ready();
    const panel = (await screen.findByRole("heading", { name: "Execution quality" })).closest("section")!;
    await waitFor(() => expect(panel.textContent).toContain(title));
    expect(panel.textContent).toContain(reason);
    expect(screen.getByRole("heading", { name: "Accounting" })).toBeTruthy();
    expect(within(panel).queryByText("Partial")).toBeNull();
  });

  it("Execution quality: the derivation saying EMPTY or UNAVAILABLE replaces the strip with words", async () => {
    mount({ quality: { ok: true, value: qualityOf(qualityWire({ state: "UNAVAILABLE", reason_code: "SOURCE_DOWN" })) } });
    await ready();
    const panel = (await screen.findByRole("heading", { name: "Execution quality" })).closest("section")!;
    await waitFor(() => expect(panel.textContent).toContain("The source published no execution quality (SOURCE_DOWN)."));
    expect(within(panel).queryByRole("group", { name: "Execution quality" })).toBeNull();
  });
});

describe("Orders, Fills, Positions, Sessions", () => {
  it("Orders: newest first, sides, the source's states, a Blotter link per order", async () => {
    mount({ profile: { ok: true, value: envelopeOf(paperWire({ orders: 4 })) } });
    await ready();
    await openTab("Orders");
    const table = screen.getByRole("table", { name: "Orders" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(4);
    expect(rows[0].textContent).toContain("c-0044-0003");
    expect(rows[0].textContent).toContain("Sell");
    expect(rows[0].textContent).toContain("Submitted");
    expect(rows[3].textContent).toContain("Filled");
    expect(rows[1].textContent).toContain("Rejected");
    expect(within(rows[0]).getByRole("link", { name: "Open order c-0044-0003 in the Blotter" }).getAttribute("href")).toBe(`/deployments/blotter?deployment=${DEP}&order=ord_00003`);
    expect(screen.getByTestId("Orders-cap").textContent).toBe("4 orders");
  });

  it("Orders: a submitted time and a type column appear only when the profile states them; a row without a type says Not available", async () => {
    const wire = paperWire({ orders: 2 });
    wire.data.orders[0].order_type = "STOP_MARKET";
    mount({ profile: { ok: true, value: envelopeOf(wire) } });
    await ready();
    await openTab("Orders");
    const table = screen.getByRole("table", { name: "Orders" });
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Submitted (UTC)", "Client order", "Type", "Side", "Quantity", "Price", "State", "Blotter"]);
    const rows = within(table).getAllByRole("row").slice(1);
    // Newest first: ord 1 states no type, ord 0 states one; the instant is the order's own, in UTC.
    expect(rows[0].querySelector("td[data-l='Type']")!.textContent).toBe("Not available");
    expect(rows[1].querySelector("td[data-l='Type']")!.textContent).toBe("Stop market");
    expect(rows[1].querySelector("td[data-l='Submitted (UTC)'] time")!.getAttribute("datetime")).toBe("2026-10-16T14:00:00.000Z");
    cleanup();
    mount({ profile: { ok: true, value: envelopeOf(paperWire({ orders: 2 })) } });
    await ready();
    await openTab("Orders");
    expect(within(screen.getByRole("table", { name: "Orders" })).getAllByRole("columnheader").map((h) => h.textContent)).not.toContain("Type");
  });

  it("Orders: an UNKNOWN or unknown-word state reads Unknown, never a success", async () => {
    const wire = paperWire({ orders: 2 });
    wire.data.orders[0].status = "UNKNOWN";
    wire.data.orders[1].status = "BRAND_NEW_STATE";
    mount({ profile: { ok: true, value: envelopeOf(wire) } });
    await ready();
    await openTab("Orders");
    const rows = within(screen.getByRole("table", { name: "Orders" })).getAllByRole("row").slice(1);
    for (const row of rows) expect(row.textContent).toContain("Unknown");
    expect(text()).not.toContain("BRAND_NEW_STATE");
  });

  it("Orders: a price the source did not publish is Not available, not 0", async () => {
    const wire = paperWire({ orders: 1 });
    delete wire.data.orders[0].price;
    mount({ profile: { ok: true, value: envelopeOf(wire) } });
    await ready();
    await openTab("Orders");
    const row = within(screen.getByRole("table", { name: "Orders" })).getAllByRole("row")[1];
    expect(within(row).getAllByText("Not available").length).toBeGreaterThan(0);
    expect(row.textContent).not.toMatch(/\b0(\.0+)?\b(?!\.\d)/);
  });

  it("Orders: none published is a sentence; a missing branch is a different sentence", async () => {
    mount({ profile: { ok: true, value: envelopeOf(paperWire({ orders: 0 })) } });
    await ready();
    await openTab("Orders");
    expect(document.querySelector('[data-table="Orders"] .exec-wb-empty')!.textContent).toBe("No orders");
    cleanup();
    const wire = paperWire();
    delete wire.data.orders;
    mount({ profile: { ok: true, value: envelopeOf(wire) } });
    await ready();
    await openTab("Orders");
    // A missing branch is `Not available` (the sentence is its title); a published empty one is `No orders`.
    const wrap = document.querySelector('[data-table="Orders"]')!;
    expect(wrap.textContent).toBe("Not available");
    expect(whyText(wrap.querySelector(".exec-blk-na")!)).toBe("The profile carries no orders branch for this deployment.");
  });

  it("Fills: when (UTC), order, quantity, price, fee with its currency", async () => {
    mount({ profile: { ok: true, value: envelopeOf(paperWire({ fills: 2 })) } });
    await ready();
    await openTab("Fills");
    const rows = within(screen.getByRole("table", { name: "Fills" })).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("16 Oct 14:03Z");
    expect(rows[0].textContent).toContain("c-0044-0001");
    expect(rows[0].textContent).toContain("12.40");
    expect(rows[0].textContent).toContain("USDT");
    expect(screen.getByTestId("Fills-cap").textContent).toBe("2 fills");
  });

  it("Fills: a liquidity column appears only when the profile states a side; MAKER, TAKER or UNKNOWN as the source said it", async () => {
    const wire = paperWire({ fills: 2 });
    wire.data.fills[0].liquidity_side = "MAKER";
    mount({ profile: { ok: true, value: envelopeOf(wire) } });
    await ready();
    await openTab("Fills");
    const table = screen.getByRole("table", { name: "Fills" });
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["When (UTC)", "Client order", "Quantity", "Price", "Fee", "Liquidity"]);
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows[0].querySelector("td[data-l='Liquidity']")!.textContent).toBe("Not available");
    expect(rows[1].querySelector("td[data-l='Liquidity']")!.textContent).toBe("Maker");
    cleanup();
    mount({ profile: { ok: true, value: envelopeOf(paperWire({ fills: 2 })) } });
    await ready();
    await openTab("Fills");
    expect(within(screen.getByRole("table", { name: "Fills" })).getAllByRole("columnheader").map((h) => h.textContent)).not.toContain("Liquidity");
  });

  it("Positions: the published columns, and Long, Short and Gross named as Not published (FE-051)", async () => {
    mount();
    await ready();
    await openTab("Positions");
    const table = screen.getByRole("table", { name: "Positions" });
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Symbol", "Side", "Quantity", "Entry", "Mark", "Unrealised PnL"]);
    expect(within(table).getAllByRole("row")[1].textContent).toContain("BTCUSDT");
    expect(within(table).getAllByRole("row")[1].textContent).toContain("+9.54");
    const gap = document.querySelector(".exec-wb-sides .exec-blk-gaps, .exec-blk-gaps")!;
    expect(gap.textContent).toBe("Not available: Long, Short, Gross by instrument");
    expect(whyText(gap)).toContain("Not published (FE-051)");
  });

  it("Positions: a flat row prints its zero quantity but no entry price, and says why", async () => {
    const wire = paperWire({ positions: 2 });
    Object.assign(wire.data.positions[1], { instrument_id: "SOLUSDT", side: "FLAT", quantity: "0", avg_px_open: "0", mark_price: "152.30", unrealized_pnl: "0" });
    mount({ profile: { ok: true, value: envelopeOf(wire) } });
    await ready();
    await openTab("Positions");
    const flatRow = within(screen.getByRole("table", { name: "Positions" })).getAllByRole("row").find((r) => r.textContent?.includes("SOLUSDT"))!;
    const cells = within(flatRow).getAllByRole("cell").map((c) => c.textContent);
    expect(cells[2]).toBe("0");
    expect(cells[3]).toBe("Not available");
    expect(whyText(within(flatRow).getAllByRole("cell")[3]!.querySelector(".exec-blk-na")!)).toBe("Flat: no entry price");
    expect(cells[3]).not.toContain("0.00");
    expect(cells[4]).toContain("152.30");
  });

  it("Sessions: Not published (FE-067), the count the quality read gives, and no empty table", async () => {
    mount();
    await ready();
    await openTab("Sessions");
    expect(screen.queryByRole("table", { name: /Sessions/ })?.getAttribute("aria-label")).not.toBe("Sessions rows");
    const panel = screen.getByRole("heading", { name: "Sessions" }).closest("section")!;
    expect(panel.querySelector(".exec-blk-gaps")!.textContent).toBe("Not available: Session rows");
    // The request and the reason the server gave ride in the title.
    expect(whyText(panel.querySelector(".exec-blk-gaps")!)).toContain("Not published (FE-067)");
    expect(whyText(panel.querySelector(".exec-blk-gaps")!)).toContain("PAPER_WORKBENCH_RELATION_NOT_BOUND_TO_SCREEN");
    await waitFor(() => expect(within(panel).getByRole("row", { name: /Sessions counted/ }).textContent).toContain("1"));
    expect(within(panel).getAllByRole("row")).toHaveLength(1);
  });

  it("Sessions (stage_facts published): the rows newest first with the source's own state word, the open one without a completion time; the chips carry the runtime and the findings", async () => {
    mount({ profile: { ok: true, value: envelopeOf(paperWire({ stageFacts: "published" })) } });
    await ready();
    expect(chip("runtime").textContent).toContain("Running");
    expect(chip("runtime").textContent).toContain("since 12 Oct 08:00Z");
    expect(chip("reconciliation").textContent).toContain("1 open finding");
    expect(chip("reconciliation").textContent).toContain("1 unknown order");
    await openTab("Sessions");
    const table = screen.getByRole("table", { name: "Sessions" });
    const rows = Array.from(table.querySelectorAll("tbody tr"));
    expect(rows.map((r) => r.querySelector('td[data-l="Session"]')!.textContent)).toEqual(["session_TEST_ONLY_2", "session_TEST_ONLY_1"]);
    expect(rows[0]!.querySelector('td[data-l="Ended"]')!.textContent).toBe("Not available");
    expect(whyText(rows[0]!.querySelector('td[data-l="Ended"] .exec-blk-na')!)).toBe("No completion time");
    expect(rows[0]!.querySelector('td[data-l="State"]')!.textContent).toBe("Running");
    expect(rows[1]!.querySelector('td[data-l="State"]')!.textContent).toBe("Completed");
    expect(screen.getByTestId("Sessions-cap").textContent).toBe("2 sessions");
  });

  it("Positions (positions_by_side published): Long, Short and Gross as the server wrote them; notional by side stays Not published; a partial block says what it left out", async () => {
    mount({ profile: { ok: true, value: envelopeOf(paperWire({ sides: "available" })) } });
    await ready();
    await openTab("Positions");
    const table = screen.getByRole("table", { name: "Long, Short and Gross by instrument" });
    const first = Array.from(table.querySelectorAll("tbody tr"))[0]!;
    expect(Array.from(first.querySelectorAll("td")).map((td) => td.textContent)).toEqual(["BTCUSDT", "0.91", "0.52", "1.43", "2"]);
    expect(Array.from(table.querySelectorAll("tbody tr"))[1]!.querySelector('td[data-l="Short"]')!.textContent).toBe("0");
    expect(text()).toContain("Not counted: 1 flat, 1 closed.");
    const notional = Array.from(document.querySelectorAll(".exec-blk-gaps")).find((n) => n.textContent === "Not available: Notional by side")!;
    expect(whyText(notional)).toContain("Not published (FE-051)");
    expect(text()).not.toContain("Long, Short, Gross by instrument");
    cleanup();
    mount({ profile: { ok: true, value: envelopeOf(paperWire({ sides: "partial" })) } });
    await ready();
    await openTab("Positions");
    expect(text()).toContain("Not counted: 2 not classified, 1 without an instrument.");
    cleanup();
    mount({ profile: { ok: true, value: envelopeOf(paperWire({ sides: "unavailable" })) } });
    await ready();
    await openTab("Positions");
    expect(text()).toContain("Not available: Long, Short, Gross by instrument");
    expect(screen.queryByRole("table", { name: "Long, Short and Gross by instrument" })).toBeNull();
  });

  it("prints no dash and no N/A anywhere on any tab", async () => {
    mount();
    await ready();
    for (const label of ["Overview", "Orders", "Fills", "Positions", "Sessions"]) {
      await openTab(label);
      await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
      expect(text(), label).not.toMatch(NO_DASH);
    }
  });
});

describe("roles: the capability set decides, never a role name", () => {
  it("a manager sees the Account links and the portfolio and alpha links (the alpha link needs a published alpha_id)", async () => {
    mount({ profile: { ok: true, value: envelopeOf(paperWire({ identity: true })) } });
    await ready();
    expect(screen.getAllByRole("link", { name: "Account" })).toHaveLength(1);
    expect(screen.getByRole("link", { name: ACCOUNT }).getAttribute("href")).toBe(`/deployments/accounts/${ACCOUNT}`);
    expect(screen.getByRole("link", { name: PORTFOLIO_NAME }).getAttribute("href")).toBe(`/deployments/portfolios/${PORTFOLIO}`);
    expect(screen.getAllByRole("link", { name: STRATEGY })[0].getAttribute("href")).toBe(`/deployments/alphas/${ALPHA_ID}`);
    expect(text()).not.toContain("Account not available");
  });

  it("a researcher loses both Account links and reads Account not available; the rest is the same", async () => {
    session.current = sessionOf(V2_ROLE_PRESETS.researcher);
    mount();
    await ready();
    expect(screen.queryByRole("link", { name: "Account" })).toBeNull();
    expect(screen.queryByRole("link", { name: ACCOUNT })).toBeNull();
    expect(text()).toContain("Account not available");
    expect(text()).not.toContain(ACCOUNT);
    expect(screen.getByRole("link", { name: "Operations" })).toBeTruthy();
    expect(screen.getByRole("link", { name: PORTFOLIO })).toBeTruthy();
  });

  it("the capabilities prop wins over the session", async () => {
    session.current = sessionOf(V2_ROLE_PRESETS.manager);
    mount({ props: { capabilities: new Set([V2_CAPABILITY.portfoliosRead]) } });
    await ready();
    expect(text()).toContain("Account not available");
  });

  it("while access is still loading the screen states nothing about accounts", async () => {
    session.current = { principal: null, access: { kind: "loading" } };
    mount();
    await ready();
    expect(text()).not.toContain("Account not available");
  });
});

describe("the On scroll summary bar", () => {
  it("is a named region with the deployment, the same states as the header and a way back to the alpha (only when alpha_id is published)", async () => {
    mount();
    await ready();
    expect(screen.queryByRole("link", { name: "← Alpha" })).toBeNull();
    cleanup();
    mount({ profile: { ok: true, value: envelopeOf(paperWire({ identity: true })) } });
    await ready();
    const bar = screen.getByRole("complementary", { name: "Deployment summary" });
    expect(bar.textContent).not.toContain("On scroll");
    expect(bar.textContent).toContain(`${STRATEGY} · Paper monitor`);
    // What the header already says is not said twice: an unpublished Runtime and Reconciliation stay in the header's one chip.
    expect(bar.textContent).not.toContain("Runtime");
    expect(bar.textContent).not.toContain("Reconciliation");
    expect(bar.textContent).not.toContain("Deployment state");
    expect(bar.textContent).toContain("As of 17 Oct 09:14Z");
    expect(within(bar).getByRole("link", { name: "← Alpha" }).getAttribute("href")).toBe(`/deployments/alphas/${ALPHA_ID}`);
  });

  it("is pinned on a wide screen and static at phone width, where it would cover the cards it repeats", () => {
    const css = readFileSync(join(__dirname, "../../css/workbench.css"), "utf8");
    expect(/\.exec-wb-mini\s*\{[^}]*position:\s*sticky/.test(css)).toBe(true);
    const phone = css.slice(css.indexOf("@media (max-width: 660px)"));
    expect(/\.exec-wb-mini\s*\{\s*position:\s*static;/.test(phone)).toBe(true);
  });

  it("is absent while loading and when the page is replaced by a state", async () => {
    const d = deferred<never>();
    mount({ profile: () => d.promise as never });
    expect(screen.queryByRole("complementary", { name: "Deployment summary" })).toBeNull();
    cleanup();
    mount({ profile: fail("denied", "no") as never });
    await screen.findByText("Withheld");
    expect(screen.queryByRole("complementary", { name: "Deployment summary" })).toBeNull();
  });
});

describe("states of the profile read (L1 matrix: outcome x quality x role)", () => {
  type Draftable = { wire: Wire; qwire: Wire; outcome: string; role: string };
  const base: Draftable = { wire: paperWire(), qwire: qualityWire(), outcome: "", role: "manager" };
  const dims = [
    dimensionOf("profile", [
      { label: "ok", apply: () => undefined },
      { label: "partial", apply: (d: Draft) => { d.wire.state = "partial"; d.wire.completeness = "PARTIAL"; } },
      { label: "stale", apply: (d: Draft) => { d.wire.state = "stale"; d.wire.freshness = "STALE"; } },
      { label: "empty", apply: (d: Draft) => { d.wire.state = "empty"; d.wire.data.deployment = null; d.wire.data.deployments = []; } },
      { label: "nq", apply: (d: Draft) => { d.wire.state = "unavailable"; } },
      { label: "denied", apply: (d: Draft) => { d.outcome = "denied"; } },
      { label: "unavailable", apply: (d: Draft) => { d.outcome = "unavailable"; } },
      { label: "terminal", apply: (d: Draft) => { d.outcome = "terminal"; } },
      { label: "stale-429", apply: (d: Draft) => { d.outcome = "stale"; } },
      { label: "other-schema", apply: (d: Draft) => { d.wire.schema_version = "execution.portfolio-resource.v1"; } },
    ]),
    dimensionOf("quality", [
      { label: "ok", apply: () => undefined },
      { label: "unavailable", apply: (d: Draft) => { d.qwire = null; } },
      { label: "empty", apply: (d: Draft) => { d.qwire.state = "EMPTY"; } },
    ]),
    dimension("role", ["role"], ["manager", "researcher"]),
    dimension("tab", ["tab"], ["overview", "orders", "fills", "positions", "sessions", ABSENT]),
  ];
  const states = pairwise({ ...base, tab: "overview" } as Draft, dims);

  it("covers more than one state per axis value", () => {
    expect(states.length).toBeGreaterThan(20);
  });

  it.each(states.map((s) => [s.name, s] as const))("%s", async (_name, s) => {
    const { wire, qwire, outcome, role, tab } = s.value as Draftable & { tab: string | null };
    session.current = sessionOf(V2_ROLE_PRESETS[role as "manager" | "researcher"]);
    const profile = outcome === "" ? { ok: true as const, value: envelopeOf(wire) } : fail(outcome as never, `Because ${outcome}.`);
    const quality = qwire === null ? fail("unavailable", "The quality read failed.") : { ok: true as const, value: qualityOf(qwire) };
    mount({ profile: profile as never, quality: quality as never, entry: `/deployments/paper/${DEP}${tab && tab !== "overview" ? `?tab=${tab}` : ""}` });

    const picks = s.picks;
    const replaced = ["empty", "denied", "unavailable", "terminal", "stale-429", "other-schema"].includes(picks.profile);
    // The header is always there: the reader knows where they are even when the body is a state.
    await screen.findByRole("heading", { level: 1 });
    if (replaced) {
      await waitFor(() => expect(document.querySelector(".exec-state")).toBeTruthy());
      expect(screen.queryByRole("tablist")).toBeNull();
      expect(screen.queryByRole("complementary", { name: "Deployment summary" })).toBeNull();
      expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
      expect(Boolean(screen.queryByRole("link", { name: "My access" }))).toBe(picks.profile === "denied");
      expect(chip("runtime").textContent).toContain("Not available · The profile was not read");
      expect(text()).not.toMatch(/FE-067/);
    } else {
      await screen.findByRole("tablist", { name: "Paper deployment sections" });
      expect(screen.getByRole("complementary", { name: "Deployment summary" })).toBeTruthy();
      expect(screen.queryAllByText(/Some branches or rows may be missing/).length > 0).toBe(picks.profile === "partial");
      expect(screen.queryAllByText(/No update within the freshness budget/).length > 0).toBe(picks.profile === "stale");
      expect(whyText(chip("gaps"))).toContain("Runtime: Not published (FE-067)");
      expect(screen.queryAllByText("Source not qualified.").length > 0).toBe(picks.profile === "nq");
    }
    // Account facts follow the capability set in every state.
    expect(Boolean(screen.queryByText("Account not available"))).toBe(picks.role === "researcher" && !replaced ? true : picks.role === "researcher");
    expect(text()).not.toMatch(NO_DASH);
  });
});

describe("one read and Refresh (D11/D12)", () => {
  it("does not poll: a quiet minute makes no second request", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const m = mount();
      await ready();
      await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
      expect(m.calls.filter((c) => c.startsWith("profile"))).toHaveLength(1);
      expect(m.calls.filter((c) => c.startsWith("quality"))).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("Refresh re-reads both; the screen stays, says it is refreshing, and the new answer replaces the old", async () => {
    const okOf = (wire: Wire) => ({ ok: true as const, value: envelopeOf(wire) });
    const second = deferred<{ ok: true; value: ReturnType<typeof envelopeOf> }>();
    const first = okOf(paperWire());
    let n = 0;
    const m = mount({ profile: () => (n++ === 0 ? first : (second.promise as never)) as never });
    await ready();
    expect(screen.getByTestId("readout-value").textContent).toContain("101,800.00");
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    const busy = await screen.findByRole("button", { name: "Refreshing…" });
    expect(busy.getAttribute("aria-busy")).toBe("true");
    // The old answer is still on screen while the new one is read.
    expect(screen.getByTestId("readout-value").textContent).toContain("101,800.00");
    expect(m.calls.filter((c) => c.startsWith("profile"))).toHaveLength(2);
    expect(m.calls.filter((c) => c.startsWith("quality"))).toHaveLength(2);
    const next = paperWire({ equity: 7 });
    await act(async () => { second.resolve(okOf(next)); });
    await waitFor(() => expect(screen.getByRole("button", { name: "Refresh" })).toBeTruthy());
    expect(screen.getByTestId("readout-value").textContent).toContain("102,160.00");
  });

  it("a second click while a read is in flight starts no second request", async () => {
    const hold = deferred<never>();
    let n = 0;
    const first = { ok: true as const, value: envelopeOf(paperWire()) };
    const m = mount({ profile: () => (n++ === 0 ? first : (hold.promise as never)) as never });
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await screen.findByRole("button", { name: "Refreshing…" });
    fireEvent.click(screen.getByRole("button", { name: "Refreshing…" }));
    fireEvent.click(screen.getByRole("button", { name: "Refreshing…" }));
    await act(async () => {});
    expect(m.calls.filter((c) => c.startsWith("profile"))).toHaveLength(2);
  });

  it("a refresh that fails keeps the old answer and says so beside it", async () => {
    let n = 0;
    const first = { ok: true as const, value: envelopeOf(paperWire()) };
    mount({ profile: () => (n++ === 0 ? first : fail("unavailable", "The Portal did not answer in time.")) as never });
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await screen.findByText("Refresh failed: The Portal did not answer in time.");
    expect(screen.getByTestId("readout-value").textContent).toContain("101,800.00");
    expect(screen.getByRole("tablist")).toBeTruthy();
  });

  it("shows when the shown profile was read", async () => {
    mount();
    await ready();
    expect(text()).toContain("Read 17 Oct 09:14Z");
  });

  it("Try again after a failed first read reads again and recovers", async () => {
    let n = 0;
    const m = mount({ profile: () => (n++ === 0 ? fail("unavailable", "The Portal did not answer.") : { ok: true, value: envelopeOf(paperWire()) }) as never });
    await screen.findByText("The Portal did not answer.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await ready();
    expect(m.calls.filter((c) => c.startsWith("profile"))).toHaveLength(2);
  });

  it("leaving the screen cancels the read", async () => {
    const d = deferred<never>();
    const m = mount({ profile: () => d.promise as never });
    await waitFor(() => expect(m.signals.length).toBeGreaterThan(0));
    m.view.unmount();
    expect(m.signals.every((s) => s.aborted)).toBe(true);
  });

  it("another deployment is another question: the old answer is forgotten", async () => {
    const served = fakeApi();
    const view = render(
      <MemoryRouter>
        <PaperWorkbenchScreen api={served.api} deploymentId={DEP} />
      </MemoryRouter>,
    );
    await ready();
    view.rerender(
      <MemoryRouter>
        <PaperWorkbenchScreen api={served.api} deploymentId="dep_TEST_ONLY_other" />
      </MemoryRouter>,
    );
    await waitFor(() => expect(served.calls).toContain("profile:dep_TEST_ONLY_other:paper"));
  });
});

describe("nq: the source is not qualified (hi-fi state)", () => {
  function nqWire() {
    const wire = paperWire({ orders: 3, fills: 2, positions: 2, equity: 6 });
    wire.state = "unavailable";
    wire.capabilities = [{ capability_id: "paper.equity", state: "UNAVAILABLE", reason_code: "SOURCE_NOT_QUALIFIED", retryable: false }];
    return wire;
  }

  it("keeps the frame, says so once with the published code, and draws no figure", async () => {
    mount({ profile: { ok: true, value: envelopeOf(nqWire()) } });
    await ready();
    const banner = screen.getByText("Source not qualified.", { selector: ".exec-blk-banner span" });
    // The published reason codes are behind a disclosure on the banner (RV-06), not a title and not a second printed line.
    expect(banner.closest(".exec-blk-banner")!.hasAttribute("title")).toBe(false);
    expect(whyText(banner.closest(".exec-blk-banner")!)).toContain("SOURCE_NOT_QUALIFIED");
    expect(text()).not.toContain("SOURCE_NOT_QUALIFIED");
    expect(screen.getByRole("tablist")).toBeTruthy();
    expect(screen.queryByTestId("readout-value")).toBeNull();
    expect(text()).toContain("Source not qualified.");
    const quality = (await screen.findByRole("heading", { name: "Execution quality" })).closest("section")!;
    expect(quality.textContent).toContain("Source not qualified.");
    const accounting = screen.getByRole("heading", { name: "Accounting" }).closest("section")!;
    expect(within(accounting).getAllByText("Not available").length).toBeGreaterThanOrEqual(4);
    expect(accounting.textContent).not.toMatch(/101,800|1,800|12\.40/);
    await openTab("Orders");
    expect(whyText(document.querySelector('[data-table="Orders"] .exec-blk-na'))).toBe("The profile carries no orders branch for this deployment.");
    expect(text()).not.toMatch(NO_DASH);
  });

  it("a transport failure is not nq: it is an Unavailable state with Try again", async () => {
    mount({ profile: fail("unavailable", "The Portal did not answer.") as never });
    expect(await screen.findByText("Unavailable")).toBeTruthy();
    expect(screen.queryByText("Source not qualified.")).toBeNull();
  });
});

describe("states have the right words and actions", () => {
  it("denied: Withheld, the reason, My access and Try again", async () => {
    mount({ profile: fail("denied", "execution.accounts.read is required.") as never });
    expect(await screen.findByText("Withheld")).toBeTruthy();
    expect(text()).toContain("execution.accounts.read is required.");
    expect(screen.getByRole("link", { name: "My access" }).getAttribute("href")).toBe("/administration/profile-access");
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("unavailable and terminal are different titles", async () => {
    mount({ profile: fail("unavailable", "Down.") as never });
    expect(await screen.findByText("Unavailable")).toBeTruthy();
    cleanup();
    mount({ profile: fail("terminal", "Gone.") as never });
    expect(await screen.findByText("Failed")).toBeTruthy();
  });

  it("an empty profile is Nothing to show, with its reason", async () => {
    const wire = paperWire();
    wire.state = "empty";
    mount({ profile: { ok: true, value: envelopeOf(wire) } });
    expect(await screen.findByText("Nothing to show")).toBeTruthy();
    expect(text()).toContain("No deployment is present in the profile the Portal returned.");
  });

  it("a body that is not a paper-workbench profile is Failed, not a half-drawn page", async () => {
    const wire = paperWire();
    wire.schema_version = "execution.alpha-resource.v1";
    mount({ profile: { ok: true, value: envelopeOf(wire) } });
    expect(await screen.findByText("Failed")).toBeTruthy();
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("partial and stale keep the page and name themselves", async () => {
    const wire = paperWire();
    wire.completeness = "PARTIAL";
    wire.freshness = "STALE";
    mount({ profile: { ok: true, value: envelopeOf(wire) } });
    await ready();
    const banners = screen.getAllByRole("status").map((b) => b.textContent ?? "");
    expect(banners.some((b) => b.includes("Partial") && b.includes("Some branches or rows may be missing"))).toBe(true);
    expect(banners.some((b) => b.includes("Stale") && b.includes("No update within the freshness budget"))).toBe(true);
    expect(screen.getByRole("tablist")).toBeTruthy();
  });
});

describe("a11y names and structure", () => {
  it("every control has a name; every disabled one is described; headings nest", async () => {
    mount();
    await ready();
    await screen.findByRole("heading", { name: "Execution quality" });
    for (const button of screen.getAllByRole("button")) {
      expect((button.textContent ?? "").trim() || button.getAttribute("aria-label"), button.outerHTML).toBeTruthy();
      if ((button as HTMLButtonElement).disabled) expect(button.getAttribute("aria-describedby"), button.outerHTML).toBeTruthy();
    }
    for (const link of screen.getAllByRole("link")) expect((link.textContent ?? "").trim() || link.getAttribute("aria-label"), link.outerHTML).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Deployment state" })).toBeTruthy();
    expect(screen.getByRole("tabpanel")).toBeTruthy();
    const levels = screen.getAllByRole("heading").map((h) => Number(h.tagName.slice(1)));
    expect(levels[0]).toBe(1);
    for (let i = 1; i < levels.length; i += 1) expect(levels[i] - levels[i - 1], `heading ${i}`).toBeLessThanOrEqual(1);
  });

  it("every table has a name, and its cells carry the labels the 660px cards print", async () => {
    mount();
    await ready();
    for (const label of ["Orders", "Fills", "Positions"]) {
      await openTab(label);
      const table = screen.getByRole("table", { name: label });
      expect(table.classList.contains("exec-cards")).toBe(true);
      for (const cell of table.querySelectorAll("tbody td")) expect(cell.getAttribute("data-l"), label).toBeTruthy();
    }
  });

  it("the key-value tables use row headers", async () => {
    mount();
    await ready();
    for (const table of document.querySelectorAll("table.exec-wb-kv")) {
      for (const row of table.querySelectorAll("tr")) expect(row.querySelector('th[scope="row"]'), row.textContent ?? "").toBeTruthy();
    }
  });
});

describe("mount with no props beyond api and the deployment", () => {
  it("renders with defaults", async () => {
    const served = fakeApi();
    render(
      <MemoryRouter>
        <PaperWorkbenchScreen api={served.api as ExecutionApi} deploymentId={DEP} />
      </MemoryRouter>,
    );
    expect(await ready()).toBeTruthy();
  });
});

