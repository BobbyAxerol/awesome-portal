/**
 * Canary against the BE-P2 / BE-P3 members, published (lane FIXTURE_LAB: the populated values are the canonical SYNTHETIC
 * fixtures `execution-stage-facts.source-backed`, `execution-canary-envelope-facts` and `execution-stage-rows`, merged into the
 * dark published body; a synthetic fixture is never source acceptance). Every member is a Fact: AVAILABLE prints its value,
 * NOT_PUBLISHED prints `Not published (FE-xxx)` with the server's reason code in the title, and a member that does not match the
 * schema exactly reads as absent. The reader stays closed: a planted key refuses the member, nothing else changes.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { readCanaryByVersion } from "../../readers/dispatch";
import { loadCanonical } from "../../testkit/loadCanonical";
import type { Draft } from "../../testkit/matrix";
import { validateAgainst } from "../../testkit/schema";
import CanaryScreen from "./index";
import { chipsOf, limitRows, rollbackItems, trialCalendar, verdictLine } from "./model";
import { readCanaryView, type CanaryView } from "./readCanary";
import { DEP, answering, canaryPort, legacyV1Body, lit, v1Body } from "./canary.testbase";
import { whyButton, whyText } from "../../gapWhyTestUtil";

afterEach(cleanup);

const stageFacts = (): Draft => loadCanonical<Draft>("execution-stage-facts.source-backed.synthetic").value;
const envelopeFacts = (): Draft => loadCanonical<Draft>("execution-canary-envelope-facts.synthetic").value;
const stageRows = (): Draft => loadCanonical<Draft>("execution-stage-rows.synthetic").value;

/** The published dark body (the canonical, with its dark members) with the synthetic populated members merged in. */
function published(): Draft {
  const body = v1Body();
  const env = envelopeFacts();
  const rows = stageRows();
  body.stage_facts = stageFacts();
  body.envelope_compliance.rows = env.rows;
  body.envelope_compliance.verdict = env.verdict;
  body.rollback_readiness.items = env.items;
  body.lifecycle.trial = env.trial;
  body.source_figures = rows.source_figures;
  body.series = { ...body.series, ...rows.series };
  body.positions.typed = rows.typed_positions;
  body.blotter.typed = rows.typed_orders;
  // The typed rows are drawn only from a collection whose own panel holds rows.
  lit(body.positions.envelope, "ready", "FRESH");
  lit(body.blotter.envelope, "ready", "FRESH");
  body.positions.exact_total = 2;
  body.blotter.exact_total = 1;
  body.deployment.alpha_id = "alpha_TEST_ONLY";
  body.deployment.alpha_name = null;
  body.deployment.portfolio_name = "Crypto Core";
  body.deployment.alpha_reason_code = "ALPHA_NAME_NOT_PUBLISHED";
  body.deployment.portfolio_name_reason_code = null;
  return body;
}

const viewOf = (raw: unknown): CanaryView => {
  const result = readCanaryView(readCanaryByVersion(raw));
  if (result.kind !== "view") throw new Error(result.text);
  return result.view;
};

function mount(raw: unknown) {
  render(
    <MemoryRouter initialEntries={[`/deployments/live/${DEP}/canary`]}>
      <CanaryScreen api={canaryPort(answering(raw))} deploymentId={DEP} />
    </MemoryRouter>,
  );
}
const ready = () => screen.findByRole("heading", { level: 1, name: "Canary control room" });
async function openTab(name: string) {
  const tabs = within(screen.getByRole("tablist", { name: "Canary sections" }));
  fireEvent.click(tabs.getByRole("tab", { name }));
  await waitFor(() => expect(tabs.getByRole("tab", { name }).getAttribute("aria-selected")).toBe("true"));
}

describe("the merged body is wire-shaped: each BE-P2/P3 member validates against the published schema", () => {
  it("members", () => {
    const body = published();
    const S = "execution-canary-control-room.v1";
    expect(validateAgainst("execution-stage-facts.v1", "/$defs/StageFacts", body.stage_facts)).toEqual([]);
    expect(validateAgainst("execution-stage-facts.v1", "/$defs/StageSourceFigures", body.source_figures)).toEqual([]);
    expect(validateAgainst(S, "/$defs/UnavailableCollection", { ...loadCanonical<Draft>("execution-canary-control-room.unavailable").positions, typed: body.positions.typed })).toEqual([]);
    expect(validateAgainst("execution-stage-facts.v1", "/$defs/TrialSchedule", body.lifecycle.trial)).toEqual([]);
  });
});

