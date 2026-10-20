/**
 * FE-069 · New request: "Check original request" is a read-only lookup of the request key; the alpha scope label is the server's;
 * the run list is filtered by alpha on the server and paged by the Run Library's own cursor.
 *
 * Bodies are the canonical `governance-requester-reads` cases (lookup, eligibility) read through the strict readers; the Run Library
 * is a stubbed same-origin `fetch` shaped like `research.run-library.v1`. Lane: FIXTURE_LAB. The write-safety rules of the form
 * (no Enter submit, an uncertain outcome locks the payload, one idempotency key) are asserted again here around the new read.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ApprovalCreateInput, ExecutionApi, Result } from "../../../api/ports";
import { readApprovalRequestLookupV1, type ApprovalRequestLookupQuery, type ApprovalRequestLookupRead } from "../../readers/approvalRequestLookup";
import { readStageActionEligibilityV1, type StageActionEligibilityRead } from "../../readers/stageActionEligibility";
import { loadCanonical } from "../../testkit/loadCanonical";
import NewRequestPage from "./index";
import { clearRequestIntents } from "./useNewRequest";

type Draft = any;
const FIX = loadCanonical<{ approval_request_lookup: Record<string, Draft>; stage_action_eligibility: Record<string, Draft> }>("governance-requester-reads.synthetic");
const LOOKUP = FIX.approval_request_lookup;

const run = (n: number, alpha: string, name: string) => ({
  run_id: `run_${alpha}_${n}`, status: "COMPLETED", created_at_utc_ms: Date.UTC(2026, 9, 1) + n, binding: { alpha_id: alpha, alpha_name: name },
  eligible_methodology_claim_ids: [`claim_${alpha}_${n}`], methodology_claims: [{ id: `claim_${alpha}_${n}`, grade: "A", state: "ELIGIBLE" }],
});
const page = (items: unknown[], over: { next?: string | null; filtered?: number; catalog?: unknown } = {}) => ({
  schema_version: "research.run-library.v1", read_authority: "PORTAL_PERSISTED_RESEARCH", items,
  page: { limit: 50, total_rows: 900, filtered_rows: over.filtered ?? items.length, next_cursor: over.next ?? null, prev_cursor: null, has_more: over.next != null, has_previous: false, order: "CREATED_AT_DESC_RUN_ID_DESC" },
  filter_catalog: over.catalog === undefined
    ? { alphas: [{ alpha_id: "alpha_near", alpha_name: "Near Alpha" }, { alpha_id: "alpha_far", alpha_name: "Far Alpha Beyond Fifty" }], modes: [], scratch_available: false }
    : over.catalog,
  as_of_utc_ms: 1_790_000_000_000,
});

let runsAnswer: (url: string) => unknown;
const urls: string[] = [];
beforeEach(() => {
  clearRequestIntents();
  urls.length = 0;
  runsAnswer = (url) => {
    if (url.includes("alpha=alpha_far") && url.includes("cursor=far1")) return page([run(3, "alpha_far", "Far Alpha Beyond Fifty")], { filtered: 3 });
    if (url.includes("alpha=alpha_far")) return page([run(1, "alpha_far", "Far Alpha Beyond Fifty"), run(2, "alpha_far", "Far Alpha Beyond Fifty")], { next: "far1", filtered: 3 });
    return page(Array.from({ length: 4 }, (_, n) => run(n + 1, "alpha_near", "Near Alpha")));
  };
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    urls.push(String(input));
    return new Response(JSON.stringify(runsAnswer(String(input))), { status: 200, headers: { "content-type": "application/json" } });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const lookupResult = (body: unknown): Result<ApprovalRequestLookupRead> => {
  const value = readApprovalRequestLookupV1(body);
  return value === null ? { ok: false, status: "unavailable", reason: "unreadable" } : { ok: true, value };
};
const eligibilityResult = (name: string): Result<StageActionEligibilityRead> => {
  const value = readStageActionEligibilityV1(FIX.stage_action_eligibility[name]);
  return value === null ? { ok: false, status: "unavailable", reason: "unreadable" } : { ok: true, value };
};

/** The canonical case, answered for the key the form actually sent (the fixture's own key is a fixed string; the form mints its own). */
const forKey = (body: Draft) => (query: ApprovalRequestLookupQuery): Result<ApprovalRequestLookupRead> => lookupResult({ ...body, request_key: query.requestKey });

