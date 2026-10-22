/**
 * One Manager metric as a cell (`ManagerMetricRead`): the published exact value with its unit, or the typed absence with its reason.
 *
 * - AVAILABLE prints the exact string through the boundary formatter (never a float, never `-0`); a `MONEY` figure carries its
 *   currency; an exact zero is printed as zero, which is not the same as a metric that says nothing.
 * - Anything else prints the state word and keeps the published reason code behind the cell's disclosure. No stand-in value.
 * - `title` carries the window, basis and methodology so the figure can be traced without a second column.
 * Nothing is summed, converted or defaulted here; two currencies are two cells.
 */
import { NaWhy } from "../../blocks";
import { showDecimal } from "../../charts/decimal";
import type { ManagerMetricRead } from "../../readers/managerMetric";

const windowText = (metric: ManagerMetricRead): string =>
  metric.window === null ? "no window stated" : `${new Date(metric.window.fromMs).toISOString().slice(0, 10)} to ${new Date(metric.window.toMs).toISOString().slice(0, 10)} (UTC)`;

export function metricTitle(metric: ManagerMetricRead): string {
  return `${metric.basis} · ${windowText(metric)} · ${metric.methodologyRef === null ? "no methodology published" : `methodology ${metric.methodologyRef}`}`;
}

export function MetricValue({ metric, signed = false }: { metric: ManagerMetricRead | undefined | null; signed?: boolean }) {
  if (metric === undefined || metric === null) return <NaWhy reason="This metric is not in the published set for this row." className="exec-mgr-na" />;
  if (metric.kind === "absent") return <NaWhy reason={metric.copy} className="exec-mgr-na" />;
  const text = metric.unit === "MONEY" ? showDecimal(metric.exact, { unit: "money", currency: metric.currency ?? undefined, signed }) : metric.exact;
  return <span className="exec-mgr-num" title={`${metric.exact} · ${metricTitle(metric)}`} data-zero={metric.zero ? "true" : undefined}>{text}</span>;
}
