/**
 * FE-068 · New request reads the caller's own ADVISORY eligibility for `approval.create`.
 *
 * It explains a Submit that is off (the delivery policy) with the server's own reason, and warns beside a Submit that is on when the
 * reader's own check says the server will refuse. It never opens Submit, never closes it, and the gate does not read it. Bodies are
 * the canonical fixture cases read through the strict reader. Lane: FIXTURE_LAB.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ApprovalCreateInput, ExecutionApi, Result } from "../../../api/ports";
import { readStageActionEligibilityV1, type StageActionEligibilityRead } from "../../readers/stageActionEligibility";
import { loadCanonical } from "../../testkit/loadCanonical";
import { STAGE_WHY } from "../stage/reasons";
import NewRequestPage from "./index";
import { clearRequestIntents } from "./useNewRequest";

type Draft = any;
const CASES = loadCanonical<{ stage_action_eligibility: Record<string, Draft> }>("governance-requester-reads.synthetic").stage_action_eligibility;
const RUNS = {
  items: [
    { run_id: "run_TEST_ONLY_a1", status: "COMPLETED", created_at_utc_ms: Date.UTC(2026, 9, 12), binding: { alpha_id: "alpha_TEST_ONLY_a", alpha_name: "BTC Trend" }, eligible_methodology_claim_ids: ["claim_TEST_ONLY_a1"], methodology_claims: [{ id: "claim_TEST_ONLY_a1", grade: "A", state: "ELIGIBLE" }] },
  ],
};

beforeEach(() => {
  clearRequestIntents();
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify(RUNS), { status: 200, headers: { "content-type": "application/json" } }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function readOf(body: unknown): Result<StageActionEligibilityRead> {
  const value = readStageActionEligibilityV1(body);
  return value === null ? { ok: false, status: "unavailable", reason: "unreadable" } : { ok: true, value };
}

function port(answer: () => Result<StageActionEligibilityRead> | "missing") {
  const createApprovalRequest = vi.fn(async (_input: ApprovalCreateInput) => (
    { kind: "created", approvalId: "apr_TEST_ONLY_203", subjectLabel: "alpha_TEST_ONLY_a", status: "PENDING", slaDueAt: null, policyVersion: "approval.v3", quorumRequired: 2, requester: "lan" }
  ));
  const getStageActionEligibility = vi.fn(async () => {
    const a = answer();
    if (a === "missing") throw new Error("no such method");
    return a;
  });
  const api = new Proxy({}, {
    get(_t, name) {
      if (name === "createApprovalRequest") return createApprovalRequest;
      if (name === "getStageActionEligibility") return getStageActionEligibility;
      if (typeof name === "symbol" || name === "then") return undefined;
      return () => { throw new Error(`unexpected port call: ${String(name)}`); };
    },
  }) as unknown as ExecutionApi;
  return { api, createApprovalRequest, getStageActionEligibility };
}

const mount = (api: ExecutionApi, writeBlockedReason?: string | null) =>
  render(<MemoryRouter initialEntries={["/governance/approvals/new"]}><NewRequestPage api={api} writeBlockedReason={writeBlockedReason} /></MemoryRouter>);

const submit = () => screen.getByRole("button", { name: "Submit for R1 review" });
const why = () => document.querySelector(".exec-rq-bar")!.textContent ?? "";

async function fill() {
  await screen.findByRole("option", { name: "BTC Trend" });
  fireEvent.change(screen.getByRole("combobox", { name: /^Alpha/ }), { target: { value: "alpha_TEST_ONLY_a" } });
  fireEvent.change(screen.getByRole("combobox", { name: /^Evidence run/ }), { target: { value: "run_TEST_ONLY_a1" } });
  fireEvent.change(screen.getByRole("textbox", { name: /^Summary/ }), { target: { value: "Momentum with a venue calendar." } });
}

const POLICY = "Governance writes are not enabled on this build.";

describe("approval.create eligibility", () => {
  it("asks once the form is in use, for the caller's own workspace", async () => {
    const { api, getStageActionEligibility } = port(() => readOf(CASES.admin_with_r2_read));
    mount(api);
    await waitFor(() => expect(getStageActionEligibility).toHaveBeenCalledTimes(1));
    expect(getStageActionEligibility).toHaveBeenCalledWith(undefined);
  });

  it("a Submit closed by the policy reads the server's reason when it published a refusal", async () => {
    const { api, getStageActionEligibility } = port(() => readOf(CASES.retained_review_read_only));
    mount(api, POLICY);
    await waitFor(() => expect(why()).toContain(`${STAGE_WHY.readOnly} · Basis: workspace membership · Step-up: not required`));
    expect(getStageActionEligibility).toHaveBeenCalled();
    expect(submit().getAttribute("aria-disabled")).toBe("true");
    expect(submit().getAttribute("title")).toContain(STAGE_WHY.readOnly);
  });

  it("an ELIGIBLE verdict leaves the policy sentence exactly as it was, and Submit stays closed", async () => {
    const { api, getStageActionEligibility } = port(() => readOf(CASES.admin_with_r2_read));
    mount(api, POLICY);
    await waitFor(() => expect(getStageActionEligibility).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(why()).toContain(POLICY);
    expect(why()).not.toContain("Basis:");
    expect(submit().getAttribute("aria-disabled")).toBe("true");
  });

  it("a failed or missing read keeps the policy sentence", async () => {
    const { api, getStageActionEligibility } = port(() => ({ ok: false, status: "unavailable", reason: "INTERNAL_ERROR" }));
    mount(api, POLICY);
    await waitFor(() => expect(getStageActionEligibility).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(why()).toContain(POLICY);
    cleanup();
    const missing = port(() => "missing");
    mount(missing.api, POLICY);
    await waitFor(() => expect(missing.getStageActionEligibility).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(why()).toContain(POLICY);
  });

  it("a verdict that refuses does not close an open Submit: it adds a note beside it, and the click still goes to the server", async () => {
    const { api, createApprovalRequest } = port(() => readOf(CASES.retained_review_read_only));
    mount(api);
    await fill();
    await waitFor(() => expect(why()).toContain("Your access check says this will be refused"));
    expect(why()).not.toContain("Submit still asks the server");
    expect(submit().getAttribute("aria-disabled")).not.toBe("true");
    expect(createApprovalRequest).not.toHaveBeenCalled();
    fireEvent.click(submit());
    expect(createApprovalRequest).toHaveBeenCalledTimes(1);
    await screen.findByRole("status", { name: "Request created" });
  });

  it("an ELIGIBLE verdict adds nothing beside an open Submit", async () => {
    const { api, getStageActionEligibility } = port(() => readOf(CASES.admin_with_r2_read));
    mount(api);
    await fill();
    await waitFor(() => expect(getStageActionEligibility).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(why()).not.toContain("access check");
    expect(why()).not.toContain("Nothing is sent until you click Submit.");
  });
});
