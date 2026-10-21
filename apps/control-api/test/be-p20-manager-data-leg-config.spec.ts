/** TEST_ONLY. BE-P20 offline Manager data-leg config validator: one positive pair and a negative
 * matrix with one row per rejection class. Every value is SYNTHETIC. Nothing opens a key, a
 * certificate or a referenced file; the CLI block proves it opens exactly the one file it is
 * given. */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MANAGER_DATA_LEG_BASE64_BLOB_BOUND, inspectManagerDataLegConfig, inspectManagerDataLegConfigBytes,
  type ManagerDataLegOptions,
} from "../src/execution-v2/manager-data-leg-config";
import { SYNTHETIC_NOW, SYNTHETIC_WORKSPACE, goodConfig, inactiveConfig, pad } from "./fixtures/manager-data-leg-config";

const opened: string[] = [];
vi.mock("node:fs", async original => {
  const real = await original<typeof import("node:fs")>();
  return { ...real, openSync: ((path: string, ...rest: unknown[]) => { opened.push(String(path)); return (real.openSync as any)(path, ...rest); }) as typeof real.openSync };
});

const OPTIONS: ManagerDataLegOptions = { expectedWorkspaceId: SYNTHETIC_WORKSPACE, nowMs: SYNTHETIC_NOW };
const codes = (v: unknown, o: Partial<ManagerDataLegOptions> = {}) =>
  inspectManagerDataLegConfig(v, { ...OPTIONS, ...o }).errors;
const edit = (fn: (c: any) => void, base: () => any = goodConfig) => { const c = base(); fn(c); return c; };
const FAKE_B64 = "A".repeat(MANAGER_DATA_LEG_BASE64_BLOB_BOUND + 8);

describe("TEST_ONLY BE-P20 manager data-leg config: positives", () => {
  it("accepts a coherent all-mode issued-leaf config (READ and STREAM separate, canary = live facts)", () => {
    const report = inspectManagerDataLegConfig(goodConfig(), OPTIONS);
    expect(report.errors).toEqual([]);
    expect(report).toMatchObject({ ok: true, summary: { modes: ["paper", "sandbox", "live"], stream_enabled_modes: ["paper", "sandbox", "live"], canary: "LIVE_FACTS", kids: 3, leaf: "ISSUED" } });
  });
  it("accepts the inactive preparation (CSR only, STREAM off) only when the leaf is allowed to be absent", () => {
    const report = inspectManagerDataLegConfig(inactiveConfig(), { ...OPTIONS, requireIssuedLeaf: false });
    expect(report).toMatchObject({ ok: true, warnings: [{ code: "ISSUED_LEAF_NOT_YET_RETURNED", path: "/public_inputs/client_leaf" }], summary: { leaf: "ABSENT", stream_enabled_modes: [] } });
    expect(codes(inactiveConfig())).toEqual([{ code: "ISSUED_LEAF_MISSING", path: "/public_inputs/client_leaf" }]);
  });
  it("is deterministic and never mutates its input", () => {
    const input = goodConfig(), before = JSON.stringify(input);
    expect(inspectManagerDataLegConfig(input, OPTIONS)).toEqual(inspectManagerDataLegConfig(input, OPTIONS));
    expect(JSON.stringify(input)).toBe(before);
  });
  it("accepts the exact bytes of the compact canonical form and pins them by sha256", () => {
    const bytes = Buffer.from(JSON.stringify(goodConfig()), "utf8");
    const report = inspectManagerDataLegConfigBytes(bytes, OPTIONS);
    expect(report.ok).toBe(true);
    expect(report.summary.input_sha256).toMatch(/^[a-f0-9]{64}$/);
  });
  it("honours reviewed kids and the caller's stable-hash denylist when they are clean", () => {
    const kids = ["research-synth-paper-0001", "research-synth-sandbox-0002", "research-synth-live-0003"];
    expect(codes(goodConfig(), { reviewedKids: kids, knownStableSha256: [pad("something-else")] })).toEqual([]);
  });
});

