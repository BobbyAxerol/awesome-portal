/**
 * P11 consumer tests — Screen 03 Run Progress.
 *
 * The claims that carry this phase are the ones a screenshot cannot settle:
 *
 *  - **The stream is an accelerator, the poll is the floor.** The screen has to
 *    be correct with no SSE at all.
 *  - **A stream that must stop, stops.** Native EventSource reconnects forever;
 *    against a 401 or a typed gap that is a loop nobody sees until it is a bill.
 *  - **Nothing local creates a fact.** No timer, animation or console line may
 *    produce a completion, an artifact, a claim, a counter or an ETA.
 */
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ARTIFACT_NO_READER,
  NOT_ISSUED_NOTE,
  NO_CLAIM_NOTE,
  notIssuedText,
  OLDER_DROPPED,
  RunProgress,
  SSE_CLOSED,
  SSE_LIVE,
  SUBTITLE,
} from "./RunProgress";
import {
  CONSOLE_PAGE_LIMIT,
  CONSOLE_WINDOW,
  POLL_FLOOR_MS,
  type ProgressRead,
  type ProgressSnapshot,
  classifyFrame,
  progressApi,
  toProgressRefusal,
} from "./progressClient";
import { HIDDEN_STREAM_GRACE_MS, isLive, useRunProgress } from "./useRunProgress";
import { PortalApiError } from "../lib/api";
import { researchState } from "./state";

afterEach(cleanup);

/** Source of one Research module with its comments stripped. */
function codeOf(name: string): string {
  return readFileSync(join(process.cwd(), "src", "research", name), "utf8")
    .split("\n")
    .filter((line) => {
      const t = line.trimStart();
      return !t.startsWith("*") && !t.startsWith("//") && !t.startsWith("/*");
    })
    .join("\n");
}

/* ---------------------------------------------------------------- fixtures */

function snapshot(overrides: Partial<ProgressSnapshot> = {}): ProgressSnapshot {
  return {
    schema_version: "research.progress-snapshot.v1",
    run_id: "run_01",
    status: "RUNNING",
    created_at_utc_ms: 1789836572000,
    updated_at_utc_ms: 1789836582000,
    latest_sequence: 40,
    retention_floor_sequence: 1,
    stages: [
      { key: "S1", state: "DONE", started_at_utc_ms: 1, completed_at_utc_ms: 2 },
      { key: "S2", state: "RUNNING", started_at_utc_ms: 2, completed_at_utc_ms: null },
      { key: "S3", state: "PENDING", started_at_utc_ms: null, completed_at_utc_ms: null },
      { key: "S4", state: "PENDING", started_at_utc_ms: null, completed_at_utc_ms: null },
      { key: "S5", state: "PENDING", started_at_utc_ms: null, completed_at_utc_ms: null },
    ],
    overall: {
      pct: 42,
      elapsed_s: 610,
      eta_s: 880,
      trials_done: 214,
      trials_declared: 400,
      tqdm_line: "fold 07/32 · study 7 · trial 214/400 · best J₁ 1.049 · prune 12%",
    },
    budget: { used: "12.500", cap: "60.000", unit: "core-min", pct: 20 },
    folds: [
      { fold: 1, state: "DONE", started_at_utc_ms: 1000, completed_at_utc_ms: 2000 },
      { fold: 2, state: "RUNNING", started_at_utc_ms: 2000, completed_at_utc_ms: null },
    ],
    artifacts: [
      { name: "trials.parquet", state: "SEALED", size: "1.2 MB", digest: "sha256:aa91b3ce7742aa11", reader_href: null },
      { name: "claim.json", state: "PENDING", size: null, digest: null, reader_href: null },
    ],
    claim: {
      state: "FORECAST",
      text: "mode_1_decay × per_fold_causal ⇒ STRICT_OUTER_OOS_AFTER_FROZEN_SELECTION · cert ceiling B — issued only if every stage seals.",
      cursor: null,
    },
    readiness: { mandatory: "PENDING", optional: "NOT_APPLICABLE" },
    failure: null,
    source: { kind: "DURABLE_P10", coverage: "ACTUAL_HOOKS", partial: false },
    ...overrides,
  };
}

function read(overrides: Partial<ProgressRead> = {}, snap: Partial<ProgressSnapshot> = {}): ProgressRead {
  return {
    schema_version: "research.progress-read.v1",
    run_id: "run_01",
    availability: "AVAILABLE",
    current: {
      job_state: "running",
      effective_status: "RUNNING",
      terminal_resolution: "PENDING",
      source_latest_sequence: 40,
      retention_floor_sequence: 1,
      last_received_at_utc_ms: 1789836582000,
      may_cancel: true,
      may_retry: false,
      retry_reason: "P12_OWNED_NO_P11_RETRY_ROUTE",
    },
    progress: snapshot(snap),
    ...overrides,
  };
}

const OK = researchState({ kind: "ok", rowCount: 1 });

function view(overrides: Partial<React.ComponentProps<typeof RunProgress>> = {}) {
  const r = overrides.read === undefined ? read() : overrides.read;
  return render(
    <RunProgress
      runId="run_01"
      read={r}
      snapshot={r?.progress ?? null}
      state={OK}
      transport="stream"
      lines={[]}
      linesDropped={false}
      onLoadOlder={vi.fn()}
      foldCursor={null}
      onPinFold={vi.fn()}
      cancelling={false}
      onCancel={vi.fn()}
      {...overrides}
    />,
  );
}

