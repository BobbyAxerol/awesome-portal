/**
 * Research Loop P19 · Screen-10 Attempt Lineage contract.
 *
 * This is a read-only, same-origin DTO.  It carries only persisted Research
 * identity/lifecycle facts and a server-normalized allow-list diff.  It never
 * exposes preflight payloads, source paths, worker leases, raw artifacts,
 * delegated credentials, or a browser-selectable promotion rule.
 */

import { z } from "zod";

const WorkspaceIdSchema = z.string().regex(/^[A-Za-z0-9._-]{1,128}$/);
const AlphaIdSchema = z.string().regex(/^[a-z][a-z0-9-]{2,63}$/);
const OpaqueIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/);
const DigestSchema = z.string().regex(/^[0-9a-f]{64}$/);
const UtcMsSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const ResearchAttemptLineageQuerySchema = z.object({
  workspace_id: WorkspaceIdSchema.optional(),
  // A bounded graph prevents a single historical Alpha from holding a DB
  // connection or browser render hostage.  The response always declares an
  // exact total and a typed PARTIAL boundary if it cannot include all nodes.
  limit: z.coerce.number().int().min(1).max(128).default(128),
  /**
   * W6b CG-P19-09: an opaque, server-signed boundary this route issued in
   * `coverage.older_cursor`.  It pages strictly older attempts of the same
   * Alpha/workspace/limit; a browser cannot name a timestamp or an attempt.
   */
  cursor: z.string().min(1).max(4096).optional(),
}).strict();

export type ResearchAttemptLineageQuery = z.infer<typeof ResearchAttemptLineageQuerySchema>;

export const ResearchLineageAvailabilitySchema = z.object({
  state: z.enum(["AVAILABLE", "NOT_PUBLISHED", "PARTIAL", "NOT_APPLICABLE"]),
  reason_code: z.string().min(1).max(160).nullable(),
}).strict();

const ExactDecimalSchema = z.string().regex(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/).max(96);

/**
 * W6b CG-P19-04: the persisted P21 relation of one run, by the Run Library's
 * rule (a Portal-local sealed pack wins over the viewer's own draft).  It is a
 * reference only: no pack payload, no delivery/approval authority.
 */
export const ResearchLineageReleaseCandidateRefSchema = z.object({
  kind: z.enum(["LOCAL_SEAL", "ACTOR_DRAFT"]),
  release_candidate_id: z.string().regex(/^rc_[0-9A-HJKMNP-TV-Z]{26}$/).nullable(),
  draft_id: z.string().regex(/^rcd_[0-9A-HJKMNP-TV-Z]{26}$/).nullable(),
  run_id: OpaqueIdSchema,
  delivery_state: z.enum(["NOT_DELIVERED", "PENDING", "DELIVERED", "UNKNOWN"]).nullable(),
  approval_state: z.enum(["NOT_APPROVED", "PENDING", "APPROVED", "REJECTED", "UNKNOWN"]).nullable(),
  sealed_at_utc_ms: UtcMsSchema.nullable(),
}).strict();

/** W6b CG-P19-05: one retained per-run metric with its own source and scope. */
const RunMetricFactSchema = z.object({
  value: ExactDecimalSchema.nullable(),
  source: z.enum(["P13_EVIDENCE_PROJECTION", "RS02_RETAINED_SELECTED_TRIAL"]).nullable(),
  scope: z.enum(["OOS", "IS_PLUS_OOS", "CHILD_TAPE", "SELECTED_TRIAL_MEAN_ACROSS_FOLDS"]).nullable(),
  definition_id: z.string().regex(/^research\.[a-z0-9_.-]{3,120}$/).nullable(),
  availability: ResearchLineageAvailabilitySchema,
}).strict();

