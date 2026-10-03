/** Byte-pinned linked audit. Raw config/selection bytes are private only. */
import { z } from "zod";
import { sha256ResearchJson } from "./preflight.service";

export const PINNED_AUDIT_PROFILE_ID = "p23.delta-pinned-final-audit.v1" as const;
export const PINNED_AUDIT_PROFILE = {
  schema_version: "research.pinned-final-audit-profile.v1", engine: "quantbt-engine==1.1.1", adapter: "p04.delta-rsi.v1",
  target_mode: "signal_notional", schedule: "global", optimization_mode: "none", optimizer_trials: 0,
  max_days: 92, max_rows: 10000, max_folds: 16, cpu_seconds: 120, wall_seconds: 240,
  memory_bytes: 4 * 1024 ** 3, scratch_bytes: 128 * 1024 ** 2, file_bytes: 16 * 1024 ** 2,
  max_output_files: 64, max_output_bytes: 64 * 1024 ** 2,
} as const;
export const PINNED_AUDIT_PROFILE_DIGEST = sha256ResearchJson(PINNED_AUDIT_PROFILE);
const Id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$/);
const Digest = z.string().regex(/^[a-f0-9]{64}$/);

export const PinnedAuditPreparationSchema = z.object({
  parent_run_id: Id, parent_artifact_id: Id, parent_artifact_revision: z.number().int().positive(),
  parent_manifest_digest: Digest, dataset_binding_digest: Digest, snapshot_id: z.string().regex(/^dss_[a-f0-9]{32}$/),
  snapshot_content_hash: Digest, engine_release_id: z.literal("er_quantbt_111"), alpha_version_id: Id,
  execution_adapter_id: z.literal("p04.delta-rsi.v1"),
  adapter_contract_digest: z.literal("9ade757b5c1cd87681a2efb49011c84a96211939710dcd32c9fd1c7777e95784"),
}).strict();
export const PinnedAuditTargetSchema = PinnedAuditPreparationSchema.extend({
  schema_version: z.literal("research.pinned-selection-audit-target.v1"), engine_version: z.literal("1.1.1"),
  source_config_raw: z.string().min(1).max(65_536), source_config_digest: Digest,
  source_selection_raw: z.string().min(1).max(16_384), source_selection_digest: Digest,
  source_selection_kind: z.literal("P05_SELECTION_PARAMETERS_JSON"), source_selection_part_digest: Digest,
  source_selection_part_relative_path: z.string().regex(/^tables\/selection\/part-[0-9]{6}\.parquet$/),
}).strict();
export type PinnedAuditTarget = z.infer<typeof PinnedAuditTargetSchema>;
export function pinnedAuditTargetDigest(target: PinnedAuditTarget): string {
  const { source_config_raw: _config, source_selection_raw: _selection, ...pins } = target;
  return sha256ResearchJson(pins);
}
export const PinnedAuditResultSchema = z.object({
  schema_version: z.literal("research.pinned-selection-audit-result.v1"), run_id: Id, parent_run_id: Id,
  target_digest: Digest, parameters_digest: Digest, engine_release_id: z.literal("er_quantbt_111"),
  engine_version: z.literal("1.1.1"), snapshot_id: z.string().regex(/^dss_[a-f0-9]{32}$/), snapshot_content_hash: Digest,
  source_selection_digest: Digest, source_selection_kind: z.literal("P05_SELECTION_PARAMETERS_JSON"),
  source_selection_part_digest: Digest, source_config_digest: Digest, audit_target_kind: z.literal("SINGLE_PARAMETER_SET"),
  optimizer_reinvoked: z.literal(false), optimizer_trials: z.literal(0), n_folds: z.number().int().min(2).max(16),
  bars: z.number().int().min(1).max(10000),
}).strict();
export type PinnedAuditResult = z.infer<typeof PinnedAuditResultSchema>;
/** Verified custody, not a claim inferred from a run's relationship label. */
export const VerifiedPinnedAuditSchema = z.object({
  child_run_id: Id, child_attempt_id: Id, artifact_id: Id,
  artifact_revision: z.number().int().positive(), manifest_digest: Digest,
  result_digest: Digest, verified_at_utc_ms: z.number().int().nonnegative().safe(),
  result: PinnedAuditResultSchema,
}).strict().superRefine((proof, ctx) => {
  if (proof.child_run_id !== proof.result.run_id || proof.result_digest !== sha256ResearchJson(proof.result))
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Verified receipt identity/digest mismatch" });
});
export type VerifiedPinnedAudit = z.infer<typeof VerifiedPinnedAuditSchema>;

