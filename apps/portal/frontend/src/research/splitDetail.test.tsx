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
  COPY_DONE_LABEL,
  COPY_RESET_MS,
  foldKeyTarget,
  halfOpen,
  halfOpenShort,
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
  type LaneNotApplicable,
  type SplitDetail,
} from "./splitClient";
import { DEFAULT_CURSOR } from "./evidenceCursor";
import { forgetSplitReads, splitState, useSplit } from "./useSplit";
import { SplitRoute } from "./SplitRoute";
import {
  clampFold,
  forgetObservedFolds,
  observedFoldsFor,
  parseCursorNotes,
  rememberObservedFolds,
  seedCursor,
  useEvidenceCursor,
} from "./evidenceCursor";
import { monthTicks } from "./splitClient";
import { PortalApiError } from "../lib/api";
import { researchState } from "./state";
import { HUB_LANE_REASON, forgetRunIdentities } from "./retainedLane";

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

/** RF-05 CG-P14-03: a fact the three-window protocol has no place for. */
function notApplicable(reason: string) {
  return { state: "NOT_APPLICABLE", reason_code: reason, availability: { state: "NOT_APPLICABLE", reason_code: reason } } as const;
}

/** The absence_index the live preview serves for a completed three-window run (rrun_3935…, 2026-09-24). */
const ABSENCE_INDEX = [
  { key: "strict_outer_oos", pointer: "/protocol/selection/strict_outer_oos", state: "NOT_ASSERTED" },
  { key: "fold_plan", pointer: "/protocol/fold_plan", state: "NOT_PUBLISHED" },
  { key: "inner_folds", pointer: "/protocol/inner_folds", state: "NOT_APPLICABLE" },
  { key: "purge", pointer: "/protocol/purge", state: "NOT_APPLICABLE" },
  { key: "embargo", pointer: "/protocol/embargo", state: "NOT_APPLICABLE" },
  { key: "theta_per_fold", pointer: "/protocol/theta_per_fold", state: "NOT_PUBLISHED" },
  { key: "gap_scan", pointer: "/protocol/gap_scan", state: "NOT_PUBLISHED" },
  { key: "holdout_seal", pointer: "/windows/holdout/source_seal", state: "NOT_PUBLISHED" },
  { key: "holdout_unlock", pointer: "/windows/holdout/unlock", state: "NOT_PUBLISHED" },
  { key: "holdout_bars", pointer: "/windows/holdout/bars_absence", state: "NOT_PUBLISHED" },
] as const;

