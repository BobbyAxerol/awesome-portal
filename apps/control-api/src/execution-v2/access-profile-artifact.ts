/** OFFLINE access-profile artifact builder and invariant checker (owner decision 2026-11-23).
 *
 * No runtime effect: nothing imports this from application startup, a module, a flag or a route, it opens no
 * database, no socket and no file, and it installs nothing. It turns a reviewed profiles/users input into the
 * compact artifact of the EXISTING schema `portal.private-owner-manager-commissioning.v1`
 * (core-owner-commissioning.ts) plus its sha256 for the owner to approve. Installing it stays a separate, gated,
 * owner-approved step that does not exist in this change.
 *
 * Design points (owner, 2026-11-23):
 * - READ only (`business.read_all`). No STREAM, no command, no write, no DENY; no option bypass.
 * - 12-month default/maximum term (365 days). No Plan B `grant_window` pin; native limits are unchanged.
 * - Profiles are DATA with a `profile_key` and a `version`. An upgraded Edge seal is a NEW version of the same key;
 *   old and new may overlap in one artifact. Nothing is edited in place.
 * - Namespaces: `execution` is implemented; `research` and `ainative` are reserved and refused with a clear message
 *   for now; anything else is unknown and refused.
 * - The protected owner (bobby) is the only immutable fact: he must hold EVERY sealed profile and EVERY action that
 *   any other subject holds, for the whole window; no other subject may hold more than he does. stan is a second
 *   administrator reader granted BY the owner. Delegation (stan to employees) is NOT implemented: every grant is
 *   issued by the owner and has no parent; the data model keeps `granted_by` / `parent_grant_id` so a later change
 *   can add it without rewriting artifacts. */
import { createHash } from "node:crypto";
import { z } from "zod";
import { accessDigest } from "./access-digest";
import { managerDomainGrant, type ManagerDomainGrant } from "./access.contract";
import { privateOwnerCommissioningDocument } from "./core-owner-commissioning";
import { executionEnvironment } from "./foundation.contract";
import { ownerTarget } from "./owner-target";
import { PRIVATE_FILE_MAX_BYTES } from "./private-root-file";
import { TS_PINS_20261123_ID, TS_PROFILE_PINS_20261123 } from "./access-profile-pins";

export const ACCESS_PROFILE_INPUT_SCHEMA = "portal.access-profile-input.v1";
export const ACCESS_PROFILE_DEFAULT_VALIDITY_MS = 365 * 86_400_000;
export const ACCESS_PROFILE_MAXIMUM_VALIDITY_MS = ACCESS_PROFILE_DEFAULT_VALIDITY_MS;
export const READ_ACTION = "business.read_all" as const;
export const STREAM_ACTION = "stream.subscribe" as const;
export const IMPLEMENTED_NAMESPACES: readonly string[] = ["execution"];
export const RESERVED_NAMESPACES: readonly string[] = ["research", "ainative"];

export type AccessProfileCode =
  "ACCESS_PROFILE_INPUT_INVALID" | "ACCESS_PROFILE_NAMESPACE_RESERVED" | "ACCESS_PROFILE_NAMESPACE_UNKNOWN" |
  "ACCESS_PROFILE_SEAL_INCOMPLETE" | "ACCESS_PROFILE_DUPLICATE" | "ACCESS_PROFILE_WINDOW_INVALID" |
  "ACCESS_PROFILE_OWNER_REQUIRED" | "ACCESS_PROFILE_OWNER_LIMITED" | "ACCESS_PROFILE_EXCEEDS_OWNER" |
  "ACCESS_PROFILE_DELEGATION_NOT_IMPLEMENTED" | "ACCESS_PROFILE_ACTION_NOT_ALLOWED" | "ACCESS_PROFILE_ARTIFACT_INVALID";

export class AccessProfileError extends Error {
  constructor(readonly code: AccessProfileCode, message: string) { super(message); this.name = "AccessProfileError"; }
}
const refuse = (code: AccessProfileCode, message: string): never => { throw new AccessProfileError(code, message); };

