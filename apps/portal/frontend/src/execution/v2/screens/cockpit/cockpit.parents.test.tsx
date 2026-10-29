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
 *   required) and says "Gate verdict: Not published" instead of
 *   "Gate not met" for a verdict the body does not carry;
 * - since Codex e19ad906 the same bodies can carry stored actor ids, the latest
 *   recorded plan, the R2 decision inputs, the R2 recorded verdicts, the
 *   recorded decisions and the Paper Exit criteria. Each is drawn from the
 *   body when it is there (and says nothing the body does not say) and is
 *   `Not published (FE-xxx)` with the server's reason when it is not;
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
import { whyText } from "../../gapWhyTestUtil";

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
    expect(within(evidence).getByRole("region", { name: "Criteria" }).textContent).toContain("Not published");
    expect(within(evidence).getByRole("region", { name: "Capital change preview" }).textContent).toContain("Not published");
    const lineage = within(evidence).getByRole("region", { name: "R1 lineage" });
    expect(lineage.textContent).toContain("Not published");
    expect(lineage.textContent).toContain("Not published");
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
    expect(rail.textContent).toContain("Not published");
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
    expect(drift.textContent).toContain("Not published");
    expect(within(evidence).getByRole("heading", { name: "Findings 1 of 4 pass" })).toBeTruthy();
    expect(evidence.textContent).toContain("3 blocking");
    expect(evidence.textContent).toContain("Gate verdict: Not published");
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

/** A queue row with no creator, so the rail has nothing but the parent's own stored actors to go on. */
const BARE_RAW = [
  { ...wire("apr_r2", "R2", "Beta Two"), creator: null, requester: null },
  { ...wire("apr_exit", "PAPER_EXIT", "Gamma Exit"), creator: null, requester: null },
  { ...wire("apr_live", "LIVE_GATE", "Delta Live"), creator: null, requester: null },
];
function withBareRows(p: { api: ExecutionApi }): { api: ExecutionApi } {
  const api = new Proxy(p.api, {
    get(target, name, receiver) {
      if (name === "listApprovals") return () => Promise.resolve({ ok: true, value: { ...inbox(), rawRows: BARE_RAW } });
      return Reflect.get(target, name, receiver);
    },
  }) as ExecutionApi;
  return { api };
}
const rail = () => screen.getByRole("complementary", { name: "Decision" });
const receipt = () => within(rail()).getByRole("region", { name: /Receipt|Recorded/ });

