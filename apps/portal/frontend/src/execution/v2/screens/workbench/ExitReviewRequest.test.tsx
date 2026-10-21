/**
 * The Paper exit review request in the exit gate (RV-10). Lane FIXTURE_LAB: the port is a stub that answers from the published
 * contract fixtures (the governance review-context, the review-capture answer, the Paper exit parent); no real read.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CaptureContext, ContextRead } from "../../../api/governanceContext";
import { readCaptureContext } from "../../../api/governanceContext";
import type { ExecutionApi, Result } from "../../../api/ports";
import { REVIEW_CAPTURE_OUTCOME_UNKNOWN, type ReviewCapture } from "../../../api/reviewCapture";
import { createHttpApi } from "../../../api/httpApi";
import { readGovernanceParentByKind } from "../../readers/dispatch";
import { readPaperExitParentV1, type PaperExitParentQuery, type PaperExitParentRead } from "../../readers/paperExitParent";
import { ExitGatePanel } from "./ExitGatePanel";
import { ExitReviewRequest } from "./ExitReviewRequest";
import { R2_PARENT_GAP, bindExitReview, checkCapture, exitFingerprint, exitStatusOf, refusalWords, summaryBlock, type ExitBind, type ExitReviewBinding } from "./exitReviewRequest";
import type { GateFacts } from "./model";
import { whyText } from "../../gapWhyTestUtil";

afterEach(cleanup);

const FIXTURES = resolve(__dirname, "../../../../../../../../packages/contracts/fixtures");
const json = (name: string): any => JSON.parse(readFileSync(resolve(FIXTURES, name), "utf8"));

/* The published Paper exit parent names the workspace, deployment and review everything below is bound to. */
const PARENT = json("execution-positive-parent.synthetic.valid.json").paper_exit;
const WS: string = PARENT.workspace_id;
const DEP: string = PARENT.anchors.deployment_id;
const REVIEW: string = PARENT.review.review_id;

/** The published capture context, turned into the Paper exit shape for this workspace and deployment. */
function context(over: Record<string, unknown> = {}): ContextRead<CaptureContext> {
  const base = json("governance-review-context.synthetic.valid.json").capture;
  return readCaptureContext({
    ...base,
    action: "PAPER_EXIT_CREATE",
    workspace_id: WS,
    candidates: [{ ...base.candidates[0], deployment_id: DEP }],
    ...over,
  });
}
const bound = (): ExitBind => bindExitReview({ context: context(), workspaceId: WS, deploymentId: DEP });
const binding = (): ExitReviewBinding => {
  const b = bound();
  if (b.state !== "bound") throw new Error("fixture context did not bind");
  return b.binding;
};

/** The published capture answer for this review. */
function capture(over: Record<string, unknown> = {}): ReviewCapture {
  return { ...json("execution-governance.review-capture.paper-exit.valid.json"), workspace_id: WS, aggregate_id: REVIEW, review_id: REVIEW, read_path: `/api/v1/execution/governance/exit-reviews/${REVIEW}`, ...over } as ReviewCapture;
}

const AVAILABLE = { id: "PAPER_EXIT_CREATE", state: "AVAILABLE", path: "/api/v1/execution/governance/paper-exit/create", inputs: "x" };
const caps = (action: Record<string, unknown> = AVAILABLE) => ({ schema_version: "governance.review-capture-capabilities.v1", authority: "PORTAL", source_side_effect_requested: false, actions: [action] });

/* ── the port ────────────────────────────────────────────────────────────── */

interface Stub {
  api: ExecutionApi;
  create: ReturnType<typeof vi.fn>;
  capabilities: ReturnType<typeof vi.fn>;
  parent: ReturnType<typeof vi.fn>;
  eligibility: ReturnType<typeof vi.fn>;
}
function stub(over: {
  capabilities?: unknown;
  capsFails?: string;
  create?: (input: any) => Promise<Result<ReviewCapture>> | Result<ReviewCapture>;
  parent?: () => Result<unknown>;
  eligibility?: unknown;
} = {}): Stub {
  const capabilities = vi.fn(async () => (over.capsFails ? { ok: false as const, status: "unavailable" as const, reason: over.capsFails } : { ok: true as const, value: over.capabilities ?? caps() }));
  const create = vi.fn(over.create ?? (async () => ({ ok: true as const, value: capture() })));
  const parent = vi.fn(async () => over.parent?.() ?? { ok: true as const, value: readGovernanceParentByKind("exit", PARENT) });
  const eligibility = vi.fn(async () => ({ ok: true as const, value: over.eligibility ?? { kind: "unsupported" } }));
  return {
    api: { getReviewCaptureCapabilities: capabilities, createPaperExit: create, getGovernanceParent: parent, getStageActionEligibility: eligibility } as unknown as ExecutionApi,
    create, capabilities, parent, eligibility,
  };
}

