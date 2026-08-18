/**
 * Count distribution bar.
 *
 * This is a chart in the sense of v0.5 §12, so it obeys that contract:
 *  - it renders only counts the summary envelope actually reported;
 *  - a segment whose metric has no authority is NOT drawn as a zero-width
 *    slice — the whole bar is withheld and the reason is stated instead;
 *  - colour is never the only channel: every segment is also labelled with its
 *    name and its exact count, and the legend repeats both.
 *
 * It is CSS/flex rather than ECharts on purpose: no interpolation, no
 * smoothing, no library defaults that could imply a value that was not
 * measured.
 */
import type { PortalSummarySection } from "../../portal/contracts";
import { readMetric } from "../../portal/contracts";
import { AvailabilityBadge } from "../../components/semantic";
import { reasonCopy } from "../../lib/portalState";
import { metricLabel } from "./labels";

/** Segment tones, cycled in reading order. All are semantic tokens. */
const SEGMENT_VARS = [
  "var(--role-is)",
  "var(--accent)",
  "var(--state-available)",
  "var(--state-denied)",
  "var(--state-unavailable)",
];

export function Distribution({
  section,
  keys,
  caption,
}: {
  section: PortalSummarySection;
  keys: string[];
  caption: string;
}) {
  const rows = keys.map((key) => ({ key, metric: readMetric(section, key) }));

  // If any component of the breakdown has no authority, the proportions would
  // be a lie. Withhold the bar and say which part is missing.
  const missing = rows.find(
    ({ metric }) =>
      metric === null || metric.value === null || metric.availability.state === "unavailable" ||
      metric.availability.state === "denied",
  );
  if (missing) {
    const state = missing.metric?.availability.state ?? "unavailable";
    const reason = missing.metric ? reasonCopy(missing.metric.availability.reason_code) : null;
    return (
      <div className="portal-distribution">
        <div className="label">{caption}</div>
        <div className="mt-1 flex items-center gap-2">
          <AvailabilityBadge state={state} detail={reason} />
          <span className="mono text-[11px] text-ink-soft">
            No distribution is drawn while the “{metricLabel(missing.key)}” component is missing.
          </span>
        </div>
      </div>
    );
  }

  const values = rows.map(({ key, metric }) => ({
    key,
    value: Number(metric?.value ?? 0),
  }));
  const total = values.reduce((sum, row) => sum + row.value, 0);

  return (
    <div className="portal-distribution">
      <div className="flex items-baseline justify-between gap-2">
        <span className="label">{caption}</span>
        <span className="mono text-[11px] text-ink-faint">total {total}</span>
      </div>

      {total === 0 ? (
        // A real zero, evidenced by the authority — distinct from "unknown".
        <p className="mono mt-1 text-[11px] text-ink-soft">
          — No records yet; this is a real zero from the authority.
        </p>
      ) : (
        <div className="portal-bar" role="img" aria-label={`${caption}: ${values.map((v) => `${metricLabel(v.key)} ${v.value}`).join(", ")}`}>
          {values
            .filter((row) => row.value > 0)
            .map((row, index) => (
              <span
                key={row.key}
                className="portal-bar-segment"
                style={{
                  width: `${(row.value / total) * 100}%`,
                  background: SEGMENT_VARS[keys.indexOf(row.key) % SEGMENT_VARS.length],
                }}
                title={`${metricLabel(row.key)}: ${row.value}`}
                data-segment-index={index}
              />
            ))}
        </div>
      )}

      <ul className="portal-bar-legend">
        {values.map((row) => (
          <li key={row.key}>
            <span
              className="portal-bar-swatch"
              style={{ background: SEGMENT_VARS[keys.indexOf(row.key) % SEGMENT_VARS.length] }}
              aria-hidden="true"
            />
            <span className="portal-bar-legend-label">{metricLabel(row.key)}</span>
            <span className="portal-bar-legend-value mono">{row.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
