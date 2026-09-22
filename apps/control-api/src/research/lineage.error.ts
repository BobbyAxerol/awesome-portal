/** Typed P19 Attempt Lineage reader failures. */
export class ResearchLineageError extends Error {
  constructor(
    readonly code:
      | "RESEARCH_LINEAGE_INVALID"
      | "RESEARCH_LINEAGE_NOT_FOUND"
      | "RESEARCH_LINEAGE_FORBIDDEN"
      | "RESEARCH_LINEAGE_UNAVAILABLE",
    message: string,
    readonly status: 400 | 403 | 404 | 503,
  ) {
    super(message);
    this.name = "ResearchLineageError";
  }
}
