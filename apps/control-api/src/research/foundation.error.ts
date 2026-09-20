/** Fixed P09 same-origin read vocabulary. No private transport fact leaks. */
export class ResearchFoundationError extends Error {
  constructor(
    readonly code:
      | "RESEARCH_FOUNDATION_INVALID"
      | "RESEARCH_FOUNDATION_NOT_FOUND"
      | "RESEARCH_FOUNDATION_CURSOR_STUDY_REQUIRED"
      | "RESEARCH_FOUNDATION_DESCRIPTOR_MISMATCH"
      | "RESEARCH_FOUNDATION_RELEASE_NOT_FOUND"
      | "RESEARCH_FOUNDATION_ROUTE_NOT_FOUND"
      | "RESEARCH_FOUNDATION_CAPABILITY_NOT_FOUND"
      | "RESEARCH_FOUNDATION_UNAVAILABLE"
      | "RESEARCH_FOUNDATION_REJECTED",
    message: string,
    readonly status: 400 | 404 | 409 | 502 | 503,
  ) {
    super(message);
    this.name = "ResearchFoundationError";
  }
}
