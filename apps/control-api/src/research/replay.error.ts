/** Typed P17 route-aware replay BFF failures. */
export class ResearchReplayError extends Error {
  constructor(
    readonly code:
      | "RESEARCH_REPLAY_INVALID"
      | "RESEARCH_REPLAY_CURSOR_INVALID"
      | "RESEARCH_REPLAY_FORBIDDEN"
      | "RESEARCH_REPLAY_NOT_FOUND"
      | "RESEARCH_REPLAY_UNAVAILABLE",
    message: string,
    readonly status: 400 | 403 | 404 | 503,
  ) {
    super(message);
    this.name = "ResearchReplayError";
  }
}
