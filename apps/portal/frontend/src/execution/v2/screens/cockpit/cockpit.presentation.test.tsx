/**
 * Approvals cockpit, WP-E presentation: the subtitle and freshness chip, "Decided today", the requester line and verdict line, the typed
 * panels the hi-fi gives every gate (prior history, evidence diff, still open after approval, provenance), the key chip and the receipt
 * preview, and the waiver runway. Fixtures are the published contract files through the real readers; the port is a Proxy that answers
 * reads and fails on anything else, so nothing here can decide, plan or apply.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { answerFixtureRequest, V2_OPTIONS } from "../../../../../e2e/bffAnswerer";
import { overlayApprovalHistory, SIMULATED_DECISIONS_TODAY } from "../../../../../e2e/bffSimulated";
import type { ConditionRow, ConditionsPage, ExecutionApi, InboxResult } from "../../../api/ports";
import { readLiveReview } from "../../../api/profileRead";
import { readGateR1Detail, readGateR2Detail, readPaperExitDetail } from "../../../api/rows";
import type { ApprovalRow, DecidedRow } from "../../../screens/ApprovalInbox";
import { v1GovernanceParent, type GovernanceParentKind } from "../../readers/dispatch";
import { V2_ROLE_PRESETS } from "../../shell/roleNav";
import Cockpit, { type CockpitProps } from "./index";
import { decidedToday, isDecidedToday, lapseView, NO_CLOCK, RUNWAY_AXIS_DAYS } from "./laneModel";
import { RUNWAY_ROWS } from "./EvidenceFrame";

const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("../../../../auth/session", () => ({ useSession: () => session.current }));

function signIn(username = "bobby", userId = "usr_bobby") {
  session.current = {
    principal: { principalId: `p_${userId}`, username, role: "x", sessionId: "s", mustChangePassword: false, authnMethods: [], issuedAt: "", exp: 0 },
    access: { kind: "ready", access: { userId, isOwner: false, ownerState: "NOT_OWNER", capabilities: [...V2_ROLE_PRESETS.manager] } },
  };
}

/* ── the port ─────────────────────────────────────────────────────────────── */

type Handler = (...args: never[]) => unknown;
interface Port {
  api: ExecutionApi;
  calls: string[];
}
function port(handlers: Record<string, Handler>): Port {
  const calls: string[] = [];
  const api = new Proxy({}, {
    get(_target, name) {
      if (typeof name !== "string") return undefined;
      return (...args: unknown[]) => {
        calls.push(name);
        const handler = handlers[name];
        if (!handler && name === "getGovernanceParent") {
          const [kind, id, workspaceId] = args as [GovernanceParentKind, string, string | undefined];
          return v1GovernanceParent(api, kind, id, workspaceId);
        }
        if (!handler) throw new Error(`unexpected port call: ${name}`);
        return Promise.resolve(handler(...(args as never[])));
      };
    },
  }) as ExecutionApi;
  return { api, calls };
}

const FIXTURES = resolve(__dirname, "../../../../../../../../packages/contracts/fixtures");
const fixture = (name: string): unknown => {
  const path = resolve(FIXTURES, name);
  expect(existsSync(path), path).toBe(true);
  return JSON.parse(readFileSync(path, "utf8"));
};
const must = <T,>(value: T | null, what: string): T => {
  if (value === null) throw new Error(`${what} unreadable`);
  return value;
};
const r1 = () => must(readGateR1Detail(fixture("execution-governance.r1-review.valid.json")), "r1");
const r2 = () => must(readGateR2Detail(fixture("execution-governance.r2-review.valid.json")), "r2");
const exit = () => must(readPaperExitDetail(fixture("execution-governance.paper-exit-review.valid.json")), "exit");
const live = () => must(readLiveReview(fixture("governance-live-review.valid.json")), "live");

