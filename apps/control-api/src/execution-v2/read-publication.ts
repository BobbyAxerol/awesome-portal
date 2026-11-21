import { z } from "zod";
import { accessResource, accessText } from "./access.contract";
import { executionEnvironment, utcMilliseconds } from "./foundation.contract";

/** Qualified adapter input only. Never accepted from an HTTP request. */
export const readDatasetBinding = z.object({
  dataset_id: accessText,
  source_revision: accessText,
  /** Optional persisted projection identity, never a browser input. History
   * requires it so identical bytes in a new continuity epoch are not reused. */
  projection_generation: accessText.optional(),
  catalogue_revision: accessText.nullable().optional(),
  window: z.object({ from_ms: utcMilliseconds, to_ms: utcMilliseconds }).strict()
    .refine(v => v.from_ms < v.to_ms, "INVALID_WINDOW").nullable(),
}).strict();
export type ReadDatasetBinding = z.infer<typeof readDatasetBinding>;

/** Current topology proof is separate from a historical dataset's population.
 * Independent own-alpha/member-portfolio ID sets cannot prove an exact link. */
export const currentReadLinkage = z.object({
  qualification: z.enum(["SOURCE_VERIFIED", "TEST_ONLY"]),
  revision: accessText,
  provenance_ref: accessText,
  pairs: z.array(z.object({ alpha_id: accessText, portfolio_id: accessText }).strict()).max(2000),
}).strict().refine(value => new Set(value.pairs.map(pair => JSON.stringify([pair.alpha_id, pair.portfolio_id]))).size === value.pairs.length,
  "DUPLICATE_CURRENT_LINK");

/** Qualified exact-grain bridge. A binding ID is not an account ID or a
 * five-tuple component. Missing proof keeps only binding-dependent reads shut. */
export const readBindingLineage = z.object({
  qualification: z.enum(["SOURCE_VERIFIED", "TEST_ONLY"]),
  revision: accessText,
  provenance_ref: accessText,
  bindings: z.array(z.object({ binding_id: accessText, account_id: accessText }).strict()).max(2000),
  /** Explicit positive source fact; a missing mapping is not an empty binding. */
  empty_binding_ids: z.array(accessText).max(2000).optional(),
}).strict().refine(value => new Set(value.bindings.map(pair => JSON.stringify([pair.binding_id, pair.account_id]))).size === value.bindings.length,
  "DUPLICATE_BINDING_ACCOUNT_LINK").refine(value => {
    const empty=value.empty_binding_ids??[];
    return new Set(empty).size===empty.length&&!empty.some(id=>value.bindings.some(pair=>pair.binding_id===id));
  }, "CONTRADICTORY_EMPTY_BINDING");

/** Source strategy IDs and Portal Alpha IDs are different namespaces. A label
 * or equal-looking string never creates this authority-bearing association. */
export const readStrategyLineage = z.object({
  qualification: z.enum(["SOURCE_VERIFIED", "TEST_ONLY"]),
  revision: accessText,
  provenance_ref: accessText,
  pairs: z.array(z.object({ strategy_id: accessText, alpha_id: accessText }).strict()).max(2000),
}).strict().refine(value => new Set(value.pairs.map(pair => pair.strategy_id)).size === value.pairs.length,
  "DUPLICATE_OR_AMBIGUOUS_STRATEGY_LINK");

export const readPublication = z.object({
  workspace_id: accessText,
  environment: executionEnvironment,
  profile_id: accessText,
  qualification: z.enum(["SOURCE_VERIFIED", "TEST_ONLY"]),
  publication_revision: accessText,
  binding: readDatasetBinding,
  /** Includes archived, orphan and unknown lineage; not just today's active registry. */
  population_coverage: z.enum(["COMPLETE_FOR_DATASET_WINDOW", "PARTIAL"]),
  provenance_ref: accessText,
  /** Null permits historical full-business reads, never linked discovery. */
  current_linkage: currentReadLinkage.nullable(),
  binding_lineage: readBindingLineage.nullable().optional(),
  strategy_lineage: readStrategyLineage.nullable().optional(),
  resources: z.array(accessResource).max(2000),
  /** Exact correlated tuples. Independent IN sets would create false joins. */
  tuples: z.array(z.object({
    alpha_id: accessText,
    alpha_version_id: accessText,
    portfolio_id: accessText,
    deployment_id: accessText,
    account_id: accessText,
  }).strict()).max(2000),
}).strict();
export type ExecutionReadPublication = z.infer<typeof readPublication>;

export interface ExecutionReadPublicationRequest {
  workspace_id: string;
  environment: "paper" | "sandbox" | "live";
  profile_id: string;
  binding: ReadDatasetBinding;
}
