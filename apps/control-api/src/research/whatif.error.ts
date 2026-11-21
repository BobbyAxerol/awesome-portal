/** Typed W5a A10c what-if failures (Screen 07 sandbox + diagnostic job). */
export class ResearchWhatIfError extends Error {
  constructor(
    readonly code:
      | "RESEARCH_WHATIF_INVALID"
      | "RESEARCH_WHATIF_FORBIDDEN"
      | "RESEARCH_WHATIF_NOT_FOUND"
      | "RESEARCH_WHATIF_NOT_APPLICABLE"
      | "RESEARCH_WHATIF_BLOCKED"
      | "RESEARCH_WHATIF_GRID_CHANGED"
      | "RESEARCH_WHATIF_IN_FLIGHT"
      | "RESEARCH_WHATIF_CONFLICT"
      | "RESEARCH_WHATIF_UPSTREAM_REJECTED"
      | "RESEARCH_WHATIF_ADMISSION_SATURATED"
      | "RESEARCH_WHATIF_UNAVAILABLE",
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 502 | 503,
  ) {
    super(message);
    this.name = "ResearchWhatIfError";
  }
}
