/**
 * P15 consumer tests — Screen 06 S2 Search & Selection.
 *
 * The claim that carries this phase: **a search that did not happen is not a
 * search whose results are missing.** The installed source qualified this run
 * against a fixed parameter profile, so every optimizer panel says which kind
 * of absence it is, and none of them draws an empty chart that would read as a
 * study which found nothing.
 *
 * The rest follows from it: no best card, no selected trial, no pick, no
 * Freeze action, no inferred objective and no position the browser worked out
 * for itself.
 */
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  OOS_COLUMN_CHIP,
  atlasModeHref,
  SELECTOR_LAYERS_HELP,
  freezeArrow,
  schedulePillTone,
  trialStateTone,
  SEARCH_TITLE,
  SearchScreen,
} from "./SearchDetail";
import { SearchRoute } from "./SearchRoute";
import {
  DIAGNOSTIC_KEYS,
  toSearchRefusal,
  type CurrentSourceSearch,
  type SearchDetail,
} from "./searchClient";
import { DEFAULT_CURSOR, forgetObservedFolds, rememberObservedFolds } from "./evidenceCursor";
import type { LaneNotApplicable } from "./splitClient";
import { forgetSearchReads, searchState, useSearch } from "./useSearch";
import { PortalApiError } from "../lib/api";
import { researchState } from "./state";
import { HUB_LANE_REASON, forgetRunIdentities } from "./retainedLane";

/* W1: the stage pages read the Library status only when a lane refuses; these tests do not cover that read. */
vi.mock("./useRunStatus", () => ({
  useRunStatus: () => ({ state: "unread" }),
  setRunStatusSeed: () => undefined,
  clearRunStatusCache: () => undefined,
}));


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

function gap(reason: string, state: "NOT_PUBLISHED" | "NOT_APPLICABLE" | "NOT_ASSERTED" = "NOT_APPLICABLE") {
  return { state, reason_code: reason, availability: { state, reason_code: reason } } as const;
}

/** The claim row the live preview serves for a declared-not-executed request (rrun_3935…, 2026-09-24). */
function claimRow(overrides: Partial<SearchDetail["claim_row"]> = {}): SearchDetail["claim_row"] {
  const none = (state: "NOT_APPLICABLE" | "NOT_ASSERTED", reason: string, availability: string = state) => ({
    state,
    value: null,
    provenance: "NONE",
    reason_code: reason,
    availability: { state: availability, reason_code: reason },
  });
  return {
    basis: "DECLARED_NOT_EXECUTED",
    validation_claim: none("NOT_APPLICABLE", "P15_DECLARED_OPTIMIZER_NOT_EXECUTED_NO_VALIDATION_CLAIM"),
    chronological_claim: none("NOT_APPLICABLE", "P15_DECLARED_OPTIMIZER_NOT_EXECUTED_NO_CHRONOLOGICAL_CLAIM"),
    oos_used_for_selection: none(
      "NOT_ASSERTED",
      "P04_FIXED_PROFILE_DOES_NOT_PUBLISH_STRICT_OUTER_OOS_SELECTION_FACTS",
      "NOT_PUBLISHED",
    ),
    oos_column: {
      state: "REPORT_ONLY",
      source_evaluation_state: "P04_OBSERVED_AFTER_FIXED_PROFILE",
      provenance: "P14_SOURCE_RECEIPT",
      reason_code: null,
      availability: AVAILABLE,
    },
    scoring_backend: {
      state: "NOT_APPLICABLE",
      declared_value: null,
      provenance: "NONE",
      reason_code: "P15_DECLARED_OPTIMIZER_NOT_EXECUTED_NO_SCORING_BACKEND",
      availability: { state: "NOT_APPLICABLE", reason_code: "P15_DECLARED_OPTIMIZER_NOT_EXECUTED_NO_SCORING_BACKEND" },
    },
    mode_reference: {
      mode: "mode_1_decay",
      schedule: "per_fold_causal",
      operation_id: "researchEngineAtlasGetV1",
      relation: "DECLARED_MODE_RELEASE_METADATA_NOT_RUN_EVIDENCE",
    },
    ...overrides,
  } as unknown as SearchDetail["claim_row"];
}

/** The typed 200 the RS-02 lane answers for a P04 fixed-qualification run. */
function laneAnswer(): LaneNotApplicable {
  return {
    schema_version: "research.current-source-not-applicable.v1",
    read_authority: "PORTAL_RETAINED_CURRENT_SOURCE",
    run_id: "R-WFO-118",
    revision: "rs02_not-applicable_7c",
    etag: '"rs02_not-applicable_7c"',
    availability: { state: "NOT_APPLICABLE", reason_code: "RS02_RETAINED_LANE_NOT_APPLICABLE_TO_P04_FIXED_QUALIFICATION" },
    lane: {
      state: "NOT_APPLICABLE",
      operation: "search",
      run_profile: "P04_FIXED_QUALIFICATION",
      run_adapter_contract_digest: "9ade757b5c1cd87681a2efb49011c84a96211939710dcd32c9fd1c7777e95784",
      retainable_profile_id: "rs02.delta-wfo-global.v1",
      reason_code: "RS02_RETAINED_LANE_NOT_APPLICABLE_TO_P04_FIXED_QUALIFICATION",
    },
  };
}

function detail(overrides: Partial<SearchDetail> = {}): SearchDetail {
  return {
    schema_version: "research.search-detail.v1",
    read_authority: "PORTAL_PERSISTED_RESEARCH",
    run_id: "R-WFO-118",
    revision: "p15r1_7742aa",
    etag: '"p15r1_7742aa"',
    availability: AVAILABLE,
    readiness: "PARTIAL",
    as_of_utc_ms: 1789836590000,
    as_of_basis: "P14_PROJECTION_RECEIVED_AT",
    provenance: {
      source_adapter_id: "p04.delta-rsi.v1",
      adapter_contract_digest: "sha256:adapter01",
      engine_version: "1.1.1",
      input_scope: "P08_OPTIONAL_WARMUP_PLUS_IS_OOS_ONLY",
      source_transform_digest: "sha256:9f2c18",
      requested_spec_digest: "sha256:88ae02",
      effective_spec_digest: "sha256:88ae02",
      dataset_binding_digest: "sha256:5b31c7",
      manifest_digest: "sha256:c25a1d",
    },
    source_profile: { state: "FIXED_PROFILE_NO_SEARCH", reason_code: null, availability: AVAILABLE },
    requested_optimizer: {
      mode: "mode_1_decay",
      schedule: "per_fold_causal",
      state: "DECLARED_NOT_EXECUTED",
      candidate_selection_metric: {
        state: "NOT_PUBLISHED",
        value: null,
        provenance: "NONE",
        reason_code: "P15_DECLARED_REQUEST_DID_NOT_BIND_CANDIDATE_SELECTION_METRIC",
        availability: {
          state: "NOT_PUBLISHED",
          reason_code: "P15_DECLARED_REQUEST_DID_NOT_BIND_CANDIDATE_SELECTION_METRIC",
        },
      },
      availability: AVAILABLE,
    },
    claim_row: claimRow(),
    fixed_profile: {
      state: "FIXED_PROFILE_NO_SEARCH",
      adapter_contract_digest: "sha256:adapter01",
      parameter_bundle_digest: "sha256:bundle01",
      parameters: [
        {
          name: "rsi_len",
          kind: "NUMERIC",
          minimum: "5",
          maximum: "40",
          step: "1",
          effective_value: "14",
          position_percent: 25.7,
          bound_state: "WITHIN_DECLARED_RANGE",
          bound_warning: { definition_id: "research.bound-warning.v1", copy_version: "research.bound-warning-copy.v1", reference_space: "DECLARED_RANGE", state: "INTERIOR", side: null, reason_code: null },
        },
        {
          name: "atr_mult",
          kind: "NUMERIC",
          minimum: "0.50",
          maximum: "4.00",
          step: "0.25",
          effective_value: "2.00",
          position_percent: 42.9,
          bound_state: "WITHIN_DECLARED_RANGE",
          bound_warning: { definition_id: "research.bound-warning.v1", copy_version: "research.bound-warning-copy.v1", reference_space: "DECLARED_RANGE", state: "INTERIOR", side: null, reason_code: null },
        },
      ],
      strict_outer_oos: gap("P04_FIXED_PROFILE_ASSERTS_NO_STRICT_SELECTOR", "NOT_ASSERTED"),
      availability: AVAILABLE,
    },
    selection: {
      state: "FIXED_PARAMETER_PROFILE",
      selected_trial_ref: null,
      parameter_bundle_digest: "sha256:bundle01",
      selection_trace: gap("P04_PUBLISHES_NO_SELECTION_TRACE"),
      availability: AVAILABLE,
    },
    inspection: {
      requested_fold: 3,
      state: "NOT_APPLICABLE",
      availability: { state: "NOT_APPLICABLE", reason_code: "P04_HAS_NO_OPTIMIZER_FOLD" },
    },
    ledger: {
      state: "NOT_APPLICABLE",
      reason_code: "P04_RAN_NO_TRIALS",
      total_rows: null,
      sampled_rows: null,
      page: null,
      availability: { state: "NOT_APPLICABLE", reason_code: "P04_RAN_NO_TRIALS" },
    },
    diagnostics: {
      state: "NOT_APPLICABLE",
      availability: { state: "NOT_APPLICABLE", reason_code: "P04_RAN_NO_TRIALS" },
      scatter: gap("P04_RAN_NO_TRIALS"),
      distributions: gap("P04_RAN_NO_TRIALS"),
      parameter_frequency: gap("P04_RAN_NO_TRIALS"),
      progression: gap("P04_RAN_NO_TRIALS"),
      prune_reasons: gap("P04_RAN_NO_TRIALS"),
      importance: gap("P04_PUBLISHES_NO_IMPORTANCE", "NOT_PUBLISHED"),
      interactions: gap("P04_PUBLISHES_NO_INTERACTIONS", "NOT_PUBLISHED"),
    },
    source_absences: {
      objective_components: gap("P04_PUBLISHES_NO_OBJECTIVE_COMPONENTS", "NOT_PUBLISHED"),
    },
    ...overrides,
  } as SearchDetail;
}

