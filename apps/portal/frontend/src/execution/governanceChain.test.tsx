/**
 * EL-V2-05 — the governance chain on the V2 anatomy.
 *
 * Role matrix (creator / reviewer / denied / expired) for R1 and R2, the
 * sticky decision bar's contract, the Inbox rail, and the "zero fabricated
 * write" gate: no governance screen calls anything but the published verbs.
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { GateR1Review, REQUEST_CHANGES_NOTE_REASON } from "./screens/GateR1Review";
import { GateR2Review } from "./screens/GateR2Review";
import { R1EvidenceSmoke, R2CriteriaSmoke, R2FitSmoke, R2StagesSmoke, R1_POLICY_CHIP } from "./lab/governanceDemo";
import { ApprovalInbox, type ApprovalRow, type DecidedRow } from "./screens/ApprovalInbox";
import { ApprovalInboxContainer } from "./screens/containers";
import { readDecidedRow } from "./api/rows";
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
      evidence={<R1EvidenceSmoke />}
      policyChip={R1_POLICY_CHIP}
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
      fitPanel={<R2FitSmoke />}
      criteriaPanel={<R2CriteriaSmoke />}
      stageChips={<R2StagesSmoke />}
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
    if (role === "creator") expect(screen.getByText(/separation-of-duty VIOLATION/)).toBeTruthy();
    else expect(screen.getByText(/separation-of-duty OK|separation-of-duty: plan author/)).toBeTruthy();
    // Request changes stays locked here: either the server has not granted the
    // verb for this role, or no reason has been written yet — never silently.
    expect(screen.getByRole("button", { name: "Request changes" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Request changes" }).getAttribute("title")).toMatch(/Request changes/);
  });
  it("Gate R2 follows the same matrix", () => {
    r2(r2Over(role));
    const canApprove = role === "reviewer";
    const canDeny = role === "reviewer" || role === "creator";
    expect(approve()).toHaveProperty("disabled", !canApprove);
    expect(deny()).toHaveProperty("disabled", !canDeny);
    expect(screen.getByRole("button", { name: "Request changes" }).getAttribute("title")).toMatch(/Request changes/);
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
    // Settle the decide chain inside act — the N29 acceptance requires a
    // warning-free suite.
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  });
  it("prints no lock reason once the gate is decided", () => {
    r1({ actorId: "u_minh", actor: "Minh", decided: { outcome: "DENIED", by: "Lan", at: "2026-08-21T09:12Z" } });
    expect(screen.queryByText(/self-approval prohibited/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });
});

describe("Gate R1 tabs carry what the canvas used to stack", () => {
  it("shows limitations as typed lines with expiry, and an honest empty state without them", () => {
    // Hi-fi 1a: the panel is a list of typed statements, not a table.
    r1({ limitations: [{ kind: "waiver", label: "capacity", value: "capacity evidence limited", expires: "2026-11-01" }] });
    expect(screen.getByText(/capacity — capacity evidence limited/)).toBeTruthy();
    expect(screen.getByText(/expires 2026-11-01/)).toBeTruthy();
    cleanup();
    r1();
    expect(screen.getByText(/No limitations, restrictions or waivers were published/)).toBeTruthy();
  });
  it("draws the evidence slot as declared smoke charts, labeled — never an unlabeled frame", () => {
    r1();
    expect(screen.getAllByText(/reference shape for BR-EX-67/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByLabelText("Equity across window roles")).toBeTruthy();
  });
});

describe("Gate R2 — criteria, fit and stage eligibility (smoke frames)", () => {
  it("renders the gate-criteria table with server-worded verdicts and the policy chip", () => {
    r2({});
    expect(screen.getByText("gate_r2 rev 7 · effective 2026-07-01 · declared by Risk admin")).toBeTruthy();
    expect(screen.getAllByText("✓ PASS")).toHaveLength(4);
    expect(screen.getByText(/! WAIVERABLE/)).toBeTruthy();
    expect(screen.getByText(/4 PASS · 1 WAIVERABLE · 0 FAIL/)).toBeTruthy();
  });
  it("derives stage chips from gate policies and says so", () => {
    r2({});
    const chips = screen.getByRole("group", { name: /Stage eligibility/ });
    expect(within(chips).getByText(/PAPER — eligible now/)).toBeTruthy();
    expect(within(chips).getByText(/SANDBOX — needs obs/)).toBeTruthy();
    expect(within(chips).getByText(/CANARY — needs sandbox cert/)).toBeTruthy();
  });
  it("opens Readiness with the portfolio-fit panel, labeled as research estimates", () => {
    r2({});
    expect(screen.getByText("target capital weight")).toBeTruthy();
    expect(screen.getByText("8.0%")).toBeTruthy();
    expect(screen.getByText(/Paper observation will replace them with measured values/)).toBeTruthy();
  });
});

describe("Gate R2 capital preview is a preview, not a theme", () => {
  it("renders exactly one deliberately inverse EXECUTION panel, labeled PLAN PREVIEW", () => {
    // Hi-fi 1b (owner copy 2026-08-30): the capital preview is the ONE
    // near-black block in the light review room — Execution vocabulary wears
    // Execution surface. One inverse panel, one PLAN PREVIEW label, no more.
    const { container } = r2();
    expect(container.querySelectorAll(".exec-gov-inverse")).toHaveLength(1);
    expect(screen.getAllByText(/PLAN PREVIEW/)).toHaveLength(1);
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
  const decided = (over: Partial<DecidedRow> = {}): DecidedRow => ({
    id: "AP-259" as DecidedRow["id"],
    gate: "R2",
    subject: "MM v1.1 → OKX sandbox",
    outcome: "APPROVED_WITH_CONDITION",
    decidedBy: "Lan",
    decidedAt: "2026-07-18T14:30:00Z",
    policyVersion: "approval.v3",
    ...over,
  });
  it("a row navigates to its gate's review screen (hi-fi: row to gate review)", () => {
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
    // Hi-fi 4a: the row itself is the affordance — row → gate review screen.
    fireEvent.click(screen.getByText("AP-201").closest("tr") as HTMLElement);
    expect(onOpen).toHaveBeenCalledWith("AP-201", "R1");
  });
  it("keeps the SLA as a number plus a bar, full and red when overdue", () => {
    const { container } = render(
      <ApprovalInbox
        onCopyProvenance={vi.fn()}
        page={{ rows: [row({ sla: { ageMinutes: 1500, budgetMinutes: 1440, state: "OVERDUE" } })], totalCount: 1 }}
        counts={{ pending: 1, overdue: 1, dueSoon: 0 }}
        filter="INBOX"
      />,
    );
    const fill = container.querySelector(".exec-sla-fill") as HTMLElement;
    expect(fill.style.width).toBe("100%");
    expect(container.querySelector(".exec-sla[data-overdue=\"true\"]")).toBeTruthy();
  });
  it("states a whole history window instead of a dead Full-history button; offers the control only when the page says has_more", () => {
    // `governance.approval-history.v1` is a keyset page. A window with
    // has_more=false IS the full history — say so; a button would be a promise.
    const { unmount } = render(
      <ApprovalInbox onCopyProvenance={vi.fn()} page={{ rows: [row()], totalCount: 1 }} decided={{ rows: [decided()], totalCount: 1, hasMore: false }} counts={{ pending: 1, overdue: 0, dueSoon: 0 }} filter="INBOX" />,
    );
    expect(screen.queryByRole("button", { name: /Full history/ })).toBeNull();
    expect(screen.getByText(/full history loaded · 1 decisions/)).toBeTruthy();
    unmount();
    const onOlder = vi.fn();
    render(
      <ApprovalInbox onCopyProvenance={vi.fn()} page={{ rows: [row()], totalCount: 1 }} decided={{ rows: [decided()], totalCount: 4, hasMore: true }} counts={{ pending: 1, overdue: 0, dueSoon: 0 }} filter="INBOX" onLoadOlderDecided={onOlder} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Full history/ }));
    expect(onOlder).toHaveBeenCalled();
  });

  it("draws the decided list in the approval-history shape: outcome chip, decider and date — never blockers", () => {
    render(
      <ApprovalInbox onCopyProvenance={vi.fn()} page={{ rows: [row()], totalCount: 1 }} decided={{ rows: [decided()], totalCount: 1 }} counts={{ pending: 1, overdue: 0, dueSoon: 0 }} filter="INBOX" />,
    );
    const table = screen.getByRole("table", { name: "Recently decided" });
    expect(within(table).getByText("APPROVED_WITH_CONDITION")).toBeTruthy();
    expect(within(table).getByText(/2026-07-18 · Lan/)).toBeTruthy();
    expect(within(table).queryByText(/blockers/)).toBeNull();
  });

  it("Request changes enables only when the server grants the verb and a reason is written", () => {
    const onRequestChanges = vi.fn();
    r1({ eligibility: { ...ALL, canRequestChanges: true }, note: "", onRequestChanges });
    const btn = () => screen.getByRole("button", { name: "Request changes" });
    expect(btn()).toHaveProperty("disabled", true);
    expect(btn().getAttribute("title")).toBe(REQUEST_CHANGES_NOTE_REASON);
    cleanup();
    r1({ eligibility: { ...ALL, canRequestChanges: true }, note: "holdout coverage is too thin", onRequestChanges });
    expect(btn()).toHaveProperty("disabled", false);
    fireEvent.click(btn());
    expect(onRequestChanges).toHaveBeenCalled();
  });

  it("draws the R1 evidence smoke charts with their SMOKE notes when no series is published", () => {
    r1({});
    expect(screen.getByLabelText("Equity across window roles")).toBeTruthy();
    expect(screen.getByLabelText("WFO stability — Sharpe per fold")).toBeTruthy();
    expect(screen.getAllByText(/SMOKE DATA/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/window roles fixed by claim clm_31/)).toBeTruthy();
  });

  it("loads the canonical approval-history fixture through the decided-row reader", () => {
    const fixture = JSON.parse(
      readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../../../../packages/contracts/fixtures/execution-governance.approval-history.valid.json"), "utf8"),
    ) as { page: { rows: Record<string, unknown>[] } };
    const read = fixture.page.rows.map((r) => readDecidedRow(r));
    expect(read.every((r) => r.row !== null)).toBe(true);
    expect(read[0].row!.outcome).toBe("CHANGES_REQUESTED");
    expect(read[0].row!.decidedBy).toBe("bobby");
  });

  it("counts Mine over the whole queue and ticks toward the next SLA breach", async () => {
    render(<ApprovalInboxContainer api={createFixtureApi()} />);
    await screen.findByText("AP-352");
    expect(screen.getByRole("button", { name: "Mine (3)" })).toBeTruthy();
    expect(screen.getByText(/next SLA breach in/)).toBeTruthy();
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
    // REQUEST_CHANGES is a published verb since N09 (governance-approval-workflow
    // schema); containers may send it, and only through planDecision.
    expect(src.match(/decide\("REQUEST_CHANGES"|run\("REQUEST_CHANGES"/g)?.length).toBe(2);
  });
});
