/**
 * G2 · the flow of Operations is readable: every Next control says where it leads, a Review for an operation with no incident says there is
 * nothing to act on, and the Range and Lens survive a change of tab (they are in the address and on screen on every tab).
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { answerOperationsV2 } from "../../../../../e2e/bffDoubleV2";
import type { ExecutionApi, Result } from "../../../api/ports";
import { operationalQueueSearch, readOperationalQueueV2, type OperationalQueueQueryV2, type OperationalQueueReadV2, type OperationV2 } from "../../readers/operationalQueue";
import OperationsV2 from "./index";
import { hasIncident, nextStepOf } from "./opsViews";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const NOW = new Date("2026-08-22T13:00:00Z");

function fromDouble(query: OperationalQueueQueryV2): Result<OperationalQueueReadV2> {
  const answer = answerOperationsV2("GET", "/operations", operationalQueueSearch(query));
  const read = answer === null || answer.status !== 200 ? null : readOperationalQueueV2(answer.body);
  return read === null ? { ok: false, status: "unavailable", reason: "unreadable" } : { ok: true, value: read };
}

function fakeApi(): ExecutionApi {
  return { listOperationalQueueV2: vi.fn(async (query: OperationalQueueQueryV2) => fromDouble(query)), getIncidentRootV2: vi.fn() } as unknown as ExecutionApi;
}

function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{pathname + search}</output>;
}

function mount(entry = "/execution/operations") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <OperationsV2 api={fakeApi()} now={NOW} />
      <Where />
    </MemoryRouter>,
  );
}

const base = {
  sourceStatus: "SUCCEEDED", verificationResult: "SUCCEEDED", deliveryState: undefined, displayState: undefined, triageState: "UNACKNOWLEDGED", incidentLinks: undefined,
} as unknown as Pick<OperationV2, "sourceStatus" | "verificationResult" | "deliveryState" | "displayState" | "triageState" | "incidentLinks">;

describe("nextStepOf: each control says where it leads", () => {
  it("names the destination of all four controls", () => {
    expect(nextStepOf({ ...base, sourceStatus: "UNCERTAIN" })).toMatchObject({ action: "check-original", leadsTo: "Opens this operation. Do not send it again." });
    expect(nextStepOf({ ...base, displayState: "CATCHING_UP" })).toMatchObject({ action: "display-updating", leadsTo: "Nothing to do yet: the figures are catching up." });
    expect(nextStepOf({ ...base, deliveryState: "AWAITING_RECEIPT" })).toMatchObject({ action: "open-obligations", leadsTo: expect.stringContaining("target's obligations") });
    expect(nextStepOf(base).action).toBe("review");
  });

  it("a Review with no readable incident says there is nothing to resolve; with an incident it points at it", () => {
    expect(hasIncident(base)).toBe(false);
    expect(nextStepOf(base).leadsTo).not.toMatch(/\bno incidents?\b/i);
    expect(nextStepOf(base).leadsTo).toMatch(/No readable incident is linked, so there is nothing to resolve/);
    expect(nextStepOf(base).dock).toMatch(/acknowledging is not offered yet/);
    const linked = { ...base, incidentLinks: { items: [], authorizedLinkCount: 1, truncated: false } } as unknown as typeof base;
    expect(hasIncident(linked)).toBe(true);
    expect(nextStepOf(linked).leadsTo).toMatch(/linked incident/);
    // An empty list is "none you can read", which is not a claim that an incident exists.
    expect(hasIncident({ incidentLinks: { items: [], authorizedLinkCount: 0, truncated: false } } as unknown as typeof base)).toBe(false);
  });
});

describe("the queue rows", () => {
  it("every row's Next cell carries one line saying where it leads", async () => {
    mount();
    const t = await screen.findByRole("table", { name: "Commands" });
    const rows = within(t).getAllByRole("row").slice(1);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const hint = row.querySelector('[data-role="next-hint"]');
      expect(hint, row.textContent ?? "").not.toBeNull();
      expect((hint!.textContent ?? "").length).toBeGreaterThan(10);
    }
  });

  it("opening a row puts the same step at the top of the dock", async () => {
    mount();
    const t = await screen.findByRole("table", { name: "Commands" });
    fireEvent.click(within(t).getAllByRole("button", { name: /^(Review|Check original request)$/ })[0]);
    const dock = await screen.findByRole("complementary");
    const step = dock.querySelector('[data-role="next-step"]');
    const banner = dock.querySelector('[data-tone="unknown"]');
    expect(step !== null || banner !== null).toBe(true);
  });
});

describe("Range and Lens stay across the tabs", () => {
  it("shows both controls on Exceptions and Audit, and keeps them in the address", async () => {
    mount("/execution/operations?range=7d&lens=all");
    await screen.findByRole("table", { name: "Commands" });
    expect(screen.getByRole("button", { name: "7D" }).getAttribute("aria-pressed")).toBe("true");
    for (const tab of ["Exceptions", "Audit", "Commands"]) {
      fireEvent.click(screen.getByRole("tab", { name: new RegExp(`^${tab}`) }));
      await waitFor(() => expect(screen.getByRole("tab", { name: new RegExp(`^${tab}`) }).getAttribute("aria-selected")).toBe("true"));
      const where = screen.getByTestId("where").textContent ?? "";
      expect(where, tab).toContain("range=7d");
      expect(where, tab).toContain("lens=all");
      expect(screen.getByRole("button", { name: "7D" }).getAttribute("aria-pressed"), tab).toBe("true");
      expect(within(screen.getByRole("group", { name: "Lens" })).getByRole("button", { name: "All" }).getAttribute("aria-pressed"), tab).toBe("true");
    }
  });

  it("Source belongs to Commands only", async () => {
    mount("/execution/operations?view=exceptions");
    await screen.findByRole("tab", { name: /^Exceptions/ });
    expect(screen.queryByRole("button", { name: "Admin journal" })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: /^Commands/ }));
    expect(await screen.findByRole("button", { name: "Admin journal" })).toBeTruthy();
  });

  it("changing the Range on Exceptions writes it to the address", async () => {
    mount("/execution/operations?view=exceptions");
    await screen.findByRole("tab", { name: /^Exceptions/ });
    fireEvent.click(screen.getByRole("button", { name: "30D" }));
    await waitFor(() => expect(screen.getByTestId("where").textContent).toContain("range=30d"));
    expect(screen.getByTestId("where").textContent).toContain("view=exceptions");
  });
});
