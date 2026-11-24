/** TEST_ONLY cryptographic protocol vectors, not an Edge export, commissioning
 * receipt, owner approval or SOURCE_VERIFIED runtime claim. No network/files/DB. */
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { accessDigest } from "../src/execution-v2/access-digest";
import { createOrdinaryManagerSource, ordinaryManagerSourceDomain, type OrdinaryManagerSignedPayload,
  type OrdinaryManagerSourceTransport } from "../src/execution-v2/ordinary-manager-source";
import { loadPublicationCommissioning } from "../src/execution-v2/publication-adapter";
import { EXECUTION_PUBLICATION_CATALOGUE } from "../src/execution-v2/publication-source.generated";
import type { ManagerConsumerReceipt } from "../src/execution-v2/manager-consumer";
import type { ManagerModelDocument } from "../src/execution-v2/manager-model.contract";
import type { DatasetPublication } from "../src/execution-v2/publication.contract";

const NOW = 1_800_000_000_000;
const key = generateKeyPairSync("ed25519"), otherKey = generateKeyPairSync("ed25519");
const sha = (bytes: Uint8Array) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const scope = { workspace_id: "TEST_ONLY:workspace", environment: "paper" as const, profile_id: "PAPER_OKX_SWAP" };
const tuple = { alpha_id: "TEST_ONLY:alpha", alpha_version_id: "TEST_ONLY:version", portfolio_id: "TEST_ONLY:portfolio",
  deployment_id: "TEST_ONLY:deployment", account_id: "TEST_ONLY:account" };
const signal = () => new AbortController().signal;
type Mutation = (payload: OrdinaryManagerSignedPayload) => void;

