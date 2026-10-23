/**
 * The PORTFOLIO SCORE as a cell (Portfolios register) and as a block (Portfolio 360).
 *
 * Everything printed is published: the value (truncated to two places for display, never rounded up across a band edge; the exact
 * string rides the title), the band the spec's table gives that value, the evidence coverage, the `provisional` badge when the
 * source says PROVISIONAL, and the policy / methodology labels as sent. A score that is not there is a typed absence with its code
 * ("Insufficient evidence"), never 0 and never a band. A true zero is a value (band Weak). The client computes nothing.
 */
import { NaWhy } from "../../blocks";
import type { ManagerPartitionedMetrics } from "../../readers/managerMetric";
import { partitionLabel } from "./PartitionFigures";
import { BAND_LABEL, evidencePercent, scoreOfEntry, truncateDecimal, type ScoreRead } from "./registerMetrics";

import "./partitionFigures.css";

const ABSENT_WORD: Readonly<Record<string, string>> = {
  INSUFFICIENT_EVIDENCE: "Insufficient evidence",
  ALL_HISTORY_WINDOW_NOT_PUBLISHED: "Window not published",
  EXACT_METRIC_WINDOW_NOT_PUBLISHED: "Window not published",
};

export const absenceWord = (code: string): string => ABSENT_WORD[code] ?? "Not available";

export function ScoreBandChip({ band }: { band: keyof typeof BAND_LABEL }) {
  return <span className="exec-pf-band" data-band={band}>{BAND_LABEL[band]}</span>;
}

/** One partition's score. `full` adds the P / R / B components and the methodology line (Portfolio 360). */
export function ScoreFigure({ read, full = false }: { read: ScoreRead; full?: boolean }) {
  if (read.kind === "none") return <NaWhy reason={read.reason} className="exec-pf-na" />;
  if (read.kind === "absent") {
    return (
      <span className="exec-pf-score" data-state="absent">
        <span className="exec-pf-score-top">
          <NaWhy reason={`${read.reason}. Policy ${read.policy}.`} className="exec-pf-na" text={absenceWord(read.code)} />
        </span>
        <span className="exec-pf-score-sub" title={`Policy ${read.policy}`}>{read.evidence !== null ? `Evidence ${evidencePercent(read.evidence)}` : "No evidence figure"}{full ? ` · ${read.policy}` : ""}</span>
      </span>
    );
  }
  return (
    <span className="exec-pf-score" data-state={read.provisional ? "provisional" : "scored"} data-band={read.band}>
      <span className="exec-pf-score-top">
        <span className="exec-pf-score-val" title={`${read.exact} · ${read.methodology ?? "no methodology published"}${read.window === null ? "" : ` · ${read.window}`} · ${read.evidence !== null ? `evidence ${read.evidence}` : "no evidence figure"} · policy ${read.policy}`}>{truncateDecimal(read.exact)}</span>
        <ScoreBandChip band={read.band} />
      </span>
      {full || read.provisional ? (
        <span className="exec-pf-score-sub">
          {read.provisional ? <span className="exec-pf-prov" title="Sample below maturity: a numeric score, not yet validated">Provisional</span> : null}
          {full ? (read.evidence !== null ? <span title={`Evidence coverage ${read.evidence}`}>Evidence {evidencePercent(read.evidence)}</span> : <span>No evidence figure</span>) : null}
          {full ? <span title={read.methodology ?? undefined}>{read.policy}</span> : null}
        </span>
      ) : null}
      {full ? (
        <span className="exec-pf-score-parts" aria-label="Score components">
          {([["P", read.p], ["R", read.r], ["B", read.b]] as const).map(([name, value]) => (
            <span key={name} className="exec-pf-score-part" title={value ?? undefined}>
              <span className="exec-pf-score-partname">{name}</span> {value === null ? "n/a" : truncateDecimal(value)}
            </span>
          ))}
        </span>
      ) : null}
    </span>
  );
}

/** The register cell: one line per economic partition, a partition label only when there are several. */
export function ScoreList({ list, full = false }: { list: readonly ManagerPartitionedMetrics[]; full?: boolean }) {
  if (list.length === 0) return <NaWhy reason="No economic partition is published." className="exec-pf-na" />;
  return (
    <ul className="exec-part exec-pf-score-list" aria-label="portfolio score by economic partition">
      {list.map((entry) => (
        <li key={`${entry.partition.economicDomain}|${entry.partition.currency}|${entry.partition.basis}|${entry.partition.nativeProfileRef}`} className="exec-pf-score-line" data-domain={entry.partition.economicDomain}>
          {list.length > 1 ? <span className="exec-part-label" title={`${entry.partition.basis} · ${entry.partition.nativeProfileRef}`}>{partitionLabel(entry.partition)}</span> : null}
          <ScoreFigure read={scoreOfEntry(entry)} full={full} />
        </li>
      ))}
    </ul>
  );
}