describe("R2, V2 body with the sections added by e19ad906", () => {
  it("r2_followthrough: the rail names the stored actors with (you) where the server says so, and the latest plan", async () => {
    await open(withBareRows(portAnswering((kind) => okRead(kind, parent().r2_followthrough))), "apr_r2");
    const sod = rail().querySelector(".exec-ck-sod")!;
    // The facts, not a verdict: no "OK" and no "you cannot decide".
    expect(sod.textContent).toContain("Requested by user_TEST_ONLY_requester");
    expect(sod.textContent).toContain("created by user_TEST_ONLY_creator (you)");
    expect(sod.textContent).toContain("not stated by this read");
    expect(sod.textContent).not.toMatch(/Separation of duty OK|cannot decide/);
    expect(sod.getAttribute("data-state")).toBe("unknown");
    const text = receipt().textContent!;
    expect(text).toContain("Requested byuser_TEST_ONLY_requester");
    expect(text).toContain("Created byuser_TEST_ONLY_creator (you)");
    expect(text).toContain("Latest planop_TEST_ONLY_R2_EXPIRED · stored expired · created");
    // What the body still does not carry stays named with its request.
    // ... on one 'Not available' line, with FE-030 behind its disclosure (no row of "Not published" per fact).
    const line = within(receipt()).getByTestId("not-available-line");
    expect(line.textContent).toContain("Not available: Ladder, Call, Receipt ref");
    // "What changes" is a row of the receipt preview (hi-fi), typed, not a fact of that line.
    expect(within(receipt()).getByRole("rowheader", { name: "What changes" }).nextElementSibling?.textContent).toContain("Not published");
    expect(line.hasAttribute("title")).toBe(false);
    expect(whyText(line)).toContain("Ladder: Not published: creator, ladder, SLA and needs-you");
  });

  it("r2_followthrough: the decision inputs are drawn from the body: version, evidence set, hashes, plan route, admission not evaluated", async () => {
    const evidence = await open(portAnswering((kind) => okRead(kind, parent().r2_followthrough)), "apr_r2");
    const inputs = within(evidence).getByRole("region", { name: "Decision inputs" });
    expect(inputs.textContent).toContain("Stored, not an authorization");
    expect(inputs.textContent).toContain("apr_TEST_ONLY_r2");
    expect(inputs.textContent).toContain("Expected version1");
    expect(inputs.textContent).toContain(`sha256:${"5".repeat(64)}`);
    expect(inputs.textContent).toContain("2 hashes");
    expect(inputs.textContent).toContain(`sha256:${"3".repeat(64)}`);
    expect(inputs.textContent).toContain(`sha256:${"4".repeat(64)}`);
    expect(inputs.textContent).toContain("/api/v1/execution/commands/plans");
    expect(inputs.textContent).toContain("Not evaluated · CURRENT_DECISION_ADMISSION_REQUIRES_PLAN");
    expect(inputs.textContent).not.toMatch(/READY|Ready|eligible/);
    // There are still no capital rows on any body.
    expect(within(evidence).getByRole("region", { name: "Capital change preview" }).textContent).toContain("Not published");
  });

  it("r2_followthrough_hashes_absent: more than 128 hashes is an absence with its reason, not an empty list", async () => {
    const evidence = await open(portAnswering((kind) => okRead(kind, parent().r2_followthrough_hashes_absent)), "apr_r2");
    const inputs = within(evidence).getByRole("region", { name: "Decision inputs" });
    expect(inputs.textContent).toContain("Not published · EVIDENCE_HASH_LIMIT_EXCEEDED");
    expect(inputs.textContent).not.toContain("None listed");
  });

  it("r2_recorded: four stored verdicts with their marks, and label, observed and limit named as not recorded (FE-028)", async () => {
    const evidence = await open(portAnswering((kind) => okRead(kind, parent().r2_recorded)), "apr_r2");
    const criteria = within(evidence).getByRole("region", { name: "Criteria" });
    for (const word of ["Within", "Watch", "Blocker", "Insufficient"]) expect(criteria.textContent).toContain(word);
    for (let i = 0; i < 4; i += 1) expect(criteria.textContent).toContain(`finding_TEST_ONLY_r2_${i}`);
    expect(criteria.textContent).toContain("Blocking · Evaluated");
    expect(criteria.textContent).toContain("Not published · SOURCE_STRUCTURED_CRITERION_NOT_RECORDED");
    expect(criteria.textContent).toContain("Stored verdicts, not current gate readiness.");
    expect(criteria.textContent).toContain("4 recorded");
    // No number is invented for a value the source never recorded.
    expect(criteria.querySelectorAll("tbody tr")).toHaveLength(4);
    expect(criteria.querySelector("tbody")!.textContent).not.toMatch(/Observed|Limit/);
  });

  it("r2_recorded: the recorded decisions are listed newest first and say what they are not", async () => {
    const evidence = await open(portAnswering((kind) => okRead(kind, parent().r2_recorded)), "apr_r2");
    const decisions = within(evidence).getByRole("region", { name: "Recorded decisions" });
    const rows = [...decisions.querySelectorAll("tbody tr")].map((tr) => [...tr.querySelectorAll("td")].map((td) => td.textContent));
    expect(rows).toHaveLength(2);
    expect(rows[0]!.slice(1)).toEqual(["deny", "2 to 3", "op_TEST_ONLY_R2_APPLIED"]);
    expect(rows[1]!.slice(1)).toEqual(["approve with condition", "1 to 2", "op_TEST_ONLY_R2_CONDITION"]);
    expect(decisions.textContent).toContain("Newest first");
    expect(decisions.textContent).toContain("not source, order or stage history, and not the full history");
  });

  it("r2_recorded: a decided request names its decider in the recorded receipt, with no (you) for someone else", async () => {
    await open(withBareRows(portAnswering((kind) => okRead(kind, parent().r2_recorded))), "apr_r2");
    const text = receipt().textContent!;
    expect(text).toContain("Decisiondenied");
    expect(text).toContain("Byuser_TEST_ONLY_reviewer");
    expect(text).not.toContain("user_TEST_ONLY_reviewer (you)");
    expect(text).toContain("Latest planop_TEST_ONLY_R2_APPLIED · stored applied");
  });

  it("the plain r2 body keeps every new section as the server's reason, and the rail says Not published for the people", async () => {
    const evidence = await open(withBareRows(portAnswering((kind) => okRead(kind, parent().r2))), "apr_r2");
    expect(within(evidence).getByRole("region", { name: "Decision inputs" }).textContent).toContain("Not published · PARENT_FIELD_PURPOSE_NOT_QUALIFIED");
    expect(within(evidence).getByRole("region", { name: "Recorded decisions" }).textContent).toContain("Not published · PARENT_FIELD_PURPOSE_NOT_QUALIFIED");
    expect(within(evidence).getByRole("region", { name: "Criteria" }).textContent).toContain("Not published · PARENT_FIELD_PURPOSE_NOT_QUALIFIED");
    expect(rail().querySelector(".exec-ck-sod")!.textContent).toContain("not published");
    expect(receipt().textContent).toContain("Requested byNot published · PARENT_FIELD_PURPOSE_NOT_QUALIFIED");
    expect(receipt().textContent).toContain("Latest planNot published · PARENT_FIELD_PURPOSE_NOT_QUALIFIED");
  });

  it("a latest plan the server says does not exist is 'None recorded', not a missing field", async () => {
    const body = structuredClone(parent().r2_followthrough);
    body.latest_operation = { availability: "NOT_PUBLISHED", reason_code: "NO_RECORDED_PORTAL_OPERATION" };
    await open(withBareRows(portAnswering((kind) => okRead(kind, body))), "apr_r2");
    expect(receipt().textContent).toContain("Latest planNone recorded");
  });
});