interface PortOptions {
  create?: (input: ApprovalCreateInput) => unknown;
  lookup?: (query: ApprovalRequestLookupQuery, call: number) => Result<ApprovalRequestLookupRead> | Promise<Result<ApprovalRequestLookupRead>> | "missing";
  eligibility?: string;
}
function port(options: PortOptions = {}) {
  const OFFLINE = { kind: "failed", status: "unavailable", reason: "The request never reached the Portal - network failure.", offline: true };
  const createApprovalRequest = vi.fn(async (input: ApprovalCreateInput) => (options.create ? options.create(input) : OFFLINE));
  let calls = 0;
  const lookupApprovalRequest = vi.fn(async (query: ApprovalRequestLookupQuery) => {
    const answer = options.lookup ? options.lookup(query, ++calls) : lookupResult(LOOKUP.none);
    if (answer === "missing") throw new Error("no such method");
    return answer;
  });
  const getStageActionEligibility = vi.fn(async () => (options.eligibility ? eligibilityResult(options.eligibility) : { ok: false as const, status: "unavailable" as const, reason: "none" }));
  const api = new Proxy({}, {
    get(_t, name) {
      if (name === "createApprovalRequest") return createApprovalRequest;
      if (name === "lookupApprovalRequest") return lookupApprovalRequest;
      if (name === "getStageActionEligibility") return getStageActionEligibility;
      if (typeof name === "symbol" || name === "then") return undefined;
      return () => { throw new Error(`unexpected port call: ${String(name)}`); };
    },
  }) as unknown as ExecutionApi;
  return { api, createApprovalRequest, lookupApprovalRequest };
}

const mount = (api: ExecutionApi) => render(<MemoryRouter initialEntries={["/governance/approvals/new"]}><NewRequestPage api={api} /></MemoryRouter>);
const alphaSel = () => screen.getByRole("combobox", { name: /^Alpha/ });
const runSel = () => screen.getByRole("combobox", { name: /^Evidence run/ });
const summaryBox = () => screen.getByRole("textbox", { name: /^Summary/ });
const submitBtn = () => screen.getByRole("button", { name: "Submit for R1 review" });
const SUMMARY = "Momentum with a venue calendar.";

async function fillNear() {
  await screen.findByRole("option", { name: "Near Alpha" });
  fireEvent.change(alphaSel(), { target: { value: "alpha_near" } });
  await waitFor(() => expect(screen.getByRole("option", { name: /run_alpha_near_1/ })).toBeTruthy());
  fireEvent.change(runSel(), { target: { value: "run_alpha_near_1" } });
  fireEvent.change(summaryBox(), { target: { value: SUMMARY } });
}
async function toUncertain(options: PortOptions) {
  const p = port(options);
  mount(p.api);
  await fillNear();
  fireEvent.click(submitBtn());
  const panel = await screen.findByRole("alert", { name: "Request outcome uncertain" });
  lastKey = p.createApprovalRequest.mock.calls[0]![0].requestKey;
  return { ...p, panel };
}
let lastKey = "";
const sentKey = () => lastKey;
const checkBtn = (panel: HTMLElement) => within(panel).getByRole("button", { name: "Check original request" });