function retainedSearch(): CurrentSourceSearch {
  return {
    read_authority: "PORTAL_RETAINED_CURRENT_SOURCE",
    run_id: "R-WFO-118",
    revision: "rs02r1_9c",
    etag: '"rs02r1_9c"',
    availability: { state: "AVAILABLE", reason_code: null },
    as_of_utc_ms: 1789836590000,
    provenance: {
      source_adapter_id: "rs02.quantbt-advanced-wfo.v1",
      profile_id: "rs02.delta-wfo-global.v1",
      engine_version: "1.1.1",
      source_manifest_digest: "sha256:m",
      source_transform_digest: "sha256:t",
      retained_import_digest: "sha256:r",
      requested_spec_digest: "sha256:q",
      effective_spec_digest: "sha256:e",
      dataset_binding_digest: "sha256:d",
      retained_at_utc_ms: 1789836000000,
    },
    schema_version: "research.current-source-search.v1",
    selection: {
      state: "AVAILABLE",
      selected_trial_id: "trial_017",
      objective: "1.284",
      parameters: { rsi_len: "14" },
      availability: { state: "AVAILABLE", reason_code: null },
    },
    ledger: {
      source_trial_count: 512,
      returned_rows: 2,
      trials: [
        {
          source_ordinal: 16,
          trial_id: "trial_017",
          state: "COMPLETE",
          objective: "1.284",
          parameters: { rsi_len: "14" },
          playback_cursor: "opaque_a",
        },
        {
          source_ordinal: 41,
          trial_id: "trial_042",
          state: "PRUNED",
          objective: null,
          parameters: { rsi_len: "21" },
          playback_cursor: "opaque_b",
        },
      ],
      page: {
        limit: 200,
        next_cursor: "opaque_next",
        prev_cursor: null,
        has_more: true,
        has_previous: false,
        order: "SOURCE_TABLE_ORDINAL_ASC",
      },
      availability: { state: "AVAILABLE", reason_code: null },
    },
    candidates: {
      source_candidate_count: 24,
      rows: [],
      availability: { state: "AVAILABLE", reason_code: null },
    },
    diagnostics: {
      candidates: { state: "NOT_PUBLISHED", reason_code: "X", availability: { state: "NOT_PUBLISHED", reason_code: "X" } },
      objective_components: {
        state: "NOT_PUBLISHED",
        reason_code: "X",
        availability: { state: "NOT_PUBLISHED", reason_code: "X" },
      },
    },
  } as unknown as CurrentSourceSearch;
}

const OK = researchState({ kind: "ok", rowCount: 2 });

function view(overrides: Partial<React.ComponentProps<typeof SearchScreen>> = {}) {
  return render(
    <MemoryRouter>
      <SearchScreen
        runId="R-WFO-118"
        detail={detail()}
        state={OK}
        cursor={DEFAULT_CURSOR}
        ledger={{ state: "idle" }}
        ensureLedger={vi.fn()}
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
  forgetSearchReads();
});

/** A run the retained lane could admit: the search read does not rule a ledger out. */
function admitted(): SearchDetail {
  const base = detail();
  return {
    ...base,
    source_profile: { state: "NOT_PUBLISHED", reason_code: "P15_SOURCE_NOT_REPORTED", availability: { state: "NOT_PUBLISHED", reason_code: "P15_SOURCE_NOT_REPORTED" } },
    ledger: { ...base.ledger, state: "NOT_PUBLISHED", availability: { state: "NOT_PUBLISHED", reason_code: "P04_RAN_NO_TRIALS" } },
  } as SearchDetail;
}

/* -------------------------------------------------------------------------
 * P15-T01 — a fixed qualification is not a broken optimizer
 * ---------------------------------------------------------------------- */

