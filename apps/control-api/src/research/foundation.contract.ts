import { z } from "zod";
import type { ResearchJourneyDescriptor } from "./journey.descriptor.v2";

const Identifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/);
const WorkspaceId = z.string().regex(/^[A-Za-z0-9._-]{1,128}$/).optional();

/** The codec this vocabulary implements (RF01-B4). */
export const RESEARCH_CURSOR_CODEC = "p02-cursor.v2" as const;

/**
 * `stage` is presentation-only: it names the open evidence tab and never
 * selects, filters or authorizes anything. It is the one key with a closed set.
 */
export const RESEARCH_CURSOR_STAGES = [
  "summary", "split", "search", "freeze", "execute", "claim", "atlas",
] as const;

/** The ordered P02 browser inspection vocabulary; every value but `stage` stays opaque. */
export const RESEARCH_CURSOR_KEYS = [
  "stage", "fold", "study", "trial", "pick", "params", "trade", "seq", "event_seq",
  "mode", "schedule", "route", "playback_ordinal",
] as const;

const CursorFields = Object.fromEntries(RESEARCH_CURSOR_KEYS.map((key) => [
  key,
  key === "stage" ? z.enum(RESEARCH_CURSOR_STAGES).optional() : Identifier.optional(),
]));

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
  codec: typeof RESEARCH_CURSOR_CODEC;
  /** P02 semantic: a `pick` is inspection-only and cannot select/promote. */
  pick_effect: "INSPECTION_ONLY";
  ambiguity_state: "NOT_APPLICABLE" | "RESOLVED" | "UNRESOLVED_NO_RUN_CONTEXT";
}

export interface ResearchJourneyResponse {
  schema_version: "research.journey-response.v1";
  descriptor: ResearchJourneyDescriptor & { content_sha256: string };
  inspection: ResearchInspectionCursor;
  etag: string;
}

/** Exact P04 capability-axis vocabulary, kept strict through the P09 BFF. */
const CapabilityAxesSchema = z.object({
  engine: z.enum(["ENGINE_SUPPORTED", "ENGINE_PARTIAL", "ENGINE_DEFERRED"]),
  integration: z.enum(["ADAPTER_AVAILABLE", "INTEGRATION_GAP", "DEFERRED_BY_PORTAL"]),
  evidence: z.enum(["EVIDENCE_MAPPED", "EVIDENCE_GAP", "NOT_APPLICABLE"]),
  admission: z.enum(["P04_BASELINE_ONLY", "NOT_ADMITTED", "DEFERRED"]),
}).strict();

/** Exact P04 manifest claim. It has no execution authority. */
const ClaimDescriptorSchema = z.object({
  contract_id: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/),
  engine_certification: z.string().regex(/^[A-Z][A-Z0-9_-]{1,63}$/),
  numeric_guarantee: z.string().min(1).max(400),
  never_claims: z.string().min(1).max(500),
}).strict();

/** P04's declared evidence envelope; P09 neither writes it nor starts work. */
const EvidenceContractSchema = z.object({
  schema_id: z.literal("research-run-evidence.v1"),
  required_fields: z.array(z.enum([
    "engine_release_id", "route_id", "effective_spec_digest", "market_data_content_hash",
    "report_level", "selection_resolution", "result_summary",
  ])).length(7).refine((fields) => new Set(fields).size === fields.length, "required_fields must be unique."),
  writer_state: z.literal("P05_OWNED_NOT_ACTIVE"),
}).strict();

/** Small strict validation boundary for a private P04 Atlas document. */
const AtlasRouteSchema = z.object({
  route_id: Identifier,
  family: z.string().min(1).max(128),
  execution_contract: z.string().min(1).max(191),
  backend: z.string().min(1).max(191),
  report_levels: z.array(z.string().min(1).max(64)).min(1).max(16),
  default_for_new_runs: z.boolean(),
  axes: CapabilityAxesSchema,
  reason: z.string().min(1).max(1024),
  required_input_class: z.string().min(1).max(191),
}).strict();

