/** Unmounted G3 private producer. This is a proposed signed normalized-export
 * carrier, NOT an existing Edge wire or a qualification claim. Only an explicitly
 * installed Ed25519 signer and independently commissioned receipt bytes can
 * supply it. No legacy relation page, generic verifier callback, ENV or route. */
import { createHash, createPublicKey, randomBytes, verify, type KeyObject } from "node:crypto";
import { z } from "zod";
import { accessDigest } from "./access-digest";
import type { ManagerConsumerDelivery, ManagerConsumerReceipt, ManagerProjectionSource } from "./manager-consumer";
import { managerModelDocument, type ManagerModelDocument } from "./manager-model.contract";
import { prepareManagerProjection, type ManagerModelHead, type ManagerModelRepository } from "./manager-model.store";
import { publicationCommissioningCurrent, publicationCommissioningDeadline, qualifyDatasetPublication,
  type PublicationCommissioning } from "./publication-adapter";
import { datasetPublication, type DatasetPublication } from "./publication.contract";
import type { ExecutionReadPublicationRequest } from "./read-publication";

const text = z.string().min(1).max(256).regex(/^[^\u0000-\u001f\u007f]+$(?![\s\S])/);
const hash = z.string().regex(/^sha256:[a-f0-9]{64}$(?![\s\S])/);
const seal = z.string().regex(/^[a-f0-9]{64}$(?![\s\S])/);
const ms = z.number().int().nonnegative().safe();
const scopeSchema = z.object({ workspace_id: text, environment: z.enum(["paper", "sandbox", "live"]), profile_id: text }).strict();
const sealsSchema = z.object({ catalogue_sha256: seal, profile_sha256: seal, field_policy_sha256: seal }).strict();
const proofNames = ["source_read", "transport_trust", "privacy", "field_policy"] as const;
const evidenceSchema = z.object({ source_read: z.string(), transport_trust: z.string(), privacy: z.string(), field_policy: z.string() }).strict();

/** Both signature and nonce bind the operation, signer identity and ALL bytes.
 * Base64 is canonical RFC4648; no alternate/duplicate-key JSON spellings. */
