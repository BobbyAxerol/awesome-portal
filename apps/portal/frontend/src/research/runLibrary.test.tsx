/**
 * P12 consumer tests — Screen 01 Run Library.
 *
 * The claims that carry this phase:
 *
 *  - **Comparability is the server's.** Two labels that read alike are not two
 *    runs that may be compared, and a side-by-side built on a local guess is
 *    the "comparison lie" the refusal copy names.
 *  - **An unavailable fact keeps its place.** A `NOT_PUBLISHED` metric is not
 *    a zero, and a legacy row is not current engine evidence.
 *  - **The poll is bounded on every axis.** One interval, visible rows only,
 *    running rows only, and it stops rather than retrying a denial.
 */
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CLAIM_PENDING, LEGACY_NOTE, RunLibrary, SUBTITLE } from "./RunLibrary";
import {
  COMPARE_REFUSAL,
  IDS_LIMIT,
  LIST_LIMIT,
  RUNNING_POLL_MS,
  RunLibraryQueryError,
  type Availability,
  type RunLibraryItem,
  type RunLibraryResponse,
  listQueryString,
  mayCompare,
  toLibraryRefusal,
} from "./runLibraryClient";
import {
  filtersFromSearch,
  searchFromFilters,
  toggleSelection,
  useRunLibrary,
  type LibraryFilters,
} from "./useRunLibrary";
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

const AVAILABLE: Availability = { state: "AVAILABLE", reason_code: null };
const NOT_PUBLISHED: Availability = {
  state: "NOT_PUBLISHED",
  reason_code: "SOURCE_DID_NOT_PUBLISH_METRIC",
};

function item(overrides: Partial<RunLibraryItem> = {}): RunLibraryItem {
  return {
    run_id: "R-WFO-118",
    display_label: null,
    attempt_id: null,
    source_kind: "RESEARCH_DURABLE",
    row_kind: "LOGICAL_RUN",
    relationship: {
      kind: "PRIMARY",
      logical_run_key: "lrk_1",
      parent_run_id: null,
      technical_retry_count: 0,
    },
    status: "COMPLETED",
    mode: { display: "mode_1_decay · per_fold_causal", key: "mode_1_decay", availability: AVAILABLE, schedule: null, protocol: null },
    strategy_id: { value: "delta_rsi", availability: AVAILABLE },
    binding: {
      alpha_id: "alpha_momentum_btc",
      alpha_name: "alpha_momentum_btc",
      alpha_version_id: "av_0_9_3",
      av: "av_0_9_3",
      digest: "sha256:aa91b3",
    },
    binding_availability: AVAILABLE,
    rc: null,
    rc_availability: { state: "NOT_PUBLISHED", reason_code: "P21_NO_PERSISTED_RELEASE_CANDIDATE" },
    status_basis: { kind: "DURABLE_LIFECYCLE", availability: { state: "AVAILABLE", reason_code: null } },
    evidence_revision: null,
    instrument: { display: "BTCUSDT · 4h", availability: AVAILABLE },
    created_at_utc_ms: 1789836572000,
    certificate: { grade: "B", availability: AVAILABLE },
    claim: { state: null, text: "STRICT_OUTER_OOS — OOS read once after freeze", availability: AVAILABLE },
    stages: [
      { key: "S1", state: "done", tip: "S1 Split — done", tooltip_source: "SOURCE_VERBATIM", availability: AVAILABLE },
      { key: "S2", state: "cap", tip: "S2 Search — strict schedule, no cap", tooltip_source: "SOURCE_VERBATIM", availability: AVAILABLE },
      { key: "S3", state: "done", tip: "S3 Freeze — reached", tooltip_source: "DERIVED_FROM_PERSISTED_STATE", availability: AVAILABLE },
      { key: "S4", state: "pend", tip: null, tooltip_source: "NOT_PUBLISHED", availability: NOT_PUBLISHED },
      { key: "S5", state: "pend", tip: null, tooltip_source: "NOT_PUBLISHED", availability: NOT_PUBLISHED },
    ],
    stats: [
      { key: "oos_sharpe", label: "OOS sharpe", role: "OOS_SHARPE", value: "1.049", tone: "DEFAULT", availability: AVAILABLE, scope: null, definition_id: null },
      { key: "decay", label: "Δ decay", role: "DECAY", value: null, tone: "DEFAULT", availability: NOT_PUBLISHED, scope: null, definition_id: null },
      { key: "trades", label: "trades", role: "TRADE_COUNT", value: "214", tone: "DEFAULT", availability: AVAILABLE, scope: null, definition_id: null },
    ],
    superseded_note: null,
    comparison: { key: "BTCUSDT·4h·close_target_v2·walk_forward", availability: AVAILABLE },
    sparkline: { kind: "oos_equity", availability: AVAILABLE },
    source_updated_at_utc_ms: 1789836582000,
    ...overrides,
  };
}