describe("P15-T01 — the source is described as what it is", () => {
  it("the existing-pattern new-attempt link preserves the exact source run/workspace and allocates nothing", () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const { container } = render(<MemoryRouter initialEntries={["/research/quantbt/runs/R-WFO-118/search?workspace_id=owned"]}>
      <SearchScreen runId="R-WFO-118" workspaceId="owned" detail={detail()} state={OK} cursor={DEFAULT_CURSOR} ledger={{ state: "idle" }} ensureLedger={vi.fn()} onReread={vi.fn()} />
    </MemoryRouter>);
    const link = container.querySelector('[data-action="propose-new-attempt"]')!;
    expect(link.getAttribute("href")).toBe("/research/quantbt/runs/new?from=R-WFO-118&workspace_id=owned");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("labels the installed source a fixed profile", () => {
    const { container } = view();
    expect(container.querySelector("[data-source-profile='FIXED_PROFILE_NO_SEARCH']")).toBeTruthy();
    expect(container.querySelector("[data-source-strip]")?.textContent).not.toMatch(/inactive|disabled|failed|error/i);
  });

  it("says the request declared a mode and the source did not execute it", () => {
    const { container } = view();
    const requested = container.querySelector("[data-requested-optimizer]");
    expect(requested?.getAttribute("data-requested-optimizer")).toBe("DECLARED_NOT_EXECUTED");
    expect(requested?.textContent).toContain("mode 1 decay");
    expect(requested?.textContent).toContain("declared not executed");
  });

  it("shows an unbound selection metric as unpublished, with its reason", () => {
    const { container } = view();
    const metric = container.querySelector("[data-metric-state='NOT_PUBLISHED']");
    expect(metric?.textContent).toContain("not published");
    // No value, no chip, no "inferred" label, and nothing from a catalogue.
    expect(container.querySelector("[data-metric-value]")).toBeNull();
    expect(container.querySelector("[data-metric-provenance]")).toBeNull();
    expect(container.textContent).not.toMatch(/robust_decay|inferred/i);
    expect(metric?.querySelector("[title]")?.getAttribute("title")).toBe(
      "P15_DECLARED_REQUEST_DID_NOT_BIND_CANDIDATE_SELECTION_METRIC",
    );
  });

  it("renders the confirmed branch when a run-bound metric exists", () => {
    const base = detail();
    const { container } = view({
      detail: {
        ...base,
        requested_optimizer: {
          ...base.requested_optimizer,
          candidate_selection_metric: {
            state: "CONFIRMED",
            value: "robust_decay",
            provenance: "RUN_BOUND_ENGINE_DEFAULT",
            reason_code: null,
            availability: { state: "AVAILABLE", reason_code: null },
          },
        },
      } as SearchDetail,
    });
    expect(container.querySelector("[data-metric-value='robust_decay']")).toBeTruthy();
    expect(container.querySelector("[data-metric-provenance]")?.textContent).toContain(
      "run bound engine default",
    );
  });

  it("offers no mode switcher, because a run is one mode", () => {
    const { container } = view();
    expect(container.querySelectorAll("button[data-mode], [data-mode-switcher]")).toHaveLength(0);
    expect(container.querySelector("select")).toBeNull();
  });
});

/* -------------------------------------------------------------------------
 * P15-T02 — the declared profile
 * ---------------------------------------------------------------------- */

describe("P15-T02 — the one panel with content prints exactly what was declared", () => {
  it("renders each parameter's own decimal strings", () => {
    const { container } = view();
    expect(container.querySelectorAll("[data-parameter]")).toHaveLength(2);
    expect(container.querySelector("[data-range='atr_mult']")?.textContent).toBe("0.50 … 4.00");
    expect(container.querySelector("[data-effective='atr_mult']")?.textContent).toBe("2.00");
  });

  it("places the tick at the server's own position, not one it worked out", () => {
    const { container } = view();
    const tick = container.querySelector("[data-position='rsi_len']") as HTMLElement;
    expect(tick.getAttribute("data-position-percent")).toBe("25.7");
    expect(tick.style.left).toBe("25.7%");

    // 14 of 5…40 would be 25.71%: close, and not what is drawn. No arithmetic
    // is applied to a declared bound anywhere, so the two can never disagree.
    const code = codeOf("SearchDetail.tsx");
    expect(code).not.toMatch(/parameter\.(minimum|maximum|effective_value)\s*[-+*/]/);
    expect(code).not.toMatch(/[-+*/]\s*(Number\()?parameter\.(minimum|maximum|effective_value)/);
  });

  it("shows the declared bound state rather than judging it", () => {
    const { container } = view();
    expect(container.querySelector("[data-bound-state='WITHIN_DECLARED_RANGE']")).toBeTruthy();
    expect(container.querySelector("[data-parameters]")?.textContent).not.toMatch(/near edge|out of range|widen/i);
  });
});

/* -------------------------------------------------------------------------
 * P15-T03 — the absences
 * ---------------------------------------------------------------------- */

describe("P15-T03 — each empty panel says which kind of empty it is", () => {
  /* QA 2026-10-02 D11: a fixed profile ran no search — one sentence replaces the shell per diagnostic; the served reasons ride in its title. */
  it("a fixed profile draws no diagnostic shell, one sentence, and the served reason codes in its title", () => {
    const { container } = view();
    for (const key of DIAGNOSTIC_KEYS) expect(container.querySelector(`[data-panel='${key}']`), key).toBeNull();
    const note = container.querySelector("[data-panel='fixed-profile-note']") as HTMLElement;
    expect(note.textContent).toBe("No search ran — the parameters were fixed.");
    expect(note.getAttribute("title")).toContain("P04_RAN_NO_TRIALS");
    expect(note.getAttribute("title")).toContain("P04_PUBLISHES_NO_IMPORTANCE");
    /* the codes live in the title only: no raw P04_ token is visible text on the screen */
    expect(container.textContent).not.toMatch(/P04_[A-Z_]+/);
    expect(container.querySelector("canvas, svg[data-chart]")).toBeNull();
    expect(container.textContent).not.toMatch(/\b0 trials\b|\b0 candidates\b/);
  });

  it("keeps the strict outer-OOS selector unasserted, with no verdict", () => {
    const { container } = view();
    const strict = container.querySelector("[data-gap-fact='strict outer OOS']");
    expect(strict?.getAttribute("data-gap-state")).toBe("NOT_ASSERTED");
    expect(strict?.textContent).toContain("not asserted");
    expect(container.querySelector("[data-verdict]")).toBeNull();
  });
});

/* -------------------------------------------------------------------------
 * P15-T04 — selection and inspection
 * ---------------------------------------------------------------------- */

describe("P15-T04 — no trial exists, so nothing points at one", () => {
  it("creates no best card, pick or jump-to-trial action", () => {
    const { container } = view();
    expect(container.querySelector("[data-selected-trial]")).toBeNull();
    expect(container.querySelector("[data-action='pick-trial']")).toBeNull();
    expect(container.querySelector("[data-action='freeze']")).toBeNull();
    /* D11: no selection / inspection / freeze-line shell at all on a fixed profile, so nothing can point at a trial or a fold. */
    expect(container.querySelector("[data-panel='selection']")).toBeNull();
    expect(container.querySelector("[data-panel='inspection']")).toBeNull();
    expect(container.querySelector("[data-freeze-line]")).toBeNull();
    expect(container.querySelector("[data-stage='B']")).toBeNull();
  });
});

/* -------------------------------------------------------------------------
 * P15-T05 — the retained ledger
 * ---------------------------------------------------------------------- */

describe("P15-T05 — the ledger comes from the one operation that retains it", () => {
  it("keeps the contract's ledger reason when the retained lane refuses", () => {
    const { container } = view({
      ledger: {
        state: "refused",
        refusal: toSearchRefusal(new PortalApiError("Not an admitted profile.", 404, "NOT_ADMITTED", null)),
        laneState: null,
      },
    });
    const refusal = container.querySelector("[data-ledger-refusal]");
    // VD-FG-01-01: the code chip is on screen; the server's sentence is its tooltip, not text.
    expect(refusal?.querySelector("[data-refusal-code]")?.getAttribute("data-refusal-code")).toBe("NOT_ADMITTED");
    expect(refusal?.querySelector("[data-refusal-detail]")?.getAttribute("title")).toContain("Not an admitted profile.");
    expect(refusal?.textContent).not.toContain("Not an admitted profile.");
    expect(refusal?.querySelector("[data-ledger-gap-state='NOT_APPLICABLE']")).toBeTruthy();
    expect(refusal?.textContent).toContain("P04_RAN_NO_TRIALS");
    // The rest of the screen stands.
    expect(container.querySelector("[data-panel='search-space']")).toBeTruthy();
  });

  it("renders retained rows and marks the source's own selection", () => {
    const { container } = view({ ledger: { state: "ready", search: retainedSearch() } });
    expect(container.querySelectorAll("[data-trial]")).toHaveLength(2);
    expect(container.querySelector("[data-trial='trial_017']")?.getAttribute("data-trial-selected")).toBe(
      "true",
    );
    expect(container.querySelector("[data-ledger-total]")?.textContent).toContain("2 of 512");
    // A pruned trial with no objective says so rather than showing a zero.
    expect(container.querySelector("[data-trial='trial_042']")?.textContent).toContain("not published");
  });
});

/* -------------------------------------------------------------------------
 * P15-T06 — reads, refusals and the boundary
 * ---------------------------------------------------------------------- */

describe("P15-T06 — one search read, one optional ledger read", () => {
  it("sends the cursor's fold as the contract's fold selector and nothing else", async () => {
    stub(() => [200, detail()]);
    const { result } = renderHook(() => useSearch("R-WFO-118", 3));
    await waitFor(() => expect(result.current.detail).not.toBeNull());
    expect(requested).toEqual(["/api/v1/quantbt/runs/R-WFO-118/search?fold=3"]);
  });

  it("asks the retained ledger once", async () => {
    stub((url) =>
      url.includes("current-source")
        ? [404, { error: { code: "NOT_ADMITTED", message: "no" } }]
        : [200, admitted()],
    );
    const { result } = renderHook(() => useSearch("R-WFO-118", null));
    await waitFor(() => expect(result.current.detail).not.toBeNull());
    await act(async () => {
      result.current.ensureLedger();
      result.current.ensureLedger();
    });
    await waitFor(() => expect(result.current.ledger.state).toBe("refused"));
    expect(requested.filter((url) => url.includes("current-source"))).toHaveLength(1);
  });

  it("sends the ETag on a reread and keeps the copy on 304", async () => {
    let reads = 0;
    const seen: (HeadersInit | undefined)[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        requested.push(url);
        seen.push(init?.headers);
        reads += 1;
        const status = reads === 1 ? 200 : 304;
        return {
          ok: status === 200,
          status,
          statusText: String(status),
          headers: new Headers(),
          json: async () => detail(),
        } as unknown as Response;
      }),
    );

    const { result } = renderHook(() => useSearch("R-WFO-118", null));
    await waitFor(() => expect(result.current.detail).not.toBeNull());
    const first = result.current.detail;

    await act(async () => result.current.reread());
    await waitFor(() => expect(reads).toBe(2));
    // A 304 means the projection in hand is still exact: same object, no repaint.
    expect(result.current.detail).toBe(first);
    expect(seen[1]).toEqual({ "If-None-Match": '"p15r1_7742aa"' });
  });

  it("classifies each refusal and keeps the screen", () => {
    const of = (status: number) => toSearchRefusal(new PortalApiError("no", status, null, null));
    expect(of(403).state).toBe("denied");
    /* X3 2026-09-26 one refusal rule (F-04): a 404 reads exactly as a 403. */
    expect(of(404).state).toBe("denied");
    expect(of(503).state).toBe("unavailable");

    const { container } = view({
      detail: null,
      state: { state: "denied", reason: "Not your workspace.", mayRetry: false, retainsContent: false },
    });
    expect(container.querySelector("[data-screen='search-detail']")).toBeTruthy();
    /* VD-TEXT-01: the "rules of this screen" footer is gone. */
    expect(container.querySelector("[data-rules-footer]")).toBeNull();
    expect(container.textContent).not.toContain("rules of this screen");
  });

  it("names only the published paths and computes nothing", () => {
    const code = codeOf("searchClient.ts");
    const paths = [...code.matchAll(/["'`](\/api\/[^"'`$]*)/g)].map((match) => match[1]);
    expect([...new Set(paths)]).toEqual(["/api/v1/quantbt/runs"]);
    expect(code).not.toMatch(/\/internal\/|optuna|parquet|artifact/i);

    const screenCode = codeOf("SearchDetail.tsx");
    expect(screenCode).not.toMatch(/\.sort\(|Math\.max\(|reduce\(/);
  });

  it("keeps the short title; the subtitle, the rules footer and the one-mode note are gone (VD-TEXT-01)", () => {
    const { container } = view();
    expect(screen.getByText(SEARCH_TITLE)).toBeTruthy();
    expect(SEARCH_TITLE).toBe("Search & Selection");
    expect(container.querySelector("[data-subtitle]")).toBeNull();
    expect(container.querySelector("[data-rules-footer]")).toBeNull();
    expect(container.querySelector("[data-one-mode]")).toBeNull();
    expect(container.textContent).not.toContain("Stage A searches on IS");
    expect(container.textContent).not.toContain("never infers");
    expect(container.textContent).not.toContain("a real run's mode is fixed at submit");
  });
});


/* -------------------------------------------------------------------------
 * RF-06 — cursor, ETag, lanes, states and HiFi layout (each fails on P15 build)
 * ---------------------------------------------------------------------- */

function mountRoute(hash: string, path = "/research/quantbt/runs/R-WFO-118/search") {
  window.history.replaceState(null, "", `${path}${hash}`);
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/research/quantbt/runs/:runId/search" element={<SearchRoute />} />
      </Routes>
    </MemoryRouter>,
  );
}

function foldEcho(url: string): SearchDetail {
  const fold = new URL(url, "http://x").searchParams.get("fold");
  const base = detail();
  return { ...base, inspection: { ...base.inspection, requested_fold: fold === null ? null : Number(fold) } } as SearchDetail;
}

describe("RF-06 FE-S06-01 / FE-X-10 — bare /search opens on the search stage", () => {
  it("links back to the hub's search tab and forward to freeze on its own stage", async () => {
    stub((url) => (url.includes("current-source") ? [200, laneAnswer()] : [200, foldEcho(url)]));
    const { container } = mountRoute("");
    await waitFor(() => expect(container.querySelector("[data-panel='search-space']")).toBeTruthy());
    expect(window.location.hash).toBe("#stage=search&fold=1");
    expect(container.querySelector("[data-action='back-to-hub']")?.getAttribute("href")).toBe(
      "/research/quantbt/runs/R-WFO-118/evidence#stage=search&fold=1",
    );
    expect(container.querySelector("[data-action='next-stage']")?.getAttribute("href")).toBe(
      "/research/quantbt/runs/R-WFO-118/freeze#stage=freeze&fold=1",
    );
  });
});

describe("RF-06 FE-S06-02 — an ETag belongs to the query it answered", () => {
  it("a fold change sends no ETag from the previous fold and shows the new fold", async () => {
    const seen: { url: string; headers: HeadersInit | undefined }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        seen.push({ url, headers: init?.headers });
        // The server's ETag ignores the fold (CG-P15-02): answer 304 to any If-None-Match.
        const status = init?.headers ? 304 : 200;
        return { ok: status === 200, status, statusText: "", headers: new Headers(), json: async () => foldEcho(url) } as unknown as Response;
      }),
    );
    const { result, rerender } = renderHook(({ fold }) => useSearch("R-WFO-118", fold), { initialProps: { fold: 1 } });
    await waitFor(() => expect(result.current.detail?.inspection.requested_fold).toBe(1));
    rerender({ fold: 3 });
    await waitFor(() => expect(result.current.detail?.inspection.requested_fold).toBe(3));
    expect(seen[seen.length - 1]).toEqual({ url: "/api/v1/quantbt/runs/R-WFO-118/search?fold=3", headers: undefined });
  });
});

describe("RF-06 wave C — the retained ledger lane answers for itself (replaces the FE-X-12 skip)", () => {
  it("asks the lane once and renders its typed not-applicable 200 — no skip inferred from the search read", async () => {
    stub((url) => (url.includes("current-source") ? [200, laneAnswer()] : [200, detail()]));
    const { result } = renderHook(() => useSearch("R-WFO-118", 1));
    await waitFor(() => expect(result.current.detail).not.toBeNull());
    await act(async () => {
      result.current.ensureLedger();
      result.current.ensureLedger();
    });
    await waitFor(() => expect(result.current.ledger.state).toBe("not-applicable"));
    expect(requested.filter((url) => url.includes("current-source/search"))).toHaveLength(1);
  });

  it("a not-applicable answer is final — a remount does not ask again", async () => {
    stub((url) => (url.includes("current-source") ? [200, laneAnswer()] : [200, detail()]));
    const first = renderHook(() => useSearch("R-WFO-118", 1));
    await waitFor(() => expect(first.result.current.detail).not.toBeNull());
    await act(async () => first.result.current.ensureLedger());
    await waitFor(() => expect(first.result.current.ledger.state).toBe("not-applicable"));
    first.unmount();
    const second = renderHook(() => useSearch("R-WFO-118", 1));
    await waitFor(() => expect(second.result.current.detail).not.toBeNull());
    await act(async () => second.result.current.ensureLedger());
    expect(second.result.current.ledger.state).toBe("not-applicable");
    expect(requested.filter((url) => url.includes("current-source"))).toHaveLength(1);
  });

  it("a 409 carries its lane state, and the panel says that sentence, not the server's text", async () => {
    stub((url) =>
      url.includes("current-source")
        ? [
            409,
            {
              error: { code: "RESEARCH_CURRENT_SOURCE_CONFLICT", message: "server words that must not be the sentence" },
              details: { lane_state: "NOT_RETAINED_LEGACY", effective_status: "COMPLETED" },
            },
          ]
        : [200, detail()],
    );
    const { result } = renderHook(() => useSearch("R-WFO-118", 1));
    await waitFor(() => expect(result.current.detail).not.toBeNull());
    await act(async () => result.current.ensureLedger());
    await waitFor(() => expect(result.current.ledger.state).toBe("refused"));
    const slot = result.current.ledger;
    expect(slot.state === "refused" && slot.laneState).toBe("NOT_RETAINED_LEGACY");
    const { container } = view({ ledger: slot });
    const refusal = container.querySelector("[data-ledger-refusal]");
    expect(refusal?.querySelector("[data-lane-state='NOT_RETAINED_LEGACY']")?.textContent).toContain(
      "legacy 1.0.8 metadata run",
    );
    expect(refusal?.textContent).not.toContain("server words");
  });

  it("the ledger shell names the search read's typed reason and the lane's own answer, no pending-retention sentence", () => {
    const { container } = view({ ledger: { state: "not-applicable", answer: laneAnswer() } });
    const shell = container.querySelector("[data-ledger-shell]");
    /* H18: one sentence in words; the read's typed reason and the lane's own answer ride in its tooltip. */
    expect(shell?.textContent).toBe("No trial ledger.");
    const lane = shell?.querySelector("[data-ledger-lane='not-applicable']");
    expect(lane?.getAttribute("title")).toContain("P04_RAN_NO_TRIALS");
    expect(lane?.getAttribute("title")).toContain("RS02_RETAINED_LANE_NOT_APPLICABLE_TO_P04_FIXED_QUALIFICATION");
    expect(lane?.textContent).not.toContain("Nothing is pending");
    expect(container.textContent).not.toMatch(/pending retention/i);
  });
});

describe("RF-06 FE-S06-04 — no footer asserts anything about the run (VD-TEXT-01)", () => {
  it("prints no footer while loading, refused or 404", () => {
    for (const state of [
      researchState({ kind: "in-flight", hasAcceptedResponse: false }),
      { state: "unavailable", reason: "down", mayRetry: true, retainsContent: false } as const,
    ]) {
      const { container, unmount } = view({ detail: null, state });
      expect(container.querySelector("[data-rules-footer]")).toBeNull();
      unmount();
    }
  });
});

describe("RF-06 FE-S06-05 — an Atlas mode/schedule the run contradicts is acknowledged, not forwarded", () => {
  it("declines a mode that differs, keeps a schedule that matches, and says so", async () => {
    stub((url) => (url.includes("current-source") ? [200, laneAnswer()] : [200, foldEcho(url)]));
    const { container } = mountRoute("#stage=search&mode=mode_2_sbb&schedule=per_fold_causal");
    await waitFor(() => expect(container.querySelector("[data-cursor-note='CURSOR_KEY_NOT_APPLIED']")).toBeTruthy());
    expect(container.querySelector("[data-cursor-note]")?.textContent).toContain("mode_1_decay");
    const next = container.querySelector("[data-action='next-stage']")?.getAttribute("href") ?? "";
    expect(next).not.toContain("mode=");
    expect(next).toContain("schedule=per_fold_causal");
    expect(requested.every((url) => !url.includes("mode"))).toBe(true);
  });
});

describe("RF-06 FE-S06-06 — a fold the read cannot accept is replaced before it is sent", () => {
  it("fold=999 never reaches the server and the notice says what was shown", async () => {
    stub((url) => (url.includes("current-source") ? [200, laneAnswer()] : [200, foldEcho(url)]));
    const { container } = mountRoute("#stage=search&fold=999");
    await waitFor(() => expect(container.querySelector("[data-stage-grid]")).toBeTruthy());
    expect(requested.some((url) => url.includes("fold=999"))).toBe(false);
    expect(container.querySelector("[data-cursor-note='CURSOR_FOLD_CLAMPED']")?.textContent).toContain("fold 999");
    expect(window.location.hash).toBe("#stage=search&fold=1");
    expect(container.querySelector("[data-research-state='terminal']")).toBeNull();
  });
});

describe("RF-06 FE-X-11 — states", () => {
  it("a first-read 409 is retryable, not stale; a 404 leads to the Run Library", async () => {
    expect(searchState(null, toSearchRefusal(new PortalApiError("c", 409, null, null))).state).toBe("failed-retryable");
    stub(() => [404, { error: { code: "RESEARCH_SEARCH_NOT_FOUND", message: "Research run was not found." } }]);
    const { container } = mountRoute("");
    await waitFor(() => expect(container.querySelector("[data-run-not-found]")).toBeTruthy());
    expect(container.querySelector("[data-exit='library']")?.getAttribute("href")).toBe("/research/quantbt/runs");
    expect(container.querySelector("[data-action='next-stage']")).toBeNull();
    expect(container.querySelector("[data-rules-footer]")).toBeNull();
  });
});

describe("RF-06 FE-S06-07/08 — HiFi layout", () => {
  it("lays Stage A, the freeze line and Stage B on a 1.08 : 52px : 1 grid, ledger full width below", () => {
    const { container } = view();
    const grid = container.querySelector("[data-stage-grid]") as HTMLElement;
    /* D11: a fixed profile is one column (A1 and a sentence); the three-column geometry is the searched run's. */
    expect(grid.getAttribute("data-fixed-profile")).toBe("");
    expect(grid.className).not.toContain("grid-cols-[1.08fr_52px_1fr]");
    expect(grid.querySelector("[data-ledger]")).toBeNull();
    expect(container.querySelector("[data-ledger]")).toBeTruthy();
    expect(container.querySelector("[data-panel='search-space']")).toBeTruthy();
  });

  it("A1 carries the served kind; the claim row, copy link and formatted as-of are present", () => {
    const { container } = view();
    expect(container.querySelector("[data-kind='rsi_len']")?.textContent).toBe("numeric");
    expect(container.querySelector("[data-claim-row]")).toBeTruthy();
    expect(container.querySelector("[data-action='copy-evidence-link']")).toBeTruthy();
    expect(container.querySelector("[data-as-of]")?.textContent).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}Z$/);
    expect(container.querySelector("[data-bundle-digest]")?.getAttribute("title")).toBe("sha256:bundle01");
  });

  it("prints every absence once — source_absences does not repeat a panel's", () => {
    const { container } = view();
    expect(container.querySelectorAll("[data-gap-fact='objective components']")).toHaveLength(0);
    expect(container.querySelector("[data-source-absences]")).toBeNull();
  });
});