const RunFactsSchema = z.object({
  /** The Run Library/Screen-04 certificate: a grade only when the source issued one. */
  certificate: z.object({
    grade: z.enum(["A", "B", "C", "D"]).nullable(),
    availability: ResearchLineageAvailabilitySchema,
  }).strict(),
  /** The persisted Stage-5 claim state and its source sentence, verbatim. */
  claim: z.object({
    state: z.enum(["FORECAST", "NOT_ISSUED", "ISSUED"]).nullable(),
    text: z.string().min(1).max(1_024).nullable(),
    availability: ResearchLineageAvailabilitySchema,
    /** Same conservative, source-backed family vocabulary as P20 Compare. */
    family: z.enum([
      "STRICT_OUTER_OOS", "SELECTION_ADJUSTED_OOS", "WALK_FORWARD_OOS_COMPATIBILITY",
      "NONE_FULL_SAMPLE_CALIBRATION", "NOT_PUBLISHED",
    ]),
    family_origin: z.enum(["SOURCE_ATTESTED", "PORTAL_DERIVED_FROM_SOURCE_PROTOCOL", "NOT_PUBLISHED"]),
    family_availability: ResearchLineageAvailabilitySchema,
  }).strict(),
  oos_sharpe: RunMetricFactSchema,
  decay: RunMetricFactSchema,
}).strict();

export const LINEAGE_PRESENTATION_REASONS = [
  "PROMOTION_PICK", "RELEASE_CANDIDATE", "VERSION_FIRST_ATTEMPT", "GATES_RESET", "MATERIAL_CHANGES",
] as const;
const PresentationReasonSchema = z.enum(LINEAGE_PRESENTATION_REASONS);

export const LINEAGE_COUNT_KEYS = [
  "total_attempts", "returned_attempts", "draft_attempts", "submitted_attempts", "failed_attempts",
  "abandoned_attempts", "child_runs", "technical_retries", "storied_returned", "probe_returned",
] as const;

const AlphaVersionStateSchema = z.enum(["DRAFT", "ACTIVE", "SUPERSEDED", "ABANDONED"]);
const AttemptStateSchema = z.enum([
  "DRAFT", "PREFLIGHT_VALID", "QUEUED", "CLAIMED", "RUNNING", "COMPUTE_DONE",
  "SEALING", "READY", "CANCEL_REQUESTED", "CANCELLED", "FAILED",
  "RECOVERY_REQUIRED", "ABANDONED",
]);
const RunStateSchema = z.enum([
  "DRAFT", "QUEUED", "RUNNING", "SEALING", "READY", "FAILED", "CANCELLED", "RECOVERY_REQUIRED",
]);
const IntentKindSchema = z.enum([
  "NEW", "CLONE_FOR_EXPERIMENT", "REPRODUCE_EXISTING", "UPGRADE_ENGINE_EXPERIMENT",
]);

const PromotionPickSchema = z.object({
  state: z.enum(["PUBLISHED", "NOT_PUBLISHED"]),
  attempt_id: OpaqueIdSchema.nullable(),
  run_id: OpaqueIdSchema.nullable(),
  source_contract_rev: z.string().min(1).max(160).nullable(),
  source_digest: DigestSchema.nullable(),
  source_as_of_utc_ms: UtcMsSchema.nullable(),
  /** CG-FG-S10-01: exact P22 receipt → P21 selection, never the approval digest. */
  selected_trial_id: OpaqueIdSchema.nullable().optional(),
  selected_trial_availability: ResearchLineageAvailabilitySchema.optional(),
  selected_params_digest: DigestSchema.nullable().optional(),
  selected_params_availability: ResearchLineageAvailabilitySchema.optional(),
  availability: ResearchLineageAvailabilitySchema,
  /**
   * W6b DR-03: the only authority that may publish a pick is a governed
   * approval of a sealed release candidate (P22).  Until that writer is
   * connected the pick stays NOT_PUBLISHED; this names what it waits for.
   */
  source_authority: z.object({
    owner: z.literal("P22_RELEASE_CANDIDATE_APPROVAL"),
    state: z.enum(["CONNECTED", "NOT_CONNECTED"]),
  }).strict(),
  /** W6b CG-P19-04: the pick run's own P21 relation, when a pick is published. */
  release_candidate: ResearchLineageReleaseCandidateRefSchema.nullable(),
  release_candidate_availability: ResearchLineageAvailabilitySchema,
}).strict();

const ParamRangeSchema = z.object({
  name: z.string().regex(/^[A-Za-z][A-Za-z0-9_.:-]{0,190}$/),
  kind: z.enum(["SWEEP", "PIN"]),
  low: z.string().max(96).nullable(),
  high: z.string().max(96).nullable(),
  values: z.array(z.string().max(96)).max(16),
}).strict();

