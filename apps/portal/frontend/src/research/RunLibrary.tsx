/**
 * Screen 01 · Run Library (P12 composition scope; RF-06 FE-S01 pass).
 *
 * Spec 01's founding rule: **the library renders evidence, it does not rank.**
 * Every certificate, claim and metric arrives from its own run's Stage 5 with
 * an availability beside it, and the screen shows exactly what was published.
 *
 * Habits, each with a rule behind it:
 *
 *  - **An unavailable fact keeps its place and states its reason** (DQ-14).
 *    A `NOT_PUBLISHED` metric is not `0`, a `LEGACY_METADATA_ONLY` row is not
 *    current engine evidence, a null certificate is `cert —`, and `rc: null`
 *    reserves no chip at all. Tooltips carry a sentence, never a raw code;
 *    the code rides on `data-reason-code` for diagnostics.
 *  - **Copy that asserts a fact appears only when the run published it**
 *    (DQ-15). The claim line prints the Stage-5 state and sentence the server
 *    sent (a NOT_ISSUED sentence included); a failed or cancelled run gets
 *    its own line; a legacy row's recorded status is never shown as live.
 *  - **The server owns comparability.** Two runs compare only when their
 *    `comparison.key` values are present and identical, wherever the rows
 *    are — a selection hidden by a filter is still looked up by id.
 *  - **Linked screens keep the server's authority.** Compare (13) and Attempt
 *    Lineage (10) open their routes; each screen still renders typed refusal
 *    or absence instead of inventing a source fact.
 *
 * Look and copy follow the hi-fi `QuantBT 01 Run Library.dc.html`, measured
 * block by block; behaviour and data follow spec 01 (DQ-02).
 */

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";

import {
  COMPARE_PICK_ONE_MORE,
  COMPARE_REFUSAL,
  RC_PHASE,
  type Availability,
  type MetricCell,
  type ReleaseCandidateRef,
  type RunLibraryItem,
  type RunLibraryResponse,
  type RunSparklineSource,
  type RunStatus,
  type StageCell,
  isAvailable,
  mayCompare,
  unavailableReason as stateSentence,
} from "./runLibraryClient";
import { compareEntryHref } from "./compareClient";
import { lineageHref } from "./lineageClient";
import { releaseCandidateHref, releaseCandidatePackHref } from "./releaseCandidateClient";
import { formatMetric, formatUtc, shortDigest, shortId } from "./researchFormat";
import { ResearchPanel } from "./ResearchPanel";
import { clearedFilters, isLiveStatus, type LibraryFilters, type SelectedRun, type SparklineRead } from "./useRunLibrary";
import type { ResearchState } from "./state";

/* --------------------------------------------------------------- verbatim */

/** Hi-fi title and subtitle (DQ-02: the hi-fi wins on copy). */
export const TITLE = "Run Library — the entry point";
export const SUBTITLE =
  "Every run wears its claim, its certification, and its evidence trail on the outside. No number without the conditions it was earned under.";

/** Spec 01 §17 and the hi-fi, verbatim — the two agree word for word. */
export const RULES_FOOTER =
  "Certification and claim strings come from each run's Stage 5 — the library renders them, it ranks nothing. Compare only unlocks for runs sharing a ComparisonContractKey (symbol · timeframe · route · protocol); two different contracts side by side would be a comparison lie, so the button refuses instead of obliging. Superseded attempts stay visible for lineage and are excluded from every approval path.";

export const CLAIM_PENDING = "claim pending — engine issues it at Stage 5, never before";
export const CLAIM_FAILED =
  "no claim — the run failed before Stage 5; failure detail lives in the run console";
/** A cancelled run's claim line — the status is published, so this may say so. */
export const CLAIM_CANCELLED = "no claim — the run was cancelled before Stage 5";
/** A NOT_ISSUED claim state published without its sentence (RF-05: the sentence normally travels with it). */
export const CLAIM_NOT_ISSUED = "claim not issued";

export const LEGACY_NOTE =
  "legacy 1.0.8 metadata — retained for lineage, not current engine evidence.";

export const EMPTY_NONE = "No runs yet.";
export const filteredEmpty = (total: number) => `0 of ${total} runs match — loosen a filter.`;

/** A legacy row's binding chip (RF-05 `binding_availability: LEGACY_METADATA_ONLY`). */
export const LEGACY_BINDING_LABEL = "no binding · legacy";

export const SCRATCH_TITLE =
  "no alpha_version binding — NOT_PUBLISHABLE, rc_ can never be composed from this run";
export const boundTitle = (alphaName: string, av: string) => `bound to ${alphaName} ${av} — publishable evidence`;

const JOURNEY_MAP = "/research/quantbt/journey";
const NEW_RUN = "/research/quantbt/runs/new";

const STAGE_KEYS: readonly StageCell["key"][] = ["S1", "S2", "S3", "S4", "S5"];

/** Status chips in the filter bar: the hi-fi three, then the two the data has. */
const STATUS_CHIPS: readonly RunStatus[] = ["COMPLETED", "RUNNING", "QUEUED", "FAILED", "CANCELLED"];

/**
 * Reader sentences for the reason codes the library publishes (FE-S01-09).
 *
 * A tooltip is for a person: the code stays on the element as
 * `data-reason-code` for diagnostics, and the words say what it means. An
 * unknown code falls back to its availability state's sentence, never to the
 * raw code.
 */
export const REASON_SENTENCES: Record<string, string> = {
  SOURCE_CLAIM_NOT_ISSUED: "Stage 5 finished without issuing a claim for this run.",
  SOURCE_DID_NOT_PUBLISH_METHODOLOGY_CERTIFICATE: "The engine did not publish a methodology certificate for this run.",
  SOURCE_DID_NOT_PUBLISH_METRIC: "The engine did not publish this metric for this run.",
  P12_DOES_NOT_READ_ARTIFACT_OR_PARQUET_SERIES:
    "No equity series is published to the library for this run; the library never derives one from run outputs.",
  P12_DOES_NOT_INFER_FINAL_METRICS_FROM_PROGRESS_OR_ARTIFACTS:
    "Final metrics are not published to the library for this run; they are never inferred from progress or run outputs.",
  P11_PROGRESS_SNAPSHOT_NOT_PUBLISHED: "This run published no progress snapshot.",
  LEGACY_1_0_8_PROTOCOL_METADATA_ONLY: "Recorded by the legacy 1.0.8 engine as protocol metadata only.",
  LEGACY_DATASET_ID_DOES_NOT_DECLARE_SYMBOL_TIMEFRAME:
    "The legacy dataset id does not declare a symbol or timeframe.",
  LEGACY_1_0_8_DOES_NOT_PUBLISH_PROGRESS: "The legacy 1.0.8 engine did not publish progress, a claim or a certificate.",
  LEGACY_1_0_8_DOES_NOT_PUBLISH_COMPARISON_COMPATIBILITY:
    "The legacy 1.0.8 engine did not publish a comparison contract key.",
  LEGACY_1_0_8_DOES_NOT_PUBLISH_SPARKLINE_SERIES: "The legacy 1.0.8 engine did not publish a sparkline series.",
  /* RF-05 (CG-P12-02…07) — the codes the library now publishes. */
  P13_IS_BOUNDARY_NOT_IN_CHILD_RECEIPT:
    "The IS/OOS boundary is not in the run's receipt, so no in-sample Sharpe was measured and no decay can be stated.",
  P13_SOURCE_PREDATES_OOS_ANALYTICS:
    "This run was sealed before OOS analytics were published, so the engine's OOS figures were never recorded for it.",
  P13_SOURCE_EVIDENCE_NOT_PUBLISHED: "This run published no sealed evidence.",
  P13_EVIDENCE_READER_DISABLED: "The evidence reader is switched off on this deployment, so no run figures are read.",
  P13_OOS_ANALYTICS_METRIC_INCOMPATIBLE:
    "The run's OOS analytics block did not match the published shape, so the figure is withheld rather than guessed.",
  P13_ENGINE_LOCATOR_MISMATCH:
    "The engine field this figure is read from did not match its declared locator, so it is withheld rather than guessed.",
  P13_OOS_RETURN_ZERO_VARIANCE: "OOS returns have zero variance; a ratio would be a placeholder, not a measurement.",
  P13_OOS_SPAN_BELOW_ONE_DAY: "The OOS span is shorter than one day, so no annualised figure is defined.",
  P13_RECEIPT_BYTE_BUDGET_EXHAUSTED: "The run's receipt reached its size budget before this figure was recorded.",
  P13_ENGINE_RESULT_NOT_AVAILABLE_TO_ANALYTICS:
    "The engine result was not available to the analytics step, so nothing was read from it.",
  P13_EQUITY_OOS_SERIES_NOT_PUBLISHED: "This run published no OOS equity series.",
  CANCELLED_BEFORE_SOURCE: "The run was cancelled before its source published anything, so there is nothing to report.",
  SOURCE_CLAIM_NOT_PUBLISHED: "The source has not published a claim for this run.",
  SOURCE_CLAIM_TEXT_EMPTY: "The source published a claim state without a sentence.",
  SOURCE_METHODOLOGY_CERTIFICATE_NOT_ISSUED: "Stage 5 did not issue a methodology certificate for this run.",
  SOURCE_FAILURE_REASON_NOT_PUBLISHED: "The run failed without publishing a failure reason.",
  P21_NO_PERSISTED_RELEASE_CANDIDATE: "No release candidate has been composed from this run.",
  P21_RELEASE_CANDIDATE_READER_DISABLED: "The release-candidate reader is switched off on this deployment.",
  P21_RELEASE_CANDIDATE_REF_INCOMPATIBLE: "The stored release-candidate relation did not match the published shape.",
  LEGACY_1_0_8_NON_TERMINAL_STATUS_NOT_MONITORED:
    "The retired 1.0.8 engine recorded this status and stopped; nothing monitors it, so it is not live work.",
  LEGACY_1_0_8_RECORDS_PROTOCOL_NOT_OPTIMIZATION_MODE:
    "The legacy 1.0.8 engine recorded a protocol, not an optimization mode.",
  LEGACY_1_0_8_DOES_NOT_PUBLISH_ALPHA_BINDING:
    "The legacy 1.0.8 engine recorded no alpha binding for this run — neither bound nor scratch.",
  LEGACY_1_0_8_HAS_NO_RELEASE_CANDIDATE_RELATION: "A legacy 1.0.8 run has no release-candidate relation.",
  LEGACY_1_0_8_STRATEGY_METADATA_ONLY: "Recorded by the legacy 1.0.8 engine as strategy metadata only.",
  LEGACY_1_0_8_DOES_NOT_PUBLISH_EXACT_OOS_METRICS: "The legacy 1.0.8 engine did not publish exact OOS figures.",
};

