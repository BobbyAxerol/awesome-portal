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

function ProvenanceLine({ provenance }: { provenance: ChartProvenance }) {
  const parts: string[] = [`nguồn ${provenance.source}`];
  if (provenance.segment) parts.push(`segment ${provenance.segment}`);
  if (provenance.units) parts.push(`đơn vị ${provenance.units}`);
  parts.push(`timezone ${provenance.timezone ?? "UTC"}`);
  parts.push(provenance.asOf ? `as-of ${provenance.asOf}` : "as-of chưa công bố");
  if (provenance.sourceRows != null && provenance.returnedRows != null) {
    parts.push(`${provenance.returnedRows}/${provenance.sourceRows} điểm`);
    if (provenance.returnedRows < provenance.sourceRows) {
      // The method is never guessed. Before the series envelope existed this
      // line printed a hard-coded "server max_points", which asserted a
      // reduction method the frontend had no way to know.
      parts.push(provenance.downsample ? `giảm điểm: ${provenance.downsample}` : "giảm điểm: chưa rõ phương pháp");
    }
  } else if (provenance.returnedRows != null) {
    parts.push(`${provenance.returnedRows} điểm`);
  }
  if (provenance.digest) parts.push(`digest ${provenance.digest.slice(0, 19)}…`);

  return (
    <div className="chart-provenance mono">
      {parts.join(" · ")}
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
          aria-label={`Tải EChart ${figNumber} dạng PNG`}
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
        <div className="chart-provenance mono">nguồn: {sourceId}</div>
      ) : null}
    </figure>
  );
}