function page(items: RunLibraryItem[], overrides: Partial<RunLibraryResponse> = {}): RunLibraryResponse {
  return {
    schema_version: "research.run-library.v1",
    read_authority: "PORTAL_PERSISTED_RESEARCH",
    items,
    page: {
      limit: 50,
      total_rows: items.length,
      filtered_rows: items.length,
      next_cursor: null,
      prev_cursor: null,
      has_more: false,
      has_previous: false,
      order: "CREATED_AT_DESC_RUN_ID_DESC",
    },
    counters: { logical_runs: items.length, worker_children: 0, technical_retries: 0, legacy_metadata_rows: 0 },
    status_counts: { COMPLETED: items.length, RUNNING: 0, FAILED: 0, QUEUED: 0, DRAFT: 0, CANCELLED: 0, RECOVERY_REQUIRED: 0 },
    claim_ledger: { issued: 1, not_issued: 0, pending_source: 0, failed: 0, cancelled_before_source: 0, legacy_metadata_only: 0 },
    filter_catalog: {
      alphas: [{ alpha_id: "alpha_momentum_btc", alpha_name: "alpha_momentum_btc" }],
      modes: [{ key: "mode_1_decay", display: "mode_1" }],
      scratch_available: true,
    },
    as_of_utc_ms: 1789836590000,
    ...overrides,
  };
}

const EMPTY_FILTERS: LibraryFilters = { q: "", status: [], mode: [], alpha: [], group: false, sel: [] };
const OK = researchState({ kind: "ok", rowCount: 1 });

function view(overrides: Partial<React.ComponentProps<typeof RunLibrary>> = {}) {
  const response = overrides.response === undefined ? page([item()]) : overrides.response;
  return render(
    <MemoryRouter>
      <RunLibrary
        filters={EMPTY_FILTERS}
        onFilters={vi.fn()}
        onToggleSel={vi.fn()}
        response={response}
        items={response?.items ?? []}
        state={OK}
        sparklines={new Map()}
        onVisible={vi.fn()}
        onLoadNext={vi.fn()}
        onLoadPrevious={vi.fn()}
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
  requested = [];
});
afterEach(() => vi.unstubAllGlobals());

/* -------------------------------------------------------------------------
 * The query builder
 * ---------------------------------------------------------------------- */

