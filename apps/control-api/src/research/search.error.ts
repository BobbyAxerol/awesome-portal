/** Typed P15 Search / ledger / diagnostics BFF failures. */
export class ResearchSearchError extends Error {
  constructor(
    readonly code:
      | "RESEARCH_SEARCH_INVALID"
      | "RESEARCH_SEARCH_FORBIDDEN"
      | "RESEARCH_SEARCH_NOT_FOUND"
      | "RESEARCH_SEARCH_CONFLICT"
      | "RESEARCH_SEARCH_UNAVAILABLE",
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 503,
  ) {
    super(message);
    this.name = "ResearchSearchError";
  }
}
