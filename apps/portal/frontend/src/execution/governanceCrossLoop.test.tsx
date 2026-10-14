/**
 * FE-GOV-01…04 · cross-loop governance consumer: exact pins on the R1 command, no R1 alias for R2/Live, captures bound to the server's own context,
 * workspace and position truth. The synthetic contract example is loaded from the published fixture, not copied.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import fixture from "../../../../../packages/contracts/fixtures/governance-review-context.synthetic.valid.json";
import { bindR1Decision, readCaptureContext, readDecisionContext, readPaperExitDecisionContext, safeR1Href } from "./api/governanceContext";
import { readGateR1Detail, readGateR2Detail, readPaperExitDetail } from "./api/rows";
import { createFixtureApi } from "./api/fixtureApi";
import { createHttpApi } from "./api/httpApi";
import { EXIT_DETAIL, R1_DETAIL, R2_DETAIL } from "./api/fixtureData";
import type { PaperExitCreateInput, R2CaptureInput } from "./api/reviewCapture";
import { CaptureNextStep } from "./components/CaptureNextStep";
import { choose } from "./choiceTestUtil";
import { GateLiveReviewContainer, GateR1ReviewContainer, GateR2ReviewContainer, PaperExitReviewContainer } from "./screens/containers";

afterEach(cleanup);

const clone = <T,>(v: T): T => structuredClone(v);
const H = (c: string) => `sha256:${c.repeat(64)}`;

describe("published contexts (FE-GOV boundary)", () => {
  it("reads the synthetic R1 context, the blocked R2 context and the capture context", () => {
    const r1 = readDecisionContext(fixture.r1);
    expect(r1).toMatchObject({ kind: "ok", value: { gate: "R1", commandReady: true, expectedVersion: 2, evidenceHashes: [H("a")] } });
    const r2 = readDecisionContext(fixture.r2);
    expect(r2).toMatchObject({ kind: "ok", value: { gate: "R2", commandReady: false, evidenceHashes: null, availability: { available: false, reasonCode: "R2_EXECUTION_DECISION_NOT_COMMISSIONED" } } });
    expect(readCaptureContext(fixture.capture)).toMatchObject({ kind: "ok", value: { action: "R2_CREATE", candidates: [{ deploymentId: "dep_example", riskGrantId: "risk_example", currency: null }] } });
    expect(readDecisionContext(undefined)).toEqual({ kind: "absent" });
  });
  it.each([
    ["a duplicate hash", (c: any) => { c.evidence_hashes = [H("a"), H("a")]; }],
    ["a malformed hash", (c: any) => { c.evidence_hashes = ["sha256:xyz"]; }],
    ["more than 128 hashes", (c: any) => { c.evidence_hashes = Array.from({ length: 129 }, (_, i) => `sha256:${i.toString(16).padStart(64, "0")}`); }],
    ["a source side effect", (c: any) => { c.source_side_effect_requested = true; }],
    ["an AVAILABLE R1 without its command", (c: any) => { c.command_type = null; c.request_schema_version = null; c.plan_path = null; }],
    ["a wrong command path", (c: any) => { c.plan_path = "/api/v1/somewhere/else"; }],
  ])("refuses an R1 context with %s", (_name, tamper) => {
    const c = clone(fixture.r1) as any;
    tamper(c);
    expect(readDecisionContext(c)).toEqual({ kind: "invalid" });
  });
  it("refuses an R2 context that carries a command or claims to be available", () => {
    const withCommand = { ...clone(fixture.r1), gate: "R2" };
    expect(readDecisionContext(withCommand)).toEqual({ kind: "invalid" });
    const available = { ...clone(fixture.r2), availability: { state: "AVAILABLE", reason_code: null } };
    expect(readDecisionContext(available)).toEqual({ kind: "invalid" });
  });
  it.each([
    ["more than 50 choices", (c: any) => { c.candidates = Array.from({ length: 51 }, (_, i) => ({ deployment_id: `d${i}`, portfolio_id: "p", risk_grant_id: "g", currency: null })); }],
    ["a lower-case currency", (c: any) => { c.candidates[0].currency = "usdt"; }],
    ["a duplicate choice", (c: any) => { c.candidates.push({ ...c.candidates[0] }); }],
    ["an available context with no digest", (c: any) => { c.expected_projection_digest = null; }],
    ["a blocked context that carries choices", (c: any) => { c.availability = { state: "BLOCKED", reason_code: "CAPTURE_PROJECTION_STALE" }; }],
  ])("refuses a capture context with %s", (_name, tamper) => {
    const c = clone(fixture.capture) as any;
    tamper(c);
    expect(readCaptureContext(c)).toEqual({ kind: "invalid" });
  });
});

describe("binding an R1 decision to its pins", () => {
  const ctx = (patch: Record<string, unknown> = {}) => readDecisionContext({ ...clone(fixture.r1), ...patch });
  const base = { envelopeWorkspaceId: "ws_example", approvalId: "apr_example", manifest: null, legacyVersion: null };

  it("uses the context's exact workspace, version and hashes", () => {
    expect(bindR1Decision({ ...base, context: ctx() })).toEqual({ state: "ready", workspaceId: "ws_example", approvalId: "apr_example", expectedVersion: 2, evidenceHashes: [H("a")], source: "context" });
  });
  it("never turns null pins into [], and says why a blocked context cannot plan", () => {
    expect(bindR1Decision({ ...base, context: ctx({ evidence_hashes: null }) })).toMatchObject({ state: "unavailable" });
    const blocked = bindR1Decision({ ...base, context: ctx({ availability: { state: "BLOCKED", reason_code: "APPROVAL_EXPIRED" }, command_type: null, request_schema_version: null, plan_path: null }) });
    expect(blocked).toMatchObject({ state: "blocked", reasonCode: "APPROVAL_EXPIRED" });
    expect((blocked as { reason: string }).reason).toMatch(/expired/);
  });
  it("refuses a context for another approval, workspace or gate", () => {
    expect(bindR1Decision({ ...base, approvalId: "apr_other", context: ctx() }).state).toBe("unavailable");
    expect(bindR1Decision({ ...base, envelopeWorkspaceId: "ws_other", context: ctx() }).state).toBe("unavailable");
    expect(bindR1Decision({ ...base, context: readDecisionContext(fixture.r2) }).state).toBe("unavailable");
  });
  it("older reads: a COMPLETE verified manifest supplies sorted unique hashes; anything partial is unavailable, never []", () => {
    const old = { ...base, context: { kind: "absent" } as const, legacyVersion: 7 };
    expect(bindR1Decision({ ...old, manifest: { entryCount: 3, sha256: [H("b"), H("a"), H("b")] } })).toMatchObject({ state: "ready", source: "manifest", evidenceHashes: [H("a"), H("b")], expectedVersion: 7 });
    expect(bindR1Decision({ ...old, manifest: { entryCount: 3, sha256: [H("a"), null, H("b")] } }).state).toBe("unavailable");
    expect(bindR1Decision({ ...old, manifest: { entryCount: 2, sha256: [H("a")] } }).state).toBe("unavailable");
    expect(bindR1Decision({ ...old, manifest: null }).state).toBe("unavailable");
    expect(bindR1Decision({ ...old, legacyVersion: null, manifest: { entryCount: 1, sha256: [H("a")] } }).state).toBe("unavailable");
  });
});

describe("R2 → R1 backlink keeps its workspace (FE-GOV-04)", () => {
  it("accepts the bounded same-origin R1 path with its workspace, appends the read's own to an old href, and refuses anything else", () => {
    expect(safeR1Href("/governance/approvals/AP-1/r1?workspace_id=ws_1", "ws_1")).toBe("/governance/approvals/AP-1/r1?workspace_id=ws_1");
    expect(safeR1Href("/governance/approvals/AP-1/r1", "ws_1")).toBe("/governance/approvals/AP-1/r1?workspace_id=ws_1");
    expect(safeR1Href("/governance/approvals/AP-1/r1", null)).toBe("/governance/approvals/AP-1/r1");
    for (const bad of ["https://evil.example/governance/approvals/AP-1/r1", "//evil.example/x", "/governance/approvals/AP-1/r1?workspace_id=ws_1&next=https://evil.example", "/governance/approvals/AP-1/r2", "javascript:alert(1)", "/governance/approvals/AP-1/r1?redirect=/x"]) {
      expect(safeR1Href(bad, "ws_1"), bad).toBeNull();
    }
    expect(safeR1Href("/governance/approvals/AP-1/r1?workspace_id=ws_2", "ws_1")).toBeNull();
    expect(readGateR2Detail(R2_DETAIL)!.r1Href).toBe("/governance/approvals/AP-101/r1?workspace_id=ws_fixture_governance");
    const hostile = clone(R2_DETAIL) as any;
    hostile.r1_reference.href = "https://evil.example/r1";
    expect(readGateR2Detail(hostile)!.r1Href).toBeNull();
  });
});

describe("FE-GOV-01 · the R1 command carries the exact pins and typed conditions", () => {
  it("plans with the context's workspace, version and every hash, then applies in that workspace", async () => {
    const api = createFixtureApi();
    const plan = vi.spyOn(api, "planDecision");
    const apply = vi.spyOn(api, "applyPlan");
    render(<GateR1ReviewContainer api={api} approvalId="AP-201" />);
    const approve = await screen.findByRole("button", { name: "Approve" });
    await act(async () => { approve.click(); });
    await waitFor(() => expect(plan).toHaveBeenCalled());
    expect(plan.mock.calls[0]![0]).toMatchObject({
      approvalId: "AP-201", workspaceId: "ws_fixture_governance", decision: "APPROVE", expectedApprovalVersion: 7, evidenceHashes: [H("a"), H("b")], conditions: [],
    });
    await waitFor(() => expect(apply).toHaveBeenCalled());
    expect(apply.mock.calls[0]![2]).toBe("ws_fixture_governance");
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  });

  it("Request changes is closed without a remediation condition and sends the conditions it has", async () => {
    const api = createFixtureApi();
    const plan = vi.spyOn(api, "planDecision");
    render(<GateR1ReviewContainer api={api} approvalId="AP-201" />);
    await screen.findByRole("button", { name: "Approve" });
    fireEvent.change(screen.getByRole("textbox", { name: /reviewer note/i }), { target: { value: "holdout coverage is too thin" } });
    const changes = screen.getByRole("button", { name: "Request changes" });
    expect(changes).toHaveProperty("disabled", true);
    expect(changes.getAttribute("title")).toMatch(/remediation condition/);
    fireEvent.click(screen.getByText(/add condition/));
    fireEvent.change(screen.getByPlaceholderText(/what must hold/), { target: { value: "extend the holdout by 30 days" } });
    fireEvent.change(screen.getByLabelText("owner"), { target: { value: "Minh" } });
    fireEvent.click(screen.getByRole("button", { name: "Attach condition" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Request changes" })).toHaveProperty("disabled", false));
    await act(async () => { screen.getByRole("button", { name: "Request changes" }).click(); });
    await waitFor(() => expect(plan).toHaveBeenCalled());
    expect(plan.mock.calls[0]![0]).toMatchObject({ decision: "REQUEST_CHANGES", conditions: [expect.objectContaining({ text: "extend the holdout by 30 days" })] });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  });

  it("closes every verb, with the reason, when the read published no usable pins — nothing is planned with []", async () => {
    const raw = clone(R1_DETAIL) as any;
    raw.decision_context.evidence_hashes = null;
    const api = createFixtureApi();
    vi.spyOn(api, "getGateR1").mockResolvedValue({ ok: true, value: readGateR1Detail(raw)!, warnings: [] });
    const plan = vi.spyOn(api, "planDecision");
    render(<GateR1ReviewContainer api={api} approvalId="AP-201" />);
    const approve = await screen.findByRole("button", { name: "Approve" });
    expect(approve).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Deny" })).toHaveProperty("disabled", true);
    expect(screen.getAllByText(/evidence pins for this decision were not published/).length).toBeGreaterThanOrEqual(1);
    expect(plan).not.toHaveBeenCalled();
  });

  it("an older read with no context is bound from its COMPLETE verified manifest", async () => {
    const complete = clone(R1_DETAIL) as any;
    delete complete.decision_context;
    complete.evidence_manifest.entries = complete.evidence_manifest.entries.map((e: any, i: number) => ({ ...e, sha256: H(String(i)) }));
    const api = createFixtureApi();
    vi.spyOn(api, "getGateR1").mockResolvedValue({ ok: true, value: readGateR1Detail(complete)!, warnings: [] });
    const plan = vi.spyOn(api, "planDecision");
    render(<GateR1ReviewContainer api={api} approvalId="AP-201" />);
    const approveButton = await screen.findByRole("button", { name: "Approve" });
    await act(async () => { approveButton.click(); });
    await waitFor(() => expect(plan).toHaveBeenCalled());
    expect(plan.mock.calls[0]![0].evidenceHashes).toEqual([H("0"), H("1"), H("2"), H("3"), H("4"), H("5")]);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  });

  it("an older read whose manifest carries no pins is closed, not planned with []", async () => {
    const partial = clone(R1_DETAIL) as any;
    delete partial.decision_context;
    const api = createFixtureApi();
    vi.spyOn(api, "getGateR1").mockResolvedValue({ ok: true, value: readGateR1Detail(partial)!, warnings: [] });
    const plan = vi.spyOn(api, "planDecision");
    render(<GateR1ReviewContainer api={api} approvalId="AP-201" />);
    expect(await screen.findByRole("button", { name: "Approve" })).toHaveProperty("disabled", true);
    expect(plan).not.toHaveBeenCalled();
  });

  it("a Paper Exit decision pins its OWN decision_context (the complete manifest set), never lineage digests", async () => {
    const api = createFixtureApi();
    const plan = vi.spyOn(api, "planDecision");
    render(<PaperExitReviewContainer api={api} reviewId="EX-771" />);
    const promote = await screen.findByRole("button", { name: /Approve promotion/ });
    await act(async () => { promote.click(); });
    await waitFor(() => expect(plan).toHaveBeenCalled());
    expect(plan.mock.calls[0]![0]).toMatchObject({ approvalId: "EX-771", workspaceId: "ws_fixture_governance", decision: "PROMOTE", expectedApprovalVersion: 3, evidenceHashes: [H("1"), H("3"), H("4"), H("5")] });
    // the lineage digests (e…, f…) are not the evidence set and are never sent
    expect(plan.mock.calls[0]![0].evidenceHashes).not.toContain(H("e"));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  });

  it("Paper Exit: absent, blocked, mismatched or oversize contexts close every verb with the reason and plan nothing", async () => {
    const variants: [string, (raw: any) => void, RegExp][] = [
      ["an older read with no context", (raw) => { delete raw.decision_context; }, /published no decision context/],
      ["a blocked context", (raw) => { raw.decision_context.availability = { state: "BLOCKED", reason_code: "EXIT_REVIEW_EXPIRED" }; }, /expired/],
      ["pins that cannot be published (oversize)", (raw) => { raw.decision_context.evidence_hashes = null; raw.decision_context.availability = { state: "BLOCKED", reason_code: "EVIDENCE_HASH_LIMIT_EXCEEDED" }; }, /larger than one decision can pin/],
      ["another review's context", (raw) => { raw.decision_context.review_id = "EX-999"; }, /does not match the review/],
      ["another workspace's context", (raw) => { raw.decision_context.workspace_id = "ws_other"; }, /does not match the review/],
    ];
    for (const [name, tamper, words] of variants) {
      const raw = clone(EXIT_DETAIL) as any;
      tamper(raw);
      const api = createFixtureApi();
      vi.spyOn(api, "getPaperExit").mockResolvedValue({ ok: true, value: readPaperExitDetail(raw)!, warnings: [] });
      const plan = vi.spyOn(api, "planDecision");
      render(<PaperExitReviewContainer api={api} reviewId="EX-771" />);
      const promote = await screen.findByRole("button", { name: /Approve promotion/ });
      expect(promote, name).toHaveProperty("disabled", true);
      for (const label of [/Extend observation/, /Reject/]) expect(screen.getByRole("button", { name: label }), name).toHaveProperty("disabled", true);
      expect(screen.getAllByText(words).length, name).toBeGreaterThanOrEqual(1);
      fireEvent.click(promote);
      expect(plan, name).not.toHaveBeenCalled();
      cleanup();
    }
  });

  it("reads the published synthetic Paper Exit context and refuses a tampered one", () => {
    expect(readPaperExitDecisionContext(fixture.paper_exit)).toMatchObject({ kind: "ok", value: { reviewId: "exit_example", expectedVersion: 3, evidenceHashes: [H("a"), H("c")] } });
    expect(readPaperExitDecisionContext(undefined)).toEqual({ kind: "absent" });
    for (const tamper of [
      (c: any) => { c.gate = "R1"; },
      (c: any) => { c.command_type = "GOVERNANCE_R1_DECISION"; },
      (c: any) => { c.evidence_hashes = [H("a"), H("a")]; },
      (c: any) => { c.evidence_hashes = null; },
      (c: any) => { c.source_snapshot_hash = "nope"; },
      (c: any) => { c.source_side_effect_requested = true; },
    ]) {
      const c = clone(fixture.paper_exit) as any;
      tamper(c);
      expect(readPaperExitDecisionContext(c), JSON.stringify(c).slice(0, 60)).toEqual({ kind: "invalid" });
    }
    // oversize: null pins are only valid when the context says BLOCKED
    const blocked = { ...clone(fixture.paper_exit), evidence_hashes: null, availability: { state: "BLOCKED", reason_code: "EVIDENCE_HASH_LIMIT_EXCEEDED" } };
    expect(readPaperExitDecisionContext(blocked)).toMatchObject({ kind: "ok", value: { evidenceHashes: null } });
  });
});

describe("FE-GOV-02 · R2 and Live never plan a decision", () => {
  it("R2: every verb closed with the not-commissioned reason; nothing is planned even after clicking", async () => {
    const api = createFixtureApi();
    const plan = vi.spyOn(api, "planDecision");
    render(<GateR2ReviewContainer api={api} approvalId="AP-352" />);
    const approve = await screen.findByRole("button", { name: "Approve" });
    for (const name of ["Approve", "Deny", "Request changes", "Approve with condition"]) {
      const button = screen.getByRole("button", { name });
      expect(button, name).toHaveProperty("disabled", true);
      fireEvent.click(button);
    }
    expect(approve.getAttribute("title")).toMatch(/not commissioned/);
    expect(screen.getAllByText(/grants no execution/).length).toBeGreaterThanOrEqual(1);
    expect(plan).not.toHaveBeenCalled();
  });
  it("R2: a historical response that claims eligibility and has no context is closed just the same", async () => {
    const legacy = clone(R2_DETAIL) as any;
    delete legacy.decision_context;
    const api = createFixtureApi();
    vi.spyOn(api, "getGateR2").mockResolvedValue({ ok: true, value: readGateR2Detail(legacy)!, warnings: [] });
    const plan = vi.spyOn(api, "planDecision");
    render(<GateR2ReviewContainer api={api} approvalId="AP-352" />);
    expect(await screen.findByRole("button", { name: "Approve" })).toHaveProperty("disabled", true);
    expect(plan).not.toHaveBeenCalled();
  });
  it("Live: Approve and Deny are closed with the reason and plan nothing", async () => {
    const api = createFixtureApi();
    const plan = vi.spyOn(api, "planDecision");
    render(<GateLiveReviewContainer api={api} approvalId="AP-311" />);
    const approve = await screen.findByRole("button", { name: /Approve live step/ });
    expect(approve).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: /Deny/ })).toHaveProperty("disabled", true);
    fireEvent.click(approve);
    expect(plan).not.toHaveBeenCalled();
  });
});

describe("FE-GOV-03 · captures bound to the server's context", () => {
  const record = (capture: { aggregate_id: string; workspace_id: string }) => `/x/${capture.aggregate_id}?workspace_id=${capture.workspace_id}`;
  const captured = { schema_version: "governance.review-capture.v1", authority: "PORTAL", workspace_id: "ws_example", action: "R2_CREATE", replayed: false, source_side_effect_requested: false, aggregate_id: "apr_r2", approval_id: "apr_r2", workflow_version: 1, read_path: "/api/v1/execution/governance/approvals/apr_r2/r2", captured_projection_digest: H("a"), source_verdict: "NOT_ASSERTED", decision_reason_code: "R2_REVIEW_CAPTURED" } as never;
  const SUMMARY = "Reviewed the accepted R1 evidence and the candidate scope.";

  it("R2_CREATE posts the exact tuple, the reviewer's currency (never defaulted) and the retry-safe key", async () => {
    const r2 = vi.fn(async (_input: R2CaptureInput) => ({ kind: "captured" as const, capture: captured }));
    render(<CaptureNextStep context={readCaptureContext(fixture.capture)} submit={{ r2, paperExit: vi.fn() }} recordHref={record} />);
    expect(screen.getByText(/never approves a gate|not approval|records that a Portal review happened/i)).toBeTruthy();
    const record_ = screen.getByRole("button", { name: /Record review/ });
    expect(record_).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByRole("textbox", { name: /Review summary|summary/i }), { target: { value: SUMMARY } });
    expect(record_.getAttribute("title")).toMatch(/currency/);
    fireEvent.change(screen.getByLabelText("Review currency"), { target: { value: "usdt" } });
    expect(record_).toHaveProperty("disabled", false);
    await act(async () => { record_.click(); });
    expect(r2).toHaveBeenCalledTimes(1);
    expect(r2.mock.calls[0]![0]).toMatchObject({
      workspace_id: "ws_example", summary: SUMMARY, r1_approval_id: "apr_example", expected_r1_version: 2, portfolio_id: "pf_example", currency: "USDT",
      deployment_id: "dep_example", risk_grant_id: "risk_example", expected_projection_digest: H("a"),
    });
    expect((r2.mock.calls[0]![0] as { request_key: string }).request_key).toMatch(/^r2_create:/);
    expect(screen.getByRole("link", { name: /open the review/ }).getAttribute("href")).toBe("/x/apr_r2?workspace_id=ws_example");
  });

  it("a recorded currency is shown, not asked for; several choices stay together as one tuple", async () => {
    const ctx = clone(fixture.capture) as any;
    ctx.candidates = [
      { deployment_id: "dep_a", portfolio_id: "pf_a", risk_grant_id: "g_a", currency: "USDT" },
      { deployment_id: "dep_b", portfolio_id: "pf_b", risk_grant_id: "g_b", currency: "EUR" },
    ];
    const r2 = vi.fn(async (_input: R2CaptureInput) => ({ kind: "captured" as const, capture: captured }));
    render(<CaptureNextStep context={readCaptureContext(ctx)} submit={{ r2, paperExit: vi.fn() }} recordHref={record} />);
    fireEvent.change(screen.getByRole("textbox", { name: /summary/i }), { target: { value: SUMMARY } });
    expect(screen.getByRole("button", { name: /Record review/ })).toHaveProperty("disabled", true);
    choose("Deployment for the next review", /dep_b/);
    expect(screen.queryByLabelText("Review currency")).toBeNull();
    await act(async () => { screen.getByRole("button", { name: /Record review/ }).click(); });
    expect(r2.mock.calls[0]![0]).toMatchObject({ deployment_id: "dep_b", portfolio_id: "pf_b", risk_grant_id: "g_b", currency: "EUR" });
  });

  it("a choice with no recorded risk grant cannot be captured as R2", () => {
    const ctx = clone(fixture.capture) as any;
    ctx.candidates[0].risk_grant_id = null;
    render(<CaptureNextStep context={readCaptureContext(ctx)} submit={{ r2: vi.fn(), paperExit: vi.fn() }} recordHref={record} />);
    fireEvent.change(screen.getByRole("textbox", { name: /summary/i }), { target: { value: SUMMARY } });
    fireEvent.change(screen.getByLabelText("Review currency"), { target: { value: "USDT" } });
    expect(screen.getByRole("button", { name: /Record review/ })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: /Record review/ }).getAttribute("title")).toMatch(/no risk grant/);
  });

  it("PAPER_EXIT_CREATE posts the R2 parent and the deployment, with no currency or risk grant", async () => {
    const ctx = { ...clone(fixture.capture), action: "PAPER_EXIT_CREATE" } as any;
    const exit = vi.fn(async (_input: PaperExitCreateInput) => ({ kind: "captured" as const, capture: { ...(captured as object), action: "PAPER_EXIT_CREATE" } as never }));
    render(<CaptureNextStep context={readCaptureContext(ctx)} submit={{ r2: vi.fn(), paperExit: exit }} recordHref={record} />);
    fireEvent.change(screen.getByRole("textbox", { name: /summary/i }), { target: { value: SUMMARY } });
    await act(async () => { screen.getByRole("button", { name: /Record review/ }).click(); });
    expect(exit.mock.calls[0]![0]).toEqual(expect.objectContaining({ r2_approval_id: "apr_example", expected_r2_version: 2, deployment_id: "dep_example", expected_projection_digest: H("a") }));
    expect(Object.keys(exit.mock.calls[0]![0])).not.toContain("currency");
    expect(Object.keys(exit.mock.calls[0]![0])).not.toContain("risk_grant_id");
  });

  it("a blocked context states its reason in words and draws no form — retained previews stay read-only", () => {
    const blocked = { ...clone(fixture.capture), availability: { state: "BLOCKED", reason_code: "CAPTURE_RETAINED_REVIEW_READ_ONLY" }, expected_projection_digest: null, candidates: [] };
    render(<CaptureNextStep context={readCaptureContext(blocked)} submit={{ r2: vi.fn(), paperExit: vi.fn() }} recordHref={record} />);
    expect(screen.getByText(/retained review — read-only/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Record review/ })).toBeNull();
    expect(document.querySelector("[data-capture-state]")!.getAttribute("data-capture-state")).toBe("blocked");
  });

  it("absent draws nothing; invalid says it could not be validated; a truncated list says it is bounded", () => {
    const { container, rerender } = render(<CaptureNextStep context={{ kind: "absent" }} submit={{ r2: vi.fn(), paperExit: vi.fn() }} recordHref={record} />);
    expect(container.firstChild).toBeNull();
    rerender(<CaptureNextStep context={{ kind: "invalid" }} submit={{ r2: vi.fn(), paperExit: vi.fn() }} recordHref={record} />);
    expect(screen.getByText(/could not be validated/)).toBeTruthy();
    const ctx = clone(fixture.capture) as any;
    ctx.candidates_truncated = true;
    rerender(<CaptureNextStep context={readCaptureContext(ctx)} submit={{ r2: vi.fn(), paperExit: vi.fn() }} recordHref={record} />);
    expect(screen.getByText(/bounded list, not every deployment/)).toBeTruthy();
  });

  it("the R1 and R2 screens offer the next review from their own read (R2_CREATE / PAPER_EXIT_CREATE)", async () => {
    const api = createFixtureApi();
    render(<GateR2ReviewContainer api={api} approvalId="AP-352" />);
    expect(await screen.findByText(/Next · create the Paper Exit review/)).toBeTruthy();
    cleanup();
    render(<GateR1ReviewContainer api={api} approvalId="AP-201" />);
    expect(await screen.findByText(/Next · create the R2 review/)).toBeTruthy();
    expect(screen.getByText(/R1 must be approved first/)).toBeTruthy();
  });
});

describe("FE-GOV-04 · workspace invalidates the read", () => {
  it("a changed workspace re-reads the approval under that workspace and drops the previous ready state", async () => {
    const api = createFixtureApi();
    const get = vi.spyOn(api, "getGateR1");
    const { rerender } = render(<GateR1ReviewContainer api={api} approvalId="AP-201" workspaceId="ws_a" />);
    await screen.findByRole("button", { name: "Approve" });
    rerender(<GateR1ReviewContainer api={api} approvalId="AP-201" workspaceId="ws_b" />);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(get.mock.calls.map((c) => c[1])).toEqual(["ws_a", "ws_b"]);
  });
});

describe("the wire body of the R1 and Paper Exit plans", () => {
  const POLICY = { policyRevision: 4, queryEnabled: true, projectionIngestionEnabled: true, sseEnabled: true, governanceWriteEnabled: true, paperCommandsEnabled: true, sandboxCommandsEnabled: true, liveProtectiveCommandsEnabled: true, liveRiskIncreasingCommandsEnabled: true } as never;
  const bodyOf = async (input: Parameters<ReturnType<typeof createHttpApi>["planDecision"]>[0]) => {
    let sent: any = null;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => { sent = JSON.parse(String(init?.body)); return new Response(JSON.stringify({ operation_id: "op_1", apply_token: "t", blockers: [], warnings: [] }), { status: 200 }); }));
    const result = await createHttpApi({ policy: POLICY }).planDecision(input);
    vi.unstubAllGlobals();
    return { result, sent };
  };
  const cond = [{ text: "extend the holdout by 30 days", owner: "Minh", blocking: true }];

  it("R1 request-changes sends its remediation conditions and the exact pins; without a condition nothing is sent", async () => {
    const { sent } = await bodyOf({ approvalId: "AP-1", workspaceId: "ws_1", decision: "REQUEST_CHANGES", reason: "holdout coverage is thin", conditions: cond, expectedApprovalVersion: 7, evidenceHashes: [H("a"), H("b")], requestKey: "rk" });
    expect(sent.payload).toMatchObject({ decision: "REQUEST_CHANGES", evidence_hashes: [H("a"), H("b")] });
    expect(sent.payload.conditions).toHaveLength(1);
    expect(sent).toMatchObject({ workspace_id: "ws_1", expected_approval_version: 7, target: { approval_id: "AP-1" } });
    const refused = await bodyOf({ approvalId: "AP-1", workspaceId: "ws_1", decision: "REQUEST_CHANGES", reason: "holdout coverage is thin", conditions: [], expectedApprovalVersion: 7, evidenceHashes: [H("a")], requestKey: "rk" });
    expect(refused.sent).toBeNull();
    expect(refused.result).toMatchObject({ ok: false });
    expect((refused.result as { reason: string }).reason).toMatch(/remediation condition/);
  });
  it("a plain R1 approve sends no conditions key, and Paper Exit sends its own contract with the digests", async () => {
    const approve = await bodyOf({ approvalId: "AP-1", workspaceId: "ws_1", decision: "APPROVE", reason: "evidence reviewed", expectedApprovalVersion: 7, evidenceHashes: [H("a")], requestKey: "rk" });
    expect(approve.sent.payload).not.toHaveProperty("conditions");
    const exit = await bodyOf({ approvalId: "EX-1", workspaceId: "ws_1", decision: "PROMOTE", reason: "gate met and sound", expectedApprovalVersion: 2, evidenceHashes: [H("e"), H("f")], requestKey: "rk2" });
    expect(exit.sent).toMatchObject({ schema_version: "governance.paper-exit-decision-plan-request.v1", command_type: "GOVERNANCE_PAPER_EXIT_DECISION", target: { review_id: "EX-1" }, expected_review_version: 2 });
    expect(exit.sent.payload.evidence_hashes).toEqual([H("e"), H("f")]);
  });
});