describe("P12-T01 — the query the contract allows, and no other", () => {
  it("emits generated values and caps the limit", () => {
    const query = listQueryString({ q: "btc", status: ["RUNNING"], mode: ["m1"], alpha: ["a1"], limit: 500 });
    expect(query).toContain("q=btc");
    expect(query).toContain("status=RUNNING");
    expect(query).toContain(`limit=${LIST_LIMIT}`);
  });

  it("refuses to mix an ids poll with cursors or filters", () => {
    // The contract makes them mutually exclusive; sending both would ask the
    // server to resolve a contradiction the browser created.
    expect(() => listQueryString({ ids: [] })).toThrow(RunLibraryQueryError);
    expect(() => listQueryString({ ids: Array.from({ length: IDS_LIMIT + 1 }, (_, i) => `r${i}`) })).toThrow(
      RunLibraryQueryError,
    );
    expect(() => listQueryString({ cursor: "c", before: "b" })).toThrow(RunLibraryQueryError);
  });

  it("sends an ids poll with no filter and no limit", () => {
    const query = listQueryString({ ids: ["R-1", "R-2"] });
    expect(query).toBe("?ids=R-1&ids=R-2");
  });

  it("decodes no opaque value", () => {
    const code = codeOf("runLibraryClient.ts") + codeOf("useRunLibrary.ts");
    expect(code).not.toMatch(/atob|btoa|JSON\.parse\(.*cursor|decodeCursor/i);
  });
});

/* -------------------------------------------------------------------------
 * URL state
 * ---------------------------------------------------------------------- */

describe("P12-T02 — the URL is the single source of truth", () => {
  it("round-trips every filter", () => {
    const filters: LibraryFilters = {
      q: "btc",
      status: ["RUNNING", "FAILED"],
      mode: ["mode_1_decay"],
      alpha: ["alpha_momentum_btc", "scratch"],
      group: true,
      sel: ["R-1", "R-2"],
    };
    expect(filtersFromSearch(searchFromFilters(filters))).toEqual(filters);
  });

  it("drops a status the contract does not declare", () => {
    // A hand-edited URL cannot widen the query.
    expect(filtersFromSearch("?status=RUNNING,NOT_A_STATUS").status).toEqual(["RUNNING"]);
  });

  it("caps sel at two from the URL", () => {
    expect(filtersFromSearch("?sel=a,b,c").sel).toEqual(["a", "b"]);
  });

  it("replaces the oldest selection rather than refusing a third", () => {
    expect(toggleSelection(["a", "b"], "c")).toEqual(["b", "c"]);
    expect(toggleSelection(["a", "b"], "a")).toEqual(["b"]);
  });

  it("omits everything empty so a shared link stays short", () => {
    expect(searchFromFilters(EMPTY_FILTERS)).toBe("");
  });
});

/* -------------------------------------------------------------------------
 * Comparison
 * ---------------------------------------------------------------------- */

describe("P12-T03 — the server owns comparability", () => {
  it("compares only two identical non-null keys", () => {
    const a = item({ run_id: "A" });
    const b = item({ run_id: "B" });
    expect(mayCompare(a, b)).toBe(true);
    expect(mayCompare(a, item({ run_id: "C", comparison: { key: "other", availability: AVAILABLE } }))).toBe(false);
    // Two unpublished keys are not "equally unknown, therefore comparable".
    expect(
      mayCompare(
        item({ comparison: { key: null, availability: NOT_PUBLISHED } }),
        item({ comparison: { key: null, availability: NOT_PUBLISHED } }),
      ),
    ).toBe(false);
    expect(mayCompare(a, undefined)).toBe(false);
  });

  it("refuses with the verbatim sentence and a disabled button", () => {
    const a = item({ run_id: "A" });
    const b = item({ run_id: "B", comparison: { key: "different", availability: AVAILABLE } });
    view({ response: page([a, b]), filters: { ...EMPTY_FILTERS, sel: ["A", "B"] } });

    expect(document.querySelector("[data-compare-bar]")?.getAttribute("data-compare-bar")).toBe("refused");
    expect(screen.getByText(COMPARE_REFUSAL)).toBeTruthy();
    const button = document.querySelector('[data-action="open-compare"]') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("title")).toBe(COMPARE_REFUSAL);
  });

  it("offers compare when the keys match", () => {
    view({
      response: page([item({ run_id: "A" }), item({ run_id: "B" })]),
      filters: { ...EMPTY_FILTERS, sel: ["A", "B"] },
    });
    expect(document.querySelector("[data-compare-bar]")?.getAttribute("data-compare-bar")).toBe("ready");
    const link = document.querySelector('[data-action="open-compare"]') as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/research/quantbt/compare?runs=A,B&alpha=alpha_momentum_btc");
    expect(link.textContent).toContain("open compare");
  });

  it("never compares labels or names", () => {
    const code = codeOf("runLibraryClient.ts");
    expect(code).not.toMatch(/alpha_name\s*===|instrument.*===.*instrument|label\s*===/);
  });

  it("lets every card be selected, and decides validity at the bar", () => {
    view({ response: page([item({ run_id: "A" }), item({ run_id: "B", comparison: { key: null, availability: NOT_PUBLISHED } })]) });
    for (const box of Array.from(document.querySelectorAll("[data-compare-check]"))) {
      expect((box as HTMLInputElement).disabled).toBe(false);
    }
  });
});

