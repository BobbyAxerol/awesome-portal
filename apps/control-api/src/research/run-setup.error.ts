import type { ResearchPreflightErrorDetails } from "./preflight.error";

/** Setup-only vocabulary: does not widen P08/preflight/create authorization. */
export class ResearchRunSetupError extends Error {
  constructor(readonly code: "RESEARCH_SETUP_OPTIONS_STALE" | "RESEARCH_SETUP_PROFILE_REFUSED" | "RESEARCH_SETUP_PREFERENCE_REFUSED",
    message: string, readonly status: 400 | 409, readonly details: ResearchPreflightErrorDetails & {reason_code?: string}) {
    super(message);
    this.name = "ResearchRunSetupError";
  }
}
