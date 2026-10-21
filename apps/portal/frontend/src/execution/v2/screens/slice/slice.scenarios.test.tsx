/**
 * The slice screen over the RV-12 canonical scenarios (BE-P14, TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT): each page goes through the
 * strict reader, then the fixture lane, then the screen; the assertions are on the rendered DOM. FIXTURE ONLY.
 */
import { whyText } from "../../gapWhyTestUtil";
import { act, cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { loadCanonical } from "../../testkit/loadCanonical";
import { createFakeClock, flush } from "../../realtime/fakes.testbase";
import { createFixtureLane } from "./canonicalLane";
import { SliceScreen } from "./index";
import { bindingRows, dispositionChips, fleetRows, portfolioDatasetRows, portfolioRows, scopeLines, showingLabel } from "./model";
import { readManagerScoped, type ScopedRead } from "./scopedRead";

afterEach(cleanup);

interface Scenario { id: string; pages: { response: unknown }[] }
const scenarios = loadCanonical<{ scenarios: Scenario[] }>("execution-manager-scoped.scenarios.synthetic").scenarios;
const bounded = loadCanonical<{ scenarios: Scenario[] }>("execution-manager-scoped.bounded.synthetic").scenarios;

const readOf = (id: string, index = 0, from: Scenario[] = scenarios): ScopedRead => {
  const raw = from.find((s) => s.id === id)!.pages[index]!.response;
  const read = readManagerScoped(structuredClone(raw));
  if (read === null || read.kind !== "scoped") throw new Error(`${id} does not read`);
  return read.read;
};

async function mount(read: ScopedRead) {
  const lane = createFixtureLane({ workspaceId: null, environment: null }, undefined, () => read);
  const view = render(
    <MemoryRouter initialEntries={["/execution/slice"]}>
      <SliceScreen context={{ workspaceId: null, environment: null }} clock={createFakeClock()} lane={lane} />
    </MemoryRouter>,
  );
  await act(async () => {
    await flush(12);
  });
  return view;
}

const full = (root: ParentNode, value: string) => root.querySelectorAll(`[data-full="${value}"]`).length;
const rowOf = (root: ParentNode, id: string): HTMLElement => {
  const cell = [...root.querySelectorAll("td")].find((td) => td.textContent === id);
  if (cell === undefined) throw new Error(`no row ${id}`);
  return cell.closest("tr") as HTMLElement;
};

describe("leakage canary: the researcher page contains no peer byte", () => {
  const PEER = ["alpha_TEST_ONLY_A3", "portfolio_TEST_ONLY_P3", "deployment_TEST_ONLY_D3", "version_TEST_ONLY_A3", "Cirrus", "20000.000000000000000001", "binding_TEST_ONLY_B2"];

  it("the view model never holds a peer byte", () => {
    const read = readOf("fleet-researcher-paper");
    const model = JSON.stringify({ rows: fleetRows(read), portfolios: portfolioRows(read), lines: scopeLines(read), chips: dispositionChips(read), read });
    for (const peer of PEER) expect(model, peer).not.toContain(peer);
  });

  it("the rendered DOM (text, attributes, titles, links) never holds one", async () => {
    const { container } = await mount(readOf("fleet-researcher-paper"));
    const html = container.innerHTML;
    for (const peer of PEER) expect(html, peer).not.toContain(peer);
    expect(html).toContain("alpha_TEST_ONLY_A2");
    expect(container.textContent).toContain("Scoped view: authorized rows only");
    expect(container.innerHTML).toContain("Totals cover the rows you can see");
    // The page states what it covers; there is no NAV, no peer count and no "all" claim.
    expect(container.textContent).not.toMatch(/\bNAV\b|\bpeers?\b/i);
    expect(container.textContent).toContain("2 on this page, 2 visible to you, limit 50");
  });
});

describe("per-environment disposition chips (typed reason, short)", () => {
  const chipsOf = (container: HTMLElement) =>
    [...container.querySelectorAll('[aria-label="Environment dispositions"] li')].map((li) => [li.getAttribute("data-state"), li.textContent?.replace(/\s+/g, " ").trim() ?? ""] as const);
  /** The environment word, the state word the chip prints, the short reason. The flag adds its own glyph and kind word between them. */
  const shape = (text: string) => {
    const m = /^(Paper|Sandbox|Real-funded) \S*?(?:[A-Za-z ]+: )?(Partial|Denied|Unavailable) (.+)$/.exec(text);
    return m === null ? text : `${m[1]} ${m[2]} ${m[3]}`;
  };

  it("pending + unrecorded: sandbox is Denied (policy pending), live is Unavailable (not recorded); neither reads as zero rows", async () => {
    const { container } = await mount(readOf("fleet-researcher-all-pending-unrecorded"));
    expect(chipsOf(container).map(([state, text]) => [state, shape(text)])).toEqual([
      ["PARTIAL", "Paper Partial Retained facts"],
      ["DENIED", "Sandbox Denied Policy pending"],
      ["UNAVAILABLE", "Real-funded Unavailable Not recorded"],
    ]);
    expect(whyText(container.querySelector('[data-state="DENIED"] .exec-slice-muted'))).toBe("EXECUTION_READ_POLICY_PENDING");
    expect(container.textContent).toContain("Showing 1 of 2");
    expect(container.textContent).toContain("More pages exist.");
  });

  it("denied + unavailable are different words for different typed states", async () => {
    const { container } = await mount(readOf("fleet-researcher-all-denied-unavailable"));
    expect(chipsOf(container).map(([state, text]) => [state, shape(text)])).toEqual([
      ["PARTIAL", "Paper Partial Retained facts"],
      ["UNAVAILABLE", "Sandbox Unavailable Authority unavailable"],
      ["DENIED", "Real-funded Denied Not granted"],
    ]);
    expect(container.textContent).not.toMatch(/DISCONNECTED|REVOKED|Disconnected|Revoked/);
    expect(container.textContent).not.toContain("Showing");
  });

  it("an unknown reason is shown as its published code, never guessed", () => {
    const read = readOf("fleet-researcher-paper");
    const chips = dispositionChips({ ...read, dispositions: [{ environment: "live", state: "DENIED", reasonCode: "SOMETHING_NEW" }, { environment: "paper", state: "DENIED", reasonCode: null }] });
    expect(chips.map((c) => [c.stateWord, c.reasonWord])).toEqual([["Denied", "SOMETHING_NEW"], ["Denied", null]]);
  });
});

describe("the 100 of 101 label is honest", () => {
  it("says Showing 100 of 101, the server's own counts, with more pages; and nothing when the page is whole", async () => {
    const read = readOf("portfolios-grid-bounded", 0, bounded);
    expect(showingLabel(read)).toBe("Showing 100 of 101");
    const { container } = await mount(read);
    expect(container.querySelector('[data-testid="page-showing"]')?.textContent).toBe("Showing 100 of 101");
    expect(container.textContent).toContain("100 on this page, 101 visible to you, limit 100. More pages exist.");
    expect(container.querySelectorAll("tbody tr")).toHaveLength(100);
    expect(showingLabel(readOf("fleet-researcher-paper"))).toBeNull();
  });

  it("the 200-total item shows all 200 currencies, each with its figure or its absence, no ellipsis", async () => {
    const { container } = await mount(readOf("portfolios-grid-bounded", 0, bounded));
    const row = rowOf(container, "portfolio_TEST_ONLY_G000");
    expect(row.querySelectorAll(".exec-blk-unit")).toHaveLength(200);
    expect(row.textContent).not.toMatch(/…|\.\.\./);
  });
});

describe("balances: the shared physical account is shown on the binding only", () => {
  const XS_TOTAL = "20000.000000000000000001";

  it("BINDINGS: B2 states the shared account once; B1 states its own", async () => {
    const { container } = await mount(readOf("bindings-owner-live"));
    expect(full(container, XS_TOTAL)).toBe(1);
    expect(rowOf(container, "binding_TEST_ONLY_B2").querySelector(`[data-full="${XS_TOTAL}"]`)).not.toBeNull();
    expect(full(container, "90000.75")).toBe(1);
    expect(rowOf(container, "binding_TEST_ONLY_B1").querySelector('[data-full="90000.75"]')).not.toBeNull();
    // The two bindings of one environment are two rows (the SS-4 defect), and the shared account is one account on B2.
    expect(container.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(bindingRows(readOf("bindings-owner-live")).map((r) => [r.bindingId, r.accounts, r.instances])).toEqual([
      ["binding_TEST_ONLY_B1", 1, 1], ["binding_TEST_ONLY_B2", 1, 2],
    ]);
  });

  it("null, \"0\" and an unstated currency are three renderings", async () => {
    const { container } = await mount(readOf("bindings-owner-live"));
    const b2 = rowOf(container, "binding_TEST_ONLY_B2");
    const allocation = [...b2.querySelectorAll("td")].find((td) => td.getAttribute("data-l") === "Allocation")!;
    // EUR allocation is an explicit null: an absence with the row's reason. USD allocation is a published "0": a value.
    expect(allocation.querySelectorAll('[data-full="0"]')).toHaveLength(1);
    expect(allocation.querySelector(".exec-blk-na")?.textContent).toContain("Not available");
    expect(allocation.textContent).toContain("EUR");
    // B1 states EUR too; a currency a total does not state has no cell at all (B2 states no GBP, nobody invents one).
    expect(allocation.textContent).not.toContain("GBP");
  });

  it("PORTFOLIOS and ALPHA_FLEET rows carry no balance anywhere: nothing is summed or attributed to a portfolio or an alpha", async () => {
    for (const [id, index] of [["portfolios-owner-all", 0], ["fleet-owner-paper-chain", 0], ["fleet-researcher-paper", 0]] as const) {
      const read = readOf(id, index);
      const { container, unmount } = await mount(read);
      // The shared account's total and the single-owner balances are not on any of these rows.
      for (const balance of [XS_TOTAL, "90000.75", "5000.00", "19000", "80000.75"]) expect(full(container, balance), `${id} ${balance}`).toBe(0);
      expect(container.textContent).not.toMatch(/Balance|Free|Locked/);
      unmount();
    }
    for (const row of portfolioDatasetRows(readOf("portfolios-owner-all"))) expect(Object.keys(row)).not.toContain("balances");
    for (const row of fleetRows(readOf("fleet-owner-paper-chain"))) expect(Object.keys(row)).not.toContain("balances");
  });

  it("PORTFOLIOS: one portfolio in three environments is three rows with their own money, multi-currency per currency", async () => {
    const { container } = await mount(readOf("portfolios-owner-all"));
    expect(container.querySelectorAll("tbody tr")).toHaveLength(9);
    const p1 = [...container.querySelectorAll("tbody tr")].filter((tr) => tr.textContent?.includes("portfolio_TEST_ONLY_P1"));
    expect(p1).toHaveLength(3);
    // live USD 2000 and EUR 10.000000000000000001; paper USD 1000.50 and EUR 250.125: not added, not merged.
    expect(full(container, "2000")).toBe(1);
    expect(full(container, "10.000000000000000001")).toBe(1);
    expect(full(container, "1000.50")).toBe(1);
    expect(full(container, "250.125")).toBe(1);
    // P2 states USD only: no EUR cell. A published "0" is a value.
    const p2live = [...container.querySelectorAll("tbody tr")].find((tr) => tr.textContent?.includes("portfolio_TEST_ONLY_P2") && tr.textContent?.includes("Real-funded"))!;
    expect(p2live.textContent).not.toContain("EUR");
    expect(p2live.querySelector('[data-full="0"]')).not.toBeNull();
    expect(portfolioDatasetRows(readOf("portfolios-owner-all"))).toHaveLength(9);
  });

  it("BINDING_DETAIL: the one binding is one row", async () => {
    const { container } = await mount(readOf("binding-detail-owner-live"));
    expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(full(container, XS_TOTAL)).toBe(1);
  });
});
