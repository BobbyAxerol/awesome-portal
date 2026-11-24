/** OFFLINE candidate authoring only. A checked predecessor hash is NOT a DB
 * compare-and-swap or installed authority. No installer/service is imported.
 * Renewal/hot-add output uses the existing document schema, but applying it to
 * an existing workspace requires the separately assigned ordinary writer (G3).
 * Native first-install/successor, source trust and two-hour limits are untouched. */
import { createHash } from "node:crypto";
import { z } from "zod";
import { accessDigest } from "./access-digest";
import {
  ACCESS_PROFILE_DEFAULT_VALIDITY_MS, accessProfileBuildInput, assertAccessProfileInvariants,
  buildAccessProfileArtifact, type AccessProfileBuildResult,
} from "./access-profile-artifact";
import { PRIVATE_FILE_MAX_BYTES } from "./private-root-file";

export const ordinaryProfileLifecycleRequest = z.object({
  schema_version: z.literal("portal.ordinary-profile-lifecycle.v1"),
  operation: z.enum(["BOOTSTRAP", "RENEW", "HOT_ADD"]),
  expected_current_sha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  next: accessProfileBuildInput,
}).strict();
export type OrdinaryProfileLifecycleRequest = z.input<typeof ordinaryProfileLifecycleRequest>;
export type OrdinaryProfileLifecycleCode = "ORDINARY_PROFILE_INPUT_INVALID" | "ORDINARY_PROFILE_CURRENT_REQUIRED" |
  "ORDINARY_PROFILE_CURRENT_MISMATCH" | "ORDINARY_PROFILE_CURRENT_INVALID" | "ORDINARY_PROFILE_TARGET_CHANGED" |
  "ORDINARY_PROFILE_REVISION_REUSED" | "ORDINARY_PROFILE_ID_REUSED" | "ORDINARY_PROFILE_SCOPE_REMOVED" |
  "ORDINARY_PROFILE_OPERATION_MISMATCH" | "ORDINARY_PROFILE_TERM_INVALID";
export class OrdinaryProfileLifecycleError extends Error {
  constructor(readonly code: OrdinaryProfileLifecycleCode) {
    super(code);
    this.name = "OrdinaryProfileLifecycleError";
  }
}
const refuse = (code: OrdinaryProfileLifecycleCode): never => { throw new OrdinaryProfileLifecycleError(code); };
const hash = (bytes: string) => createHash("sha256").update(bytes, "utf8").digest("hex");
type Document = AccessProfileBuildResult["document"];
type Seal = NonNullable<Document["policy"]["manager_read_domains"]>[number];
type Grant = Document["manager_domain_grants"][number];
const sealKey = (s: Pick<Seal, "environment" | "domain" | "field_policy_ref">) =>
  accessDigest([s.environment, s.domain, s.field_policy_ref]);
const grantKey = (g: Grant) => accessDigest([g.subject_user_id, sealKey(g), g.action]);
const interval = (v: { valid_from_ms: number; valid_until_ms: number }) => [v.valid_from_ms, v.valid_until_ms];

function fixedTerms(doc: Document): void {
  for (const value of [...(doc.policy.manager_read_domains ?? []), ...doc.manager_domain_grants])
    if (value.valid_until_ms - value.valid_from_ms !== ACCESS_PROFILE_DEFAULT_VALIDITY_MS)
      refuse("ORDINARY_PROFILE_TERM_INVALID");
}
function pinnedCurrent(bytes: string, expected: string): Document {
  if (Buffer.byteLength(bytes, "utf8") > PRIVATE_FILE_MAX_BYTES) return refuse("ORDINARY_PROFILE_CURRENT_INVALID");
  if (hash(bytes) !== expected) return refuse("ORDINARY_PROFILE_CURRENT_MISMATCH");
  try {
    const raw: unknown = JSON.parse(bytes);
    if (JSON.stringify(raw) !== bytes) return refuse("ORDINARY_PROFILE_CURRENT_INVALID");
    const doc = assertAccessProfileInvariants(raw);
    fixedTerms(doc);
    return doc;
  } catch (error) {
    if (error instanceof OrdinaryProfileLifecycleError) throw error;
    return refuse("ORDINARY_PROFILE_CURRENT_INVALID");
  }
}