describe("chips: runtime and reconciliation are the server's stage facts", () => {
  it("RUNNING since the published instant; OPEN_FINDINGS with its count and the unknown-order count only because it is AVAILABLE", () => {
    const chips = chipsOf(viewOf(published()));
    expect(chips.runtime).toEqual({ state: "flag", kind: "ok", label: "Running", note: "since 12 Oct 08:00Z" });
    expect(chips.reconciliation).toEqual({ state: "flag", kind: "attention", label: "1 open finding", note: "1 unknown order · as of 12 Oct 08:00Z" });
  });

  it.each([
    ["PAUSED", "paused", "Paused"],
    ["HALTED", "attention", "Halted"],
    ["STOPPED", "attention", "Stopped"],
  ] as const)("%s is its own word", (word, kind, label) => {
    const body = published();
    body.stage_facts.runtime.runtime_state.value = word;
    expect(chipsOf(viewOf(body)).runtime).toMatchObject({ state: "flag", kind, label });
  });

  it("NO_OPEN_FINDINGS is worded as a statement about the findings relation, never Clean or Reconciled", () => {
    const body = published();
    const r = body.stage_facts.reconciliation;
    r.verdict.value = "NO_OPEN_FINDINGS";
    r.open_finding_count.value = 0;
    r.unknown_order_count.value = 0;
    const chip = chipsOf(viewOf(body)).reconciliation;
    expect(chip).toMatchObject({ state: "flag", kind: "ok", label: "No open findings" });
    expect(JSON.stringify(chip)).not.toMatch(/Clean|Reconciled/);
  });

  it("unknown_order_count NOT_PUBLISHED is not printed as 0", () => {
    const body = published();
    body.stage_facts.reconciliation.unknown_order_count = { availability: "NOT_PUBLISHED", value: null, reason_code: "FINDING_TYPE_VOCABULARY_NOT_CLASSIFIED" };
    const chip = chipsOf(viewOf(body)).reconciliation;
    expect(chip).toMatchObject({ label: "1 open finding", note: "as of 12 Oct 08:00Z" });
    expect(JSON.stringify(chip)).not.toContain("unknown order");
  });

  it("`active`, a session or a freshness word never becomes a runtime state: only the closed vocabulary does", () => {
    const body = published();
    body.stage_facts.runtime.runtime_state.value = "active";
    // A word outside the vocabulary refuses the whole stage_facts member: the chips fall back to Not published without a reason.
    expect(chipsOf(viewOf(body)).runtime).toEqual({ state: "not-published", id: "FE-067" });
    expect(chipsOf(viewOf(body)).reconciliation).toEqual({ state: "not-published", id: "FE-067" });
  });
});