type Row = [name: string, mutate: (c: any) => void, code: string, path?: string, options?: Partial<ManagerDataLegOptions>];
const MATRIX: Row[] = [
  // stable-key reuse markers
  ["stable kid marker: runtime default kid", c => { c.modes.paper.kid = "execution-k1"; }, "STABLE_KEY_REUSE_MARKER", "/modes/paper/kid"],
  ["stable kid marker: the word stable", c => { c.modes.live.kid = "research-stable-live"; }, "STABLE_KEY_REUSE_MARKER", "/modes/live/kid"],
  ["stable file ref: signer path names a stable key", c => { c.file_refs.EXECUTION_EDGE_PRIVATE_KEY_FILE = "/run/secrets/research-native/edge-signing-stable.pem"; }, "STABLE_KEY_REUSE_MARKER", "/file_refs/EXECUTION_EDGE_PRIVATE_KEY_FILE"],
  ["native trust ref reused as the signer", c => { c.file_refs.EXECUTION_EDGE_PRIVATE_KEY_FILE = "/run/secrets/native-core/ed25519.pem"; }, "STABLE_KEY_REUSE_MARKER", "/file_refs/EXECUTION_EDGE_PRIVATE_KEY_FILE"],
  ["known stable public hash reused as signer key", c => { c.public_inputs.signer_public_key_sha256 = pad("stable-public"); }, "STABLE_KEY_REUSE_MARKER", "/public_inputs/signer_public_key_sha256", { knownStableSha256: [pad("stable-public")] }],
  ["known stable public hash reused as the leaf", c => { c.public_inputs.client_leaf.sha256 = pad("stable-leaf"); }, "STABLE_KEY_REUSE_MARKER", "/public_inputs/client_leaf/sha256", { knownStableSha256: [pad("stable-leaf")] }],
  ["signer and client key are the same key", c => { c.public_inputs.signer_public_key_sha256 = c.public_inputs.client_public_key_sha256; }, "SIGNER_AND_CLIENT_KEY_NOT_DISTINCT"],
  // CSR as leaf
  ["csr named as the client cert ref", c => { c.file_refs.EXECUTION_EDGE_CLIENT_CERT_FILE = "/run/secrets/research-native/edge-client.csr"; }, "CSR_PRESENTED_AS_LEAF", "/file_refs/EXECUTION_EDGE_CLIENT_CERT_FILE"],
  ["leaf kind is csr", c => { c.public_inputs.client_leaf.kind = "csr"; }, "CSR_PRESENTED_AS_LEAF", "/public_inputs/client_leaf/kind"],
  ["leaf kind is a certificate request", c => { c.public_inputs.client_leaf.kind = "certificate-request"; }, "CSR_PRESENTED_AS_LEAF", "/public_inputs/client_leaf/kind"],
  ["leaf hash equals the csr hash", c => { c.public_inputs.client_leaf.sha256 = c.public_inputs.client_csr_sha256; }, "CSR_PRESENTED_AS_LEAF", "/public_inputs/client_leaf/sha256"],
  ["leaf hash equals the public key hash", c => { c.public_inputs.client_leaf.sha256 = c.public_inputs.client_public_key_sha256; }, "PUBLIC_KEY_PRESENTED_AS_LEAF", "/public_inputs/client_leaf/sha256"],
  ["leaf hash equals the CA hash", c => { c.public_inputs.client_leaf.sha256 = c.public_inputs.ca_sha256; }, "LEAF_IS_CA_CERTIFICATE", "/public_inputs/client_leaf/sha256"],
  ["issued leaf absent when required", c => { delete c.public_inputs.client_leaf; }, "ISSUED_LEAF_MISSING", "/public_inputs/client_leaf"],
  // test CA
  ["test CA marker in the CA ref", c => { c.file_refs.EXECUTION_EDGE_CA_FILE = "/run/secrets/research-native/test-ca.pem"; }, "TEST_CA_MARKER", "/file_refs/EXECUTION_EDGE_CA_FILE"],
  ["test CA marker in the issuer ref", c => { c.public_inputs.client_leaf.issuer_ref = "synthetic-test-ca"; }, "TEST_CA_MARKER", "/public_inputs/client_leaf/issuer_ref"],
  ["self-signed marker in the issuer ref", c => { c.public_inputs.client_leaf.issuer_ref = "self-signed-root"; }, "TEST_CA_MARKER", "/public_inputs/client_leaf/issuer_ref"],
  // kid
  ["duplicate kid across modes", c => { c.modes.sandbox.kid = c.modes.paper.kid; }, "DUPLICATE_KID_ACROSS_MODES", "/modes/sandbox/kid"],
  ["kid not research scoped", c => { c.modes.paper.kid = "prod-kid-1"; }, "KID_NOT_RESEARCH_SCOPED", "/modes/paper/kid"],
  ["kid missing", c => { delete c.modes.live.kid; }, "KID_MISSING", "/modes/live/kid"],
  ["kid over the 32 character runtime bound", c => { c.modes.live.kid = "research-" + "k".repeat(30); }, "KID_NOT_RESEARCH_SCOPED", "/modes/live/kid"],
  ["kid outside the reviewed set", c => { c.modes.paper.kid = "research-unreviewed-01"; }, "KID_NOT_REVIEWED", "/modes/paper/kid", { reviewedKids: ["research-synth-sandbox-0002", "research-synth-live-0003"] }],
  // ttl
  ["ttl over 60 seconds", c => { c.modes.paper.ttl_seconds = 61; }, "TTL_OVER_60_SECONDS", "/modes/paper/ttl_seconds"],
  ["ttl far over 60 seconds", c => { c.modes.live.ttl_seconds = 3600; }, "TTL_OVER_60_SECONDS", "/modes/live/ttl_seconds"],
  ["ttl zero", c => { c.modes.sandbox.ttl_seconds = 0; }, "TTL_INVALID", "/modes/sandbox/ttl_seconds"],
  ["ttl fractional", c => { c.modes.sandbox.ttl_seconds = 45.5; }, "TTL_INVALID", "/modes/sandbox/ttl_seconds"],
  ["ttl as a string", c => { c.modes.sandbox.ttl_seconds = "45"; }, "TTL_INVALID", "/modes/sandbox/ttl_seconds"],
  ["ttl missing", c => { delete c.modes.paper.ttl_seconds; }, "TTL_INVALID", "/modes/paper/ttl_seconds"],
  // origin / port / mode
  ["paper carries the sandbox port", c => { c.modes.paper.origin = "https://10.70.0.2:8444"; }, "ORIGIN_PORT_MODE_MISMATCH", "/modes/paper/origin"],
  ["live carries the paper port", c => { c.modes.live.origin = "https://10.70.0.2:8443"; }, "ORIGIN_PORT_MODE_MISMATCH", "/modes/live/origin"],
  ["origin on the native 28446 port", c => { c.modes.paper.origin = "https://10.70.0.2:28446"; }, "ORIGIN_NOT_EXACT", "/modes/paper/origin"],
  ["origin over http", c => { c.modes.paper.origin = "http://10.70.0.2:8443"; }, "ORIGIN_NOT_EXACT", "/modes/paper/origin"],
  ["origin on another host", c => { c.modes.paper.origin = "https://10.70.0.3:8443"; }, "ORIGIN_NOT_EXACT", "/modes/paper/origin"],
  ["origin with a trailing slash", c => { c.modes.paper.origin = "https://10.70.0.2:8443/"; }, "ORIGIN_NOT_EXACT", "/modes/paper/origin"],
  ["origin missing", c => { delete c.modes.sandbox.origin; }, "ORIGIN_MISSING", "/modes/sandbox/origin"],
  ["profile id of another mode", c => { c.modes.paper.profile_id = "LIVE_BINANCE_USDM"; }, "PROFILE_ID_MODE_MISMATCH", "/modes/paper/profile_id"],
  ["profile id not the pinned one", c => { c.modes.sandbox.profile_id = "SANDBOX_OTHER"; }, "PROFILE_ID_MISMATCH", "/modes/sandbox/profile_id"],
  ["audience of another mode", c => { c.modes.live.audience = "portal-execution-edge-paper"; }, "AUDIENCE_MODE_MISMATCH", "/modes/live/audience"],
  ["audience not the pinned one", c => { c.modes.paper.audience = "portal-execution-edge"; }, "AUDIENCE_MISMATCH", "/modes/paper/audience"],
  ["issuer not portal-control-api", c => { c.delegation.issuer = "portal-other"; }, "ISSUER_MISMATCH", "/delegation/issuer"],
  ["delegation algorithm not RS256", c => { c.delegation.algorithm = "EdDSA"; }, "DELEGATION_ALGORITHM_MISMATCH", "/delegation/algorithm"],
  ["a mode is missing", c => { delete c.modes.sandbox; }, "MODE_MISSING", "/modes/sandbox"],
  // workspace
  ["top-level workspace differs", c => { c.workspace_id = "ws-someone-else"; }, "WORKSPACE_MISMATCH", "/workspace_id"],
  ["a mode workspace differs", c => { c.modes.live.workspace_id = "ws-someone-else"; }, "WORKSPACE_MISMATCH", "/modes/live/workspace_id"],
  ["a mode workspace is missing", c => { delete c.modes.paper.workspace_id; }, "WORKSPACE_MISMATCH", "/modes/paper/workspace_id"],
  ["workspace id with an unsafe character", c => { c.workspace_id = "ws bad/id"; }, "WORKSPACE_ID_INVALID", "/workspace_id"],
  // key material / secret names
  ["PEM header in a value", c => { c.public_inputs.client_leaf.issuer_ref = "-----BEGIN PRIVATE KEY-----"; }, "KEY_MATERIAL_PEM_HEADER", "/public_inputs/client_leaf/issuer_ref"],
  ["certificate PEM header in a value", c => { c.modes.paper.kid = "-----BEGIN CERTIFICATE-----"; }, "KEY_MATERIAL_PEM_HEADER", "/modes/paper/kid"],
  ["base64 blob over the bound", c => { c.public_inputs.client_leaf.issuer_ref = FAKE_B64; }, "KEY_MATERIAL_BASE64_BLOB", "/public_inputs/client_leaf/issuer_ref"],
  ["128 hex digits (not a sha256)", c => { c.public_inputs.ca_sha256 = "a".repeat(128); }, "KEY_MATERIAL_BASE64_BLOB", "/public_inputs/ca_sha256"],
  ["jwt-looking value", c => { c.modes.paper.audience = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ4In0.c2ln"; }, "TOKEN_LIKE_VALUE", "/modes/paper/audience"],
  ["value over the string bound", c => { c.modes.paper.audience = "x".repeat(600); }, "STRING_TOO_LONG", "/modes/paper/audience"],
  ["secret-looking key name: private_key", c => { c.delegation.private_key = "ref"; }, "SECRET_LOOKING_KEY_NAME", "/delegation/private_key"],
  ["secret-looking key name: client_secret", c => { c.modes.paper.client_secret = "ref"; }, "SECRET_LOOKING_KEY_NAME", "/modes/paper/client_secret"],
  ["secret-looking key name: password", c => { c.public_inputs.password = "ref"; }, "SECRET_LOOKING_KEY_NAME", "/public_inputs/password"],
  ["secret-looking key name: token", c => { c.modes.live.read.token = "ref"; }, "SECRET_LOOKING_KEY_NAME", "/modes/live/read/token"],
  ["secret-looking key name: JWK private member d", c => { c.public_inputs.client_leaf.d = "ref"; }, "SECRET_LOOKING_KEY_NAME", "/public_inputs/client_leaf/d"],
  ["secret-looking key name: pem", c => { c.public_inputs.client_pem = "ref"; }, "SECRET_LOOKING_KEY_NAME", "/public_inputs/client_pem"],
  ["non-JSON value type", c => { c.modes.paper.ttl_seconds = [1, { a: undefined, b: () => 1 }]; c.modes.paper.extra = 1n; }, "UNKNOWN_KEY", "/modes/paper/extra"],
  // READ never grants STREAM
  ["read says it grants stream", c => { c.modes.paper.read.grants_stream = true; }, "READ_GRANTS_STREAM", "/modes/paper/read/grants_stream"],
  ["read resource set carries the realtime resource", c => { c.modes.sandbox.read.resources.push("execution:manager-realtime"); }, "READ_GRANTS_STREAM", "/modes/sandbox/read/resources"],
  ["read resource set is not the exact read resource", c => { c.modes.live.read.resources = ["execution:command-center"]; }, "READ_RESOURCE_SET_INVALID", "/modes/live/read/resources"],
  ["read not enabled", c => { c.modes.live.read.enabled = false; }, "READ_NOT_ENABLED", "/modes/live/read/enabled"],
  ["stream enabled without its own grant", c => { delete c.modes.paper.stream.grant_ref_sha256; }, "STREAM_SEPARATE_GRANT_MISSING", "/modes/paper/stream/grant_ref_sha256"],
  ["stream grant equals the read grant", c => { c.modes.paper.stream.grant_ref_sha256 = c.modes.paper.read.grant_ref_sha256; }, "STREAM_GRANT_SAME_AS_READ", "/modes/paper/stream/grant_ref_sha256"],
  ["stream resource set is the read resource", c => { c.modes.live.stream.resources = ["execution:manager-v2:read"]; }, "STREAM_RESOURCE_SET_INVALID", "/modes/live/stream/resources"],
  ["stream disabled but carries resources", c => { c.modes.live.stream = { enabled: false, resources: ["execution:manager-realtime"] }; }, "STREAM_DISABLED_WITH_RESOURCES", "/modes/live/stream/resources"],
  ["stream disabled but carries a grant", c => { c.modes.live.stream = { enabled: false, resources: [], grant_ref_sha256: pad("x") }; }, "STREAM_DISABLED_WITH_GRANT", "/modes/live/stream/grant_ref_sha256"],
  ["stream block missing", c => { delete c.modes.sandbox.stream; }, "STREAM_MISSING", "/modes/sandbox/stream"],
  ["delegation scopes beyond execution.read", c => { c.delegation.scopes = ["execution.read", "execution.stream"]; }, "DELEGATION_SCOPES_NOT_READ_ONLY", "/delegation/scopes"],
  // command / live / legacy SSE disabled
  ["command relay enabled", c => { c.features.FEATURE_EXECUTION_COMMAND_RELAY = "true"; }, "FEATURE_MUST_BE_DISABLED", "/features/FEATURE_EXECUTION_COMMAND_RELAY"],
  ["legacy realtime SSE enabled", c => { c.features.FEATURE_EXECUTION_REALTIME_SSE = "true"; }, "FEATURE_MUST_BE_DISABLED", "/features/FEATURE_EXECUTION_REALTIME_SSE"],
  ["local R0 tasks enabled", c => { c.features.FEATURE_EXECUTION_LOCAL_R0_TASKS = "true"; }, "FEATURE_MUST_BE_DISABLED", "/features/FEATURE_EXECUTION_LOCAL_R0_TASKS"],
  ["a fourth (DNSE) current-source endpoint enabled", c => { c.features.FEATURE_EXECUTION_CURRENT_SOURCE_PAPER_DNSE = "true"; }, "FEATURE_MUST_BE_DISABLED", "/features/FEATURE_EXECUTION_CURRENT_SOURCE_PAPER_DNSE"],
  ["live current source not enabled", c => { c.features.FEATURE_EXECUTION_CURRENT_SOURCE_LIVE = "false"; }, "FEATURE_MUST_BE_ENABLED", "/features/FEATURE_EXECUTION_CURRENT_SOURCE_LIVE"],
  ["feature flag missing", c => { delete c.features.FEATURE_EXECUTION_COMMAND_RELAY; }, "FEATURE_MISSING", "/features/FEATURE_EXECUTION_COMMAND_RELAY"],
  ["feature flag not a string", c => { c.features.FEATURE_EXECUTION_COMMAND_RELAY = false; }, "FEATURE_MUST_BE_DISABLED", "/features/FEATURE_EXECUTION_COMMAND_RELAY"],
  ["command activation", c => { c.activation.command = true; }, "ACTIVATION_NOT_DISABLED", "/activation/command"],
  ["capital activation", c => { c.activation.capital = true; }, "ACTIVATION_NOT_DISABLED", "/activation/capital"],
  ["live trading activation", c => { c.activation.live_trading = true; }, "ACTIVATION_NOT_DISABLED", "/activation/live_trading"],
  // canary
  ["canary has its own origin", c => { c.canary.origin = "https://10.70.0.2:8446"; }, "CANARY_HAS_OWN_ENDPOINT_FIELD", "/canary/origin"],
  ["canary has its own profile", c => { c.canary.profile_id = "CANARY_BINANCE_USDM"; }, "CANARY_HAS_OWN_ENDPOINT_FIELD", "/canary/profile_id"],
  ["canary does not resolve as live", c => { c.canary.resolves_as = "paper"; }, "CANARY_NOT_RESOLVED_AS_LIVE", "/canary/resolves_as"],
  ["canary listed as a fourth mode", c => { c.modes.canary = { ...c.modes.live }; }, "CANARY_HAS_OWN_MODE_ENTRY", "/modes/canary"],
  ["canary missing", c => { delete c.canary; }, "CANARY_MISSING", "/canary"],
  ["a fourth unknown mode", c => { c.modes.staging = { ...c.modes.live }; }, "MODE_UNKNOWN", "/modes/staging"],
  // file reference contract
  ["a file reference is missing", c => { delete c.file_refs.EXECUTION_EDGE_CA_FILE; }, "FILE_REF_MISSING", "/file_refs/EXECUTION_EDGE_CA_FILE"],
  ["an extra file reference key", c => { c.file_refs.EXECUTION_EDGE_EXTRA_FILE = "/run/secrets/research-native/x.pem"; }, "UNKNOWN_KEY", "/file_refs/EXECUTION_EDGE_EXTRA_FILE"],
  ["signer ref outside the overlay directory", c => { c.file_refs.EXECUTION_EDGE_PRIVATE_KEY_FILE = "/run/secrets/other/edge-signing.pem"; }, "FILE_REF_PATH_MISMATCH", "/file_refs/EXECUTION_EDGE_PRIVATE_KEY_FILE"],
  ["client key ref points at the signer", c => { c.file_refs.EXECUTION_EDGE_CLIENT_KEY_FILE = c.file_refs.EXECUTION_EDGE_PRIVATE_KEY_FILE; }, "FILE_REF_DUPLICATE", "/file_refs/EXECUTION_EDGE_CLIENT_KEY_FILE"],
  ["a file reference is not a string", c => { c.file_refs.EXECUTION_EDGE_CA_FILE = 7; }, "FILE_REF_NOT_STRING", "/file_refs/EXECUTION_EDGE_CA_FILE"],
  ["path traversal in a reference", c => { c.file_refs.EXECUTION_EDGE_CA_FILE = "/run/secrets/research-native/../edge-ca.pem"; }, "FILE_REF_PATH_MISMATCH", "/file_refs/EXECUTION_EDGE_CA_FILE"],
  ["file refs block missing", c => { delete c.file_refs; }, "FILE_REFS_MISSING", "/file_refs"],
  // leaf descriptor
  ["leaf SAN differs", c => { c.public_inputs.client_leaf.san_uri = "spiffe://primusspark/portal/control-api/live"; }, "LEAF_SAN_MISMATCH", "/public_inputs/client_leaf/san_uri"],
  ["leaf EKU carries serverAuth", c => { c.public_inputs.client_leaf.eku = ["clientAuth", "serverAuth"]; }, "LEAF_EKU_NOT_CLIENT_AUTH_ONLY", "/public_inputs/client_leaf/eku"],
  ["leaf is a CA", c => { c.public_inputs.client_leaf.ca = true; }, "LEAF_IS_CA", "/public_inputs/client_leaf/ca"],
  ["leaf lacks digitalSignature", c => { c.public_inputs.client_leaf.key_usage = ["keyEncipherment"]; }, "LEAF_KEY_USAGE_INVALID", "/public_inputs/client_leaf/key_usage"],
  ["leaf key differs from the client key", c => { c.public_inputs.client_leaf.public_key_sha256 = pad("other-key"); }, "LEAF_KEY_NOT_CLIENT_KEY", "/public_inputs/client_leaf/public_key_sha256"],
  ["leaf expired at the caller clock", c => { c.public_inputs.client_leaf.not_after = "2026-10-21T11:00:00Z"; }, "LEAF_NOT_CURRENTLY_VALID", "/public_inputs/client_leaf/not_after"],
  ["leaf not yet valid at the caller clock", c => { c.public_inputs.client_leaf.not_before = "2026-10-22T00:00:00Z"; }, "LEAF_NOT_CURRENTLY_VALID", "/public_inputs/client_leaf/not_after"],
  ["leaf validity reversed", c => { c.public_inputs.client_leaf.not_after = "2026-10-20T00:00:00Z"; }, "LEAF_VALIDITY_INVALID", "/public_inputs/client_leaf/not_after"],
  ["leaf issuer ref missing", c => { delete c.public_inputs.client_leaf.issuer_ref; }, "LEAF_ISSUER_REF_INVALID", "/public_inputs/client_leaf/issuer_ref"],
  ["CA hash missing when a leaf is presented", c => { delete c.public_inputs.ca_sha256; }, "PUBLIC_HASH_MISSING", "/public_inputs/ca_sha256"],
  ["a public hash is not 64 hex", c => { c.public_inputs.signer_public_key_sha256 = "a8b44aad"; }, "PUBLIC_HASH_INVALID", "/public_inputs/signer_public_key_sha256"],
  ["schema version differs", c => { c.schema_version = "portal.manager-data-leg-config.v0"; }, "SCHEMA_VERSION_MISMATCH", "/schema_version"],
  ["unknown top-level key", c => { c.note = "x"; }, "UNKNOWN_KEY", "/note"],
];

describe("TEST_ONLY BE-P20 manager data-leg config: negative matrix", () => {
  it.each(MATRIX)("rejects: %s", (_name, mutate, code, path, options) => {
    const errors = codes(edit(mutate), options);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.map(e => e.code)).toContain(code);
    if (path !== undefined) expect(errors).toContainEqual({ code, path });
  });
  it("covers every rejection class the request lists", () => {
    const seen = new Set(MATRIX.map(r => r[2]));
    for (const code of ["STABLE_KEY_REUSE_MARKER", "CSR_PRESENTED_AS_LEAF", "TEST_CA_MARKER", "DUPLICATE_KID_ACROSS_MODES", "TTL_OVER_60_SECONDS",
      "ORIGIN_PORT_MODE_MISMATCH", "ORIGIN_NOT_EXACT", "PROFILE_ID_MISMATCH", "AUDIENCE_MISMATCH", "ISSUER_MISMATCH", "WORKSPACE_MISMATCH",
      "KEY_MATERIAL_PEM_HEADER", "KEY_MATERIAL_BASE64_BLOB", "SECRET_LOOKING_KEY_NAME", "READ_GRANTS_STREAM", "STREAM_GRANT_SAME_AS_READ",
      "FEATURE_MUST_BE_DISABLED", "ACTIVATION_NOT_DISABLED", "CANARY_HAS_OWN_ENDPOINT_FIELD", "CANARY_NOT_RESOLVED_AS_LIVE", "FILE_REF_PATH_MISMATCH"])
      expect(seen.has(code), code).toBe(true);
  });
  it("needs an explicit expected workspace; none means refusal, not a default", () => {
    expect(inspectManagerDataLegConfig(goodConfig(), { expectedWorkspaceId: "" }).errors.map(e => e.code)).toContain("WORKSPACE_EXPECTATION_INVALID");
  });
  it("refuses non-object, non-JSON, non-canonical and oversize input", () => {
    expect(codes(null).map(e => e.code)).toEqual(["CONFIG_NOT_OBJECT"]);
    expect(codes([]).map(e => e.code)).toEqual(["CONFIG_NOT_OBJECT"]);
    expect(inspectManagerDataLegConfigBytes(Buffer.from("{nope"), OPTIONS).errors).toEqual([{ code: "CONFIG_NOT_JSON", path: "" }]);
    expect(inspectManagerDataLegConfigBytes(Buffer.alloc(0), OPTIONS).errors).toEqual([{ code: "CONFIG_SIZE_INVALID", path: "" }]);
    expect(inspectManagerDataLegConfigBytes(Buffer.alloc(70_000, 32), OPTIONS).errors[0]).toEqual({ code: "CONFIG_SIZE_INVALID", path: "" });
    const pretty = Buffer.from(JSON.stringify(goodConfig(), null, 2), "utf8");
    expect(inspectManagerDataLegConfigBytes(pretty, OPTIONS).errors.map(e => e.code)).toEqual(["CONFIG_NOT_CANONICAL_COMPACT_JSON"]);
  });
  it("bounds depth and node count", () => {
    let deep: any = {}; const root = deep;
    for (let i = 0; i < 12; i++) { deep.n = {}; deep = deep.n; }
    expect(codes(edit(c => { c.public_inputs.deep = root; })).map(e => e.code)).toContain("CONFIG_TOO_DEEP");
    expect(codes(edit(c => { c.public_inputs.many = Array.from({ length: 2500 }, () => 1); })).map(e => e.code)).toContain("CONFIG_TOO_LARGE");
  });
  it("never echoes a rejected value in any finding or in the report", () => {
    const secrets = ["-----BEGIN PRIVATE KEY-----", FAKE_B64, "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ4In0.c2ln", "hunter2-super-secret-value"];
    const bad = edit(c => {
      c.public_inputs.client_leaf.issuer_ref = secrets[0]; c.modes.paper.audience = secrets[1]; c.modes.live.audience = secrets[2];
      c.modes.sandbox.client_secret = secrets[3]; c.workspace_id = secrets[3];
    });
    const text = JSON.stringify(inspectManagerDataLegConfig(bad, OPTIONS));
    for (const s of secrets) expect(text).not.toContain(s);
  });
});

describe("TEST_ONLY BE-P20 manager data-leg config: offline CLI", () => {
  let dir: string, out: string[], err: string[];
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "manager-data-leg-cli-")); out = []; err = []; opened.length = 0;
    vi.spyOn(process.stdout, "write").mockImplementation(((t: string) => { out.push(String(t)); return true; }) as never);
    vi.spyOn(process.stderr, "write").mockImplementation(((t: string) => { err.push(String(t)); return true; }) as never);
    vi.spyOn(process, "exit").mockImplementation((() => { throw new Error("EXIT"); }) as never);
  });
  afterEach(() => { vi.restoreAllMocks(); process.exitCode = undefined; rmSync(dir, { recursive: true, force: true }); });
  async function run(config: unknown, ...args: string[]): Promise<any> {
    const file = join(dir, "config.json");
    writeFileSync(file, JSON.stringify(config), { mode: 0o600 });
    vi.resetModules();
    const previous = process.argv;
    process.argv = ["node", "manager-data-leg-validate", "--config", file, ...args];
    try { await import("../src/cli/manager-data-leg-validate"); }
    finally { process.argv = previous; }
    return out.length ? JSON.parse(out.join("")) : undefined;
  }
  const GOOD = ["--workspace-id", SYNTHETIC_WORKSPACE, "--now", "2026-10-21T12:00:00Z"];

  it("passes a coherent config, opens only the config file and prints no reference path", async () => {
    const report = await run(goodConfig(), ...GOOD);
    expect(report).toMatchObject({ schema_version: "portal.manager-data-leg-config-report.v1", ok: true });
    expect(process.exitCode).toBe(0);
    expect(opened.filter(p => p.startsWith(dir))).toEqual([join(dir, "config.json")]);
    expect(opened.some(p => p.includes("/run/secrets"))).toBe(false);
    expect(out.join("")).not.toContain("/run/secrets");
  });
  it("exits 1 with stable codes on an error and honours --inactive-preparation", async () => {
    const report = await run(edit(c => { c.modes.paper.ttl_seconds = 61; }), ...GOOD);
    expect(process.exitCode).toBe(1);
    expect(report.errors).toContainEqual({ code: "TTL_OVER_60_SECONDS", path: "/modes/paper/ttl_seconds" });
    out.length = 0;
    await run(inactiveConfig(), ...GOOD);
    expect(process.exitCode).toBe(1);
    out.length = 0;
    const inactive = await run(inactiveConfig(), ...GOOD, "--inactive-preparation");
    expect(inactive.ok).toBe(true);
    expect(process.exitCode).toBe(0);
  });
  it("validates every option before opening the file", async () => {
    await run(goodConfig(), "--workspace-id", SYNTHETIC_WORKSPACE, "--now", "yesterday");
    expect(opened.filter(p => p.startsWith(dir))).toEqual([]);
    expect(process.exitCode).toBe(1);
    expect(err.join("")).toContain("MANAGER_DATA_LEG_VALIDATE_USAGE");
    await run(goodConfig(), "--workspace-id", SYNTHETIC_WORKSPACE, "--stable-sha256", "abc");
    expect(opened.filter(p => p.startsWith(dir))).toEqual([]);
    await run(goodConfig(), "--bogus", "x", "--workspace-id", SYNTHETIC_WORKSPACE);
    expect(opened.filter(p => p.startsWith(dir))).toEqual([]);
  });
});