const NOW = Date.UTC(2026, 9, 18, 12, 4);
const row = (id: string, gate: ApprovalRow["gate"], subject: string, over: Partial<ApprovalRow> = {}): ApprovalRow => ({
  id: id as ApprovalRow["id"], gate, subject, target: "paper · BINANCE", blockerCount: 0, blockerSummary: null,
  sla: { ageMinutes: 5, budgetMinutes: 240, state: "ON_TRACK" }, quorumMet: 0, quorumRequired: 2, inert: null, needsYou: false, ...over,
});
const wire = (id: string, gate: string, who: string | null, subject: string, over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id, gate, subject, status: "PENDING",
  creator: who ? { user_id: `usr_${who}`, username: who } : null,
  requester: who ? { user_id: `usr_${who}`, username: who } : null,
  sla: { state: "ON_TRACK", age_minutes: 5, budget_minutes: 240 }, quorum_met: 0, quorum_required: 2, needs_you: false, inert: null, ...over,
});
const ROWS = [row("apr_a", "R1", "Alpha One", { needsYou: true }), row("apr_b", "R2", "Beta Two"), row("apr_c", "PAPER_EXIT", "Gamma Exit"), row("apr_d", "LIVE_GATE", "Delta Live"), row("apr_e", "R1", "Echo Mine", { inert: "SELF" })];
const RAW = [
  wire("apr_a", "R1", "stan", "Alpha One", { needs_you: true }),
  wire("apr_b", "R2", "lan", "Beta Two"),
  wire("apr_c", "PAPER_EXIT", "lan", "Gamma Exit"),
  wire("apr_d", "LIVE_GATE", "stan", "Delta Live"),
  wire("apr_e", "R1", "bobby", "Echo Mine", { inert: "SELF" }),
];
const inbox = (): InboxResult => ({
  page: { rows: ROWS, totalCount: ROWS.length, filteredCount: ROWS.length, hasMore: false, nextCursor: null },
  counts: { pending: ROWS.length, overdue: 0, dueSoon: null },
  ...{ rawRows: RAW },
}) as InboxResult;

const decided = (id: string, at: string, subject = id): DecidedRow => ({ id: id as DecidedRow["id"], gate: "R1", subject, outcome: "APPROVED", decidedBy: "minh", decidedAt: at, policyVersion: "approval.v3" });
const TODAY_A = new Date(NOW - 25 * 60_000).toISOString();
const TODAY_B = new Date(NOW - 70 * 60_000).toISOString();
const YESTERDAY = new Date(NOW - 20 * 3_600_000).toISOString();
const HISTORY = [decided("dec_a", TODAY_A, "Old Alpha"), decided("dec_b", TODAY_B, "Old Beta"), decided("dec_c", YESTERDAY, "Older Gamma")];

const READ_AT = "2026-10-18T12:00:00.000Z";
const at = (offsetMinutes: number | null): string | null => (offsetMinutes === null ? null : new Date(Date.parse(READ_AT) + offsetMinutes * 60_000).toISOString());
const DAY = 1440;
function waiver(id: string, label: string, offsetMinutes: number | null, state: ConditionRow["state"] = "OPEN"): ConditionRow {
  return {
    conditionId: id, approvalId: `AP-${id}`, gate: "R2", subjectId: `dep_${id}`, subjectLabel: `Grid ${id}`, environment: "PAPER", kind: "WAIVER", state, label,
    statement: `Statement of ${id}.`, owner: "lan", dueAt: at(offsetMinutes), blocking: false, policyVersion: "approval.v3", createdAt: READ_AT, updatedAt: READ_AT,
  };
}
const waiverPage = (rows: ConditionRow[], readAt: string | null = READ_AT): ConditionsPage => ({
  rows, totalCount: rows.length, filteredCount: rows.length, nextCursor: null, prevCursor: null, hasMore: false, hasPrevious: false, readAt,
});
const WAIVERS = [
  waiver("w_far", "Far", 39 * DAY),
  waiver("w_soon", "Soon", 1 * DAY + 21 * 60, "EXPIRING"),
  waiver("w_none", "Event", null),
  waiver("w_gone", "Gone", -3 * DAY, "LAPSED"),
  waiver("w_mid", "Mid", 10 * DAY),
  waiver("w_beyond", "Beyond", 50 * DAY),
];

