/**
 * New request V2 (S3 W-REQUEST): the route page and the queue drawer, against a port fake.
 *
 * Lane: FIXTURE_LAB (unit, jsdom). The port is a Proxy that answers `createApprovalRequest` and fails on anything
 * else; the Run Library is a stubbed same-origin `fetch`. Nothing here proves the real server's answers, only
 * how the screen behaves for each answer the port can give. The 390px layout is CSS and is not measured here.
 *
 * Hostile characters are built with `String.fromCodePoint`, so no invisible character sits in this source.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ApprovalCreateInput, ExecutionApi } from "../../../api/ports";
import { useExecUrlState } from "../../urlState";
import NewRequestPage, { REQUEST_SCREEN_KEY } from "./index";
import { RequestDrawer, type RequestDrawerProps } from "./RequestDrawer";
import { OWN_WORKSPACE_NOTE } from "./parts";
import { clearRequestIntents } from "./useNewRequest";

const u = (n: number): string => String.fromCodePoint(n);
const RLO = u(0x202e);

/* ── the Run Library, as the same-origin list answers it ──────────────────── */

const RUNS = {
  items: [
    { run_id: "run_TEST_ONLY_a1", status: "COMPLETED", created_at_utc_ms: Date.UTC(2026, 9, 12), binding: { alpha_id: "alpha_TEST_ONLY_a", alpha_name: "BTC Trend" }, eligible_methodology_claim_ids: ["claim_TEST_ONLY_a1"], methodology_claims: [{ id: "claim_TEST_ONLY_a1", grade: "A", state: "ELIGIBLE" }] },
    { run_id: "run_TEST_ONLY_a2", status: "COMPLETED", created_at_utc_ms: Date.UTC(2026, 9, 18), binding: { alpha_id: "alpha_TEST_ONLY_a", alpha_name: "BTC Trend" }, eligible_methodology_claim_ids: ["claim_TEST_ONLY_a2x", "claim_TEST_ONLY_a2y"], methodology_claims: [{ id: "claim_TEST_ONLY_a2x", grade: "A", state: "ELIGIBLE" }, { id: "claim_TEST_ONLY_a2y", grade: null, state: null }] },
    { run_id: "run_TEST_ONLY_b1", status: "COMPLETED", created_at_utc_ms: Date.UTC(2026, 8, 3), binding: { alpha_id: "alpha_TEST_ONLY_b", alpha_name: "SOL Break" }, eligible_methodology_claim_ids: [] },
    { run_id: "run_TEST_ONLY_c1", status: "COMPLETED", binding: { alpha_id: "alpha_TEST_ONLY_c", alpha_name: null }, eligible_methodology_claim_ids: null, methodology_claims_availability: { reason_code: "R1_CLAIMS_NOT_PUBLISHED" } },
    { run_id: "run_TEST_ONLY_f1", status: "FAILED", binding: { alpha_id: "alpha_TEST_ONLY_f", alpha_name: "Never Offered" } },
  ],
};

interface Net {
  calls: { method: string; url: string }[];
}
const net: Net = { calls: [] };
let runsAnswer: () => Response = () => new Response(JSON.stringify(RUNS), { status: 200, headers: { "content-type": "application/json" } });

beforeEach(() => {
  clearRequestIntents();
  net.calls = [];
  runsAnswer = () => new Response(JSON.stringify(RUNS), { status: 200, headers: { "content-type": "application/json" } });
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    net.calls.push({ method: init?.method ?? "GET", url: String(input) });
    return runsAnswer();
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, "matchMedia");
});

/* ── the port: one write, everything else is a failure ────────────────────── */

type Answer = unknown;
function port(handler: (input: ApprovalCreateInput) => Answer | Promise<Answer>) {
  const createApprovalRequest = vi.fn(async (input: ApprovalCreateInput) => handler(input));
  const api = new Proxy({}, {
    get(_target, name) {
      if (name === "createApprovalRequest") return createApprovalRequest;
      if (typeof name === "symbol" || name === "then") return undefined;
      return () => {
        throw new Error(`unexpected port call: ${String(name)}`);
      };
    },
  }) as unknown as ExecutionApi;
  return { api, createApprovalRequest };
}
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const CREATED = { kind: "created", approvalId: "apr_TEST_ONLY_203", subjectLabel: "alpha_TEST_ONLY_a", status: "PENDING", slaDueAt: "2026-10-20T12:00:00.000Z", policyVersion: "approval.v3", quorumRequired: 2, requester: "lan" } as const;
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/;

/* ── mounting ─────────────────────────────────────────────────────────────── */

function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{pathname + search}</output>;
}
const search = () => new URLSearchParams((screen.getByTestId("where").textContent ?? "").split("?")[1] ?? "");

function mountPage(api: ExecutionApi, entry = "/governance/approvals/new", props: Partial<React.ComponentProps<typeof NewRequestPage>> = {}) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <NewRequestPage api={api} {...props} />
      <Where />
    </MemoryRouter>,
  );
}

/** The cockpit's part, as the integrator wires it: the URL's `compose` key opens a drawer that stays mounted. */
function Cockpit({ api, extra = {} }: { api: ExecutionApi; extra?: Partial<RequestDrawerProps> }) {
  const url = useExecUrlState();
  return (
    <>
      <button type="button" onClick={() => url.set({ compose: "request" })}>New request</button>
      <button type="button" onClick={() => url.set({ compose: null })}>Queue row</button>
      <RequestDrawer api={api} open={url.value.compose === "request"} onClose={() => url.set({ compose: null }, { replace: true })} {...extra} />
    </>
  );
}
function mountDrawer(api: ExecutionApi, entry = "/governance/approvals", extra: Partial<RequestDrawerProps> = {}) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Cockpit api={api} extra={extra} />
      <Where />
    </MemoryRouter>,
  );
}

/* ── form helpers ─────────────────────────────────────────────────────────── */

const alphaSel = () => screen.getByRole("combobox", { name: /^Alpha/ });
const runSel = () => screen.getByRole("combobox", { name: /^Evidence run/ });
const summaryBox = () => screen.getByRole("textbox", { name: /^Summary/ });
const submitBtn = () => screen.getByRole("button", { name: "Submit for R1 review" });
/** Submit and the outcome buttons are aria-disabled (focus stays on them), never `disabled`. */
const down = (el: HTMLElement) => el.getAttribute("aria-disabled") === "true";
const needText = () => document.querySelector(".exec-rq-need")?.textContent ?? "";

async function loaded() {
  await screen.findByRole("option", { name: "BTC Trend" });
}
async function fillValid(summary = "Momentum with a venue calendar.") {
  await loaded();
  fireEvent.change(alphaSel(), { target: { value: "alpha_TEST_ONLY_a" } });
  fireEvent.change(runSel(), { target: { value: "run_TEST_ONLY_a1" } });
  fireEvent.change(summaryBox(), { target: { value: summary } });
}

/* ═════════════════════════════════════════════════════════════════════════ */

describe("the page: what it shows", () => {
  it("is the request flag's screen", () => {
    expect(REQUEST_SCREEN_KEY).toBe("request");
  });

  it("has the hi-fi's sections and none of its design tools", async () => {
    const { api } = port(() => CREATED);
    mountPage(api);
    await loaded();
    expect(document.querySelector('[data-screen="new-request-v2"]')).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "New approval request" })).toBeTruthy();
    expect(screen.getByText("Research → R1 gate · when it did not start in Research")).toBeTruthy();
    const steps = screen.getByRole("navigation", { name: "Where this request sits in the loop" });
    expect(within(steps).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["1 · Declare · you, now", "2 · R1 · a quant reviewer, not you", "3 · R2 · capital, only after R1"]);
    expect(within(steps).getByText("1 · Declare · you, now").getAttribute("aria-current")).toBe("step");
    expect(screen.getByText("What happens next")).toBeTruthy();
    expect(screen.getByText("Pinned on the server from the run registry.")).toBeTruthy();
    // D13f and D8d: no switch, no preview, no Fresh chip, no scope label without a source.
    expect(screen.queryByText(/Route page/)).toBeNull();
    expect(screen.queryByText(/Drawer from the queue/)).toBeNull();
    expect(screen.queryByText(/Preview the result states/)).toBeNull();
    expect(screen.queryByText(/Fresh/)).toBeNull();
    expect(screen.queryByText(/All authorized|Your alphas/i)).toBeNull();
    expect(screen.getByRole("link", { name: /^Run Library/ }).getAttribute("href")).toBe("/research/quantbt/runs");
  });

  it("offers alphas from COMPLETED runs only, once each, and nothing for a failed run", async () => {
    const { api } = port(() => CREATED);
    mountPage(api);
    await loaded();
    const options = within(alphaSel()).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Pick an alpha", "alpha_TEST_ONLY_c", "BTC Trend", "SOL Break"]);
    expect(options.join(" ")).not.toMatch(/Never Offered/);
  });

  it("while the Run Library is read, the pickers wait and say so", async () => {
    const gate = deferred<Response>();
    vi.stubGlobal("fetch", async () => gate.promise);
    mountPage(port(() => CREATED).api);
    expect(alphaSel().matches(":disabled")).toBe(true);
    expect(screen.getByRole("option", { name: "Reading completed runs…" })).toBeTruthy();
    await act(async () => gate.resolve(new Response(JSON.stringify(RUNS), { status: 200 })));
    await loaded();
    expect(alphaSel().matches(":disabled")).toBe(false);
  });

  it("an unreadable Run Library is said plainly, and the ids can be typed", async () => {
    runsAnswer = () => new Response("{}", { status: 500 });
    const { api, createApprovalRequest } = port(() => CREATED);
    mountPage(api);
    expect(await screen.findByText(/Run Library not available: The Research run list could not be read/)).toBeTruthy();
    expect(alphaSel().matches(":disabled")).toBe(true);
    const hand = document.querySelector("details.exec-rq-hand") as HTMLDetailsElement;
    expect(hand.open).toBe(true);
    fireEvent.change(screen.getByRole("textbox", { name: "Alpha id" }), { target: { value: "alpha_TEST_ONLY_typed" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Evidence run id" }), { target: { value: "run_TEST_ONLY_typed" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Claim id" }), { target: { value: "claim_TEST_ONLY_typed" } });
    fireEvent.change(summaryBox(), { target: { value: "A typed request the server will check." } });
    expect(down(submitBtn())).toBe(false);
    fireEvent.click(submitBtn());
    await screen.findByText("apr_TEST_ONLY_203");
    expect(createApprovalRequest).toHaveBeenCalledWith(expect.objectContaining({ alphaId: "alpha_TEST_ONLY_typed", evidenceRunId: "run_TEST_ONLY_typed", methodologyClaimId: "claim_TEST_ONLY_typed" }));
  });

  it("an empty Run Library says there is nothing to pick, and does not invent alphas", async () => {
    runsAnswer = () => new Response(JSON.stringify({ items: [] }), { status: 200 });
    mountPage(port(() => CREATED).api);
    expect(await screen.findByText(/lists no completed run, so there is nothing to pick/)).toBeTruthy();
    expect(within(alphaSel()).getAllByRole("option")).toHaveLength(1);
  });
});

