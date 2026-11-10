import { retainedReview } from "../execution/retained-read-profile";

/**
 * Bootstrap-only (B3). The typed-absence reads mount only on the retained-review profile, the stack whose Execution reads are a closed,
 * read-only set. It derives from the existing profile and adds no configuration flag, no source and no authority: the mounted routes
 * answer the published contract's own "no owning source" body and nothing else.
 *
 * AppModule key: `typedAbsence?: "SOURCE_DARK"` (see TypedAbsenceController).
 */
export function typedAbsenceDependency(config: { EXECUTION_READ_PROFILE?: string }): { typedAbsence?: "SOURCE_DARK" } {
  return retainedReview(config) ? { typedAbsence: "SOURCE_DARK" } : {};
}
