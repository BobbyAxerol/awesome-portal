/** Typed P13 Evidence Flow failures. */
export class ResearchEvidenceError extends Error {
  constructor(
    readonly code:
      | "RESEARCH_EVIDENCE_INVALID"
      | "RESEARCH_EVIDENCE_NOT_FOUND"
      | "RESEARCH_EVIDENCE_FORBIDDEN"
      | "RESEARCH_EVIDENCE_CONFLICT"
      | "RESEARCH_EVIDENCE_UNAVAILABLE",
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 503,
  ) {
    super(message);
    this.name = "ResearchEvidenceError";
  }
}