/** RF02-B1: where a mode fact is stated in the pinned engine package. */
const SourceLocatorSchema = z.object({
  path: z.string().regex(/^quantbt\/[A-Za-z0-9_./-]{1,200}\.py$/),
  lines: z.string().regex(/^[1-9][0-9]{0,5}-[1-9][0-9]{0,5}$/),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  anchor: z.string().min(1).max(200),
}).strict();
const SourcesSchema = z.array(SourceLocatorSchema).min(1).max(4);
const FactToken = z.string().regex(/^[a-z][a-z0-9_]{1,79}$/);
const NotPublishedFactSchema = z.object({
  state: z.literal("NOT_PUBLISHED"),
  reason: z.string().min(1).max(400),
  source: SourceLocatorSchema.nullable().optional(),
}).strict();
const ScheduleFactSchema = z.object({
  schedule: z.enum(["global", "per_fold_decay", "per_fold_causal"]),
  validation_claim: FactToken,
  chronological_validation_claim: FactToken,
  causality_claim: FactToken,
  causality_schedule_v2: z.enum([
    "retrospective_global_v2", "trusted_strategy_global_v2", "engine_enforced_per_fold_v2", "engine_enforced_nested_v2",
  ]),
  oos_use: z.enum(["USED", "NOT_USED"]),
  oos_use_condition: z.string().min(1).max(300).nullable().optional(),
  params_semantics: FactToken,
  cert_cap: NotPublishedFactSchema,
  source: SourcesSchema,
}).strict();
const ObjectiveFactSchema = z.object({
  state: z.literal("PUBLISHED"),
  direction: z.enum(["maximize", "minimize"]),
  selection_metrics: z.array(z.string().min(1).max(80)).min(1).max(8),
  stages: z.array(z.object({
    stage: z.enum(["is_search", "oos_candidate_selection", "fixed_or_post_selection_evaluation"]),
    formula_id: FactToken,
    formula: z.string().min(1).max(300),
  }).strict()).min(1).max(4),
  coefficients: z.array(z.object({
    name: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/),
    release_default: z.string().regex(/^-?[0-9]+(\.[0-9]+)?$/).nullable().optional(),
    note: z.string().min(1).max(200).nullable().optional(),
  }).strict()).max(8),
  note: z.string().min(1).max(300).nullable().optional(),
  source: SourcesSchema,
}).strict();
const ReadsFactSchema = z.object({
  state: z.literal("PUBLISHED"),
  selection_inputs: z.array(z.string().min(1).max(80)).min(1).max(8),
  retention: z.string().regex(/^[a-z][a-z0-9_]{1,119}$/),
  source: SourcesSchema,
}).strict();
const ModeFactsSchema = z.object({
  source_release_id: z.string().regex(/^er_[a-z0-9_]{1,40}$/),
  schedules: z.array(ScheduleFactSchema).min(1).max(3),
  objective: z.union([ObjectiveFactSchema, NotPublishedFactSchema]),
  reads: z.union([ReadsFactSchema, NotPublishedFactSchema]),
  avoid_when: NotPublishedFactSchema,
}).strict();

const AtlasModeSchema = z.object({
  mode_id: Identifier,
  display_name: z.string().min(1).max(191),
  valid_schedules: z.array(z.string().min(1).max(191)).min(1).max(16),
  invalid_schedules: z.array(z.object({
    schedule: z.enum(["global", "per_fold_decay", "per_fold_causal"]),
    admission: z.literal("NOT_ADMITTED"),
    reason: z.string().min(1).max(400),
    source: SourcesSchema,
  }).strict()).max(3).optional(),
  default_schedule: z.string().min(1).max(191),
  objective_summary: z.string().min(1).max(1024),
  suspect: z.string().min(1).max(1024),
  artifact_fields: z.array(z.string().min(1).max(191)).min(1).max(16),
  when_to_use: z.string().min(1).max(1024),
  rules: z.array(z.string().min(1).max(1024)).min(1).max(4),
  /** RF02-B1, additive: absent on a manifest written before the facts existed. */
  facts: ModeFactsSchema.optional(),
}).strict();