/* ---------------------------------------------------------- stream double */

/**
 * Behaves like the browser: a frame is written under an SSE event name (as
 * `progress.controller.ts` does) and reaches only listeners registered for
 * that name — never `onmessage`. The first double called `onmessage` directly,
 * which is how a stream that received nothing in production stayed green here.
 */
function eventNameOf(payload: unknown): string {
  const value = payload as Record<string, unknown>;
  if (value.event && typeof value.event === "object") return "research.progress";
  if (value.schema_version === "research.progress-read.v1") return "research.progress.snapshot";
  return String(value.event_type);
}

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onmessage: ((e: MessageEvent<string>) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  closed = false;
  private listeners = new Map<string, ((e: MessageEvent<string>) => void)[]>();
  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(name: string, listener: (e: MessageEvent<string>) => void) {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]);
  }
  close() {
    this.closed = true;
  }
  emit(payload: unknown, name: string = eventNameOf(payload)) {
    const message = { data: JSON.stringify(payload) } as MessageEvent<string>;
    for (const listener of this.listeners.get(name) ?? []) listener(message);
  }
  fail() {
    this.onerror?.(new Event("error"));
  }
  static last() {
    return FakeEventSource.instances[FakeEventSource.instances.length - 1];
  }
  static reset() {
    FakeEventSource.instances = [];
  }
}

let fetched: string[] = [];

function stubFetch(responder: (url: string) => [number, unknown]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      fetched.push(url);
      const [status, payload] = responder(url);
      return {
        ok: status < 400,
        status,
        statusText: "",
        headers: { get: () => null },
        json: async () => payload,
      } as unknown as Response;
    }),
  );
}

beforeEach(() => {
  fetched = [];
  FakeEventSource.reset();
  vi.stubGlobal("EventSource", FakeEventSource as unknown as typeof EventSource);
});
afterEach(() => vi.unstubAllGlobals());

/* -------------------------------------------------------------------------
 * Composition
 * ---------------------------------------------------------------------- */

describe("P11-T01 — every HIFI block is present and reads from the snapshot", () => {
  it("renders the seven blocks with the server's own numbers", () => {
    view();
    expect(screen.getByText(SUBTITLE)).toBeTruthy();
    expect(document.querySelectorAll("[data-stage]")).toHaveLength(5);
    expect(document.querySelector("[data-tqdm]")?.textContent).toBe(
      "fold 07/32 · study 7 · trial 214/400 · best J₁ 1.049 · prune 12%",
    );
    expect(document.querySelectorAll("[data-fold]")).toHaveLength(2);
    expect(document.querySelectorAll("[data-artifact]")).toHaveLength(2);
    expect(document.querySelector("[data-claim]")?.getAttribute("data-claim")).toBe("FORECAST");
    expect(document.querySelector("[data-console-box]")).toBeTruthy();
  });

  it("keeps the five stages in order and never adds one", () => {
    view();
    const keys = Array.from(document.querySelectorAll("[data-stage]")).map((n) =>
      n.getAttribute("data-stage"),
    );
    expect(keys).toEqual(["S1", "S2", "S3", "S4", "S5"]);
    // A pending stage announces itself as disabled rather than being silently
    // inert (spec 03 T17).
    expect(document.querySelector('[data-stage="S3"]')?.getAttribute("aria-disabled")).toBe("true");
  });

  it("prints exact decimal strings and never parses them", () => {
    view();
    const budget = document.querySelector("[data-budget]") as HTMLElement;
    expect(budget.textContent).toContain("12.500/60.000 core-min");
  });

  it("shows a null ETA as absent rather than computing one", () => {
    view({ read: read({}, { overall: { ...snapshot().overall, eta_s: null } }) });
    const eta = document.querySelector("[data-eta]") as HTMLElement;
    expect(eta.textContent).toContain("not reported");
    expect(eta.textContent).not.toMatch(/\d+s/);
  });

  it("states the run's own failure code verbatim", () => {
    view({
      read: read(
        { current: { ...read().current, effective_status: "FAILED", may_cancel: false } },
        {
          status: "FAILED",
          claim: { state: "NOT_ISSUED", text: "", cursor: null },
          failure: { code: "RuntimeBudgetError.CAP_EXCEEDED", message: "runtime budget exhausted" },
        },
      ),
    });
    const failure = document.querySelector("[data-failure]") as HTMLElement;
    expect(failure.getAttribute("data-failure")).toBe("RuntimeBudgetError.CAP_EXCEEDED");
    expect(failure.textContent).toContain("runtime budget exhausted");
    expect(screen.getByText(NOT_ISSUED_NOTE)).toBeTruthy();
  });
});

describe("RF-04 FE-S03-04 — a finished run without a claim is not called failed", () => {
  it("prints the server's own sentence on a COMPLETED, NOT_ISSUED run", () => {
    const text = "The fixed P10 qualification sealed its artifacts but did not issue a release claim.";
    view({
      read: read(
        { current: { ...read().current, effective_status: "COMPLETED", may_cancel: false } },
        { status: "COMPLETED", claim: { state: "NOT_ISSUED", text, cursor: null } },
      ),
    });
    expect(screen.getByText(text)).toBeTruthy();
    expect(screen.queryByText(NOT_ISSUED_NOTE)).toBeNull();
  });

  it("never says failed when the server gave no sentence and the run did not fail", () => {
    expect(notIssuedText("", "COMPLETED")).toBe(NO_CLAIM_NOTE);
    expect(notIssuedText("", "FAILED")).toBe(NOT_ISSUED_NOTE);
  });
});

