/** TEST_ONLY private files and genuine in-memory cryptographic material.
 * No source/network/listener/DB/original/attempt or runtime acceptance. */
import { createHash, generateKeyPairSync } from "node:crypto";
import { chmod, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as nativeRuntime from "../src/execution-v2/native-core-runtime";
import { CommandStatusRuntimeError, commandStatusRuntimeReference, prepareCommandStatusRuntime,
  type CommandStatusRuntimeReference } from "../src/execution-v2/command-status-runtime";
import { commonName, testCertificate, type TestAuthority } from "./fixtures/elp210-test-certificates";

const hash = (raw: string | Buffer) => createHash("sha256").update(raw).digest("hex");
const roots = new Set<string>();
let ca: Buffer, serverKey: Buffer, serverCert: Buffer, humanKey: Buffer, statusKey: Buffer, sourceKey: Buffer, humanPublic: Buffer;
beforeAll(() => {
  const root = generateKeyPairSync("ec", { namedCurve: "prime256v1" }), name = commonName("TEST_ONLY-status-ca");
  const authority: TestAuthority = { key: root.privateKey, name, certificate: testCertificate(name, root, { name, key: root.privateKey }, true) };
  ca = authority.certificate;
  const server = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  serverKey = Buffer.from(server.privateKey.export({ type: "pkcs8", format: "pem" }));
  serverCert = testCertificate(commonName("TEST_ONLY-status-server"), server, authority, false, "core.research.test");
  const human = generateKeyPairSync("ed25519"), status = generateKeyPairSync("ed25519"), source = generateKeyPairSync("ed25519");
  humanKey = Buffer.from(human.privateKey.export({ type: "pkcs8", format: "pem" }));
  humanPublic = Buffer.from(human.publicKey.export({ type: "spki", format: "pem" }));
  statusKey = Buffer.from(status.privateKey.export({ type: "pkcs8", format: "pem" }));
  sourceKey = Buffer.from(source.publicKey.export({ type: "spki", format: "pem" }));
});
afterEach(async () => { vi.restoreAllMocks(); for (const root of roots) await rm(root, { recursive: true, force: true }); roots.clear(); });

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "TEST_ONLY-command-status-runtime-")); roots.add(root); await chmod(root, 0o700);
  let count = 0;
  const leaf = async (raw: string | Buffer): Promise<CommandStatusRuntimeReference> => {
    const path = join(root, `private-${count++}`); await writeFile(path, raw, { mode: 0o600, flag: "wx" });
    return { path, sha256: hash(raw) };
  };
  const tls = async () => ({ key_ref: await leaf(serverKey), cert_ref: await leaf(serverCert), ca_ref: await leaf(ca), server_name: "core.research.test" });
  const workspace = "TEST_ONLY-workspace", workload = "TEST_ONLY-status-workload", gateway = "TEST_ONLY-edge-gateway";
  const value = { schema_version: "portal.execution.command-status-runtime.v1", target: { kind: "RESEARCH", environment: "paper" },
    schema_target: { database_name: "TEST_ONLY-db", database_system_identifier: "1234", role_name: "TEST_ONLY-role",
      protected_owner_user_id: "TEST_ONLY-owner", workspace_id: workspace, principal_workspace_pins: [{ user_id: "TEST_ONLY-owner", workspace_id: workspace }] },
    pool_profile: { max: 3, connectionTimeoutMillis: 5000, statement_timeout: 4000, query_timeout: 5000, idle_in_transaction_session_timeout: 5000 },
    listeners: { assertion: { host: "127.0.0.1", port: 29460 }, reverse: { host: "127.0.0.1", port: 29461 } },
    candidate: { issuer: "TEST_ONLY-core", audience: "TEST_ONLY-pm", key_id: "TEST_ONLY-core-key", private_key_ref: await leaf(humanKey),
      source: { issuer: "TEST_ONLY-pm", audience: "TEST_ONLY-core", key_id: "TEST_ONLY-pm-key", public_key_ref: await leaf(sourceKey), workload_id: workload },
      limits: { ttl_ms: 30_000, maximum_unresolved: 2, maximum_retained: 128 },
      installation_scope: { workspace_id: workspace, environment: "paper", valid_until_ms: Date.now() + 60_000 } },
    authority: { issuer: "TEST_ONLY-core-status", audience: gateway, key_id: "TEST_ONLY-status-key", private_key_ref: await leaf(statusKey),
      workload_id: workload, ttl_ms: 30_000, maximum_contexts: 4, maximum_requests_per_context: 4 },
    assertion_transport: { tls: await tls(), peer: { certificate_sha256: `sha256:${"a".repeat(64)}`, dns_name: "edge.research.test", workload_id: workload },
      limits: { maximum_in_flight: 2, request_bytes: 32_768, response_bytes: 32_768, deadline_ms: 1000 } },
    current_human_transport: { tls: await tls(), source_certificate_sha256: `sha256:${"b".repeat(64)}`,
      limits: { maximum_in_flight: 2, request_bytes: 32_768, deadline_ms: 1000 } },
    recovery: { origin: "https://10.70.0.2:29462", tls: await tls(), source_certificate_sha256: `sha256:${"b".repeat(64)}`,
      deadline_ms: 5000, response_bytes: 32_768 },
    gateway_binding: { selection: { gateway_ref: gateway, qualification: "OWNER_VERIFIED", operations: ["TOP_UP"], recovery: "UNCOMMISSIONED" },
      scope: { workspace_id: workspace, environment: "paper", authority_ref: "TEST_ONLY-pm", profile_ref: "TEST_ONLY-paper" },
      edge_contract: { reference: "TEST_ONLY-contract", sha256: "c".repeat(64), edge_source_revision: "TEST_ONLY-source" },
      requester_status: "FRESH_CURRENT_HUMAN" },
    edge_transport: { mode: "EXPLICIT_CURRENT_REQUESTER_STATUS_ONLY", origin: "https://10.70.0.2:29463", gateway_ref: gateway, tls: await tls(),
      peer: { certificate_sha256: `sha256:${"d".repeat(64)}`, dns_name: "edge.research.test" },
      limits: { maximum_in_flight: 2, deadline_ms: 1000, request_bytes: 32_768, response_bytes: 65_536, maximum_originals: 4 } },
    shutdown_deadline_ms: 5000 };
  return { root, value, leaf, manifest: (input: unknown = value) => leaf(JSON.stringify(input)) };
}
async function refused(input: CommandStatusRuntimeReference) {
  const result = await prepareCommandStatusRuntime(input).catch(error => error);
  expect(result).toBeInstanceOf(CommandStatusRuntimeError);
  expect(result).toMatchObject({ code: "COMMAND_STATUS_RUNTIME_CONFIG_INVALID", message: "The private command STATUS runtime configuration is not available." });
  expect(result.message).not.toContain(input.path); expect(result.message).not.toContain("PRIVATE KEY");
}

