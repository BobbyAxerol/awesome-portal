/**
 * P14 consumer tests — Screen 05 S1 Split.
 *
 * The claims that carry this phase:
 *
 *  - **No boundary is computed.** Every span drawn is a span the server sent;
 *    the only arithmetic is the percentage that places it on an axis.
 *  - **`NOT_ASSERTED` is not `NOT_PUBLISHED`.** The strict outer-OOS selector
 *    was neither passed nor failed, and the screen says exactly that.
 *  - **The holdout is described, never opened.** Metadata-bound is not sealed,
 *    semantic exclusion is not a physical attestation, and the unlock
 *    affordance cannot post anything.
 *  - **A sub-pixel window is still a window.** It is floored to a hairline and
 *    marked, rather than disappearing because the run was long.
 */
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  HOLDOUT_RULE_NO_READ,
  HOLDOUT_RULE_UNLOCK,
  SPLIT_RULES_BASE,
  SPLIT_RULES_FOLD_PLAN,
  SPLIT_SUBTITLE,
  SPLIT_TITLE,
  SplitScreen,
} from "./SplitDetail";
import {
  HAIRLINE_PERCENT,
  axisTicks,
  barsOf,
  hasRange,
  placeInTimeline,
  tickCountForWidth,
  toSplitRefusal,
  type CurrentSourceSplit,
  type SplitDetail,
} from "./splitClient";
import { DEFAULT_CURSOR } from "./evidenceCursor";
import { forgetSplitReads, splitState, useSplit } from "./useSplit";
import { SplitRoute } from "./SplitRoute";
import { clampFold, parseCursorNotes, seedCursor, useEvidenceCursor } from "./evidenceCursor";
import { monthTicks } from "./splitClient";
import { PortalApiError } from "../lib/api";
import { researchState } from "./state";

afterEach(cleanup);

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

const AVAILABLE = { state: "AVAILABLE", reason_code: null } as const;
const DAY = 86_400_000;
const T0 = Date.UTC(2024, 0, 1);

function absent(reason: string, state: "NOT_PUBLISHED" | "NOT_ASSERTED" = "NOT_PUBLISHED") {
  return { state, reason_code: reason, availability: { state: "NOT_PUBLISHED", reason_code: reason } } as const;
}

function detail(overrides: Partial<SplitDetail> = {}): SplitDetail {
  return {
    schema_version: "research.split-detail.v1",
    read_authority: "PORTAL_PERSISTED_RESEARCH",
    run_id: "R-WFO-118",
    revision: "p14r1_55aa10",
    etag: '"p14r1_55aa10"',
    availability: AVAILABLE,
    readiness: "COMPLETE",
    as_of_utc_ms: T0 + 900 * DAY,
    provenance: {
      source_adapter_id: "p04.delta-rsi.v1",
      engine_version: "1.1.1",
      input_scope: "P08_OPTIONAL_WARMUP_PLUS_IS_OOS_ONLY",
      source_transform_digest: "sha256:9f2c18",
      requested_spec_digest: "sha256:88ae02",
      effective_spec_digest: "sha256:88ae02",
      dataset_binding_digest: "sha256:5b31c7",
      manifest_digest: "sha256:c25a1d",
    },
    timeline: { start_utc_ms: T0, end_exclusive_utc_ms: T0 + 800 * DAY },
    protocol: {
      kind: "THREE_WINDOW_CURRENT",
      selection: {
        state: "FIXED_PROFILE_NO_SEARCH",
        parameter_bundle_digest: "sha256:bundle01",
        strict_outer_oos: absent("P04_FIXED_PROFILE_ASSERTS_NO_STRICT_SELECTOR", "NOT_ASSERTED"),
      },
      fold_plan: absent("P04_PUBLISHES_NO_FOLD_PLAN"),
      inner_folds: absent("P04_PUBLISHES_NO_INNER_FOLDS"),
      purge: absent("P04_PUBLISHES_NO_PURGE"),
      embargo: absent("P04_PUBLISHES_NO_EMBARGO"),
      theta_per_fold: absent("P04_PUBLISHES_NO_THETA_PER_FOLD"),
      gap_scan: absent("P08_PUBLISHES_NO_GAP_SCAN"),
    },
    windows: {
      warmup: {
        state: "AVAILABLE",
        start_utc_ms: T0,
        end_exclusive_utc_ms: T0 + 1 * DAY,
        bars: 6,
        data_role: "WARMUP_NOT_SCORED",
        child_input_state: "EXPOSED_TO_CHILD_TAPE",
        availability: AVAILABLE,
      },
      is: {
        start_utc_ms: T0 + 1 * DAY,
        end_exclusive_utc_ms: T0 + 500 * DAY,
        bars: 2994,
        data_role: "IS_CALIBRATION_HISTORY",
        child_input_state: "EXPOSED_TO_CHILD_TAPE",
        availability: AVAILABLE,
      },
      outer_oos: {
        start_utc_ms: T0 + 500 * DAY,
        end_exclusive_utc_ms: T0 + 700 * DAY,
        bars: 1200,
        data_role: "OUTER_OOS_OBSERVATION",
        child_input_state: "EXPOSED_TO_CHILD_TAPE",
        evaluation_state: "P04_OBSERVED_AFTER_FIXED_PROFILE",
        availability: AVAILABLE,
      },
      holdout: {
        start_utc_ms: T0 + 700 * DAY,
        end_exclusive_utc_ms: T0 + 800 * DAY,
        bars: null,
        data_role: "HOLDOUT",
        child_input_state: "NOT_EXPOSED_TO_CHILD_TAPE",
        evaluation_state: "NOT_EVALUATED",
        result_exposure_state: "NOT_EXPOSED",
        snapshot_integrity_state: "P08_METADATA_BOUND",
        physical_io: {
          state: "NOT_ATTESTED",
          reason_code: "P10_ROW_GROUP_PHYSICAL_IO_BOUNDARY_NOT_PUBLISHED",
        },
        source_seal: absent("P08_PUBLISHES_NO_SEAL_RECORD"),
        unlock: absent("P14_PUBLISHES_NO_UNLOCK_RECORD"),
        availability: AVAILABLE,
      },
    },
    actions: {
      holdout_unlock: {
        state: "NOT_PUBLISHED",
        href: null,
        availability: { state: "NOT_PUBLISHED", reason_code: "P14_PUBLISHES_NO_UNLOCK_ACTION" },
      },
    },
    source_absences: {
      physical_holdout_io: absent("P10_ROW_GROUP_PHYSICAL_IO_BOUNDARY_NOT_PUBLISHED"),
    },
    ...overrides,
  } as SplitDetail;
}