describe("P11-T01b / FE-S03-07 — the fold fill is trial progress, not wall time", () => {
  it("fills a DONE fold completely, however short its time span", () => {
    // The old time-scaled band drew a DONE fold at ~11 % of its track, which
    // read as unfinished (FE-S03-07).
    view({
      read: read(
        {},
        {
          updated_at_utc_ms: 1789836590000,
          folds: [
            { fold: 1, state: "DONE", started_at_utc_ms: 1789836572000, completed_at_utc_ms: 1789836572010 },
            { fold: 2, state: "RUNNING", started_at_utc_ms: 1789836580000, completed_at_utc_ms: null },
          ],
        },
      ),
    });
    const done = document.querySelector('[data-fold-fill="1"]') as HTMLElement;
    expect(done.style.width).toBe("100%");
  });

  it("does not guess a running fold's share: no fill, a pulsing track", () => {
    view({
      read: read(
        {},
        { folds: [{ fold: 1, state: "RUNNING", started_at_utc_ms: 1789836572000, completed_at_utc_ms: null }] },
      ),
    });
    expect(document.querySelector('[data-fold-fill="1"]')).toBeNull();
    const track = document.querySelector('[data-fold-track="1"]') as HTMLElement;
    expect(track.getAttribute("data-motion")).toBe("pulse");
    expect(track.style.getPropertyValue("--rs-motion-duration")).toBe("1.8s");
  });

  it("reads no local clock anywhere on the surface", () => {
    for (const name of ["RunProgress.tsx", "useRunProgress.ts", "progressClient.ts"]) {
      expect(codeOf(name), name).not.toMatch(/Date\.now\(\)|new Date\(\)/);
    }
  });
});

describe("P11-T01c — the source owns the segmentation and the certificate", () => {
  const segments = [
    { kind: "search" as const, state: "DONE" as const, started_at_utc_ms: 1789836572000, completed_at_utc_ms: 1789836576000 },
    { kind: "oos" as const, state: "DONE" as const, started_at_utc_ms: 1789836576000, completed_at_utc_ms: 1789836579000 },
    { kind: "freeze_tick" as const, state: "DONE" as const, started_at_utc_ms: 1789836579000, completed_at_utc_ms: 1789836580000 },
  ];

  function withTimeline(timeline: unknown) {
    return read({}, {
      updated_at_utc_ms: 1789836590000,
      folds: [
        {
          fold: 1,
          state: "DONE",
          started_at_utc_ms: 1789836572000,
          completed_at_utc_ms: 1789836580000,
          ...(timeline === undefined ? {} : { fold_timeline: timeline }),
        } as ProgressSnapshot["folds"][number],
      ],
    });
  }

  it("draws a full Gantt only when the source says COMPLETE", () => {
    view({ read: withTimeline({ state: "COMPLETE", reason_code: null, segments }) });
    expect(document.querySelectorAll("[data-fold-segment]")).toHaveLength(3);
    expect(document.querySelector("[data-fold-fill]")).toBeNull();
  });

  it("draws exactly the published segments on PARTIAL and names the condition", () => {
    view({
      read: withTimeline({
        state: "PARTIAL",
        reason_code: "SOURCE_PARTIALLY_PUBLISHED_PER_FOLD_SEGMENT_FACTS",
        segments: segments.slice(0, 1),
      }),
    });
    // One fact exists; the other two are not invented to complete the picture.
    expect(document.querySelectorAll("[data-fold-segment]")).toHaveLength(1);
    expect(document.querySelector("[data-timeline-partial]")?.textContent).toContain(
      "the gaps are not filled",
    );
  });

  it("keeps the whole-fold fill on NOT_PUBLISHED", () => {
    view({
      read: withTimeline({
        state: "NOT_PUBLISHED",
        reason_code: "SOURCE_DID_NOT_PUBLISH_PER_FOLD_SEGMENT_FACTS",
        segments: [],
      }),
    });
    expect(document.querySelectorAll("[data-fold-segment]")).toHaveLength(0);
    expect(document.querySelector("[data-fold-fill]")).toBeTruthy();
  });

  it("treats an absent field exactly as NOT_PUBLISHED", () => {
    // Optional only so a pre-amendment snapshot decodes; not a licence to
    // synthesize a timeline.
    view({ read: withTimeline(undefined) });
    expect(document.querySelector("[data-fold]")?.getAttribute("data-fold-timeline")).toBe(
      "NOT_PUBLISHED",
    );
    expect(document.querySelector("[data-fold-fill]")).toBeTruthy();
  });

  it("shows an A–D chip only for an issued certificate with a grade", () => {
    const issued = read(
      { current: { ...read().current, effective_status: "COMPLETED", may_cancel: false } },
      {
        status: "COMPLETED",
        claim: {
          state: "ISSUED",
          text: "STRICT_OUTER_OOS_AFTER_FROZEN_SELECTION",
          cursor: "cur_9",
          methodology_certificate: {
            state: "ISSUED",
            grade: "B",
            issued_at_utc_ms: 1789836590000,
            reason_code: null,
          },
        },
      },
    );
    view({ read: issued });
    expect(document.querySelector("[data-certificate]")?.getAttribute("data-certificate")).toBe("B");
  });

  it("omits the chip for every other certificate state", () => {
    for (const certificate of [
      { state: "NOT_PUBLISHED" as const, grade: null, issued_at_utc_ms: null, reason_code: "SOURCE_DID_NOT_PUBLISH_METHODOLOGY_CERTIFICATE" as const },
      { state: "NOT_ISSUED" as const, grade: null, issued_at_utc_ms: null, reason_code: "SOURCE_DECLARED_METHODOLOGY_CERTIFICATE_NOT_ISSUED" as const },
      /* An ISSUED state with no grade is still not a chip: the grade is the
         fact, and the state alone cannot stand in for it. */
      { state: "ISSUED" as const, grade: null, issued_at_utc_ms: null, reason_code: null },
    ]) {
      cleanup();
      view({
        read: read({}, { claim: { state: "FORECAST", text: "t", cursor: null, methodology_certificate: certificate } }),
      });
      expect(document.querySelector("[data-certificate]"), certificate.state).toBeNull();
    }
  });

  it("omits the chip when the field is absent entirely", () => {
    view();
    expect(document.querySelector("[data-certificate]")).toBeNull();
  });

  it("recovers a grade from nothing else — not prose, not a ceiling", () => {
    const code = codeOf("RunProgress.tsx");
    // The chip reads `certificate.grade` and nothing else.
    expect(code).not.toMatch(/cert ceiling|claim\.text.*grade|parse.*grade/i);
  });
});

