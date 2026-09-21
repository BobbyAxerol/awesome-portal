/** P10's fixed same-origin command vocabulary. */
export class ResearchRunCreateError extends Error {
  constructor(
    readonly code:
      | "RESEARCH_RUN_CREATE_INVALID"
      | "RESEARCH_RUN_CREATE_FORBIDDEN"
      | "RESEARCH_RUN_PREFLIGHT_NOT_READY"
      | "RESEARCH_RUN_PREFLIGHT_STALE"
      | "RESEARCH_RUN_ALPHA_NOT_ACTIVE"
      | "RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE"
      | "RESEARCH_RUN_PRODUCER_UNAVAILABLE"
      | "RESEARCH_RUN_TRANSPORT_UNKNOWN"
      | "RESEARCH_RUN_UPSTREAM_REJECTED"
      | "RESEARCH_RUN_NOT_FOUND",
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 502 | 503,
  ) {
    super(message);
    this.name = "ResearchRunCreateError";
  }
}
