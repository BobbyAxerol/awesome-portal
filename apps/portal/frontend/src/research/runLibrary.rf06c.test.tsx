/**
 * RF-06 wave C · Screen 01 Run Library consumes the RF-05 contract
 * (`research-run-library.d.ts`, OpenAPI 1.1.0; commits 7b80ae07 / c0021ba5).
 *
 * One block per consumed field. Every assertion here fails on the code before
 * wave C: stats had no scope, the sparkline drew no series from the lazy read,
 * the claim line had no state, the ledger had four buckets, rc had no chip, a
 * legacy QUEUED row read as live work, and a legacy binding was decided by row
 * kind rather than the server's typed availability.
 *
 * Fixture values are the live preview's (2026-09-24, :8095 contracts), trimmed.
 */
import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  LEGACY_BINDING_LABEL,
  RunLibrary,
  SPARKLINE_UNAVAILABLE,
  groupRuns,
  ledgerCaption,
  rcChipFace,
  rcLookupVersions,
  reasonSentence,
  sparkCaption,
  sparkHeights,
  sparkProvenance,
  scopeSuffix,
} from "./RunLibrary";
import {
  RUNNING_POLL_MS,
  type Availability,
  type MetricCell,
  type RunLibraryItem,
  type RunLibraryResponse,
  type RunSparklineResponse,
  type RunSparklineSource,
} from "./runLibraryClient";
import { useRunLibrary, type LibraryFilters, type SparklineRead } from "./useRunLibrary";
import { researchState } from "./state";
import { onSessionExpired } from "../auth/sessionExpiry";
import { lookupAbsent, lookupFound, lookupProblem, lookupRecord, LOOKUP_AS_OF, LOOKUP_SERVER_PROSE } from "./alphaVersionPublication.fixture";

/* ---------------------------------------------------------------- fixtures */

const AVAILABLE: Availability = { state: "AVAILABLE", reason_code: null };
const REVISION = "p13r1_cc2dd29666fec16271f7c39b0afa5eec6472e78a0fc85613429c543d10d5854c";
const NOT_ISSUED_SENTENCE = "The fixed P10 qualification sealed its artifacts but did not issue a release claim.";

const LIVE_STATS: MetricCell[] = [
  {
    key: "oos_sharpe",
    label: "OOS sharpe",
    role: "OOS_SHARPE",
    value: "0.7440081232022494",
    tone: "DEFAULT",
    availability: AVAILABLE,
    scope: "OOS",
    definition_id: "research.metric.v3.oos_sharpe",
  },
  {
    key: "decay",
    label: "Δ decay",
    role: "DECAY",
    value: null,
    tone: "DEFAULT",
    availability: { state: "NOT_PUBLISHED", reason_code: "P13_IS_BOUNDARY_NOT_IN_CHILD_RECEIPT" },
    scope: null,
    definition_id: null,
  },
  {
    key: "trade_count",
    label: "trades",
    role: "TRADE_COUNT",
    value: "45",
    tone: "DEFAULT",
    availability: AVAILABLE,
    scope: "CHILD_TAPE",
    definition_id: "research.metric.v1.trade_count",
  },
];

function item(overrides: Partial<RunLibraryItem> = {}): RunLibraryItem {
  return {
    run_id: "rrun_3935d7d16bbccabcc43382108ffca89d",
    display_label: "R-WFO-118",
    attempt_id: null,
    source_kind: "RESEARCH_DURABLE",
    row_kind: "LOGICAL_RUN",
    relationship: { kind: "PRIMARY", logical_run_key: "primary", parent_run_id: null, technical_retry_count: 0 },
    status: "COMPLETED",
    status_basis: { kind: "DURABLE_LIFECYCLE", availability: AVAILABLE },
    mode: {
      display: "mode_1_decay · global",
      key: "mode_1_decay",
      schedule: "global",
      protocol: "three_window_decay",
      availability: AVAILABLE,
    },
    strategy_id: { value: "delta-rsi-polynomial-alpha", availability: AVAILABLE },
    binding: {
      alpha_id: "delta-rsi-polynomial-alpha",
      alpha_name: "Delta-RSI Polynomial Alpha",
      alpha_version_id: "av_delta_rsi_polynomial_alpha_1_0_0",
      av: "av_1_0_0",
      digest: "34dc1847d051ca40f9ae3d2fbbf2d7e8fdc6b8d1e853beb0cc480b69afe2054d",
    },
    binding_availability: AVAILABLE,
    rc: null,
    rc_availability: { state: "NOT_PUBLISHED", reason_code: "P21_NO_PERSISTED_RELEASE_CANDIDATE" },
    instrument: { display: "BTCUSDT · 1h", availability: AVAILABLE },
    created_at_utc_ms: 1790245500000,
    certificate: {
      grade: null,
      availability: { state: "NOT_PUBLISHED", reason_code: "SOURCE_DID_NOT_PUBLISH_METHODOLOGY_CERTIFICATE" },
    },
    claim: { state: "NOT_ISSUED", text: NOT_ISSUED_SENTENCE, availability: AVAILABLE },
    stages: (["S1", "S2", "S3", "S4", "S5"] as const).map((key) => ({
      key,
      state: "done" as const,
      tip: `Persisted ${key} state: DONE.`,
      tooltip_source: "DERIVED_FROM_PERSISTED_STATE" as const,
      availability: AVAILABLE,
    })),
    stats: LIVE_STATS,
    superseded_note: null,
    comparison: { key: "rck1_same", availability: AVAILABLE },
    sparkline: { kind: "oos_equity", availability: AVAILABLE },
    evidence_revision: REVISION,
    source_updated_at_utc_ms: 1790245600000,
    ...overrides,
  };
}

