import type { EquityBandSection, EquitySeriesSection, EquityProjectionSourceQuery } from "./equity-projection-source.contract";

/** Injection token for the source port. Only the dark implementation exists in production code. */
export const EQUITY_PROJECTION_SOURCE_PORT = Symbol("EQUITY_PROJECTION_SOURCE_PORT");
/** Optional injection token for a field-authority override. Unbound in production (deny-all default). */
export const EQUITY_FIELD_AUTHORITY = Symbol("EQUITY_FIELD_AUTHORITY");
export interface EquitySourceIdentity { readonly workspaceId: string; readonly deploymentId: string; readonly environment: "paper" | "sandbox" | "live"; }
export type EquitySourceRequest = EquitySourceIdentity & Pick<EquityProjectionSourceQuery, "window" | "intent" | "limit" | "cursor"> & { readonly nowMs: number };
/** A port answers for an identity; the service refuses an answer for any other workspace/deployment/environment. */
export interface EquityPortAnswer<S> { readonly identity: EquitySourceIdentity; readonly section: S; }
export interface EquityProjectionSourcePort {
  series(request: EquitySourceRequest): Promise<EquityPortAnswer<EquitySeriesSection>>;
  band(request: EquitySourceRequest): Promise<EquityPortAnswer<EquityBandSection>>;
}
