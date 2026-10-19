import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ExecutionApi, InboxResult } from "../../../api/ports";
import { readLiveReview } from "../../../api/profileRead";
import { readConditionsPage, readGateR1Detail, readGateR2Detail, readPaperExitDetail } from "../../../api/rows";
import type { ApprovalRow, DecidedRow } from "../../../screens/ApprovalInbox";
import { v1GovernanceParent, type GovernanceParentKind } from "../../readers/dispatch";
import { V2_ROLE_PRESETS } from "../../shell/roleNav";
import Cockpit, { type CockpitProps } from "./index";

/* ── the session, standing in for useSession ─────────────────────────────── */

const session = vi.hoisted(() => ({
  current: null as unknown,
}));
vi.mock("../../../../auth/session", () => ({ useSession: () => session.current }));

function signIn(options: { userId: string; username: string; capabilities: Iterable<string> }) {
  session.current = {
    principal: { principalId: `p_${options.userId}`, username: options.username, role: "x", sessionId: "s", mustChangePassword: false, authnMethods: [], issuedAt: "", exp: 0 },
    access: { kind: "ready", access: { userId: options.userId, isOwner: false, ownerState: "NOT_OWNER", capabilities: [...options.capabilities] } },
  };
}

/* ── the port: reads answer, anything else is a failure ──────────────────── */

const WRITES = [
  "planDecision", "applyPlan", "createApprovalRequest", "captureR2", "createPaperExit", "captureSandboxNote",
  "planCommand", "runOperatorTask", "acknowledgeOperation", "resolveOperation",
] as const;
const READS = [
  "listApprovals", "getApprovalHistory", "getGateR1", "getGateR2", "getLiveReview", "getGovernanceParent", "getPaperExit", "getWaivers", "getReviewCaptureCapabilities",
] as const;

type Handler = (...args: never[]) => unknown;

interface Port {
  api: ExecutionApi;
  calls: { name: string; args: unknown[] }[];
  called(name: string): unknown[][];
}

function port(handlers: Partial<Record<(typeof READS)[number], Handler>>): Port {
  const calls: Port["calls"] = [];
  const api = new Proxy(
    {},
    {
      get(_target, name) {
        if (typeof name !== "string") return undefined;
        return (...args: unknown[]) => {
          calls.push({ name, args });
          const handler = (handlers as Record<string, Handler | undefined>)[name];
          // The version-aware read is the cockpit's one evidence call; unless a test answers it itself, it
          // goes through the V1 handlers of the same port, as the fixture port does.
          if (!handler && name === "getGovernanceParent") {
            const [kind, id, workspaceId] = args as [GovernanceParentKind, string, string | undefined];
            return v1GovernanceParent(api, kind, id, workspaceId);
          }
          if (!handler) throw new Error(`unexpected port call: ${name}`);
          return Promise.resolve(handler(...(args as never[])));
        };
      },
    },
  ) as ExecutionApi;
  return { api, calls, called: (name) => calls.filter((call) => call.name === name).map((call) => call.args) };
}

/* ── data: contract fixtures through the real readers ─────────────────────── */

const FIXTURES = resolve(__dirname, "../../../../../../../../packages/contracts/fixtures");
function fixture(name: string): unknown {
  const path = resolve(FIXTURES, name);
  expect(existsSync(path), path).toBe(true);
  return JSON.parse(readFileSync(path, "utf8"));
}

function r1Detail() {
  const detail = readGateR1Detail(fixture("execution-governance.r1-review.valid.json"));
  if (detail === null) throw new Error("r1 fixture unreadable");
  return detail;
}
function r1WithChecklist() {
  return {
    ...r1Detail(),
    checklist: [
      { label: "Out-of-sample Sharpe above the floor", outcome: "pass" as const },
      { label: "Capacity evidence covers the top 3 symbols only", outcome: "watch" as const, suggestion: "Approve with a condition" },
      { label: "Audit replay matches", outcome: "insufficient" as const },
    ],
  };
}
function r2Detail() {
  const detail = readGateR2Detail(fixture("execution-governance.r2-review.valid.json"));
  if (detail === null) throw new Error("r2 fixture unreadable");
  return detail;
}
function exitDetail() {
  const detail = readPaperExitDetail(fixture("execution-governance.paper-exit-review.valid.json"));
  if (detail === null) throw new Error("exit fixture unreadable");
  return detail;
}
function liveReview() {
  const payload = readLiveReview(fixture("governance-live-review.valid.json"));
  if (payload === null) throw new Error("live fixture unreadable");
  return payload;
}
function waiverPage() {
  const page = readConditionsPage(fixture("execution-governance.conditions-register.valid.json"));
  if (page === null) throw new Error("waiver fixture unreadable");
  return page;
}

function v1(id: string, gate: ApprovalRow["gate"], subject: string, over: Partial<ApprovalRow> = {}): ApprovalRow {
  return {
    id: id as ApprovalRow["id"],
    gate,
    subject,
    target: "paper · BINANCE",
    blockerCount: 0,
    blockerSummary: null,
    sla: { ageMinutes: 5, budgetMinutes: 240, state: "ON_TRACK" },
    quorumMet: 0,
    quorumRequired: 2,
    inert: null,
    needsYou: false,
    ...over,
  };
}

function wire(id: string, gate: string, creator: string | null, subject = id, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    gate,
    subject,
    status: "PENDING",
    creator: creator ? { user_id: `usr_${creator}`, username: creator } : null,
    requester: creator ? { user_id: `usr_${creator}`, username: creator } : null,
    sla: { state: "ON_TRACK", age_minutes: 5, budget_minutes: 240 },
    quorum_met: 0,
    quorum_required: 2,
    needs_you: false,
    inert: null,
    ...over,
  };
}

