/**
 * The cockpit's evidence pane given a V1 body and a V2 parent body for the same
 * request. The V2 bodies are the canonical files Codex published, read from
 * disk and pushed through the real dispatch (`readGovernanceParentByKind`); the
 * port only stands in for the network.
 *
 * What this pins (consumer-review-2026-10-18, F8-01):
 * - a V2 R2 body whose lineage is AVAILABLE never prints "The response carried
 *   no R1 lineage" or "No capital rows published";
 * - a V2 Paper Exit body shows its findings as published (outcome, blocking,
 *   required) and says "Gate verdict: Not published (FE-028)" instead of
 *   "Gate not met" for a verdict the body does not carry;
 * - a V2 Live body shows the approval and `Not published (FE-xxx)` for the rest;
 * - an unreadable or unsupported body is a stated failure, never a half page;
 * - the V1 pane is unchanged for V1 bodies (cockpit.test.tsx).
 */
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ExecutionApi, InboxResult, Result } from "../../../api/ports";
import type { ApprovalRow } from "../../../screens/ApprovalInbox";
import { loadCanonical } from "../../testkit/loadCanonical";
import { readGovernanceParentByKind, v1GovernanceParent, type GovernanceParentKind, type GovernanceParentRead } from "../../readers/dispatch";
import { V2_ROLE_PRESETS } from "../../shell/roleNav";
import Cockpit from "./index";

const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("../../../../auth/session", () => ({ useSession: () => session.current }));

type Fixture = Record<string, any>;
const parent = () => loadCanonical<Fixture>("execution-positive-parent.synthetic");

function row(id: string, gate: ApprovalRow["gate"], subject: string): ApprovalRow {
  return {
    id: id as ApprovalRow["id"], gate, subject, target: "paper · BINANCE", blockerCount: 0, blockerSummary: null,
    sla: { ageMinutes: 5, budgetMinutes: 240, state: "ON_TRACK" }, quorumMet: 0, quorumRequired: 2, inert: null, needsYou: false,
  };
}
function wire(id: string, gate: string, subject: string): Record<string, unknown> {
  return {
    id, gate, subject, status: "PENDING", creator: { user_id: "usr_stan", username: "stan" }, requester: { user_id: "usr_stan", username: "stan" },
    sla: { state: "ON_TRACK", age_minutes: 5, budget_minutes: 240 }, quorum_met: 0, quorum_required: 2, needs_you: false, inert: null,
  };
}

const ROWS = [row("apr_r2", "R2", "Beta Two"), row("apr_exit", "PAPER_EXIT", "Gamma Exit"), row("apr_live", "LIVE_GATE", "Delta Live")];
const RAW = [wire("apr_r2", "R2", "Beta Two"), wire("apr_exit", "PAPER_EXIT", "Gamma Exit"), wire("apr_live", "LIVE_GATE", "Delta Live")];

function inbox(): InboxResult & { rawRows: unknown[] } {
  return {
    page: { rows: ROWS, totalCount: 3, filteredCount: 3, hasMore: false, nextCursor: null },
    counts: { pending: 3, overdue: 0, dueSoon: null },
    rawRows: RAW,
  };
}

/** A port whose evidence read answers `read` for every kind; nothing else is read. */
function portAnswering(answer: (kind: GovernanceParentKind) => Result<GovernanceParentRead>): { api: ExecutionApi; calls: string[] } {
  const calls: string[] = [];
  const api = new Proxy({}, {
    get(_target, name) {
      if (typeof name !== "string") return undefined;
      return (...args: unknown[]) => {
        calls.push(name);
        switch (name) {
          case "listApprovals": return Promise.resolve({ ok: true, value: inbox() });
          case "getApprovalHistory": return Promise.resolve({ ok: true, value: { rows: [], totalCount: 0, deliveryProfile: null } });
          case "getWaivers": return Promise.resolve({ ok: false, status: "unavailable", reason: "not under test" });
          case "getReviewCaptureCapabilities": return Promise.resolve({ ok: true, value: { schema_version: "governance.review-capture-capabilities.v1", authority: "PORTAL", source_side_effect_requested: false, actions: [] } });
          case "getGovernanceParent": return Promise.resolve(answer(args[0] as GovernanceParentKind));
          default: throw new Error(`unexpected port call: ${name}`);
        }
      };
    },
  }) as ExecutionApi;
  return { api, calls };
}

