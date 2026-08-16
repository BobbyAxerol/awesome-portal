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
export type PortalErrorResponse = Schemas["PortalErrorResponse"];

/** Runtime health of a capability. Drives every badge (handoff §3). */
export type AvailabilityState = CapabilityAvailability["state"];
/** Static registry metadata. Never used for runtime badges (handoff §3). */
export type FeatureMaturity = PortalFeatureDefinition["maturity"];
export type FeatureDataMode = PortalFeatureDefinition["data_mode"];
export type FeatureGroupId = FeatureGroupDefinition["id"];
export type PortalEnvironment = PortalSummaryV1["environment"];
export type AvailabilityReasonCode = NonNullable<CapabilityAvailability["reason_code"]>;

/**
 * Envelope of a single entry in `PortalSummarySection.metrics`.
 *
 * DISCREPANCY (evidence: `packages/contracts/generated/portal-api.d.ts`,
 * `PortalSummarySection.metrics` is `{ [key: string]: unknown }`): the canonical
 * fixtures in `apps/portal/registry/fixtures/summary.*.json` all carry the
 * shape below, but OpenAPI does not name it, so codegen erases it. Rather than
 * invent a second model we narrow the untyped field at the boundary with
 * `readMetric()` and raised a Backend request to publish `SummaryMetric` in
 * `components/schemas`.
 */
export interface SummaryMetric {
  availability: CapabilityAvailability;
  segment: string | null;
  source_artifact_digest: string | null;
  timezone: string | null;
  unit: string | null;
  value: number | string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Narrows one metric out of the untyped `metrics` map.
 *
 * Returns `null` when the key is absent or malformed. Callers must treat that
 * as "no authority for this number" and render an unavailable state — never a
 * zero (handoff §4).
 */
export function readMetric(
  section: PortalSummarySection,
  key: string,
): SummaryMetric | null {
  const raw = section.metrics[key];
  if (!isRecord(raw)) return null;
  const availability = raw.availability;
  if (!isRecord(availability) || typeof availability.state !== "string") return null;
  const value = raw.value;
  const valueOk = value === null || typeof value === "number" || typeof value === "string";
  if (!valueOk) return null;
  return {
    availability: availability as unknown as CapabilityAvailability,
    segment: typeof raw.segment === "string" ? raw.segment : null,
    source_artifact_digest:
      typeof raw.source_artifact_digest === "string" ? raw.source_artifact_digest : null,
    timezone: typeof raw.timezone === "string" ? raw.timezone : null,
    unit: typeof raw.unit === "string" ? raw.unit : null,
    value,
  };
}
