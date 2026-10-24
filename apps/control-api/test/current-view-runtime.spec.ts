/** TEST_ONLY private temporary files and in-memory test certificates. Real
 * file/UID/mode/hash/PEM checks; no listener, DB, network or runtime trust. */
import { createHash, generateKeyPairSync } from "node:crypto";
import { chmod, mkdtemp, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as nativeRuntime from "../src/execution-v2/native-core-runtime";
import { CurrentViewRuntimeError, currentViewRuntimeReference, prepareCurrentViewRuntime,
  type CurrentViewRuntimeReference } from "../src/execution-v2/current-view-runtime";
import { commonName, testCertificate, type TestAuthority } from "./fixtures/elp210-test-certificates";
import { accessDigest } from "../src/execution-v2/access-digest";
import { managerCurrentMetadataDigest, type ManagerCurrentMetadata } from "../src/execution-v2/manager-current-publication";

const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
type Identity = { key: Buffer; cert: Buffer };
describe("hash-pinned current-view Research/Paper runtime", () => {
  const roots = new Set<string>();
  let ca: Buffer, inbound: Identity, outbound: Identity;
  beforeAll(() => {
    const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" }), name = commonName("TEST_ONLY-runtime-ca");
    const authority: TestAuthority = { key: keys.privateKey, name, certificate: testCertificate(name, keys, { name, key: keys.privateKey }, true) };
    ca = authority.certificate;
    const identity = (label: string): Identity => {
      const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
      return { key: Buffer.from(pair.privateKey.export({ type: "pkcs8", format: "pem" })),
        cert: testCertificate(commonName(label), pair, authority, false) };
    };
    inbound = identity("TEST_ONLY-inbound"); outbound = identity("TEST_ONLY-outbound");
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    for (const root of roots) await rm(root, { recursive: true, force: true });
    roots.clear();
  });
  async function fixture() {
    const root = await mkdtemp(join(tmpdir(), "TEST_ONLY-current-view-runtime-")); roots.add(root); await chmod(root, 0o700);
    let count = 0;
    const leaf = async (bytes: string | Buffer, mode = 0o600): Promise<CurrentViewRuntimeReference> => {
      const path = join(root, `private-${count++}`); await writeFile(path, bytes, { mode, flag: "wx" }); await chmod(path, mode);
      return { path, sha256: hash(bytes) };
    };
    const inboundPins = { key_ref: await leaf(inbound.key), cert_ref: await leaf(inbound.cert), ca_ref: await leaf(ca) };
    const outboundPins = { key_ref: await leaf(outbound.key), cert_ref: await leaf(outbound.cert), ca_ref: await leaf(ca) };
    const value = { schema_version: "portal.execution.current-view-runtime.v1", target: { kind: "RESEARCH", environment: "paper" },
      pool_profile: { max: 2, connectionTimeoutMillis: 1000, statement_timeout: 2000, query_timeout: 3000, idle_in_transaction_session_timeout: 2000 },
      listener: { host: "127.0.0.1", port: 29448 }, authority: { ttl_ms: 60000, maximum_contexts: 256 },
      transport: { tls: inboundPins, peer: { certificate_sha256: `sha256:${"a".repeat(64)}`, dns_name: "edge.research.test", workload_id: "TEST_ONLY-edge-workload" },
        limits: { maximum_in_flight: 2, request_bytes: 8192, response_bytes: 65536, deadline_ms: 1000 } },
      edge: { origin: "https://10.70.0.2:29448", tls: outboundPins, peer: { certificate_sha256: `sha256:${"b".repeat(64)}`, dns_name: "edge.research.test" },
        limits: { maximum_in_flight: 2, response_bytes: 1048576, deadline_ms: 5000 } }, shutdown_deadline_ms: 5000 };
    return { root, value, leaf, manifest: (input: unknown = value) => leaf(JSON.stringify(input)) };
  }
  const refused = async (input: CurrentViewRuntimeReference) => {
    const error = await prepareCurrentViewRuntime(input).catch(error => error);
    expect(error).toBeInstanceOf(CurrentViewRuntimeError);
    expect(error).toMatchObject({ code: "CURRENT_VIEW_RUNTIME_CONFIG_INVALID", message: "The private current-view runtime configuration is not available." });
    expect(error.message).not.toContain(input.path); expect(error.message).not.toContain("PRIVATE KEY");
  };
  it("is absent only when both opt-in env values are absent; partial/empty/malformed fails closed", () => {
    expect(currentViewRuntimeReference({})).toBeUndefined();
    const path = "/TEST_ONLY/private/runtime.json", sha = "a".repeat(64);
    expect(currentViewRuntimeReference({ CONTROL_API_CURRENT_VIEW_CONFIG_FILE: path, CONTROL_API_CURRENT_VIEW_CONFIG_SHA256: sha })).toEqual({ path, sha256: sha });
    for (const env of [{ CONTROL_API_CURRENT_VIEW_CONFIG_FILE: path }, { CONTROL_API_CURRENT_VIEW_CONFIG_SHA256: sha },
      { CONTROL_API_CURRENT_VIEW_CONFIG_FILE: "", CONTROL_API_CURRENT_VIEW_CONFIG_SHA256: sha },
      { CONTROL_API_CURRENT_VIEW_CONFIG_FILE: "relative.json", CONTROL_API_CURRENT_VIEW_CONFIG_SHA256: sha },
      { CONTROL_API_CURRENT_VIEW_CONFIG_FILE: "/private/../runtime.json", CONTROL_API_CURRENT_VIEW_CONFIG_SHA256: sha },
      { CONTROL_API_CURRENT_VIEW_CONFIG_FILE: path, CONTROL_API_CURRENT_VIEW_CONFIG_SHA256: sha.toUpperCase() }])
      expect(() => currentViewRuntimeReference(env)).toThrow(CurrentViewRuntimeError);
  });
  it("loads separate pinned TLS refs with real valid PEM and returns only explicit composition/listener config", async () => {
    const f = await fixture(), prepared = await prepareCurrentViewRuntime(await f.manifest());
    expect(prepared.listener).toEqual(f.value.listener); expect(prepared.config.transport.peer).toEqual(f.value.transport.peer);
    expect(prepared.config.transport.tls.key).toEqual(inbound.key); expect(prepared.config.edge.tls.key).toEqual(outbound.key);
    expect(prepared.config.transport.tls.key).not.toBe(prepared.config.edge.tls.key);
    expect(Object.keys(prepared)).toEqual(["config", "listener", "poolProfile"]); expect(prepared.config).not.toHaveProperty("target");
    expect(prepared.poolProfile).toEqual(f.value.pool_profile); expect(Object.isFrozen(prepared.poolProfile)).toBe(true);
    expect(await stat(f.value.transport.tls.key_ref.path)).toMatchObject({ uid: process.geteuid!() });
    for (const side of [prepared.config.transport, prepared.config.edge])
      for (const bytes of Object.values(side.tls)) if (Buffer.isBuffer(bytes)) bytes.fill(0);
  });
  it("wipes every private input buffer after parse/copy without destroying returned TLS copies", async () => {
    const f = await fixture(), actual = nativeRuntime.readNativeRuntimeReference, inputs: Buffer[] = [];
    vi.spyOn(nativeRuntime, "readNativeRuntimeReference").mockImplementation(async (...args) => {
      const bytes = await actual(...args); inputs.push(bytes); return bytes;
    });
    const prepared = await prepareCurrentViewRuntime(await f.manifest());
    expect(inputs).toHaveLength(7); expect(inputs.every(bytes => bytes.every(byte => byte === 0))).toBe(true);
    expect(prepared.config.transport.tls.key).toEqual(inbound.key);
    for (const side of [prepared.config.transport, prepared.config.edge])
      for (const bytes of Object.values(side.tls)) if (Buffer.isBuffer(bytes)) bytes.fill(0);
  });
  it("opts in independent hash-pinned Manager metadata and commissioning; changed bytes never reuse ACTIVE", async () => {
    const f = await fixture(), now = Date.now();
    const metadata: ManagerCurrentMetadata = {
      schema_version: "portal.execution.manager-current-metadata.v1",
      scope: { workspace_id: "TEST_ONLY-research", environment: "paper", profile_id: "TEST_ONLY-paper" },
      binding: { dataset_id: "manager-current:ACCOUNT", source_revision: "TEST_ONLY-cycle", projection_generation: "TEST_ONLY-epoch",
        catalogue_revision: "TEST_ONLY-catalogue", window: null },
      source_workspace_id: "TEST_ONLY-manager", adapter_revision: "TEST_ONLY-v5", publication_revision: "TEST_ONLY-publication",
      state: "ACTIVE", issued_at_ms: now - 1, expires_at_ms: now + 30_000, source_read_at_ms: now - 1000, observed_at_ms: now - 2,
      receipt_pins: { source_read: "TEST_ONLY-source", transport_trust: "TEST_ONLY-mtls", privacy: "TEST_ONLY-privacy", field_policy: "TEST_ONLY-fields" },
      grains: ["manager.account", "relation.account_balances", "relation.account_policies"].map((grain, index) => ({
        grain: grain as ManagerCurrentMetadata["grains"][number]["grain"], source_fields: ["account_id"], fields: ["account_id"],
        selections: [{ resource_ref: `TEST_ONLY-grain-${index}`, resource: { kind: "ACCOUNT", id: "TEST_ONLY-account" }, entity_ids: [`TEST_ONLY-row-${index}`] }],
        entities: [{ entity_id: `TEST_ONLY-row-${index}`, account_id: "TEST_ONLY-account", payload_digest: accessDigest(index) }],
      })),
    };
    const artifact = { schema_version: "portal.execution.manager-current-commissioning.v1", scope: metadata.scope, binding: metadata.binding,
      source_workspace_id: metadata.source_workspace_id, adapter_revision: metadata.adapter_revision,
      source_metadata_digest: managerCurrentMetadataDigest(metadata), receipt_pins: metadata.receipt_pins };
    const raw = JSON.stringify(artifact), metadataRef = await f.leaf(JSON.stringify(metadata));
    const manager_current = { metadata_ref: metadataRef, commissioning_ref: await f.leaf(raw),
      approval: { artifact_sha256: `sha256:${hash(raw)}`, approval_ref: "TEST_ONLY-owner-approval", approved_at_ms: now - 1, valid_until_ms: now + 30_000 } };
    const prepared = await prepareCurrentViewRuntime(await f.manifest({ ...f.value, manager_current }));
    expect(prepared.managerCurrent!.request).toEqual({ ...metadata.scope, binding: metadata.binding });
    expect(await prepared.managerCurrent!.source(prepared.managerCurrent!.request)).toEqual(metadata);
    await writeFile(metadataRef.path, JSON.stringify({ ...metadata, state: "REVOKED" }));
    await expect(prepared.managerCurrent!.source(prepared.managerCurrent!.request)).rejects.toThrow();
    await refused(await f.manifest({ ...f.value, manager_current }));
    for (const side of [prepared.config.transport, prepared.config.edge])
      for (const bytes of Object.values(side.tls)) if (Buffer.isBuffer(bytes)) bytes.fill(0);
  });
  it("refuses wrong manifest/reference hash, loose permissions, symlink, nonregular or oversized leaves", async () => {
    const f = await fixture(), pin = await f.manifest();
    await refused({ ...pin, sha256: "f".repeat(64) });
    await chmod(pin.path, 0o644); await refused(pin); await chmod(pin.path, 0o600);
    const linked = join(f.root, "linked.json"); await symlink(pin.path, linked); await refused({ ...pin, path: linked });
    await refused({ path: f.root, sha256: pin.sha256 }); await refused(await f.leaf(" ".repeat(65537)));
    f.value.edge.tls.key_ref = { ...f.value.edge.tls.key_ref, sha256: "e".repeat(64) }; await refused(await f.manifest());
  });
  it("accepts exact 0400 as well as 0600 without changing file ownership or mode", async () => {
    const f = await fixture(), pin = await f.manifest();
    await chmod(pin.path, 0o400); await chmod(f.value.transport.tls.key_ref.path, 0o400);
    const prepared = await prepareCurrentViewRuntime(pin);
    expect((await stat(pin.path)).mode & 0o7777).toBe(0o400);
    for (const side of [prepared.config.transport, prepared.config.edge])
      for (const bytes of Object.values(side.tls)) if (Buffer.isBuffer(bytes)) bytes.fill(0);
  });
  it("requires compact canonical UTF8, no duplicate/unknown keys or silent parse replacement", async () => {
    const f = await fixture(), raw = JSON.stringify(f.value);
    for (const bytes of [JSON.stringify(f.value, null, 2), `${raw}\n`, raw.replace('"schema_version":', '"unknown":true,"schema_version":'),
      raw.replace('"schema_version":', '"schema_version":"wrong","schema_version":'), Buffer.from([0xff]), "{}"])
      await refused(await f.leaf(bytes));
  });
  it("requires explicit bounded shared Core pool limits and query timeout strictly beyond statement timeout", async () => {
    const f = await fixture(), { pool_profile: omitted, ...without } = f.value;
    await refused(await f.manifest(without));
    for (const profile of [{ ...omitted, max: 11 }, { ...omitted, max: 0 }, { ...omitted, connectionTimeoutMillis: 5001 },
      { ...omitted, statement_timeout: 5001 }, { ...omitted, query_timeout: 5001 }, { ...omitted, idle_in_transaction_session_timeout: 5001 },
      { ...omitted, query_timeout: omitted.statement_timeout }, { ...omitted, query_timeout: omitted.statement_timeout - 1 },
      { ...omitted, extra_unreviewed_limit: 1 }])
      await refused(await f.manifest({ ...f.value, pool_profile: profile }));
  });
  it("enforces Research/Paper, explicit private listener and component limits with no ephemeral runtime port", async () => {
    const f = await fixture();
    const variants = [
      { ...f.value, target: { kind: "STABLE", environment: "paper" } }, { ...f.value, target: { kind: "RESEARCH", environment: "live" } },
      ...["0.0.0.0", "::", "8.8.8.8", "localhost"].map(host => ({ ...f.value, listener: { host, port: 29448 } })),
      { ...f.value, listener: { host: "127.0.0.1", port: 0 } }, { ...f.value, authority: { ttl_ms: 300001, maximum_contexts: 256 } },
      { ...f.value, authority: { ttl_ms: 1, maximum_contexts: 2001 } }, { ...f.value, shutdown_deadline_ms: 5001 },
      { ...f.value, edge: { ...f.value.edge, limits: { ...f.value.edge.limits, maximum_in_flight: 17 } } },
      { ...f.value, edge: { ...f.value.edge, limits: { ...f.value.edge.limits, response_bytes: 1048577 } } },
      { ...f.value, transport: { ...f.value.transport, limits: { ...f.value.transport.limits, deadline_ms: 5001 } } },
      { ...f.value, transport: { ...f.value.transport, limits: { ...f.value.transport.limits, response_bytes: 65537 } } },
    ];
    for (const value of variants) await refused(await f.manifest(value));
  });
  it("rejects URL credentials/routes, malformed peer pins/DNS and mutable reference schema", async () => {
    const f = await fixture();
    for (const origin of ["http://10.70.0.2", "https://user:password@10.70.0.2", "https://10.70.0.2/path", "https://10.70.0.2?q=x"])
      await refused(await f.manifest({ ...f.value, edge: { ...f.value.edge, origin } }));
    await refused(await f.manifest({ ...f.value, edge: { ...f.value.edge, peer: { ...f.value.edge.peer, certificate_sha256: "a".repeat(64) } } }));
    await refused(await f.manifest({ ...f.value, edge: { ...f.value.edge, peer: { ...f.value.edge.peer, dns_name: "*.research.test" } } }));
    await refused(await f.manifest({ ...f.value, transport: { ...f.value.transport, tls: { ...f.value.transport.tls, key: "inline-private-key" } } }));
  });
  it("rejects malformed/oversized/key-mismatched PEM and wipes earlier reads on hydration failure", async () => {
    const f = await fixture(), actual = nativeRuntime.readNativeRuntimeReference, inputs: Buffer[] = [];
    vi.spyOn(nativeRuntime, "readNativeRuntimeReference").mockImplementation(async (...args) => { const bytes = await actual(...args); inputs.push(bytes); return bytes; });
    f.value.edge.tls.key_ref = await f.leaf("TEST_ONLY invalid private key"); await refused(await f.manifest());
    expect(inputs.every(bytes => bytes.every(byte => byte === 0))).toBe(true);
    f.value.edge.tls.key_ref = await f.leaf(Buffer.alloc(32769, 65)); await refused(await f.manifest());
    f.value.edge.tls.key_ref = await f.leaf(inbound.key); await refused(await f.manifest());
  });
  it("refuses expired/not-yet-valid local certificate or CA instead of relying on declaration alone", async () => {
    const f = await fixture(), pin = await f.manifest(), now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 2 * 86400000); await refused(pin);
    vi.mocked(Date.now).mockReturnValue(now - 2 * 86400000); await refused(pin);
  });
});