describe("the form: pickers and the 'Still needed' bar", () => {
  it("an empty form lists everything that is missing and the button says why it is dead", async () => {
    const { api, createApprovalRequest } = port(() => CREATED);
    mountPage(api);
    await loaded();
    expect(needText()).toBe("Still needed: an alpha, an evidence run, a methodology claim, a summary of 8+ characters (0 so far).");
    expect(screen.getByText("Incomplete")).toBeTruthy();
    const btn = submitBtn();
    expect(down(btn)).toBe(true);
    const reason = document.getElementById(btn.getAttribute("aria-describedby") ?? "");
    expect(reason?.textContent).toBe("Fill the missing fields first.");
    fireEvent.click(btn);
    expect(createApprovalRequest).not.toHaveBeenCalled();
  });

  it("picking an alpha then a run with one eligible claim fills the claim; the summary needs 8", async () => {
    const { api } = port(() => CREATED);
    mountPage(api);
    await loaded();
    fireEvent.change(alphaSel(), { target: { value: "alpha_TEST_ONLY_a" } });
    expect(within(runSel()).getAllByRole("option").map((o) => o.textContent)).toEqual(["Pick a completed run", "run_TEST_ONLY_a2 · 2026-10-18", "run_TEST_ONLY_a1 · 2026-10-12"]);
    expect(needText()).toBe("Still needed: an evidence run, a methodology claim, a summary of 8+ characters (0 so far).");
    fireEvent.change(runSel(), { target: { value: "run_TEST_ONLY_a1" } });
    expect(screen.getByText("claim_TEST_ONLY_a1")).toBeTruthy();
    expect(screen.getByText(/the only claim the Run Library lists for this run · A · ELIGIBLE/)).toBeTruthy();
    expect(needText()).toBe("Still needed: a summary of 8+ characters (0 so far).");
    fireEvent.change(summaryBox(), { target: { value: "1234567" } });
    expect(needText()).toBe("Still needed: a summary of 8+ characters (7 so far).");
    expect(down(submitBtn())).toBe(true);
    fireEvent.change(summaryBox(), { target: { value: "12345678" } });
    expect(needText()).toBe("Everything needed is filled.");
    expect(screen.getByText("Ready")).toBeTruthy();
    expect(down(submitBtn())).toBe(false);
  });

  it("the counter is live and prints the minimum", async () => {
    mountPage(port(() => CREATED).api);
    await loaded();
    expect(screen.getByText("0 · min 8")).toBeTruthy();
    fireEvent.change(summaryBox(), { target: { value: "abcde" } });
    expect(screen.getByText("5 · min 8")).toBeTruthy();
  });

  it("a run with several claims offers a picker and asks for the choice", async () => {
    mountPage(port(() => CREATED).api);
    await loaded();
    fireEvent.change(alphaSel(), { target: { value: "alpha_TEST_ONLY_a" } });
    fireEvent.change(runSel(), { target: { value: "run_TEST_ONLY_a2" } });
    const claim = screen.getByRole("combobox", { name: "Methodology claim" });
    expect(within(claim).getAllByRole("option").map((o) => o.textContent)).toEqual(["Pick a claim", "claim_TEST_ONLY_a2x · A · ELIGIBLE", "claim_TEST_ONLY_a2y"]);
    expect(needText()).toContain("a methodology claim");
    fireEvent.change(claim, { target: { value: "claim_TEST_ONLY_a2y" } });
    expect(needText()).not.toContain("a methodology claim");
  });

  it("keeps the three claim answers apart: none listed, cannot list, nothing picked yet", async () => {
    mountPage(port(() => CREATED).api);
    await loaded();
    expect(screen.getByText("Pick a run first, or type the claim id below.")).toBeTruthy();
    fireEvent.change(alphaSel(), { target: { value: "alpha_TEST_ONLY_b" } });
    fireEvent.change(runSel(), { target: { value: "run_TEST_ONLY_b1" } });
    expect(screen.getByText(/lists no eligible claim for this run/)).toBeTruthy();
    fireEvent.change(alphaSel(), { target: { value: "alpha_TEST_ONLY_c" } });
    expect(runSel()).toHaveProperty("value", "");
    fireEvent.change(runSel(), { target: { value: "run_TEST_ONLY_c1" } });
    expect(screen.getByText(/cannot list claims for this run \(R1_CLAIMS_NOT_PUBLISHED\)/)).toBeTruthy();
  });

  it("changing the alpha drops a run and claim that belonged to the old one", async () => {
    mountPage(port(() => CREATED).api);
    await loaded();
    fireEvent.change(alphaSel(), { target: { value: "alpha_TEST_ONLY_a" } });
    fireEvent.change(runSel(), { target: { value: "run_TEST_ONLY_a1" } });
    fireEvent.change(alphaSel(), { target: { value: "alpha_TEST_ONLY_b" } });
    expect(needText()).toContain("an evidence run");
    expect(needText()).toContain("a methodology claim");
  });

  it("an id typed by hand is checked against the schema's id pattern before anything is sent", async () => {
    const { api, createApprovalRequest } = port(() => CREATED);
    mountPage(api);
    await loaded();
    fireEvent.change(screen.getByRole("textbox", { name: "Alpha id" }), { target: { value: "alpha with spaces" } });
    expect(screen.getByText(/Not a valid id: use letters, digits and \. _ : -/)).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Alpha id" }).getAttribute("aria-invalid")).toBe("true");
    expect(needText()).toContain("a valid alpha id");
    fireEvent.submit(document.querySelector("form") as HTMLFormElement);
    expect(createApprovalRequest).not.toHaveBeenCalled();
  });
});

