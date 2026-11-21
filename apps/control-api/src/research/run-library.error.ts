/** Typed P12 same-origin Run Library read failures. */
export class ResearchRunLibraryError extends Error {
  constructor(
    readonly code:
      | "RESEARCH_RUN_LIBRARY_INVALID"
      | "RESEARCH_RUN_LIBRARY_NOT_FOUND"
      | "RESEARCH_RUN_LIBRARY_FORBIDDEN"
      | "RESEARCH_RUN_LIBRARY_UNAVAILABLE"
      | "RESEARCH_RUN_LIBRARY_CURSOR_INVALID",
    message: string,
    readonly status: 400 | 403 | 404 | 503,
  ) {
    super(message);
    this.name = "ResearchRunLibraryError";
  }
}
