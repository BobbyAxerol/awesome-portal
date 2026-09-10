/**
 * Phase 9 gates.
 *
 * The snapshot is real and the sources behind it are not yet, so most of these
 * are about a screen not overclaiming: a count that is a floor, a rank the
 * browser must not touch, a pin that cannot be shown, a stream that does not
 * exist.
 *
 * The fixtures are read from `packages/contracts` rather than hand-copied, so
 * a change codex makes to the contract shows up here instead of drifting.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { countLabel, readCommandCenter, readPanelState, type CommandCenter } from "./commandCenter";
import { INITIAL_SUBSCRIPTION } from "./subscription";
import { CommandCenterScreen } from "./screens/CommandCenter";
import { CC_FIXTURES } from "./commandCenter.fixtures";

afterEach(cleanup);

const FIXTURES = join(__dirname, "../../../../../packages/contracts/fixtures");

function fixture(name: string) {
  return JSON.parse(readFileSync(join(FIXTURES, `execution-command-center.${name}.valid.json`), "utf8"));
}

function snapshot(name: string) {
  const parsed = readCommandCenter(fixture(name));
  if (!parsed) throw new Error(`fixture ${name} did not parse`);
  return parsed;
}

describe("B12 — every published panel state maps, and an unknown one is not ok", () => {
  it("maps the contract's five states onto the nine this cluster renders", () => {
    expect(readPanelState("ready")).toBe("ok");
    expect(readPanelState("empty")).toBe("empty");
    expect(readPanelState("partial")).toBe("partial");
    expect(readPanelState("stale")).toBe("stale");
    expect(readPanelState("unavailable")).toBe("unavailable");
  });

  it("treats a state it does not recognise as unavailable, never as ok", () => {
    expect(readPanelState("healthy")).toBe("unavailable");
    expect(readPanelState(undefined)).toBe("unavailable");
    expect(readPanelState(null)).toBe("unavailable");
  });

  for (const name of ["busy", "empty", "partial", "stale", "unavailable"]) {
    it(`renders the ${name} fixture without inventing a panel`, () => {
      render(<CommandCenterScreen onOpen={() => undefined} snapshot={snapshot(name)} />);
      // Exactly one page heading, and the panels the document actually carries
      // — no placeholder frames for panels it does not.
      expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
      const parsed = snapshot(name);
      for (const [title, panel] of [
        ["Needs you now", parsed.needsYou],
        ["Fleet health", parsed.fleet],
        ["Today", parsed.today],
      ] as const) {
        if (panel) expect(screen.getByLabelText(title)).toBeTruthy();
        else expect(screen.queryByLabelText(title)).toBeNull();
      }
    });
  }
});

describe("B13 — authority and freshness belong to the panel", () => {
  it("gives each panel its own header rather than one page verdict", () => {
    const s = snapshot("partial");
    render(<CommandCenterScreen onOpen={() => undefined} snapshot={s} />);
    // Three panel frames, each labelled; the assertion is that they exist
    // separately, not that they agree. "Pinned watchlist" was a fourth until
    // PHASE 4 (round 2) removed it: nothing could write a pin, so the panel
    // asked the reader to use a control that did not exist.
    for (const title of ["Needs you now", "Fleet health", "Today"]) {
      expect(screen.getByLabelText(title)).toBeTruthy();
    }
  });

  it("reads a different authority per panel from the same document", () => {
    const s = snapshot("busy");
    expect(s.needsYou?.authority).toBe("DERIVED");
    expect(s.fleet?.authority).toBe("EXECUTION");
  });
});

describe("B14 — observed_total_count is a floor, not a total", () => {
  it("prints an exact total plainly", () => {
    expect(countLabel({ exactTotal: true, total: 214, observed: 214, returned: 214, truncated: false, limit: 10 })).toBe("214");
    expect(countLabel({ exactTotal: true, total: 214, observed: 214, returned: 3, truncated: true, limit: 10 })).toBe("3 of 214");
  });

  it("marks an inexact count as seen, never as counted", () => {
    const label = countLabel({ exactTotal: false, total: null, observed: 91, returned: 3, truncated: true, limit: 10 });
    expect(label).toBe("3 of ~91 seen");
    expect(label).toContain("~");
  });

  it("says the count was not taken, never a dash and never a zero", () => {
    expect(countLabel({ exactTotal: false, total: null, observed: null, returned: null, truncated: null, limit: null })).toBe("not counted");
  });

  it("shows a fleet cell with no value as a stated absence rather than 0", () => {
    render(<CommandCenterScreen onOpen={() => undefined} snapshot={snapshot("partial")} />);
    const fleet = screen.getByLabelText("Fleet health");
    // Whatever the fixture withholds must not appear as a zero.
    expect(fleet.textContent).not.toMatch(/\b0\b(?!\d)/);
  });
});

describe("B15 — the browser is not a second ranking authority", () => {
  it("renders triage items in the order the server delivered them", () => {
    const raw = fixture("busy");
    // Deliberately out of rank order in the wire document.
    raw.panels.needs_you.items.reverse();
    const parsed = readCommandCenter(raw);
    const wire = raw.panels.needs_you.items.map((i: { id: string }) => i.id);
    expect(parsed?.needsYou?.items.map((i) => i.id)).toEqual(wire);
  });

  it("displays the server's rank rather than the array position", () => {
    const raw = fixture("busy");
    raw.panels.needs_you.items[0].rank = 7;
    const parsed = readCommandCenter(raw);
    expect(parsed?.needsYou?.items[0].rank).toBe(7);
  });
});

/**
 * PHASE 4 (round 2) · B16 was a test for a feature that could not be used.
 *
 * The Pinned watchlist panel told the reader "Pin from any workbench", and
 * there was no pin control in any workbench, no POST route, and no code that
 * could write execution_command_center_pins — its only INSERT was in a spec
 * file. The panel instructed an action that did not exist, and these tests
 * passed because the fixture supplied the rows the product never could.
 *
 * The panel, its read path and its table are gone. What remains of B16 is the
 * rule that produced it, which still holds elsewhere: a row whose target
 * cannot be read stays visible and says so, rather than being filtered out to
 * keep a panel tidy. `governanceAdditions.test.tsx` covers that for the panels
 * that still exist.
 */

