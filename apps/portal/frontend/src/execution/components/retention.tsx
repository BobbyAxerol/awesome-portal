/**
 * Retention outcomes — why a range holds what it holds.
 *
 * `EX-BE-04b` §3 states the rule this module exists for: `COLD_REQUESTABLE`,
 * `PURGED` and `UNKNOWN` "may have no points, but are not semantically an
 * ordinary empty hot series".
 *
 * A screen that renders zero rows therefore has to answer *why* zero, and there
 * are four different answers. "Nothing matched your filter" means look again
 * with a wider filter. "This is older than we keep online" means raise an
 * administrative restore. "This was deleted under policy" means stop looking.
 * "We publish no retention policy for this scope" means nobody can say. Only
 * the first is `empty`, and rendering the other three as empty tells an
 * operator their query found nothing when the truth is that nobody looked.
 */
import type { PanelStatus, RetentionOutcome, RetentionState } from "../contracts";

const OUTCOME_TITLE: Record<RetentionOutcome, string> = {
  HOT: "Online",
  PARTIAL_HOT: "Partly beyond retention",
  COLD_REQUESTABLE: "Beyond online retention",
  PURGED: "Purged under policy",
  UNKNOWN: "Retention unknown",
};

const OUTCOME_TEXT: Record<RetentionOutcome, string> = {
  HOT: "The whole requested range is online.",
  PARTIAL_HOT:
    "Only the recent part of this range is online. What is shown is real and incomplete — the earlier part was not queried, not found to be empty.",
  COLD_REQUESTABLE:
    "This range is archived rather than missing. Restoring it is an administrative request; no interactive query reaches the archive.",
  PURGED: "This range was deleted under the retention policy. No request will bring it back.",
  UNKNOWN:
    "No retention policy is published for this scope, so nothing can be said about what is or is not still held.",
};

/**
 * Which panel state an outcome resolves to.
 *
 * `PARTIAL_HOT` is `partial` — data exists and is incomplete, which is exactly
 * what that state means. The two cold outcomes are `unavailable` rather than
 * `empty`: the rows are not here, and the reason is not that there are none.
 * `UNKNOWN` is also `unavailable`, because a panel that cannot say what it
 * holds cannot claim to hold nothing.
 */
export function panelStatusForRetention(outcome: RetentionOutcome): PanelStatus {
  switch (outcome) {
    case "HOT":
      return "ok";
    case "PARTIAL_HOT":
      return "partial";
    case "COLD_REQUESTABLE":
    case "PURGED":
    case "UNKNOWN":
      return "unavailable";
  }
}

/** Does this outcome mean an empty result is genuinely empty? */
export function emptyMeansEmpty(retention: RetentionState | null | undefined): boolean {
  // Absent is not HOT. An endpoint that published no retention state has told
  // us nothing, and "nothing" is not "everything is online".
  return retention?.outcome === "HOT";
}

/**
 * The sentence a list or chart prints instead of "no rows".
 * Returns `null` only for `HOT`, where the ordinary empty state is honest.
 */
export function retentionReason(retention: RetentionState | null | undefined): string | null {
  if (!retention) {
    return "No retention policy was published with this result, so it cannot be read as complete.";
  }
  if (retention.outcome === "HOT") return null;
  const bound = retention.hotFrom ? ` Online history begins ${retention.hotFrom}.` : "";
  const version = retention.policyVersion ? ` (policy ${retention.policyVersion})` : "";
  return `${OUTCOME_TEXT[retention.outcome]}${bound}${version}`;
}

export function RetentionNotice({
  retention,
  onRequestRestore,
}: {
  retention: RetentionState;
  /**
   * Only meaningful for `COLD_REQUESTABLE`. Restoring is an administrative
   * workflow, so this raises a request — it does not widen a query, and the
   * button says so.
   */
  onRequestRestore?: () => void;
}) {
  if (retention.outcome === "HOT") return null;
  return (
    <div className="exec-retention" data-outcome={retention.outcome}>
      <span className="exec-retention-title">{OUTCOME_TITLE[retention.outcome]}</span>
      <span className="exec-retention-text">{retentionReason(retention)}</span>
      {retention.outcome === "COLD_REQUESTABLE" && onRequestRestore ? (
        <button type="button" className="exec-btn-ghost" onClick={onRequestRestore}>
          Request a restore
        </button>
      ) : null}
    </div>
  );
}

/**
 * A range the server refused to scan.
 *
 * §4: "range wider than 5,000 daily buckets: typed range-too-wide response,
 * never an unbounded scan." It is a sixth outcome and not a retention one — the
 * data may be perfectly online, the question was simply too big. So the remedy
 * differs: narrow the range rather than request a restore.
 */
export function RangeTooWideNotice({ requestedDays }: { requestedDays?: number | null }) {
  return (
    <div className="exec-retention" data-outcome="RANGE_TOO_WIDE">
      <span className="exec-retention-title">Range too wide</span>
      <span className="exec-retention-text">
        {requestedDays ? `${requestedDays.toLocaleString("en-US")} days ` : "This range "}
        exceeds what one query may scan. The data is not missing — the question was too big.
        Narrow the range, or ask for a report rather than a chart.
      </span>
    </div>
  );
}