describe("submit: the one road to the port", () => {
  it("sends the trimmed fields with one idempotency key, and shows nothing as created until the server says so", async () => {
    const gate = deferred<unknown>();
    const { api, createApprovalRequest } = port(() => gate.promise);
    mountPage(api);
    await fillValid("   Momentum with a venue calendar.   ");
    fireEvent.click(submitBtn());
    expect(createApprovalRequest).toHaveBeenCalledTimes(1);
    const sent = createApprovalRequest.mock.calls[0]![0];
    expect(sent).toMatchObject({ alphaId: "alpha_TEST_ONLY_a", evidenceRunId: "run_TEST_ONLY_a1", methodologyClaimId: "claim_TEST_ONLY_a1", summary: "Momentum with a venue calendar." });
    expect(sent.requestKey).toMatch(KEY);
    // Pending: not optimistic, and the button says why it is down.
    expect(screen.queryByText("Created")).toBeNull();
    expect(screen.queryByText("apr_TEST_ONLY_203")).toBeNull();
    expect(screen.getByText("Sending")).toBeTruthy();
    expect(down(submitBtn())).toBe(true);
    expect(document.getElementById(submitBtn().getAttribute("aria-describedby") ?? "")?.textContent).toMatch(/Sending\. A second click is ignored until the server answers/);
    await act(async () => gate.resolve(CREATED));
    expect(await screen.findByText("Created")).toBeTruthy();
  });

  it("created: receipt with gate, quorum, due time, policy and requester, and a link to the request in the queue", async () => {
    const { api } = port(() => CREATED);
    mountPage(api);
    await fillValid();
    fireEvent.click(submitBtn());
    const panel = await screen.findByRole("status", { name: "Request created" });
    expect(within(panel).getByText("apr_TEST_ONLY_203")).toBeTruthy();
    expect(within(panel).getByText("R1 · a quant reviewer, not you")).toBeTruthy();
    expect(within(panel).getByText("2").textContent).toBe("2");
    expect(within(panel).getByText("2026-10-20 12:00 UTC")).toBeTruthy();
    expect(within(panel).getByText("approval.v3")).toBeTruthy();
    expect(within(panel).getByText("lan")).toBeTruthy();
    expect(within(panel).getByRole("link", { name: "Open request" }).getAttribute("href")).toBe("/governance/approvals/apr_TEST_ONLY_203/r1");
    expect(panel.textContent).toMatch(/request key [A-Za-z0-9]/);
    // The form is done: fields are locked and the submit bar is gone.
    expect(summaryBox().matches(":disabled")).toBe(true);
    expect(screen.queryByRole("button", { name: "Submit for R1 review" })).toBeNull();
    // Focus lands on the answer.
    expect(document.activeElement).toBe(panel);
  });

  it("the link to the request carries the context params (env, window) of the current URL", async () => {
    mountPage(port(() => CREATED).api, "/governance/approvals/new?env=paper&window=30d");
    await fillValid();
    fireEvent.click(submitBtn());
    const link = await screen.findByRole("link", { name: "Open request" });
    expect(link.getAttribute("href")).toBe("/governance/approvals/apr_TEST_ONLY_203/r1?env=paper&window=30d");
  });

  it("not stated is said as such: no invented SLA or quorum", async () => {
    const { api } = port(() => ({ ...CREATED, slaDueAt: null, quorumRequired: null, policyVersion: null, requester: null }));
    mountPage(api);
    await fillValid();
    fireEvent.click(submitBtn());
    const panel = await screen.findByRole("status", { name: "Request created" });
    expect(within(panel).getAllByText("Not stated")).toHaveLength(4);
    expect(panel.textContent).not.toMatch(/24 h|Starts now/);
  });

  it("replayed: said as already created, with the same receipt", async () => {
    const { api } = port(() => ({ ...CREATED, kind: "replayed" }));
    mountPage(api);
    await fillValid();
    fireEvent.click(submitBtn());
    const panel = await screen.findByRole("status", { name: "Request already created" });
    expect(within(panel).getByText("Already created")).toBeTruthy();
    expect(panel.textContent).toContain("was created by an earlier submit of this request");
    expect(within(panel).getByText("apr_TEST_ONLY_203")).toBeTruthy();
  });

  it("duplicate with the existing approval: a link to it, and nothing was created", async () => {
    const { api } = port(() => ({ kind: "duplicate", existingApprovalId: "apr_TEST_ONLY_201", reason: "An open approval already exists for this alpha and evidence run." }));
    mountPage(api);
    await fillValid();
    fireEvent.click(submitBtn());
    const panel = await screen.findByRole("alert", { name: "Duplicate request" });
    expect(within(panel).getByText("Duplicate")).toBeTruthy();
    expect(within(panel).getByText("apr_TEST_ONLY_201")).toBeTruthy();
    expect(within(panel).getByText("Nothing was created.")).toBeTruthy();
    expect(within(panel).getByRole("link", { name: "Open apr_TEST_ONLY_201" }).getAttribute("href")).toBe("/governance/approvals/apr_TEST_ONLY_201/r1");
    expect(panel.textContent).toContain("An open approval already exists for this alpha and evidence run.");
    // The form stays editable and the submit bar stays.
    expect(summaryBox().matches(":disabled")).toBe(false);
    expect(down(submitBtn())).toBe(false);
  });

  it("duplicate without an id falls back to the queue, not to a guessed id", async () => {
    const { api } = port(() => ({ kind: "duplicate", existingApprovalId: null, reason: "Open work exists." }));
    mountPage(api);
    await fillValid();
    fireEvent.click(submitBtn());
    const panel = await screen.findByRole("alert", { name: "Duplicate request" });
    expect(within(panel).getByRole("link", { name: "Open the approvals queue" }).getAttribute("href")).toBe("/governance/approvals");
  });

  it("refused by a typed code: one plain sentence, the server's words in Provenance, the fields kept", async () => {
    const { api } = port(() => ({ kind: "failed", status: "unavailable", reason: "EVIDENCE_RUN_NOT_ELIGIBLE: Evidence run is not eligible for this alpha and methodology claim." }));
    mountPage(api);
    await fillValid();
    fireEvent.click(submitBtn());
    const panel = await screen.findByRole("alert", { name: "Request refused" });
    expect(within(panel).getByText("Refused")).toBeTruthy();
    expect(within(panel).getByText("That run is not eligible for this alpha and methodology claim.")).toBeTruthy();
    expect(panel.textContent).toContain("Reason EVIDENCE_RUN_NOT_ELIGIBLE · Evidence run is not eligible for this alpha and methodology claim.");
    expect(summaryBox()).toHaveProperty("value", "Momentum with a venue calendar.");
    fireEvent.click(within(panel).getByRole("button", { name: "Change the request" }));
    expect(screen.queryByRole("alert", { name: "Request refused" })).toBeNull();
    expect(down(submitBtn())).toBe(false);
  });

  it("refused with a code this screen has no sentence for: the server's own words are the headline", async () => {
    const { api } = port(() => ({ kind: "failed", status: "unavailable", reason: "SOME_NEW_CODE: The registry says no for a new reason." }));
    mountPage(api);
    await fillValid();
    fireEvent.click(submitBtn());
    const panel = await screen.findByRole("alert", { name: "Request refused" });
    expect(within(panel).getByText("The server refused the request: The registry says no for a new reason.")).toBeTruthy();
  });

  it("denied: says the reader may not, links My access, and keeps the context", async () => {
    const { api } = port(() => ({ kind: "failed", status: "denied", reason: "HTTP_403: The request failed." }));
    mountPage(api, "/governance/approvals/new?env=paper");
    await fillValid();
    fireEvent.click(submitBtn());
    const panel = await screen.findByRole("alert", { name: "Request not allowed" });
    expect(within(panel).getByText("Not allowed")).toBeTruthy();
    expect(within(panel).getByText("You can't create requests here.")).toBeTruthy();
    expect(within(panel).getByRole("link", { name: "My access" }).getAttribute("href")).toBe("/administration/profile-access?env=paper");
  });

  it("a workspace denial by code is denied too, with its own sentence", async () => {
    const { api } = port(() => ({ kind: "failed", status: "unavailable", reason: "WORKSPACE_ACCESS_DENIED: Access denied." }));
    mountPage(api);
    await fillValid();
    fireEvent.click(submitBtn());
    const panel = await screen.findByRole("alert", { name: "Request not allowed" });
    expect(within(panel).getByText("You are not a member of the workspace this request would be created in.")).toBeTruthy();
  });

  it("the port refusing before any request (no delivery policy): 'could not send', the reason as stated, fields kept", async () => {
    const reason = "This screen has no published delivery policy, so no decision can be recorded on it.";
    const { api } = port(() => ({ kind: "failed", status: "unavailable", reason }));
    mountPage(api);
    await fillValid();
    fireEvent.click(submitBtn());
    const panel = await screen.findByRole("alert", { name: "Request not sent" });
    expect(within(panel).getByText("Could not send")).toBeTruthy();
    expect(within(panel).getByText(reason)).toBeTruthy();
    expect(summaryBox()).toHaveProperty("value", "Momentum with a venue calendar.");
  });

  it("network failure is uncertain, never 'failed to create': check the original, and a retry reuses the key", async () => {
    let first = true;
    const { api, createApprovalRequest } = port(() => (first
      ? { kind: "failed", status: "unavailable", reason: "The request never reached the Portal - network failure. Retry sends the SAME request key.", offline: true }
      : { ...CREATED, kind: "replayed" }));
    mountPage(api);
    await fillValid();
    fireEvent.click(submitBtn());
    const panel = await screen.findByRole("alert", { name: "Request outcome uncertain" });
    expect(within(panel).getByText("Uncertain")).toBeTruthy();
    expect(panel.textContent).toContain("It may have been created. Check the original request before doing anything.");
    // FE-069: "Check original request" is a read-only lookup of the request key now, not a link to the queue (see request.lookup.test.tsx).
    expect(within(panel).getByRole("button", { name: "Check original request" })).toBeTruthy();
    expect(within(panel).queryByRole("link", { name: "Check original request" })).toBeNull();
    expect(screen.queryByText("Created")).toBeNull();
    first = false;
    // While uncertain, Submit is down and the only way on is the panel's same-key retry.
    expect(down(submitBtn())).toBe(true);
    fireEvent.click(within(panel).getByRole("button", { name: "Retry with the same key" }));
    await screen.findByRole("status", { name: "Request already created" });
    expect(createApprovalRequest).toHaveBeenCalledTimes(2);
    const [a, b] = createApprovalRequest.mock.calls.map((c) => c[0]);
    expect(b!.requestKey).toBe(a!.requestKey);
    expect({ ...b, requestKey: "" }).toEqual({ ...a, requestKey: "" });
  });

  it("an uncertain outcome does not go away when the reader edits the form", async () => {
    const { api } = port(() => ({ kind: "failed", status: "unavailable", reason: "never reached", offline: true }));
    mountPage(api);
    await fillValid();
    fireEvent.click(submitBtn());
    await screen.findByRole("alert", { name: "Request outcome uncertain" });
    fireEvent.change(summaryBox(), { target: { value: "A different, longer summary." } });
    expect(screen.getByRole("alert", { name: "Request outcome uncertain" })).toBeTruthy();
  });

  it("a port that rejects is uncertain too (the answer is unknown, not 'no')", async () => {
    const { api } = port(() => Promise.reject(new Error("boom")));
    mountPage(api);
    await fillValid();
    fireEvent.click(submitBtn());
    expect(await screen.findByRole("alert", { name: "Request outcome uncertain" })).toBeTruthy();
  });

  it("a port that throws synchronously is uncertain too", async () => {
    const throwing = new Proxy({}, { get: (_t, n) => (n === "createApprovalRequest" ? () => { throw new Error("sync boom"); } : undefined) }) as unknown as ExecutionApi;
    mountPage(throwing);
    await fillValid();
    fireEvent.click(submitBtn());
    expect(await screen.findByRole("alert", { name: "Request outcome uncertain" })).toBeTruthy();
  });

  it("an answer of the wrong shape is a failed read, never a created approval; it may have landed, so it is uncertain", async () => {
    const { api } = port(() => ({ kind: "created" }));
    mountPage(api);
    await fillValid();
    fireEvent.click(submitBtn());
    const panel = await screen.findByRole("alert", { name: "Request outcome uncertain" });
    expect(within(panel).getByText(/The create response could not be read\./)).toBeTruthy();
    expect(screen.queryByText("Created")).toBeNull();
    expect(screen.queryByRole("alert", { name: "Request not sent" })).toBeNull();
  });

  it("a definite refusal frees the key: the server did not create it, so the same fields may go again under a new key; any edit too", async () => {
    const { api, createApprovalRequest } = port(() => ({ kind: "failed", status: "unavailable", reason: "EVIDENCE_RUN_NOT_ELIGIBLE: no" }));
    mountPage(api);
    await fillValid();
    fireEvent.click(submitBtn());
    await screen.findByRole("alert", { name: "Request refused" });
    fireEvent.click(screen.getByRole("button", { name: "Change the request" }));
    fireEvent.click(submitBtn());
    await waitFor(() => expect(createApprovalRequest).toHaveBeenCalledTimes(2));
    await screen.findByRole("alert", { name: "Request refused" });
    expect(createApprovalRequest.mock.calls[1]![0].requestKey).not.toBe(createApprovalRequest.mock.calls[0]![0].requestKey);
    fireEvent.change(summaryBox(), { target: { value: "Momentum with a venue calendar, reworded." } });
    expect(screen.queryByRole("alert", { name: "Request refused" })).toBeNull();
    fireEvent.click(submitBtn());
    await waitFor(() => expect(createApprovalRequest).toHaveBeenCalledTimes(3));
    expect(createApprovalRequest.mock.calls[2]![0].requestKey).not.toBe(createApprovalRequest.mock.calls[0]![0].requestKey);
  });

  it("a double click is one request: three clicks, one call", async () => {
    const gate = deferred<unknown>();
    const { api, createApprovalRequest } = port(() => gate.promise);
    mountPage(api);
    await fillValid();
    const btn = submitBtn();
    await act(async () => {
      fireEvent.click(btn);
      fireEvent.click(btn);
      fireEvent.click(btn);
    });
    expect(createApprovalRequest).toHaveBeenCalledTimes(1);
    await act(async () => gate.resolve(CREATED));
    await screen.findByRole("status", { name: "Request created" });
    expect(createApprovalRequest).toHaveBeenCalledTimes(1);
  });

  it("M1: a form-level submit event sends nothing, even on a complete and valid form", async () => {
    const { api, createApprovalRequest } = port(() => CREATED);
    mountPage(api);
    await fillValid();
    expect(down(submitBtn())).toBe(false);
    const form = document.querySelector("form") as HTMLFormElement;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(createApprovalRequest).not.toHaveBeenCalled();
  });

  it("M1: Enter in each id field never calls the port (default prevented), and a textarea keeps its newline", async () => {
    const { api, createApprovalRequest } = port(() => CREATED);
    mountPage(api);
    await fillValid();
    for (const name of ["Alpha id", "Evidence run id", "Claim id"]) {
      const input = screen.getByRole("textbox", { name });
      // fireEvent returns false when the event was default-prevented: that is what stops the browser's implicit submit.
      expect(fireEvent.keyDown(input, { key: "Enter", code: "Enter" }), name).toBe(false);
      expect(fireEvent.keyPress(input, { key: "Enter", code: "Enter", charCode: 13 })).toBe(true);
    }
    expect(fireEvent.keyDown(summaryBox(), { key: "Enter", code: "Enter" })).toBe(true);
    expect(createApprovalRequest).not.toHaveBeenCalled();
  });

  it("M1: the form has no native submit button, so the browser has no implicit submission to run", async () => {
    mountPage(port(() => CREATED).api);
    await fillValid();
    const form = document.querySelector("form") as HTMLFormElement;
    expect(form.querySelector('button[type="submit"], input[type="submit"]')).toBeNull();
    expect(submitBtn().getAttribute("type")).toBe("button");
  });

  it("a double click is one request, and a recorded request cannot be sent again from the same form", async () => {
    const gate = deferred<unknown>();
    const { api, createApprovalRequest } = port(() => gate.promise);
    mountPage(api);
    await fillValid();
    await act(async () => {
      fireEvent.click(submitBtn());
      fireEvent.click(submitBtn());
    });
    expect(createApprovalRequest).toHaveBeenCalledTimes(1);
    await act(async () => gate.resolve(CREATED));
    await screen.findByRole("status", { name: "Request created" });
    expect(screen.queryByRole("button", { name: "Submit for R1 review" })).toBeNull();
    fireEvent.submit(document.querySelector("form") as HTMLFormElement);
    expect(createApprovalRequest).toHaveBeenCalledTimes(1);
  });

  it("New request after a created one is an empty form and a new key", async () => {
    const { api, createApprovalRequest } = port(() => CREATED);
    mountPage(api);
    await fillValid();
    fireEvent.click(submitBtn());
    await screen.findByRole("status", { name: "Request created" });
    fireEvent.click(screen.getByRole("button", { name: "New request" }));
    expect(summaryBox()).toHaveProperty("value", "");
    expect(needText()).toContain("an alpha");
    await fillValid("A second request, written fresh.");
    fireEvent.click(submitBtn());
    await waitFor(() => expect(createApprovalRequest).toHaveBeenCalledTimes(2));
    expect(createApprovalRequest.mock.calls[1]![0].requestKey).not.toBe(createApprovalRequest.mock.calls[0]![0].requestKey);
  });
});