/** The sentence for a withheld fact: its code's own, else its state's. */
export function reasonSentence(availability: Availability): string {
  const code = availability.reason_code;
  if (code && code in REASON_SENTENCES) return REASON_SENTENCES[code];
  /* Two code families name the stat they withhold in their suffix. */
  if (code?.startsWith("P13_METRIC_REGISTRY_DOES_NOT_DEFINE_")) {
    return "The metric registry this run was sealed under does not define this figure.";
  }
  if (code?.startsWith("P13_PROJECTION_DOES_NOT_PUBLISH_")) {
    return "The run's evidence projection does not publish this figure.";
  }
  return stateSentence(availability);
}

/* ---------------------------------------------------------------- styling */

const MONO = "var(--font-mono)";

const STAGE_TONE: Record<StageCell["state"], { border: string; background: string; ink: string }> = {
  done: { border: "var(--accent)", background: "var(--accent-soft)", ink: "var(--accent)" },
  cap: { border: "var(--accent-2)", background: "var(--accent-2-soft)", ink: "var(--accent-2)" },
  blocked: { border: "var(--bad)", background: "var(--bad-bg)", ink: "var(--bad)" },
  run: { border: "var(--accent)", background: "var(--accent-soft)", ink: "var(--accent)" },
  pend: { border: "var(--line)", background: "var(--paper-sunken)", ink: "var(--ink-faint)" },
};

const CERT_TONE: Record<string, string> = {
  A: "var(--good)",
  B: "var(--accent-2)",
  C: "var(--lifecycle-degraded)",
  D: "var(--bad)",
};

const STATUS_TONE: Partial<Record<RunStatus, { background: string; ink: string }>> = {
  COMPLETED: { background: "var(--good-bg)", ink: "var(--good)" },
  FAILED: { background: "var(--bad-bg)", ink: "var(--bad)" },
  RUNNING: { background: "var(--accent-soft)", ink: "var(--accent)" },
  RECOVERY_REQUIRED: { background: "var(--warn-bg)", ink: "var(--warn)" },
};

/** Hi-fi chip grammar (spec 01 §2.3): off / on / on-warn. */
function chipStyle(on: boolean, warn = false, radius = "999px"): CSSProperties {
  const tone = on ? (warn ? "var(--accent-2)" : "var(--accent)") : null;
  return {
    border: `1px solid ${tone ?? "var(--line)"}`,
    background: on ? (warn ? "var(--accent-2-soft)" : "var(--accent-soft)") : "var(--paper-raised)",
    color: tone ?? "var(--ink-soft)",
    padding: "2px 9px",
    fontFamily: MONO,
    fontSize: 10,
    borderRadius: radius,
  };
}

const DATA_CHIP: CSSProperties = {
  fontFamily: MONO,
  fontSize: 10,
  border: "1px solid var(--line)",
  borderRadius: 999,
  background: "var(--paper)",
  padding: "1px 8px",
  color: "var(--ink-soft)",
};

const LABEL_9: CSSProperties = {
  fontSize: 9,
  textTransform: "uppercase",
  letterSpacing: ".07em",
  color: "var(--ink-faint)",
};

const CARD: CSSProperties = {
  border: "1px solid var(--line)",
  borderRadius: 8,
  background: "var(--paper-raised)",
  boxShadow: "var(--shadow-e1)",
  padding: "12px 16px",
};

function Divider() {
  return <span aria-hidden="true" style={{ width: 1, height: 18, background: "var(--line)" }} />;
}

function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        fontSize: 10,
        textTransform: "uppercase",
        letterSpacing: ".07em",
        fontWeight: 500,
        color: "var(--ink-faint)",
      }}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ parts */

/**
 * A fact the server withheld. Never `0`, `—` or a plausible default.
 *
 * Each withheld state gets its own words. They are not synonyms: a row whose
 * alpha binding was never recorded by the 1.0.8 engine is a different fact
 * from one the current engine has not published yet, and a claim waiting on a
 * source callback is a third. `what` names the field, because a header that
 * withholds two facts otherwise reads as the same phrase twice.
 */
const WITHHELD_WORDS: Record<Availability["state"], string> = {
  /* AVAILABLE with a null value breaks the contract (HiFi audit 01-2, E-BE); the screen shows what it has: nothing. */
  AVAILABLE: "not published",
  NOT_PUBLISHED: "not published",
  LEGACY_METADATA_ONLY: "legacy metadata",
  PENDING_SOURCE_CALLBACK: "pending source",
};

function Withheld({ availability, what }: { availability: Availability; what?: string }) {
  return (
    <span
      className="mono text-[10px] italic"
      style={{ color: "var(--ink-faint)" }}
      data-withheld={availability.state}
      data-reason-code={availability.reason_code ?? undefined}
      title={reasonSentence(availability)}
    >
      {what ? `${what} — ` : ""}
      {WITHHELD_WORDS[availability.state]}
    </span>
  );
}

/**
 * The recorded-status face of a legacy row (RF-05 CG-P12-07).
 *
 * The 1.0.8 engine's last word is shown as what it is — a record — and a
 * non-terminal one says nothing watches it: "recorded QUEUED · not monitored".
 */
export function recordedStatusLabel(item: RunLibraryItem): string {
  const notMonitored =
    item.status_basis.availability.reason_code === "LEGACY_1_0_8_NON_TERMINAL_STATUS_NOT_MONITORED";
  return `recorded ${item.status}${notMonitored ? " · not monitored" : ""}`;
}

function StatusPill({ item }: { item: RunLibraryItem }) {
  const status = item.status;
  if (!isLiveStatus(item)) {
    /* No tone, no pulse, no live region: a record is not a lifecycle. */
    return (
      <span
        className="inline-flex items-center"
        data-status={status}
        data-status-basis={item.status_basis.kind}
        data-reason-code={item.status_basis.availability.reason_code ?? undefined}
        title={reasonSentence(item.status_basis.availability)}
        style={{
          borderRadius: 999,
          padding: "0 7px",
          fontFamily: MONO,
          fontSize: 10,
          fontWeight: 600,
          border: "1px dashed var(--line-strong)",
          background: "var(--paper-sunken)",
          color: "var(--ink-faint)",
        }}
      >
        {recordedStatusLabel(item)}
      </span>
    );
  }
  const tone = STATUS_TONE[status] ?? { background: "var(--paper-sunken)", ink: "var(--ink-soft)" };
  const running = status === "RUNNING";
  /* The hi-fi pulses the whole RUNNING pill (rl-pulse, 2 s, 1 → .35); only
     a running run beats, so a still pill is itself a fact. The shared
     `data-motion` rule stops it for a reader who asked for no motion. */
  return (
    <span
      className="inline-flex items-center"
      data-status={status}
      data-status-basis={item.status_basis.kind}
      role={running ? "status" : undefined}
      data-motion={running ? "pulse" : undefined}
      style={{
        borderRadius: 999,
        padding: "1px 8px",
        fontFamily: MONO,
        fontSize: 10,
        fontWeight: 600,
        background: tone.background,
        color: tone.ink,
        ...(running ? ({ "--rs-motion-duration": "2s" } as CSSProperties) : {}),
      }}
    >
      {status}
    </span>
  );
}

/**
 * The evidence trail.
 *
 * Each cell's tooltip is the source's own sentence, and its provenance is
 * explicit: `SOURCE_VERBATIM` may be shown as written, while
 * `DERIVED_FROM_PERSISTED_STATE` is labelled as derived so it cannot be read
 * as a methodology narrative the source never told.
 */
function EvidenceTrail({ stages }: { stages: readonly StageCell[] }) {
  const byKey = new Map(stages.map((stage) => [stage.key, stage]));
  return (
    <span className="flex flex-none flex-col" style={{ gap: 3 }} data-trail>
      <span style={LABEL_9}>evidence trail</span>
      <span className="flex" style={{ gap: 3 }}>
        {STAGE_KEYS.map((key) => {
          const stage = byKey.get(key);
          const tone = stage ? STAGE_TONE[stage.state] : STAGE_TONE.pend;
          const provenance = stage?.tooltip_source ?? "NOT_PUBLISHED";
          const title =
            provenance === "SOURCE_VERBATIM" && stage?.tip
              ? stage.tip
              : provenance === "DERIVED_FROM_PERSISTED_STATE" && stage?.tip
                ? `derived from persisted state — ${stage.tip}`
                : "no stage narrative was published";
          return (
            <span
              key={key}
              role="img"
              aria-label={`${key}: ${title}`}
              data-stage-cell={key}
              data-stage-state={stage?.state ?? "pend"}
              data-tooltip-source={provenance}
              title={title}
              className="inline-flex items-center justify-center"
              data-motion={stage?.state === "run" ? "pulse" : undefined}
              style={{
                width: 34,
                height: 20,
                borderRadius: 3,
                border: `1px solid ${tone.border}`,
                background: tone.background,
                color: tone.ink,
                fontFamily: MONO,
                fontSize: 9,
                fontWeight: 700,
                /* hi-fi: the running cell beats at 1.6 s */
                ...(stage?.state === "run" ? ({ "--rs-motion-duration": "1.6s" } as CSSProperties) : {}),
              }}
            >
              {key}
            </span>
          );
        })}
      </span>
    </span>
  );
}

