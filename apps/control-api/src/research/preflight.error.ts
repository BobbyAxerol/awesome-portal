/** Fixed browser-facing P08 preflight vocabulary.
 *
 * The Control API translates known private-adapter outcomes into this narrow
 * set.  No private URL, HMAC principal, source path, raw market data or stack
 * ever becomes part of a same-origin error response.
 */
export class ResearchPreflightError extends Error {
  constructor(
    readonly code:
      | "RESEARCH_PREFLIGHT_INVALID"
      | "RESEARCH_PREFLIGHT_DATA_UNAVAILABLE"
      | "RESEARCH_PREFLIGHT_REQUIRED_COLUMNS_UNAVAILABLE"
      | "RESEARCH_PREFLIGHT_FUNDING_UNAVAILABLE"
      | "RESEARCH_PREFLIGHT_WARMUP_UNAVAILABLE"
      | "RESEARCH_PREFLIGHT_ROUTE_NOT_ADMITTED"
      | "RESEARCH_PREFLIGHT_ROUTE_UNKNOWN"
      | "RESEARCH_PREFLIGHT_RELEASE_STALE"
      | "RESEARCH_PREFLIGHT_TOPOLOGY_INVALID"
      | "RESEARCH_PREFLIGHT_TOPOLOGY_UNSUPPORTED"
      | "RESEARCH_PREFLIGHT_RESOURCE_REFUSED"
      | "RESEARCH_PREFLIGHT_SNAPSHOT_TOO_LARGE"
      | "RESEARCH_PREFLIGHT_UNAVAILABLE"
      | "RESEARCH_PREFLIGHT_REJECTED"
      | "RESEARCH_PREFLIGHT_NOT_FOUND"
      | "RESEARCH_PREFLIGHT_EXPIRED"
      | "RESEARCH_PREFLIGHT_STALE",
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 502 | 503,
  ) {
    super(message);
    this.name = "ResearchPreflightError";
  }
}
