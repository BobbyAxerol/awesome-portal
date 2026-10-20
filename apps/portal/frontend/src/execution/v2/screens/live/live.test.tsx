/**
 * Live operations through a port fake (rules 9.8.3): the screen reads only through `getLiveFullVersioned`,
 * so each test hands it the body it wants (V1, V2, unsupported, a refusal) and asserts what reaches the DOM.
 *
 * Lanes: V2 bodies are the published synthetic canonical (or its keyset derivatives); the populated V1 body is
 * FIXTURE_LAB at the view-model level (live.testbase.ts). Nothing here is real-API evidence.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { unsupportedText } from "../../readers/dispatch";
import LiveScreen, { LIVE_SCREEN_KEY } from "./index";
import {
  BROKER_FIGURE, DEPLOYMENT_ID, cursorFor, fakeApi, ok, populatedV1, refused, v1Raw, v1Read, v2Populated, v2Read, v2Unpublished, withRecords, withV1Rows, type Handler,
} from "./live.testbase";
import { whyText } from "../../gapWhyTestUtil";

afterEach(cleanup);

function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{pathname + search}</output>;
}
const where = () => screen.getByTestId("where").textContent ?? "";

const mount = (handler: Handler, search = "") => {
  const fake = fakeApi(handler);
  const view = render(
    <MemoryRouter initialEntries={[`/deployments/live/${DEPLOYMENT_ID}${search}`]}>
      <LiveScreen api={fake.api} deploymentId={DEPLOYMENT_ID} />
      <Where />
    </MemoryRouter>,
  );
  return { ...fake, ...view };
};
const loaded = () => screen.findByRole("tablist", { name: "Live sections" });
const chip = (id: string) => (document.querySelector(`[data-chip="${id}"]`)?.textContent ?? "").replace(/\s+/g, " ").trim();
const text = () => document.body.textContent ?? "";
const col = (name: string) => document.querySelector(`[data-col="${name}"]`) as HTMLElement;

/* ═════════════════════════ page ═════════════════════════ */

/** Heading levels in document order; a skip (h1 straight to h3) is a screen-reader jump the page did not mean. */
const headingJumps = (): string[] => {
  const heads = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6")).map((h) => ({ level: Number(h.tagName.slice(1)), text: h.textContent ?? "" }));
  return heads.flatMap((h, i) => (i === 0 ? (h.level === 1 ? [] : [h.text]) : h.level > heads[i - 1]!.level + 1 ? [`${heads[i - 1]!.text} -> ${h.text}`] : []));
};

describe("heading order", () => {
  it.each([["V1", () => ok(v1Read(populatedV1()))], ["V2", () => ok(v2Read(v2Populated()))]] as const)("%s: h1 is followed by h2 panels on every tab, with no skipped level", async (_v, handler) => {
    mount(handler);
    await loaded();
    const list = () => within(screen.getByRole("tablist", { name: "Live sections" }));
    const names = list().getAllByRole("tab").map((t) => t.textContent ?? "");
    expect(names.length).toBeGreaterThan(1);
    for (const name of names) {
      fireEvent.click(list().getByRole("tab", { name }));
      await waitFor(() => expect(list().getByRole("tab", { name }).getAttribute("aria-selected")).toBe("true"));
      expect(headingJumps(), name).toEqual([]);
    }
  });
});

describe("page", () => {
  it("is the live flag's screen, with one h1, the double guard frame and the words 'Real capital at risk'", async () => {
    expect(LIVE_SCREEN_KEY).toBe("live");
    mount(() => ok(v1Read(populatedV1())));
    await loaded();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Live operations" })).toBeTruthy();
    const frame = document.querySelector(".exec-stage-guard") as HTMLElement;
    expect(frame.getAttribute("data-frame")).toBe("double");
    expect(frame.getAttribute("data-stage")).toBe("live");
    expect(within(frame).getByText("Real capital at risk")).toBeTruthy();
    expect(document.querySelector('[data-screen="live-v2"]')).toBeTruthy();
  });

  it("loading: the title and a status, no chips, no figures, no spine that would say 'Not published'", async () => {
    let release: (() => void) | undefined;
    mount(() => new Promise((resolveRead) => { release = () => resolveRead(ok(v1Read(populatedV1()))); }));
    expect(screen.getByRole("heading", { level: 1, name: "Live operations" })).toBeTruthy();
    expect(screen.getByRole("status", { name: "Loading Live operations" })).toBeTruthy();
    expect(document.querySelector("[data-chip]")).toBeNull();
    expect(screen.queryByRole("group", { name: "Live figures" })).toBeNull();
    release?.();
    await loaded();
    expect(screen.queryByRole("status", { name: "Loading Live operations" })).toBeNull();
  });

  it("has a Refresh like Canary's: one press reads again once, and two presses in one tick are one read", async () => {
    const m = mount(() => ok(v1Read(populatedV1())));
    await loaded();
    expect(m.calls).toHaveLength(1);
    const button = screen.getByRole("button", { name: "Refresh" });
    fireEvent.click(button);
    await loaded();
    await waitFor(() => expect(m.calls).toHaveLength(2));
    const again = screen.getByRole("button", { name: "Refresh" });
    fireEvent.click(again);
    fireEvent.click(again);
    await loaded();
    await waitFor(() => expect(m.calls).toHaveLength(3));
  });

  it("reads the deployment once, with the workspace from the URL", async () => {
    const m = mount(() => ok(v1Read(populatedV1())), "?workspace_id=ws_TEST_ONLY_a");
    await loaded();
    expect(m.calls).toEqual([{ deploymentId: DEPLOYMENT_ID, options: { workspaceId: "ws_TEST_ONLY_a", include: ["identity", "stage_facts"] } }]);
  });
});

/* ═════════════════════════ V1 ═════════════════════════ */