const settle = async () => {
  for (let i = 0; i < 4; i += 1) await act(async () => { await new Promise((done) => setTimeout(done, 0)); });
};

function mount(s: Stub, props: { workspaceId?: string | null; deploymentId?: string; bind?: ExitBind } = {}) {
  const tree = (p: typeof props) => (
    <MemoryRouter initialEntries={["/deployments/paper/dep?workspace_id=" + WS]}>
      <ExitReviewRequest api={s.api} deploymentId={p.deploymentId ?? DEP} workspaceId={p.workspaceId === undefined ? WS : p.workspaceId} bind={p.bind ?? bound()} />
    </MemoryRouter>
  );
  const view = render(tree(props));
  return { ...view, rerenderWith: (p: typeof props) => view.rerender(tree(p)) };
}
const send = () => screen.queryByRole("button", { name: /^Request review$|^Sending$/ }) as HTMLButtonElement | null;
const box = () => screen.getByRole("textbox") as HTMLTextAreaElement;
const type = (text: string) => fireEvent.change(box(), { target: { value: text } });
const TEXT = "Thirty observation days, fills reconcile";

/* ── the rules, without a DOM ────────────────────────────────────────────── */

describe("bindExitReview: what the request is bound to", () => {
  const ask = (c: ContextRead<CaptureContext> | null, workspaceId: string | null = WS, deploymentId = DEP) => bindExitReview({ context: c, workspaceId, deploymentId });

  it("binds the parent's pins exactly as published", () => {
    expect(ask(context())).toEqual({
      state: "bound",
      binding: { workspaceId: WS, parentApprovalId: "apr_example", expectedParentVersion: 2, projectionDigest: `sha256:${"a".repeat(64)}`, deploymentId: DEP },
    });
  });

  it("no context is the typed gap: the deployment's profile publishes no R2 parent, and nothing is guessed", () => {
    const shut = ask(null);
    expect(shut).toMatchObject({ state: "shut", code: R2_PARENT_GAP });
    expect(R2_PARENT_GAP).toBe("R2_PARENT_NOT_PUBLISHED_FOR_DEPLOYMENT");
  });

  it.each<[string, () => ReturnType<typeof ask>, string]>([
    ["no workspace named", () => ask(context(), null), "WORKSPACE_NOT_PUBLISHED"],
    ["an absent context", () => ask({ kind: "absent" }), "CAPTURE_CONTEXT_ABSENT"],
    ["an unreadable context", () => ask({ kind: "invalid" }), "CAPTURE_CONTEXT_INVALID"],
    ["the R2 capture's context", () => ask(context({ action: "R2_CREATE" })), "CAPTURE_CONTEXT_OTHER_ACTION"],
    ["another workspace's context", () => ask(context({ workspace_id: "ws_other" })), "CAPTURE_CONTEXT_OTHER_WORKSPACE"],
    ["a blocked context", () => ask(context({ availability: { state: "BLOCKED", reason_code: "CAPTURE_PROJECTION_STALE" }, expected_projection_digest: null, candidates: [] })), "CAPTURE_PROJECTION_STALE"],
    ["a deployment that is not an accepted choice", () => ask(context(), WS, "dep_other"), "CAPTURE_DEPLOYMENT_NOT_ACCEPTED"],
  ])("%s is refused, never repaired", (_name, run, code) => {
    expect(run()).toMatchObject({ state: "shut", code });
  });

  it("a truncated candidate list that lacks the deployment cannot vouch for it, and says the list is bounded", () => {
    const shut = ask(context({ candidates_truncated: true }), WS, "dep_other");
    expect(shut).toMatchObject({ state: "shut", reason: "This deployment is not among the first accepted choices." });
  });
});

