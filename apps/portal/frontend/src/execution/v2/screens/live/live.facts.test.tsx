/**
 * Live against the BE-P2 / BE-P3 members, published (lane FIXTURE_LAB: values are the canonical SYNTHETIC fixtures merged into the
 * view-model populated body; a synthetic fixture is never source acceptance). Stage facts, typed rows, source figures, the series,
 * the gap window and identity; the broker strip also covers the new figures and typed rows; the live-source v2 body carries none
 * of it (typed absence); the readers stay closed.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { loadCanonical } from "../../testkit/loadCanonical";
import type { Draft } from "../../testkit/matrix";
import { validateAgainst } from "../../testkit/schema";
import LiveScreen from "./index";
import { liveModelV1, liveModelV2, type LiveModel } from "./model";
import { DEPLOYMENT_ID, SOURCE_AS_OF, fakeApi, ok, populatedV1, v1Of, v1Read, v2Of, v2Populated } from "./live.testbase";
import { whyText } from "../../gapWhyTestUtil";

afterEach(cleanup);

const rows = (): Draft => loadCanonical<Draft>("execution-stage-rows.synthetic").value;

function lit(envelope: Draft): void {
  envelope.panel_state = "ready";
  envelope.freshness_state = "FRESH";
  envelope.source_verification_state = "VERIFIED";
  envelope.as_of = SOURCE_AS_OF;
  envelope.warnings = [];
  envelope.data = { page: "first" };
}

/** The view-model populated body plus the synthetic BE-P2/P3 members. */
function published(over: Parameters<typeof populatedV1>[0] = {}): Draft {
  const body = populatedV1(over);
  const r = rows();
  body.stage_facts = loadCanonical<Draft>("execution-stage-facts.source-backed.synthetic").value;
  body.source_figures = r.source_figures;
  body.series = { ...body.series, ...r.series };
  lit(body.series.envelope);
  body.positions = { ...body.positions, typed: r.typed_positions, exact_total: 2, returned_count: 0 };
  body.orders = { ...body.orders, typed: r.typed_orders, exact_total: 1, returned_count: 0 };
  lit(body.positions.envelope);
  lit(body.orders.envelope);
  body.projection_continuity.gap_ranges = r.gap_ranges;
  Object.assign(body.deployment, {
    alpha_id: "alpha_TEST_ONLY",
    alpha_name: null,
    portfolio_name: "Crypto Core",
    alpha_reason_code: "ALPHA_NAME_NOT_PUBLISHED",
    portfolio_name_reason_code: null,
  });
  return body;
}

const model = (raw: Draft): LiveModel => liveModelV1(v1Of(raw));

function mount(raw: Draft) {
  render(
    <MemoryRouter initialEntries={[`/deployments/live/${DEPLOYMENT_ID}`]}>
      <LiveScreen api={fakeApi(() => ok(v1Read(raw))).api} deploymentId={DEPLOYMENT_ID} />
    </MemoryRouter>,
  );
}
const loaded = () => screen.findByRole("heading", { level: 1, name: "Live operations" });
const chip = (id: string) => (document.querySelector(`[data-chip="${id}"]`)?.textContent ?? "").replace(/\s+/g, " ").trim();

describe("the merged body's members validate against the published schemas", () => {
  it("members", () => {
    const body = published();
    expect(validateAgainst("execution-stage-facts.v1", "/$defs/StageFacts", body.stage_facts)).toEqual([]);
    expect(validateAgainst("execution-stage-facts.v1", "/$defs/StageSourceFigures", body.source_figures)).toEqual([]);
    expect(validateAgainst("execution-stage-facts.v1", "/$defs/StageTypedPositions", body.positions.typed)).toEqual([]);
    expect(validateAgainst("execution-stage-facts.v1", "/$defs/StageFactGapRanges", body.projection_continuity.gap_ranges)).toEqual([]);
  });
});

describe("chips", () => {
  it("Runtime is a closed word; `active` on the legacy member stays neutral Active and never becomes Running", () => {
    expect(model(published()).chips.runtime).toEqual({ state: "flag", kind: "ok", label: "Running", note: "since 12 Oct 08:00Z" });
    const legacy = published({ runtimeState: "ACTIVE" });
    delete legacy.stage_facts;
    expect(model(legacy).chips.runtime).toMatchObject({ kind: "neutral", label: "Active" });
    const word = published();
    word.stage_facts.runtime.runtime_state.value = "active";
    // a word outside the closed vocabulary refuses the whole member: the chip is Not published, never Running and never "Active"
    expect(model(word).chips.runtime).toEqual({ state: "not-published", id: "FE-067", detail: "Runtime state" });
  });

  it("Reconciliation: the findings relation; a broker MISMATCH is the louder statement and stays", () => {
    expect(model(published()).chips.reconciliation).toMatchObject({ kind: "attention", label: "1 open finding", note: "1 unknown order · as of 12 Oct 08:00Z" });
    expect(model(published({ state: "MISMATCH", visible: false })).chips.reconciliation).toMatchObject({ label: "Mismatch" });
    const none = published();
    none.stage_facts.reconciliation.verdict.value = "NO_OPEN_FINDINGS";
    none.stage_facts.reconciliation.open_finding_count.value = 0;
    none.stage_facts.reconciliation.unknown_order_count.value = 0;
    const chip = model(none).chips.reconciliation;
    expect(chip).toMatchObject({ kind: "ok", label: "No open findings" });
    expect(JSON.stringify(chip)).not.toMatch(/Clean|Reconciled|Matched/);
  });
});

