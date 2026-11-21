/**
 * The words for the typed reasons the scoped bodies state about a record or an identity (BE-P15, RV-11).
 *
 * One table per vocabulary, keyed by the server's own code. A code this build does not know reads as `null` (the cell then
 * prints the plain `Not available`, the code stays in no text), never as a guessed sentence. Each sentence is neutral and states
 * where the gap is, not what to do. Nothing here can enable anything.
 */
import { TIME_REASONS, type TimeReason } from "../../readers/subjectRecordsScoped";
import { DEPLOYMENT_FINANCIAL_REASONS, IDENTITY_ABSENCE_REASONS } from "../../readers/alphaResourceScoped";

/** A scoped record that does not state a member that other records of the page do. */
export const NOT_IN_RECORD = "Not in this record";

export const TIME_REASON_TEXT: Readonly<Record<TimeReason, string>> = {
  SUBMITTED_AT_NOT_IN_POLICY: "Submission time is outside this read's scope",
  OCCURRED_AT_NOT_IN_POLICY: "Trade time is outside this read's scope",
  SOURCE_TIME_NOT_PUBLISHED: "The source published no time",
  SOURCE_TIME_UNPARSEABLE: "The source time could not be read",
};

export const IDENTITY_REASON_TEXT: Readonly<Record<(typeof IDENTITY_ABSENCE_REASONS)[number], string>> = {
  ALPHA_NAME_NOT_IN_SOURCE: "The source has no alpha name",
  ALPHA_NAME_NOT_IN_POLICY: "The name is outside this read's scope",
  ALPHA_VERSION_NOT_IN_SOURCE: "The source has no alpha version",
  ALPHA_VERSION_NOT_IN_POLICY: "The version is outside this read's scope",
  ALPHA_OWNER_NOT_MAPPED_TO_PORTAL_USER: "The source owner is not mapped to a Portal user",
  ALPHA_STAGE_NOT_PUBLISHED_BY_SOURCE: "The source publishes no stage",
};

export const FINANCIAL_REASON_TEXT: Readonly<Record<(typeof DEPLOYMENT_FINANCIAL_REASONS)[number], string>> = {
  DEPLOYMENT_FINANCIALS_RELATION_NOT_BOUND_FOR_PROFILE: "No snapshot is bound for this book",
  DEPLOYMENT_FINANCIALS_RELATION_UNAVAILABLE: "The snapshot source is unavailable",
  DEPLOYMENT_FINANCIAL_SNAPSHOT_NOT_PUBLISHED: "No snapshot row is published",
  DEPLOYMENT_FINANCIAL_SNAPSHOT_AMBIGUOUS: "Two different rows share the latest time",
  DEPLOYMENT_FINANCIAL_WINDOW_TRUNCATED: "The window was cut; a later row may exist",
};

const has = (table: object, code: string): boolean => Object.hasOwn(table, code);

/** The sentence for a record's time reason, or `null` for a code this build does not know. */
export const timeReasonText = (code: string | null | undefined): string | null =>
  typeof code === "string" && (TIME_REASONS as readonly string[]).includes(code) && has(TIME_REASON_TEXT, code) ? TIME_REASON_TEXT[code as TimeReason] : null;

export const identityReasonText = (code: string): string | null => (has(IDENTITY_REASON_TEXT, code) ? IDENTITY_REASON_TEXT[code as keyof typeof IDENTITY_REASON_TEXT] : null);

export const financialReasonText = (code: string | null): string | null => (code !== null && has(FINANCIAL_REASON_TEXT, code) ? FINANCIAL_REASON_TEXT[code as keyof typeof FINANCIAL_REASON_TEXT] : null);

/** What `observed_at_basis` orders a page by, in a few words. */
export const BASIS_TEXT: Readonly<Record<string, string>> = {
  ORDER_UPDATED_AT: "order update time",
  FILL_TRADE_TIME: "fill trade time",
};