describe("the Envelope tab: the server's rows, ratio, verdict", () => {
  it("each cap carries the policy limit fact, consumed, and the SERVER's used ratio; nothing is divided", () => {
    const rows = limitRows(viewOf(published()));
    const capital = rows[0]!;
    expect(capital.usedRatio).toBe("0.25");
    expect(capital.consumed).toMatchObject({ kind: "value", decimal: { full: "250" } });
    expect(capital.limit).toBeNull();
    expect(capital.limitReason).toBe("BASE_RISK_PROFILE_LIMITS_NOT_PUBLISHED");
    expect(capital.asOf).toBe("12 Oct 08:00Z");
    // an exact published zero is a value, with its ratio
    expect(rows[1]!.consumed).toMatchObject({ kind: "value", decimal: { zero: true } });
    expect(rows[1]!.usedRatio).toBe("0");
    // daily loss: not published, with the server's reason
    expect(rows[2]!.usedRatio).toBeUndefined();
    expect(rows[2]!.usedReason).toBe("DAILY_LOSS_WINDOW_NOT_PUBLISHED");
    expect(rows[3]!.usedRatio).toBe("0.5");
    // duration has no compliance row
    expect(rows[4]!.usedRatio).toBeUndefined();
    expect(rows[4]!.usedReason).toBeNull();
  });

  it("the verdict is the server's, with what it could not prove", () => {
    expect(verdictLine(viewOf(published()))).toEqual({ flag: "partial", label: "Undetermined", sentence: "Not proven: daily loss cap." });
    const within = published();
    within.envelope_compliance.verdict = { state: "WITHIN_ENVELOPE", basis: "CONSUMED_NOT_ABOVE_APPROVED_PER_CAP", undetermined_caps: [] };
    expect(verdictLine(viewOf(within))).toMatchObject({ flag: "ok", label: "Within envelope" });
    const breach = published();
    breach.envelope_compliance.verdict = { state: "BREACH", basis: "CONSUMED_NOT_ABOVE_APPROVED_PER_CAP", undetermined_caps: ["daily_loss"] };
    expect(verdictLine(viewOf(breach))).toMatchObject({ flag: "rejected", label: "Breach" });
    expect(verdictLine(viewOf(legacyV1Body()))).toBeNull();
  });

  it("the screen draws a gauge for the two published ratios, a published zero as 0.00% used, and Not published: canary envelope compliance, rollback checks and trial calendar with the reason for the rest", async () => {
    mount(published());
    await ready();
    const table = screen.getByRole("table", { name: "Canary envelope caps" });
    const used = (label: string) => Array.from(table.querySelectorAll("tbody tr")).map((row) => row.querySelector(`td[data-l="${label}"]`)!);
    const gauges = used("Used").map((cell) => cell.querySelector('[role="img"]')?.getAttribute("aria-label") ?? null);
    expect(gauges[0]).toBe("Capital cap (USDT): 25.00% used");
    expect(gauges[1]).toBe("Gross notional cap (USDT): 0.00% used");
    expect(gauges[2]).toBeNull();
    expect(gauges[3]).toBe("Open orders (max): 50.00% used");
    expect(whyText(used("Used")[2]!.querySelector("[data-gap]")!)).toContain("DAILY_LOSS_WINDOW_NOT_PUBLISHED");
    expect(used("Used")[2]!.textContent).toBe("Not available");
    expect(used("Consumed")[0]!.textContent).toContain("250.00");
    const panel = table.closest("section")!;
    expect(panel.textContent).not.toContain("Envelope verdict");
    expect(panel.textContent).toContain("Undetermined");
    expect(panel.textContent).toContain("Not proven: daily loss cap.");
    expect(panel.textContent).not.toContain("Within envelope");
  });
});

describe("rollback checks and the trial calendar", () => {
  it("each check is the server's statement with its own date; a stale broker snapshot does not stay green", () => {
    const items = rollbackItems(viewOf(published()));
    expect(items.map((i) => i.status)).toEqual([
      { kind: "not-published", reasonCode: "FLATTEN_PLAN_NOT_RECORDED" },
      { kind: "not-published", reasonCode: "E5_CANARY_TWIN_COMPARISON_NOT_QUALIFIED" },
      { kind: "flag", flag: "ok", label: "Ready" },
      { kind: "not-published", reasonCode: "ROLLBACK_DRILL_NOT_RECORDED" },
    ]);
    expect(items[2]!.checked).toBe("12 Oct 07:59Z");
    const stale = published();
    lit(stale.source_panels[1], "stale", "STALE");
    expect(rollbackItems(viewOf(stale))[2]!.status).toEqual({ kind: "flag", flag: "partial", label: "Not confirmed" });
    const no = published();
    no.rollback_readiness.items[2].ready.value = false;
    expect(rollbackItems(viewOf(no))[2]!.status).toEqual({ kind: "flag", flag: "attention", label: "Not ready" });
  });

  it("the trial strip prints the server's dates and no countdown", async () => {
    expect(trialCalendar(viewOf(published()))).toEqual({
      started: { kind: "time", text: "12 Oct 08:00Z" },
      exitReviewOpens: { kind: "time", text: "26 Oct 08:00Z" },
    });
    mount(published());
    await ready();
    const trial = screen.getByRole("group", { name: "Trial schedule" });
    // The day is not stated: it is one `Not available` line (FE-071 in its title), not a sentence.
    expect(trial.textContent).toContain("Not available: Trial day");
    expect(whyText(trial.querySelector(".exec-blk-gaps")!)).toContain("Trial day: Not published: canary envelope compliance, rollback checks and trial calendar");
    expect(trial.textContent).toContain("Started 12 Oct 08:00Z");
    expect(trial.textContent).toContain("Exit review opens 26 Oct 08:00Z");
    expect(trial.textContent).not.toMatch(/days left|day 0|in \d+ days/);
    expect(trial.textContent).not.toContain("Not published");
  });

  it("the Rollback panel shows the broker check Ready with its date and the three others as ONE `Not available` line with their reasons in its title", async () => {
    mount(published());
    await ready();
    const panel = screen.getByRole("heading", { name: "Rollback readiness" }).closest("section")!;
    const items = Array.from(panel.querySelectorAll("li.exec-cny-rb-item"));
    expect(items).toHaveLength(1);
    expect(items[0]!.textContent).toContain("Last update 12 Oct 07:59Z");
    expect(items[0]!.textContent).toContain("Ready");
    const gap = panel.querySelector(".exec-blk-gaps")!;
    expect(gap.textContent).toBe("Not available: Flatten plan prepared, Paper twin running, Last rollback drill");
    expect(whyText(gap)).toContain("FLATTEN_PLAN_NOT_RECORDED");
    expect(whyText(gap)).toContain("ROLLBACK_DRILL_NOT_RECORDED");
  });
});