describe("Exposure & orders", () => {
  it("typed positions and orders are drawn when AVAILABLE; leverage and ack latency stay Not published with the server's reason", async () => {
    mount(published());
    await loaded();
    const positions = screen.getByRole("table", { name: "Positions" });
    const first = Array.from(positions.querySelectorAll("tbody tr"))[0]!;
    expect(Array.from(first.querySelectorAll("td")).slice(0, 6).map((td) => td.textContent)).toEqual(["BTCUSDT", expect.stringContaining("Long"), "0.5", "60,000.00", "60,500.50", "250.25"]);
    // Leverage and Ack latency: no row fills them, so no column of empty cells; each is said once under its table, the reason in the title.
    expect(first.querySelector('td[data-l="Leverage"]')).toBeNull();
    expect(screen.getByRole("region", { name: "Positions" }).querySelector(".exec-blk-gaps")!.textContent).toBe("Not available: Leverage");
    expect(whyText(screen.getByRole("region", { name: "Positions" }).querySelector(".exec-blk-gaps")!)).toContain("POSITION_LEVERAGE_NOT_IN_SOURCE_RELATION");
    expect(screen.getByRole("region", { name: "Positions" }).textContent).toContain("2 of 2");
    const orders = screen.getByRole("table", { name: "Orders" });
    const order = Array.from(orders.querySelectorAll("tbody tr"))[0]!;
    expect(order.querySelector('td[data-l="Status"]')!.textContent).toBe("Accepted");
    expect(order.querySelector('td[data-l="Ack latency"]')).toBeNull();
    expect(whyText(screen.getByRole("region", { name: "Orders" }).querySelector(".exec-blk-gaps")!)).toContain("ORDER_ACK_LATENCY_NOT_IN_SOURCE_RELATION");
  });

  it("the Triad rows are the server's figures; Difference is the server's, positions 2 / 2 / 0", async () => {
    mount(published());
    await loaded();
    const triad = screen.getByRole("group", { name: "Reconciliation" });
    const row = (col: string, label: string) =>
      Array.from(triad.querySelector(`[data-col="${col}"]`)!.querySelectorAll(".exec-blk-triad-row")).find((r) => r.querySelector("dt")!.textContent === label)!;
    expect(row("internal", "Positions").querySelector("dd")!.textContent).toBe("2");
    expect(row("broker", "Positions").querySelector("dd")!.textContent).toBe("2");
    expect(row("difference", "Positions").querySelector("dd")!.textContent).toBe("0");
    expect(row("difference", "Open orders").querySelector("dd")!.textContent).toBe("1");
  });

  it("the broker strip covers the new members: while broker values are not visible no broker figure, no broker-authored typed row reaches the model", () => {
    const body = published({ visible: false, state: "UNAVAILABLE" });
    // a broker-authored positions collection with typed rows: the strip empties both the rows and the typed block
    body.positions.envelope.source_authority = "BROKER";
    // the broker figure of positions is "2": it must not be reachable
    const m = model(body);
    expect(m.v1Rows!.positions).toMatchObject({ kind: "withheld" });
    const live = v1Of(body);
    expect(live.typedPositions).toBeNull();
    expect(live.withheldFigures).toBe(true);
    expect(live.sourceFigures!.every((f) => f.broker === null && f.difference === null)).toBe(true);
    expect(JSON.stringify(m)).not.toContain("BROKER_EQUITY_FIELD_NOT_PUBLISHED");
    // the internal side survives
    expect(live.sourceFigures![2]!.internal).toEqual({ availability: "AVAILABLE", value: "2" });
  });
});

