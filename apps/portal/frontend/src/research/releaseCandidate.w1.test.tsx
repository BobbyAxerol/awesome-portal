// @vitest-environment jsdom
/**
 * W1 / G3 — Screen 11 Release Candidate: status faces, the sealed verdict (B2)
 * and the cursor-aware way back (B3).
 *
 * Test data is DERIVED: the composition is the canonical contract fixture
 * through `runStates.fixture` (`compose()`), the Run Library row is
 * `libraryRow()` — only status/seal fields are overridden, no screen text is
 * hand-built here.
 */
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { rcFaceOf } from "./ReleaseCandidateDetail";
import { ReleaseCandidateRoute } from "./ReleaseCandidateRoute";
import { forgetRunLabels } from "./runLabels";
import { compose, libraryPage, libraryRow, type RunStatusWireFixture } from "./runStates.fixture";
import { clearRunStatusCache } from "./useRunStatus";
import { researchState } from "./state";

vi.mock("../auth/authApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../auth/authApi")>()),
  csrfTokenFromCookie: () => "tok_w1",
}));

const RUN = compose("unsealed").run_id;

beforeEach(() => clearRunStatusCache());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  forgetRunLabels();
});

type Library = { kind: "row"; status: RunStatusWireFixture; sealed?: boolean } | { kind: "empty" } | { kind: "fail" };

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function serve(read: { compose: "unsealed" | "sealed" | 404 | 403; library: Library }) {
  const calls: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    calls.push(url);
    const path = url.split("?")[0]!;
    if (/\/api\/v1\/quantbt\/runs$/.test(path)) {
      if (read.library.kind === "fail") return json(503, { error: { code: "X", message: "m" }, request_id: "r" });
      return json(200, libraryPage(read.library.kind === "row" ? [libraryRow(read.library.status, { runId: RUN, sealed: read.library.sealed })] : []));
    }
    if (/\/runs\/[^/]+\/release-candidate$/.test(path)) {
      if (read.compose === 404 || read.compose === 403) {
        return json(read.compose, { error: { code: read.compose === 404 ? "RESEARCH_RELEASE_CANDIDATE_NOT_FOUND" : "RESEARCH_RELEASE_CANDIDATE_FORBIDDEN", message: "SECRET" }, request_id: "r" });
      }
      return json(200, compose(read.compose));
    }
    return json(404, { error: { code: "NOT_STUBBED" } });
  });
  return calls;
}

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/research/quantbt/runs/:runId/release-candidate" element={<ReleaseCandidateRoute />} />
      </Routes>
    </MemoryRouter>,
  );
}

const q = (selector: string) => document.querySelector(selector) as HTMLElement | null;
const exits = () => [...document.querySelectorAll("[data-run-exit-bar] [data-exit]")].map((el) => el.getAttribute("data-exit"));
const COMPOSER_PANELS = ["identity", "pack", "record", "seal", "sealed", "publish", "mirror-ghost", "banner", "meta"];
const noComposer = () => {
  for (const name of COMPOSER_PANELS) expect(q(`[data-panel="${name}"]`), name).toBeNull();
};