/* -------------------------------------------------------------------------
 * RF-06 HiFi fidelity pass (S06)
 * ---------------------------------------------------------------------- */

describe("RF-06 S06 fidelity — freeze arrow chip", () => {
  it("maps the HiFi kinds, and only a published crossing moves", () => {
    expect(freezeArrow("none")).toMatchObject({ glyph: "→", tone: "var(--accent-2)", flow: false });
    expect(freezeArrow("decay")).toMatchObject({ glyph: "◀ OOS", tone: "var(--bad)", flow: true });
    expect(freezeArrow("retro")).toMatchObject({ glyph: "◀ FULL", tone: "var(--bad)", flow: true });
    expect(freezeArrow("na")).toMatchObject({ glyph: "×", tone: "var(--bad)", flow: false });
    expect(freezeArrow("no-freeze").title).toContain("no pool froze");
    expect(freezeArrow("unpublished").glyph).toBe("—");
  });

  it("a fixed profile draws no freeze line at all (D11); the 'no pool froze' words stay in freezeArrow", () => {
    const { container } = view();
    expect(container.querySelector("[data-freeze-arrow]")).toBeNull();
    expect(freezeArrow("no-freeze").title).toContain("no pool froze");
    expect(freezeArrow("no-freeze").flow).toBe(false);
  });
});

