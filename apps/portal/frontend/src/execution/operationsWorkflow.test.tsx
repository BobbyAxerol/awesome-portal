/**
 * EL-V2-07 — one triage → verify workflow. Ranked attention, truthful
 * BUSY/QUIET, a rail that follows the selected row, the §9.2 terminal that
 * never calls a 202 success, and the authority negatives.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { CommandCenterScreen, rankTriage } from "./screens/CommandCenter";
import { OperationsQueueContainer, AdminCatalogueContainer, IncidentDetailContainer } from "./screens/containers";
import { OperationsQueueScreen } from "./screens/OperationsQueue";
import type { QueueRow } from "./operations";
import { CommandPlanDrawer, terminalRows, terminalVerdict } from "./components/drawer";
import { readCommandCenter } from "./commandCenter";
import { CC_FIXTURES } from "./commandCenter.fixtures";
import { createFixtureApi } from "./api/fixtureApi";
import type { TriageItem } from "./commandCenter";
import { MemoryRouter } from "react-router-dom";

afterEach(cleanup);

const item = (over: Partial<TriageItem>): TriageItem => ({
  id: "x",
  kind: "INCIDENT",
  title: "t",
  summary: "s",
  severity: "LOW",
  slaState: "ON_TRACK",
  slaDueAt: null,
  authority: null,
  asOf: null,
  href: "/x",
  actionLabel: null,
  rank: null,
  ageSeconds: 0,
  ...over,
});

describe("Command Center ranks attention, never array order", () => {
  it("orders by severity, then SLA, then age when the server publishes no rank", () => {
    const shuffled = [
      item({ id: "low-old", severity: "LOW", ageSeconds: 9000 }),
      item({ id: "crit", severity: "CRITICAL", ageSeconds: 10 }),
      item({ id: "high-overdue", severity: "HIGH", slaState: "OVERDUE", ageSeconds: 100 }),
      item({ id: "high-ontrack-older", severity: "HIGH", slaState: "ON_TRACK", ageSeconds: 5000 }),
      item({ id: "high-ontrack", severity: "HIGH", slaState: "ON_TRACK", ageSeconds: 50 }),
    ];
    expect(rankTriage(shuffled).map((i) => i.id)).toEqual(["crit", "high-overdue", "high-ontrack-older", "high-ontrack", "low-old"]);
  });
  it("lets the server's rank win over the local keys", () => {
    const items = [item({ id: "b", severity: "CRITICAL", rank: 2 }), item({ id: "a", severity: "LOW", rank: 1 })];
    expect(rankTriage(items).map((i) => i.id)).toEqual(["a", "b"]);
  });
  it("renders the ranked list first and the fleet strip after it, with BUSY in the masthead", () => {
    const busyKey = Object.keys(CC_FIXTURES)[0];
    const snapshot = readCommandCenter(CC_FIXTURES[busyKey as keyof typeof CC_FIXTURES])!;
    const { container } = render(<CommandCenterScreen snapshot={snapshot} onOpen={() => undefined} />);
    const list = screen.getByLabelText("Needs you now");
    const fleet = screen.getByLabelText("Fleet health");
    expect(list.compareDocumentPosition(fleet) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const ranks = Array.from(container.querySelectorAll(".exec-cc-rank")).map((n) => Number(n.textContent));
    expect(ranks).toEqual(ranks.map((_, i) => i + 1));
    expect(screen.getByText(/BUSY · \d+/)).toBeTruthy();
  });
  it("QUIET is a real state: 'Nothing needs you' with the read timestamp, not an empty page", () => {
    const busyKey = Object.keys(CC_FIXTURES)[0];
    const snapshot = readCommandCenter(CC_FIXTURES[busyKey as keyof typeof CC_FIXTURES])!;
    const quiet = { ...snapshot, needsYou: snapshot.needsYou ? { ...snapshot.needsYou, items: [] } : null };
    render(<CommandCenterScreen snapshot={quiet} onOpen={() => undefined} />);
    expect(screen.getByText("QUIET")).toBeTruthy();
    expect(screen.getByText("Nothing needs you.")).toBeTruthy();
    expect(screen.getByText(/Quiet as of/)).toBeTruthy();
    expect(screen.getByLabelText("Fleet health")).toBeTruthy();
  });
});

describe("Operations Queue — the rail follows the selected row; ack ≠ resolve", () => {
  it("the container puts the selected row's triage in the rail and clears it on a filter change", async () => {
    render(<MemoryRouter><OperationsQueueContainer api={createFixtureApi()} now={new Date("2026-08-22T10:42:01Z")} /></MemoryRouter>);
    const links = await screen.findAllByRole("button", { name: /^op_/ });
    expect(screen.getByText("Select an operation")).toBeTruthy();
    fireEvent.click(links[0]);
    const first = links[0].textContent!;
    expect(screen.getByText(`Triage · ${first}`)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Acknowledge" })).toBeTruthy();
    // Resolve stays locked until acknowledged — different records.
    expect(screen.getByRole("button", { name: "Resolve" })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: /All \(24h\)/ }));
    expect(await screen.findByText("Select an operation")).toBeTruthy();
  });
  it("the screen's rail changes with the selection, not with the table", () => {
    const row = (id: string): QueueRow => ({ operationId: id, commandKey: "reconcile", environment: "LIVE", target: { type: "account", id: "acct" }, riskTier: "R3", severity: "WARNING", sourceAuthority: null, sourceStatus: "FAILED", verificationResult: "PARTIAL", triageState: "UNACKNOWLEDGED", workflowVersion: 1, acknowledgedAt: null, acknowledgedBy: null, resolvedAt: null, resolvedBy: null, resolutionReason: null, resolutionEvidenceHash: null, createdAt: "2026-08-22T10:00:00Z", updatedAt: null });
    const queue = { page: { rows: [row("op_a"), row("op_b")], totalCount: 2, filteredCount: 2, nextCursor: null, prevCursor: null, hasMore: false, hasPrevious: false, appliedSort: [] }, actorRoles: ["ADMIN"], deliveryProfile: "fixture", sourceIntegrationState: "UNAVAILABLE", readAt: null };
    const now = new Date("2026-08-22T10:42:01Z");
    const { rerender, container } = render(<OperationsQueueScreen queue={queue} onOpen={() => undefined} now={now} selectedId="op_a" triage={<div>triage of A</div>} />);
    expect(within(container.querySelector(".exec-context-rail") as HTMLElement).getByText("triage of A")).toBeTruthy();
    expect(container.querySelector('tr[data-selected="true"]')?.textContent).toContain("op_a");
    rerender(<OperationsQueueScreen queue={queue} onOpen={() => undefined} now={now} selectedId="op_b" triage={<div>triage of B</div>} />);
    const rail = container.querySelector(".exec-context-rail") as HTMLElement;
    expect(within(rail).queryByText("triage of A")).toBeNull();
    expect(within(rail).getByText("triage of B")).toBeTruthy();
    expect(within(rail).getByText("Triage · op_b")).toBeTruthy();
    // Blockers name the stuck rows.
    expect(within(rail).getByText("op_a PARTIAL")).toBeTruthy();
  });
});

describe("§9.2 terminal in the Action Drawer", () => {
  const plan = { id: "plan_9f12", expiresInSeconds: 60, requestPreview: "{...}", equivalentCli: "docker compose exec cli allocation set", checks: [{ label: "R2 valid", outcome: "pass" as const }, { label: "concentration +4.6%", outcome: "warning" as const }] };
  it("maps plan, apply and verify into typed rows and a 202 is ACCEPTED, never VERIFIED", () => {
    const rows = terminalRows({ plan, verifyEntries: [{ label: "sub-intent 1", status: "APPLIED_UNVERIFIED" }], outcome: null });
    expect(rows.map((r) => r.phase)).toEqual(["PLAN", "PLAN", "PLAN", "APPLY", "VERIFY"]);
    expect(rows.find((r) => r.phase === "APPLY")?.message).toContain("202 accepted — not terminal success");
    expect(terminalVerdict({ verifyEntries: [{ label: "x", status: "APPLIED_UNVERIFIED" }], outcome: null })).toBe("ACCEPTED");
    expect(terminalVerdict({ verifyEntries: [{ label: "x", status: "VERIFIED" }], outcome: null })).toBe("ACCEPTED");
    expect(terminalVerdict({ verifyEntries: [], outcome: null })).toBe("PENDING");
    expect(terminalVerdict({ verifyEntries: [{ label: "x", status: "VERIFIED" }], outcome: "VERIFIED" })).toBe("VERIFIED");
    expect(terminalVerdict({ verifyEntries: [{ label: "x", status: "PARTIAL" }], outcome: "PARTIAL" })).toBe("PARTIAL");
    expect(terminalVerdict({ verifyEntries: [{ label: "x", status: "PARTIAL" }], outcome: null, verification: "UNCERTAIN" })).toBe("UNCERTAIN");
  });
  it("renders the terminal anatomy: verdict, stable columns, follow/pause, copy, export, clear", () => {
    const { container } = render(
      <CommandPlanDrawer requestKey="rk_t" title="Allocate capital" step="verify" plan={plan} verifyEntries={[{ label: "sub-intent 1", status: "VERIFIED" }, { label: "sub-intent 2", status: "PARTIAL" }]} outcome="PARTIAL" />,
    );
    expect(screen.getByText("202 — accepted, NOT success yet")).toBeTruthy();
    expect(screen.getByText(/PARTIAL — residue must be resolved/)).toBeTruthy();
    expect(container.querySelector("[class*='exec-term']")).not.toBeNull();
    const cells = Array.from(container.querySelectorAll("[data-phase]")).map((n) => n.getAttribute("data-phase"));
    expect(cells).toContain("PLAN");
    expect(cells).toContain("APPLY");
    expect(cells).toContain("VERIFY");
    fireEvent.click(screen.getByRole("button", { name: /Pause|Follow/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Copy/ }));
    expect(screen.getByText(/copied \d+ chars/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Export/ }));
    fireEvent.click(screen.getByRole("button", { name: /Clear/ }));
    expect(container.querySelectorAll("[data-phase]").length).toBe(0);
  });
  it("never renders a VERIFIED verdict from entries alone", () => {
    render(<CommandPlanDrawer requestKey="rk_t2" title="Allocate capital" step="verify" plan={plan} verifyEntries={[{ label: "sub-intent 1", status: "VERIFIED" }]} outcome={null} />);
    expect(screen.getByText(/202 accepted — not success yet/)).toBeTruthy();
    expect(screen.queryByText(/VERIFIED — terminal state confirmed/)).toBeNull();
  });
});

describe("authority negatives", () => {
  it("Apply stays blocked with every reason listed; Generate plan never mutates", () => {
    const onApply = vi.fn();
    render(<CommandPlanDrawer requestKey="rk_n" title="Halt" step="plan" plan={null} riskTier="R3" freshAuthSatisfied={false} onApply={onApply} />);
    const apply = screen.getByRole("button", { name: "Apply" });
    expect(apply).toHaveProperty("disabled", true);
    const reasons = screen.getByText(/Apply is blocked/).textContent!;
    expect(reasons).toContain("generate a plan first");
    expect(reasons).toContain("re-authenticate");
    expect(reasons).toContain("a reason is required");
    expect(onApply).not.toHaveBeenCalled();
  });
  it("no screen offers a break-glass control — the ceremony is not in the contract", async () => {
    render(<MemoryRouter><AdminCatalogueContainer api={createFixtureApi()} /></MemoryRouter>);
    await screen.findAllByRole("button");
    expect(screen.queryByRole("button", { name: /break.?glass/i })).toBeNull();
    expect(screen.queryByText(/break.?glass/i)).toBeNull();
    cleanup();
    render(<MemoryRouter><IncidentDetailContainer api={createFixtureApi()} incidentId="inc_fixture_44" /></MemoryRouter>);
    await screen.findByText(/forward-only/);
    expect(screen.queryByRole("button", { name: /resume/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /break.?glass/i })).toBeNull();
  });
  it("blocked catalogue entries show NOT EXPOSED and no plan/apply path", async () => {
    render(<MemoryRouter><AdminCatalogueContainer api={createFixtureApi()} /></MemoryRouter>);
    const rows = await screen.findAllByRole("button", { pressed: false });
    const blocked = rows.find((r) => r.getAttribute("data-reachable") === "false");
    expect(blocked).toBeTruthy();
    fireEvent.click(blocked!);
    const detail = screen.getByLabelText("Command detail");
    expect(within(detail).getByText("NOT EXPOSED IN PORTAL")).toBeTruthy();
    expect(within(detail).queryByRole("button", { name: "Apply" })).toBeNull();
  });
  it("the drawer screen file never wires a fetch of its own", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    for (const f of ["screens/AdminActionDrawer.tsx", "screens/CommandCenter.tsx", "screens/OperationsQueue.tsx", "screens/IncidentDetail.tsx", "components/drawer.tsx"]) {
      expect(readFileSync(join(here, f), "utf8"), f).not.toMatch(/fetch\(|XMLHttpRequest|EventSource/);
    }
  });
});
