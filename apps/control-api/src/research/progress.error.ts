/** Typed P11 public and private-progress boundary errors. */
export class ResearchProgressError extends Error {
  constructor(
    readonly code:
      | "RESEARCH_PROGRESS_INVALID"
      | "RESEARCH_PROGRESS_NOT_FOUND"
      | "RESEARCH_PROGRESS_FORBIDDEN"
      | "RESEARCH_PROGRESS_UNAVAILABLE"
      | "RESEARCH_PROGRESS_STREAM_BUSY"
      | "RESEARCH_PROGRESS_SOURCE_REJECTED"
      | "RESEARCH_PROGRESS_STALE_LEASE"
      | "RESEARCH_PROGRESS_CONFLICT"
      | "RESEARCH_PROGRESS_CANCEL_PENDING"
      | "RESEARCH_PROGRESS_CANCEL_NOT_ALLOWED"
      | "RESEARCH_RUN_REQUESTED_SPEC_NOT_RETAINED",
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 503,
  ) {
    super(message);
    this.name = "ResearchProgressError";
  }
}
