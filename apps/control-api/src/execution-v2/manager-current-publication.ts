import { createHash } from "node:crypto";
import { z } from "zod";
import { accessText } from "./access.contract";
import { accessDigest } from "./access-digest";
import type { AccessTrustProvider } from "./access-trust";
import { utcMilliseconds } from "./foundation.contract";
import { ExecutionPublicationError } from "./publication-adapter";
import { isBusinessReadField } from "./read-fields";
import { readDatasetBinding, readPublication, type ExecutionReadPublicationRequest } from "./read-publication";

const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/u);
const scopeSchema = z.object({ workspace_id: accessText, environment: z.literal("paper"), profile_id: accessText }).strict();
const bindingSchema = readDatasetBinding.refine(value => value.dataset_id === "manager-current:ACCOUNT" &&
  value.window === null && value.projection_generation !== undefined && value.catalogue_revision != null,
"CURRENT_BINDING_REQUIRED");
const receiptsSchema = z.object({ source_read: accessText, transport_trust: accessText,
  privacy: accessText, field_policy: accessText }).strict();
const grainSchema = z.enum(["manager.account", "relation.account_balances", "relation.account_policies"]);
export type ManagerCurrentGrain = z.infer<typeof grainSchema>;

/** Raw columns are source metadata, NEVER grants. Only these explicit aliases
 * can enter the unchanged BUSINESS vocabulary. No economic aggregation or
 * inference from a source ID, native-domain grant, mode, or active bit occurs. */
const FIELD_MAP: Readonly<Record<ManagerCurrentGrain, Readonly<Record<string, string>>>> = {
  "manager.account": { account_id: "account_id", venue: "venue", base_currency: "base_currency",
    created_at: "created_at", updated_at: "updated_at" },
  "relation.account_balances": { account_id: "account_id", currency: "currency", total: "balance_total",
    free: "balance_free", locked: "balance_locked", updated_at: "updated_at" },
  "relation.account_policies": { account_id: "account_id", venue: "venue", created_at: "created_at", updated_at: "updated_at" },
};
const sorted = (values: readonly string[]) => [...values].sort();
const unique = (values: readonly string[]) => new Set(values).size === values.length;
export function managerCurrentBusinessFields(grain: ManagerCurrentGrain, sourceFields: readonly string[]): string[] {
  const mapping = FIELD_MAP[grain];
  if (!mapping || !unique(sourceFields) || !sourceFields.includes("account_id") || sourceFields.some(field =>
    !Object.hasOwn(mapping, field) || !isBusinessReadField(mapping[field]!)))
    throw new ExecutionPublicationError("PUBLICATION_CONTRACT_REJECTED");
  return sorted(sourceFields.map(field => mapping[field]!));
}

const entitySchema = z.object({ entity_id: accessText, payload_digest: digest, account_id: accessText }).strict();
const selectionSchema = z.object({ resource_ref: accessText,
  resource: z.object({ kind: z.literal("ACCOUNT"), id: accessText }).strict(),
  entity_ids: z.array(accessText).min(1).max(2000) }).strict();
const grainPublicationSchema = z.object({ grain: grainSchema,
  source_fields: z.array(accessText).min(1).max(64), fields: z.array(accessText).min(1).max(64),
  selections: z.array(selectionSchema).max(64), entities: z.array(entitySchema).max(2000),
}).strict();
const metadataSchema = z.object({ schema_version: z.literal("portal.execution.manager-current-metadata.v1"),
  scope: scopeSchema, binding: bindingSchema, source_workspace_id: accessText, adapter_revision: accessText,
  publication_revision: accessText, state: z.enum(["ACTIVE", "DRAINING", "REVOKED"]),
  issued_at_ms: utcMilliseconds, expires_at_ms: utcMilliseconds,
  source_read_at_ms: utcMilliseconds, observed_at_ms: utcMilliseconds,
  receipt_pins: receiptsSchema, grains: z.array(grainPublicationSchema).length(3),
}).strict();
export type ManagerCurrentMetadata = z.infer<typeof metadataSchema>;