describe("RF-06 S06 fidelity — mode card and claim row", () => {
  it("wears the warn style for any schedule but per_fold_causal", () => {
    expect(schedulePillTone("global")).toBe("warn");
    expect(schedulePillTone("per_fold_decay")).toBe("warn");
    expect(schedulePillTone("per_fold_causal")).toBe("accent");
    expect(schedulePillTone(null)).toBe("accent");
    const { container } = view();
    const pill = container.querySelector("[data-run-schedule]") as HTMLElement;
    expect(pill.getAttribute("data-pill-tone")).toBe(schedulePillTone(detail().requested_optimizer.schedule));
  });

  it("keeps the HiFi claim fields first, filled from claim_row, and the static selector-layers aside", () => {
    const { container } = view();
    const keys = [...container.querySelectorAll("[data-claim-row] > span > span:first-child")].map((k) => k.textContent);
    expect(keys.slice(0, 6)).toEqual([
      "validation",
      "chronology",
      "OOS used",
      "OOS column state",
      "scoring",
      "selector",
    ]);
    // CG-P15-05 answered: no claim field is a "not published" shell any more.
    expect(container.querySelectorAll("[data-claim-shell]")).toHaveLength(0);
    expect(container.querySelector("[data-claim-row]")?.textContent).not.toContain("CG-P15-05");
    /* VD-TEXT-01: the right-hand aside became the tooltip of the optimization_mode label. */
    const layers = container.querySelector("[data-selector-layers]") as HTMLElement;
    expect(layers.getAttribute("title")).toBe(SELECTOR_LAYERS_HELP);
    expect(layers.textContent).toContain("mode");
    /* H02: no internal class names in the tooltip. */
    expect(SELECTOR_LAYERS_HELP).toBe("Mode is fixed per run.");
    expect(SELECTOR_LAYERS_HELP).not.toContain("CandidateSelector");
    expect(container.querySelector("[data-claim-row]")?.parentElement?.textContent).not.toContain("This screen never mixes them");
  });
});