/** Hi-fi sparkline captions, by the series the server says it is. */
const SPARK_LABEL: Record<string, string> = {
  oos_equity: "stitched OOS equity",
  search_progress: "equity — building",
  failed: "equity — none",
};

/** The hi-fi draws 24 columns in a 150 × 26 box. */
const SPARK_COLUMNS = 24;

/** Spec 01 §4.3: the placeholder reads, when hovered, that no series is shown. */
export const SPARKLINE_UNAVAILABLE = "sparkline unavailable";

const SPARK_BOX: CSSProperties = { gap: 1, height: 26, width: 150 };

/** The hi-fi's column range: 12 % to 96 % of the box. */
const SPARK_FLOOR = 12;
const SPARK_CEIL = 96;

/**
 * Column heights for display values, as percentages of the box.
 *
 * Min–max over the values shown, into the hi-fi's 12–96 % band. Scaling by the
 * peak alone (the earlier rule) drew an equity curve that moves 0.7 % around
 * 20,000 as 24 identical columns. A flat series stays a flat row at mid
 * height. Values that do not parse are not drawn as zero; they have no
 * column height and the caller refuses the series.
 */
export function sparkHeights(values: readonly string[]): number[] | null {
  const numbers = values.map((value) => Number(value));
  if (numbers.some((value) => !Number.isFinite(value)) || numbers.length === 0) return null;
  const low = Math.min(...numbers);
  const high = Math.max(...numbers);
  if (high === low) return numbers.map(() => (SPARK_FLOOR + SPARK_CEIL) / 2);
  return numbers.map((value) => SPARK_FLOOR + ((value - low) / (high - low)) * (SPARK_CEIL - SPARK_FLOOR));
}

/** Sampling methods in words: a title is for a person, the code rides on `data-*`. */
const SAMPLING_WORDS: Record<string, string> = {
  FULL: "every point",
  EXTREMA_BUCKET_V1: "extrema-preserving buckets",
  EXTREMA_BUCKET_24_V1: "24 extrema-preserving buckets (first, last, minimum and maximum kept)",
};

function samplingWords(code: string | null): string {
  return code === null ? "sampling not published" : (SAMPLING_WORDS[code] ?? "a reduction the library does not describe");
}

/**
 * The envelope caption under the bars (CLAUDE.md §8 invariant: a downsample
 * says so). `n of m pts` — the columns drawn, of the source's observations
 * (or of the persisted points when the source count is not published) — and
 * whether extrema were kept.
 */
export function sparkCaption(shown: number, source: RunSparklineSource | null): string {
  if (source === null) return `${shown} pts · source not published`;
  const of = source.source_observation_count ?? source.persisted_point_count;
  const reduced =
    source.display_sampling !== "FULL" || source.source_sampling !== null || of > shown;
  return `${shown} of ${of} pts · ${reduced ? "extrema kept" : "full"}`;
}

/** The full provenance, for the title. */
export function sparkProvenance(
  shown: number,
  source: RunSparklineSource | null,
  cardRevision: string | null,
): string {
  if (source === null) return `OOS equity · ${shown} points · provenance not published`;
  const span = [formatUtc(source.first_at_utc_ms), formatUtc(source.last_at_utc_ms)].filter(Boolean).join(" → ");
  const parts = [
    "OOS equity",
    source.source_observation_count !== null
      ? `${source.source_observation_count} source observations, reduced by ${samplingWords(source.source_sampling)}`
      : `source observation count not published (${samplingWords(source.source_sampling)})`,
    `${source.persisted_point_count} persisted points`,
    `${shown} drawn by ${samplingWords(source.display_sampling)}`,
    span,
    `projection ${shortDigest(source.projection_revision.replace(/^p13r\d+_/, ""), 8)} · digest ${shortDigest(source.series_digest, 8)}`,
  ];
  if (cardRevision !== null && cardRevision !== source.projection_revision) {
    parts.push("this series is from a different projection revision than the card's stats");
  }
  return parts.filter(Boolean).join(" · ");
}

/**
 * The lazy sparkline.
 *
 * The placeholder is the resting state, not a loading artefact: a series the
 * server has not published never becomes a line, and no artifact or Parquet
 * path is ever fetched to produce one. It is drawn as the same 24 columns in
 * the paper's quiet grey (spec 01 §4.3), all one height, so it cannot be read
 * as a shape.
 *
 * A published series (RF-05 `GET /runs/{id}/sparkline`) is drawn as the
 * hi-fi's columns with its envelope caption underneath — how many points of
 * how many, and how they were reduced.
 */
function Sparkline({
  item,
  read,
  onVisible,
}: {
  item: RunLibraryItem;
  read: SparklineRead | undefined;
  onVisible: (runId: string, visible: boolean) => void;
}) {
  const box = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const node = box.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      onVisible(item.run_id, true);
      return () => onVisible(item.run_id, false);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) onVisible(item.run_id, entry.isIntersecting);
      },
      { rootMargin: "80px" },
    );
    observer.observe(node);
    /* Disconnecting also un-marks the card: a scrolled-away RUNNING row must
       drop out of the poll, not keep costing a request. */
    return () => {
      observer.disconnect();
      onVisible(item.run_id, false);
    };
  }, [item.run_id, onVisible]);

  const label = item.sparkline.kind ? SPARK_LABEL[item.sparkline.kind] ?? "equity" : "equity";
  const listed = isAvailable(item.sparkline.availability);
  const series = listed && read?.kind === "series" ? read : null;
  const shown = series ? series.values.slice(-SPARK_COLUMNS) : [];
  const heights = series ? sparkHeights(shown) : null;
  /* Hi-fi column ink by what the run is: a finished series in the OOS
     accent, a series still being searched in the train tint, a failed one
     in the quiet line colour. */
  const ink =
    item.sparkline.kind === "failed" || item.status === "FAILED"
      ? "var(--line-strong)"
      : item.sparkline.kind === "search_progress" || item.status === "RUNNING"
        ? "var(--viz-train)"
        : "var(--role-oos)";

  const placeholderTitle = !listed
    ? `${SPARKLINE_UNAVAILABLE} — ${reasonSentence(item.sparkline.availability)}`
    : read?.kind === "failed"
      ? `${SPARKLINE_UNAVAILABLE} — the series read failed; it is not retried automatically.`
      : read?.kind === "withheld"
        ? `${SPARKLINE_UNAVAILABLE} — ${reasonSentence(read.availability)}`
        : read?.kind === "series"
          ? `${SPARKLINE_UNAVAILABLE} — the published values are not numbers, so no column is drawn.`
          : `${SPARKLINE_UNAVAILABLE} until the card scrolls into view`;
  const placeholderReason = !listed
    ? item.sparkline.availability.reason_code
    : read?.kind === "withheld"
      ? read.availability.reason_code
      : null;

  const caption: CSSProperties = {
    fontFamily: MONO,
    fontSize: 8.5,
    lineHeight: "11px",
    height: 11,
    maxWidth: 150,
    overflow: "hidden",
    textOverflow: "ellipsis",
    color: "var(--ink-faint)",
    whiteSpace: "nowrap",
  };

  return (
    <span className="flex flex-none flex-col" style={{ gap: 3 }} data-sparkline={item.run_id} ref={box}>
      <span style={LABEL_9}>{label}</span>
      {series && heights ? (
        <>
          <span
            className="flex items-end"
            style={SPARK_BOX}
            data-sparkline-values={shown.length}
            data-sparkline-revision={series.revision ?? undefined}
            role="img"
            aria-label={`OOS equity, ${sparkCaption(shown.length, series.source)}`}
            title={sparkProvenance(shown.length, series.source, item.evidence_revision)}
          >
            {heights.map((height, index) => (
              <span
                key={index}
                aria-hidden="true"
                className="flex-1 rounded-[1px]"
                style={{ height: `${height.toFixed(0)}%`, background: ink, opacity: 0.75 }}
              />
            ))}
          </span>
          <span
            style={caption}
            data-sparkline-caption
            data-display-sampling={series.source?.display_sampling ?? undefined}
          >
            {sparkCaption(shown.length, series.source)}
          </span>
        </>
      ) : (
        <>
          <span
            className="flex items-end"
            style={SPARK_BOX}
            data-sparkline-placeholder={listed ? (read?.kind ?? "pending") : item.sparkline.availability.state}
            data-reason-code={placeholderReason ?? undefined}
            title={placeholderTitle}
            role="img"
            aria-label={SPARKLINE_UNAVAILABLE}
          >
            {Array.from({ length: SPARK_COLUMNS }, (_, index) => (
              <span
                key={index}
                aria-hidden="true"
                className="flex-1 rounded-[1px]"
                style={{ height: "50%", background: "var(--line-soft)" }}
              />
            ))}
          </span>
          {/* A published series that has not been read yet keeps its caption's
              line, so the card does not grow when the bars arrive. */}
          {listed ? <span aria-hidden="true" style={caption} /> : null}
        </>
      )}
    </span>
  );
}

