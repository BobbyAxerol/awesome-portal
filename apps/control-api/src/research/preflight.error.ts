/** Fixed browser-facing P08 preflight vocabulary.
 *
 * The Control API translates known private-adapter outcomes into this narrow
 * set.  No private URL, HMAC principal, source path, raw market data or stack
 * ever becomes part of a same-origin error response.
 */
export type ResearchPreflightErrorCode =
  | "RESEARCH_PREFLIGHT_INVALID"
  | "RESEARCH_PREFLIGHT_DATA_UNAVAILABLE"
  | "RESEARCH_PREFLIGHT_REQUIRED_COLUMNS_UNAVAILABLE"
  | "RESEARCH_PREFLIGHT_FUNDING_UNAVAILABLE"
  | "RESEARCH_PREFLIGHT_WARMUP_UNAVAILABLE"
  | "RESEARCH_PREFLIGHT_ROUTE_NOT_ADMITTED"
  | "RESEARCH_PREFLIGHT_ROUTE_UNKNOWN"
  | "RESEARCH_PREFLIGHT_RELEASE_STALE"
  | "RESEARCH_PREFLIGHT_SCHEDULE_NOT_ADMITTED"
  | "RESEARCH_PREFLIGHT_TOPOLOGY_INVALID"
  | "RESEARCH_PREFLIGHT_TOPOLOGY_UNSUPPORTED"
  | "RESEARCH_PREFLIGHT_RESOURCE_REFUSED"
  | "RESEARCH_PREFLIGHT_SNAPSHOT_TOO_LARGE"
  | "RESEARCH_PREFLIGHT_UNAVAILABLE"
  | "RESEARCH_PREFLIGHT_REJECTED"
  | "RESEARCH_PREFLIGHT_NOT_FOUND"
  | "RESEARCH_PREFLIGHT_EXPIRED"
  | "RESEARCH_PREFLIGHT_STALE";

/**
 * CG-P08-03: where a refusal points in the requested spec.
 *
 * `field_path` names the single failed field for a data-contract refusal;
 * `field_paths` lists every invalid field of a 400. Screen 02 maps either to
 * the wizard step that can fix it. Both are requested-spec keys only.
 */
export interface ResearchPreflightErrorDetails {
  gate?: string;
  field_path?: readonly string[];
  field_paths?: readonly (readonly string[])[];
}

export class ResearchPreflightError extends Error {
  constructor(
    readonly code: ResearchPreflightErrorCode,
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 502 | 503,
    readonly details?: ResearchPreflightErrorDetails,
  ) {
    super(message);
    this.name = "ResearchPreflightError";
  }
}