const LEGACY = item({
  run_id: "527d2b993c834729",
  source_kind: "LEGACY_1_0_8_METADATA",
  row_kind: "LEGACY_RUN",
  status: "QUEUED",
  status_basis: {
    kind: "LEGACY_RECORDED_STATUS",
    availability: { state: "LEGACY_METADATA_ONLY", reason_code: "LEGACY_1_0_8_NON_TERMINAL_STATUS_NOT_MONITORED" },
  },
  mode: {
    display: "three_window_decay",
    key: null,
    schedule: null,
    protocol: "three_window_decay",
    availability: { state: "LEGACY_METADATA_ONLY", reason_code: "LEGACY_1_0_8_RECORDS_PROTOCOL_NOT_OPTIMIZATION_MODE" },
  },
  binding: null,
  binding_availability: { state: "LEGACY_METADATA_ONLY", reason_code: "LEGACY_1_0_8_DOES_NOT_PUBLISH_ALPHA_BINDING" },
  rc_availability: { state: "LEGACY_METADATA_ONLY", reason_code: "LEGACY_1_0_8_HAS_NO_RELEASE_CANDIDATE_RELATION" },
  claim: {
    state: null,
    text: null,
    availability: { state: "LEGACY_METADATA_ONLY", reason_code: "LEGACY_1_0_8_DOES_NOT_PUBLISH_PROGRESS" },
  },
  stats: (["progress", "trials", "elapsed"] as const).map((key) => ({
    key,
    label: key,
    role: key.toUpperCase() as MetricCell["role"],
    value: null,
    tone: "DEFAULT" as const,
    availability: { state: "LEGACY_METADATA_ONLY" as const, reason_code: "LEGACY_1_0_8_DOES_NOT_PUBLISH_PROGRESS" },
    scope: null,
    definition_id: null,
  })),
  sparkline: {
    kind: null,
    availability: { state: "LEGACY_METADATA_ONLY", reason_code: "LEGACY_1_0_8_DOES_NOT_PUBLISH_SPARKLINE_SERIES" },
  },
  evidence_revision: null,
});

const CANCELLED = item({
  run_id: "rrun_5abb59f2ab9e02ccff1dad3f00df692b",
  status: "CANCELLED",
  claim: { state: null, text: null, availability: { state: "NOT_PUBLISHED", reason_code: "CANCELLED_BEFORE_SOURCE" } },
  stats: (["progress", "trials", "elapsed"] as const).map((key) => ({
    key,
    label: key,
    role: key.toUpperCase() as MetricCell["role"],
    value: null,
    tone: "DEFAULT" as const,
    availability: { state: "NOT_PUBLISHED" as const, reason_code: "CANCELLED_BEFORE_SOURCE" },
    scope: null,
    definition_id: null,
  })),
  sparkline: {
    kind: null,
    availability: { state: "NOT_PUBLISHED", reason_code: "P12_DOES_NOT_READ_ARTIFACT_OR_PARQUET_SERIES" },
  },
  evidence_revision: null,
});

const LIVE_LEDGER: RunLibraryResponse["claim_ledger"] = {
  issued: 0,
  not_issued: 10,
  pending_source: 0,
  failed: 0,
  cancelled_before_source: 4,
  legacy_metadata_only: 1,
};

function page(items: RunLibraryItem[], ledger = LIVE_LEDGER): RunLibraryResponse {
  return {
    schema_version: "research.run-library.v1",
    read_authority: "PORTAL_PERSISTED_RESEARCH",
    items,
    page: {
      limit: 50,
      total_rows: 15,
      filtered_rows: 15,
      next_cursor: null,
      prev_cursor: null,
      has_more: false,
      has_previous: false,
      order: "CREATED_AT_DESC_RUN_ID_DESC",
    },
    counters: { logical_runs: 15, worker_children: 0, technical_retries: 0, legacy_metadata_rows: 1 },
    status_counts: { COMPLETED: 2, RUNNING: 0, FAILED: 0, QUEUED: 0, DRAFT: 0, CANCELLED: 0, RECOVERY_REQUIRED: 0 },
    claim_ledger: ledger,
    filter_catalog: {
      alphas: [{ alpha_id: "delta-rsi-polynomial-alpha", alpha_name: "Delta-RSI Polynomial Alpha" }],
      modes: [{ key: "mode_1_decay", display: "mode_1_decay" }],
      scratch_available: false,
    },
    as_of_utc_ms: 1790252017306,
  };
}

const LIVE_VALUES = [
  "19996.892873321103", "20004.363467965017", "19947.087150562846", "19949.317436960147",
  "19949.317436960147", "19949.317436960147", "19949.317436960147", "19949.317436960147",
  "19946.141036998644", "19922.149372914653", "19961.99153454294", "19973.80606305893",
  "19892.7970791272", "19895.19955362675", "19868.797212233265", "19906.623853337936",
  "19896.445652319642", "19952.573881623815", "19930.28913713956", "19979.33910885368",
  "19949.23500016499", "19974.380678077618", "19965.998848845535", "19965.998848845535",
];

const LIVE_SOURCE: RunSparklineSource = {
  lane: "PORTAL_PERSISTED_RESEARCH",
  series_kind: "EQUITY_OOS",
  value_field: "equity",
  projection_revision: REVISION,
  series_digest: "1c06daec220b64566ed7d219f32bfc47cbdeafdc144c692ff49a1c669488aad5",
  source_observation_count: 744,
  source_sampling: "EXTREMA_BUCKET_V1",
  persisted_point_count: 25,
  display_sampling: "EXTREMA_BUCKET_24_V1",
  first_at_utc_ms: 1782864000000,
  last_at_utc_ms: 1785538800000,
};

const SERIES: SparklineRead = { kind: "series", values: LIVE_VALUES, source: LIVE_SOURCE, revision: REVISION };

const EMPTY: LibraryFilters = { q: "", status: [], mode: [], alpha: [], group: false, sel: [] };

