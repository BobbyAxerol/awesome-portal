/**
 * N29 consumer acceptance (codex handoff 2026-08-31) + the three governance
 * screens' composition. The create flow and the register are tested through
 * the PORT the way the product runs them: success, replay-by-key, duplicate
 * with the existing approval id, typed 422, double-click safety, server-side
 * filters with exact counts, bidirectional cursors, and LAPSED rendered as
 * the blocking finding it is.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../charts/EChart", () => ({
  EChart: ({ id, height }: { id?: string; height: number }) => <div data-echart id={id} data-height={height} />,
}));

import { NewApprovalRequestContainer } from "./screens/NewApprovalRequest";
import { GateLiveReviewContainer } from "./screens/containers";
import { WaiversRegisterContainer } from "./screens/WaiversRegister";
import { reviewRouteFor } from "./screens/ApprovalInbox";
import { createFixtureApi } from "./api/fixtureApi";
import { createHttpApi, CSRF_COOKIE, CSRF_HEADER } from "./api/httpApi";
import type { ExecutionApi } from "./api/ports";
import type { DeliveryPolicy } from "./profile";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const summaryBox = () => screen.getByPlaceholderText(/What this alpha does/);
const submitBtn = () => screen.getByRole("button", { name: /Submit for R1 review|Retry submit/ });

async function fillAndSubmit(alpha?: string, run?: string) {
  if (alpha) fireEvent.change(screen.getByLabelText("Alpha (from the alpha registry)"), { target: { value: alpha } });
  if (run) fireEvent.change(screen.getByLabelText("Evidence run (from the run library)"), { target: { value: run } });
  fireEvent.change(summaryBox(), { target: { value: "Session momentum with venue-calendar guards." } });
  await act(async () => {
    fireEvent.click(submitBtn());
  });
}

describe("loop entry — the create consumer", () => {
  it("creates: PENDING row facts, SLA, SoD sentence, Inbox link", async () => {
    render(<NewApprovalRequestContainer api={createFixtureApi()} />);
    await fillAndSubmit("vnmomo", "run_5320");
    expect(await screen.findByText(/Request created/)).toBeTruthy();
    expect(screen.getByText(/AP-\d+ · R1 · vnmomo · PENDING/)).toBeTruthy();
    expect(screen.getByText(/review due 2026-09-01/)).toBeTruthy();
    expect(screen.getByText(/the requester can never\s+approve/)).toBeTruthy();
    expect(document.querySelector('a[href="/governance/approvals"]')).toBeTruthy();
  });

  it("rejects duplicate open alpha × run WITH the existing approval id, linked", async () => {
    render(<NewApprovalRequestContainer api={createFixtureApi()} />);
    await fillAndSubmit("carry", "run_5512");
    expect(await screen.findByText(/Open work already exists/)).toBeTruthy();
    expect(document.querySelector('a[href="/governance/approvals/AP-201/r1"]')?.textContent).toContain("AP-201");
  });

  it("double-click cannot create two approvals — one port call per intent", async () => {
    const api = createFixtureApi();
    const spy = vi.spyOn(api, "createApprovalRequest");
    render(<NewApprovalRequestContainer api={api} />);
    fireEvent.change(screen.getByLabelText("Alpha (from the alpha registry)"), { target: { value: "vnmomo" } });
    fireEvent.change(summaryBox(), { target: { value: "Session momentum with venue-calendar guards." } });
    await act(async () => {
      const btn = submitBtn();
      fireEvent.click(btn);
      fireEvent.click(btn);
      fireEvent.click(btn);
    });
    await waitFor(() => expect(screen.queryByText(/Request created|Request replayed|Open work already exists/)).toBeTruthy());
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("replays by request key: same payload twice returns the SAME approval, marked", async () => {
    const api = createFixtureApi();
    const input = { requestKey: "rk_test_replay_1", alphaId: "vnmomo", evidenceRunId: "run_5320", methodologyClaimId: "clm_29", summary: "Session momentum with guards." };
    const first = await api.createApprovalRequest(input);
    const second = await api.createApprovalRequest(input);
    expect(first.kind).toBe("created");
    expect(second.kind).toBe("replayed");
    if (first.kind !== "failed" && first.kind !== "duplicate" && second.kind !== "failed" && second.kind !== "duplicate") {
      expect(second.approvalId).toBe(first.approvalId);
    }
  });

  it("a reused key with a CHANGED payload is refused, never silently re-pointed", async () => {
    const api = createFixtureApi();
    const base = { requestKey: "rk_test_conflict_1", alphaId: "vnmomo", evidenceRunId: "run_5320", methodologyClaimId: "clm_29", summary: "Session momentum with guards." };
    await api.createApprovalRequest(base);
    const changed = await api.createApprovalRequest({ ...base, summary: "A different sentence entirely." });
    expect(changed.kind).toBe("failed");
    if (changed.kind === "failed") expect(changed.reason).toContain("REQUEST_KEY_REUSED");
  });

  it("an id the server registry does not know is a typed 422, named", async () => {
    const api = createFixtureApi();
    const out = await api.createApprovalRequest({ requestKey: "rk_test_422", alphaId: "mystery", evidenceRunId: "run_5320", methodologyClaimId: "clm_29", summary: "Long enough summary." });
    expect(out.kind).toBe("failed");
    if (out.kind === "failed") expect(out.reason).toContain("alpha_id mystery");
  });

  it("says the digest is pinned server-side — the form never carries one", () => {
    render(<NewApprovalRequestContainer api={createFixtureApi()} />);
    expect(screen.getByText(/pinned SERVER-side from the run registry/)).toBeTruthy();
    expect(document.querySelector('input[name*="digest" i], [aria-label*="digest" i]')).toBeNull();
  });
});

describe("live gate — its own review room (unchanged backbone)", () => {
  it("LIVE_GATE rows route to /live, not to the R2 composition", () => {
    expect(reviewRouteFor({ id: "AP-311", gate: "LIVE_GATE" })).toBe("/governance/approvals/AP-311/live");
  });

  it("renders the live payload's published truth: canary link, four typed branches, empty live source", async () => {
    render(<GateLiveReviewContainer api={createFixtureApi()} approvalId="AP-311" />);
    expect(await screen.findByText(/Canary Evidence Approval/)).toBeTruthy();
    // canary_ref, not a smoke frame, names the control room
    expect(document.querySelector('a[href="/deployments/live/dep_88/canary"]')).toBeTruthy();
    // the four derived branches arrive typed UNAVAILABLE with their reason codes
    expect(screen.getByText("canary.drift-vs-twin")).toBeTruthy();
    expect(screen.getAllByText(/N23_CANARY_DERIVATION_NOT_PUBLISHED/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/N23_GATE_POLICY_EVALUATION_NOT_PUBLISHED/)).toBeTruthy();
    // a valid empty Live renders EMPTY — never a fixture's numbers
    expect(screen.getByText("EMPTY")).toBeTruthy();
  });

  it("holds the capital step as a typed gap — no number is invented for real money", async () => {
    render(<GateLiveReviewContainer api={createFixtureApi()} approvalId="AP-311" />);
    await screen.findByText(/Canary Evidence Approval/);
    expect(screen.getAllByText(/not published · BR-EX-70/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Approving without it approves the stage grant only/)).toBeTruthy();
    expect(screen.queryByText(/this step 20,000/)).toBeNull();
  });
});


async function awaitRows(min = 1) {
  await waitFor(() => expect(document.querySelectorAll("tr.exec-wv-row").length).toBeGreaterThanOrEqual(min));
}
const registerText = () => document.querySelector(".exec-gate-wvtable")?.textContent ?? "";

describe("waivers — the register consumer", () => {
  it("renders the server page with exact per-state counts from filtered_count probes", async () => {
    render(<WaiversRegisterContainer api={createFixtureApi()} />);
    await awaitRows();
    expect(registerText()).toContain("Capacity at target weight");
    expect(await screen.findByText("4 OPEN")).toBeTruthy();
    expect(screen.getByText("1 EXPIRING")).toBeTruthy();
    expect(screen.getByText("1 LAPSED · BLOCKING")).toBeTruthy();
    expect(screen.getByText("2 WAIVED")).toBeTruthy();
  });

  it("filters are SERVER queries: the page narrows and the exact filtered count follows", async () => {
    const api = createFixtureApi();
    const spy = vi.spyOn(api, "getWaivers");
    render(<WaiversRegisterContainer api={api} />);
    await awaitRows();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "LAPSED" }));
    });
    await waitFor(() => {
      const rows = document.querySelectorAll("tr.exec-wv-row");
      expect(rows.length).toBe(1);
    });
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ state: "LAPSED" }));
    expect(screen.getByText(/1 of 1 in this state/)).toBeTruthy();
    // The LAPSED row is a blocking finding, rendered as one — state and the
    // blocking bit both came from the server row.
    const lapsedRow = document.querySelector('tr[data-state="LAPSED"]');
    expect(lapsedRow?.textContent).toContain("RSI v0.9 re-review evidence window lapsed");
    expect(lapsedRow?.textContent).toContain("BLOCKING");
  });

  it("keyset forward and back walk the register without losing the totals", async () => {
    render(<WaiversRegisterContainer api={createFixtureApi()} />);
    await screen.findByText(/register total 8/);
    const older = screen.getByRole("button", { name: "older →" });
    expect((screen.getByRole("button", { name: "← newer" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => {
      fireEvent.click(older);
    });
    expect(await screen.findByText(/3 of 8 in this state/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "← newer" }) as HTMLButtonElement).disabled).toBe(false);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "← newer" }));
    });
    expect(await screen.findByText(/5 of 8 in this state/)).toBeTruthy();
  });

  it("every row links its source decision through the gate's own route", async () => {
    render(<WaiversRegisterContainer api={createFixtureApi()} />);
    await awaitRows();
    expect(document.querySelector('a[href="/governance/approvals/AP-352/r2"]')).toBeTruthy();
    expect(document.querySelector('a[href="/governance/exit-reviews/EX-771"]')).toBeTruthy();
  });

  it("due clocks count from the SERVER read anchor, and a lapsed clock says so", async () => {
    render(<WaiversRegisterContainer api={createFixtureApi()} />);
    await awaitRows();
    expect(screen.getAllByText(/\d+d \d{2}:\d{2}:\d{2}/).length).toBeGreaterThan(0);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "LAPSED" }));
    });
    // cn_108 due 2026-08-24, read_at 2026-08-31 → lapsed 7d, from server times.
    await waitFor(() => expect(registerText()).toContain("lapsed 7d"));
  });
});

describe("the HTTP consumer — same-origin, CSRF, typed failures", () => {
  const OPEN: DeliveryPolicy = {
    policyRevision: 9,
    queryEnabled: true,
    projectionIngestionEnabled: false,
    sseEnabled: false,
    governanceWriteEnabled: true,
    paperCommandsEnabled: false,
    sandboxCommandsEnabled: false,
    liveProtectiveCommandsEnabled: false,
    liveRiskIncreasingCommandsEnabled: false,
  };
  const INPUT = { requestKey: "rk_http_1", alphaId: "carry", evidenceRunId: "run_5512", methodologyClaimId: "clm_31", summary: "Long enough summary." };

  function api(): ExecutionApi {
    return createHttpApi({ policy: OPEN });
  }

  it("POSTs the create request same-origin with the CSRF header, and no digest field", async () => {
    Object.defineProperty(document, "cookie", { value: `${CSRF_COOKIE}=tok123`, configurable: true });
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ schema_version: "governance.approval-create.v1", replayed: false, approval: { approval_id: "apr_x", subject_label: "carry", status: "PENDING", policy_version: "approval.v3", quorum_required: 1, sla_due_at: "2026-09-01T12:00:00.000Z", requester: { user_id: "u", username: "lan" } } }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const out = await api().createApprovalRequest(INPUT);
    expect(out.kind).toBe("created");
    expect(calls[0].url).toBe("/api/v1/execution/governance/approvals");
    expect(calls[0].init.credentials).toBe("same-origin");
    expect((calls[0].init.headers as Record<string, string>)[CSRF_HEADER]).toBe("tok123");
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.request_key).toBe("rk_http_1");
    expect(JSON.stringify(body)).not.toMatch(/digest/i);
  });

  it("maps DUPLICATE 409 to the duplicate outcome with the existing id", async () => {
    vi.stubGlobal("fetch", async () =>
      new Response(JSON.stringify({ error: { code: "DUPLICATE_OPEN_APPROVAL", message: "Open work exists — decide apr_01J6N29PRODUCT first." }, request_id: "r1" }), { status: 409, headers: { "content-type": "application/json" } }),
    );
    const out = await api().createApprovalRequest(INPUT);
    expect(out.kind).toBe("duplicate");
    if (out.kind === "duplicate") expect(out.existingApprovalId).toBe("apr_01J6N29PRODUCT");
  });

  it("maps a changed-key 409 to a typed refusal, not a duplicate", async () => {
    vi.stubGlobal("fetch", async () =>
      new Response(JSON.stringify({ error: { code: "REQUEST_KEY_CONFLICT", message: "The request key was used with a different payload." }, request_id: "r2" }), { status: 409, headers: { "content-type": "application/json" } }),
    );
    const out = await api().createApprovalRequest(INPUT);
    expect(out.kind).toBe("failed");
    if (out.kind === "failed") expect(out.reason).toContain("REQUEST_KEY_CONFLICT");
  });

  it("types 403 and 422 with the server's own words", async () => {
    for (const [status, code] of [[403, "CSRF_REQUIRED"], [422, "UNKNOWN_REGISTRY_ID"]] as const) {
      vi.stubGlobal("fetch", async () =>
        new Response(JSON.stringify({ error: { code, message: "as stated" }, request_id: "r" }), { status, headers: { "content-type": "application/json" } }),
      );
      const out = await api().createApprovalRequest(INPUT);
      expect(out.kind).toBe("failed");
      if (out.kind === "failed") expect(out.reason).toContain(code);
    }
  });

  it("offline: the thrown fetch keeps the request key story intact", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Failed to fetch");
    });
    const out = await api().createApprovalRequest(INPUT);
    expect(out.kind).toBe("failed");
    if (out.kind === "failed") {
      expect(out.offline).toBe(true);
      expect(out.reason).toContain("SAME request key");
    }
  });

  it("GET waivers carries state and cursor as query params and reads the page", async () => {
    let seenUrl = "";
    vi.stubGlobal("fetch", async (url: string) => {
      seenUrl = url;
      return new Response(JSON.stringify({ schema_version: "governance.conditions-register.v1", read_at: "2026-08-31T12:00:00.000Z", page: { rows: [], total_count: 8, filtered_count: 1, next_cursor: null, prev_cursor: null, has_more: false, has_previous: false } }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const result = await api().getWaivers({ state: "LAPSED", after: "cn_103", limit: 5 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.totalCount).toBe(8);
      expect(result.value.filteredCount).toBe(1);
    }
    expect(seenUrl).toContain("/governance/waivers?");
    expect(seenUrl).toContain("state=LAPSED");
    expect(seenUrl).toContain("after=cn_103");
    expect(seenUrl).toContain("limit=5");
  });
});
