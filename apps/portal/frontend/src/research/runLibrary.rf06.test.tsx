/**
 * RF-06 · Screen 01 Run Library — one test per FE-S01 audit finding
 * (AUDIT_P11_P15_CLAUDE_2026-09-24 §2 P12). Each `FE-S01-xx` test fails on
 * the pre-RF-06 code; the reason is noted beside the assertion that bites.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CLAIM_CANCELLED,
  CLAIM_NOT_ISSUED,
  FILTER_DEBOUNCE_MS,
  LEGACY_NOTE,
  RULES_FOOTER,
  RunLibrary,
  SCRATCH_TITLE,
  TITLE,
  filteredEmpty,
  groupRuns,
} from "./RunLibrary";
import { RunLibraryRoute } from "./RunLibraryRoute";
import { COMPARE_REFUSAL, type Availability, type RunLibraryItem, type RunLibraryResponse } from "./runLibraryClient";
import { filtersFromSearch, searchFromFilters, type LibraryFilters } from "./useRunLibrary";
import { researchState } from "./state";

/* ---------------------------------------------------------------- fixtures */

const AVAILABLE: Availability = { state: "AVAILABLE", reason_code: null };
const NOT_ISSUED: Availability = { state: "NOT_PUBLISHED", reason_code: "SOURCE_CLAIM_NOT_ISSUED" };
const NO_METRICS: Availability = {
  state: "NOT_PUBLISHED",
  reason_code: "P12_DOES_NOT_INFER_FINAL_METRICS_FROM_PROGRESS_OR_ARTIFACTS",
};
const NO_CERT: Availability = { state: "NOT_PUBLISHED", reason_code: "SOURCE_DID_NOT_PUBLISH_METHODOLOGY_CERTIFICATE" };

function item(overrides: Partial<RunLibraryItem> = {}): RunLibraryItem {
  return {
    run_id: "A",
    attempt_id: null,
    source_kind: "RESEARCH_DURABLE",
    row_kind: "LOGICAL_RUN",
    relationship: { kind: "PRIMARY", logical_run_key: "primary", parent_run_id: null, technical_retry_count: 0 },
    status: "COMPLETED",
    mode: { display: "mode_1_decay · three_window_decay", key: "mode_1_decay", availability: AVAILABLE, schedule: null, protocol: null },
    strategy_id: { value: "delta-rsi", availability: AVAILABLE },
    binding: {
      alpha_id: "delta-rsi",
      alpha_name: "Delta-RSI Polynomial Alpha",
      alpha_version_id: "av_delta_1_0_0",
      av: "av_1_0_0",
      digest: "34dc1847d051ca40f9ae3d2fbbf2d7e8",
    },
    binding_availability: AVAILABLE,
    rc: null,
    rc_availability: { state: "NOT_PUBLISHED", reason_code: "P21_NO_PERSISTED_RELEASE_CANDIDATE" },
    status_basis: { kind: "DURABLE_LIFECYCLE", availability: { state: "AVAILABLE", reason_code: null } },
    evidence_revision: null,
    instrument: { display: "BTCUSDT · 1h", availability: AVAILABLE },
    created_at_utc_ms: 1790226080369,
    certificate: { grade: null, availability: NO_CERT },
    claim: { state: null, text: null, availability: NOT_ISSUED },
    stages: (["S1", "S2", "S3", "S4", "S5"] as const).map((key) => ({
      key,
      state: "done" as const,
      tip: `Persisted ${key} state: DONE.`,
      tooltip_source: "DERIVED_FROM_PERSISTED_STATE" as const,
      availability: AVAILABLE,
    })),
    stats: [
      { key: "oos_sharpe", label: "OOS sharpe", role: "OOS_SHARPE", value: null, tone: "DEFAULT", availability: NO_METRICS, scope: null, definition_id: null },
      { key: "decay", label: "Δ decay", role: "DECAY", value: null, tone: "DEFAULT", availability: NO_METRICS, scope: null, definition_id: null },
      { key: "trades", label: "trades", role: "TRADE_COUNT", value: null, tone: "DEFAULT", availability: NO_METRICS, scope: null, definition_id: null },
    ],
    superseded_note: null,
    comparison: { key: "rck1_same", availability: AVAILABLE },
    sparkline: { kind: "oos_equity", availability: { state: "NOT_PUBLISHED", reason_code: "P12_DOES_NOT_READ_ARTIFACT_OR_PARQUET_SERIES" } },
    source_updated_at_utc_ms: 1790226090000,
    ...overrides,
  };
}

