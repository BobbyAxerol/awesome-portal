/**
 * Overview (Command Center) V2 through the real HTTP client against the S2
 * double: BUSY, QUIET, PARTIAL, STALE and feed-unavailable snapshots, the
 * money KPIs that stay "Not published", current per-currency facts, the stream
 * gate and the researcher variant.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { answerOperationsV2 } from "../../../../../e2e/bffDoubleV2";
import { resetOverviewDouble, setOverviewDoubleVariants } from "../../../../../e2e/bffDoubleOverview";
import type { ExecutionApi } from "../../../api/ports";
import type { SseLike } from "../../../sse";
import { httpApi, serveDoubles, type Call } from "../../../../../e2e/screensV2Harness";
import OverviewScreen, { OVERVIEW_SCREEN_KEY } from "./index";

let calls: Call[] = [];
beforeEach(() => {
  resetOverviewDouble();
  setOverviewDoubleVariants({ fleet: "multi-currency" });
  calls = serveDoubles();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const override = (over: Partial<ExecutionApi>): ExecutionApi => ({ ...httpApi(), withReadSignal: undefined, ...over });

const mount = (props: Partial<React.ComponentProps<typeof OverviewScreen>> = {}, api: ExecutionApi = httpApi(), entry = "/execution") =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <OverviewScreen api={api} sseFactory={null} {...props} />
    </MemoryRouter>,
  );

/** The page is up AND every read has landed, so no state update is left to arrive after the test ends. */
const loaded = async () => {
  const heading = await screen.findByRole("heading", { name: /^Overview/ });
  await waitFor(() => {
    expect(screen.queryByRole("status", { name: /^Loading/ })).toBeNull();
    expect(document.body.textContent).not.toContain("acknowledgement: reading");
  });
  return heading;
};
const kpis = () => screen.getByLabelText("Fund figures");
const kpi = (label: string) => [...kpis().querySelectorAll(".exec-blk-kpi")].find((n) => n.querySelector("dt")?.textContent === label) as HTMLElement;
const panel = (title: string) => screen.getByRole("region", { name: title });
const MONEY_GAP = "Not published (FE-005/006/013/025)";

