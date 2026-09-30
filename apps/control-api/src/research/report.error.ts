/** Typed P18 Report / reproducible-export failures. */
export class ResearchReportError extends Error {
  constructor(
    readonly code:
      | "RESEARCH_REPORT_INVALID"
      | "RESEARCH_REPORT_FORBIDDEN"
      | "RESEARCH_REPORT_NOT_FOUND"
      | "RESEARCH_REPORT_NOT_READY"
      | "RESEARCH_REPORT_CONFLICT"
      | "RESEARCH_REPORT_EXPORT_NOT_READY"
      | "RESEARCH_REPORT_ADMISSION_SATURATED"
      | "RESEARCH_REPORT_UNAVAILABLE",
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 503,
  ) {
    super(message);
    this.name = "ResearchReportError";
  }
}
