/** Read-only identity mapping probe (C04). TEST_ONLY: a fake client replaces the network; no file, key or DB. */
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { IDENTITY_MAPPING_PROBE_CONFIG_SCHEMA, IDENTITY_MAPPING_PROBE_RESULT_SCHEMA, IdentityMappingProbeError,
  runIdentityMappingProbe } from "../src/execution-v2/identity-mapping-probe";

const ref = (n: string) => ({ path: `/TEST_ONLY/${n}`, sha256: createHash("sha256").update(n).digest("hex") });
const base = () => ({ schema_version: IDENTITY_MAPPING_PROBE_CONFIG_SCHEMA, origin: "https://10.0.0.1:1",
  tls: { ca_ref: ref("ca"), cert_ref: ref("cert"), key_ref: ref("key") }, source_certificate_sha256: `sha256:${"a".repeat(64)}`,
  human_issuer: "TEST_ONLY-issuer", subject: "usr_TESTONLY0001", workspace_id: "ws_TESTONLY0001", environment: "paper",
  workload_id: "TEST_ONLY-workload", deadline_ms: 5000, response_bytes: 8192, max_inflight: 1,
  installation_expires_at_utc_ms: Date.now() + 3_600_000 }) as Record<string, unknown>;
const bytes = (c: Record<string, unknown>) => Buffer.from(JSON.stringify(c), "utf8");
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const buffers: Buffer[] = [];
const readReference = async () => { const b = Buffer.from("TEST_ONLY-bytes"); buffers.push(b); return b; };
const code = async (run: () => Promise<unknown>) => { try { await run(); } catch (e) { return e instanceof IdentityMappingProbeError ? e.code : "OTHER"; } return "NO_ERROR"; };
const found = { ts_user_id: "00000000-0000-4000-8000-0000000000aa", revision: "ts-user:00000000-0000-4000-8000-0000000000aa:1" };

describe("identity mapping probe", () => {
  it("returns FOUND through the SDK's verifiedHumanMapping call and echoes only a public tuple", async () => {
    const lookup = vi.fn(async () => found), b = bytes(base());
    const result = await runIdentityMappingProbe(b, sha(b), { readReference, makeClient: () => ({ lookup }) });
    expect(lookup).toHaveBeenCalledWith("usr_TESTONLY0001", "ws_TESTONLY0001");
    expect(result).toEqual({ schema_version: IDENTITY_MAPPING_PROBE_RESULT_SCHEMA, status: "FOUND", subject: "usr_TESTONLY0001",
      workspace_id: "ws_TESTONLY0001", ts_user_id: found.ts_user_id, revision: found.revision, config_sha256: sha(b) });
  });
  it("returns NOT_FOUND without inventing a mapping", async () => {
    const b = bytes(base());
    const result = await runIdentityMappingProbe(b, sha(b), { readReference, makeClient: () => ({ lookup: async () => null }) });
    expect(result.status).toBe("NOT_FOUND");
    expect(result).not.toHaveProperty("ts_user_id");
  });
  it("wipes the loaded TLS bytes after the lookup, success or failure", async () => {
    buffers.length = 0;
    const b = bytes(base());
    await runIdentityMappingProbe(b, sha(b), { readReference, makeClient: () => ({ lookup: async () => found }) });
    await code(() => runIdentityMappingProbe(b, sha(b), { readReference, makeClient: () => ({ lookup: async () => { throw new Error("SECRET-DETAIL"); } }) }));
    expect(buffers.length).toBe(6);
    for (const x of buffers) expect([...x].every(v => v === 0)).toBe(true);
  });
  it("refuses a hash mismatch, a non-compact spelling, an unknown field, an expired installation and loose bounds", async () => {
    const b = bytes(base());
    expect(await code(() => runIdentityMappingProbe(b, "0".repeat(64), { readReference }))).toBe("PROBE_CONFIG_REFUSED");
    const spaced = Buffer.from(JSON.stringify(base(), null, 1));
    expect(await code(() => runIdentityMappingProbe(spaced, sha(spaced), { readReference }))).toBe("PROBE_CONFIG_REFUSED");
    for (const patch of [{ extra: 1 }, { installation_expires_at_utc_ms: Date.now() - 1 }, { max_inflight: 2 }, { deadline_ms: 5001 },
      { response_bytes: 8193 }, { origin: "http://10.0.0.1:1" }, { environment: "canary" }]) {
      const c = bytes({ ...base(), ...patch });
      expect(await code(() => runIdentityMappingProbe(c, sha(c), { readReference })), JSON.stringify(patch)).toBe("PROBE_CONFIG_REFUSED");
    }
  });
  it("maps a refused reference or a failed lookup to one fixed code and never echoes the detail", async () => {
    const b = bytes(base());
    const refused = async () => { throw new Error("PATH-DETAIL"); };
    expect(await code(() => runIdentityMappingProbe(b, sha(b), { readReference: refused as never }))).toBe("PROBE_REFERENCE_REFUSED");
    try { await runIdentityMappingProbe(b, sha(b), { readReference, makeClient: () => ({ lookup: async () => { throw new Error("SECRET-DETAIL"); } }) }); }
    catch (e) { expect(String(e)).not.toContain("SECRET-DETAIL"); expect((e as IdentityMappingProbeError).code).toBe("PROBE_MAPPING_UNAVAILABLE"); }
  });
});