describe("P11-T02 — a sealed artifact is readiness, not authorization", () => {
  it("renders a sealed card rich and unlinked", () => {
    view();
    const sealed = document.querySelector('[data-artifact="trials.parquet"]') as HTMLElement;
    expect(sealed.getAttribute("data-artifact-state")).toBe("SEALED");
    expect(sealed.textContent).toContain("1.2 MB");
    expect(sealed.textContent).toContain("sha256:aa91b3");
    // `reader_href` is null by contract; no route may be invented for it.
    expect(sealed.querySelectorAll("a")).toHaveLength(0);
    expect(screen.getByText(ARTIFACT_NO_READER)).toBeTruthy();
  });

  it("offers no link on any artifact state", () => {
    view();
    expect(document.querySelectorAll("[data-artifacts] a")).toHaveLength(0);
  });
});

describe("RF01-F6 — retained tables go through ArtifactPanel in the authority's six states", () => {
  const table = (table_kind: string, state: string, sealed: number | null) => ({
    table_kind,
    state,
    total_rows: "9007199254740993",
    total_bytes: "4096",
    sealed_at_utc_ms: sealed,
    reader_href: null,
  });

  it("draws one ArtifactPanel per retained table, CORRUPT and MISSING included", () => {
    view({
      read: read({
        retained_artifacts: [
          table("equity", "SEALED", 1789836582123),
          table("folds", "CORRUPT", 1789836582123),
          table("trades", "MISSING", 1789836582123),
          table("trials", "PENDING", null),
          table("oos", "WRITING", null),
          table("search", "ABORTED", null),
        ] as never,
      }),
    });
    const tables = document.querySelector("[data-retained-tables]") as HTMLElement;
    for (const state of ["SEALED", "CORRUPT", "MISSING", "PENDING", "WRITING", "ABORTED"]) {
      expect(tables.querySelector(`[data-artifact-state='${state}']`)).toBeTruthy();
    }
    // Exact integer strings, never rounded through a float.
    expect(tables.textContent).toContain("9007199254740993");
    expect(tables.textContent).toContain("2026-09-19T");
    // No reader route is published, so nothing is a link or a download.
    expect(tables.querySelectorAll("a, button")).toHaveLength(0);
    expect(tables.textContent).toMatch(/has not published an export action/);
    expect(tables.textContent).not.toMatch(/READY/);
  });

  it("says an empty list is empty and an absent list is not published", () => {
    view({ read: read({ retained_artifacts: [] }) });
    expect(document.querySelector("[data-retained-none]")).toBeTruthy();
    cleanup();
    view();
    expect(document.querySelector("[data-retained-not-published]")).toBeTruthy();
  });
});

describe("P11-T03 — the claim is a forecast until the source seals it", () => {
  it("draws a forecast dashed and an issued claim solid", () => {
    const { rerender } = view();
    const forecast = document.querySelector("[data-claim]") as HTMLElement;
    expect(forecast.style.border).toContain("dashed");

    const issued = read(
      { current: { ...read().current, effective_status: "COMPLETED", may_cancel: false } },
      {
        status: "COMPLETED",
        claim: { state: "ISSUED", text: "STRICT_OUTER_OOS_AFTER_FROZEN_SELECTION", cursor: "cur_9" },
        readiness: { mandatory: "SEALED", optional: "READY" },
      },
    );
    rerender(
      <RunProgress
        runId="run_01"
        read={issued}
        snapshot={issued.progress}
        state={OK}
        transport="closed"
        lines={[]}
        linesDropped={false}
        onLoadOlder={vi.fn()}
        foldCursor={null}
        onPinFold={vi.fn()}
        cancelling={false}
        onCancel={vi.fn()}
      />,
    );
    const solid = document.querySelector("[data-claim]") as HTMLElement;
    expect(solid.getAttribute("data-claim")).toBe("ISSUED");
    expect(solid.style.border).toContain("solid");
    expect(document.querySelector("[data-readiness]")?.textContent).toContain("mandatory SEALED");
  });

  it("does not call a run complete without the source's seal", () => {
    // `readiness.mandatory` is the only thing that means completion.
    view({ read: read({}, { readiness: { mandatory: "SEALING", optional: "PENDING" } }) });
    expect(document.querySelector("[data-readiness]")?.textContent).not.toContain("sealed");
    expect(document.querySelector("[data-claim]")?.getAttribute("data-claim")).toBe("FORECAST");
  });
});