/** Scalar-only release default values: no arbitrary config object reaches a browser. */
const AtlasOptimizerDefaultScalarSchema = z.union([
  z.string().max(191), z.number().finite(), z.boolean(), z.null(),
]);
const AtlasOptimizerDefaultValueSchema = z.union([
  AtlasOptimizerDefaultScalarSchema,
  z.array(AtlasOptimizerDefaultScalarSchema).min(1).max(16),
]);
const AtlasOptimizerDefaultFieldSchema = z.object({
  field_id: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/),
  default_value: AtlasOptimizerDefaultValueSchema,
  value_source: z.literal("RELEASE_DEFAULT"),
  override_state: z.enum(["LOCKED", "OVERRIDE_ALLOWED"]),
  detail: z.string().min(1).max(400),
}).strict();
const AtlasOptimizerGroupSchema = z.object({
  group_id: z.enum(["study", "sampler", "objective", "candidate_selection"]),
  fields: z.array(AtlasOptimizerDefaultFieldSchema).min(1).max(24),
}).strict();
const AtlasOptimizerDefaultsSchema = z.object({
  schema_version: z.literal("research.optimizer-defaults.v1"),
  groups: z.tuple([
    AtlasOptimizerGroupSchema.extend({ group_id: z.literal("study") }),
    AtlasOptimizerGroupSchema.extend({ group_id: z.literal("sampler") }),
    AtlasOptimizerGroupSchema.extend({ group_id: z.literal("objective") }),
    AtlasOptimizerGroupSchema.extend({ group_id: z.literal("candidate_selection") }),
  ]),
}).strict();
const AtlasSubmissionConstraintsSchema = z.object({
  profile_id: z.literal("p10.fixed-qualification.v1"),
  optimization_overrides: z.literal("FORBIDDEN"),
  accepted_trial_count: z.literal(1),
  early_stopping: z.literal("MUST_BE_NULL"),
  random_seed: z.literal("MUST_BE_NULL"),
  reason: z.string().min(1).max(500),
}).strict();

/** RF02-B2: published walk-forward values, each with the Portal's admission. */
const WalkForwardOptionValueSchema = z.object({
  value: z.string().regex(/^[a-z][a-z0-9_]{1,31}$/),
  admission: z.enum(["ADMITTED", "NOT_ADMITTED"]),
  reason: z.string().min(1).max(400).nullable().optional(),
}).strict();
const AtlasWalkForwardOptionsSchema = z.object({
  schema_version: z.literal("research.walk-forward-options.v1"),
  frequency: z.array(WalkForwardOptionValueSchema).min(1).max(8),
  frequency_default: z.string().regex(/^[a-z][a-z0-9_]{1,31}$/),
  window_mode: z.array(WalkForwardOptionValueSchema).min(1).max(4),
  window_mode_default: z.string().regex(/^[a-z][a-z0-9_]{1,31}$/),
  split_mode_form: z.literal("source_instant"),
  split_mode_rule: z.string().min(1).max(400),
  source: SourcesSchema,
}).strict();

export const ResearchEngineAtlasPrivateSchema = z.object({
  schema_version: z.literal("research-engine-atlas.v1"),
  manifest_revision: z.number().int().positive(),
  current_release: z.object({
    release_id: Identifier, package: z.string().min(1).max(191), expected_version: z.string().min(1).max(191),
    installed_version: z.string().max(191).nullable().optional(), native_package: z.string().max(191).nullable().optional(),
    native_expected_version: z.string().max(191).nullable().optional(), native_installed_version: z.string().max(191).nullable().optional(),
    verified: z.boolean(), detail: z.string().max(1024).nullable().optional(),
    trial_ceiling: z.number().int().positive().max(100_000),
    optimizer_defaults: AtlasOptimizerDefaultsSchema,
    submission_constraints: AtlasSubmissionConstraintsSchema,
    walk_forward_options: AtlasWalkForwardOptionsSchema.nullable().optional(),
    config_digest: z.string().regex(/^[0-9a-f]{64}$/).nullable().optional(),
  }).strict(),
  historical_releases: z.array(z.object({
    release_id: Identifier, package: z.string().min(1).max(191), version: z.string().min(1).max(191),
    status: z.literal("HISTORICAL_IDENTITY_RETAINED"),
  }).strict()).max(8),
  routes: z.array(AtlasRouteSchema).min(1).max(32),
  modes: z.array(AtlasModeSchema).min(1).max(8),
  // These exact P04 shapes are emitted as shared P09 OpenAPI components too.
  // A browser may render facts but cannot widen them into run authority.
  claims: z.array(ClaimDescriptorSchema).min(1).max(16),
  evidence_contract: EvidenceContractSchema,
}).strict();

export type ResearchEngineAtlasPrivate = z.infer<typeof ResearchEngineAtlasPrivateSchema>;

export type ResearchAtlasResponse = {
  schema_version: "research.engine-atlas-response.v1";
  selected_release_id: string;
  selected_release_kind: "CURRENT";
  atlas: ResearchEngineAtlasPrivate;
  historical_identity: null;
  etag: string;
} | {
  schema_version: "research.engine-atlas-response.v1";
  selected_release_id: string;
  selected_release_kind: "HISTORICAL";
  atlas: null;
  historical_identity: ResearchEngineAtlasPrivate["historical_releases"][number] & {
    facts_state: "NOT_PUBLISHED";
    facts_reason: string;
  };
  etag: string;
};
