// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReportRoute } from "./ReportRoute";
import { ReleaseCandidateRoute, ReleaseCandidatePackRoute } from "./ReleaseCandidateRoute";
import { LinkedAuditConsumer } from "./LinkedAuditConsumer";
import { linkedAuditApi, type LinkedAuditRead } from "./linkedAuditClient";
import { compose, libraryPage, libraryRow } from "./runStates.fixture";
import { clearRunStatusCache } from "./useRunStatus";
import { forgetHeldReports } from "./useReport";
import { linkFromLocation } from "./reportClient";
import { releaseCandidatePackHref } from "./releaseCandidateClient";
import { reportHref, withWorkspace } from "./runLinks";

vi.mock("../auth/authApi", async original => ({ ...await original<typeof import("../auth/authApi")>(), csrfTokenFromCookie: () => "csrf_test" }));
const base = join(process.cwd(), "../../../packages/contracts/fixtures");
const fixture = (name: string) => JSON.parse(readFileSync(join(base, name), "utf8"));
const auditFixture = (state: string): LinkedAuditRead => fixture(`research-final-audit.${state}.valid.json`);
const report = fixture("research-report.wfo-retained.valid.json");
const RUN: string = report.run_id;
const WS = "ws_member", OTHER = "ws_other";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const problem = (status: number) => json({ error: { code: "RESEARCH_REPORT_NOT_FOUND", message: "PRIVATE SOURCE PATH" }, request_id: "req_test" }, status);
beforeEach(() => { clearRunStatusCache(); forgetHeldReports(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function Navigator() {
  const navigate = useNavigate();
  return <button onClick={() => navigate(`?workspace_id=${OTHER}`)}>Change scope</button>;
}
function route(url: string) {
  return render(<MemoryRouter initialEntries={[url]}><Navigator /><Routes>
    <Route path="/research/quantbt/runs/:runId/report" element={<ReportRoute />} />
    <Route path="/research/quantbt/runs/:runId/release-candidate" element={<ReleaseCandidateRoute />} />
    <Route path="/research/quantbt/release-candidates/:releaseCandidateId" element={<ReleaseCandidatePackRoute />} />
  </Routes></MemoryRouter>);
}

describe("workspace S09/S11 product route binding", () => {
  it("links preserve only explicit scope alongside revision/query/hash; default stays default", () => {
    const link = linkFromLocation("#stage=claim&fold=2", `?workspace_id=${WS}`);
    expect(reportHref(RUN, link)).toContain(`?workspace_id=${WS}#`);
    expect(withWorkspace("/report?report_revision=r1#fold=2", WS)).toBe(`/report?report_revision=r1&workspace_id=${WS}#fold=2`);
    expect(releaseCandidatePackHref("rc_test", WS)).toContain(`?workspace_id=${WS}`);
    expect(withWorkspace("//foreign/report", WS)).toBe("//foreign/report");
    expect(reportHref(RUN)).not.toContain("workspace_id");
  });
  it("S09 scopes status/detail/export and links; switching workspace sends no prior ETag or report", async () => {
    const calls: { url: URL; init?: RequestInit }[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = new URL(String(input), "http://local"); calls.push({ url, init });
      if (url.searchParams.get("workspace_id") !== WS) return problem(404);
      if (url.pathname.endsWith("/report")) return json(report);
      if (url.pathname.endsWith("/final-audit")) return problem(409);
      if (url.pathname.endsWith("/exports")) return problem(503);
      return json(libraryPage([libraryRow("COMPLETED", { runId: RUN, sealed: true })]));
    });
    route(`/research/quantbt/runs/${RUN}/report?workspace_id=${WS}`);
    await waitFor(() => expect(document.querySelector("[data-report-revision]")?.getAttribute("data-report-revision")).toBe(report.report_revision));
    for (const action of ["release-candidate", "back-to-hub", "back-to-execute"])
      expect(document.querySelector(`[data-action="${action}"]`)?.getAttribute("href")).toContain(`workspace_id=${WS}`);
    expect(document.querySelector("[data-evidence-href]")?.getAttribute("href")).toContain(`workspace_id=${WS}`);
    expect(calls.every(c => c.url.searchParams.get("workspace_id") === WS)).toBe(true);
    fireEvent.click(screen.getByText("Change scope"));
    await waitFor(() => expect(calls.some(c => c.url.searchParams.get("workspace_id") === OTHER)).toBe(true));
    expect(document.querySelector("[data-audit-proof]")).toBeNull();
    const foreign = calls.filter(c => c.url.searchParams.get("workspace_id") === OTHER);
    expect(foreign.every(c => !new Headers(c.init?.headers).has("if-none-match"))).toBe(true);
    expect(document.body.textContent).not.toContain("PRIVATE SOURCE PATH");
  });
  it("S11 scopes compose/status/publication and carries scope on pack navigation", async () => {
    const body = compose("sealed");
    const calls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async input => {
      const url = new URL(String(input), "http://local"); calls.push(url.href);
      if (url.pathname.endsWith("/release-candidate")) return json(body);
      if (url.pathname.endsWith("/runs")) return json(libraryPage([libraryRow("COMPLETED", { runId: body.run_id, sealed: true })]));
      return problem(409);
    });
    route(`/research/quantbt/runs/${body.run_id}/release-candidate?workspace_id=${WS}`);
    await waitFor(() => expect(document.querySelector("[data-panel=sealed]")).not.toBeNull());
    expect(calls.every(c => new URL(c).searchParams.get("workspace_id") === WS)).toBe(true);
    expect(document.querySelector("[data-action=open-pack]")?.getAttribute("href")).toContain(`workspace_id=${WS}`);
    expect(document.querySelector("[data-action=run-report]")?.getAttribute("href")).toContain(`workspace_id=${WS}`);
  });
  it("#pack redirect binds pack/publication to explicit workspace without inventing a scope", async () => {
    const pack = fixture("research-release-candidate.consumer.fixtures.json").pack;
    const calls: URL[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async input => {
      const url = new URL(String(input), "http://local"); calls.push(url);
      return url.pathname.endsWith(pack.release_candidate_id) ? json(pack) : problem(409);
    });
    route(`/research/quantbt/runs/${pack.run_id}/release-candidate?workspace_id=${WS}#pack=${pack.release_candidate_id}`);
    await waitFor(() => expect(document.querySelector('[data-rc-mode="pack"]')).not.toBeNull());
    expect(calls.every(c => c.searchParams.get("workspace_id") === WS)).toBe(true);
    expect(document.querySelector('[data-action="open-composition"]')?.getAttribute("href")).toContain(`workspace_id=${WS}`);
  });
});

describe("linked audit explicit generated consumer", () => {
  it("mount/re-read never POST; confirmed double click has one intent and exact original target", async () => {
    const body = auditFixture("ready_to_admit");
    const requests: { method: string; init?: RequestInit }[] = [];
    let answer: ((value: Response) => void) | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      requests.push({ method: init?.method ?? "GET", init });
      return init?.method === "POST" ? new Promise<Response>(resolve => { answer = resolve; }) : json(body);
    });
    render(<MemoryRouter><LinkedAuditConsumer runId={body.parent_run_id} workspaceId={WS} /></MemoryRouter>);
    const start = await screen.findByText("Run pinned audit");
    expect(requests.map(x => x.method)).toEqual(["GET"]);
    fireEvent.click(start); expect(requests).toHaveLength(1);
    const confirm = screen.getByText("Confirm pinned audit"); fireEvent.click(confirm); fireEvent.click(confirm);
    await waitFor(() => expect(requests.filter(x => x.method === "POST")).toHaveLength(1));
    const write = requests.find(x => x.method === "POST")!;
    expect(JSON.parse(String(write.init?.body))).toEqual({ client_intent_id: expect.stringMatching(/^audit:/), target_digest: body.target_digest });
    expect(new Headers(write.init?.headers).get("x-portal-csrf")).toBe("csrf_test");
    answer!(json(auditFixture("queued"), 202));
    await screen.findByText("QUEUED");
    expect(screen.queryByText("Run pinned audit")).toBeNull();
  });
  it.each(["verified", "running", "awaiting_verification", "failed", "cancelled"])("renders %s faithfully without inferring a proof or allocating", async state => {
    const body = auditFixture(state);
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(json(body));
    render(<MemoryRouter><LinkedAuditConsumer runId={body.parent_run_id} workspaceId={WS} readOnly /></MemoryRouter>);
    await screen.findByText(body.state);
    expect(Boolean(document.querySelector("[data-audit-proof]"))).toBe(state === "verified");
    expect(screen.queryByText("Run pinned audit")).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([401, 403, 404, 400, 409, 502, 503])("%s stays typed, secret prose is never shown; no automatic retry", async status => {
    const body = auditFixture("ready_to_admit");
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(problem(status));
    render(<MemoryRouter><LinkedAuditConsumer runId={body.parent_run_id} workspaceId={WS} /></MemoryRouter>);
    await waitFor(() => expect(document.querySelector("[data-audit-refusal]")).not.toBeNull());
    expect(document.body.textContent).not.toContain("PRIVATE SOURCE PATH");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(document.querySelector("[data-audit-proof]")).toBeNull();
  });
  it("rejects a VERIFIED receipt for another parent rather than displaying it", async () => {
    const body = auditFixture("verified"); body.verification!.result.parent_run_id = "rrun_wrong";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json(body));
    await expect(linkedAuditApi.read(body.parent_run_id)).rejects.toMatchObject({ code: "RESEARCH_FINAL_AUDIT_RESPONSE_MISMATCH" });
  });
  it("lost POST response retries the same intent and target, never auto-allocates", async () => {
    const ready = auditFixture("ready_to_admit");
    const intents: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      if (init?.method !== "POST") return json(ready);
      intents.push(String(init.body));
      if (intents.length === 1) throw new TypeError("Lost response");
      return json(auditFixture("queued"), 202);
    });
    render(<MemoryRouter><LinkedAuditConsumer runId={ready.parent_run_id} workspaceId={WS} /></MemoryRouter>);
    fireEvent.click(await screen.findByText("Run pinned audit"));
    fireEvent.click(screen.getByText("Confirm pinned audit"));
    await screen.findByText("Audit service is temporarily unavailable — no verification is inferred.");
    expect(intents).toHaveLength(1);
    fireEvent.click(screen.getByText("Run pinned audit"));
    fireEvent.click(screen.getByText("Confirm pinned audit"));
    await screen.findByText("QUEUED");
    expect(intents).toHaveLength(2);
    expect(intents[1]).toBe(intents[0]);
  });
  it("an obsolete workspace answer cannot become the new reader's proof", async () => {
    const proof = auditFixture("verified");
    let oldAnswer: (value: Response) => void = () => { throw new Error("Old read not started"); };
    vi.spyOn(globalThis, "fetch").mockImplementation(async input => {
      const url = new URL(String(input), "http://local");
      return url.searchParams.get("workspace_id") === WS ? new Promise<Response>(resolve => { oldAnswer = resolve; }) : problem(404);
    });
    const rendered = render(<MemoryRouter><LinkedAuditConsumer runId={proof.parent_run_id} workspaceId={WS} /></MemoryRouter>);
    rendered.rerender(<MemoryRouter><LinkedAuditConsumer runId={proof.parent_run_id} workspaceId={OTHER} /></MemoryRouter>);
    await screen.findByText("Audit not available to this workspace and reader.");
    oldAnswer(json(proof));
    await waitFor(() => expect(document.querySelector("[data-audit-proof]")).toBeNull());
  });
});