describe("Positions & orders: typed rows when AVAILABLE", () => {
  it("draws the typed rows with exact text; leverage and ack latency stay Not published with the server's reason", async () => {
    mount(published());
    await ready();
    await openTab("Positions & orders");
    const positions = screen.getByRole("table", { name: "Canary positions" });
    const first = Array.from(positions.querySelectorAll("tbody tr"))[0]!;
    expect(first.querySelector('td[data-l="Symbol"]')!.textContent).toBe("BTCUSDT");
    expect(first.querySelector('td[data-l="Quantity"]')!.textContent).toBe("0.5");
    expect(first.querySelector('td[data-l="Mark"]')!.textContent).toBe("60,500.50");
    expect(first.querySelector('td[data-l="Unrealised PnL"]')!.textContent).toBe("250.25");
    // Leverage and Ack latency: no row fills them, so no column of empty cells; each is said once under its table, the reason in the title.
    expect(first.querySelector('td[data-l="Leverage"]')).toBeNull();
    const positionsGap = positions.closest("section")!.querySelector(".exec-blk-gaps")!;
    expect(positionsGap.textContent).toBe("Not available: Leverage");
    expect(whyText(positionsGap)).toContain("POSITION_LEVERAGE_NOT_IN_SOURCE_RELATION");
    const orders = screen.getByRole("table", { name: "Canary open orders" });
    const order = Array.from(orders.querySelectorAll("tbody tr"))[0]!;
    expect(order.querySelector('td[data-l="Type"]')!.textContent).toBe("Limit");
    expect(order.querySelector('td[data-l="Side"]')!.textContent).toBe("Buy");
    expect(order.querySelector('td[data-l="Ack latency"]')).toBeNull();
    expect(whyText(orders.closest("section")!.querySelector(".exec-blk-gaps")!)).toContain("ORDER_ACK_LATENCY_NOT_IN_SOURCE_RELATION");
    expect(screen.getByRole("tabpanel").textContent).toContain("2 of 2");
  });

  it("NOT_PUBLISHED typed rows draw no table; a typed block over a panel that holds no rows is not drawn either", async () => {
    const body = published();
    body.positions.typed = loadCanonical<Draft>("execution-canary-control-room.unavailable").positions.typed;
    lit(body.positions.envelope, "unavailable", "UNKNOWN", "UNAVAILABLE");
    const view = viewOf(body);
    expect(view.positions.rows).toBeNull();
    expect(view.positions.typedReasonCode).toBe("LIVE_SOURCE_UNAVAILABLE");
    const stale = published();
    lit(stale.positions.envelope, "unavailable", "UNKNOWN", "UNAVAILABLE");
    expect(viewOf(stale).positions.rows).toBeNull();
  });
});