function standard(over: Record<string, Handler> = {}): Port {
  return port({
    listApprovals: () => ({ ok: true, value: inbox() }),
    getApprovalHistory: () => ({ ok: true, value: { rows: HISTORY, totalCount: HISTORY.length, deliveryProfile: null } }),
    getGateR1: () => ({ ok: true, value: r1() }),
    getGateR2: () => ({ ok: true, value: r2() }),
    getPaperExit: () => ({ ok: true, value: exit() }),
    getLiveReview: () => ({ ok: true, value: live() }),
    getWaivers: () => ({ ok: true, value: waiverPage(WAIVERS) }),
    getReviewCaptureCapabilities: () => ({ ok: true, value: { schema_version: "governance.review-capture-capabilities.v1", authority: "PORTAL", source_side_effect_requested: false, actions: [] } }),
    ...over,
  });
}

function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{pathname + search}</output>;
}
async function settle() {
  for (let i = 0; i < 4; i += 1) await act(async () => { await new Promise((done) => setTimeout(done, 0)); });
}
async function mount(p: Port, entry = "/execution/approvals", props: Partial<CockpitProps> = {}) {
  const view = render(
    <MemoryRouter initialEntries={[entry]}>
      <Cockpit api={p.api} now={() => NOW} {...props} />
      <Where />
    </MemoryRouter>,
  );
  await settle();
  return view;
}
const where = () => screen.getByTestId("where").textContent ?? "";
const rail = () => screen.getByRole("complementary", { name: "Decision" });
const queue = () => screen.getByRole("region", { name: "Decision queue" });
const evidence = () => screen.getByRole("region", { name: "Evidence" });
const receipt = () => within(rail()).getByRole("region", { name: "Receipt" });
const receiptRow = (label: string) => within(receipt()).getByRole("rowheader", { name: label }).nextElementSibling?.textContent ?? "";

beforeEach(() => {
  signIn();
  (window as unknown as { matchMedia: (query: string) => MediaQueryList }).matchMedia = (query: string) =>
    ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }) as unknown as MediaQueryList;
});
afterEach(() => {
  cleanup();
  delete (window as { matchMedia?: unknown }).matchMedia;
});

/* ── header ───────────────────────────────────────────────────────────────── */

describe("subtitle and freshness chip", () => {
  it("prints the subtitle, and a chip that says when this browser received the queue, never Fresh", async () => {
    await mount(standard());
    expect(screen.getByTestId("ck-subtitle").textContent).toBe("Every decision, sorted by SLA");
    const chip = screen.getByTestId("ck-fresh");
    expect(chip.textContent).toBe("Queue read 18 Oct 12:04Z");
    expect(chip.getAttribute("data-state")).toBe("read");
    expect(document.body.textContent).not.toMatch(/\bFresh\b/);
  });

  it("while the queue is out the chip says so, and when it fails it says Queue not read", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const slow = standard({ listApprovals: async () => { await gate; return { ok: true, value: inbox() }; } });
    await mount(slow);
    expect(screen.getByTestId("ck-fresh").textContent).toBe("Reading the queue");
    await act(async () => { release(); await Promise.resolve(); });
    await settle();
    expect(screen.getByTestId("ck-fresh").textContent).toBe("Queue read 18 Oct 12:04Z");
    cleanup();
    await mount(standard({ listApprovals: () => ({ ok: false, status: "unavailable", reason: "Down." }) }));
    expect(screen.getByTestId("ck-fresh").textContent).toBe("Queue not read");
    expect(screen.getByTestId("ck-fresh").getAttribute("data-state")).toBe("failed");
  });
});

/* ── Decided today ────────────────────────────────────────────────────────── */