describe("Paper Exit, V2 body with the sections added by e19ad906", () => {
  it("paper_exit_criteria: label, observed value, limit and unit are drawn exactly; the comparator is not published (FE-028)", async () => {
    const evidence = await open(portAnswering((kind) => okRead(kind, parent().paper_exit_criteria)), "apr_exit");
    const coverage = within(evidence).getByRole("region", { name: "Observation coverage" });
    // Every digit, never rounded: 1842.000000000000000001 is not 1842.
    expect(coverage.textContent).toContain("Observed 1842.000000000000000001");
    expect(coverage.textContent).toContain("Limit 6.00");
    expect(coverage.textContent).toContain("Unit CURRENCY USDC");
    expect(coverage.textContent).toContain("Comparator Not published · SOURCE_COMPARATOR_FIELD_NOT_RECORDED");
    expect(coverage.textContent).toContain("finding_TEST_ONLY_0");
    expect(coverage.textContent).toContain(`Evidence sha256:${"4".repeat(64)}`);
    expect(coverage.textContent).toContain("Source time");
    // A published "0" is a value; a limit never recorded is an absence with its reason.
    const drift = within(evidence).getByRole("region", { name: "Drift" });
    expect(drift.textContent).toContain("Observed 0");
    expect(drift.textContent).toContain("Limit Not published · SOURCE_VALUE_NOT_RECORDED");
    expect(drift.textContent).toContain("Unit Not published · SOURCE_TEXT_NOT_RECORDED");
    const limits = within(evidence).getByRole("region", { name: "Limits health" });
    expect(limits.textContent).toContain("Observed Not published · SOURCE_VALUE_NOT_RECORDED");
    expect(limits.textContent).not.toMatch(/Observed \d/);
    // The gate verdict is still not a thing the body has.
    expect(evidence.textContent).toContain("Gate verdict: Not published");
    expect(evidence.textContent).not.toContain("Gate not met");
    expect(within(evidence).getByRole("heading", { name: "Findings 1 of 4 pass" })).toBeTruthy();
    // The criteria section is there, so the absence panel for it is not.
    expect(within(evidence).queryByRole("region", { name: "Criteria detail" })).toBeNull();
  });

  it("paper_exit (no criteria section): the cells keep Not published and a panel gives the server's reason", async () => {
    const evidence = await open(portAnswering((kind) => okRead(kind, parent().paper_exit)), "apr_exit");
    expect(within(evidence).getByRole("region", { name: "Criteria detail" }).textContent).toContain("Not published · PARENT_FIELD_PURPOSE_NOT_QUALIFIED");
    expect(within(evidence).getByRole("region", { name: "Drift" }).textContent).toContain("Not published");
    expect(within(evidence).getByRole("region", { name: "Drift" }).querySelector("tbody")!.textContent).not.toMatch(/Observed|Comparator/);
  });

  it("paper_exit_followthrough: the rail names the decider (you) and the latest plan; the recorded receipt reads from the actors", async () => {
    await open(withBareRows(portAnswering((kind) => okRead(kind, parent().paper_exit_followthrough))), "apr_exit");
    const text = receipt().textContent!;
    expect(text).toContain("Decisiondenied");
    expect(text).toContain("Byuser_TEST_ONLY_reviewer (you)");
    expect(text).toContain("Latest planop_TEST_ONLY_PAPER_EXIT_APPLIED · stored applied");
    expect(text).toContain("Requested byuser_TEST_ONLY_requester");
    expect(text).not.toContain("Requested byuser_TEST_ONLY_requester (you)");
  });

  it("paper_exit_recorded: one recorded REJECT with its version step and operation", async () => {
    const evidence = await open(portAnswering((kind) => okRead(kind, parent().paper_exit_recorded)), "apr_exit");
    const decisions = within(evidence).getByRole("region", { name: "Recorded decisions" });
    const rows = [...decisions.querySelectorAll("tbody tr")].map((tr) => [...tr.querySelectorAll("td")].map((td) => td.textContent));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.slice(1)).toEqual(["reject", "1 to 2", "op_TEST_ONLY_PAPER_EXIT_APPLIED"]);
  });

  it("a Live body has no actors or plan section: the rail says Not published for them", async () => {
    await open(withBareRows(portAnswering((kind) => okRead(kind, parent().live))), "apr_live");
    expect(receipt().textContent).toContain("Requested byNot published");
    expect(receipt().textContent).toContain("Latest planNot published");
  });
});

