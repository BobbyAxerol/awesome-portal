/**
 * Semantic components — U02 Shared Foundations.
 *
 * Each of these is promoted into the shared layer because it encodes DOMAIN
 * semantics that must not be re-decided per screen (v0.5 §11.2 condition 2):
 * runtime availability, registry maturity, environment, freshness, and the
 * "a missing number is a state, not a zero" rule. None of them is a wrapper
 * around padding or a border.
 *
 * Presentation logic lives in `lib/portalState.ts` and is unit-tested there;
 * these components only render it.
 */
import type { ReactNode } from "react";

import type {
  AvailabilityState,
  CapabilityAvailability,
  FeatureMaturity,
  PortalEnvironment,
  SummaryMetric,
} from "../portal/contracts";
import {
  availabilityPresentation,
  environmentColorVar,
  freshnessOf,
  maturityPresentation,
  reasonCopy,
  renderMetric,
} from "../lib/portalState";
import { fmtTimestamp } from "../lib/format";

/* -------------------------------------------------------------------------
 * AvailabilityBadge — runtime health
 * ---------------------------------------------------------------------- */

/**
 * Runtime state badge. Always driven by `availability.state`, never by
 * registry maturity (FRONTEND_HANDOFF §3).
 */
export function AvailabilityBadge({
  state,
  reasonCode = null,
  detail = null,
  compact = false,
}: {
  state: AvailabilityState;
  reasonCode?: CapabilityAvailability["reason_code"];
  detail?: string | null;
  compact?: boolean;
}) {
  const presentation = availabilityPresentation(state);
  const reason = detail ?? reasonCopy(reasonCode ?? null);
  return (
    <span
      className="badge-state"
      style={{ color: presentation.colorVar, background: presentation.bgVar }}
      data-availability={state}
      title={reason ?? undefined}
    >
      <span aria-hidden="true">{presentation.glyph}</span>
      {compact ? null : presentation.label}
      <span className="sr-only">{`State: ${presentation.label}${reason ? `. ${reason}` : ""}`}</span>
    </span>
  );
}

/* -------------------------------------------------------------------------
 * MaturityBadge — static registry metadata
 * ---------------------------------------------------------------------- */

/**
 * Registry maturity badge. Renders nothing for `AVAILABLE`, which is the
 * unmarked default (v0.4 §P0.5) — an always-on green badge would add noise
 * without adding information.
 */
export function MaturityBadge({ maturity }: { maturity: FeatureMaturity }) {
  const presentation = maturityPresentation(maturity);
  if (presentation.label === null) return null;
  return (
    <span
      className={`badge-maturity${presentation.dashed ? " badge-maturity-dashed" : ""}`}
      style={{ color: presentation.colorVar, borderColor: presentation.colorVar }}
      data-maturity={maturity}
    >
      {presentation.label}
    </span>
  );
}

/* -------------------------------------------------------------------------
 * EnvironmentBadge
 * ---------------------------------------------------------------------- */

/** Topbar environment marker. `live` is deliberately the loudest tone. */
export function EnvironmentBadge({ environment }: { environment: PortalEnvironment }) {
  return (
    <span
      className="badge-env"
      style={{ color: environmentColorVar(environment), borderColor: environmentColorVar(environment) }}
      data-environment={environment}
    >
      {environment.toUpperCase()}
    </span>
  );
}

/* -------------------------------------------------------------------------
 * FreshnessIndicator
 * ---------------------------------------------------------------------- */

/**
 * Relative age plus an absolute tooltip (v0.5 §13). When the source published
 * no `as_of`, this says so instead of implying the data is current.
 */
export function FreshnessIndicator({
  availability,
  now,
}: {
  availability: CapabilityAvailability;
  now?: Date;
}) {
  const freshness = freshnessOf(availability, now);
  if (freshness.asOf === null) {
    return <span className="mono text-[11px] text-ink-faint">as-of not published</span>;
  }
  const relative =
    freshness.ageSeconds === null
      ? "invalid timestamp"
      : freshness.ageSeconds < 60
        ? `${freshness.ageSeconds}s ago`
        : freshness.ageSeconds < 3600
          ? `${Math.floor(freshness.ageSeconds / 60)}m ago`
          : `${Math.floor(freshness.ageSeconds / 3600)}h ago`;
  return (
    <span
      className="mono text-[11px]"
      style={{ color: freshness.isStale ? "var(--state-stale)" : "var(--ink-faint)" }}
      title={fmtTimestamp(freshness.asOf)}
      data-stale={freshness.isStale}
    >
      {freshness.isStale ? "◔ " : ""}
      {relative}
    </span>
  );
}

/* -------------------------------------------------------------------------
 * MetricValue / MetricStrip
 * ---------------------------------------------------------------------- */

/**
 * Renders one summary metric.
 *
 * This is the single place that decides number-vs-state, so the rule
 * "`null` never becomes `0`, `-` or `N/A`" holds everywhere by construction
 * (FRONTEND_HANDOFF §4).
 */
export function MetricValue({
  metric,
  format,
}: {
  metric: SummaryMetric | null;
  format?: (value: number | string) => string;
}) {
  const rendered = renderMetric(metric, format);
  if (rendered.kind === "value") {
    return (
      <span className="metric-value" data-availability={rendered.state}>
        {rendered.text}
      </span>
    );
  }
  return (
    <span className="metric-absent" data-availability={rendered.state} title={rendered.reason ?? undefined}>
      <AvailabilityBadge state={rendered.state} detail={rendered.reason} />
    </span>
  );
}

/** A labelled metric cell for the strip below a section header. */
export function MetricCell({
  label,
  metric,
  unit,
  format,
}: {
  label: string;
  metric: SummaryMetric | null;
  unit?: string | null;
  format?: (value: number | string) => string;
}) {
  return (
    <div className="metric-cell">
      <div className="label">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <MetricValue metric={metric} format={format} />
        {unit && metric && metric.availability.state === "available" && metric.value !== null ? (
          <span className="mono text-[11px] text-ink-faint">{unit}</span>
        ) : null}
      </div>
    </div>
  );
}

/** Horizontal group of metric cells; wraps instead of scrolling on narrow viewports. */
export function MetricStrip({ children }: { children: ReactNode }) {
  return <div className="metric-strip">{children}</div>;
}