function page(items: RunLibraryItem[], pageOverrides: Partial<RunLibraryResponse["page"]> = {}): RunLibraryResponse {
  return {
    schema_version: "research.run-library.v1",
    read_authority: "PORTAL_PERSISTED_RESEARCH",
    items,
    page: {
      limit: 50,
      total_rows: 12,
      filtered_rows: items.length,
      next_cursor: null,
      prev_cursor: null,
      has_more: false,
      has_previous: false,
      order: "CREATED_AT_DESC_RUN_ID_DESC",
      ...pageOverrides,
    },
    counters: { logical_runs: 12, worker_children: 0, technical_retries: 0, legacy_metadata_rows: 1 },
    claim_ledger: { issued: 0, not_issued: 7, pending_source: 5, failed: 0, cancelled_before_source: 0, legacy_metadata_only: 0 },
    filter_catalog: {
      alphas: [{ alpha_id: "delta-rsi", alpha_name: "Delta-RSI Polynomial Alpha" }],
      modes: [{ key: "mode_1_decay", display: "mode_1_decay" }],
      scratch_available: true,
    },
    as_of_utc_ms: 1790226095000,
  };
}

const EMPTY: LibraryFilters = { q: "", status: [], mode: [], alpha: [], group: false, sel: [] };
const OK = researchState({ kind: "ok", rowCount: 1 });

function view(overrides: Partial<React.ComponentProps<typeof RunLibrary>> = {}) {
  const response = overrides.response === undefined ? page([item()]) : overrides.response;
  const props = {
    filters: EMPTY,
    onFilters: vi.fn(),
    onToggleSel: vi.fn(),
    response,
    items: response?.items ?? [],
    state: OK,
    sparklines: new Map(),
    onVisible: vi.fn(),
    onLoadNext: vi.fn(),
    onLoadPrevious: vi.fn(),
    ...overrides,
  };
  render(
    <MemoryRouter>
      <RunLibrary {...props} />
    </MemoryRouter>,
  );
  return props;
}

/* ------------------------------------------------------- route harness */

let requested: string[] = [];
let lastSearch = "";

function LocationProbe() {
  lastSearch = useLocation().search;
  return null;
}