describe("W1-S11 status faces", () => {
  it.each([
    ["FAILED", "Failed.", "failed", ["progress", "new-run", "library"]],
    ["CANCELLED", "Cancelled.", "cancelled", ["progress", "new-run", "library"]],
    ["QUEUED", "Queued.", "queued", ["progress", "library"]],
    ["RUNNING", "Running.", "running", ["progress", "library"]],
  ] as const)("W1-S11-%s shows only the line and its exits, never the composer", async (status, banner, phase, expected) => {
    serve({ compose: "unsealed", library: { kind: "row", status } });
    renderAt(`/research/quantbt/runs/${RUN}/release-candidate`);
    await waitFor(() => expect(q("[data-run-exit-bar]")).not.toBeNull());
    expect(q("[data-run-exit-bar] [data-run-phase]")!.textContent).toBe(banner);
    expect(q('[data-screen="release-candidate"]')!.getAttribute("data-run-phase")).toBe(phase);
    expect(exits()).toEqual(expected);
    noComposer();
    /* No Report exit and no RUN REPORT button on a run with no sealed report to open. */
    expect(q('[data-action="run-report"]')).toBeNull();
    expect(document.body.textContent).not.toMatch(/PARTIAL|source gap|DRAFT/);
  });

  it("W1-S11-NOT-FOUND a refused composition is one line and the Library; nothing names the missing run in a link", async () => {
    serve({ compose: 404, library: { kind: "empty" } });
    renderAt(`/research/quantbt/runs/${RUN}/release-candidate`);
    await waitFor(() => expect(q("[data-run-exit-bar]")).not.toBeNull());
    expect(q("[data-run-exit-bar] [data-run-phase]")!.textContent).toBe("Run not available.");
    expect(exits()).toEqual(["library"]);
    noComposer();
    expect(document.body.textContent).not.toContain("denied — nothing from this block");
    expect(document.querySelector(`a[href*="${RUN}"]`)).toBeNull();
    expect(document.body.textContent).not.toContain(RUN);
  });

  it("W1-S11-COMPLETED an unsealed completed run keeps the composer; the face waits for the status, not for a banner", async () => {
    serve({ compose: "unsealed", library: { kind: "row", status: "COMPLETED" } });
    renderAt(`/research/quantbt/runs/${RUN}/release-candidate`);
    await waitFor(() => expect(q('[data-screen="release-candidate"]')!.getAttribute("data-run-phase")).toBe("completed"));
    expect(q("[data-run-exit-bar]")).toBeNull();
    expect(q('[data-panel="seal"]')).not.toBeNull();
  });

  it("W1-S11-SEALED a sealed candidate never waits for, or yields to, the library read", async () => {
    /* The library read never answers; the sealed composition draws at once. */
    const calls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      calls.push(url);
      if (/\/api\/v1\/quantbt\/runs\?/.test(url) || /\/api\/v1\/quantbt\/runs$/.test(url.split("?")[0]!)) return new Promise<Response>(() => {});
      if (/\/release-candidate$/.test(url.split("?")[0]!)) return json(200, compose("sealed"));
      return json(404, { error: { code: "NOT_STUBBED" } });
    });
    renderAt(`/research/quantbt/runs/${RUN}/release-candidate`);
    await waitFor(() => expect(q('[data-panel="sealed"]')).not.toBeNull());
    expect(q("[data-run-exit-bar]")).toBeNull();
  });

  it("W1-S11-UNREAD a library that cannot be read concludes nothing: the composition is drawn", async () => {
    serve({ compose: "unsealed", library: { kind: "fail" } });
    renderAt(`/research/quantbt/runs/${RUN}/release-candidate`);
    await waitFor(() => expect(q('[data-screen="release-candidate"]')!.getAttribute("data-run-phase")).toBe("completed"));
  });

  it("rcFaceOf is a lookup of two served facts", () => {
    const c = compose("unsealed");
    const available = researchState({ kind: "ok", rowCount: 1 });
    expect(rcFaceOf(c, available, { state: "idle" }).kind).toBe("hold");
    expect(rcFaceOf(c, available, { state: "unread" }).kind).toBe("composer");
    expect(rcFaceOf(compose("sealed"), available, { state: "idle" }).kind).toBe("composer");
    expect(rcFaceOf(compose("sealed"), available, { state: "listed", status: "FAILED", sealed: true, label: null, attemptId: null, legacy: false }).kind).toBe("composer");
    expect(rcFaceOf(c, available, { state: "listed", status: "FAILED", sealed: false, label: null, attemptId: null, legacy: false }).kind).toBe("exit");
  });
});

