import { z } from "zod";
import { accessResource, accessText, tsMembershipAcceptance, tsRootMembershipAcceptance, type AccessResource,
  type ScopedAccessGrant, type TsMembershipAcceptance, type TsRootMembershipAcceptance } from "./access.contract";
import { accessDigest, canonicalSelector } from "./access-digest";

/** Private, source-authenticated adapter result, NOT a browser entitlement or
 * installed provider. PM validates original native correspondence and holds the
 * real revocation fence; this representation never replaces that source work.
 * A missing target denies only that resource/environment. No legacy fallback
 * is allowed when the versioned extension is present but invalid/incomplete. */
const revision = tsMembershipAcceptance.shape.mapping_revision;
const environment = z.enum(["paper", "sandbox", "live"]);
const digest = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const distinctIds = z.array(accessText).max(200).refine(ids => new Set(ids).size === ids.length);
const resourceSet = z.array(accessResource).max(200).refine(resources =>
  new Set(resources.map(resource => JSON.stringify([resource.kind, resource.id]))).size === resources.length);
const target = z.object({ resource: accessResource, environment,
  revision, native_reference_digest: digest,
  valid_from_ms: z.number().int().nonnegative().safe(),
  valid_until_ms: z.number().int().nonnegative().safe(),
}).strict().refine(value => value.valid_until_ms > value.valid_from_ms);
export const currentAccessRelations = z.object({
  schema_version: z.literal("pma.core-current-relations.v1"),
  subject_user_id: accessText, workspace_id: accessText,
  ts_user_id: accessText, mapping_revision: revision,
  resources: z.array(z.object({ environment,
    revision, own_alpha_ids: distinctIds, member_portfolio_ids: distinctIds,
    roots: z.array(z.object({ root_id: accessText, revision, complete: z.boolean(),
      resources: resourceSet }).strict()).max(64),
  }).strict()).max(3),
  grants: z.array(z.object({ grant_id: accessText, binding_digest: digest,
    accepted: z.union([tsMembershipAcceptance, tsRootMembershipAcceptance]),
    targets: z.array(target).max(200),
  }).strict()).max(64),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.resources.map(item => item.environment)).size !== value.resources.length ||
    new Set(value.grants.map(item => item.grant_id)).size !== value.grants.length ||
    value.resources.some(item => new Set(item.roots.map(root => root.root_id)).size !== item.roots.length) ||
    value.grants.some(item => new Set(item.targets.map(proof =>
      JSON.stringify([proof.environment, proof.resource.kind, proof.resource.id]))).size !== item.targets.length))
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "AMBIGUOUS_CURRENT_CORRESPONDENCE" });
  // Existing private source transport is32KiB. Structural caps are protocol
  // ceilings, NOT an installed product/capacity budget or truncation policy.
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > 32768)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "CURRENT_CORRESPONDENCE_TOO_LARGE" });
});
export type CurrentAccessRelations = z.infer<typeof currentAccessRelations>;
export type AccessEnvironment = "paper" | "sandbox" | "live";

/** Receipt attachment changes Core revision only. Bind the ORIGINAL immutable
 * grant meaning; never reconstruct historical mapping/receipt from today's head. */
export function grantBindingDigest(grant: ScopedAccessGrant): string {
  const { revision: _revision, ts_receipt: _receipt, ts_acceptance_digest: _acceptance, revoked_at_ms: _revoked, ...meaning } = grant;
  return accessDigest({ ...meaning, selector: canonicalSelector(meaning.selector),
    environments: [...meaning.environments].sort(), delegable_actions: [...meaning.delegable_actions].sort() });
}
export function acceptedFactMatchesGrant(fact: TsMembershipAcceptance | TsRootMembershipAcceptance, grant: ScopedAccessGrant): boolean {
  const {ts_acceptance_digest:_acceptedDigest,...originalMeaning}=grant;
  if ("context" in fact && (fact.grant_id!==grant.grant_id || fact.policy_revision!==grant.policy_revision ||
    accessDigest({...originalMeaning,revision:fact.expected_grant_revision,ts_receipt:null,revoked_at_ms:null})!==fact.grant_digest)) return false;
  return fact.outcome === "ACCEPTED" && fact.portal_user_id === grant.subject_user_id &&
    fact.workspace_id === grant.workspace_id && fact.action === grant.action && fact.human_requester_user_id === grant.issued_by &&
    fact.selector_digest === accessDigest(canonicalSelector(grant.selector)) &&
    accessDigest([...fact.environments].sort()) === accessDigest([...grant.environments].sort()) &&
    fact.effective_at_ms >= grant.valid_from_ms &&
    (grant.valid_until_ms === null || fact.expires_at_ms !== null && fact.expires_at_ms <= grant.valid_until_ms);
}