describe("Reconciliation: the server's figures", () => {
  it("Internal, Broker and the SERVER's Difference per figure; a side it did not publish is Not published: typed stage rows, series and reconciliation figures with its reason", async () => {
    mount(published());
    await ready();
    await openTab("Reconciliation");
    const triad = screen.getByRole("group", { name: "Reconciliation" });
    for (const label of ["Equity", "Gross notional", "Positions", "Open orders", "Fees"]) expect(within(triad).getAllByText(label)).toHaveLength(3);
    const internal = triad.querySelector('[data-col="internal"]')!;
    const difference = triad.querySelector('[data-col="difference"]')!;
    const positionsRow = (col: Element) => Array.from(col.querySelectorAll(".exec-blk-triad-row")).find((r) => r.querySelector("dt")!.textContent === "Positions")!;
    expect(positionsRow(internal).querySelector("dd")!.textContent).toBe("2");
    expect(positionsRow(difference).querySelector("dd")!.textContent).toBe("0");
    const openOrders = (col: Element) => Array.from(col.querySelectorAll(".exec-blk-triad-row")).find((r) => r.querySelector("dt")!.textContent === "Open orders")!;
    expect(openOrders(difference).querySelector("dd")!.textContent).toBe("1");
    const equity = Array.from(triad.querySelector('[data-col="broker"]')!.querySelectorAll(".exec-blk-triad-row")).find((r) => r.querySelector("dt")!.textContent === "Equity")!;
    expect(whyText(equity.querySelector("[data-gap]")!)).toContain("BROKER_EQUITY_FIELD_NOT_PUBLISHED");
    expect(screen.getByRole("tabpanel").textContent).toContain("1 open finding");
    // "The findings relation, not a reconciliation run" is the line's title, not a second sentence.
    expect(screen.getByRole("tabpanel").textContent).not.toContain("not a reconciliation run");
    expect(screen.getByRole("tabpanel").querySelector("p.exec-cny-foot[title]")!.getAttribute("title")).toBe("The findings relation, not a reconciliation run.");
  });
});

describe("series and identity", () => {
  it("the published series is drawn as published (exact points, its methodology); Paper and Backtest stay Not published: evidence, baseline and run linkage", async () => {
    mount(published());
    await ready();
    const panel = screen.getByRole("heading", { name: "Live vs Paper vs Backtest" }).closest("section")!;
    expect(panel.querySelector("svg")).not.toBeNull();
    expect(within(panel).getByRole("button", { name: "Expand Deployment series" })).toBeTruthy();
    expect(within(panel).getByRole("button", { name: "Table, Deployment series" })).toBeTruthy();
    // The methodology is the chart block's title, not a printed caption; Paper and Backtest are one `Not available` line.
    expect(panel.querySelector("div[title]")!.getAttribute("title")).toBe("Methodology portal.net-pnl.TEST_ONLY.v1");
    expect(panel.textContent).not.toContain("Methodology");
    expect(panel.querySelector(".exec-blk-gaps")!.textContent).toBe("Not available: Paper and Backtest series");
    expect(whyText(panel.querySelector(".exec-blk-gaps")!)).toContain("Not published: evidence, baseline and run linkage");
  });

  it("the Alpha is linked only because alpha_id is published, the portfolio shows its name, the alpha name is Not published: alpha and portfolio names on a deployment with its reason", async () => {
    mount(published());
    await ready();
    const crumb = within(screen.getByRole("navigation", { name: "Breadcrumb" }));
    expect(crumb.getByRole("link", { name: "alpha_TEST_ONLY" }).getAttribute("href")).toBe("/deployments/alphas/alpha_TEST_ONLY");
    expect(crumb.getByRole("link", { name: "Crypto Core" }).getAttribute("href")).toBe("/deployments/portfolios/pf_crypto");
    const sub = document.querySelector(".exec-stage-sub")!;
    expect(sub.textContent).toContain("Alpha alpha_TEST_ONLY");
    expect(whyText(sub.querySelector(".exec-blk-why"))).toContain("ALPHA_NAME_NOT_PUBLISHED");
  });

  it("no alpha_id, no Alpha link: a body that cannot name the alpha links nothing and the portfolio keeps its id", async () => {
    const body = published();
    body.deployment.alpha_id = null;
    body.deployment.alpha_reason_code = "ALPHA_MEMBERSHIP_NOT_QUALIFIED";
    body.deployment.portfolio_name = null;
    body.deployment.portfolio_name_reason_code = "PORTFOLIO_NAME_NOT_AUTHORIZED";
    mount(body);
    await ready();
    const crumb = within(screen.getByRole("navigation", { name: "Breadcrumb" }));
    expect(crumb.queryByText("alpha_TEST_ONLY")).toBeNull();
    expect(document.querySelector('a[href^="/deployments/alphas/"]')).toBeNull();
    expect(crumb.getByRole("link", { name: "pf_crypto" })).toBeTruthy();
  });
});

