/**
 * Presentation mapping for Portal domain state — U02 Shared Foundations.
 *
 * Pure functions only: no React, no fetch. They encode the rules that must
 * hold identically on every screen, so they can be unit-tested once instead of
 * being re-implemented per view:
 *
 *  - runtime badges read `availability.state`, never `maturity` (handoff §3);
 *  - a `null` value under unavailable/denied/commissioned is a STATE, never a
 *    number — it must not degrade to `0`, `-` or "N/A" (handoff §4);
 *  - the seven required component states stay distinguishable from each other
 *    (loading / empty / partial / stale / denied / unavailable / terminal).
 *
 * UI copy is Vietnamese; domain terms stay English (CLAUDE.md §3.8).
 */
import type {
  AvailabilityReasonCode,
  AvailabilityState,
  CapabilityAvailability,
  FeatureDataMode,
  FeatureMaturity,
  PortalEnvironment,
  SummaryMetric,
} from "../portal/contracts";

/* -------------------------------------------------------------------------
 * Component states
 * ---------------------------------------------------------------------- */

/**
 * The complete set every async surface must be able to express. `partial` and
 * `stale` are deliberately distinct from `unavailable`: partial means some
 * sources answered, stale means the answer is real but older than its
 * freshness contract.
 */
export type ComponentState =
  | "loading"
  | "empty"
  | "available"
  | "partial"
  | "stale"
  | "denied"
  | "unavailable"
  | "commissioned"
  | "failed-retryable"
  | "terminal";

export const COMPONENT_STATES: readonly ComponentState[] = [
  "loading",
  "empty",
  "available",
  "partial",
  "stale",
  "denied",
  "unavailable",
  "commissioned",
  "failed-retryable",
  "terminal",
] as const;

/** Visual tone. Colour is never the only channel — callers also render text. */
export type Tone = "neutral" | "good" | "warning" | "bad" | "muted" | "info";

/* -------------------------------------------------------------------------
 * Runtime availability
 * ---------------------------------------------------------------------- */

export interface StatePresentation {
  /** Short badge label, Vietnamese. */
  label: string;
  tone: Tone;
  /** CSS custom property carrying the semantic colour. */
  colorVar: string;
  bgVar: string;
  /** Non-colour channel so the state survives greyscale/print (§12.3). */
  glyph: string;
  /** Whether a numeric value may be rendered at all in this state. */
  rendersValue: boolean;
}

const AVAILABILITY_PRESENTATION: Record<AvailabilityState, StatePresentation> = {
  available: {
    label: "Sẵn sàng",
    tone: "good",
    colorVar: "var(--state-available)",
    bgVar: "var(--state-available-bg)",
    glyph: "●",
    rendersValue: true,
  },
  degraded: {
    label: "Suy giảm",
    tone: "warning",
    colorVar: "var(--state-degraded)",
    bgVar: "var(--state-degraded-bg)",
    glyph: "◐",
    rendersValue: true,
  },
  stale: {
    label: "Dữ liệu cũ",
    tone: "warning",
    colorVar: "var(--state-stale)",
    bgVar: "var(--state-stale-bg)",
    glyph: "◔",
    rendersValue: true,
  },
  unavailable: {
    label: "Không khả dụng",
    tone: "muted",
    colorVar: "var(--state-unavailable)",
    bgVar: "var(--state-unavailable-bg)",
    glyph: "○",
    rendersValue: false,
  },
  denied: {
    label: "Không có quyền",
    tone: "bad",
    colorVar: "var(--state-denied)",
    bgVar: "var(--state-denied-bg)",
    glyph: "⊘",
    rendersValue: false,
  },
  commissioned: {
    label: "Chưa triển khai",
    tone: "muted",
    colorVar: "var(--state-commissioned)",
    bgVar: "var(--state-commissioned-bg)",
    glyph: "◌",
    rendersValue: false,
  },
};

export function availabilityPresentation(state: AvailabilityState): StatePresentation {
  return AVAILABILITY_PRESENTATION[state];
}

/** Maps a capability availability onto the component-state vocabulary. */
export function componentStateFor(availability: CapabilityAvailability): ComponentState {
  switch (availability.state) {
    case "available":
      return "available";
    case "degraded":
      return "partial";
    case "stale":
      return "stale";
    case "denied":
      return "denied";
    case "commissioned":
      return "commissioned";
    case "unavailable":
      return availability.retryable ? "failed-retryable" : "unavailable";
  }
}

/* -------------------------------------------------------------------------
 * Reason codes
 * ---------------------------------------------------------------------- */

const REASON_COPY: Record<AvailabilityReasonCode, string> = {
  CAPABILITY_NOT_IMPLEMENTED: "Capability chưa được triển khai trong phase hiện tại.",
  UPSTREAM_UNAVAILABLE: "Nguồn dữ liệu upstream không phản hồi.",
  UPSTREAM_TIMEOUT: "Nguồn upstream vượt quá deadline của summary.",
  INCOMPATIBLE_CONTRACT: "Contract của nguồn không tương thích với schema hiện tại.",
  SOURCE_DATA_UNAVAILABLE: "Nguồn hoạt động nhưng chưa có dữ liệu authority.",
  LOCAL_ONLY_STATE: "Planning đang chạy local-first; state cục bộ không phải shared server state.",
  PERMISSION_DENIED: "Tài khoản hiện tại không được cấp quyền đọc nguồn này.",
  STALE_OBSERVATION: "Evidence cũ hơn freshness contract của nguồn.",
  PARTIAL_SOURCE_FAILURE: "Một phần nguồn lỗi; phần còn lại vẫn là số thật.",
};

/**
 * Human explanation for a reason code. Returns `null` when there is no code,
 * so callers render nothing rather than inventing a reason.
 */
