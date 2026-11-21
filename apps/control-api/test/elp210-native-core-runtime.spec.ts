/** TEST_ONLY; see C7 execution receipt. Mock filesystem/composition, real SHA/jose/source
 * constructors. Does NOT qualify an actual installed factory, DB or provider. */
import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { createHash } from "node:crypto";
import { generateKeyPair, exportPKCS8 } from "jose";
import type { Pool } from "pg";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { nativeCoreRuntimeReference, prepareNativeCoreRuntime } from "../src/execution-v2/native-core-runtime";
import { composeNativeCore } from "../src/execution-v2/native-core-composition";
import { unqualifiedAccessTrust } from "../src/execution-v2/access-trust";
import type {NativeRootReceiptProvider} from "../src/execution-v2/native-root-provider";
vi.mock("node:fs/promises", async original => ({ ...await original<typeof import("node:fs/promises")>(), lstat: vi.fn(), open: vi.fn() }));
vi.mock("../src/execution-v2/native-core-composition", () => ({ composeNativeCore: vi.fn() }));
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex"), raw = (c: string) => c.repeat(64);
type File = { bytes: Buffer; uid: number; mode: number; ino: number; link?: boolean; size?: number; replaced?: boolean };
const files = new Map<string, File>(), opened: string[] = [];
let edPem: string, ecPem: string, serial = 0;
const uid = () => process.geteuid?.() ?? -1;
const stat = (f: File) => ({ uid: f.uid, mode: f.mode, ino: f.ino, dev: 1, size: f.size ?? f.bytes.length,
  isFile: () => true, isSymbolicLink: () => Boolean(f.link) });