const VersionSchema = z.object({
  alpha_version_id: OpaqueIdSchema,
  label: z.string().min(1).max(160),
  code_digest: DigestSchema,
  entrypoint: z.string().min(1).max(512),
  lifecycle_state: AlphaVersionStateSchema,
  registered_at_utc_ms: UtcMsSchema,
  promotion_pick: PromotionPickSchema,
  /**
   * W6b CG-P19-07: one server-composed line from this version's persisted
   * facts (`research.lineage-version-outcome.v1`); never a ranking of runs.
   */
  outcome: z.object({
    text: z.string().min(1).max(240).nullable(),
    rule: z.literal("research.lineage-version-outcome.v1"),
    availability: ResearchLineageAvailabilitySchema,
  }).strict(),
  /** W6b CG-P19-07: the registered successor that superseded this version (RF-03 fact). */
  supersession: z.object({
    state: z.enum(["RECORDED", "NOT_RECORDED", "NOT_APPLICABLE"]),
    superseded_by_version_id: OpaqueIdSchema.nullable(),
    superseded_by_label: z.string().min(1).max(160).nullable(),
    reason_code: z.string().min(1).max(160).nullable(),
  }).strict(),
  /**
   * W6b CG-P19-06: what this version's attempts actually declared, aggregated
   * server-side over every attempt of the version (not only returned ones).
   */
  exercised: z.object({
    routes: z.array(z.string().min(1).max(64)).max(16),
    modes: z.array(z.string().min(1).max(160)).max(32),
    param_ranges: z.array(ParamRangeSchema).max(24),
    attempts_considered: z.number().int().nonnegative(),
    attempts_without_manifest: z.number().int().nonnegative(),
    availability: ResearchLineageAvailabilitySchema,
  }).strict(),
  /** W6b CG-P19-06: Engine Atlas routes that no attempt of this version declared. */
  untried: z.object({
    routes: z.array(z.object({
      route_id: z.string().min(1).max(64),
      status_word: z.string().max(16).nullable(),
    }).strict()).max(32),
    availability: ResearchLineageAvailabilitySchema,
  }).strict(),
  /** W6b CG-P19-03: storied/probe split of this version's returned attempts. */
  presentation: z.object({
    storied: z.number().int().nonnegative(),
    probe: z.number().int().nonnegative(),
    basis: z.literal("RETURNED_ATTEMPTS"),
  }).strict(),
}).strict();

const SemanticChangeSchema = z.object({
  // This is an allow-listed semantic key (for example `random_seed` or
  // `data.timeframe`), never an arbitrary JSON pointer supplied by a client.
  path: z.string().regex(/^[a-z][a-z0-9_.-]{0,127}$/),
  kind: z.enum(["CONFIG", "DATA", "ENGINE", "ALPHA_VERSION"]),
  before: z.string().max(512).nullable(),
  after: z.string().max(512).nullable(),
}).strict();

const SemanticDiffSchema = z.object({
  state: z.enum(["ROOT", "AVAILABLE", "NOT_PUBLISHED", "PARENT_OUTSIDE_RETURNED_GRAPH"]),
  changes: z.array(SemanticChangeSchema).max(48),
  gates_reset: z.boolean(),
  availability: ResearchLineageAvailabilitySchema,
}).strict();

const ChildRunSchema = z.object({
  run_id: OpaqueIdSchema,
  run_kind: z.enum(["PRIMARY", "AUDIT", "DIAGNOSTIC", "REPRODUCTION", "EXPORT", "VERIFY", "PROJECTION"]),
  relationship_kind: z.enum([
    "PRIMARY", "AUDIT_OF_SELECTION", "DIAGNOSTIC_OF_RUN", "REPRODUCTION_OF_RUN",
    "EXPORT_OF_RUN", "VERIFY_OF_RUN", "PROJECTION_OF_RUN",
  ]),
  parent_run_id: OpaqueIdSchema.nullable(),
  state: RunStateSchema,
  created_at_utc_ms: UtcMsSchema,
}).strict();