describe("Decided today", () => {
  it("counts the decisions of today (UTC) from the history read, collapsed, with yesterday's left out", async () => {
    await mount(standard());
    const disclosure = within(queue()).getByTestId("ck-decided-today") as HTMLDetailsElement;
    expect(disclosure.open).toBe(false);
    expect(disclosure.querySelector("summary")!.textContent).toBe("Decided today · 2");
    const items = within(disclosure).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([expect.stringContaining("Old Alpha"), expect.stringContaining("Old Beta")]);
    expect(disclosure.textContent).not.toContain("Older Gamma");
  });

  it("picking one opens its evidence, as the Closed lens does", async () => {
    const p = standard();
    await mount(p);
    const disclosure = within(queue()).getByTestId("ck-decided-today");
    fireEvent.click(within(disclosure).getAllByRole("button")[0]!);
    await settle();
    expect(where()).toContain("sel=dec_a");
  });

  it("says none when nothing was decided today, and says the read failed when it did", async () => {
    await mount(standard({ getApprovalHistory: () => ({ ok: true, value: { rows: [decided("dec_c", YESTERDAY)], totalCount: 1, deliveryProfile: null } }) }));
    const none = within(queue()).getByTestId("ck-decided-today");
    expect(none.querySelector("summary")!.textContent).toBe("Decided today · 0");
    expect(none.textContent).toContain("No decision was recorded today in the history read.");
    cleanup();
    await mount(standard({ getApprovalHistory: () => ({ ok: false, status: "unavailable", reason: "History is down." }) }));
    const failed = within(queue()).getByTestId("ck-decided-today");
    expect(failed.querySelector("summary")!.textContent).toBe("Decided today · not read");
    expect(failed.textContent).toContain("so today's decisions are not counted");
    expect(failed.textContent).not.toMatch(/·\s0\b/);
  });

  it("is not drawn in the waiver lane (a waiver is not a decision) or in a family panel", async () => {
    await mount(standard(), "/execution/approvals?view=waiver");
    expect(within(queue()).queryByTestId("ck-decided-today")).toBeNull();
    cleanup();
    await mount(standard(), "/execution/approvals?view=archive");
    expect(within(queue()).queryByTestId("ck-decided-today")).toBeNull();
  });

  it("the day boundary is UTC midnight, the instants must be instants, and the filter keeps the server's order", () => {
    const noon = Date.UTC(2026, 9, 18, 12, 0);
    expect(isDecidedToday("2026-10-18T00:00:00Z", noon)).toBe(true);
    expect(isDecidedToday("2026-10-17T23:59:59Z", noon)).toBe(false);
    expect(isDecidedToday("2026-10-18T23:59:59.999Z", noon)).toBe(true);
    expect(isDecidedToday("not a time", noon)).toBe(false);
    expect(isDecidedToday("2026-10-18T12:00:00Z", Number.NaN)).toBe(false);
    expect(decidedToday(HISTORY, NOW).map((r) => r.id)).toEqual(["dec_a", "dec_b"]);
  });
});

/* ── evidence header, verdict line and typed panels ───────────────────────── */