describe("RF-06 S06 fidelity — A1 and the ledger", () => {
  it("lays A1 out in the HiFi columns, step and levels right, levels' absence said once", () => {
    const { container } = view();
    const heads = [...container.querySelectorAll("[data-a1-head] > span")].map((h) => [h.textContent, h.getAttribute("data-align")]);
    expect(heads.slice(0, 5)).toEqual([
      ["param", "left"],
      ["kind", "left"],
      ["low … high", "left"],
      ["step", "right"],
      ["levels", "right"],
    ]);
    expect(container.querySelectorAll("[data-levels-state='NOT_PUBLISHED']")).toHaveLength(2);
    expect(container.querySelectorAll("[data-gap-fact='levels']")).toHaveLength(1);
    // The note is the served bound state and placement, rounded for reading; exact in the title.
    // DR-02: the same definition and renderer as Freeze S07.
    const note = container.querySelector("[data-bound-warning]");
    expect(note?.textContent).toBe("25.7% · interior");
    expect(note?.getAttribute("data-bound-definition")).toBe("research.bound-warning.v1");
  });

  it("colours trial states as the HiFi does, and a click marks a row without selecting it", () => {
    expect(trialStateTone("SELECTED")).toBe("var(--accent-2)");
    expect(trialStateTone("PRUNED")).toBe("var(--ink-faint)");
    expect(trialStateTone("INFEASIBLE")).toBe("var(--bad)");
    expect(trialStateTone("COMPLETE")).toBe("var(--good)");
    const { container } = view({ ledger: { state: "ready", search: retainedSearch() } });
    const heads = [...container.querySelectorAll("[data-ledger-head] > span")].map((h) => h.getAttribute("data-align"));
    expect(heads).toEqual(["left", "left", "right", "left"]);
    const row = container.querySelector("[data-trial='trial_042']") as HTMLElement;
    expect(row.tagName).toBe("BUTTON");
    fireEvent.click(row);
    expect(row.getAttribute("aria-pressed")).toBe("true");
    expect(row.style.background).toBe("var(--accent-soft)");
    expect(container.querySelector("[data-trial='trial_017']")?.getAttribute("data-trial-selected")).toBe("true");
  });
});

describe("RF-06 S06 — a fold the run never observed is clamped as on the hub", () => {
  it("clamps against the run's published fold set before the read is sent", async () => {
    forgetObservedFolds();
    rememberObservedFolds("R-WFO-118", [1]);
    stub((url) => (url.includes("current-source") ? [200, laneAnswer()] : [200, foldEcho(url)]));
    const { container } = mountRoute("#stage=search&fold=4");
    await waitFor(() => expect(window.location.hash).toBe("#stage=search&fold=1"));
    expect(requested.some((url) => url.includes("fold=4"))).toBe(false);
    expect(container.querySelector("[data-cursor-note='CURSOR_FOLD_CLAMPED']")?.textContent).toContain("fold 4");
    forgetObservedFolds();
  });
});

/* -------------------------------------------------------------------------
 * RF-06 wave C — RF-05 search fields (CG-P14-04, CG-P15-05), one test per field
 * ---------------------------------------------------------------------- */