const ChildRunsCoverageSchema = z.object({
  // A lineage can have many technical/audit child records.  The route returns
  // a bounded deterministic prefix per user-visible attempt and says so; it
  // must never silently turn an unbounded relationship into a complete list.
  state: z.enum(["COMPLETE", "PARTIAL"]),
  reason_code: z.string().min(1).max(160).nullable(),
}).strict();

const ExposureSchema = z.object({
  state: z.enum(["RECORDED", "NOT_PUBLISHED"]),
  count: z.number().int().nonnegative(),
  roles: z.array(z.enum([
    "QUALITY_SCAN", "TRAIN", "SELECTION_INPUT", "OUTER_OOS", "HOLDOUT", "RETROSPECTIVE", "UNKNOWN",
  ])).max(7),
  latest_source_as_of_utc_ms: UtcMsSchema.nullable(),
  availability: ResearchLineageAvailabilitySchema,
}).strict();

export const ResearchAttemptLineageNodeSchema = z.object({
  attempt_id: OpaqueIdSchema,
  parent_attempt_id: OpaqueIdSchema.nullable(),
  parent_state: z.enum(["ROOT", "RETURNED", "OUTSIDE_RETURNED_GRAPH"]),
  alpha_version_id: OpaqueIdSchema,
  alpha_version_label: z.string().min(1).max(160),
  state: AttemptStateSchema,
  intent_kind: IntentKindSchema,
  /** W5a: SIBLING_OF when this attempt was forked from a what-if node of its parent's run. */
  relation_to_parent: z.enum(["SIBLING_OF"]).nullable(),
  reason: z.string().max(512).nullable(),
  space_signature: DigestSchema.nullable(),
  created_at_utc_ms: UtcMsSchema,
  updated_at_utc_ms: UtcMsSchema,
  primary_run: z.object({
    run_id: OpaqueIdSchema.nullable(),
    /**
     * D1 (audit 10-3): the short label the hi-fi writes beside the attempt
     * (`R-WFO-114`). Derived by the same one rule as every other read, from
     * the Run Library row this service already holds. Presentation only —
     * `run_id` is the identity. `null` when no label can be derived, and the
     * card prints the short id rather than a guess.
     */
    display_label: z.string().regex(/^R-[A-Z0-9]{1,8}-[0-9]{3,6}$/).nullable(),
    state: RunStateSchema.nullable(),
    effective_spec_digest: DigestSchema.nullable(),
    engine_release_id: z.string().min(1).max(256).nullable(),
    dataset_binding_digest: DigestSchema.nullable(),
    technical_retry_count: z.number().int().nonnegative(),
    /** W6b: the run's immutable execution profile (P04 fixed qualification / P10 Delta WFO). */
    execution_profile_id: z.string().min(1).max(160).nullable(),
  }).strict(),
  child_runs: z.array(ChildRunSchema).max(32),
  child_runs_coverage: ChildRunsCoverageSchema,
  semantic_diff: SemanticDiffSchema,
  exposure: ExposureSchema,
  /** W6b CG-P19-03: server classification by `research.lineage-presentation.v1`. */
  presentation_kind: z.enum(["STORIED", "PROBE"]),
  presentation_reasons: z.array(PresentationReasonSchema).max(5),
  /** W6b CG-P19-14: promotion standing from persisted facts; never a metric ranking. */
  promotion_state: z.enum(["PICKED", "NOT_PICKED", "AWAITING_PICK", "CLOSED"]),
  promotion_reason_code: z.string().min(1).max(160).nullable(),
  /** W6b CG-P19-08: an allow-listed spec line built from the persisted requested spec. */
  spec_label: z.object({
    text: z.string().min(1).max(240).nullable(),
    space: z.object({
      parameters: z.number().int().nonnegative(),
      swept: z.number().int().nonnegative(),
      pinned: z.number().int().nonnegative(),
    }).strict().nullable(),
    availability: ResearchLineageAvailabilitySchema,
  }).strict(),
  /** W6b CG-P19-04: the primary run's P21 relation. */
  release_candidate: ResearchLineageReleaseCandidateRefSchema.nullable(),
  release_candidate_availability: ResearchLineageAvailabilitySchema,
  /** W6b CG-P19-05: the primary run's retained certificate, claim, OOS Sharpe and decay. */
  run_facts: RunFactsSchema,
  /** W6b CG-P19-07: one sentence — the attempt's own recorded reason, else the source claim sentence. */
  outcome: z.object({
    text: z.string().min(1).max(1_024).nullable(),
    source: z.enum(["ATTEMPT_REASON", "SOURCE_CLAIM_SENTENCE"]).nullable(),
    availability: ResearchLineageAvailabilitySchema,
  }).strict(),
}).strict();