/** Pure executable artifact transformation. Existing identities are never
 * edited/reused: the returned predecessor evidence must be retained alongside
 * the new artifact. This cannot prove the actual DB head or unseen history.
 * It refuses legacy/DENY/other policy families rather than silently dropping
 * them; G3 must preserve/reconcile those actual installed facts atomically. */
export function buildOrdinaryProfileLifecycle(raw: unknown, currentBytes?: string) {
  const parsed = ordinaryProfileLifecycleRequest.safeParse(raw);
  if (!parsed.success) return refuse("ORDINARY_PROFILE_INPUT_INVALID");
  const request = parsed.data;
  const bootstrap = request.operation === "BOOTSTRAP";
  if (bootstrap ? request.expected_current_sha256 !== null || currentBytes !== undefined :
    request.expected_current_sha256 === null || currentBytes === undefined)
    return refuse("ORDINARY_PROFILE_CURRENT_REQUIRED");
  const current = bootstrap ? null : pinnedCurrent(currentBytes!, request.expected_current_sha256!);
  const built = buildAccessProfileArtifact(request.next);
  fixedTerms(built.document);
  const next = built.document;
  if (current) {
    if (accessDigest(current.target) !== accessDigest(next.target)) return refuse("ORDINARY_PROFILE_TARGET_CHANGED");
    if (current.policy.revision === next.policy.revision) return refuse("ORDINARY_PROFILE_REVISION_REUSED");
    const oldIds = new Set(current.manager_domain_grants.map(g => g.grant_id));
    if (next.manager_domain_grants.some(g => oldIds.has(g.grant_id))) return refuse("ORDINARY_PROFILE_ID_REUSED");
    const nextSeals = new Map((next.policy.manager_read_domains ?? []).map(s => [sealKey(s), s]));
    const nextGrants = new Map(next.manager_domain_grants.map(g => [grantKey(g), g]));
    const oldSeals = current.policy.manager_read_domains ?? [];
    const checkReplacement = (old: Seal | Grant, replacement: Seal | Grant | undefined) => {
      if (!replacement) return refuse("ORDINARY_PROFILE_SCOPE_REMOVED");
      if (request.operation === "HOT_ADD" && accessDigest(interval(replacement)) !== accessDigest(interval(old)))
        return refuse("ORDINARY_PROFILE_OPERATION_MISMATCH");
      if (request.operation === "RENEW" && (replacement.valid_from_ms < old.valid_from_ms ||
        replacement.valid_until_ms <= old.valid_until_ms)) return refuse("ORDINARY_PROFILE_OPERATION_MISMATCH");
    };
    for (const old of oldSeals) checkReplacement(old, nextSeals.get(sealKey(old)));
    for (const old of current.manager_domain_grants) checkReplacement(old, nextGrants.get(grantKey(old)));
    const added = nextSeals.size > oldSeals.length || nextGrants.size > current.manager_domain_grants.length;
    if (request.operation === "RENEW" ? added : !added) return refuse("ORDINARY_PROFILE_OPERATION_MISMATCH");
  }
  return Object.freeze({
    state: "OFFLINE_ARTIFACT_PREPARED" as const, operation: request.operation,
    installed: false as const, database_checked: false as const, source_checked: false as const,
    delegation_performed: false as const, application_requires: "G3_ORDINARY_AUTHORITY_WRITER" as const,
    artifact: built,
    predecessor: current ? Object.freeze({
      artifact_sha256: request.expected_current_sha256!, policy_revision: current.policy.revision,
      /** Exact immutable input bytes, not a replacement policy/grant write. */
      artifact_bytes: currentBytes!,
      grants: current.manager_domain_grants.map(g => Object.freeze({ grant_id: g.grant_id,
        revision: g.revision, digest: accessDigest(g) })),
    }) : null,
  });
}