describe("RF-06 wave C — S06 consumes claim_row and as_of_basis", () => {
  const field = (container: HTMLElement, what: string) => container.querySelector(`[data-claim-fact='${what}']`);

  it("validation_claim: NOT_APPLICABLE, upright, with its reason", () => {
    const { container } = view();
    const fact = field(container, "validation claim");
    expect(fact?.getAttribute("data-claim-state")).toBe("NOT_APPLICABLE");
    expect(fact?.textContent).toContain("not applicable");
    expect(fact?.textContent).toContain("the declared optimizer did not run");
    expect(fact?.querySelector("[data-claim-reason]")?.getAttribute("title")).toBe(
      "P15_DECLARED_OPTIMIZER_NOT_EXECUTED_NO_VALIDATION_CLAIM",
    );
    expect(fact?.firstElementChild?.className).not.toContain("italic");
  });

  it("chronological_claim: NOT_APPLICABLE with its own reason", () => {
    const { container } = view();
    const fact = field(container, "chronological claim");
    expect(fact?.getAttribute("data-claim-state")).toBe("NOT_APPLICABLE");
    expect(fact?.querySelector("[data-claim-reason]")?.getAttribute("title")).toBe(
      "P15_DECLARED_OPTIMIZER_NOT_EXECUTED_NO_CHRONOLOGICAL_CLAIM",
    );
  });

  it("a confirmed claim token prints its value", () => {
    const { container } = view({
      detail: detail({
        claim_row: claimRow({
          validation_claim: {
            state: "CONFIRMED",
            value: "strict_nested_fold_local_retraining",
            provenance: "RUN_SOURCE_RECEIPT",
            reason_code: null,
            availability: AVAILABLE,
          },
        }),
      }),
    });
    const fact = field(container, "validation claim");
    expect(fact?.getAttribute("data-claim-state")).toBe("CONFIRMED");
    /* E1 claimToken: the HiFi prints the token in capitals; the exact value rides in the attribute. */
    expect(fact?.querySelector("[data-claim-value]")?.textContent).toBe("STRICT_NESTED_FOLD_LOCAL_RETRAINING");
    expect(fact?.querySelector("[data-claim-value]")?.getAttribute("data-claim-value")).toBe("strict_nested_fold_local_retraining");
  });

  it("oos_used_for_selection: NOT_ASSERTED keeps its own word, never a boolean", () => {
    const { container } = view();
    const fact = field(container, "oos used for selection");
    expect(fact?.getAttribute("data-claim-state")).toBe("NOT_ASSERTED");
    expect(fact?.textContent).toContain("not asserted");
    expect(fact?.textContent).not.toMatch(/true|false|not published/);
  });

  it("OOS column: REPORT_ONLY is the HiFi 'report only' chip in its tone, with the P14 evaluation state in the title", () => {
    const { container } = view();
    const chip = field(container, "oos column");
    expect(chip?.getAttribute("data-oos-column")).toBe("REPORT_ONLY");
    expect(chip?.textContent).toBe("report only");
    expect((chip as HTMLElement).style.color).toBe("var(--ink-mute)");
    expect((chip as HTMLElement).style.borderColor).toBe("var(--ink-mute)");
    expect(chip?.getAttribute("title")).toContain("P04_OBSERVED_AFTER_FIXED_PROFILE");
  });

  it("OOS column: each HiFi state has its own words and tone; NOT_PUBLISHED is no chip", () => {
    expect(OOS_COLUMN_CHIP.SELECTION_INPUT).toEqual({ words: "selection input", tone: "var(--accent-2)" });
    expect(OOS_COLUMN_CHIP.RETROSPECTIVE).toEqual({ words: "retrospective", tone: "var(--accent-2)" });
    expect(OOS_COLUMN_CHIP.WITHHELD).toEqual({ words: "withheld", tone: "var(--ink-faint)" });
    expect(OOS_COLUMN_CHIP.NOT_APPLICABLE).toEqual({ words: "n/a", tone: "var(--bad)" });
    const { container } = view({
      detail: detail({
        claim_row: claimRow({
          oos_column: {
            state: "NOT_PUBLISHED",
            source_evaluation_state: null,
            provenance: "NONE",
            reason_code: "P15_CURRENT_P04_SOURCE_RECEIPT_NOT_PUBLISHED",
            availability: { state: "NOT_PUBLISHED", reason_code: "P15_CURRENT_P04_SOURCE_RECEIPT_NOT_PUBLISHED" },
          },
        }),
      }),
    });
    expect(container.querySelector("[data-oos-column]")).toBeNull();
    expect(field(container, "oos column")?.textContent).toContain("not published");
  });

  it("scoring_backend: NOT_APPLICABLE with its reason when nothing was declared", () => {
    const { container } = view();
    const fact = field(container, "scoring backend");
    expect(fact?.getAttribute("data-claim-state")).toBe("NOT_APPLICABLE");
    expect(fact?.querySelector("[data-claim-reason]")?.getAttribute("title")).toBe(
      "P15_DECLARED_OPTIMIZER_NOT_EXECUTED_NO_SCORING_BACKEND",
    );
  });

  it("scoring_backend: a declared value is shown as declared, never as an executed fact", () => {
    const { container } = view({
      detail: detail({
        claim_row: claimRow({
          scoring_backend: {
            state: "NOT_APPLICABLE",
            declared_value: "proxy",
            provenance: "RUN_REQUESTED_SPEC",
            reason_code: "P15_DECLARED_OPTIMIZER_NOT_EXECUTED_NO_SCORING_BACKEND",
            availability: { state: "NOT_APPLICABLE", reason_code: "P15_DECLARED_OPTIMIZER_NOT_EXECUTED_NO_SCORING_BACKEND" },
          },
        }),
      }),
    });
    const fact = field(container, "scoring backend");
    expect(fact?.querySelector("[data-claim-declared]")?.textContent).toBe("PROXY");
    expect(fact?.querySelector("[data-claim-declared]")?.getAttribute("data-claim-declared")).toBe("proxy");
    expect(fact?.textContent).toContain("DECLARED");
    expect(fact?.textContent).toContain("not applicable as run evidence");
    expect(fact?.textContent).not.toContain("CONFIRMED");
  });

  it("mode_reference: a link to the Atlas modes tab, tagged release metadata, not run evidence", () => {
    const { container } = view();
    const row = container.querySelector("[data-mode-reads='reference']");
    const link = row?.querySelector("[data-action='open-atlas-mode']");
    expect(link?.getAttribute("href")).toBe(
      "/research/quantbt/atlas#tab=modes&mode=mode_1_decay&schedule=per_fold_causal&run=R-WFO-118",
    );
    expect(link?.textContent).toContain("Engine Atlas");
    expect(link?.getAttribute("title")).toContain("mode 1 decay · per-fold causal");
    expect(row?.querySelector("[data-mode-relation='DECLARED_MODE_RELEASE_METADATA_NOT_RUN_EVIDENCE']")?.textContent).toBe(
      "release metadata",
    );
    expect(row?.textContent).not.toContain("not published");
    expect(atlasModeHref({ mode: "a b", schedule: "global", operation_id: "researchEngineAtlasGetV1", relation: "DECLARED_MODE_RELEASE_METADATA_NOT_RUN_EVIDENCE" }, "r1")).toBe(
      "/research/quantbt/atlas#tab=modes&mode=a+b&schedule=global&run=r1",
    );
  });

  it("mode_reference null: the row keeps its frame and says not published", () => {
    const { container } = view({ detail: detail({ claim_row: claimRow({ basis: "NOT_PUBLISHED", mode_reference: null }) }) });
    expect(container.querySelector("[data-action='open-atlas-mode']")).toBeNull();
    expect(container.querySelector("[data-mode-reads='shell']")?.textContent).toContain("not published");
  });

  it("a ledger the read did not publish is 'not shown', never 'does not exist'", () => {
    const { container } = view({ detail: admitted(), ledger: { state: "not-applicable", answer: laneAnswer() } });
    const shell = container.querySelector("[data-ledger-shell]");
    expect(shell?.textContent).toContain("Trial ledger — not published");
    expect(shell?.textContent).not.toContain("exists");
    expect(shell?.textContent).not.toContain("No trial ledger");
  });

  it("claim basis rides on the row", () => {
    const { container } = view();
    expect(container.querySelector("[data-claim-row]")?.getAttribute("data-claim-basis")).toBe("DECLARED_NOT_EXECUTED");
  });

  it("CG-P14-04: as-of in the HiFi Z form, its basis named in the title", () => {
    const { container } = view();
    const asOf = container.querySelector("[data-as-of]");
    expect(asOf?.textContent).toMatch(/^as of \d{4}-\d{2}-\d{2} \d{2}:\d{2}Z$/);
    expect(asOf?.getAttribute("title")).toContain("source search read");
    expect(asOf?.getAttribute("data-as-of-basis")).toBe("P14_PROJECTION_RECEIVED_AT");
    expect(asOf?.getAttribute("title")).toContain("as-of basis P14_PROJECTION_RECEIVED_AT");
  });
});
/* -------------------------------------------------------------------------
 * W3 — Screen 06 on a real retained WFO run (CG-P15-03/04, A12 P13-T10/P15-T10)
 * ---------------------------------------------------------------------- */

const W3_SEARCH = (JSON.parse(readFileSync(join(process.cwd(), "src", "research", "w3RealWfo.fixture.json"), "utf8")) as {
  search: CurrentSourceSearch;
}).search;

