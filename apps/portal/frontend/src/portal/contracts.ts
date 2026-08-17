/**
 * Portal contract types — re-exported from the generated OpenAPI types.
 *
 * There is exactly one feature model (FRONTEND_HANDOFF §2). Nothing in this
 * file hand-writes a shape that the backend already publishes; it only names
 * the generated types so feature code does not have to spell out
 * `components["schemas"][...]` everywhere.
 *
 * Regenerate the source with `apps/portal/scripts/export_handoff_contract.py`
 * and `packages/contracts` → `npm run generate`.
 */
import type { components } from "@portal/contracts";

type Schemas = components["schemas"];

export type PortalRegistryDocument = Schemas["PortalRegistryDocument"];
export type PortalFeatureDefinition = Schemas["PortalFeatureDefinition"];
export type FeatureGroupDefinition = Schemas["FeatureGroupDefinition"];
export type LifecycleStageDefinition = Schemas["LifecycleStageDefinition"];
export type ScreenContract = Schemas["ScreenContract"];
export type ConcernDefinition = Schemas["ConcernDefinition"];

export type PortalSummaryV1 = Schemas["PortalSummaryV1"];
export type PortalSummarySection = Schemas["PortalSummarySection"];
export type CapabilityAvailability = Schemas["CapabilityAvailability"];
export type PriorityItem = Schemas["PriorityItem"];
export type SummaryWarning = Schemas["SummaryWarning"];
export type SummaryLinkItem = Schemas["SummaryLinkItem"];
export type RegistryCounts = Schemas["RegistryCounts"];

export type PortalLinksDocument = Schemas["PortalLinksDocument"];

/** QuantBT runtime contract for a built-in strategy (`GET /api/strategies`). */
export type StrategyResponse = Schemas["StrategyResponse"];
export type ParameterSpaceConfig = Schemas["ParameterSpaceConfig"];
export type PortalErrorResponse = Schemas["PortalErrorResponse"];

/**
 * Imported-alpha and engine-capability projections.
 *
 * Both were untyped in v1 (`/api/v1/alphas` was `additionalProperties: true`,
 * `/api/v1/portal/capabilities` was `{}`) and the frontend narrowed them by
 * hand. The backend published named schemas on 2026-08-17, so the boundary
 * parsers in `strategyCatalog.ts` now narrow *to these types* — a field rename
 * upstream breaks the build instead of silently producing `undefined`.
 */
export type AlphaRegistryDocument = Schemas["AlphaRegistryDocument"];
export type AlphaSummary = Schemas["AlphaSummary"];
export type EngineCapabilitiesDocument = Schemas["EngineCapabilitiesDocument"];
export type CapabilityPublic = Schemas["CapabilityPublic"];
export type CapabilityRequirements = Schemas["CapabilityRequirements"];
export type EngineReleasePublic = Schemas["EngineReleasePublic"];

/**
 * Envelope of a single entry in `PortalSummarySection.metrics`.
 *
 * This was hand-narrowed in v1 because OpenAPI left `metrics` as
 * `{ [key: string]: unknown }`. The backend now publishes `EvidenceValue`, so
 * the shape is the generated one and the local interface is gone.
 */
export type SummaryMetric = Schemas["EvidenceValue"];

/** Runtime health of a capability. Drives every badge (handoff §3). */
export type AvailabilityState = CapabilityAvailability["state"];
/** Static registry metadata. Never used for runtime badges (handoff §3). */
export type FeatureMaturity = PortalFeatureDefinition["maturity"];
export type FeatureDataMode = PortalFeatureDefinition["data_mode"];
export type FeatureGroupId = FeatureGroupDefinition["id"];
export type PortalEnvironment = PortalSummaryV1["environment"];
export type AvailabilityReasonCode = NonNullable<CapabilityAvailability["reason_code"]>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reads one metric out of the metrics map.
 *
 * The map is typed now, but the guard stays: a response is network input, and
 * a key that is absent or malformed must read as "no authority for this
 * number" — an unavailable state, never a zero (handoff §4). Returning `null`
 * is what keeps that decision at the call site instead of defaulting here.
 */
export function readMetric(
  section: PortalSummarySection,
  key: string,
): SummaryMetric | null {
  const raw: unknown = section.metrics[key];
  if (!isRecord(raw)) return null;
  const availability = raw.availability;
  if (!isRecord(availability) || typeof availability.state !== "string") return null;
  const value = raw.value;
  const valueOk = value === null || typeof value === "number" || typeof value === "string";
  if (!valueOk) return null;
  return raw as unknown as SummaryMetric;
}