describe("V1 body, matched", () => {
  it("prints the published figures exactly, the chips the body supports and Runtime as Not published (FE-067)", async () => {
    mount(() => ok(v1Read(populatedV1())));
    await loaded();
    const strip = screen.getByRole("group", { name: "Live figures" });
    expect(within(strip).getByText("60,000.00")).toBeTruthy();
    expect(within(strip).getByText("41,080.00")).toBeTruthy();
    expect(within(strip).getByText("2")).toBeTruthy();
    expect(within(strip).getByText("60,118.40")).toBeTruthy();
    expect(chip("reconciliation")).toContain("Matched");
    expect(chip("freshness")).toContain("Fresh · 17 Oct 12:04Z");
    // Runtime is not published: it is in the one `Not available` chip, FE-067 in its title.
    expect(chip("runtime")).toBe("");
    expect(chip("gaps")).toContain("Runtime");
    expect(whyText(document.querySelector('[data-chip="gaps"]')!)).toContain("Runtime: Not published (FE-067)");
    expect(chip("gaps")).not.toContain("Running");
  });

  it("the chart slot says the series is `Not available` (FE-013 in its title); no chart is drawn", async () => {
    mount(() => ok(v1Read(populatedV1())));
    await loaded();
    const panel = screen.getByRole("region", { name: "Live net PnL" });
    expect(panel.querySelector(".exec-blk-gaps")!.textContent).toBe("Not available: Live net PnL series");
    expect(whyText(panel.querySelector(".exec-blk-gaps")!)).toContain("Not published (FE-013)");
    expect(panel.textContent).not.toContain("(FE-013)");
    expect(document.querySelector("svg[role='img']")).toBeNull();
  });

  it("exposure & orders (a body WITHOUT source_figures): ONE `Not available` line for the Triad and for each of positions and orders, FE-072 in their titles", async () => {
    const raw = populatedV1();
    delete raw.source_figures;
    mount(() => ok(v1Read(raw)));
    await loaded();
    expect(screen.queryByRole("group", { name: "Reconciliation" })).toBeNull();
    const recon = screen.getByRole("region", { name: "Reconciliation" });
    expect(recon.querySelector(".exec-blk-gaps")!.textContent).toBe("Not available: Internal, Broker and Difference figures");
    expect(whyText(recon.querySelector(".exec-blk-gaps")!)).toContain("Not published (FE-072)");
    expect(recon.textContent).not.toMatch(/\b0\.00\b/);
    for (const name of ["Positions", "Orders"]) {
      const panel = screen.getByRole("region", { name });
      expect(whyText(panel.querySelector(".exec-blk-gaps")!), name).toContain("Not published (FE-072)");
      expect(panel.textContent, name).not.toContain("(FE-072)");
    }
    expect(screen.getByRole("link", { name: "Open the full blotter for this deployment" }).getAttribute("href")).toBe(`/deployments/blotter?deployment=${DEPLOYMENT_ID}`);
  });

  it("exposure & orders: the Triad rows are the server's source_figures (FE-072); every side the dark body leaves out is Not published (FE-072) with its reason in the title, and nothing is subtracted", async () => {
    mount(() => ok(v1Read(populatedV1())));
    await loaded();
    // Every cell of the published figures is the server's NOT_PUBLISHED: ONE line instead of fifteen cells, every reason in its title.
    expect(screen.queryByRole("group", { name: "Reconciliation" })).toBeNull();
    const recon = screen.getByRole("region", { name: "Reconciliation" });
    const gap = recon.querySelector(".exec-blk-gaps")!;
    expect(gap.textContent).toBe("Not available: Internal, Broker and Difference figures");
    expect(whyText(gap)).toContain("Not published (FE-072)");
    expect(whyText(gap)).toContain("DIFFERENCE_REQUIRES_BOTH_SIDES");
    expect(whyText(gap)).toContain("BROKER_EQUITY_FIELD_NOT_PUBLISHED");
    expect(recon.textContent).not.toMatch(/\b0\.00\b/);
    expect(screen.queryByText(/The Difference is the server's and is never worked out here\./)).toBeNull();
  });

  it("a V1 body that carries rows draws positions and orders under the source's own names; the typed columns stay Not published (FE-072)", async () => {
    mount(() => ok(v1Read(withV1Rows(populatedV1()))));
    await loaded();
    const table = screen.getByRole("table", { name: "Positions" });
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Instrument", "Side", "Qty", "Entry px", "Reduce only"]);
    const first = Array.from(table.querySelectorAll("tbody tr"))[0]!;
    expect(Array.from(first.querySelectorAll("td")).map((td) => td.textContent)).toEqual(["BTCUSDT", "LONG", "0.0120", "64000.10", "No"]);
    expect(screen.getByRole("region", { name: "Positions" }).textContent).toContain("2 of 2");
    // "Columns are the source's own field names" is the table's title; the typed rows are one `Not available` line.
    expect(table.closest("div[title]")!.getAttribute("title")).toBe("Columns are the source's own field names.");
    expect(screen.getByRole("region", { name: "Positions" }).textContent).not.toContain("Columns are the source's own field names");
    expect(screen.getByRole("region", { name: "Positions" }).querySelector(".exec-blk-gaps")!.textContent).toBe("Not available: Typed position rows");
    expect(whyText(screen.getByRole("region", { name: "Positions" }).querySelector(".exec-blk-gaps")!)).toContain("Not published (FE-072)");
    const orders = screen.getByRole("table", { name: "Orders" });
    expect(orders.textContent).toContain("63990.00");
    expect(orders.textContent).not.toMatch(/(^|\s)[-–—](\s|$)|N\/A/);
    expect(Array.from(table.querySelectorAll("tbody td")).every((td) => td.getAttribute("data-l"))).toBe(true);
  });

  it("broker rows never reach the DOM while broker figures are hidden: the strip is in the reader, the screen says why", async () => {
    mount(() => ok(v1Read(withV1Rows(populatedV1({ state: "MISMATCH", visible: false }), "BROKER"))));
    await loaded();
    expect(screen.queryByRole("table", { name: "Positions" })).toBeNull();
    expect(screen.queryByRole("table", { name: "Orders" })).toBeNull();
    expect(text()).not.toContain("BTCUSDT");
    expect(text()).not.toContain("64000.10");
    expect(screen.getByRole("region", { name: "Positions" }).textContent).toContain("Hidden while the figures disagree.");
  });

  it("the protective ladder is three disabled controls, each with the reason and a My access link; nothing enables one", async () => {
    mount(() => ok(v1Read(populatedV1())));
    await loaded();
    // One reason and one My access link for the three rungs that are off for the same reason.
    expect(screen.getAllByRole("link", { name: /My access/ })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "My access: Halt, Reduce, Emergency close" }).getAttribute("href")).toContain("/administration/profile-access");
    expect(text().match(/Live decisions are closed on this build/g)).toHaveLength(1);
    for (const name of ["Halt", "Reduce", "Emergency close"]) {
      const button = screen.getByRole("button", { name }) as HTMLButtonElement;
      expect(button.disabled, name).toBe(true);
      const why = document.getElementById(button.getAttribute("aria-describedby") ?? "");
      expect(why?.textContent, name).toBe("Live decisions are closed on this build");
    }
    expect(screen.getByText("Step 1 of 3")).toBeTruthy();
    expect(screen.getByText("Step 3 of 3")).toBeTruthy();
  });

  it("every disabled button on the page has a sentence it points at, on every tab", async () => {
    mount(() => ok(v1Read(populatedV1())));
    await loaded();
    for (const [index, id] of ["exposure-orders", "continuity", "predecessor-envelope", "guard-rules"].entries()) {
      fireEvent.click(screen.getAllByRole("tab")[index]!);
      const disabled = Array.from(document.querySelectorAll("button:disabled"));
      expect(disabled.length, id).toBeGreaterThanOrEqual(3);
      for (const button of disabled) {
        const target = document.getElementById(button.getAttribute("aria-describedby") ?? "");
        expect(target?.textContent?.trim().length ?? 0, `${id}: ${button.textContent}`).toBeGreaterThan(0);
      }
    }
  });

  it("what is blocking: sentences, with the published codes under one Provenance and no code in a sentence", async () => {
    mount(() => ok(v1Read(populatedV1())));
    await loaded();
    const rail = screen.getByRole("complementary", { name: "Protective actions and blockers" });
    const list = within(rail).getByRole("list", { name: "What is blocking" });
    const items = within(list).getAllByRole("listitem").map((li) => li.textContent);
    expect(items[0]).toBe("Commands are closed on this build.");
    expect(items).toContain("Canary exit evidence is not available.");
    for (const item of items) expect(item).not.toMatch(/[A-Z]{3,}_[A-Z]/);
    const details = rail.querySelector("details.exec-blocker-prov") as HTMLElement;
    expect(details.textContent).toContain("PRODUCTION_COMMAND_INACTIVE");
    expect(details.textContent).toContain("Deployment dep_TEST_ONLY_live");
  });
});

