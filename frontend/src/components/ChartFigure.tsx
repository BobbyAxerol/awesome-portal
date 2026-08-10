/** Chart figure frame with fig number, title, note and export (§27.3 #3). */
import { Download } from "lucide-react";
import type { ReactNode } from "react";

export interface ChartFigureProps {
  figNumber: number;
  title: string;
  note?: ReactNode;
  sourceId?: string;
  height?: number;
  children: ReactNode;
}

export function ChartFigure({ figNumber, title, note, sourceId, children }: ChartFigureProps) {
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
      data-source-id={sourceId}
    >
      <figcaption className="mb-3 flex items-baseline justify-between gap-2">
        <span className="mono text-[11px] text-accent-2">EChart {figNumber}</span>
        <span className="font-display text-[15px] text-ink">{title}</span>
        <button
          type="button"
          className="btn-ghost no-print ml-auto"
          aria-label={`Download EChart ${figNumber} as PNG`}
          onClick={downloadPng}
        >
          <Download size={12} />
        </button>
      </figcaption>
      {children}
      {note ? <div className="mt-2 text-[12px] leading-5 text-ink-faint">{note}</div> : null}
      {sourceId ? (
        <div className="mt-1 mono text-[10px] text-ink-faint/70">source: {sourceId}</div>
      ) : null}
    </figure>
  );
}