/* -------------------------------------------------------------------------
 * Truthful presentation
 * ---------------------------------------------------------------------- */

describe("P12-T04 — an unavailable fact keeps its place and states its reason", () => {
  it("never turns a NOT_PUBLISHED metric into a zero", () => {
    view();
    const decay = document.querySelector('[data-metric="DECAY"]') as HTMLElement;
    // The slot keeps its place and says why in words (never a bare dash); the sentence is in `title`.
    const withheld = decay.querySelector("[data-withheld]") as HTMLElement;
    expect(withheld.textContent).toBe("not published");
    expect(withheld.getAttribute("title")).toBeTruthy();
    expect(decay.textContent).not.toMatch(/\b0\b/);
    expect(withheld.getAttribute("data-withheld")).toBe("NOT_PUBLISHED");
  });

  it("keeps a legacy row and names it as not current evidence", () => {
    view({ response: page([item({ source_kind: "LEGACY_1_0_8_METADATA" })]) });
    expect(document.querySelector("[data-run]")?.getAttribute("data-source-kind")).toBe(
      "LEGACY_1_0_8_METADATA",
    );
    expect(screen.getByText(LEGACY_NOTE)).toBeTruthy();
  });

  it("reserves no chip for a null rc", () => {
    view();
    expect(document.querySelector("[data-rc]")).toBeNull();
    expect(document.body.textContent).not.toMatch(/\brc_\b/);
  });

  it("shows a grade only when it is published, and cert — otherwise (spec 01 §4.4)", () => {
    view();
    expect(document.querySelector("[data-certificate]")?.getAttribute("data-certificate")).toBe("B");
    cleanup();
    view({ response: page([item({ certificate: { grade: null, availability: NOT_PUBLISHED } })]) });
    expect(document.querySelector("[data-certificate]")?.getAttribute("data-certificate")).toBe("none");
    expect(document.querySelector("[data-certificate]")?.textContent).toBe("cert —");
  });

  it("renders a pending claim for a running run and never a completed one", () => {
    view({
      response: page([
        item({ status: "RUNNING", claim: { state: null, text: null, availability: { state: "PENDING_SOURCE_CALLBACK", reason_code: null } } }),
      ]),
    });
    expect(screen.getByText(CLAIM_PENDING)).toBeTruthy();
  });

  it("labels derived stage tooltips as derived", () => {
    view();
    const derived = document.querySelector('[data-stage-cell="S3"]') as HTMLElement;
    expect(derived.getAttribute("data-tooltip-source")).toBe("DERIVED_FROM_PERSISTED_STATE");
    expect(derived.getAttribute("title")).toContain("derived from persisted state");

    const verbatim = document.querySelector('[data-stage-cell="S2"]') as HTMLElement;
    expect(verbatim.getAttribute("title")).toBe("S2 Search — strict schedule, no cap");

    const absent = document.querySelector('[data-stage-cell="S5"]') as HTMLElement;
    expect(absent.getAttribute("title")).toBe("no stage narrative was published");
  });

  it("E10 (audit 01-5): a FAILED card's failing stage is red and the card says where it failed", () => {
    // The server's P12 shape for a failed run: the stopping stage is `blocked`
    // (HiFi R-WFO-116), derived and labelled so; `failed at` names it.
    const failed = item({
      status: "FAILED",
      stages: [
        { key: "S1", state: "done", tip: "Persisted S1 state: DONE.", tooltip_source: "DERIVED_FROM_PERSISTED_STATE", availability: AVAILABLE },
        { key: "S2", state: "done", tip: "Persisted S2 state: DONE.", tooltip_source: "DERIVED_FROM_PERSISTED_STATE", availability: AVAILABLE },
        { key: "S3", state: "done", tip: "Persisted S3 state: DONE.", tooltip_source: "DERIVED_FROM_PERSISTED_STATE", availability: AVAILABLE },
        { key: "S4", state: "blocked", tip: "The run failed during S4; persisted S4 state: RUNNING.", tooltip_source: "DERIVED_FROM_PERSISTED_STATE", availability: AVAILABLE },
        { key: "S5", state: "pend", tip: "Persisted S5 state: PENDING.", tooltip_source: "DERIVED_FROM_PERSISTED_STATE", availability: AVAILABLE },
      ],
      stats: [
        { key: "failed_at", label: "failed at", role: "FAILED_AT", value: "S4", tone: "BAD", availability: AVAILABLE, scope: null, definition_id: null },
        { key: "failure_reason", label: "reason", role: "FAILURE_REASON", value: "P06_RETRY_NOT_DISPATCHED", tone: "BAD", availability: AVAILABLE, scope: null, definition_id: null },
        { key: "runtime", label: "runtime", role: "RUNTIME", value: "9 s", tone: "BAD", availability: AVAILABLE, scope: null, definition_id: null },
      ],
      sparkline: { kind: "failed", availability: AVAILABLE },
    });
    view({ response: page([failed]) });
    const cell = document.querySelector('[data-stage-cell="S4"]') as HTMLElement;
    expect(cell.getAttribute("data-stage-state")).toBe("blocked");
    expect(cell.style.color).toBe("var(--bad)");
    expect(cell.style.borderColor || cell.style.border).toContain("var(--bad)");
    expect(cell.getAttribute("title")).toBe("derived from persisted state — The run failed during S4; persisted S4 state: RUNNING.");
    // No other cell is red, and a failed stage never pulses as if running.
    for (const key of ["S1", "S2", "S3", "S5"]) {
      expect((document.querySelector(`[data-stage-cell="${key}"]`) as HTMLElement).style.color).not.toBe("var(--bad)");
    }
    expect(cell.getAttribute("data-motion")).toBeNull();
    const text = document.body.textContent ?? "";
    expect(text).toContain("S4");
    expect(text).toContain("P06_RETRY_NOT_DISPATCHED");
  });

  it("keeps the lazy placeholder when no series is published", () => {
    view({ response: page([item({ sparkline: { kind: null, availability: NOT_PUBLISHED } })]) });
    expect(
      document.querySelector("[data-sparkline-placeholder]")?.getAttribute("data-sparkline-placeholder"),
    ).toBe("NOT_PUBLISHED");
    expect(document.querySelector("[data-sparkline-values]")).toBeNull();
  });

  it("keeps the filter bar when nothing matches", () => {
    view({ response: page([], { page: { ...page([]).page, filtered_rows: 0, total_rows: 12 } }) });
    expect(document.querySelector("[data-filter-bar]")).toBeTruthy();
    expect(document.querySelector("[data-empty]")).toBeTruthy();
    expect(document.querySelector("[data-counter]")?.textContent).toBe("0 of 12 runs");
  });

  it("shows the subtitle that says the library ranks nothing", () => {
    view();
    expect(screen.getByText(SUBTITLE)).toBeTruthy();
  });
});

