import type { AccessTrustProvider } from "./access-trust";
import { datasetPublication, DatasetPublication, PublicationPurpose } from "./publication.contract";
import { accessDigest } from "./access-policy";
import type { ExecutionReadPublicationRequest } from "./read-publication";
import { EXECUTION_PUBLICATION_CATALOGUE } from "./publication-source.generated";
import { createHash } from "node:crypto";
import { z } from "zod";

const commissioningText = z.string().min(1).max(256);
const commissioningScope = z.object({ workspace_id: commissioningText,
  environment: z.enum(["paper", "sandbox", "live"]), profile_id: commissioningText }).strict();
const commissioningArtifact = z.object({ schema_version: z.literal("portal.execution.publication-commissioning.v1"),
  scope: commissioningScope, catalogue_digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  adapter_id: commissioningText, family_ids: z.array(commissioningText).min(1).max(42),
  purposes: z.array(z.enum(["BUSINESS", "AUDIT", "TECHNICAL", "EXPORT", "STREAM"])).min(1).max(5),
  // Pins name independently reviewed source proofs, not permission claims or credentials.
  receipt_pins: z.object({ source_read: commissioningText, transport_trust: commissioningText,
    privacy: commissioningText, field_policy: commissioningText }).strict(),
}).strict();
export interface PublicationCommissioningApproval {
  artifact_sha256: string; adapter_id: string; approval_ref: string;
  approved_at_ms: number; valid_until_ms: number;
}
declare const commissioningBrand: unique symbol;
export interface PublicationCommissioning { readonly [commissioningBrand]: true }
const commissioned = new WeakMap<PublicationCommissioning, {
  artifact: z.infer<typeof commissioningArtifact>; approval: PublicationCommissioningApproval;
}>();
/** Private deployment configuration only. Exact artifact bytes and an independent
 * reviewed pin are both required. This is NOT a source wire/export, current human
 * policy, mTLS verifier or authority minted from a JSON qualification string. */
export function loadPublicationCommissioning(bytes: Uint8Array | string,
  pin: PublicationCommissioningApproval, nowMs: number): PublicationCommissioning {
  const approval = z.object({ artifact_sha256: z.string().regex(/^sha256:[a-f0-9]{64}$/), adapter_id: commissioningText,
    approval_ref: commissioningText, approved_at_ms: z.number().int().nonnegative().safe(),
    valid_until_ms: z.number().int().nonnegative().safe() }).strict().parse(pin);
  const raw = Buffer.from(bytes);
  if (!Number.isSafeInteger(nowMs) || nowMs < approval.approved_at_ms || nowMs >= approval.valid_until_ms ||
    raw.length > 65_536 || `sha256:${createHash("sha256").update(raw).digest("hex")}` !== approval.artifact_sha256)
    throw new Error("PUBLICATION_COMMISSIONING_PIN_INVALID");
  const artifact = commissioningArtifact.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw)));
  if (artifact.adapter_id !== approval.adapter_id || artifact.catalogue_digest !== EXECUTION_PUBLICATION_CATALOGUE.source_catalogue_digest ||
    artifact.family_ids.some(id => !EXECUTION_PUBLICATION_CATALOGUE.families.some(f => f.family_id === id)) ||
    new Set(artifact.family_ids).size !== artifact.family_ids.length || new Set(artifact.purposes).size !== artifact.purposes.length)
    throw new Error("PUBLICATION_COMMISSIONING_SCOPE_INVALID");
  const handle = Object.freeze({}) as PublicationCommissioning;
  commissioned.set(handle, { artifact: structuredClone(artifact), approval: { ...approval } });
  return handle;
}
export function publicationCommissioningCurrent(handle: PublicationCommissioning | undefined,
  scope: z.infer<typeof commissioningScope>, nowMs: number): boolean {
  const record = handle && commissioned.get(handle);
  return !!record && Number.isSafeInteger(nowMs) && nowMs >= record.approval.approved_at_ms && nowMs < record.approval.valid_until_ms &&
    accessDigest(scope) === accessDigest(record.artifact.scope);
}
export function publicationCommissioningDeadline(handle: PublicationCommissioning): number {
  const record = commissioned.get(handle);
  if (!record) throw new Error("PUBLICATION_COMMISSIONING_PIN_INVALID");
  return record.approval.valid_until_ms;
}

export class ExecutionPublicationError extends Error {
  constructor(readonly code: "PUBLICATION_CONTRACT_REJECTED" | "PUBLICATION_NOT_QUALIFIED" |
    "PUBLICATION_REVOKED" | "PUBLICATION_DRAINING" | "PUBLICATION_EXPIRED" |
    "PUBLICATION_SCOPE_MISMATCH" | "PUBLICATION_CONTINUITY_UNPROVED", readonly status = 503) {
    super("The requested source publication is not available.");
  }
}
const reject = (code: ExecutionPublicationError["code"], status = 503): never => { throw new ExecutionPublicationError(code, status); };
export interface PublicationContinuity {
  source_continuity_epoch: string; projection_generation: string; partition_id: string; snapshot_id: string;
}
interface PublicationOptions {
  purpose: PublicationPurpose; allowTestOnly?: boolean; expectedContinuity?: PublicationContinuity;
  commissioning?: PublicationCommissioning;
}

