/**
 * W4A — the one renderer for a typed absence.
 *
 * Visible: a short phrase built from the server's state/reason. Tooltip: the
 * reader sentence for the code plus the code itself (never invented: a code
 * not in `researchRefusal` shows only as the code). A uniform column or list
 * of absences is ONE caption line via `AbsenceSummary`.
 */
import { reasonCodeSentence } from "./researchRefusal";

/** Short visible sentence for the reason codes whose absence reads better than `not published`. Allowlist; never extended with guesses. */
export const ABSENCE_SHORT: Record<string, string> = {
  SOURCE_CLAIM_NOT_ISSUED: "no claim",
  SOURCE_CLAIM_NOT_PUBLISHED: "no claim",
  P21_NO_PERSISTED_RELEASE_CANDIDATE: "no release candidate",
  CANCELLED_BEFORE_SOURCE: "cancelled before source",
  RS02_RETAINED_LANE_NOT_APPLICABLE_TO_P04_FIXED_QUALIFICATION: "n/a here",
  P13_EQUITY_OOS_SERIES_NOT_PUBLISHED: "no series",
  P12_DOES_NOT_READ_ARTIFACT_OR_PARQUET_SERIES: "no series",
  P13_SOURCE_PREDATES_OOS_ANALYTICS: "predates analytics",
};

const STATE_PHRASE: Record<string, string> = {
  AVAILABLE: "not published",
  NOT_PUBLISHED: "not published",
  NOT_APPLICABLE: "n/a here",
  PENDING: "pending",
  PENDING_SOURCE_CALLBACK: "pending",
  NOT_READ: "not loaded",
  NOT_DECLARED: "not set",
  LEGACY_METADATA_ONLY: "legacy metadata",
};

const CODE = /^[A-Z][A-Z0-9_]+$/;

function tooltip(reason: string | null): string | undefined {
  if (!reason) return undefined;
  if (!CODE.test(reason)) return reason;
  const sentence = reasonCodeSentence(reason);
  return sentence ? `${sentence} (${reason})` : reason;
}

export function Absence({ reason, state, what }: { reason: string | null; state?: string; what?: string }) {
  const code = reason && CODE.test(reason) ? reason : null;
  const phrase = (code && ABSENCE_SHORT[code]) || STATE_PHRASE[state ?? "NOT_PUBLISHED"] || "not published";
  const text = what ? `${what} · ${phrase}` : phrase;
  const tip = tooltip(reason);
  return (
    <span
      style={{ fontStyle: "italic", color: "var(--ink-faint)" }}
      data-not-published
      data-withheld={state ?? "NOT_PUBLISHED"}
      data-reason-code={code ?? undefined}
      title={tip}
      aria-label={tip ? `${text}. ${tip}` : undefined}
      tabIndex={tip ? 0 : undefined}
    >
      {text}
    </span>
  );
}

/** A column or list that is absent in every (or most) rows: ONE caption line, the code in the tooltip. */
export function AbsenceSummary({
  column,
  reason,
  count,
  total,
}: {
  column: string;
  reason: string | null;
  count: number;
  total: number;
}) {
  const code = reason && CODE.test(reason) ? reason : null;
  const phrase = (code && ABSENCE_SHORT[code]) || "not published";
  const text = count >= total ? `${column} · ${phrase}` : `${column} · ${phrase} in ${count} of ${total}`;
  const tip = tooltip(reason);
  return (
    <span
      className="mono"
      style={{ fontSize: 10, fontStyle: "italic", color: "var(--ink-faint)" }}
      data-absence-summary={column}
      data-reason-code={code ?? undefined}
      title={tip}
      aria-label={tip ? `${text}. ${tip}` : undefined}
      tabIndex={tip ? 0 : undefined}
    >
      {text}
    </span>
  );
}
