/**
 * Run metric tile — the evidence-carrying replacement for a bare KPI number.
 *
 * v0.6 §6 requires every displayed metric to carry its definition, unit,
 * segment, source and as-of. A number with none of those cannot be audited or
 * argued with, which is the failure mode this component exists to prevent.
 *
 * A metric the engine did not compute for a segment is NOT rendered as a dash
 * that looks like a value: it renders as an explicit absent state with the
 * reason attached (FRONTEND_HANDOFF §4).
 */
import { Info } from "lucide-react";

import { fmtCount, fmtMoney, fmtPct, fmtRatio } from "../lib/format";
import { metricDefinition, metricTone, type MetricDefinition } from "../features/overview/metricDefinitions";

export interface MetricEvidence {
  /** Segment the value belongs to, e.g. `oos`. */
  segment: string;
  /** Artifact the value was read from. */
  source: string;
  /** ISO-8601 UTC completion time of the run that produced it. */
  asOf: string | null;
  /** Content digest of the source artifact, when the manifest publishes one. */
  digest?: string | null;
}

function formatValue(definition: MetricDefinition, value: number): string {
  switch (definition.unit) {
    case "currency":
      return `$${fmtMoney(value)}`;
    case "percent":
      return fmtPct(value, definition.direction === "higher");
    case "count":
      return fmtCount(value);
    default:
      return fmtRatio(value);
  }
}

export function MetricTile({
  metricKey,
  value,
  evidence,
  emphasis = false,
}: {
  metricKey: string;
  value: number | null;
  evidence: MetricEvidence;
  emphasis?: boolean;
}) {
  const definition = metricDefinition(metricKey);
  const tone = metricTone(definition, value);
  const absent = value === null || Number.isNaN(value);

  const provenance = [
    `segment ${evidence.segment}`,
    `nguồn ${evidence.source}`,
    evidence.asOf ? `as-of ${evidence.asOf}` : "as-of chưa công bố",
    evidence.digest ? `digest ${evidence.digest.slice(0, 19)}…` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="metric-tile" data-emphasis={emphasis} data-absent={absent}>
      <div className="metric-tile-head">
        <span className="label">{definition.label}</span>
        <span
          className="metric-tile-info"
          tabIndex={0}
          role="note"
          aria-label={`${definition.label}: ${definition.definition}`}
          title={`${definition.definition}${definition.annualized ? " Chịu ảnh hưởng của lịch annualization trong config." : ""}`}
        >
          <Info size={11} aria-hidden="true" />
        </span>
      </div>

      {absent ? (
        <div className="metric-tile-absent mono" title="Engine không tính metric này cho segment đang xem.">
          không có cho segment này
        </div>
      ) : (
        <div
          className="metric-tile-value"
          style={{ color: tone === "good" ? "var(--good)" : tone === "bad" ? "var(--bad)" : undefined }}
        >
          {formatValue(definition, value as number)}
        </div>
      )}

      <div className="metric-tile-foot mono" title={provenance}>
        <span className="metric-tile-segment">{evidence.segment}</span>
        <span aria-hidden="true">·</span>
        <span className="metric-tile-unit">{definition.unit}</span>
        {definition.annualized ? (
          <>
            <span aria-hidden="true">·</span>
            <span title="Phụ thuộc lịch annualization đã ghi trong config">annualized</span>
          </>
        ) : null}
      </div>
      <span className="sr-only">{provenance}</span>
    </div>
  );
}

/** A row of metric tiles; wraps rather than scrolling. */
export function MetricTileRow({ children }: { children: React.ReactNode }) {
  return <div className="metric-tile-row">{children}</div>;
}