function view(items: RunLibraryItem[], extra: Partial<React.ComponentProps<typeof RunLibrary>> = {}) {
  const response = extra.response ?? page(items);
  render(
    <MemoryRouter>
      <RunLibrary
        filters={EMPTY}
        onFilters={vi.fn()}
        onToggleSel={vi.fn()}
        response={response}
        items={response.items}
        state={researchState({ kind: "ok", rowCount: response.items.length })}
        sparklines={new Map()}
        onVisible={vi.fn()}
        onLoadNext={vi.fn()}
        onLoadPrevious={vi.fn()}
        {...extra}
      />
    </MemoryRouter>,
  );
}

const card = (runId: string) => document.querySelector(`[data-run="${runId}"]`) as HTMLElement;
const metric = (root: HTMLElement, role: string) => root.querySelector(`[data-metric="${role}"]`) as HTMLElement;
/** Any `A_B_C…` code shape a reader should never see in a tooltip. */
const RAW_CODE = /\b[A-Z0-9]+(_[A-Z0-9]+){2,}\b/;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/* ------------------------------------------------------------------- stats */

describe("stats — OOS Sharpe, decay, trades with their scope (CG-P12-02)", () => {
  it("shows OOS Sharpe at two places, the exact value and its scope in title", () => {
    view([item()]);
    const sharpe = metric(card(item().run_id), "OOS_SHARPE");
    const value = sharpe.lastElementChild as HTMLElement;
    expect(value.textContent).toBe("0.74");
    expect(value.getAttribute("title")).toBe("0.7440081232022494 — measured on the out-of-sample window");
    expect(sharpe.getAttribute("data-scope")).toBe("OOS");
    expect(sharpe.getAttribute("data-definition")).toBe("research.metric.v3.oos_sharpe");
    // The label already says OOS; it gains no suffix.
    expect(sharpe.firstElementChild?.textContent).toBe("OOS sharpe");
  });

  it("labels the trade count with its child-tape scope, never as an OOS count", () => {
    view([item()]);
    const trades = metric(card(item().run_id), "TRADE_COUNT");
    // Pre-wave-C: a bare "45" under "trades" beside "OOS sharpe", read as an OOS count.
    expect(trades.getAttribute("data-scope")).toBe("CHILD_TAPE");
    expect(trades.textContent).not.toMatch(/OOS/i);
    const value = trades.lastElementChild as HTMLElement;
    expect(value.textContent).toBe("45 child tape");
    expect(value.querySelector("[data-scope-suffix]")?.textContent).toBe("child tape");
    expect(value.getAttribute("title")).toBe("counted over the run's whole child tape, not the OOS window only");
    expect(scopeSuffix({ scope: "IS_PLUS_OOS" })).toBe("IS + OOS");
    expect(scopeSuffix({ scope: "OOS" })).toBeNull();
  });

  it("gives decay a typed absence with the reason's words and sentence, never a dash or a zero", () => {
    view([item()]);
    const decay = metric(card(item().run_id), "DECAY");
    const slot = decay.querySelector("[data-withheld]") as HTMLElement;
    expect(slot.textContent).toBe("not measured");
    expect(slot.getAttribute("data-reason-code")).toBe("P13_IS_BOUNDARY_NOT_IN_CHILD_RECEIPT");
    expect(slot.getAttribute("title")).toBe(
      "The IS/OOS boundary is not in the run's receipt, so no in-sample Sharpe was measured and no decay can be stated.",
    );
    expect(decay.textContent).not.toMatch(/—|\b0\b/);
  });

  it("names a run sealed before OOS analytics as such", () => {
    const predates = { state: "NOT_PUBLISHED" as const, reason_code: "P13_SOURCE_PREDATES_OOS_ANALYTICS" };
    view([
      item({
        stats: [
          { ...LIVE_STATS[0], value: null, availability: predates, scope: null, definition_id: null },
          { ...LIVE_STATS[1], availability: predates },
          LIVE_STATS[2],
        ],
      }),
    ]);
    const slots = Array.from(card(item().run_id).querySelectorAll("[data-stats] [data-withheld]"));
    expect(slots.map((slot) => slot.textContent)).toEqual(["not recorded", "not recorded"]);
    expect(slots[0].getAttribute("title")).toMatch(/sealed before OOS analytics were published/);
  });

  it("says a cancelled run reported nothing, in words", () => {
    view([CANCELLED]);
    const slots = Array.from(card(CANCELLED.run_id).querySelectorAll("[data-stats] [data-withheld]"));
    expect(slots.map((slot) => slot.textContent)).toEqual(["not reported", "not reported", "not reported"]);
    expect(slots[0].getAttribute("title")).toMatch(/cancelled before its source published anything/);
  });
});

/* --------------------------------------------------------------- sparkline */