const ROWS = [
  v1("apr_a", "R1", "Alpha One", { needsYou: true }),
  v1("apr_b", "R2", "Beta Two", { inert: "SELF" }),
  v1("apr_c", "PAPER_EXIT", "Gamma Exit", { quorumRequired: 1 }),
  v1("apr_d", "LIVE_GATE", "Delta Live", { sla: { ageMinutes: 360, budgetMinutes: 240, state: "OVERDUE" } }),
];
const RAW = [wire("apr_a", "R1", "stan", "Alpha One", { needs_you: true }), wire("apr_b", "R2", "bobby", "Beta Two", { inert: "SELF" }), wire("apr_c", "PAPER_EXIT", "lan", "Gamma Exit"), wire("apr_d", "LIVE_GATE", "stan", "Delta Live", { sla: { state: "OVERDUE", age_minutes: 360, budget_minutes: 240 } })];

const HISTORY: DecidedRow[] = [
  { id: "dec_old" as DecidedRow["id"], gate: "R1", subject: "Old Alpha", outcome: "APPROVED", decidedBy: "minh", decidedAt: "2026-10-17T09:12:00Z", policyVersion: "approval.v3" },
];

function inbox(rows: ApprovalRow[] = ROWS, extra: Partial<InboxResult> & { rawRows?: readonly unknown[] } = {}, page: Partial<InboxResult["page"]> = {}): InboxResult {
  return {
    page: { rows, totalCount: rows.length, filteredCount: rows.length, hasMore: false, nextCursor: null, ...page },
    counts: { pending: rows.length, overdue: 1, dueSoon: null },
    ...extra,
  };
}

function standardPort(over: Partial<Record<(typeof READS)[number], Handler>> = {}, result: InboxResult = { ...inbox(), ...{ rawRows: RAW } }): Port {
  return port({
    listApprovals: () => ({ ok: true, value: result }),
    getApprovalHistory: () => ({ ok: true, value: { rows: HISTORY, totalCount: 1, deliveryProfile: null } }),
    getGateR1: () => ({ ok: true, value: r1WithChecklist() }),
    getGateR2: () => ({ ok: true, value: r2Detail() }),
    getPaperExit: () => ({ ok: true, value: exitDetail() }),
    getLiveReview: () => ({ ok: true, value: liveReview() }),
    getWaivers: () => ({ ok: true, value: waiverPage() }),
    getReviewCaptureCapabilities: () => ({
      ok: true,
      value: { schema_version: "governance.review-capture-capabilities.v1", authority: "PORTAL", source_side_effect_requested: false, actions: [{ id: "R2_EXECUTION_GRANT", state: "UNAVAILABLE", reason_code: "GRANT_NOT_PUBLISHED" }] },
    }),
    ...over,
  });
}

/* ── mounting ─────────────────────────────────────────────────────────────── */

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
      <Cockpit api={p.api} {...props} />
      <Where />
    </MemoryRouter>,
  );
  await settle();
  return view;
}

const where = () => screen.getByTestId("where").textContent ?? "";
const rail = () => screen.getByRole("complementary", { name: "Decision" });
const queue = () => screen.getByRole("region", { name: "Decision queue" });
const rowButton = (name: RegExp) => within(queue()).getByRole("button", { name });

beforeEach(() => signIn({ userId: "usr_bobby", username: "bobby", capabilities: V2_ROLE_PRESETS.manager }));
afterEach(() => {
  cleanup();
  delete (window as { matchMedia?: unknown }).matchMedia;
});

/** Pretend the viewport is (not) at least 1100px wide; jsdom has no matchMedia and the screen then assumes wide. */
function viewport(wide: boolean) {
  (window as unknown as { matchMedia: (query: string) => MediaQueryList }).matchMedia = (query: string) =>
    ({ matches: wide, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }) as unknown as MediaQueryList;
}

/* ── access ───────────────────────────────────────────────────────────────── */