describe("P11-T04 — a dropped stream is a dot, never a banner", () => {
  it("labels the transport without alarming", () => {
    const { rerender } = view({ transport: "stream" });
    expect(screen.getByText(SSE_LIVE)).toBeTruthy();
    expect(document.querySelector("[data-transport]")?.getAttribute("data-transport")).toBe("stream");

    rerender(
      <RunProgress
        runId="run_01"
        read={read()}
        snapshot={read().progress}
        state={OK}
        transport="poll"
        lines={[]}
        linesDropped={false}
        onLoadOlder={vi.fn()}
        foldCursor={null}
        onPinFold={vi.fn()}
        cancelling={false}
        onCancel={vi.fn()}
      />,
    );
    expect(document.querySelector("[data-transport]")?.getAttribute("data-transport")).toBe("poll");
    // No banner, no alert: the page is still correct on the poll floor.
    expect(document.querySelectorAll('[role="alert"]')).toHaveLength(0);
  });

  it("says the stream is closed on a terminal run", () => {
    view({
      read: read({ current: { ...read().current, effective_status: "COMPLETED", may_cancel: false } }),
      transport: "closed",
    });
    expect(screen.getByText(SSE_CLOSED)).toBeTruthy();
  });
});

/* -------------------------------------------------------------------------
 * Stream lifecycle
 * ---------------------------------------------------------------------- */

describe("P11-T05 — the stream opens only when it should, and closes when it must", () => {
  it("opens for a live run and resumes from the applied sequence", async () => {
    stubFetch(() => [200, read()]);
    const { result } = renderHook(() => useRunProgress("run_01"));
    await waitFor(() => expect(result.current.read).not.toBeNull());
    await waitFor(() => expect(FakeEventSource.instances.length).toBeGreaterThan(0));
    expect(FakeEventSource.last().url).toContain("/api/v1/research/runs/run_01/events");
    expect(FakeEventSource.last().url).toContain("after_seq=40");
  });

  it("never opens for a terminal run", async () => {
    stubFetch(() => [
      200,
      read({ current: { ...read().current, effective_status: "COMPLETED", may_cancel: false } }),
    ]);
    const { result } = renderHook(() => useRunProgress("run_01"));
    await waitFor(() => expect(result.current.read).not.toBeNull());
    expect(FakeEventSource.instances).toHaveLength(0);
    expect(result.current.transport).toBe("closed");
  });

  it("closes on a terminal event instead of waiting for a reconcile", async () => {
    stubFetch(() => [200, read()]);
    const { result } = renderHook(() => useRunProgress("run_01"));
    await waitFor(() => expect(FakeEventSource.instances.length).toBeGreaterThan(0));
    const stream = FakeEventSource.last();
    expect(result.current.transport).toBe("stream");

    await act(async () => {
      stream.emit({
        event: {
          schema_version: "research.progress-event.v1",
          run_id: "run_01",
          sequence: 41,
          event_type: "run_completed",
          occurred_at_utc_ms: 1789836590000,
          payload: { usage: { peak_rss_bytes: 1, cpu_seconds: 1, scratch_bytes: 1, fd_peak: 1 } },
        },
        snapshot: null,
      });
    });
    expect(stream.closed).toBe(true);
  });

  it("closes on a typed gap and replaces state from a snapshot", async () => {
    stubFetch(() => [200, read()]);
    renderHook(() => useRunProgress("run_01"));
    await waitFor(() => expect(FakeEventSource.instances.length).toBeGreaterThan(0));
    const stream = FakeEventSource.last();
    const before = fetched.length;

    await act(async () => {
      stream.emit({
        schema_version: "research.progress-stream.v1",
        event_type: "research.progress.gap",
        terminal: true,
        reconnect_required: false,
      });
    });

    expect(stream.closed).toBe(true);
    // A hole is not stitched; local state is replaced from the snapshot route.
    await waitFor(() => expect(fetched.length).toBeGreaterThan(before));
  });

  it("closes on auth.expired and does not re-open", async () => {
    stubFetch(() => [200, read()]);
    renderHook(() => useRunProgress("run_01"));
    await waitFor(() => expect(FakeEventSource.instances.length).toBeGreaterThan(0));
    const stream = FakeEventSource.last();
    const opened = FakeEventSource.instances.length;

    await act(async () => {
      stream.emit({
        schema_version: "research.progress-stream.v1",
        event_type: "auth.expired",
        terminal: true,
        reconnect_required: false,
      });
    });
    expect(stream.closed).toBe(true);
    expect(FakeEventSource.instances).toHaveLength(opened);
  });

  it("hands a transport error to the poll floor, not to a retry loop", async () => {
    stubFetch(() => [200, read()]);
    const { result } = renderHook(() => useRunProgress("run_01"));
    await waitFor(() => expect(FakeEventSource.instances.length).toBeGreaterThan(0));
    const opened = FakeEventSource.instances.length;

    await act(async () => FakeEventSource.last().fail());
    expect(result.current.transport).toBe("poll");
    // No tight reconnect: exactly the one stream was opened.
    expect(FakeEventSource.instances).toHaveLength(opened);
  });

  it("applies the snapshot frame the server opens every stream with", async () => {
    stubFetch(() => [200, read()]);
    const { result } = renderHook(() => useRunProgress("run_01"));
    await waitFor(() => expect(FakeEventSource.instances.length).toBeGreaterThan(0));
    const moved = read({}, { overall: { ...snapshot().overall, pct: 77 }, latest_sequence: 55 });
    await act(async () => FakeEventSource.last().emit(moved));
    expect(result.current.snapshot?.overall.pct).toBe(77);
  });

  it("gives the stream up after a minute hidden and reopens it on return", async () => {
    stubFetch(() => [200, read()]);
    const { result } = renderHook(() => useRunProgress("run_01"));
    await waitFor(() => expect(FakeEventSource.instances.length).toBeGreaterThan(0));
    const first = FakeEventSource.last();
    vi.useFakeTimers();
    const setVisibility = (state: "hidden" | "visible") => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
      document.dispatchEvent(new Event("visibilitychange"));
    };
    try {
      await act(async () => setVisibility("hidden"));
      // A short switch keeps the stream.
      await act(async () => vi.advanceTimersByTime(HIDDEN_STREAM_GRACE_MS - 1));
      expect(first.closed).toBe(false);
      await act(async () => vi.advanceTimersByTime(1));
      expect(first.closed).toBe(true);
      expect(result.current.transport).toBe("closed");
      await act(async () => setVisibility("visible"));
    } finally {
      vi.useRealTimers();
    }
    await waitFor(() => expect(FakeEventSource.last()).not.toBe(first));
    expect(result.current.transport).toBe("stream");
  });

  it("closes the stream on unmount", async () => {
    stubFetch(() => [200, read()]);
    const { unmount } = renderHook(() => useRunProgress("run_01"));
    await waitFor(() => expect(FakeEventSource.instances.length).toBeGreaterThan(0));
    const stream = FakeEventSource.last();
    unmount();
    expect(stream.closed).toBe(true);
  });
});

