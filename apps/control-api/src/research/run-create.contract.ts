/**
 * Research Loop P10 · browser-facing New Run producer contract.
 *
 * This is deliberately a small, same-origin command DTO.  The browser can
 * request a run from an opaque P08 preflight, but it cannot provide a worker
 * identity, snapshot path, lease, effective digest, legacy read-model state,
 * or an admission assertion.  Those remain server-owned.
 */

import { z } from "zod";

import { ResearchRequestedSpecSchema, ResearchPreflightTokenSchema } from "./preflight.contract";

const WorkspaceIdSchema = z.string().regex(/^[A-Za-z0-9._-]{1,128}$/);
const OpaqueIntentIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{2,191}$/);

export const ResearchRunIntentKindSchema = z.enum([
  "NEW",
  "CLONE_FOR_EXPERIMENT",
  "REPRODUCE_EXISTING",
  "UPGRADE_ENGINE_EXPERIMENT",
]);

/**
 * P10 intentionally repeats the requested specification rather than taking
 * individual wizard values.  P02 owns one canonical model, so preview,
 * preflight and submit all validate identical absent/null/zero/false rules.
 */
export const ResearchRunCreateRequestSchema = z.object({
  schema_version: z.literal("research.run-create.v1"),
  workspace_id: WorkspaceIdSchema.optional(),
  client_intent_id: OpaqueIntentIdSchema,
  preflight_token: ResearchPreflightTokenSchema,
  requested_spec: ResearchRequestedSpecSchema,
  intent_kind: ResearchRunIntentKindSchema.default("NEW"),
  /**
   * W5a · P19: a sibling attempt forked from a Screen-07 what-if node. The run
   * is still a NEW intent with its own preflight and config_hash; the server
   * links its attempt to the frozen run's attempt as SIBLING_OF.
   */
  lineage: z.object({
    relation: z.literal("SIBLING_OF"),
    parent_run_id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/),
    what_if_cell_id: z.string().regex(/^x[0-8]y[0-8]$/),
  }).strict().optional(),
}).strict();

export type ResearchRunCreateRequest = z.infer<typeof ResearchRunCreateRequestSchema>;

export const ResearchRunCreateResponseSchema = z.object({
  schema_version: z.literal("research.run-create.v1"),
  run_id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/),
  status: z.literal("QUEUED"),
  replayed: z.boolean(),
  // These are bounded, immutable facts the UI may display/read back.  No
  // source path, snapshot bytes, lease or worker transport detail leaks.
  requested_spec_digest: z.string().regex(/^[a-f0-9]{64}$/),
  effective_spec_digest: z.string().regex(/^[a-f0-9]{64}$/),
  dataset_binding_digest: z.string().regex(/^[a-f0-9]{64}$/),
  manifest_digest: z.string().regex(/^[a-f0-9]{64}$/),
  legacy: z.object({
    strategy_id: z.string().min(1).max(191),
    dataset_id: z.string().min(1).max(191),
    protocol: z.string().min(1).max(191),
  }).strict(),
}).strict();

export type ResearchRunCreateResponse = z.infer<typeof ResearchRunCreateResponseSchema>;