/**
 * A stat value for its slot (DQ-08, hi-fi figures).
 *
 * The hi-fi shows ratios at two places (`1.19`, `0.23`) and counts whole
 * (`214`); the server's exact string stays in `title`. Anything else — a
 * progress phrase, a duration the server already wrote — is shown as sent.
 */
const TWO_DP = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function statDisplay(metric: Pick<MetricCell, "role" | "value">): string | null {
  if (metric.value === null) return null;
  const parsed = Number(metric.value);
  switch (metric.role) {
    case "OOS_SHARPE":
    case "DECAY":
      return Number.isFinite(parsed) && metric.value.trim() !== "" ? TWO_DP.format(parsed) : metric.value;
    case "TRADE_COUNT":
      return formatMetric(metric.value, "count") ?? metric.value;
    default:
      /* E1: a timestamp cell (e.g. FAILED AT) never prints ISO with milliseconds. */
      return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(metric.value) ? (formatUtc(metric.value) ?? metric.value) : metric.value;
  }
}

/**
 * What a stat's number was measured over (RF-05 `MetricCell.scope`).
 *
 * `trades` is counted over the run's whole child tape, not the OOS window: a
 * number that sits beside "OOS sharpe" under a bare "trades" reads as an OOS
 * count. The scope is written right after the number whenever the label does
 * not already say it — beside the value rather than in the 9 px label, so the
 * hi-fi label stays and the stats keep one line beside the claim at 1280.
 */
export const SCOPE_LABEL: Record<NonNullable<MetricCell["scope"]>, string | null> = {
  OOS: null,
  IS_PLUS_OOS: "IS + OOS",
  CHILD_TAPE: "child tape",
};
export const SCOPE_SENTENCE: Record<NonNullable<MetricCell["scope"]>, string> = {
  OOS: "measured on the out-of-sample window",
  IS_PLUS_OOS: "measured over in-sample and out-of-sample together, not OOS only",
  CHILD_TAPE: "counted over the run's whole child tape, not the OOS window only",
};

/** The scope words written after a value, or null when the label already says it. */
export function scopeSuffix(metric: Pick<MetricCell, "scope">): string | null {
  return metric.scope ? SCOPE_LABEL[metric.scope] : null;
}

/**
 * The short face of a withheld stat (DQ-14 shell, CLAUDE.md §3.3).
 *
 * A bare dash in a number slot reads as a value; the slot says in two or
 * three words why it is empty, and the full sentence rides in `title`.
 */
const WITHHELD_FACE: Record<string, string> = {
  P13_IS_BOUNDARY_NOT_IN_CHILD_RECEIPT: "not measured",
  P13_SOURCE_PREDATES_OOS_ANALYTICS: "not recorded",
  CANCELLED_BEFORE_SOURCE: "not reported",
};

export function withheldFace(availability: Availability): string {
  const code = availability.reason_code;
  if (code && code in WITHHELD_FACE) return WITHHELD_FACE[code];
  return WITHHELD_WORDS[availability.state];
}

