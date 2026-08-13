/** Proportional window timeline preview with gap/overlap flags (§27.3 #6). */
import { windowBarCounts } from "./ThreeWindowEditor";
import type { WindowState } from "./ConfigWorkspace";

export function WindowTimeline({
  windows,
  overlapError,
}: {
  windows: WindowState;
  overlapError: string | null;
}) {
  const bars = windowBarCounts(windows);
  return (
    <div className="card p-4">
      <div className="label mb-2">Window timeline (proportional)</div>
      <div className="relative h-10 w-full rounded-md bg-sunken">
        {bars.map((bar) => (
          <div
            key={bar.role}
            className="absolute top-1 h-8 rounded border"
            style={{
              left: `${bar.start}%`,
              width: `${Math.max(2, bar.end - bar.start)}%`,
              background: bar.color,
              opacity: 0.85,
              borderColor: bar.color,
            }}
            title={`${bar.role}: ${bar.start.toFixed(1)}% → ${bar.end.toFixed(1)}%`}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-4">
        {bars.map((bar) => (
          <span key={bar.role} className="seg-legend">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: bar.color }} />
            {bar.role} · {bar.bars} bars
          </span>
        ))}
        {overlapError ? (
          <span className="mono text-[11px] font-semibold text-bad">{overlapError}</span>
        ) : (
          <span className="mono text-[11px] text-good">contiguous · half-open</span>
        )}
      </div>
    </div>
  );
}