/** Ordinary/reviewed-root receipt intake uses the SAME complete target proof
 * as later reads. The original accepted fact itself remains unchanged. */
export function currentAcceptanceMatches(fact: TsMembershipAcceptance | TsRootMembershipAcceptance, grant: ScopedAccessGrant,
  source: CurrentAccessRelations, now: number): boolean {
  const entry=source.grants.find(item=>item.grant_id===grant.grant_id);
  if (!entry || accessDigest(entry.accepted)!==accessDigest(fact)) return false;
  const attached={...grant,ts_acceptance_digest:accessDigest(fact),ts_receipt:{receipt_id:fact.receipt_id,membership_revision:fact.membership_revision,
    mapping_revision:fact.mapping_revision,effective_at_ms:fact.effective_at_ms,expires_at_ms:fact.expires_at_ms}};
  return grant.environments.every(env=>{
    const resources=currentResources(grant.selector,source,env);
    return resources!==null && resources.length>0 && resources.every(resource=>currentGrantProof(attached,source,resource,env,now)!==null);
  });
}
export function currentGrantProof(grant: ScopedAccessGrant, source: CurrentAccessRelations,
  resource: AccessResource, env: AccessEnvironment, now: number) {
  if (source.subject_user_id !== grant.subject_user_id || source.workspace_id !== grant.workspace_id) return null;
  const entry = source.grants.find(item => item.grant_id === grant.grant_id), receipt = grant.ts_receipt;
  if (!entry || !receipt || grant.ts_acceptance_digest!==accessDigest(entry.accepted) || entry.binding_digest !== grantBindingDigest(grant) ||
    !acceptedFactMatchesGrant(entry.accepted, grant) || entry.accepted.receipt_id !== receipt.receipt_id ||
    entry.accepted.membership_revision !== receipt.membership_revision ||
    entry.accepted.mapping_revision !== receipt.mapping_revision ||
    entry.accepted.ts_user_id !== source.ts_user_id ||
    source.mapping_revision !== receipt.mapping_revision ||
    entry.accepted.effective_at_ms !== receipt.effective_at_ms || entry.accepted.expires_at_ms !== receipt.expires_at_ms ||
    receipt.effective_at_ms > now || receipt.expires_at_ms !== null && receipt.expires_at_ms <= now) return null;
  const selected = entry.targets.find(item => item.environment === env && item.resource.kind === resource.kind &&
    item.resource.id === resource.id);
  return selected && selected.valid_from_ms <= now && now < selected.valid_until_ms ? selected : null;
}

/** Complete finite ROOT coverage is independently qualified for one environment.
 * An empty/partial census does not become a wildcard or deny explicit siblings. */
export function currentResources(selector: ScopedAccessGrant["selector"], source: CurrentAccessRelations,
  env: AccessEnvironment): AccessResource[] | null {
  if (selector.kind === "EXPLICIT_RESOURCE_SET") return selector.ids.map(id => ({ kind: selector.resource_kind, id }));
  const cut = source.resources.find(item => item.environment === env);
  if (!cut) return null;
  if (selector.kind === "OWN_ALPHA") return cut.own_alpha_ids.map(id => ({ kind: "ALPHA", id }));
  if (selector.kind === "PORTFOLIO_MEMBERSHIP") return selector.portfolio_ids
    .filter(id => cut.member_portfolio_ids.includes(id)).map(id => ({ kind: "PORTFOLIO", id }));
  const root = cut.roots.find(item => item.root_id === selector.root_id);
  if (!root || !root.complete || root.resources.length === 0) return null;
  return [{ kind: "ROOT", id: root.root_id }, ...root.resources];
}
