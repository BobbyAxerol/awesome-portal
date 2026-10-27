/**
 * Alpha 360 through the real HTTP client and readers, against the e2e double:
 * the spine that will not infer, the tabs on one URL, every Not published cell
 * with its request id, the states a read can be in, and the role variants.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ALPHA_DOUBLE_ID, ALPHA_DOUBLE_ORDERS_P1, answerAlpha } from "../../../../../e2e/bffDoubleAlpha";
import { V2_ROLE_PRESETS } from "../../shell/roleNav";
import { cloneRows } from "../../testkit/scale";
import AlphaScreen, { ALPHA_SCREEN_KEY } from "./index";
import { useContextFactsValue } from "../../shell/contextFacts";
import { alphaHttpApi, serveAlphaDouble, sessionOf, type Override } from "./testApi";

const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("../../../../auth/session", () => ({ useSession: () => session.current }));
vi.mock("../../../components/TradeReplayEvents", () => ({
  TradeReplayEvents: () => <div data-testid="v1-replay">V1 replay</div>,
}));

beforeEach(() => {
  session.current = sessionOf(V2_ROLE_PRESETS.manager);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{pathname + search}</output>;
}

function mount(entry = `/deployments/alphas/${ALPHA_DOUBLE_ID}`, override?: Override, alphaId = ALPHA_DOUBLE_ID) {
  const served = serveAlphaDouble(override);
  const view = render(
    <MemoryRouter initialEntries={[entry]}>
      <AlphaScreen api={alphaHttpApi()} alphaId={alphaId} />
      <Where />
      <FactsProbe />
    </MemoryRouter>,
  );
  return { ...served, view };
}

/** What the screen has told the context bar so far (`{}` when it has said nothing). */
function FactsProbe() {
  return <output data-testid="facts">{JSON.stringify(useContextFactsValue())}</output>;
}
const facts = (): Record<string, unknown> => JSON.parse(screen.getByTestId("facts").textContent ?? "{}");

const where = () => screen.getByTestId("where").textContent ?? "";
const search = () => new URLSearchParams(where().split("?")[1] ?? "");
// The title is the alpha id (the producer publishes no name), so the h1 exists while the resource is still loading: the alpha is read when its meta line is drawn.
const ready = async () => {
  const h1 = await screen.findByRole("heading", { level: 1, name: new RegExp(ALPHA_DOUBLE_ID) });
  await waitFor(() => expect(document.querySelector(".exec-alp2-meta")).not.toBeNull());
  return h1;
};
const tabs = () => within(screen.getByRole("tablist", { name: "Alpha detail" }));
const NO_DASH = /(^|\s)[-–—](\s|$)|N\/A/;

describe("screen contract", () => {
  it("is the alpha flag's screen", () => {
    expect(ALPHA_SCREEN_KEY).toBe("alpha");
  });

  it("opens in a loading state, then titles the alpha by its id (the producer publishes no name or version: 'Unnamed alpha' and 'UNVERSIONED' are never printed), with its owner", async () => {
    mount();
    expect(screen.getByLabelText("Loading")).toBeTruthy();
    const h1 = await ready();
    expect(h1.textContent).toContain(ALPHA_DOUBLE_ID);
    expect(h1.textContent).not.toMatch(/Unnamed alpha|UNVERSIONED|\bv\d/);
    // The header's gaps are ONE "Not available" line; the server's literals sit behind its one disclosure (UX audit A).
    const line = h1.parentElement!.querySelector("[data-testid='not-available-line']")!;
    expect(line.textContent).toContain("Not available: Name, Version, Run, Evidence");
    fireEvent.click(within(line as HTMLElement).getByRole("button", { name: "Why not available: Name, Version, Run, Evidence" }));
    const rows = Array.from(line.querySelectorAll(".exec-blk-why-row")).map((row) => row.textContent ?? "");
    expect(rows.find((row) => row.startsWith("Name:"))).toContain("ALPHA_NAME_NOT_PUBLISHED");
    expect(rows.find((row) => row.startsWith("Version:"))).toContain("UNVERSIONED");
    expect(screen.getByText("asmith")).toBeTruthy();
  });

  it("states what is not published about the header: score, run and evidence, each with its request id", async () => {
    mount();
    const h1 = await ready();
    expect(within(h1).getByRole("button", { name: /Not scored · policy not set/ })).toBeTruthy();
    const line = h1.parentElement!.querySelector("[data-testid='not-available-line']")!;
    expect(line.textContent).toContain("Run, Evidence");
    expect(line.textContent).toContain("Not published: Run");
  });

  it("prints no dash and no N/A anywhere on any tab", async () => {
    mount();
    await ready();
    for (const label of ["Performance", "Deployments", "Research Evidence", "Regime Fit", "Orders & Fills", "Activity & Decisions"]) {
      fireEvent.click(tabs().getByRole("tab", { name: label }));
      await waitFor(() => expect(tabs().getByRole("tab", { name: label }).getAttribute("aria-selected")).toBe("true"));
      await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
      expect(document.body.textContent ?? "", label).not.toMatch(NO_DASH);
    }
    // Trade Replay sits under More, as in the hi-fi.
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    fireEvent.click(within(screen.getByRole("menu", { name: "More tabs" })).getByRole("menuitem", { name: "Trade Replay" }));
    await waitFor(() => expect(search().get("tab")).toBe("replay"));
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(document.body.textContent ?? "", "Trade Replay").not.toMatch(NO_DASH);
  });
});