describe("evidence header and verdict", () => {
  it("names who asked as the queue row publishes it, and types the absence when it does not", async () => {
    await mount(standard(), "/execution/approvals?sel=apr_a");
    expect(within(evidence()).getByTestId("ck-requested-by").textContent).toBe("Requested by stan");
    cleanup();
    const noOwner = { ...inbox(), rawRows: [wire("apr_a", "R1", null, "Alpha One")] } as InboxResult;
    await mount(standard({ listApprovals: () => ({ ok: true, value: noOwner }) }), "/execution/approvals?sel=apr_a");
    expect(within(evidence()).getByTestId("ck-requested-by").textContent).toContain("Requested by:");
    expect(within(evidence()).getByTestId("ck-requested-by").textContent).toContain("Not published");
  });

  it("the verdict line carries the approvers so far and the time left, and the meter has its count", async () => {
    const withChecklist = { ...r1(), checklist: [{ label: "Sharpe above the floor", outcome: "pass" as const }, { label: "Capacity", outcome: "watch" as const }, { label: "Replay", outcome: "pass" as const }] };
    await mount(standard({ getGateR1: () => ({ ok: true, value: withChecklist }) }), "/execution/approvals?sel=apr_a");
    const line = within(evidence()).getByTestId("ck-verdict-line");
    expect(line.textContent).toBe("Quorum 0 of 2" + "3h 55m left");
    const count = evidence().querySelector(".exec-ck-meter-count")!;
    expect(count.textContent).toBe("2/3");
    expect(count.nextElementSibling?.className).toContain("exec-ck-meter");
  });

  it("prints no verdict line when the row publishes neither count nor clock", async () => {
    const bare = { ...inbox(), rawRows: [wire("apr_a", "R1", "stan", "Alpha One", { sla: null, quorum_met: null, quorum_required: null })] } as InboxResult;
    const rows = [row("apr_a", "R1", "Alpha One", { sla: null, quorumMet: null, quorumRequired: null })];
    bare.page = { ...bare.page, rows };
    await mount(standard({ listApprovals: () => ({ ok: true, value: bare }) }), "/execution/approvals?sel=apr_a");
    expect(within(evidence()).queryByTestId("ck-verdict-line")).toBeNull();
  });
});

describe("the typed panels every gate has", () => {
  it("R1 has the prior history panel and the evidence diff as typed absences, no still-open table, and a closed provenance", async () => {
    await mount(standard(), "/execution/approvals?sel=apr_a");
    const history = within(evidence()).getByTestId("ck-history");
    expect(history.closest("section")?.getAttribute("aria-label")).toBe("Prior economic history");
    expect(history.textContent).toContain("Not published");
    expect(within(evidence()).getByTestId("ck-evidence-diff").textContent).toContain("Not published");
    expect(within(evidence()).queryByRole("region", { name: "Still open after approval" })).toBeNull();
    const provenance = within(evidence()).getByTestId("ck-provenance") as HTMLDetailsElement;
    expect(provenance.open).toBe(false);
    for (const label of ["Gate", "Policy", "Workspace", "Read"]) expect(within(provenance).getByRole("rowheader", { name: label })).toBeTruthy();
  });

  it("R2, exit and live list the five things still open after approval, each a typed absence, never a number", async () => {
    for (const sel of ["apr_b", "apr_c", "apr_d"]) {
      await mount(standard(), `/execution/approvals?sel=${sel}`);
      const table = within(evidence()).getByRole("region", { name: "Still open after approval" });
      const labels = within(table).getAllByRole("rowheader").map((th) => th.textContent);
      expect(labels, sel).toEqual(["Open positions", "Working orders", "Reservations", "Unknown outcomes", "Settlement pending"]);
      for (const th of within(table).getAllByRole("rowheader")) {
        expect(th.nextElementSibling?.textContent, `${sel} ${th.textContent}`).toContain("Not published");
        expect(th.nextElementSibling?.textContent).not.toMatch(/^\d+$|\bNone\b|\bnone\b/);
      }
      cleanup();
    }
  });

  it("makes no write call while drawing any of it", async () => {
    const p = standard();
    await mount(p, "/execution/approvals?sel=apr_b");
    expect(p.calls.filter((c) => /plan|apply|create|capture|decision|run|acknowledge|resolve/i.test(c) && !/Capabilities/.test(c))).toEqual([]);
  });
});

/* ── rail ─────────────────────────────────────────────────────────────────── */