const text = z.string().min(1).max(256).refine(v => !/[\u0000-\u001f\u007f]/u.test(v));
const key = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);
const epoch = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
/** 64 lowercase hex, with or without the `sha256:` prefix Edge uses in its messages; stored without it. */
const hex = z.string().regex(/^(sha256:)?[0-9a-f]{64}$/).transform(v => v.replace(/^sha256:/, ""));

export const accessProfileInput = z.object({
  profile_key: key, version: z.number().int().min(1).max(9999),
  /** Reserved vocabulary, see IMPLEMENTED_NAMESPACES / RESERVED_NAMESPACES. Checked separately for a clear message. */
  namespace: z.string().min(1).max(64).default("execution"),
  environment: executionEnvironment, profile_id: text,
  catalogue_sha256: hex, profile_sha256: hex.nullable(), field_policy_sha256: hex, field_policy_dir: text,
  /** Default true; a profile without profile_sha256 defaults to false (pending). */
  enabled: z.boolean().optional(),
  valid_from_ms: epoch.optional(), valid_until_ms: epoch.optional(),
}).strict();
export type AccessProfileInput = z.input<typeof accessProfileInput>;

export const accessProfileUser = z.object({
  user_id: text, role: z.enum(["OWNER", "ADMIN_READER", "READER"]),
  /** Owner-only for now (delegation is not implemented); kept so the data model can grow. */
  granted_by: text, parent_grant_id: text.nullable().default(null),
  profiles: z.union([z.literal("ALL"), z.array(key).min(1).max(32)]),
  actions: z.array(z.string().min(1).max(64)).min(1).max(4).optional(),
}).strict();
export type AccessProfileUser = z.input<typeof accessProfileUser>;

export const accessProfileBuildInput = z.object({
  schema_version: z.literal(ACCESS_PROFILE_INPUT_SCHEMA),
  target: ownerTarget, policy_revision: text, approval_ref: text, provenance_ref: text,
  valid_from_ms: epoch, validity_ms: z.number().int().positive().optional(),
  /** An explicit list, or the id of the checked-in TS pin set (TS_PINS_20261123_ID). */
  profiles: z.union([z.literal(TS_PINS_20261123_ID), z.array(accessProfileInput).min(1).max(64)]),
  users: z.array(accessProfileUser).min(1).max(65),
}).strict();
export type AccessProfileBuildInput = z.input<typeof accessProfileBuildInput>;

export interface AccessProfileOptions {
  /** Retained for source compatibility only. The ordinary offline tool never allows STREAM or DENY. */
  readonly allowStreamOrDeny?: boolean;
}

export interface AccessProfileBuildResult {
  readonly document: z.infer<typeof privateOwnerCommissioningDocument>;
  /** Exact compact bytes of the artifact (what the owner hashes, approves and places root-owned 0600). */
  readonly bytes: string;
  /** sha256 hex of `bytes`: the owner-approved pin for the root-owned file. */
  readonly sha256: string;
  readonly summary: {
    readonly policy_revision: string; readonly valid_from_ms: number; readonly valid_until_ms: number;
    readonly profiles_included: readonly string[]; readonly profiles_excluded: readonly { id: string; reason: string }[];
    readonly subjects: readonly { user_id: string; role: string; grants: number }[];
    readonly grants: number; readonly actions: readonly string[];
  };
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => [k, canonical(v)]));
  return value;
}
const sha256Hex = (bytes: string) => createHash("sha256").update(bytes, "utf8").digest("hex");
const id = (profile: { profile_key: string; version: number }) => `${profile.profile_key}@v${profile.version}`;

/** Grant ids are deterministic so the same input always yields the same artifact bytes. */
function grantId(revision: string, user: string, profile: { profile_key: string; version: number }, action: string): string {
  const raw = `${revision}.${user}.${profile.profile_key}.v${profile.version}.${action === READ_ACTION ? "read" : "stream"}`;
  if ([...raw].length <= 200) return raw;
  return `agr-${createHash("sha256").update(raw).digest("hex").slice(0, 48)}`;
}

type Profile = z.output<typeof accessProfileInput>;