describe("W3 — the retained ledger labels what each number measures", () => {
  it("prints each trial's IS score and parameters, and 'not evaluated' where the IS stage never scored OOS", () => {
    const { container } = view({ ledger: { state: "ready", search: W3_SEARCH } });
    const row = container.querySelector("[data-trial='0']") as HTMLElement;
    expect(row.querySelector("[data-trial-is]")?.textContent).toBe("−1.44");
    /* W4: a uniform column is ONE caption line, not a cell per row. */
    expect(row.querySelector("[data-trial-oos]")).toBeNull();
    expect(container.querySelector("[data-ledger-oos-caption]")?.textContent).toBe("OOS · not evaluated at search (Stage B)");
    expect(row.getAttribute("data-trial-state")).toBe("COMPLETE");
    expect(container.querySelector("[data-ledger-caption]")?.textContent).toContain("all complete");
    expect(container.querySelector("[data-ledger-caption] [data-absence-summary='seed']")?.textContent).toBe("seed · not published");
    const noteCell = row.querySelector("[data-trial-note]") as HTMLElement;
    const note = noteCell.textContent ?? "";
    /* H17: the prefix every row repeats rides in the row tooltip (with the digest); the cell is parameter values only. */
    expect(row.getAttribute("title")).toContain("is_search · all outer folds · objective = IS mean Sharpe");
    expect(note).not.toContain("is_search");
    expect(note).toMatch(/(^| · )34( · |$)/);
    expect(note).not.toContain("window=");
    expect(note).not.toContain("parameters not published");
    expect(container.querySelector("[data-ledger-scope]")?.textContent).toBe("global study");
  });

  it("keeps the candidate replay ledger separate, with S̄_OOS, decay and J", () => {
    const { container } = view({ ledger: { state: "ready", search: W3_SEARCH } });
    const candidate = container.querySelector("[data-candidate-selected='true']") as HTMLElement;
    expect(candidate).toBeTruthy();
    expect(candidate.textContent).toContain("−5.35");
    expect(candidate.textContent).toContain("3.91");
    expect(candidate.textContent).toContain("−9.81");
  });

  it("Stage B shows the pool, the formula term by term and raw best vs selected — no shell left for a published fact", () => {
    const { container } = view({ ledger: { state: "ready", search: W3_SEARCH } });
    expect([...container.querySelectorAll("[data-pool-row]")].map((row) => row.getAttribute("data-pool-row"))).toEqual([
      "Optuna trials (Stage A)", "candidate pool", "selected",
    ]);
    expect([...container.querySelectorAll("[data-formula-term]")].map((row) => row.getAttribute("data-formula-term"))).toEqual([
      "mean_oos_sharpe", "std_decay", "positive_mean_decay",
    ]);
    expect(container.querySelector("[data-formula-total]")?.textContent).toContain("4 of 4 recompose");
    expect(container.querySelector("[data-role-card='raw-best']")?.textContent).toContain("best_trial 0");
    expect(container.querySelector("[data-role-card='raw-best']")?.textContent).toContain("−1.44");
    expect(container.querySelector("[data-role-card='selected']")?.textContent).toContain("−9.81");
    expect(container.querySelector("[data-centroid]")?.getAttribute("data-centroid")).toBe("NOT_APPLICABLE");
    expect(container.querySelector("[data-selected-ref]")).toBeNull();
    expect(container.querySelector("[data-panel='prune_reasons']")?.getAttribute("data-panel-state")).toBe("NOT_APPLICABLE");
    const validation = container.querySelector("[data-claim-fact='validation claim']");
    expect(validation?.getAttribute("data-claim-state")).toBe("RETAINED_SOURCE");
    expect(validation?.textContent).toContain("walk-forward OOS");
    expect(validation?.querySelector("[data-claim-value]")?.getAttribute("data-claim-value")).toBe("walk_forward_oos");
  });

  it("A12 P13-T10 / P15-T10: picking a non-selected trial changes the inspected row only — θ*, the selected card and the next-stage link stay", () => {
    const search = JSON.parse(JSON.stringify(W3_SEARCH)) as CurrentSourceSearch;
    const { container } = view({ ledger: { state: "ready", search } });
    const before = {
      selected: container.querySelector("[data-role-card='selected']")?.textContent,
      next: container.querySelector("[data-action='next-stage']")?.getAttribute("href"),
      chip: container.querySelector("[data-selected-trial]")?.getAttribute("data-selected-trial"),
    };
    fireEvent.click(container.querySelector("[data-trial='2']") as Element);
    expect(container.querySelector("[data-trial='2']")?.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector("[data-trial='0']")?.getAttribute("data-trial-selected")).toBe("true");
    expect({
      selected: container.querySelector("[data-role-card='selected']")?.textContent,
      next: container.querySelector("[data-action='next-stage']")?.getAttribute("href"),
      chip: container.querySelector("[data-selected-trial]")?.getAttribute("data-selected-trial"),
    }).toEqual(before);
    expect(search).toEqual(W3_SEARCH);
  });
});

/* -------------------------------------------------------------------------
 * W3b — Screen 06 on the retained WFO lane (rrun_c860…, real served bodies)
 * ---------------------------------------------------------------------- */

const W3B_S = JSON.parse(readFileSync(join(process.cwd(), "src", "research", "w3bRealWfo.fixture.json"), "utf8")) as {
  progress: unknown;
  requested_spec: unknown;
  hub_search: SearchDetail;
};
const W3_S = JSON.parse(readFileSync(join(process.cwd(), "src", "research", "w3RealWfo.fixture.json"), "utf8")) as {
  search: CurrentSourceSearch;
  evidence: unknown;
};
const W3B_SEARCH_RUN = W3_S.search.run_id;

describe("W3b — Search on the retained WFO lane", () => {
  beforeEach(() => {
    forgetRunIdentities();
    forgetObservedFolds();
    stub((url) => {
      const path = new URL(url, "http://x").pathname;
      if (path.endsWith("/progress")) return [200, W3B_S.progress];
      if (path.endsWith("/requested-spec")) return [200, W3B_S.requested_spec];
      if (path.endsWith("/current-source/search")) return [200, W3_S.search];
      if (path.endsWith("/current-source/evidence")) return [200, W3_S.evidence];
      if (path.endsWith("/search")) return [200, W3B_S.hub_search];
      return [404, { error: { code: "UNEXPECTED" } }];
    });
  });

  async function settled() {
    const view = mountRoute("", `/research/quantbt/runs/${W3B_SEARCH_RUN}/search`);
    await waitFor(() => expect(view.container.querySelector("[data-readiness='READY']")).toBeTruthy());
    await waitFor(() => expect(view.container.querySelector("[data-coverage-fact='sampler seed']")?.textContent).toContain("42"));
    await waitFor(() => expect(view.container.textContent).not.toMatch(/reading…/));
    return view;
  }

  it("shows the executed mode and schedule from the retained search contract", async () => {
    const { container } = await settled();
    expect(container.querySelector("[data-run-mode]")?.textContent).toBe("mode 1 decay");
    expect(container.querySelector("[data-run-schedule]")?.textContent).toBe("global");
    expect(container.querySelector("[data-run-mode-source]")?.getAttribute("data-run-mode-source")).toBe("retained");
  });

  it("readiness READY (retained seal), source profile, selection AVAILABLE and strict outer OOS 'no'", async () => {
    const { container } = await settled();
    const readiness = container.querySelector("[data-readiness]");
    expect(readiness?.getAttribute("data-readiness")).toBe("READY");
    expect(readiness?.getAttribute("data-readiness-basis")).toBe("RETAINED_SEAL");
    expect(readiness?.textContent).toBe("ready");
    expect(readiness?.getAttribute("data-readiness")).toBe("READY");
    const profile = container.querySelector("[data-source-profile]");
    expect(profile?.textContent).toContain("rs02.delta-signal-notional-wfo.v1");
    expect(container.querySelector("[data-selection-state]")?.getAttribute("data-selection-state")).toBe("AVAILABLE");
    const strict = container.querySelector("[data-strict-outer-oos]");
    expect(strict?.getAttribute("data-strict-outer-oos")).toBe("false");
    expect(strict?.textContent).toBe("no · OOS used for selection");
  });

  it("A1 states the requested sampler seed 42 and the 3 trials", async () => {
    const { container } = await settled();
    expect(container.querySelector("[data-coverage-fact='sampler seed']")?.textContent).toMatch(/seed\s*42 · requested spec$/);
    expect(container.querySelector("[data-coverage-fact='trials']")?.textContent).toMatch(/trials\s*3 requested · 3 retained/);
  });

  it("the importance absence carries QuantBT's own code", async () => {
    const { container } = await settled();
    const panel = container.querySelector("[data-panel='importance']");
    expect(panel?.getAttribute("data-panel-state")).toBe("NOT_PUBLISHED");
    expect(panel?.querySelector("[data-gap-reason='importance']")?.getAttribute("data-gap-code")).toBe(
      "QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_PARAMETER_IMPORTANCE",
    );
  });

  it("prints no P04-hub reason anywhere, though the hub search answered P15 NOT_PUBLISHED", async () => {
    const { container } = await settled();
    expect(W3B_S.hub_search.availability.reason_code).toBe("P15_CURRENT_P04_SOURCE_RECEIPT_NOT_PUBLISHED");
    expect(container.textContent).not.toMatch(HUB_LANE_REASON);
    expect(container.innerHTML).not.toMatch(HUB_LANE_REASON);
  });
});

/* F3 · H06 hero — one typed line holds the search cinema's place. */
describe("F3 · S06 — search cinema placeholder", () => {
  it("a run that searched names the missing sampler trace in one line, and invents no code", () => {
    const { container } = view({ detail: admitted() });
    const line = container.querySelector("[data-panel='search-cinema']");
    expect(line?.textContent).toBe("Sampler trace: not published");
    expect(line?.textContent).not.toContain("cinema");
    expect(line?.getAttribute("data-gap-state")).toBe("NOT_PUBLISHED");
  });

  it("a fixed profile ran no sampler, so no cinema line is drawn", () => {
    const { container } = view();
    expect(container.querySelector("[data-panel='search-cinema']")).toBeNull();
  });
});
