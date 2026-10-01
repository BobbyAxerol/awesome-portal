/**
 * Batch F1 · S03 honesty (FG 03-T, X7, 03-M, CG-P10-04).
 *
 * Bodies come from the committed fixtures — the progress read and console page
 * from `e2e/research-foundation`, the run identity (`planned-folds`) and the
 * fold selection (`wfo-selection`) from `packages/contracts/fixtures` — and are
 * overlaid, never re-typed.
 *
 *  - FG 03-T  the transport indicator said "stream closed at terminal frame"
 *             while loading and after a 503 / 409 / 400.
 *  - X7       console and events reads sent no `workspace_id`; the route passed
 *             none to the hook.
 *  - 03-M     `IMPORTED_FIXED_PROFILE` printed a per-fold "study N / M" line.
 *  - CG-P10-04 the study and rate absences printed literal sentences, not the
 *             server's reason code.
 */
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  RunProgress,
  SSE_CLOSED,
  SSE_LIVE,
  SSE_NEVER_OPENED,
  SSE_POLL,
  SSE_RESTING,
  SSE_WAITING,
  sseRefused,
  transportFace,
} from "./RunProgress";
import { RunProgressRoute } from "./RunProgressRoute";
import { isFixedProfileScope } from "./StageLedger";
import {
  progressApi,
  toProgressRefusal,
  type ConsolePage,
  type FoldSelection,
  type ProgressRead,
  type ProgressRefusal,
} from "./progressClient";
import { PortalApiError } from "../lib/api";
import { researchState } from "./state";

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const json = <T,>(path: string): T => JSON.parse(readFileSync(join(ROOT, path), "utf8")) as T;

const BASE = json<ProgressRead>("apps/portal/frontend/e2e/research-foundation/progress-read.json");
const CONSOLE = json<ConsolePage>("apps/portal/frontend/e2e/research-foundation/progress-console.json");
const IDENTITY = json<NonNullable<ProgressRead["run"]>>("packages/contracts/fixtures/research-progress.planned-folds.valid.json");
const SELECTION = json<FoldSelection>("packages/contracts/fixtures/research-progress.wfo-selection.valid.json");
const RUN_ID = BASE.run_id;

afterEach(cleanup);

/* ----------------------------------------------------------------- helpers */

const refusal = (status: number, code: string | null = null): ProgressRefusal =>
  toProgressRefusal(new PortalApiError("refused", status, code, null));

function withStatus(status: "COMPLETED" | "FAILED" | "CANCELLED" | "RUNNING"): ProgressRead {
  return { ...BASE, current: { ...BASE.current, effective_status: status, may_cancel: false } };
}

function face(overrides: Partial<Parameters<typeof transportFace>[0]> = {}) {
  return transportFace({
    transport: "closed",
    live: true,
    status: "RUNNING",
    availability: "AVAILABLE",
    sourceTerminal: false,
    refusal: null,
    ...overrides,
  });
}

function view(overrides: Partial<React.ComponentProps<typeof RunProgress>> = {}) {
  const r = overrides.read === undefined ? BASE : overrides.read;
  return render(
    <MemoryRouter>
      <RunProgress
        runId={RUN_ID}
        read={r}
        snapshot={r?.progress ?? null}
        state={researchState({ kind: "ok", rowCount: 1 })}
        transport="closed"
        lines={[]}
        linesDropped={false}
        onLoadOlder={vi.fn()}
        foldCursor={null}
        onPinFold={vi.fn()}
        cancelling={false}
        onCancel={vi.fn()}
        {...overrides}
      />
    </MemoryRouter>,
  );
}

const dot = () => document.querySelector("[data-transport]") as HTMLElement;

/* ============================================================== FG 03-T */