function register(path: string, value: string | Buffer) {
  const bytes = Buffer.isBuffer(value) ? Buffer.from(value) : Buffer.from(value, "utf8");
  files.set(path, { bytes, uid: uid(), mode: 0o100400, ino: ++serial }); return { path, sha256: sha(bytes) };
}
function fixture() {
  files.clear(); opened.length = 0;
  const keyRef = register("/TEST_ONLY/native-runtime/human.key", edPem), terminalRef = register("/TEST_ONLY/native-runtime/terminal.key", edPem),
    caRef = register("/TEST_ONLY/native-runtime/ca.crt", "TEST_ONLY-CA-NO-SOCKET"),
    certRef = register("/TEST_ONLY/native-runtime/client.crt", "TEST_ONLY-CERT-NO-SOCKET"),
    tlsKeyRef = register("/TEST_ONLY/native-runtime/client.key", "TEST_ONLY-CLIENT-KEY-NO-SOCKET");
  const now = Date.now(), until = now + 60_000, person = "TEST_ONLY-bobby", workspace = "TEST_ONLY-workspace",
    workload = "TEST_ONLY-native-pm", issuer = "TEST_ONLY-core-human";
  const domain = { profile_id: "TEST_ONLY-profile", catalogue_sha256: raw("a"), profile_sha256: raw("b"), field_policy_sha256: raw("c") };
  const selected = { transport: { origin: "https://10.70.0.2:28445", tls: { ca_ref: caRef, cert_ref: certRef, key_ref: tlsKeyRef },
    pm_leaf_sha256: "sha256:" + raw("f"), workload_id: workload, deadline_ms: 1000, request_bytes: 32768, response_bytes: 32768, max_inflight: 2 },
    pins: { binding: { human_issuer: issuer, subject: person, workspace_id: workspace, environment: "paper", workload_id: workload }, domain,
      human: { issuer, subject: person, portal_user_id: person, ts_user_id: "33333333-3333-3333-3333-333333333333",
        mapping_revision: "ts-user:33333333-3333-3333-3333-333333333333:1" },
      native: { revision: "1", receipt_id: "44444444-4444-4444-4444-444444444444", receipt_digest: "sha256:" + raw("1"),
        document_digest: "sha256:" + raw("2"), policy_revision: "1", owner_mapping_revision: "ts-user:33333333-3333-3333-3333-333333333333:1",
        semantic_revision: "sha256:" + raw("3"), effective_from: new Date(now - 1000).toISOString(), expires_at: new Date(until).toISOString() },
      source_fingerprint: raw("e") }, installation_expires_at_utc_ms: until };
  const value = { schema_version: "portal.native-core-runtime.v1", pool_profile: { max: 4, connectionTimeoutMillis: 2000,
    statement_timeout: 3000, query_timeout: 6000, idle_in_transaction_session_timeout: 3000 },
    composition: { expected_workload_id: workload, selections: [{ selector: { portal_user_id: person, human_issuer: issuer,
      subject: person, workspace_id: workspace, environment: "paper", domain }, config: { issuer, audience: "TEST_ONLY-pm-human", key_id: "TEST_ONLY-human-key",
      private_key_ref: keyRef, selected_source: selected, limits: { ttl_ms: 10000, maximum_unresolved: 4, maximum_retained: 32 },
      installation_scope: { workspace_id: workspace, environment: "paper", valid_until_ms: until },
      terminal: { issuer: "TEST_ONLY-terminal", audience: "TEST_ONLY-pm-terminal", key_id: "TEST_ONLY-terminal-key", private_key_ref: terminalRef, ttl_seconds: 30 },
      egress: { maximum_response_bytes: 1048576, maximum_inflight: 2, send_timeout_ms: 1000, quiesce_timeout_ms: 1000 } } }],
      retained_recovery: [], owner_intakes: [{ artifact_path: "/root/TEST_ONLY-OFFLINE-owner-artifact.json", approved_sha256: raw("8"),
        target: { database_name: "TEST_ONLY-control", database_system_identifier: "7675333655652302882", role_name: "TEST_ONLY-runtime-role",
          protected_owner_user_id: person, workspace_id: workspace, principal_workspace_pins: [{ user_id: person, workspace_id: workspace }] },
        intake_not_before_ms: now - 1000, intake_not_after_ms: until }], mutation_limits: { maximum_intents: 64, maximum_recoveries_per_request: 8 } } };
  return { value, pin: () => register("/TEST_ONLY/native-runtime/config.json", JSON.stringify(value)), keyRef, terminalRef, caRef, certRef, tlsKeyRef };
}
beforeAll(async () => {
  edPem = await exportPKCS8((await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true })).privateKey);
  ecPem = await exportPKCS8((await generateKeyPair("ES256", { extractable: true })).privateKey);
});
beforeEach(() => {
  files.clear(); opened.length = 0; vi.clearAllMocks();
  vi.mocked(lstat).mockImplementation((async (path: unknown) => {
    const f = files.get(String(path)); if (!f) throw Error("TEST_ONLY-unmounted-file"); return stat(f);
  }) as any);
  vi.mocked(open).mockImplementation((async (path: unknown, flags: unknown) => {
    const name = String(path), f = files.get(name); if (!f) throw Error("TEST_ONLY-unmounted-file");
    expect(flags).toBe(constants.O_RDONLY | constants.O_NOFOLLOW); opened.push(name); if (f.replaced) f.ino++;
    let offset = 0;
    return { stat: async () => stat(f), close: vi.fn(async () => undefined),
      read: async (buffer: Buffer, start: number, length: number, _position: null) => {
        const count = Math.min(length, f.bytes.length - offset);
        if (count > 0) f.bytes.copy(buffer, start, offset, offset + count); offset += count; return { bytesRead: count, buffer };
      } };
  }) as any);
  vi.mocked(composeNativeCore).mockResolvedValue({ dependencies: { executionAccessTrust: unqualifiedAccessTrust },
    selectedCandidate: vi.fn(), installOwnerPolicies: vi.fn() } as never);
});
function runtimePool() {
  const metadata = { database_name: "TEST_ONLY-control", role_name: "TEST_ONLY-runtime-role", session_role_name: "TEST_ONLY-runtime-role",
    database_system_identifier: "7675333655652302882" };
  const query = vi.fn().mockResolvedValue({ rowCount: 1, rows: [metadata] });
  const pool = { options: { connectionTimeoutMillis: 2000, query_timeout: 6000 }, query, connect: vi.fn() } as unknown as Pool;
  return { pool, query, metadata };
}
describe("TEST_ONLY native runtime private reference loader", () => {
  it("keeps no-config inert without files/composition", () => {
    expect(nativeCoreRuntimeReference({})).toBeUndefined(); expect(lstat).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled(); expect(composeNativeCore).not.toHaveBeenCalled();
  });
  it("refuses partial/empty/noncanonical env refs instead of selecting legacy", () => {
    for (const env of [{ CONTROL_API_NATIVE_CORE_CONFIG_FILE: "/TEST_ONLY/runtime.json" },
      { CONTROL_API_NATIVE_CORE_CONFIG_SHA256: raw("a") },
      { CONTROL_API_NATIVE_CORE_CONFIG_FILE: "", CONTROL_API_NATIVE_CORE_CONFIG_SHA256: raw("a") },
      { CONTROL_API_NATIVE_CORE_CONFIG_FILE: "relative.json", CONTROL_API_NATIVE_CORE_CONFIG_SHA256: raw("a") },
      { CONTROL_API_NATIVE_CORE_CONFIG_FILE: "/TEST_ONLY/../runtime.json", CONTROL_API_NATIVE_CORE_CONFIG_SHA256: raw("a") },
      { CONTROL_API_NATIVE_CORE_CONFIG_FILE: "/TEST_ONLY/runtime.json", CONTROL_API_NATIVE_CORE_CONFIG_SHA256: raw("a") + "\n" }])
      expect(() => nativeCoreRuntimeReference(env)).toThrow("The private native Core configuration is not available.");
    expect(open).not.toHaveBeenCalled();
  });
  it("pins manifest SHA before TLS/signing I/O", async () => {
    const f = fixture(), pin = f.pin();
    await expect(prepareNativeCoreRuntime({ ...pin, sha256: raw("0") })).rejects.toMatchObject({ code: "CURRENT_HUMAN_NATIVE_RUNTIME_CONFIG_INVALID" });
    expect(opened).toEqual([pin.path]); expect(composeNativeCore).not.toHaveBeenCalled();
  });
  it("refuses symlink, uid/mode mismatch, size cap and inode replacement", async () => {
    for (const axis of ["symlink", "uid", "mode", "oversized", "inode"] as const) {
      const f = fixture(), pin = f.pin(), file = files.get(pin.path)!;
      if (axis === "symlink") file.link = true; if (axis === "uid") file.uid = uid() + 1;
      if (axis === "mode") file.mode = 0o100640; if (axis === "oversized") file.size = 131073;
      if (axis === "inode") file.replaced = true;
      await expect(prepareNativeCoreRuntime(pin)).rejects.toMatchObject({ code: "CURRENT_HUMAN_NATIVE_RUNTIME_CONFIG_INVALID" });
    }
    expect(composeNativeCore).not.toHaveBeenCalled();
  });
  it("refuses unknown keys, inline secrets, duplicate JSON and noncanonical bytes even with matching hash", async () => {
    for (const change of [(v: any) => { v.extra = true; }, (v: any) => { v.composition.selections[0].config.private_key = "TEST_ONLY-inline"; }]) {
      const f = fixture(); change(f.value); await expect(prepareNativeCoreRuntime(f.pin())).rejects.toMatchObject({ code: "CURRENT_HUMAN_NATIVE_RUNTIME_CONFIG_INVALID" });
      expect(opened).toEqual(["/TEST_ONLY/native-runtime/config.json"]);
    }
    for (const axis of ["duplicate", "pretty", "invalid-utf8"]) {
      const f = fixture(), json = JSON.stringify(f.value), invalid = Buffer.from(json); invalid[json.indexOf("TEST_ONLY-OFFLINE")] = 0xff;
      const bytes = axis === "duplicate" ? Buffer.from(json.replace('{"schema_version":', '{"schema_version":"TEST_ONLY-ignored","schema_version":'))
        : axis === "pretty" ? Buffer.from(JSON.stringify(f.value, null, 2)) : invalid;
      await expect(prepareNativeCoreRuntime(register("/TEST_ONLY/native-runtime/config.json", bytes))).rejects.toMatchObject({ code: "CURRENT_HUMAN_NATIVE_RUNTIME_CONFIG_INVALID" });
    }
    expect(composeNativeCore).not.toHaveBeenCalled();
  });
  it("validates pool caps before source/key hydration", async () => {
    for (const change of [{ max: 11 }, { connectionTimeoutMillis: 0 }, { statement_timeout: 60001 }, { query_timeout: 3000 }]) {
      const f = fixture(); Object.assign(f.value.pool_profile, change);
      await expect(prepareNativeCoreRuntime(f.pin())).rejects.toMatchObject({ code: "CURRENT_HUMAN_NATIVE_RUNTIME_CONFIG_INVALID" });
      expect(opened).toEqual(["/TEST_ONLY/native-runtime/config.json"]);
    }
  });
  it("independently pins TLS/key bytes and sanitizes errors", async () => {
    for (const axis of ["ca", "human"]) {
      const f = fixture(), bad = axis === "ca" ? f.caRef : f.keyRef; files.get(bad.path)!.bytes = Buffer.from("TEST_ONLY-do-not-echo-secret");
      const error = await prepareNativeCoreRuntime(f.pin()).catch(e => e) as Error & { code: string };
      expect(error.code).toBe("CURRENT_HUMAN_NATIVE_RUNTIME_CONFIG_INVALID"); expect(error.message).not.toContain(bad.path); expect(error.message).not.toContain("do-not-echo");
    }
  });
  it("rejects non-Ed25519 private signing key", async () => {
    const f = fixture(); f.value.composition.selections[0]!.config.private_key_ref = register(f.keyRef.path, ecPem);
    await expect(prepareNativeCoreRuntime(f.pin())).rejects.toMatchObject({ code: "CURRENT_HUMAN_NATIVE_RUNTIME_CONFIG_INVALID" });
  });
  it("keeps existing issuer/workload/source-pin checks", async () => {
    for (const change of [(v: any) => { v.composition.selections[0].config.selected_source.pins.human.subject = "TEST_ONLY-other"; },
      (v: any) => { v.composition.selections[0].config.selected_source.transport.workload_id = "TEST_ONLY-other"; },
      (v: any) => { v.composition.selections[0].config.selected_source.pins.native.receipt_digest = "sha256:invalid"; }]) {
      const f = fixture(); change(f.value); await expect(prepareNativeCoreRuntime(f.pin())).rejects.toMatchObject({ code: "CURRENT_HUMAN_NATIVE_RUNTIME_CONFIG_INVALID" });
    }
  });
  it("requires exact actual database/system/current+session role and available introspection before mount", async () => {
    for (const axis of ["database_name", "database_system_identifier", "role_name", "session_role_name", "query"] as const) {
      const f = fixture(), prepared = await prepareNativeCoreRuntime(f.pin()), actual = runtimePool();
      if (axis === "query") actual.query.mockRejectedValueOnce(Error("TEST_ONLY-private-database-error")); else actual.metadata[axis] = "TEST_ONLY-wrong";
      await expect(prepared.compose(actual.pool)).rejects.toMatchObject({ code: "CURRENT_HUMAN_NATIVE_RUNTIME_CONFIG_INVALID" });
      expect(actual.query).toHaveBeenCalledOnce(); expect(actual.pool.connect).not.toHaveBeenCalled();
    }
  });
  it("uses SAME pool/composition deps and never reads/installs owner artifact", async () => {
    const f = fixture(), prepared = await prepareNativeCoreRuntime(f.pin()), actual = runtimePool();
    expect(Object.isFrozen(prepared.poolProfile)).toBe(true); expect(composeNativeCore).not.toHaveBeenCalled();
    const deps = await prepared.compose(actual.pool), composed = await vi.mocked(composeNativeCore).mock.results[0]!.value;
    expect(vi.mocked(composeNativeCore).mock.calls[0]![0]).toBe(actual.pool); expect(deps.nativeManagerRead).toBe(composed);
    expect(deps.executionAccessTrust).toBe(composed.dependencies.executionAccessTrust); expect(deps.currentHumanMutations).toBe(composed.dependencies.currentHumanMutations);
    expect(deps).not.toHaveProperty("nativeManagerRealtimeLimits");
    expect(deps).not.toHaveProperty("nativeManagerCacheObservation"); expect(composed.installOwnerPolicies).not.toHaveBeenCalled();
    expect(opened).not.toContain("/root/TEST_ONLY-OFFLINE-owner-artifact.json");
    expect(new Set(opened)).toEqual(new Set(["/TEST_ONLY/native-runtime/config.json", f.caRef.path, f.certRef.path, f.tlsKeyRef.path, f.keyRef.path, f.terminalRef.path]));
  });
  it("forwards ROOT separately and by exact identity into genuine composition, never as CURRENT or reverse participant",async()=>{
    const f=fixture(),prepared=await prepareNativeCoreRuntime(f.pin()),actual=runtimePool();
    const root={marker:"TEST_ONLY-forwarding-not-source-authority"} as unknown as NativeRootReceiptProvider;
    await prepared.compose(actual.pool,[],undefined,root);
    const call=vi.mocked(composeNativeCore).mock.calls[0]!;
    expect(call[0]).toBe(actual.pool);expect(call[3]).toEqual([]);expect(call[4]).toBeUndefined();expect(call[5]).toBe(root);
    expect(actual.pool.connect).not.toHaveBeenCalled();
  });
  it("captures explicit RT bounds but does not activate SSE or invoke policy installation", async () => {
    const f = fixture(), limits = { maximumClients: 2, maximumEntriesPerClient: 4, maximumFrameBytes: 32768, maximumClientBytes: 65536,
      maximumTotalBytes: 131072, maximumNoticesPerRead: 8, readTimeoutMs: 1000 };
    const prepared = await prepareNativeCoreRuntime(register("/TEST_ONLY/native-runtime/config.json", JSON.stringify({ ...f.value, realtime_limits: limits }))), actual = runtimePool();
    const deps = await prepared.compose(actual.pool); expect(deps.nativeManagerRealtimeLimits).toEqual(limits);
    expect(Object.isFrozen(deps.nativeManagerRealtimeLimits)).toBe(true); expect(deps.nativeManagerRead!.installOwnerPolicies).not.toHaveBeenCalled();
    // Finite-only C7 AppModule must reject supplied RT config explicitly;
    // this loader result is NOT proof of an accepted/mounted SSE configuration.
  });
  it("rejects partial/excessive/incoherent RT bounds before hydration", async () => {
    const valid = { maximumClients: 2, maximumEntriesPerClient: 4, maximumFrameBytes: 32768, maximumClientBytes: 65536,
      maximumTotalBytes: 131072, maximumNoticesPerRead: 8, readTimeoutMs: 1000 };
    for (const change of [{ maximumClients: 0 }, { maximumNoticesPerRead: 201 }, { maximumTotalBytes: 67108865 },
      { maximumClientBytes: 32767 }, { maximumTotalBytes: 65535 }, { extra: 1 }]) {
      const f = fixture(); await expect(prepareNativeCoreRuntime(register("/TEST_ONLY/native-runtime/config.json", JSON.stringify({ ...f.value, realtime_limits: { ...valid, ...change } }))))
        .rejects.toMatchObject({ code: "CURRENT_HUMAN_NATIVE_RUNTIME_CONFIG_INVALID" }); expect(opened).toEqual(["/TEST_ONLY/native-runtime/config.json"]);
    }
    const f = fixture(), { readTimeoutMs: _, ...partial } = valid;
    await expect(prepareNativeCoreRuntime(register("/TEST_ONLY/native-runtime/config.json", JSON.stringify({ ...f.value, realtime_limits: partial }))))
      .rejects.toMatchObject({ code: "CURRENT_HUMAN_NATIVE_RUNTIME_CONFIG_INVALID" });
  });
  it("rejects unsafe observation config and non-Research Paper composition before any key hydration",async()=>{
    const observation={schema_version:"portal.native-cache-observation-config.v1",directory:"/TEST_ONLY/observation"};
    const limits={maximumClients:2,maximumEntriesPerClient:4,maximumFrameBytes:32768,maximumClientBytes:65536,
      maximumTotalBytes:131072,maximumNoticesPerRead:8,readTimeoutMs:1000};
    for(const change of [
      {cache_observation:{...observation,directory:"relative"}},
      {cache_observation:{...observation,directory:"/TEST_ONLY/../observation"}},
      {cache_observation:{...observation,extra:true}},
      {cache_observation:{...observation,schema_version:"other"}},
      {cache_observation:observation}, // lacks realtime and single-Paper proof
      {cache_observation:observation,realtime_limits:limits}, // wrong profile
    ]){
      const f=fixture();await expect(prepareNativeCoreRuntime(register("/TEST_ONLY/native-runtime/config.json",JSON.stringify({...f.value,...change}))))
        .rejects.toMatchObject({code:"CURRENT_HUMAN_NATIVE_RUNTIME_CONFIG_INVALID"});
      expect(opened).toEqual(["/TEST_ONLY/native-runtime/config.json"]);
    }
  });
});