describe("sparkline — bars from the lazy read, caption from its source (CG-P12-03)", () => {
  it("draws the published values as min–max columns in the hi-fi band, not a flat peak scale", () => {
    const heights = sparkHeights(LIVE_VALUES)!;
    expect(heights).toHaveLength(24);
    expect(Math.min(...heights)).toBeCloseTo(12);
    expect(Math.max(...heights)).toBeCloseTo(96);
    // Pre-wave-C scaled by the peak: every column sat between 99 % and 100 %.
    view([item()], { sparklines: new Map([[item().run_id, SERIES]]) });
    const bars = Array.from(document.querySelector("[data-sparkline-values]")!.children) as HTMLElement[];
    expect(bars).toHaveLength(24);
    expect(new Set(bars.map((bar) => bar.style.height)).size).toBeGreaterThan(5);
    expect(bars[14].style.height).toBe("12%"); // the series minimum
    expect(bars[1].style.height).toBe("96%"); // the series maximum
  });

  it("captions the downsample: n of m points and that extrema were kept", () => {
    view([item()], { sparklines: new Map([[item().run_id, SERIES]]) });
    expect(document.querySelector("[data-sparkline-caption]")?.textContent).toBe("24 of 744 pts · extrema kept");
    expect(sparkCaption(12, { ...LIVE_SOURCE, source_observation_count: null, source_sampling: null, persisted_point_count: 12, display_sampling: "FULL" })).toBe(
      "12 of 12 pts · full",
    );
  });

  it("puts the full provenance in title, in words", () => {
    const title = sparkProvenance(24, LIVE_SOURCE, REVISION);
    expect(title).toContain("744 source observations, reduced by extrema-preserving buckets");
    expect(title).toContain("25 persisted points");
    expect(title).toContain("24 drawn by 24 extrema-preserving buckets (first, last, minimum and maximum kept)");
    expect(title).toContain("2026-07-01 00:00 UTC → 2026-07-31 23:00 UTC");
    expect(title).toContain("projection cc2dd296 · digest 1c06daec");
    expect(title).not.toMatch(RAW_CODE);
    expect(title).not.toContain("different projection revision");
    expect(sparkProvenance(24, LIVE_SOURCE, "p13r2_other")).toContain(
      "this series is from a different projection revision than the card's stats",
    );
  });

  it("keeps the placeholder for a failed read, titled 'sparkline unavailable', and for a withheld one with its reason", () => {
    view([item(), item({ run_id: "B" })], {
      sparklines: new Map<string, SparklineRead>([
        [item().run_id, { kind: "failed" }],
        ["B", { kind: "withheld", availability: { state: "NOT_PUBLISHED", reason_code: "P13_EQUITY_OOS_SERIES_NOT_PUBLISHED" } }],
      ]),
    });
    const failed = card(item().run_id).querySelector("[data-sparkline-placeholder]") as HTMLElement;
    expect(failed.getAttribute("data-sparkline-placeholder")).toBe("failed");
    expect(failed.getAttribute("title")).toBe(`${SPARKLINE_UNAVAILABLE} — the series read failed; it is not retried automatically.`);
    const withheld = card("B").querySelector("[data-sparkline-placeholder]") as HTMLElement;
    expect(withheld.getAttribute("title")).toBe(`${SPARKLINE_UNAVAILABLE} — This run published no OOS equity series.`);
  });

  it("refuses to draw values that are not numbers", () => {
    expect(sparkHeights(["1", "NaN"])).toBeNull();
    expect(sparkHeights(["5", "5"])).toEqual([54, 54]);
  });
});

/* ------------------------------------------------------------------ claim */

describe("claim — state and sentence (CG-P12-09)", () => {
  it("prints the NOT_ISSUED state; the server's sentence is its tooltip", () => {
    view([item()]);
    const claim = card(item().run_id).querySelector("[data-claim]") as HTMLElement;
    expect(claim.textContent).toBe("NOT ISSUED");
    expect(claim.querySelector("[data-claim-state]")?.getAttribute("title")).toBe(NOT_ISSUED_SENTENCE);
    expect(claim.querySelector("[data-claim-state]")?.getAttribute("data-claim-state")).toBe("NOT_ISSUED");
  });

  it("marks an issued and a forecast claim by their state", () => {
    view([
      item({ run_id: "I", claim: { state: "ISSUED", text: "STRICT_OUTER_OOS — OOS read once after freeze", availability: AVAILABLE } }),
      item({ run_id: "F", claim: { state: "FORECAST", text: "forecast sentence", availability: AVAILABLE } }),
    ]);
    expect(card("I").querySelector("[data-claim]")?.textContent).toBe("ISSUED — STRICT_OUTER_OOS — OOS read once after freeze");
    expect(card("I").querySelector("[data-claim]")?.getAttribute("data-claim-kind")).toBe("issued");
    expect(card("F").querySelector("[data-claim]")?.getAttribute("data-claim-kind")).toBe("forecast");
  });

  it("gives a cancelled-before-source row the cancelled line", () => {
    view([CANCELLED]);
    expect(card(CANCELLED.run_id).querySelector("[data-claim]")?.getAttribute("data-claim-kind")).toBe("cancelled");
  });
});

/* ----------------------------------------------------------------- ledger */

describe("claims ledger — six buckets, cancelled and legacy included (CG-P12-05)", () => {
  it("draws a segment for every non-empty bucket, cancelled and legacy among them", () => {
    view([item()]);
    const segments = Array.from(document.querySelectorAll("[data-ledger-segment]")) as HTMLElement[];
    // Pre-wave-C: four buckets only; 4 cancelled + 1 legacy rows had no segment.
    expect(segments.map((segment) => segment.getAttribute("data-ledger-segment"))).toEqual([
      "not_issued",
      "cancelled_before_source",
      "legacy_metadata_only",
    ]);
    expect(segments.map((segment) => segment.getAttribute("data-count"))).toEqual(["10", "4", "1"]);
    // Hi-fi: 14 px a run, capped at 168 px and shared proportionally.
    expect(segments[0].style.width).toBe("112px");
    expect(segments[2].getAttribute("style")).toContain("dashed");
    for (const segment of segments) expect(segment.getAttribute("title")).not.toMatch(RAW_CODE);
  });

  it("captions the partition in the hi-fi form", () => {
    view([item()]);
    expect(document.querySelector("[data-ledger-caption]")?.textContent).toBe(
      "15 runs · 0 issued · 10 not issued · 4 cancelled · 1 legacy",
    );
    expect(
      ledgerCaption({ issued: 1, not_issued: 0, pending_source: 2, failed: 1, cancelled_before_source: 0, legacy_metadata_only: 0 }, 4),
    ).toBe("4 runs · 1 issued · 2 pending · 1 failed");
  });

  it("pulses only the pending bucket", () => {
    view([item()], {
      response: page([item()], { issued: 1, not_issued: 0, pending_source: 2, failed: 0, cancelled_before_source: 0, legacy_metadata_only: 0 }),
    });
    expect(document.querySelector('[data-ledger-segment="pending_source"]')?.getAttribute("data-motion")).toBe("pulse");
    expect(document.querySelector('[data-ledger-segment="issued"]')?.hasAttribute("data-motion")).toBe(false);
  });
});