const okRead = (kind: GovernanceParentKind, body: unknown, warnings?: string[]): Result<GovernanceParentRead> =>
  ({ ok: true, value: readGovernanceParentByKind(kind, body), ...(warnings ? { warnings } : {}) });

async function open(p: { api: ExecutionApi }, sel: string) {
  render(
    <MemoryRouter initialEntries={[`/execution/approvals?sel=${sel}`]}>
      <Cockpit api={p.api} />
    </MemoryRouter>,
  );
  for (let i = 0; i < 5; i += 1) await act(async () => { await new Promise((done) => setTimeout(done, 0)); });
  return screen.getByRole("region", { name: "Evidence" });
}

beforeEach(() => {
  session.current = {
    principal: { principalId: "p_bobby", username: "bobby", role: "x", sessionId: "s", mustChangePassword: false, authnMethods: [], issuedAt: "", exp: 0 },
    access: { kind: "ready", access: { userId: "usr_bobby", isOwner: false, ownerState: "NOT_OWNER", capabilities: [...V2_ROLE_PRESETS.manager] } },
  };
});
afterEach(cleanup);

describe("R2, V2 body", () => {
  it("shows the published lineage and its ids, and never the false claim", async () => {
    const p = portAnswering((kind) => okRead(kind, parent().r2));
    const evidence = await open(p, "apr_r2");
    const lineage = within(evidence).getByRole("region", { name: "R1 lineage" });
    expect(lineage.textContent).toContain("apr_TEST_ONLY_r1");
    expect(lineage.textContent).toContain("grant_TEST_ONLY_historical");
    expect(lineage.textContent).toContain("TEST_ONLY:USD");
    // The exact false claims of the V1 reader on this body.
    expect(evidence.textContent).not.toContain("The response carried no R1 lineage");
    expect(evidence.textContent).not.toContain("No capital rows published");
    expect(within(evidence).getByRole("heading", { name: "R1 lineage published" })).toBeTruthy();
  });

  it("names what the body does not carry with its FE request", async () => {
    const evidence = await open(portAnswering((kind) => okRead(kind, parent().r2)), "apr_r2");
    expect(within(evidence).getByRole("region", { name: "Criteria" }).textContent).toContain("Not published (FE-028)");
    expect(within(evidence).getByRole("region", { name: "Capital change preview" }).textContent).toContain("Not published (FE-030)");
    const lineage = within(evidence).getByRole("region", { name: "R1 lineage" });
    expect(lineage.textContent).toContain("Not published (FE-028)");
    expect(lineage.textContent).toContain("Not published (FE-030)");
  });

  it("prints the approval row from the body: quorum, policy and the Portal clocks", async () => {
    const evidence = await open(portAnswering((kind) => okRead(kind, parent().r2)), "apr_r2");
    const approval = within(evidence).getByRole("region", { name: "Approval" });
    expect(approval.textContent).toContain("0 of 2");
    expect(approval.textContent).toContain("TEST_ONLY:policy-v1");
    expect(approval.textContent).toContain("Expired");
    expect(approval.textContent).toContain("None yet");
  });

  it("an absent lineage says so with the server's reason, not that the response had none", async () => {
    const evidence = await open(portAnswering((kind) => okRead(kind, parent().r2_absent)), "apr_r2");
    const lineage = within(evidence).getByRole("region", { name: "R1 lineage" });
    expect(lineage.textContent).toContain("Not published · PARENT_FIELD_PURPOSE_NOT_QUALIFIED");
    expect(evidence.textContent).not.toContain("The response carried no R1 lineage");
    expect(within(evidence).getByRole("heading", { name: "R1 lineage not published" })).toBeTruthy();
  });

  it("the rail reads quorum and policy from the V2 body and says the creator is not published", async () => {
    await open(portAnswering((kind) => okRead(kind, parent().r2)), "apr_r2");
    const rail = screen.getByRole("complementary", { name: "Decision" });
    expect(rail.textContent).toContain("Policy TEST_ONLY:policy-v1");
    expect(rail.textContent).toContain("Not published (FE-030)");
  });
});

