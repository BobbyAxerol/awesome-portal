/**
 * Evidence rows and SLA cells — the two components that make a governance
 * screen argue rather than assert.
 *
 * An evidence row that states a verdict without linking what produced it is an
 * opinion. Every row here carries a link slot for that reason, and a row whose
 * evidence is missing renders `insufficient` rather than quietly passing.
 */
import type { EvidenceMark, IdChip, Sla } from "../contracts";
import { slaOverdue } from "../contracts";

const MARK_GLYPH: Record<EvidenceMark, string> = {
  pass: "✓",
  watch: "!",
  fail: "✗",
  insufficient: "–",
};

const MARK_TEXT: Record<EvidenceMark, string> = {
  pass: "pass",
  watch: "watch item, non-blocking",
  fail: "fail",
  insufficient: "insufficient data",
};

export interface EvidenceRow {
  label: string;
  mark: EvidenceMark;
  /** The measured fact, e.g. `30/30 days · 312/300 trades · restarts 2/2`. */
  detail?: string;
  /** Where the number came from. A row without one is asserting, not showing. */
  evidence?: IdChip;
}

export function EvidencePanel({ rows }: { rows: readonly EvidenceRow[] }) {
  return (
    <div className="exec-evidence" role="list">
      {rows.map((row) => (
        <div className="exec-evidence-row" data-mark={row.mark} role="listitem" key={row.label}>
          <span className="exec-evidence-mark" aria-hidden="true">
            {MARK_GLYPH[row.mark]}
          </span>
          <span className="exec-evidence-label">
            {row.label}
            {row.detail ? <span className="exec-evidence-detail">{row.detail}</span> : null}
            <span className="sr-only">: {MARK_TEXT[row.mark]}</span>
          </span>
          {row.evidence ? (
            <a className="exec-evidence-link" href={row.evidence.href} title={row.evidence.title}>
              {row.evidence.label}
            </a>
          ) : (
            <span className="exec-evidence-link" aria-hidden="true" />
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * `26h / 24h · OVERDUE`.
 *
 * Overdue is stated in words as well as tone, because this cell is the sort key
 * for the Approval Inbox and the Command Center triage list — a reader scanning
 * for what is late must be able to see it without relying on the red.
 */
export function SlaCell({ sla }: { sla: Sla }) {
  const overdue = slaOverdue(sla);
  const format = (minutes: number) =>
    minutes >= 60 ? `${Math.round(minutes / 60)}h` : `${Math.round(minutes)}m`;

  return (
    <span className="exec-sla" data-overdue={overdue}>
      {format(sla.ageMinutes)} / {format(sla.budgetMinutes)}
      {overdue ? <span className="exec-sla-flag"> · OVERDUE</span> : null}
    </span>
  );
}