describe("the More menu", () => {
  it("Escape closes it and returns the focus to its button (UX audit A: it stayed open)", async () => {
    mount();
    await ready();
    const more = screen.getByRole("button", { name: "More" });
    fireEvent.click(more);
    const menu = screen.getByRole("menu", { name: "More tabs" });
    fireEvent.keyDown(within(menu).getAllByRole("menuitem")[0], { key: "Escape" });
    expect(screen.queryByRole("menu", { name: "More tabs" })).toBeNull();
    expect(more.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(more);
  });
});

describe("the lifecycle spine", () => {
  it("marks only the named stage as now; no stage is Done, and history is Not published: stage lifecycle and gate criteria", async () => {
    mount();
    await ready();
    const spine = screen.getByRole("list", { name: "Alpha lifecycle" });
    const nodes = within(spine).getAllByRole("listitem");
    expect(nodes).toHaveLength(6);
    const current = nodes.filter((n) => n.getAttribute("aria-current") === "step");
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toContain("Live");
    expect(spine.textContent).not.toContain("Done");
    // UXM07-048/3: the cards print only published facts; the one note under the list names the gap
    expect(spine.textContent).not.toContain("Not published");
    expect(spine.parentElement!.querySelector('[data-gap="FE-027/028"]')).not.toBeNull();
    expect(spine.textContent).toContain("Real-funded domain");
  });

  it("a stage other than the current one opens its published deployments and its gate as Not published", async () => {
    mount();
    await ready();
    fireEvent.click(within(screen.getByRole("list", { name: "Alpha lifecycle" })).getByRole("button", { name: /Paper/ }));
    const detail = document.querySelector('.exec-alp2-stage-detail[data-stage="paper"]')!;
    expect(detail.textContent).toContain("dep_paper_01");
    // The stage detail no longer repeats the spine's "days in stage, criteria, decider" gap (UX audit A); a gate still names its own.
    expect(detail.textContent).not.toContain("Not published");
    fireEvent.click(within(screen.getByRole("list", { name: "Alpha lifecycle" })).getByRole("button", { name: /R1 gate/ }));
    expect(document.querySelector('.exec-alp2-stage-detail[data-stage="r1"]')!.querySelector('[data-gap="FE-027/028"]')).not.toBeNull();
  });

  it("with no stage named, every node is Unknown and the panel says the lifecycle is not published", async () => {
    mount(undefined, (path) => {
      if (path !== `/resources/alphas/${ALPHA_DOUBLE_ID}`) return undefined;
      const answer = answerAlpha("GET", path, new URLSearchParams())!;
      const body = structuredClone(answer.body) as { data: { alpha: { stage: string; stages: string[] } } };
      body.data.alpha.stage = "RESEARCH";
      body.data.alpha.stages = ["RESEARCH"];
      return { status: 200, body };
    });
    await ready();
    const spine = screen.getByRole("list", { name: "Alpha lifecycle" });
    expect(within(spine).getAllByText("Unknown")).toHaveLength(6);
    expect(spine.closest("section")!.querySelector('[data-gap="FE-027/028"]')).not.toBeNull();
  });
});

describe("current facts", () => {
  it("prints the published current figures with their basis, and the windowed ones as Not published", async () => {
    mount();
    await ready();
    const facts = screen.getByLabelText("Current facts");
    expect(within(facts).getByText("+1,120.80")).toBeTruthy();
    expect(facts.textContent).toContain("Real-funded book, current facts");
    // QA2 R2-02: the books are never added: the Live figure stands alone, Paper's -84.20 is listed apart, and there is no all-stages total.
    expect(facts.textContent).not.toContain("1,036.60");
    expect(within(facts).getAllByTestId("book-apart").length).toBeGreaterThan(0);
    // The windowed figures keep their tiles (hi-fi), each Not published with its id.
    for (const [label, id] of [["Return", "FE-006"], ["Max drawdown", "FE-025"], ["Regime fit", "FE-011"]] as const) {
      const tile = within(facts).getByText(label).closest("div")!;
      expect(tile.querySelector(`[data-gap="${id}"]`), label).not.toBeNull();
      expect(tile.textContent, label).toContain("Not available");
    }
  });
});

describe("Performance", () => {
  it("draws the actual equity from the exact series; the server publishes no gap, so none is counted or drawn", async () => {
    const { view } = mount();
    await ready();
    const panel = await screen.findByRole("group", { name: /Equity, Real-funded, USDT/ });
    expect(panel).toBeTruthy();
    expect(view.container.textContent).not.toMatch(/gap the source declared|gaps the source declared/);
    expect(view.container.textContent).toContain("24 points");
    // No "Windowed return: Not published" caption and no empty drawdown panel under the chart (UX audit A).
    expect(view.container.textContent).not.toContain("Windowed return:");
    // The design's drawdown strip is drawn as a typed absence (no drawdown series is published, FE-025): one pane, never a flat line.
    expect(view.container.querySelectorAll('[data-testid="drawdown"], .exec-c2-dd')).toHaveLength(1);
    expect(view.container.textContent).toContain("Not available");
    expect(screen.getByTestId("readout-value").textContent).toBe("40,812.00 USDT");
  });

  it("Forward simulated lists each stage's own path, with no column of Return gaps", async () => {
    mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Forward simulated" }));
    expect(search().get("view")).toBe("sim");
    const table = await screen.findByRole("table", { name: "Equity path per stage" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain("Paper");
    expect(rows[0].textContent).toContain("Simulated");
    expect(rows[2].textContent).toContain("Real-funded");
    expect(within(table).queryByRole("columnheader", { name: "Return" })).toBeNull();
    expect(table.textContent).toContain("Gap days");
    expect(screen.getByText("Never stitched into actual")).toBeTruthy();
  });

  it("Research OOS names the bound run as Not published: evidence, baseline and run linkage", async () => {
    mount(`/deployments/alphas/${ALPHA_DOUBLE_ID}?view=oos`);
    await ready();
    const lines = screen.getAllByTestId("not-available-line").map((line) => line.textContent ?? "");
    expect(lines.some((text) => text.includes("Not available: Bound run, OOS return, Artifact available"))).toBe(true);
  });

  it("a book whose exact equity read fails falls back to its own daily closes, worded partial with the source's reason", async () => {
    mount(`/deployments/alphas/${ALPHA_DOUBLE_ID}?env=sandbox`);
    await ready();
    await waitFor(() => expect(screen.getByRole("group", { name: /Equity, Sandbox/ })).toBeTruthy());
    expect(document.body.textContent).toContain("could not be read (UPSTREAM_UNAVAILABLE");
    expect(document.body.textContent).toContain("JSON numbers, not exact decimal strings");
    expect(screen.getByTestId("readout-value").textContent).toBe("10,090.50");
  });

  it("a book with neither an exact series nor a stage path is Not available with the reason, and no line", async () => {
    mount(`/deployments/alphas/${ALPHA_DOUBLE_ID}?env=sandbox`, (path) => {
      if (!path.endsWith("/stage-drift")) return undefined;
      return { status: 200, body: { calendar: ["2026-10-08"], window: { days: 1, daily_basis: "UTC close" }, research_binding: { alpha_id: ALPHA_DOUBLE_ID, reason_code: null }, stages: { sandbox: { deployed: false, reason_code: "NO_DEPLOYMENT_IN_STAGE", series: [] } } } };
    });
    await ready();
    await waitFor(() => expect(document.body.textContent).toContain("UPSTREAM_UNAVAILABLE"));
    expect(screen.queryByTestId("readout-value")).toBeNull();
  });

  it("the book switch re-reads that book and puts it in the URL", async () => {
    const { callsTo } = mount();
    await ready();
    await screen.findByRole("group", { name: /Equity, Real-funded/ });
    fireEvent.click(within(screen.getByRole("group", { name: "Book" })).getByRole("button", { name: "Paper" }));
    expect(search().get("env")).toBe("paper");
    await waitFor(() => expect(callsTo("equity-chart").some((c) => c.includes("environment=paper"))).toBe(true));
  });
});

describe("tabs on one URL", () => {
  it("uses tablist, tab and tabpanel roles that point at each other", async () => {
    mount();
    await ready();
    const selected = tabs().getAllByRole("tab").filter((t) => t.getAttribute("aria-selected") === "true");
    expect(selected.map((t) => t.textContent)).toEqual(["Performance"]);
    const panel = screen.getByRole("tabpanel");
    expect(selected[0].getAttribute("aria-controls")).toBe(panel.id);
    expect(panel.getAttribute("aria-labelledby")).toBe(selected[0].id);
  });

  it("a tab click writes `tab`; the default tab writes nothing", async () => {
    mount();
    await ready();
    fireEvent.click(tabs().getByRole("tab", { name: "Deployments" }));
    expect(search().get("tab")).toBe("deployments");
    fireEvent.click(tabs().getByRole("tab", { name: "Performance" }));
    expect(where()).not.toContain("tab=");
  });

  it("arrow keys move between tabs", async () => {
    mount();
    await ready();
    const first = tabs().getByRole("tab", { name: "Performance" });
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(search().get("tab")).toBe("deployments");
    fireEvent.keyDown(tabs().getByRole("tab", { name: "Deployments" }), { key: "ArrowLeft" });
    expect(where()).not.toContain("tab=");
  });

  it("More holds Trade Replay, Positions and Reconciliation", async () => {
    mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    const menu = screen.getByRole("menu", { name: "More tabs" });
    expect(within(menu).getAllByRole("menuitem").map((i) => i.textContent)).toEqual(["Trade Replay", "Positions", "Reconciliation"]);
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Positions" }));
    expect(search().get("tab")).toBe("positions");
    const table = await screen.findByRole("table", { name: "Current positions of this alpha" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((r) => r.querySelector("td[data-l='Side']")?.textContent)).toEqual(["Long", "Short"]);
    expect(rows[1].querySelector("td[data-l='Mark']")!.textContent).toContain("Not available");
  });

  it("at phone width the strip carries every tab itself (no pinned More) and Trade Replay is the selected tab", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("660px"), media: query, addEventListener: () => {}, removeEventListener: () => {} }));
    mount(`/deployments/alphas/${ALPHA_DOUBLE_ID}`);
    await ready();
    expect(tabs().getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Performance", "Deployments", "Research Evidence", "Regime Fit", "Orders & Fills", "Activity & Decisions", "Trade Replay", "Positions", "Reconciliation",
    ]);
    expect(screen.queryByRole("button", { name: "More" })).toBeNull();
    // Trade Replay is a page of its own (WP-C): its tab opens that screen at the same address; Back lands on Alpha 360 again.
    fireEvent.click(tabs().getByRole("tab", { name: "Trade Replay" }));
    expect(search().get("tab")).toBe("replay");
    expect(await screen.findByRole("heading", { level: 1, name: "Trade Replay" })).toBeTruthy();
    cleanup();
    mount(`/deployments/alphas/${ALPHA_DOUBLE_ID}`);
    await ready();
    fireEvent.click(tabs().getByRole("tab", { name: "Positions" }));
    expect(search().get("tab")).toBe("positions");
    // The URL slugs are the same ones the wide layout writes.
    fireEvent.click(tabs().getByRole("tab", { name: "Performance" }));
    expect(where()).not.toContain("tab=");
  });

  it.each([
    ["Insight+Charts", "performance"], ["Trade+Replay", "replay"], ["Orders+%26+Fills", "orders"], ["Overview", "performance"],
    ["Sessions", "activity"], ["Audit", "activity"], ["Reconciliation", "reconciliation"],
  ])("a V1 label (%s) opens %s and the URL is rewritten to the V2 key", async (label, key) => {
    mount(`/deployments/alphas/${ALPHA_DOUBLE_ID}?tab=${label}`);
    if (key === "replay") await screen.findByRole("heading", { level: 1, name: "Trade Replay" });
    else await ready();
    await waitFor(() => expect(search().get("tab") ?? "performance").toBe(key));
    expect(screen.queryByText(/is not available\. Showing/)).toBeNull();
    if (label === "Sessions") expect(search().get("type")).toBe("session");
    if (label === "Audit") expect(search().get("type")).toBe("audit");
  });

  it("a label nobody knows shows the notice and opens Performance", async () => {
    mount(`/deployments/alphas/${ALPHA_DOUBLE_ID}?tab=Nonsense`);
    await ready();
    expect(screen.getByText('Tab "Nonsense" is not available. Showing performance.')).toBeTruthy();
    expect(tabs().getByRole("tab", { name: "Performance" }).getAttribute("aria-selected")).toBe("true");
  });
});