describe("access states", () => {
  it("no governance read is the denied state with a My access link, and reads nothing", async () => {
    signIn({ userId: "usr_lan", username: "lan", capabilities: V2_ROLE_PRESETS.operator });
    const p = standardPort();
    await mount(p, "/execution/approvals", { accessHref: "/profile" });
    expect(screen.getByRole("alert").textContent).toContain("You can't open this page.");
    expect(screen.getByRole("link", { name: "My access" }).getAttribute("href")).toBe("/profile");
    expect(p.calls).toEqual([]);
  });

  it("a session that has not answered is loading, and one that failed is unavailable, not denied", async () => {
    session.current = { principal: null, access: { kind: "loading" } };
    const p = standardPort();
    const view = await mount(p);
    expect(screen.getByRole("status", { name: "Reading your access" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    view.unmount();
    session.current = { principal: null, access: { kind: "unavailable", requestId: null } };
    await mount(p);
    expect(screen.getByText("Access not read")).toBeTruthy();
    expect(screen.queryByText("You can't open this page.")).toBeNull();
    expect(p.calls).toEqual([]);
  });

  it("a researcher (R1 read only) sees their own requests and nothing to decide", async () => {
    signIn({ userId: "usr_stan", username: "stan", capabilities: V2_ROLE_PRESETS.researcher });
    const p = standardPort({}, { ...inbox(), ...{ rawRows: [wire("apr_a", "R1", "stan", "Alpha One"), wire("apr_b", "R2", "bobby", "Beta Two"), wire("apr_c", "PAPER_EXIT", "lan", "Gamma Exit"), wire("apr_d", "LIVE_GATE", "stan", "Delta Live")] } } as InboxResult);
    await mount(p);
    expect(screen.getByRole("heading", { name: "My requests" })).toBeTruthy();
    const table = screen.getByRole("table", { name: "Your requests" });
    // apr_a and apr_d were created by stan; apr_b is bobby's, apr_c is lan's.
    expect(within(table).getByText("apr_a")).toBeTruthy();
    expect(within(table).getByText("apr_d")).toBeTruthy();
    expect(within(table).queryByText("apr_b")).toBeNull();
    expect(within(table).queryByText("apr_c")).toBeNull();
    expect(screen.queryByRole("complementary", { name: "Decision" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Approve|Deny|Other decisions/ })).toBeNull();
    expect(p.called("getGateR1")).toHaveLength(0);
    // below 660px the table becomes cards: every cell carries its column label
    expect([...table.querySelectorAll("tbody tr:first-child td")].map((td) => td.getAttribute("data-l"))).toEqual(["Request", "Status", "Approvers", "Clock"]);
    // links keep the V1 review paths
    expect(within(table).getByRole("link", { name: "apr_a" }).getAttribute("href")).toBe("/governance/approvals/apr_a/r1");
  });

  it("rows whose owner is not published are counted, not guessed as the researcher's", async () => {
    signIn({ userId: "usr_stan", username: "stan", capabilities: V2_ROLE_PRESETS.researcher });
    const p = standardPort({}, inbox());
    await mount(p);
    // V1 rows only: apr_b is marked SELF by the server, the other three say nothing about their owner.
    const table = screen.getByRole("table", { name: "Your requests" });
    expect(within(table).getByText("apr_b")).toBeTruthy();
    expect(screen.getByText(/3 rows on this page do not say who created them/)).toBeTruthy();
    expect(screen.getByText(/Creator: Not published \(FE-030\)/)).toBeTruthy();
  });

  it("a reviewer holds the full cockpit", async () => {
    signIn({ userId: "usr_minh", username: "minh", capabilities: V2_ROLE_PRESETS.reviewer });
    await mount(standardPort());
    expect(screen.getByRole("heading", { name: "Approvals" })).toBeTruthy();
    expect(queue()).toBeTruthy();
  });
});

/* ── queue, lanes, lenses ─────────────────────────────────────────────────── */

describe("queue, lanes and lenses", () => {
  it("lists the gate rows in server order and reads the queue once, for all gates", async () => {
    const p = standardPort();
    await mount(p);
    const items = within(queue()).getAllByRole("listitem").map((li) => li.textContent ?? "");
    expect(items).toHaveLength(4);
    expect(items[0]).toContain("Alpha One");
    expect(items[3]).toContain("Delta Live");
    expect(p.called("listApprovals")).toEqual([[{ filter: "ALL", limit: 50 }]]);
  });

  it("a lane chip re-reads with that lane's server view and keeps only its gates", async () => {
    const p = standardPort();
    await mount(p);
    fireEvent.click(within(queue()).getByRole("button", { name: /^Exit/ }));
    await settle();
    expect(p.called("listApprovals").at(-1)).toEqual([{ filter: "EXIT_REVIEWS", limit: 50 }]);
    const items = within(queue()).getAllByRole("listitem");
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toContain("Gamma Exit");
    expect(within(queue()).getByRole("button", { name: /^Exit/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("lane chips carry an open count taken from the last All page, and keep it while another lane is open (CK-5)", async () => {
    const p = standardPort();
    await mount(p);
    const names = () => [...(queue().querySelector('[aria-label="Lane"]') as HTMLElement).querySelectorAll(".exec-ck-chip")].map((el) => el.textContent?.trim());
    expect(names().slice(0, 6)).toEqual(["All gates 4", "R1 1", "R2 1", "Exit 1", "Live 1", "Waiver"]);
    fireEvent.click(within(queue()).getByRole("button", { name: /^Exit/ }));
    await settle();
    // The Exit read holds one row, but the other lanes keep the count the All page gave.
    expect(names().slice(0, 6)).toEqual(["All gates 4", "R1 1", "R2 1", "Exit 1", "Live 1", "Waiver"]);
  });

  it("a lane count is an at-least number when the All page had more rows than it loaded", async () => {
    const p = standardPort({}, inbox(ROWS, { rawRows: RAW }, { hasMore: true, nextCursor: "c1", totalCount: 48, filteredCount: 48 }));
    await mount(p);
    expect(within(queue()).getByRole("button", { name: "All gates 4+" })).toBeTruthy();
  });

  it("Archive, Reactivation and Capital are shown disabled and say Not published (FE-034)", async () => {
    await mount(standardPort());
    for (const name of ["Archive", "Reactivation", "Capital"]) {
      const chip = within(queue()).getByRole("button", { name }) as HTMLButtonElement;
      expect(chip.disabled).toBe(true);
      expect(chip.getAttribute("title")).toBe("Not published (FE-034)");
      expect(document.getElementById(chip.getAttribute("aria-describedby") ?? "")?.textContent).toContain("Not published (FE-034)");
    }
  });

  it("Needs you narrows the loaded page on the published flag, with counts that never claim the whole queue", async () => {
    const p = standardPort({}, inbox(ROWS, { ...{ rawRows: RAW } }, { hasMore: true, nextCursor: "c1", totalCount: 48, filteredCount: 48 }));
    await mount(p);
    expect(within(queue()).getByRole("button", { name: "Needs you 1+" })).toBeTruthy();
    fireEvent.click(within(queue()).getByRole("button", { name: /^Needs you/ }));
    const items = within(queue()).getAllByRole("listitem");
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toContain("Alpha One");
    expect(within(queue()).getByText(/1 shown · 4 loaded of 48/)).toBeTruthy();
  });

  it("Yours is the signed-in person's own requests: creator match or the server's SELF mark", async () => {
    await mount(standardPort());
    fireEvent.click(within(queue()).getByRole("button", { name: /^Yours/ }));
    const items = within(queue()).getAllByRole("listitem").map((li) => li.textContent ?? "");
    // apr_b: created by bobby (wire) and marked SELF.
    expect(items).toHaveLength(1);
    expect(items[0]).toContain("Beta Two");
  });

  it("Closed reads the decision history, once, and lists decided requests", async () => {
    const p = standardPort();
    await mount(p);
    fireEvent.click(within(queue()).getByRole("button", { name: "Closed" }));
    const items = within(queue()).getAllByRole("listitem");
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toContain("Old Alpha");
    expect(items[0].textContent).toContain("Decided by minh");
    expect(p.called("getApprovalHistory")).toHaveLength(1);
  });

  it("a history read that fails says so on the Closed lens instead of showing an empty list as truth", async () => {
    const p = standardPort({ getApprovalHistory: () => ({ ok: false, status: "unavailable", reason: "History is down." }) });
    await mount(p);
    fireEvent.click(within(queue()).getByRole("button", { name: "Closed" }));
    expect(within(queue()).getByText("Decision history not read: History is down.")).toBeTruthy();
  });

  it("SLA and quorum are exact: 5 of 240 min is 3h 55m left, 360 of 240 is overdue 2h, 0 of 2 stays 0 of 2", async () => {
    await mount(standardPort());
    const alpha = rowButton(/Alpha One/);
    expect(alpha.textContent).toContain("3h 55m left");
    expect(alpha.textContent).toContain("0 of 2 approvers");
    expect(within(alpha).getByRole("img").getAttribute("aria-label")).toBe("SLA 3h 55m left, 5 of 240 min used");
    expect((alpha.querySelector(".exec-ck-sla i") as HTMLElement).style.width).toMatch(/^2\.08333333333333\d*%$/);
    const delta = rowButton(/Delta Live/);
    expect(delta.textContent).toContain("overdue 2h");
    expect(delta.textContent).toContain("Overdue");
    expect((delta.querySelector(".exec-ck-sla i") as HTMLElement).style.width).toBe("100%");
  });

  it("a row with no SLA or quorum says so in words, never 0 or a dash", async () => {
    const bare = v1("apr_z", "R1", "Bare Row", { sla: { ageMinutes: -1, budgetMinutes: -1 }, quorumMet: null, quorumRequired: null });
    await mount(standardPort({}, inbox([bare])));
    expect(rowButton(/Bare Row/).textContent).toContain("SLA not published · approvers not published");
  });

  it("server counts are stated with their gaps: overdue 1, due soon not counted", async () => {
    await mount(standardPort());
    expect(screen.getByText(/pending/).textContent).toBe("4 pending · 1 overdue · due soon not counted");
  });

  it("load more appends the next page by cursor and drops duplicates", async () => {
    const first = inbox([ROWS[0], ROWS[1]], {}, { hasMore: true, nextCursor: "c1", totalCount: 4, filteredCount: 4 });
    const second = inbox([ROWS[1], ROWS[2]], {}, { hasMore: false, nextCursor: null, totalCount: 4, filteredCount: 4 });
    let n = 0;
    const p = standardPort({ listApprovals: () => ({ ok: true, value: n++ === 0 ? first : second }) });
    await mount(p);
    expect(within(queue()).getAllByRole("listitem")).toHaveLength(2);
    fireEvent.click(within(queue()).getByRole("button", { name: "Load more" }));
    await settle();
    expect(p.called("listApprovals").at(-1)).toEqual([{ filter: "ALL", after: "c1", limit: 50 }]);
    expect(within(queue()).getAllByRole("listitem")).toHaveLength(3);
    expect(within(queue()).queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("a failed queue read is a distinct state, not an empty queue", async () => {
    const p = standardPort({ listApprovals: () => ({ ok: false, status: "denied", reason: "No approval read." }) });
    await mount(p);
    expect(within(queue()).getByText("Withheld")).toBeTruthy();
    expect(within(queue()).queryByText("Nothing in this view")).toBeNull();
  });

  it("an empty page is an empty state with its own words", async () => {
    await mount(standardPort({}, inbox([])));
    expect(within(queue()).getByText("Nothing in this view")).toBeTruthy();
  });

  it("V1 reader gaps surface as a partial note", async () => {
    const p = standardPort({ listApprovals: () => ({ ok: true, value: inbox(), warnings: ["gate=\"X\""] }) });
    await mount(p);
    expect(within(queue()).getByRole("status").textContent).toContain('Some rows could not be read: gate="X"');
  });
});

/* ── evidence ─────────────────────────────────────────────────────────────── */

describe("evidence frame", () => {
  // Changed on purpose (UXM-07 CK-1): the first load used to leave the evidence and the rail empty and
  // this test pinned that. On a wide screen the first request is now open; on a stacked one nothing is.
  it("on a wide screen the first request is selected on first load, through ?sel= with replace", async () => {
    viewport(true);
    await mount(standardPort());
    expect(where()).toContain("sel=apr_a");
    expect(screen.queryByText("Nothing selected")).toBeNull();
    expect(within(rail()).queryByText(/Select a request/)).toBeNull();
    expect(within(queue()).getByRole("button", { name: /Alpha One/ }).getAttribute("aria-current")).toBeTruthy();
  });

  it("a stacked screen (under 1100px) selects nothing and says so", async () => {
    viewport(false);
    await mount(standardPort());
    expect(where()).not.toContain("sel=");
    expect(screen.getByText("Nothing selected")).toBeTruthy();
    expect(screen.getByText(/Select a request in the queue, or press J/)).toBeTruthy();
  });

  it("a link's own ?sel= wins over the first row", async () => {
    viewport(true);
    await mount(standardPort(), "/execution/approvals?sel=apr_c");
    expect(where()).toContain("sel=apr_c");
    expect(where()).not.toContain("apr_a");
  });

  it("Esc clears the automatic selection and it does not come back", async () => {
    viewport(true);
    await mount(standardPort());
    expect(where()).toContain("sel=apr_a");
    fireEvent.keyDown(document.body, { key: "Escape" });
    await settle();
    expect(where()).not.toContain("sel=");
    expect(screen.getByText("Nothing selected")).toBeTruthy();
  });

  it("selecting a row writes ?sel=, reads the R1 review, and shows the checklist with Not published (FE-028) cells", async () => {
    const p = standardPort();
    await mount(p, "/execution/approvals?workspace_id=ws_x", { workspaceId: "ws_x" });
    fireEvent.click(rowButton(/Alpha One/));
    await settle();
    expect(where()).toContain("sel=apr_a");
    expect(p.called("getGateR1")).toEqual([["apr_a", "ws_x"]]);
    const evidence = screen.getByRole("region", { name: "Evidence" });
    expect(within(evidence).getByRole("heading", { name: "Alpha One" })).toBeTruthy();
    const checklist = within(evidence).getByRole("region", { name: "Checklist findings" });
    expect(within(checklist).getAllByText("Not published (FE-028)").length).toBe(3);
    expect(within(checklist).getByText("Capacity evidence covers the top 3 symbols only")).toBeTruthy();
    expect(within(checklist).getByText("Approve with a condition")).toBeTruthy();
    expect(within(checklist).getByText("Watch")).toBeTruthy();
    expect(within(evidence).getByText("Not published (FE-029)")).toBeTruthy();
    expect(within(evidence).getByRole("region", { name: "Artifact passport" })).toBeTruthy();
  });

  it("the verdict carries a segmented meter, one segment per checklist item, coloured by its mark (CK-7)", async () => {
    await mount(standardPort(), "/execution/approvals?sel=apr_a");
    const meter = within(screen.getByRole("region", { name: "Evidence" })).getByRole("img", { name: /criteria:/ });
    const segments = [...meter.querySelectorAll("i")];
    expect(segments.length).toBeGreaterThan(0);
    expect(segments.map((i) => i.getAttribute("data-m"))).toContain("watch");
    expect(segments.map((i) => i.getAttribute("data-m"))).toEqual(["pass", "watch", "insufficient"]);
    expect(meter.getAttribute("aria-label")).toBe("3 criteria: 1 within, 1 watch, 0 blocking, 1 insufficient");
  });

  it("the evidence frame keeps the V1 review URLs, with the context params carried", async () => {
    await mount(standardPort(), "/execution/approvals?workspace_id=ws_x&sel=apr_a");
    const evidence = screen.getByRole("region", { name: "Evidence" });
    expect(within(evidence).getByRole("link", { name: "Open full review" }).getAttribute("href")).toBe("/governance/approvals/apr_a/r1?workspace_id=ws_x");
    fireEvent.click(rowButton(/Beta Two/));
    expect(within(evidence).getByRole("link", { name: "Open full review" }).getAttribute("href")).toBe("/governance/approvals/apr_b/r2?workspace_id=ws_x");
    fireEvent.click(rowButton(/Gamma Exit/));
    expect(within(evidence).getByRole("link", { name: "Open full review" }).getAttribute("href")).toBe("/governance/exit-reviews/apr_c?workspace_id=ws_x");
    fireEvent.click(rowButton(/Delta Live/));
    expect(within(evidence).getByRole("link", { name: "Open full review" }).getAttribute("href")).toBe("/governance/approvals/apr_d/live?workspace_id=ws_x");
    await settle();
  });

  it("R2 shows the capital preview and the published readiness; criteria are Not published (FE-028)", async () => {
    const p = standardPort();
    await mount(p, "/execution/approvals?sel=apr_b");
    expect(p.called("getGateR2")).toHaveLength(1);
    const evidence = screen.getByRole("region", { name: "Evidence" });
    expect(within(evidence).getByRole("region", { name: "Criteria" }).textContent).toContain("Not published (FE-028)");
    expect(within(evidence).getByRole("region", { name: "Capital change preview" })).toBeTruthy();
    expect(within(evidence).getByRole("region", { name: "R1 lineage" })).toBeTruthy();
  });

  it("exit review shows the published findings per panel", async () => {
    const p = standardPort();
    await mount(p, "/execution/approvals?sel=apr_c");
    expect(p.called("getPaperExit")).toEqual([["apr_c", undefined]]);
    const evidence = screen.getByRole("region", { name: "Evidence" });
    const detail = exitDetail();
    for (const panel of detail.panels) expect(within(evidence).getByRole("region", { name: panel.title })).toBeTruthy();
    expect(within(evidence).getByRole("heading", { name: detail.gateMet ? "Gate met" : "Gate not met" })).toBeTruthy();
    expect(within(evidence).getByRole("region", { name: "Recommendation" })).toBeTruthy();
  });

  it("live review decodes the governance backbone and lists the published canary branches", async () => {
    const p = standardPort();
    await mount(p, "/execution/approvals?sel=apr_d");
    expect(p.called("getLiveReview")).toHaveLength(1);
    const evidence = screen.getByRole("region", { name: "Evidence" });
    expect(within(evidence).getByRole("heading", { name: /Evidence ready · Live decisions are closed/ })).toBeTruthy();
    expect(within(evidence).getByRole("region", { name: "Canary evidence branches" })).toBeTruthy();
    expect(within(evidence).getByRole("region", { name: "Current source · live facts" })).toBeTruthy();
    const criteria = within(evidence).getByRole("region", { name: "Criteria" });
    expect(criteria.textContent).toContain("Governance backbone");
    expect(criteria.textContent).toContain("Not published (FE-028)");
  });

  it("a failed review read is its own state, and the queue stays", async () => {
    const p = standardPort({ getGateR1: () => ({ ok: false, status: "denied", reason: "No R1 read." }) });
    await mount(p, "/execution/approvals?sel=apr_a");
    expect(within(screen.getByRole("region", { name: "Evidence" })).getByText("Withheld")).toBeTruthy();
    expect(within(queue()).getAllByRole("listitem")).toHaveLength(4);
  });

  it("a request that is not on the loaded page and has no path kind says why nothing is shown, and reads nothing", async () => {
    const p = standardPort();
    await mount(p, "/execution/approvals?sel=apr_elsewhere");
    expect(screen.getByText("Request not on this page")).toBeTruthy();
    expect(p.called("getGateR1")).toHaveLength(0);
  });

  it("a path selection reads the review for an id the page does not hold", async () => {
    const p = standardPort();
    await mount(p, "/governance/approvals/apr_off/r2", { pathSelection: { id: "apr_off", kind: "r2" } });
    expect(p.called("getGateR2")).toEqual([["apr_off", undefined]]);
    const evidence = screen.getByRole("region", { name: "Evidence" });
    expect(within(evidence).getByText("apr_off")).toBeTruthy();
    expect(within(evidence).getByRole("link", { name: "Open full review" }).getAttribute("href")).toBe("/governance/approvals/apr_off/r2");
  });
});

/* ── the rail ─────────────────────────────────────────────────────────────── */

describe("decision rail", () => {
  const PREVIEW = "Preview · not recorded";

  function expectEveryButtonDisabledWithPreviewReason(labels: string[]) {
    const buttons = within(rail()).getAllByRole("button") as HTMLButtonElement[];
    expect(buttons.map((b) => b.textContent)).toEqual(labels);
    for (const button of buttons) {
      expect(button.disabled).toBe(true);
      const reason = document.getElementById(button.getAttribute("aria-describedby") ?? "");
      expect(reason?.textContent).toBe(PREVIEW);
    }
  }

  it("R1: Approve and Other decisions are disabled with the exact reason, and the note is disabled too", async () => {
    await mount(standardPort(), "/execution/approvals?sel=apr_a");
    expectEveryButtonDisabledWithPreviewReason(["Approve", "Other decisions"]);
    expect(within(rail()).getByText("Would offer: Approve with a condition, Request changes, Deny")).toBeTruthy();
    expect((within(rail()).getByLabelText("Note") as HTMLTextAreaElement).disabled).toBe(true);
  });

  it("exit review offers its own verbs, all disabled", async () => {
    await mount(standardPort(), "/execution/approvals?sel=apr_c");
    expectEveryButtonDisabledWithPreviewReason(["Approve promotion", "Other decisions"]);
    expect(within(rail()).getByText("Would offer: Extend observation 14 days, Hold at current stage")).toBeTruthy();
  });

  it("live has no other decisions and says it is closed; its primary is still disabled with the preview reason", async () => {
    await mount(standardPort(), "/execution/approvals?sel=apr_d");
    expectEveryButtonDisabledWithPreviewReason(["Approve"]);
    expect(within(rail()).getByText("Live decisions are closed on this build.")).toBeTruthy();
  });

  it("a request of the signed-in person also shows a disabled Withdraw", async () => {
    await mount(standardPort(), "/execution/approvals?sel=apr_b");
    expectEveryButtonDisabledWithPreviewReason(["Approve", "Other decisions", "Withdraw"]);
  });

  it("separation of duty: a creator who is the signed-in person blocks and says why", async () => {
    await mount(standardPort(), "/execution/approvals?sel=apr_b");
    const line = within(rail()).getByText(/Separation of duty/);
    expect(line.textContent).toBe("Separation of duty: you created this request, so you cannot decide it.");
    expect(line.getAttribute("data-state")).toBe("violation");
  });

  it("separation of duty: another creator is OK and names both people", async () => {
    await mount(standardPort(), "/execution/approvals?sel=apr_a");
    expect(within(rail()).getByText(/Separation of duty/).textContent).toBe("Separation of duty OK · created by stan, you are bobby");
  });

  it("with no creator on the row the line reads the review's own creator, not a guess", async () => {
    // V1 rows only: the R1 fixture's creator is usr_stan, the signed-in person is bobby.
    await mount(standardPort({}, inbox()), "/execution/approvals?sel=apr_a");
    expect(within(rail()).getByText(/Separation of duty/).textContent).toBe("Separation of duty OK · created by stan, you are bobby");
    cleanup();
    signIn({ userId: "usr_stan", username: "stan", capabilities: V2_ROLE_PRESETS.manager });
    await mount(standardPort({}, inbox()), "/execution/approvals?sel=apr_a");
    expect(within(rail()).getByText(/Separation of duty/).getAttribute("data-state")).toBe("violation");
  });

  it("quorum is the true count, with a meter of that many cells", async () => {
    await mount(standardPort(), "/execution/approvals?sel=apr_a");
    expect(within(rail()).getByText(/of \d+ approvers/).textContent).toMatch(/^0 of \d+ approvers$/);
    const required = Number((within(rail()).getByText(/of \d+ approvers/).textContent ?? "").match(/of (\d+)/)?.[1]);
    expect(rail().querySelectorAll(".exec-ck-cells i")).toHaveLength(required);
    expect(rail().querySelectorAll('.exec-ck-cells i[data-filled="true"]')).toHaveLength(0);
  });

  it("ladder, call and receipt ref are Not published (FE-030); the receipt is a preview", async () => {
    await mount(standardPort(), "/execution/approvals?sel=apr_a");
    const receipt = within(rail()).getByRole("region", { name: "Receipt" });
    for (const label of ["Ladder", "Call", "Receipt ref", "What changes"]) {
      expect(within(receipt).getByRole("rowheader", { name: label }).nextElementSibling?.textContent).toBe("Not published (FE-030)");
    }
    expect(within(receipt).getByRole("rowheader", { name: "Decision" }).nextElementSibling?.textContent).toBe("None recorded");
    expect(receipt.textContent).toContain(PREVIEW);
  });

  it("a decision the history holds is shown as recorded, read only", async () => {
    const history = [{ ...HISTORY[0], id: "apr_a" as DecidedRow["id"], outcome: "DENIED" as const }];
    await mount(standardPort({ getApprovalHistory: () => ({ ok: true, value: { rows: history, totalCount: 1, deliveryProfile: null } }) }), "/execution/approvals?sel=apr_a");
    const receipt = within(rail()).getByRole("region", { name: "Receipt" });
    expect(within(receipt).getByRole("heading", { name: "Recorded" })).toBeTruthy();
    expect(within(receipt).getByRole("rowheader", { name: "Decision" }).nextElementSibling?.textContent).toBe("denied");
    expect(within(receipt).getByRole("rowheader", { name: "By" }).nextElementSibling?.textContent).toBe("minh");
  });

  it("step-up is informational on R2 and live, absent on R1 and exit, and never has a control", async () => {
    await mount(standardPort(), "/execution/approvals?sel=apr_b");
    const stepUp = within(rail()).getByLabelText("Step-up confirmation");
    expect(stepUp.textContent).toContain("Not published (FE-015)");
    expect(stepUp.textContent).toContain("Informational only");
    expect(within(stepUp).queryAllByRole("button")).toHaveLength(0);
    cleanup();
    await mount(standardPort(), "/execution/approvals?sel=apr_a");
    expect(within(rail()).queryByLabelText("Step-up confirmation")).toBeNull();
  });

  it("reads the server's capture capabilities only when the review names a workspace, and lists them read only", async () => {
    const p = standardPort();
    await mount(p, "/execution/approvals?sel=apr_a", { workspaceId: "ws_x" });
    expect(p.called("getReviewCaptureCapabilities")).toEqual([["ws_x"]]);
    expect(within(rail()).getByText("R2 execution grant")).toBeTruthy();
    expect(within(rail()).getByText("Unavailable · GRANT_NOT_PUBLISHED")).toBeTruthy();
    cleanup();
    const q = standardPort();
    await mount(q, "/execution/approvals?sel=apr_a");
    expect(q.called("getReviewCaptureCapabilities")).toHaveLength(0);
    expect(within(rail()).getByText("Workspace not published on this review")).toBeTruthy();
  });

  it("nothing is ever written: no plan, apply, create or command call, across every gate and the waiver lane", async () => {
    const p = standardPort();
    await mount(p, "/execution/approvals", { workspaceId: "ws_x" });
    for (const name of [/Alpha One/, /Beta Two/, /Gamma Exit/, /Delta Live/]) {
      fireEvent.click(rowButton(name));
      await settle();
      for (const button of within(rail()).getAllByRole("button")) fireEvent.click(button);
    }
    fireEvent.click(within(queue()).getByRole("button", { name: "Waiver" }));
    await settle();
    fireEvent.click(within(queue()).getAllByRole("listitem")[0].querySelector("button") as HTMLElement);
    await settle();
    for (const button of within(rail()).getAllByRole("button")) fireEvent.click(button);
    for (const key of ["a", "r", "n"]) fireEvent.keyDown(document.body, { key });
    await settle();
    const names = p.calls.map((call) => call.name);
    for (const write of WRITES) expect(names).not.toContain(write);
    expect(names.filter((name) => !(READS as readonly string[]).includes(name))).toEqual([]);
  });
});

/* ── waiver lane ──────────────────────────────────────────────────────────── */

describe("waiver lane", () => {
  it("reads the register, lists waivers apart from gates, and filters by server state", async () => {
    const p = standardPort();
    await mount(p);
    expect(p.called("getWaivers")).toHaveLength(0);
    fireEvent.click(within(queue()).getByRole("button", { name: "Waiver" }));
    await settle();
    expect(p.called("getWaivers")).toEqual([[{ limit: 50 }]]);
    const items = within(queue()).getAllByRole("listitem");
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toContain("Approved waiver · risk-team");
    expect(items[0].textContent).not.toContain("Alpha One");
    expect(within(queue()).queryByRole("group", { name: "Lens" })).toBeNull();
    fireEvent.click(within(queue()).getByRole("button", { name: "Expiring" }));
    await settle();
    expect(p.called("getWaivers").at(-1)).toEqual([{ limit: 50, state: "EXPIRING" }]);
  });

  it("selecting a waiver shows the condition and a disabled preview decision, with no gate reads", async () => {
    viewport(false);
    const p = standardPort();
    await mount(p);
    fireEvent.click(within(queue()).getByRole("button", { name: "Waiver" }));
    await settle();
    fireEvent.click(within(queue()).getAllByRole("listitem")[0].querySelector("button") as HTMLElement);
    await settle();
    const evidence = screen.getByRole("region", { name: "Evidence" });
    expect(within(evidence).getByRole("region", { name: "Condition" }).textContent).toContain("Keep paper exposure below the certified envelope.");
    expect(within(evidence).getByText("Not published (FE-029)")).toBeTruthy();
    const buttons = within(rail()).getAllByRole("button") as HTMLButtonElement[];
    expect(buttons.map((b) => b.textContent)).toEqual(["Extend 14 days", "Other decisions"]);
    expect(buttons.every((b) => b.disabled)).toBe(true);
    expect(p.called("getGateR1")).toHaveLength(0);
    expect(within(rail()).getByText(/A waiver has no approver quorum/)).toBeTruthy();
  });

  it("a failed register read is a state of its own", async () => {
    const p = standardPort({ getWaivers: () => ({ ok: false, status: "unavailable", reason: "Register down." }) });
    await mount(p);
    fireEvent.click(within(queue()).getByRole("button", { name: "Waiver" }));
    await settle();
    expect(within(queue()).getByText("Unavailable")).toBeTruthy();
  });
});

/* ── keyboard ─────────────────────────────────────────────────────────────── */

describe("keyboard", () => {
  it("J and K move the selection through the URL, Esc clears it", async () => {
    viewport(false);
    await mount(standardPort());
    fireEvent.keyDown(document.body, { key: "j" });
    await settle();
    expect(where()).toContain("sel=apr_a");
    fireEvent.keyDown(document.body, { key: "J" });
    await settle();
    expect(where()).toContain("sel=apr_b");
    fireEvent.keyDown(document.body, { key: "k" });
    await settle();
    expect(where()).toContain("sel=apr_a");
    fireEvent.keyDown(document.body, { key: "Escape" });
    await settle();
    expect(where()).not.toContain("sel=");
    expect(screen.getByText("Nothing selected")).toBeTruthy();
  });

  it("J at the last row stays on it, and K at the first stays on it", async () => {
    await mount(standardPort(), "/execution/approvals?sel=apr_d");
    fireEvent.keyDown(document.body, { key: "j" });
    await settle();
    expect(where()).toContain("sel=apr_d");
    cleanup();
    await mount(standardPort(), "/execution/approvals?sel=apr_a");
    fireEvent.keyDown(document.body, { key: "k" });
    await settle();
    expect(where()).toContain("sel=apr_a");
  });

  it("A, R and N do nothing but announce the reason, and call nothing", async () => {
    const p = standardPort();
    await mount(p, "/execution/approvals?sel=apr_a");
    const before = p.calls.length;
    const live = screen.getAllByRole("status").find((el) => el.classList.contains("exec-ck-live")) as HTMLElement;
    fireEvent.keyDown(document.body, { key: "a" });
    expect(live.textContent).toBe("Approve (A): Preview · not recorded");
    fireEvent.keyDown(document.body, { key: "r" });
    expect(live.textContent).toBe("Deny (R): Preview · not recorded");
    fireEvent.keyDown(document.body, { key: "n" });
    expect(live.textContent).toBe("Note (N): Preview · not recorded");
    await settle();
    expect(where()).toContain("sel=apr_a");
    expect(p.calls.length).toBe(before);
  });

  it("keys typed into a field are not shortcuts, and modified keys are left alone", async () => {
    await mount(standardPort(), "/execution/approvals?sel=apr_a");
    const input = document.createElement("input");
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: "j" });
    fireEvent.keyDown(document.body, { key: "j", ctrlKey: true });
    fireEvent.keyDown(document.body, { key: "j", metaKey: true });
    await settle();
    expect(where()).toContain("sel=apr_a");
    input.remove();
  });

  it("Esc with a path selection asks the route to clear it", async () => {
    const onClear = vi.fn();
    await mount(standardPort(), "/governance/approvals/apr_a/r1", { pathSelection: { id: "apr_a", kind: "r1" }, onClearPathSelection: onClear });
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("the key legend names A, R and N as bound to the preview actions, and is the queue panel's footer (CK-4)", async () => {
    await mount(standardPort());
    const legend = document.querySelector(".exec-ck-keys") as HTMLElement;
    expect(legend.textContent).toContain("approve");
    expect(legend.textContent).toContain("deny");
    expect(legend.textContent).toContain("note");
    expect(legend.textContent).toContain("help");
    expect(queue().contains(legend)).toBe(true);
  });

  it("the Keys button and ? open the shortcut list; Esc closes it and keeps the selection (CK-3)", async () => {
    await mount(standardPort(), "/execution/approvals?sel=apr_a");
    expect(screen.queryByRole("dialog", { name: "Keys" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Keys/ }));
    const dialog = screen.getByRole("dialog", { name: "Keys" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    // The list says what A, R and N do in this build; it does not promise a recorded decision.
    expect(dialog.textContent).toContain("Preview · not recorded");
    fireEvent.keyDown(document.body, { key: "Escape" });
    await settle();
    expect(screen.queryByRole("dialog", { name: "Keys" })).toBeNull();
    expect(where()).toContain("sel=apr_a");
    fireEvent.keyDown(document.body, { key: "?" });
    expect(screen.getByRole("dialog", { name: "Keys" })).toBeTruthy();
    // J does not move the selection while the list is open.
    fireEvent.keyDown(document.body, { key: "j" });
    await settle();
    expect(where()).toContain("sel=apr_a");
    fireEvent.click(within(screen.getByRole("dialog", { name: "Keys" })).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog", { name: "Keys" })).toBeNull();
  });
});

/* ── honesty of the whole screen ──────────────────────────────────────────── */

describe("no dash stands in for a value", () => {
  it("no leaf element on any pane reads as a bare dash, N/A or a lone zero", async () => {
    const p = standardPort();
    await mount(p, "/execution/approvals", { workspaceId: "ws_x" });
    const check = () => {
      const bad = [...document.querySelectorAll("*")]
        .filter((el) => el.children.length === 0)
        .map((el) => (el.textContent ?? "").trim())
        .filter((text) => /^(-|—|–|N\/A|n\/a|null|undefined|NaN)$/.test(text));
      expect(bad).toEqual([]);
    };
    check();
    for (const name of [/Alpha One/, /Beta Two/, /Gamma Exit/, /Delta Live/]) {
      fireEvent.click(rowButton(name));
      await settle();
      check();
    }
    fireEvent.click(within(queue()).getByRole("button", { name: "Waiver" }));
    await settle();
    fireEvent.click(within(queue()).getAllByRole("listitem")[0].querySelector("button") as HTMLElement);
    await settle();
    check();
  });

  it("no dash glyph appears as visible text anywhere in the cockpit", async () => {
    await mount(standardPort(), "/execution/approvals?sel=apr_a");
    expect(document.body.textContent).not.toMatch(/[—–]/);
  });
});