describe("P11-T06 — an out-of-order frame never moves state backwards", () => {
  it("drops a sequence already applied", async () => {
    stubFetch(() => [200, read()]);
    const { result } = renderHook(() => useRunProgress("run_01"));
    await waitFor(() => expect(FakeEventSource.instances.length).toBeGreaterThan(0));
    const stream = FakeEventSource.last();

    const stale = snapshot({ overall: { ...snapshot().overall, pct: 5 } });
    await act(async () => {
      stream.emit({
        event: {
          schema_version: "research.progress-event.v1",
          run_id: "run_01",
          sequence: 12,
          event_type: "budget_tick",
          occurred_at_utc_ms: 1,
          payload: { used: "1.0", cap: "60.0", pct: 2 },
        },
        snapshot: stale,
      });
    });
    // Sequence 12 predates the snapshot's 40, so nothing was applied.
    expect(result.current.snapshot?.overall.pct).toBe(42);
  });

  it("classifies only frames the contract describes", () => {
    expect(classifyFrame("not json")).toBeNull();
    expect(classifyFrame(JSON.stringify({ surprise: true }))).toBeNull();
    expect(
      classifyFrame(JSON.stringify({ event_type: "research.progress.heartbeat" }))?.kind,
    ).toBe("heartbeat");
  });
});

/* -------------------------------------------------------------------------
 * Console
 * ---------------------------------------------------------------------- */

describe("P11-T07 — the console is a bounded observation lane", () => {
  it("keeps at most the display window and says older lines were dropped", () => {
    const lines = Array.from({ length: CONSOLE_WINDOW + 20 }, (_, i) => ({
      sequence: i + 1,
      occurred_at_utc_ms: 1789836572000 + i,
      tone: "INFO" as const,
      text: `line ${i}`,
      trial: null,
      fold: null,
    }));
    view({ lines: lines.slice(-CONSOLE_WINDOW), linesDropped: true });
    expect(document.querySelectorAll("[data-console-line]")).toHaveLength(CONSOLE_WINDOW);
    expect(screen.getByText(OLDER_DROPPED)).toBeTruthy();
  });

  it("appends a console observation carried by a typed trial event", async () => {
    stubFetch(() => [200, read()]);
    const { result } = renderHook(() => useRunProgress("run_01"));
    await waitFor(() => expect(FakeEventSource.instances.length).toBeGreaterThan(0));

    await act(async () => {
      FakeEventSource.last().emit({
        event: {
          schema_version: "research.progress-event.v1",
          run_id: "run_01",
          sequence: 41,
          event_type: "trial_completed",
          occurred_at_utc_ms: 1789836590000,
          payload: {
            fold: 7,
            trial: 214,
            state: "COMPLETE",
            console: { tone: "COMPLETE", text: "fold_07 trial 214 state=COMPLETE" },
          },
        },
        snapshot: null,
      });
    });
    await waitFor(() => expect(result.current.lines).toHaveLength(1));
    expect(result.current.lines[0].text).toBe("fold_07 trial 214 state=COMPLETE");
    expect(result.current.lines[0].fold).toBe(7);
  });

  it("is a log region a screen reader can follow", () => {
    view();
    const box = document.querySelector("[data-console-box]") as HTMLElement;
    expect(box.getAttribute("role")).toBe("log");
    expect(box.getAttribute("aria-live")).toBe("polite");
  });

  it("never uses scrollIntoView for auto-scroll", () => {
    /* Comments are stripped before the sweep: the first version of this test
       failed on its own explanation of the rule, which is a guard measuring
       prose rather than code. */
    expect(codeOf("RunProgress.tsx")).not.toContain("scrollIntoView");
    expect(codeOf("RunProgress.tsx")).toContain("scrollTop");
  });

  it("asks for a bounded page, never a full history", () => {
    const code = codeOf("progressClient.ts");
    expect(code).toContain("after_seq=");
    // The page size is the contract's cap, referenced rather than retyped.
    expect(code).toMatch(/limit=\$\{CONSOLE_PAGE_LIMIT\}/);
    expect(CONSOLE_PAGE_LIMIT).toBe(500);
  });
});

