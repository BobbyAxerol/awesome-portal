/**
 * EL-V2-05 — the governance chain on the V2 anatomy.
 *
 * Role matrix (creator / reviewer / denied / expired) for R1 and R2, the
 * sticky decision bar's contract, the Inbox rail, and the "zero fabricated
 * write" gate: no governance screen calls anything but the published verbs.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { GateR1Review, REQUEST_CHANGES_REASON } from "./screens/GateR1Review";
import { GateR2Review } from "./screens/GateR2Review";
import { ApprovalInbox, type ApprovalRow } from "./screens/ApprovalInbox";
import { GateR1ReviewContainer } from "./screens/containers";
import { createFixtureApi } from "./api/fixtureApi";

afterEach(cleanup);

const ALL = { canApprove: true, canApproveWithCondition: true, canDeny: true };
const NONE = { canApprove: false, canApproveWithCondition: false, canDeny: false };

function r1(over: Record<string, unknown> = {}) {
  return render(
    <GateR1Review
      onCopyProvenance={vi.fn()}
      onRequestCondition={() => undefined}
      approvalId="AP-201"
      alphaLabel="RSI v1.7"
      quorumMet={1}
      quorumRequired={2}
      policyVersion="approval.v3"
      creator="Minh"
      creatorId="u_minh"
      actor="Lan"
      actorId="u_lan"
      passport={[{ label: "artifact", value: "sha256:9f3c1a7b2e4d5c6f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1e2", verification: "✓ verified" }]}
      checklist={[{ label: "engine pinned", outcome: "pass" }, { label: "capacity evidence limited", outcome: "watch" }]}
      eligibility={ALL}
      {...over}
    />,
  );
}
function r2(over: Record<string, unknown> = {}) {
  return render(
    <GateR2Review
      onCopyProvenance={vi.fn()}
      onRequestCondition={() => undefined}
      approvalId="AP-352"
      subject="Carry v3.2 → PF-MAIN · Paper · BINANCE"
      r1Id="AP-201"
      r1State="APPROVED"
      r1Href="/governance/approvals/AP-201/r1"
      r1Expiry="2026-11-01"
      policyVersion="approval.v3"
      planAuthor="Stan"
      actor="Lan"
      quorumMet={0}
      quorumRequired={1}
      readiness={[{ title: "Account & risk plan", entries: [{ label: "account", value: "paper-binance-carry-v32", revision: "rev 4" }] }]}
      capital={[{ label: "allocated", before: "0", after: "50,000", currency: "USDT" }]}
      capitalEnvelope={{ authority: "EXECUTION", asOf: "2026-08-22T10:41:07Z", freshness: "OK", formulaVersion: "capital-preview.v1" }}
      eligibility={ALL}
      grantName="paper_activation_authorization"
      {...over}
    />,
  );
}
const approve = () => screen.getByRole("button", { name: "Approve" });
const deny = () => screen.getByRole("button", { name: "Deny" });

type Role = "creator" | "reviewer" | "denied" | "expired";
const ROLES: Role[] = ["creator", "reviewer", "denied", "expired"];
function r1Over(role: Role) {
  if (role === "creator") return { actorId: "u_minh", actor: "Minh" };
  if (role === "denied") return { eligibility: NONE };
  if (role === "expired") return { locks: ["EXPIRED"] };
  return {};
}
function r2Over(role: Role) {
  if (role === "creator") return { actor: "Stan" };
  if (role === "denied") return { eligibility: NONE };
  if (role === "expired") return { locks: ["EXPIRED"] };
  return {};
}

describe.each(ROLES)("role matrix · %s", (role) => {
  it("Gate R1 locks or offers Approve/Deny exactly as the role allows, and always says why", () => {
    r1(r1Over(role));
    const canApprove = role === "reviewer";
    const canDeny = role === "reviewer" || role === "creator";
    expect(approve()).toHaveProperty("disabled", !canApprove);
    expect(deny()).toHaveProperty("disabled", !canDeny);
    const bar = screen.getByRole("region", { name: /Gate R1 decision/ });
    if (!canApprove) expect(within(bar).getAllByText(/blocked|expired|did not grant|prohibited/i).length).toBeGreaterThan(0);
    if (role === "creator") expect(screen.getByText("SoD VIOLATION")).toBeTruthy();
    else expect(screen.getByText("SoD OK")).toBeTruthy();
    // Request changes is disabled for every role: no verb is published.
    expect(screen.getByRole("button", { name: "Request changes" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Request changes" }).getAttribute("title")).toBe(REQUEST_CHANGES_REASON);
  });
  it("Gate R2 follows the same matrix", () => {
    r2(r2Over(role));
    const canApprove = role === "reviewer";
    const canDeny = role === "reviewer" || role === "creator";
    expect(approve()).toHaveProperty("disabled", !canApprove);
    expect(deny()).toHaveProperty("disabled", !canDeny);
    expect(screen.getByRole("button", { name: "Request changes" }).getAttribute("title")).toContain("BR-EX-36");
  });
});

describe("sticky decision bar", () => {
  it("prints the first lock inline and folds the rest behind a count", () => {
    r1({ actorId: "u_minh", actor: "Minh", locks: ["EXPIRED"], eligibility: NONE });
    const bar = screen.getByRole("region", { name: /Gate R1 decision/ });
    expect(within(bar).getByText(/self-approval prohibited/)).toBeTruthy();
    expect(within(bar).getByText(/more reasons?/)).toBeTruthy();
    expect(bar.className).toContain("exec-decision-bar");
  });
  it("carries the reviewer note into the decision reason", async () => {
    const api = createFixtureApi();
    const spy = vi.spyOn(api, "planDecision");
    render(<GateR1ReviewContainer api={api} approvalId="AP-201" />);
    const note = await screen.findByLabelText(/reviewer note/);
    fireEvent.change(note, { target: { value: "holdout replayed by hand — accepted" } });
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0][0].reason).toBe("holdout replayed by hand — accepted");
  });
  it("prints no lock reason once the gate is decided", () => {
    r1({ actorId: "u_minh", actor: "Minh", decided: { outcome: "DENIED", by: "Lan", at: "2026-08-21T09:12Z" } });
    expect(screen.queryByText(/self-approval prohibited/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });
});

describe("Gate R1 tabs carry what the canvas used to stack", () => {
  it("shows limitations as a typed table with expiry, and an honest empty state without them", () => {
    r1({ limitations: [{ kind: "waiver", label: "capacity", value: "capacity evidence limited", expires: "2026-11-01" }] });
    fireEvent.click(screen.getByRole("tab", { name: /Limitations/ }));
    expect(screen.getByRole("row", { name: /waiver capacity/ })).toBeTruthy();
    expect(screen.getByText("2026-11-01")).toBeTruthy();
    cleanup();
    r1();
    fireEvent.click(screen.getByRole("tab", { name: /Limitations/ }));
    expect(screen.getByText(/No limitations, restrictions or waivers were published/)).toBeTruthy();
  });
  it("says the research evidence series is not published rather than drawing an empty frame", () => {
    const { container } = r1();
    fireEvent.click(screen.getByRole("tab", { name: /Evidence/ }));
    expect(screen.getByText(/not published for this approval — BR-EX-34/)).toBeTruthy();
    expect(container.querySelector("canvas")).toBeNull();
  });
});

describe("Gate R2 capital preview is a preview, not a theme", () => {
  it("renders one PLAN PREVIEW chip inside an elevated panel and never an inverted surface", () => {
    const { container } = r2();
    expect(container.querySelector(".exec-preview-panel")).not.toBeNull();
    expect(container.querySelector(".exec-inverted")).toBeNull();
    expect(screen.getAllByText("PLAN PREVIEW")).toHaveLength(1);
  });
});

describe("Approval Inbox rail and strip", () => {
  const row = (over: Partial<ApprovalRow> = {}): ApprovalRow => ({
    id: "AP-201",
    gate: "R1",
    subject: "RSI v1.7 · RC-41",
    target: "research",
    blockerCount: 0,
    blockerSummary: null,
    sla: { ageMinutes: 120, budgetMinutes: 1440 },
    quorumMet: 1,
    quorumRequired: 2,
    inert: null,
    needsYou: true,
    ...over,
  });
  it("puts the first request that needs you in the rail with an Open control", () => {
    const onOpen = vi.fn();
    render(
      <ApprovalInbox
        onCopyProvenance={vi.fn()}
        page={{ rows: [row({ id: "AP-360", inert: "BLOCKED", needsYou: false }), row()], totalCount: 2 }}
        counts={{ pending: 2, overdue: 0, dueSoon: 0 }}
        filter="INBOX"
        onOpenRequest={onOpen}
      />,
    );
    expect(screen.getByText("Needs you: AP-201")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open AP-201" }));
    expect(onOpen).toHaveBeenCalledWith("AP-201", "R1");
    expect(screen.getByText("AP-360 BLOCKED")).toBeTruthy();
  });
  it("names the overdue rows as blockers and keeps the SLA as a bar plus number", () => {
    const { container } = render(
      <ApprovalInbox
        onCopyProvenance={vi.fn()}
        page={{ rows: [row({ sla: { ageMinutes: 1500, budgetMinutes: 1440, state: "OVERDUE" } })], totalCount: 1 }}
        counts={{ pending: 1, overdue: 1, dueSoon: 0 }}
        filter="INBOX"
      />,
    );
    expect(screen.getByText("AP-201 OVERDUE")).toBeTruthy();
    const fill = container.querySelector(".exec-sla-fill") as HTMLElement;
    expect(fill.style.width).toBe("100%");
  });
  it("offers full history only as a disabled control with its backend request named", () => {
    render(
      <ApprovalInbox onCopyProvenance={vi.fn()} page={{ rows: [row()], totalCount: 1 }} decided={{ rows: [], totalCount: 0 }} counts={{ pending: 1, overdue: 0, dueSoon: 0 }} filter="INBOX" />,
    );
    fireEvent.click(screen.getByRole("tab", { name: /Recently decided/ }));
    const history = screen.getByRole("button", { name: /Full history/ });
    expect(history).toHaveProperty("disabled", true);
    expect(history.getAttribute("title")).toContain("BR-EX-35");
  });
});

describe("zero fabricated write path", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const read = (rel: string) => readFileSync(join(here, rel), "utf8");
  it("governance screens never talk to the network themselves", () => {
    for (const f of ["screens/ApprovalInbox.tsx", "screens/GateR1Review.tsx", "screens/GateR2Review.tsx", "screens/PaperExitReview.tsx", "components/decisionBar.tsx"]) {
      const src = read(f);
      expect(src, f).not.toMatch(/fetch\(|XMLHttpRequest|EventSource|api\./);
    }
  });
  it("containers use only the published decision verbs", () => {
    const src = read("screens/containers.tsx");
    const verbs = new Set(src.match(/api\.(\w+)\(/g)?.map((m) => m.slice(4, -1)));
    const writes = [...verbs].filter((v) => /^(plan|apply|decide|request|approve|deny|post|put|delete)/i.test(v));
    expect(writes.sort()).toEqual(["applyPlan", "planDecision"]);
    expect(src).not.toMatch(/REQUEST_CHANGES/);
  });
});