export const ResearchAttemptLineageResponseSchema = z.object({
  schema_version: z.literal("research.attempt-lineage.v1"),
  read_authority: z.literal("PORTAL_PERSISTED_RESEARCH"),
  alpha: z.object({
    alpha_id: AlphaIdSchema,
    name: z.string().min(1).max(240),
    active_version_id: OpaqueIdSchema.nullable(),
    // `research.alphas` deliberately has no aggregate lifecycle column.  The
    // active version's lifecycle is a different fact, so expose it separately
    // instead of silently treating ACTIVE/SUPERSEDED as Alpha-wide status.
    active_version_state: AlphaVersionStateSchema.nullable(),
    active_version_availability: ResearchLineageAvailabilitySchema,
    versions: z.array(VersionSchema).max(64),
  }).strict(),
  attempts: z.array(ResearchAttemptLineageNodeSchema).max(128),
  counts: z.object({
    total_attempts: z.number().int().nonnegative(),
    returned_attempts: z.number().int().nonnegative(),
    draft_attempts: z.number().int().nonnegative(),
    submitted_attempts: z.number().int().nonnegative(),
    failed_attempts: z.number().int().nonnegative(),
    abandoned_attempts: z.number().int().nonnegative(),
    child_runs: z.number().int().nonnegative(),
    technical_retries: z.number().int().nonnegative(),
    /** W6b CG-P19-03: the storied/probe split of the returned attempts only. */
    storied_returned: z.number().int().nonnegative(),
    probe_returned: z.number().int().nonnegative(),
  }).strict(),
  /**
   * W6b CG-P19-13: what each count includes, and the Run Library figure it
   * reconciles with for the same Alpha (`research.lineage-counts.v1`).
   */
  counts_definitions: z.object({
    version: z.literal("research.lineage-counts.v1"),
    rows: z.array(z.object({
      key: z.enum(LINEAGE_COUNT_KEYS),
      includes: z.string().min(1).max(320),
      run_library_equivalent: z.string().min(1).max(240).nullable(),
    }).strict()).length(10),
  }).strict(),
  /** W6b CG-P19-03: the storied/probe rule travels with the answer; the browser holds none. */
  presentation_rule: z.object({
    version: z.literal("research.lineage-presentation.v1"),
    storied_when: z.array(PresentationReasonSchema).length(5),
    material_change_threshold: z.literal(2),
  }).strict(),
  coverage: z.object({
    state: z.enum(["COMPLETE", "PARTIAL"]),
    reason_code: z.string().min(1).max(160).nullable(),
    oldest_returned_created_at_utc_ms: UtcMsSchema.nullable(),
    /**
     * W6b CG-P19-09: a bounded first page is the NEWEST `limit` attempts, kept
     * in chronological order, so the latest work is always visible; an older
     * page is read only through the server-issued `older_cursor`.
     */
    window: z.enum(["NEWEST", "OLDER_PAGE"]),
    older_cursor: z.string().min(1).max(4096).nullable(),
  }).strict(),
  source_absences: z.object({
    promotion_pick: ResearchLineageAvailabilitySchema,
    historical_semantic_diff: ResearchLineageAvailabilitySchema,
  }).strict(),
  as_of_utc_ms: UtcMsSchema,
  /** W6b CG-P19-02: digest of everything above except `as_of_utc_ms`; `etag` is its validator. */
  lineage_revision: z.string().regex(/^p19r2_[0-9a-f]{64}$/),
  etag: z.string().regex(/^"p19r2_[0-9a-f]{64}"$/),
}).strict();

export type ResearchAttemptLineageResponse = z.infer<typeof ResearchAttemptLineageResponseSchema>;