/* -------------------------------------------------------------------------
 * Cancel, retry, states
 * ---------------------------------------------------------------------- */

describe("P11-T08 — cancel is the server's decision and retry is not offered", () => {
  it("confirms in one step before sending", () => {
    const onCancel = vi.fn();
    view({ onCancel });
    fireEvent.click(document.querySelector('[data-action="cancel"]') as HTMLElement);
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.click(document.querySelector('[data-action="cancel-confirm"]') as HTMLElement);
    expect(onCancel).toHaveBeenCalledWith("cancelled by portal operator");
  });

  it("offers no cancel when the server did not admit one", () => {
    view({ read: read({ current: { ...read().current, may_cancel: false } }) });
    expect(document.querySelector('[data-action="cancel"]')).toBeNull();
  });

  it("offers no retry on a completed run, and exactly one seeded new run after a failure (CG-P11-07)", () => {
    view({ read: read({ current: { ...read().current, effective_status: "COMPLETED", may_cancel: false } }), transport: "closed" });
    expect(document.querySelector('[data-action="retry"]')).toBeNull();
    expect(document.querySelector('[data-action="new-run-from"]')).toBeNull();
    cleanup();
    const failed = read({
      current: {
        ...read().current,
        effective_status: "FAILED",
        may_cancel: false,
        retry_reason: "FAIL_CLOSED_NEW_RUN_FROM_REQUESTED_SPEC",
        new_run_from: { state: "AVAILABLE", reason_code: null },
      },
    });
    view({ read: failed, transport: "closed" });
    const link = document.querySelector('[data-action="new-run-from"]');
    expect(link?.getAttribute("href")).toBe("/research/quantbt/runs/new?from=run_01");
    expect(link?.textContent).toBe("new run with same draft →");
    expect(document.querySelector('[data-action="retry"]')).toBeNull();
  });

  it("says why no new run can be seeded when the requested spec is not retained", () => {
    view({
      read: read({
        current: {
          ...read().current,
          effective_status: "CANCELLED",
          may_cancel: false,
          new_run_from: { state: "NOT_AVAILABLE", reason_code: "RUN_REQUESTED_SPEC_NOT_RETAINED" },
        },
      }),
      transport: "closed",
    });
    expect(document.querySelector('[data-action="new-run-from"]')).toBeNull();
    expect(document.querySelector("[data-retry-reason]")?.textContent).toContain("requested spec is not retained");
  });

  it("shows a cancellation resolution without overwriting the source status", () => {
    view({
      read: read(
        {
          current: {
            ...read().current,
            effective_status: "CANCELLED",
            terminal_resolution: "CONTROL_CANCELLATION",
            may_cancel: false,
          },
        },
        /* The source still says RUNNING; the Portal terminal truth is
           `effective_status`, and both facts stay visible. */
        { status: "RUNNING" },
      ),
      transport: "closed",
    });
    expect(document.querySelector("[data-status-pill]")?.getAttribute("data-status-pill")).toBe(
      "CANCELLED",
    );
    expect(document.querySelector("[data-terminal-resolution]")).toBeTruthy();
  });
});

