/**
 * P07 browser-facing Research Alpha import DTOs.
 *
 * Only source bytes + filename enter the parse operation.  Every mirror,
 * digest, gate receipt, version ID and lifecycle transition is server-derived;
 * the browser has no editable entrypoint/parameter/data-contract fields.
 */
import { z } from "zod";
import type { ResearchAlphaVersionDeclaration } from "./alpha-version-declaration";

const WorkspaceIdSchema = z.string().regex(/^[A-Za-z0-9._-]{1,128}$/).optional();
const SourceFileRefSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$/);
const DigestSchema = z.string().regex(/^[0-9a-f]{64}$/);

export const ResearchAlphaImportParseRequestSchema = z.object({
  workspace_id: WorkspaceIdSchema,
  original_filename: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}[.]py$/),
  source_text: z.string().min(1).max(256 * 1024),
  expected_source_digest: DigestSchema.optional(),
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
  // CG-P07-03: HiFi's 14 fields within DQ-05. `state` says where a value
  // came from; `check` is the verdict of the named gate (VERIFY = no gate
  // reads it; NOT_APPLICABLE = the v1 file cannot carry it).
  mirror: z.array(z.object({
    field: z.string().max(128),
    state: z.enum(["parsed", "missing", "server_assigned", "server_computed", "not_in_contract"]),
    value: z.unknown().optional(),
    check: z.enum(["PASS", "FAIL", "VERIFY", "GATED", "NOT_APPLICABLE"]),
    gate: z.string().max(64).nullable().optional(),
    note: z.string().min(1).max(256),
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
  /** CG-P07-04: measured analyser time per check (µs); outside analysis_digest. */
  gate_timings_us: z.record(z.string().max(64), z.number().int().nonnegative().max(600_000_000)).optional(),
}).strict();

export type ResearchAlphaAnalysis = z.infer<typeof ResearchAlphaAnalysisResponseSchema>;

/** E6-BR-01: source registration is not container-release attestation. */
export const ResearchAlphaImportAttestationSchema = z.object({
  schema_version: z.literal("research.alpha-import-attestation.v1"),
  scope: z.literal("REGISTERED_ALPHA_SOURCE_ONLY"),
  source_digest: DigestSchema,
  signature: z.object({
    state: z.literal("NOT_PUBLISHED"),
    reason_code: z.literal("RESEARCH_ALPHA_IMPORT_SIGNATURE_NOT_PRODUCED"),
    source_locator: z.literal("apps/control-api/src/research/alpha-import.service.ts#register"),
  }).strict(),
  sbom: z.object({
    state: z.literal("NOT_PUBLISHED"),
    reason_code: z.literal("RESEARCH_ALPHA_IMPORT_SBOM_NOT_PRODUCED"),
    source_locator: z.literal("apps/control-api/src/research/alpha-import.service.ts#register"),
  }).strict(),
}).strict();
export type ResearchAlphaImportAttestation = z.infer<typeof ResearchAlphaImportAttestationSchema>;

export function researchAlphaImportAttestation(sourceDigest: string): ResearchAlphaImportAttestation {
  return ResearchAlphaImportAttestationSchema.parse({
    schema_version: "research.alpha-import-attestation.v1", scope: "REGISTERED_ALPHA_SOURCE_ONLY",
    source_digest: sourceDigest,
    signature: { state: "NOT_PUBLISHED", reason_code: "RESEARCH_ALPHA_IMPORT_SIGNATURE_NOT_PRODUCED",
      source_locator: "apps/control-api/src/research/alpha-import.service.ts#register" },
    sbom: { state: "NOT_PUBLISHED", reason_code: "RESEARCH_ALPHA_IMPORT_SBOM_NOT_PRODUCED",
      source_locator: "apps/control-api/src/research/alpha-import.service.ts#register" },
  });
}

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
  /**
   * CG-P07-04: where `ms` was measured. ANALYSER = the private parser's own
   * check time for this gate (µs in `analyser_us`); CONTROL_API = measured here
   * (gate 3's registry lookup). A SKIPPED gate has neither.
   */
  timing_source?: "ANALYSER" | "CONTROL_API" | null;
  analyser_us?: number | null;
  quarantine_code?: "QUARANTINED_CONTRACT" | "QUARANTINED_ENTRYPOINT" | "QUARANTINED_DIGEST_ALREADY_REGISTERED" | "QUARANTINED_PARAMETER_SPACE" | "QUARANTINED_DETERMINISM" | "QUARANTINED_DATA_CONTRACT" | "QUARANTINED_LOOKAHEAD";
}

export interface ResearchAlphaImportParseResponse {
  schema_version: "research.alpha-source.v1";
  source_file_ref: string;
  source_digest: string;
  analysis_digest: string;
  parse_ok: boolean;
  expires_at_utc_ms: number;
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
  expires_at_utc_ms: number;
  static_scan_disclosure: "Static scan — runtime causality is proven per run at Stage 3/4.";
}

export interface ResearchAlphaRegistryEntry {
  alpha_id: string;
  alpha_version_id: string;
  display_name: string;
  /** Registration-time predecessor; historical rows explicitly report UNKNOWN. */
  supersedes?: string | null;
  supersedes_state?: "RECORDED" | "HISTORICAL_NOT_RECORDED";
  strategy_id: string;
  source_digest: string;
  version_label: string;
  lifecycle_state: "DRAFT" | "ACTIVE" | "SUPERSEDED" | "ABANDONED";
  entrypoint: string;
  /** Safe immutable declaration used by typed New Run validators; never raw source or provenance. */
  declaration: ResearchAlphaVersionDeclaration;
  source_digest_prefix: string;
  alpha_revision: number;
  registered_at_utc_ms: number;
  /** Caller-specific server admission, evaluated by the same policy as activate. */
  may_activate: boolean;
  /** Additive for old clients; new server responses always publish it. */
  import_attestation?: ResearchAlphaImportAttestation;
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
  /** No signing authority is inferred from DRAFT/ACTIVE or image provenance. */
  import_attestation?: ResearchAlphaImportAttestation;
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