function Stats({ stats }: { stats: readonly MetricCell[] }) {
  return (
    /* Grows like the hi-fi's `flex:1` but never shrinks below its three
       cells: a long claim line wraps under them instead of folding the
       stats into two rows. */
    <span className="flex flex-wrap" style={{ gap: 18, flex: "1 0 auto" }} data-stats>
      {stats.map((metric) => {
        const shown = isAvailable(metric.availability) ? statDisplay(metric) : null;
        const scope = metric.scope ? SCOPE_SENTENCE[metric.scope] : null;
        const suffix = scopeSuffix(metric);
        const valueTitle = [metric.value !== null && metric.value !== shown ? metric.value : null, scope]
          .filter(Boolean)
          .join(" — ");
        return (
          <span
            key={metric.key}
            className="flex flex-col"
            style={{ gap: 1 }}
            data-metric={metric.role}
            data-scope={metric.scope ?? undefined}
            data-definition={metric.definition_id ?? undefined}
          >
            <span style={LABEL_9}>{metric.label}</span>
            {shown !== null ? (
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 13,
                  fontWeight: 600,
                  color:
                    metric.tone === "BAD" ? "var(--bad)" : metric.tone === "ACCENT" ? "var(--accent)" : "var(--ink)",
                }}
                title={valueTitle || undefined}
              >
                {shown}
                {suffix ? (
                  <>
                    {" "}
                    <span
                      data-scope-suffix
                      style={{ fontSize: 8.5, fontWeight: 400, letterSpacing: ".04em", color: "var(--ink-faint)" }}
                    >
                      {suffix}
                    </span>
                  </>
                ) : null}
              </span>
            ) : (
              /* A withheld value keeps its slot, never a zero or a bare dash:
                 two words say why, the sentence is in title, the code stays
                 for diagnostics. */
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 10,
                  fontStyle: "italic",
                  lineHeight: "17px",
                  color: "var(--ink-faint)",
                  whiteSpace: "nowrap",
                }}
                data-withheld={metric.availability.state}
                data-reason-code={metric.availability.reason_code ?? undefined}
                title={reasonSentence(metric.availability)}
              >
                {withheldFace(metric.availability)}
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

/**
 * The claim's state as the line's first words (RF-05 CG-P12-09).
 *
 * The hi-fi's claim line opens with its kind in capitals ("STRICT_OUTER_OOS —
 * …"). The library now carries the Stage-5 state beside the sentence, so the
 * line opens with it: a NOT_ISSUED sentence is still the source's sentence,
 * and must not read as an issued claim.
 */
export const CLAIM_STATE_WORDS: Record<NonNullable<RunLibraryItem["claim"]["state"]>, string> = {
  ISSUED: "ISSUED",
  NOT_ISSUED: "NOT ISSUED",
  FORECAST: "FORECAST",
};

/** The claim line: the server's state and sentence, or the one fact the row published about its absence. */
function ClaimQuote({ item }: { item: RunLibraryItem }) {
  const legacy = item.source_kind === "LEGACY_1_0_8_METADATA";
  const availability = item.claim.availability;
  const state = item.claim.state;
  let body: ReactNode;
  let kind: string;
  if (isAvailable(availability) && item.claim.text !== null) {
    body = (
      <>
        {state ? <span data-claim-state={state}>{CLAIM_STATE_WORDS[state]} — </span> : null}
        {item.claim.text}
      </>
    );
    kind = state === "NOT_ISSUED" ? "not-issued" : state === "FORECAST" ? "forecast" : "issued";
  } else if (!legacy && isLiveStatus(item) && (item.status === "RUNNING" || item.status === "QUEUED")) {
    body = CLAIM_PENDING;
    kind = "pending";
  } else if (item.status === "FAILED" && !legacy) {
    body = CLAIM_FAILED;
    kind = "failed";
  } else if ((item.status === "CANCELLED" && !legacy) || availability.reason_code === "CANCELLED_BEFORE_SOURCE") {
    body = CLAIM_CANCELLED;
    kind = "cancelled";
  } else if (state === "NOT_ISSUED") {
    /* The state is published but its sentence is not: say the state, give
       the reason in title. */
    body = (
      <span data-claim-state={state} title={reasonSentence(availability)}>
        {CLAIM_NOT_ISSUED}
      </span>
    );
    kind = "not-issued";
  } else {
    body = <Withheld availability={availability} what="claim" />;
    kind = "withheld";
  }
  return (
    <blockquote
      data-claim={item.run_id}
      data-claim-kind={kind}
      data-reason-code={availability.reason_code ?? undefined}
      style={{
        fontFamily: MONO,
        fontSize: 9.5,
        /* Hi-fi: every claim line is the gold quote — issued, pending, failed
           alike; only a withheld shell is quiet. */
        color: kind === "withheld" ? "var(--ink-soft)" : "var(--accent-2)",
        borderLeft: "2px solid var(--accent-2)",
        paddingLeft: 6,
        maxWidth: 300,
        lineHeight: 1.45,
      }}
    >
      {/* Never truncated: a claim that is cut is a claim that is changed. */}
      {body}
    </blockquote>
  );
}

/** The mode chip's title: the facts the display joins, protocol kept apart (CG-P12-04). */
export function modeTitle(mode: RunLibraryItem["mode"]): string | undefined {
  const parts = [
    mode.key ? `optimization mode ${mode.key}` : null,
    mode.schedule ? `schedule ${mode.schedule}` : null,
    mode.protocol ? `protocol ${mode.protocol}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/** Hi-fi rc chip ink by approval state (`rcColors`), in tokens. */
const RC_TONE: Record<string, string> = {
  DRAFT: "var(--accent-2)",
  APPROVED: "var(--good)",
  PENDING: "var(--accent-2)",
  REJECTED: "var(--bad)",
  NOT_APPROVED: "var(--ink-faint)",
  UNKNOWN: "var(--ink-faint)",
};

/** Hi-fi `rc_` ids are short; a longer sealed id keeps 14 characters and its title. */
const RC_ID_CHARS = 14;

/**
 * The rc chip's face, tone and title (spec 01 §2.5 #7, §17; RF-05 CG-P12-06).
 *
 * The relation is the persisted P21 one and nothing else: a local seal reads
 * `rc_… · {approval state}`, the viewer's own draft `rc_ (draft) · DRAFT`.
 */
export function rcChipFace(rc: ReleaseCandidateRef): { text: string; state: string; title: string; fullId: string | null } {
  if (rc.kind === "ACTOR_DRAFT") {
    return {
      text: "rc_ (draft) · DRAFT",
      state: "DRAFT",
      title: "release candidate being composed from this run — open Screen 11 to continue the draft",
      fullId: rc.draft_id,
    };
  }
  const id = rc.release_candidate_id;
  const shortId = id === null ? "rc_" : id.length > RC_ID_CHARS ? `${id.slice(0, RC_ID_CHARS)}…` : id;
  const state = rc.approval_state ?? "UNKNOWN";
  return {
    text: `${shortId} · ${rc.approval_state ?? "approval not published"}`,
    state,
    title: `${id ?? "sealed release candidate"} — sealed rc from this run's params · ${state.toLowerCase().replace("_", " ")} — open its sealed pack on Screen 11`,
    fullId: id,
  };
}

function RcChip({ rc, runId }: { rc: ReleaseCandidateRef; runId: string }) {
  const face = rcChipFace(rc);
  const tone = RC_TONE[face.state] ?? "var(--ink-faint)";
  /* Hi-fi: an <a> to Screen 11 (P21). A sealed pack opens its own read-only
     route (the one Screen 11 links to); the viewer's draft opens the composer. */
  return (
    <Link
      to={rc.kind === "LOCAL_SEAL" && rc.release_candidate_id ? releaseCandidatePackHref(rc.release_candidate_id) : releaseCandidateHref(runId)}
      data-rc={face.fullId ?? rc.kind}
      data-rc-kind={rc.kind}
      data-rc-state={face.state}
      data-phase={RC_PHASE}
      title={face.title}
      style={{
        fontFamily: MONO,
        fontSize: 9.5,
        fontWeight: 700,
        border: `1px solid ${tone}`,
        color: tone,
        borderRadius: 999,
        padding: "1px 8px",
        background: "var(--paper-raised)",
        whiteSpace: "nowrap",
        textDecoration: "none",
      }}
    >
      {face.text}
    </Link>
  );
}

/** Where a card's one link goes, by what the row is (spec 01 §15.4). */
function openTarget(item: RunLibraryItem): { to: string; label: string; title?: string } {
  const id = encodeURIComponent(item.run_id);
  if (item.source_kind === "LEGACY_1_0_8_METADATA") {
    return {
      to: `/research/quantbt/runs/${id}/overview`,
      label: "open legacy run →",
      title: "A legacy 1.0.8 row opens in the legacy run workspace; it has no Evidence Flow.",
    };
  }
  if (item.status === "RUNNING" || item.status === "QUEUED") {
    return { to: `/research/quantbt/runs/${id}/progress`, label: "watch progress →" };
  }
  if (item.status === "CANCELLED") {
    return {
      to: `/research/quantbt/runs/${id}/progress`,
      label: "open progress →",
      title: "A cancelled run sealed no evidence; its record and attempts are on Run Progress.",
    };
  }
  return { to: `/research/quantbt/runs/${id}/evidence`, label: "open evidence →" };
}

/**
 * The run id: always the whole id, never a shortened one.
 *
 * Real ids are 37 characters; at full width they pushed the date and link to
 * a second header row (card 131 px against the hi-fi's 101). The id now takes
 * the room the row has and ellipsises the rest; `title` carries the full id
 * and a click copies it, so nothing is lost to the cut.
 */
function RunId({ runId }: { runId: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1200);
    return () => window.clearTimeout(timer);
  }, [copied]);
  const copy = () => {
    const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
    if (!clipboard) return;
    void clipboard.writeText(runId).then(
      () => setCopied(true),
      () => undefined,
    );
  };
  return (
    <button
      type="button"
      data-run-id={runId}
      data-copied={copied || undefined}
      onClick={copy}
      title={copied ? `${runId} — copied` : `${runId} — click to copy`}
      aria-label={`run ${runId}, copy id`}
      className="truncate text-left"
      style={{
        flex: "1 1 96px",
        minWidth: 72,
        maxWidth: "max-content",
        border: 0,
        padding: 0,
        background: "transparent",
        color: "var(--ink)",
        fontFamily: MONO,
        fontSize: 13,
        fontWeight: 700,
        cursor: "copy",
      }}
    >
      {shortId(runId)}
    </button>
  );
}

function CompareCheck({ runId, selected, onToggle }: { runId: string; selected: boolean; onToggle: () => void }) {
  /* 15 px box inside a 24 px target (spec 01 §8 hit-target rule). */
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      aria-label={`select ${runId} for compare`}
      title="select for compare"
      data-compare-check={runId}
      onClick={onToggle}
      className="inline-flex flex-none items-center justify-center"
      style={{ width: 24, height: 24, margin: "-4.5px", padding: 0, border: 0, background: "transparent", alignSelf: "center" }}
    >
      <span
        aria-hidden="true"
        className="inline-flex items-center justify-center"
        style={{
          width: 15,
          height: 15,
          border: `1px solid ${selected ? "var(--accent-2)" : "var(--line-strong)"}`,
          borderRadius: 3,
          background: selected ? "var(--accent-2-soft)" : "var(--paper-raised)",
          color: "var(--accent-2)",
          fontSize: 10,
          lineHeight: 1,
        }}
      >
        {selected ? "×" : ""}
      </span>
    </button>
  );
}

function RunCard({
  item,
  selected,
  onToggle,
  sparkline,
  onVisible,
}: {
  item: RunLibraryItem;
  selected: boolean;
  onToggle: (runId: string) => void;
  sparkline: SparklineRead | undefined;
  onVisible: (runId: string, visible: boolean) => void;
}) {
  const legacy = item.source_kind === "LEGACY_1_0_8_METADATA";
  const open = openTarget(item);
  const cert = isAvailable(item.certificate.availability) ? item.certificate.grade : null;

  return (
    <article
      data-run={item.run_id}
      data-source-kind={item.source_kind}
      data-row-kind={item.row_kind}
      data-evidence-revision={item.evidence_revision ?? undefined}
      data-selected={selected}
      style={{
        ...CARD,
        ...(selected ? { outline: "2px solid var(--accent-2)", outlineOffset: 1 } : {}),
      }}
    >
      <header
        className="flex flex-wrap items-baseline"
        style={{ gap: 10, paddingBottom: 8, borderBottom: "1px solid var(--line-soft)" }}
      >
        <CompareCheck runId={item.run_id} selected={selected} onToggle={() => onToggle(item.run_id)} />
        <RunId runId={item.run_id} />
        <StatusPill item={item} />

        {item.mode.display !== null && (isAvailable(item.mode.availability) || item.mode.availability.state === "LEGACY_METADATA_ONLY") ? (
          /* FE-S01-14: a legacy row's mode is still the server's value; it is
             shown, marked as legacy metadata, rather than replaced by a word. */
          <span
            data-mode={item.mode.key ?? ""}
            data-mode-state={item.mode.availability.state}
            data-reason-code={item.mode.availability.reason_code ?? undefined}
            title={isAvailable(item.mode.availability) ? modeTitle(item.mode) : reasonSentence(item.mode.availability)}
            style={
              isAvailable(item.mode.availability)
                ? DATA_CHIP
                : { ...DATA_CHIP, borderStyle: "dashed", borderColor: "var(--line-strong)" }
            }
          >
            {item.mode.display}
            {isAvailable(item.mode.availability) ? "" : " · legacy"}
          </span>
        ) : (
          <Withheld availability={item.mode.availability} what="mode" />
        )}

        {item.binding ? (
          <span
            data-binding={item.binding.alpha_version_id}
            title={boundTitle(item.binding.alpha_name, item.binding.av)}
            style={DATA_CHIP}
          >
            {item.binding.alpha_name} · {item.binding.av}
          </span>
        ) : item.binding_availability.state === "LEGACY_METADATA_ONLY" || legacy ? (
          /* RF-05 CG-P12-07: the server says the binding is legacy metadata —
             neither bound nor scratch, so neither chip's look. */
          <span
            data-binding="legacy"
            data-reason-code={item.binding_availability.reason_code ?? undefined}
            title={reasonSentence(item.binding_availability)}
            style={{ ...DATA_CHIP, borderStyle: "dashed", borderColor: "var(--line-strong)", color: "var(--ink-faint)" }}
          >
            {LEGACY_BINDING_LABEL}
          </span>
        ) : isAvailable(item.binding_availability) ? (
          <span
            data-binding="scratch"
            title={SCRATCH_TITLE}
            style={{
              ...DATA_CHIP,
              border: "1px dashed var(--accent-2)",
              background: "var(--paper)",
              color: "var(--accent-2)",
            }}
          >
            scratch
          </span>
        ) : (
          <Withheld availability={item.binding_availability} what="binding" />
        )}

        {isAvailable(item.instrument.availability) && item.instrument.display !== null ? (
          <span style={{ fontFamily: MONO, fontSize: 10, color: "var(--ink-faint)" }} data-instrument>
            {item.instrument.display}
          </span>
        ) : (
          <Withheld availability={item.instrument.availability} what="instrument" />
        )}

        {/* Spec 01 §4.4: a null rc reserves no chip and no space. */}
        {item.rc !== null ? <RcChip rc={item.rc} runId={item.run_id} /> : null}

        <span
          data-certificate={cert ?? "none"}
          data-reason-code={cert ? undefined : (item.certificate.availability.reason_code ?? undefined)}
          title={cert ? `methodology certificate ${cert}` : reasonSentence(item.certificate.availability)}
          style={{
            fontFamily: MONO,
            fontSize: 10,
            fontWeight: 700,
            border: `1.5px solid ${cert ? CERT_TONE[cert] : "var(--line-strong)"}`,
            color: cert ? CERT_TONE[cert] : "var(--ink-faint)",
            borderRadius: 3,
            padding: "0 7px",
          }}
        >
          cert {cert ?? "—"}
        </span>

        {/* Date and link travel together: when the head wraps, the link stays
            beside its date at the right edge instead of starting a lone row. */}
        <span className="ml-auto inline-flex items-baseline whitespace-nowrap" style={{ gap: 10 }}>
          <span
            style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--ink-faint)" }}
            data-created
            title={new Date(item.created_at_utc_ms).toISOString()}
          >
            {new Date(item.created_at_utc_ms).toISOString().slice(0, 16).replace("T", " ")}Z
          </span>
          <Link
            to={open.to}
            title={open.title}
            className="text-[color:var(--accent)]"
            style={{ fontFamily: MONO, fontSize: 10, textTransform: "uppercase", letterSpacing: ".05em" }}
            data-open={item.run_id}
            {...(open.label === "open evidence →" ? { "data-open-evidence": item.run_id } : {})}
          >
            {open.label}
          </Link>
        </span>
      </header>

      {legacy ? (
        <p className="text-[10.5px]" style={{ color: "var(--accent-2)", paddingTop: 6 }} data-legacy-note>
          {LEGACY_NOTE}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center" style={{ gap: 18, paddingTop: 8 }}>
        <EvidenceTrail stages={item.stages} />
        <Sparkline item={item} read={sparkline} onVisible={onVisible} />
        <Stats stats={item.stats} />
        <ClaimQuote item={item} />
      </div>

      {item.superseded_note !== null ? (
        <div
          className="flex items-baseline"
          style={{
            marginTop: 8,
            borderTop: "1px dashed var(--line)",
            paddingTop: 6,
            gap: 10,
            fontFamily: MONO,
            fontSize: 10,
            color: "var(--ink-faint)",
            opacity: 0.7,
          }}
          data-superseded
        >
          <span
            style={{
              textTransform: "uppercase",
              letterSpacing: ".06em",
              border: "1px solid var(--line-strong)",
              borderRadius: 3,
              padding: "0 5px",
            }}
          >
            superseded
          </span>
          <span>{item.superseded_note}</span>
        </div>
      ) : null}
    </article>
  );
}

/** Spec 01 §7: five static skeleton cards in the card's own frame, no shimmer. */
function SkeletonCards() {
  const block = (width: number | string, height: number): CSSProperties => ({
    display: "block",
    width,
    height,
    borderRadius: 3,
    background: "var(--line-soft)",
  });
  return (
    <div role="status" aria-label="Loading runs" className="flex flex-col" style={{ gap: 14 }} data-skeleton>
      {[0, 1, 2, 3, 4].map((index) => (
        <div key={index} aria-hidden="true" style={CARD}>
          <div className="flex items-center" style={{ gap: 10, paddingBottom: 8, borderBottom: "1px solid var(--line-soft)" }}>
            <span style={block(15, 15)} />
            <span style={block(220, 14)} />
            <span style={block(70, 14)} />
            <span style={block(180, 14)} />
            <span style={{ ...block(120, 12), marginLeft: "auto" }} />
          </div>
          <div className="flex items-center" style={{ gap: 18, paddingTop: 8 }}>
            <span style={block(182, 34)} />
            <span style={block(150, 34)} />
            <span style={block(240, 34)} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------- compare */

type CompareMode = "pending" | "reading" | "ready" | "refused";

function CompareBar({ selection, onClear }: { selection: readonly SelectedRun[]; onClear: () => void }) {
  if (selection.length === 0) return null;
  const both = selection.length === 2;
  const reading = both && selection.some((run) => run.item === null && run.pending);
  const sameContract = both && mayCompare(selection[0].item ?? undefined, selection[1].item ?? undefined);
  const alphaA = selection[0]?.item?.binding?.alpha_id ?? null;
  const sharedAlpha =
    alphaA !== null && alphaA === (selection[1]?.item?.binding?.alpha_id ?? null) ? alphaA : null;
  const comparable = sameContract && sharedAlpha !== null;
  const mode: CompareMode = !both ? "pending" : reading ? "reading" : comparable ? "ready" : "refused";
  const unknown = both && !reading && selection.some((run) => run.item === null);

  const note =
    mode === "pending"
      ? COMPARE_PICK_ONE_MORE
      : mode === "reading"
        ? "reading the selected run hidden by the filter, to learn its ComparisonContractKey…"
        : mode === "ready"
          ? "same Alpha and ComparisonContractKey — open Compare to inspect them."
          : unknown
            ? "one selected run could not be read, so its ComparisonContractKey is unknown — the button refuses."
            : sameContract
              ? "Compare reads one Alpha at a time; these runs are not bound to the same Alpha."
              : COMPARE_REFUSAL;

  const border =
    mode === "ready" ? "var(--accent)" : mode === "refused" ? "var(--bad)" : mode === "pending" ? "var(--accent-2)" : "var(--line)";

  return (
    <div
      role="region"
      aria-label="compare selection"
      className="flex flex-wrap items-center"
      data-compare-bar={mode}
      style={{
        position: "sticky",
        bottom: 14,
        zIndex: 5,
        gap: 14,
        border: `1px solid ${border}`,
        borderRadius: 8,
        background: "var(--paper-raised)",
        boxShadow: "var(--shadow-e3)",
        padding: "10px 16px",
        color: mode === "refused" ? "var(--bad)" : "var(--ink-soft)",
      }}
    >
      <span
        className="flex-none"
        style={{ fontFamily: MONO, fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 700 }}
      >
        compare · {selection.length} selected
      </span>
      <span className="flex min-w-[200px] flex-1 flex-col" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
        <span data-compare-note {...(mode === "refused" && !unknown ? { "data-compare-refusal": true } : {})}>
          {note}
        </span>
        {/* The hi-fi bar is one line. The ids join it only when a selected
            run is off screen (spec 01 §12.5) — otherwise its card is right
            there, outlined. */}
        {selection.some((run) => run.hidden) ? (
          <span className="flex flex-wrap" style={{ gap: "0 10px", fontFamily: MONO, fontSize: 10, color: "var(--ink-faint)" }}>
            {selection.map((run) => (
              <span key={run.runId} data-compare-selected={run.runId} data-hidden={run.hidden}>
                {shortId(run.runId)}
                {run.hidden ? " (hidden by filter)" : ""}
              </span>
            ))}
          </span>
        ) : null}
      </span>
      {mode === "ready" ? (
        <Link
          to={compareEntryHref(selection.map((run) => run.runId), sharedAlpha)}
          data-action="open-compare"
          className="mono rounded-[6px] border px-[14px] py-[5px] text-[10px] uppercase tracking-[.05em]"
          style={{ borderColor: "var(--accent)", background: "var(--accent-soft)", color: "var(--accent)" }}
        >
          open compare →
        </Link>
      ) : (
        <button
          type="button"
          disabled
          data-action="open-compare"
          title={note}
          className="mono rounded-[6px] border border-dashed px-[14px] py-[5px] text-[10px] uppercase tracking-[.05em]"
          style={{ borderColor: "var(--line-strong)", background: "var(--paper-sunken)", color: "var(--ink-faint)", cursor: "not-allowed" }}
        >
          compare
        </button>
      )}
      <button
        type="button"
        data-action="clear"
        onClick={onClear}
        style={{
          border: 0,
          background: "transparent",
          fontFamily: MONO,
          fontSize: 10,
          color: "var(--ink-soft)",
          textDecoration: "underline",
          minHeight: 24,
        }}
      >
        clear
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------- ledger */

type ClaimLedgerCounts = RunLibraryResponse["claim_ledger"];

/**
 * The six claim buckets, in reading order, with their hi-fi ink (RF-05
 * CG-P12-05). The hi-fi strip draws completed in ink at .85, running in the
 * accent with the 2 s pulse, failed in red; the library's buckets map onto
 * that: an issued claim is the ink, a not-issued one its quieter step, a
 * pending source the pulsing accent, a cancelled or legacy row the line.
 */
export const LEDGER_BUCKETS: readonly {
  key: keyof ClaimLedgerCounts;
  word: string;
  ink: string;
  opacity?: number;
  pulse?: boolean;
  dashed?: boolean;
  title: string;
}[] = [
  { key: "issued", word: "issued", ink: "var(--ink)", opacity: 0.85, title: "Stage 5 issued a claim" },
  { key: "not_issued", word: "not issued", ink: "var(--ink-faint)", title: "Stage 5 finished and issued no claim" },
  {
    key: "pending_source",
    word: "pending",
    ink: "var(--accent)",
    pulse: true,
    title: "a live run still waiting for its source claim",
  },
  { key: "failed", word: "failed", ink: "var(--bad)", title: "the run failed before Stage 5" },
  {
    key: "cancelled_before_source",
    word: "cancelled",
    ink: "var(--line-strong)",
    title: "cancelled before its source published a claim",
  },
  {
    key: "legacy_metadata_only",
    word: "legacy",
    ink: "var(--line-strong)",
    dashed: true,
    title: "legacy 1.0.8 rows — metadata only, no claim was ever published",
  },
];

/** Hi-fi: 14 px per run; the strip stops growing at 168 px and goes proportional. */
const LEDGER_PX_PER_RUN = 14;
const LEDGER_MAX_PX = 168;

/**
 * The caption: the rows the six buckets partition, then each bucket that has
 * any. `issued` is always said — zero issued claims is the ledger's headline
 * fact, not an empty bucket.
 */
export function ledgerCaption(ledger: ClaimLedgerCounts, rows: number): string {
  const parts = LEDGER_BUCKETS.filter((bucket) => bucket.key === "issued" || ledger[bucket.key] > 0).map(
    (bucket) => `${ledger[bucket.key]} ${bucket.word}`,
  );
  return [`${rows} ${rows === 1 ? "run" : "runs"}`, ...parts].join(" · ");
}

function ClaimLedger({ ledger, rows }: { ledger: ClaimLedgerCounts; rows: number }) {
  const total = LEDGER_BUCKETS.reduce((sum, bucket) => sum + ledger[bucket.key], 0);
  const width = Math.min(total * LEDGER_PX_PER_RUN, LEDGER_MAX_PX);
  return (
    <span className="ml-auto flex flex-wrap items-center" style={{ gap: 8 }} data-claim-ledger>
      {/* Spec 01 §2.3 item 10: the ledger is a bar as well as a caption.
          Each segment is sized by its own count; a bucket with no rows takes
          no width rather than a sliver. */}
      <span className="flex items-center overflow-hidden" style={{ gap: 2, height: 10, borderRadius: 5 }} data-ledger-bar>
        {LEDGER_BUCKETS.map((bucket) => {
          const count = ledger[bucket.key];
          if (count === 0 || total === 0) return null;
          return (
            <span
              key={bucket.key}
              data-ledger-segment={bucket.key}
              data-count={count}
              title={`${count} · ${bucket.title}`}
              data-motion={bucket.pulse ? "pulse" : undefined}
              style={{
                display: "inline-block",
                boxSizing: "border-box",
                height: 10,
                borderRadius: 2,
                width: Math.max(4, (count / total) * width),
                ...(bucket.dashed
                  ? { border: `1px dashed ${bucket.ink}`, background: "transparent" }
                  : { background: bucket.ink, opacity: bucket.opacity ?? 1 }),
                ...(bucket.pulse ? ({ "--rs-motion-duration": "2s" } as CSSProperties) : {}),
              }}
            />
          );
        })}
      </span>
      <span style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--ink-faint)" }} data-ledger-caption>
        {ledgerCaption(ledger, rows)}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------- grouping */

interface RunGroup {
  key: string;
  /** Hi-fi order: bound alphas by name, then av; scratch after them all. */
  order: readonly [rank: string, alphaName: string, av: string];
  title: string;
  sub: string;
  rows: readonly RunLibraryItem[];
  /** The bound alpha, when the group has one: its header links to Screen 10. */
  alphaId?: string;
}

/**
 * Groups the loaded page by alpha binding (spec 01 §2.4).
 *
 * Only the page in hand is grouped: with keyset paging the next page may
 * carry more rows of the same alpha. Ordering inside a group is the order the
 * server sent, so grouping never becomes a re-rank. A legacy 1.0.8 row with
 * no recorded binding is its own group — it is not scratch (FE-S01-14).
 */
export function groupRuns(items: readonly RunLibraryItem[]): RunGroup[] {
  const groups = new Map<string, RunGroup>();
  for (const item of items) {
    const bound = item.binding;
    /* The server's typed fact, not the row kind (RF-05 CG-P12-07). */
    const legacy =
      bound === null &&
      (item.binding_availability.state === "LEGACY_METADATA_ONLY" || item.source_kind === "LEGACY_1_0_8_METADATA");
    const scratch = bound === null && !legacy && isAvailable(item.binding_availability);
    const key = bound ? `a:${bound.alpha_id}:${bound.av}` : scratch ? "zz:scratch" : legacy ? "zzz:legacy" : "zz:withheld";
    const strategy =
      isAvailable(item.strategy_id.availability) && item.strategy_id.value !== null
        ? item.strategy_id.value
        : null;

    const existing = groups.get(key);
    if (existing) {
      (existing.rows as RunLibraryItem[]).push(item);
      continue;
    }
    groups.set(key, {
      key,
      ...(bound ? { alphaId: bound.alpha_id } : {}),
      order: bound ? ["a", bound.alpha_name, bound.av] : [key, "", ""],
      title: bound
        ? `${bound.alpha_name} · ${bound.av}`
        : scratch
          ? "scratch — unbound"
          : legacy
            ? "legacy 1.0.8 — binding not recorded"
            : "binding not published",
      sub: bound
        ? strategy === null
          ? "runs below share one immutable code artifact"
          : `strategy ${strategy} · runs below share one immutable code artifact`
        : scratch
          ? "iterate freely · NOT_PUBLISHABLE"
          : legacy
            ? "retained for lineage · not current engine evidence"
            : `${WITHHELD_WORDS[item.binding_availability.state]} — these rows name no alpha version, so they share nothing that could be called one`,
      rows: [item],
    });
  }
  /* Scratch and unbound rows sort last: they can never support an approval,
     so they do not belong above the rows that can. */
  const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return [...groups.values()].sort(
    (left, right) =>
      byText(left.order[0], right.order[0]) ||
      left.order[1].localeCompare(right.order[1]) ||
      left.order[2].localeCompare(right.order[2]),
  );
}

/* ------------------------------------------------------------ the filter */

/** Spec 01 §6: the text filter is written to the URL 150 ms after the last key. */
export const FILTER_DEBOUNCE_MS = 150;

function useDebouncedQuery(filters: LibraryFilters, onFilters: (next: LibraryFilters) => void) {
  const [draft, setDraft] = useState(filters.q);
  const sent = useRef(filters.q);
  const latest = useRef({ filters, onFilters });
  latest.current = { filters, onFilters };

  /* The URL moved on its own (back, forward, "clear filters"): follow it. */
  useEffect(() => {
    if (filters.q !== sent.current) {
      sent.current = filters.q;
      setDraft(filters.q);
    }
  }, [filters.q]);

  useEffect(() => {
    if (draft === sent.current) return;
    const timer = window.setTimeout(() => {
      sent.current = draft;
      latest.current.onFilters({ ...latest.current.filters, q: draft });
    }, FILTER_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [draft]);

  return [draft, setDraft] as const;
}

/* ----------------------------------------------------------------- screen */

export interface RunLibraryProps {
  filters: LibraryFilters;
  onFilters: (next: LibraryFilters) => void;
  onToggleSel: (runId: string) => void;
  response: RunLibraryResponse | null;
  items: readonly RunLibraryItem[];
  state: ResearchState;
  sparklines: ReadonlyMap<string, SparklineRead>;
  onVisible: (runId: string, visible: boolean) => void;
  onLoadNext: () => void;
  onLoadPrevious: () => void;
  /** Resolved selection, including rows a filter hides. Derived from `items` when absent. */
  selection?: readonly SelectedRun[];
  onRetry?: () => void;
  onFirstPage?: () => void;
}

export function RunLibrary(props: RunLibraryProps) {
  const {
    filters,
    onFilters,
    onToggleSel,
    response,
    items,
    state,
    sparklines,
    onVisible,
    onLoadNext,
    onLoadPrevious,
    onRetry,
    onFirstPage,
  } = props;

  const selection: readonly SelectedRun[] =
    props.selection ??
    filters.sel.map((runId) => {
      const item = items.find((row) => row.run_id === runId) ?? null;
      return { runId, item, hidden: item === null, pending: false };
    });

  const [draft, setDraft] = useDebouncedQuery(filters, onFilters);
  const catalog = response?.filter_catalog;

  function toggleIn<T extends string>(list: readonly T[], value: T): T[] {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  }

  /*
   * Chips = the catalog ∪ what the URL asks for (FE-S01-06). An Atlas deep
   * link to a mode no run uses yet still shows its chip pressed, so the
   * reader sees why the list is empty and can un-press it.
   */
  const modeChips = [
    ...(catalog?.modes ?? []).map((mode) => ({ key: mode.key, display: mode.display, catalogued: true })),
    ...filters.mode
      .filter((key) => !(catalog?.modes ?? []).some((mode) => mode.key === key))
      .map((key) => ({ key, display: key, catalogued: false })),
  ];
  const alphaChips = [
    ...(catalog?.alphas ?? []).map((alpha) => ({ key: alpha.alpha_id, display: alpha.alpha_name, catalogued: true })),
    ...filters.alpha
      .filter((key) => key !== "scratch" && !(catalog?.alphas ?? []).some((alpha) => alpha.alpha_id === key))
      .map((key) => ({ key, display: key, catalogued: false })),
  ];
  const showScratch = Boolean(catalog?.scratch_available) || filters.alpha.includes("scratch");
  const anyFilter = filters.q !== "" || filters.status.length > 0 || filters.mode.length > 0 || filters.alpha.length > 0;
  const clearAll = () => onFilters(clearedFilters(filters));

  const ledger = response?.claim_ledger;

  const loading = state.state === "loading";
  const listVisible =
    response !== null && (state.state === "available" || state.state === "empty" || state.retainsContent);
  const paged = Boolean(response?.page.has_more || response?.page.has_previous);

  const counter = response
    ? items.length === response.page.filtered_rows
      ? `${response.page.filtered_rows} of ${response.page.total_rows} runs`
      : `${items.length} shown · ${response.page.filtered_rows} of ${response.page.total_rows} runs match`
    : null;

  const retry = onRetry ? (
    <button
      type="button"
      className="btn-ghost mono text-[10px] uppercase"
      data-action="retry"
      onClick={onRetry}
      style={{ minHeight: 24 }}
    >
      retry
    </button>
  ) : undefined;

  const cursorExpired = (filters.cursor || filters.before) && state.state === "terminal";

  return (
    <div
      data-screen="run-library"
      className="mx-auto flex w-full min-w-0 max-w-[1280px] flex-col"
      style={{ background: "var(--paper)", color: "var(--ink)", gap: 14, padding: "18px 26px 72px", fontSize: 13 }}
    >
      <header
        className="flex flex-wrap items-end justify-between"
        style={{ gap: "10px 16px", borderBottom: "1px solid var(--line)", paddingBottom: 10 }}
      >
        <div className="flex flex-col" style={{ gap: 3 }}>
          <nav aria-label="Breadcrumb" className="flex items-center" style={{ gap: 6, fontSize: 12, color: "var(--ink-soft)" }}>
            <span>QuantBT Research</span>
            <span aria-hidden="true" style={{ color: "var(--ink-faint)" }}>
              /
            </span>
            <span aria-current="page" style={{ color: "var(--ink)" }}>
              Runs
            </span>
          </nav>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 300, letterSpacing: "-.01em", lineHeight: 1 }}>
            {TITLE}
          </h1>
          <p style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 13.5, color: "var(--ink-faint)" }}>
            {SUBTITLE}
          </p>
        </div>
        <span className="flex flex-none flex-wrap items-center" style={{ gap: 8 }}>
          <span
            data-lineage-hint
            style={{ fontFamily: MONO, fontSize: 10, color: "var(--ink-faint)" }}
          >
            lineage ↗ select an alpha group below
          </span>
          <Link
            to={JOURNEY_MAP}
            data-link="journey-map"
            className="text-[color:var(--accent)]"
            style={{ fontFamily: MONO, fontSize: 10 }}
          >
            journey map ↗
          </Link>
          <Link
            to={NEW_RUN}
            data-new-run
            style={{
              display: "inline-block",
              border: "1px solid var(--accent)",
              borderRadius: 6,
              background: "var(--accent)",
              color: "var(--accent-contrast)",
              padding: "6px 16px",
              fontFamily: MONO,
              fontSize: 11,
              letterSpacing: ".05em",
              textTransform: "uppercase",
              textDecoration: "none",
            }}
          >
            + new run · preflight first
          </Link>
        </span>
      </header>

      <div
        className="flex flex-wrap items-center"
        style={{
          border: "1px solid var(--line)",
          borderRadius: 6,
          background: "var(--paper-raised)",
          boxShadow: "var(--shadow-e1)",
          padding: "9px 14px",
          gap: 8,
        }}
        data-filter-bar
        role="search"
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="filter by run id, alpha, symbol…"
          aria-label="Filter runs"
          style={{
            border: "1px solid var(--line)",
            borderRadius: 6,
            background: "var(--paper)",
            padding: "4px 10px",
            fontFamily: MONO,
            fontSize: 11,
            color: "var(--ink)",
            width: 230,
            maxWidth: "100%",
          }}
        />

        <Divider />
        <GroupLabel>status</GroupLabel>
        {STATUS_CHIPS.map((status) => {
          const on = filters.status.includes(status);
          return (
            <button
              key={status}
              type="button"
              data-filter-status={status}
              data-selected={on}
              aria-pressed={on}
              onClick={() => onFilters({ ...filters, status: toggleIn(filters.status, status) })}
              style={chipStyle(on)}
            >
              {status.toLowerCase()}
            </button>
          );
        })}

        <Divider />
        <GroupLabel>mode</GroupLabel>
        {modeChips.map((mode) => {
          const on = filters.mode.includes(mode.key);
          return (
            <button
              key={mode.key}
              type="button"
              data-filter-mode={mode.key}
              data-selected={on}
              data-uncatalogued={mode.catalogued ? undefined : true}
              aria-pressed={on}
              title={mode.catalogued ? undefined : "No run in this workspace uses this mode yet."}
              onClick={() => onFilters({ ...filters, mode: toggleIn(filters.mode, mode.key) })}
              style={{ ...chipStyle(on), ...(mode.catalogued ? {} : { borderStyle: "dashed" }) }}
            >
              {mode.display}
            </button>
          );
        })}

        <Divider />
        <GroupLabel>alpha</GroupLabel>
        {alphaChips.map((alpha) => {
          const on = filters.alpha.includes(alpha.key);
          return (
            <button
              key={alpha.key}
              type="button"
              data-filter-alpha={alpha.key}
              data-selected={on}
              data-uncatalogued={alpha.catalogued ? undefined : true}
              aria-pressed={on}
              title={alpha.catalogued ? undefined : "No run in this workspace is bound to this alpha yet."}
              onClick={() => onFilters({ ...filters, alpha: toggleIn(filters.alpha, alpha.key) })}
              style={{ ...chipStyle(on), ...(alpha.catalogued ? {} : { borderStyle: "dashed" }) }}
            >
              {alpha.display}
            </button>
          );
        })}
        {showScratch ? (
          <button
            type="button"
            data-filter-alpha="scratch"
            data-selected={filters.alpha.includes("scratch")}
            aria-pressed={filters.alpha.includes("scratch")}
            title="runs with no alpha_version binding — NOT_PUBLISHABLE"
            onClick={() => onFilters({ ...filters, alpha: toggleIn(filters.alpha, "scratch") })}
            style={chipStyle(filters.alpha.includes("scratch"), true)}
          >
            scratch only
          </button>
        ) : null}

        <button
          type="button"
          data-filter-group
          data-selected={filters.group}
          aria-pressed={filters.group}
          title="group runs by alpha · version"
          onClick={() => onFilters({ ...filters, group: !filters.group })}
          style={chipStyle(filters.group, false, "6px")}
        >
          group by alpha
        </button>

        {counter ? (
          <span
            style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--ink-faint)" }}
            data-counter
            title={paged ? "Runs are read 50 at a time, newest first; the count is of the whole match." : undefined}
          >
            {counter}
          </span>
        ) : null}

        {ledger && response ? <ClaimLedger ledger={ledger} rows={response.page.filtered_rows} /> : null}
      </div>

      {loading ? (
        <SkeletonCards />
      ) : listVisible && items.length === 0 && state.state !== "stale" ? (
        <div style={{ ...CARD, padding: "18px 16px" }} className="flex flex-wrap items-center" data-empty>
          <span className="flex-1" style={{ fontSize: 12.5, color: "var(--ink-soft)" }} data-empty-copy>
            {response && response.page.total_rows === 0 && !anyFilter
              ? EMPTY_NONE
              : filteredEmpty(response?.page.total_rows ?? 0)}
          </span>
          {response && response.page.total_rows === 0 && !anyFilter ? (
            <Link to={NEW_RUN} className="btn-ghost mono text-[10px] uppercase">
              new run →
            </Link>
          ) : anyFilter ? (
            <button type="button" className="btn-ghost mono text-[10px] uppercase" data-action="clear-filters" onClick={clearAll}>
              clear filters
            </button>
          ) : null}
        </div>
      ) : listVisible ? (
        <ResearchPanel title="runs" variant="plain" state={state} recovery={retry}>
          <div className="flex flex-col" style={{ gap: 14 }} data-runs>
            {(filters.group ? groupRuns(items) : [{ key: "all", title: "", sub: "", rows: items, alphaId: undefined }]).map((group) => (
              <div key={group.key} className="flex flex-col" style={{ gap: 14 }}>
                {filters.group ? (
                  <div className="flex flex-wrap items-baseline" style={{ gap: 10, padding: "6px 2px 0" }} data-group={group.key}>
                    <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700 }}>{group.title}</span>
                    <span style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--ink-faint)" }}>{group.sub}</span>
                    {paged ? (
                      <span style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--ink-faint)" }} data-group-count>
                        {group.rows.length} of this page
                      </span>
                    ) : null}
                    {group.alphaId ? (
                      <Link
                        to={lineageHref(group.alphaId)}
                        className="mono text-[9.5px]"
                        style={{ color: "var(--accent)" }}
                        data-action="open-lineage"
                        data-lineage-alpha={group.alphaId}
                      >
                        lineage →
                      </Link>
                    ) : null}
                    <span className="flex-1" style={{ borderBottom: "1px solid var(--line)" }} />
                  </div>
                ) : null}
                {group.rows.map((item) => (
                  <RunCard
                    key={item.run_id}
                    item={item}
                    selected={filters.sel.includes(item.run_id)}
                    onToggle={onToggleSel}
                    sparkline={sparklines.get(item.run_id)}
                    onVisible={onVisible}
                  />
                ))}
              </div>
            ))}
          </div>
        </ResearchPanel>
      ) : (
        /* Spec 01 §7: an error card mid-page with its code (in details) and
           `retry`; the filter bar above stays. */
        <ResearchPanel title="run library" state={state} recovery={retry} minBodyHeight={72}>
          {null}
        </ResearchPanel>
      )}

      {cursorExpired && onFirstPage ? (
        <div className="flex gap-2">
          <button type="button" className="btn-ghost mono text-[10px] uppercase" data-action="first-page" onClick={onFirstPage}>
            back to the newest page
          </button>
        </div>
      ) : null}

      {listVisible && paged ? (
        <div className="flex gap-2" data-paging>
          <button
            type="button"
            className="btn-ghost mono text-[10px]"
            data-action="previous"
            onClick={onLoadPrevious}
            disabled={!response?.page.has_previous}
            title={response?.page.has_previous ? undefined : "This is the first page."}
            style={response?.page.has_previous ? undefined : { opacity: 0.4, cursor: "not-allowed" }}
          >
            ← newer
          </button>
          <button
            type="button"
            className="btn-ghost mono text-[10px]"
            data-action="next"
            onClick={onLoadNext}
            disabled={!response?.page.has_more}
            title={response?.page.has_more ? undefined : "This is the last page."}
            style={response?.page.has_more ? undefined : { opacity: 0.4, cursor: "not-allowed" }}
          >
            older →
          </button>
        </div>
      ) : null}

      <CompareBar selection={selection} onClear={() => onFilters({ ...filters, sel: [] })} />

      <footer className="flex flex-col" style={{ gap: 3, borderTop: "1px solid var(--line)", paddingTop: 8 }}>
        <span style={{ fontSize: 9.5, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink-faint)" }}>
          rules of this screen
        </span>
        <p style={{ fontSize: 11, color: "var(--ink-soft)", lineHeight: 1.6 }} data-rules-footer>
          {RULES_FOOTER}
        </p>
      </footer>
    </div>
  );
}