describe("the summary, the key and the answer", () => {
  it("8 to 1000 characters, counted as the server counts them; a hostile character is refused", () => {
    expect(summaryBlock("1234567")?.code).toBe("short");
    expect(summaryBlock("12345678")).toBeNull();
    expect(summaryBlock("x".repeat(1000))).toBeNull();
    expect(summaryBlock("x".repeat(1001))?.code).toBe("long");
    expect(summaryBlock("fine text‮evil")?.code).toBe("hostile");
    // 4 code points in 8 UTF-16 units are 4 characters
    expect(summaryBlock("😀😀😀😀")?.code).toBe("short");
  });

  it("the fingerprint follows the intent: binding and trimmed text", () => {
    const b = binding();
    expect(exitFingerprint(b, "  same text here ")).toBe(exitFingerprint(b, "same text here"));
    expect(exitFingerprint(b, "a")).not.toBe(exitFingerprint({ ...b, expectedParentVersion: 3 }, "a"));
    expect(exitFingerprint(b, "a")).not.toBe(exitFingerprint({ ...b, deploymentId: "dep_other" }, "a"));
  });

  it("an answer is 'requested' only when it is this request's: kind, workspace and review", () => {
    const b = binding();
    expect(checkCapture(capture(), b)).toEqual({ ok: true, reviewId: REVIEW });
    expect(checkCapture(capture({ workspace_id: "ws_other" }), b)).toMatchObject({ ok: false });
    expect(checkCapture(capture({ action: "R2_CREATE" }), b)).toMatchObject({ ok: false });
    expect(checkCapture(capture({ review_id: undefined }), b)).toMatchObject({ ok: false });
    expect(checkCapture(capture({ review_id: "other" }), b)).toMatchObject({ ok: false });
  });

  it("the read-back is refused for another review, workspace or deployment, and never invents a quorum", () => {
    const expect_ = { reviewId: REVIEW, workspaceId: WS, deploymentId: DEP };
    const read = readGovernanceParentByKind("exit", PARENT);
    expect(exitStatusOf(read, expect_)).toEqual({ kind: "ok", reviewId: REVIEW, text: "Pending · 0 of 2 approvers" });
    expect(exitStatusOf(read, { ...expect_, reviewId: "other" })).toMatchObject({ kind: "mismatch", reason: "The read is for another review." });
    expect(exitStatusOf(read, { ...expect_, workspaceId: "ws_other" })).toMatchObject({ kind: "mismatch", reason: "The read is for another workspace." });
    expect(exitStatusOf(read, { ...expect_, deploymentId: "dep_other" })).toMatchObject({ kind: "mismatch", reason: "The review is for another deployment." });
    expect(exitStatusOf({ kind: "r2", read: { kind: "unsupported", schemaVersion: null, reason: "UNKNOWN_SCHEMA" } as never }, expect_)).toMatchObject({ kind: "mismatch" });
  });
});

/* ── shut: one control, one reason ───────────────────────────────────────── */