/* --------------------------------------------------------------------- rc */

describe("rc chip — the persisted P21 relation, disabled until Screen 11 (CG-P12-06)", () => {
  it("shows a local seal as id · approval state, as a disabled link naming P21", () => {
    /* FG-05: the row's P22 lookup is in flight for this whole test; the P21 face stands. */
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    view([
      item({
        rc: {
          kind: "LOCAL_SEAL",
          release_candidate_id: "rc_2026_08_c",
          draft_id: null,
          delivery_state: "NOT_DELIVERED",
          approval_state: "APPROVED",
          sealed_at_utc_ms: 1790245500000,
        },
        rc_availability: AVAILABLE,
      }),
    ]);
    const chip = document.querySelector("[data-rc]") as HTMLElement;
    /* VD-FG-05-07: the in-flight lookup is on the face, not only in the title. */
    expect(chip.textContent).toBe("rc_2026_08_c · APPROVED · reading…");
    expect(chip.getAttribute("data-rc-publication")).toBe("loading");
    expect(chip.getAttribute("data-rc-tone-source")).toBe("raw");
    /* W5c/X1: Screen 11 exists (P21); a sealed pack's chip opens that pack's own read-only route. */
    expect(chip.tagName).toBe("A");
    expect(chip.getAttribute("href")).toBe("/research/quantbt/release-candidates/rc_2026_08_c");
    expect(chip.getAttribute("data-phase")).toBe("P21");
    expect(chip.getAttribute("title")).toContain("sealed rc from this run's params · approved");
    expect(chip.getAttribute("title")).toContain("open its sealed pack on Screen 11");
    expect(chip.style.color).toBe("var(--good)");
  });

  it("shows the viewer's draft as rc_ (draft) · DRAFT in gold", () => {
    view([
      item({
        rc: { kind: "ACTOR_DRAFT", release_candidate_id: null, draft_id: "rcd_1", delivery_state: null, approval_state: null, sealed_at_utc_ms: null },
        rc_availability: AVAILABLE,
      }),
    ]);
    const chip = document.querySelector("[data-rc]") as HTMLElement;
    expect(chip.textContent).toBe("rc_ (draft) · DRAFT");
    expect(chip.style.color).toBe("var(--accent-2)");
    expect(chip.getAttribute("title")).toMatch(/^release candidate being composed from this run/);
    expect(chip.getAttribute("href")).toMatch(/\/release-candidate$/);
  });

  it("keeps a long sealed id whole in title and short on the chip", () => {
    const face = rcChipFace({
      kind: "LOCAL_SEAL",
      release_candidate_id: "rc_0123456789abcdef0123",
      draft_id: null,
      delivery_state: null,
      approval_state: null,
      sealed_at_utc_ms: null,
    });
    expect(face.text).toBe("rc_0123456789a… · approval not published");
    expect(face.title).toMatch(/^rc_0123456789abcdef0123 —/);
  });

  it("reserves no chip and prints no words when no candidate exists; the served reason stays as data (2_wiring S01)", () => {
    view([item()]);
    expect(document.querySelector("[data-rc]")).toBeNull();
    expect(card(item().run_id).querySelector("[data-withheld][data-reason-code='P21_NO_PERSISTED_RELEASE_CANDIDATE']")).toBeNull();
    expect(card(item().run_id).getAttribute("data-rc-absent")).toBe("P21_NO_PERSISTED_RELEASE_CANDIDATE");
    expect(reasonSentence({ state: "NOT_PUBLISHED", reason_code: "P21_NO_PERSISTED_RELEASE_CANDIDATE" })).toBe(
      "No release candidate has been composed from this run.",
    );
  });
});

/* ----------------------------------------------------------------- legacy */

describe("legacy row — recorded status, legacy binding, protocol not mode (CG-P12-07)", () => {
  it("reads a legacy QUEUED as a record that nothing monitors, not as live work", () => {
    view([LEGACY]);
    const pill = card(LEGACY.run_id).querySelector("[data-status]") as HTMLElement;
    // Pre-wave-C: a live "QUEUED" pill.
    expect(pill.textContent).toBe("recorded queued · not monitored");
    expect(pill.getAttribute("data-status-basis")).toBe("LEGACY_RECORDED_STATUS");
    expect(pill.getAttribute("role")).toBeNull();
    expect(pill.hasAttribute("data-motion")).toBe(false);
    expect(pill.getAttribute("title")).toMatch(/nothing monitors it/);
    expect(card(LEGACY.run_id).querySelector("[data-claim]")?.getAttribute("data-claim-kind")).toBe("withheld");
    expect(screen.queryByText("watch progress →")).toBeNull();
  });

  it("labels the binding as legacy from the server's availability, never as scratch", () => {
    view([LEGACY]);
    const chip = card(LEGACY.run_id).querySelector("[data-binding]") as HTMLElement;
    expect(chip.getAttribute("data-binding")).toBe("legacy");
    expect(chip.textContent).toBe(LEGACY_BINDING_LABEL);
    expect(chip.getAttribute("title")).toBe(
      "The legacy 1.0.8 engine recorded no alpha binding for this run — neither bound nor scratch.",
    );
    // Grouped by the typed availability, not the row kind.
    const durableLegacyBinding = item({
      run_id: "D",
      binding: null,
      binding_availability: { state: "LEGACY_METADATA_ONLY", reason_code: "LEGACY_1_0_8_DOES_NOT_PUBLISH_ALPHA_BINDING" },
    });
    expect(groupRuns([durableLegacyBinding]).map((group) => group.key)).toEqual(["zzz:legacy"]);
  });

  it("shows the recorded protocol marked legacy, with the reason in words", () => {
    view([LEGACY]);
    const mode = card(LEGACY.run_id).querySelector("[data-mode]") as HTMLElement;
    expect(mode.textContent).toBe("three_window_decay · legacy");
    expect(mode.getAttribute("data-mode")).toBe("");
    expect(mode.getAttribute("title")).toBe("The legacy 1.0.8 engine recorded a protocol, not an optimization mode.");
  });
});