describe("Check original request", () => {
  it("asks the server about the SAME key with the stored payload, and says plainly that nothing exists (NONE)", async () => {
    const { panel, createApprovalRequest, lookupApprovalRequest } = await toUncertain({ lookup: forKey(LOOKUP.none) });
    expect(lookupApprovalRequest).not.toHaveBeenCalled();
    fireEvent.click(checkBtn(panel));
    const result = await within(panel).findByText(/No request exists under this key/);
    expect(result.textContent).toContain("retrying with the same key and the same fields creates it");
    expect(lookupApprovalRequest).toHaveBeenCalledTimes(1);
    const sent = createApprovalRequest.mock.calls[0]![0];
    expect(lookupApprovalRequest.mock.calls[0]![0]).toEqual({
      requestKey: sent.requestKey,
      payload: { alphaId: sent.alphaId, evidenceRunId: sent.evidenceRunId, methodologyClaimId: sent.methodologyClaimId, summary: sent.summary },
    });
    // A read: nothing was sent, the outcome is still uncertain, the fields are still locked, the retry is still the same-key retry.
    expect(createApprovalRequest).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert", { name: "Request outcome uncertain" })).toBeTruthy();
    expect((summaryBox().closest("fieldset") as HTMLFieldSetElement).disabled).toBe(true);
    expect(within(panel).getByRole("button", { name: "Retry with the same key" })).toBeTruthy();
  });

  it("FOUND with the payload compared (MATCH) shows the same body a replay would, and does not settle the form", async () => {
    const { panel, createApprovalRequest } = await toUncertain({ lookup: forKey(LOOKUP.found_payload_match) });
    fireEvent.click(checkBtn(panel));
    await within(panel).findByText(/The request was created\. The fields stored on the server are the ones in this form/);
    const block = panel.querySelector(".exec-rq-check") as HTMLElement;
    expect(block.dataset.state).toBe("FOUND");
    expect(block.dataset.payloadCheck).toBe("MATCH");
    expect(within(block).getByText("apr_01J6N29PRODUCT")).toBeTruthy();
    expect(block.textContent).toContain("PENDING");
    expect(block.textContent).toContain("approval.v3");
    expect(block.textContent).toContain("stan");
    expect(within(block).getByRole("link", { name: "Open request" })).toBeTruthy();
    expect(createApprovalRequest).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("status", { name: "Request already created" })).toBeNull();
    expect(screen.getByRole("alert", { name: "Request outcome uncertain" })).toBeTruthy();
  });

  it("FOUND but NOT_COMPARED says it only proves a request exists under the key, never that it is this one", async () => {
    const { panel } = await toUncertain({ lookup: forKey(LOOKUP.found_not_compared) });
    fireEvent.click(checkBtn(panel));
    const text = await within(panel).findByText(/The fields were not compared/);
    expect(text.textContent).toContain("only says a request exists, not that it is this one");
    expect(panel.textContent).not.toContain("The fields stored on the server are the ones in this form");
  });

  it("KEY_PAYLOAD_CONFLICT says the key is in use with different fields, and offers the queue", async () => {
    const { panel } = await toUncertain({ lookup: forKey(LOOKUP.key_payload_conflict) });
    fireEvent.click(checkBtn(panel));
    const text = await within(panel).findByText(/exists under this key, but with different fields/);
    expect(text.textContent).toContain("Retrying with the same key is refused");
    expect(within(panel).getByRole("link", { name: "Check the queue" }).getAttribute("href")).toBe("/governance/approvals");
    // The write-safety rules do not move: still locked, still the same-key retry.
    expect(within(panel).getByRole("button", { name: "Retry with the same key" })).toBeTruthy();
  });

  it("a lookup that fails says it is still unknown whether the request exists", async () => {
    const { panel } = await toUncertain({ lookup: () => ({ ok: false, status: "unavailable", reason: "INTERNAL_ERROR: try later" }) });
    fireEvent.click(checkBtn(panel));
    const note = await within(panel).findByText(/still unknown whether the request exists/);
    expect(note.textContent).toContain("INTERNAL_ERROR");
    expect(within(panel).getByRole("link", { name: "Check the queue" })).toBeTruthy();
  });

  it("a port with no such method says the same, and never claims the request is absent", async () => {
    const { panel } = await toUncertain({ lookup: () => "missing" });
    fireEvent.click(checkBtn(panel));
    await within(panel).findByText(/still unknown whether the request exists/);
    expect(panel.textContent).not.toContain("No request exists");
  });

  it("an answer for another key is not an answer", async () => {
    const other = structuredClone(LOOKUP.none);
    other.request_key = "req-someone-else";
    const { panel } = await toUncertain({ lookup: () => lookupResult(other) });
    fireEvent.click(checkBtn(panel));
    await within(panel).findByText(/answered for another request key/);
  });

  it("is single-flight: a second click while the first is out sends nothing", async () => {
    let release!: (value: Result<ApprovalRequestLookupRead>) => void;
    const gate = new Promise<Result<ApprovalRequestLookupRead>>((resolve) => { release = resolve; });
    const { panel, lookupApprovalRequest } = await toUncertain({ lookup: () => gate });
    fireEvent.click(checkBtn(panel));
    await within(panel).findByText(/Checking whether a request exists under this key/);
    fireEvent.click(checkBtn(panel));
    fireEvent.click(checkBtn(panel));
    expect(lookupApprovalRequest).toHaveBeenCalledTimes(1);
    expect(checkBtn(panel).getAttribute("aria-disabled")).toBe("true");
    release(lookupResult({ ...LOOKUP.none, request_key: sentKey() }));
    await within(panel).findByText(/No request exists under this key/);
  });

  it("a new send clears the earlier answer (it was about the earlier answer)", async () => {
    let attempt = 0;
    const { panel } = await toUncertain({
      create: () => (++attempt === 1 ? { kind: "failed", status: "unavailable", reason: "never reached", offline: true } : { kind: "replayed", approvalId: "apr_X", subjectLabel: "a", status: "PENDING", slaDueAt: null, policyVersion: null, quorumRequired: null, requester: null }),
      lookup: forKey(LOOKUP.none),
    });
    fireEvent.click(checkBtn(panel));
    await within(panel).findByText(/No request exists under this key/);
    fireEvent.click(within(panel).getByRole("button", { name: "Retry with the same key" }));
    await screen.findByRole("status", { name: "Request already created" });
    expect(screen.queryByText(/No request exists under this key/)).toBeNull();
  });

  it("the discard question hides the answer and keeps the warning", async () => {
    const { panel } = await toUncertain({ lookup: forKey(LOOKUP.none) });
    fireEvent.click(checkBtn(panel));
    await within(panel).findByText(/No request exists under this key/);
    fireEvent.click(within(panel).getByRole("button", { name: "Discard" }));
    expect(within(panel).getByRole("alertdialog", { name: "Discard this uncertain request?" })).toBeTruthy();
    expect(panel.querySelector(".exec-rq-check")).toBeNull();
  });
});

