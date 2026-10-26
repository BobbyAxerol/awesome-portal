/** TEST_ONLY owner-local files and in-memory keys/certificates. No DB,
 * listener, network, grants, sessions or financial proof is created. */
import { createHash, generateKeyPairSync } from "node:crypto";
import { chmod, mkdtemp, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as nativeRuntime from "../src/execution-v2/native-core-runtime";
import { FinancialSourceRuntimeError, financialSourceRuntimeReference, prepareFinancialSourceRuntime,
  type FinancialSourceRuntimeReference } from "../src/execution-v2/financial-source-runtime";
import { commonName, testCertificate, type TestAuthority } from "./fixtures/elp210-test-certificates";

const hash = (raw: string | Buffer) => createHash("sha256").update(raw).digest("hex");
const tlsPorts = ["assertion_transport", "current_human_transport", "recovery"] as const;
function authority(label: string, issuer?: TestAuthority, isCa = true): TestAuthority {
  const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" }), name = commonName(label);
  return { key: pair.privateKey, name, certificate: testCertificate(name, pair,
    issuer ?? { name, key: pair.privateKey }, isCa) };
}
function localIdentity(issuer: TestAuthority) {
  const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  return { key: Buffer.from(pair.privateKey.export({ type: "pkcs8", format: "pem" })),
    cert: testCertificate(commonName("TEST_ONLY-financial-chain-leaf"), pair, issuer, false, "core.research.test") };
}
describe("private financial Research runtime loader", () => {
  const roots = new Set<string>();
  let ca: Buffer, serverKey: Buffer, serverCert: Buffer, issuerKey: Buffer, sourceKey: Buffer, issuerPublic: Buffer;
  beforeAll(() => {
    const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" }), name = commonName("TEST_ONLY-financial-ca");
    const authority: TestAuthority = { key: pair.privateKey, name, certificate: testCertificate(name, pair, { name, key: pair.privateKey }, true) };
    ca = authority.certificate;
    const server = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    serverKey = Buffer.from(server.privateKey.export({ type: "pkcs8", format: "pem" }));
    serverCert = testCertificate(commonName("TEST_ONLY-financial-server"), server, authority, false, "core.research.test");
    const issuer = generateKeyPairSync("ed25519"), source = generateKeyPairSync("ed25519");
    issuerKey = Buffer.from(issuer.privateKey.export({ type: "pkcs8", format: "pem" }));
    issuerPublic = Buffer.from(issuer.publicKey.export({ type: "spki", format: "pem" }));
    sourceKey = Buffer.from(source.publicKey.export({ type: "spki", format: "pem" }));
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    for (const root of roots) await rm(root, { recursive: true, force: true });
    roots.clear();
  });
  async function fixture() {
    const root = await mkdtemp(join(tmpdir(), "TEST_ONLY-financial-runtime-")); roots.add(root); await chmod(root, 0o700);
    let count = 0;
    const leaf = async (raw: string | Buffer): Promise<FinancialSourceRuntimeReference> => {
      const path = join(root, `private-${count++}`); await writeFile(path, raw, { mode: 0o600, flag: "wx" });
      await chmod(path, 0o600); return { path, sha256: hash(raw) };
    };
    const tls = async () => ({ key_ref: await leaf(serverKey), cert_ref: await leaf(serverCert), ca_ref: await leaf(ca), server_name: "core.research.test" });
    const workspace = "TEST_ONLY-research", user = "TEST_ONLY-owner", workload = "TEST_ONLY-edge-workload";
    const value = { schema_version: "portal.execution.financial-source-runtime.v1", target: { kind: "RESEARCH", environment: "paper" },
      schema_target: { database_name: "TEST_ONLY-db", database_system_identifier: "123456", role_name: "TEST_ONLY-role",
        protected_owner_user_id: user, workspace_id: workspace, principal_workspace_pins: [{ user_id: user, workspace_id: workspace }] },
      pool_profile: { max: 3, connectionTimeoutMillis: 5000, statement_timeout: 4000, query_timeout: 5000, idle_in_transaction_session_timeout: 5000 },
      actor: { user_id: user, session_id: "TEST_ONLY-session", session_generation: 4 },
      listeners: { assertion: { host: "127.0.0.1", port: 29450 }, reverse: { host: "127.0.0.1", port: 29451 } },
      candidate: { issuer: "TEST_ONLY-core", audience: "TEST_ONLY-pm", key_id: "TEST_ONLY-core-key", private_key_ref: await leaf(issuerKey),
        source: { issuer: "TEST_ONLY-pm", audience: "TEST_ONLY-core", key_id: "TEST_ONLY-source-key", public_key_ref: await leaf(sourceKey), workload_id: workload },
        limits: { ttl_ms: 30_000, maximum_unresolved: 1, maximum_retained: 128 },
        installation_scope: { workspace_id: workspace, environment: "paper", valid_until_ms: Date.now() + 60_000 } },
      assertion_limits: { ttl_ms: 60_000, maximum_contexts: 1, maximum_requests_per_context: 64 },
      assertion_transport: { tls: await tls(), peer: { certificate_sha256: `sha256:${"a".repeat(64)}`, dns_name: "edge.research.test", workload_id: workload },
        limits: { maximum_in_flight: 2, request_bytes: 2_129_920, response_bytes: 65_536, deadline_ms: 5000 } },
      current_human_transport: { tls: await tls(), source_certificate_sha256: `sha256:${"b".repeat(64)}`,
        limits: { maximum_in_flight: 2, request_bytes: 32_768, deadline_ms: 5000 } },
      recovery: { origin: "https://10.70.0.2:29452", tls: await tls(), source_certificate_sha256: `sha256:${"b".repeat(64)}`,
        deadline_ms: 5000, response_bytes: 32_768 },
      source_selection: { workspace_id: workspace, environment: "paper", workload_id: workload, receiver_id: "TEST_ONLY-receiver",
        binding_digest: `sha256:${"c".repeat(64)}`, paths: ["/financial/dataset", "/financial/series", "/financial/snapshot", "/financial/page", "/financial/delta", "/financial/receipt"] },
      shutdown_deadline_ms: 5000 };
    return { root, value, leaf, manifest: (input: unknown = value) => leaf(JSON.stringify(input)) };
  }
  async function refused(ref: FinancialSourceRuntimeReference) {
    const error = await prepareFinancialSourceRuntime(ref).catch(error => error);
    expect(error).toBeInstanceOf(FinancialSourceRuntimeError);
    expect(error).toMatchObject({ code: "FINANCIAL_SOURCE_RUNTIME_CONFIG_INVALID",
      message: "The private financial source runtime configuration is not available." });
    expect(error.message).not.toContain(ref.path); expect(error.message).not.toContain("PRIVATE KEY");
  }
  it("is OFF without both env values and does not read anything; partial/invalid input refuses", () => {
    const read = vi.spyOn(nativeRuntime, "readNativeRuntimeReference");
    expect(financialSourceRuntimeReference({})).toBeUndefined(); expect(read).not.toHaveBeenCalled();
    const path = "/TEST_ONLY/runtime.json", sha = "a".repeat(64);
    expect(financialSourceRuntimeReference({ CONTROL_API_FINANCIAL_SOURCE_CONFIG_FILE: path, CONTROL_API_FINANCIAL_SOURCE_CONFIG_SHA256: sha }))
      .toEqual({ path, sha256: sha });
    for (const env of [{ CONTROL_API_FINANCIAL_SOURCE_CONFIG_FILE: path }, { CONTROL_API_FINANCIAL_SOURCE_CONFIG_SHA256: sha },
      { CONTROL_API_FINANCIAL_SOURCE_CONFIG_FILE: "", CONTROL_API_FINANCIAL_SOURCE_CONFIG_SHA256: sha },
      { CONTROL_API_FINANCIAL_SOURCE_CONFIG_FILE: "/private/../runtime.json", CONTROL_API_FINANCIAL_SOURCE_CONFIG_SHA256: sha },
      { CONTROL_API_FINANCIAL_SOURCE_CONFIG_FILE: path, CONTROL_API_FINANCIAL_SOURCE_CONFIG_SHA256: sha.toUpperCase() }])
      expect(() => financialSourceRuntimeReference(env)).toThrow(FinancialSourceRuntimeError);
  });
  it("prepares genuine keys/TLS and exact actor/schema/pool selections without creating authority", async () => {
    const f = await fixture(), prepared = await prepareFinancialSourceRuntime(await f.manifest());
    expect(prepared.actor).toEqual(f.value.actor); expect(prepared.schemaTarget).toEqual(f.value.schema_target);
    expect(prepared.poolProfile).toEqual(f.value.pool_profile); expect(prepared.listeners).toEqual(f.value.listeners);
    expect(prepared.config.candidate.private_key).toMatchObject({ type: "private", asymmetricKeyType: "ed25519" });
    expect(prepared.config.candidate.source.public_key).toMatchObject({ type: "public", asymmetricKeyType: "ed25519" });
    expect(prepared.config.assertion_transport.tls.key).toEqual(serverKey);
    expect(prepared.config.current_human_transport.tls.key).not.toBe(prepared.config.assertion_transport.tls.key);
    expect(prepared.config.candidate).not.toHaveProperty("private_key_ref"); expect(prepared).not.toHaveProperty("original_context");
    expect((await stat(f.value.candidate.private_key_ref.path)).uid).toBe(process.geteuid!());
  });
  it("wipes private input bytes after hydration and on failure but preserves successful TLS output copies", async () => {
    const f = await fixture(), actual = nativeRuntime.readNativeRuntimeReference, inputs: Buffer[] = [];
    vi.spyOn(nativeRuntime, "readNativeRuntimeReference").mockImplementation(async (...args) => { const raw = await actual(...args); inputs.push(raw); return raw; });
    const prepared = await prepareFinancialSourceRuntime(await f.manifest());
    expect(inputs).toHaveLength(12); expect(inputs.every(raw => raw.every(byte => byte === 0))).toBe(true);
    expect(prepared.config.assertion_transport.tls.key).toEqual(serverKey);
    inputs.length = 0; f.value.current_human_transport.tls.key_ref = await f.leaf("TEST_ONLY-malformed");
    await refused(await f.manifest()); expect(inputs.every(raw => raw.every(byte => byte === 0))).toBe(true);
  });
  it("preserves expired installation pins for same-key recovery, never fabricates fresh authority", async () => {
    const f = await fixture(); f.value.candidate.installation_scope.valid_until_ms = 1;
    const prepared = await prepareFinancialSourceRuntime(await f.manifest());
    expect(prepared.config.candidate.installation_scope!.valid_until_ms).toBe(1);
    expect(prepared.actor).toEqual(f.value.actor);
  });
  it("refuses wrong hashes, owner, permissions, symlinks, nonregular and oversized leaves", async () => {
    const f = await fixture(), ref = await f.manifest(); await refused({ ...ref, sha256: "f".repeat(64) });
    await chmod(ref.path, 0o644); await refused(ref); await chmod(ref.path, 0o600);
    const alias = join(f.root, "alias"); await symlink(ref.path, alias); await refused({ ...ref, path: alias });
    await refused({ ...ref, path: f.root }); await refused(await f.leaf(" ".repeat(65_537)));
    const uid = process.geteuid!(); vi.spyOn(process, "geteuid").mockReturnValue(uid + 1); await refused(ref);
  });
  it("accepts exact 0400 without changing ownership or mode", async () => {
    const f = await fixture(), ref = await f.manifest(); await chmod(ref.path, 0o400);
    await prepareFinancialSourceRuntime(ref); expect((await stat(ref.path)).mode & 0o7777).toBe(0o400);
  });
  it("requires independently pinned private recovery and never derives it from inbound transport", async () => {
    const f = await fixture(), { recovery: _recovery, ...missing } = f.value;
    await refused(await f.manifest(missing));
    for (const origin of ["http://10.70.0.2:29452", "https://8.8.8.8", "https://10.70.0.2/path", "https://user@10.70.0.2", "https://10.70.0.2/?q=1"])
      await refused(await f.manifest({ ...f.value, recovery: { ...f.value.recovery, origin } }));
    const prepared = await prepareFinancialSourceRuntime(await f.manifest());
    expect(prepared.recovery.origin).toBe(f.value.recovery.origin);
    expect(prepared.recovery.tls.key).not.toBe(prepared.config.current_human_transport.tls.key);
    expect(prepared.recovery).not.toHaveProperty("original_context");
  });
  it("refuses malformed UTF8, duplicate/unknown keys and noncompact JSON", async () => {
    const f = await fixture(), raw = JSON.stringify(f.value);
    for (const input of [Buffer.from([0xff]), `${raw}\n`, JSON.stringify(f.value, null, 2),
      raw.replace('"schema_version":', '"extra":true,"schema_version":'), raw.replace('"schema_version":', '"schema_version":"wrong","schema_version":')])
      await refused(await f.leaf(input));
    await refused(await f.manifest({ ...f.value, actor: { ...f.value.actor, role: "ADMIN" } }));
  });
  it("refuses identity/workspace/workload mismatch, broader targets and malformed exact selections", async () => {
    const f = await fixture();
    const variants = [ { ...f.value, target: { kind: "STABLE", environment: "paper" } },
      { ...f.value, actor: { ...f.value.actor, user_id: "TEST_ONLY-other" } },
      { ...f.value, actor: { ...f.value.actor, session_generation: -1 } },
      { ...f.value, candidate: { ...f.value.candidate, installation_scope: { ...f.value.candidate.installation_scope, workspace_id: "other" } } },
      { ...f.value, source_selection: { ...f.value.source_selection, environment: "live" } },
      { ...f.value, source_selection: { ...f.value.source_selection, workload_id: "other" } },
      { ...f.value, source_selection: { ...f.value.source_selection, paths: Array(6).fill("/financial/dataset") } },
      { ...f.value, source_selection: { ...f.value.source_selection, paths: ["/../escape", ...f.value.source_selection.paths.slice(1)] } },
      { ...f.value, assertion_transport: { ...f.value.assertion_transport, peer: { ...f.value.assertion_transport.peer, workload_id: "other" } } },
      { ...f.value, schema_target: { ...f.value.schema_target, workspace_id: "other" } } ];
    for (const value of variants) await refused(await f.manifest(value));
  });
  it("enforces all finite ceilings/private listeners with no silent default", async () => {
    const f = await fixture();
    for (const value of [ { ...f.value, listeners: { ...f.value.listeners, assertion: { host: "0.0.0.0", port: 29450 } } },
      { ...f.value, listeners: { ...f.value.listeners, assertion: { host: "127.0.0.1", port: 0 } } },
      { ...f.value, listeners: { assertion: f.value.listeners.reverse, reverse: f.value.listeners.reverse } },
      { ...f.value, pool_profile: { ...f.value.pool_profile, max: 11 } },
      { ...f.value, pool_profile: { ...f.value.pool_profile, query_timeout: f.value.pool_profile.statement_timeout } },
      { ...f.value, candidate: { ...f.value.candidate, limits: { ...f.value.candidate.limits, ttl_ms: 30_001 } } },
      { ...f.value, assertion_limits: { ...f.value.assertion_limits, maximum_requests_per_context: 65 } },
      { ...f.value, assertion_transport: { ...f.value.assertion_transport, limits: { ...f.value.assertion_transport.limits, request_bytes: 2_129_921 } } },
      { ...f.value, shutdown_deadline_ms: 5001 } ]) await refused(await f.manifest(value));
  });
  it("refuses wrong key algorithms, private source key, and same source/core Ed25519 key", async () => {
    const f = await fixture(); f.value.candidate.private_key_ref = await f.leaf(serverKey); await refused(await f.manifest());
    f.value.candidate.private_key_ref = await f.leaf(issuerKey); f.value.candidate.source.public_key_ref = await f.leaf(issuerKey); await refused(await f.manifest());
    f.value.candidate.source.public_key_ref = await f.leaf(issuerPublic); await refused(await f.manifest());
  });
  it.each(tlsPorts)("accepts an independent remote trust CA for %s without asserting local issuance", async port => {
    const f = await fixture(), peer = authority("TEST_ONLY-independent-financial-peer-ca");
    f.value[port].tls.ca_ref = await f.leaf(peer.certificate);
    const prepared = await prepareFinancialSourceRuntime(await f.manifest());
    const tls = port === "recovery" ? prepared.recovery.tls : prepared.config[port].tls;
    expect(tls).toEqual({ key: serverKey, cert: serverCert, ca: peer.certificate });
  });
  it.each(tlsPorts)("accepts a complete local chain with an independent remote CA for %s", async port => {
    const f = await fixture(), root = authority("TEST_ONLY-financial-local-root"),
      intermediate = authority("TEST_ONLY-financial-intermediate", root), identity = localIdentity(intermediate),
      bundle = Buffer.concat([identity.cert, intermediate.certificate, root.certificate]);
    f.value[port].tls.key_ref = await f.leaf(identity.key);
    f.value[port].tls.cert_ref = await f.leaf(bundle);
    const prepared = await prepareFinancialSourceRuntime(await f.manifest());
    const tls = port === "recovery" ? prepared.recovery.tls : prepared.config[port].tls;
    expect(tls.cert).toEqual(bundle); expect(tls.ca).toEqual(ca);
  });
  it.each(tlsPorts.flatMap(port => (["wrong-signing-key", "non-ca-issuer", "wrong-order"] as const)
    .map(fault => ({ port, fault }))))("rejects local $fault on $port even with an independent peer CA", async ({ port, fault }) => {
    const f = await fixture(), root = authority("TEST_ONLY-financial-local-root"),
      intermediate = authority("TEST_ONLY-financial-intermediate", root, fault !== "non-ca-issuer"),
      identity = localIdentity(intermediate), issuer = fault === "wrong-signing-key"
        ? authority("TEST_ONLY-financial-intermediate", root) : intermediate;
    const bundle = fault === "wrong-order" ? [identity.cert, root.certificate, issuer.certificate]
      : [identity.cert, issuer.certificate, root.certificate];
    f.value[port].tls.key_ref = await f.leaf(identity.key);
    f.value[port].tls.cert_ref = await f.leaf(Buffer.concat(bundle));
    const actual = nativeRuntime.readNativeRuntimeReference, inputs: Buffer[] = [];
    vi.spyOn(nativeRuntime, "readNativeRuntimeReference").mockImplementation(async (...args) => {
      const bytes = await actual(...args); inputs.push(bytes); return bytes;
    });
    await refused(await f.manifest()); expect(inputs.length).toBeGreaterThan(1);
    expect(inputs.every(bytes => bytes.every(byte => byte === 0))).toBe(true);
  });
  it("refuses local TLS key mismatch, non-CA roots, wrong SAN and expired certificates", async () => {
    const f = await fixture(), original = structuredClone(f.value.assertion_transport.tls);
    for (const tls of [ { ...original, key_ref: await f.leaf(issuerKey) }, { ...original, ca_ref: await f.leaf(serverCert) },
      { ...original, server_name: "wrong.research.test" } ]) {
      f.value.assertion_transport.tls = tls; await refused(await f.manifest());
    }
    f.value.assertion_transport.tls = original;
    const ref = await f.manifest(), now = Date.now(); vi.spyOn(Date, "now").mockReturnValue(now + 2 * 86_400_000); await refused(ref);
    vi.mocked(Date.now).mockReturnValue(now - 2 * 86_400_000); await refused(ref);
  });
});