describe("Deployments", () => {
  async function open(caps: Iterable<string> = V2_ROLE_PRESETS.manager) {
    session.current = sessionOf(caps);
    mount(`/deployments/alphas/${ALPHA_DOUBLE_ID}?tab=deployments`);
    await ready();
    return screen.findByRole("table", { name: "Deployments of this alpha" });
  }

  it("lists the four deployments in stage order with published figures and the unpublished columns named", async () => {
    const table = await open();
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((r) => r.querySelector("td[data-l='Stage']")?.textContent)).toEqual(["Paper", "Sandbox", "Canary", "Live"]);
    const live = rows[3];
    expect(live.querySelector("td[data-l='Allocated, current']")!.textContent).toContain("40,000.00");
    expect(live.querySelector("td[data-l='Net PnL, current']")!.textContent).toContain("+1,120.80");
    // Dates, deployer and receipts have no source: no column of "Not published" cells, ONE line under the table (UX audit A).
    for (const column of ["Dates", "Deployed by", "Receipts"]) expect(live.querySelector(`td[data-l='${column}']`)).toBeNull();
    const missing = table.closest("section")!.querySelector("[data-testid='not-available-line']")!;
    expect(missing.textContent).toContain("Not available: Dates, Deployed by, Receipts");
    expect(rows[2].querySelector("td[data-l='Allocated, current']")!.textContent).toContain("Not available");
    expect(screen.getByText("No allocation total: rows sit in different partitions")).toBeTruthy();
  });

  it("every cell carries its column label for the stacked-card layout at 660px and below", async () => {
    const table = await open();
    const labels = within(table).getAllByRole("columnheader").map((h) => h.textContent);
    const cells = Array.from(table.querySelectorAll("tbody tr:first-child td")).map((td) => td.getAttribute("data-l"));
    expect(cells).toEqual(labels);
  });

  it("a deployment links to its own workbench and an account links only for a role that may see accounts", async () => {
    const table = await open();
    expect(within(table).getByRole("link", { name: "dep_live_01" }).getAttribute("href")).toBe("/deployments/live/dep_live_01");
    expect(within(table).getAllByRole("link", { name: "acct_binance_02" }).length).toBeGreaterThan(0);
  });

  // RK-1 (DEBT-UXM07-005): the session's capabilities pre-narrow nothing; the rows and the scope label are the server's.
  it("a researcher session does not hide what the server served: the account link and the deployer line stay, no slice banner is inferred", async () => {
    const table = await open(V2_ROLE_PRESETS.researcher);
    expect(within(table).getAllByRole("link", { name: "acct_binance_02" }).length).toBeGreaterThan(0);
    expect(table.closest("section")!.querySelector("[data-testid='not-available-line']")!.textContent).toContain("Deployed by");
    expect(screen.queryByText(/Your slice only/)).toBeNull();
    expect(screen.queryByText("Only deployments in your slice")).toBeNull();
    expect(facts()).toEqual({});
  });

  it("a manager session shows the same account links and no inferred slice banner", async () => {
    const table = await open();
    expect(within(table).getAllByRole("link", { name: "acct_binance_02" }).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Your slice only/)).toBeNull();
    expect(facts()).toEqual({});
  });

  it("a server refusal still shows its reason under a manager session and under a researcher session", async () => {
    for (const caps of [V2_ROLE_PRESETS.manager, V2_ROLE_PRESETS.researcher]) {
      session.current = sessionOf(caps);
      mount(undefined, undefined, "alpha_denied");
      expect(await screen.findByText(/outside your slice/)).toBeTruthy();
      expect(screen.queryByRole("tablist")).toBeNull();
      cleanup();
    }
  });
});

