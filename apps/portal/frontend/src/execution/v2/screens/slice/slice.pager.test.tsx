/**
 * The slice pager (UXM-08 scoped slice, FIXTURE ONLY) over the published 3-page chain (RV-12 `fleet-owner-paper-chain`,
 * TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT). The words are the Blotter's keyset words: Newer, Older, and its two-part note.
 * "Start over" is the one way out of a refusal. The assertions are on the rendered DOM.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { createFakeClock, flush } from "../../realtime/fakes.testbase";
import { chainScopedRead, createFixtureLane, fixtureChain, type FixtureLane } from "./canonicalLane";
import { SliceScreen } from "./index";
import type { ScopedRead } from "./scopedRead";

afterEach(cleanup);

const CONTEXT = { workspaceId: null, environment: null };
const chainLane = (source: () => ScopedRead | null = chainScopedRead): FixtureLane => createFixtureLane(CONTEXT, undefined, source, fixtureChain());

async function mount(lane: FixtureLane, clock = createFakeClock()) {
  const view = render(
    <MemoryRouter initialEntries={["/execution/slice"]}>
      <SliceScreen context={CONTEXT} clock={clock} lane={lane} />
    </MemoryRouter>,
  );
  await act(async () => {
    await flush(12);
  });
  return view;
}

const click = async (name: RegExp | string) => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
    await flush(12);
  });
};
const button = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;
const note = () => screen.getByTestId("slice-pager").querySelector("span#slice-pager-note")!.textContent;
const alphas = () => [...document.querySelectorAll("a")].map((td) => td.textContent).filter((t) => /^alpha_TEST_ONLY_A\d$/.test(t ?? ""));
const fact = (label: string): string => {
  const dt = [...screen.getByTestId("stream-facts").querySelectorAll("dt")].find((node) => node.textContent === label)!;
  return dt.nextElementSibling?.textContent ?? "";
};
const readAtFact = () => [...document.querySelectorAll(".exec-slice-facts dt")].find((n) => n.textContent === "Read at")!.nextElementSibling!.textContent;

describe("one page: no pager", () => {
  it("the published one-page example offers no Newer / Older", async () => {
    await mount(createFixtureLane(CONTEXT));
    expect(screen.queryByTestId("slice-pager")).toBeNull();
    expect(screen.queryByRole("button", { name: "Older" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Newer" })).toBeNull();
  });
});

describe("the 3-page chain", () => {
  it("page 1: Newer is disabled with its reason, Older is open", async () => {
    await mount(chainLane());
    expect(alphas()).toEqual(["alpha_TEST_ONLY_A1"]);
    expect(button("Newer").disabled).toBe(true);
    expect(button("Newer").getAttribute("aria-describedby")).toBe("slice-pager-note");
    expect(button("Older").disabled).toBe(false);
    expect(note()).toBe("At the newest rows, older rows exist");
    // The server's own words stay: more pages exist, 1 of 3.
    expect(document.body.textContent).toContain("Showing 1 of 3");
  });

  it("walks 1 to 2 to 3 and back, one server page at a time, with each page's own rows", async () => {
    await mount(chainLane());
    await click("Older");
    expect(alphas()).toEqual(["alpha_TEST_ONLY_A2"]);
    expect([button("Newer").disabled, button("Older").disabled]).toEqual([false, false]);
    expect(note()).toBe("Newer rows exist, older rows exist");
    await click("Older");
    expect(alphas()).toEqual(["alpha_TEST_ONLY_A3"]);
    expect([button("Newer").disabled, button("Older").disabled]).toEqual([false, true]);
    expect(button("Older").getAttribute("aria-describedby")).toBe("slice-pager-note");
    expect(note()).toBe("Newer rows exist, at the oldest rows");
    await click("Newer");
    expect(alphas()).toEqual(["alpha_TEST_ONLY_A2"]);
    await click("Newer");
    expect(alphas()).toEqual(["alpha_TEST_ONLY_A1"]);
    expect(button("Newer").disabled).toBe(true);
  });

  it("a page change is the same snapshot: the stream is not read again, re-baselined or counted", async () => {
    const lane = chainLane();
    await mount(lane);
    const before = { snapshotReads: lane.reads(), started: fact("Notices"), readAt: readAtFact(), chip: screen.getByTestId("stream-chip").textContent, data: fact("Data") };
    await click("Older");
    await click("Older");
    await click("Newer");
    expect(lane.reads()).toBe(before.snapshotReads);
    expect({ started: fact("Notices"), readAt: readAtFact(), chip: screen.getByTestId("stream-chip").textContent, data: fact("Data") }).toEqual({
      started: before.started, readAt: before.readAt, chip: before.chip, data: before.data,
    });
    expect(lane.pageReads()).toBe(1 + 3);
  });

  it("the cursor is opaque: it is nowhere in the DOM, the links or the title", async () => {
    await mount(chainLane());
    await click("Older");
    expect(document.documentElement.innerHTML).not.toContain("kc1.");
    expect(document.documentElement.innerHTML).not.toContain("testonly-k1");
  });

  it("a revalidate notice of the same snapshot keeps the page; a NEW snapshot starts the chain again from page 1", async () => {
    let readAt = 1_790_812_800_000;
    const lane = chainLane(() => {
      const read = chainScopedRead();
      return read === null ? null : { ...read, readAtMs: readAt as ScopedRead["readAtMs"] };
    });
    const clock = createFakeClock();
    await mount(lane, clock);
    const notice = async () => {
      await click("Revalidate notice");
      await act(async () => {
        clock.advance(2_000);
        await flush(12);
      });
    };
    await click("Older");
    expect(alphas()).toEqual(["alpha_TEST_ONLY_A2"]);
    await notice();
    expect(lane.reads()).toBeGreaterThan(1);
    expect(alphas()).toEqual(["alpha_TEST_ONLY_A2"]);
    readAt += 60_000;
    await notice();
    expect(alphas()).toEqual(["alpha_TEST_ONLY_A1"]);
    expect(button("Newer").disabled).toBe(true);
  });
});

describe("a stale cursor is a typed refusal with one way out", () => {
  it("shows no rows, no cursor and no sentence of the server; Start over reads page 1 again", async () => {
    const lane = chainLane();
    await mount(lane);
    await click("Older");
    lane.expireCursors();
    await click("Older");
    expect(alphas()).toEqual([]);
    expect(screen.queryByTestId("slice-pager")).toBeNull();
    expect(document.body.textContent).not.toContain("TEST_ONLY fixture refusal");
    expect(document.documentElement.innerHTML).not.toContain("kc1.");
    await click("Why, reason");
    expect(document.body.textContent).toContain("CURSOR_EXPIRED");
    // Exactly one way out, and it is not Newer or Older.
    expect(screen.getAllByRole("button", { name: "Start over" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Older" })).toBeNull();
    await click("Start over");
    expect(alphas()).toEqual(["alpha_TEST_ONLY_A1"]);
    expect(note()).toBe("At the newest rows, older rows exist");
    await click("Older");
    expect(alphas()).toEqual(["alpha_TEST_ONLY_A2"]);
  });

  it("the stream itself is untouched by the refusal (no extra snapshot read)", async () => {
    const lane = chainLane();
    await mount(lane);
    const reads = lane.reads();
    lane.expireCursors();
    await click("Older");
    await click("Start over");
    expect(lane.reads()).toBe(reads);
    expect(screen.getByTestId("stream-chip").textContent).toContain("Live (fixture)");
  });
});

describe("access withdrawn", () => {
  it("leaves no page, no pager and no id of the chain", async () => {
    await mount(chainLane());
    await click("Older");
    await click("Access revoked");
    expect(alphas()).toEqual([]);
    expect(screen.queryByTestId("slice-pager")).toBeNull();
    expect(document.body.textContent).not.toContain("alpha_TEST_ONLY_A");
  });
});
