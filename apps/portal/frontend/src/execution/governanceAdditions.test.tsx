/**
 * The three owner-commissioned governance screens (2026-08-30, ROADMAP §H.2):
 * loop entry, the live gate's own review room, and the fleet-wide obligations
 * register. Each is tested for its composition, its honesty rails (declared
 * SMOKE + backend-request pointer), and the cross-links that stitch it into
 * the screens that already exist.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../charts/EChart", () => ({
  EChart: ({ id, height }: { id?: string; height: number }) => <div data-echart id={id} data-height={height} />,
}));

import { NewApprovalRequestScreen } from "./screens/NewApprovalRequest";
import { GateLiveReviewContainer } from "./screens/containers";
import { WaiversRegisterScreen } from "./screens/WaiversRegister";
import { reviewRouteFor } from "./screens/ApprovalInbox";
import { WAIVER_ROWS } from "./governance.smoke";
import { createFixtureApi } from "./api/fixtureApi";

afterEach(cleanup);

describe("loop entry — New approval request", () => {
  it("declares the demo and pins everything to registries", () => {
    render(<NewApprovalRequestScreen />);
    expect(screen.getByText(/SMOKE DATA/).textContent).toContain("BR-EX-69");
    expect(screen.getByText(/never free-typed/)).toBeTruthy();
    expect(screen.getByLabelText("Alpha (from the alpha registry)")).toBeTruthy();
    expect(screen.getByText(/R2 \(capital\) requires an approved R1/)).toBeTruthy();
  });

  it("blocks submit until the summary is a real sentence", () => {
    render(<NewApprovalRequestScreen />);
    const submit = screen.getByRole("button", { name: "Submit for R1 review" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText(/What this alpha does/), {
      target: { value: "Carry basis harvest across funding regimes." },
    });
    expect((screen.getByRole("button", { name: "Submit for R1 review" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("the confirmation says nothing was persisted, and links to the Inbox", () => {
    render(<NewApprovalRequestScreen />);
    fireEvent.change(screen.getByPlaceholderText(/What this alpha does/), {
      target: { value: "Carry basis harvest across funding regimes." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit for R1 review" }));
    expect(screen.getByText(/nothing was written/)).toBeTruthy();
    expect(screen.getByText(/was not persisted \(BR-EX-69\)/)).toBeTruthy();
    expect(document.querySelector('a[href="/governance/approvals"]')).toBeTruthy();
    // The requester is told they cannot approve their own request.
    expect(screen.getByText(/separation of duty/)).toBeTruthy();
  });
});

describe("live gate — its own review room", () => {
  it("LIVE_GATE rows route to /live, not to the R2 composition", () => {
    expect(reviewRouteFor({ id: "AP-311", gate: "LIVE_GATE" })).toBe(
      "/governance/approvals/AP-311/live",
    );
  });

  it("shows canary evidence with links back to R2 and the control room", async () => {
    render(<GateLiveReviewContainer api={createFixtureApi()} approvalId="AP-311" />);
    expect(await screen.findByText(/Canary Evidence Approval/)).toBeTruthy();
    expect(document.querySelector('a[href="/governance/approvals/AP-152/r2"]')).toBeTruthy();
    expect(document.querySelector('a[href="/deployments/live/dep_88/canary"]')).toBeTruthy();
    expect(screen.getByText(/fill Δ vs paper twin/)).toBeTruthy();
    expect(screen.getAllByText(/gate_live rev 3/).length).toBeGreaterThan(0);
    expect(screen.getByText(/BR-EX-70/)).toBeTruthy();
  });

  it("approval grants the step only — activation stays with the Action Drawer", async () => {
    render(<GateLiveReviewContainer api={createFixtureApi()} approvalId="AP-311" />);
    expect(await screen.findByText(/Approve grants the capital step and the LIVE stage only/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Approve live step" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Deny — back to canary/ })).toBeTruthy();
  });
});

describe("waivers & conditions — the fleet-wide register", () => {
  it("lists every cast condition with a working source link", () => {
    render(<WaiversRegisterScreen />);
    for (const row of WAIVER_ROWS) {
      expect(document.querySelector(`a[href="${row.source.href}"]`), row.id).toBeTruthy();
    }
    expect(screen.getByText(/what the fund owes, fleet-wide/)).toBeTruthy();
    expect(screen.getByText(/BR-EX-71/)).toBeTruthy();
  });

  it("filters narrow the demo rows and the foot says how many are shown", () => {
    render(<WaiversRegisterScreen />);
    fireEvent.click(screen.getByRole("button", { name: "EXPIRING" }));
    const shown = document.querySelectorAll(".exec-gate-wvtable tbody tr.exec-wv-row");
    expect(shown.length).toBe(WAIVER_ROWS.filter((r) => r.state === "EXPIRING").length);
    expect(screen.getByText(new RegExp(`${shown.length} of ${WAIVER_ROWS.length} shown`))).toBeTruthy();
  });

  it("a row expands to say what CLOSES it — an obligation without a closing path is a trap", () => {
    render(<WaiversRegisterScreen />);
    // cn_103 starts expanded (the most urgent row leads); collapse and expand another.
    expect(screen.getByText(/closes by the live-gate decision on AP-311/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Capacity at target weight/ }));
    expect(screen.getByText(/closes by an R2 amendment recording capacity/)).toBeTruthy();
    expect(screen.getAllByText(/closing is a decision on that surface/).length).toBe(1);
  });

  it("the runway puts every clocked obligation on one shared axis, honest about the event-bound", () => {
    render(<WaiversRegisterScreen />);
    const lanes = document.querySelectorAll(".exec-wv-lane");
    const clocked = WAIVER_ROWS.filter((r) => r.dueDays !== null && (r.state === "OPEN" || r.state === "EXPIRING"));
    expect(lanes.length).toBe(clocked.length);
    expect(screen.getByText(/event-bound, not\s+clocked/)).toBeTruthy();
    // Motion is off in jsdom-with-webdriver? Not set here — the tick hook is
    // gated by smokeMotionAllowed; either way the countdown text is a real
    // remainder, tabular and non-empty.
    expect(screen.getAllByText(/\d+d \d{2}:\d{2}:\d{2}/).length).toBeGreaterThan(0);
  });

  it("the strip answers 'how much and how urgent' before the table", () => {
    render(<WaiversRegisterScreen />);
    expect(screen.getByText("Open + expiring")).toBeTruthy();
    expect(screen.getByText("Next to lapse")).toBeTruthy();
    expect(screen.getByText(/where the debt sits/)).toBeTruthy();
  });
});