describe("policy: submit is enabled only when the policy allows writes", () => {
  it("a blocked policy disables a complete form, says why, and no click or submit event reaches the port", async () => {
    const reason = "Recording a decision is disabled for this screen by delivery policy revision 4.";
    const { api, createApprovalRequest } = port(() => CREATED);
    mountPage(api, "/governance/approvals/new", { writeBlockedReason: reason });
    await fillValid();
    expect(down(submitBtn())).toBe(true);
    expect(screen.getByText("Not enabled")).toBeTruthy();
    expect(needText()).toBe(reason);
    expect(document.getElementById(submitBtn().getAttribute("aria-describedby") ?? "")?.textContent).toBe(reason);
    fireEvent.click(submitBtn());
    fireEvent.submit(document.querySelector("form") as HTMLFormElement);
    expect(createApprovalRequest).not.toHaveBeenCalled();
  });

  it("a null reason is an open policy", async () => {
    const { api } = port(() => CREATED);
    mountPage(api, "/governance/approvals/new", { writeBlockedReason: null });
    await fillValid();
    expect(down(submitBtn())).toBe(false);
  });
});

describe("hostile and oversized text (L3)", () => {
  it("a bidi override in the summary is refused before send, named, and the form cannot be submitted around the button", async () => {
    const { api, createApprovalRequest } = port(() => CREATED);
    mountPage(api);
    await fillValid(`Harmless text ${RLO}txt.exe is fine here`);
    expect(down(submitBtn())).toBe(true);
    expect(needText()).toContain("a summary without hidden or direction-changing characters (U+202E)");
    expect(summaryBox().getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText(/Remove hidden or direction-changing characters \(U\+202E\)/)).toBeTruthy();
    fireEvent.submit(document.querySelector("form") as HTMLFormElement);
    expect(createApprovalRequest).not.toHaveBeenCalled();
  });

  it.each([[0x200b, "U+200B"], [0x0007, "U+0007"], [0xfeff, "U+FEFF"], [0x2029, "U+2029"]])("code point %i in the summary is refused", async (cp, label) => {
    const { api, createApprovalRequest } = port(() => CREATED);
    mountPage(api);
    await fillValid(`A summary with ${u(cp)} inside it`);
    expect(down(submitBtn())).toBe(true);
    expect(needText()).toContain(label);
    fireEvent.submit(document.querySelector("form") as HTMLFormElement);
    expect(createApprovalRequest).not.toHaveBeenCalled();
  });

  it("70,000 characters are rejected before send: counter over the maximum, nothing sent", async () => {
    const { api, createApprovalRequest } = port(() => CREATED);
    mountPage(api);
    await fillValid("a".repeat(70_000));
    expect(screen.getByText("70,000 · max 2,000")).toBeTruthy();
    expect(down(submitBtn())).toBe(true);
    expect(needText()).toContain("a summary of 2,000 characters or fewer (70,000 now)");
    expect(screen.getByText("Too long: 2,000 characters at most.")).toBeTruthy();
    fireEvent.submit(document.querySelector("form") as HTMLFormElement);
    expect(createApprovalRequest).not.toHaveBeenCalled();
    // The reader's text was not silently cut.
    expect((summaryBox() as HTMLTextAreaElement).value).toHaveLength(70_000);
  });

  it("2,000 characters is accepted and 2,001 is not", async () => {
    mountPage(port(() => CREATED).api);
    await fillValid("b".repeat(2000));
    expect(down(submitBtn())).toBe(false);
    fireEvent.change(summaryBox(), { target: { value: "b".repeat(2001) } });
    expect(down(submitBtn())).toBe(true);
  });

  it("a server message with a direction override is shown with the character spelled out, never interpreted", async () => {
    const { api } = port(() => ({ kind: "failed", status: "unavailable", reason: `SOME_NEW_CODE: pay ${RLO}live account` }));
    mountPage(api);
    await fillValid();
    fireEvent.click(submitBtn());
    const panel = await screen.findByRole("alert", { name: "Request refused" });
    expect(panel.textContent).toContain("pay [U+202E]live account");
    expect(panel.textContent).not.toContain(RLO);
  });

  it("an approval id from the server that is not an id never reaches a link", async () => {
    const { api } = port(() => ({ ...CREATED, approvalId: `../admin${RLO}` }));
    mountPage(api);
    await fillValid();
    fireEvent.click(submitBtn());
    const panel = await screen.findByRole("status", { name: "Request created" });
    expect(panel.textContent).toContain("../admin[U+202E]");
    expect(panel.textContent).not.toContain(RLO);
    expect(within(panel).queryByRole("link", { name: "Open request" })).toBeNull();
    expect(within(panel).getByRole("link", { name: "Open the approvals queue" }).getAttribute("href")).toBe("/governance/approvals");
  });

  it("an existing-approval id in a duplicate answer that is not an id never reaches a link", async () => {
    const { api } = port(() => ({ kind: "duplicate", existingApprovalId: "x/../y", reason: "dup" }));
    mountPage(api);
    await fillValid();
    fireEvent.click(submitBtn());
    const panel = await screen.findByRole("alert", { name: "Duplicate request" });
    expect(panel.querySelector('a[href*=".."]')).toBeNull();
    expect(within(panel).getByRole("link", { name: "Open the approvals queue" })).toBeTruthy();
  });

  it("a prototype-polluting answer does not turn a refusal into a success", async () => {
    const { api } = port(() => JSON.parse('{"__proto__":{"kind":"created","approvalId":"apr_TEST_ONLY_evil"},"kind":"failed","status":"denied","reason":"HTTP_403: no"}'));
    mountPage(api);
    await fillValid();
    fireEvent.click(submitBtn());
    expect(await screen.findByRole("alert", { name: "Request not allowed" })).toBeTruthy();
    expect(screen.queryByText("apr_TEST_ONLY_evil")).toBeNull();
  });
});

