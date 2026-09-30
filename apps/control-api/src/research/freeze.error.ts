/** Typed P16 Freeze / integrity BFF failures. */
export class ResearchFreezeError extends Error {
  constructor(
    readonly code:
      | "RESEARCH_FREEZE_INVALID"
      | "RESEARCH_FREEZE_FORBIDDEN"
      | "RESEARCH_FREEZE_NOT_FOUND"
      | "RESEARCH_FREEZE_ADMISSION_SATURATED"
      | "RESEARCH_FREEZE_UNAVAILABLE",
    message: string,
    readonly status: 400 | 403 | 404 | 503,
  ) {
    super(message);
    this.name = "ResearchFreezeError";
  }
}
