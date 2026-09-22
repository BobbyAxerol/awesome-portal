/** Typed P21 Release Candidate composer/local-seal failures. */
export class ResearchReleaseCandidateError extends Error {
  constructor(
    readonly code:
      | "RESEARCH_RELEASE_CANDIDATE_INVALID"
      | "RESEARCH_RELEASE_CANDIDATE_FORBIDDEN"
      | "RESEARCH_RELEASE_CANDIDATE_NOT_FOUND"
      | "RESEARCH_RELEASE_CANDIDATE_CONFLICT"
      | "RESEARCH_RELEASE_CANDIDATE_NOT_PUBLISHABLE"
      | "RESEARCH_RELEASE_CANDIDATE_UNAVAILABLE",
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 422 | 503,
  ) {
    super(message);
    this.name = "ResearchReleaseCandidateError";
  }
}
