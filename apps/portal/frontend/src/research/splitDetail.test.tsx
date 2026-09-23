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
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  HOLDOUT_RULE_NO_READ,
  HOLDOUT_RULE_UNLOCK,
  SPLIT_RULES_FOOTER,
  SPLIT_SUBTITLE,
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
import { useSplit } from "./useSplit";
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
        folds={{ state: "idle" }}
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
    expect(container.querySelector("[data-window-legend='is']")?.textContent).toContain("2994 bars");
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
    expect(physical?.textContent).toContain("not published");
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

  it("keeps the two rules that hold whatever the source published", () => {
    view();
    expect(screen.getByText(HOLDOUT_RULE_NO_READ)).toBeTruthy();
    expect(screen.getByText(HOLDOUT_RULE_UNLOCK)).toBeTruthy();
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

  it("keeps every protocol absence in its own row with its reason", () => {
    const { container } = view();
    const absences = container.querySelector("[data-protocol-absences]");
    for (const name of ["fold plan", "inner folds", "purge", "embargo", "θ* per fold", "gap scan"]) {
      expect(absences?.querySelector(`[data-absent="${name}"]`), name).toBeTruthy();
    }
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
  it("reads the split on mount and no fold operation until asked", async () => {
    stub(() => [200, detail()]);
    const { result } = renderHook(() => useSplit("R-WFO-118"));
    await waitFor(() => expect(result.current.detail).not.toBeNull());
    expect(requested).toEqual(["/api/v1/quantbt/runs/R-WFO-118/split"]);

    await act(async () => {
      result.current.ensureFolds();
      result.current.ensureFolds();
    });
    await waitFor(() => expect(result.current.folds.state).not.toBe("idle"));
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
    expect(of(404).state).toBe("empty");
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

  it("keeps the verbatim copy spec 05 fixes", () => {
    view();
    expect(screen.getByText(SPLIT_SUBTITLE)).toBeTruthy();
    expect(screen.getByText(SPLIT_RULES_FOOTER)).toBeTruthy();
  });

  it("carries the cursor back to the hub", () => {
    const { container } = view({ cursor: { ...DEFAULT_CURSOR, stage: "split", fold: 4 } });
    const back = container.querySelector("[data-action='back-to-hub']");
    expect(back?.getAttribute("href")).toContain("/runs/R-WFO-118/evidence#");
    expect(back?.getAttribute("href")).toContain("fold=4");
  });
});