describe("Paper Exit, V2 body", () => {
  it("shows the four panels and the findings as published, and no gate verdict it does not have", async () => {
    const evidence = await open(portAnswering((kind) => okRead(kind, parent().paper_exit)), "apr_exit");
    for (const title of ["Observation coverage", "Drift", "Limits health", "Portfolio fit"]) {
      expect(within(evidence).getByRole("region", { name: title })).toBeTruthy();
    }
    const coverage = within(evidence).getByRole("region", { name: "Observation coverage" });
    expect(coverage.textContent).toContain("finding_TEST_ONLY_0");
    expect(coverage.textContent).toContain("Within");
    expect(coverage.textContent).toContain("Required");
    const drift = within(evidence).getByRole("region", { name: "Drift" });
    expect(drift.textContent).toContain("Insufficient");
    expect(drift.textContent).toContain("Blocking");
    expect(drift.textContent).toContain("Not published (FE-028)");
    expect(within(evidence).getByRole("heading", { name: "Findings 1 of 4 pass" })).toBeTruthy();
    expect(evidence.textContent).toContain("3 blocking");
    expect(evidence.textContent).toContain("Gate verdict: Not published (FE-028)");
    expect(evidence.textContent).not.toContain("Gate not met");
    expect(evidence.textContent).not.toContain("Gate met");
  });

  it("shows the lineage hashes and the quorum the body publishes", async () => {
    const evidence = await open(portAnswering((kind) => okRead(kind, parent().paper_exit)), "apr_exit");
    const lineage = within(evidence).getByRole("region", { name: "Lineage" });
    expect(lineage.textContent).toContain("apr_TEST_ONLY_r1");
    expect(lineage.textContent).toContain(`sha256:${"1".repeat(64)}`);
    expect(within(evidence).getByRole("region", { name: "Approval" }).textContent).toContain("0 of 2");
  });

  it("an extended review shows its extension", async () => {
    const evidence = await open(portAnswering((kind) => okRead(kind, parent().paper_exit_extended)), "apr_exit");
    expect(within(evidence).getByRole("region", { name: "Review" }).textContent).toContain("14 days");
  });

  it("an absent evaluation is the server's reason, not an empty list of findings", async () => {
    const evidence = await open(portAnswering((kind) => okRead(kind, parent().paper_exit_absent)), "apr_exit");
    expect(within(evidence).getByRole("region", { name: "Evaluation" }).textContent).toContain("Not published · PARENT_FIELD_PURPOSE_NOT_QUALIFIED");
    expect(within(evidence).getByRole("heading", { name: "Evaluation not published" })).toBeTruthy();
    expect(evidence.textContent).not.toContain("No findings published");
  });
});

describe("Live, V2 body", () => {
  it("shows the approval and Not published (FE-xxx) for the backbone, branches and live facts", async () => {
    const evidence = await open(portAnswering((kind) => okRead(kind, parent().live)), "apr_live");
    expect(within(evidence).getByRole("region", { name: "Approval" }).textContent).toContain("Pending");
    expect(within(evidence).getByRole("region", { name: "Governance backbone" }).textContent).toContain("Not published (FE-028)");
    expect(within(evidence).getByRole("region", { name: "Canary evidence branches" }).textContent).toContain("Not published (FE-029)");
    expect(within(evidence).getByRole("region", { name: "Current source · live facts" }).textContent).toContain("Not published (FE-029)");
    expect(within(evidence).getByRole("heading", { name: /Evidence ready · Live decisions are closed/ })).toBeTruthy();
  });
});

describe("V1 body through the same port", () => {
  it("is the V1 pane, exactly as before (R2)", async () => {
    const v1 = loadCanonical<Fixture>("execution-governance.r2-review");
    const p = portAnswering((kind) => okRead(kind, v1));
    const evidence = await open(p, "apr_r2");
    expect(within(evidence).getByRole("region", { name: "Capital change preview" })).toBeTruthy();
    expect(within(evidence).queryByRole("region", { name: "Approval" })).toBeNull();
  });

  it("the V1 reader still says no R1 lineage for a V1 body that carries none", async () => {
    const v1 = loadCanonical<Fixture>("execution-governance.r2-review");
    delete v1.data.r1_reference;
    delete v1.data.r1_state;
    const evidence = await open(portAnswering((kind) => okRead(kind, v1)), "apr_r2");
    expect(evidence.textContent).toContain("The response carried no R1 lineage");
  });
});