describe("the key chip and the receipt preview", () => {
  it("the primary decision carries the A key as a chip but keeps its name and its disabled reason", async () => {
    await mount(standard(), "/execution/approvals?sel=apr_a");
    const approve = within(rail()).getByRole("button", { name: "Approve" }) as HTMLButtonElement;
    expect(approve.getAttribute("data-key")).toBe("A");
    expect(approve.getAttribute("aria-keyshortcuts")).toBe("A");
    expect(approve.textContent).toBe("Approve");
    expect(approve.disabled).toBe(true);
    expect(approve.getAttribute("aria-describedby")).toBeTruthy();
    // Other decisions has no key of its own.
    expect(within(rail()).getByRole("button", { name: "Other decisions" }).hasAttribute("data-key")).toBe(false);
  });

  it("the receipt is a dashed preview: none chosen, the request and its title, you, what it counts as, what changes", async () => {
    await mount(standard(), "/execution/approvals?sel=apr_a");
    expect(within(receipt()).getByRole("heading", { name: "Preview · not recorded" })).toBeTruthy();
    expect(receiptRow("Decision")).toBe("None chosen");
    expect(receiptRow("Request")).toBe("apr_a · Alpha One");
    expect(receiptRow("You")).toBe("bobby");
    expect(receiptRow("Counts as")).toMatch(/^If approved: \d+ of \d+ approvals$/);
    expect(receiptRow("What changes")).toContain("Not published");
    // A preview names no role preset for you (none is published) and no receipt reference.
    expect(receipt().textContent).not.toMatch(/Manager|Reviewer|Operator/);
  });

  it("counts nothing for your own request, a Live gate or a waiver, and says why", async () => {
    await mount(standard(), "/execution/approvals?sel=apr_e");
    expect(receiptRow("Counts as")).toBe("Not counted: you cannot decide this request");
    cleanup();
    await mount(standard(), "/execution/approvals?sel=apr_d");
    expect(receiptRow("Counts as")).toBe("Not counted: Live decisions are closed on this build");
    cleanup();
    await mount(standard(), "/execution/approvals?view=waiver&sel=w_soon");
    expect(receiptRow("Counts as")).toBe("Not counted: a waiver is not an approval");
  });

  it("a recorded decision shows the recorded receipt, not the preview rows", async () => {
    await mount(standard(), "/execution/approvals?sel=dec_a");
    const recorded = within(rail()).getByRole("region", { name: "Receipt" });
    expect(recorded.getAttribute("data-recorded")).toBe("true");
    expect(within(recorded).queryByRole("rowheader", { name: "Counts as" })).toBeNull();
    expect(within(recorded).queryByRole("rowheader", { name: "You" })).toBeNull();
  });
});

/* ── the waiver runway ────────────────────────────────────────────────────── */

