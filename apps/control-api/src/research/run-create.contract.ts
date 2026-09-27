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
   * The run this attempt came out of, when the browser opened the draft from
   * one. The run is still a NEW intent with its own preflight and config_hash
   * either way — the server records the edge, never a dependency.
   *
   * Two relations, because they are two different claims:
   *
   *  - `SIBLING_OF` (W5a · P19) is a Screen-07 what-if node made real. It
   *    names the exact cell and must bind the same AlphaVersion as its parent.
   *  - `CLONE_OF` (E13) is the `?from=<run>` copy Screens 03, 07 and 10 offer.
   *    Before E13 that copy declared nothing, so every cloned attempt landed
   *    with `parent_attempt_id` NULL: all 33 attempts on the preview read
   *    `parent_state: ROOT`, Screen 10's tree never nested and "diff vs
   *    parent" was always empty. It names no cell, because there is none, and
   *    it does not require the same AlphaVersion — a clone onto a different
   *    version is still a clone, and the lineage read already has an honest
   *    state for a parent outside the graph it returned.
   */
  lineage: z.discriminatedUnion("relation", [
    z.object({
      relation: z.literal("SIBLING_OF"),
      parent_run_id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/),
      what_if_cell_id: z.string().regex(/^x[0-8]y[0-8]$/),
    }).strict(),
    z.object({
      relation: z.literal("CLONE_OF"),
      parent_run_id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/),
    }).strict(),
  ]).optional(),
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