describe("V1 body, mismatch (the broker figure never reaches the DOM)", () => {
  const mismatch = () => populatedV1({ state: "MISMATCH", visible: false });

  it("replaces the chart with one sentence and Open finding; the header says Mismatch", async () => {
    mount(() => ok(v1Read(mismatch())));
    await loaded();
    const slot = screen.getByRole("alert", { name: "Live net PnL" });
    expect(slot.textContent).toContain("Internal and broker figures disagree. Chart hidden until reconciled.");
    expect(within(slot).getByRole("link", { name: "Open finding" }).getAttribute("href")).toBe("/execution/operations/inc_TEST_ONLY_1");
    expect(chip("reconciliation")).toContain("Mismatch");
    expect(screen.queryByRole("region", { name: "Live net PnL" })).toBeNull();
  });

  it("the Broker and Difference columns read 'Hidden while the figures disagree.' and draw no row, value or as-of", async () => {
    mount(() => ok(v1Read(mismatch())));
    await loaded();
    for (const name of ["broker", "difference"]) {
      const column = col(name);
      expect(column.getAttribute("data-state")).toBe("suppressed");
      expect(column.textContent).toContain("Hidden while the figures disagree.");
      expect(column.querySelector("dl")).toBeNull();
      expect(column.textContent).not.toContain("Not available");
    }
    expect(col("internal").querySelector("dl")).toBeTruthy();
  });

  it("the broker equity KPI reads Hidden, 'While figures disagree'; the exact figure is nowhere in the page", async () => {
    mount(() => ok(v1Read(mismatch())));
    await loaded();
    const strip = screen.getByRole("group", { name: "Live figures" });
    // Fail-closed: the DERIVED daily PnL is hidden with it (derived from what? the server does not say it is not the broker).
    expect(within(strip).getAllByText("Hidden")).toHaveLength(2);
    expect(within(strip).getAllByText("While figures disagree")).toHaveLength(2);
    expect(document.body.innerHTML).not.toContain(BROKER_FIGURE);
    expect(document.body.innerHTML).not.toContain("60,118.40");
    expect(text()).not.toContain("118.40");
  });

  it("blockers say the figures disagree; the spine marks Live blocked", async () => {
    mount(() => ok(v1Read(mismatch())));
    await loaded();
    const rail = screen.getByRole("complementary", { name: "Protective actions and blockers" });
    expect(within(rail).getByText("Internal and broker figures disagree.")).toBeTruthy();
    expect(document.querySelector('[data-stage="live"][data-s="blk"]')).toBeTruthy();
  });

  it("the guard-rules tab shows the mismatch rule as Active", async () => {
    mount(() => ok(v1Read(mismatch())), "?tab=guard-rules");
    await loaded();
    const row = screen.getByRole("table", { name: "Guard rules" }).querySelector("tbody tr") as HTMLElement;
    expect(row.textContent).toContain("Internal and broker figures disagree");
    expect(row.textContent).toContain("Broker values are hidden");
    expect(row.textContent).toContain("Active");
  });
});