/** The typed 200 the RS-02 lane answers for a P04 fixed-qualification run. */
function laneAnswer(operation: "split" | "search" = "split"): LaneNotApplicable {
  return {
    schema_version: "research.current-source-not-applicable.v1",
    read_authority: "PORTAL_RETAINED_CURRENT_SOURCE",
    run_id: "R-WFO-118",
    revision: "rs02_not-applicable_b31f",
    etag: '"rs02_not-applicable_b31f"',
    availability: { state: "NOT_APPLICABLE", reason_code: "RS02_RETAINED_LANE_NOT_APPLICABLE_TO_P04_FIXED_QUALIFICATION" },
    lane: {
      state: "NOT_APPLICABLE",
      operation,
      run_profile: "P04_FIXED_QUALIFICATION",
      run_adapter_contract_digest: "9ade757b5c1cd87681a2efb49011c84a96211939710dcd32c9fd1c7777e95784",
      retainable_profile_id: "rs02.delta-wfo-global.v1",
      reason_code: "RS02_RETAINED_LANE_NOT_APPLICABLE_TO_P04_FIXED_QUALIFICATION",
    },
  };
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
    as_of_basis: "P14_PROJECTION_RECEIVED_AT",
    dataset: {
      state: "AVAILABLE",
      dataset_id: "crypto-binance-1m",
      symbol: "BTCUSDT",
      timeframe: "1h",
      bar_interval_ms: 3_600_000,
      provenance: "P08_DATASET_BINDING",
      reason_code: null,
      availability: AVAILABLE,
    },
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
      inner_folds: notApplicable("P14_THREE_WINDOW_PROTOCOL_HAS_NO_INNER_FOLDS"),
      purge: notApplicable("P14_THREE_WINDOW_PROTOCOL_HAS_NO_PURGE"),
      embargo: notApplicable("P14_THREE_WINDOW_PROTOCOL_HAS_NO_EMBARGO"),
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
        bars_absence: absent("P10_HOLDOUT_BARS_NOT_COUNTED_OUTSIDE_CHILD_TAPE"),
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
    absence_authority: "FIELD_LOCAL",
    absence_index: ABSENCE_INDEX.map((entry) => ({ ...entry })),
    /* Deprecated (RF-05 CG-P14-06) and deliberately contradictory here: the
       screen must not read it, so anything it says must never reach the page. */
    source_absences: {
      physical_holdout_io: absent("P10_ROW_GROUP_PHYSICAL_IO_BOUNDARY_NOT_PUBLISHED"),
      deprecated_decoy: absent("DEPRECATED_SOURCE_ABSENCES_MUST_NOT_RENDER"),
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
        folds={{ state: "not-applicable", answer: laneAnswer() }}
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
    // W3b: Screen 10 exists now — the title names it, and no "not built" copy remains.
    expect(unlock?.getAttribute("title")).toContain("Screen 10 · Attempt Lineage");
    expect(container.textContent).not.toMatch(/not built|P19\)/);
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
        laneState: null,
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

  it("RF-05: the fold lane's own typed 200 decides not-applicable — no skip inferred from the split", async () => {
    stub((url) => (url.includes("current-source") ? [200, laneAnswer()] : [200, detail()]));
    const { result } = renderHook(() => useSplit("R-WFO-118"));
    await waitFor(() => expect(result.current.detail).not.toBeNull());
    await act(async () => {
      result.current.ensureFolds();
      result.current.ensureFolds();
    });
    await waitFor(() => expect(result.current.folds.state).toBe("not-applicable"));
    expect(requested.filter((url) => url.includes("current-source/split"))).toHaveLength(1);
    const slot = result.current.folds;
    expect(slot.state === "not-applicable" && slot.answer.lane.run_profile).toBe("P04_FIXED_QUALIFICATION");
  });

  it("RF-05: a 409 carries its lane state onto the fold slot", async () => {
    stub((url) =>
      url.includes("current-source")
        ? [
            409,
            {
              error: { code: "RESEARCH_CURRENT_SOURCE_CONFLICT", message: "Current source is not retained." },
              details: { lane_state: "PENDING_RETENTION", effective_status: "COMPLETED" },
            },
          ]
        : [200, detail()],
    );
    const { result } = renderHook(() => useSplit("R-WFO-118"));
    await waitFor(() => expect(result.current.detail).not.toBeNull());
    await act(async () => result.current.ensureFolds());
    await waitFor(() => expect(result.current.folds.state).toBe("refused"));
    const slot = result.current.folds;
    expect(slot.state === "refused" && slot.laneState).toBe("PENDING_RETENTION");
  });

  it("RF-05: a not-applicable answer is final — a remount does not ask again", async () => {
    stub((url) => (url.includes("current-source") ? [200, laneAnswer()] : [200, detail()]));
    const first = renderHook(() => useSplit("R-WFO-118"));
    await waitFor(() => expect(first.result.current.detail).not.toBeNull());
    await act(async () => first.result.current.ensureFolds());
    await waitFor(() => expect(first.result.current.folds.state).toBe("not-applicable"));
    first.unmount();
    const second = renderHook(() => useSplit("R-WFO-118"));
    await waitFor(() => expect(second.result.current.detail).not.toBeNull());
    await act(async () => second.result.current.ensureFolds());
    expect(second.result.current.folds.state).toBe("not-applicable");
    expect(requested.filter((url) => url.includes("current-source/split"))).toHaveLength(1);
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
    expect(of(404).state).toBe("denied");
    expect(of(404).message).toBe(of(403).message);
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
    stub((url) => (url.includes("current-source") ? [200, laneAnswer()] : [200, detail()]));
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

describe("RF-06 wave C — the fold lane is asked once and its answer is rendered", () => {
  it("mounting the route issues one split read and one current-source read, and says what the lane answered", async () => {
    stub((url) => (url.includes("current-source") ? [200, laneAnswer()] : [200, detail()]));
    const { container } = mountRoute("#stage=split&fold=1");
    await waitFor(() => expect(container.querySelector("[data-fold-anatomy='not-applicable']")).toBeTruthy());
    expect(requested).toEqual([
      "/api/v1/quantbt/runs/R-WFO-118/split",
      "/api/v1/quantbt/runs/R-WFO-118/current-source/split",
    ]);
    expect(container.querySelector("[data-absent-reason='fold plan']")?.textContent).toBe("P04_PUBLISHES_NO_FOLD_PLAN");
    const lane = container.querySelector("[data-fold-lane='not-applicable']");
    expect(lane?.textContent).toContain("P04 fixed qualification");
    expect(lane?.textContent).toContain("Nothing is pending");
    expect(lane?.getAttribute("title")).toContain("RS02_RETAINED_LANE_NOT_APPLICABLE_TO_P04_FIXED_QUALIFICATION");
  });

  it("a 409 renders its lane-state sentence, not the server's message text", async () => {
    stub((url) =>
      url.includes("current-source")
        ? [
            409,
            {
              error: { code: "RESEARCH_CURRENT_SOURCE_CONFLICT", message: "server words that must not be the sentence" },
              details: { lane_state: "NOT_RETAINED_TERMINAL", effective_status: "CANCELLED" },
            },
          ]
        : [200, detail()],
    );
    const { container } = mountRoute("#stage=split&fold=1");
    await waitFor(() => expect(container.querySelector("[data-lane-state='NOT_RETAINED_TERMINAL']")).toBeTruthy());
    const lane = container.querySelector("[data-fold-lane]");
    expect(lane?.textContent).toContain("cancelled or failed before a sealed artifact was retained");
    expect(lane?.textContent).not.toContain("server words");
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

  it("a 404 is denied (F-04, as a 403) and leads back to the Run Library, with no live stage links", async () => {
    stub(() => [404, { error: { code: "RESEARCH_SPLIT_NOT_FOUND", message: "Research run was not found." } }]);
    const { container } = mountRoute("");
    await waitFor(() => expect(container.querySelector("[data-run-not-found]")).toBeTruthy());
    expect(container.querySelector("[data-state]")?.getAttribute("data-state")).toBe("denied");
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
    // W3b: Screen 08 exists — the next stage is a real link on this cursor.
    const next = container.querySelector("[data-next-execute]");
    expect(next?.tagName).toBe("A");
    expect(next?.getAttribute("href")).toContain("/research/quantbt/runs/R-WFO-118/execute");
    expect(next?.textContent).not.toMatch(/not built|P17/);
  });

  it("prints as-of in UTC minutes and digests shortened, the exact value in the title", () => {
    const { container } = view();
    const asOf = container.querySelector("[data-as-of]");
    expect(asOf?.textContent).toMatch(/as-of \d{4}-\d{2}-\d{2} \d{2}:\d{2}Z$/);
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

/* -------------------------------------------------------------------------
 * RF-06 HiFi fidelity pass (S05) — span notation, fold keys, copy link, clamp
 * ---------------------------------------------------------------------- */

describe("RF-06 S05 fidelity — spans read as the half-open intervals they are", () => {
  it("prints [start, end) with no day added or removed", () => {
    const range = { start_utc_ms: Date.UTC(2026, 4, 1), end_exclusive_utc_ms: Date.UTC(2026, 6, 1) };
    expect(halfOpen(range)).toBe("[2026-05-01, 2026-07-01)");
    expect(halfOpenShort(range)).toBe("[2026-05-01, 07-01)");
    expect(halfOpenShort({ start_utc_ms: Date.UTC(2025, 11, 1), end_exclusive_utc_ms: Date.UTC(2026, 0, 1) })).toBe(
      "[2025-12-01, 2026-01-01)",
    );
  });

  it("uses the notation in the protocol fact, the legend, the holdout range and the fold table", () => {
    const { container } = view();
    expect(container.querySelector("[data-fact='span']")?.textContent).toContain("[2024-01-01, 2026-03-11)");
    expect(container.querySelector("[data-window-legend='is']")?.textContent).toContain("[2024-01-02, 2025-05-15)");
    expect(container.querySelector("[data-holdout-span]")?.textContent).toMatch(/^\[.*\)$/);
    const spans = [...container.querySelectorAll("[data-span-cell]")].map((cell) => cell.textContent);
    expect(spans).toEqual(["[2024-01-02, 2025-05-15)", "[2025-05-15, 12-01)"]);
  });

  it("right-aligns every numeric column, head and cell alike, and fits without a min-width overflow at desktop", () => {
    const { container } = view();
    const heads = [...container.querySelectorAll("[data-card='fold-table'] th")].map((th) => th.getAttribute("data-align"));
    expect(heads).toEqual(["left", "left", "right", "right", "left", "right", "right", "left", "right", "right", "right"]);
    const cells = [...container.querySelectorAll("[data-fold-table-row='three-window'] td")];
    expect(cells[2].className).toContain("text-right");
    expect(cells[3].className).toContain("text-right");
  });

  it("draws the holdout on its own gold dashed row, labelled with the server's words", () => {
    const { container } = view();
    const segment = container.querySelector("[data-holdout-track] [data-window='holdout']") as HTMLElement;
    expect(segment).toBeTruthy();
    expect(segment.className).toContain("border-dashed");
    expect(segment.style.borderColor).toBe("var(--accent-2)");
    // Not inside the windows track any more.
    expect(container.querySelector("[data-track] [data-window='holdout']")).toBeNull();
    expect(container.querySelector("[data-holdout-words]")?.textContent).toBe(
      "P08_METADATA_BOUND · NOT_EVALUATED · result NOT_EXPOSED",
    );
  });
});

describe("RF-06 S05 fidelity — fold rows are buttons the arrow keys walk", () => {
  it("maps keys to the neighbouring fold and stops at the ends", () => {
    expect(foldKeyTarget("ArrowDown", 1, 3)).toBe(2);
    expect(foldKeyTarget("ArrowRight", 3, 3)).toBe(3);
    expect(foldKeyTarget("ArrowUp", 1, 3)).toBe(1);
    expect(foldKeyTarget("ArrowLeft", 2, 3)).toBe(1);
    expect(foldKeyTarget("Home", 3, 3)).toBe(1);
    expect(foldKeyTarget("End", 1, 3)).toBe(3);
    expect(foldKeyTarget("a", 1, 3)).toBeNull();
  });

  it("uses no list roles, a 64 px label and one roving tab stop", () => {
    const { container } = view({ folds: { state: "ready", split: sourceSplit() }, cursor: { ...DEFAULT_CURSOR, fold: 2 } });
    expect(container.querySelector("[role='list'], [role='listitem']")).toBeNull();
    const rows = [...container.querySelectorAll("[data-fold-row]")];
    expect(rows.map((row) => row.getAttribute("tabindex"))).toEqual(["-1", "0", "-1"]);
    expect(rows[0].querySelector("span")?.className).toContain("w-[64px]");
    // W3: a retained fold ends on its last bar (inclusive), so the range is closed.
    expect(container.querySelector("[data-fold-range='1']")?.textContent).toMatch(/^\[2024-01-01 ⋯ .*\]$/);
    // The cursor's fold is lit; the others are dimmed as in the HiFi.
    expect((rows[0].querySelector("[data-fold-segment='train']") as HTMLElement).style.opacity).toBe("0.55");
    expect((rows[1].querySelector("[data-fold-segment='train']") as HTMLElement).style.opacity).toBe("1");
  });

  it("moves the cursor with the arrow keys on the gantt, the θ* lanes and the table", () => {
    const onFold = vi.fn();
    const { container } = view({ folds: { state: "ready", split: sourceSplit() }, cursor: { ...DEFAULT_CURSOR, fold: 2 }, onFold });
    fireEvent.keyDown(container.querySelector("[data-fold-row='2']") as Element, { key: "ArrowDown" });
    expect(onFold).toHaveBeenLastCalledWith(3);
    fireEvent.keyDown(container.querySelector("[data-theta-lane='2']") as Element, { key: "ArrowUp" });
    expect(onFold).toHaveBeenLastCalledWith(1);
    fireEvent.click(container.querySelector("[data-fold-table-row='3']") as Element);
    expect(onFold).toHaveBeenLastCalledWith(3);
    fireEvent.keyDown(container.querySelector("[data-fold-table-row='2']") as Element, { key: "Home" });
    expect(onFold).toHaveBeenLastCalledWith(1);
  });
});

describe("RF-06 S05 fidelity — copy link and marks", () => {
  it("says '✓ evidence link copied' for 1.6 s, then returns", async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn(async () => undefined) } });
      const { container } = view();
      const button = container.querySelector("[data-action='copy-evidence-link']") as HTMLElement;
      await act(async () => {
        fireEvent.click(button);
      });
      expect(button.textContent).toBe(COPY_DONE_LABEL);
      act(() => vi.advanceTimersByTime(COPY_RESET_MS - 100));
      expect(button.textContent).toBe(COPY_DONE_LABEL);
      act(() => vi.advanceTimersByTime(200));
      expect(button.textContent).toBe("copy evidence link");
    } finally {
      vi.useRealTimers();
    }
  });

  it("marks an unpublished integrity check with a dash, never a pass or a failure", () => {
    const { container } = view();
    const marks = [...container.querySelectorAll("[data-integrity-mark]")].map((row) => row.getAttribute("data-integrity-mark"));
    expect(marks).toEqual(["pass", "none", "none", "none"]);
    expect(container.querySelector("[data-integrity-mark='fail']")).toBeNull();
  });
});

describe("RF-06 — a fold set the run already published clamps this screen too", () => {
  it("remembers the hub's observed folds per run and clamps S05 against them", async () => {
    forgetObservedFolds();
    rememberObservedFolds("R-WFO-118", [1]);
    expect(observedFoldsFor("R-WFO-118")).toEqual([1]);
    expect(observedFoldsFor("another-run")).toBeNull();
    stub((url) => (url.includes("current-source") ? [200, laneAnswer()] : [200, detail()]));
    const { container } = mountRoute("#stage=split&fold=4");
    await waitFor(() => expect(window.location.hash).toBe("#stage=split&fold=1"));
    expect(container.querySelector("[data-cursor-note='CURSOR_FOLD_CLAMPED']")?.textContent).toContain("fold 4");
    forgetObservedFolds();
  });

  it("leaves the fold alone when no fold set was published", async () => {
    forgetObservedFolds();
    stub((url) => (url.includes("current-source") ? [200, laneAnswer()] : [200, detail()]));
    mountRoute("#stage=split&fold=4");
    await waitFor(() => expect(requested.length).toBeGreaterThan(0));
    expect(window.location.hash).toBe("#stage=split&fold=4");
  });
});

/* -------------------------------------------------------------------------
 * RF-06 wave C — RF-05 split fields (CG-P14-03…06), one test per field
 * ---------------------------------------------------------------------- */

describe("RF-06 wave C — S05 consumes the RF-05 split fields", () => {
  it("CG-P14-05: the span fact reads `span · 1h bars` from the bound dataset, the binding in the title", () => {
    const { container } = view();
    const fact = container.querySelector("[data-fact='span']");
    expect(fact?.textContent).toContain("[2024-01-01, 2026-03-11) · 1h bars");
    const title = fact?.querySelector("[data-dataset]")?.getAttribute("title") ?? "";
    expect(title).toContain("crypto-binance-1m");
    expect(title).toContain("BTCUSDT");
    expect(title).toContain("bar interval 3600000 ms");
    expect(title).toContain("P08 dataset binding");
  });

  it("CG-P14-05: no bar word is invented when no dataset is bound; the reason rides in the title", () => {
    const { container } = view({
      detail: detail({
        dataset: {
          state: "LEGACY_METADATA_ONLY",
          dataset_id: null,
          symbol: null,
          timeframe: null,
          bar_interval_ms: null,
          provenance: "NONE",
          reason_code: "P14_LEGACY_RUN_HAS_NO_DATASET_BINDING",
          availability: { state: "LEGACY_METADATA_ONLY", reason_code: "P14_LEGACY_RUN_HAS_NO_DATASET_BINDING" },
        },
      } as Partial<SplitDetail>),
    });
    const fact = container.querySelector("[data-fact='span']");
    expect(fact?.textContent).not.toContain("bars");
    expect(fact?.querySelector("[data-dataset]")?.getAttribute("title")).toContain("P14_LEGACY_RUN_HAS_NO_DATASET_BINDING");
  });

  it("CG-P14-04: as-of is the durable fact's time in the HiFi Z form, its basis named in the title", () => {
    const { container } = view();
    const asOf = container.querySelector("[data-as-of]");
    expect(asOf?.textContent).toBe("source split read · as-of 2026-06-19 00:00Z");
    expect(asOf?.getAttribute("data-as-of-basis")).toBe("P14_PROJECTION_RECEIVED_AT");
    expect(asOf?.getAttribute("title")).toContain("as-of basis P14_PROJECTION_RECEIVED_AT — when the P14 projection for this run was received");
  });

  it("CG-P14-03: purge, embargo and inner folds read `n/a · three-window`, upright, never as missing", () => {
    const { container } = view();
    for (const name of ["purge", "embargo", "inner folds"]) {
      const fact = container.querySelector(`[data-fact='${name}']`);
      expect(fact?.textContent, name).toContain("n/a · three-window");
      expect(fact?.textContent, name).not.toMatch(/not published|not applicable/);
      const value = fact?.querySelector("[data-absent-state='NOT_APPLICABLE']");
      expect(value?.className, name).not.toContain("italic");
      expect(value?.getAttribute("title"), name).toMatch(/P14_THREE_WINDOW_PROTOCOL_HAS_NO_/);
    }
    // No inner-fold row is drawn as if something were missing.
    expect(container.querySelector("[data-inner-row]")).toBeNull();
    // The fold table's purge and embargo cells say n/a, not "not published".
    const row = container.querySelector("[data-fold-table-row='three-window']");
    expect(row?.querySelectorAll("[data-na-cell]")).toHaveLength(2);
    expect(row?.textContent).not.toContain("not published");
  });

  it("CG-P14-03: a fact that applies and was not published still says not published", () => {
    const base = detail();
    const { container } = view({
      detail: detail({
        protocol: { ...base.protocol, purge: absent("P14_SOURCE_SPLIT_RECEIPT_NOT_PUBLISHED"), inner_folds: absent("P14_SOURCE_SPLIT_RECEIPT_NOT_PUBLISHED") },
      } as Partial<SplitDetail>),
    });
    expect(container.querySelector("[data-fact='purge']")?.textContent).toContain("not published");
    expect(container.querySelector("[data-inner-row]")?.textContent).toContain("not published");
    expect(container.querySelector("[data-fact='inner folds']")).toBeNull();
  });

  it("RF-05: the holdout's missing bar count carries its reason, once, beside the seal", () => {
    const { container } = view();
    const bars = container.querySelectorAll("[data-absence-key='holdout_bars']");
    expect(bars).toHaveLength(1);
    expect(bars[0].textContent).toContain("not counted — P10 counts only rows copied into the child tape");
    expect(bars[0].querySelector("[title]")?.getAttribute("title")).toBe("P10_HOLDOUT_BARS_NOT_COUNTED_OUTSIDE_CHILD_TAPE");
    expect(container.querySelector("[data-holdout-note]")?.contains(bars[0])).toBe(true);
  });

  it("CG-P14-06: every absence_index key is stated exactly once, and source_absences is not read", () => {
    const { container } = view();
    for (const entry of ABSENCE_INDEX) {
      expect(container.querySelectorAll(`[data-absence-key='${entry.key}']`), entry.key).toHaveLength(1);
    }
    expect(container.textContent).not.toContain("DEPRECATED_SOURCE_ABSENCES_MUST_NOT_RENDER");
    expect(container.textContent).not.toContain("deprecated decoy");
    expect(container.querySelector("[data-source-absences]")).toBeNull();
  });

  it("CG-P14-06: an index key no frame owns is listed once at the foot, resolved through its pointer", () => {
    const base = detail();
    const { container } = view({
      detail: detail({
        absence_index: [...base.absence_index, { key: "holdout_unlock_action", pointer: "/actions/holdout_unlock", state: "NOT_PUBLISHED" }],
      } as Partial<SplitDetail>),
    });
    const extra = container.querySelectorAll("[data-absence-key='holdout_unlock_action']");
    expect(extra).toHaveLength(1);
    expect(container.querySelector("[data-source-absences]")?.contains(extra[0])).toBe(true);
    expect(extra[0].textContent).toContain("not published");
  });

  it("a cancelled run with no projection: every window absence is stated once, from the index", () => {
    const receipt = "P14_SOURCE_SPLIT_RECEIPT_NOT_PUBLISHED";
    const missing = absent(receipt);
    const { container } = view({
      detail: detail({
        readiness: "NOT_READY",
        as_of_basis: "RUN_STATE_UPDATED_AT",
        timeline: null,
        protocol: {
          kind: null,
          selection: { state: "NOT_PUBLISHED", parameter_bundle_digest: null, strict_outer_oos: missing },
          fold_plan: missing,
          inner_folds: missing,
          purge: missing,
          embargo: missing,
          theta_per_fold: missing,
          gap_scan: missing,
        },
        windows: { warmup: missing, is: missing, outer_oos: missing, holdout: missing },
        absence_index: [
          ...["strict_outer_oos", "fold_plan", "inner_folds", "purge", "embargo", "theta_per_fold", "gap_scan"].map((key) => ({
            key,
            pointer: key === "strict_outer_oos" ? "/protocol/selection/strict_outer_oos" : `/protocol/${key}`,
            state: "NOT_PUBLISHED" as const,
          })),
          ...["warmup", "is", "outer_oos", "holdout"].map((key) => ({ key, pointer: `/windows/${key}`, state: "NOT_PUBLISHED" as const })),
        ],
      } as unknown as Partial<SplitDetail>),
    });
    for (const entry of ["strict_outer_oos", "fold_plan", "inner_folds", "purge", "embargo", "theta_per_fold", "gap_scan", "warmup", "is", "outer_oos", "holdout"]) {
      expect(container.querySelectorAll(`[data-absence-key='${entry}']`), entry).toHaveLength(1);
    }
    expect(container.querySelector("[data-as-of]")?.getAttribute("title")).toContain("RUN_STATE_UPDATED_AT");
    expect(container.textContent).not.toContain("n/a · three-window");
  });
});
/* -------------------------------------------------------------------------
 * W3 — Screen 05 on a real retained WFO run (CG-P14-02)
 * ---------------------------------------------------------------------- */

const W3_SPLIT = (JSON.parse(readFileSync(join(process.cwd(), "src", "research", "w3RealWfo.fixture.json"), "utf8")) as {
  split: CurrentSourceSplit;
}).split;

describe("W3 — the fold plan carries QuantBT's own windows, guards and per-fold score", () => {
  it("states the run-level guards the engine published, never a 'not published' shell for them", () => {
    const { container } = view({ folds: { state: "ready", split: W3_SPLIT } });
    const guard = (what: string) => container.querySelector(`[data-guard='${what}']`);
    expect(guard("purge_bars")?.textContent).toBe("0 bars");
    expect(guard("embargo_bars")?.textContent).toBe("0 bars");
    expect(guard("label_horizon_bars")?.textContent).toBe("0 bars");
    expect(guard("warmup_policy")?.textContent).toBe("none");
    expect(guard("inner_folds")?.getAttribute("data-guard-state")).toBe("NOT_APPLICABLE");
    expect(container.querySelector("[data-strict-outer-oos]")?.getAttribute("data-strict-outer-oos")).toBe("OOS_USED_FOR_SELECTION");
    expect(container.querySelector("[data-inner-row]")).toBeNull();
  });

  it("fills the fold table: bars, purge/embargo per fold and the selected parameters' S_IS / S_OOS / decay", () => {
    const { container } = view({ folds: { state: "ready", split: W3_SPLIT } });
    const row = container.querySelector("[data-fold-table-row='1']") as HTMLElement;
    expect([...row.querySelectorAll("[data-count-cell]")].map((cell) => cell.textContent)).toEqual(["720", "168"]);
    expect([...row.querySelectorAll("[data-window-cell]")].map((cell) => cell.textContent)).toEqual(["0", "0"]);
    const scores = [...row.querySelectorAll("[data-score-cell]")];
    expect(scores.map((cell) => cell.getAttribute("data-score-cell"))).toEqual([
      "-0.3591250351173603", "-7.799572637865059", "7.440447602747699",
    ]);
    expect(scores.map((cell) => cell.textContent)).toEqual(["−0.359", "−7.800", "+7.440"]);
    const second = container.querySelector("[data-fold-table-row='2']") as HTMLElement;
    expect([...second.querySelectorAll("[data-count-cell]")].map((cell) => cell.textContent)).toEqual(["888", "168"]);
  });

  it("a pre-W3 split body keeps the protocol shells and never prints a zero for missing bars", () => {
    const { container } = view({ folds: { state: "ready", split: sourceSplit() } });
    expect(container.querySelector("[data-guard]")).toBeNull();
    expect(container.querySelector("[data-count-cell]")).toBeNull();
    expect(container.querySelector("[data-fold-table-row='1']")?.textContent).not.toMatch(/\b0 bars\b/);
  });
});

/* -------------------------------------------------------------------------
 * W3b — Screen 05 on the retained WFO lane (rrun_c860…, real served bodies)
 * ---------------------------------------------------------------------- */

const W3B = JSON.parse(readFileSync(join(process.cwd(), "src", "research", "w3bRealWfo.fixture.json"), "utf8")) as {
  progress: unknown;
  requested_spec: unknown;
  hub_split: SplitDetail;
};
const W3_ALL = JSON.parse(readFileSync(join(process.cwd(), "src", "research", "w3RealWfo.fixture.json"), "utf8")) as {
  split: CurrentSourceSplit;
  search: unknown;
  evidence: unknown;
};
const W3B_RUN = W3_ALL.split.run_id;

/** hub reads → hub bodies; current-source/* → the retained bodies; P11 → progress / requested spec. */
function w3bResponder(splitLane: unknown = W3_ALL.split) {
  return (url: string): [number, unknown] => {
    const path = new URL(url, "http://x").pathname;
    if (path.endsWith("/progress")) return [200, W3B.progress];
    if (path.endsWith("/requested-spec")) return [200, W3B.requested_spec];
    if (path.endsWith("/current-source/split")) return [200, splitLane];
    if (path.endsWith("/current-source/search")) return [200, W3_ALL.search];
    if (path.endsWith("/current-source/evidence")) return [200, W3_ALL.evidence];
    if (path.endsWith("/split")) return [200, W3B.hub_split];
    return [404, { error: { code: "UNEXPECTED" } }];
  };
}

describe("W3b — Split on the retained WFO lane", () => {
  beforeEach(() => {
    forgetRunIdentities();
    forgetObservedFolds();
  });

  async function settledRoute() {
    stub(w3bResponder());
    const view = mountRoute("", `/research/quantbt/runs/${W3B_RUN}/split`);
    await waitFor(() => expect(view.container.querySelector("[data-readiness]")).toBeTruthy());
    await waitFor(() => expect(view.container.querySelector("[data-lane-reading]")).toBeNull());
    await waitFor(() => expect(view.container.querySelector("[data-holdout-lane]")).toBeTruthy());
    return view;
  }

  it("states the run's protocol, span, readiness and selection from the retained lane and the P11 identity", async () => {
    const { container } = await settledRoute();
    expect(container.querySelector("[data-protocol]")?.textContent).toBe("advanced walk-forward · weekly · expanding");
    const span = container.querySelector("[data-fact='span'] [data-span-source]");
    expect(span?.getAttribute("data-span-source")).toBe("requested spec");
    expect(span?.textContent).toContain("[2026-06-01, 2026-07-15)");
    expect(span?.textContent).toContain("end exclusive");
    expect(span?.getAttribute("title")).toContain("2026-07-15T00:00:00.000Z (end exclusive)");
    expect(container.querySelector("[data-readiness]")?.getAttribute("data-readiness")).toBe("READY");
    expect(container.querySelector("[data-readiness]")?.textContent).toBe("READY");
    expect(container.querySelector("[data-selection]")?.getAttribute("data-selection")).toBe("GLOBAL");
    expect(requested.some((url) => url.includes(`/research/runs/${W3B_RUN}/progress`))).toBe(true);
    expect(requested.some((url) => url.includes(`/research/runs/${W3B_RUN}/requested-spec`))).toBe(true);
  });

  it("every fold row's θ* is the one GLOBAL selection, trial 0", async () => {
    const { container } = await settledRoute();
    const rows = [...container.querySelectorAll("[data-fold-table-row]")];
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      const theta = row.querySelector("[data-params-cell] [data-theta-star]");
      expect(theta?.getAttribute("data-theta-star")).toBe("0");
      expect(theta?.textContent).toBe("GLOBAL · trial 0");
    }
  });

  it("the holdout is the evidence claim's own NOT_APPLICABLE fact, with its P10 code", async () => {
    const { container } = await settledRoute();
    const holdout = container.querySelector("[data-holdout='retained'] [data-holdout-lane]");
    expect(holdout?.getAttribute("data-holdout-lane")).toBe("NOT_APPLICABLE");
    expect(holdout?.getAttribute("data-holdout-reason")).toBe("P10_DELTA_WFO_PROFILE_HAS_NO_HOLDOUT_SEGMENT");
    expect(holdout?.textContent).toContain("P10_DELTA_WFO_PROFILE_HAS_NO_HOLDOUT_SEGMENT");
  });

  it("prints no P04-hub reason and no 'not built', though the hub split answered P14 NOT_PUBLISHED", async () => {
    const { container } = await settledRoute();
    expect(W3B.hub_split.availability.reason_code).toBe("P14_SOURCE_SPLIT_RECEIPT_NOT_PUBLISHED");
    expect(container.textContent).not.toMatch(HUB_LANE_REASON);
    expect(container.innerHTML).not.toMatch(HUB_LANE_REASON);
    expect(container.textContent).not.toContain("not built");
  });

  it("links on to S4 Execute for this run", async () => {
    const { container } = await settledRoute();
    const next = container.querySelector("[data-next-execute]");
    expect(next?.tagName).toBe("A");
    expect(next?.textContent).toContain("next: S4 Execute");
    expect(next?.getAttribute("href")).toMatch(new RegExp(`^/research/quantbt/runs/${W3B_RUN}/execute(#|$)`));
  });

  it("a P04 run (the retained lane answers not-applicable) keeps the hub's answer and its P14 reason", async () => {
    stub(w3bResponder(laneAnswer("split")));
    const { container } = mountRoute("", `/research/quantbt/runs/${W3B_RUN}/split`);
    await waitFor(() => expect(container.querySelector("[data-fold-lane='not-applicable']")).toBeTruthy());
    await waitFor(() => expect(container.textContent).toContain("P14_SOURCE_SPLIT_RECEIPT_NOT_PUBLISHED"));
    expect(container.querySelector("[data-holdout='retained']")).toBeNull();
    expect(container.querySelector("[data-readiness='READY']")).toBeNull();
    expect(requested.some((url) => /\/research\/runs\/[^/]+\/(progress|requested-spec)/.test(url))).toBe(false);
  });
});

/* -------------------------------------------------------------------------
 * E14 — Screen 05 boundary integrity (5.11) and stitched OOS provenance (5.12)
 *
 * The two blocks come from the canonical retained split fixture the control
 * API publishes (`research-current-source.split.valid.json`, written from the
 * real W5b signal-notional WFO seal), never from a body written here.
 * ---------------------------------------------------------------------- */

const E14_SPLIT = JSON.parse(
  readFileSync(join(process.cwd(), "..", "..", "..", "packages", "contracts", "fixtures", "research-current-source.split.valid.json"), "utf8"),
) as CurrentSourceSplit & {
  gap_scan: NonNullable<CurrentSourceSplit["gap_scan"]>;
  stitch: NonNullable<CurrentSourceSplit["stitch"]>;
};

/** The W3b retained lane, with E14's two blocks exactly as the server publishes them. */
function e14Lane(patch: Record<string, unknown> = {}): unknown {
  return { ...W3_ALL.split, gap_scan: E14_SPLIT.gap_scan, stitch: E14_SPLIT.stitch, ...patch };
}

describe("E14 — S05 boundary integrity and stitched OOS provenance", () => {
  beforeEach(() => {
    forgetRunIdentities();
    forgetObservedFolds();
  });

  async function laneRoute(splitLane: unknown) {
    stub(w3bResponder(splitLane));
    const view = mountRoute("", `/research/quantbt/runs/${W3B_RUN}/split`);
    await waitFor(() => expect(view.container.querySelector("[data-holdout-lane]")).toBeTruthy());
    return view;
  }

  it("5.11 the gap scan is QuantBT's own boundary events, counted against the retained fold plan", async () => {
    const { container } = await laneRoute(e14Lane());
    const scan = container.querySelector("[data-gap-scan]") as HTMLElement;
    expect(scan.getAttribute("data-gap-scan")).toBe("AVAILABLE");
    expect(scan.getAttribute("data-gap-scan-basis")).toBe("QUANTBT_ACCOUNT_EXECUTION_PLAN_BOUNDARY_EVENTS_V1");
    expect(scan.textContent).toContain("1 of 1 fold boundary");
    expect(scan.textContent).toContain("no gap at any of 1");
    /* The row is a pass only because the widest measured gap is 0 bars. */
    expect(scan.closest("[data-integrity]")!.getAttribute("data-integrity-mark")).toBe("pass");
    expect(container.querySelector("[data-lane-absent='gap scan']")).toBeNull();
  });

  it("5.11 a crossing QuantBT never measured is said apart from a measured zero, and never drawn as a pass", async () => {
    const lane = e14Lane({
      gap_scan: {
        ...E14_SPLIT.gap_scan,
        measured_count: 0,
        contiguous_count: 0,
        max_gap_bars: null,
        boundaries: [{ ...E14_SPLIT.gap_scan.boundaries[0]!, gap_bars: null }],
      },
    });
    const { container } = await laneRoute(lane);
    const scan = container.querySelector("[data-gap-scan]") as HTMLElement;
    expect(scan.textContent).toContain("none measured");
    expect(scan.textContent).not.toContain("no gap");
    expect(scan.closest("[data-integrity]")!.getAttribute("data-integrity-mark")).toBe("none");
  });

  it("5.11 a scan that covered fewer crossings than the fold plan has says both numbers", async () => {
    const { container } = await laneRoute(e14Lane({ gap_scan: { ...E14_SPLIT.gap_scan, expected_boundary_count: 4 } }));
    expect(container.querySelector("[data-gap-scan]")?.textContent).toContain("1 of 4 fold boundaries");
  });

  it("5.11 a typed absence keeps the row and prints the lane's own reason, never a zero", async () => {
    const lane = e14Lane({
      gap_scan: {
        ...E14_SPLIT.gap_scan,
        state: "NOT_PUBLISHED",
        reason_code: "RS02_SEAL_PREDATES_W5B_REPLAY_LEDGER_V1",
        basis: "NOT_PUBLISHED",
        scope: "NOT_PUBLISHED",
        boundary_count: null,
        measured_count: null,
        contiguous_count: null,
        max_gap_bars: null,
        boundaries: [],
        availability: { state: "NOT_PUBLISHED", reason_code: "RS02_SEAL_PREDATES_W5B_REPLAY_LEDGER_V1" },
      },
    });
    const { container } = await laneRoute(lane);
    const absent = container.querySelector("[data-lane-absent='gap scan']") as HTMLElement;
    expect(absent.getAttribute("data-lane-reason")).toBe("RS02_SEAL_PREDATES_W5B_REPLAY_LEDGER_V1");
    expect(absent.textContent).toContain("not published");
    expect(absent.textContent).toContain("RS02_SEAL_PREDATES_W5B_REPLAY_LEDGER_V1");
    expect(absent.textContent).not.toMatch(/\b0\b/);
  });

  it("5.11 an older server that publishes no such field keeps the sentence it always printed", async () => {
    const { gap_scan: _gapScan, ...withoutGapScan } = e14Lane() as Record<string, unknown>;
    const { container } = await laneRoute(withoutGapScan);
    const absent = container.querySelector("[data-lane-absent='gap scan']") as HTMLElement;
    expect(absent.textContent).toContain("no field in the retained lane");
    expect(absent.getAttribute("data-lane-reason")).toBe("UI_RETAINED_LANE_HAS_NO_FIELD");
  });

  it("5.12 the stitch digest is shown, verified against the fold boundaries, and says whose digest it is", async () => {
    const { container } = await laneRoute(e14Lane());
    const stitch = container.querySelector("[data-stitch-digest]") as HTMLElement;
    expect(stitch.getAttribute("data-stitch-digest")).toBe("AVAILABLE");
    expect(stitch.getAttribute("data-stitch-check")).toBe("MATCH");
    expect(container.querySelector("[data-stitch-digest-value]")?.getAttribute("data-stitch-digest-value")).toBe(E14_SPLIT.stitch.digest);
    expect(stitch.textContent).toContain(`stitch digest ${E14_SPLIT.stitch.digest!.slice(0, 12)}…`);
    expect(stitch.textContent).toContain("verified against fold boundaries · 2 segments, 336 retained observations");
    expect(stitch.textContent).toContain("the Portal's digest of the retained stitch plan — QuantBT publishes none");
    expect(container.textContent).not.toContain("stitch digest — not in the split read");
  });

  it("5.12 a stitch that does not line up says so with its own code, and is not called verified", async () => {
    const lane = e14Lane({
      stitch: { ...E14_SPLIT.stitch, boundary_check: "MISMATCH", boundary_check_reason_code: "RETAINED_STITCH_SEGMENT_OBSERVATION_RANGES_OVERLAP" },
    });
    const { container } = await laneRoute(lane);
    const verdict = container.querySelector("[data-stitch-verdict]") as HTMLElement;
    expect(verdict.getAttribute("data-stitch-verdict")).toBe("MISMATCH");
    expect(verdict.textContent).toContain("does not line up with the fold boundaries");
    expect(verdict.textContent).toContain("RETAINED_STITCH_SEGMENT_OBSERVATION_RANGES_OVERLAP");
    expect(container.textContent).not.toContain("verified against fold boundaries");
  });

  it("5.12 a withheld stitch keeps the block and prints the reason; an older server keeps the old sentence", async () => {
    const withheld = e14Lane({
      stitch: {
        ...E14_SPLIT.stitch,
        state: "NOT_PUBLISHED",
        reason_code: "RS02_REPLAY_LEDGER_RETAINED_NO_FOLD_SEGMENT",
        basis: "NOT_PUBLISHED",
        digest: null,
        segment_count: null,
        observation_count: null,
        boundary_check: "NOT_CHECKABLE",
        boundary_check_reason_code: "RS02_REPLAY_LEDGER_RETAINED_NO_FOLD_SEGMENT",
        availability: { state: "NOT_PUBLISHED", reason_code: "RS02_REPLAY_LEDGER_RETAINED_NO_FOLD_SEGMENT" },
      },
    });
    const first = await laneRoute(withheld);
    expect(first.container.querySelector("[data-stitch-digest]")?.getAttribute("data-stitch-digest")).toBe("NOT_PUBLISHED");
    expect(first.container.querySelector("[data-lane-absent='stitch digest']")?.textContent).toContain("RS02_REPLAY_LEDGER_RETAINED_NO_FOLD_SEGMENT");
    cleanup();

    const { stitch: _stitch, ...withoutStitch } = e14Lane() as Record<string, unknown>;
    const second = await laneRoute(withoutStitch);
    expect(second.container.querySelector("[data-stitch-digest]")?.getAttribute("data-stitch-digest")).toBe("NO_FIELD");
    expect(second.container.textContent).toContain("stitch digest — not in the split read");
  });
});