describe("the waiver lane and its runway", () => {
  const runway = () => within(evidence()).getByTestId("ck-runway");
  const lines = () => within(runway()).getAllByRole("listitem");
  const textOf = (li: HTMLElement) => li.textContent ?? "";

  it("draws one line per waiver on a shared axis, soonest first, no-clock last, counted from the register's read time", async () => {
    await mount(standard(), "/execution/approvals?view=waiver&sel=w_soon");
    expect(lines().map((li) => li.getAttribute("data-clock"))).toEqual(["lapsed", "ahead", "ahead", "ahead", "ahead", "none"]);
    expect(lines().map((li) => within(li).getByRole("img").getAttribute("aria-label"))).toEqual([
      "lapsed 3d ago", "lapses in 1d 21h", "lapses in 10d", "lapses in 39d", "lapses in 50d", NO_CLOCK,
    ]);
    expect(textOf(lines()[1]!)).toContain("1d 21h");
    expect(textOf(lines()[4]!)).toContain(`past ${RUNWAY_AXIS_DAYS} d`);
    expect(textOf(lines()[5]!)).toContain(NO_CLOCK);
    expect(runway().textContent).toContain("Counted from the register's read time (18 Oct 12:00Z)");
    expect(within(evidence()).getByText(`Shared axis 0 to ${RUNWAY_AXIS_DAYS} d`)).toBeTruthy();
  });

  it("marks sit by their share of the axis, a lapse past it is held at the end, and a lapsed waiver sits at the start", async () => {
    await mount(standard(), "/execution/approvals?view=waiver&sel=w_soon");
    const mark = (li: HTMLElement) => li.querySelector<HTMLElement>(".exec-ck-runway-mark");
    expect(mark(lines()[0]!)?.getAttribute("data-lapsed")).toBe("true");
    expect(mark(lines()[0]!)?.style.left).toBe("0%");
    expect(Number.parseFloat(mark(lines()[2]!)!.style.left)).toBeCloseTo((10 / RUNWAY_AXIS_DAYS) * 100, 5);
    expect(mark(lines()[4]!)?.style.left).toBe("100%");
    expect(mark(lines()[4]!)?.getAttribute("data-beyond")).toBe("true");
    expect(mark(lines()[5]!)).toBeNull();
  });

  it("the open waiver is the current line, the banner is the server's state word, and the lapse phrase is in the banner and the queue", async () => {
    await mount(standard(), "/execution/approvals?view=waiver&sel=w_soon");
    const current = lines().filter((li) => li.getAttribute("data-selected") === "true");
    expect(current).toHaveLength(1);
    expect(textOf(current[0]!)).toContain("Soon");
    expect(within(current[0]!).getByRole("button").getAttribute("aria-current")).toBe("true");
    const banner = within(evidence()).getByTestId("ck-waiver-banner");
    expect(banner.textContent).toContain("Expiring · decide before it lapses");
    expect(banner.textContent).toContain("Lapses in 1d 21h");
    expect(banner.textContent).toContain("No approver quorum");
    const item = within(queue()).getAllByTestId("ck-waiver-clock").map((n) => n.textContent ?? "");
    expect(item.some((t) => t.startsWith("Lapses in 1d 21h · "))).toBe(true);
    expect(item.some((t) => t.startsWith("Lapsed 3d ago · "))).toBe(true);
    expect(item.some((t) => t === NO_CLOCK)).toBe(true);
  });

  it("picking another line on the runway opens that waiver", async () => {
    await mount(standard(), "/execution/approvals?view=waiver&sel=w_soon");
    fireEvent.click(within(lines()[2]!).getByRole("button"));
    await settle();
    expect(where()).toContain("sel=w_mid");
  });

  it("a lapsed waiver gets the Lapsed banner; a waiver with no clock says it closes by an event, not never", async () => {
    await mount(standard(), "/execution/approvals?view=waiver&sel=w_gone");
    expect(within(evidence()).getByTestId("ck-waiver-banner").textContent).toContain("Lapsed");
    expect(within(evidence()).getByTestId("ck-waiver-banner").textContent).toContain("Lapsed 3d ago");
    cleanup();
    await mount(standard(), "/execution/approvals?view=waiver&sel=w_none");
    expect(within(evidence()).getByTestId("ck-waiver-banner").textContent).toContain(NO_CLOCK);
    expect(within(evidence()).getByTestId("ck-waiver-banner").textContent).not.toMatch(/never/i);
  });

  it("without a read time on the register no lapse is counted, and it says so", async () => {
    await mount(standard({ getWaivers: () => ({ ok: true, value: waiverPage(WAIVERS, null) }) }), "/execution/approvals?view=waiver&sel=w_soon");
    expect(lines().filter((li) => li.getAttribute("data-clock") !== "none").every((li) => li.getAttribute("data-clock") === "unanchored")).toBe(true);
    expect(runway().textContent).toContain("which this read does not state");
    expect(within(evidence()).getByTestId("ck-waiver-banner").textContent).toContain("Lapse time not counted");
  });

  it("caps the runway, keeps the open waiver on it, and states the count", async () => {
    const many = Array.from({ length: RUNWAY_ROWS + 3 }, (_, i) => waiver(`w_${String(i).padStart(2, "0")}`, `Line ${i}`, (i + 1) * DAY));
    await mount(standard({ getWaivers: () => ({ ok: true, value: waiverPage(many) }) }), `/execution/approvals?view=waiver&sel=${many[RUNWAY_ROWS + 2]!.conditionId}`);
    expect(lines()).toHaveLength(RUNWAY_ROWS);
    expect(lines().some((li) => li.getAttribute("data-selected") === "true")).toBe(true);
    expect(runway().textContent).toContain(`Showing ${RUNWAY_ROWS} of ${RUNWAY_ROWS + 3} waivers loaded.`);
  });
});