const commissioningSchema = z.object({ schema_version: z.literal("portal.execution.manager-current-commissioning.v1"),
  scope: scopeSchema, binding: bindingSchema, source_workspace_id: accessText, adapter_revision: accessText,
  source_metadata_digest: digest, receipt_pins: receiptsSchema,
}).strict();
const approvalSchema = z.object({ artifact_sha256: digest, approval_ref: accessText,
  approved_at_ms: utcMilliseconds, valid_until_ms: utcMilliseconds }).strict();
export type ManagerCurrentCommissioningApproval = z.infer<typeof approvalSchema>;
declare const commissioningBrand: unique symbol;
export interface ManagerCurrentCommissioning { readonly [commissioningBrand]: true }
const commissioned = new WeakMap<ManagerCurrentCommissioning, {
  artifact: z.infer<typeof commissioningSchema>; approval: ManagerCurrentCommissioningApproval;
}>();
// Preserve genuine provider identity across this private publication decorator.
// A structurally identical object or caller-controlled marker cannot unwrap.
const publicationBases = new WeakMap<AccessTrustProvider, AccessTrustProvider>();
export function managerCurrentPublicationBase(provider: AccessTrustProvider | undefined): AccessTrustProvider | undefined {
  return provider === undefined ? undefined : publicationBases.get(provider) ?? provider;
}

const MAX_METADATA_BYTES = 1_048_576;
const fail = (code: ExecutionPublicationError["code"], status = 503): never => {
  throw new ExecutionPublicationError(code, status);
};
/** Compact private JSON also rejects duplicate keys, escaped key aliases,
 * lossy integers and malformed UTF-8. No raw parse error escapes this boundary. */
function privateJson(bytes: Uint8Array | string, limit: number): unknown {
  try {
    const raw = Buffer.from(bytes);
    if (raw.length === 0 || raw.length > limit) return fail("PUBLICATION_CONTRACT_REJECTED");
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
    if (!Buffer.from(JSON.stringify(value), "utf8").equals(raw)) return fail("PUBLICATION_CONTRACT_REJECTED");
    return value;
  } catch { return fail("PUBLICATION_CONTRACT_REJECTED"); }
}

function parseMetadata(input: unknown): ManagerCurrentMetadata {
  try {
    const encoded = JSON.stringify(input);
    if (typeof encoded !== "string" || Buffer.byteLength(encoded, "utf8") > MAX_METADATA_BYTES)
      return fail("PUBLICATION_CONTRACT_REJECTED");
    const metadata = metadataSchema.parse(input);
    const names = metadata.grains.map(grain => grain.grain);
    if (!unique(names)) return fail("PUBLICATION_CONTRACT_REJECTED");
    const allIds: string[] = [], allRefs: string[] = [];
    for (const grain of metadata.grains) {
      if (!unique(grain.fields) || accessDigest(sorted(grain.fields)) !==
        accessDigest(managerCurrentBusinessFields(grain.grain, grain.source_fields)))
        return fail("PUBLICATION_CONTRACT_REJECTED");
      const ids = grain.entities.map(entity => entity.entity_id);
      const selected = grain.selections.flatMap(selection => selection.entity_ids);
      if (!unique(ids) || !unique(selected) || accessDigest(sorted(ids)) !== accessDigest(sorted(selected)))
        return fail("PUBLICATION_CONTRACT_REJECTED");
      const byId = new Map(grain.entities.map(entity => [entity.entity_id, entity]));
      if (grain.selections.some(selection => !selection.entity_ids.some(id =>
        byId.get(id)?.account_id === selection.resource.id))) return fail("PUBLICATION_CONTRACT_REJECTED");
      if (grain.grain === "manager.account" && !unique(grain.entities.map(entity => entity.account_id)))
        return fail("PUBLICATION_CONTRACT_REJECTED");
      allIds.push(...ids); allRefs.push(...grain.selections.map(selection => selection.resource_ref));
    }
    // A bounded single dataset census, not a separate incomplete publication
    // for whichever grain/chunk happened to answer the first callback.
    if (allIds.length > 2000 || !unique(allIds) || !unique(allRefs)) return fail("PUBLICATION_CONTRACT_REJECTED");
    return metadata;
  } catch { return fail("PUBLICATION_CONTRACT_REJECTED"); }
}