/* ------------------------------------------------------------------- mode */

describe("mode chip — display from the server, key for the filter (CG-P12-04)", () => {
  it("shows mode · schedule and keeps the protocol apart, in title", () => {
    view([item()]);
    const mode = card(item().run_id).querySelector("[data-mode]") as HTMLElement;
    expect(mode.textContent).toBe("mode_1_decay · global");
    expect(mode.getAttribute("data-mode")).toBe("mode_1_decay");
    expect(mode.getAttribute("title")).toBe(
      "optimization mode mode_1_decay · schedule global · protocol three_window_decay",
    );
    expect(document.querySelector('[data-filter-mode="mode_1_decay"]')?.textContent).toBe("mode_1_decay");
  });
});

/* ------------------------------------------------------------- tooltips */

describe("every RF-05 reason on a live-shaped page has a sentence", () => {
  it("puts no raw reason code in any title", () => {
    view([item(), LEGACY, CANCELLED], { sparklines: new Map([[item().run_id, SERIES]]) });
    for (const node of Array.from(document.querySelectorAll("[title]"))) {
      expect(node.getAttribute("title")).not.toMatch(RAW_CODE);
    }
    expect(document.querySelector("[data-evidence-revision]")?.getAttribute("data-evidence-revision")).toBe(REVISION);
  });
});

/* ------------------------------------------------------------------ hook */

describe("useRunLibrary — the lazy read and the legacy poll", () => {
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

  function hook() {
    return renderHook(() => useRunLibrary(), {
      wrapper: ({ children }) => <MemoryRouter initialEntries={["/research/quantbt/runs"]}>{children}</MemoryRouter>,
    });
  }

  async function settle(ms = 0, action?: () => void) {
    await act(async () => {
      action?.();
      await vi.advanceTimersByTimeAsync(ms);
    });
  }

  const sparkResponse: RunSparklineResponse = {
    schema_version: "research.run-sparkline.v1",
    run_id: item().run_id,
    values: LIVE_VALUES,
    availability: AVAILABLE,
    source_revision: REVISION,
    source: LIVE_SOURCE,
  };

  beforeEach(() => {
    requested = [];
    vi.useFakeTimers();
  });

  it("reads the series once per revision and keeps its source", async () => {
    stub((url) => (url.includes("/sparkline") ? [200, sparkResponse] : [200, page([item()])]));
    const { result } = hook();
    await settle();
    await settle(0, () => result.current.observeVisible(item().run_id, true));
    await settle(0, () => result.current.observeVisible(item().run_id, false));
    await settle(0, () => result.current.observeVisible(item().run_id, true));
    expect(requested.filter((url) => url.includes("/sparkline"))).toHaveLength(1);
    const read = result.current.sparklines.get(item().run_id);
    expect(read).toEqual({ kind: "series", values: LIVE_VALUES, source: LIVE_SOURCE, revision: REVISION });
  });

  it("records a failed read and does not retry it", async () => {
    stub((url) => (url.includes("/sparkline") ? [503, { error: { code: "X", message: "down" } }] : [200, page([item()])]));
    const { result } = hook();
    await settle();
    await settle(0, () => result.current.observeVisible(item().run_id, true));
    await settle(0, () => result.current.observeVisible(item().run_id, false));
    await settle(0, () => result.current.observeVisible(item().run_id, true));
    expect(result.current.sparklines.get(item().run_id)).toEqual({ kind: "failed" });
    expect(requested.filter((url) => url.includes("/sparkline"))).toHaveLength(1);
  });

  it("keeps the read's own reason when it answers with a typed absence", async () => {
    const withheld = { ...sparkResponse, values: [], source: null, availability: { state: "NOT_PUBLISHED", reason_code: "CANCELLED_BEFORE_SOURCE" } };
    stub((url) => (url.includes("/sparkline") ? [200, withheld] : [200, page([item()])]));
    const { result } = hook();
    await settle();
    await settle(0, () => result.current.observeVisible(item().run_id, true));
    expect(result.current.sparklines.get(item().run_id)).toEqual({
      kind: "withheld",
      availability: { state: "NOT_PUBLISHED", reason_code: "CANCELLED_BEFORE_SOURCE" },
    });
  });

  it("reads the series of a visible run that completes under a poll", async () => {
    let completed = false;
    const running = item({ status: "RUNNING", sparkline: { kind: "search_progress", availability: { state: "NOT_PUBLISHED", reason_code: "P13_EQUITY_OOS_SERIES_NOT_PUBLISHED" } }, evidence_revision: null });
    stub((url) => {
      if (url.includes("/sparkline")) return [200, sparkResponse];
      if (url.includes("ids=")) {
        completed = true;
        return [200, page([item()])];
      }
      return [200, page([running])];
    });
    const { result } = hook();
    await settle();
    await settle(0, () => result.current.observeVisible(item().run_id, true));
    expect(requested.filter((url) => url.includes("/sparkline"))).toHaveLength(0);
    await settle(RUNNING_POLL_MS);
    expect(completed).toBe(true);
    // Pre-wave-C: the observer does not fire again for a card already in view.
    expect(requested.filter((url) => url.includes("/sparkline"))).toHaveLength(1);
    expect(result.current.sparklines.get(item().run_id)?.kind).toBe("series");
  });

  it("never polls a legacy row's recorded RUNNING", async () => {
    const legacyRunning = { ...LEGACY, status: "RUNNING" as const };
    stub(() => [200, page([legacyRunning])]);
    const { result } = hook();
    await settle();
    await settle(0, () => result.current.observeVisible(LEGACY.run_id, true));
    expect(result.current.polling).toBe(false);
    await settle(RUNNING_POLL_MS * 2);
    expect(requested.filter((url) => url.includes("ids="))).toHaveLength(0);
  });
});

