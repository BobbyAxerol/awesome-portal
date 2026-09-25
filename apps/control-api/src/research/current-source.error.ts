/** Typed failures for the additive RS-02 retained current-source lane. */
export class ResearchCurrentSourceError extends Error {
  constructor(
    readonly code:
      | "RESEARCH_CURRENT_SOURCE_INVALID"
      | "RESEARCH_CURRENT_SOURCE_FORBIDDEN"
      | "RESEARCH_CURRENT_SOURCE_NOT_FOUND"
      | "RESEARCH_CURRENT_SOURCE_CONFLICT"
      | "RESEARCH_CURRENT_SOURCE_CURSOR_EXPIRED"
      | "RESEARCH_CURRENT_SOURCE_UNAVAILABLE"
      // W5b (P17-T04): a retained relation read back with a hole in its
      // dense sealed ordinals. Never retried into a fabricated row.
      | "RESEARCH_CURRENT_SOURCE_SEQUENCE_GAP",
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 503,
    /**
     * RF-05 CG-P13-09: machine-readable refusal state. Serialized as the
     * Problem body's `details`; never carries a path, table or lease.
     */
    readonly details?: {
      lane_state: "PENDING_SOURCE" | "PENDING_RETENTION" | "NOT_RETAINED_LEGACY" | "NOT_RETAINED_TERMINAL";
      effective_status: string;
    },
  ) {
    super(message);
    this.name = "ResearchCurrentSourceError";
  }
}