describe("series, gap window, identity", () => {
  it("the published series replaces the unavailable slot; a gap or mismatch still replaces the chart", async () => {
    expect(model(published()).chart).toMatchObject({ kind: "series", unit: "USDT", methodologyRef: "portal.net-pnl.TEST_ONLY.v1" });
    mount(published());
    await loaded();
    const panel = screen.getByRole("heading", { name: "Deployment series" }).closest("section")!;
    expect(panel.querySelector("svg")).not.toBeNull();
    // The shared Table and Expand affordance wraps the chart (RV-06 follow-up): same points, no new metric.
    expect(within(panel).getByRole("button", { name: "Expand Deployment series" })).toBeTruthy();
    expect(within(panel).getByRole("button", { name: "Table, Deployment series" })).toBeTruthy();
    cleanup();
    const gap = model(published({ gap: true }));
    expect(gap.chart.kind).toBe("gap");
    expect(model(published({ state: "MISMATCH", visible: false })).chart.kind).toBe("mismatch");
  });

  it("the gap window is the server's ranges, or Not published: typed stage rows, series and reconciliation figures with its reason", () => {
    const gap = model(published({ gap: true }));
    expect(gap.chart).toMatchObject({ kind: "gap", window: { t: "list", items: ["12 Oct 11:52Z to 12 Oct 12:04Z"] } });
    expect(gap.continuity.rows.find((r) => r.key === "window")!.value).toMatchObject({ t: "list" });
    // `populatedV1` rebuilds continuity; the published gap_ranges ride on top of it in `published()`. NOT_PUBLISHED keeps its reason.
    const dark = published({ gap: true });
    dark.projection_continuity.gap_ranges = { availability: "NOT_PUBLISHED", value: null, reason_code: "PROJECTION_GAP_WINDOW_NOT_RECORDED" };
    expect(model(dark).chart).toMatchObject({ kind: "gap", window: { t: "np", fe: "FE-072", reason: "PROJECTION_GAP_WINDOW_NOT_RECORDED" } });
  });

  it("the Alpha is linked only because alpha_id is published; the alpha name is Not published: alpha and portfolio names on a deployment with its reason", async () => {
    mount(published());
    await loaded();
    const crumb = within(screen.getByRole("navigation", { name: "Breadcrumb" }));
    expect(crumb.getByRole("link", { name: "alpha_TEST_ONLY" }).getAttribute("href")).toBe("/deployments/alphas/alpha_TEST_ONLY");
    expect(crumb.getByRole("link", { name: "Crypto Core" }).getAttribute("href")).toBe("/deployments/portfolios/pf_crypto");
    expect(whyText(document.querySelector(".exec-stage-sub .exec-blk-why"))).toContain("ALPHA_NAME_NOT_PUBLISHED");
    expect(chip("runtime")).toContain("Running");
    cleanup();
    const none = published();
    none.deployment.alpha_id = null;
    none.deployment.alpha_reason_code = "ALPHA_MEMBERSHIP_NOT_QUALIFIED";
    mount(none);
    await loaded();
    expect(document.querySelector('a[href^="/deployments/alphas/"]:not([href="/deployments/alphas"])')).toBeNull();
  });
});

describe("closed, and the live-source v2 body", () => {
  it.each([
    ["stage_facts: an extra key", (b: Draft) => (b.stage_facts.extra = 1), (m: LiveModel) => expect(m.chips.runtime).toEqual({ state: "not-published", id: "FE-067", detail: "Runtime state" })],
    ["figures: a number", (b: Draft) => (b.source_figures.figures[0].internal.value = 1), (m: LiveModel) => expect(m.triad!.rowsPublished).toBe(false)],
    ["typed rows: a side outside long|short", (b: Draft) => (b.positions.typed.rows[0].side = "LONG"), (m: LiveModel) => expect(m.v1Rows!.positions.kind).not.toBe("typed-positions")],
    ["series: an exponent point", (b: Draft) => (b.series.points[0].value = "1e3"), (m: LiveModel) => expect(m.chart.kind).toBe("unavailable")],
  ])("%s refuses only that member", (_name, mutate, check) => {
    const body = published();
    mutate(body);
    check(model(body));
    expect(model(body).kpis).toHaveLength(5);
  });

  it("gap_ranges: a malformed range refuses only the window: the gap is still a gap, the window is Not published: typed stage rows, series and reconciliation figures with no reason", () => {
    const body = published({ gap: true });
    body.projection_continuity.gap_ranges = { availability: "AVAILABLE", value: [{ from: "noon", to: "12:04" }], reason_code: null };
    const m = model(body);
    expect(m.chart).toMatchObject({ kind: "gap", window: { t: "np", fe: "FE-072", what: "Gap window" } });
    expect(m.spineBlocked).toBe(true);
  });

  it("the live-source v2 body carries none of the members: runtime, identity and the gap window are typed absence", () => {
    const m = liveModelV2(v2Of(v2Populated()));
    expect(m.identity.published).toBe(false);
    expect(m.chips.runtime).toMatchObject({ state: "not-published", id: "FE-067" });
    expect(m.triad).toBeNull();
  });
});