/* -------------------------------------------------------------------------
 * The poll
 * ---------------------------------------------------------------------- */

describe("P12-T05 — the running poll is bounded on every axis", () => {
  /*
   * Fake timers are installed *before* the hook renders.
   *
   * The first version installed them afterwards, so the interval had already
   * been created against the real clock and `advanceTimersByTime` moved a
   * clock nothing was listening to — four tests sat until the 5 s timeout.
   * `settle` flushes the fetch promises through the same fake clock instead of
   * waiting on a real one.
   */
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function hook() {
    return renderHook(() => useRunLibrary(), {
      wrapper: ({ children }) => (
        <MemoryRouter initialEntries={["/research/quantbt/runs"]}>{children}</MemoryRouter>
      ),
    });
  }

  /**
   * Runs an optional action and then drains the fake clock in one `act`.
   *
   * Separate `act` calls overlapped: `observeVisible` starts the poll
   * synchronously, so its pending promise was still open when the next `act`
   * began. One wrapper per step keeps them ordered.
   */
  async function settle(ms = 0, action?: () => void) {
    await act(async () => {
      action?.();
      await vi.advanceTimersByTimeAsync(ms);
    });
  }

  it("does not poll when no visible card is running", async () => {
    stub(() => [200, page([item({ status: "COMPLETED" })])]);
    const { result } = hook();
    await settle();
    expect(result.current.items).toHaveLength(1);
    expect(result.current.polling).toBe(false);

    await settle(RUNNING_POLL_MS * 3);
    expect(requested.filter((url) => url.includes("ids="))).toHaveLength(0);
  });

  it("batches every visible running id onto one interval", async () => {
    // The claim is not "few requests" but "one interval": two visible running
    // cards must cost exactly what one costs, with both ids in the same query.
    async function pollsFor(ids: readonly string[]): Promise<string[]> {
      requested = [];
      const rows = ids.map((id) => item({ run_id: id, status: "RUNNING" }));
      stub(() => [200, page(rows)]);
      const { result, unmount } = hook();
      await settle();
      await settle(0, () => {
        for (const id of ids) result.current.observeVisible(id, true);
      });
      expect(result.current.polling).toBe(true);
      const before = requested.length;
      await settle(RUNNING_POLL_MS * 2);
      const polls = requested.slice(before).filter((url) => url.includes("ids="));
      unmount();
      return polls;
    }

    const one = await pollsFor(["R-1"]);
    const two = await pollsFor(["R-1", "R-2"]);

    expect(one.length).toBeGreaterThan(0);
    expect(two.length).toBe(one.length);
    for (const url of two) {
      expect(url).toContain("ids=R-1");
      expect(url).toContain("ids=R-2");
      // An ids poll carries no filter and no limit; the contract forbids both.
      expect(url).not.toContain("limit=");
      expect(url).not.toContain("status=");
    }
  });

  it("stops polling once the card scrolls out of view", async () => {
    stub(() => [200, page([item({ run_id: "R-1", status: "RUNNING" })])]);
    const { result } = hook();
    await settle();
    await settle(0, () => result.current.observeVisible("R-1", true));
    expect(result.current.polling).toBe(true);

    await settle(0, () => result.current.observeVisible("R-1", false));
    expect(result.current.polling).toBe(false);

    const before = requested.length;
    await settle(RUNNING_POLL_MS * 2);
    expect(requested.slice(before).filter((url) => url.includes("ids="))).toHaveLength(0);
  });

  it("stops polling after a denial rather than asking again every ten seconds", async () => {
    let polls = 0;
    stub((url) => {
      if (url.includes("ids=")) {
        polls += 1;
        return [403, { error: { code: "DENIED", message: "Not your workspace." } }];
      }
      return [200, page([item({ run_id: "R-1", status: "RUNNING" })])];
    });
    const { result } = hook();
    await settle();
    await settle(0, () => result.current.observeVisible("R-1", true));
    await settle(RUNNING_POLL_MS * 3);

    expect(polls).toBe(1);
    expect(result.current.polling).toBe(false);
  });

  it("patches rows in place and never reorders the list", async () => {
    const first = item({ run_id: "R-1", status: "RUNNING" });
    const second = item({ run_id: "R-2", status: "COMPLETED" });
    stub((url) =>
      url.includes("ids=")
        ? [200, page([item({ run_id: "R-1", status: "COMPLETED" })])]
        : [200, page([first, second])],
    );
    const { result } = hook();
    await settle();
    expect(result.current.items).toHaveLength(2);

    await settle(0, () => result.current.observeVisible("R-1", true));
    await settle(RUNNING_POLL_MS);

    expect(result.current.items[0].status).toBe("COMPLETED");
    // The order is untouched: a card must not move because a status changed.
    expect(result.current.items.map((row) => row.run_id)).toEqual(["R-1", "R-2"]);
  });

  /*
   * The two claims below are the ones the browser had to teach this lane.
   *
   * The unit lane called `observeVisible` by hand, so nothing ever re-created
   * an IntersectionObserver. In a real page each card creates one, keyed on
   * the callback: when a patch handed out a fresh callback, every observer was
   * rebuilt, its teardown un-marked the card, the visible set emptied and
   * refilled, and the poll effect restarted — firing its immediate first tick
   * again. Thirty-odd requests a second, each caused by the last.
   */
  it("hands out the same visibility callback across a patch", async () => {
    stub((url) =>
      url.includes("ids=")
        ? [200, page([item({ run_id: "R-1", status: "RUNNING" })])]
        : [200, page([item({ run_id: "R-1", status: "RUNNING" })])],
    );
    const { result } = hook();
    await settle();
    const before = result.current.observeVisible;
    await settle(0, () => result.current.observeVisible("R-1", true));
    await settle(RUNNING_POLL_MS * 2);

    expect(requested.filter((url) => url.includes("ids=")).length).toBeGreaterThan(0);
    expect(result.current.observeVisible).toBe(before);
  });

  it("keeps one interval: a patch does not buy another poll", async () => {
    stub(() => [200, page([item({ run_id: "R-1", status: "RUNNING" })])]);
    const { result } = hook();
    await settle();
    await settle(0, () => result.current.observeVisible("R-1", true));

    const idsPolls = () => requested.filter((url) => url.includes("ids=")).length;
    const afterStart = idsPolls();
    /* Three intervals buy at most the immediate first tick and three more —
       never a poll per patch, which is what the loop produced. */
    await settle(RUNNING_POLL_MS * 3);
    expect(idsPolls() - afterStart).toBeLessThanOrEqual(4);
  });
});