/**
 * Pane-level scale (F5 L2): the reader bounds findings at 256 (PaperExitParentReadV2 evaluation.findings maxItems,
 * fixed by F5c from 4,096) and the pane draws every finding it is given, grouped under its panel. So at the pane
 * there is no cap to label: what must hold is that the exact count is printed, every row is there, and a body over
 * the bound is a stated failure, never a trimmed list that reads as whole.
 */
describe("Paper Exit, findings at the pane (scale)", () => {
  const findingsBody = (count: number): Fixture => {
    const body = structuredClone(parent().paper_exit_extended);
    const template = structuredClone(body.evaluation.panels[0]);
    const ids = body.evaluation.panels.map((panel: Fixture) => panel.panel_id as string);
    // Every panel OK, so each finding row is shown under its panel rather than behind a panel state.
    body.evaluation.panels = body.evaluation.panels.map((panel: Fixture) => ({ ...template, panel_id: panel.panel_id, ordinal: panel.ordinal, panel_kind: panel.panel_kind, source_authority: panel.source_authority }));
    const seed = structuredClone(body.evaluation.findings[0]);
    body.evaluation.findings = Array.from({ length: count }, (_, i) => ({
      ...seed,
      finding_id: `finding_scale_${String(i).padStart(4, "0")}`,
      panel_id: ids[i % ids.length],
      ordinal: i,
      outcome: i % 4 === 0 ? "PASS" : "FAIL",
      blocking: i % 4 !== 0,
    }));
    return body;
  };
  const rowsIn = (evidence: HTMLElement) => evidence.querySelectorAll("table.exec-ck-table tbody tr");
  const DOM_BUDGET = 9_000;

  it.each([[199, 50], [200, 50], [201, 51], [256, 64]])("%i findings: the headline prints the exact count and %i pass, every row is drawn", async (count, pass) => {
    const evidence = await open(portAnswering((kind) => okRead(kind, findingsBody(count))), "apr_exit");
    expect(within(evidence).getByRole("heading", { name: `Findings ${pass} of ${count} pass` })).toBeTruthy();
    expect(evidence.textContent).toContain(`${count - pass} blocking`);
    expect(rowsIn(evidence)).toHaveLength(count);
    // Nothing is paged or capped, so no phrase may suggest it was.
    expect(evidence.textContent).not.toMatch(/showing \d+ of|top \d+|more not shown|truncated/i);
    expect(evidence.textContent).toContain("Gate verdict: Not published");
  });

  it("256 findings stay under the DOM budget, with one meter segment per finding", async () => {
    const evidence = await open(portAnswering((kind) => okRead(kind, findingsBody(256))), "apr_exit");
    const nodes = evidence.querySelectorAll("*").length;
    expect(nodes).toBeLessThan(DOM_BUDGET);
    console.info(`cockpit parents: 256 findings -> ${nodes} DOM nodes in the evidence pane (budget ${DOM_BUDGET})`);
    expect(evidence.querySelectorAll("[data-mark]").length + evidence.querySelectorAll(".exec-ck-meter > *").length).toBeGreaterThan(0);
  });

  it("every finding id of a 256 body is on screen exactly once, in the panel it names", async () => {
    const body = findingsBody(256);
    const evidence = await open(portAnswering((kind) => okRead(kind, body)), "apr_exit");
    const regions = ["Observation coverage", "Drift", "Limits health", "Portfolio fit"].map((name) => within(evidence).getByRole("region", { name }));
    expect(regions.reduce((sum, region) => sum + region.querySelectorAll("table.exec-ck-table tbody tr").length, 0)).toBe(256);
    for (const region of regions) expect(region.querySelectorAll("table.exec-ck-table tbody tr")).toHaveLength(64);
    const last = body.evaluation.findings[255].finding_id as string;
    const owner = regions.filter((region) => region.textContent?.includes(last));
    expect(owner).toHaveLength(1);
  });

  it.each([[257], [1_000], [4_096]])("%i findings is over the reader's bound: a stated failure with the schema version, and not one finding drawn", async (count) => {
    const evidence = await open(portAnswering((kind) => okRead(kind, findingsBody(count))), "apr_exit");
    expect(evidence.textContent).toContain('schema_version "portal.execution.governance-parent.v2"');
    expect(rowsIn(evidence)).toHaveLength(0);
    expect(evidence.textContent).not.toContain("finding_scale_0000");
    expect(within(evidence).queryByRole("heading", { name: /^Findings \d+ of \d+ pass$/ })).toBeNull();
  });

  it("a body whose findings repeat an id is refused whole, not drawn with one of them dropped", async () => {
    const body = findingsBody(200);
    body.evaluation.findings[199].finding_id = body.evaluation.findings[0].finding_id;
    const evidence = await open(portAnswering((kind) => okRead(kind, body)), "apr_exit");
    expect(rowsIn(evidence)).toHaveLength(0);
    expect(evidence.textContent).toContain('schema_version "portal.execution.governance-parent.v2"');
  });

  it("zero findings is the empty statement per panel and an exact 0 of 0, not a pass", async () => {
    const evidence = await open(portAnswering((kind) => okRead(kind, findingsBody(0))), "apr_exit");
    expect(within(evidence).getByRole("heading", { name: "Findings 0 of 0 pass" })).toBeTruthy();
    expect(evidence.textContent).toContain("0 blocking");
    expect(evidence.textContent).toContain("No findings published");
    expect(rowsIn(evidence)).toHaveLength(0);
  });
});