describe("V1 body, broker not verified (UNAVAILABLE) is not a mismatch", () => {
  it("the published dark body: Runtime and Reconciliation one `Not available` chip (FE-067), Source not qualified, the five figures one `Not available` line, no number anywhere", async () => {
    mount(() => ok(v1Read(v1Raw())));
    await loaded();
    // The published stage facts speak for Runtime and Reconciliation: not published, the request and the reason in the chip's title.
    expect(chip("gaps")).toContain("Runtime, Reconciliation");
    expect(whyText(document.querySelector('[data-chip="gaps"]')!)).toContain("Runtime: Not published (FE-067)");
    expect(whyText(document.querySelector('[data-chip="gaps"]')!)).toContain("LIVE_SOURCE_UNAVAILABLE");
    expect(chip("freshness")).toContain("Not available");
    expect(screen.getByText("Source not qualified.")).toBeTruthy();
    // No tile holds a "Not available": one line names the five, FE-072 and the broker's reason in its title.
    expect(screen.queryByRole("group", { name: "Live figures" })).toBeNull();
    const gap = document.querySelector(".exec-liv-v2 > .exec-blk-gaps")!;
    expect(gap.textContent).toBe("Not available: Capital, Gross notional, Daily P&L, Open orders, Broker equity");
    expect(whyText(gap)).toContain("Capital: Not published (FE-072)");
    expect(whyText(gap)).toContain("Broker equity: Not published · Broker state not available");
    const strip = document.body;
    expect(within(strip).queryByText("Hidden")).toBeNull();
    // Not a disagreement: the Triad does not claim one.
    expect(text()).not.toContain("Hidden while the figures disagree");
    expect(screen.queryByRole("alert", { name: "Live net PnL" })).toBeNull();
    expect(within(strip).queryByText("0")).toBeNull();
    expect(within(strip).queryByText("0.00")).toBeNull();
  });
});

describe("V1 body, gap", () => {
  it("replaces the chart with one sentence and Open operation; the window is Not available (FE-072 in its title)", async () => {
    mount(() => ok(v1Read(populatedV1({ gap: true }))));
    await loaded();
    const slot = screen.getByRole("alert", { name: "Live net PnL" });
    expect(slot.textContent).toContain("Updates are missing. Chart hidden until the gap is filled.");
    expect(slot.textContent).toContain("Gap window Not available");
    expect(whyText(slot.querySelector("[data-gap]")!)).toContain("Not published (FE-072)");
    expect(within(slot).getByRole("link", { name: "Open operation" }).getAttribute("href")).toBe("/execution/operations");
    expect(screen.getByText("A gap blocks risk-increasing actions. Protective actions stay open.")).toBeTruthy();
  });

  it("the continuity tab says 'Gap in updates' and withholds the window; Affected sources are listed", async () => {
    mount(() => ok(v1Read(populatedV1({ gap: true }))), "?tab=continuity");
    await loaded();
    const table = screen.getByRole("table", { name: "Display continuity" });
    expect(table.textContent).toContain("Gap in updates");
    expect(within(table).getAllByText("Gap window")[0]!.closest("tr")!.textContent).toContain("Not available");
    expect(whyText(within(table).getAllByText("Gap window")[0]!.closest("tr")!.querySelector("[data-gap]")!)).toContain("Not published (FE-072)");
    expect(within(table).getByText("Broker")).toBeTruthy();
    expect(within(table).getByText("Derived")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Display continuity" }).querySelector("details")!.textContent).toContain("Epoch 41 · sequence 88240");
  });

  it("a gap that the server could not tell about says so; it never prints 'None'", async () => {
    mount(() => ok(v1Read(populatedV1({ gap: null }))), "?tab=continuity");
    await loaded();
    const table = screen.getByRole("table", { name: "Display continuity" });
    // The reason is the cell's title; the cell says `Not available`.
    expect(within(table).getByText("State").closest("tr")!.querySelector(".exec-blk-na")!.getAttribute("title")).toContain("could not tell");
    expect(within(table).getAllByText("Gap window")[0]!.closest("tr")!.textContent).not.toContain("None");
  });
});

describe("V1 body, freshness and coverage", () => {
  it("stale: one banner with the time, and the chip says Stale", async () => {
    mount(() => ok(v1Read(populatedV1({ freshness: "STALE" }))));
    await loaded();
    expect(screen.getByText("Stale. Data as of 17 Oct 12:04Z.")).toBeTruthy();
    expect(chip("freshness")).toContain("Stale · 17 Oct 12:04Z");
  });

  it("partial: 'Some figures are missing. 1 of 3 sources reported.' when the broker is not verified and no mismatch is declared", async () => {
    mount(() => ok(v1Read(populatedV1({ state: "UNAVAILABLE", visible: false }))));
    await loaded();
    expect(screen.getByText("Some figures are missing. 1 of 3 sources reported.")).toBeTruthy();
  });
});

describe("Canary deployment (D5)", () => {
  it("one line with a link to the Canary control room; no redirect", async () => {
    mount(() => ok(v1Read(populatedV1({ stage: "LIVE_CANARY" }))));
    await loaded();
    const note = screen.getByText(/This deployment is in Canary\./);
    const link = within(note.closest("p")!).getByRole("link", { name: "Open the Canary control room" });
    expect(link.getAttribute("href")).toBe(`/deployments/live/${DEPLOYMENT_ID}/canary`);
    expect(where()).toBe(`/deployments/live/${DEPLOYMENT_ID}`);
    expect(document.querySelector('[data-stage="canary"][data-s="cur"]')).toBeTruthy();
  });

  it("not shown for a Live deployment", async () => {
    mount(() => ok(v1Read(populatedV1({ stage: "LIVE_FULL" }))));
    await loaded();
    expect(screen.queryByText(/This deployment is in Canary\./)).toBeNull();
    expect(document.querySelector('[data-stage="live"][data-s="cur"]')).toBeTruthy();
  });

  it("the spine's Canary node goes to the Canary room; an unlinked node does nothing", async () => {
    mount(() => ok(v1Read(populatedV1())));
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: /^Paper,/ }));
    expect(where()).toBe(`/deployments/live/${DEPLOYMENT_ID}`);
    fireEvent.click(screen.getByRole("button", { name: /^Canary,/ }));
    expect(where()).toBe(`/deployments/live/${DEPLOYMENT_ID}/canary`);
  });
});

/* ═════════════════════════ tabs ═════════════════════════ */

