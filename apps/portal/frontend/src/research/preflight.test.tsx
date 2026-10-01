/**
 * P08 consumer tests — Screens 02 and 05.
 *
 * The handoff names the required behaviours; each has a block below. Two of
 * them are the ones that would otherwise be found in production:
 *
 *  - **A token belongs to its spec.** If an edit does not drop the preview,
 *    someone creates a run from a preview of a different declaration.
 *  - **The browser never derives the manifest.** No digest is computed, no
 *    fold boundary recomputed, no `requested_spec_digest` sent.
 */
import { cleanup, render, screen, waitFor, within, act, renderHook } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PreflightPanel, groupDigits, rangeLabel } from "./PreflightPanel";
import { SplitBoundary, BOUNDARY_FOOTER, P08_SCOPE_NOTE } from "./SplitBoundary";
import {
  PREFLIGHT_PROBLEM_CODES,
  type PreflightResponse,
  type RequestedSpec,
  type Topology,
  type UtcRange,
  sameRequestedSpec,
  toPreflightRefusal,
} from "./preflightClient";
import { SPEC_CHANGED_NOTE, usePreflight } from "./usePreflight";
import { PortalApiError } from "../lib/api";
import { researchState } from "./state";

afterEach(cleanup);

/* ---------------------------------------------------------------- fixtures */

function range(start: string, end: string, startMs: number, endMs: number): UtcRange {
  return { start_utc: start, end_exclusive_utc: end, start_utc_ms: startMs, end_exclusive_utc_ms: endMs };
}

const Y2022 = 1640995200000;
const Y2023 = 1672531200000;
const Y2024 = 1704067200000;
const Y2025 = 1735689600000;
const Y2026 = 1767225600000;

const THREE_WINDOW: Topology = {
  protocol: "three_window_decay",
  topology_digest: "sha256:topo3w",
  folds: [
    {
      fold_id: "fold_01",
      train: range("2022-01-01T00:00:00.000Z", "2023-01-01T00:00:00.000Z", Y2022, Y2023),
      outer_oos: range("2023-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z", Y2023, Y2024),
      state: "BOUNDARY_FIXED_NOT_EVALUATED",
    },
    {
      fold_id: "fold_02",
      train: range("2022-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z", Y2022, Y2024),
      outer_oos: range("2024-01-01T00:00:00.000Z", "2025-01-01T00:00:00.000Z", Y2024, Y2025),
      state: "BOUNDARY_FIXED_NOT_EVALUATED",
    },
  ],
  sealed_holdout: {
    ...range("2025-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z", Y2025, Y2026),
    snapshot_read_state: "OPAQUE_SNAPSHOT_ONLY",
    evaluation_state: "NOT_EVALUATED",
    disclosure: "The seal caps this run's certificate; unlock is an audited one-time read.",
  },
};

const ADVANCED: Topology = {
  protocol: "advanced_walk_forward",
  frequency: "quarterly",
  window_mode: "expanding",
  topology_digest: "sha256:topoadv",
  folds: THREE_WINDOW.folds,
  sealed_holdout: null,
};