describe("closed: a planted key, a number for a decimal, a short list or a word outside an enum refuses ONLY that member", () => {
  const refused: [string, (b: Draft) => void, (v: CanaryView) => void][] = [
    ["stage_facts: an extra key", (b) => (b.stage_facts.surprise = 1), (v) => expect([v.runtime, v.reconciliation]).toEqual([null, null])],
    ["stage_facts: a runtime word outside the vocabulary", (b) => (b.stage_facts.runtime.runtime_state.value = "UP"), (v) => expect(v.runtime).toBeNull()],
    ["stage_facts: an AVAILABLE fact with a null value", (b) => (b.stage_facts.runtime.since.value = null), (v) => expect(v.runtime).toBeNull()],
    ["envelope rows: used_ratio as a JSON number", (b) => (b.envelope_compliance.rows[0].used_ratio.value = 0.25), (v) => expect(v.envelope?.limits.every((l) => l.row === null && l.usedRatio === undefined)).toBe(true)],
    ["envelope rows: three rows", (b) => b.envelope_compliance.rows.pop(), (v) => expect(v.envelope?.limits.every((l) => l.row === null)).toBe(true)],
    ["envelope rows: an extra key on a row", (b) => (b.envelope_compliance.rows[1].leverage = "1"), (v) => expect(v.envelope?.limits.every((l) => l.row === null)).toBe(true)],
    ["verdict: UNDETERMINED naming no cap", (b) => (b.envelope_compliance.verdict.undetermined_caps = []), (v) => expect(v.verdict).toBeNull()],
    ["rollback items: reordered", (b) => b.rollback_readiness.items.reverse(), (v) => expect(v.rollbackChecks).toBeNull()],
    ["trial: 91 days", (b) => (b.lifecycle.trial.duration_days = 91), (v) => expect(v.trial).toBeNull()],
    ["typed positions: a leverage value", (b) => (b.positions.typed.rows[0].leverage = "3"), (v) => expect(v.positions.rows).toBeNull()],
    ["typed orders: a quantity as a number", (b) => (b.blotter.typed.rows[0].quantity = 0.1), (v) => expect(v.orders.rows).toBeNull()],
    ["figures: a sixth figure", (b) => b.source_figures.figures.push(b.source_figures.figures[0]), (v) => expect(v.figures).toBeNull()],
    ["series: a point as a number", (b) => (b.series.points[0].value = 0), (v) => expect(v.seriesPoints).toBeNull()],
    ["identity: alpha_name without a null reason", (b) => (b.deployment.alpha_name = "Doge"), (v) => expect(v.identity).toBeNull()],
    ["identity: one of the five keys missing", (b) => delete b.deployment.portfolio_name_reason_code, (v) => expect(v.identity).toBeNull()],
  ];
  it.each(refused)("%s", (_name, mutate, expectRefused) => {
    const body = published();
    mutate(body);
    const view = viewOf(body);
    expectRefused(view);
    // everything the mutation did not touch still reads: the deployment id, the caps, the broker panel
    expect(view.deploymentId).toBe(body.deployment.deployment_id);
    expect(view.envelope?.limits.map((l) => (l.value?.kind === "value" ? l.value.decimal.full : null))).toEqual(["5000", "10000", "250", "20", "14"]);
  });

  it("a refused member never becomes a value: the chips and the gauge say Not published, never a number", () => {
    const body = published();
    body.stage_facts.surprise = 1;
    body.envelope_compliance.rows[0].used_ratio.value = 0.25;
    const view = viewOf(body);
    expect(chipsOf(view).runtime).toEqual({ state: "not-published", id: "FE-067" });
    expect(limitRows(view)[0]!.usedRatio).toBeUndefined();
  });

  it("the sealed following-parent v2 body carries none of the members: all of them read as typed absence", () => {
    const view = viewOf(loadCanonical<Draft>("execution-positive-parent.synthetic").canary);
    expect([view.runtime, view.reconciliation, view.identity, view.verdict, view.rollbackChecks, view.trial, view.figures, view.seriesPoints]).toEqual([null, null, null, null, null, null, null, null]);
  });
});

