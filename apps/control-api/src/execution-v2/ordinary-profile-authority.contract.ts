/** Ordinary READ authority is independent of legacy policy and native grants.
 * These private DTOs confer no source trust, STREAM, PM or mutation authority. */
import { z } from "zod";
import { managerReadDomain, type AccessActor, type ManagerReadDomain } from "./access.contract";
import { ownerTarget } from "./owner-target";

export const ORDINARY_AUTHORITY_SCHEMA = "portal.ordinary-profile-authority.v1" as const;
export const ORDINARY_AUTHORITY_BOUND = 10_000;
const text = z.string().min(1).max(256).regex(/^[^\u0000-\u001f\u007f]+$(?![\s\S])/u);
export const ordinaryDigest = z.string().regex(/^sha256:[a-f0-9]{64}$(?![\s\S])/);
const sha = z.string().regex(/^[a-f0-9]{64}$(?![\s\S])/);
const epoch = z.number().int().nonnegative().safe();
export const ordinaryEnvironment = z.enum(["paper", "sandbox", "live"]);
export type OrdinaryEnvironment = z.infer<typeof ordinaryEnvironment>;
export const ordinaryExpectedHead = z.object({ revision: text, digest: ordinaryDigest }).strict();
export const ordinaryProfileSeal = z.object({ environment: ordinaryEnvironment, domain: managerReadDomain,
  field_policy_ref: text, valid_from_ms: epoch, valid_until_ms: epoch }).strict()
  .refine(v => v.valid_until_ms > v.valid_from_ms, "INVALID_INTERVAL");
export type OrdinaryProfileSeal = z.infer<typeof ordinaryProfileSeal>;
export const ordinaryAuthorityHead = z.object({ schema_version: z.literal(ORDINARY_AUTHORITY_SCHEMA),
  workspace_id: text, revision: text, artifact_sha256: sha, artifact_policy_revision: text,
  target: ownerTarget, profile_seals: z.array(ordinaryProfileSeal).min(1).max(256),
}).strict();
export type OrdinaryAuthorityHead = z.infer<typeof ordinaryAuthorityHead>;
export const ordinaryProfileGrant = z.object({ schema_version: z.literal("portal.ordinary-profile-grant.v1"),
  grant_id: text, workspace_id: text, subject_user_id: text, issued_by: text,
  parent_grant_id: text.nullable(), revision: text, action: z.literal("business.read_all"),
  delegable_actions: z.array(z.literal("business.read_all")).max(1), environment: ordinaryEnvironment,
  domain: managerReadDomain, field_policy_ref: text, valid_from_ms: epoch, valid_until_ms: epoch,
}).strict().refine(v => v.valid_until_ms > v.valid_from_ms &&
  (v.parent_grant_id === null || v.delegable_actions.length === 0), "INVALID_GRANT_CEILING");
export type OrdinaryProfileGrant = z.infer<typeof ordinaryProfileGrant>;

export const ordinaryDelegateRequest = z.object({ operation_id: text, workspace_id: text, subject_user_id: text,
  parent_grant_id: text, expected_parent_revision: text, expected_head: ordinaryExpectedHead,
  valid_from_ms: epoch, valid_until_ms: epoch, reason: text,
}).strict().refine(v => v.valid_until_ms > v.valid_from_ms, "INVALID_INTERVAL");
export type OrdinaryDelegateRequest = z.infer<typeof ordinaryDelegateRequest>;
export const ordinaryRevokeRequest = z.object({ operation_id: text, workspace_id: text, grant_id: text,
  expected_grant_revision: text, expected_head: ordinaryExpectedHead, reason: text,
}).strict();
export type OrdinaryRevokeRequest = z.infer<typeof ordinaryRevokeRequest>;
export const ordinaryAuthorityStepUpRequest = z.object({ workspace_id: text, password: z.string().min(1).max(1024) }).strict();
export const ordinaryAuthorityStepUpResponse = z.object({ schema_version: z.literal("portal.access-step-up.v1"),
  state: z.literal("ACTIVE"), family: z.literal("ACCESS_ADMIN"), expires_at_ms: epoch,
}).strict();
export const ordinaryAuthorityReceipt = z.object({ schema_version: z.literal("portal.ordinary-profile-operation.v1"),
  operation_id: text, operation: z.enum(["INSTALL", "DELEGATE", "REVOKE"]), workspace_id: text,
  head_revision: text, head_digest: ordinaryDigest, grant_id: text.nullable(), outcome: z.literal("APP_APPLIED"),
  decided_at_ms: epoch, source_qualified: z.literal(false), stream_commissioned: z.literal(false),
  command_commissioned: z.literal(false),
}).strict();
export type OrdinaryAuthorityReceipt = z.infer<typeof ordinaryAuthorityReceipt>;
export interface OrdinaryProfileReadDecision {
  readonly schema_version: "portal.ordinary-profile-read-decision.v1";
  readonly actor: Readonly<AccessActor>; readonly workspace_id: string; readonly environment: OrdinaryEnvironment;
  readonly domain: Readonly<ManagerReadDomain>; readonly field_policy_ref: string;
  readonly fingerprint: string; readonly valid_until_ms: number; readonly head_revision: string;
  readonly grant_id: string; readonly grant_revision: string;
}
export interface OrdinaryProfileConfirmation { assertCurrent(): void }
export interface OrdinaryProfileReadPort {
  usesPool(pool: unknown): boolean;
  usesCoordinator(coordinator: unknown): boolean;
  read(actor: AccessActor, workspace: string, environment: OrdinaryEnvironment,
    domainOrProfileId: ManagerReadDomain | string): Promise<OrdinaryProfileReadDecision | null>;
  confirmMany(decisions: readonly OrdinaryProfileReadDecision[]): Promise<OrdinaryProfileConfirmation | null>;
}
export class OrdinaryProfileAuthorityError extends Error {
  constructor(readonly code: "ORDINARY_AUTHORITY_INVALID" | "ORDINARY_AUTHORITY_TARGET_MISMATCH" |
    "ORDINARY_AUTHORITY_REVISION_CONFLICT" | "ORDINARY_AUTHORITY_KEY_CONFLICT" |
    "ORDINARY_AUTHORITY_DENIED" | "ORDINARY_AUTHORITY_RETRY_REQUIRED" |
    "ORDINARY_AUTHORITY_WINDOW_EXPIRED" | "ORDINARY_AUTHORITY_BOUND_EXCEEDED", readonly status = 409) {
    super("The requested ordinary profile authority is not available.");
  }
}