describe("lapseView", () => {
  it("counts from the read time, in the published minutes, with the axis as scale only", () => {
    expect(lapseView(null, READ_AT)).toEqual({ kind: "none", phrase: NO_CLOCK });
    expect(lapseView(at(0), READ_AT)).toMatchObject({ kind: "ahead", phrase: "lapses now", offsetPct: 0 });
    expect(lapseView(at(125), READ_AT)).toMatchObject({ kind: "ahead", phrase: "lapses in 2h 5m", beyond: false });
    expect(lapseView(at(RUNWAY_AXIS_DAYS * DAY), READ_AT)).toMatchObject({ kind: "ahead", offsetPct: 100, beyond: false });
    expect(lapseView(at(RUNWAY_AXIS_DAYS * DAY + 1), READ_AT)).toMatchObject({ kind: "ahead", offsetPct: 100, beyond: true });
    expect(lapseView(at(-90), READ_AT)).toMatchObject({ kind: "lapsed", minutes: 90, phrase: "lapsed 1h 30m ago" });
  });

  it("never anchors on a clock nobody published", () => {
    expect(lapseView(at(60), null).kind).toBe("unanchored");
    expect(lapseView("nonsense", READ_AT).kind).toBe("unanchored");
    expect(lapseView(at(60), "nonsense").kind).toBe("unanchored");
  });
});

/* ── the simulated history ────────────────────────────────────────────────── */

describe("the simulated decisions of today (register 2d)", () => {
  const history = (simulated: boolean, nowIso = "2026-10-17T12:04:00.000Z") =>
    answerFixtureRequest({ method: "GET", path: "/api/v1/execution/governance/approvals/history", search: "?limit=50", headers: {}, body: null }, { ...V2_OPTIONS, simulated })!;

  it("the sparse default is unchanged and the simulated lane adds two decisions ahead of the canonical row, in the same shape", () => {
    const plain = (history(false).body as { page: { rows: { id: string }[]; total_count: number } }).page;
    const sim = (history(true).body as { page: { rows: { id: string; decided_at: string; approval_id: string }[]; total_count: number; filtered_count: number } }).page;
    expect(sim.rows.slice(0, 2).map((r) => r.id)).toEqual(SIMULATED_DECISIONS_TODAY.map((d) => d.id));
    expect(sim.rows.slice(2).map((r) => r.id)).toEqual(plain.rows.map((r) => r.id));
    expect(sim.total_count).toBe(plain.total_count + 2);
    expect(sim.filtered_count).toBe(plain.total_count + 2);
  });

  it("the instants are the fixture clock minus 25 and 70 minutes, so they are one UTC day with it", () => {
    const base = { page: { rows: [], total_count: 0, filtered_count: 0 } };
    const now = Date.UTC(2026, 9, 17, 12, 4);
    const out = overlayApprovalHistory(base, now) as { page: { rows: { decided_at: string }[] } };
    expect(out.page.rows.map((r) => Date.parse(r.decided_at))).toEqual([now - 25 * 60_000, now - 70 * 60_000]);
    expect(out.page.rows.every((r) => isDecidedToday(r.decided_at, now))).toBe(true);
    // Pure and idempotent: a second pass adds nothing, and the input is untouched.
    expect(overlayApprovalHistory(out as never, now)).toEqual(out);
    expect(base.page.rows).toEqual([]);
  });

  it("a record that is not a page is returned as it is", () => {
    expect(overlayApprovalHistory({ nothing: true }, NOW)).toEqual({ nothing: true });
  });
});