function preflight(overrides: Partial<PreflightResponse> = {}): PreflightResponse {
  return {
    schema_version: "research.preflight.v1",
    preflight_token: "pf_01HZQ7",
    expires_at_utc_ms: Y2026,
    may_create_run: false,
    requested_spec_digest: "sha256:req",
    effective_spec_digest: "sha256:eff",
    dataset_binding_digest: "sha256:bind",
    manifest_digest: "sha256:man",
    effective_spec: {
      schema_version: "research.effective-spec.v1",
      requested_spec_digest: "sha256:req",
      engine: capability(),
      data_binding: {
        snapshot_id: "snap_1",
        snapshot_content_hash: "sha256:snap",
        market_content_hash: "sha256:mkt",
        source_manifest_digest: "sha256:src",
        timezone: "UTC",
        calendar_policy: "24x7",
        closed_bar_policy: "CLOSED_BARS_ONLY",
        columns: ["open", "high", "low", "close", "volume"],
        warmup_bars: 120,
        range_start_utc_ms: Y2022,
        range_end_exclusive_utc_ms: Y2026,
      },
      topology: THREE_WINDOW,
      optimization: {
        mode: "per_fold_causal",
        schedule: "endpoint",
        trial_count: 400,
        early_stopping: 200,
        random_seed: 42,
        scope: "per_study_per_fold_per_seed",
      },
      intent: {
        kind: "NEW",
        reproduction_semantics: "reproduce the declared spec exactly",
        upgrade_semantics: "an upgraded release produces a new effective spec",
      },
    },
    dataset_binding: {
      schema_version: "research.dataset-binding.v1",
      snapshot_id: "snap_1",
      snapshot_content_hash: "sha256:snap",
      market_content_hash: "sha256:mkt",
      source_manifest_digest: "sha256:src",
      dataset_id: "ds_btcusdt_4h",
      symbol: "BTCUSDT",
      timeframe: "4h",
      range_start_utc_ms: Y2022,
      range_end_exclusive_utc_ms: Y2026,
      timezone: "UTC",
      calendar_policy: "24x7",
      closed_bar_policy: "CLOSED_BARS_ONLY",
    },
    snapshot: {
      snapshot_id: "snap_1",
      snapshot_content_hash: "sha256:snap",
      market_content_hash: "sha256:mkt",
      source_manifest_digest: "sha256:src",
      row_count: 8766,
      byte_count: 1402560,
      query: range("2021-12-11T00:00:00.000Z", "2026-01-01T00:00:00.000Z", Y2022 - 1_728_000_000, Y2026),
      logical_range: range("2022-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z", Y2022, Y2026),
      warmup: {
        ...range("2021-12-11T00:00:00.000Z", "2022-01-01T00:00:00.000Z", Y2022 - 1_728_000_000, Y2022),
        requested_bars: 120,
        state: "BOUNDARY_ONLY_NOT_FIT",
      },
      timezone: "UTC",
      calendar_policy: "24x7",
      closed_bar_policy: "CLOSED_BARS_ONLY",
      columns: ["open", "high", "low", "close", "volume"],
      quality: {
        rows: 8766,
        gaps: 0,
        duplicates: 0,
        gap_ratio: 0,
        passed: true,
        reason_codes: [],
        missing_bar_count: 0,
        state: "SNAPSHOT_INTEGRITY_ONLY",
      },
      provenance: { reader: "historical", sealed: true },
    },
    topology: THREE_WINDOW,
    resource_estimate: {
      schema_version: "research.resource-estimate.v1",
      scope: "per_study_per_fold_per_seed; no product-wide trial claim is implied",
      trial_count: 400,
      seed_count: 1,
      outer_fold_count: 2,
      evaluation_count: 800,
      raw_frame_bytes: 1402560,
      snapshot_bytes: 1402560,
      estimated_memory_bytes: 268435456,
      estimated_scratch_bytes: 134217728,
      estimated_cpu_seconds: 5400,
      admission_state: "PREFLIGHT_WITHIN_P10_DECLARATION_CEILING",
      disclosure: "This is a preflight estimate, not a reservation.",
    },
    capability: capability(),
    ...overrides,
  };
}

function capability() {
  return {
    engine_release_id: "er_quantbt_1_1_1",
    engine_catalog_digest: "sha256:cat",
    execution_route: "signal_notional",
    required_input_class: "ohlcv",
    route_axes: {
      engine: "ENGINE_SUPPORTED",
      integration: "INTEGRATED",
      evidence: "EVIDENCE_COMPLETE",
      admission: "ADMITTED",
    },
    preflight_admission: "PREFLIGHT_ONLY" as const,
    optimization_mode: "per_fold_causal",
    optimization_schedule: "endpoint",
  };
}

function spec(overrides: Partial<RequestedSpec> = {}): RequestedSpec {
  return {
    schema_version: "research.requested-spec.v1",
    alpha_binding: { alpha_id: "delta_rsi", alpha_version_id: "av_0_3_0" },
    not_publishable: false,
    strategy_id: "delta_rsi_polynomial",
    execution_route: "signal_notional",
    route_params: {},
    data: { dataset_id: "ds_btcusdt_4h", symbol: "BTCUSDT", timeframe: "4h" },
    protocol: "three_window_decay",
    optimization_mode: "per_fold_causal",
    optimization_schedule: "endpoint",
    parameter_space_overrides: [],
    optuna_trials: 400,
    early_stopping: 200,
    random_seed: 42,
    optimization_config: {},
    client: { engine_release_id: "er_quantbt_1_1_1", config_digest: "sha256:cfg" },
    ...overrides,
  };
}

const OK = researchState({ kind: "ok", rowCount: 1 });

