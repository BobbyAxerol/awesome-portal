/**
 * §54 consumer — a KNOWN run whose full Report is not delivered answers 200 `research.report-unavailable.v1`. The screen draws the server's
 * typed absence (no sheet, no metric, no seal, no export), keeps the ETag so a remount revalidates (304), and the sealed-Report path is
 * untouched. Body: the published canonical fixture.
 */
import { cleanup, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReportRoute } from "./ReportRoute";
import { isReportUnavailable, type ReportRead } from "./reportClient";
import { forgetHeldReports } from "./useReport";

vi.mock("./useRunStatus", () => ({
  useRunStatus: () => ({ state: "unread" }),
  setRunStatusSeed: () => undefined,
  clearRunStatusCache: () => undefined,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  forgetHeldReports();
});

const FIXTURE = JSON.parse(readFileSync(join(process.cwd(), "..", "..", "..", "packages", "contracts", "fixtures", "research-report.native-unavailable.valid.json"), "utf8")) as ReportRead;
const RUN = (FIXTURE as { run_id: string }).run_id;

interface Call { url: string; method: string; headers: Record<string, string> }

function serve(answer: (call: Call) => { status: number; body?: unknown }) {
  const calls: Call[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const call = { url: String(input), method: (init?.method ?? "GET").toUpperCase(), headers: (init?.headers ?? {}) as Record<string, string> };
    calls.push(call);
    const { status, body } = answer(call);
    return { ok: status >= 200 && status < 300, status, statusText: String(status), headers: new Headers(), json: async () => body } as unknown as Response;
  });
  return calls;
}

function mount() {
  return render(
    <MemoryRouter initialEntries={[`/research/quantbt/runs/${RUN}/report`]}>
      <Routes>
        <Route path="/research/quantbt/runs/:runId/report" element={<ReportRoute />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("the typed Report absence of a native run", () => {
  it("the canonical fixture is the absence variant, narrowed by schema_version", () => {
    expect(isReportUnavailable(FIXTURE)).toBe(true);
  });

  it("draws the server's absence — banner, reason code, profile and run id — with no sheet, no metric and no export", async () => {
    const calls = serve(() => ({ status: 200, body: FIXTURE }));
    const { container } = mount();
    await waitFor(() => expect(container.querySelector("[data-report-unavailable]")).not.toBeNull());
    const root = container.querySelector('[data-screen="run-report"]')!;
    expect(root.getAttribute("data-report-unavailable")).toBe("NATIVE_REPORT_NOT_DELIVERED");
    expect(root.getAttribute("data-report-state")).toBe("empty");
    expect(container.textContent).toContain("A full Report is not delivered for this recipe.");
    const banner = container.querySelector("[data-run-exit-bar] [data-run-phase]")!;
    expect(banner.getAttribute("title")).toContain("NATIVE_REPORT_NOT_DELIVERED");
    expect(banner.getAttribute("title")).toContain((FIXTURE as { execution_profile: { id: string } }).execution_profile.id);
    expect(container.querySelector("[data-run-chip]")).not.toBeNull();
    /* nothing of a sealed sheet, and no way to export one */
    expect(container.querySelector('[data-panel="passport"]')).toBeNull();
    expect(container.querySelector("[data-export-format], [data-action^='export']")).toBeNull();
    expect(calls.filter((c) => c.method !== "GET")).toHaveLength(0);
    expect(calls.filter((c) => /\/report(\?|$)/.test(c.url))).toHaveLength(1);
    /* the way on: Progress, Evidence hub, Library */
    expect([...container.querySelectorAll("[data-exit]")].map((node) => node.getAttribute("data-exit"))).toEqual(["progress", "hub", "library"]);
  });

  it("a remount revalidates with the absence's own ETag and a 304 keeps the same face", async () => {
    const etag = (FIXTURE as { etag: string }).etag;
    const calls = serve((call) => (call.headers["If-None-Match"] === etag ? { status: 304 } : { status: 200, body: FIXTURE }));
    const first = mount();
    await waitFor(() => expect(first.container.querySelector("[data-report-unavailable]")).not.toBeNull());
    first.unmount();
    const second = mount();
    await waitFor(() => expect(second.container.querySelector("[data-report-unavailable]")).not.toBeNull());
    const reads = calls.filter((c) => /\/report(\?|$)/.test(c.url));
    expect(reads).toHaveLength(2);
    expect(reads[1]!.headers["If-None-Match"]).toBe(etag);
  });

  it("a 404 for an unknown or foreign run stays the typed refusal, not an absence", async () => {
    serve(() => ({ status: 404, body: { error: { code: "RESEARCH_REPORT_NOT_FOUND", message: "x" } } }));
    const { container } = mount();
    await waitFor(() => expect(container.querySelector('[data-screen="run-report"]')?.getAttribute("data-report-state")).not.toBe("loading"));
    expect(container.querySelector("[data-report-unavailable]")).toBeNull();
  });
});