describe("tabs", () => {
  it("four tabs, Exposure & orders by default; the default is not written to the URL", async () => {
    mount(() => ok(v1Read(populatedV1())));
    await loaded();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Exposure & orders", "Continuity", "Predecessor envelope", "Guard rules"]);
    expect(screen.getByRole("tab", { name: "Exposure & orders" }).getAttribute("aria-selected")).toBe("true");
    expect(where()).toBe(`/deployments/live/${DEPLOYMENT_ID}`);
  });

  it("a V1 label opens its tab and the URL becomes the slug", async () => {
    mount(() => ok(v1Read(populatedV1())), "?tab=Predecessor%20envelope");
    await loaded();
    await waitFor(() => expect(where()).toContain("tab=predecessor-envelope"));
    expect(screen.getByRole("tab", { name: "Predecessor envelope" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("table", { name: "Predecessor Canary envelope" })).toBeTruthy();
  });

  it("an unknown tab opens the default and says so, once", async () => {
    mount(() => ok(v1Read(populatedV1())), "?tab=bogus");
    await loaded();
    await waitFor(() => expect(where()).not.toContain("bogus"));
    expect(screen.getByRole("tab", { name: "Exposure & orders" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText(/Tab "bogus" is not available/)).toBeTruthy();
  });

  it("arrow keys move between tabs (wrapping) and Home/End jump; only the active tab is in the tab order", async () => {
    mount(() => ok(v1Read(populatedV1())));
    await loaded();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.tabIndex)).toEqual([0, -1, -1, -1]);
    tabs[0]!.focus();
    fireEvent.keyDown(tabs[0]!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(tabs[1]);
    expect(where()).toContain("tab=continuity");
    fireEvent.keyDown(tabs[1]!, { key: "End" });
    expect(document.activeElement).toBe(tabs[3]);
    fireEvent.keyDown(tabs[3]!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(tabs[0]);
  });

  it("predecessor: exact caps, 'Not active for Live', 'Applies to Live: No', and a link to the Canary room", async () => {
    mount(() => ok(v1Read(populatedV1())), "?tab=predecessor-envelope");
    await loaded();
    const panel = screen.getByRole("region", { name: "Canary envelope" });
    expect(panel.textContent).toContain("Not active for Live");
    expect(panel.textContent).toContain("Revision 1 · Draft");
    const table = within(panel).getByRole("table", { name: "Predecessor Canary envelope" });
    expect(within(table).getByText("5,000.00 USDT")).toBeTruthy();
    expect(within(table).getAllByText("No")).toHaveLength(3);
    expect(within(panel).getByRole("link", { name: "Open the Canary control room" }).getAttribute("href")).toBe(`/deployments/live/${DEPLOYMENT_ID}/canary`);
    expect(panel.textContent).not.toContain("No Live envelope is on record");
  });

  it("no predecessor published: 'Not available' and the reason, never a default", async () => {
    const raw = populatedV1();
    raw.predecessor_canary_envelope = null;
    mount(() => ok(v1Read(raw)), "?tab=predecessor-envelope");
    await loaded();
    const panel = screen.getByRole("region", { name: "Canary envelope" });
    expect(panel.querySelector(".exec-blk-na")!.textContent).toBe("Not available");
    expect(panel.querySelector(".exec-blk-na")!.getAttribute("title")).toBe("No predecessor Canary envelope was published for this deployment.");
  });

  it("guard rules: three rows from structured flags, the risk-increasing action disabled with its reason, Provenance carries the policy token", async () => {
    mount(() => ok(v1Read(populatedV1())), "?tab=guard-rules");
    await loaded();
    const rows = screen.getByRole("table", { name: "Guard rules" }).querySelectorAll("tbody tr");
    expect(rows).toHaveLength(3);
    expect(rows[0]!.textContent).toContain("Not active");
    expect(rows[2]!.textContent).toContain("Protective actions stay open");
    expect(rows[2]!.textContent).toContain("Always");
    const button = screen.getByRole("button", { name: "Risk-increasing action" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(document.getElementById(button.getAttribute("aria-describedby")!)?.textContent).toBe("Live decisions are closed on this build");
    expect(screen.getByText("BROKER_MISMATCH_SUPPRESSES_VALUES_AND_SOURCE_GAP_BLOCKS_R4")).toBeTruthy();
  });
});

/* ═════════════════════════ refusals ═════════════════════════ */

describe("states the read can end in", () => {
  it("denied: the researcher page, 'You can't open this page', with a way to see what access there is", async () => {
    mount(() => refused("denied", "403: not allowed"));
    expect(await screen.findByText("You can't open this page")).toBeTruthy();
    expect(screen.queryByText("Operators, managers and reviewers")).toBeNull();
    expect(screen.getByRole("link", { name: "See what you can access" }).getAttribute("href")).toContain("/administration/profile-access");
    expect(screen.getByRole("link", { name: "Alpha Fleet" }).getAttribute("href")).toContain("/deployments/alphas");
    expect(screen.queryByRole("group", { name: "Live figures" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Halt" })).toBeNull();
  });

  it.each([
    ["unavailable", "Unavailable", "503: the source is down"],
    ["terminal", "Failed", "500: it broke"],
    ["stale", "Stale", "429: too many reads"],
    ["empty", "Nothing to show", "404: no such deployment"],
  ] as const)("%s: the state's own word and the server's reason, no body", async (status, word, reason) => {
    mount(() => refused(status, reason));
    expect(await screen.findByText(reason)).toBeTruthy();
    expect(screen.getByText(word)).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Live figures" })).toBeNull();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("Try again reads once more", async () => {
    let n = 0;
    const m = mount(() => (n++ === 0 ? refused("unavailable", "503: down") : ok(v1Read(populatedV1()))));
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await loaded();
    expect(m.calls).toHaveLength(2);
  });

  it("unsupported: the dispatcher's own sentence, nothing from the body", async () => {
    const read = { kind: "unsupported", schemaVersion: "later.v9", reason: "UNKNOWN_SCHEMA_VERSION" } as const;
    mount(() => ok(read));
    expect(await screen.findByText(unsupportedText(read))).toBeTruthy();
    expect(screen.getByText("This response cannot be shown")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Live figures" })).toBeNull();
  });
});

/* ═════════════════════════ V2 ═════════════════════════ */

describe("V2 body (retained observations)", () => {
  it("says what it is: Runtime `Not available` (FE-067 in its title), no freshness, no verdict, one retained-observations line", async () => {
    mount(() => ok(v2Read(v2Populated())));
    await loaded();
    expect(chip("gaps")).toBe("Not availableRuntime");
    expect(whyText(document.querySelector('[data-chip="gaps"]')!)).toContain("Runtime: Not published (FE-067)");
    expect(chip("freshness")).toContain("Not available · Source clock is not scoped");
    expect(chip("reconciliation")).toContain("Not available · Source verdict not asserted");
    expect(screen.getByText("Retained observations only.")).toBeTruthy();
    // The five figures are one line (FE-072 in its title), not five tiles.
    expect(screen.queryByRole("group", { name: "Live figures" })).toBeNull();
    expect(whyText(document.querySelector(".exec-liv-v2 > .exec-blk-gaps")!).match(/Not published \(FE-072\)/g)).toHaveLength(5);
    // No per-figure rows exist in this body, so no Triad is drawn at all (a Triad of twelve "Not available" would say nothing).
    expect(screen.queryByRole("group", { name: "Reconciliation" })).toBeNull();
    expect(screen.getByRole("region", { name: "Reconciliation" })).toBeTruthy();
  });

  it("positions: exact strings in the DOM, a null is Not available, the caption never calls a page a total", async () => {
    mount(() => ok(v2Read(v2Populated())));
    await loaded();
    const table = screen.getByRole("table", { name: "Positions" });
    expect(table.querySelector('[data-full="9007199254740993.123456789123456789"]')).toBeTruthy();
    expect(table.querySelector('[data-full="0.000000000000000001"]')).toBeTruthy();
    const row = table.querySelector("tbody tr") as HTMLElement;
    expect(within(row).getAllByText("Not available").length).toBeGreaterThanOrEqual(1);
    expect(within(screen.getByRole("region", { name: "Positions" })).getByText("1 positions loaded · total not published · no further page")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Positions" }).textContent).toContain("Partial");
  });

  it("orders, fills and balances are tables; the reconciliation figures are `Not available` (FE-072 in the title)", async () => {
    mount(() => ok(v2Read(v2Populated())));
    await loaded();
    for (const name of ["Orders", "Fills", "Account balances", "Margin balances"]) expect(screen.getByRole("table", { name }), name).toBeTruthy();
    expect(whyText(screen.getByRole("region", { name: "Reconciliation" }).querySelector(".exec-blk-gaps")!)).toContain("Not published (FE-072)");
  });

  it("continuity: the read does not assert continuity; a coverage table lists all eleven panels; broker_sync is Not published", async () => {
    mount(() => ok(v2Read(v2Populated())), "?tab=continuity");
    await loaded();
    expect(within(screen.getByRole("table", { name: "Display continuity" })).getByText("State").closest("tr")!.querySelector(".exec-blk-na")!.getAttribute("title")).toContain("This read does not assert update continuity");
    const coverage = screen.getByRole("table", { name: "Panel coverage" });
    expect(coverage.querySelectorAll("tbody tr")).toHaveLength(11);
    expect(within(coverage).getByText("Broker sync").closest("tr")!.textContent).toContain("The broker purpose is not commissioned.");
    for (const name of ["Sessions", "Reconciliation observations", "Account sync", "Deployments", "Accounts"]) expect(screen.getByRole("region", { name }), name).toBeTruthy();
  });

  it("predecessor and guard rules say what this read does not carry", async () => {
    mount(() => ok(v2Read(v2Populated())), "?tab=predecessor-envelope");
    await loaded();
    expect(screen.getByRole("region", { name: "Canary envelope" }).querySelector(".exec-blk-na")!.getAttribute("title")).toContain("This read does not carry the predecessor Canary envelope.");
    fireEvent.click(screen.getByRole("tab", { name: "Guard rules" }));
    const rows = screen.getByRole("table", { name: "Guard rules" }).querySelectorAll("tbody tr");
    for (const row of Array.from(rows)) expect(row.textContent).toContain("Not available");
  });

  it("blockers: commands closed, runtime not asserted, a snapshot not a stream; ladder still disabled", async () => {
    mount(() => ok(v2Read(v2Populated())));
    await loaded();
    const rail = screen.getByRole("complementary", { name: "Protective actions and blockers" });
    expect(within(rail).getByText("Commands are closed on this build.")).toBeTruthy();
    expect(within(rail).getByText("The source does not assert that the deployment is running.")).toBeTruthy();
    expect(within(rail).getByText("This read is a snapshot, not a live stream.")).toBeTruthy();
    for (const name of ["Halt", "Reduce", "Emergency close"]) expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("an unpublished body: the exposure panels are one `Not available` line with the reasons in its title; the screen is empty, said once", async () => {
    const raw = v2Unpublished();
    for (const name of Object.keys(raw.data)) {
      raw.data[name].state = "NOT_PUBLISHED";
      raw.data[name].records = [];
      raw.data[name].returned_count = 0;
    }
    mount(() => ok(v2Read(raw)));
    await loaded();
    expect(screen.getByText("No retained observation yet.")).toBeTruthy();
    const line = document.querySelector(".exec-liv-stack > .exec-blk-gaps")!;
    expect(line.textContent).toContain("Not available: Positions, Orders");
    expect(whyText(line)).toContain("Positions: Not published · The source did not capture this panel.");
    expect(screen.queryByRole("region", { name: "Positions" })).toBeNull();
    expect(screen.queryByRole("table", { name: "Positions" })).toBeNull();
  });

  it("a partial panel with no record is an empty state with the reason, not a table of nothing", async () => {
    const raw = v2Populated();
    raw.data.fills.records = [];
    raw.data.fills.returned_count = 0;
    mount(() => ok(v2Read(raw)));
    await loaded();
    const panel = screen.getByRole("region", { name: "Fills" });
    expect(panel.textContent).toContain("No retained fills on this page.");
    expect(within(panel).queryByRole("table")).toBeNull();
  });
});

/* ═════════════════════════ V2 · keyset paging ═════════════════════════ */

describe("V2 · 200 rows and keyset Load more", () => {
  const PAGES = 5;
  /** Smaller than the 200 cap so Load more has somewhere to go: five pages of 60. */
  const SIZE = 60;
  /** Five pages of orders; each carries the cursor of the next; every other panel answers its first page. */
  const pagesOf = () => {
    const bodies = Array.from({ length: PAGES }, (_, i) => withRecords(v2Populated(), "orders", SIZE, i < PAGES - 1 ? cursorFor("orders", i + 1) : null, i * SIZE));
    const handler: Handler = (_id, options) => {
      if (options?.panel === "orders" && options.cursor !== undefined) {
        const at = Array.from({ length: PAGES - 1 }, (_, i) => cursorFor("orders", i + 1)).indexOf(options.cursor);
        return at < 0 ? refused("unavailable", "409: unknown cursor") : ok(v2Read(bodies[at + 1]));
      }
      return ok(v2Read(bodies[0]));
    };
    return handler;
  };
  const ordersPanel = () => screen.getByRole("region", { name: "Orders" });
  const more = () => within(ordersPanel()).getByRole("button", { name: /Load more|Try again|Loading more/ });
  const rowCount = () => within(screen.getByRole("table", { name: "Orders" })).getAllByRole("row").length - 1;

  it("a page below the cap says what is loaded, that the total is not published, and offers Load more", async () => {
    mount(pagesOf());
    await loaded();
    expect(rowCount()).toBe(SIZE);
    expect(ordersPanel().textContent).toContain(`${SIZE} orders loaded · total not published · more available`);
    expect(more().textContent).toBe("Load more");
  });

  it("a first page already at the 200 cap has no Load more and says where the rest is", async () => {
    const full = withRecords(v2Populated(), "orders", 200, cursorFor("orders", 1));
    const m = mount(() => ok(v2Read(full)));
    await loaded();
    expect(rowCount()).toBe(200);
    expect(within(ordersPanel()).queryByRole("button")).toBeNull();
    expect(ordersPanel().textContent).toContain("First 200 shown of 200 loaded · more available; use Blotter for the full list");
    expect(ordersPanel().textContent).not.toMatch(/N\/A|—/);
    expect(m.calls).toHaveLength(1);
  });

  it("each Load more sends that panel's own cursor back unchanged; at the cap the button goes, the list stops at 200 and nothing more is requested", async () => {
    const m = mount(pagesOf());
    await loaded();
    // 60, 120, 180, then the fourth page would make 240: it is cut at 200 and the button is gone.
    for (let i = 1; i < 4; i += 1) {
      fireEvent.click(more());
      await waitFor(() => expect(m.calls).toHaveLength(i + 1));
      await waitFor(() => expect(rowCount()).toBe(Math.min((i + 1) * SIZE, 200)));
    }
    expect(m.calls.slice(1).map((c) => c.options)).toEqual(
      Array.from({ length: 3 }, (_, i) => ({ panel: "orders", cursor: cursorFor("orders", i + 1) })),
    );
    expect(ordersPanel().textContent).toContain("First 200 shown of 200 loaded · more available; use Blotter for the full list");
    expect(within(ordersPanel()).queryByRole("button")).toBeNull();
    expect(rowCount()).toBe(200);
    expect(m.calls).toHaveLength(4);
  });

  it("the cursor and the panel are read parameters: neither is ever in the page URL", async () => {
    const m = mount(pagesOf());
    await loaded();
    fireEvent.click(more());
    await waitFor(() => expect(m.calls).toHaveLength(2));
    await waitFor(() => expect(ordersPanel().textContent).toContain(`${2 * SIZE} orders loaded`));
    expect(where()).toBe(`/deployments/live/${DEPLOYMENT_ID}`);
  });

  it("while a page is loading the button says so and a second click sends nothing", async () => {
    let release: (() => void) | undefined;
    const first = pagesOf();
    const m = mount((id, options) => (options?.cursor === undefined ? first(id, options) : new Promise((resolveRead) => { release = () => resolveRead(first(id, options) as never); })));
    await loaded();
    fireEvent.click(more());
    await waitFor(() => expect(more().getAttribute("aria-busy")).toBe("true"));
    fireEvent.click(more());
    expect(m.calls).toHaveLength(2);
    release?.();
    await waitFor(() => expect(ordersPanel().textContent).toContain(`${2 * SIZE} orders loaded`));
  });

  it.each([
    ["CURSOR_EXPIRED", "CURSOR_EXPIRED: Query cursor has expired."],
    ["INVALID_CURSOR", "INVALID_CURSOR: bad cursor"],
    ["EXECUTION_READ_CURSOR_INVALID", "EXECUTION_READ_CURSOR_INVALID: the page reference no longer applies"],
  ])("a cursor refusal (%s) restarts THAT panel from its first page and says so; other panels are untouched", async (_code, reason) => {
    const first = withRecords(v2Populated(), "orders", SIZE, cursorFor("orders", 1));
    const restart = withRecords(v2Populated(), "orders", 3, null, 5000);
    const m = mount((_id, options) => (options?.cursor !== undefined ? refused("unavailable", reason) : ok(v2Read(options?.panel === "orders" ? restart : first))));
    await loaded();
    fireEvent.click(more());
    await waitFor(() => expect(ordersPanel().textContent).toContain("The continuation for orders expired, so the list restarted from its first page."));
    expect(m.calls.slice(1).map((c) => c.options)).toEqual([{ panel: "orders", cursor: cursorFor("orders", 1) }, { panel: "orders" }]);
    expect(rowCount()).toBe(3);
    expect(ordersPanel().textContent).toContain("3 orders loaded · total not published · no further page");
    expect(screen.getByRole("table", { name: "Positions" })).toBeTruthy();
  });

  it.each([
    ["a network failure", "The live operations never reached the Portal: network failure."],
    ["a 404", "NOT_FOUND: no such deployment"],
    ["a 5xx", "503: down"],
    ["a 409 that is not about the cursor", "409: the workflow moved"],
  ])("%s is reported and the loaded rows stay; the panel is NOT restarted", async (_what, reason) => {
    const first = withRecords(v2Populated(), "orders", SIZE, cursorFor("orders", 1));
    const m = mount((_id, options) => (options?.cursor !== undefined ? refused("unavailable", reason) : ok(v2Read(first))));
    await loaded();
    fireEvent.click(more());
    await waitFor(() => expect(within(ordersPanel()).getByRole("alert").textContent).toContain(reason));
    // One failed continuation request, no first-page refetch, the 60 rows still there, no "expired" notice.
    expect(m.calls).toHaveLength(2);
    expect(m.calls[1]!.options).toEqual({ panel: "orders", cursor: cursorFor("orders", 1) });
    expect(rowCount()).toBe(SIZE);
    expect(ordersPanel().textContent).not.toContain("restarted from its first page");
    expect(more().textContent).toBe("Try again");
  });

  it("a cursor refusal whose restart fails too keeps the rows and reports the failure (Try again)", async () => {
    const first = withRecords(v2Populated(), "orders", SIZE, cursorFor("orders", 1));
    mount((_id, options) => (options?.cursor !== undefined ? refused("unavailable", "CURSOR_EXPIRED: expired") : options?.panel !== undefined ? refused("unavailable", "503: down") : ok(v2Read(first))));
    await loaded();
    fireEvent.click(more());
    await waitFor(() => expect(within(ordersPanel()).getByRole("alert").textContent).toContain("Could not load more orders. CURSOR_EXPIRED: expired"));
    expect(rowCount()).toBe(SIZE);
    expect(more().textContent).toBe("Try again");
  });

  it("a refusal that is not an expiry (denied, rate limited) is reported as it is and does not restart the panel", async () => {
    for (const status of ["denied", "stale"] as const) {
      cleanup();
      const first = withRecords(v2Populated(), "orders", SIZE, cursorFor("orders", 1));
      const m = mount((_id, options) => (options?.cursor !== undefined ? refused(status, `${status}: nope`) : ok(v2Read(first))));
      await loaded();
      fireEvent.click(more());
      await waitFor(() => expect(within(ordersPanel()).getByRole("alert").textContent).toContain(`${status}: nope`));
      expect(m.calls).toHaveLength(2);
      expect(rowCount()).toBe(SIZE);
    }
  });

  it("a later page that is the other version, or unsupported, is not shown", async () => {
    const first = withRecords(v2Populated(), "orders", SIZE, cursorFor("orders", 1));
    mount((_id, options) => (options?.cursor !== undefined ? ok({ kind: "unsupported", schemaVersion: "later.v9", reason: "UNKNOWN_SCHEMA_VERSION" }) : ok(v2Read(first))));
    await loaded();
    fireEvent.click(more());
    await waitFor(() => expect(within(ordersPanel()).getByRole("alert").textContent).toContain("later.v9"));
    expect(rowCount()).toBe(SIZE);
  });

  it("Load more on another panel uses that panel's name, not orders'", async () => {
    const body = withRecords(withRecords(v2Populated(), "orders", 2, null), "fills", SIZE, cursorFor("fills", 1));
    const m = mount(() => ok(v2Read(body)));
    await loaded();
    fireEvent.click(within(screen.getByRole("region", { name: "Fills" })).getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(m.calls).toHaveLength(2));
    expect(m.calls[1]!.options).toEqual({ panel: "fills", cursor: cursorFor("fills", 1) });
  });

  it("the Load more button is a real, enabled button reachable by keyboard", async () => {
    mount(pagesOf());
    await loaded();
    const button = more() as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    button.focus();
    expect(document.activeElement).toBe(button);
  });
});

/* ═════════════════════════ 390px, a11y ═════════════════════════ */

describe("390px and accessibility", () => {
  const css = readFileSync(resolve(__dirname, "../../css/live.css"), "utf8");
  const cards = readFileSync(resolve(__dirname, "../../css/cards.css"), "utf8");

  it("the stylesheet collapses to one column at 1100px and tightens the slot at 660px; tables become cards at 660px", () => {
    expect(css).toMatch(/@media \(max-width: 1100px\)[\s\S]*?\.exec-liv-grid[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
    expect(css).toMatch(/@media \(max-width: 660px\)[\s\S]*?\.exec-liv-slot/);
    expect(cards).toMatch(/@media \(max-width: 660px\)/);
    expect(css).not.toMatch(/^\s*(min-|max-)?width:\s*\d{4,}px/m);
  });

  it("every table cell carries its column label (the card layout prints it), and no cell is empty", async () => {
    mount(() => ok(v2Read(v2Populated())));
    await loaded();
    for (const td of Array.from(document.querySelectorAll("table.exec-cards td"))) {
      expect(td.getAttribute("data-l"), td.textContent ?? "").toBeTruthy();
      expect((td.textContent ?? "").trim().length).toBeGreaterThan(0);
    }
  });

  it("landmarks and names: one h1, a labelled rail, named tables, a named tablist, links with text", async () => {
    mount(() => ok(v1Read(populatedV1())));
    await loaded();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("complementary", { name: "Protective actions and blockers" })).toBeTruthy();
    expect(screen.getByRole("tablist", { name: "Live sections" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Deployment state" })).toBeTruthy();
    for (const link of screen.getAllByRole("link")) expect((link.textContent ?? "").trim().length + (link.getAttribute("aria-label")?.length ?? 0)).toBeGreaterThan(0);
  });

  it("the mismatch and gap slots are alerts (announced), the notices are statuses", async () => {
    mount(() => ok(v1Read(populatedV1({ state: "MISMATCH", visible: false }))));
    await loaded();
    expect(screen.getByRole("alert", { name: "Live net PnL" })).toBeTruthy();
  });

  it("no value is a dash, 'N/A' or a bare zero in a V1 body with nothing published", async () => {
    mount(() => ok(v1Read(v1Raw())));
    await loaded();
    expect(text()).not.toMatch(/N\/A|—|–/);
  });
});