export const ordinaryManagerSignedEnvelope = z.object({
  schema_version: z.literal("portal.execution.ordinary-manager-signed-envelope.proposal.v1"),
  payload_base64: z.string(), signature_base64: z.string(),
}).strict();
export const ordinaryManagerSignedPayload = z.object({
  schema_version: z.literal("portal.execution.ordinary-manager-signed-payload.proposal.v1"),
  kid: text, issuer: text, audience: text, operation: z.enum(["READ", "CURRENT"]),
  request_nonce: z.string().regex(/^[a-f0-9]{64}$(?![\s\S])/),
  scope: scopeSchema, physical_seals: sealsSchema, field_policy_ref: text,
  issued_at_ms: ms, expires_at_ms: ms,
  document: z.unknown(), publication: z.unknown(), receipt_evidence_base64: evidenceSchema,
  rebuild: z.object({ expected_revision: text, receipt_ref: hash, receipt_base64: z.string() }).strict().optional(),
}).strict();
export type OrdinaryManagerSignedPayload = z.infer<typeof ordinaryManagerSignedPayload>;
export interface OrdinaryManagerDomain {
  readonly environment: "paper" | "sandbox" | "live";
  readonly domain: Readonly<{ profile_id: string; catalogue_sha256: string; profile_sha256: string; field_policy_sha256: string }>;
  readonly field_policy_ref: string;
}
export interface OrdinaryManagerSourceTransport {
  /** Each response must sign the unpredictable request nonce. No cached signed
   * response can answer a new current-source challenge. Cancellation must settle. */
  read(input: { scope: z.infer<typeof scopeSchema>; head: ManagerModelHead | null; request_nonce: string;
    signal: AbortSignal }): Promise<Uint8Array | null>;
  current(input: { scope: z.infer<typeof scopeSchema>; revision: string; request_nonce: string;
    signal: AbortSignal }): Promise<Uint8Array | null>;
  /** Portal durable projection receipt only, not TS event/retention authority. */
  acknowledge(receipt: ManagerConsumerReceipt, signal: AbortSignal): Promise<void>;
}
export interface OrdinaryManagerSourceOptions {
  scope: z.infer<typeof scopeSchema>;
  commissioning: PublicationCommissioning;
  signer: { kid: string; issuer: string; audience: string; public_key_spki_pem: string; spki_sha256: string };
  seals: z.infer<typeof sealsSchema>;
  field_policy_ref: string;
  bounds: { maximum_envelope_bytes: number; maximum_payload_bytes: number; maximum_receipt_bytes: number;
    maximum_age_ms: number; maximum_lifetime_ms: number; maximum_inflight: number; transport_timeout_ms: number };
  transport: OrdinaryManagerSourceTransport;
  repository: {
    /** The concrete repository returns null for an unpublished head even when
     * unchecked array indexing obscures that in its inferred return type. */
    head(workspace: string, environment: string, profile: string): Promise<ManagerModelHead | null>;
    document: ManagerModelRepository["document"];
  };
  now?: () => number;
}
export interface OrdinaryManagerSourceInstallation {
  readonly source: ManagerProjectionSource;
  readonly publication: (request: ExecutionReadPublicationRequest, signal: AbortSignal) => Promise<DatasetPublication | null>;
  readonly ordinary_domain: OrdinaryManagerDomain;
}
type Code = "ORDINARY_MANAGER_SOURCE_CONFIG_INVALID" | "ORDINARY_MANAGER_SOURCE_REJECTED" |
  "ORDINARY_MANAGER_SOURCE_NOT_CURRENT" | "ORDINARY_MANAGER_COMMITTED_RECEIPT_REQUIRED" |
  "ORDINARY_MANAGER_SOURCE_CAPACITY" | "ORDINARY_MANAGER_SOURCE_ABORTED";
export class OrdinaryManagerSourceError extends Error {
  constructor(readonly code: Code) { super(code); this.name = "OrdinaryManagerSourceError"; }
}
const fail = (code: Code = "ORDINARY_MANAGER_SOURCE_REJECTED"): never => { throw new OrdinaryManagerSourceError(code); };
const digest = (bytes: Uint8Array) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const equal = (a: unknown, b: unknown) => accessDigest(a) === accessDigest(b);
const registrations = new WeakMap<ManagerProjectionSource, { publication: OrdinaryManagerSourceInstallation["publication"]; domain: OrdinaryManagerDomain }>();
/** Runtime composition can recognize the actual paired source/publication
 * factory. A copied descriptor or structurally identical callback is not it. */
export function ordinaryManagerSourceDomain(source: ManagerProjectionSource,
  publication: (request: ExecutionReadPublicationRequest, signal: AbortSignal) => Promise<unknown | null>): OrdinaryManagerDomain | null {
  const registered = registrations.get(source);
  return registered?.publication === publication ? registered.domain : null;
}

function json(bytes: Uint8Array): unknown {
  const raw = Buffer.from(bytes), value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
  if (!Buffer.from(JSON.stringify(value), "utf8").equals(raw)) return fail();
  return value;
}
function base64(value: string, maximum: number): Buffer {
  if (!value || value.length > 4 * Math.ceil(maximum / 3) || value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$(?![\s\S])/.test(value)) return fail();
  const bytes = Buffer.from(value, "base64");
  if (bytes.length < 1 || bytes.length > maximum || bytes.toString("base64") !== value) return fail();
  return bytes;
}
const boundsSchema = z.object({ maximum_envelope_bytes: z.number().int().min(1).max(12 * 1024 * 1024),
  maximum_payload_bytes: z.number().int().min(1).max(8 * 1024 * 1024),
  maximum_receipt_bytes: z.number().int().min(1).max(65_536),
  maximum_age_ms: z.number().int().min(1).max(86_400_000),
  maximum_lifetime_ms: z.number().int().min(1).max(86_400_000), maximum_inflight: z.number().int().min(1).max(4),
  transport_timeout_ms: z.number().int().min(1).max(60_000) }).strict();