describe("Evidence, Regime, Reconciliation", () => {
  it("Evidence names the run binding as Not published: evidence, baseline and run linkage and shows the source's binding reason", async () => {
    mount(`/deployments/alphas/${ALPHA_DOUBLE_ID}?tab=evidence`);
    await ready();
    const panel = await screen.findByRole("region", { name: "Research Evidence" });
    // The run binding and its five siblings are ONE "Not available" line; the name and version gap is the header's.
    expect(within(panel).getByTestId("not-available-line").textContent).toContain("Not available: Bound research run, Parameters, Parameter bundle, Evidence, Provenance, Artifact available");
    fireEvent.click(within(panel).getByRole("button", { name: /^Why not available/ }));
    expect(panel.querySelector('[data-gap~="FE-029"]')).not.toBeNull();
    expect(panel.textContent).not.toMatch(/FE-029/);
    expect(panel.textContent).not.toMatch(/Unnamed alpha|UNVERSIONED/);
    expect(await within(panel).findByText("RESEARCH_RUN_NOT_BOUND")).toBeTruthy();
  });

  it("Regime Fit says once that it is not evaluated and names what is missing (FE-011)", async () => {
    mount(`/deployments/alphas/${ALPHA_DOUBLE_ID}?tab=regime`);
    await ready();
    const panel = await screen.findByRole("region", { name: "Regime fit" });
    expect(within(panel).getByTestId("not-available-line").textContent).toContain("Not available: Volatility, Trend, Liquidity, Outcome by stage");
    expect(within(panel).queryAllByText("Not published")).toHaveLength(0);
    fireEvent.click(within(panel).getByRole("button", { name: /^Why not available/ }));
    expect(panel.querySelector('[data-gap~="FE-011"]')).not.toBeNull();
    expect(panel.textContent).not.toMatch(/FE-011/);
    expect(panel.textContent).toContain("Historical support, not a forecast");
  });

  it("Reconciliation keeps the open finding open and words an unresolved time", async () => {
    mount(`/deployments/alphas/${ALPHA_DOUBLE_ID}?tab=reconciliation`);
    await ready();
    const table = await screen.findByRole("table", { name: "Reconciliation findings" });
    const rows = within(table).getAllByRole("row").slice(1);
    const results = rows.map((r) => r.querySelector("td[data-l='Result']")?.textContent ?? "");
    expect(results[0]).toContain("Resolved");
    expect(results[1]).toContain("Open");
    expect(rows[1].querySelector("td[data-l='Resolved']")!.textContent).toContain("Not resolved");
  });
});

