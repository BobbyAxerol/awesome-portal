/** Typed P20 Compare failures. */
export class ResearchCompareError extends Error {
  constructor(
    readonly code:
      | "RESEARCH_COMPARE_INVALID"
      | "RESEARCH_COMPARE_NOT_FOUND"
      | "RESEARCH_COMPARE_FORBIDDEN"
      | "RESEARCH_COMPARE_UNAVAILABLE",
    message: string,
    readonly status: 400 | 403 | 404 | 503,
  ) {
    super(message);
    this.name = "ResearchCompareError";
  }
}
