/**
 * P07 browser-facing Research Alpha import DTOs.
 *
 * Only source bytes + filename enter the parse operation.  Every mirror,
 * digest, gate receipt, version ID and lifecycle transition is server-derived;
 * the browser has no editable entrypoint/parameter/data-contract fields.
 */
import { z } from "zod";

const WorkspaceIdSchema = z.string().regex(/^[A-Za-z0-9._-]{1,128}$/).optional();
const SourceFileRefSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$/);
const DigestSchema = z.string().regex(/^[0-9a-f]{64}$/);

export const ResearchAlphaImportParseRequestSchema = z.object({
  workspace_id: WorkspaceIdSchema,
  original_filename: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}[.]py$/),
  source_text: z.string().min(1).max(256 * 1024),
}).strict();

export const ResearchAlphaImportGatesRequestSchema = z.object({
  workspace_id: WorkspaceIdSchema,
  source_file_ref: SourceFileRefSchema,
}).strict();

export const ResearchAlphaImportRegisterRequestSchema = z.object({
  workspace_id: WorkspaceIdSchema,
  source_file_ref: SourceFileRefSchema,
  alpha_id: z.string().regex(/^[a-z][a-z0-9-]{2,63}$/),
  // The UI may carry the exact server-issued receipt.  It is optional only
  // for the documented S14 shape: the server resolves the latest passing
  // receipt bound to this actor/source/analysis revision when omitted.
  gate_receipt_id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$/).optional(),
}).strict();

export const ResearchAlphaActivateRequestSchema = z.object({
  workspace_id: WorkspaceIdSchema,
  expected_alpha_revision: z.number().int().positive(),
}).strict();

export const ResearchAlphaListQuerySchema = z.object({
  workspace_id: WorkspaceIdSchema,
  alpha_id: z.string().regex(/^[a-z][a-z0-9-]{2,63}$/).optional(),
}).strict();

export const ResearchAlphaAnalysisResponseSchema = z.object({
  schema_version: z.literal("research.alpha-analysis.v1"),
  source_digest: DigestSchema,
  analysis_digest: DigestSchema,
  parse_ok: z.boolean(),
  declared_contract: z.record(z.unknown()),
  mirror: z.array(z.object({
    field: z.string().max(128),
    state: z.enum(["parsed", "missing"]),
    value: z.unknown().optional(),
  }).strict()).max(16),
  gate_facts: z.object({
    contract_complete: z.boolean(),
    contract_message: z.string().max(512),
    entrypoint_restricted_definition_load: z.boolean(),
    entrypoint_message: z.string().max(512),
    parameter_space_sane: z.boolean(),
    parameter_message: z.string().max(512),
    determinism_declared: z.boolean(),
    determinism_message: z.string().max(512),
    data_contract_known: z.boolean(),
    data_contract_message: z.string().max(512),
    no_lookahead_static_scan: z.boolean(),
    no_lookahead_message: z.string().max(512),
  }).strict(),
}).strict();

export type ResearchAlphaAnalysis = z.infer<typeof ResearchAlphaAnalysisResponseSchema>;

export type ResearchAlphaImportGateState = "PASS" | "FAIL" | "SKIPPED";

export interface ResearchAlphaImportGateRow {
  n: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  name:
    | "contract-complete"
    | "entrypoint-importable"
    | "digest-unique"
    | "parameter-space-sane"
    | "determinism-declared"
    | "data-contract-known"
    | "no-lookahead-static-scan";
  state: ResearchAlphaImportGateState;
  message: string;
  ms: number;
}

export interface ResearchAlphaImportParseResponse {
  schema_version: "research.alpha-source.v1";
  source_file_ref: string;
  source_digest: string;
  analysis_digest: string;
  parse_ok: boolean;
  mirror: readonly (ResearchAlphaAnalysis["mirror"][number])[];
}

export interface ResearchAlphaImportGatesResponse {
  schema_version: "research.alpha-import-gates.v1";
  gate_receipt_id: string;
  source_file_ref: string;
  source_digest: string;
  analysis_digest: string;
  gates: readonly ResearchAlphaImportGateRow[];
  all_pass: boolean;
  static_scan_disclosure: "Static scan — runtime causality is proven per run at Stage 3/4.";
}

export interface ResearchAlphaRegistryEntry {
  alpha_id: string;
  alpha_version_id: string;
  version_label: string;
  lifecycle_state: "DRAFT" | "ACTIVE" | "SUPERSEDED" | "ABANDONED";
  entrypoint: string;
  source_digest_prefix: string;
  alpha_revision: number;
  registered_at_utc_ms: number;
  /** Caller-specific server admission, evaluated by the same policy as activate. */
  may_activate: boolean;
}

export interface ResearchAlphaImportRegisterResponse {
  schema_version: "research.alpha-registration.v1";
  alpha_id: string;
  alpha_version_id: string;
  version_label: string;
  source_digest: string;
  lifecycle_state: "DRAFT";
  supersedes: string | null;
  alpha_revision: number;
  replayed: boolean;
  /** Caller-specific server admission, evaluated by the same policy as activate. */
  may_activate: boolean;
}

export interface ResearchAlphaActivateResponse {
  schema_version: "research.alpha-activation.v1";
  alpha_id: string;
  alpha_version_id: string;
  lifecycle_state: "ACTIVE";
  superseded_alpha_version_id: string | null;
  alpha_revision: number;
  replayed: boolean;
}

/**
 * The only public registry-list envelope for the Research-owned Alpha Import
 * routes.  It is deliberately separate from the legacy QuantBT
 * `/api/v1/alphas*` compatibility surface.
 */
export interface ResearchAlphaRegistryListResponse {
  schema_version: "research.alpha-registry.v1";
  entries: readonly ResearchAlphaRegistryEntry[];
}