function sourceSplit(): CurrentSourceSplit {
  return {
    read_authority: "PORTAL_RETAINED_CURRENT_SOURCE",
    run_id: "R-WFO-118",
    revision: "rs02r1_9c",
    etag: '"rs02r1_9c"',
    availability: { state: "AVAILABLE", reason_code: null },
    as_of_utc_ms: T0 + 900 * DAY,
    provenance: {
      source_adapter_id: "rs02.quantbt-advanced-wfo.v1",
      profile_id: "rs02.delta-wfo-global.v1",
      engine_version: "1.1.1",
      source_manifest_digest: "sha256:m1",
      source_transform_digest: "sha256:t1",
      retained_import_digest: "sha256:r1",
      requested_spec_digest: "sha256:q1",
      effective_spec_digest: "sha256:e1",
      dataset_binding_digest: "sha256:d1",
      retained_at_utc_ms: T0 + 890 * DAY,
    },
    schema_version: "research.current-source-split.v1",
    fold_plan: {
      state: "AVAILABLE",
      folds: [
        {
          source_ordinal: 0,
          fold_id: "fold_01",
          train_start_utc_ms: T0,
          train_end_utc_ms: T0 + 200 * DAY,
          test_start_utc_ms: T0 + 200 * DAY,
          test_end_utc_ms: T0 + 260 * DAY,
        },
        {
          source_ordinal: 1,
          fold_id: "fold_02",
          train_start_utc_ms: T0,
          train_end_utc_ms: T0 + 300 * DAY,
          test_start_utc_ms: T0 + 300 * DAY,
          test_end_utc_ms: T0 + 360 * DAY,
        },
        {
          source_ordinal: 2,
          fold_id: "fold_03",
          train_start_utc_ms: null,
          train_end_utc_ms: null,
          test_start_utc_ms: T0 + 400 * DAY,
          test_end_utc_ms: T0 + 460 * DAY,
        },
      ],
      chronology: "SOURCE_OBSERVED_ADVANCED_WFO",
      availability: { state: "AVAILABLE", reason_code: null },
    },
    data_use: {
      warmup: { state: "NOT_PUBLISHED", reason_code: "X", availability: { state: "NOT_PUBLISHED", reason_code: "X" } },
      purge: { state: "NOT_PUBLISHED", reason_code: "X", availability: { state: "NOT_PUBLISHED", reason_code: "X" } },
      embargo: { state: "NOT_PUBLISHED", reason_code: "X", availability: { state: "NOT_PUBLISHED", reason_code: "X" } },
      strict_outer_oos_selection: {
        state: "NOT_PUBLISHED",
        reason_code: "X",
        availability: { state: "NOT_PUBLISHED", reason_code: "X" },
      },
    },
  } as unknown as CurrentSourceSplit;
}

const OK = researchState({ kind: "ok", rowCount: 1 });