function checkNamespace(profile: Profile): void {
  if (IMPLEMENTED_NAMESPACES.includes(profile.namespace)) return;
  if (RESERVED_NAMESPACES.includes(profile.namespace))
    refuse("ACCESS_PROFILE_NAMESPACE_RESERVED",
      "This namespace is reserved for a later version and is not implemented yet; only execution is accepted.");
  refuse("ACCESS_PROFILE_NAMESPACE_UNKNOWN",
    "The namespace is unknown; only execution is implemented.");
}

/** A target is an exact workspace population, not a bag of user ids. */
function assertTargetPrincipals(target: z.infer<typeof ownerTarget>, code: AccessProfileCode): void {
  const pins = target.principal_workspace_pins;
  if (pins.some(p => p.workspace_id !== target.workspace_id) ||
      new Set(pins.map(p => p.user_id)).size !== pins.length ||
      !pins.some(p => p.user_id === target.protected_owner_user_id && p.workspace_id === target.workspace_id))
    refuse(code, "The target requires distinct principals in its exact workspace, including the protected owner.");
}

/** Pure. Same input and options give the same bytes. Throws AccessProfileError with a fixed code. */
export function buildAccessProfileArtifact(rawInput: unknown, options: AccessProfileOptions = {}): AccessProfileBuildResult {
  const parsed = accessProfileBuildInput.safeParse(rawInput);
  if (!parsed.success) return refuse("ACCESS_PROFILE_INPUT_INVALID", "The access-profile input does not match portal.access-profile-input.v1.");
  const input = parsed.data;
  const target = input.target, owner = target.protected_owner_user_id;
  assertTargetPrincipals(target, "ACCESS_PROFILE_INPUT_INVALID");
  if (options.allowStreamOrDeny) refuse("ACCESS_PROFILE_ACTION_NOT_ALLOWED", "Only READ ALLOW artifacts are supported.");
  const profilesRaw: unknown[] = input.profiles === TS_PINS_20261123_ID ? TS_PROFILE_PINS_20261123.map(p => ({ ...p })) : [...input.profiles];
  const profiles = profilesRaw.map(p => {
    const r = accessProfileInput.safeParse(p);
    return r.success ? r.data : refuse("ACCESS_PROFILE_INPUT_INVALID", "A profile entry does not match the profile schema (full 64-hex pins are required; none are guessed).");
  });

  const validity = input.validity_ms ?? ACCESS_PROFILE_DEFAULT_VALIDITY_MS;
  if (validity > ACCESS_PROFILE_MAXIMUM_VALIDITY_MS)
    refuse("ACCESS_PROFILE_WINDOW_INVALID", "validity_ms exceeds the approved 12-month term of this builder.");
  const globalFrom = input.valid_from_ms, globalUntil = globalFrom + validity;
  if (!Number.isSafeInteger(globalUntil)) refuse("ACCESS_PROFILE_WINDOW_INVALID", "The validity window is not a safe integer.");

  const seen = new Set<string>(), seenSeals = new Set<string>();
  const included: Profile[] = [], excluded: { id: string; reason: string }[] = [];
  for (const p of profiles) {
    checkNamespace(p);
    if (seen.has(id(p))) refuse("ACCESS_PROFILE_DUPLICATE", "A profile version is listed twice; an upgrade needs a new version number.");
    seen.add(id(p));
    const enabled = p.enabled ?? p.profile_sha256 !== null;
    if (!enabled) { excluded.push({ id: id(p), reason: p.profile_sha256 === null ? "PROFILE_SHA256_PENDING" : "DISABLED" }); continue; }
    if (p.profile_sha256 === null)
      refuse("ACCESS_PROFILE_SEAL_INCOMPLETE", "An enabled profile has no profile_sha256 and cannot be sealed.");
    const from = p.valid_from_ms ?? globalFrom, until = p.valid_until_ms ?? globalUntil;
    if (until <= from || until - from > ACCESS_PROFILE_MAXIMUM_VALIDITY_MS)
      refuse("ACCESS_PROFILE_WINDOW_INVALID", "A profile has an invalid or over-long window.");
    const sealKey = JSON.stringify([p.environment, p.profile_id, p.catalogue_sha256, p.profile_sha256, p.field_policy_sha256]);
    if (seenSeals.has(sealKey)) refuse("ACCESS_PROFILE_DUPLICATE", "A profile repeats an existing seal; an upgrade needs new sealed content.");
    seenSeals.add(sealKey);
    included.push({ ...p, valid_from_ms: from, valid_until_ms: until });
  }
  if (included.length === 0) refuse("ACCESS_PROFILE_INPUT_INVALID", "No profile is ready; nothing to seal.");
  included.sort((a, b) => a.profile_key < b.profile_key ? -1 : a.profile_key > b.profile_key ? 1 : a.version - b.version);
  if (included.length > 32) refuse("ACCESS_PROFILE_INPUT_INVALID", "At most 32 sealed profiles fit one policy.");

  const owners = input.users.filter(u => u.role === "OWNER");
  if (owners.length !== 1 || owners[0]!.user_id !== owner)
    refuse("ACCESS_PROFILE_OWNER_REQUIRED", "Exactly one OWNER user is required and it must be the protected owner of the target.");
  const pins = new Set(target.principal_workspace_pins.filter(p => p.workspace_id === target.workspace_id).map(p => p.user_id));
  if (new Set(input.users.map(u => u.user_id)).size !== input.users.length)
    refuse("ACCESS_PROFILE_DUPLICATE", "A user is listed twice.");

  const actionsOf = (u: z.output<typeof accessProfileUser>): string[] => {
    const actions = u.actions ?? [READ_ACTION];
    if (new Set(actions).size !== actions.length || u.profiles !== "ALL" && new Set(u.profiles).size !== u.profiles.length)
      refuse("ACCESS_PROFILE_DUPLICATE", "A subject repeats an action or profile key.");
    for (const a of actions) {
      if (a === READ_ACTION) continue;
      refuse("ACCESS_PROFILE_ACTION_NOT_ALLOWED", "Only business.read_all is supported by the offline builder.");
    }
    return [...actions].sort();
  };
  const everyAction = [...new Set(input.users.flatMap(u => actionsOf(u)))].sort();

  const grants: ManagerDomainGrant[] = [];
  const subjects: { user_id: string; role: string; grants: number }[] = [];
  for (const u of [...input.users].sort((a, b) => a.user_id < b.user_id ? -1 : a.user_id > b.user_id ? 1 : 0)) {
    if (!pins.has(u.user_id))
      refuse("ACCESS_PROFILE_INPUT_INVALID", "A subject is not pinned to the target workspace.");
    if (u.granted_by !== owner || u.parent_grant_id !== null)
      refuse("ACCESS_PROFILE_DELEGATION_NOT_IMPLEMENTED", "Every grant is issued by the protected owner and has no parent; delegation is not implemented yet.");
    let selected: Profile[];
    if (u.role === "OWNER") {
      if (u.profiles !== "ALL") refuse("ACCESS_PROFILE_OWNER_LIMITED", "The protected owner must hold every sealed profile (profiles: ALL).");
      selected = included;
    } else {
      const wanted = u.profiles === "ALL" ? null : new Set(u.profiles);
      const known = new Set(included.map(p => p.profile_key));
      if (wanted) for (const k of wanted) if (!known.has(k)) refuse("ACCESS_PROFILE_INPUT_INVALID", "A subject names a profile that is not sealed in this artifact.");
      selected = wanted ? included.filter(p => wanted.has(p.profile_key)) : included;
    }
    const actions = u.role === "OWNER" ? everyAction : actionsOf(u);
    let count = 0;
    for (const p of selected) for (const action of actions) {
      grants.push(managerDomainGrant.parse({
        schema_version: "portal.manager-domain-grant.v1", grant_id: grantId(input.policy_revision, u.user_id, p, action),
        workspace_id: target.workspace_id, subject_user_id: u.user_id, issued_by: owner, parent_grant_id: null,
        revision: `${input.policy_revision}.g1`, policy_revision: input.policy_revision,
        action, effect: "ALLOW", environment: p.environment,
        domain: { profile_id: p.profile_id, catalogue_sha256: p.catalogue_sha256, profile_sha256: p.profile_sha256, field_policy_sha256: p.field_policy_sha256 },
        field_policy_ref: `${p.field_policy_dir}/serving-policy.json#${p.field_policy_sha256}`,
        valid_from_ms: p.valid_from_ms, valid_until_ms: p.valid_until_ms, revoked_at_ms: null,
      }));
      count++;
    }
    subjects.push({ user_id: u.user_id, role: u.role, grants: count });
  }
  if (grants.length > 64) refuse("ACCESS_PROFILE_INPUT_INVALID", "At most 64 grants fit one artifact.");

  const seals = included.map(p => ({
    environment: p.environment,
    domain: { profile_id: p.profile_id, catalogue_sha256: p.catalogue_sha256, profile_sha256: p.profile_sha256!, field_policy_sha256: p.field_policy_sha256 },
    field_policy_ref: `${p.field_policy_dir}/serving-policy.json#${p.field_policy_sha256}`,
    valid_from_ms: p.valid_from_ms!, valid_until_ms: p.valid_until_ms!,
  }));
  const artifactDigest = accessDigest({ target, manager_read_domains: seals, manager_domain_grants: grants });
  const document = privateOwnerCommissioningDocument.parse({
    schema_version: "portal.private-owner-manager-commissioning.v1", target,
    policy: {
      workspace_id: target.workspace_id, revision: input.policy_revision, artifact_digest: artifactDigest,
      approval_ref: input.approval_ref, state: "REVIEWED", qualification: "OWNER_VERIFIED", protected_owner_user_id: owner,
      researcher_fields: { state: "PENDING", policy_ref: null, fields: [] }, manager_read_domains: seals,
    },
    root_grants: [], manager_domain_grants: grants, provenance_ref: input.provenance_ref,
  });
  assertAccessProfileInvariants(document, options);
  const bytes = JSON.stringify(canonical(document));
  if (Buffer.byteLength(bytes, "utf8") > PRIVATE_FILE_MAX_BYTES)
    refuse("ACCESS_PROFILE_ARTIFACT_INVALID", "The artifact exceeds the existing private-file intake limit.");
  return {
    document, bytes, sha256: sha256Hex(bytes),
    summary: {
      policy_revision: input.policy_revision,
      valid_from_ms: Math.min(...seals.map(s => s.valid_from_ms)), valid_until_ms: Math.max(...seals.map(s => s.valid_until_ms)),
      profiles_included: included.map(id), profiles_excluded: excluded, subjects, grants: grants.length, actions: everyAction,
    },
  };
}