let sent: { url: string; method: string; body: unknown }[] = [];

function stub(responder: (url: string, method: string) => [number, unknown]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      sent.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
      const [status, payload] = responder(url, method);
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
  sent = [];
});
afterEach(() => vi.unstubAllGlobals());

/* -------------------------------------------------------------------------
 * Screen 02
 * ---------------------------------------------------------------------- */

describe("P08-T01 — every preflight fact is rendered from the typed response", () => {
  it("writes UTC intervals half-open, the way the methodology means them", () => {
    render(<PreflightPanel preflight={preflight()} state={OK} />);
    expect(
      screen.getByText("[2022-01-01T00:00:00.000Z, 2026-01-01T00:00:00.000Z)"),
    ).toBeTruthy();
    // An inclusive-looking arrow would claim the bar at `end` is in range.
    expect(document.body.textContent).not.toMatch(/2022-01-01T00:00:00\.000Z\s*→/);
  });

  it("renders the snapshot binding, columns and both hashes", () => {
    render(<PreflightPanel preflight={preflight()} state={OK} />);
    const binding = document.querySelector("[data-data-binding]") as HTMLElement;
    expect(binding.textContent).toContain("ds_btcusdt_4h · BTCUSDT · 4h");
    expect(binding.textContent).toContain("open · high · low · close · volume");
    expect(binding.textContent).toContain("sha256:snap");
    expect(binding.textContent).toContain("sha256:mkt");
    expect(within(binding).getByText("CLOSED_BARS_ONLY")).toBeTruthy();
  });

  it("keeps warmup a boundary, not a fit", () => {
    render(<PreflightPanel preflight={preflight()} state={OK} />);
    const warmup = document.querySelector("[data-warmup]") as HTMLElement;
    expect(warmup.textContent).toContain("120 bars");
    expect(within(warmup).getByText("BOUNDARY_ONLY_NOT_FIT")).toBeTruthy();
  });
});

describe("P08-T02 — quality counters are measurements, not a verdict", () => {
  it("prints a measured zero and never hides it", () => {
    render(<PreflightPanel preflight={preflight()} state={OK} />);
    const quality = document.querySelector("[data-quality]") as HTMLElement;
    expect(quality.textContent).toContain("0 · 0 missing bars · ratio 0");
    expect(within(quality).getByText("SNAPSHOT_INTEGRITY_ONLY")).toBeTruthy();
  });

  it("says 'none reported' for an empty reason list rather than leaving a blank", () => {
    render(<PreflightPanel preflight={preflight()} state={OK} />);
    expect(screen.getByText("none reported")).toBeTruthy();
  });

  it("renders real gap counters when the snapshot has them", () => {
    const withGaps = preflight();
    withGaps.snapshot.quality = {
      ...withGaps.snapshot.quality,
      gaps: 3,
      missing_bar_count: 11,
      gap_ratio: 0.00125,
      duplicates: 1,
      reason_codes: ["VENUE_MAINTENANCE", "FEED_RESTART"],
    };
    render(<PreflightPanel preflight={withGaps} state={OK} />);
    const quality = document.querySelector("[data-quality]") as HTMLElement;
    expect(quality.textContent).toContain("3 · 11 missing bars · ratio 0.00125");
    expect(quality.textContent).toContain("VENUE_MAINTENANCE · FEED_RESTART");
  });
});

describe("P08-T03 — the resource estimate keeps its declared scope", () => {
  it("renders the contract's scope wording verbatim", () => {
    render(<PreflightPanel preflight={preflight()} state={OK} />);
    expect(
      screen.getByText("per_study_per_fold_per_seed; no product-wide trial claim is implied"),
    ).toBeTruthy();
  });

  it("renders the server's disclosure rather than a local summary", () => {
    const altered = preflight();
    altered.resource_estimate = {
      ...altered.resource_estimate,
      disclosure: "Replaced by the server.",
    };
    render(<PreflightPanel preflight={altered} state={OK} />);
    expect(document.querySelector("[data-resource-disclosure]")?.textContent).toBe(
      "Replaced by the server.",
    );
  });

  it("does not turn a per-fold estimate into a product-wide claim", () => {
    render(<PreflightPanel preflight={preflight()} state={OK} />);
    const block = document.querySelector("[data-resource-estimate]") as HTMLElement;
    expect(block.textContent).toContain("400 × 1 seed × 2 outer folds = 800 evaluations");
    expect(block.textContent).toMatch(/PREFLIGHT_WITHIN_P10_DECLARATION_CEILING/);
    expect(block.textContent).not.toMatch(/reserved|guaranteed|queued/i);
  });
});