describe("RF-04 — console and truthful no-source states", () => {
  it("backfills one bounded console page before SSE and does not repeat it on snapshot refresh", async () => {
    stubFetch((url) => url.includes("/console?")
      ? [200, { schema_version: "research.console-page.v1", run_id: "run_01", lines: [
          { sequence: 39, occurred_at_utc_ms: 1789836580000, tone: "INFO", text: "retained line", fold: null, trial: null },
        ], next_after_seq: null, retention_floor_sequence: 1 }]
      : [200, read()]);
    const { result } = renderHook(() => useRunProgress("run_01"));
    await waitFor(() => expect(result.current.lines.map((line) => line.text)).toContain("retained line"));
    expect(fetched.filter((url) => url.includes("/console?"))).toHaveLength(1);
    await act(async () => { FakeEventSource.last().emit(read()); });
    expect(fetched.filter((url) => url.includes("/console?"))).toHaveLength(1);
  });

  it("keeps an older page separate from the live 500-line ring", async () => {
    const line = (sequence: number) => ({ sequence, occurred_at_utc_ms: 1789836572000 + sequence, tone: "INFO" as const, text: `line ${sequence}`, fold: null, trial: null });
    stubFetch((url) => url.includes("/console?")
      ? [200, { schema_version: "research.console-page.v1", run_id: "run_01", lines:
          url.includes("after_seq=400") ? Array.from({ length: 500 }, (_, index) => line(index + 401))
            : Array.from({ length: 400 }, (_, index) => line(index + 1)),
          next_after_seq: null, retention_floor_sequence: 1 }]
      : [200, read({}, { latest_sequence: 900 })]);
    const { result } = renderHook(() => useRunProgress("run_01"));
    await waitFor(() => expect(result.current.lines).toHaveLength(500));
    act(() => result.current.loadOlder());
    await waitFor(() => expect(result.current.olderLines).toHaveLength(400));
    expect(result.current.lines).toHaveLength(500);
    expect(result.current.olderLines[0]?.sequence).toBe(1);
  });

  it("reserves the console height and renders queued, cancelled and not-found without false progress", () => {
    view();
    expect((document.querySelector("[data-console-box]") as HTMLElement).style.height).toBe("330px");
    cleanup();
    view({ read: read({ availability: "QUEUED_NO_SOURCE", progress: null, queue: { queue_class: "HEAVY", queued_at_utc_ms: 1789836572000, retry_not_before_utc_ms: null } }) });
    expect(document.querySelector("[data-no-source]")?.getAttribute("data-no-source")).toBe("QUEUED_NO_SOURCE");
    expect(document.querySelectorAll("[data-research-panel]")).toHaveLength(0);
    cleanup();
    view({ read: read({ availability: "CANCELLED_BEFORE_SOURCE", progress: null }) });
    expect(document.querySelector("[data-no-source]")?.getAttribute("data-no-source")).toBe("CANCELLED_BEFORE_SOURCE");
    cleanup();
    view({ read: null, state: { state: "empty", reason: "Run not found.", mayRetry: false, retainsContent: false } });
    expect(document.querySelector("[data-run-not-found]")).toBeTruthy();
  });
});

describe("P11-T09 — typed availability and refusals keep the composition", () => {
  it("reports PENDING_SOURCE_CALLBACK inside the screen", () => {
    view({ read: read({ availability: "PENDING_SOURCE_CALLBACK" }) });
    expect(document.querySelector("[data-pending-source]")?.textContent).toContain(
      "Waiting for its source to report progress",
    );
    // The composition is intact, not replaced by an envelope.
    expect(document.querySelectorAll("[data-research-panel]").length).toBeGreaterThanOrEqual(6);
  });

  it("reports a partial source without hiding the numbers", () => {
    view({ read: read({}, { source: { kind: "DURABLE_P10", coverage: "ACTUAL_HOOKS", partial: true } }) });
    expect(document.querySelector("[data-source-partial]")).toBeTruthy();
    expect(document.querySelector("[data-tqdm]")).toBeTruthy();
  });

  it.each([
    [401, "denied", true],
    [403, "denied", true],
    [404, "terminal", false],
    [409, "terminal", true],
    [503, "unavailable", false],
  ])("maps %i to %s", (status, expected, closes) => {
    const refusal = toProgressRefusal(new PortalApiError("said so", status, "CODE", "r"));
    expect(refusal.state).toBe(expected);
    expect(refusal.closesStream).toBe(closes);
    // RF01-F4: the shared mapper — fixed copy on screen, server text as detail.
    expect(refusal.message).not.toBe("said so");
    expect(refusal.detail).toBe("said so");
  });

  it("knows which statuses are still live", () => {
    expect(isLive("QUEUED")).toBe(true);
    expect(isLive("RUNNING")).toBe(true);
    expect(isLive("FINISHING")).toBe(true);
    expect(isLive("COMPLETED")).toBe(false);
    expect(isLive("FAILED")).toBe(false);
    expect(isLive("CANCELLED")).toBe(false);
  });
});

describe("P11-T10 — the surface recreates no private identity", () => {
  const FILES = ["progressClient.ts", "useRunProgress.ts", "RunProgress.tsx", "RunProgressRoute.tsx"];

  it("never names an attempt, lease epoch or worker attempt", () => {
    for (const name of FILES) {
      expect(codeOf(name), name).not.toMatch(/attempt_id|lease_epoch|worker_attempt_id/);
    }
  });

  it("requests only the four published paths", () => {
    const code = readFileSync(join(process.cwd(), "src", "research", "progressClient.ts"), "utf8");
    expect(code).toContain("/api/v1/research/runs");
    expect(code).not.toMatch(/["'`](https?:)?\/\//);
    expect(code).not.toMatch(/\/internal\/|\/api\/v1\/alphas/);
  });

  it("polls at the contract's floor", () => {
    expect(POLL_FLOOR_MS).toBe(5000);
  });

  it("builds the stream URL from the client, not inline", () => {
    expect(progressApi.streamUrl("run_01", 40)).toBe(
      "/api/v1/research/runs/run_01/events?after_seq=40",
    );
    expect(progressApi.streamUrl("run_01", null)).toBe("/api/v1/research/runs/run_01/events");
  });
});
