/** Typed P14 Split / chronology BFF failures. */
export class ResearchSplitError extends Error {
  constructor(
    readonly code:
      | "RESEARCH_SPLIT_INVALID"
      | "RESEARCH_SPLIT_NOT_FOUND"
      | "RESEARCH_SPLIT_FORBIDDEN"
      | "RESEARCH_SPLIT_CONFLICT"
      | "RESEARCH_SPLIT_UNAVAILABLE",
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 503,
  ) {
    super(message);
    this.name = "ResearchSplitError";
  }
}