/* ------------------------------------------------ FG-05: P22 lookup on the chip */

const SEALED_RC = "rc_2026_08_c";
const AV_ID = item().binding!.alpha_version_id;

function sealedRow(overrides: Partial<RunLibraryItem> = {}, releaseCandidateId = SEALED_RC): RunLibraryItem {
  return item({
    rc: {
      kind: "LOCAL_SEAL",
      release_candidate_id: releaseCandidateId,
      draft_id: null,
      delivery_state: "DELIVERED",
      approval_state: "APPROVED",
      sealed_at_utc_ms: 1790245500000,
    },
    rc_availability: AVAILABLE,
    ...overrides,
  });
}

let lookupUrls: string[] = [];

function lookup(answer: (url: string) => [number, unknown]) {
  lookupUrls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      lookupUrls.push(url);
      const [status, body] = answer(url);
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    }),
  );
}

const chip = () => document.querySelector("[data-rc]") as HTMLElement;

async function settledChip(state: string): Promise<HTMLElement> {
  await waitFor(() => expect(chip().getAttribute("data-rc-publication")).toBe(state));
  return chip();
}

describe("rc chip — the P22 alpha-version publication lookup (FG-05)", () => {
  it("prints this candidate's raw Governance status and, when it differs, the effective status after it, in the effective status's ink", async () => {
    lookup(() => [200, lookupFound(lookupRecord(SEALED_RC, AV_ID, {}, { status: "APPROVED_WITH_CONDITION", effective_status: "EXPIRED" }))]);
    view([sealedRow()]);
    const found = await settledChip("CURRENT");
    /* VD-FG-05-06 (option B): an expired approval is never painted --good. */
    expect(found.textContent).toBe(`${SEALED_RC} · APPROVED_WITH_CONDITION · effective EXPIRED`);
    expect(found.style.color).toBe("var(--ink-faint)");
    expect(found.getAttribute("data-rc-tone-source")).toBe("effective");
    expect(found.getAttribute("data-rc-state")).toBe("APPROVED_WITH_CONDITION");
    expect(found.getAttribute("data-rc-approval-status")).toBe("APPROVED_WITH_CONDITION");
    expect(found.getAttribute("data-rc-effective-status")).toBe("EXPIRED");
    expect(found.getAttribute("title")).toBe(
      `${SEALED_RC} — publication delivered · candidate current · approval status approved with condition · effective status expired · as of ${new Date(LOOKUP_AS_OF).toISOString()} — open its sealed pack on Screen 11`,
    );
    expect(found.getAttribute("href")).toBe(`/research/quantbt/release-candidates/${SEALED_RC}`);
    expect(lookupUrls).toEqual([`/api/v1/research/alpha-versions/${AV_ID}/publication`]);
  });

  it("prints an APPROVED candidate whose effective status is EXPIRED as effective EXPIRED in faint ink, not the approved green", async () => {
    lookup(() => [200, lookupFound(lookupRecord(SEALED_RC, AV_ID, {}, { status: "APPROVED", effective_status: "EXPIRED" }))]);
    view([sealedRow()]);
    const found = await settledChip("CURRENT");
    expect(found.textContent).toBe(`${SEALED_RC} · APPROVED · effective EXPIRED`);
    expect(found.style.color).toBe("var(--ink-faint)");
    expect(found.style.color).not.toBe("var(--good)");
    expect(found.getAttribute("data-rc-tone-source")).toBe("effective");
    expect(found.getAttribute("data-rc-approval-status")).toBe("APPROVED");
    expect(found.getAttribute("data-rc-effective-status")).toBe("EXPIRED");
  });

  it("leaves the chip exactly as before when the effective status equals the raw status", async () => {
    lookup(() => [200, lookupFound(lookupRecord(SEALED_RC, AV_ID, {}, { status: "APPROVED", effective_status: "APPROVED" }))]);
    view([sealedRow()]);
    const found = await settledChip("CURRENT");
    expect(found.textContent).toBe(`${SEALED_RC} · APPROVED`);
    expect(found.style.color).toBe("var(--good)");
    expect(found.getAttribute("data-rc-tone-source")).toBe("raw");
    expect(found.getAttribute("data-rc-effective-status")).toBe("APPROVED");
  });

  it("leaves the chip exactly as before when the lookup publishes no effective status", async () => {
    lookup(() => [200, lookupFound(lookupRecord(SEALED_RC, AV_ID, {}, { status: "APPROVED" }))]);
    view([sealedRow()]);
    const found = await settledChip("CURRENT");
    expect(found.textContent).toBe(`${SEALED_RC} · APPROVED`);
    expect(found.style.color).toBe("var(--good)");
    expect(found.getAttribute("data-rc-tone-source")).toBe("raw");
    expect(found.getAttribute("data-rc-effective-status")).toBeNull();
  });

  it("keeps a long chip face inside the card: no wrap, clipped with an ellipsis, every fact in the title", async () => {
    lookup(() => [200, lookupFound(lookupRecord(SEALED_RC, AV_ID, {}, { status: "APPROVED_WITH_CONDITION", effective_status: "EXPIRED" }))]);
    view([sealedRow()]);
    const found = await settledChip("CURRENT");
    expect(found.style.whiteSpace).toBe("nowrap");
    expect(found.style.maxWidth).toBe("100%");
    expect(found.style.overflow).toBe("hidden");
    expect(found.style.textOverflow).toBe("ellipsis");
    expect(found.getAttribute("title")).toContain("effective status expired");
  });

  it("marks a superseded candidate from the server's candidate_relation, in faint ink", async () => {
    lookup(() => [200, lookupFound(lookupRecord(SEALED_RC, AV_ID, { candidate_relation: "SUPERSEDED" }, { status: "APPROVED" }))]);
    view([sealedRow()]);
    const found = await settledChip("SUPERSEDED");
    expect(found.textContent).toBe(`${SEALED_RC} · APPROVED · SUPERSEDED`);
    expect(found.getAttribute("data-rc-state")).toBe("SUPERSEDED");
    expect(found.style.color).toBe("var(--ink-faint)");
  });

  it("keeps the P21 face on a typed absence and carries the server's reason code, never a guessed status", async () => {
    lookup(() => [200, lookupAbsent(AV_ID)]);
    view([sealedRow()]);
    const absent = await settledChip("NOT_PUBLISHED");
    expect(absent.textContent).toBe(`${SEALED_RC} · APPROVED`);
    expect(absent.getAttribute("data-rc-publication-reason")).toBe("P22_ALPHA_VERSION_PUBLICATION_NOT_PUBLISHED");
    expect(absent.getAttribute("data-rc-approval-status")).toBeNull();
    expect(absent.getAttribute("title")).toContain("no delivered publication for this version");
    expect(absent.getAttribute("title")).not.toMatch(RAW_CODE);
  });

  it("says when the version's delivered publication is another candidate, and picks nothing", async () => {
    lookup(() => [200, lookupFound(lookupRecord("rc_2026_09_a", AV_ID))]);
    view([sealedRow()]);
    const other = await settledChip("OTHER_CANDIDATE");
    expect(other.textContent).toBe(`${SEALED_RC} · APPROVED`);
    expect(other.getAttribute("data-rc")).toBe(SEALED_RC);
    expect(other.getAttribute("title")).toContain("this version's latest delivered publication is rc_2026_09_a");
  });

  it("gives a 403 and a 404 lookup the identical title, and never renders the server's message", async () => {
    const titles: string[] = [];
    for (const status of [403, 404]) {
      lookup(() => [status, lookupProblem(status, "RESEARCH_RELEASE_CANDIDATE_FORBIDDEN")]);
      view([sealedRow()]);
      titles.push((await settledChip("denied")).getAttribute("title")!);
      expect(document.body.innerHTML).not.toContain(LOOKUP_SERVER_PROSE);
      cleanup();
      vi.unstubAllGlobals();
    }
    expect(titles[0]).toContain("publication lookup: You don't have access to this in your current workspace, or it doesn't exist.");
    expect(titles[1]).toBe(titles[0]);
  });

  it("tells a pending lookup, a 403 or 404 refusal and a 503 apart on the chip face; 403 and 404 read the same", async () => {
    const faces: Record<string, string> = {};
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    view([sealedRow()]);
    faces.pending = (await settledChip("loading")).textContent!;
    cleanup();
    vi.unstubAllGlobals();
    for (const [status, state] of [[403, "denied"], [404, "denied"], [503, "unavailable"]] as const) {
      lookup(() => [status, lookupProblem(status, "RESEARCH_RELEASE_CANDIDATE_FORBIDDEN")]);
      view([sealedRow()]);
      const face = await settledChip(state);
      faces[status] = face.textContent!;
      expect(face.getAttribute("data-rc-tone-source")).toBe("raw");
      expect(document.body.innerHTML).not.toContain(LOOKUP_SERVER_PROSE);
      cleanup();
      vi.unstubAllGlobals();
    }
    expect(faces.pending).toBe(`${SEALED_RC} · APPROVED · reading…`);
    expect(faces[403]).toBe(`${SEALED_RC} · APPROVED · publication not readable`);
    expect(faces[404]).toBe(faces[403]);
    expect(faces[503]).toBe(`${SEALED_RC} · APPROVED · publication unavailable`);
    expect(faces.pending).not.toBe(faces[403]);
    expect(faces[503]).not.toBe(faces[403]);
  });

  it("raises the shell's session signal once on a 401 lookup", async () => {
    let reports = 0;
    const stop = onSessionExpired(() => {
      reports += 1;
    });
    lookup(() => [401, lookupProblem(401, "UNAUTHENTICATED")]);
    view([sealedRow()]);
    await settledChip("session");
    stop();
    expect(reports).toBe(1);
    expect(document.body.innerHTML).not.toContain(LOOKUP_SERVER_PROSE);
  });

  it("asks once per distinct version with a sealed rc; a draft, an unsealed row or a scratch row asks nothing, and no route but /publication is used", async () => {
    lookup(() => [200, lookupAbsent(AV_ID)]);
    const draftRow = item({
      run_id: "rrun_draft",
      rc: { kind: "ACTOR_DRAFT", release_candidate_id: null, draft_id: "rcd_1", delivery_state: null, approval_state: null, sealed_at_utc_ms: null },
      rc_availability: AVAILABLE,
    });
    const rows = [sealedRow({ run_id: "rrun_a" }), sealedRow({ run_id: "rrun_b" }, "rc_2026_08_d"), draftRow, item({ run_id: "rrun_none" }), sealedRow({ run_id: "rrun_scratch", binding: null })];
    expect(rcLookupVersions(rows)).toEqual([AV_ID]);
    view(rows);
    await waitFor(() => expect(document.querySelectorAll("[data-rc-publication='NOT_PUBLISHED']")).toHaveLength(2));
    expect(lookupUrls).toEqual([`/api/v1/research/alpha-versions/${AV_ID}/publication`]);
    expect(lookupUrls.filter((url) => /mirror|reconcile|release-candidates\?/.test(url))).toEqual([]);
    expect(document.querySelector("[data-run='rrun_draft'] [data-rc]")!.getAttribute("data-rc-publication")).toBeNull();
  });
});