describe("the URL never writes", () => {
  it("the page with alpha, run and claim in the URL fills the form and sends nothing, however long it waits", async () => {
    const { api, createApprovalRequest } = port(() => CREATED);
    mountPage(api, "/governance/approvals/new?alpha=alpha_TEST_ONLY_a&run=run_TEST_ONLY_a1&claim=claim_TEST_ONLY_a1");
    await loaded();
    expect(alphaSel()).toHaveProperty("value", "alpha_TEST_ONLY_a");
    expect(runSel()).toHaveProperty("value", "run_TEST_ONLY_a1");
    expect(screen.getByText("claim_TEST_ONLY_a1")).toBeTruthy();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });
    expect(createApprovalRequest).not.toHaveBeenCalled();
    expect(net.calls.every((c) => c.method === "GET")).toBe(true);
    // Even with a summary typed, only the click sends.
    fireEvent.change(summaryBox(), { target: { value: "Everything is in the link but the summary." } });
    expect(createApprovalRequest).not.toHaveBeenCalled();
    fireEvent.click(submitBtn());
    expect(createApprovalRequest).toHaveBeenCalledTimes(1);
    await screen.findByRole("status", { name: "Request created" });
  });

  it("the link is read once: a later URL change does not overwrite the form", async () => {
    const { api } = port(() => CREATED);
    mountPage(api, "/governance/approvals/new?alpha=alpha_TEST_ONLY_a&run=run_TEST_ONLY_a1");
    await loaded();
    fireEvent.change(summaryBox(), { target: { value: "Typed by the reader." } });
    expect(summaryBox()).toHaveProperty("value", "Typed by the reader.");
    expect(runSel()).toHaveProperty("value", "run_TEST_ONLY_a1");
  });

  it("values of the link that are not ids are left out, and the page says so", async () => {
    const { api, createApprovalRequest } = port(() => CREATED);
    mountPage(api, `/governance/approvals/new?alpha=a%20b&run=run_TEST_ONLY_a1&claim=${encodeURIComponent(`x${RLO}y`)}`);
    await loaded();
    const notes = screen.getByRole("list", { name: "About the link you came from" });
    expect(within(notes).getAllByRole("listitem")).toHaveLength(2);
    expect(notes.textContent).toContain("The link's alpha was not a valid id");
    expect(createApprovalRequest).not.toHaveBeenCalled();
  });

  it("the drawer opened by compose=request with prefilled ids sends nothing until the click", async () => {
    const { api, createApprovalRequest } = port(() => CREATED);
    mountDrawer(api, "/governance/approvals?compose=request&alpha=alpha_TEST_ONLY_a&run=run_TEST_ONLY_a1&claim=claim_TEST_ONLY_a1");
    await loaded();
    const dialog = screen.getByRole("complementary", { name: "New approval request" });
    expect(within(dialog).getByRole("combobox", { name: /^Alpha/ })).toHaveProperty("value", "alpha_TEST_ONLY_a");
    expect(within(dialog).getByRole("combobox", { name: /^Evidence run/ })).toHaveProperty("value", "run_TEST_ONLY_a1");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });
    expect(createApprovalRequest).not.toHaveBeenCalled();
    expect(net.calls.every((c) => c.method === "GET")).toBe(true);
    fireEvent.change(summaryBox(), { target: { value: "Prefilled from a Research link." } });
    expect(createApprovalRequest).not.toHaveBeenCalled();
    fireEvent.click(submitBtn());
    expect(createApprovalRequest).toHaveBeenCalledTimes(1);
    expect(createApprovalRequest.mock.calls[0]![0]).toMatchObject({ alphaId: "alpha_TEST_ONLY_a", evidenceRunId: "run_TEST_ONLY_a1", methodologyClaimId: "claim_TEST_ONLY_a1" });
    await screen.findByRole("status", { name: "Request created" });
  });

  it("the drawer's URL key is compose=request, and the closed drawer reads nothing and renders nothing", async () => {
    const { api, createApprovalRequest } = port(() => CREATED);
    mountDrawer(api);
    expect(screen.queryByRole("complementary", { name: "New approval request" })).toBeNull();
    expect(net.calls).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "New request" }));
    expect(search().get("compose")).toBe("request");
    await loaded();
    expect(net.calls).toHaveLength(1);
    expect(net.calls[0]).toMatchObject({ method: "GET", url: "/api/v1/quantbt/runs?status=COMPLETED&limit=50" });
    expect(createApprovalRequest).not.toHaveBeenCalled();
  });
});