describe("Live, V2 body", () => {
  it("shows the approval and Not published (FE-xxx) for the backbone, branches and live facts", async () => {
    const evidence = await open(portAnswering((kind) => okRead(kind, parent().live)), "apr_live");
    expect(within(evidence).getByRole("region", { name: "Approval" }).textContent).toContain("Pending");
    expect(within(evidence).getByRole("region", { name: "Governance backbone" }).textContent).toContain("Not published");
    expect(within(evidence).getByRole("region", { name: "Canary evidence branches" }).textContent).toContain("Not published");
    expect(within(evidence).getByRole("region", { name: "Current source · live facts" }).textContent).toContain("Not published");
    expect(within(evidence).getByRole("heading", { name: /Evidence incomplete · Live decisions are closed/ })).toBeTruthy();
  });
});

describe("Live, V2 body: the snapshot blocker line does not depend on the inbox (R-B)", () => {
  const LINE = "Blockers: 2 blockers · TEST_ONLY: two stored blockers";
  /** The Live gate read by path (no inbox row needed), with the inbox answering as `inboxMode` says. */
  async function openByPath(inboxMode: "ok" | "denied" | "slow", body: unknown) {
    let releaseInbox: () => void = () => undefined;
    const api = new Proxy({}, {
      get(_t, name) {
        if (typeof name !== "string") return undefined;
        return () => {
          switch (name) {
            case "listApprovals":
              if (inboxMode === "denied") return Promise.resolve({ ok: false, status: "denied", reason: "Not permitted." });
              if (inboxMode === "slow") return new Promise((done) => { releaseInbox = () => done({ ok: true, value: inbox() }); });
              return Promise.resolve({ ok: true, value: inbox() });
            case "getApprovalHistory": return Promise.resolve({ ok: true, value: { rows: [], totalCount: 0, deliveryProfile: null } });
            case "getWaivers": return Promise.resolve({ ok: false, status: "unavailable", reason: "not under test" });
            case "getReviewCaptureCapabilities": return Promise.resolve({ ok: true, value: { schema_version: "governance.review-capture-capabilities.v1", authority: "PORTAL", source_side_effect_requested: false, actions: [] } });
            case "getGovernanceParent": return Promise.resolve(okRead("live", body));
            default: throw new Error(`unexpected port call: ${String(name)}`);
          }
        };
      },
    }) as ExecutionApi;
    render(
      <MemoryRouter initialEntries={["/execution/approvals/apr_live/live"]}>
        <Cockpit api={api} pathSelection={{ kind: "live", id: "apr_live" }} />
      </MemoryRouter>,
    );
    for (let i = 0; i < 5; i += 1) await act(async () => { await new Promise((done) => setTimeout(done, 0)); });
    return { evidence: screen.getByRole("region", { name: "Evidence" }), releaseInbox };
  }

  it.each(["ok", "denied", "slow"] as const)("the line reads from the gate body alone with the inbox %s", async (mode) => {
    const { evidence, releaseInbox } = await openByPath(mode, parent().live_blockers);
    expect(evidence.textContent).toContain(LINE);
    // A slow inbox that finishes AFTER the gate read changes nothing.
    await act(async () => { releaseInbox(); await new Promise((done) => setTimeout(done, 0)); });
    expect(screen.getByRole("region", { name: "Evidence" }).textContent).toContain(LINE);
  });

  it.each(["live", "live_blockers_absent", "live_blockers_zero"])("%s: the generic state in every inbox order, never a blocker line or a clear gate", async (name) => {
    for (const mode of ["ok", "denied"] as const) {
      const { evidence } = await openByPath(mode, parent()[name]);
      expect(evidence.textContent).toMatch(/Evidence incomplete/);
      expect(evidence.textContent).not.toMatch(/Blockers:|no blockers|0 blockers/i);
      cleanup();
    }
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
    expect(cells[2]).toBe("Not published");
    expect(cells[3]).toBe("Not published");
  });

  it("the rail says Policy Not published when neither the row nor the read carries one", async () => {
    const p = portAnswering(() => ({ ok: false, status: "unavailable", reason: "not under test" }));
    await open(p, "apr_r2");
    const rail = screen.getByRole("complementary", { name: "Decision" });
    expect(rail.textContent).toContain("Policy Not published");
  });
});