describe("the alpha scope label", () => {
  it("prints the server's WORKSPACE_ALL_COMPLETED_RUNS as words, and nothing when none was published", async () => {
    const withScope = port({ eligibility: "admin_with_r2_read" });
    mount(withScope.api);
    await screen.findByRole("option", { name: "Near Alpha" });
    await waitFor(() => expect(screen.getByText("All completed runs in this workspace")).toBeTruthy());
    expect(screen.queryByText(/All authorized|Your alphas/i)).toBeNull();
    cleanup();
    const without = port();
    mount(without.api);
    await screen.findByRole("option", { name: "Near Alpha" });
    expect(screen.queryByText("All completed runs in this workspace")).toBeNull();
    expect(screen.queryByText("From completed runs")).toBeNull();
  });
});

describe("the run list: server filter and cursor", () => {
  it("the alpha picker is the server's catalog, so an alpha with no run among the first page is still listed", async () => {
    mount(port().api);
    await screen.findByRole("option", { name: "Near Alpha" });
    expect(within(alphaSel()).getAllByRole("option").map((o) => o.textContent)).toEqual(["Pick an alpha", "Far Alpha Beyond Fifty", "Near Alpha"]);
    expect(urls).toEqual(["/api/v1/quantbt/runs?status=COMPLETED&limit=50"]);
  });

  it("picking an alpha asks the server for that alpha's completed runs, then 'Load more runs' follows the cursor", async () => {
    mount(port().api);
    await screen.findByRole("option", { name: "Near Alpha" });
    fireEvent.change(alphaSel(), { target: { value: "alpha_far" } });
    await screen.findByRole("option", { name: /run_alpha_far_1/ });
    expect(urls.at(-1)).toBe("/api/v1/quantbt/runs?status=COMPLETED&alpha=alpha_far&limit=50");
    expect(screen.getByTestId("run-count").textContent).toBe("Newest 2 of 3 completed runs. If yours is missing, type its id below.");
    fireEvent.click(screen.getByRole("button", { name: "Load more runs" }));
    await screen.findByRole("option", { name: /run_alpha_far_3/ });
    expect(urls.at(-1)).toBe("/api/v1/quantbt/runs?status=COMPLETED&alpha=alpha_far&limit=50&cursor=far1");
    expect(screen.queryByRole("button", { name: "Load more runs" })).toBeNull();
    expect(within(runSel()).getAllByRole("option")).toHaveLength(4);
  });

  it("Load more runs is single-flight and says why it is down while it loads", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    runsAnswer = (url) => {
      if (url.includes("cursor=far1")) return gate.then(() => page([run(3, "alpha_far", "Far Alpha Beyond Fifty")], { filtered: 3 }));
      if (url.includes("alpha=alpha_far")) return page([run(1, "alpha_far", "Far Alpha Beyond Fifty")], { next: "far1", filtered: 3 });
      return page([run(1, "alpha_near", "Near Alpha")]);
    };
    // fetch must resolve a promise body, so wrap it.
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return new Response(JSON.stringify(await runsAnswer(String(input))), { status: 200, headers: { "content-type": "application/json" } });
    });
    mount(port().api);
    await screen.findByRole("option", { name: "Near Alpha" });
    fireEvent.change(alphaSel(), { target: { value: "alpha_far" } });
    const more = await screen.findByRole("button", { name: "Load more runs" });
    fireEvent.click(more);
    const busy = await screen.findByRole("button", { name: "Loading runs…" });
    expect(busy.getAttribute("aria-disabled")).toBe("true");
    expect(document.getElementById(busy.getAttribute("aria-describedby")!)!.textContent).toBe("The next page is loading.");
    fireEvent.click(busy);
    fireEvent.click(busy);
    expect(urls.filter((u) => u.includes("cursor="))).toHaveLength(1);
    release();
    await screen.findByRole("option", { name: /run_alpha_far_3/ });
  });

  it("a catalog-less body (an older double) derives the picker from the loaded runs and says so", async () => {
    runsAnswer = () => ({ items: [run(1, "alpha_near", "Near Alpha")] });
    mount(port().api);
    await screen.findByRole("option", { name: "Near Alpha" });
    expect(screen.getByText(/Alphas of the loaded runs only/).getAttribute("title")).toContain("did not publish its alpha list");
  });

  it("the write-safety rules of the form hold with the new reads: Enter in an id field never submits", async () => {
    const { api, createApprovalRequest } = port();
    mount(api);
    await fillNear();
    const handle = screen.getByRole("textbox", { name: "Alpha id" });
    fireEvent.keyDown(handle, { key: "Enter" });
    fireEvent.submit(handle.closest("form")!);
    expect(createApprovalRequest).not.toHaveBeenCalled();
  });
});