function fixture() {
  let at = NOW, stored: ManagerModelDocument | null = null, mutation: Mutation = () => undefined;
  let absent = false, corrupt = false, wrongNonce = false;
  const receipts = { source_read: Buffer.from("TEST_ONLY source read evidence"), transport_trust: Buffer.from("TEST_ONLY transport evidence"),
    privacy: Buffer.from("TEST_ONLY privacy evidence"), field_policy: Buffer.from("TEST_ONLY serving policy bytes") };
  const seals = { catalogue_sha256: "1".repeat(64), profile_sha256: "2".repeat(64), field_policy_sha256: sha(receipts.field_policy).slice(7) };
  const fieldPolicyRef = `TEST_ONLY/serving-policy.json#${seals.field_policy_sha256}`;
  const receiptPins = Object.fromEntries(Object.entries(receipts).map(([name, bytes]) => [name, sha(bytes)]));
  const document: ManagerModelDocument = { schema_version: "portal.execution.manager-model-input.v1", ...scope,
    qualification: "SOURCE_VERIFIED", family_id: "alpha_fleet_overview", revision: "TEST_ONLY:r1", supersedes_revision: null,
    source_epoch: "TEST_ONLY:epoch", source_sequence: "9007199254740993", projection_generation: "TEST_ONLY:g1",
    catalogue_digest: EXECUTION_PUBLICATION_CATALOGUE.source_catalogue_digest, source_set_digest: accessDigest([tuple]),
    as_of_ms: NOW - 10, recorded_through_ms: NOW - 5, facts_through_ms: NOW - 10, observed_at_ms: NOW - 1,
    source_quality: { completeness: "COMPLETE", freshness: "FRESH", reasons: [] },
    members: [{ tuple, stage: "PAPER", name: "TEST_ONLY alpha", owner_user_id: "TEST_ONLY:owner", lifecycle: "ACTIVE",
      venue: "TEST_ONLY venue", health: "HEALTHY", source_state: "FRESH", binding_ref: "TEST_ONLY:binding",
      assignment_revision: "TEST_ONLY:assignment", owner_revision: "TEST_ONLY:ownership", binding_revision: "TEST_ONLY:binding-revision",
      valid_from_ms: NOW - 100, valid_to_ms: null }],
    facts: [{ fact_id: "TEST_ONLY:fact", revision: "TEST_ONLY:fact-revision", source_receipt_ref: "TEST_ONLY:fact-source-receipt",
      tuple, partition: { economic_domain: "PAPER", currency: "USDT", basis: "TEST_ONLY source ledger",
        native_profile_ref: "TEST_ONLY:native-profile", domain_proof_ref: "TEST_ONLY:domain-proof" },
      economic_account_ref: "TEST_ONLY:economic-account", ownership_partition_ref: "TEST_ONLY:ownership-partition", kind: "net_pnl",
      metric: { value: "100.000000000000000001", unit: "MONEY", currency: "USDT", basis: "TEST_ONLY source ledger", window: null,
        denominator: null, methodology_ref: "TEST_ONLY:method", availability: "AVAILABLE", reason_code: null,
        quality: { completeness: "COMPLETE", freshness: "FRESH", reasons: [] }, source_confidence: "VERIFIED",
        provenance_refs: ["TEST_ONLY:fact-source-receipt"], calculation_revision: "TEST_ONLY:calculation", policy_revision: "TEST_ONLY:policy" },
      effective_at_ms: NOW - 10, recorded_at_ms: NOW - 5, classification: "ECONOMIC", transfer_pair_ref: null, counterpart_portfolio_id: null }],
  };
  const binding = { dataset_id: document.family_id, source_revision: document.revision, projection_generation: document.projection_generation,
    catalogue_revision: document.catalogue_digest, window: null };
  const publication: DatasetPublication = { schema_version: "portal.execution.dataset-publication.v1", family_id: document.family_id,
    catalogue_digest: document.catalogue_digest, state: "ACTIVE", purpose: "BUSINESS", environment: scope.environment, profile_id: scope.profile_id,
    issued_at_ms: NOW - 100, expires_at_ms: NOW + 5000, source_as_of_ms: document.as_of_ms, observed_at_ms: document.observed_at_ms,
    history_capability: "CURRENT_ONLY", barrier: null,
    source_read: { qualification: "SOURCE_VERIFIED", receipt_ref: receiptPins.source_read! },
    transport_trust: { qualification: "SOURCE_VERIFIED", receipt_ref: receiptPins.transport_trust! },
    privacy: { qualification: "SOURCE_VERIFIED", receipt_ref: receiptPins.privacy! },
    field_policy: { qualification: "SOURCE_VERIFIED", receipt_ref: receiptPins.field_policy! },
    authority: { ...scope, qualification: "SOURCE_VERIFIED", publication_revision: "TEST_ONLY:publication", binding,
      population_coverage: "COMPLETE_FOR_DATASET_WINDOW", provenance_ref: "TEST_ONLY:signed-export", current_linkage: null,
      tuples: [tuple], resources: [
        { kind: "ALPHA", id: tuple.alpha_id }, { kind: "ALPHA_VERSION", id: tuple.alpha_version_id },
        { kind: "PORTFOLIO", id: tuple.portfolio_id }, { kind: "DEPLOYMENT", id: tuple.deployment_id },
        { kind: "ACCOUNT", id: tuple.account_id }, { kind: "BINDING", id: "TEST_ONLY:binding" },
      ] },
  };
  const payload: OrdinaryManagerSignedPayload = { schema_version: "portal.execution.ordinary-manager-signed-payload.proposal.v1",
    kid: "TEST_ONLY:kid", issuer: "TEST_ONLY:issuer", audience: "TEST_ONLY:core", operation: "READ", request_nonce: "0".repeat(64),
    scope, physical_seals: seals, field_policy_ref: fieldPolicyRef, issued_at_ms: NOW, expires_at_ms: NOW + 1000,
    document, publication, receipt_evidence_base64: Object.fromEntries(Object.entries(receipts).map(([name, bytes]) => [name, bytes.toString("base64")])) as
      OrdinaryManagerSignedPayload["receipt_evidence_base64"] };
  const encode = (value: OrdinaryManagerSignedPayload, signingKey = key.privateKey) => {
    const raw = Buffer.from(JSON.stringify(value));
    return Buffer.from(JSON.stringify({ schema_version: "portal.execution.ordinary-manager-signed-envelope.proposal.v1",
      payload_base64: raw.toString("base64"), signature_base64: sign(null, raw, signingKey).toString("base64") }));
  };
  const response = (operation: "READ" | "CURRENT", nonce: string) => {
    if (absent) return null;
    const value = structuredClone(payload); value.operation = operation; value.request_nonce = wrongNonce ? "f".repeat(64) : nonce;
    mutation(value);
    const bytes = encode(value);
    if (corrupt) {
      const envelope = JSON.parse(bytes.toString("utf8"));
      const raw = Buffer.from(envelope.payload_base64, "base64"); raw[raw.length - 2] ^= 1;
      envelope.payload_base64 = raw.toString("base64"); return Buffer.from(JSON.stringify(envelope));
    }
    return bytes;
  };
  const transport = { read: vi.fn(async (input: Parameters<OrdinaryManagerSourceTransport["read"]>[0]) => response("READ", input.request_nonce)),
    current: vi.fn(async (input: Parameters<OrdinaryManagerSourceTransport["current"]>[0]) => response("CURRENT", input.request_nonce)),
    acknowledge: vi.fn(async (_receipt: ManagerConsumerReceipt, _signal: AbortSignal) => undefined) };
  const head = () => stored === null ? null : { revision: stored.revision, source_epoch: stored.source_epoch,
    source_sequence: stored.source_sequence, projection_generation: stored.projection_generation, payload_digest: accessDigest(stored), catalogue_digest: stored.catalogue_digest };
  const repository = { head: vi.fn(async () => head()), document: vi.fn(async () => stored && structuredClone(stored)) };
  const artifact = JSON.stringify({ schema_version: "portal.execution.publication-commissioning.v1", scope,
    catalogue_digest: document.catalogue_digest, adapter_id: "TEST_ONLY:adapter", family_ids: ["alpha_fleet_overview"], purposes: ["BUSINESS"], receipt_pins: receiptPins });
  const commissioning = loadPublicationCommissioning(artifact, { artifact_sha256: sha(Buffer.from(artifact)), adapter_id: "TEST_ONLY:adapter",
    approval_ref: "TEST_ONLY:not-owner-approval", approved_at_ms: NOW - 1000, valid_until_ms: NOW + 10000 }, NOW);
  const options = { scope, commissioning, signer: { kid: payload.kid, issuer: payload.issuer, audience: payload.audience,
    public_key_spki_pem: key.publicKey.export({ type: "spki", format: "pem" }).toString(), spki_sha256: sha(key.publicKey.export({ type: "spki", format: "der" })) },
    seals, field_policy_ref: fieldPolicyRef, bounds: { maximum_envelope_bytes: 65536, maximum_payload_bytes: 32768,
      maximum_receipt_bytes: 4096, maximum_age_ms: 1000, maximum_lifetime_ms: 2000, maximum_inflight: 2, transport_timeout_ms: 1000 },
    transport, repository, now: () => at };
  const installed = createOrdinaryManagerSource(options);
  const read = (over: Record<string, unknown> = {}) => installed.source.read({ scope, head: head(), maximum_bytes: 32768, maximum_rows: 100, signal: signal(), ...over });
  const receipt: ManagerConsumerReceipt = { scope, revision: document.revision, digest: accessDigest(document), source_epoch: document.source_epoch,
    source_sequence: document.source_sequence, projection_generation: document.projection_generation, publication_revision: publication.authority.publication_revision };
  return { options, installed, read, receipt, document, publication, payload, encode, transport, repository,
    request: { ...scope, binding }, commit: () => { stored = structuredClone(document); },
    mutate: (fn: Mutation) => { mutation = fn; }, setNow: (value: number) => { at = value; },
    setAbsent: () => { absent = true; }, setCorrupt: () => { corrupt = true; }, setWrongNonce: () => { wrongNonce = true; } };
}
const doc = (p: OrdinaryManagerSignedPayload) => p.document as ManagerModelDocument;
const pub = (p: OrdinaryManagerSignedPayload) => p.publication as DatasetPublication;