/* -------------------------------------------------------------------------
 * Refusals
 * ---------------------------------------------------------------------- */

describe("P12-T06 — typed refusals keep the route and stop the poll", () => {
  it.each([
    [400, "terminal", false],
    [401, "denied", true],
    [403, "denied", true],
    /* X3 VD-P23-03 (F-04): 404 reads as 403. */
    [404, "denied", true],
    [503, "unavailable", false],
  ])("maps %i", (status, expected, stops) => {
    const refusal = toLibraryRefusal(new PortalApiError("said so", status, "CODE", "r"));
    expect(refusal.state).toBe(expected);
    expect(refusal.stopsPolling).toBe(stops);
    // RF01-F4: the screen's sentence is fixed; the server's own text is detail.
    expect(refusal.message).not.toBe("said so");
    expect(refusal.detail).toBe("said so");
  });

  it("keeps the filter bar and the route on a refusal", () => {
    view({
      response: null,
      items: [],
      state: { state: "denied", reason: "Not your workspace.", mayRetry: false, retainsContent: false },
    });
    expect(document.querySelector("[data-filter-bar]")).toBeTruthy();
    expect(document.querySelector("[data-screen='run-library']")).toBeTruthy();
    expect(screen.getAllByText("Not your workspace.").length).toBeGreaterThan(0);
  });
});

describe("P12-T07 — the surface requests only the two named operations", () => {
  it("names only the library paths", () => {
    const code = codeOf("runLibraryClient.ts");
    const paths = [...code.matchAll(/["'`](\/api\/[^"'`]*)["'`]/g)].map((m) => m[1]);
    expect([...new Set(paths)]).toEqual(["/api/v1/quantbt/runs"]);
    expect(code).not.toMatch(/["'`](https?:)?\/\//);
    expect(code).not.toMatch(/\/internal\/|\/api\/v1\/alphas|parquet|artifact/i);
  });

  it("builds no local DTO for the library payload", () => {
    for (const name of ["runLibraryClient.ts", "useRunLibrary.ts", "RunLibrary.tsx", "RunLibraryRoute.tsx"]) {
      expect(codeOf(name), name).not.toMatch(/interface\s+RunLibrary(Item|Response)\b/);
    }
  });
});