describe("BUSY", () => {
  it("is the overview flag's screen", () => {
    expect(OVERVIEW_SCREEN_KEY).toBe("overview");
  });

  it("keeps NAV, Net PnL, Return and Drawdown as Not published with their request ids, never a number", async () => {
    mount();
    await loaded();
    for (const label of ["NAV", "Net PnL", "Return", "Drawdown"]) {
      const cell = kpi(label);
      expect(cell.querySelector(".exec-blk-kpi-value")?.textContent, label).toBe(MONEY_GAP);
      expect((cell.querySelector(".exec-blk-kpi-value")?.textContent ?? "").replace(/\(FE-[\d/]+\)/, ""), label).not.toMatch(/\d/);
    }
  });

  it("prints published counts with their exactness: a window of the ranked list is 'at least', the panel's own sentence for the rest", async () => {
    mount();
    await loaded();
    expect(kpi("Open incidents").querySelector(".exec-blk-kpi-value")?.textContent).toBe("at least 1");
    expect(kpi("Needs attention").querySelector(".exec-blk-kpi-value")?.textContent).toBe("3 of 214");
    const expected = answerOperationsV2("GET", "/operations", new URLSearchParams({ triage_state: "UNACKNOWLEDGED", limit: "1" }));
    const unacknowledged = (expected!.body as { page: { filtered_count: number } }).page.filtered_count;
    expect(kpi("Needs attention").textContent).toContain(`Operations awaiting acknowledgement: ${unacknowledged}`);
    expect(calls.find((c) => c.path === "/operations")!.query).toContain("triage_state=UNACKNOWLEDGED");
  });

  it("shows the structure of what is not published, with its ids", async () => {
    mount();
    await loaded();
    expect(panel("Performance").textContent).toContain(MONEY_GAP);
    const cap = within(panel("Capital")).getByRole("table", { name: "Capital" });
    expect(within(cap).getAllByRole("row").map((r) => r.textContent)).toEqual([
      "Initial fundsNot published (FE-017)",
      "Added fundsNot published (FE-017)",
      "ReturnedNot published (FE-017)",
      "NAVNot published (FE-017)",
      "Budget usedNot published (FE-017)",
    ]);
    expect(panel("Since your last visit").textContent).toContain("Not published (FE-024)");
    expect(panel("Contributors").textContent).toContain("Not published (FE-025)");
  });

  it("lists the ranked triage in the server's order with rank, kind, deadline and a canonical link", async () => {
    mount();
    await loaded();
    const list = within(panel("Needs attention")).getByRole("table", { name: "Ranked triage list" });
    const rows = within(list).getAllByRole("row").slice(1);
    expect(rows.map((r) => r.querySelector("td[data-l='Rank']")?.textContent)).toEqual(["1", "2", "3"]);
    expect(rows.map((r) => r.querySelector("td[data-l='Kind']")?.textContent)).toEqual(["▲Incident", "◆Operation", "◈Approval"].map((t) => expect.stringContaining(t.slice(1))));
    expect(rows[0]!.querySelector("td[data-l='What']")?.textContent).toContain("Broker sync diverged");
    expect(rows[0]!.querySelector("td[data-l='SLA']")?.textContent).toContain("Overdue (since 2026-08-22 11:58:00 UTC)");
    const href = (r: HTMLElement) => r.querySelector("td[data-l='Open'] a")?.getAttribute("href");
    expect(href(rows[0]!)).toBe("/execution/operations/incidents/inc_44");
    expect(href(rows[1]!)).toBe("/execution/operations?operation=op_1251");
    expect(href(rows[2]!)).toBe("/governance/approvals/AP-352/r2");
    expect(panel("Needs attention").textContent).toContain("rest are ranked behind these");
  });

  it("current allocation, exposure and open-position PnL are one row per currency, never added", async () => {
    mount();
    await loaded();
    const table = within(panel("Current by currency")).getByRole("table", { name: "Current allocation and exposure by currency" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((r) => r.querySelector("td[data-l='Currency']")?.textContent)).toEqual(["USD", "USDT"]);
    const usdt = rows[1]!;
    expect(usdt.querySelector("td[data-l='Allocation'] .exec-ov-num")?.textContent).toBe("150,000.50");
    expect(usdt.querySelector("td[data-l='Allocation'] .exec-ov-num")?.getAttribute("title")).toBe("150000.50");
    expect(usdt.querySelector("td[data-l='Exposure']")?.textContent).toBe("84,210.125");
    const usd = rows[0]!;
    expect(usd.querySelector("td[data-l='Open-position PnL, net']")?.textContent).toBe("0.00001234");
    expect(panel("Current by currency").textContent).toContain("Current facts, not a window");
    expect(panel("Current by currency").textContent).not.toMatch(/total/i);
  });

  it("fleet by stage: stage counts from the summary, deployment cells from the snapshot, and the double-count caveat", async () => {
    mount();
    await loaded();
    const stages = within(panel("Fleet by stage")).getByRole("list", { name: "Alphas by stage" });
    expect(within(stages).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Paper1", "Sandbox1", "Live1"]);
    const cells = within(panel("Fleet by stage")).getByRole("list", { name: "Deployments by state" });
    expect(within(cells).getAllByRole("listitem").map((li) => li.textContent)).toContain("Live42");
    expect(panel("Fleet by stage").textContent).toContain("Deployments: 182");
    expect(panel("Fleet by stage").textContent).toContain("An alpha in two stages is counted in each");
  });

  it("Today lists the day's items; a condition expiry goes to the waivers register", async () => {
    mount();
    await loaded();
    const today = panel("Today");
    expect(within(today).getByRole("link", { name: "Capital condition expires" }).getAttribute("href")).toBe("/governance/waivers");
    expect(within(today).getByRole("link", { name: "R1 review · Momentum v4" }).getAttribute("href")).toBe("/governance/approvals/AP-201/r1");
  });

  it("source health by profile", async () => {
    mount();
    await loaded();
    expect(within(panel("Source health")).getAllByRole("listitem")).toHaveLength(3);
  });

  it("renders no dash, no NaN, no undefined and no abbreviated number", async () => {
    mount();
    await loaded();
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/[—–]/);
    expect(text).not.toMatch(/NaN|undefined|\[object/);
    expect(text).not.toMatch(/\b\d+(\.\d+)?[kKmM]\b/);
  });

  it("cards at 660px: every table cell is labelled", async () => {
    mount();
    await loaded();
    for (const table of document.querySelectorAll("table.exec-cards")) {
      for (const cell of table.querySelectorAll("tbody td")) expect(cell.getAttribute("data-l"), table.getAttribute("aria-label") ?? "").toBeTruthy();
    }
  });
});

describe("the other snapshots", () => {
  it("QUIET says nothing needs you, with the read time, and claims a zero only because the server counted it", async () => {
    setOverviewDoubleVariants({ commandCenter: "quiet" });
    mount();
    await loaded();
    expect(screen.getByText("Nothing needs you.")).toBeTruthy();
    expect(screen.getByText(/Quiet as of 2026-08-22 12:00:00 UTC/)).toBeTruthy();
    expect(screen.getByText("Quiet")).toBeTruthy();
    expect(kpi("Open incidents").querySelector(".exec-blk-kpi-value")?.textContent).toBe("0");
    expect(kpi("Needs attention").querySelector(".exec-blk-kpi-value")?.textContent).toBe("0");
    expect(screen.getByText("Nothing is scheduled for today.")).toBeTruthy();
  });

  it("PARTIAL says triage may be missing items, keeps the floor as '~', and never counts an incident it did not see as zero", async () => {
    setOverviewDoubleVariants({ commandCenter: "partial" });
    mount();
    await loaded();
    expect(screen.getByText(/Some triage sources did not answer/)).toBeTruthy();
    expect(screen.getAllByText("Partial").length).toBeGreaterThan(0);
    expect(kpi("Needs attention").querySelector(".exec-blk-kpi-value")?.textContent).toBe("~1 seen");
    expect(kpi("Open incidents").querySelector(".exec-blk-kpi-value")?.textContent).toBe("None seen");
    expect(screen.getByText("COMMAND_CENTER_SOURCE_GAP")).toBeTruthy();
    expect(panel("Fleet by stage").textContent).toContain("Live");
  });

  it("STALE is marked stale, not fresh", async () => {
    setOverviewDoubleVariants({ commandCenter: "stale" });
    mount();
    await loaded();
    expect(screen.getAllByText("Stale").length).toBeGreaterThan(0);
    expect(screen.getByText(/Some triage sources did not answer/)).toBeTruthy();
  });

  it("feed-unavailable shows Not available for every count the feed would have given, not zero", async () => {
    setOverviewDoubleVariants({ commandCenter: "feed-unavailable" });
    mount();
    await loaded();
    expect(kpi("Open incidents").querySelector(".exec-blk-kpi-value")?.textContent).toBe("Not available");
    expect(kpi("Needs attention").querySelector(".exec-blk-kpi-value")?.textContent).toBe("Not available");
    expect(screen.getByText("The triage sources did not answer.")).toBeTruthy();
    expect(screen.getByText("Degraded")).toBeTruthy();
  });
});

describe("what the fleet read does not carry", () => {
  it("a summary that lists no currency says so instead of showing an empty currency table", async () => {
    setOverviewDoubleVariants({ fleet: "empty-summary" });
    mount();
    await loaded();
    expect(await screen.findByText("The fleet summary lists no currency.")).toBeTruthy();
    expect(screen.queryByRole("table", { name: "Current allocation and exposure by currency" })).toBeNull();
  });

  it("a fleet body with no summary is refused by the reader and shown as unavailable, not as an empty fleet", async () => {
    setOverviewDoubleVariants({ fleet: "no-summary" });
    mount();
    await loaded();
    expect(await screen.findByText(/could not be read/)).toBeTruthy();
    expect(screen.queryByRole("table", { name: "Current allocation and exposure by currency" })).toBeNull();
  });

  it("a failed fleet read is a panel state; the rest of the page stays", async () => {
    setOverviewDoubleVariants({ fleet: "error" });
    mount();
    await loaded();
    expect(await screen.findByText(/FLEET_PROJECTION_UNAVAILABLE/)).toBeTruthy();
    expect(kpi("Needs attention")).toBeTruthy();
  });

  it("a legacy operations body is unsupported, so the awaiting-acknowledgement count is not available", async () => {
    setOverviewDoubleVariants({ operations: "legacy" });
    mount();
    await loaded();
    await waitFor(() => expect(kpi("Needs attention").textContent).toContain("Operations awaiting acknowledgement: not available"));
  });
});

describe("scale", () => {
  it("300 ranked items still put at most 200 rows in the DOM, and the window is named", async () => {
    const base = httpApi();
    const big = override({
      getOperationalComposition: async (name, query) => {
        const result = await base.getOperationalComposition(name, query);
        if (!result.ok) return result;
        const snapshot = structuredClone(result.value.data.command_center) as { panels: { needs_you: { items: Record<string, unknown>[] } } };
        const first = snapshot.panels.needs_you.items[0]!;
        snapshot.panels.needs_you.items = Array.from({ length: 300 }, (_, i) => ({ ...first, id: `inc_${i}`, rank: i + 1 }));
        return { ...result, value: { ...result.value, data: { command_center: snapshot } } };
      },
      getAlphaFleet: (q) => base.getAlphaFleet(q),
      listOperationalQueueV2: (q) => base.listOperationalQueueV2(q),
    });
    mount({}, big);
    await loaded();
    const list = within(panel("Needs attention")).getByRole("table", { name: "Ranked triage list" });
    expect(within(list).getAllByRole("row").slice(1)).toHaveLength(200);
  });
});

describe("page states", () => {
  it("loading", async () => {
    mount();
    expect(screen.getByRole("status", { name: "Loading the overview" })).toBeTruthy();
    await loaded();
  });

  it("a failed composition read is unavailable with Try again, and a retry recovers", async () => {
    let fail = true;
    const base = httpApi();
    const flaky = override({
      getOperationalComposition: async (name, query) => (fail ? { ok: false, status: "unavailable", reason: "PORTAL_READ_FAILED" } : base.getOperationalComposition(name, query)),
      getAlphaFleet: (q) => base.getAlphaFleet(q),
      listOperationalQueueV2: (q) => base.listOperationalQueueV2(q),
    });
    mount({}, flaky);
    expect(await screen.findByText(/PORTAL_READ_FAILED/)).toBeTruthy();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await loaded();
  });

  it("a snapshot the reader refuses is unavailable, not an empty overview", async () => {
    const base = httpApi();
    const odd = override({
      getOperationalComposition: async (name, query) => {
        const result = await base.getOperationalComposition(name, query);
        return result.ok ? { ...result, value: { ...result.value, data: { command_center: "nonsense" } } } : result;
      },
      getAlphaFleet: (q) => base.getAlphaFleet(q),
      listOperationalQueueV2: (q) => base.listOperationalQueueV2(q),
    });
    mount({}, odd);
    expect(await screen.findByText("The command-center snapshot could not be read.")).toBeTruthy();
  });

  it("a refresh that fails keeps the last good values and says they are stale", async () => {
    let fail = false;
    const base = httpApi();
    const flaky = override({
      getOperationalComposition: async (name, query) => (fail ? { ok: false, status: "unavailable", reason: "UPSTREAM_503" } : base.getOperationalComposition(name, query)),
      getAlphaFleet: (q) => base.getAlphaFleet(q),
      listOperationalQueueV2: (q) => base.listOperationalQueueV2(q),
    });
    mount({}, flaky);
    await loaded();
    fail = true;
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByText(/The last refresh failed \(UPSTREAM_503\)/)).toBeTruthy();
    expect(kpi("Needs attention").querySelector(".exec-blk-kpi-value")?.textContent).toBe("3 of 214");
  });
});

describe("the stream gate", () => {
  it("opens nothing while the snapshot says the stream is not published, and says so", async () => {
    const factory = vi.fn();
    mount({ sseFactory: factory });
    await loaded();
    expect(screen.getByText(/No live stream is published for this profile/)).toBeTruthy();
    expect(factory).not.toHaveBeenCalled();
  });

  it("opens one stream when it is published, and a pushed operation update is a reason to re-read, not an event on the page", async () => {
    setOverviewDoubleVariants({ stream: "published" });
    const listeners = new Map<string, ((event: MessageEvent) => void)[]>();
    const source: SseLike = {
      addEventListener: (type, listener) => listeners.set(type, [...(listeners.get(type) ?? []), listener]),
      close: vi.fn(),
    };
    const factory = vi.fn((_url: string) => source);
    mount({ sseFactory: factory });
    await loaded();
    await waitFor(() => expect(factory).toHaveBeenCalledTimes(1));
    expect(factory.mock.calls[0]![0]).toContain("cursor=e2e-cc%3A1");
    const before = screen.getAllByRole("row").length;
    const needs = kpi("Needs attention").textContent;
    act(() => {
      for (const listener of listeners.get("operation.updated") ?? []) {
        listener(new MessageEvent("operation.updated", { data: JSON.stringify({ projection_epoch: "e2e-cc", projection_sequence: 2, as_of: "2026-10-17T12:05:00Z" }), lastEventId: "e2e-cc:2" }));
      }
    });
    await waitFor(() => expect(document.querySelector(".exec-ov-stream")?.getAttribute("data-stream")).toBe("live"));
    expect(screen.getAllByRole("row").length).toBe(before);
    expect(kpi("Needs attention").textContent).toBe(needs);
    expect(panel("Since your last visit").textContent).toContain("Not published (FE-024)");
  });

  async function publishedStream() {
    setOverviewDoubleVariants({ stream: "published" });
    const listeners = new Map<string, ((event: MessageEvent) => void)[]>();
    const source: SseLike = { addEventListener: (type, listener) => listeners.set(type, [...(listeners.get(type) ?? []), listener]), close: vi.fn() };
    mount({ sseFactory: () => source });
    await loaded();
    await waitFor(() => expect(listeners.size).toBeGreaterThan(0));
    const emit = (type: string, data: unknown, id = "") => act(() => {
      for (const listener of listeners.get(type) ?? []) listener(new MessageEvent(type, { data: JSON.stringify(data), lastEventId: id }));
    });
    return emit;
  }
  const streamLine = () => document.querySelector(".exec-ov-stream")!;

  it("a gap says the values are the last good read, not that the page is live", async () => {
    const emit = await publishedStream();
    emit("projection.gap", { reason: "projection_sequence_gap" });
    await waitFor(() => expect(streamLine().getAttribute("data-stream")).toBe("gap"));
    expect(streamLine().textContent).toContain("Values are the last good read, not the current state");
    expect(streamLine().textContent).not.toMatch(/^Live/);
    expect(kpi("Needs attention").querySelector(".exec-blk-kpi-value")?.textContent).toBe("3 of 214");
  });

  it("a session that expires on the stream is said plainly and the values stay as read", async () => {
    const emit = await publishedStream();
    emit("auth.expiring", { expires_at: "2020-01-01T00:00:00Z" });
    emit("error", {});
    await waitFor(() => expect(streamLine().getAttribute("data-stream")).toBe("auth_expired"));
    expect(streamLine().textContent).toMatch(/Session expired/);
    expect(kpi("Needs attention").querySelector(".exec-blk-kpi-value")?.textContent).toBe("3 of 214");
  });
});

describe("a caller without a fund-wide read", () => {
  it("gets their own alphas and nothing fund-wide, and the researcher policy is named as undecided", async () => {
    mount({ capabilities: new Set(["governance.r1.read"]) });
    expect(await screen.findByRole("heading", { level: 1, name: "Your alphas" })).toBeTruthy();
    expect(screen.queryByLabelText("Fund figures")).toBeNull();
    expect(screen.queryByRole("region", { name: "Capital" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Source health" })).toBeNull();
    const table = await screen.findByRole("table", { name: "Your alphas" });
    await waitFor(() => expect(screen.queryByRole("status", { name: /^Loading/ })).toBeNull());
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    expect(document.body.textContent).toContain("Not published (FE-026)");
    // Nothing fund-wide is even asked for.
    expect(calls.some((c) => c.path === "/compositions/command-center" || c.path === "/operations")).toBe(false);
    expect(calls.some((c) => c.path === "/alphas")).toBe(true);
  });

  it("a manager preset sees the fund", async () => {
    mount({ capabilities: new Set(["execution.operations.read"]) });
    await loaded();
    expect(screen.getByLabelText("Fund figures")).toBeTruthy();
  });
});
