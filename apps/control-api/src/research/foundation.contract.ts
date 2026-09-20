import { z } from "zod";

const Identifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/);
const WorkspaceId = z.string().regex(/^[A-Za-z0-9._-]{1,128}$/).optional();

/** The ordered P02 browser inspection vocabulary; each value stays opaque. */
export const RESEARCH_CURSOR_KEYS = [
  "fold", "study", "trial", "pick", "params", "trade", "seq", "event_seq",
  "mode", "schedule", "route", "playback_ordinal",
] as const;

const CursorFields = Object.fromEntries(RESEARCH_CURSOR_KEYS.map((key) => [key, Identifier.optional()]));

export const ResearchJourneyQuerySchema = z.object({
  workspace_id: WorkspaceId,
  run_id: Identifier.optional(),
  ...CursorFields,
}).strict();

export const ResearchAtlasQuerySchema = z.object({
  workspace_id: WorkspaceId,
  release_id: Identifier.optional(),
  route: Identifier.optional(),
  mode: Identifier.optional(),
}).strict();

export type ResearchJourneyQuery = z.infer<typeof ResearchJourneyQuerySchema>;
export type ResearchAtlasQuery = z.infer<typeof ResearchAtlasQuerySchema>;

export interface ResearchJourneyRegistryRecord {
  descriptorId: string;
  schemaVersion: string;
  revision: number;
  contentSha256: string;
}

export interface ResearchInspectionCursor {
  cursor: Partial<Record<(typeof RESEARCH_CURSOR_KEYS)[number], string>>;
  canonical_query: string;
  /** P02 semantic: a `pick` is inspection-only and cannot select/promote. */
  pick_effect: "INSPECTION_ONLY";
  ambiguity_state: "NOT_APPLICABLE" | "RESOLVED" | "UNRESOLVED_NO_RUN_CONTEXT";
}

export interface ResearchJourneyResponse {
  schema_version: "research.journey-response.v1";
  descriptor: {
    schema_version: "research.journey.v1";
    descriptor_id: string;
    revision: number;
    content_sha256: string;
    phases: readonly unknown[];
  };
  inspection: ResearchInspectionCursor;
  etag: string;
}

/** Small strict validation boundary for a private P04 Atlas document. */
const AtlasRouteSchema = z.object({
  route_id: Identifier,
  family: z.string().min(1).max(128),
  execution_contract: z.string().min(1).max(191),
  backend: z.string().min(1).max(191),
  report_levels: z.array(z.string().min(1).max(64)).min(1).max(16),
  default_for_new_runs: z.boolean(),
  axes: z.object({
    engine: z.string().min(1).max(64), integration: z.string().min(1).max(64),
    evidence: z.string().min(1).max(64), admission: z.string().min(1).max(64),
  }).strict(),
  reason: z.string().min(1).max(1024),
  required_input_class: z.string().min(1).max(191),
}).strict();

const AtlasModeSchema = z.object({
  mode_id: Identifier,
  display_name: z.string().min(1).max(191),
  valid_schedules: z.array(z.string().min(1).max(191)).min(1).max(16),
  default_schedule: z.string().min(1).max(191),
  objective_summary: z.string().min(1).max(1024),
  suspect: z.string().min(1).max(1024),
  artifact_fields: z.array(z.string().min(1).max(191)).min(1).max(16),
  when_to_use: z.string().min(1).max(1024),
  rules: z.array(z.string().min(1).max(1024)).min(1).max(4),
}).strict();

export const ResearchEngineAtlasPrivateSchema = z.object({
  schema_version: z.literal("research-engine-atlas.v1"),
  manifest_revision: z.number().int().positive(),
  current_release: z.object({
    release_id: Identifier, package: z.string().min(1).max(191), expected_version: z.string().min(1).max(191),
    installed_version: z.string().max(191).nullable().optional(), native_package: z.string().max(191).nullable().optional(),
    native_expected_version: z.string().max(191).nullable().optional(), native_installed_version: z.string().max(191).nullable().optional(),
    verified: z.boolean(), detail: z.string().max(1024).nullable().optional(),
  }).strict(),
  historical_releases: z.array(z.object({
    release_id: Identifier, package: z.string().min(1).max(191), version: z.string().min(1).max(191),
    status: z.literal("HISTORICAL_IDENTITY_RETAINED"),
  }).strict()).max(8),
  routes: z.array(AtlasRouteSchema).length(14),
  modes: z.array(AtlasModeSchema).length(5),
  // Claims/evidence are already manifest-owned P04 objects. They are passed
  // through only after the bounded private response parser has accepted them.
  claims: z.array(z.record(z.unknown())).length(7),
  evidence_contract: z.record(z.unknown()),
}).strict();

export type ResearchEngineAtlasPrivate = z.infer<typeof ResearchEngineAtlasPrivateSchema>;

export interface ResearchAtlasResponse {
  schema_version: "research.engine-atlas-response.v1";
  selected_release_id: string;
  selected_release_kind: "CURRENT" | "HISTORICAL";
  atlas: ResearchEngineAtlasPrivate;
  etag: string;
}