describe("Orders & Fills", () => {
  async function open() {
    const served = mount(`/deployments/alphas/${ALPHA_DOUBLE_ID}?tab=orders`);
    await ready();
    const table = await screen.findByRole("table", { name: "Orders of this alpha" });
    return { ...served, table };
  }

  it("keeps working, partial, rejected, unknown and filled apart, with the source's word where it is unknown", async () => {
    const { table } = await open();
    const states = within(table).getAllByRole("row").slice(1).map((r) => r.querySelector("td[data-l='State']")?.textContent ?? "");
    expect(states).toHaveLength(6);
    expect(states.filter((s) => s.includes("Filled") && !s.includes("Partially"))).toHaveLength(1);
    expect(states.filter((s) => s.includes("Working"))).toHaveLength(2);
    expect(states.filter((s) => s.includes("Partially filled"))).toHaveLength(1);
    expect(states.filter((s) => s.includes("Rejected"))).toHaveLength(1);
    const unknown = states.filter((s) => s.includes("Unknown"));
    expect(unknown).toHaveLength(1);
    expect(unknown[0]).toContain("Source says UNKNOWN");
  });

  it("pages by keyset: Load more appends the second page and the loaded count follows", async () => {
    const { table } = await open();
    expect(screen.getByText(/6 orders loaded, more in the retained window/)).toBeTruthy();
    // R2-02: the chips count the rows under them, not the rollup.
    expect(screen.getByLabelText("Orders by status").textContent).toContain("Of the 6 loaded");
    fireEvent.click(screen.getAllByRole("button", { name: "Load more" })[0]);
    await waitFor(() => expect(within(table).getAllByRole("row")).toHaveLength(9));
    expect(screen.getByText(/8 orders loaded, the whole retained window/)).toBeTruthy();
    const states = within(table).getAllByRole("row").slice(1).map((r) => r.querySelector("td[data-l='State']")?.textContent ?? "");
    expect(states.filter((s) => s.includes("Working"))).toHaveLength(3);
    expect(states.filter((s) => s.includes("Cancelled"))).toHaveLength(1);
  });

  it("at 660px and narrower the orders are three cards; Load more draws the rest of the loaded rows first, then asks the server", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(max-width: 660px)", media: query, addEventListener: () => {}, removeEventListener: () => {},
    }));
    const { table } = await open();
    const rows = () => within(table).getAllByRole("row").slice(1);
    expect(rows()).toHaveLength(3);
    expect(screen.getByText(/Top 3 of 6 orders loaded, more in the retained window/)).toBeTruthy();
    const more = () => screen.getAllByRole("button", { name: "Load more" })[0]!;
    fireEvent.click(more());
    await waitFor(() => expect(rows()).toHaveLength(6));
    expect(screen.queryByText(/Top \d of/)).toBeNull();
    // Nothing was asked of the server yet: the page still says there is more.
    expect(screen.getByText(/6 orders loaded, more in the retained window/)).toBeTruthy();
    fireEvent.click(more());
    await waitFor(() => expect(screen.getByText(/8 orders loaded, the whole retained window/)).toBeTruthy());
    expect(rows()).toHaveLength(8);
  });

  it("a rejected order carries the source's reason; a fill without a commission says Fee not published", async () => {
    const { table } = await open();
    expect(table.textContent).toContain("Margin is insufficient for this order.");
    const fills = await screen.findByRole("table", { name: "Fills of this alpha" });
    const fees = within(fills).getAllByRole("row").slice(1).map((r) => r.querySelector("td[data-l='Fee']")!.textContent);
    expect(fees.some((f) => f?.includes("Fee not published"))).toBe(true);
    expect(fees.some((f) => f?.includes("5.38"))).toBe(true);
  });

  it("the strip carries the server's exact populations and says the rest is not published", async () => {
    await open();
    const strip = screen.getByRole("group", { name: "Orders and fills" });
    await waitFor(() => expect(strip.textContent).toContain("8"));
    expect(strip.textContent).toContain("Broker timestamps not published");
    expect(strip.textContent).toContain("Retained window");
  });

  it("each order opens its place in Trade Replay by a deep link", async () => {
    const { table } = await open();
    const link = within(table).getAllByRole("link", { name: /^Open / })[0];
    expect(link.getAttribute("href")).toContain("tab=replay&focus=order%3Aord_");
  });

  it("a focused order is highlighted", async () => {
    mount(`/deployments/alphas/${ALPHA_DOUBLE_ID}?tab=orders&focus=order:ord_004`);
    await ready();
    const table = await screen.findByRole("table", { name: "Orders of this alpha" });
    expect(table.querySelector("tr[aria-current='true']")?.textContent).toContain("ord_004");
  });

  it("scale: 300 loaded orders draw at most 200 rows and say so", async () => {
    const many = cloneRows(ALPHA_DOUBLE_ORDERS_P1[0], 300, (row, i) => {
      row.order_id = `ord_s${String(i).padStart(4, "0")}`;
      row.client_order_id = `s-${i}`;
    });
    mount(`/deployments/alphas/${ALPHA_DOUBLE_ID}?tab=orders`, (path, query) => {
      if (!path.endsWith("/orders")) return undefined;
      const answer = answerAlpha("GET", path, query)!;
      const body = structuredClone(answer.body) as { records: unknown[]; page: { has_more: boolean; next_cursor: string | null } };
      body.records = many.map((values) => ({ record_id: String(values.order_id), values }));
      body.page.has_more = false;
      body.page.next_cursor = null;
      return { status: 200, body };
    });
    await ready();
    const table = await screen.findByRole("table", { name: "Orders of this alpha" });
    expect(within(table).getAllByRole("row")).toHaveLength(201);
    expect(screen.getByText(/Top 200 of 300 orders loaded/)).toBeTruthy();
  });

  it("an orders read that fails is a state with its reason, not an empty table", async () => {
    mount(`/deployments/alphas/${ALPHA_DOUBLE_ID}?tab=orders`, (path) => (path.endsWith("/orders") ? { status: 503, body: { error: { code: "UPSTREAM_UNAVAILABLE", message: "orders down" } } } : undefined));
    await ready();
    await waitFor(() => expect(screen.getByText(/orders down/)).toBeTruthy());
    expect(screen.queryByRole("table", { name: "Orders of this alpha" })).toBeNull();
  });
});