export function parseManagerCurrentMetadata(bytes: Uint8Array | string): ManagerCurrentMetadata {
  return parseMetadata(privateJson(bytes, MAX_METADATA_BYTES));
}
/** Only state is live. Every immutable source identity, grain, explicit account
 * ID, field/selection partition, source timestamp and expiry remains pinned. */
export function managerCurrentMetadataDigest(input: ManagerCurrentMetadata): string {
  const { state: _state, ...immutable } = parseMetadata(input);
  return accessDigest(immutable);
}

/** Private Research deployment intake. This handle is neither human authority
 * nor a source self-assertion: independent approval pins the artifact BYTES,
 * and that artifact pins the complete exact source metadata census. */
export function loadManagerCurrentCommissioning(bytes: Uint8Array | string,
  pin: ManagerCurrentCommissioningApproval, nowMs: number): ManagerCurrentCommissioning {
  try {
    const approval = approvalSchema.parse(pin), raw = Buffer.from(bytes);
    if (!Number.isSafeInteger(nowMs) || nowMs < approval.approved_at_ms || nowMs >= approval.valid_until_ms ||
      approval.valid_until_ms <= approval.approved_at_ms || raw.length > 65_536 ||
      `sha256:${createHash("sha256").update(raw).digest("hex")}` !== approval.artifact_sha256)
      throw new Error();
    const artifact = commissioningSchema.parse(privateJson(raw, 65_536));
    const handle = Object.freeze({}) as ManagerCurrentCommissioning;
    commissioned.set(handle, { artifact: structuredClone(artifact), approval: structuredClone(approval) });
    return handle;
  } catch { throw new Error("MANAGER_CURRENT_COMMISSIONING_INVALID"); }
}
export function managerCurrentCommissioningDeadline(handle: ManagerCurrentCommissioning): number {
  const record = commissioned.get(handle);
  if (!record) throw new Error("MANAGER_CURRENT_COMMISSIONING_INVALID");
  return record.approval.valid_until_ms;
}

/** Independent authenticated source lookup, never implemented by a .read()
 * that first needs this very publication to authorize its current caller. */
export function qualifyManagerCurrentMetadata(input: unknown, request: ExecutionReadPublicationRequest,
  options: { commissioning: ManagerCurrentCommissioning; nowMs: number }): ManagerCurrentMetadata {
  const metadata = parseMetadata(input), record = commissioned.get(options.commissioning);
  if (metadata.state === "REVOKED") return fail("PUBLICATION_REVOKED", 409);
  if (metadata.state === "DRAINING") return fail("PUBLICATION_DRAINING", 409);
  const now = options.nowMs;
  if (!Number.isSafeInteger(now) || now < 0 || metadata.issued_at_ms > now || metadata.expires_at_ms <= now ||
    metadata.expires_at_ms <= metadata.issued_at_ms || metadata.source_read_at_ms > metadata.observed_at_ms ||
    metadata.observed_at_ms > now) return fail("PUBLICATION_EXPIRED");
  if (!record || now < record.approval.approved_at_ms || now >= record.approval.valid_until_ms)
    return fail("PUBLICATION_NOT_QUALIFIED");
  const requestedScope = { workspace_id: request.workspace_id, environment: request.environment, profile_id: request.profile_id };
  if (accessDigest(record.artifact.scope) !== accessDigest(requestedScope) ||
    accessDigest(record.artifact.binding) !== accessDigest(request.binding) ||
    accessDigest(metadata.scope) !== accessDigest(record.artifact.scope) ||
    accessDigest(metadata.binding) !== accessDigest(record.artifact.binding))
    return fail("PUBLICATION_SCOPE_MISMATCH", 409);
  if (metadata.source_workspace_id !== record.artifact.source_workspace_id ||
    metadata.adapter_revision !== record.artifact.adapter_revision ||
    accessDigest(metadata.receipt_pins) !== accessDigest(record.artifact.receipt_pins) ||
    managerCurrentMetadataDigest(metadata) !== record.artifact.source_metadata_digest)
    return fail("PUBLICATION_NOT_QUALIFIED");
  return structuredClone(metadata);
}