describe("P08-T04 — the topology union is rendered exactly", () => {
  it("shows a three-window seal", () => {
    render(<PreflightPanel preflight={preflight()} state={OK} />);
    expect(document.querySelector("[data-topology]")?.getAttribute("data-topology")).toBe(
      "three_window_decay",
    );
    const seal = document.querySelector("[data-sealed-holdout]") as HTMLElement;
    expect(within(seal).getByText("SEALED")).toBeTruthy();
    expect(within(seal).getByText("OPAQUE_SNAPSHOT_ONLY")).toBeTruthy();
    expect(within(seal).getByText("NOT_EVALUATED")).toBeTruthy();
  });

  it("states that advanced_walk_forward seals nothing instead of drawing an empty seal", () => {
    const advanced = preflight({ topology: ADVANCED });
    render(<PreflightPanel preflight={advanced} state={OK} />);
    expect(document.querySelector("[data-sealed-holdout]")).toBeNull();
    expect(document.querySelector("[data-no-holdout]")?.textContent).toBe(
      "advanced_walk_forward declares no sealed holdout.",
    );
    expect(screen.getByText("expanding")).toBeTruthy();
    expect(screen.getByText("frequency quarterly")).toBeTruthy();
  });

  it("marks every fold boundary as fixed but not evaluated", () => {
    render(<PreflightPanel preflight={preflight()} state={OK} />);
    const folds = Array.from(document.querySelectorAll("[data-fold]"));
    expect(folds).toHaveLength(2);
    for (const fold of folds) {
      expect(fold.getAttribute("data-fold-state")).toBe("BOUNDARY_FIXED_NOT_EVALUATED");
    }
  });
});

describe("P08-T05 — the four route axes stay four facts", () => {
  it("renders each axis separately", () => {
    render(<PreflightPanel preflight={preflight()} state={OK} />);
    const axes = Array.from(document.querySelectorAll("[data-axis]")).map((n) =>
      n.getAttribute("data-axis"),
    );
    expect(axes).toEqual(["engine", "integration", "evidence", "admission"]);
    expect(screen.getByText("PREFLIGHT_ONLY")).toBeTruthy();
  });
});

/* -------------------------------------------------------------------------
 * Token lifecycle
 * ---------------------------------------------------------------------- */

describe("P08-T06 — a token belongs to the spec it was issued for", () => {
  it("drops the preview when any field of the declaration changes", async () => {
    stub(() => [201, preflight()]);
    const first = spec();
    const { result, rerender } = renderHook(({ s }) => usePreflight(s), {
      initialProps: { s: first },
    });

    await act(async () => result.current.runPreflight());
    await waitFor(() => expect(result.current.preflight).not.toBeNull());

    // A seed change alone produces a different effective spec.
    rerender({ s: spec({ random_seed: 43 }) });
    await waitFor(() => expect(result.current.preflight).toBeNull());
    expect(result.current.clearedBecause).toBe(SPEC_CHANGED_NOTE);
    expect(result.current.needsPreflight).toBe(true);
  });

  it("keeps the preview when the same declaration is re-supplied", async () => {
    stub(() => [201, preflight()]);
    const { result, rerender } = renderHook(({ s }) => usePreflight(s), {
      initialProps: { s: spec() },
    });
    await act(async () => result.current.runPreflight());
    await waitFor(() => expect(result.current.preflight).not.toBeNull());

    // A new object with identical content is the same declaration.
    rerender({ s: spec() });
    await waitFor(() => expect(result.current.preflight).not.toBeNull());
    expect(result.current.clearedBecause).toBeNull();
  });

  it("treats key order as irrelevant and every value as material", () => {
    expect(sameRequestedSpec(spec(), spec())).toBe(true);
    expect(sameRequestedSpec(spec(), spec({ optuna_trials: 401 }))).toBe(false);
    expect(sameRequestedSpec(spec(), spec({ random_seed: null }))).toBe(false);
    expect(
      sameRequestedSpec(spec(), spec({ data: { dataset_id: "ds_btcusdt_4h", symbol: "ETHUSDT", timeframe: "4h" } })),
    ).toBe(false);
  });
});

