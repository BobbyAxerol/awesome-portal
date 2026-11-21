import type { ResearchPreflightErrorDetails } from "./preflight.error";

/** Metadata-only vocabulary must not expand the accepted P08 error union. */
export class ResearchDatasetIndexError extends Error {
  readonly code = "WINDOW_BOUND_NOT_ALIGNED";
  readonly status = 400;
  constructor(readonly details: ResearchPreflightErrorDetails) {
    super("Align window bounds to the selected UTC bar interval.");
    this.name = "ResearchDatasetIndexError";
  }
}