function view(overrides: Partial<React.ComponentProps<typeof SplitScreen>> = {}) {
  return render(
    <MemoryRouter>
      <SplitScreen
        runId="R-WFO-118"
        detail={detail()}
        state={OK}
        cursor={DEFAULT_CURSOR}
        onFold={vi.fn()}
        folds={{ state: "not-applicable", reason: "P04_PUBLISHES_NO_FOLD_PLAN" }}
        ensureFolds={vi.fn()}
        onReread={vi.fn()}
        {...overrides}
      />
    </MemoryRouter>,
  );
}

let requested: string[] = [];

function stub(responder: (url: string) => [number, unknown]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      requested.push(url);
      const [status, payload] = responder(url);
      return {
        ok: status >= 200 && status < 300,
        status,
        statusText: String(status),
        headers: new Headers(),
        json: async () => payload,
      } as unknown as Response;
    }),
  );
}

beforeEach(() => {
  requested = [];
  vi.unstubAllGlobals();
  forgetSplitReads();
});

/* -------------------------------------------------------------------------
 * P14-T01 — geometry, not derivation
 * ---------------------------------------------------------------------- */

describe("P14-T01 — a span is placed, never recomputed", () => {
  const timeline = { start_utc_ms: 0, end_exclusive_utc_ms: 1000 };

  it("places a span by its own endpoints", () => {
    expect(placeInTimeline(timeline, { start_utc_ms: 250, end_exclusive_utc_ms: 500 })).toEqual({
      leftPercent: 25,
      widthPercent: 25,
    });
  });

  it("clamps a span that runs past the axis instead of stretching it", () => {
    const placed = placeInTimeline(timeline, { start_utc_ms: 900, end_exclusive_utc_ms: 5000 });
    expect(placed.leftPercent).toBe(90);
    expect(placed.leftPercent + placed.widthPercent).toBeLessThanOrEqual(100);
  });

  it("returns nothing for a timeline with no extent rather than dividing by zero", () => {
    expect(placeInTimeline({ start_utc_ms: 5, end_exclusive_utc_ms: 5 }, timeline)).toEqual({
      leftPercent: 0,
      widthPercent: 0,
    });
  });

  it("knows a window that carries a range from one that carries a reason", () => {
    const document = detail();
    expect(hasRange(document.windows.is)).toBe(true);
    expect(barsOf(document.windows.is)).toBe(2994);
    // The holdout publishes a range and a null bar count: both are facts.
    expect(hasRange(document.windows.holdout)).toBe(true);
    expect(barsOf(document.windows.holdout)).toBeNull();
  });

  /*
   * The P14 ruling of 2026-09-23 allows UTC tick labels as presentation. What
   * it forbids is a tick becoming a fact, so that is what these pin.
   */
  it("places every tick inside the published range, endpoints included", () => {
    const ticks = axisTicks({ start_utc_ms: T0, end_exclusive_utc_ms: T0 + 800 * DAY }, 5);
    expect(ticks).toHaveLength(5);
    expect(ticks[0].at_utc_ms).toBe(T0);
    expect(ticks[4].at_utc_ms).toBe(T0 + 800 * DAY);
    for (const tick of ticks) {
      expect(tick.at_utc_ms).toBeGreaterThanOrEqual(T0);
      expect(tick.at_utc_ms).toBeLessThanOrEqual(T0 + 800 * DAY);
    }
  });

  it("labels every tick in UTC, never in the reader's zone", () => {
    const ticks = axisTicks({ start_utc_ms: Date.UTC(2024, 0, 1), end_exclusive_utc_ms: Date.UTC(2024, 0, 3) }, 3);
    // A reader in UTC-5 would see 2023-12-31 for the first instant if the
    // label followed the browser; it does not.
    expect(ticks[0].label).toBe("2024-01-01");
    expect(ticks[2].label).toBe("2024-01-03");
    for (const tick of ticks) expect(tick.label).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("thins the ticks at narrow widths and changes nothing else", () => {
    expect(tickCountForWidth(1280)).toBe(5);
    expect(tickCountForWidth(660)).toBe(3);
    expect(tickCountForWidth(420)).toBe(2);

    const timeline = { start_utc_ms: T0, end_exclusive_utc_ms: T0 + 800 * DAY };
    const wide = axisTicks(timeline, tickCountForWidth(1280));
    const narrow = axisTicks(timeline, tickCountForWidth(660));
    // Fewer labels, same endpoints: the coordinate system does not move.
    expect(narrow.length).toBeLessThan(wide.length);
    expect(narrow[0].at_utc_ms).toBe(wide[0].at_utc_ms);
    expect(narrow[narrow.length - 1].at_utc_ms).toBe(wide[wide.length - 1].at_utc_ms);
  });

  it("refuses to invent a tick for a timeline with no extent", () => {
    expect(axisTicks({ start_utc_ms: 5, end_exclusive_utc_ms: 5 }, 5)).toEqual([]);
    expect(axisTicks({ start_utc_ms: 0, end_exclusive_utc_ms: 100 }, 1)).toEqual([]);
  });

  it("keeps ticks out of the cursor, the request and every retained fact", () => {
    const code = codeOf("SplitDetail.tsx") + codeOf("splitClient.ts") + codeOf("useSplit.ts");
    // A tick is never serialized anywhere.
    expect(code).not.toMatch(/tick[^\n]*(hash|cursor|searchParams|fetch|body|export)/i);
    expect(code).not.toMatch(/(hash|cursor|query)[^\n]*tick/i);
    // And never uses the reader's clock.
    expect(code).not.toMatch(/Date\.now\(\)|toLocaleDateString|toLocaleString/);
  });

  it("adds no interval arithmetic anywhere in the screen", () => {
    const code = codeOf("SplitDetail.tsx") + codeOf("splitClient.ts");
    // No hour/day constants, and no date being moved by one.
    expect(code).not.toMatch(/86[_ ]?400[_ ]?000|3[_ ]?600[_ ]?000\b/);
    expect(code).not.toMatch(/setUTCHours|setDate|addDays|\+\s*24\s*\*/);
  });
});

/* -------------------------------------------------------------------------
 * P14-T02 — windows and the sub-pixel rule
 * ---------------------------------------------------------------------- */

describe("P14-T02 — every published window is drawn and labelled", () => {
  it("draws warmup, IS and outer OOS with their own spans and bars", () => {
    const { container } = view();
    expect(container.querySelector("[data-window='warmup']")).toBeTruthy();
    expect(container.querySelector("[data-window='is']")).toBeTruthy();
    expect(container.querySelector("[data-window='outer_oos']")).toBeTruthy();
    expect(container.querySelector("[data-window-legend='is']")?.textContent).toContain("2,994 bars");
  });

  it("marks a window too thin to see rather than dropping it", () => {
    const { container } = view();
    // Warmup is one day of eight hundred: far below a pixel.
    const warmup = container.querySelector("[data-window='warmup']") as HTMLElement;
    expect(warmup.getAttribute("data-hairline")).toBe("true");
    expect(warmup.style.width).toBe(`${HAIRLINE_PERCENT}%`);
    expect(container.querySelector("[data-hairline-badge='warmup']")).toBeTruthy();
  });

  it("names a warmup the run did not request as not applicable", () => {
    const { container } = view({
      detail: detail({
        windows: {
          ...detail().windows,
          warmup: {
            state: "NOT_APPLICABLE",
            bars: 0,
            reason_code: "P08_WARMUP_NOT_REQUESTED",
            availability: { state: "NOT_APPLICABLE", reason_code: "P08_WARMUP_NOT_REQUESTED" },
          },
        },
      } as Partial<SplitDetail>),
    });
    expect(container.querySelector("[data-window='warmup']")).toBeNull();
    const absence = container.querySelector("[data-absent='warmup'] [data-withheld]");
    expect(absence?.getAttribute("data-withheld")).toBe("NOT_APPLICABLE");
    expect(absence?.textContent).toContain("not applicable");
  });
});

/* -------------------------------------------------------------------------
 * P14-T03 — the holdout
 * ---------------------------------------------------------------------- */

describe("P14-T03 — the holdout is described, never opened", () => {
  it("uses the server's integrity word, not the hi-fi's", () => {
    const { container } = view();
    expect(container.querySelector("[data-holdout-integrity='P08_METADATA_BOUND']")).toBeTruthy();
    // "SEALED" would assert a seal record the contract says it does not publish.
    expect(container.querySelector("[data-holdout]")?.textContent).not.toMatch(/\bSEALED\b/);
  });

  it("keeps evaluation and exposure as separate published facts", () => {
    const { container } = view();
    expect(container.querySelector("[data-holdout-evaluation='NOT_EVALUATED']")).toBeTruthy();
    expect(container.querySelector("[data-holdout-exposure='NOT_EXPOSED_TO_CHILD_TAPE']")).toBeTruthy();
  });

  it("says a semantic exclusion is not a physical attestation", () => {
    const { container } = view();
    const physical = container.querySelector("[data-absent='physical I/O attestation']");
    // The server's own word for it: NOT_ATTESTED.
    expect(physical?.textContent).toContain("not attested");
    expect(physical?.querySelector("[title]")?.getAttribute("title")).toBe(
      "P10_ROW_GROUP_PHYSICAL_IO_BOUNDARY_NOT_PUBLISHED",
    );
  });

  it("offers an unlock that cannot post", () => {
    const { container } = view();
    const unlock = container.querySelector("[data-action-unlock]");
    expect(unlock?.getAttribute("data-action-unlock")).toBe("NOT_PUBLISHED");
    expect(unlock?.tagName).toBe("SPAN");
    expect(container.querySelector("button[data-action-unlock]")).toBeNull();
    expect(container.querySelector("a[data-action-unlock]")).toBeNull();
  });

  it("keeps the rule that holds whatever the source published, and no unlock workflow it did not", () => {
    const { container } = view();
    expect(screen.getByText(HOLDOUT_RULE_NO_READ)).toBeTruthy();
    // RF-06 DQ-15: the unlock record and authority are not published, so the
    // sentence describing an unlock workflow is not shown as fact.
    expect(screen.queryByText(HOLDOUT_RULE_UNLOCK)).toBeNull();
    const unlock = container.querySelector("[data-action-unlock]");
    expect(unlock?.getAttribute("aria-disabled")).toBe("true");
    expect(unlock?.getAttribute("title")).toContain("Screen 10 (P19)");
  });

  it("claims no certificate cap, because none is published here", () => {
    const { container } = view();
    expect(container.querySelector("[data-holdout]")?.textContent).not.toMatch(/cap|≤ B|certificate/i);
  });
});

/* -------------------------------------------------------------------------
 * P14-T04 — NOT_ASSERTED
 * ---------------------------------------------------------------------- */

describe("P14-T04 — an unasserted selector is neither a pass nor a gap", () => {
  it("prints its own word", () => {
    const { container } = view();
    const strict = container.querySelector("[data-absent='strict outer OOS']");
    expect(strict?.getAttribute("data-absent-state")).toBe("NOT_ASSERTED");
    expect(strict?.textContent).toContain("not asserted");
    expect(strict?.textContent).not.toContain("not published");
  });

  it("shows no verdict badge for it", () => {
    const { container } = view();
    expect(container.querySelector("[data-verdict]")).toBeNull();
    expect(container.querySelector("[data-protocol-strip]")?.textContent).not.toMatch(/PASS|FAIL/);
  });

  it("states every protocol absence exactly once, with its reason (FE-S05-06)", () => {
    const { container } = view();
    for (const name of ["fold plan", "inner folds", "purge", "embargo", "θ* per fold", "gap scan", "strict outer OOS", "source seal", "unlock record", "physical I/O attestation"]) {
      expect(container.querySelectorAll(`[data-absent="${name}"]`), name).toHaveLength(1);
    }
    // source_absences repeats names already stated; they are not printed again.
    expect(container.querySelector("[data-source-absences]")).toBeNull();
  });
});

/* -------------------------------------------------------------------------
 * P14-T05 — folds from the retained source
 * ---------------------------------------------------------------------- */

describe("P14-T05 — folds come from the one operation that publishes them", () => {
  it("draws a row per observed fold and marks the cursor's", () => {
    const { container } = view({
      folds: { state: "ready", split: sourceSplit() },
      cursor: { ...DEFAULT_CURSOR, fold: 2 },
    });
    expect(container.querySelectorAll("[data-fold-row]")).toHaveLength(3);
    expect(container.querySelector("[data-fold-row='2']")?.getAttribute("data-current")).toBe("true");
    expect(container.querySelector("[data-fold-count]")?.textContent).toContain("3 folds observed");
  });

  it("says which fold published no boundary instead of drawing one", () => {
    const { container } = view({ folds: { state: "ready", split: sourceSplit() } });
    const third = container.querySelector("[data-fold-row='3']");
    expect(third?.querySelector("[data-fold-partial]")).toBeTruthy();
    expect(third?.querySelector("[data-fold-segment='train']")).toBeNull();
    expect(third?.querySelector("[data-fold-segment='test']")).toBeTruthy();
  });

  it("moves the cursor when a row is clicked", () => {
    const onFold = vi.fn();
    const { container } = view({ folds: { state: "ready", split: sourceSplit() }, onFold });
    fireEvent.click(container.querySelector("[data-fold-row='2']") as Element);
    expect(onFold).toHaveBeenCalledWith(2);
  });

  it("keeps a profile refusal inside the fold panel", () => {
    const { container } = view({
      folds: {
        state: "refused",
        refusal: toSplitRefusal(new PortalApiError("Not an admitted profile.", 404, "NOT_ADMITTED", null)),
      },
    });
    expect(container.querySelector("[data-fold-refusal]")?.textContent).toContain("Not an admitted profile.");
    // The windows above it are untouched.
    expect(container.querySelector("[data-window-anatomy]")).toBeTruthy();
    expect(container.querySelector("[data-holdout]")).toBeTruthy();
  });
});

/* -------------------------------------------------------------------------
 * P14-T06 — reads and refusals
 * ---------------------------------------------------------------------- */

describe("P14-T06 — one split read, one optional fold read", () => {
  it("reads the split on mount and asks the fold lane once, only when it can apply", async () => {
    const admitted = detail({
      protocol: {
        ...detail().protocol,
        selection: { ...detail().protocol.selection, state: "NOT_PUBLISHED" },
      },
    } as Partial<SplitDetail>);
    stub((url) => (url.includes("current-source") ? [200, sourceSplit()] : [200, admitted]));
    const { result } = renderHook(() => useSplit("R-WFO-118"));
    await waitFor(() => expect(result.current.detail).not.toBeNull());
    expect(requested).toEqual(["/api/v1/quantbt/runs/R-WFO-118/split"]);

    await act(async () => {
      result.current.ensureFolds();
      result.current.ensureFolds();
    });
    await waitFor(() => expect(result.current.folds.state).toBe("ready"));
    expect(requested.filter((url) => url.includes("current-source/split"))).toHaveLength(1);
  });

  it("FE-S05-02 / FE-X-12: never asks the fold lane for a fixed profile", async () => {
    stub(() => [200, detail()]);
    const { result } = renderHook(() => useSplit("R-WFO-118"));
    await waitFor(() => expect(result.current.detail).not.toBeNull());
    await act(async () => {
      result.current.ensureFolds();
    });
    expect(result.current.folds.state).toBe("not-applicable");
    expect(requested.filter((url) => url.includes("current-source"))).toHaveLength(0);
  });

  it("sends the ETag on a reread and keeps the copy on 304", async () => {
    let reads = 0;
    stub(() => {
      reads += 1;
      return reads === 1 ? [200, detail()] : [304, null];
    });
    const { result } = renderHook(() => useSplit("R-WFO-118"));
    await waitFor(() => expect(result.current.detail).not.toBeNull());
    const first = result.current.detail;

    await act(async () => result.current.reread());
    await waitFor(() => expect(reads).toBe(2));
    expect(result.current.detail).toBe(first);
  });

  it("classifies each refusal the contract declares", () => {
    const of = (status: number) => toSplitRefusal(new PortalApiError("no", status, null, null));
    expect(of(401).state).toBe("denied");
    expect(of(404).state).toBe("terminal");
    expect(of(409).state).toBe("stale");
    expect(of(503).state).toBe("unavailable");
    expect(of(400).state).toBe("terminal");
  });

  it("keeps the shell and the footer when the read is refused", () => {
    const { container } = view({
      detail: null,
      state: { state: "denied", reason: "Not your workspace.", mayRetry: false, retainsContent: false },
    });
    expect(container.querySelector("[data-screen='split-detail']")).toBeTruthy();
    expect(container.querySelector("[data-rules-footer]")).toBeTruthy();
    expect(screen.getAllByText("Not your workspace.").length).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------
 * P14-T07 — the boundary
 * ---------------------------------------------------------------------- */

describe("P14-T07 — the surface requests only the two named operations", () => {
  it("names only the published paths", () => {
    const code = codeOf("splitClient.ts");
    const paths = [...code.matchAll(/["'`](\/api\/[^"'`$]*)/g)].map((match) => match[1]);
    expect([...new Set(paths)]).toEqual(["/api/v1/quantbt/runs"]);
    expect(code).not.toMatch(/\/internal\/|parquet|artifact|fold_plan\.json|journal/i);
  });

  it("keeps the HiFi title and subtitle, and the footer sentence that is always true", () => {
    const { container } = view();
    expect(screen.getByText(SPLIT_TITLE)).toBeTruthy();
    expect(screen.getByText(SPLIT_SUBTITLE)).toBeTruthy();
    expect(container.querySelector("[data-rules-footer]")?.textContent).toBe(SPLIT_RULES_BASE);
  });

  it("carries the cursor back to the hub", () => {
    const { container } = view({ cursor: { ...DEFAULT_CURSOR, stage: "split", fold: 4 } });
    const back = container.querySelector("[data-action='back-to-hub']");
    expect(back?.getAttribute("href")).toContain("/runs/R-WFO-118/evidence#");
    expect(back?.getAttribute("href")).toContain("fold=4");
  });
});


/* -------------------------------------------------------------------------
 * RF-06 — cursor, states, reads and HiFi shells (each fails on the P14 build)
 * ---------------------------------------------------------------------- */

function mountRoute(hash: string, path = "/research/quantbt/runs/R-WFO-118/split") {
  window.history.replaceState(null, "", `${path}${hash}`);
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/research/quantbt/runs/:runId/split" element={<SplitRoute />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RF-06 FE-X-10 / FE-S05-01 — the screen's own stage seeds the cursor", () => {
  it("a hash with no stage opens on the screen's stage, not the hub's summary", () => {
    expect(seedCursor("", { ...DEFAULT_CURSOR, stage: "split" }).cursor.stage).toBe("split");
    expect(seedCursor("#fold=3", { ...DEFAULT_CURSOR, stage: "split" }).cursor).toMatchObject({ stage: "split", fold: 3 });
    // A stage the hash names still wins.
    expect(seedCursor("#stage=claim&fold=2", { ...DEFAULT_CURSOR, stage: "split" }).cursor.stage).toBe("claim");
  });

  it("the hook writes the seeded stage, so the way back lands on the split tab", () => {
    window.history.replaceState(null, "", "/research/quantbt/runs/R-WFO-118/split");
    const { result } = renderHook(() => useEvidenceCursor({ stage: "split" }));
    expect(result.current.cursor.stage).toBe("split");
    expect(window.location.hash).toBe("#stage=split&fold=1");
  });

  it("an edited hash without a stage keeps the stage in hand", () => {
    window.history.replaceState(null, "", "/x#stage=split&fold=1");
    const { result } = renderHook(() => useEvidenceCursor({ stage: "split" }));
    act(() => {
      window.history.replaceState(null, "", "/x#fold=4");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(result.current.cursor).toMatchObject({ stage: "split", fold: 4 });
  });

  it("bare /split: Evidence Flow carries stage=split, next-stage carries stage=search", async () => {
    stub(() => [200, detail()]);
    const { container } = mountRoute("");
    await waitFor(() => expect(container.querySelector("[data-card='fold-construction']")).toBeTruthy());
    expect(container.querySelector("[data-action='back-to-hub']")?.getAttribute("href")).toBe(
      "/research/quantbt/runs/R-WFO-118/evidence#stage=split&fold=1",
    );
    expect(container.querySelector("[data-action='next-stage']")?.getAttribute("href")).toBe(
      "/research/quantbt/runs/R-WFO-118/search#stage=search&fold=1",
    );
  });
});

describe("RF-06 FE-S04-06 — an unobserved fold is clamped, with a notice", () => {
  it("follows golden cases 8 and 9", () => {
    expect(clampFold(99, [1, 2, 3, 4, 5])).toEqual({
      fold: 5,
      note: { code: "CURSOR_FOLD_CLAMPED", from: 99, to: 5, reason: "BEYOND_LAST" },
    });
    expect(seedCursor("#fold=0", DEFAULT_CURSOR).cursor.fold).toBe(1);
    expect(parseCursorNotes("#fold=0")).toEqual([{ code: "CURSOR_FOLD_CLAMPED", from: 0, to: 1, reason: "BELOW_FIRST" }]);
    expect(clampFold(3, [1, 2, 4]).fold).toBe(2);
    // No observed set: nothing to clamp against, nothing invented.
    expect(clampFold(40, [])).toEqual({ fold: 40, note: null });
    expect(clampFold(3, [1, 2, 3])).toEqual({ fold: 3, note: null });
  });

  it("clamps on the route once the retained source publishes its folds", async () => {
    const admitted = detail({
      protocol: { ...detail().protocol, selection: { ...detail().protocol.selection, state: "NOT_PUBLISHED" } },
    } as Partial<SplitDetail>);
    stub((url) => (url.includes("current-source") ? [200, sourceSplit()] : [200, admitted]));
    const { container } = mountRoute("#stage=split&fold=9");
    await waitFor(() => expect(window.location.hash).toBe("#stage=split&fold=3"));
    expect(container.querySelector("[data-cursor-note='CURSOR_FOLD_CLAMPED']")?.textContent).toContain("fold 9");
    expect(container.querySelector("[data-fold-row='3']")?.getAttribute("data-current")).toBe("true");
  });
});

describe("RF-06 FE-S05-02 — the fold lane is not asked for a fixed profile", () => {
  it("mounting the route issues one split read and no current-source read", async () => {
    stub(() => [200, detail()]);
    const { container } = mountRoute("#stage=split&fold=1");
    await waitFor(() => expect(container.querySelector("[data-fold-anatomy='not-applicable']")).toBeTruthy());
    expect(requested).toEqual(["/api/v1/quantbt/runs/R-WFO-118/split"]);
    expect(container.querySelector("[data-absent-reason='fold plan']")?.textContent).toBe("P04_PUBLISHES_NO_FOLD_PLAN");
  });
});

describe("RF-06 FE-S05-04 — pending ≠ empty, 404 ≠ empty, first-read 409 ≠ stale", () => {
  it("a source that has not reported is partial, never empty", () => {
    const pending = detail({ readiness: "NOT_READY", availability: { state: "PENDING_SOURCE_CALLBACK", reason_code: "P04_PENDING" } });
    expect(splitState(pending, null).state).toBe("partial");
    expect(splitState(pending, null).retainsContent).toBe(true);
  });

  it("a first-read 409 is a retryable failure, not stale", () => {
    const refusal = toSplitRefusal(new PortalApiError("conflict", 409, null, null));
    expect(splitState(null, refusal).state).toBe("failed-retryable");
    expect(splitState(null, refusal).mayRetry).toBe(true);
  });

  it("a 404 is terminal and leads back to the Run Library, with no live stage links", async () => {
    stub(() => [404, { error: { code: "RESEARCH_SPLIT_NOT_FOUND", message: "Research run was not found." } }]);
    const { container } = mountRoute("");
    await waitFor(() => expect(container.querySelector("[data-run-not-found]")).toBeTruthy());
    expect(container.querySelector("[data-state]")?.getAttribute("data-state")).toBe("terminal");
    expect(container.querySelector("[data-action='run-library']")?.getAttribute("href")).toBe("/research/quantbt/runs");
    expect(container.querySelector("[data-action='next-stage']")).toBeNull();
    expect(container.querySelector("[data-action='back-to-hub']")).toBeNull();
  });
});

describe("RF-06 FE-S05-08 — a revisit revalidates instead of re-reading", () => {
  it("shows the accepted split immediately and sends its ETag", async () => {
    const seen: (HeadersInit | undefined)[] = [];
    let reads = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        seen.push(init?.headers);
        reads += 1;
        const status = reads === 1 ? 200 : 304;
        return { ok: status === 200, status, statusText: "", headers: new Headers(), json: async () => detail() } as unknown as Response;
      }),
    );
    const first = renderHook(() => useSplit("R-WFO-118"));
    await waitFor(() => expect(first.result.current.detail).not.toBeNull());
    first.unmount();

    const second = renderHook(() => useSplit("R-WFO-118"));
    expect(second.result.current.detail).not.toBeNull();
    expect(second.result.current.state.state).not.toBe("loading");
    await waitFor(() => expect(reads).toBe(2));
    expect(seen[1]).toEqual({ "If-None-Match": '"p14r1_55aa10"' });
  });
});

describe("RF-06 FE-S05-03 — copy asserts only what the run published", () => {
  it("claims no sealed holdout, fold_plan source or true-scale purge", () => {
    const { container } = view();
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/sealed holdout|fold_plan artifact|true scale|\bSEALED\b|cert cap: ≤/i);
    expect(text).not.toContain(SPLIT_RULES_FOLD_PLAN);
  });

  it("adds the fold-plan sentence only when a fold plan was published", () => {
    const { container } = view({ folds: { state: "ready", split: sourceSplit() } });
    expect(container.querySelector("[data-rules-footer]")?.textContent).toContain(SPLIT_RULES_FOLD_PLAN);
  });
});

describe("RF-06 FE-S05-05…08 — the HiFi frames stay, as shells", () => {
  it("keeps fold construction, θ* flow, fold table and the three cards", () => {
    const { container } = view();
    for (const card of ["fold-construction", "theta-flow", "fold-table", "boundary-integrity", "stitched-oos", "feeds-forward"]) {
      expect(container.querySelector(`[data-card='${card}']`), card).toBeTruthy();
    }
    // Screen 08 is not built: named with its phase, not linked.
    const next = container.querySelector("[data-next-execute]");
    expect(next?.tagName).toBe("SPAN");
    expect(next?.textContent).toContain("P17");
  });

  it("prints as-of in UTC minutes and digests shortened, the exact value in the title", () => {
    const { container } = view();
    const asOf = container.querySelector("[data-as-of]");
    expect(asOf?.textContent).toMatch(/as-of \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC/);
    expect(asOf?.textContent).not.toMatch(/\.\d{3}Z/);
    const bundle = container.querySelector("[data-bundle-digest]");
    expect(bundle?.getAttribute("title")).toBe("sha256:bundle01");
    expect(container.querySelector("[data-action='copy-evidence-link']")).toBeTruthy();
  });

  it("paints warmup grey, never in the holdout's colour, and labels each segment for a screen reader", () => {
    const { container } = view();
    const warmup = container.querySelector("[data-window='warmup']") as HTMLElement;
    expect(warmup.style.background).not.toContain("--role-holdout");
    for (const key of ["warmup", "is", "outer_oos", "holdout"]) {
      const segment = container.querySelector(`[data-window='${key}']`);
      expect(segment?.getAttribute("role"), key).toBe("img");
      expect(segment?.getAttribute("aria-label"), key).toBeTruthy();
    }
  });

  it("puts axis marks on UTC month starts inside the published range", () => {
    const timeline = { start_utc_ms: Date.UTC(2026, 3, 18, 12), end_exclusive_utc_ms: Date.UTC(2026, 7, 15) };
    const marks = monthTicks(timeline, 12);
    expect(marks.map((mark) => mark.label)).toEqual(["2026-05", "2026-06", "2026-07", "2026-08"]);
    for (const mark of marks) {
      expect(new Date(mark.at_utc_ms).getUTCDate()).toBe(1);
      expect(mark.at_utc_ms).toBeGreaterThanOrEqual(timeline.start_utc_ms);
      expect(mark.at_utc_ms).toBeLessThan(timeline.end_exclusive_utc_ms);
    }
    expect(monthTicks(timeline, 2).length).toBeLessThanOrEqual(2);
  });
});
