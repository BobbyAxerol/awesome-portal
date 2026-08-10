/** Three-window date editor: three aligned rows, computed bars, overlap guard (§13.1). */
import { fmtCount } from "../../lib/format";
import type { WindowState } from "./ConfigWorkspace";

interface ThreeWindowEditorProps {
  windows: WindowState;
  onChange: (windows: WindowState) => void;
}

function parseIso(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function Row({
  role,
  color,
  start,
  end,
  onStart,
  onEnd,
  endPlaceholder,
}: {
  role: string;
  color: string;
  start: string;
  end: string;
  onStart: (value: string) => void;
  onEnd: (value: string) => void;
  endPlaceholder?: string;
}) {
  return (
    <div className="grid grid-cols-[72px_1fr_1fr] items-center gap-2">
      <span className="mono text-[11px] font-semibold uppercase" style={{ color }}>
        {role}
      </span>
      <input
        className="input"
        type="datetime-local"
        value={start.slice(0, 16)}
        onChange={(event) => onStart(parseIso(event.target.value))}
        aria-label={`${role} start`}
      />
      <input
        className="input"
        type="datetime-local"
        value={end ? end.slice(0, 16) : ""}
        placeholder={endPlaceholder}
        onChange={(event) => onEnd(parseIso(event.target.value))}
        aria-label={`${role} end`}
      />
    </div>
  );
}

export function ThreeWindowEditor({ windows, onChange }: ThreeWindowEditorProps) {
  return (
    <div>
      <div className="label mb-1.5">Data windows</div>
      <div className="card space-y-2 p-3">
        <Row
          role="IS"
          color="var(--role-is)"
          start={windows.isStart}
          end={windows.isEnd}
          onStart={(v) => onChange({ ...windows, isStart: v })}
          onEnd={(v) => onChange({ ...windows, isEnd: v })}
        />
        <Row
          role="OOS"
          color="var(--role-oos)"
          start={windows.oosStart}
          end={windows.oosEnd}
          onStart={(v) => onChange({ ...windows, oosStart: v })}
          onEnd={(v) => onChange({ ...windows, oosEnd: v })}
        />
        <Row
          role="Holdout Live"
          color="var(--role-holdout)"
          start={windows.holdoutStart}
          end={windows.holdoutEnd}
          onStart={(v) => onChange({ ...windows, holdoutStart: v })}
          onEnd={(v) => onChange({ ...windows, holdoutEnd: v })}
          endPlaceholder="dataset end"
        />
        <p className="mono text-[10px] leading-4 text-ink-faint">
          Half-open: end-exclusive · Holdout Live rỗng = chạy tới bar cuối dataset
        </p>
      </div>
    </div>
  );
}

export function windowBarCounts(windows: WindowState): Array<{ role: string; color: string; start: number; end: number; bars: string }> {
  const points = [
    { role: "IS", color: "var(--role-is)", start: windows.isStart, end: windows.isEnd },
    { role: "OOS", color: "var(--role-oos)", start: windows.oosStart, end: windows.oosEnd },
    { role: "Holdout", color: "var(--role-holdout)", start: windows.holdoutStart, end: windows.holdoutEnd },
  ];
  const startMs = Math.min(...points.map((p) => new Date(p.start).getTime()));
  const endMs = Math.max(...points.map((p) => new Date(p.end || p.start).getTime()));
  const span = endMs - startMs;
  return points.map((point) => {
    const pStart = new Date(point.start).getTime();
    const pEnd = point.end ? new Date(point.end).getTime() : endMs;
    const left = span > 0 ? ((pStart - startMs) / span) * 100 : 0;
    const width = span > 0 ? ((pEnd - pStart) / span) * 100 : 100;
    return {
      role: point.role,
      color: point.color,
      start: Math.max(0, Math.min(100, left)),
      end: Math.max(0, Math.min(100, left + width)),
      bars: pEnd > pStart ? fmtCount(Math.round((pEnd - pStart) / 3_600_000)) : "—",
    };
  });
}