describe("W1-S11 B2 the sealed verdict", () => {
  it("a sealed candidate prints no gate verdict (it was composed before the seal and says 'blocked')", async () => {
    serve({ compose: "sealed", library: { kind: "row", status: "COMPLETED", sealed: true } });
    renderAt(`/research/quantbt/runs/${RUN}/release-candidate`);
    await waitFor(() => expect(q('[data-panel="sealed"]')).not.toBeNull());
    expect(q("[data-verdict-title]")).toBeNull();
    expect(q('[data-panel-part="verdict"]')).toBeNull();
    expect(document.body.textContent).not.toMatch(/local seal blocked/i);
    expect(q("[data-state-chip]")!.getAttribute("data-state-chip")).toBe("SEALED");
  });

  it("an unsealed draft keeps the verdict: the title is visible, the body is the tooltip, the label says when it was composed", async () => {
    serve({ compose: "unsealed", library: { kind: "row", status: "COMPLETED" } });
    renderAt(`/research/quantbt/runs/${RUN}/release-candidate`);
    await waitFor(() => expect(q("[data-verdict-title]")).not.toBeNull());
    expect(q("[data-verdict-body]")).toBeNull();
    expect(q("[data-verdict-title]")!.getAttribute("title")).toBe(compose("unsealed").gate_verdict.body);
    expect(q('[data-panel-part="verdict"]')!.getAttribute("title")).toBe("verdict at compose time");
  });
});

describe("W1-S11 B3 cursor-aware links", () => {
  const HASH = "#stage=search&fold=4&trial=351&params=abc";

  it("carries the arriving cursor and ?window= into the hub crumb, the report and the rail; stage is the destination's", async () => {
    serve({ compose: "unsealed", library: { kind: "row", status: "COMPLETED" } });
    renderAt(`/research/quantbt/runs/${RUN}/release-candidate?window=is${HASH}`);
    await waitFor(() => expect(q('[data-screen="release-candidate"]')!.getAttribute("data-run-phase")).toBe("completed"));
    const hub = within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByRole("link", { name: "Evidence" }).getAttribute("href")!;
    expect(hub).toContain(`/runs/${RUN}/evidence?window=is#`);
    for (const part of ["stage=claim", "fold=4", "trial=351", "params=abc"]) expect(hub).toContain(part);
    expect(hub).not.toContain("stage=search");
    const report = q('[data-action="run-report"]')!.getAttribute("href")!;
    expect(report).toContain(`/runs/${RUN}/report?window=is#`);
    expect(report).toContain("fold=4");
    expect(q("[data-rail-node='run']")!.getAttribute("href")).toContain("fold=4");
    expect(q("[data-rail-node='selected_params']")!.getAttribute("href")).toContain("/freeze?window=is#stage=freeze");
  });

  it("opened with no cursor, the way back carries none (never fold=1)", async () => {
    serve({ compose: "unsealed", library: { kind: "row", status: "COMPLETED" } });
    renderAt(`/research/quantbt/runs/${RUN}/release-candidate`);
    await waitFor(() => expect(q('[data-screen="release-candidate"]')!.getAttribute("data-run-phase")).toBe("completed"));
    const hub = within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByRole("link", { name: "Evidence" }).getAttribute("href")!;
    expect(hub).toBe(`/research/quantbt/runs/${RUN}/evidence`);
    expect(q('[data-action="run-report"]')!.getAttribute("href")).toBe(`/research/quantbt/runs/${RUN}/report`);
    expect(document.body.innerHTML).not.toContain("fold=1");
  });

  it("opens Lineage on this run's attempt", async () => {
    serve({ compose: "unsealed", library: { kind: "row", status: "COMPLETED" } });
    renderAt(`/research/quantbt/runs/${RUN}/release-candidate`);
    await waitFor(() => expect(q('[data-screen="release-candidate"]')!.getAttribute("data-run-phase")).toBe("completed"));
    const href = q('[data-action="open-lineage"]')?.getAttribute("href") ?? "";
    expect(href).toContain(`run=${RUN}`);
  });
});
