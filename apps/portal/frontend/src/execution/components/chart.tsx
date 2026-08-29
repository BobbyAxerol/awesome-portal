/**
 * ChartTile — a chart frame whose caption is mandatory.
 *
 * Spec §16.2 requires every chart to render its envelope: window, interval,
 * currency, as-of, authority, formula version, coverage and the row counts. The
 * caption is not metadata for the curious; it is what separates a series that
 * shows all its data from one the server aggregated, and without it a
 * downsampled chart silently misrepresents its own resolution.
 *
 * Phase 0 renders the frame and the caption only. ECharts arrives at Phase 18
 * and must keep this caption verbatim.
 */
import { utcStamp } from "../time";
import type { ChartEnvelope } from "../contracts";
import type { ReactNode } from "react";

/**
 * Assembles the caption row.
 *
 * `source_rows → returned_rows` is printed whenever they differ, because that
 * difference IS the aggregation: 43,800 → 4,368 tells a reader they are looking
 * at hourly buckets over six months, which no other field on the tile says.
 */
export function envelopeCaption(envelope: ChartEnvelope): string {
  const parts: string[] = [envelope.window, envelope.interval];
  if (envelope.currency) parts.push(envelope.currency);
  parts.push(`as_of ${utcStamp(envelope.asOf)}`);
  parts.push(envelope.authority);
  if (envelope.formulaVersion) parts.push(envelope.formulaVersion);

  if (
    envelope.sourceRows !== null &&
    envelope.sourceRows !== undefined &&
    envelope.returnedRows !== null &&
    envelope.returnedRows !== undefined
  ) {
    parts.push(
      envelope.sourceRows === envelope.returnedRows
        ? `${envelope.returnedRows} samples`
        : `${envelope.sourceRows} → ${envelope.returnedRows} samples`,
    );
  }

  if (envelope.downsampleMethod) parts.push(`downsample ${envelope.downsampleMethod}`);
  if (envelope.coverage !== null && envelope.coverage !== undefined) {
    parts.push(`coverage ${Math.round(envelope.coverage * 100)}%`);
  }
  return parts.join(" · ");
}

export function ChartTile({
  title,
  envelope,
  children,
  actions,
}: {
  title: string;
  envelope: ChartEnvelope;
  /** The plot. Phase 0 passes a placeholder; Phase 18 passes ECharts. */
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <figure className="exec-tile">
      <div className="exec-tile-head">
        <figcaption className="exec-tile-title">{title}</figcaption>
        {actions}
      </div>
      <div className="exec-tile-body">{children}</div>
      <div className="exec-tile-caption">
        {envelopeCaption(envelope)}
        {envelope.warnings?.length ? (
          <div className="exec-tile-warning">
            {envelope.warnings.map((warning) => (
              <div key={warning}>! {warning}</div>
            ))}
          </div>
        ) : null}
      </div>
    </figure>
  );
}
