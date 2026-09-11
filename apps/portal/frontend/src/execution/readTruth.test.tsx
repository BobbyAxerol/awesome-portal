/**
 * §8.59 · the server owns the answer to "is this empty?", and refusal is never
 * that answer.
 *
 * Two separate claims are tested here, and they fail for different reasons:
 *
 *  1. The screen must not widen the server's scope. `EMPTY` is about one
 *     authorized request — a view, its filters, its opaque cursor — so the
 *     sentence says so. The old "Inbox zero" was the whole-workspace claim this
 *     replaces.
 *  2. The screen must not narrow a refusal into an absence. A 401, a 403, a
 *     concealed 404, a named `unavailable` panel or a policy block is not
 *     "nothing here", and §8.59 point 3 says so in as many words. The sharp
 *     case is a refusal that *also* carries `read_truth: EMPTY`: the refusal
 *     wins, every time.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ApprovalInbox } from "./screens/ApprovalInbox";
import { emptyScopeLine, emptyScopeTitle, serverSaysEmpty } from "./readTruthCopy";
import type { PanelStatus, ReadTruth } from "./contracts";

const EMPTY: ReadTruth = { state: "EMPTY", reasonCode: "NO_MATCHING_PORTAL_GOVERNANCE_RECORDS", scope: "REQUEST" };
const AVAILABLE: ReadTruth = { state: "AVAILABLE", reasonCode: null, scope: "REQUEST" };

/** Every sentence the screen is capable of using to say "there is nothing". */
const EMPTINESS_CLAIMS = [/matches/i, /did not state whether any exist/i];

describe("§8.59 · silence is not emptiness", () => {
  it("claims nothing when the server said nothing", () => {
    expect(serverSaysEmpty(null)).toBe(false);
    expect(serverSaysEmpty(undefined)).toBe(false);
    expect(emptyScopeTitle(null)).toBe("Nothing came back");
    expect(emptyScopeLine(null, "Inbox")).toMatch(/did not state whether any exist/);
    expect(emptyScopeLine(null, "Inbox")).not.toMatch(/matches/);
  });

  it("does not treat AVAILABLE as empty either", () => {
    expect(serverSaysEmpty(AVAILABLE)).toBe(false);
    expect(emptyScopeLine(AVAILABLE, "Inbox")).toMatch(/did not state/);
  });

  it("always carries the scope with the claim", () => {
    const line = emptyScopeLine(EMPTY, "Overdue");
    expect(line).toMatch(/No record matches Overdue/);
    expect(line).toMatch(/this request's scope only/);
    expect(line).toMatch(/NO_MATCHING_PORTAL_GOVERNANCE_RECORDS/);
  });

  it("counts what the server counted outside the scope, and stays silent when it counted nothing", () => {
    expect(emptyScopeLine(EMPTY, "Overdue", 5)).toMatch(/5 pending outside it/);
    // Not published is not zero: no sentence rather than "0 pending outside".
    expect(emptyScopeLine(EMPTY, "Overdue", null)).not.toMatch(/pending outside it/);
    expect(emptyScopeLine(EMPTY, "Overdue", 0)).not.toMatch(/pending outside it/);
  });

  it("names the rows for the surface it is on", () => {
    expect(emptyScopeLine(EMPTY, "this view", null, "operation")).toMatch(/No operation matches/);
    expect(emptyScopeLine(EMPTY, "this view", null, "operation")).toMatch(/operations may exist outside it/);
  });
});

describe("§8.59 point 3 · a refusal is never rendered as an absence", () => {
  const inbox = (status: PanelStatus, reason?: string) => render(
    <ApprovalInbox onCopyProvenance={vi.fn()}
      status={status}
      reason={reason}
      // The trap: zero rows AND the server's own EMPTY, on a read that was not
      // answered with records.
      page={{ rows: [], totalCount: 0, filteredCount: 0, readTruth: EMPTY }}
      counts={{ pending: 0, overdue: 0, dueSoon: 0 }}
      filter="INBOX"
    />,
  );

  /*
   * The assertions below are on the sentence, not on `[data-status="empty"]`.
   * The Inbox renders a second panel for the decided list, and with no decided
   * page passed that panel is legitimately empty — an element selector would
   * have been matching it and calling the screen wrong. The emptiness *claims*
   * belong only to the pending read, which is what §8.59 governs.
   */
  const REFUSALS: readonly { status: PanelStatus; reason: string }[] = [
    { status: "denied", reason: "You do not hold the approver role for this workspace." },
    { status: "unavailable", reason: "The governance BFF is not wired to a real endpoint." },
    { status: "terminal", reason: "The approval workflow was closed by policy." },
    { status: "insufficient_data", reason: "The approver roster has not been published." },
  ];

  for (const { status, reason } of REFUSALS) {
    it(`renders ${status} as ${status}, even when the envelope also says EMPTY`, () => {
      const { container } = inbox(status, reason);
      expect(container.querySelector(`.exec-state[data-status="${status}"]`)).not.toBeNull();
      for (const claim of EMPTINESS_CLAIMS) {
        expect(screen.queryByText(claim), `${status} must not read as emptiness`).toBeNull();
      }
    });

    /*
     * The case above passes for the wrong reason on its own: the screen reads
     * `reason ?? <computed>`, so a supplied reason short-circuits the emptiness
     * sentence whether or not the status guard exists. Proving the guard red
     * showed exactly that — the deliberate regression stayed green. A refusal
     * that carries no reason string is where the guard actually has to hold.
     */
    it(`renders ${status} as ${status} when the server sent no reason either`, () => {
      const { container } = inbox(status);
      expect(container.querySelector(`.exec-state[data-status="${status}"]`)).not.toBeNull();
      for (const claim of EMPTINESS_CLAIMS) {
        expect(screen.queryByText(claim), `${status} must not read as emptiness`).toBeNull();
      }
    });
  }

  it("does not claim emptiness before the read has answered", () => {
    // `loading` draws skeleton rows rather than a state panel, so this asserts
    // the thing that matters rather than a specific element.
    inbox("loading");
    for (const claim of EMPTINESS_CLAIMS) {
      expect(screen.queryByText(claim)).toBeNull();
    }
  });

  it("keeps the refusal's own words, because the server is the policy enforcer", () => {
    inbox("denied", "You do not hold the approver role for this workspace.");
    expect(screen.getByText(/do not hold the approver role/)).toBeTruthy();
  });

  it("a scan that finds nothing is not a pass: the claims it looks for do exist", () => {
    // If the copy is renamed, the guards above would silently stop guarding.
    render(
      <ApprovalInbox onCopyProvenance={vi.fn()}
        page={{ rows: [], totalCount: 0, filteredCount: 0, readTruth: EMPTY }}
        counts={{ pending: 0, overdue: 0, dueSoon: 0 }}
        filter="INBOX"
      />,
    );
    expect(screen.queryByText(EMPTINESS_CLAIMS[0])).not.toBeNull();
  });
});