/** No publication state is cached: revoke/drain and receipt expiry are checked
 * on every scope mint and final delivery fence by ExecutionReadScopes. Source
 * proof verification is the qualified private adapter's responsibility; a
 * string receipt or this parser is not itself mTLS/signature verification. */
export function qualifyDatasetPublication(input: unknown, request: ExecutionReadPublicationRequest,
  options: PublicationOptions & { nowMs: number }): DatasetPublication {
  const parsed = datasetPublication.safeParse(input);
  if (!parsed.success || !Number.isSafeInteger(options.nowMs) || options.nowMs < 0)
    return reject("PUBLICATION_CONTRACT_REJECTED");
  const p = parsed.data;
  if (p.state === "REVOKED") return reject("PUBLICATION_REVOKED", 409);
  if (p.state === "DRAINING") return reject("PUBLICATION_DRAINING", 409);
  if (p.issued_at_ms > options.nowMs || p.expires_at_ms <= options.nowMs || p.expires_at_ms <= p.issued_at_ms)
    return reject("PUBLICATION_EXPIRED");
  if (p.observed_at_ms > options.nowMs || p.source_as_of_ms !== null && p.source_as_of_ms > p.observed_at_ms)
    return reject("PUBLICATION_CONTRACT_REJECTED");
  if (p.catalogue_digest !== EXECUTION_PUBLICATION_CATALOGUE.source_catalogue_digest ||
      !EXECUTION_PUBLICATION_CATALOGUE.families.some(f => f.family_id === p.family_id))
    return reject("PUBLICATION_NOT_QUALIFIED");
  if (p.authority.binding.dataset_id !== p.family_id ||
      p.purpose !== options.purpose || p.environment !== request.environment || p.profile_id !== request.profile_id ||
      p.authority.environment !== request.environment || p.authority.profile_id !== request.profile_id ||
      p.authority.workspace_id !== request.workspace_id || accessDigest(p.authority.binding) !== accessDigest(request.binding))
    return reject("PUBLICATION_SCOPE_MISMATCH", 409);
  const qualifications = [p.source_read, p.transport_trust, p.privacy, p.field_policy, p.authority];
  if (qualifications.some(f => f.qualification !== "SOURCE_VERIFIED" && !(options.allowTestOnly === true && f.qualification === "TEST_ONLY")))
    return reject("PUBLICATION_NOT_QUALIFIED");
  // A source string alone can never commission itself. The installed private
  // adapter still authenticates transport/current source and human authority.
  if (p.authority.qualification === "SOURCE_VERIFIED") {
    const record = options.commissioning && commissioned.get(options.commissioning);
    if (!record || !publicationCommissioningCurrent(options.commissioning, {
      workspace_id: request.workspace_id, environment: request.environment, profile_id: request.profile_id }, options.nowMs) ||
      !record.artifact.family_ids.includes(p.family_id) || !record.artifact.purposes.includes(p.purpose) ||
      (["source_read", "transport_trust", "privacy", "field_policy"] as const).some(key =>
        p[key].qualification !== "SOURCE_VERIFIED" || p[key].receipt_ref !== record.artifact.receipt_pins[key]))
      return reject("PUBLICATION_NOT_QUALIFIED");
  }
  if (p.history_capability === "SNAPSHOT_TAIL") {
    const b = p.barrier, expected = options.expectedContinuity;
    if (!b || BigInt(b.first_tail_sequence) !== BigInt(b.snapshot_sequence) + 1n ||
        BigInt(b.retention_floor_sequence) > BigInt(b.first_tail_sequence) ||
        p.authority.binding.projection_generation !== b.projection_generation || !expected ||
        b.source_continuity_epoch !== expected.source_continuity_epoch || b.projection_generation !== expected.projection_generation ||
        b.partition_id !== expected.partition_id || b.snapshot_id !== expected.snapshot_id)
      return reject("PUBLICATION_CONTINUITY_UNPROVED");
  } else if (p.barrier !== null) return reject("PUBLICATION_CONTINUITY_UNPROVED");
  // Current pages and observed history never acquire an event/replay purpose.
  if (p.purpose === "STREAM" && p.history_capability !== "SNAPSHOT_TAIL")
    return reject("PUBLICATION_CONTINUITY_UNPROVED");
  return structuredClone(p);
}

/** Composes with, never replaces, Portal/TS identity and current field policy.
 * No routes/client/credentials are created here; default production trust is
 * unchanged. Missing source is null, not a guessed relation or successful empty. */
export function withCataloguePublications(base: AccessTrustProvider,
  source: (request: ExecutionReadPublicationRequest) => Promise<unknown | null>,
  options: PublicationOptions & { now?: () => number }): AccessTrustProvider {
  const policy = {purpose:options.purpose,allowTestOnly:options.allowTestOnly === true,
    commissioning:options.commissioning,
    expectedContinuity:options.expectedContinuity && structuredClone(options.expectedContinuity)};
  const now = options.now ?? Date.now;
  return {
    verifyPolicy: input => base.verifyPolicy(input), verifyReceipt: input => base.verifyReceipt(input),
    relations: (user, workspace) => base.relations(user, workspace),
    verifiedHumanMapping: (user, workspace) => base.verifiedHumanMapping(user, workspace),
    readPublication: async request => {
      const copy = structuredClone(request);
      const result = await source(structuredClone(copy));
      if (result === null) return null;
      return qualifyDatasetPublication(result, copy, { ...policy, nowMs: now() }).authority;
    },
  };
}