describe("a body that cannot be read is a stated failure", () => {
  it("a malformed V2 body shows the schema_version and shows none of it", async () => {
    const bad = structuredClone(parent().r2);
    bad.lineage.r1_approval_id = 7;
    const evidence = await open(portAnswering((kind) => okRead(kind, bad)), "apr_r2");
    expect(evidence.textContent).toContain('schema_version "portal.execution.governance-parent.v2"');
    expect(within(evidence).queryByRole("region", { name: "R1 lineage" })).toBeNull();
    expect(evidence.textContent).not.toContain("apr_TEST_ONLY_r1");
  });

  it("a V2 shape wearing a V1 label is refused, not read as either", async () => {
    const mixed = { ...parent().r2, schema_version: "governance.r2-review.v1" };
    const evidence = await open(portAnswering((kind) => okRead(kind, mixed)), "apr_r2");
    expect(evidence.textContent).toContain("governance.r2-review.v1");
    expect(within(evidence).queryByRole("region", { name: "R1 lineage" })).toBeNull();
  });

  it("another route's V2 body is not read", async () => {
    const evidence = await open(portAnswering((kind) => okRead(kind, parent().live)), "apr_r2");
    expect(evidence.textContent).toContain("portal.execution.live-parent.v2");
    expect(within(evidence).queryByRole("region", { name: "Approval" })).toBeNull();
  });

  it("an unsupported answer inside an ok result is shown, not thrown", async () => {
    const evidence = await open(portAnswering((kind) => ({ ok: true, value: { kind: kind as "r2", read: { kind: "unsupported", schemaVersion: "portal.execution.something.v9", reason: "UNKNOWN_SCHEMA_VERSION" } } })), "apr_r2");
    expect(evidence.textContent).toContain("portal.execution.something.v9");
  });
});

describe("the V1 wrapper keeps a V1-only port working", () => {
  it("v1GovernanceParent wraps a V1 answer and passes a failure through", async () => {
    const failure = { ok: false as const, status: "denied" as const, reason: "No read." };
    const api = {
      getGateR2: async () => failure,
      getPaperExit: async () => failure,
      getLiveReview: async () => failure,
    };
    expect(await v1GovernanceParent(api, "r2", "apr_1", undefined)).toBe(failure);
  });
});

describe("the cells that were bare 'Not published' now carry their FE request", () => {
  it("Approvers and Clock in My requests, and Policy in the rail, name FE-030", async () => {
    // A researcher sees their own requests; the row publishes neither a quorum nor an SLA.
    session.current = {
      principal: { principalId: "p_stan", username: "stan", role: "x", sessionId: "s", mustChangePassword: false, authnMethods: [], issuedAt: "", exp: 0 },
      access: { kind: "ready", access: { userId: "usr_stan", isOwner: false, ownerState: "NOT_OWNER", capabilities: [...V2_ROLE_PRESETS.researcher] } },
    };
    const bare = { ...wire("apr_a", "R1", "Alpha One"), quorum_met: null, quorum_required: null, sla: null };
    const mine = portAnswering((kind) => okRead(kind, parent().r2));
    const api = new Proxy(mine.api, {
      get(target, name, receiver) {
        if (name === "listApprovals") {
          return () => Promise.resolve({ ok: true, value: { ...inbox(), rawRows: [bare], page: { ...inbox().page, rows: [{ ...ROWS[0], id: "apr_a", gate: "R1", subject: "Alpha One", quorumMet: null, quorumRequired: null, sla: null }] } } });
        }
        return Reflect.get(target, name, receiver);
      },
    }) as ExecutionApi;
    render(<MemoryRouter initialEntries={["/execution/approvals"]}><Cockpit api={api} /></MemoryRouter>);
    for (let i = 0; i < 5; i += 1) await act(async () => { await new Promise((done) => setTimeout(done, 0)); });
    const table = screen.getByRole("table", { name: "Your requests" });
    const cells = [...table.querySelectorAll("tbody tr:first-child td")].map((td) => td.textContent);
    expect(cells[2]).toBe("Not published (FE-030)");
    expect(cells[3]).toBe("Not published (FE-030)");
    expect(table.textContent).not.toMatch(/Not published(?! \()/);
  });

  it("the rail says Policy Not published (FE-030) when neither the row nor the read carries one", async () => {
    const p = portAnswering(() => ({ ok: false, status: "unavailable", reason: "not under test" }));
    await open(p, "apr_r2");
    const rail = screen.getByRole("complementary", { name: "Decision" });
    expect(rail.textContent).toContain("Policy Not published (FE-030)");
  });
});