describe("the drawer: draft, close, focus", () => {
  const drawer = () => screen.getByRole("complementary", { name: "New approval request" });
  const esc = () => fireEvent.keyDown(document, { key: "Escape" });

  it("Esc on an untouched drawer closes it without asking, and removes compose from the URL", async () => {
    mountDrawer(port(() => CREATED).api, "/governance/approvals?compose=request");
    await loaded();
    esc();
    expect(screen.queryByRole("complementary", { name: "New approval request" })).toBeNull();
    expect(search().get("compose")).toBeNull();
  });

  it("Esc on a drawer with a draft asks first, keeps the draft, and a second Esc means keep editing", async () => {
    mountDrawer(port(() => CREATED).api, "/governance/approvals?compose=request");
    await fillValid("A draft that must not be lost.");
    esc();
    const ask = screen.getByRole("alertdialog", { name: "Discard this request?" });
    expect(ask).toBeTruthy();
    expect(drawer()).toBeTruthy();
    expect(search().get("compose")).toBe("request");
    expect(document.activeElement).toBe(within(ask).getByRole("button", { name: "Keep editing" }));
    esc();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(summaryBox()).toHaveProperty("value", "A draft that must not be lost.");
    expect(alphaSel()).toHaveProperty("value", "alpha_TEST_ONLY_a");
  });

  it("Close asks the same question; Keep editing keeps everything", async () => {
    mountDrawer(port(() => CREATED).api, "/governance/approvals?compose=request");
    await fillValid("Another draft.");
    fireEvent.click(within(drawer()).getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(search().get("compose")).toBe("request");
    expect(summaryBox()).toHaveProperty("value", "Another draft.");
  });

  it("Discard and close drops the draft, closes, and the next opening is empty", async () => {
    mountDrawer(port(() => CREATED).api, "/governance/approvals?compose=request");
    await fillValid("Discard me.");
    esc();
    fireEvent.click(screen.getByRole("button", { name: "Discard and close" }));
    expect(screen.queryByRole("complementary", { name: "New approval request" })).toBeNull();
    expect(search().get("compose")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "New request" }));
    expect(summaryBox()).toHaveProperty("value", "");
    expect(alphaSel()).toHaveProperty("value", "");
  });

  it("Back (the URL closing the drawer) does not lose the draft: it is there when the drawer reopens", async () => {
    mountDrawer(port(() => CREATED).api, "/governance/approvals?compose=request");
    await fillValid("Survives Back.");
    fireEvent.click(screen.getByRole("button", { name: "Queue row" }));
    expect(screen.queryByRole("complementary", { name: "New approval request" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "New request" }));
    expect(summaryBox()).toHaveProperty("value", "Survives Back.");
    expect(runSel()).toHaveProperty("value", "run_TEST_ONLY_a1");
  });

  it("a recorded request has nothing to lose: Close resets and does not ask", async () => {
    mountDrawer(port(() => CREATED).api, "/governance/approvals?compose=request");
    await fillValid();
    fireEvent.click(submitBtn());
    await screen.findByRole("status", { name: "Request created" });
    fireEvent.click(within(drawer()).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(search().get("compose")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "New request" }));
    expect(summaryBox()).toHaveProperty("value", "");
    expect(screen.queryByRole("status", { name: "Request created" })).toBeNull();
  });

  it("closing while the request is in flight asks nothing; the answer is waiting on reopen", async () => {
    const gate = deferred<unknown>();
    const { api, createApprovalRequest } = port(() => gate.promise);
    mountDrawer(api, "/governance/approvals?compose=request");
    await fillValid();
    fireEvent.click(submitBtn());
    esc();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(search().get("compose")).toBeNull();
    await act(async () => gate.resolve(CREATED));
    fireEvent.click(screen.getByRole("button", { name: "New request" }));
    expect(await screen.findByRole("status", { name: "Request created" })).toBeTruthy();
    expect(createApprovalRequest).toHaveBeenCalledTimes(1);
  });

  it("submits from the drawer exactly like the page: one call, created receipt, link to the request", async () => {
    const { api, createApprovalRequest } = port(() => CREATED);
    mountDrawer(api, "/governance/approvals?compose=request");
    await fillValid();
    await act(async () => {
      fireEvent.click(submitBtn());
      fireEvent.click(submitBtn());
    });
    const panel = await screen.findByRole("status", { name: "Request created" });
    expect(createApprovalRequest).toHaveBeenCalledTimes(1);
    expect(within(panel).getByRole("link", { name: "Open request" }).getAttribute("href")).toBe("/governance/approvals/apr_TEST_ONLY_203/r1");
  });

  it("folds 'What happens next' into one disclosure and has no step bar", async () => {
    mountDrawer(port(() => CREATED).api, "/governance/approvals?compose=request");
    await loaded();
    expect(within(drawer()).getByText("What happens next").closest("details")).toBeTruthy();
    expect(within(drawer()).queryByRole("navigation", { name: "Where this request sits in the loop" })).toBeNull();
    expect(document.querySelector('[data-screen="new-request-drawer-v2"]')).toBeTruthy();
  });

  it("where it overlays (1500px and narrower, 390px included) it is a modal dialog that traps Tab", async () => {
    window.matchMedia = ((query: string) => ({ matches: true, media: query, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false, onchange: null })) as unknown as typeof window.matchMedia;
    mountDrawer(port(() => CREATED).api, "/governance/approvals?compose=request");
    await loaded();
    const dialog = screen.getByRole("dialog", { name: "New approval request" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const items = Array.from(dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary'));
    expect(items.length).toBeGreaterThan(3);
    const closeBtn = within(dialog).getByRole("button", { name: "Close" });
    // Shift+Tab from the dialog itself wraps to the last control; Tab from the last wraps to the first.
    dialog.focus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    // The trap's stops are the Drawer's FOCUSABLE list, `summary` included (UXM-10: the "What happens next" disclosure is the last stop).
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'));
    expect(document.activeElement).toBe(focusable[focusable.length - 1]);
    expect(focusable[focusable.length - 1]!.tagName).toBe("SUMMARY");
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(focusable[0]);
    expect(focusable[0]).toBe(closeBtn);
  });

  it("focus returns to the control that opened it", async () => {
    mountDrawer(port(() => CREATED).api);
    const opener = screen.getByRole("button", { name: "New request" });
    opener.focus();
    fireEvent.click(opener);
    await loaded();
    expect(document.activeElement).toBe(drawer());
    esc();
    expect(document.activeElement).toBe(opener);
  });

  it("the Close button returns focus to the opener too, as Esc does (a pointer press on Close moves focus onto it first)", async () => {
    mountDrawer(port(() => CREATED).api);
    const opener = screen.getByRole("button", { name: "New request" });
    opener.focus();
    fireEvent.click(opener);
    await loaded();
    const close = within(drawer()).getByRole("button", { name: "Close" });
    close.focus();
    fireEvent.click(close);
    expect(document.querySelector('[data-screen="new-request-drawer-v2"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("a click on an opener that does not take focus on press (Safari, Firefox on macOS) is still the opener Close returns to", async () => {
    mountDrawer(port(() => CREATED).api);
    const opener = screen.getByRole("button", { name: "New request" });
    // The press lands on the button, but the browser leaves focus on <body>.
    expect(document.activeElement).toBe(document.body);
    fireEvent.pointerDown(opener);
    fireEvent.click(opener);
    await loaded();
    const close = within(drawer()).getByRole("button", { name: "Close" });
    close.focus();
    fireEvent.click(close);
    expect(document.activeElement).toBe(opener);
  });

  it("opened from the URL (no opener), Close lands on the main landmark rather than being lost", async () => {
    render(
      <MemoryRouter initialEntries={["/governance/approvals?compose=request"]}>
        <main>
          <Cockpit api={port(() => CREATED).api} />
        </main>
      </MemoryRouter>,
    );
    await loaded();
    const close = within(drawer()).getByRole("button", { name: "Close" });
    close.focus();
    fireEvent.click(close);
    expect(document.activeElement).toBe(document.querySelector("main"));
  });

  it("policy block applies in the drawer too", async () => {
    const { api, createApprovalRequest } = port(() => CREATED);
    mountDrawer(api, "/governance/approvals?compose=request", { writeBlockedReason: "Recording is disabled for this screen." });
    await fillValid();
    expect(down(submitBtn())).toBe(true);
    fireEvent.submit(document.querySelector("form") as HTMLFormElement);
    expect(createApprovalRequest).not.toHaveBeenCalled();
  });
});

describe("accessibility (structure)", () => {
  it("every control has an accessible name, every disabled button points at its reason, and the textarea points at its counter", async () => {
    mountPage(port(() => CREATED).api);
    await loaded();
    for (const el of Array.from(document.querySelectorAll("select, textarea, input"))) {
      const named = screen.queryAllByRole(el.tagName === "SELECT" ? "combobox" : "textbox").includes(el as HTMLElement);
      expect(named, el.outerHTML.slice(0, 80)).toBe(true);
    }
    expect(alphaSel().id).not.toBe("");
    expect(summaryBox().getAttribute("aria-describedby")).toMatch(/\S+ \S+/);
    for (const id of (summaryBox().getAttribute("aria-describedby") ?? "").split(" ")) expect(document.getElementById(id), id).toBeTruthy();
    const disabled = Array.from(document.querySelectorAll<HTMLButtonElement>("button:disabled, button[aria-disabled=\"true\"]"));
    expect(disabled.length).toBeGreaterThan(0);
    for (const b of disabled) {
      const ref = b.getAttribute("aria-describedby");
      expect(ref, b.textContent ?? "").toBeTruthy();
      expect(document.getElementById(ref ?? "")?.textContent?.trim(), b.textContent ?? "").toBeTruthy();
    }
    // Disabled selects are explained too.
    expect(runSel().getAttribute("aria-describedby")).toBeTruthy();
    expect(document.getElementById(runSel().getAttribute("aria-describedby") ?? "")?.textContent).toContain("Pick an alpha");
  });

  it("the fields sit in a fieldset with a legend, the page has one h1 and its aside is a labelled region", async () => {
    mountPage(port(() => CREATED).api);
    await loaded();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("group", { name: "Request fields" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "What happens next" })).toBeTruthy();
    expect(screen.getByRole("form", { name: "New approval request" })).toBeTruthy();
  });

  it("answers are announced: created is a status, every failure is an alert", async () => {
    const answers: unknown[] = [CREATED];
    const { api } = port(() => answers[0]);
    mountPage(api);
    await fillValid();
    fireEvent.click(submitBtn());
    expect(await screen.findByRole("status", { name: "Request created" })).toBeTruthy();
    cleanup();
    for (const [answer, name] of [
      [{ kind: "duplicate", existingApprovalId: null, reason: "x" }, "Duplicate request"],
      [{ kind: "failed", status: "unavailable", reason: "EVIDENCE_RUN_NOT_ELIGIBLE: x" }, "Request refused"],
      [{ kind: "failed", status: "denied", reason: "HTTP_403: x" }, "Request not allowed"],
      [{ kind: "failed", status: "unavailable", reason: "x", offline: true }, "Request outcome uncertain"],
    ] as const) {
      answers[0] = answer;
      mountPage(api);
      await fillValid();
      fireEvent.click(submitBtn());
      expect(await screen.findByRole("alert", { name })).toBeTruthy();
      cleanup();
    }
  });

  it("no state is carried by colour alone: every answer has a flag word", async () => {
    const { api } = port(() => CREATED);
    mountPage(api);
    await fillValid();
    expect(screen.getByText("Ready")).toBeTruthy();
    fireEvent.change(summaryBox(), { target: { value: "" } });
    expect(screen.getByText("Incomplete")).toBeTruthy();
  });
});

describe("workspace honesty (the port posts with no workspace; the server uses the caller's own)", () => {
  it("the page says so once when the URL carries a workspace_id, and not otherwise", async () => {
    mountPage(port(() => CREATED).api, "/governance/approvals/new?workspace_id=ws_other");
    await loaded();
    expect(screen.getAllByText(OWN_WORKSPACE_NOTE)).toHaveLength(1);
    cleanup();
    mountPage(port(() => CREATED).api, "/governance/approvals/new");
    await loaded();
    expect(screen.queryByText(OWN_WORKSPACE_NOTE)).toBeNull();
    cleanup();
    mountPage(port(() => CREATED).api, "/governance/approvals/new?workspace_id=");
    await loaded();
    expect(screen.queryByText(OWN_WORKSPACE_NOTE)).toBeNull();
  });

  it("the drawer says so once when the URL carries a workspace_id, and not otherwise", async () => {
    mountDrawer(port(() => CREATED).api, "/governance/approvals?workspace_id=ws_other&compose=request");
    await loaded();
    expect(screen.getAllByText(OWN_WORKSPACE_NOTE)).toHaveLength(1);
    cleanup();
    mountDrawer(port(() => CREATED).api, "/governance/approvals?compose=request");
    await loaded();
    expect(screen.queryByText(OWN_WORKSPACE_NOTE)).toBeNull();
  });
});

/* ═════════════════════════════════════════════════════════════════════════
 * WRITE-safety review (M1-M4 and the minor findings)
 * ═════════════════════════════════════════════════════════════════════════ */

const OFFLINE = { kind: "failed", status: "unavailable", reason: "The request never reached the Portal - network failure.", offline: true } as const;
const sentKeys = (fn: { mock: { calls: { 0: ApprovalCreateInput }[] } }) => fn.mock.calls.map((c) => c[0].requestKey);

describe("M2: an uncertain outcome keeps its key and its payload", () => {
  async function uncertain(api: ExecutionApi) {
    mountPage(api);
    await fillValid();
    fireEvent.click(submitBtn());
    return screen.findByRole("alert", { name: "Request outcome uncertain" });
  }

  it("locks every payload field while uncertain (selects, id inputs, summary) and puts Submit down with its reason", async () => {
    const { api } = port(() => OFFLINE);
    await uncertain(api);
    for (const el of [alphaSel(), runSel(), summaryBox(), screen.getByRole("textbox", { name: "Alpha id" }), screen.getByRole("textbox", { name: "Evidence run id" }), screen.getByRole("textbox", { name: "Claim id" })]) {
      expect(el.matches(":disabled"), el.outerHTML.slice(0, 60)).toBe(true);
    }
    expect(down(submitBtn())).toBe(true);
    expect(document.getElementById(submitBtn().getAttribute("aria-describedby") ?? "")?.textContent).toMatch(/not confirmed\. Retry it with the same key, or discard it/);
    expect(screen.getByText("Unconfirmed")).toBeTruthy();
  });

  it("an edit that gets through anyway changes nothing: the retry sends the stored payload verbatim under the stored key", async () => {
    const { api, createApprovalRequest } = port(() => OFFLINE);
    const panel = await uncertain(api);
    // A disabled control cannot be typed in; a scripted change event is ignored by the state too.
    fireEvent.change(summaryBox(), { target: { value: "A different, longer summary." } });
    expect(summaryBox()).toHaveProperty("value", "Momentum with a venue calendar.");
    expect(screen.getByRole("alert", { name: "Request outcome uncertain" })).toBe(panel);
    fireEvent.click(screen.getByRole("button", { name: "Retry with the same key" }));
    await waitFor(() => expect(createApprovalRequest).toHaveBeenCalledTimes(2));
    const [a, b] = createApprovalRequest.mock.calls.map((c) => c[0]);
    expect(b).toEqual(a);
  });

  it("the Submit button itself does nothing while uncertain", async () => {
    const { api, createApprovalRequest } = port(() => OFFLINE);
    await uncertain(api);
    fireEvent.click(submitBtn());
    fireEvent.submit(document.querySelector("form") as HTMLFormElement);
    expect(createApprovalRequest).toHaveBeenCalledTimes(1);
  });

  it("the uncertain copy claims 'never creates two' nowhere; the same-key retry says what it does", async () => {
    const { api } = port(() => OFFLINE);
    const panel = await uncertain(api);
    expect(panel.textContent).not.toMatch(/never creates two/i);
    expect(panel.textContent).toContain("Retrying sends the same request again under the same key");
    expect(document.body.textContent).not.toMatch(/never creates two|Submitting twice creates one/i);
  });

  it.each([
    ["HTTP 503", { kind: "failed", status: "unavailable", reason: "HTTP_503: The request failed." }],
    ["HTTP 502 with the port's flag", { kind: "failed", status: "unavailable", reason: "BAD_GATEWAY: upstream", offline: true }],
    ["HTTP 504", { kind: "failed", status: "unavailable", reason: "HTTP_504: The request failed." }],
    ["HTTP 408", { kind: "failed", status: "unavailable", reason: "HTTP_408: The request failed." }],
    ["a 2xx whose body could not be read", { kind: "failed", status: "unavailable", reason: "The create response could not be read." }],
  ])("%s is uncertain, not 'could not send'", async (_n, answer) => {
    const { api, createApprovalRequest } = port(() => answer);
    const panel = await uncertain(api);
    expect(screen.queryByRole("alert", { name: "Request not sent" })).toBeNull();
    expect(within(panel).getByRole("button", { name: "Retry with the same key" })).toBeTruthy();
    expect(summaryBox().matches(":disabled")).toBe(true);
    fireEvent.click(within(panel).getByRole("button", { name: "Retry with the same key" }));
    await waitFor(() => expect(createApprovalRequest).toHaveBeenCalledTimes(2));
    expect(sentKeys(createApprovalRequest)[1]).toBe(sentKeys(createApprovalRequest)[0]);
  });

  it("a definite 4xx stays editable and a new key is allowed: the server did not create it, and the copy does not promise otherwise", async () => {
    const { api, createApprovalRequest } = port(() => ({ kind: "failed", status: "unavailable", reason: "HTTP_404: The request failed." }));
    mountPage(api);
    await fillValid();
    fireEvent.click(submitBtn());
    const panel = await screen.findByRole("alert", { name: "Request not sent" });
    expect(panel.textContent).not.toMatch(/never creates two/i);
    expect(panel.textContent).toContain("did not create a request from this attempt");
    expect(summaryBox().matches(":disabled")).toBe(false);
    fireEvent.change(summaryBox(), { target: { value: "Momentum with a venue calendar, reworded." } });
    fireEvent.click(submitBtn());
    await waitFor(() => expect(createApprovalRequest).toHaveBeenCalledTimes(2));
    expect(sentKeys(createApprovalRequest)[1]).not.toBe(sentKeys(createApprovalRequest)[0]);
  });

  it("Discard from uncertain shows the warning first, keeps the key until confirmed, and a confirmed discard unlocks the form with a new key", async () => {
    const { api, createApprovalRequest } = port(() => OFFLINE);
    const panel = await uncertain(api);
    fireEvent.click(within(panel).getByRole("button", { name: "Discard" }));
    const ask = screen.getByRole("alertdialog", { name: "Discard this uncertain request?" });
    expect(ask.textContent).toContain("This request may already exist. Check the queue before creating another.");
    expect(within(ask).getByRole("link", { name: "Check the queue" }).getAttribute("href")).toBe("/governance/approvals");
    expect(document.activeElement).toBe(within(ask).getByRole("button", { name: "Keep the request" }));
    // Nothing was dropped yet: the fields are still locked and Keep returns to the retry.
    expect(summaryBox().matches(":disabled")).toBe(true);
    fireEvent.click(within(ask).getByRole("button", { name: "Keep the request" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Retry with the same key" })).toBeTruthy();
    // Confirm.
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard anyway" }));
    expect(screen.queryByRole("alert", { name: "Request outcome uncertain" })).toBeNull();
    expect(summaryBox().matches(":disabled")).toBe(false);
    expect(summaryBox()).toHaveProperty("value", "Momentum with a venue calendar.");
    expect(down(submitBtn())).toBe(false);
    fireEvent.click(submitBtn());
    await waitFor(() => expect(createApprovalRequest).toHaveBeenCalledTimes(2));
    expect(sentKeys(createApprovalRequest)[1]).not.toBe(sentKeys(createApprovalRequest)[0]);
  });

  it("a retry that is answered 'replayed' settles the form; the key it used is the original", async () => {
    let first = true;
    const { api, createApprovalRequest } = port(() => (first ? OFFLINE : { ...CREATED, kind: "replayed" }));
    const panel = await uncertain(api);
    first = false;
    fireEvent.click(within(panel).getByRole("button", { name: "Retry with the same key" }));
    await screen.findByRole("status", { name: "Request already created" });
    expect(sentKeys(createApprovalRequest)[1]).toBe(sentKeys(createApprovalRequest)[0]);
  });

  it("while a retry is in flight its buttons wait and a second click is ignored", async () => {
    let first = true;
    const gate = deferred<unknown>();
    const { api, createApprovalRequest } = port(() => (first ? OFFLINE : gate.promise));
    const panel = await uncertain(api);
    first = false;
    const retry = within(panel).getByRole("button", { name: "Retry with the same key" });
    await act(async () => {
      fireEvent.click(retry);
      fireEvent.click(retry);
    });
    expect(createApprovalRequest).toHaveBeenCalledTimes(2);
    expect(down(retry)).toBe(true);
    expect(down(within(panel).getByRole("button", { name: "Discard" }))).toBe(true);
    await act(async () => gate.resolve(CREATED));
    await screen.findByRole("status", { name: "Request created" });
  });

  it("the drawer: closing while uncertain asks with the warning, and Discard and close forgets the key", async () => {
    const { api, createApprovalRequest } = port(() => OFFLINE);
    mountDrawer(api, "/governance/approvals?compose=request");
    await fillValid();
    fireEvent.click(submitBtn());
    await screen.findByRole("alert", { name: "Request outcome uncertain" });
    fireEvent.keyDown(document, { key: "Escape" });
    const ask = screen.getByRole("alertdialog", { name: "Discard this request?" });
    expect(ask.textContent).toContain("This request may already exist. Check the queue before creating another.");
    expect(ask.textContent).not.toContain("has not been sent");
    // Keep editing leaves the key and the lock alone.
    fireEvent.click(within(ask).getByRole("button", { name: "Keep editing" }));
    expect(screen.getByRole("alert", { name: "Request outcome uncertain" })).toBeTruthy();
    expect(summaryBox().matches(":disabled")).toBe(true);
    // Confirm: closed, forgotten; the same payload typed again is a new intent.
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Discard and close" }));
    fireEvent.click(screen.getByRole("button", { name: "New request" }));
    await fillValid();
    fireEvent.click(submitBtn());
    await waitFor(() => expect(createApprovalRequest).toHaveBeenCalledTimes(2));
    expect(sentKeys(createApprovalRequest)[1]).not.toBe(sentKeys(createApprovalRequest)[0]);
  });

  it("the drawer's ordinary discard text no longer claims what it cannot know", async () => {
    mountDrawer(port(() => CREATED).api, "/governance/approvals?compose=request");
    await fillValid("A draft.....");
    fireEvent.keyDown(document, { key: "Escape" });
    const ask = screen.getByRole("alertdialog", { name: "Discard this request?" });
    expect(ask.textContent).toContain("Nothing has been created from what you typed. Closing now loses it.");
  });
});

describe("M2: the key outlives a host that unmounts during the POST", () => {
  it("reopening with the same payload reuses the key; a different payload does not", async () => {
    const gate = deferred<unknown>();
    const first = port(() => gate.promise);
    const view = mountPage(first.api);
    await fillValid();
    fireEvent.click(submitBtn());
    expect(first.createApprovalRequest).toHaveBeenCalledTimes(1);
    view.unmount();
    // The answer arrives after the host is gone: nobody on screen, and it is not definite.
    await act(async () => gate.resolve(OFFLINE));
    const second = port(() => CREATED);
    mountPage(second.api);
    await fillValid();
    fireEvent.click(submitBtn());
    await waitFor(() => expect(second.createApprovalRequest).toHaveBeenCalledTimes(1));
    expect(second.createApprovalRequest.mock.calls[0]![0].requestKey).toBe(first.createApprovalRequest.mock.calls[0]![0].requestKey);
    await screen.findByRole("status", { name: "Request created" });
    cleanup();
    // The definite answer freed the key.
    const third = port(() => CREATED);
    mountPage(third.api);
    await fillValid();
    fireEvent.click(submitBtn());
    await waitFor(() => expect(third.createApprovalRequest).toHaveBeenCalledTimes(1));
    expect(third.createApprovalRequest.mock.calls[0]![0].requestKey).not.toBe(first.createApprovalRequest.mock.calls[0]![0].requestKey);
  });

  it("a different payload gets its own key", async () => {
    const gate = deferred<unknown>();
    const first = port(() => gate.promise);
    const view = mountPage(first.api);
    await fillValid();
    fireEvent.click(submitBtn());
    view.unmount();
    await act(async () => gate.resolve(OFFLINE));
    const second = port(() => CREATED);
    mountPage(second.api);
    await fillValid("Another summary entirely.");
    fireEvent.click(submitBtn());
    await waitFor(() => expect(second.createApprovalRequest).toHaveBeenCalledTimes(1));
    expect(second.createApprovalRequest.mock.calls[0]![0].requestKey).not.toBe(first.createApprovalRequest.mock.calls[0]![0].requestKey);
  });
});

describe("the hook: stale answers, sticky dirty", () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

  it("an answer that arrives after a reset does not land on the fresh form, and the fresh form can send at once", async () => {
    const { useNewRequest } = await import("./useNewRequest");
    const gate = deferred<unknown>();
    const { api, createApprovalRequest } = port((input) => (input.summary === "Momentum with a venue calendar." ? gate.promise : CREATED));
    const { renderHook } = await import("@testing-library/react");
    const hook = renderHook(() => useNewRequest({ api, runsEnabled: false }), { wrapper });
    const fill = (summary: string) => {
      act(() => {
        hook.result.current.setAlpha("alpha_TEST_ONLY_a");
        hook.result.current.setRun("run_TEST_ONLY_a1");
        hook.result.current.setClaim("claim_TEST_ONLY_a1");
        hook.result.current.setSummary(summary);
      });
    };
    fill("Momentum with a venue calendar.");
    act(() => hook.result.current.submit());
    expect(hook.result.current.submitting).toBe(true);
    act(() => hook.result.current.reset());
    expect(hook.result.current.submitting).toBe(false);
    expect(hook.result.current.fields.summary).toBe("");
    await act(async () => gate.resolve(CREATED));
    expect(hook.result.current.outcome).toBeNull();
    expect(hook.result.current.settled).toBe(false);
    expect(hook.result.current.fields.summary).toBe("");
    fill("A second request, other words.");
    act(() => hook.result.current.submit());
    await waitFor(() => expect(hook.result.current.settled).toBe(true));
    expect(createApprovalRequest).toHaveBeenCalledTimes(2);
  });

  it("dirty follows the current values: typing then clearing is clean again, and a link's ids are not a draft", async () => {
    const { useNewRequest } = await import("./useNewRequest");
    const { renderHook } = await import("@testing-library/react");
    const { api } = port(() => CREATED);
    const hook = renderHook(() => useNewRequest({ api, runsEnabled: false, prefill: { alphaId: "alpha_TEST_ONLY_a", runId: "run_TEST_ONLY_a1" } }), { wrapper });
    expect(hook.result.current.dirty).toBe(false);
    act(() => hook.result.current.setSummary("something"));
    expect(hook.result.current.dirty).toBe(true);
    act(() => hook.result.current.setSummary(""));
    expect(hook.result.current.dirty).toBe(false);
    act(() => hook.result.current.setAlpha("alpha_TEST_ONLY_b"));
    expect(hook.result.current.dirty).toBe(true);
    act(() => hook.result.current.setAlpha("alpha_TEST_ONLY_a"));
    expect(hook.result.current.dirty).toBe(false);
  });
});

describe("the drawer: cleared fields close without asking; Submit waits while the question is on screen; focus stays on Submit", () => {
  const esc = () => fireEvent.keyDown(document, { key: "Escape" });

  it("typing and then clearing the fields leaves nothing to lose", async () => {
    mountDrawer(port(() => CREATED).api, "/governance/approvals?compose=request");
    await fillValid("Typed then cleared.");
    fireEvent.change(summaryBox(), { target: { value: "" } });
    fireEvent.change(alphaSel(), { target: { value: "" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Evidence run id" }), { target: { value: "" } });
    esc();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.queryByRole("complementary", { name: "New approval request" })).toBeNull();
  });

  it("Submit is down while 'Discard this request?' is shown, and up again after Keep editing", async () => {
    const { api, createApprovalRequest } = port(() => CREATED);
    mountDrawer(api, "/governance/approvals?compose=request");
    await fillValid();
    expect(down(submitBtn())).toBe(false);
    esc();
    screen.getByRole("alertdialog", { name: "Discard this request?" });
    expect(down(submitBtn())).toBe(true);
    expect(screen.getByText("On hold")).toBeTruthy();
    fireEvent.click(submitBtn());
    expect(createApprovalRequest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(down(submitBtn())).toBe(false);
  });

  it("keyboard focus stays on the Submit button while the send is in flight (aria-disabled, not disabled)", async () => {
    const gate = deferred<unknown>();
    const { api } = port(() => gate.promise);
    mountPage(api);
    await fillValid();
    const btn = submitBtn();
    btn.focus();
    fireEvent.click(btn);
    expect(down(btn)).toBe(true);
    expect(btn.hasAttribute("disabled")).toBe(false);
    expect(document.activeElement).toBe(btn);
    expect(document.getElementById(btn.getAttribute("aria-describedby") ?? "")?.getAttribute("role")).toBe("status");
    await act(async () => gate.resolve(CREATED));
    await screen.findByRole("status", { name: "Request created" });
  });
});

describe("M3: result links open the caller's own workspace record", () => {
  it("created: 'Open request' keeps env and window but drops workspace_id; the note stays", async () => {
    mountPage(port(() => CREATED).api, "/governance/approvals/new?workspace_id=ws_other&env=paper&window=30d");
    await fillValid();
    fireEvent.click(submitBtn());
    const panel = await screen.findByRole("status", { name: "Request created" });
    const href = within(panel).getByRole("link", { name: "Open request" }).getAttribute("href") ?? "";
    expect(href).not.toContain("workspace_id");
    expect(href.startsWith("/governance/approvals/apr_TEST_ONLY_203/r1?")).toBe(true);
    expect(href).toContain("env=paper");
    expect(href).toContain("window=30d");
    expect(screen.getAllByText(OWN_WORKSPACE_NOTE)).toHaveLength(1);
  });

  it("created without a usable id: 'Open the approvals queue' drops workspace_id too", async () => {
    mountPage(port(() => ({ ...CREATED, approvalId: "../evil/ id" })).api, "/governance/approvals/new?workspace_id=ws_other");
    await fillValid();
    fireEvent.click(submitBtn());
    const panel = await screen.findByRole("status", { name: "Request created" });
    expect(within(panel).getByRole("link", { name: "Open the approvals queue" }).getAttribute("href")).toBe("/governance/approvals");
  });

  it("duplicate and uncertain links drop workspace_id as well", async () => {
    mountPage(port(() => ({ kind: "duplicate", existingApprovalId: "apr_TEST_ONLY_9", reason: "dup" })).api, "/governance/approvals/new?workspace_id=ws_other&env=paper");
    await fillValid();
    fireEvent.click(submitBtn());
    const dup = await screen.findByRole("alert", { name: "Duplicate request" });
    const href = within(dup).getByRole("link", { name: "Open apr_TEST_ONLY_9" }).getAttribute("href") ?? "";
    expect(href).not.toContain("workspace_id");
    expect(href).toContain("env=paper");
    cleanup();
    mountPage(port(() => OFFLINE).api, "/governance/approvals/new?workspace_id=ws_other");
    await fillValid();
    fireEvent.click(submitBtn());
    const unc = await screen.findByRole("alert", { name: "Request outcome uncertain" });
    // The queue link is in the discard question; it keeps the context but not the page's workspace_id.
    fireEvent.click(within(unc).getByRole("button", { name: "Discard" }));
    expect(within(await screen.findByRole("alertdialog", { name: "Discard this uncertain request?" })).getByRole("link", { name: "Check the queue" }).getAttribute("href")).toBe("/governance/approvals");
  });
});

describe("M4: the Run Library link does not take the typed form away", () => {
  it("opens in a new tab with noopener noreferrer, says so, and does not navigate this one", async () => {
    mountPage(port(() => CREATED).api, "/governance/approvals/new");
    await fillValid("Typed before the click.");
    const link = screen.getByRole("link", { name: /^Run Library/ });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.textContent).toContain("(opens in a new tab)");
    fireEvent.click(link);
    expect(screen.getByTestId("where").textContent).toBe("/governance/approvals/new");
    expect(summaryBox()).toHaveProperty("value", "Typed before the click.");
  });
});