describe("shut: ONE control with ONE short reason", () => {
  const button = () => screen.getByRole("button", { name: "Request review" }) as HTMLButtonElement;
  const reason = () => document.getElementById(button().getAttribute("aria-describedby") ?? "")?.textContent ?? "";

  it("no workspace named: shut with that reason, and nothing is asked", async () => {
    const s = stub();
    mount(s, { workspaceId: null, bind: bindExitReview({ context: null, workspaceId: null, deploymentId: DEP }) });
    await settle();
    expect(button().disabled).toBe(true);
    expect(reason()).toBe("No workspace is named for this read.");
    expect(s.capabilities).not.toHaveBeenCalled();
    expect(s.create).not.toHaveBeenCalled();
  });

  it("the server offers it but no read publishes the R2 parent: shut with the typed gap, no textbox, no POST", async () => {
    const s = stub();
    mount(s, { bind: bindExitReview({ context: null, workspaceId: WS, deploymentId: DEP }) });
    await settle();
    expect(s.capabilities).toHaveBeenCalledWith(WS);
    expect(button().disabled).toBe(true);
    expect(reason()).toBe("The R2 review behind this deployment is not published.");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(whyText(document.querySelector("[data-state='shut'] .exec-blk-why"))).toBe(`Server reason: ${R2_PARENT_GAP}`);
    fireEvent.click(button());
    expect(s.create).not.toHaveBeenCalled();
  });

  it("an eligible verdict NEVER enables it: advisory eligibility explains, it does not open", async () => {
    const eligible = { kind: "stage_action_eligibility", eligibility: { workspaceId: WS, actions: [{ action: "paper.exit_review_request", verdict: "ELIGIBLE", reasonClass: "SUBMIT_CHECKS_REQUIRED", basis: "ADMIN_ROLE_AND_GOVERNANCE_R2_READ" }] } };
    const s = stub({ eligibility: eligible });
    mount(s, { bind: bindExitReview({ context: null, workspaceId: WS, deploymentId: DEP }) });
    await settle();
    expect(button().disabled).toBe(true);
    expect(reason()).toBe("The R2 review behind this deployment is not published.");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("the server's capability refusal reads in the stage dictionary's words, with its code on the title", async () => {
    const s = stub({ capabilities: caps({ id: "PAPER_EXIT_CREATE", state: "UNAVAILABLE", reason_code: "GOVERNANCE_CAPABILITY_REQUIRED" }) });
    mount(s);
    await settle();
    expect(button().disabled).toBe(true);
    expect(reason()).toBe("Needs the approver grant");
    expect(whyText(document.querySelector("[data-state='shut'] .exec-blk-why"))).toBe("Server reason: GOVERNANCE_CAPABILITY_REQUIRED");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("an unknown capability code keeps the control's own sentence", async () => {
    const s = stub({ capabilities: caps({ id: "PAPER_EXIT_CREATE", state: "UNAVAILABLE", reason_code: "SOMETHING_NEW" }) });
    mount(s);
    await settle();
    expect(reason()).toBe("Not enabled for this profile");
  });

  it("a failed capability read is 'not available', never an open form", async () => {
    const s = stub({ capsFails: "HTTP_503" });
    mount(s);
    await settle();
    expect(button().disabled).toBe(true);
    expect(reason()).toBe("Not available. HTTP_503");
  });

  it("a refusing eligibility row changes the words of a shut control, text only", async () => {
    const refusing = {
      kind: "stage_action_eligibility",
      eligibility: { workspaceId: WS, actions: [{ action: "paper.exit_review_request", verdict: "NOT_ELIGIBLE", reasonClass: "ADMIN_ROLE_REQUIRED", basis: "ADMIN_ROLE_AND_GOVERNANCE_R2_READ", stepUpState: "NOT_REQUIRED" }] },
    };
    const s = stub({ capabilities: caps({ id: "PAPER_EXIT_CREATE", state: "UNAVAILABLE", reason_code: "SOMETHING_NEW" }), eligibility: refusing });
    mount(s);
    await settle();
    expect(reason()).toBe("Needs the Admin role · Basis: Admin role and the R2 read grant · Step-up: not required");
    expect(button().disabled).toBe(true);
  });

  it("while the capability is read, nothing is offered", async () => {
    const s = stub();
    mount(s);
    expect(screen.getByText("Checking whether a review can be requested.")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    await settle();
  });

  it("an answer for the previous workspace is not shown under the next one", async () => {
    const s = stub();
    const first = mount(s);
    await settle();
    expect(screen.getByRole("textbox")).toBeTruthy();
    s.capabilities.mockImplementation(() => new Promise(() => undefined));
    first.rerenderWith({ workspaceId: "ws_next", bind: bindExitReview({ context: context({ workspace_id: "ws_next" }), workspaceId: "ws_next", deploymentId: DEP }) });
    await settle();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("Checking whether a review can be requested.")).toBeTruthy();
  });
});

/* ── open: the request ───────────────────────────────────────────────────── */

describe("open: bound to the parent and offered by the server", () => {
  it("sends exactly the bound pins, trimmed text and one key; then shows the receipt, the Approvals link and the status read back", async () => {
    const s = stub();
    mount(s);
    await settle();
    expect(send()!.disabled).toBe(true);
    expect(document.querySelector(".exec-wb-xr-hint")?.textContent).toBe("At least 8 characters (0 so far)");
    type(`  ${TEXT}  `);
    expect(send()!.disabled).toBe(false);
    fireEvent.click(send()!);
    await settle();
    expect(s.create).toHaveBeenCalledTimes(1);
    const sent = s.create.mock.calls[0]![0];
    expect(sent).toEqual({
      workspace_id: WS,
      request_key: expect.stringMatching(/^paper_exit:/),
      summary: TEXT,
      r2_approval_id: "apr_example",
      expected_r2_version: 2,
      deployment_id: DEP,
      expected_projection_digest: `sha256:${"a".repeat(64)}`,
    });
    const receipt = document.querySelector("[data-state='recorded']") as HTMLElement;
    expect(within(receipt).getByText("Requested")).toBeTruthy();
    expect(receipt.textContent).toContain(REVIEW);
    expect(receipt.textContent).toContain("Pending · 0 of 2 approvers");
    expect(s.parent).toHaveBeenCalledWith("exit", REVIEW, WS);
    expect(within(receipt).getByRole("link", { name: "Open in Approvals" }).getAttribute("href")).toBe(`/governance/exit-reviews/${REVIEW}?workspace_id=${WS}`);
    expect(receipt.textContent).toContain("it promotes nothing and sends nothing to the Trading System");
  });

  it("Check status re-reads once and the status is the server's, not a cached claim", async () => {
    const s = stub();
    mount(s);
    await settle();
    type(TEXT);
    fireEvent.click(send()!);
    await settle();
    expect(s.parent).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Check status" }));
    await settle();
    expect(s.parent).toHaveBeenCalledTimes(2);
  });

  it("a review read back for another deployment is not shown as this one's", async () => {
    const other = structuredClone(PARENT);
    other.anchors.deployment_id = "dep_somewhere_else";
    const s = stub({ parent: () => ({ ok: true, value: readGovernanceParentByKind("exit", other) }) });
    mount(s);
    await settle();
    type(TEXT);
    fireEvent.click(send()!);
    await settle();
    expect((document.querySelector("[data-state='recorded']") as HTMLElement).textContent).toContain("Not shown: The review is for another deployment.");
  });

  it("a status read that fails keeps the receipt and says the status was not read", async () => {
    const s = stub({ parent: () => ({ ok: false, status: "unavailable", reason: "HTTP_503" }) });
    mount(s);
    await settle();
    type(TEXT);
    fireEvent.click(send()!);
    await settle();
    expect((document.querySelector("[data-state='recorded']") as HTMLElement).textContent).toContain("Not read: HTTP_503");
  });

  it("a double click is ONE request", async () => {
    let release: (() => void) | null = null;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const s = stub({ create: async () => { await held; return { ok: true, value: capture() }; } });
    mount(s);
    await settle();
    type(TEXT);
    fireEvent.click(send()!);
    fireEvent.click(send()!);
    await settle();
    expect(s.create).toHaveBeenCalledTimes(1);
    expect(send()!.textContent).toBe("Sending");
    release!();
    await settle();
    expect(document.querySelector("[data-state='recorded']")).toBeTruthy();
  });

  it("keyboard: Enter in the text only writes a line, it never sends; the button is a native, focusable button", async () => {
    const s = stub();
    mount(s);
    await settle();
    type(TEXT);
    fireEvent.keyDown(box(), { key: "Enter" });
    fireEvent.keyDown(box(), { key: "Enter", ctrlKey: true });
    await settle();
    expect(s.create).not.toHaveBeenCalled();
    expect(send()!.tagName).toBe("BUTTON");
    expect(send()!.tabIndex).toBe(0);
    send()!.focus();
    expect(document.activeElement).toBe(send());
  });

  it("a definite refusal is shown as the server worded it, nothing is kept, and editing the text clears it", async () => {
    const s = stub({ create: async () => ({ ok: false, status: "denied", reason: "APPROVAL_NOT_PENDING" }) });
    mount(s);
    await settle();
    type(TEXT);
    fireEvent.click(send()!);
    await settle();
    expect(screen.getByRole("alert").textContent).toContain("The server did not record this request. APPROVAL_NOT_PENDING");
    expect(document.querySelector("[data-state='recorded']")).toBeNull();
    type(`${TEXT}!`);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  /* DEBT-UXM07-034: the panel word of a failure ("unavailable" for every 409) is not a reason and is never printed. */
  it.each([
    ["APPROVAL_VERSION_CONFLICT", "The R2 approval moved to another version; read it again before requesting an exit review."],
    ["CAPTURE_PROJECTION_VERSION_CONFLICT", "The Paper projection moved since the request was prepared; read it again."],
  ])("a 409 %s says what the server said, keeps the code behind the disclosure, and never prints '(unavailable)'", async (code, message) => {
    const s = stub({ create: async () => ({ ok: false, status: "unavailable", reason: `${code}: ${message}` }) });
    mount(s);
    await settle();
    type(`REFUSE ${TEXT}`);
    fireEvent.click(send()!);
    await settle();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain(`The server did not record this request. ${message}`);
    expect(alert.textContent).not.toContain("(unavailable)");
    expect(alert.textContent).not.toContain("(denied)");
    expect(alert.getAttribute("data-outcome")).toBe("refused");
    expect(whyText(alert.querySelector(".exec-blk-why"))).toBe(`Server reason: ${code}`);
    expect(alert.textContent).not.toContain("Unknown");
  });

  it("a refusal whose code the stage dictionary knows reads in the dictionary's words", async () => {
    const s = stub({ create: async () => ({ ok: false, status: "denied", reason: "ADMIN_ROLE_REQUIRED: Requesting a Paper exit review needs the admin role in this workspace." }) });
    mount(s);
    await settle();
    type(`DENIED ${TEXT}`);
    fireEvent.click(send()!);
    await settle();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("The server did not record this request. Needs the Admin role");
    expect(alert.textContent).not.toContain("(denied)");
    expect(whyText(alert.querySelector(".exec-blk-why"))).toBe("Server reason: ADMIN_ROLE_REQUIRED");
  });

  it("a 5xx from the real port is unknown, never 'did not record', and the retry reuses the same reference and text", async () => {
    const bodies: any[] = [];
    let n = 0;
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return n++ === 0
        ? new Response(JSON.stringify({ error: { code: "UPSTREAM_UNAVAILABLE", message: "upstream" } }), { status: 503, headers: { "content-type": "application/json" } })
        : new Response(JSON.stringify(capture()), { status: 201, headers: { "content-type": "application/json" } });
    });
    const real = createHttpApi({ policy: null });
    const s = stub({ create: (input) => real.createPaperExit(input) });
    mount(s);
    await settle();
    type(TEXT);
    fireEvent.click(send()!);
    await settle();
    const alert = screen.getByRole("alert");
    expect(alert.getAttribute("data-outcome")).toBe("unknown");
    expect(alert.textContent).toContain("Unknown: it may have been recorded.");
    expect(alert.textContent).not.toContain("did not record");
    expect(alert.textContent).toContain(`Sending again uses the same reference (${bodies[0].request_key})`);
    fireEvent.click(send()!);
    await settle();
    expect(bodies).toHaveLength(2);
    expect(bodies[1].request_key).toBe(bodies[0].request_key);
    expect(bodies[1].summary).toBe(bodies[0].summary);
    expect(document.querySelector("[data-state='recorded']")).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it("an unreadable 2xx from the real port is unknown too", async () => {
    vi.stubGlobal("fetch", async () => new Response("<html>proxy</html>", { status: 200 }));
    const real = createHttpApi({ policy: null });
    const s = stub({ create: (input) => real.createPaperExit(input) });
    mount(s);
    await settle();
    type(TEXT);
    fireEvent.click(send()!);
    await settle();
    const alert = screen.getByRole("alert");
    expect(alert.getAttribute("data-outcome")).toBe("unknown");
    expect(alert.textContent).not.toContain("did not record");
    vi.unstubAllGlobals();
  });

  it("an unknown outcome retries under the SAME key; an edited text goes under a new key and says both could exist", async () => {
    let n = 0;
    const s = stub({ create: async () => (n++ === 0 ? { ok: false, status: "unavailable", reason: `${REVIEW_CAPTURE_OUTCOME_UNKNOWN}: the answer was lost` } : { ok: true, value: capture() }) });
    mount(s);
    await settle();
    type(TEXT);
    fireEvent.click(send()!);
    await settle();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Unknown: it may have been recorded.");
    const key = s.create.mock.calls[0]![0].request_key as string;
    expect(alert.textContent).toContain(`Sending again uses the same reference (${key})`);
    // an edit is a different intent
    type(`${TEXT} and more`);
    expect(screen.getByRole("alert").textContent).toContain("may have been recorded (reference");
    type(TEXT);
    fireEvent.click(send()!);
    await settle();
    expect(s.create.mock.calls[1]![0].request_key).toBe(key);
    expect(document.querySelector("[data-state='recorded']")).toBeTruthy();
  });

  it("a thrown request is unknown, not 'not recorded'", async () => {
    const s = stub({ create: async () => { throw new Error("network"); } });
    mount(s);
    await settle();
    type(TEXT);
    fireEvent.click(send()!);
    await settle();
    expect(screen.getByRole("alert").textContent).toContain("Unknown: it may have been recorded. The request ended before the Portal's answer was read.");
    expect(document.querySelector("[data-state='recorded']")).toBeNull();
  });

  it("an answer for another workspace is refused as 'requested': the outcome is unknown", async () => {
    const s = stub({ create: async () => ({ ok: true, value: capture({ workspace_id: "ws_other" }) }) });
    mount(s);
    await settle();
    type(TEXT);
    fireEvent.click(send()!);
    await settle();
    expect(document.querySelector("[data-state='recorded']")).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("The answer is for another workspace.");
    expect(s.parent).not.toHaveBeenCalled();
  });

  it("a late answer after the deployment (or the parent's version) changed is dropped, and the new request starts clean", async () => {
    let release: (() => void) | null = null;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const s = stub({ create: async () => { await held; return { ok: true, value: capture() }; } });
    const view = mount(s);
    await settle();
    type(TEXT);
    fireEvent.click(send()!);
    await settle();
    // the parent moved to version 3 while the request was out
    view.rerenderWith({ bind: bindExitReview({ context: context({ expected_parent_version: 3 }), workspaceId: WS, deploymentId: DEP }) });
    await settle();
    release!();
    await settle();
    expect(document.querySelector("[data-state='recorded']")).toBeNull();
    expect(s.parent).not.toHaveBeenCalled();
    expect(box().value).toBe("");
    expect(send()!.textContent).toBe("Request review");
    expect(send()!.disabled).toBe(true);
  });
});

/* ── in the exit gate ────────────────────────────────────────────────────── */

describe("in the exit gate panel", () => {
  const gate: GateFacts = { verdict: "met", observedDays: 30, minimumDays: 30, trades: 120, minimumTrades: 100, policy: "paper-exit.v1", windowBounded: false, reasonCode: null } as unknown as GateFacts;
  const panel = (request?: Parameters<typeof ExitGatePanel>[0]["request"]) =>
    render(
      <MemoryRouter initialEntries={["/deployments/paper/dep"]}>
        <ExitGatePanel gate={gate} exitReviewsHref="/governance/exit-reviews" request={request} />
      </MemoryRouter>,
    );

  it("without a request prop the gate is the read-only panel it was", () => {
    panel();
    expect(screen.queryByRole("button", { name: "Request review" })).toBeNull();
    expect(screen.getByRole("link", { name: "Open exit review" })).toBeTruthy();
  });

  it("with one, the control sits above the link to the inbox, shut today because no read publishes the R2 parent", async () => {
    const s = stub();
    panel({ api: s.api, deploymentId: DEP, workspaceId: WS });
    await settle();
    const button = screen.getByRole("button", { name: "Request review" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(document.getElementById(button.getAttribute("aria-describedby") ?? "")?.textContent).toBe("The R2 review behind this deployment is not published.");
    expect(screen.getByRole("link", { name: "Open exit review" }).getAttribute("href")).toBe("/governance/exit-reviews");
  });

  it("given the parent's published capture context, the same panel opens the form", async () => {
    const s = stub();
    panel({ api: s.api, deploymentId: DEP, workspaceId: WS, captureContext: context() });
    await settle();
    expect(screen.getByRole("textbox")).toBeTruthy();
    expect(send()!.disabled).toBe(true);
  });
});

/* ── the R2 parent of the deployment, read for the control (RV-10 follow-up) ─ */

describe("in the exit gate panel, bound to the R2 parent the Portal publishes for this deployment", () => {
  const gate: GateFacts = { verdict: "met", observedDays: 30, minimumDays: 30, trades: 120, minimumTrades: 100, policy: "paper-exit.v1", windowBounded: false, reasonCode: null } as unknown as GateFacts;
  const PUBLISHED = json("governance-requester-reads.synthetic.valid.json").paper_exit_parent;
  /** A published body, turned to answer THIS workspace and deployment (the double does the same for the request asked). */
  function parentBody(name: string, over: (body: any) => void = () => undefined): any {
    const body = structuredClone(PUBLISHED[name]);
    body.workspace_id = WS;
    body.deployment_id = DEP;
    if (body.capture_context !== null) {
      body.capture_context.workspace_id = WS;
      for (const candidate of body.capture_context.candidates) candidate.deployment_id = DEP;
    }
    over(body);
    return body;
  }
  const answer = (body: unknown): Result<PaperExitParentRead> => {
    const read = readPaperExitParentV1(body);
    return read === null ? { ok: false, status: "unavailable", reason: "The R2 parent response could not be read." } : { ok: true, value: read };
  };
  function withParent(result: () => Result<PaperExitParentRead> | Promise<Result<PaperExitParentRead>>) {
    const s = stub();
    const getPaperExitParent = vi.fn(async (_query: PaperExitParentQuery) => result());
    (s.api as unknown as { getPaperExitParent: typeof getPaperExitParent }).getPaperExitParent = getPaperExitParent;
    return { ...s, getPaperExitParent };
  }
  const panel = (s: { api: ExecutionApi }, workspaceId: string | null = WS) =>
    render(
      <MemoryRouter initialEntries={["/deployments/paper/dep"]}>
        <ExitGatePanel gate={gate} exitReviewsHref="/governance/exit-reviews" request={{ api: s.api, deploymentId: DEP, workspaceId }} />
      </MemoryRouter>,
    );
  const button = () => screen.getByRole("button", { name: "Request review" }) as HTMLButtonElement;
  const reason = () => document.getElementById(button().getAttribute("aria-describedby") ?? "")?.textContent ?? "";

  it("asks once for this deployment in this workspace, and the control opens from the published context", async () => {
    const s = withParent(() => answer(parentBody("found_available")));
    panel(s);
    await settle();
    expect(s.getPaperExitParent).toHaveBeenCalledTimes(1);
    expect(s.getPaperExitParent).toHaveBeenCalledWith({ deploymentId: DEP, workspaceId: WS });
    expect(screen.getByRole("textbox")).toBeTruthy();
    expect(document.body.textContent).not.toContain("The R2 review behind this deployment is not published.");
  });

  it("sends the pins the parent read published (approval id, version, digest) and nothing else", async () => {
    const s = withParent(() => answer(parentBody("found_available")));
    panel(s);
    await settle();
    type(TEXT);
    fireEvent.click(send()!);
    await settle();
    expect(s.create).toHaveBeenCalledTimes(1);
    expect(s.create.mock.calls[0]![0]).toEqual({
      workspace_id: WS,
      request_key: expect.stringMatching(/^paper_exit:/),
      summary: TEXT,
      r2_approval_id: "apr_TEST_ONLY_r2",
      expected_r2_version: 3,
      deployment_id: DEP,
      expected_projection_digest: `sha256:${"c".repeat(64)}`,
    });
  });

  it("while it is read the control is shut with one short reason, not the gap", async () => {
    let release: (value: Result<PaperExitParentRead>) => void = () => undefined;
    const s = withParent(() => new Promise<Result<PaperExitParentRead>>((done) => { release = done; }));
    panel(s);
    await settle();
    expect(button().disabled).toBe(true);
    expect(reason()).toBe("Reading the R2 review");
    await act(async () => { release(answer(parentBody("found_available"))); });
    await settle();
    expect(screen.getByRole("textbox")).toBeTruthy();
  });

  it("a deployment with no R2 review is shut and says so; a published fact, not an error", async () => {
    const s = withParent(() => answer(parentBody("none")));
    panel(s);
    await settle();
    expect(button().disabled).toBe(true);
    expect(reason()).toBe("This deployment has no R2 review.");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(whyText(document.querySelector("[data-state='shut'] .exec-blk-why"))).toBe(`Server reason: ${R2_PARENT_GAP}`);
  });

  it.each([
    ["found_blocked_r2_not_approved", "Not available: R2 must be approved before this can go on."],
    ["found_blocked_expired", "Not available: this approval has expired."],
    ["found_blocked_not_admin", "Not available: this needs an administrator role."],
  ])("a blocked context (%s) is shut in the server's typed words, with no form and no POST", async (name, words) => {
    const s = withParent(() => answer(parentBody(name)));
    panel(s);
    await settle();
    expect(button().disabled).toBe(true);
    expect(reason()).toBe(words);
    expect(screen.queryByRole("textbox")).toBeNull();
    fireEvent.click(button());
    expect(s.create).not.toHaveBeenCalled();
  });

  it("a read that fails is shut with the Portal's own reason; it is not the same as no R2", async () => {
    const s = withParent(() => ({ ok: false, status: "denied", reason: "Your account may not read this review." }));
    panel(s);
    await settle();
    expect(button().disabled).toBe(true);
    expect(reason()).toBe("Your account may not read this review.");
    expect(whyText(document.querySelector("[data-state='shut'] .exec-blk-why"))).toBe("Server reason: R2_PARENT_UNREADABLE");
  });

  it("a schema this build does not read is shut, never read as a context", async () => {
    const s = withParent(() => ({ ok: true, value: readPaperExitParentV1({ schema_version: "governance.paper-exit-parent.v2" })! }));
    panel(s);
    await settle();
    expect(button().disabled).toBe(true);
    expect(reason()).toBe("The R2 review is a shape this build does not read.");
  });

  it("an eligible verdict still never opens a shut control (the parent decides, advisory words only explain)", async () => {
    const eligible = { kind: "stage_action_eligibility", eligibility: { workspaceId: WS, actions: [{ action: "paper.exit_review_request", verdict: "ELIGIBLE", reasonClass: "SUBMIT_CHECKS_REQUIRED", basis: "ADMIN_ROLE_AND_GOVERNANCE_R2_READ" }] } };
    const s = withParent(() => answer(parentBody("none")));
    (s.api as unknown as { getStageActionEligibility: unknown }).getStageActionEligibility = vi.fn(async () => ({ ok: true, value: eligible }));
    panel(s);
    await settle();
    expect(button().disabled).toBe(true);
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("no workspace named: nothing is asked and the control is shut with that reason", async () => {
    const s = withParent(() => answer(parentBody("found_available")));
    panel(s, null);
    await settle();
    expect(s.getPaperExitParent).not.toHaveBeenCalled();
    expect(reason()).toBe("No workspace is named for this read.");
  });

  it("a context handed in by the caller is used as is and nothing is read", async () => {
    const s = withParent(() => answer(parentBody("none")));
    render(
      <MemoryRouter initialEntries={["/deployments/paper/dep"]}>
        <ExitGatePanel gate={gate} exitReviewsHref="/governance/exit-reviews" request={{ api: s.api, deploymentId: DEP, workspaceId: WS, captureContext: context() }} />
      </MemoryRouter>,
    );
    await settle();
    expect(s.getPaperExitParent).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox")).toBeTruthy();
  });

  it("an answer that arrives after the deployment changed is dropped, not shown as the new deployment's", async () => {
    let release: (value: Result<PaperExitParentRead>) => void = () => undefined;
    const s = withParent(() => new Promise<Result<PaperExitParentRead>>((done) => { release = done; }));
    const tree = (deploymentId: string) => (
      <MemoryRouter initialEntries={["/deployments/paper/dep"]}>
        <ExitGatePanel gate={gate} exitReviewsHref="/governance/exit-reviews" request={{ api: s.api, deploymentId, workspaceId: WS }} />
      </MemoryRouter>
    );
    const view = render(tree(DEP));
    await settle();
    view.rerender(tree("dep_changed"));
    await settle();
    await act(async () => { release(answer(parentBody("found_available"))); });
    await settle();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(button().disabled).toBe(true);
  });
});

describe("refusalWords: the words of a definite refusal", () => {
  it("uses the stage dictionary for a code it knows, the server message otherwise, and the whole reason when it is not typed", () => {
    expect(refusalWords("GOVERNANCE_SCOPE_MISMATCH: x")).toEqual({ text: "The grant does not cover this deployment", code: "GOVERNANCE_SCOPE_MISMATCH" });
    expect(refusalWords("APPROVAL_VERSION_CONFLICT: The R2 approval moved.")).toEqual({ text: "The R2 approval moved.", code: "APPROVAL_VERSION_CONFLICT" });
    expect(refusalWords("something went wrong")).toEqual({ text: "something went wrong", code: null });
  });
});
