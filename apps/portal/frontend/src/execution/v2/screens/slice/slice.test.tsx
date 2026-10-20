/**
 * The scoped slice screen (UXM-08, FIXTURE ONLY), rendered with a fake clock and the published synthetic lane.
 *
 * Each frame state is a button of the fixture group; the assertions are on what a reader sees: the stream chip, the line
 * under it, whether scoped data is on screen, and the links to the EXISTING V2 screens. UX-F02/03/05/07/19/21 are covered as
 * far as the one published example reaches.
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { createFakeClock, flush, type FakeClock } from "../../realtime/fakes.testbase";
import { FIXTURE_LANE_LABEL, NOT_CONNECTED_LABEL } from "../../realtime/streamView";
import { createFixtureLane } from "./canonicalLane";
import { SliceScreen } from "./index";
import type { SliceContext } from "./model";

afterEach(cleanup);

const OWN: SliceContext = { workspaceId: null, environment: null };

async function mount(context: SliceContext = OWN, clock: FakeClock = createFakeClock(), entry = "/execution/slice") {
  const view = render(
    <MemoryRouter initialEntries={[entry]}>
      <SliceScreen context={context} clock={clock} />
    </MemoryRouter>,
  );
  await act(async () => {
    await flush(12);
  });
  return { ...view, clock };
}

const chip = () => screen.getByTestId("stream-chip").textContent ?? "";
const press = async (name: RegExp | string) => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
    await flush(12);
  });
};
const fact = (label: string): string => {
  const dt = [...screen.getByTestId("stream-facts").querySelectorAll("dt")].find((node) => node.textContent === label)!;
  return dt.nextElementSibling?.textContent ?? "";
};
const text = () => document.body.textContent ?? "";

describe("the lane label (this is not a real stream)", () => {
  it("says so in the first place a reader looks, and says it is not connected", async () => {
    await mount();
    const note = screen.getByRole("note");
    expect(note.textContent).toContain(FIXTURE_LANE_LABEL);
    expect(note.textContent).toContain(NOT_CONNECTED_LABEL);
    expect(FIXTURE_LANE_LABEL).toBe("Fixture frames, not a real stream");
    expect(NOT_CONNECTED_LABEL).toBe("Not connected to a real source");
    expect(screen.getByRole("group", { name: FIXTURE_LANE_LABEL })).toBeTruthy();
  });
});

describe("live: the banner and the three links", () => {
  it("shows the scope banner from the published example, and a chip that is never ok", async () => {
    await mount();
    expect(chip()).toContain("Live (fixture)");
    const scope = screen.getByRole("region", { name: "Your scope" });
    expect(scope.textContent).toContain("Scoped view: authorized rows only");
    expect(scope.textContent).toContain("Totals cover the rows you can see");
    expect(scope.textContent).toContain("Partial: current page of retained data, not total history");
    expect(scope.textContent).toContain("1 on this page, 1 visible to you, limit 50");
    expect(scope.textContent).toContain("workspace_TEST_ONLY");
    expect(scope.textContent).toContain("Paper");
    expect(screen.getByTestId("stream-chip").querySelector('[data-k="ok"]')).toBeNull();
  });

  it("links portfolio -> fleet -> alpha to the existing V2 screens, carrying the shared context", async () => {
    await mount(OWN, createFakeClock(), "/execution/slice?env=paper&workspace_id=workspace_TEST_ONLY&window=30D");
    const portfolio = screen.getByRole("link", { name: "Open portfolio" });
    expect(portfolio.getAttribute("href")).toMatch(/^\/deployments\/portfolios\/portfolio_TEST_ONLY\?/);
    expect(portfolio.getAttribute("href")).toContain("env=paper");
    expect(portfolio.getAttribute("href")).toContain("workspace_id=workspace_TEST_ONLY");
    const fleet = screen.getByRole("link", { name: "Open Alpha Fleet" });
    expect(fleet.getAttribute("href")).toMatch(/^\/deployments\/alphas\?/);
    const alpha = screen.getByRole("link", { name: "alpha_TEST_ONLY" });
    expect(alpha.getAttribute("href")).toMatch(/^\/deployments\/alphas\/alpha_TEST_ONLY\?/);
    expect(alpha.getAttribute("href")).toContain("window=30d");
  });

  it("UX-F07/F05: the allocation keeps its exact string and its currency, flagged Partial with the published reason", async () => {
    await mount();
    const fleet = screen.getByRole("region", { name: "Fleet on this page" });
    const exact = fleet.querySelector('[data-full="100.1234567890123456789"]');
    expect(exact).not.toBeNull();
    expect(exact!.getAttribute("title")).toBe("100.1234567890123456789");
    expect(fleet.textContent).toContain("USD");
    expect(fleet.textContent).toContain("SCOPED_FINANCIAL_GRAIN_OR_FIELDS_UNAVAILABLE");
    expect(within(fleet).getAllByText("Partial").length).toBeGreaterThan(0);
    // Instances were not published in this read: said, not zero.
    expect(fleet.textContent).toContain("None in this read");
  });

  it("gaps are sentences with their request, never a dash or N/A", async () => {
    await mount();
    expect(screen.getAllByText(/Not published/).length).toBeGreaterThan(0);
    expect(text()).toContain("(FE-066)");
    expect(text()).not.toMatch(/—|\bN\/A\b|\bn\/a\b/);
  });

  it("UX-F02: no percentage, no fraction of a whole, no word for rows the caller cannot see", async () => {
    await mount();
    const scoped = screen.getByRole("region", { name: "Your scope" }).textContent ?? "";
    expect(scoped).not.toMatch(/%|\d\s+of\s+\d|\bpeers?\b|\bothers?\b/i);
    expect(screen.getByRole("region", { name: "Portfolios in view" }).textContent).not.toMatch(/%|\d\s+of\s+\d/);
  });

  it("UX-F19: the page is the server's page: no sort control, no client total, no page buttons", async () => {
    await mount();
    const fleet = screen.getByRole("region", { name: "Fleet on this page" });
    expect(fleet.querySelector("[aria-sort], .exec-cards-sort")).toBeNull();
    expect(within(fleet).queryByRole("button")).toBeNull();
  });
});

describe("notifications", () => {
  it("a revalidate notice reads once and leaves the banner as it was", async () => {
    const clock = createFakeClock();
    const lane = createFixtureLane(OWN);
    render(
      <MemoryRouter>
        <SliceScreen context={OWN} clock={clock} lane={lane} />
      </MemoryRouter>,
    );
    await act(async () => {
      await flush(12);
    });
    expect(lane.reads()).toBe(1);
    clock.advance(5_000);
    await press("Revalidate notice");
    expect(lane.reads()).toBe(2);
    expect(chip()).toContain("Live (fixture)");
    expect(fact("Notices")).toBe("1 received, 0 folded into an owed read, 2 reads started");
    // The notice quality is shown apart, labelled as the notice's.
    expect(screen.getByText(/Last notice: quality of the notice, not of the data/)).toBeTruthy();
  });

  it("a heartbeat changes nothing a reader could take for freshness", async () => {
    await mount();
    const before = fact("Data");
    await press("Heartbeat");
    expect(fact("Data")).toBe(before);
    expect(fact("Heartbeats")).toBe("1 (liveness only)");
    expect(fact("Notices")).toBe("0 received, 0 folded into an owed read, 1 reads started");
    expect(screen.queryByText(/Last notice/)).toBeNull();
    expect(chip()).toContain("Live (fixture)");
  });

  it("fifty notices at once cost one read: the rest are folded into an owed one", async () => {
    const clock = createFakeClock();
    await mount(OWN, clock);
    await press(/50 notices at once/);
    expect(fact("Notices")).toBe("50 received, 49 folded into an owed read, 1 reads started");
    // The owed read is paid once, when the window opens.
    await act(async () => {
      clock.advance(1_000);
      await flush(12);
    });
    expect(fact("Notices")).toBe("50 received, 49 folded into an owed read, 2 reads started");
  });

  it("UX-F03: a late frame of the previous scope is dropped and the data stays", async () => {
    await mount();
    await press("Late frame from the previous scope");
    expect(fact("Dropped")).toBe("Another connection 1");
    expect(chip()).toContain("Live (fixture)");
    expect(screen.getByRole("region", { name: "Your scope" })).toBeTruthy();
  });

  it("a malformed frame fails closed: the view re-reads instead of trusting it, and says so", async () => {
    await mount();
    await press("Malformed frame");
    expect(fact("Dropped")).toBe("Failed the published shape 1");
    // Re-read and re-opened.
    expect(chip()).toContain("Live (fixture)");
  });
});

describe("UX-F21 resync_required", () => {
  it("shows the state, then re-reads and returns to live; nothing is duplicated", async () => {
    const lane = createFixtureLane(OWN);
    const clock = createFakeClock();
    render(
      <MemoryRouter>
        <SliceScreen context={OWN} clock={clock} lane={lane} />
      </MemoryRouter>,
    );
    await act(async () => {
      await flush(12);
    });
    await press("Resync required");
    expect(lane.reads()).toBe(2);
    expect(chip()).toContain("Live (fixture)");
    expect(screen.getAllByRole("link", { name: "alpha_TEST_ONLY" })).toHaveLength(1);
  });

  it("when the re-read is held open the chip says Resync required and the data is marked not confirmed", async () => {
    const clock = createFakeClock();
    let release: () => void = () => undefined;
    const lane = createFixtureLane(OWN);
    const real = lane.port.readSnapshot.bind(lane.port);
    let calls = 0;
    lane.port.readSnapshot = async (signal: AbortSignal) => {
      calls += 1;
      if (calls === 1) return real(signal);
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return real(signal);
    };
    render(
      <MemoryRouter>
        <SliceScreen context={OWN} clock={clock} lane={lane} />
      </MemoryRouter>,
    );
    await act(async () => {
      await flush(12);
    });
    await press("Resync required");
    expect(chip()).toContain("Resync required");
    expect(text()).toContain("The projection was rebuilt.");
    expect(text()).toContain("Last read; not confirmed since.");
    await act(async () => {
      release();
      await flush(12);
    });
    expect(chip()).toContain("Live (fixture)");
  });
});

describe("UX-F03 access_revoked", () => {
  it("clears scoped data from the view at once, says why, offers the one next step, and nothing retries", async () => {
    const lane = createFixtureLane(OWN);
    const clock = createFakeClock();
    render(
      <MemoryRouter>
        <SliceScreen context={OWN} clock={clock} lane={lane} />
      </MemoryRouter>,
    );
    await act(async () => {
      await flush(12);
    });
    expect(screen.getByRole("region", { name: "Fleet on this page" })).toBeTruthy();
    await press("Access revoked");
    expect(chip()).toContain("Access revoked");
    expect(screen.queryByRole("region", { name: "Your scope" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Fleet on this page" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Portfolios in view" })).toBeNull();
    // Nothing of the scoped payload is left anywhere on the page.
    for (const leaked of ["workspace_TEST_ONLY", "portfolio_TEST_ONLY", "alpha_TEST_ONLY", "100.1234", "TEST_ONLY Alpha"]) {
      expect(text(), leaked).not.toContain(leaked);
    }
    expect(text()).toContain("Your access to this scope changed.");
    expect(screen.getByRole("link", { name: "Open My access" }).getAttribute("href")).toMatch(/^\/administration\/profile-access/);
    expect(screen.queryByRole("button", { name: /Retry/ })).toBeNull();
    // An hour later, with more frames: still no read.
    const reads = lane.reads();
    await act(async () => {
      clock.advance(3_600_000);
      await flush(12);
    });
    await press("Revalidate notice");
    expect(lane.reads()).toBe(reads);
    expect(chip()).toContain("Access revoked");
  });

  it("a snapshot read that is denied says denied, not revoked", async () => {
    const lane = createFixtureLane(OWN);
    const clock = createFakeClock();
    render(
      <MemoryRouter>
        <SliceScreen context={OWN} clock={clock} lane={lane} />
      </MemoryRouter>,
    );
    await act(async () => {
      await flush(12);
    });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "denied" } });
    clock.advance(5_000);
    await press("Revalidate notice");
    expect(chip()).toContain("Access denied");
    expect(text()).toContain("The read was denied for your current access.");
    expect(text()).not.toContain("workspace_TEST_ONLY");
  });

  it("a URL context the example does not cover is denied on the first read: the fixture never answers one scope for another", async () => {
    await mount({ workspaceId: "workspace_SOMEONE_ELSE", environment: null });
    expect(chip()).toContain("Access denied");
    expect(text()).not.toContain("workspace_TEST_ONLY");
    cleanup();
    await mount({ workspaceId: null, environment: "live" });
    expect(chip()).toContain("Access denied");
  });
});

describe("unavailable", () => {
  it("keeps the last read but marks it not confirmed; the chip is Unavailable; one pressed retry reads once", async () => {
    const lane = createFixtureLane(OWN);
    const clock = createFakeClock();
    render(
      <MemoryRouter>
        <SliceScreen context={OWN} clock={clock} lane={lane} />
      </MemoryRouter>,
    );
    await act(async () => {
      await flush(12);
    });
    await press("Source unavailable");
    expect(chip()).toContain("Unavailable");
    expect(text()).toContain("The source is not available.");
    expect(text()).toContain("Last read; not confirmed since.");
    expect(fact("Data")).toMatch(/^Last read; not confirmed since\./);
    // The data is still there, but under a stale state, never as an ok panel.
    expect(screen.getByRole("region", { name: "Fleet on this page" })).toBeTruthy();
    expect(document.querySelector('[data-status="stale"]')).not.toBeNull();
    const reads = lane.reads();
    await act(async () => {
      clock.advance(3_600_000);
      await flush(12);
    });
    expect(lane.reads()).toBe(reads);
    await press("Retry once");
    expect(lane.reads()).toBe(reads + 1);
    expect(chip()).toContain("Live (fixture)");
  });

  it("a stream the read says is not offered is unavailable with that cause, and nothing opens", async () => {
    const lane = createFixtureLane(OWN);
    lane.setNext("no_stream");
    render(
      <MemoryRouter>
        <SliceScreen context={OWN} clock={createFakeClock()} lane={lane} />
      </MemoryRouter>,
    );
    await act(async () => {
      await flush(12);
    });
    expect(chip()).toContain("Unavailable");
    expect(text()).toContain("This read has no live stream behind it.");
  });
});

describe("hygiene of the page", () => {
  it("no internal code is a heading and no cursor text is on the page", async () => {
    await mount();
    for (const heading of screen.getAllByRole("heading")) expect(heading.textContent).not.toMatch(/^[A-Z0-9_]{6,}$/);
    expect(text()).not.toContain("TEST_ONLY_ENCRYPTED_TOKEN_NOT_FOR_RUNTIME");
    expect(text()).not.toContain("TEST_ONLY:g1");
  });
});
