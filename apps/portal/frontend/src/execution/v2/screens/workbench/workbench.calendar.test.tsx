/**
 * The VN variant's market calendar (FE-070, `data.venue_calendar`), lane FIXTURE_LAB: the populated values are the canonical
 * SYNTHETIC fixture (invented windows, not the exchange calendar); a synthetic fixture is never source acceptance. Every member is
 * a Fact; `is_open` is the source's own statement and nothing here derives PAUSED or AGING from window arithmetic.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { V2_ROLE_PRESETS } from "../../shell/roleNav";
import { loadCanonical } from "../../testkit/loadCanonical";
import PaperWorkbenchScreen from "./index";
import { buildWorkbench } from "./model";
import { DEP, STRATEGY, envelopeOf, fakeApi, paperWire, sessionOf, type Wire } from "./workbench.harness.fixtures";
import { whyText } from "../../gapWhyTestUtil";

const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("../../../../auth/session", () => ({ useSession: () => session.current }));

beforeEach(() => {
  session.current = sessionOf(V2_ROLE_PRESETS.manager);
});
afterEach(cleanup);

const calendar = (): Wire => loadCanonical<Wire>("execution-venue-calendar.synthetic").value;
const dark = (): Wire => loadCanonical<Wire>("execution-paper-workbench-vnm.partial").data.venue_calendar;

function vnm(venueCalendar: Wire | undefined) {
  const wire = paperWire();
  wire.schema_version = "execution.paper-workbench-vnm.v1";
  if (venueCalendar !== undefined) wire.data.venue_calendar = venueCalendar;
  return wire;
}

function mount(wire: Wire) {
  const served = fakeApi({ profile: { ok: true, value: envelopeOf(wire) } });
  render(
    <MemoryRouter initialEntries={[`/deployments/paper/${DEP}/vn-market`]}>
      <PaperWorkbenchScreen api={served.api} deploymentId={DEP} variant="vnm" />
    </MemoryRouter>,
  );
  return screen.findByRole("heading", { level: 1, name: new RegExp(STRATEGY) });
}
const text = () => document.body.textContent ?? "";

describe("VN market calendar", () => {
  it("published: the source's own is_open statement with its as-of, and the windows, breaks and holidays it published", async () => {
    await mount(vnm(calendar()));
    const head = document.querySelector(".exec-wb-sub")!;
    expect(head.textContent).toContain("VN market calendar: ");
    expect(head.textContent).toContain("Closed");
    expect(head.textContent).toContain("As of 12 Oct 08:00Z");
    expect(head.querySelector('[data-gap="FE-070"]')).toBeNull();
    const panel = screen.getByRole("heading", { name: "VN market sessions" }).closest("section")!;
    expect(within(panel).getByText("Asia/Ho_Chi_Minh")).toBeTruthy();
    const items = Array.from(panel.querySelectorAll(".exec-wb-list li")).map((li) => li.textContent);
    expect(items).toEqual(["ATO 09:00-09:15 opening auction", "morning 09:15-11:30 trading session", "afternoon 13:00-14:30 trading session", "ATC 14:30-14:45 closing auction"]);
    expect(panel.textContent).toContain("11:30-13:00");
    expect(panel.textContent).toContain("2 published, first 2099-01-01 TEST_ONLY holiday");
  });

  it("is_open true reads Open; it is the source's word, not an inference from the windows", async () => {
    const c = calendar();
    c.is_open.value = true;
    await mount(vnm(c));
    expect(document.querySelector(".exec-wb-sub")!.textContent).toContain("Open");
    expect(text()).not.toMatch(/Aging|Paused/);
  });

  it("the producer's dark calendar: `Not available` in the header and ONE line in the panel, with (FE-070) and N28_VENUE_CALENDAR_NOT_ACTIVE in the titles", async () => {
    await mount(vnm(dark()));
    const head = document.querySelector(".exec-wb-sub")!;
    const gap = head.querySelector('[data-gap="FE-070"]')!;
    expect(gap.textContent).toBe("Not available");
    expect(whyText(gap)).toContain("Not published: VN market session calendar");
    expect(whyText(gap)).toContain("N28_VENUE_CALENDAR_NOT_ACTIVE");
    const panel = screen.getByRole("heading", { name: "VN market sessions" }).closest("section")!;
    const line = panel.querySelector(".exec-blk-gaps")!;
    expect(line.textContent).toBe("Not available: Open now, Time zone, Windows, Breaks, Holidays");
    expect(whyText(line)).toContain("N28_VENUE_CALENDAR_NOT_ACTIVE");
    expect(panel.querySelector("table")).toBeNull();
  });

  it("a profile without the calendar says Not available (FE-070 in the title) without a reason and draws no sessions panel", async () => {
    await mount(vnm(undefined));
    expect(document.querySelector(".exec-wb-sub")!.textContent).toContain("VN market calendar: Not available");
    expect(whyText(document.querySelector('.exec-wb-sub [data-gap="FE-070"]')!)).toBe("Not published: VN market session calendar");
    expect(screen.queryByRole("heading", { name: "VN market sessions" })).toBeNull();
  });

  it.each([
    ["an extra key", (c: Wire) => (c.surprise = 1)],
    ["a window kind outside the vocabulary", (c: Wire) => (c.windows.value[0].kind = "LUNCH")],
    ["a clock without its leading zero", (c: Wire) => (c.windows.value[0].open = "9:00")],
    ["is_open as a string", (c: Wire) => (c.is_open.value = "false")],
    ["another market", (c: Wire) => (c.market = "US_EQUITY")],
  ])("%s: the whole member is refused, nothing is printed from it", async (_name, mutate) => {
    const c = calendar();
    mutate(c);
    await mount(vnm(c));
    expect(document.querySelector(".exec-wb-sub")!.textContent).toContain("VN market calendar: Not available");
    expect(screen.queryByRole("heading", { name: "VN market sessions" })).toBeNull();
    expect(text()).not.toContain("ATO");
  });

  it("the model keeps a stage_facts block for the paper variant too; a missing or refused block reads as typed absence", () => {
    expect(buildWorkbench(envelopeOf(paperWire()), null).facts).not.toBeNull();
    const wire = paperWire();
    wire.data.stage_facts.surprise = 1;
    expect(buildWorkbench(envelopeOf(wire), null).facts).toBeNull();
    const none = paperWire();
    delete none.data.stage_facts;
    expect(buildWorkbench(envelopeOf(none), null).facts).toBeNull();
  });
});
