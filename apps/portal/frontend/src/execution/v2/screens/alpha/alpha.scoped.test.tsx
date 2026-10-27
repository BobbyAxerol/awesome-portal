/**
 * Alpha 360 and Trade Replay on the SCOPED_V2 variants (UXM-07 R-3), through the real HTTP client, the dispatching readers and the
 * e2e double. Lane BFF_DOUBLE: the bodies are built from the canonical fixtures and judged against the published schemas in
 * `fixtureBff/server.test.ts`; a synthetic fixture is not source acceptance.
 *
 * Opt-in: the double answers the v2 bodies ONLY for `?workspace_id=ws_TEST_SCOPED_V2`. The same screens, with no workspace in the
 * URL, are the legacy screens (`alpha.test.tsx`, unchanged); here we also pin that their requests carry no workspace parameter.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ALPHA_DOUBLE_ID, ALPHA_V2_WORKSPACE, answerAlpha } from "../../../../../e2e/bffDoubleAlpha";
import { evictScopedCaches } from "../../scopedEviction";
import { V2_ROLE_PRESETS } from "../../shell/roleNav";
import AlphaScreen from "./index";
import { alphaHttpApi, serveAlphaDouble, sessionOf, type Override } from "./testApi";
import { whyText } from "../../gapWhyTestUtil";

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

const SCOPED_ENTRY = `/deployments/alphas/${ALPHA_DOUBLE_ID}?workspace_id=${ALPHA_V2_WORKSPACE}`;
function mount(entry = SCOPED_ENTRY, override?: Override, alphaId = ALPHA_DOUBLE_ID) {
  const served = serveAlphaDouble(override);
  const view = render(
    <MemoryRouter initialEntries={[entry]}>
      <AlphaScreen api={alphaHttpApi()} alphaId={alphaId} />
      <Where />
    </MemoryRouter>,
  );
  return { ...served, view };
}
const where = () => screen.getByTestId("where").textContent ?? "";
const search = () => new URLSearchParams(where().split("?")[1] ?? "");
const ready = async () => {
  const h1 = await screen.findByRole("heading", { level: 1 });
  await waitFor(() => expect(document.querySelector(".exec-alp2-meta")).not.toBeNull());
  return h1;
};
const tabs = () => within(screen.getByRole("tablist", { name: "Alpha detail" }));
const openTab = async (label: string) => {
  fireEvent.click(tabs().getByRole("tab", { name: label }));
  await waitFor(() => expect(tabs().getByRole("tab", { name: label }).getAttribute("aria-selected")).toBe("true"));
};
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 40)); });
const NO_DASH = /(^|\s)[-–—](\s|$)|N\/A/;
const LEGACY_ONLY = /1,120\.80|96,400\.00|126,500\.00|asmith|BTC-Trend|READY|ATTENTION/;

describe("opt-in: the legacy request is untouched", () => {
  it("with no workspace in the URL the resource and the record reads carry no workspace parameter and answer the v1 bodies", async () => {
    const { calls } = mount(`/deployments/alphas/${ALPHA_DOUBLE_ID}`);
    await ready();
    const resource = calls.find((c) => new URL(c, "http://portal.test").pathname.endsWith(`/resources/alphas/${ALPHA_DOUBLE_ID}`))!;
    expect(resource).toBe(`/api/v1/execution/resources/alphas/${ALPHA_DOUBLE_ID}`);
    expect(document.querySelector('[data-scope="scoped-v2"]')).toBeNull();
    expect(screen.getByText("asmith")).toBeTruthy();
    await openTab("Orders & Fills");
    await settle();
    for (const c of calls.filter((x) => /\/(orders|fills)\?/.test(x))) expect(c).not.toContain("workspace_id");
  });

  it("the scoped double answers v1 to a request that names no scoped workspace, or another one, byte for byte", () => {
    for (const q of ["", "workspace_id=ws_other", "workspace_id=", "environment=paper"]) {
      const plain = answerAlpha("GET", `/resources/alphas/${ALPHA_DOUBLE_ID}`, new URLSearchParams(""))!;
      const probe = answerAlpha("GET", `/resources/alphas/${ALPHA_DOUBLE_ID}`, new URLSearchParams(q))!;
      expect(JSON.stringify(probe.body), q).toBe(JSON.stringify(plain.body));
      expect((plain.body as { schema_version: string }).schema_version).toBe("execution.alpha-resource.v1");
    }
  });
});

describe("the header and the authority label", () => {
  it("names the workspace on the read, and titles the alpha by its id (the literal 'Unnamed alpha' is never printed)", async () => {
    const { calls } = mount();
    const h1 = await ready();
    expect(calls.find((c) => c.includes(`/resources/alphas/${ALPHA_DOUBLE_ID}?`))).toBe(`/api/v1/execution/resources/alphas/${ALPHA_DOUBLE_ID}?workspace_id=${ALPHA_V2_WORKSPACE}`);
    expect(h1.textContent).toContain(ALPHA_DOUBLE_ID);
    expect(document.body.textContent).not.toMatch(/Unnamed alpha|UNVERSIONED/);
    expect(document.body.textContent ?? "").not.toMatch(LEGACY_ONLY);
  });

  it("a member the v2 body does not state is in the header's one Not available line, each with the body's own typed reason behind the disclosure", async () => {
    mount();
    await ready();
    const meta = document.querySelector(".exec-alp2-meta")!;
    const line = meta.parentElement!.querySelector("[data-testid='not-available-line']")!;
    expect(line.textContent).toContain("Not available: Name, Version, Owner, Run, Evidence");
    expect(line.textContent).toContain("Not published: Owner");
    fireEvent.click(within(line as HTMLElement).getByRole("button", { name: "Why not available: Name, Version, Owner, Run, Evidence" }));
    const rows = Array.from(line.querySelectorAll(".exec-blk-why-row")).map((row) => row.textContent ?? "");
    expect(rows.find((row) => row.startsWith("Name:"))).toContain("The source has no alpha name");
    expect(rows.find((row) => row.startsWith("Version:"))).toContain("The source has no alpha version");
    expect(rows.find((row) => row.startsWith("Owner:"))).toContain("The source owner is not mapped to a Portal user");
    // RV-06: no reason rides on a title of a non-focusable wrapper.
    for (const reason of ["has no alpha name", "has no alpha version", "not mapped to a Portal user"]) expect(meta.querySelector(`[title*="${reason}"]`)).toBeNull();
    // A reason code is never printed as text.
    expect(meta.textContent).not.toMatch(/ALPHA_[A-Z_]+/);
    expect(meta.textContent).toContain("Core");
  });

  it("the scope label states the authority the body publishes: authorized rows only, visible-row totals, not a full portfolio, partial, the workspace and the policy revisions", async () => {
    mount();
    await ready();
    const banner = screen.getByRole("note", { name: "Authority of this read" });
    expect(banner.textContent).toContain("Authorized rows only");
    expect(banner.textContent).toContain("Totals cover visible rows only");
    expect(banner.textContent).toContain("not a full portfolio");
    expect(banner.textContent).toContain("Completeness: Partial");
    const scope = within(banner).getByRole("table", { name: "Scope of this read" });
    expect(scope.textContent).toContain(ALPHA_V2_WORKSPACE); // the workspace the body says it read
    expect(scope.textContent).toContain("AUTHORIZED_ONLY");
    expect(scope.textContent).toContain("VISIBLE_ROWS_ONLY");
    expect(scope.textContent).toContain("TEST_ONLY-policy-live-4");
    const population = within(banner).getByRole("table", { name: "Population by relation" });
    // Rows returned against the source's own total, as the body states them (a string); broker_sync is not commissioned and is not listed.
    expect(within(population).getByRole("row", { name: "Deployments 3 3 Partial" })).toBeTruthy();
    expect(within(population).getByRole("row", { name: "Positions 2 2 Partial" })).toBeTruthy();
    expect(within(population).queryByRole("row", { name: /^Broker sync/ })).toBeNull();
  });

  it("the freshness is the body's word, and no source time is invented", async () => {
    mount();
    await ready();
    expect(document.querySelector(".exec-alp2-fresh")!.textContent).toContain("Aging");
    expect(document.querySelector(".exec-alp2-fresh")!.textContent).toContain("Source time not published");
  });
});

describe("the same sections, from the scoped facts", () => {
  it("current facts: net PnL and exposure are Not published: windowed totals and concentration with the body's reason; nothing is summed from a row", async () => {
    mount();
    await ready();
    const facts = screen.getByLabelText("Current facts");
    // The Return, Max drawdown and Regime fit tiles carry their own disclosures; only the two money tiles carry the body's reason.
    const whys = Array.from(facts.querySelectorAll(".exec-blk-why")).filter((node) => node.previousElementSibling?.getAttribute("data-gap") === "FE-005");
    expect(whys.length).toBe(2);
    for (const node of whys) {
      expect(node.previousElementSibling?.textContent).toContain("Not available");
      expect(whyText(node)).toBe("SCOPED_RAW_FACTS_ONLY_NO_IMPLIED_TOTALS");
    }
    expect(facts.querySelector('[title="SCOPED_RAW_FACTS_ONLY_NO_IMPLIED_TOTALS"]')).toBeNull();
    expect(facts.textContent).not.toMatch(/\d{1,3}(,\d{3})+\.\d\d/);
  });

  it("the lifecycle names no current stage; Paper lists its deployment; Live lists the Live-book deployment as 'Stage not published'", async () => {
    mount();
    await ready();
    const spine = screen.getByRole("list", { name: "Alpha lifecycle" });
    expect(within(spine).getAllByRole("listitem").filter((n) => n.getAttribute("aria-current") === "step")).toHaveLength(0);
    expect(spine.closest("section")!.textContent).toContain("The source names no current stage");
    expect(spine.closest("section")!.textContent).toContain("The source publishes no stage");
    fireEvent.click(within(spine).getByRole("button", { name: /Paper/ }));
    expect(document.querySelector('.exec-alp2-stage-detail[data-stage="paper"]')!.textContent).toContain("dep_paper_01");
    fireEvent.click(within(spine).getByRole("button", { name: /Live/ }));
    const live = document.querySelector('.exec-alp2-stage-detail[data-stage="live"]')!;
    expect(live.textContent).toContain("dep_live_01");
    expect(live.textContent).toContain("Stage not published");
    expect(live.textContent).toContain("Allocated, current");
  });

  it("Deployments: a row per deployment with its book as the stage; the allocation is the one stated row; net PnL and equity are the one published snapshot row, or the body's reason", async () => {
    mount();
    await ready();
    await openTab("Deployments");
    const rows = within(await screen.findByRole("table", { name: "Deployments of this alpha" })).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3);
    const live = rows.find((r) => r.textContent?.includes("dep_live_01"))!;
    expect(live.textContent).toContain("Live book");
    expect(live.textContent).toContain("Core");
    expect(live.querySelector("td[data-l='Allocated, current'] .exec-blk-num")!.getAttribute("data-full")).toBe("40000.00");
    // A book with no bound snapshot relation says so; it is never a zero, a dash or a sum.
    const liveNet = live.querySelector("td[data-l='Net PnL, current']")!;
    expect(liveNet.textContent).toBe("Not available");
    expect(whyText(liveNet as HTMLElement)).toBe("No snapshot is bound for this book");
    expect(live.querySelector("td[data-l='Equity']")!.textContent).toBe("Not available");
    const paper = rows.find((r) => r.textContent?.includes("dep_paper_01"))!;
    expect(paper.textContent).toContain("Paper");
    expect(paper.querySelector("td[data-l='Allocated, current']")!.textContent).toContain("Not available");
    // Paper states one snapshot row: exact digits, the currency, the row's own instant (UTC), and nothing is added across rows.
    const paperNet = paper.querySelector("td[data-l='Net PnL, current'] .exec-blk-num")!;
    expect(paperNet.getAttribute("data-full")).toBe("184.2000");
    expect(paper.querySelector("td[data-l='Net PnL, current']")!.textContent).toContain("USDT");
    expect(paper.querySelector("td[data-l='Net PnL, current'] small")).not.toBeNull();
    expect(paper.querySelector("td[data-l='Equity'] .exec-blk-num")!.getAttribute("data-full")).toBe("20184.2000");
    expect(document.body.textContent).toContain("One snapshot row per deployment, not summed");
    expect(rows.find((r) => r.textContent?.includes("dep_sandbox_01"))!.textContent).toContain("Sandbox");
  });

  it("Positions: the instrument id as stated (not split), both legs apart, the short with no mark says so", async () => {
    mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    fireEvent.click(within(screen.getByRole("menu", { name: "More tabs" })).getByRole("menuitem", { name: "Positions" }));
    const table = await screen.findByRole("table", { name: "Current positions of this alpha" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("BTCUSDT");
    expect(rows[0].textContent).toContain("Long");
    expect(rows[1].textContent).toContain("Short");
    expect(rows[1].textContent).toContain("Not marked");
  });

  it("Reconciliation: the result, the finding id and type and the resolution time as the body states them; an open finding is Not resolved", async () => {
    mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    fireEvent.click(within(screen.getByRole("menu", { name: "More tabs" })).getByRole("menuitem", { name: "Reconciliation" }));
    const table = await screen.findByRole("table", { name: "Reconciliation findings" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.textContent).join(" ")).toContain("Resolved");
    expect(rows.map((r) => r.textContent).join(" ")).toContain("Open");
    const [resolved, open] = rows;
    expect(resolved.textContent).toContain("POSITION_MISMATCH");
    expect(resolved.textContent).toContain("find_001");
    expect(resolved.querySelector("td[data-l='Resolved'] time")!.getAttribute("datetime")).toBe(new Date(Date.UTC(2026, 9, 17, 9, 48)).toISOString());
    expect(open.textContent).toContain("BALANCE_MISMATCH");
    expect(open.querySelector("td[data-l='Resolved']")!.textContent).toContain("Not resolved");
    expect(document.body.textContent).not.toContain("Not published: typed stage rows, series and reconciliation figures");
  });

  it("Research Evidence: no second name-and-version gap (the header says it once), the alpha id is the one the body names", async () => {
    mount(`${SCOPED_ENTRY}&tab=evidence`);
    await ready();
    const panel = await screen.findByRole("tabpanel");
    expect(panel.textContent).not.toContain("Name and version");
    expect(panel.textContent).toContain(ALPHA_DOUBLE_ID);
  });

  it("the Score drawer shows the net PnL as Not published: windowed totals and concentration, not an empty cell", async () => {
    mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: /Not scored · policy not set/ }));
    const drawer = await screen.findByRole("complementary");
    expect(drawer.textContent).toContain("Net PnL");
    expect(drawer.textContent).toContain("Not available");
    expect(drawer.querySelector('[data-gap="FE-005"]')).not.toBeNull();
  });

  it("prints no dash and no N/A on any tab, and none of the legacy-only figures", async () => {
    mount();
    await ready();
    for (const label of ["Performance", "Deployments", "Research Evidence", "Regime Fit", "Orders & Fills", "Activity & Decisions"]) {
      await openTab(label);
      await settle();
      expect(document.body.textContent ?? "", label).not.toMatch(NO_DASH);
      expect(document.body.textContent ?? "", label).not.toMatch(LEGACY_ONLY);
    }
  });
});

describe("Orders & Fills on subject-records.v2", () => {
  it("draws a column only when the page states that member; a record that lacks it says so; the order time is its own submitted_at_ms; the cursor is the Portal's, unchanged", async () => {
    const { calls } = mount();
    await ready();
    await openTab("Orders & Fills");
    const orders = await screen.findByRole("table", { name: "Orders of this alpha" });
    expect(document.body.textContent).toContain("Scoped read: authorized rows of a retained window, not total history. Paged by order update time.");
    expect(document.body.textContent).not.toContain("subject-records.v2");
    const heads = within(orders).getAllByRole("columnheader").map((h) => h.textContent);
    expect(heads).toEqual(expect.arrayContaining(["Time (UTC)", "Order", "Client order", "Type", "Leg"]));
    const rows = within(orders).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(6);
    const first = rows.find((r) => r.textContent?.includes("ord_001"))!;
    expect(first.querySelector("td[data-l='Client order']")!.textContent).toBe("bt3-001");
    expect(first.querySelector("td[data-l='Time (UTC)'] time")!.getAttribute("datetime")).toBe(new Date(Date.UTC(2026, 9, 16, 14, 0)).toISOString());
    expect(first.querySelector("td[data-l='Type']")!.textContent).toContain("Limit");
    // A conditional leg states its role and sequence; an entry order states none, and says so without a guess.
    const takeProfit = rows.find((r) => r.textContent?.includes("ord_002"))!;
    expect(takeProfit.querySelector("td[data-l='Leg']")!.textContent).toBe("Take profit 1");
    expect(first.querySelector("td[data-l='Leg']")!.textContent).toBe("Not available");
    expect(whyText(first.querySelector("td[data-l='Leg']") as HTMLElement)).toBe("Not in this record");
    expect(calls.filter((c) => /\/orders\?/.test(c)).every((c) => c.includes(`workspace_id=${ALPHA_V2_WORKSPACE}`))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(within(screen.getByRole("table", { name: "Orders of this alpha" })).getAllByRole("row").slice(1)).toHaveLength(8));
    const second = calls.find((c) => c.includes("after="))!;
    expect(new URL(second, "http://portal.test").searchParams.get("after")).toBe("kc1.double-k1.eyJkaXJlY3Rpb24iOiJhZnRlciIsInJlc291cmNlIjoib3JkZXJzIn0.RG91YmxlLU5PVC1BLVJFQUwtU0lHTkFUVVJF");
  });

  it("Fills: client order, fee with its own currency and liquidity as stated; a fill the source gave no fee is Not available with a reason, not a zero", async () => {
    mount();
    await ready();
    await openTab("Orders & Fills");
    const fills = await screen.findByRole("table", { name: "Fills of this alpha" });
    const heads = within(fills).getAllByRole("columnheader").map((h) => h.textContent);
    expect(heads).toEqual(expect.arrayContaining(["Client order", "Fee", "Liquidity"]));
    const rows = within(fills).getAllByRole("row").slice(1);
    const one = rows.find((r) => r.textContent?.includes("fill_001"))!;
    expect(one.querySelector("td[data-l='Fee'] .exec-blk-num")!.getAttribute("data-full")).toBe("5.38");
    expect(one.querySelector("td[data-l='Fee']")!.textContent).toContain("USDT");
    expect(one.querySelector("td[data-l='Liquidity']")!.textContent).toBe("Maker");
    expect(one.querySelector("td[data-l='Client order']")!.textContent).toBe("bt3-001");
    const noFee = rows.find((r) => r.textContent?.includes("fill_003"))!;
    expect(noFee.querySelector("td[data-l='Fee']")!.textContent).toBe("Not available");
    expect(whyText(noFee.querySelector("td[data-l='Fee']") as HTMLElement)).toBe("Not in this record");
  });

  it("an order the page gives no submission time for says why, in the page's own reason; both of the page's order-time reasons read, and no time is borrowed", async () => {
    const override: Override = (path, query) => {
      if (!path.endsWith("/orders") || query.get("after") !== null) return undefined;
      const answer = answerAlpha("GET", path, query)!;
      const body = structuredClone(answer.body) as { records: { values: Record<string, unknown>; time_reason_code?: string }[] };
      delete body.records[0]!.values.submitted_at_ms;
      body.records[0]!.time_reason_code = "SUBMITTED_AT_NOT_IN_POLICY";
      delete body.records[1]!.values.submitted_at_ms;
      body.records[1]!.time_reason_code = "SOURCE_TIME_UNPARSEABLE";
      return { ...answer, body };
    };
    mount(SCOPED_ENTRY, override);
    await ready();
    await openTab("Orders & Fills");
    const rows = within(await screen.findByRole("table", { name: "Orders of this alpha" })).getAllByRole("row").slice(1);
    const cell = (id: string) => rows.find((r) => r.textContent?.includes(id))!.querySelector("td[data-l='Time (UTC)']") as HTMLElement;
    expect(cell("ord_001").textContent).toBe("Not available");
    expect(cell("ord_001").querySelector("time")).toBeNull();
    expect(whyText(cell("ord_001"))).toBe("Submission time is outside this read's scope");
    expect(whyText(cell("ord_002"))).toBe("The source time could not be read");
    expect(cell("ord_003").querySelector("time")).not.toBeNull();
    expect(document.body.textContent).not.toMatch(/SUBMITTED_AT_NOT_IN_POLICY|SOURCE_TIME_UNPARSEABLE/);
  });

  it("a page that states none of the detail members draws none of its columns (no empty column reads as 'none')", async () => {
    const override: Override = (path, query) => {
      if (!/\/(orders|fills)$/.test(path)) return undefined;
      const answer = answerAlpha("GET", path, query)!;
      const body = structuredClone(answer.body) as { records: { values: Record<string, unknown> }[] };
      for (const record of body.records) for (const key of ["client_order_id", "order_type", "leg_role", "leg_sequence", "commission", "commission_currency", "liquidity_side"]) delete record.values[key];
      return { ...answer, body };
    };
    mount(SCOPED_ENTRY, override);
    await ready();
    await openTab("Orders & Fills");
    const orders = await screen.findByRole("table", { name: "Orders of this alpha" });
    const fills = await screen.findByRole("table", { name: "Fills of this alpha" });
    const heads = [...within(orders).getAllByRole("columnheader"), ...within(fills).getAllByRole("columnheader")].map((h) => h.textContent);
    for (const gone of ["Client order", "Type", "Leg", "Fee", "Liquidity"]) expect(heads).not.toContain(gone);
    expect(heads).toEqual(expect.arrayContaining(["Order", "Fill", "Quantity"]));
  });

  it("a fill with no trade time is counted as returned and not shown, never dated by the observation clock; the page's reason is behind the mark", async () => {
    mount();
    await ready();
    await openTab("Orders & Fills");
    const fills = await screen.findByRole("table", { name: "Fills of this alpha" });
    expect(within(fills).getAllByRole("row").slice(1)).toHaveLength(3);
    const note = screen.getByText(/1 record was returned and not shown: no fill id, price or trade time\./);
    expect(note.textContent).not.toMatch(/occurred_at_ms|timestamp_ms/);
    const mark = within(note.closest("p")!).getByRole("button", { name: "Why trade time is missing" });
    fireEvent.click(mark);
    expect(note.closest("p")!.textContent).toContain("The source published no time");
  });
});

describe("Trade Replay on subject-records.v2", () => {
  it("reads both candle sources and never merges them; the book says it is a scoped read", async () => {
    const { callsTo } = mount(`${SCOPED_ENTRY}&tab=replay`);
    await screen.findByRole("heading", { level: 1, name: "Trade Replay" });
    await waitFor(() => expect(callsTo("/market/venue-candles").length).toBeGreaterThan(0));
    await waitFor(() => expect(callsTo("/market/candles").length).toBeGreaterThan(0));
    expect(await screen.findByText("Scoped: authorized rows only")).toBeTruthy();
    expect(callsTo("/resources/alphas/").some((c) => c.includes("/orders") && c.includes(`workspace_id=${ALPHA_V2_WORKSPACE}`))).toBe(true);
  });
});

describe("states", () => {
  it("empty: the canonical empty body reads as an empty resource, not an error and not a table of nothing", async () => {
    mount(`/deployments/alphas/alpha_empty?workspace_id=${ALPHA_V2_WORKSPACE}`, undefined, "alpha_empty");
    expect(await screen.findByText(/is not present in the current projected resource population/)).toBeTruthy();
  });

  it("bounded: the Portal's byte-bound cut is said on the label and on every table that has no rows because of it", async () => {
    mount(`/deployments/alphas/alpha_bounded?workspace_id=${ALPHA_V2_WORKSPACE}&tab=deployments`, undefined, "alpha_bounded");
    await ready();
    const banner = screen.getByRole("note", { name: "Authority of this read" });
    expect(banner.textContent).toContain("EDS04_RESOURCE_RESPONSE_BYTE_BOUND");
    expect((await screen.findByRole("tabpanel")).textContent).toContain("Deployments are not in this response");
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    fireEvent.click(within(screen.getByRole("menu", { name: "More tabs" })).getByRole("menuitem", { name: "Positions" }));
    expect((await screen.findByRole("tabpanel")).textContent).toContain("Positions are not in this response");
    expect(document.body.textContent).not.toContain("The source published no deployment");
  });

  it("denied and down are typed refusals, with no scope label (nothing was read)", async () => {
    mount(`/deployments/alphas/alpha_denied?workspace_id=${ALPHA_V2_WORKSPACE}`, undefined, "alpha_denied");
    expect((await screen.findByLabelText("Alpha state")).textContent).toMatch(/outside your slice|not allowed|denied/i);
    expect(document.querySelector('[data-scope="scoped-v2"]')).toBeNull();
    cleanup();
    mount(`/deployments/alphas/alpha_down?workspace_id=${ALPHA_V2_WORKSPACE}`, undefined, "alpha_down");
    expect((await screen.findByLabelText("Alpha state")).textContent).toMatch(/could not be read|unavailable/i);
    expect(document.querySelector('[data-scope="scoped-v2"]')).toBeNull();
  });

  it("a later schema version, and a v2 body that does not match its contract, are named and none of it is shown", async () => {
    const body = (mutate: (b: Record<string, unknown>) => void): Override => (path, params) => {
      if (path !== `/resources/alphas/${ALPHA_DOUBLE_ID}`) return undefined;
      const answer = answerAlpha("GET", path, params)!;
      const copy = structuredClone(answer.body) as Record<string, unknown>;
      mutate(copy);
      return { status: 200, body: copy };
    };
    mount(SCOPED_ENTRY, body((b) => { b.schema_version = "execution.alpha-resource.v3"; }));
    expect((await screen.findByLabelText("Alpha state")).textContent).toContain('schema_version "execution.alpha-resource.v3", which this build does not read');
    cleanup();
    mount(SCOPED_ENTRY, body((b) => { b.totals_scope = "ALL_ROWS"; }));
    const state = await screen.findByLabelText("Alpha state");
    expect(state.textContent).toContain("does not match that contract, so none of it is shown");
    expect(document.querySelector(".exec-alp2-meta")).toBeNull();
  });

  it("a v1 body that arrives in the scoped workspace is read as v1; a v2 body labelled v1 is not read at all", async () => {
    const v1 = answerAlpha("GET", `/resources/alphas/${ALPHA_DOUBLE_ID}`, new URLSearchParams(""))!.body;
    mount(SCOPED_ENTRY, (path) => (path === `/resources/alphas/${ALPHA_DOUBLE_ID}` ? { status: 200, body: structuredClone(v1) } : undefined));
    await ready();
    expect(document.querySelector('[data-scope="scoped-v2"]')).toBeNull();
    expect(screen.getByText("asmith")).toBeTruthy();
    cleanup();
    const v2 = answerAlpha("GET", `/resources/alphas/${ALPHA_DOUBLE_ID}`, new URLSearchParams(`workspace_id=${ALPHA_V2_WORKSPACE}`))!.body as Record<string, unknown>;
    mount(SCOPED_ENTRY, (path) => (path === `/resources/alphas/${ALPHA_DOUBLE_ID}` ? { status: 200, body: { ...structuredClone(v2), schema_version: "execution.alpha-resource.v1" } } : undefined));
    expect((await screen.findByLabelText("Alpha state")).textContent).toContain("could not be read");
    expect(document.querySelector(".exec-alp2-meta")).toBeNull();
  });

  it("a revoke drops the scoped resource and the label with it", async () => {
    mount();
    await ready();
    expect(screen.getByRole("note", { name: "Authority of this read" })).toBeTruthy();
    act(() => void evictScopedCaches("ACCESS_REVOKED"));
    await waitFor(() => expect(screen.getByLabelText("Alpha state").textContent).toMatch(/revoked|access/i));
    expect(screen.queryByRole("note", { name: "Authority of this read" })).toBeNull();
    expect(search().get("workspace_id")).toBe(ALPHA_V2_WORKSPACE);
  });
});
