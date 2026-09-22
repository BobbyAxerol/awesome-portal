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
import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SEARCH_RULES_FOOTER, SEARCH_SUBTITLE, SearchScreen } from "./SearchDetail";
import {
  DIAGNOSTIC_KEYS,
  toSearchRefusal,
  type CurrentSourceSearch,
  type SearchDetail,
} from "./searchClient";
import { DEFAULT_CURSOR } from "./evidenceCursor";
import { useSearch } from "./useSearch";
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

function gap(reason: string, state: "NOT_PUBLISHED" | "NOT_APPLICABLE" | "NOT_ASSERTED" = "NOT_APPLICABLE") {
  return { state, reason_code: reason, availability: { state, reason_code: reason } } as const;
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
      availability: AVAILABLE,
    },
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
});

/* -------------------------------------------------------------------------
 * P15-T01 — a fixed qualification is not a broken optimizer
 * ---------------------------------------------------------------------- */

describe("P15-T01 — the source is described as what it is", () => {
  it("labels the installed source a fixed profile", () => {
    const { container } = view();
    expect(container.querySelector("[data-source-profile='FIXED_PROFILE_NO_SEARCH']")).toBeTruthy();
    expect(container.querySelector("[data-source-strip]")?.textContent).not.toMatch(/inactive|disabled|failed|error/i);
  });

  it("says the request declared a mode and the source did not execute it", () => {
    const { container } = view();
    const requested = container.querySelector("[data-requested-optimizer]");
    expect(requested?.getAttribute("data-requested-optimizer")).toBe("DECLARED_NOT_EXECUTED");
    expect(requested?.textContent).toContain("mode_1_decay");
    expect(requested?.textContent).toContain("declared not executed");
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
  it("keeps all seven diagnostic panels with their own reason", () => {
    const { container } = view();
    for (const key of DIAGNOSTIC_KEYS) {
      const panel = container.querySelector(`[data-panel='${key}']`);
      expect(panel, key).toBeTruthy();
      expect(panel?.querySelector(`[data-gap-reason='${key}']`)?.textContent).toMatch(/^P04_/);
    }
  });

  it("distinguishes a question that does not arise from a fact nobody published", () => {
    const { container } = view();
    expect(container.querySelector("[data-panel='scatter']")?.getAttribute("data-panel-state")).toBe(
      "NOT_APPLICABLE",
    );
    expect(container.querySelector("[data-panel='importance']")?.getAttribute("data-panel-state")).toBe(
      "NOT_PUBLISHED",
    );
    expect(container.querySelector("[data-panel='scatter']")?.textContent).toContain("not applicable");
    expect(container.querySelector("[data-panel='importance']")?.textContent).toContain("not published");
  });

  it("draws no chart and no zero in any of them", () => {
    const { container } = view();
    for (const key of DIAGNOSTIC_KEYS) {
      const panel = container.querySelector(`[data-panel='${key}']`);
      expect(panel?.querySelector("canvas, svg")).toBeNull();
      expect(panel?.textContent).not.toMatch(/\b0 trials\b|\b0 candidates\b/);
    }
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
    expect(container.querySelector("[data-selected-ref]")?.textContent).toContain("none published");
  });

  it("answers the requested fold instead of treating a split fold as a trial fold", () => {
    const { container } = view();
    const inspection = container.querySelector("[data-panel='inspection']");
    expect(inspection?.getAttribute("data-inspection-state")).toBe("NOT_APPLICABLE");
    expect(inspection?.textContent).toContain("Fold 3 was requested");
    expect(inspection?.querySelector("[data-withheld]")?.getAttribute("title")).toBe(
      "P04_HAS_NO_OPTIMIZER_FOLD",
    );
  });

  it("keeps the freeze line in the geometry and explains why it froze nothing", () => {
    const { container } = view();
    const freeze = container.querySelector("[data-freeze-line]");
    expect(freeze).toBeTruthy();
    expect(freeze?.textContent).toContain("POOL FREEZE");
    expect(freeze?.querySelector("[title]")?.getAttribute("title")).toContain("ran no search");
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
      },
    });
    const refusal = container.querySelector("[data-ledger-refusal]");
    expect(refusal?.textContent).toContain("Not an admitted profile.");
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
        : [200, detail()],
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

  it("classifies each refusal and keeps the screen", () => {
    const of = (status: number) => toSearchRefusal(new PortalApiError("no", status, null, null));
    expect(of(403).state).toBe("denied");
    expect(of(404).state).toBe("empty");
    expect(of(503).state).toBe("unavailable");

    const { container } = view({
      detail: null,
      state: { state: "denied", reason: "Not your workspace.", mayRetry: false, retainsContent: false },
    });
    expect(container.querySelector("[data-screen='search-detail']")).toBeTruthy();
    expect(container.querySelector("[data-rules-footer]")).toBeTruthy();
  });

  it("names only the published paths and computes nothing", () => {
    const code = codeOf("searchClient.ts");
    const paths = [...code.matchAll(/["'`](\/api\/[^"'`$]*)/g)].map((match) => match[1]);
    expect([...new Set(paths)]).toEqual(["/api/v1/quantbt/runs"]);
    expect(code).not.toMatch(/\/internal\/|optuna|parquet|artifact/i);

    const screenCode = codeOf("SearchDetail.tsx");
    expect(screenCode).not.toMatch(/\.sort\(|Math\.max\(|reduce\(/);
  });

  it("keeps the verbatim copy", () => {
    view();
    expect(screen.getByText(SEARCH_SUBTITLE)).toBeTruthy();
    expect(screen.getByText(SEARCH_RULES_FOOTER)).toBeTruthy();
  });
});