function stub(responder: (url: string) => [number, unknown]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      requested.push(url);
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

function mountRoute(search = "") {
  return render(
    <MemoryRouter initialEntries={[`/research/quantbt/runs${search}`]}>
      <Routes>
        <Route
          path="/research/quantbt/runs"
          element={
            <>
              <RunLibraryRoute />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

const lists = () => requested.filter((url) => !url.includes("ids="));

async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  requested = [];
  lastSearch = "";
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/* ------------------------------------------------------------------ bugs */

describe("FE-S01-01 — one request per load and per filter; the text filter is debounced", () => {
  beforeEach(() => vi.useFakeTimers());

  it("sends exactly one list request on load", async () => {
    stub(() => [200, page([item()])]);
    mountRoute();
    await flush(50);
    // Old code: 2 — the cursor-reset effect built a new `{}` and refetched.
    expect(lists()).toHaveLength(1);
  });

  it("sends one request for a status chip", async () => {
    stub(() => [200, page([item()])]);
    mountRoute();
    await flush(50);
    requested = [];
    fireEvent.click(document.querySelector('[data-filter-status="COMPLETED"]')!);
    await flush(50);
    expect(lists()).toHaveLength(1);
    expect(lists()[0]).toContain("status=COMPLETED");
  });

  it("sends one request for seven quick keystrokes, 150 ms after the last", async () => {
    stub(() => [200, page([item()])]);
    mountRoute();
    await flush(50);
    requested = [];
    const input = screen.getByLabelText("Filter runs") as HTMLInputElement;
    let text = "";
    for (const key of "rrun_31") {
      text += key;
      fireEvent.change(input, { target: { value: text } });
      await flush(40);
    }
    // Old code: 14 — one request per key, doubled.
    expect(lists()).toHaveLength(0);
    await flush(FILTER_DEBOUNCE_MS);
    expect(lists()).toHaveLength(1);
    expect(lists()[0]).toContain("q=rrun_31");
    expect(input.value).toBe("rrun_31");
  });
});

describe("FE-S01-02 — ticking a compare box and grouping are view state", () => {
  beforeEach(() => vi.useFakeTimers());

  it("does not refetch the list", async () => {
    stub(() => [200, page([item({ run_id: "A" }), item({ run_id: "B" })])]);
    mountRoute();
    await flush(50);
    requested = [];
    fireEvent.click(document.querySelector('[data-compare-check="A"]')!);
    await flush(50);
    fireEvent.click(document.querySelector("[data-filter-group]")!);
    await flush(50);
    // Old code: 2 — `sel`/`group` in the URL gave the filters new identities.
    expect(requested).toHaveLength(0);
    expect(lastSearch).toContain("sel=A");
  });
});

describe("FE-S01-03 / FE-S01-07 — the page lives in the URL and dies with the filter", () => {
  beforeEach(() => vi.useFakeTimers());

  it("puts the next cursor in the URL and reads it back on reload", async () => {
    stub((url) => [200, page([item()], url.includes("cursor=") ? { has_previous: true, prev_cursor: "p1" } : { has_more: true, next_cursor: "c1" })]);
    mountRoute();
    await flush(50);
    fireEvent.click(document.querySelector('[data-action="next"]')!);
    await flush(50);
    // Old code: the cursor was hook state; the URL never carried it.
    expect(lastSearch).toContain("cursor=c1");
    expect(lists().at(-1)).toContain("cursor=c1");

    cleanup();
    requested = [];
    mountRoute("?cursor=c1");
    await flush(50);
    expect(lists()).toHaveLength(1);
    expect(lists()[0]).toContain("cursor=c1");
  });

  it("never sends a page cursor with a changed filter", async () => {
    stub(() => [200, page([item()], { has_previous: true, prev_cursor: "p1" })]);
    mountRoute("?cursor=c1");
    await flush(50);
    requested = [];
    fireEvent.click(document.querySelector('[data-filter-status="FAILED"]')!);
    await flush(50);
    // Old code: the first request carried the old page's cursor under the new filter.
    expect(lists()).toHaveLength(1);
    expect(lists()[0]).toContain("status=FAILED");
    expect(lists()[0]).not.toContain("cursor=");
    expect(lastSearch).not.toContain("cursor=");
  });

  it("round-trips the cursor through the URL helpers", () => {
    const filters: LibraryFilters = { ...EMPTY, status: ["RUNNING"], cursor: "kc1.opaque" };
    expect(filtersFromSearch(searchFromFilters(filters))).toEqual(filters);
  });

  it("counts honestly when the page shows fewer runs than match", () => {
    view({ response: page([item({ run_id: "A" }), item({ run_id: "B" })], { filtered_rows: 11, has_more: true, next_cursor: "c" }) });
    // Old code: "11 of 12 runs" while two cards were on screen.
    expect(document.querySelector("[data-counter]")?.textContent).toBe("2 shown · 11 of 12 runs match");
  });
});

describe("FE-S01-04 — compare looks a hidden selection up by id", () => {
  beforeEach(() => vi.useFakeTimers());

  it("compares a valid pair when one run is hidden by the filter, and says so", async () => {
    stub((url) =>
      url.includes("ids=")
        ? [200, page([item({ run_id: "B", status: "CANCELLED" })])]
        : [200, page([item({ run_id: "A" })])],
    );
    mountRoute("?status=COMPLETED&sel=A,B");
    await flush(50);
    expect(requested.filter((url) => url.includes("ids="))).toEqual([expect.stringContaining("ids=B")]);
    // Old code: "refused" — B's key was looked up among the visible rows only.
    expect(document.querySelector("[data-compare-bar]")?.getAttribute("data-compare-bar")).toBe("ready");
    expect(document.querySelector('[data-compare-selected="B"]')?.textContent).toBe("B (hidden by filter)");
    expect(document.querySelector('[data-compare-selected="A"]')?.textContent).toBe("A");
  });

  it("still refuses a hidden pair whose keys differ", async () => {
    stub((url) =>
      url.includes("ids=")
        ? [200, page([item({ run_id: "B", comparison: { key: "rck1_other", availability: AVAILABLE } })])]
        : [200, page([item({ run_id: "A" })])],
    );
    mountRoute("?sel=A,B");
    await flush(50);
    expect(document.querySelector("[data-compare-bar]")?.getAttribute("data-compare-bar")).toBe("refused");
    expect(screen.getByText(COMPARE_REFUSAL)).toBeTruthy();
  });
});

describe("FE-S01-05 — open compare never navigates to the unbuilt Screen 13", () => {
  it("renders the ready button disabled with its phase", () => {
    view({ response: page([item({ run_id: "A" }), item({ run_id: "B" })]), filters: { ...EMPTY, sel: ["A", "B"] } });
    const button = document.querySelector('[data-action="open-compare"]') as HTMLButtonElement;
    // Old code: an <a href="/research/quantbt/compare?runs=A,B"> that bounced back to /runs.
    expect(button.tagName).toBe("BUTTON");
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("href")).toBeNull();
    expect(button.getAttribute("data-phase")).toBe("P20");
    expect(button.textContent).toContain("P20");
  });
});

describe("FE-S01-06 — an Atlas deep link to a mode with no runs", () => {
  it("shows the mode chip pressed and offers clear filters", () => {
    const props = view({
      response: page([], { filtered_rows: 0 }),
      filters: { ...EMPTY, mode: ["mode_2_sbb"] },
      state: researchState({ kind: "ok", rowCount: 0 }),
    });
    const chip = document.querySelector('[data-filter-mode="mode_2_sbb"]');
    // Old code: no chip — the catalog lists only modes that have runs.
    expect(chip?.getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector("[data-empty-copy]")?.textContent).toBe(filteredEmpty(12));
    fireEvent.click(document.querySelector('[data-action="clear-filters"]')!);
    expect(props.onFilters).toHaveBeenCalledWith(expect.objectContaining({ mode: [], status: [], alpha: [], q: "" }));
  });
});

describe("FE-S01-07 — ?sel= holds only real runs", () => {
  beforeEach(() => vi.useFakeTimers());

  it("drops an id the server does not know", async () => {
    stub((url) => (url.includes("ids=") ? [200, page([])] : [200, page([item({ run_id: "A" })])]));
    mountRoute("?sel=A,R-FAKE-1");
    await flush(50);
    // Old code: R-FAKE-1 stayed selected forever.
    expect(lastSearch).toBe("?sel=A");
    expect(document.querySelector('[data-compare-selected="R-FAKE-1"]')).toBeNull();
  });

  it("de-duplicates a repeated id", () => {
    expect(filtersFromSearch("?sel=A,A").sel).toEqual(["A"]);
  });
});

describe("FE-S01-08 — the claim face uses the server's reason", () => {
  it("says 'claim not issued' for SOURCE_CLAIM_NOT_ISSUED", () => {
    view();
    const claim = document.querySelector("[data-claim]") as HTMLElement;
    // Old code: "not published".
    expect(claim.textContent).toBe(CLAIM_NOT_ISSUED);
    expect(claim.getAttribute("data-claim-kind")).toBe("not-issued");
  });

  it("gives a cancelled run its own line, not a pending promise", () => {
    view({ response: page([item({ status: "CANCELLED", claim: { state: null, text: null, availability: { state: "NOT_PUBLISHED", reason_code: "P11_PROGRESS_SNAPSHOT_NOT_PUBLISHED" } } })]) });
    expect(document.querySelector("[data-claim]")?.textContent).toBe(CLAIM_CANCELLED);
  });
});

describe("FE-S01-09 — tooltips are sentences, not codes", () => {
  it("never puts a raw reason code in a title", () => {
    view({ response: page([item(), item({ run_id: "S", binding: null })]) });
    for (const node of Array.from(document.querySelectorAll("[title]"))) {
      // Old code: title="P12_DOES_NOT_INFER_FINAL_METRICS_FROM_PROGRESS_OR_ARTIFACTS".
      expect(node.getAttribute("title")).not.toMatch(/\b[A-Z0-9]+(_[A-Z0-9]+){2,}\b/);
    }
    expect(document.querySelector('[data-binding="scratch"]')?.getAttribute("title")).toBe(SCRATCH_TITLE);
    expect(document.querySelector('[data-binding="av_delta_1_0_0"]')?.getAttribute("title")).toContain(
      "bound to Delta-RSI Polynomial Alpha av_1_0_0 — publishable evidence",
    );
    // The code is still there for diagnostics.
    expect(document.querySelector('[data-reason-code="SOURCE_CLAIM_NOT_ISSUED"]')).toBeTruthy();
  });
});

describe("FE-S01-10 — status chips, pressed state, selected styling", () => {
  it("offers queued and cancelled, and every filter chip reports aria-pressed", () => {
    view({ filters: { ...EMPTY, status: ["CANCELLED"], alpha: ["delta-rsi"] } });
    expect(document.querySelector('[data-filter-status="CANCELLED"]')?.getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector('[data-filter-status="QUEUED"]')?.getAttribute("aria-pressed")).toBe("false");
    const chips = Array.from(document.querySelectorAll("[data-filter-status],[data-filter-mode],[data-filter-alpha],[data-filter-group]"));
    for (const chip of chips) expect(chip.getAttribute("aria-pressed")).toMatch(/^(true|false)$/);
    // Old code: a pressed alpha chip kept the white background.
    const alpha = document.querySelector('[data-filter-alpha="delta-rsi"]') as HTMLElement;
    expect(alpha.style.background).toBe("var(--accent-soft)");
  });

  it("draws the scratch chip as off when it is off", () => {
    view();
    const scratch = document.querySelector('[data-filter-alpha="scratch"]') as HTMLElement;
    // Old code: gold border and ink whether pressed or not.
    expect(scratch.style.border).toContain("var(--line)");
    expect(scratch.style.color).toBe("var(--ink-soft)");
  });
});

/* ------------------------------------------------------------- HiFi gaps */

describe("FE-S01-11 — loading, error and empty states", () => {
  it("offers retry on a failed read and keeps the filter bar", () => {
    const onRetry = vi.fn();
    view({
      response: null,
      state: { state: "unavailable", reason: "The Research service did not answer. Try again.", mayRetry: true, retainsContent: true },
      onRetry,
    });
    expect(document.querySelector("[data-filter-bar]")).toBeTruthy();
    fireEvent.click(document.querySelector('[data-action="retry"]')!);
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("draws five skeleton cards while loading", () => {
    view({ response: null, state: researchState({ kind: "in-flight", hasAcceptedResponse: false }) });
    expect(document.querySelectorAll("[data-skeleton] > div")).toHaveLength(5);
  });

  it("says 'No runs yet.' only when the workspace has none", () => {
    view({ response: page([], { total_rows: 0, filtered_rows: 0 }), state: researchState({ kind: "ok", rowCount: 0 }) });
    expect(document.querySelector("[data-empty-copy]")?.textContent).toBe("No runs yet.");
  });
});

describe("FE-S01-12 — compare bar and checkbox", () => {
  it("keeps the compare bar sticky and outlines a selected card", () => {
    view({ filters: { ...EMPTY, sel: ["A"] } });
    const bar = document.querySelector("[data-compare-bar]") as HTMLElement;
    expect(bar.style.position).toBe("sticky");
    const box = document.querySelector('[data-compare-check="A"]') as HTMLElement;
    expect(box.getAttribute("role")).toBe("checkbox");
    expect(box.getAttribute("aria-checked")).toBe("true");
    expect(box.getAttribute("aria-label")).toBe("select A for compare");
    expect(box.style.width).toBe("24px");
    expect((document.querySelector('[data-run="A"]') as HTMLElement).style.outline).toContain("2px solid");
  });
});

describe("FE-S01-13 — header, frame, certificate, footer", () => {
  it("links the journey map and shows attempt lineage disabled with P19", () => {
    view();
    expect(screen.getByText(TITLE)).toBeTruthy();
    expect(screen.getByText("journey map ↗").getAttribute("href")).toBe("/research/quantbt/journey");
    const lineage = document.querySelector('[data-link-disabled="attempt-lineage"]') as HTMLElement;
    expect(lineage.getAttribute("aria-disabled")).toBe("true");
    expect(lineage.getAttribute("href")).toBeNull();
    expect(lineage.textContent).toContain("P19");
  });

  it("draws no extra RUNS frame around the cards", () => {
    view();
    expect(document.querySelector('[data-research-panel="runs"] h3')).toBeNull();
  });

  it("prints cert — when no grade is published", () => {
    view();
    expect(document.querySelector("[data-certificate]")?.textContent).toBe("cert —");
  });

  it("prints the rules footer verbatim", () => {
    view();
    expect(document.querySelector("[data-rules-footer]")?.textContent).toBe(RULES_FOOTER);
    // Old code printed an invented paragraph; pin the spec/hi-fi words themselves.
    expect(RULES_FOOTER).toMatch(/^Certification and claim strings come from each run's Stage 5 — the library renders them, it ranks nothing\./);
    expect(RULES_FOOTER).toContain("so the button refuses instead of obliging");
  });
});

describe("FE-S01-14 — a legacy row", () => {
  const legacy = item({
    run_id: "527d2b993c834729",
    source_kind: "LEGACY_1_0_8_METADATA",
    row_kind: "LEGACY_RUN",
    status: "QUEUED",
    mode: { display: "three_window_decay", key: "three_window_decay", availability: { state: "LEGACY_METADATA_ONLY", reason_code: "LEGACY_1_0_8_PROTOCOL_METADATA_ONLY" }, schedule: null, protocol: "three_window_decay" },
    binding: null,
  });

  it("shows the mode the server sent, marked legacy", () => {
    view({ response: page([legacy]) });
    // Old code: "mode — legacy metadata" although the server sent the mode.
    expect(document.querySelector("[data-mode]")?.textContent).toBe("three_window_decay · legacy");
    expect(screen.getByText(LEGACY_NOTE)).toBeTruthy();
  });

  it("is neither scratch nor grouped with scratch", () => {
    view({ response: page([legacy]) });
    expect(document.querySelector('[data-binding="scratch"]')).toBeNull();
    // Old code: grouped under "scratch".
    expect(groupRuns([legacy, item({ run_id: "S", binding: null })]).map((group) => group.key)).toEqual([
      "zz:scratch",
      "zzz:legacy",
    ]);
  });
});

describe("RF-06 extra — a denial withholds what was on screen", () => {
  beforeEach(() => vi.useFakeTimers());

  it("hides the retained cards after a 403 on a refetch", async () => {
    let deny = false;
    stub(() => (deny ? [403, { error: { code: "RESEARCH_RUN_LIBRARY_FORBIDDEN", message: "no" } }] : [200, page([item()])]));
    mountRoute();
    await flush(50);
    expect(document.querySelector('[data-run="A"]')).toBeTruthy();
    deny = true;
    fireEvent.click(document.querySelector('[data-filter-status="FAILED"]')!);
    await flush(50);
    expect(document.querySelector('[data-run="A"]')).toBeNull();
    expect(document.querySelector('[data-state="denied"]')).toBeTruthy();
  });
});