describe("Activity & Decisions", () => {
  async function open(extra = "") {
    const served = mount(`/deployments/alphas/${ALPHA_DOUBLE_ID}?tab=activity${extra}`);
    await ready();
    const feed = await screen.findByRole("table", { name: new RegExp(`Events for ${ALPHA_DOUBLE_ID}`) });
    return { ...served, feed };
  }

  it("draws the ribbon on the equity axis: the journal rows on the Decision lane, stage bands, the rest Not published: event feed", async () => {
    await open();
    const ribbon = await screen.findByRole("group", { name: "Events and stages" });
    expect(within(ribbon).getAllByTestId("ribbon-event").length).toBeGreaterThanOrEqual(1);
    expect(within(ribbon).getAllByTestId("ribbon-stage").length).toBeGreaterThanOrEqual(1);
    expect(document.querySelector('[data-gap="FE-031"]')).not.toBeNull();
    expect(document.querySelector('[data-gap="FE-021"]')).not.toBeNull();
  });

  it("lists the observed rows newest first, pages by keyset, and says it is not an event replay", async () => {
    const { feed } = await open();
    expect(within(feed).getAllByRole("row")).toHaveLength(9);
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(within(feed).getAllByRole("row")).toHaveLength(13));
    expect(screen.getByText(/not an event replay/)).toBeTruthy();
    const whens = within(feed).getAllByRole("row").slice(1).map((r) => r.querySelector("time")!.getAttribute("datetime")!);
    expect(whens).toEqual([...whens].sort().reverse());
  });

  it("resolves an order observation to its state, Unknown included", async () => {
    const { feed } = await open();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(within(feed).getAllByRole("row")).toHaveLength(13));
    expect(feed.textContent).toContain("Order ord_007, Unknown");
    expect(feed.textContent).toContain("Order ord_005, Rejected");
  });

  it("`type=session` (the legacy Sessions tab) filters the feed to session rows", async () => {
    const { feed } = await open("&type=session");
    const rows = within(feed).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("Session session_live_01");
  });

  it("the lane filter turns a kind off and keeps its count", async () => {
    await open();
    const chips = screen.getByRole("group", { name: "Event kinds" });
    const decision = within(chips).getByRole("button", { name: /Decision/ });
    expect(decision.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(decision);
    expect(decision.getAttribute("aria-pressed")).toBe("false");
    await waitFor(() => expect(within(screen.getByRole("group", { name: "Events and stages" })).queryAllByTestId("ribbon-event")).toHaveLength(0));
  });
});