describe("BE-P12: the opt-in identity of the following-parent v2 body (include=identity)", () => {
  const parentFile = () => loadCanonical<Draft>("execution-positive-parent.synthetic");

  it("the view carries the closed identity the parent reader read; a body that did not carry it is the typed absence", () => {
    expect(viewOf(parentFile().canary_identity).identity).toMatchObject({ alphaId: "alpha_TEST_ONLY_identity", portfolioName: "TEST_ONLY portfolio name", alphaReasonCode: "ALPHA_NAME_NOT_PUBLISHED" });
    expect(viewOf(parentFile().canary_identity_hidden).identity).toMatchObject({ alphaId: null, portfolioName: null, alphaReasonCode: "ALPHA_IDENTITY_NOT_AUTHORIZED", portfolioNameReasonCode: "PORTFOLIO_NAME_NOT_AUTHORIZED" });
    expect(viewOf(parentFile().canary).identity).toBeNull();
  });

  it("published: the Alpha is linked by its id and the portfolio shows its name; without the member neither does", async () => {
    mount(parentFile().canary_identity);
    await ready();
    const crumb = within(screen.getByRole("navigation", { name: "Breadcrumb" }));
    expect(crumb.getByRole("link", { name: "alpha_TEST_ONLY_identity" }).getAttribute("href")).toBe("/deployments/alphas/alpha_TEST_ONLY_identity");
    expect(crumb.getByRole("link", { name: "TEST_ONLY portfolio name" }).getAttribute("href")).toBe("/deployments/portfolios/pf_TEST_ONLY_parent");
    cleanup();
    mount(parentFile().canary);
    await ready();
    const bare = within(screen.getByRole("navigation", { name: "Breadcrumb" }));
    expect(bare.queryByRole("link", { name: "alpha_TEST_ONLY_identity" })).toBeNull();
    expect(bare.getByRole("link", { name: "pf_TEST_ONLY_parent" })).toBeTruthy();
  });

  it("hidden: no Alpha link, the portfolio id stands in, and the reason codes are in the disclosure only", async () => {
    mount(parentFile().canary_identity_hidden);
    await ready();
    expect(document.querySelector('a[href^="/deployments/alphas/"]:not([href="/deployments/alphas"])')).toBeNull();
    expect(within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByRole("link", { name: "pf_TEST_ONLY_parent" })).toBeTruthy();
    // the visible subtitle names no code and no FE id; the reason is behind the disclosure, reachable by click and Enter
    const sub = document.querySelector(".exec-stage-sub")!;
    expect(sub.textContent).not.toMatch(/ALPHA_IDENTITY_NOT_AUTHORIZED|PORTFOLIO_NAME_NOT_AUTHORIZED|FE-\d/);
    expect(screen.queryByText(/ALPHA_IDENTITY_NOT_AUTHORIZED|PORTFOLIO_NAME_NOT_AUTHORIZED/)).toBeNull();
    const why = whyButton(sub);
    expect(why.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(why);
    expect(why.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById(why.getAttribute("aria-controls")!)!.textContent).toContain("ALPHA_IDENTITY_NOT_AUTHORIZED");
    fireEvent.click(why);
    expect(why.getAttribute("aria-expanded")).toBe("false");
    expect(whyText(sub)).toContain("ALPHA_IDENTITY_NOT_AUTHORIZED");
  });
});