describe("G3 signed normalized ordinary Manager source (TEST_ONLY protocol vectors)", () => {
  it("retains exact normalized bytes/decimals and emits no publication before durable matching head", async () => {
    const f = fixture();
    expect((await f.read())?.document).toEqual(f.document);
    await expect(f.installed.publication(f.request, signal())).rejects.toThrow("COMMITTED_RECEIPT_REQUIRED");
    f.commit();
    expect(await f.installed.publication(f.request, signal())).toEqual(f.publication);
    expect(f.transport.read.mock.calls[0]![0].request_nonce).toMatch(/^[a-f0-9]{64}$/);
  });
  it("only recognizes the actual paired factory and returns immutable physical pins, not the logical catalogue", () => {
    const f = fixture(), { source, publication, ordinary_domain } = f.installed;
    expect(ordinaryManagerSourceDomain(source, publication)).toBe(ordinary_domain);
    expect(ordinaryManagerSourceDomain({ ...source }, publication)).toBeNull();
    expect(ordinaryManagerSourceDomain(source, async () => null)).toBeNull();
    expect(Object.isFrozen(ordinary_domain)).toBe(true); expect(Object.isFrozen(ordinary_domain.domain)).toBe(true);
    expect(ordinary_domain.domain.catalogue_sha256).not.toBe(f.document.catalogue_digest.slice(7));
  });
  it.each(["kid", "issuer", "audience"] as const)("rejects a signed wrong %s", async field => {
    const f = fixture(); f.mutate(p => { p[field] = "TEST_ONLY:other"; }); await expect(f.read()).rejects.toThrow();
  });
  it("rejects wrong key, payload tampering and replayed response nonce", async () => {
    const wrong = fixture(); wrong.transport.read.mockImplementation(async input => {
      const p = structuredClone(wrong.payload); p.request_nonce = input.request_nonce; return wrong.encode(p, otherKey.privateKey);
    });
    await expect(wrong.read()).rejects.toThrow();
    const changed = fixture(); changed.setCorrupt(); await expect(changed.read()).rejects.toThrow();
    const replay = fixture(); replay.setWrongNonce(); await expect(replay.read()).rejects.toThrow();
  });
  it("rejects a fabricated commissioning handle, wrong SPKI hash and private-key installation", () => {
    const f = fixture();
    expect(() => createOrdinaryManagerSource({ ...f.options, commissioning: {} as typeof f.options.commissioning })).toThrow("CONFIG_INVALID");
    expect(() => createOrdinaryManagerSource({ ...f.options, signer: { ...f.options.signer, spki_sha256: `sha256:${"0".repeat(64)}` } })).toThrow("CONFIG_INVALID");
    expect(() => createOrdinaryManagerSource({ ...f.options, signer: { ...f.options.signer,
      public_key_spki_pem: key.privateKey.export({ type: "pkcs8", format: "pem" }).toString() } })).toThrow("CONFIG_INVALID");
  });
  it.each([
    (p: OrdinaryManagerSignedPayload) => { p.scope.workspace_id = "TEST_ONLY:other"; },
    (p: OrdinaryManagerSignedPayload) => { p.scope.environment = "sandbox"; },
    (p: OrdinaryManagerSignedPayload) => { p.scope.profile_id = "PAPER_BINANCE_USDM"; },
    (p: OrdinaryManagerSignedPayload) => { p.physical_seals.catalogue_sha256 = "3".repeat(64); },
    (p: OrdinaryManagerSignedPayload) => { p.physical_seals.profile_sha256 = "3".repeat(64); },
    (p: OrdinaryManagerSignedPayload) => { p.physical_seals.field_policy_sha256 = "3".repeat(64); },
    (p: OrdinaryManagerSignedPayload) => { p.field_policy_ref = "TEST_ONLY:wrong"; },
    (p: OrdinaryManagerSignedPayload) => { doc(p).catalogue_digest = `sha256:${"3".repeat(64)}`; },
    (p: OrdinaryManagerSignedPayload) => { doc(p).qualification = "TEST_ONLY"; },
    (p: OrdinaryManagerSignedPayload) => { pub(p).authority.qualification = "TEST_ONLY"; },
    (p: OrdinaryManagerSignedPayload) => { pub(p).source_read.qualification = "TEST_ONLY"; },
    (p: OrdinaryManagerSignedPayload) => { pub(p).purpose = "STREAM"; },
    (p: OrdinaryManagerSignedPayload) => { pub(p).history_capability = "SNAPSHOT_TAIL"; },
  ])("rejects signed cross-scope/seal/qualification/history vector %#", async mutate => {
    const f = fixture(); f.mutate(mutate); await expect(f.read()).rejects.toThrow();
  });
  it.each(["source_read", "transport_trust", "privacy", "field_policy"] as const)("hashes actual %s receipt bytes against independent commissioning pins", async name => {
    const f = fixture(); f.mutate(p => { p.receipt_evidence_base64[name] = Buffer.from("TEST_ONLY substituted").toString("base64"); });
    await expect(f.read()).rejects.toThrow();
    const g = fixture(); g.mutate(p => { pub(p)[name].receipt_ref = sha(Buffer.from("TEST_ONLY substituted"));
      p.receipt_evidence_base64[name] = Buffer.from("TEST_ONLY substituted").toString("base64"); });
    await expect(g.read()).rejects.toThrow();
  });
  it.each([
    (p: OrdinaryManagerSignedPayload) => { pub(p).authority.tuples = []; },
    (p: OrdinaryManagerSignedPayload) => { pub(p).authority.tuples.push(structuredClone(tuple)); },
    (p: OrdinaryManagerSignedPayload) => { pub(p).authority.resources.push({ kind: "ACCOUNT", id: "TEST_ONLY:orphan" }); },
    (p: OrdinaryManagerSignedPayload) => { pub(p).authority.resources.pop(); },
    (p: OrdinaryManagerSignedPayload) => { pub(p).authority.population_coverage = "PARTIAL"; },
    (p: OrdinaryManagerSignedPayload) => { doc(p).members[0]!.owner_revision = ""; },
    (p: OrdinaryManagerSignedPayload) => { doc(p).facts[0]!.ownership_partition_ref = ""; },
    (p: OrdinaryManagerSignedPayload) => { doc(p).facts[0]!.partition.economic_domain = "ACTUAL"; },
    (p: OrdinaryManagerSignedPayload) => { doc(p).facts[0]!.tuple.account_id = "TEST_ONLY:orphan"; },
    (p: OrdinaryManagerSignedPayload) => { doc(p).facts[0]!.effective_at_ms = NOW; },
    (p: OrdinaryManagerSignedPayload) => { doc(p).facts.push(structuredClone(doc(p).facts[0]!)); },
    (p: OrdinaryManagerSignedPayload) => { doc(p).source_quality.completeness = "PARTIAL"; },
    (p: OrdinaryManagerSignedPayload) => { doc(p).source_quality.freshness = "STALE"; },
  ])("refuses incomplete/conflicting census, ownership, facts or cut %#", async mutate => {
    const f = fixture(); f.mutate(mutate); await expect(f.read()).rejects.toThrow();
  });
  it.each([
    (p: OrdinaryManagerSignedPayload) => { p.issued_at_ms = NOW + 1; },
    (p: OrdinaryManagerSignedPayload) => { p.expires_at_ms = NOW; },
    (p: OrdinaryManagerSignedPayload) => { p.expires_at_ms = NOW + 2001; },
    (p: OrdinaryManagerSignedPayload) => { pub(p).source_as_of_ms = NOW - 9; },
    (p: OrdinaryManagerSignedPayload) => { pub(p).state = "DRAINING"; },
    (p: OrdinaryManagerSignedPayload) => { pub(p).state = "REVOKED"; },
  ])("refuses future/expired/overlong/mixed-cut/nonactive signed input %#", async mutate => {
    const f = fixture(); f.mutate(mutate); await expect(f.read()).rejects.toThrow();
  });
  it("bounds bytes/rows/receipt memory and rejects duplicate-key or lossy JSON", async () => {
    const f = fixture(); await expect(f.read({ maximum_bytes: 10 })).rejects.toThrow();
    await expect(f.read({ maximum_rows: 1 })).rejects.toThrow();
    const receipt = fixture(); receipt.mutate(p => { p.receipt_evidence_base64.privacy = Buffer.alloc(4097).toString("base64"); });
    await expect(receipt.read()).rejects.toThrow();
    const oversized = fixture(); oversized.transport.read.mockResolvedValue(Buffer.alloc(65537)); await expect(oversized.read()).rejects.toThrow();
    const duplicate = fixture(); duplicate.transport.read.mockImplementation(async input => {
      const value = { ...duplicate.payload, request_nonce: input.request_nonce };
      const raw = Buffer.from(JSON.stringify(value).replace('"kid":', '"kid":"duplicate","kid":'));
      return Buffer.from(JSON.stringify({ schema_version: "portal.execution.ordinary-manager-signed-envelope.proposal.v1",
        payload_base64: raw.toString("base64"), signature_base64: sign(null, raw, key.privateKey).toString("base64") }));
    });
    await expect(duplicate.read()).rejects.toThrow();
  });
  it("rechecks with a fresh nonce and provides a synchronous source/deadline/cancellation fence", async () => {
    const f = fixture(), cancellation = new AbortController();
    await f.read();
    const fence = await f.installed.source.recheck({ scope, document: f.document, publication: f.publication, signal: cancellation.signal });
    expect(fence.assertCurrent?.()).toBeUndefined();
    expect(f.transport.current.mock.calls[0]![0].request_nonce).not.toBe(f.transport.read.mock.calls[0]![0].request_nonce);
    f.setNow(NOW + 1000); expect(() => fence.assertCurrent?.()).toThrow("NOT_CURRENT");
    cancellation.abort(); expect(() => fence.assertCurrent?.()).toThrow("ABORTED");
  });
  it("an observed replacement or revocation invalidates an outstanding synchronous fence", async () => {
    const f = fixture(); await f.read();
    const fence = await f.installed.source.recheck({ scope, document: f.document, publication: f.publication, signal: signal() });
    f.mutate(p => { pub(p).state = "REVOKED"; });
    await expect(f.installed.publication(f.request, signal())).rejects.toThrow();
    expect(() => fence.assertCurrent?.()).toThrow("NOT_CURRENT");
  });
  it("refuses mismatched current revision, stale data, commissioning expiry and missing current source", async () => {
    const f = fixture(); f.mutate(p => { doc(p).revision = "TEST_ONLY:r2"; });
    await expect(f.installed.source.recheck({ scope, document: f.document, publication: f.publication, signal: signal() })).rejects.toThrow();
    const stale = fixture(); stale.setNow(NOW + 991); await expect(stale.read()).rejects.toThrow();
    const expired = fixture(); expired.setNow(NOW + 10000); await expect(expired.read()).rejects.toThrow();
    const absent = fixture(); absent.setAbsent(); expect(await absent.read()).toBeNull();
    expect(await absent.installed.publication(absent.request, signal())).toBeNull();
  });
  it("does not ACK until an exact durable document exists; retries lost ACK without inventing a receipt", async () => {
    const f = fixture(); await f.read();
    await expect(f.installed.source.acknowledge(f.receipt, signal())).rejects.toThrow("COMMITTED_RECEIPT_REQUIRED");
    expect(f.transport.acknowledge).not.toHaveBeenCalled();
    f.commit(); await f.read();
    await expect(f.installed.source.acknowledge({ ...f.receipt, digest: `sha256:${"0".repeat(64)}` }, signal())).rejects.toThrow();
    await f.read(); f.transport.acknowledge.mockRejectedValueOnce(new Error("TEST_ONLY lost ACK"));
    await expect(f.installed.source.acknowledge(f.receipt, signal())).rejects.toThrow();
    expect(await f.read()).not.toBeNull(); await f.installed.source.acknowledge(f.receipt, signal());
    expect(await f.read()).toBeNull(); expect(f.transport.acknowledge).toHaveBeenCalledTimes(2);
  });
  it("does not publish a changed head or wrong persisted content", async () => {
    const f = fixture(); f.commit();
    f.repository.head.mockResolvedValue({ revision: "TEST_ONLY:other", source_epoch: f.document.source_epoch,
      source_sequence: f.document.source_sequence, projection_generation: f.document.projection_generation,
      payload_digest: accessDigest(f.document), catalogue_digest: f.document.catalogue_digest });
    await expect(f.installed.publication(f.request, signal())).rejects.toThrow();
    const g = fixture(); g.commit(); g.repository.document.mockResolvedValue({ ...g.document, facts: [] });
    await expect(g.installed.publication(g.request, signal())).rejects.toThrow();
  });
  it("cancels before transport and bounds concurrent admission without launching another fetch", async () => {
    const f = fixture(), cancellation = new AbortController(); cancellation.abort();
    await expect(f.read({ signal: cancellation.signal })).rejects.toThrow("ABORTED"); expect(f.transport.read).not.toHaveBeenCalled();
    const releases: Array<() => void> = [];
    f.transport.read.mockImplementation(async input => { await new Promise<void>(resolve => { releases.push(resolve); });
      const p = structuredClone(f.payload); p.request_nonce = input.request_nonce; return f.encode(p); });
    const first = f.read(), second = f.read();
    await expect(f.read()).rejects.toThrow("CAPACITY"); expect(f.transport.read).toHaveBeenCalledTimes(2);
    // Resolve the two controlled promises independently (no sleep/network).
    releases.forEach(release => release());
    await Promise.all([first, second]);
  });
  it("settles on timeout, aborts the transport and retains admission until noncooperative I/O actually settles", async () => {
    vi.useFakeTimers();
    const releases: Array<() => void> = [];
    try {
      const f = fixture();
      f.transport.read.mockImplementation(async input => {
        await new Promise<void>(resolve => { releases.push(resolve); });
        const p = structuredClone(f.payload); p.request_nonce = input.request_nonce; return f.encode(p);
      });
      const first = expect(f.read()).rejects.toThrow("ABORTED");
      await vi.advanceTimersByTimeAsync(1001); await first;
      expect(f.transport.read.mock.calls[0]![0].signal.aborted).toBe(true);
      const second = expect(f.read()).rejects.toThrow("ABORTED");
      await vi.advanceTimersByTimeAsync(1001); await second;
      await expect(f.read()).rejects.toThrow("CAPACITY"); expect(f.transport.read).toHaveBeenCalledTimes(2);
      releases.forEach(release => release()); await Promise.resolve(); await Promise.resolve();
    } finally { releases.forEach(release => release()); vi.useRealTimers(); }
  });
  it("never revives a previous capture after clock rollback or a signed source checkpoint rewind", async () => {
    const f = fixture(); await f.read();
    const fence = await f.installed.source.recheck({ scope, document: f.document, publication: f.publication, signal: signal() });
    f.setNow(NOW + 1); fence.assertCurrent?.(); f.setNow(NOW);
    expect(() => fence.assertCurrent?.()).toThrow("NOT_CURRENT");
    const g = fixture(); await g.read();
    g.mutate(p => { doc(p).source_sequence = "9007199254740992"; });
    await expect(g.read()).rejects.toThrow("NOT_CURRENT");
  });
});