describe("FG 03-T — the transport words follow what is true of the transport", () => {
  it("loading: no read yet, none refused — not 'closed at terminal frame'", () => {
    view({ read: null, snapshot: null, state: researchState({ kind: "in-flight", hasAcceptedResponse: false }) });
    expect(dot().textContent).toBe(SSE_WAITING);
    expect(dot().getAttribute("data-transport-state")).toBe("waiting");
    expect(dot().textContent).not.toBe(SSE_CLOSED);
  });

  it.each([
    [503, "no stream · server unavailable (503)"],
    [409, "stream closed · the run's state moved (409)"],
    [400, "no stream · request refused (400)"],
    [403, "no stream · access refused (403)"],
  ])("a first read refused with %i says so, with the status the server gave", (status, label) => {
    expect(sseRefused(refusal(status))).toBe(label);
    expect(face({ status: null, live: false, refusal: refusal(status) })).toEqual({ state: "refused", label });
  });

  it("a request that never reached the server says the server did not answer", () => {
    const unreachable = toProgressRefusal(new Error("fetch failed"));
    expect(face({ status: null, live: false, refusal: unreachable }).label).toBe("no stream · the server did not answer");
  });

  it("renders the refused words on the screen after a 503 on the first read (never the terminal words)", () => {
    view({
      read: null,
      snapshot: null,
      refusal: refusal(503),
      state: researchState({ kind: "transport", status: 503, retryable: true }),
    });
    expect(dot().textContent).toBe("no stream · server unavailable (503)");
    expect(dot().getAttribute("data-transport-state")).toBe("refused");
    expect(document.body.textContent).not.toContain(SSE_CLOSED);
  });

  it("a final run is closed at its terminal frame — also when a later console read was refused", () => {
    for (const status of ["COMPLETED", "FAILED", "CANCELLED"] as const) {
      expect(face({ status, live: false })).toEqual({ state: "terminal", label: SSE_CLOSED });
      expect(face({ status, live: false, refusal: refusal(503) }).label).toBe(SSE_CLOSED);
    }
    view({ read: withStatus("COMPLETED") });
    expect(dot().textContent).toBe(SSE_CLOSED);
    expect(dot().getAttribute("data-transport-state")).toBe("terminal");
  });

  it("the source's terminal frame ends it before the Portal's status does", () => {
    expect(face({ status: "RUNNING", live: false, sourceTerminal: true }).label).toBe(SSE_CLOSED);
  });

  it("a run cancelled before its source reported never had a terminal frame to close at", () => {
    expect(face({ status: "CANCELLED", live: false, availability: "CANCELLED_BEFORE_SOURCE" })).toEqual({
      state: "never-opened",
      label: SSE_NEVER_OPENED,
    });
  });

  it("a live run keeps the transport's own label — stream, dropped, resting", () => {
    expect(face({ transport: "stream" })).toEqual({ state: "stream", label: SSE_LIVE });
    expect(face({ transport: "poll" })).toEqual({ state: "poll", label: SSE_POLL });
    expect(face({ transport: "closed" })).toEqual({ state: "closed", label: SSE_RESTING });
  });

  it("a retryable refusal on a live read does not claim the stream is refused: the floor is still running", () => {
    expect(face({ transport: "poll", refusal: refusal(503) }).label).toBe(SSE_POLL);
    expect(face({ transport: "stream", refusal: refusal(409) }).label).toBe(SSE_LIVE);
  });

  it("a refusal that stops the floor is said (409 on a read that exists, transport not carrying)", () => {
    expect(face({ transport: "closed", refusal: refusal(409) })).toEqual({
      state: "refused",
      label: "stream closed · the run's state moved (409)",
    });
    expect(face({ transport: "closed", refusal: refusal(400) }).label).toBe("no stream · request refused (400)");
  });
});

/* ================================================================== X7 */