describe("B17 — no live control while the stream is dark", () => {
  it("says the page does not update itself when stream_available is false", () => {
    const s = snapshot("busy");
    expect(s.streamAvailable).toBe(false);
    render(<CommandCenterScreen onOpen={() => undefined} snapshot={s} />);
    expect(screen.getByText(/snapshot only/)).toBeTruthy();
  });

  it("offers no live or profile control at all, rather than a disabled one", () => {
    render(<CommandCenterScreen onOpen={() => undefined} snapshot={snapshot("busy")} />);
    expect(screen.queryByRole("button", { name: /live|stream|connect/i })).toBeNull();
  });

  it("drops the snapshot-only note once a stream is published", () => {
    const raw = fixture("busy");
    raw.snapshot.stream_available = true;
    render(<CommandCenterScreen onOpen={() => undefined} snapshot={readCommandCenter(raw)!} />);
    expect(screen.queryByText(/snapshot only/)).toBeNull();
  });
});

describe("triage rows are reachable and report the whole item", () => {
  it("is a button, and hands back the item it was built from", () => {
    const onOpen = vi.fn();
    render(<CommandCenterScreen snapshot={snapshot("busy")} onOpen={onOpen} />);
    const rows = screen.getByLabelText("Needs you now").querySelectorAll("button");
    expect(rows.length).toBeGreaterThan(0);
    fireEvent.click(rows[0]);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen.mock.calls[0][0].id).toBeTruthy();
  });
});

describe("the reader denies by default", () => {
  it("returns null for a document it cannot read", () => {
    expect(readCommandCenter(null)).toBeNull();
    expect(readCommandCenter("{}")).toBeNull();
  });

  it("omits a panel the document does not carry rather than inventing an empty one", () => {
    const parsed = readCommandCenter({ panels: { needs_you: { panel_state: "ready", items: [] } } });
    expect(parsed?.needsYou).not.toBeNull();
    expect(parsed?.fleet).toBeNull();
    expect(parsed?.today).toBeNull();
  });

  it("does not treat a missing stream flag as an available stream", () => {
    expect(readCommandCenter({ snapshot: {} })?.streamAvailable).toBe(false);
    expect(readCommandCenter({})?.streamAvailable).toBe(false);
  });
});

describe("the inlined fixtures have not drifted from the contract", () => {
  // The browser bundle cannot read packages/contracts, so those documents are
  // inlined for the fixtures page. An inlined copy is exactly what goes stale
  // silently, so this compares them byte-for-byte on every run.
  for (const name of ["busy", "empty", "partial", "stale", "unavailable"] as const) {
    it(`${name} matches packages/contracts`, () => {
      expect(CC_FIXTURES[name]).toEqual(fixture(name));
    });
  }
});

/**
 * The live banner, all three of its states.
 *
 * None of these had a test. Every published fixture carries
 * `stream_available: false`, so the suite only ever rendered the dark branch,
 * and the two branches behind the gate — the ones that appear on the day codex
 * flips the flag — were unexercised code. The screen printed `Live — UNKNOWN`
 * under a `data-live="true"` marker whenever the gate opened, whether or not a
 * subscription existed, because `live?.freshness ?? "UNKNOWN"` treats "I hold
 * no stream" and "the stream says UNKNOWN" as the same sentence.
 */
describe("the live banner distinguishes published from connected", () => {
  const opened = (): CommandCenter => {
    const base = snapshot("busy");
    // Built here rather than in a fixture on purpose: the fixtures are
    // generated from `packages/contracts/fixtures/` and drift-tested byte for
    // byte, so the branch cannot be reached by editing one.
    return { ...base, streamAvailable: true };
  };

  it("says nothing is connected when the stream is published but no state has arrived", () => {
    render(<CommandCenterScreen onOpen={() => undefined} snapshot={opened()} live={null} />);
    expect(screen.getByText(/Stream published — not connected/)).toBeTruthy();
    // The marker is the claim. It must track the socket, not the server flag.
    expect(document.querySelector('[data-live="true"]')).toBeNull();
    // `UNKNOWN` is a real `FreshnessState`, not a placeholder, so the old
    // `?? "UNKNOWN"` did not merely leave a blank — it reported a value the
    // stream is entitled to send and in this case never sent.
    expect(document.body.textContent).not.toContain("UNKNOWN");
  });

  it("reports the subscription's own freshness once one exists", () => {
    render(
      <CommandCenterScreen onOpen={() => undefined}
        snapshot={opened()}
        live={{ ...INITIAL_SUBSCRIPTION, freshness: "OK", phase: "live" }}
      />,
    );
    const banner = document.querySelector('[data-live="true"]');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain("OK");
    expect(banner?.textContent).toContain("live");
  });

  it("still refuses to mention a stream at all while the gate is shut", () => {
    render(<CommandCenterScreen onOpen={() => undefined} snapshot={snapshot("busy")} live={null} />);
    expect(document.querySelector('[data-live="true"]')).toBeNull();
    expect(screen.queryByText(/Stream published/)).toBeNull();
  });
});
