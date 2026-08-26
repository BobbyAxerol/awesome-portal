/**
 * Phase 5 close-out: the three holes codex's PRE-IAM-02 lane named.
 *
 * Each test is a way the screen could have told a reviewer something false
 * while looking entirely correct.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PaperExitReview, type EvidencePanelSpec } from "./screens/PaperExitReview";
import { readEligibility, NO_ELIGIBILITY } from "./api/rows";
import { isPaperExitDecision, PAPER_EXIT_EXTENSION_DAYS } from "./api/ports";
import { createHttpApi, csrfToken } from "./api/httpApi";

afterEach(cleanup);

const FULL: EvidencePanelSpec[] = [
  { title: "Observation coverage", findings: [{ label: "30 / 30 days", outcome: "pass" }] },
  { title: "Risk & limits", findings: [{ label: "no breach", outcome: "pass" }] },
];

const ALL = {
  canApprove: true,
  canApproveWithCondition: true,
  canDeny: true,
  canExtendObservation: true,
  canReject: true,
  separationOfDuties: "OK" as const,
};

function exit(over: Record<string, unknown> = {}) {
  return render(
    <PaperExitReview
        onCopyProvenance={vi.fn()}
      reviewId="EX-771"
      deploymentId="dep_94"
      subject="Grid v2.1 · dep_94 · DERIBIT"
      promoteTo="SANDBOX_VALIDATION"
      gateMet
      quorumMet={1}
      quorumRequired={1}
      panels={FULL}
      eligibility={ALL}
      {...over}
    />,
  );
}

const promote = () => screen.getByRole("button", { name: /Approve promotion/ });
const extend = () => screen.getByRole("button", { name: /Extend observation/ });
const reject = () => screen.getByRole("button", { name: /Reject/ });

describe("B4 — extend and reject answer to authority, not only to the gate", () => {
  it("offers all three when the server allows all three", () => {
    exit();
    expect(promote().hasAttribute("disabled")).toBe(false);
    expect(extend().hasAttribute("disabled")).toBe(false);
    expect(reject().hasAttribute("disabled")).toBe(false);
  });

  it("disables extend when the server withholds it", () => {
    exit({ eligibility: { ...ALL, canExtendObservation: false } });
    expect(extend().hasAttribute("disabled")).toBe(true);
    expect(reject().hasAttribute("disabled")).toBe(false);
    expect(screen.getByText(/Extending the observation window is not available/)).toBeTruthy();
  });

  it("disables reject when the server withholds it", () => {
    exit({ eligibility: { ...ALL, canReject: false } });
    expect(reject().hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/Rejecting to PAPER_HELD is not available/)).toBeTruthy();
  });

  it("keeps the gate and authority as separate reasons", () => {
    // Gate unmet but authority intact: promotion stops, the other two do not.
    exit({ gateMet: false });
    expect(promote().hasAttribute("disabled")).toBe(true);
    expect(extend().hasAttribute("disabled")).toBe(false);
    expect(reject().hasAttribute("disabled")).toBe(false);
    expect(screen.getByText(/observation gate is not met/)).toBeTruthy();
  });

  it("names separation of duties rather than leaving three dead buttons", () => {
    exit({
      eligibility: {
        ...NO_ELIGIBILITY,
        separationOfDuties: "VIOLATION" as const,
      },
    });
    expect(screen.getByText(/you may not decide a review you requested/)).toBeTruthy();
    expect(extend().hasAttribute("disabled")).toBe(true);
    expect(reject().hasAttribute("disabled")).toBe(true);
  });

  it("says a missing eligibility is a missing answer, not a refusal", () => {
    exit({ eligibility: null });
    expect(screen.getByText(/missing answer, not a refusal/)).toBeTruthy();
    expect(promote().hasAttribute("disabled")).toBe(true);
  });
});

describe("B3 — evidence that was not read cannot support a promotion", () => {
  it("blocks promotion when a panel could not be read, and names it", () => {
    exit({
      panels: [
        FULL[0],
        { title: "Risk & limits", findings: [], status: "unavailable", reason: "source down" },
      ],
    });
    // No finding said "fail" — the panel simply produced none.
    expect(promote().hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/could not be read: Risk & limits/)).toBeTruthy();
    // The two safe responses stay open; that is the whole point.
    expect(extend().hasAttribute("disabled")).toBe(false);
    expect(reject().hasAttribute("disabled")).toBe(false);
  });

  it("treats an empty panel as an answer, not as a gap", () => {
    exit({ panels: [FULL[0], { title: "Open findings", findings: [], status: "empty" }] });
    expect(promote().hasAttribute("disabled")).toBe(false);
  });

  for (const status of ["denied", "insufficient_data", "terminal", "loading"] as const) {
    it(`blocks promotion when a panel is ${status}`, () => {
      exit({ panels: [FULL[0], { title: "Risk & limits", findings: [], status }] });
      expect(promote().hasAttribute("disabled")).toBe(true);
    });
  }

  it("blocks promotion on stale evidence instead of contradicting its own banner", () => {
    exit({ status: "stale" });
    expect(promote().hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/stale\. Reload before deciding/)).toBeTruthy();
  });

  it("blocks promotion on partial evidence", () => {
    exit({ status: "partial" });
    expect(promote().hasAttribute("disabled")).toBe(true);
  });

  it("renders a whole-review failure as one state, with no decision offered", () => {
    exit({ status: "denied", reason: "not your workspace" });
    expect(screen.queryByRole("button", { name: /Approve promotion/ })).toBeNull();
  });
});

describe("B5 — the Paper Exit vocabulary is the schema's", () => {
  it("reads all five capabilities, denying by default", () => {
    expect(readEligibility(undefined)).toEqual(NO_ELIGIBILITY);
    expect(readEligibility({ can_extend_observation: "true" }).canExtendObservation).toBe(false);
    const e = readEligibility({
      can_approve: true,
      can_extend_observation: true,
      can_reject: true,
      separation_of_duties: "VIOLATION",
    });
    expect(e.canApprove).toBe(true);
    expect(e.canExtendObservation).toBe(true);
    expect(e.canReject).toBe(true);
    expect(e.canDeny).toBe(false);
    expect(e.separationOfDuties).toBe("VIOLATION");
  });

  it("ignores a separation-of-duties value the schema does not define", () => {
    expect(readEligibility({ separation_of_duties: "MAYBE" }).separationOfDuties).toBeNull();
  });

  it("knows which outcomes belong to Paper Exit", () => {
    expect(["PROMOTE", "EXTEND_OBSERVATION", "REJECT"].every(isPaperExitDecision)).toBe(true);
    expect(["APPROVE", "DENY", "APPROVE_WITH_CONDITION"].some(isPaperExitDecision)).toBe(false);
  });

  it("pins the extension to the schema's single permitted term", () => {
    expect(PAPER_EXIT_EXTENSION_DAYS).toBe(14);
  });
});

describe("B5/B6 — the transport the decision actually travels on", () => {
  it("posts to the one plan route the controller mounts, with the Paper Exit body", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ operation_id: "op_1", apply_token: "t" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("document", { cookie: "__Host-portal_csrf=tok-123; other=x" });

    const api = createHttpApi({
      policy: {
        policyRevision: 4,
        queryEnabled: true,
        projectionIngestionEnabled: true,
        sseEnabled: true,
        governanceWriteEnabled: true,
        paperCommandsEnabled: true,
        sandboxCommandsEnabled: true,
        liveProtectiveCommandsEnabled: true,
        liveRiskIncreasingCommandsEnabled: true,
      },
    });
    const result = await api.planDecision({
      approvalId: "EX-771",
      workspaceId: "ws_1",
      decision: "EXTEND_OBSERVATION",
      reason: "needs two more weeks of live-like flow",
      expectedApprovalVersion: 3,
      requestKey: "rk_1",
    });

    expect(result.ok).toBe(true);
    // The route my earlier draft invented does not exist on the controller.
    expect(calls[0].url).toBe("/api/v1/execution/commands/plans");
    expect(calls[0].url).not.toContain("decision-plans");

    const body = JSON.parse(String(calls[0].init.body));
    expect(body.schema_version).toBe("governance.paper-exit-decision-plan-request.v1");
    expect(body.command_type).toBe("GOVERNANCE_PAPER_EXIT_DECISION");
    expect(body.target).toEqual({ review_id: "EX-771" });
    expect(body.expected_review_version).toBe(3);
    // The schema permits exactly 14 here and nothing else.
    expect(body.payload.extension_days).toBe(14);
    expect(body.payload.decision).toBe("EXTEND_OBSERVATION");

    // Double-submit: the header the server compares against the cookie.
    expect((calls[0].init.headers as Record<string, string>)["x-portal-csrf"]).toBe("tok-123");

    vi.unstubAllGlobals();
  });

  it("sends null extension_days for the two outcomes that are not an extension", async () => {
    const bodies: string[] = [];
    vi.stubGlobal("fetch", async (_u: string, init: RequestInit) => {
      bodies.push(String(init.body));
      return new Response(JSON.stringify({ operation_id: "op_1", apply_token: "t" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("document", { cookie: "__Host-portal_csrf=tok" });
    const api = createHttpApi({
      policy: {
        policyRevision: 4,
        queryEnabled: true,
        projectionIngestionEnabled: true,
        sseEnabled: true,
        governanceWriteEnabled: true,
        paperCommandsEnabled: true,
        sandboxCommandsEnabled: true,
        liveProtectiveCommandsEnabled: true,
        liveRiskIncreasingCommandsEnabled: true,
      },
    });
    for (const decision of ["PROMOTE", "REJECT"] as const) {
      await api.planDecision({
        approvalId: "EX-771",
        workspaceId: "ws_1",
        decision,
        reason: "eight or more characters",
        expectedApprovalVersion: 3,
        requestKey: "rk",
      });
    }
    for (const raw of bodies) expect(JSON.parse(raw).payload.extension_days).toBeNull();
    vi.unstubAllGlobals();
  });

  it("refuses a reason under the schema's eight-character floor before sending it", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const api = createHttpApi({
      policy: {
        policyRevision: 4,
        queryEnabled: true,
        projectionIngestionEnabled: true,
        sseEnabled: true,
        governanceWriteEnabled: true,
        paperCommandsEnabled: true,
        sandboxCommandsEnabled: true,
        liveProtectiveCommandsEnabled: true,
        liveRiskIncreasingCommandsEnabled: true,
      },
    });
    const result = await api.planDecision({
      approvalId: "EX-771",
      workspaceId: "ws_1",
      decision: "REJECT",
      reason: "no",
      expectedApprovalVersion: 3,
      requestKey: "rk",
    });
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("omits the CSRF header entirely when there is no cookie, rather than sending an empty one", () => {
    expect(csrfToken("other=1; __Host-portal_csrf=; x=2")).toBeNull();
    expect(csrfToken("__Host-portal_csrf=abc")).toBe("abc");
    expect(csrfToken("nothing=here")).toBeNull();
  });
});

describe("EL-V2-04 — Paper Exit Review on the workspace anatomy", () => {
  it("offers Evidence, Activation plan and Conditions as tabs and renders Evidence first", () => {
    exit();
    for (const name of [/Evidence/, /Activation plan/, /Conditions/]) expect(screen.getByRole("tab", { name })).toBeTruthy();
    expect(screen.getByText("Observation coverage")).toBeTruthy();
  });
  it("switches to the activation plan and says when none was published", async () => {
    exit();
    screen.getByRole("tab", { name: /Activation plan/ }).click();
    expect(await screen.findByText(/No activation plan was published/)).toBeTruthy();
  });
  it("keeps the decision in the context rail with the reasons beside it", () => {
    exit({ gateMet: false });
    expect(screen.getByText(/Decide: promote to SANDBOX_VALIDATION\?/)).toBeTruthy();
    expect(screen.getByText(/Promotion blocked — the observation gate is not met/)).toBeTruthy();
    expect(promote()).toHaveProperty("disabled", true);
  });
  it("counts blocking findings on the decision strip from the server's marks", () => {
    exit({ panels: [{ title: "Risk", findings: [{ label: "breach", outcome: "fail" }] }] });
    expect(screen.getByText("Blocking findings").parentElement?.textContent).toContain("1");
    expect(screen.getByText("breach", { selector: ".exec-rail-blocker *, .exec-blocker *, [class*=blocker] *" })).toBeTruthy();
  });
  it("shows a full digest as head-6/tail-2 in provenance with a Copy control", () => {
    const digest = "sha256:9f3c1a7b2e4d5c6f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1e2";
    const onCopy = vi.fn();
    exit({ lineage: [{ label: "artifact", value: digest }], onCopyProvenance: onCopy });
    expect(screen.queryByText(digest)).toBeNull();
    expect(screen.getByText(/9f3c1a…e2/)).toBeTruthy();
    screen.getByRole("button", { name: /Copy/ }).click();
    expect(onCopy).toHaveBeenCalledWith(digest);
  });
});