describe("X7 — console and events reads carry the workspace like read does", () => {
  let fetched: string[] = [];
  beforeEach(() => {
    fetched = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        fetched.push(url);
        const body = url.includes("/console") ? CONSOLE : { ...BASE, run: IDENTITY };
        return { ok: true, status: 200, statusText: "", headers: { get: () => null }, json: async () => body } as unknown as Response;
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("builds the console URL with workspace_id, encoded, after the bounded page", async () => {
    await progressApi.console(RUN_ID, 40, "ws probe/1");
    expect(fetched).toEqual([`/api/v1/research/runs/${RUN_ID}/console?after_seq=40&limit=500&workspace_id=ws%20probe%2F1`]);
  });

  it("leaves the console and stream URLs exactly as before when no workspace is named", async () => {
    await progressApi.console(RUN_ID, 40);
    expect(fetched).toEqual([`/api/v1/research/runs/${RUN_ID}/console?after_seq=40&limit=500`]);
    expect(progressApi.streamUrl(RUN_ID, 40)).toBe(`/api/v1/research/runs/${RUN_ID}/events?after_seq=40`);
    expect(progressApi.streamUrl(RUN_ID, null)).toBe(`/api/v1/research/runs/${RUN_ID}/events`);
  });

  it("builds the events URL with workspace_id, with and without a resume cursor", () => {
    expect(progressApi.streamUrl(RUN_ID, 40, "ws_probe")).toBe(`/api/v1/research/runs/${RUN_ID}/events?after_seq=40&workspace_id=ws_probe`);
    expect(progressApi.streamUrl(RUN_ID, null, "ws_probe")).toBe(`/api/v1/research/runs/${RUN_ID}/events?workspace_id=ws_probe`);
  });

  it("the route hands the link's ?workspace_id= to the snapshot, the console and the stream", async () => {
    const urls: string[] = [];
    class Stream {
      constructor(readonly url: string) {
        urls.push(url);
      }
      addEventListener() {}
      close() {}
      onmessage = null;
      onerror = null;
    }
    vi.stubGlobal("EventSource", Stream as unknown as typeof EventSource);
    render(
      <MemoryRouter initialEntries={[`/research/quantbt/runs/${RUN_ID}/progress?workspace_id=ws_probe`]}>
        <Routes>
          <Route path="/research/quantbt/runs/:runId/progress" element={<RunProgressRoute />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(fetched.some((url) => url.includes("/console"))).toBe(true));
    await waitFor(() => expect(urls.length).toBeGreaterThan(0));

    const progress = fetched.find((url) => url.includes("/progress"));
    expect(progress).toBe(`/api/v1/research/runs/${RUN_ID}/progress?workspace_id=ws_probe`);
    expect(fetched.find((url) => url.includes("/console"))).toContain("&workspace_id=ws_probe");
    expect(urls[0]).toContain("workspace_id=ws_probe");
  });

  it("without ?workspace_id= nothing is added or guessed", async () => {
    vi.stubGlobal("EventSource", undefined);
    render(
      <MemoryRouter initialEntries={[`/research/quantbt/runs/${RUN_ID}/progress`]}>
        <Routes>
          <Route path="/research/quantbt/runs/:runId/progress" element={<RunProgressRoute />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(fetched.some((url) => url.includes("/console"))).toBe(true));
    expect(fetched.every((url) => !url.includes("workspace_id"))).toBe(true);
  });
});

/* ================================================================ 03-M */

describe("03-M — an imported fixed profile is a fixed profile", () => {
  const imported: FoldSelection = { ...SELECTION, scope: "IMPORTED_FIXED_PROFILE", objective: null, objective_kind: undefined };

  it("classifies every scope the generated union has", () => {
    expect(isFixedProfileScope("FIXED_PROFILE")).toBe(true);
    expect(isFixedProfileScope("IMPORTED_FIXED_PROFILE")).toBe(true);
    expect(isFixedProfileScope(SELECTION.scope)).toBe(false);
    expect(isFixedProfileScope(null)).toBe(false);
    expect(isFixedProfileScope(undefined)).toBe(false);
  });

  const withScope = (selection: FoldSelection): ProgressRead => ({
    ...BASE,
    run: IDENTITY,
    progress: {
      ...BASE.progress!,
      folds: BASE.progress!.folds.map((fold) => ({ ...fold, selection })),
    },
  });

  it("the study line says 'fixed profile — no search' for an imported run, not 'study 3 / 2'", () => {
    view({ read: withScope(imported) });
    expect(document.querySelector("[data-study]")?.textContent).toBe("study fixed profile — no search");
  });

  it("matches a built-in fixed profile word for word, and a global study still reads global", () => {
    cleanup();
    view({ read: withScope({ ...imported, scope: "FIXED_PROFILE" }) });
    expect(document.querySelector("[data-study]")?.textContent).toBe("study fixed profile — no search");
    cleanup();
    view({ read: withScope(SELECTION) });
    expect(document.querySelector("[data-study]")?.textContent).toBe(`study global — scores all ${IDENTITY.declared_folds.count} folds`);
  });

  it("the Stage log marks an imported fold '1 · fixed' like a built-in one", () => {
    view({ read: withScope(imported) });
    fireEvent.click(document.querySelector("[data-tab='stage']")!);
    const cell = document.querySelector("[data-ledger-trials='1']") as HTMLElement;
    expect(cell.textContent).toBe("1 · fixed");
  });
});

/* ========================================================= CG-P10-04 */

describe("CG-P10-04 — absences carry the server's code, not a sentence the page wrote", () => {
  const undeclared = (code: "P08_TOPOLOGY_DID_NOT_DECLARE_FOLDS" | null): ProgressRead => ({
    ...BASE,
    run: { ...IDENTITY, declared_folds: { state: "NOT_PUBLISHED", count: null, reason_code: code } },
    progress: {
      ...BASE.progress!,
      folds: BASE.progress!.folds.map((fold) => ({ ...fold, selection: undefined })),
    },
  });

  it("an undeclared fold count shows the served reason code, not 'The fold count is not declared.'", () => {
    view({ read: undeclared("P08_TOPOLOGY_DID_NOT_DECLARE_FOLDS") });
    const absence = document.querySelector("[data-study] [data-not-published]") as HTMLElement;
    expect(absence.textContent).toBe("not published");
    expect(absence.getAttribute("title")).toBe("P08_TOPOLOGY_DID_NOT_DECLARE_FOLDS");
    expect(document.body.textContent).not.toContain("The fold count is not declared");
  });

  it("says nothing it was not told when the server sent no code", () => {
    view({ read: undeclared(null) });
    const absence = document.querySelector("[data-study] [data-not-published]") as HTMLElement;
    expect(absence.getAttribute("title")).toBeNull();
  });

  it("the trial rate is a short absence: no field is published, and no sentence is invented about why", () => {
    view();
    const rate = document.querySelector("[data-rate]") as HTMLElement;
    expect(rate.textContent).toBe("rate not published");
    expect(rate.querySelector("[data-not-published]")?.getAttribute("title")).toBeNull();
    expect(document.body.textContent).not.toContain("derived from its trial rate");
    /* Nothing was computed from trials and elapsed time to stand in for it. */
    expect(rate.textContent).not.toMatch(/\d/);
  });
});