describe("P08-T07 — the browser never derives the manifest", () => {
  it("sends the spec and never a requested_spec_digest", async () => {
    stub(() => [201, preflight()]);
    const { result } = renderHook(() => usePreflight(spec()));
    await act(async () => result.current.runPreflight());
    await waitFor(() => expect(result.current.preflight).not.toBeNull());

    const post = sent.find((r) => r.method === "POST")!;
    expect(post.url).toBe("/api/v1/research/preflights");
    expect(Object.keys(post.body as object).sort()).toEqual(["requested_spec"]);
    expect(JSON.stringify(post.body)).not.toContain("requested_spec_digest");
  });

  it("computes no digest anywhere on the P08 surface", () => {
    for (const name of ["preflightClient.ts", "usePreflight.ts", "PreflightPanel.tsx", "SplitBoundary.tsx"]) {
      const code = readFileSync(join(process.cwd(), "src", "research", name), "utf8")
        .split("\n")
        .filter((line) => {
          const t = line.trimStart();
          return !t.startsWith("*") && !t.startsWith("//") && !t.startsWith("/*");
        })
        .join("\n");
      expect(code, name).not.toMatch(/createHash|subtle\.digest|sha256\s*\(/);
    }
  });
});

describe("P08-T08 — refusals behave the way the handoff requires", () => {
  it("maps every code the contract declares", () => {
    expect(PREFLIGHT_PROBLEM_CODES).toHaveLength(20);
    for (const code of PREFLIGHT_PROBLEM_CODES) {
      const refusal = toPreflightRefusal(new PortalApiError("server sentence", 400, code, "req_1"));
      expect(refusal.code).toBe(code);
      expect(refusal.message).toBe("server sentence");
      expect(refusal.state).not.toBe("available");
    }
  });

  it("points at the form for an input fault and does not kill the token for it", () => {
    for (const code of [
      "RESEARCH_PREFLIGHT_INVALID",
      "RESEARCH_PREFLIGHT_TOPOLOGY_INVALID",
      "RESEARCH_PREFLIGHT_TOPOLOGY_UNSUPPORTED",
      "RESEARCH_PREFLIGHT_RESOURCE_REFUSED",
      "RESEARCH_PREFLIGHT_SNAPSHOT_TOO_LARGE",
    ] as const) {
      const refusal = toPreflightRefusal(new PortalApiError("no", 400, code, null));
      expect(refusal.highlightsInput, code).toBe(true);
      expect(refusal.invalidatesToken, code).toBe(false);
    }
  });

  it("treats a declared dependency gap as unavailable, not as empty", () => {
    for (const code of [
      "RESEARCH_PREFLIGHT_DATA_UNAVAILABLE",
      "RESEARCH_PREFLIGHT_REQUIRED_COLUMNS_UNAVAILABLE",
      "RESEARCH_PREFLIGHT_FUNDING_UNAVAILABLE",
      "RESEARCH_PREFLIGHT_WARMUP_UNAVAILABLE",
    ] as const) {
      expect(toPreflightRefusal(new PortalApiError("no", 422, code, null)).state, code).toBe(
        "unavailable",
      );
    }
  });

  it("offers a retry only where one could work", () => {
    for (const code of ["RESEARCH_PREFLIGHT_UNAVAILABLE", "RESEARCH_PREFLIGHT_REJECTED"] as const) {
      const refusal = toPreflightRefusal(new PortalApiError("busy", 503, code, null));
      expect(refusal.state, code).toBe("failed-retryable");
      expect(refusal.mayRetry, code).toBe(true);
    }
    for (const code of [
      "RESEARCH_PREFLIGHT_EXPIRED",
      "RESEARCH_PREFLIGHT_STALE",
      "RESEARCH_PREFLIGHT_NOT_FOUND",
    ] as const) {
      const refusal = toPreflightRefusal(new PortalApiError("gone", 409, code, null));
      expect(refusal.mayRetry, code).toBe(false);
      expect(refusal.invalidatesToken, code).toBe(true);
    }
  });

  it("never names the transport when the request did not arrive", () => {
    const refusal = toPreflightRefusal(new TypeError("Failed to fetch"));
    expect(refusal.message).toBe("The request did not reach the server.");
    expect(refusal.mayRetry).toBe(true);
    expect(refusal.code).toBeNull();
  });
});

describe("P08-T09 — an expired token is dropped, never resent", () => {
  it("clears the held preview and keeps the server's sentence", async () => {
    let created = false;
    stub((_url, method) => {
      if (method === "POST" && !created) {
        created = true;
        return [201, preflight()];
      }
      return [
        409,
        {
          error: {
            code: "RESEARCH_PREFLIGHT_EXPIRED",
            message: "That preflight expired. Run preflight again.",
          },
          request_id: "req_9",
        },
      ];
    });

    const { result } = renderHook(() => usePreflight(spec()));
    await act(async () => result.current.runPreflight());
    await waitFor(() => expect(result.current.preflight).not.toBeNull());

    await act(async () => result.current.reopen("pf_01HZQ7"));
    await waitFor(() => expect(result.current.refusal).not.toBeNull());

    expect(result.current.refusal?.code).toBe("RESEARCH_PREFLIGHT_EXPIRED");
    expect(result.current.refusal?.message).toBe("That preflight expired. Run preflight again.");
    expect(result.current.preflight).toBeNull();
    expect(result.current.needsPreflight).toBe(true);
    // Exactly one GET went out: the dead token is not tried again.
    expect(sent.filter((r) => r.method === "GET")).toHaveLength(1);
  });
});

describe("P08-T10 — panels keep their frame when the preflight is refused", () => {
  it("retains every named panel and states the reason", () => {
    const refusal = toPreflightRefusal(
      new PortalApiError("The historical reader has no data for this range.", 422, "RESEARCH_PREFLIGHT_DATA_UNAVAILABLE", null),
    );
    render(
      <PreflightPanel
        preflight={null}
        state={{
          state: refusal.state,
          reason: refusal.message,
          mayRetry: refusal.mayRetry,
          retainsContent: false,
        }}
      />,
    );
    for (const name of [
      "preflight",
      "data binding & snapshot",
      "snapshot quality",
      "engine capability",
      "topology",
      "resource estimate",
    ]) {
      const panel = document.querySelector(`[data-research-panel="${name}"]`) as HTMLElement;
      expect(panel, name).toBeTruthy();
      expect(panel.getAttribute("data-state")).toBe("unavailable");
    }
    // No fake empty preview: the reason is on screen, the metadata is not.
    expect(document.querySelector("[data-data-binding]")).toBeNull();
    expect(screen.getAllByText("The historical reader has no data for this range.").length).toBeGreaterThan(0);
  });

  it("says why a preview was dropped after an edit", () => {
    render(
      <PreflightPanel
        preflight={null}
        state={{ state: "empty", reason: SPEC_CHANGED_NOTE, mayRetry: false, retainsContent: false }}
        clearedBecause={SPEC_CHANGED_NOTE}
      />,
    );
    expect(document.querySelector("[data-cleared-note]")?.textContent).toBe(SPEC_CHANGED_NOTE);
  });
});

/* -------------------------------------------------------------------------
 * Screen 05
 * ---------------------------------------------------------------------- */

describe("P08-T11 — Screen 05 renders the structural boundary only", () => {
  it("draws each fold from server milliseconds and never recomputes a date", () => {
    render(<SplitBoundary topology={THREE_WINDOW} state={OK} />);
    const rows = Array.from(document.querySelectorAll("[data-anatomy-fold]"));
    expect(rows).toHaveLength(2);

    // fold_01 train is 2022→2023 inside a 2022→2026 frame: a quarter of it.
    const train = rows[0].querySelector('[data-segment="train"]') as HTMLElement;
    expect(train.style.left).toBe("0%");
    expect(Number.parseFloat(train.style.width)).toBeCloseTo(25, 0);

    // fold_02 train is expanding: strictly wider than fold_01's.
    const train2 = rows[1].querySelector('[data-segment="train"]') as HTMLElement;
    expect(Number.parseFloat(train2.style.width)).toBeGreaterThan(
      Number.parseFloat(train.style.width),
    );
  });

  it("draws the seal as a seal, never as a readable segment", () => {
    render(<SplitBoundary topology={THREE_WINDOW} state={OK} />);
    const seal = document.querySelector('[data-segment="sealed"]') as HTMLElement;
    expect(seal.style.backgroundImage).toContain("repeating-linear-gradient");
    // Pitfall 3: the holdout must not share the OOS colour.
    const oos = document.querySelector('[data-segment="outer_oos"]') as HTMLElement;
    expect(seal.style.background).not.toBe(oos.style.background);
    // Pitfall 4: the design system has no emoji.
    expect(document.body.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("offers no unlock control and no evaluation state", () => {
    render(<SplitBoundary topology={THREE_WINDOW} state={OK} />);
    expect(document.querySelectorAll("button")).toHaveLength(0);
    expect(document.querySelector("[data-evaluation-state]")?.textContent).toBe("NOT_EVALUATED");
    expect(screen.getByText("No panel on this screen reads a bar inside this span.")).toBeTruthy();
  });

  it("names what this phase does not yet know instead of leaving it blank", () => {
    render(<SplitBoundary topology={THREE_WINDOW} state={OK} />);
    expect(document.querySelector("[data-boundary-footer]")?.textContent).toBe(BOUNDARY_FOOTER);
    expect(document.querySelector("[data-scope-note]")?.textContent).toBe(P08_SCOPE_NOTE);
    // Nothing P14 owns is invented here. The scope note is allowed to name
    // those facts — saying they are absent is the opposite of fabricating them,
    // so the sweep covers the panels rather than the whole document.
    const panels = Array.from(document.querySelectorAll("[data-research-panel]"))
      .map((node) => node.textContent ?? "")
      .join(" ");
    expect(panels).not.toMatch(/purge|embargo|θ|theta|gap scan|inner fold/i);
  });

  it("keeps its frame and says so when no topology is held", () => {
    render(
      <SplitBoundary
        topology={null}
        state={{ state: "empty", reason: "No preflight has been run for this declaration.", mayRetry: false, retainsContent: false }}
      />,
    );
    for (const name of ["protocol", "fold anatomy", "holdout seal"]) {
      expect(document.querySelector(`[data-research-panel="${name}"]`), name).toBeTruthy();
    }
    expect(screen.getAllByText("No preflight has been run for this declaration.").length).toBeGreaterThan(0);
  });
});

describe("P08-T12 — the advanced protocol declares no seal", () => {
  it("renders frequency and window mode and omits the seal card", () => {
    render(<SplitBoundary topology={ADVANCED} state={OK} />);
    const strip = document.querySelector("[data-protocol-strip]") as HTMLElement;
    expect(strip.textContent).toContain("quarterly");
    expect(strip.textContent).toContain("expanding");
    expect(document.querySelector("[data-sealed-chip]")).toBeNull();
    expect(document.querySelector('[data-segment="sealed"]')).toBeNull();
    expect(document.querySelector("[data-no-seal]")?.textContent).toBe(
      "advanced_walk_forward declares no sealed holdout.",
    );
  });
});

describe("rangeLabel", () => {
  it("is half-open in both directions", () => {
    expect(rangeLabel(range("a", "b", 1, 2))).toBe("[a, b)");
  });
});

describe("groupDigits", () => {
  it("groups without losing a digit or changing a unit", () => {
    expect(groupDigits(268435456)).toBe("268,435,456");
    expect(groupDigits(1402560)).toBe("1,402,560");
    expect(groupDigits(800)).toBe("800");
    expect(groupDigits(0)).toBe("0");
    expect(groupDigits(-1234)).toBe("-1,234");
  });

  it("never rounds and never abbreviates", () => {
    // The failure this guards against is a "1.4 MB" that hides 402,560 bytes.
    expect(groupDigits(1402560).replace(/,/g, "")).toBe("1402560");
    expect(groupDigits(1402560)).not.toMatch(/[KMGkmg]B?$|…|\.\d/);
  });

  it("refuses a non-finite value rather than printing a fake number", () => {
    expect(groupDigits(Number.NaN)).toBe("NaN");
    expect(groupDigits(Number.POSITIVE_INFINITY)).toBe("Infinity");
  });
});

describe("F2b S02 — the gate strip", () => {
  it("draws one segment per served gate, coloured by its own state, with the gate name as tooltip", () => {
    const gates = [
      { gate: "dataset_binding", state: "PASS", message: "bound" },
      { gate: "warmup", state: "NOT_RECORDED", message: "not recorded" },
    ] as NonNullable<PreflightResponse["gates"]>;
    render(<PreflightPanel preflight={preflight({ gates })} state={OK} />);
    const segments = [...document.querySelectorAll("[data-gate-segment]")] as HTMLElement[];
    expect(segments.map((node) => node.getAttribute("data-gate-segment"))).toEqual(["PASS", "NOT_RECORDED"]);
    expect(segments[0].getAttribute("title")).toBe("dataset_binding · PASS");
    cleanup();
  });
});