describe("private Research command STATUS runtime", () => {
  it("is OFF without both exact env values and performs no file read", () => {
    const read = vi.spyOn(nativeRuntime, "readNativeRuntimeReference");
    expect(commandStatusRuntimeReference({})).toBeUndefined(); expect(read).not.toHaveBeenCalled();
    const path = "/private/TEST_ONLY/status", sha256 = "a".repeat(64);
    expect(commandStatusRuntimeReference({ CONTROL_API_COMMAND_STATUS_CONFIG_FILE: path, CONTROL_API_COMMAND_STATUS_CONFIG_SHA256: sha256 })).toEqual({ path, sha256 });
    for (const env of [{ CONTROL_API_COMMAND_STATUS_CONFIG_FILE: path }, { CONTROL_API_COMMAND_STATUS_CONFIG_SHA256: sha256 },
      { CONTROL_API_COMMAND_STATUS_CONFIG_FILE: "", CONTROL_API_COMMAND_STATUS_CONFIG_SHA256: sha256 },
      { CONTROL_API_COMMAND_STATUS_CONFIG_FILE: path, CONTROL_API_COMMAND_STATUS_CONFIG_SHA256: `${sha256}\n` },
      { CONTROL_API_COMMAND_STATUS_CONFIG_FILE: path, CONTROL_API_COMMAND_STATUS_CONFIG_SHA256: `${sha256}\r\n` },
      { CONTROL_API_COMMAND_STATUS_CONFIG_FILE: "/private/../status", CONTROL_API_COMMAND_STATUS_CONFIG_SHA256: sha256 }])
      expect(() => commandStatusRuntimeReference(env)).toThrow(CommandStatusRuntimeError);
    expect(read).not.toHaveBeenCalled();
  });
  it("loads genuine separate status/HUMAN keys and four independent TLS outputs, without original or runtime authority", async () => {
    const f = await fixture(), result = await prepareCommandStatusRuntime(await f.manifest());
    expect(result.poolProfile).toEqual(f.value.pool_profile); expect(result.listeners).toEqual(f.value.listeners);
    expect(result.config.authority.key).toMatchObject({ type: "private", asymmetricKeyType: "ed25519" });
    expect(result.config.candidate.private_key).not.toBe(result.config.authority.key);
    expect(result.config.candidate.source.public_key).toMatchObject({ type: "public", asymmetricKeyType: "ed25519" });
    expect(result.config.gateway_binding.selection.recovery).toBe("UNCOMMISSIONED");
    expect(result.config.edge_transport.mode).toBe("EXPLICIT_CURRENT_REQUESTER_STATUS_ONLY");
    expect(result.recovery.tls.key).not.toBe(result.config.edge_transport.tls.key);
    expect(result.config.assertion_transport.tls.key).not.toBe(result.config.current_human_transport.tls.key);
    expect(result).not.toHaveProperty("actor"); expect(result).not.toHaveProperty("original_context");
    expect(result.config.authority).not.toHaveProperty("private_key_ref");
  });
  it("wipes all pinned input bytes and copies successful TLS outputs; failure wipes inputs too", async () => {
    const f = await fixture(), actual = nativeRuntime.readNativeRuntimeReference, observed: Buffer[] = [];
    vi.spyOn(nativeRuntime, "readNativeRuntimeReference").mockImplementation(async (...args) => { const bytes = await actual(...args); observed.push(bytes); return bytes; });
    const result = await prepareCommandStatusRuntime(await f.manifest());
    expect(observed).toHaveLength(16); expect(observed.every(bytes => bytes.every(byte => byte === 0))).toBe(true);
    expect(result.config.edge_transport.tls.key).toEqual(serverKey);
    observed.length = 0; f.value.edge_transport.tls.key_ref = await f.leaf("TEST_ONLY-malformed");
    await refused(await f.manifest()); expect(observed.every(bytes => bytes.every(byte => byte === 0))).toBe(true);
  });
  it("requires exact owner/hash/private mode/no-follow/size and permits explicit read-only mode", async () => {
    const f = await fixture(), ref = await f.manifest();
    await refused({ ...ref, sha256: "f".repeat(64) }); await chmod(ref.path, 0o644); await refused(ref); await chmod(ref.path, 0o400);
    await prepareCommandStatusRuntime(ref);
    const alias = join(f.root, "alias"); await symlink(ref.path, alias); await refused({ ...ref, path: alias });
    await refused({ ...ref, path: f.root }); await refused(await f.leaf(" ".repeat(65_537)));
    vi.spyOn(process, "geteuid").mockReturnValue(process.geteuid!() + 1); await refused(ref);
  });
  it("rejects malformed/duplicate/unknown/noncompact JSON without public detail", async () => {
    const f = await fixture(), raw = JSON.stringify(f.value);
    for (const bytes of [Buffer.from([0xff]), `${raw}\n`, JSON.stringify(f.value, null, 2),
      raw.replace('"schema_version":', '"schema_version":"wrong","schema_version":')]) await refused(await f.leaf(bytes));
    await refused(await f.manifest({ ...f.value, actor: { user_id: "TEST_ONLY-invented" } }));
  });
  it("refuses broader/cross-workspace/workload/gateway/current-requester selections", async () => {
    const f = await fixture();
    const variants = [{ ...f.value, target: { kind: "STABLE", environment: "paper" } },
      { ...f.value, gateway_binding: { ...f.value.gateway_binding, scope: { ...f.value.gateway_binding.scope, workspace_id: "other" } } },
      { ...f.value, candidate: { ...f.value.candidate, installation_scope: { ...f.value.candidate.installation_scope, workspace_id: "other" } } },
      { ...f.value, authority: { ...f.value.authority, workload_id: "other" } },
      { ...f.value, authority: { ...f.value.authority, audience: "other" } },
      { ...f.value, edge_transport: { ...f.value.edge_transport, gateway_ref: "other" } },
      { ...f.value, gateway_binding: { ...f.value.gateway_binding, requester_status: "UNCOMMISSIONED" } },
      { ...f.value, gateway_binding: { ...f.value.gateway_binding, selection: { ...f.value.gateway_binding.selection, qualification: "TEST_ONLY" } } },
      { ...f.value, gateway_binding: { ...f.value.gateway_binding, edge_contract: null } }];
    for (const value of variants) await refused(await f.manifest(value));
  });
  it("pins the sole protected Research owner rather than accepting an extra or foreign principal", async () => {
    const f = await fixture(), target = f.value.schema_target;
    for (const pins of [[], [{ user_id: "TEST_ONLY-other", workspace_id: target.workspace_id }],
      [target.principal_workspace_pins[0]!, { user_id: "TEST_ONLY-other", workspace_id: target.workspace_id }]]) {
      await refused(await f.manifest({ ...f.value, schema_target: { ...target, principal_workspace_pins: pins } }));
    }
  });
  it("enforces private origins/listeners, explicit finite bounds and no submit mode", async () => {
    const f = await fixture();
    for (const value of [{ ...f.value, listeners: { ...f.value.listeners, assertion: { host: "0.0.0.0", port: 29460 } } },
      { ...f.value, listeners: { assertion: f.value.listeners.reverse, reverse: f.value.listeners.reverse } },
      { ...f.value, authority: { ...f.value.authority, ttl_ms: 30_001 } },
      { ...f.value, pool_profile: { ...f.value.pool_profile, max: 11 } },
      { ...f.value, edge_transport: { ...f.value.edge_transport, mode: "SUBMIT" } },
      { ...f.value, edge_transport: { ...f.value.edge_transport, limits: { ...f.value.edge_transport.limits, maximum_originals: 129 } } },
      { ...f.value, recovery: undefined }]) await refused(await f.manifest(value));
    for (const origin of ["http://127.0.0.1:29463", "https://8.8.8.8", "https://10.70.0.2/path", "https://user@10.70.0.2"])
      await refused(await f.manifest({ ...f.value, edge_transport: { ...f.value.edge_transport, origin } }));
  });
  it("refuses non-Ed25519 keys, same-purpose key aliasing and private source material", async () => {
    const f = await fixture();
    f.value.authority.private_key_ref = await f.leaf(serverKey); await refused(await f.manifest());
    f.value.authority.private_key_ref = f.value.candidate.private_key_ref; await refused(await f.manifest());
    f.value.authority.private_key_ref = await f.leaf(statusKey); f.value.candidate.source.public_key_ref = await f.leaf(humanPublic); await refused(await f.manifest());
    f.value.candidate.source.public_key_ref = await f.leaf(humanKey); await refused(await f.manifest());
  });
  it("validates real TLS key/chain/SAN/expiry on inbound and outbound roles", async () => {
    const f = await fixture(), original = structuredClone(f.value.edge_transport.tls);
    for (const tls of [{ ...original, server_name: "wrong.research.test" }, { ...original, key_ref: await f.leaf(statusKey) },
      { ...original, ca_ref: await f.leaf(serverCert) }]) {
      f.value.edge_transport.tls = tls; await refused(await f.manifest());
    }
    f.value.edge_transport.tls = original;
    const ref = await f.manifest(); vi.spyOn(Date, "now").mockReturnValue(Date.now() + 2 * 86_400_000); await refused(ref);
  });
  it("retains expired installation for original recovery only, without inferring a current grant", async () => {
    const f = await fixture(); f.value.candidate.installation_scope.valid_until_ms = 1;
    const result = await prepareCommandStatusRuntime(await f.manifest());
    expect(result.config.candidate.installation_scope!.valid_until_ms).toBe(1);
  });
});