export function reasonCopy(code: AvailabilityReasonCode | null): string | null {
  return code ? REASON_COPY[code] : null;
}

/* -------------------------------------------------------------------------
 * Registry maturity — static metadata
 * ---------------------------------------------------------------------- */

export interface MaturityPresentation {
  /** `null` means "render no badge": AVAILABLE is the unmarked default. */
  label: string | null;
  colorVar: string;
  /** Nav opacity from guide v0.4 §P0.5. */
  opacity: number;
  /** Dashed outline marks "designed, not deployed". */
  dashed: boolean;
  /** Commissioned/blocked items open a preview, never a live action. */
  interactive: boolean;
}

const MATURITY_PRESENTATION: Record<FeatureMaturity, MaturityPresentation> = {
  AVAILABLE: {
    label: null,
    colorVar: "var(--maturity-available)",
    opacity: 1,
    dashed: false,
    interactive: true,
  },
  PROTOTYPE: {
    label: "PROTOTYPE",
    colorVar: "var(--maturity-prototype)",
    opacity: 1,
    dashed: false,
    interactive: true,
  },
  COMMISSIONED: {
    label: "SOON",
    colorVar: "var(--maturity-commissioned)",
    opacity: 0.58,
    dashed: true,
    interactive: true,
  },
  BLOCKED: {
    label: "BLOCKED",
    colorVar: "var(--maturity-blocked)",
    opacity: 0.38,
    dashed: true,
    interactive: false,
  },
  HIDDEN: {
    label: null,
    colorVar: "var(--maturity-deprecated)",
    opacity: 0,
    dashed: false,
    interactive: false,
  },
  DEPRECATED: {
    label: "LEGACY",
    colorVar: "var(--maturity-deprecated)",
    opacity: 0.55,
    dashed: false,
    interactive: true,
  },
};

export function maturityPresentation(maturity: FeatureMaturity): MaturityPresentation {
  return MATURITY_PRESENTATION[maturity];
}

/** Data-mode banner copy (v0.4 §P0.24). `REAL` gets no banner. */
export function dataModeBanner(mode: FeatureDataMode): string | null {
  switch (mode) {
    case "REAL":
      return null;
    case "FIXTURE":
      return "Prototype data — không dùng cho quyết định vận hành.";
    case "STATIC_PREVIEW":
      return "Commissioned — chưa có runtime kết nối; đây là brief và wireframe.";
    case "NONE":
      return "Chưa có contract dữ liệu; xem dependency brief.";
  }
}

/* -------------------------------------------------------------------------
 * Environment
 * ---------------------------------------------------------------------- */

const ENVIRONMENT_COLOR: Record<PortalEnvironment, string> = {
  local: "var(--env-local)",
  research: "var(--env-research)",
  paper: "var(--env-paper)",
  sandbox: "var(--env-sandbox)",
  live: "var(--env-live)",
};

export function environmentColorVar(environment: PortalEnvironment): string {
  return ENVIRONMENT_COLOR[environment];
}

/* -------------------------------------------------------------------------
 * Metric rendering — the "never render 0 from null" contract
 * ---------------------------------------------------------------------- */

export type MetricRender =
  | { kind: "value"; text: string; state: AvailabilityState }
  /** No authority for a number. Callers render the badge + reason, not a digit. */
  | { kind: "state"; state: AvailabilityState; label: string; reason: string | null };

/**
 * Decides whether a summary metric may be shown as a number.
 *
 * A value is rendered only when the metric's own availability says it is real.
 * `0` therefore appears exactly when the authority reported a real zero — the
 * `summary.empty` fixture — and never as a stand-in for a missing source.
 */
export function renderMetric(
  metric: SummaryMetric | null,
  format: (value: number | string) => string = String,
): MetricRender {
  if (metric === null) {
    return {
      kind: "state",
      state: "unavailable",
      label: availabilityPresentation("unavailable").label,
      reason: "Không có metric này trong summary contract.",
    };
  }
  const state = metric.availability.state;
  const presentation = availabilityPresentation(state);
  if (!presentation.rendersValue || metric.value === null) {
    return {
      kind: "state",
      state,
      label: presentation.label,
      reason: reasonCopy(metric.availability.reason_code),
    };
  }
  return { kind: "value", text: format(metric.value), state };
}

/* -------------------------------------------------------------------------
 * Freshness
 * ---------------------------------------------------------------------- */

export interface Freshness {
  /** `null` when the source published no `as_of`. */
  asOf: string | null;
  ageSeconds: number | null;
  /** True only when the contract declares a window AND the age exceeds it. */
  isStale: boolean;
  staleAfterSeconds: number | null;
}

/**
 * Computes freshness from an availability block.
 *
 * Staleness is never guessed: without both `as_of` and `stale_after_seconds`
 * the result is "unknown age", not "fresh" (v0.5 §12.1 — the frontend does not
 * infer backend health).
 */
export function freshnessOf(
  availability: CapabilityAvailability,
  now: Date = new Date(),
): Freshness {
  const { as_of: asOf, stale_after_seconds: staleAfter } = availability;
  if (!asOf) {
    return { asOf: null, ageSeconds: null, isStale: false, staleAfterSeconds: staleAfter };
  }
  const observed = Date.parse(asOf);
  if (Number.isNaN(observed)) {
    return { asOf, ageSeconds: null, isStale: false, staleAfterSeconds: staleAfter };
  }
  const ageSeconds = Math.max(0, Math.round((now.getTime() - observed) / 1000));
  return {
    asOf,
    ageSeconds,
    isStale: staleAfter !== null && ageSeconds > staleAfter,
    staleAfterSeconds: staleAfter,
  };
}
