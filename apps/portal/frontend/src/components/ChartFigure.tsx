/** Chart figure frame carrying the §12.2 production envelope. */
import { Download } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Minimum provenance a production chart must publish (v0.5 §12.2).
 *
 * The frame renders whatever the caller can evidence and states what is
 * missing, rather than omitting the line and letting the chart look more
 * authoritative than it is.
 */
export interface ChartProvenance {
  /** Artifact or query the series came from. */
  source: string;
  /** Content digest of that artifact, when the manifest publishes one. */
  digest?: string | null;
  /** Run/deployment the series belongs to. */
  runId?: string | null;
  /** Segment or environment, e.g. `oos`, `stitched`. */
  segment?: string | null;
  /** Display timezone; series timestamps are UTC at the boundary. */
  timezone?: string;
  /** Unit or currency of the y axis. */
  units?: string;
  /** ISO-8601 UTC time the underlying artifact was completed. */
  asOf?: string | null;
  /** Rows in the source vs rows actually plotted after downsampling. */
  sourceRows?: number | null;
  returnedRows?: number | null;
  /** How the series was reduced, when it was. */
  downsample?: string | null;
  /** Data-quality flags that qualify the reading. */
  warnings?: string[];
}

export interface ChartFigureProps {
  figNumber: number;
  title: string;
  note?: ReactNode;
  /** Legacy single-string source; prefer `provenance`. */
  sourceId?: string;
  provenance?: ChartProvenance;
  height?: number;
  children: ReactNode;
}

/**
 * The §12.2 envelope, as labelled fields.
 *
 * It used to be one run-on line of eight values joined by `·`, ending in a
 * half-printed digest — every fact present, and the whole thing reading as a log
 * line under an otherwise careful chart. Nobody audits a log line.
 *
 * Same fields, same wording, now as label/value pairs on a micro-grid: the reader
 * can find "as-of" without parsing the sentence, and a missing field still states
 * itself ("as-of not published") instead of vanishing.
 */
function ProvenanceLine({ provenance }: { provenance: ChartProvenance }) {
  const fields: { label: string; value: string; wide?: boolean }[] = [
    { label: "source", value: provenance.source, wide: true },
  ];
  if (provenance.segment) fields.push({ label: "segment", value: provenance.segment });
  if (provenance.units) fields.push({ label: "units", value: provenance.units });
  fields.push({ label: "timezone", value: provenance.timezone ?? "UTC" });
  fields.push({ label: "as-of", value: provenance.asOf ?? "not published" });
  if (provenance.sourceRows != null && provenance.returnedRows != null) {
    fields.push({
      label: "points",
      value: `${provenance.returnedRows}/${provenance.sourceRows}`,
    });
    if (provenance.returnedRows < provenance.sourceRows) {
      // The method is never guessed. Before the series envelope existed this
      // line printed a hard-coded "server max_points", which asserted a
      // reduction method the frontend had no way to know.
      fields.push({
        label: "reduction",
        value: provenance.downsample ?? "method unknown",
        wide: true,
      });
    }
  } else if (provenance.returnedRows != null) {
    fields.push({ label: "points", value: String(provenance.returnedRows) });
  }
  if (provenance.digest) {
    fields.push({ label: "digest", value: `${provenance.digest.slice(0, 19)}…`, wide: true });
  }

  return (
    <div className="chart-provenance">
      <dl className="chart-provenance-grid">
        {fields.map((field) => (
          <div key={field.label} className="chart-provenance-field" data-wide={field.wide ?? false}>
            <dt>{field.label}</dt>
            <dd className="mono">{field.value}</dd>
          </div>
        ))}
      </dl>
      {provenance.warnings?.length ? (
        <ul className="chart-warnings">
          {provenance.warnings.map((warning) => (
            <li key={warning}>⚠ {warning}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function ChartFigure({ figNumber, title, note, sourceId, provenance, children }: ChartFigureProps) {
  const downloadPng = () => {
    const canvas = document.querySelector(`figure[data-fig="${figNumber}"] canvas`) as
      | HTMLCanvasElement
      | null;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `echart-${figNumber}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  return (
    <figure
      data-fig={figNumber}
      className="card p-4"
      style={{ breakInside: "avoid" }}
      data-source-id={provenance?.source ?? sourceId}
    >
      <figcaption className="mb-3 flex items-start justify-between gap-2">
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="mono shrink-0 text-[11px] text-accent-2">EChart {figNumber}</span>
          <span className="font-display text-[15px] leading-5 text-ink">{title}</span>
        </span>
        <button
          type="button"
          className="btn-ghost no-print shrink-0"
          aria-label={`Download EChart ${figNumber} as PNG`}
          onClick={downloadPng}
        >
          <Download size={12} />
        </button>
      </figcaption>
      {children}
      {note ? <div className="mt-2 text-[12px] leading-5 text-ink-faint">{note}</div> : null}
      {provenance ? (
        <ProvenanceLine provenance={provenance} />
      ) : sourceId ? (
        <div className="chart-provenance">
          <dl className="chart-provenance-grid">
            <div className="chart-provenance-field" data-wide="true">
              <dt>source</dt>
              <dd className="mono">{sourceId}</dd>
            </div>
          </dl>
        </div>
      ) : null}
    </figure>
  );
}