interface Capture { delivery: ManagerConsumerDelivery; document: ManagerModelDocument; publication: DatasetPublication;
  documentDigest: string; identity: string; deadline: number; generation: number }

export function createOrdinaryManagerSource(options: OrdinaryManagerSourceOptions): OrdinaryManagerSourceInstallation {
  let scope: z.infer<typeof scopeSchema>, seals: z.infer<typeof sealsSchema>, bounds: z.infer<typeof boundsSchema>;
  let signer: OrdinaryManagerSourceOptions["signer"], fieldPolicyRef: string, publicKey: KeyObject;
  const now = options.now ?? Date.now, commissioning = options.commissioning, transport = options.transport, repository = options.repository;
  try {
    scope = scopeSchema.parse(options.scope); seals = sealsSchema.parse(options.seals); bounds = boundsSchema.parse(options.bounds);
    signer = z.object({ kid: text, issuer: text, audience: text, public_key_spki_pem: z.string().max(8192), spki_sha256: hash }).strict().parse(options.signer);
    fieldPolicyRef = text.parse(options.field_policy_ref);
    if (!fieldPolicyRef.endsWith(`#${seals.field_policy_sha256}`) ||
      !signer.public_key_spki_pem.startsWith("-----BEGIN PUBLIC KEY-----\n")) throw new Error();
    publicKey = createPublicKey(signer.public_key_spki_pem);
    if (publicKey.asymmetricKeyType !== "ed25519" || digest(publicKey.export({ type: "spki", format: "der" })) !== signer.spki_sha256 ||
      !publicationCommissioningCurrent(commissioning, scope, now()) ||
      typeof transport?.read !== "function" || typeof transport.current !== "function" || typeof transport.acknowledge !== "function" ||
      typeof repository?.head !== "function" || typeof repository.document !== "function") throw new Error();
  } catch { return fail("ORDINARY_MANAGER_SOURCE_CONFIG_INVALID"); }
  // Capture detached installation data. Later caller mutations cannot repin a signer or profile.
  const ordinary_domain: OrdinaryManagerDomain = Object.freeze({ environment: scope.environment,
    domain: Object.freeze({ profile_id: scope.profile_id, ...seals }), field_policy_ref: fieldPolicyRef });
  let inFlight = 0, generation = 0, latest: Capture | null = null, acknowledged: string | null = null;
  let clockWatermark = now();
  let sourceWatermark: Pick<ManagerModelDocument, "source_epoch" | "projection_generation" | "source_sequence" | "revision"> & { digest: string } | null = null;
  const invalidate = () => { generation++; latest = null; };
  const check = (signal: AbortSignal) => { if (signal.aborted) return fail("ORDINARY_MANAGER_SOURCE_ABORTED"); };
  const clock = () => {
    let at: number;
    try { at = now(); } catch { invalidate(); return fail(); }
    if (!Number.isSafeInteger(at) || at < clockWatermark) { invalidate(); return fail("ORDINARY_MANAGER_SOURCE_NOT_CURRENT"); }
    clockWatermark = at; return at;
  };
  const current = (capture: Capture, signal: AbortSignal) => {
    check(signal);
    const at = clock();
    if (capture.generation !== generation || latest?.identity !== capture.identity || at >= capture.deadline ||
      !publicationCommissioningCurrent(commissioning, scope, at)) return fail("ORDINARY_MANAGER_SOURCE_NOT_CURRENT");
  };
  async function bounded<T>(signal: AbortSignal, action: (signal: AbortSignal) => Promise<T>): Promise<T> {
    check(signal);
    if (inFlight >= bounds.maximum_inflight) return fail("ORDINARY_MANAGER_SOURCE_CAPACITY");
    inFlight++;
    const cancellation = new AbortController();
    let rejectCancellation!: (error: OrdinaryManagerSourceError) => void;
    const cancelled = new Promise<never>((_resolve, reject) => { rejectCancellation = reject; });
    const abort = () => { cancellation.abort(); rejectCancellation(new OrdinaryManagerSourceError("ORDINARY_MANAGER_SOURCE_ABORTED")); };
    signal.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, bounds.transport_timeout_ms);
    const flight = Promise.resolve().then(() => { check(cancellation.signal); return action(cancellation.signal); });
    // Even a defective transport which ignores cancellation never frees its
    // admission slot until the actual I/O settles. Late results cannot become
    // a new capture or ACK: every post-await path checks the child signal.
    void flight.finally(() => { inFlight--; }).catch(() => undefined);
    try { const result = await Promise.race([flight, cancelled]); check(cancellation.signal); return result; }
    catch (error) { invalidate(); if (error instanceof OrdinaryManagerSourceError) throw error; return fail(); }
    finally { clearTimeout(timer); signal.removeEventListener("abort", abort); }
  }
  function decode(bytes: Uint8Array, operation: "READ" | "CURRENT", nonce: string): Capture {
    try {
      if (!(bytes instanceof Uint8Array) || bytes.byteLength > bounds.maximum_envelope_bytes) return fail();
      const envelope = ordinaryManagerSignedEnvelope.parse(json(bytes));
      const raw = base64(envelope.payload_base64, bounds.maximum_payload_bytes), signature = base64(envelope.signature_base64, 64);
      if (signature.length !== 64 || !verify(null, raw, publicKey, signature)) return fail();
      const payload = ordinaryManagerSignedPayload.parse(json(raw)), at = clock();
      if (payload.kid !== signer.kid || payload.issuer !== signer.issuer || payload.audience !== signer.audience ||
        payload.operation !== operation || payload.request_nonce !== nonce || !equal(payload.scope, scope) ||
        !equal(payload.physical_seals, seals) || payload.field_policy_ref !== fieldPolicyRef ||
        !Number.isSafeInteger(at) || at < payload.issued_at_ms || at >= payload.expires_at_ms ||
        payload.expires_at_ms - payload.issued_at_ms > bounds.maximum_lifetime_ms) return fail();
      const document = managerModelDocument.parse(payload.document), p = datasetPublication.parse(payload.publication);
      if (!equal({ workspace_id: document.workspace_id, environment: document.environment, profile_id: document.profile_id }, scope) ||
        document.qualification !== "SOURCE_VERIFIED" || p.purpose !== "BUSINESS" || p.history_capability !== "CURRENT_ONLY" ||
        p.barrier !== null || p.authority.qualification !== "SOURCE_VERIFIED" || p.authority.population_coverage !== "COMPLETE_FOR_DATASET_WINDOW" ||
        document.source_quality.completeness !== "COMPLETE" || document.source_quality.freshness !== "FRESH" ||
        document.as_of_ms > at || at - document.as_of_ms > bounds.maximum_age_ms ||
        p.source_as_of_ms !== document.as_of_ms || p.observed_at_ms !== document.observed_at_ms ||
        payload.issued_at_ms < p.observed_at_ms || payload.issued_at_ms < p.issued_at_ms || payload.expires_at_ms > p.expires_at_ms)
        return fail();
      if (p.authority.manager_domain !== undefined && !equal(p.authority.manager_domain, ordinary_domain)) return fail();
      for (const name of proofNames) {
        const evidence = base64(payload.receipt_evidence_base64[name], bounds.maximum_receipt_bytes);
        if (p[name].qualification !== "SOURCE_VERIFIED" || p[name].receipt_ref !== digest(evidence) ||
          name === "field_policy" && digest(evidence) !== `sha256:${seals.field_policy_sha256}`) return fail();
      }
      for (const linkage of [p.authority.current_linkage, p.authority.binding_lineage, p.authority.strategy_lineage])
        if (linkage && linkage.qualification !== "SOURCE_VERIFIED") return fail();
      // Full correlated census; no independent IN sets, missing/orphan member,
      // extra resource, duplicate publication tuple or post-parser fact collapse.
      const tupleKeys = document.members.map(m => accessDigest(m.tuple)), published = p.authority.tuples.map(t => accessDigest(t));
      if (new Set(published).size !== published.length || !equal([...new Set(tupleKeys)].sort(), [...published].sort())) return fail();
      const resources = new Set<string>();
      for (const m of document.members) {
        for (const [kind, id] of [["ALPHA", m.tuple.alpha_id], ["ALPHA_VERSION", m.tuple.alpha_version_id],
          ["PORTFOLIO", m.tuple.portfolio_id], ["DEPLOYMENT", m.tuple.deployment_id], ["ACCOUNT", m.tuple.account_id],
          ...(m.binding_ref === null ? [] : [["BINDING", m.binding_ref]])]) resources.add(accessDigest({ kind, id }));
      }
      const declaredResources = p.authority.resources.map(r => accessDigest(r));
      if (new Set(declaredResources).size !== declaredResources.length || !equal([...resources].sort(), declaredResources.sort())) return fail();
      const rebuild = payload.rebuild && { expected_revision: payload.rebuild.expected_revision, receipt_ref: payload.rebuild.receipt_ref };
      if (payload.rebuild && digest(base64(payload.rebuild.receipt_base64, bounds.maximum_receipt_bytes)) !== payload.rebuild.receipt_ref) return fail();
      const prepared = prepareManagerProjection(document, p, { commissioning, nowMs: at, rebuild });
      if (!equal(prepared.document, document)) return fail();
      const documentDigest = accessDigest(document);
      if (sourceWatermark) {
        const sameGeneration = sourceWatermark.source_epoch === document.source_epoch &&
          sourceWatermark.projection_generation === document.projection_generation;
        if (sameGeneration && (BigInt(document.source_sequence) < BigInt(sourceWatermark.source_sequence) ||
          document.source_sequence === sourceWatermark.source_sequence && documentDigest !== sourceWatermark.digest) ||
          !sameGeneration && (!rebuild || rebuild.expected_revision !== sourceWatermark.revision)) return fail("ORDINARY_MANAGER_SOURCE_NOT_CURRENT");
      }
      sourceWatermark = { source_epoch: document.source_epoch, source_sequence: document.source_sequence,
        projection_generation: document.projection_generation, revision: document.revision, digest: documentDigest };
      const delivery: ManagerConsumerDelivery = { document, publication: p, ...(rebuild ? { rebuild } : {}) };
      const identity = accessDigest({ document, publication: p, rebuild: rebuild ?? null });
      if (latest?.identity !== identity) generation++;
      const capture: Capture = { delivery, document, publication: p, documentDigest, identity,
        deadline: Math.min(payload.expires_at_ms, p.expires_at_ms, publicationCommissioningDeadline(commissioning),
          document.as_of_ms + bounds.maximum_age_ms + 1), generation };
      latest = capture;
      return capture;
    } catch (error) { if (error instanceof OrdinaryManagerSourceError) throw error; return fail(); }
  }
  async function fetchCurrent(revision: string, signal: AbortSignal): Promise<Capture | null> {
    const nonce = randomBytes(32).toString("hex");
    const bytes = await transport.current({ scope: { ...scope }, revision, request_nonce: nonce, signal });
    check(signal);
    if (bytes === null) { invalidate(); return null; }
    return decode(bytes, "CURRENT", nonce);
  }
  async function committed(capture: Capture, signal: AbortSignal) {
    const head = await repository.head(scope.workspace_id, scope.environment, scope.profile_id); check(signal);
    if (!head || head.revision !== capture.document.revision || head.payload_digest !== capture.documentDigest ||
      head.source_epoch !== capture.document.source_epoch || head.source_sequence !== capture.document.source_sequence ||
      head.projection_generation !== capture.document.projection_generation || head.catalogue_digest !== capture.document.catalogue_digest)
      return fail("ORDINARY_MANAGER_COMMITTED_RECEIPT_REQUIRED");
    const stored = await repository.document(scope.workspace_id, scope.environment, scope.profile_id, head.revision); check(signal);
    if (stored === null || !equal(stored, capture.document)) return fail("ORDINARY_MANAGER_COMMITTED_RECEIPT_REQUIRED");
    current(capture, signal);
    return head;
  }
  const source: ManagerProjectionSource = Object.freeze<ManagerProjectionSource>({
    read: input => bounded(input.signal, async childSignal => {
      if (!equal(input.scope, scope) || !Number.isSafeInteger(input.maximum_bytes) || input.maximum_bytes < 1 ||
        !Number.isSafeInteger(input.maximum_rows) || input.maximum_rows < 1) return fail();
      const nonce = randomBytes(32).toString("hex");
      const bytes = await transport.read({ scope: { ...scope }, head: input.head && { ...input.head }, request_nonce: nonce, signal: childSignal });
      check(childSignal);
      if (bytes === null) { invalidate(); return null; }
      const capture = decode(bytes, "READ", nonce);
      if (Buffer.byteLength(JSON.stringify(capture.delivery)) > input.maximum_bytes ||
        capture.document.members.length + capture.document.facts.length > input.maximum_rows) return fail();
      current(capture, childSignal);
      return acknowledged === capture.identity && input.head?.revision === capture.document.revision ? null : structuredClone(capture.delivery);
    }),
    recheck: input => bounded(input.signal, async childSignal => {
      if (!equal(input.scope, scope)) return fail();
      const capture = await fetchCurrent(input.document.revision, childSignal);
      if (!capture || !equal(capture.document, input.document) || !equal(capture.publication, input.publication))
        return fail("ORDINARY_MANAGER_SOURCE_NOT_CURRENT");
      current(capture, childSignal);
      // The operation's private timer ends on return; the caller's continuing
      // consumer cancellation and the signed absolute deadline still fence COMMIT.
      return { assertCurrent: () => current(capture, input.signal) };
    }),
    acknowledge: (receipt, signal) => bounded(signal, async childSignal => {
      const capture = latest;
      if (!capture || !equal(receipt.scope, scope) || receipt.revision !== capture.document.revision ||
        receipt.digest !== capture.documentDigest || receipt.source_epoch !== capture.document.source_epoch ||
        receipt.source_sequence !== capture.document.source_sequence || receipt.projection_generation !== capture.document.projection_generation ||
        receipt.publication_revision !== capture.publication.authority.publication_revision)
        return fail("ORDINARY_MANAGER_COMMITTED_RECEIPT_REQUIRED");
      await committed(capture, childSignal);
      await transport.acknowledge(structuredClone(receipt), childSignal); check(childSignal);
      acknowledged = capture.identity;
    }),
  });
  const publication: OrdinaryManagerSourceInstallation["publication"] = (request, signal) => bounded(signal, async childSignal => {
    if (!equal({ workspace_id: request.workspace_id, environment: request.environment, profile_id: request.profile_id }, scope) ||
      request.binding.dataset_id !== "alpha_fleet_overview") return fail();
    const capture = await fetchCurrent(request.binding.source_revision, childSignal);
    if (capture === null) return null;
    if (!equal(request.binding, capture.publication.authority.binding)) return fail("ORDINARY_MANAGER_SOURCE_NOT_CURRENT");
    await committed(capture, childSignal);
    const p = qualifyDatasetPublication(capture.publication, request, { purpose: "BUSINESS", commissioning, nowMs: clock() });
    // Re-read the head after loading the document: a replacement cannot publish
    // a historical revision even when its immutable bytes remain valid.
    const head = await repository.head(scope.workspace_id, scope.environment, scope.profile_id); check(childSignal);
    if (head?.revision !== capture.document.revision || head.payload_digest !== capture.documentDigest) return fail("ORDINARY_MANAGER_SOURCE_NOT_CURRENT");
    current(capture, childSignal);
    return p;
  });
  registrations.set(source, { publication, domain: ordinary_domain });
  return Object.freeze({ source, publication, ordinary_domain });
}