const sealKey = (g: { environment: string; domain: unknown; field_policy_ref: string }) =>
  accessDigest([g.environment, g.domain, g.field_policy_ref]);

/** Invariants of every artifact this tool builds OR dry-runs. Pure; throws AccessProfileError with a fixed code.
 *
 * 1. Parses against the existing strict document schema. 2. The protected owner of the policy, of the target and the
 * issuer of every grant is one user. 3. Only READ (`business.read_all`) ALLOW. 4. The owner
 * is never limited: no DENY and no revoked grant on him, and he holds an ALLOW for every sealed profile and for every
 * action any subject holds, covering the whole seal window. 5. No other subject holds anything the owner does not
 * (same seal, same action, window inside the owner's). 6. No parent grants (delegation is not implemented). 7. Every
 * grant is sealed, in-window, for a pinned workspace principal, and ids are unique. */
export function assertAccessProfileInvariants(rawDocument: unknown, options: AccessProfileOptions = {}) {
  const parsed = privateOwnerCommissioningDocument.safeParse(rawDocument);
  if (!parsed.success) return refuse("ACCESS_PROFILE_ARTIFACT_INVALID", "The artifact does not match portal.private-owner-manager-commissioning.v1.");
  const doc = parsed.data, owner = doc.target.protected_owner_user_id, policy = doc.policy;
  const invalid = (message: string): never => refuse("ACCESS_PROFILE_ARTIFACT_INVALID", message);
  assertTargetPrincipals(doc.target, "ACCESS_PROFILE_ARTIFACT_INVALID");
  if (options.allowStreamOrDeny) refuse("ACCESS_PROFILE_ACTION_NOT_ALLOWED", "Only READ ALLOW artifacts are supported.");
  if (policy.protected_owner_user_id !== owner || policy.workspace_id !== doc.target.workspace_id ||
    policy.state !== "REVIEWED" || policy.qualification !== "OWNER_VERIFIED") invalid("The policy does not match the target owner, workspace or review state.");
  const seals = policy.manager_read_domains ?? [], grants = doc.manager_domain_grants;
  if (seals.length === 0) invalid("The policy seals no profile.");
  if (policy.researcher_fields.state !== "PENDING" || policy.researcher_fields.policy_ref !== null ||
      policy.researcher_fields.fields.length !== 0 || (policy.parent_read_fields?.length ?? 0) !== 0)
    invalid("This offline artifact cannot commission other policy families.");
  for (const seal of seals) if (seal.valid_until_ms - seal.valid_from_ms > ACCESS_PROFILE_MAXIMUM_VALIDITY_MS)
    refuse("ACCESS_PROFILE_WINDOW_INVALID", "A sealed profile exceeds the approved 12-month term.");
  const ids = new Set<string>(), scopes = new Set<string>();
  const pins = new Set(doc.target.principal_workspace_pins.map(p => accessDigest([p.user_id, p.workspace_id])));
  const ownerAllows = grants.filter(g => g.subject_user_id === owner);
  for (const g of grants) {
    if (ids.has(g.grant_id)) invalid("A grant id is repeated.");
    ids.add(g.grant_id);
    const scope = accessDigest([g.subject_user_id, g.environment, g.domain, g.field_policy_ref, g.action]);
    if (scopes.has(scope)) invalid("A subject has repeated grants for the same sealed scope and action.");
    scopes.add(scope);
    if (g.subject_user_id === owner && (g.effect !== "ALLOW" || g.revoked_at_ms !== null))
      refuse("ACCESS_PROFILE_OWNER_LIMITED", "The protected owner must not be denied or revoked.");
    if (g.action !== READ_ACTION || g.effect !== "ALLOW") refuse("ACCESS_PROFILE_ACTION_NOT_ALLOWED", "Only READ (business.read_all) ALLOW grants are accepted.");
    if (g.issued_by !== owner || g.workspace_id !== doc.target.workspace_id || g.policy_revision !== policy.revision || g.revoked_at_ms !== null)
      invalid("A grant is not issued by the protected owner for this workspace and policy revision, or is revoked.");
    if (!pins.has(accessDigest([g.subject_user_id, g.workspace_id]))) invalid("A grant subject is not a pinned workspace principal.");
    const seal = seals.find(s => s.environment === g.environment && accessDigest(s.domain) === accessDigest(g.domain) && s.field_policy_ref === g.field_policy_ref);
    if (!seal || g.valid_from_ms < seal.valid_from_ms || g.valid_until_ms > seal.valid_until_ms) invalid("A grant is outside its sealed profile or window.");
  }
  const actions = new Set(grants.map(g => g.action));
  for (const s of seals) for (const action of actions) {
    const mine = ownerAllows.filter(g => g.action === action && g.effect === "ALLOW" && sealKey(g) === sealKey(s));
    if (!mine.some(g => g.valid_from_ms <= s.valid_from_ms && g.valid_until_ms >= s.valid_until_ms))
      refuse("ACCESS_PROFILE_OWNER_LIMITED", "The protected owner must hold every sealed profile and every action for the whole window.");
  }
  for (const g of grants) {
    if (g.subject_user_id === owner) continue;
    const mine = ownerAllows.some(o => o.action === g.action && o.effect === "ALLOW" && sealKey(o) === sealKey(g) &&
      o.valid_from_ms <= g.valid_from_ms && o.valid_until_ms >= g.valid_until_ms);
    if (!mine) refuse("ACCESS_PROFILE_EXCEEDS_OWNER", "No subject may hold a profile, action or window the protected owner does not hold.");
  }
  if (policy.artifact_digest !== accessDigest({ target: doc.target, manager_read_domains: seals, manager_domain_grants: grants }))
    invalid("The artifact content does not match its declared digest.");
  return doc;
}
