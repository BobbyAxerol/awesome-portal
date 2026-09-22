/** Typed failures for the additive RS-02 retained current-source lane. */
export class ResearchCurrentSourceError extends Error {
  constructor(
    readonly code:
      | "RESEARCH_CURRENT_SOURCE_INVALID"
      | "RESEARCH_CURRENT_SOURCE_FORBIDDEN"
      | "RESEARCH_CURRENT_SOURCE_NOT_FOUND"
      | "RESEARCH_CURRENT_SOURCE_CONFLICT"
      | "RESEARCH_CURRENT_SOURCE_CURSOR_EXPIRED"
      | "RESEARCH_CURRENT_SOURCE_UNAVAILABLE",
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 503,
  ) {
    super(message);
    this.name = "ResearchCurrentSourceError";
  }
}