/** Private selection catalogue for the caller's independently scoped CURRENT
 * request. Account IDs are source columns, NEVER parsed from entity IDs. */
export function managerCurrentSelectionCatalogue(metadata: ManagerCurrentMetadata) {
  const parsed = parseMetadata(metadata);
  return parsed.grains.flatMap(grain => {
    const entities = new Map(grain.entities.map(entity => [entity.entity_id, entity]));
    return grain.selections.map(selection => ({ grain: grain.grain, resource_ref: selection.resource_ref, resource: { ...selection.resource },
      fields: sorted(grain.fields), source_fields: sorted(grain.source_fields),
      entities: selection.entity_ids.map(id => structuredClone(entities.get(id)!)) }));
  });
}

export function withManagerCurrentPublications(base: AccessTrustProvider,
  source: (request: ExecutionReadPublicationRequest) => Promise<unknown | null>,
  options: { commissioning: ManagerCurrentCommissioning; now?: () => number }): AccessTrustProvider {
  const commissioning = options.commissioning, record = commissioned.get(commissioning);
  if (!record) throw new Error("MANAGER_CURRENT_COMMISSIONING_INVALID");
  const now = options.now ?? Date.now;
  const provider: AccessTrustProvider = {
    verifyPolicy: input => base.verifyPolicy(input), verifyReceipt: input => base.verifyReceipt(input),
    verifyRootReceipt: input => base.verifyRootReceipt?.(input) ?? Promise.resolve(null),
    qualifyDelegatedReceipt: (input, scope) => base.qualifyDelegatedReceipt?.(input, scope) ?? Promise.resolve(null),
    relations: (user, workspace) => base.relations(user, workspace),
    verifiedHumanMapping: (user, workspace) => base.verifiedHumanMapping(user, workspace),
    readPublication: async request => {
      const copy = structuredClone(request);
      if (copy.binding.dataset_id !== record.artifact.binding.dataset_id)
        return base.readPublication?.(copy) ?? null;
      const started = now();
      if (!Number.isSafeInteger(started) || started < record.approval.approved_at_ms || started >= record.approval.valid_until_ms)
        return fail("PUBLICATION_NOT_QUALIFIED");
      if (accessDigest({ workspace_id: copy.workspace_id, environment: copy.environment, profile_id: copy.profile_id }) !==
        accessDigest(record.artifact.scope) || accessDigest(copy.binding) !== accessDigest(record.artifact.binding))
        return fail("PUBLICATION_SCOPE_MISMATCH", 409);
      let value: unknown;
      try { value = await source(structuredClone(copy)); }
      catch { return fail("PUBLICATION_NOT_QUALIFIED"); }
      if (value === null) return null;
      const metadata = qualifyManagerCurrentMetadata(value, copy, { commissioning, nowMs: now() });
      const accounts = sorted([...new Set(metadata.grains.flatMap(grain => grain.entities.map(entity => entity.account_id)))]);
      return readPublication.parse({ ...metadata.scope, qualification: "SOURCE_VERIFIED",
        publication_revision: metadata.publication_revision, binding: structuredClone(metadata.binding),
        population_coverage: "COMPLETE_FOR_DATASET_WINDOW", provenance_ref: record.approval.approval_ref,
        current_linkage: null, resources: accounts.map(id => ({ kind: "ACCOUNT", id })), tuples: [] });
    },
  };
  publicationBases.set(provider, base);
  return provider;
}