describe("states", () => {
  it("empty: the resource carries no alpha row", async () => {
    mount(undefined, undefined, "alpha_empty");
    expect(await screen.findByText(/not present in the current projected resource population/)).toBeTruthy();
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("denied: says denied with the server's reason and offers no tabs", async () => {
    mount(undefined, undefined, "alpha_denied");
    expect(await screen.findByText(/outside your slice/)).toBeTruthy();
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("unavailable: a 503 is not an empty alpha", async () => {
    mount(undefined, undefined, "alpha_down");
    expect(await screen.findByText(/could not be read/)).toBeTruthy();
    expect(screen.queryByText(/not present in the current projected/)).toBeNull();
  });

  it("stale and partial are worded above the body, which stays", async () => {
    mount(undefined, (path) => {
      if (path !== `/resources/alphas/${ALPHA_DOUBLE_ID}`) return undefined;
      const body = structuredClone(answerAlpha("GET", path, new URLSearchParams())!.body) as Record<string, unknown>;
      body.state = "stale";
      body.freshness = "STALE";
      body.completeness = "PARTIAL";
      return { status: 200, body };
    });
    await ready();
    expect(screen.getByText(/has not updated for this alpha within its freshness budget/)).toBeTruthy();
    expect(screen.getByText(/The read is partial/)).toBeTruthy();
    expect(screen.getByRole("list", { name: "Alpha lifecycle" })).toBeTruthy();
  });

  it("each tab's read starts only when its tab opens", async () => {
    const { callsTo } = mount();
    await ready();
    await screen.findByRole("group", { name: /Equity, Real-funded/ });
    expect(callsTo("/orders")).toHaveLength(0);
    // The ribbon is pinned on the Performance chart, so the observed timeline is read there too (one read, shared with Activity).
    await waitFor(() => expect(callsTo("observed-timeline").length).toBeGreaterThan(0));
    const timelineReads = callsTo("observed-timeline").length;
    expect(callsTo("venue-candles")).toHaveLength(0);
    fireEvent.click(tabs().getByRole("tab", { name: "Orders & Fills" }));
    await waitFor(() => expect(callsTo("/orders").length).toBeGreaterThan(0));
    expect(callsTo("observed-timeline")).toHaveLength(timelineReads);
  });
});

describe("Score drawer", () => {
  it("opens from the chip, shows every score row as Not published: score, and the raw economics as current", async () => {
    mount();
    const h1 = await ready();
    fireEvent.click(within(h1).getByRole("button", { name: /Not scored/ }));
    expect(search().get("sel")).toBe("score");
    const drawer = await screen.findByRole("complementary");
    expect(within(drawer).getByRole("heading", { name: "Score" })).toBeTruthy();
    expect(within(drawer).getAllByText("Not available").length).toBeGreaterThanOrEqual(8);
    expect(drawer.textContent).toContain("Raw economics, current");
    expect(within(drawer).getByText("+1,120.80")).toBeTruthy();
    fireEvent.click(within(drawer).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("complementary")).toBeNull());
    expect(where()).not.toContain("sel=");
  });
});
