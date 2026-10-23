/**
 * Budget bar and concentration bar (WP-F1), shared by Overview and Portfolio 360. Geometry: `capitalModel.ts`.
 *
 * - `BudgetBar`: "Budget used 12,500.50 / 18,000.00" with a bar for the allocated part of the approved budget and a second segment for
 *   what is being recalled. The budget is a limit, not cash: the words say so. One bar per economic partition, never merged.
 * - `ShareBar`: the stacked concentration bar, one segment per alpha group, widths are the PUBLISHED `allocation_share_pct`.
 *   Colour is never the only cue: each segment is also in the legend with its published share.
 */
import { showDecimal } from "../../charts/decimal";
import type { ManagerGroup } from "../../readers/managerDataset";
import type { ManagerPartitionedMetrics } from "../../readers/managerMetric";
import { partitionLabel } from "./PartitionFigures";
import { budgetUse, shareBars } from "./capitalModel";

import "./capitalBlocks.css";

export function BudgetBar({ list, title = "Budget used" }: { list: readonly ManagerPartitionedMetrics[]; title?: string }) {
  const uses = budgetUse(list);
  if (uses.length === 0) return null;
  return (
    <div className="exec-cap-budget" role="group" aria-label={title}>
      <p className="exec-cap-budget-title" title="Allocated capital against the approved budget. The budget is a limit, not cash.">{title}</p>
      {uses.map((use) => {
        const money = (metric: typeof use.used) => (metric === null ? null : showDecimal(metric.exact, { unit: "money", currency: metric.currency ?? undefined }));
        const used = money(use.used);
        const limit = money(use.limit);
        const label = partitionLabel(use.partition);
        return (
          <div key={`${use.partition.economicDomain}|${use.partition.currency}|${use.partition.basis}`} className="exec-cap-budget-line" data-domain={use.partition.economicDomain}>
            <div className="exec-cap-budget-head">
              <span className="exec-cap-dim">{label}</span>
              <span className="exec-cap-budget-figs">
                {used !== null && limit !== null ? <><span className="exec-cap-num">{used}</span> <span className="exec-cap-of">/</span> <span className="exec-cap-num">{limit}</span></> : <span className="exec-cap-na">Not published</span>}
              </span>
            </div>
            {use.usedPct !== null ? (
              <div
                className="exec-cap-bar"
                role="meter"
                aria-label={`${title}, ${label}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={use.usedPct}
                aria-valuetext={`${used} of ${limit}${use.recalling !== null ? `, ${money(use.recalling)} recalling` : ""}`}
              >
                <span className="exec-cap-bar-used" style={{ width: `${use.usedPct}%` }} />
                {use.recallPct !== null && use.recallPct > 0 ? <span className="exec-cap-bar-recall" style={{ width: `${use.recallPct}%` }} /> : null}
              </div>
            ) : null}
            <div className="exec-cap-legend">
              <span className="exec-cap-key" data-k="used">Allocated</span>
              {use.recalling !== null ? <span className="exec-cap-key" data-k="recall">Recalling <span className="exec-cap-num">{money(use.recalling)}</span></span> : null}
              <span className="exec-cap-key" data-k="limit">of approved</span>
            </div>
            {use.note !== null ? <p className="exec-cap-note">{use.note}</p> : null}
          </div>
        );
      })}
    </div>
  );
}

export function ShareBar({ groups, title = "Concentration" }: { groups: readonly ManagerGroup[]; title?: string }) {
  const bars = shareBars(groups);
  if (bars.length === 0) return null;
  return (
    <div className="exec-cap-shares" role="group" aria-label={`${title} by alpha`}>
      {bars.map((bar) => (
        <div key={`${bar.partition.economicDomain}|${bar.partition.currency}|${bar.partition.basis}`} className="exec-cap-share">
          <div className="exec-cap-stack" role="img" aria-label={`${partitionLabel(bar.partition)}: ${bar.segments.map((s) => `${s.id} ${showDecimal(s.exact, { unit: "pct" })}`).join(", ")}`}>
            {bar.segments.map((segment, index) => (
              <span key={segment.id} className="exec-cap-seg" data-i={index % 6} style={{ width: `${segment.width}%` }} title={`${segment.id} ${showDecimal(segment.exact, { unit: "pct" })}`} />
            ))}
          </div>
          <ul className="exec-cap-legend" aria-label={`${partitionLabel(bar.partition)} shares`}>
            {bar.segments.map((segment, index) => (
              <li key={segment.id} className="exec-cap-key" data-i={index % 6} title={segment.exact}>
                <span className="exec-cap-sw" data-i={index % 6} aria-hidden="true" />
                <span className="exec-cap-id">{segment.id}</span> <span className="exec-cap-num">{showDecimal(segment.exact, { unit: "pct" })}</span>
              </li>
            ))}
          </ul>
          {bar.withoutShare > 0 ? <p className="exec-cap-note">{bar.withoutShare} {bar.withoutShare === 1 ? "alpha publishes" : "alphas publish"} no share and {bar.withoutShare === 1 ? "has" : "have"} no segment.</p> : null}
        </div>
      ))}
    </div>
  );
}