/** P05 publishes exact decimal strings. Never round them through Number. */
export function pinnedAuditParametersDigest(raw: string): string {
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).length < 1 || Object.keys(value).length > 24) throw new Error("Invalid frozen parameter map");
  const canonical: Record<string, string> = {};
  for (const [name, input] of Object.entries(value)) {
    const text = typeof input === "string" ? input : typeof input === "number" && Number.isSafeInteger(input) ? String(input) : "";
    const m = /^([+-]?)(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d{1,2}))?$/.exec(text);
    if (!m || text.length > 80) throw new Error("Invalid exact frozen decimal");
    const exponent = Number(m[4] ?? 0) - (m[3]?.length ?? 0);
    const digits = (m[2]! + (m[3] ?? "")).replace(/^0+/, "") || "0";
    const adjusted = digits.length - 1 + exponent;
    if (digits.length > 34 || Math.abs(exponent) > 34 || adjusted < -12 || adjusted > 12)
      throw new Error("Frozen decimal exceeds the pinned precision budget");
    const split = digits.length + exponent;
    const rendered = exponent >= 0 ? digits + "0".repeat(exponent)
      : split > 0 ? digits.slice(0, split) + "." + digits.slice(split)
        : "0." + "0".repeat(-split) + digits;
    const unsigned = rendered.includes(".") ? rendered.replace(/0+$/, "").replace(/\.$/, "") : rendered;
    canonical[name] = digits === "0" ? "0" : m[1] === "-" ? `-${unsigned}` : unsigned;
  }
  return sha256ResearchJson(canonical);
}
export const ResearchFinalAuditCreateSchema = z.object({
  client_intent_id: z.string().min(16).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/), target_digest: Digest,
}).strict();
export const ResearchFinalAuditReadSchema = z.object({
  schema_version: z.literal("research.linked-final-audit.v1"), parent_run_id: Id,
  state: z.enum(["READY_TO_ADMIT", "QUEUED", "RUNNING", "AWAITING_VERIFICATION", "VERIFIED", "FAILED", "CANCELLED"]),
  target_digest: Digest, profile_id: z.literal(PINNED_AUDIT_PROFILE_ID),
  profile_digest: z.literal(PINNED_AUDIT_PROFILE_DIGEST), may_create: z.boolean(), child_run_id: Id.nullable(),
  progress_href: z.string().max(512).nullable(), verification: VerifiedPinnedAuditSchema.nullable(),
}).strict().superRefine((read, ctx) => {
  if ((read.state === "READY_TO_ADMIT") !== (read.child_run_id === null)
    || (read.state === "VERIFIED") !== (read.verification !== null)
    || (read.verification && (read.verification.child_run_id !== read.child_run_id
      || read.verification.result.parent_run_id !== read.parent_run_id
      || read.verification.result.target_digest !== read.target_digest)))
    ctx.addIssue({ code:z.ZodIssueCode.custom, message:"Audit state/custody/target mismatch" });
});
export type ResearchFinalAuditRead = z.infer<typeof ResearchFinalAuditReadSchema>;

/** Private P05 worker ingress; a public DTO cannot supply a receipt. */
export const PinnedAuditSealSchema = z.object({
  workspace_id: Id, run_id: Id, job_id: Id, worker_attempt_id: Id, lease_epoch: z.number().int().positive(),
  artifact_id: Id, artifact_revision: z.number().int().positive(), manifest_digest: Digest,
  result: PinnedAuditResultSchema,
}).strict();

export class ResearchFinalAuditError extends Error {
  constructor(readonly code: "RESEARCH_FINAL_AUDIT_INVALID" | "RESEARCH_FINAL_AUDIT_FORBIDDEN"
    | "RESEARCH_FINAL_AUDIT_NOT_FOUND" | "RESEARCH_FINAL_AUDIT_CONFLICT" | "RESEARCH_FINAL_AUDIT_NOT_APPLICABLE"
    | "RESEARCH_FINAL_AUDIT_UPSTREAM_REJECTED" | "RESEARCH_FINAL_AUDIT_UNAVAILABLE",
    message: string, readonly status: 400 | 403 | 404 | 409 | 502 | 503) { super(message); }
}
