import { createHash, randomUUID } from "node:crypto";
import { generateKeyPair, jwtVerify } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { accessDigest } from "../src/execution-v2/access-policy";
import { mintArchivedUnsentFrameTerminal, NativeArchiveTerminalError, ARCHIVE_TERMINAL_REASON } from "../src/execution-v2/native-archive-terminal";

// Offline: pure function, no database. Builds a synthetic frame base the same way the codec validates it.
const sha = (v: string) => createHash("sha256").update(v).digest("hex");
const canonical = (v: any): string => typeof v !== "object" || v === null ? JSON.stringify(v)
  : `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
const limits = { request_bytes: 32768, response_bytes: 32768 };
const hex = (c: string) => c.repeat(64);

function fixtureRow() {
  const lease_id = randomUUID(), attempt_id = randomUUID(), stream_id = randomUUID();
  const binding = { lease_id, attempt_id, human_issuer: "TEST_ONLY-issuer", subject: "usr_test", workspace_id: "ws_test",
    environment: "paper", workload_id: "TEST_ONLY-workload", operation: "READ" };
  const domain = { profile_id: "PAPER_BINANCE_USDM", catalogue_sha256: hex("a"), profile_sha256: hex("b"), field_policy_sha256: hex("c") };
  const deadline = "2026-11-14T11:18:03.000Z";
  const intent = { schema_version: "pma.manager-read-intent.v2", action: "scoped_notice", stream_id, frame_ordinal: "1",
    dataset_id: "TEST_ONLY-dataset", query_digest: hex("d"), field_set_digest: hex("e"), projection_generation: "gen-1",
    source_cursor_digest: hex("f"), frame_sha256: hex("1"), stream_scope_digest: hex("2") };
  const digest = sha(canonical({ binding, domain, deadline, manager_intent: intent }));
  const base = { schema_version: "pma.native-business-read.request.v1", binding: { ...binding, request_digest: digest }, domain,
    manager_intent: { ...intent, digest }, deadline };
  const base_body = canonical(base);
  const core = canonical({ schema_version: base.schema_version, binding: base.binding, domain, manager_intent: base.manager_intent, deadline });
  const frame_domain_scope_digest = "sha256:" + hex("3"), frame_notice_scope_digest = "sha256:" + hex("4");
  return {
    lease_id, attempt_id, workload_id: "TEST_ONLY-workload", base_body, stable_core_digest: sha(core),
    binding_digest: sha(canonical(base.binding)), frame_domain_scope_digest, frame_notice_scope_digest,
    scope_digest: accessDigest({ schema: "portal.native-frame-scope.v1", domain_scope_digest: frame_domain_scope_digest,
      notice_scope_digest: frame_notice_scope_digest }),
    sender_id: randomUUID(), lifecycle_kind: "MANAGER_SSE_FRAME", phase: "UNKNOWN", source_reconciled: false, no_send_fenced: true,
    source_ack_action: null, native_source_digest: hex("5"), enter_response_digest: null, body_digest: null,
    receipt_id: null, receipt_digest: null, terminal_reason: null,
  };
}
let keys: Awaited<ReturnType<typeof generateKeyPair>>;
beforeAll(async () => { keys = await generateKeyPair("EdDSA", { extractable: true }); });
const terminal = () => ({ issuer: "core-test", audience: "pm-test", key_id: "kid-1", private_key: keys.privateKey, ttl_seconds: 60 });
const run = (row: unknown, mint = true, expect?: { source_digest?: string; binding_digest?: string }) =>
  mintArchivedUnsentFrameTerminal({ row, terminal: terminal(), now_s: 1_800_000_000, mint, limits, expect });

describe("R1c-ARCHIVE: Core-signed ABORTED terminal for the one stuck frame row", () => {
  it("--check validates and signs nothing", async () => {
    const r = await run(fixtureRow(), false);
    expect(r.signed_terminal).toBeUndefined();
    expect(r.resolve_request).toBeUndefined();
    expect(r.status_request).toMatchObject({ schema_version: "pm.native-lease-recovery-request.v1", action: "status" });
    expect(r.checked.frame_ordinal).toBe("1");
  });
  it("mint: terminal verifies with the Core public key and carries exactly the original binding, ABORTED, 60 s", async () => {
    const row = fixtureRow(), r = await run(row);
    const { payload, protectedHeader } = await jwtVerify(r.signed_terminal!, keys.publicKey,
      { issuer: "core-test", audience: "pm-test", currentDate: new Date(1_800_000_010_000) });
    expect(protectedHeader).toMatchObject({ alg: "EdDSA", kid: "kid-1", typ: "JWT" });
    expect(payload).toMatchObject({ purpose: "pma.native-business-to-core-terminal.v1", workload_id: row.workload_id,
      lease_id: row.lease_id, attempt_id: row.attempt_id, binding_digest: row.binding_digest,
      source_digest: row.native_source_digest, operation: "READ", phase: "ABORTED",
      evidence_kind: "FINAL_SSE_FRAME_ABORT_CONFIRMED", iat: 1_800_000_000, nbf: 1_800_000_000, exp: 1_800_000_060 });
    expect(r.receipt_digest).toBe(accessDigest({ schema: "portal.native-read-terminal.v1", phase: "ABORTED",
      binding: JSON.parse(row.base_body).binding, source_digest: row.native_source_digest, scope_digest: row.scope_digest,
      body_digest: "sha256:" + hex("1"), sender_id: row.sender_id, reason: ARCHIVE_TERMINAL_REASON, receipt_id: r.receipt_id }));
    expect(payload.receipt_digest).toBe(r.receipt_digest!.slice(7));
    // jwtVerify rejects after exp: the terminal is short-lived by construction
    await expect(jwtVerify(r.signed_terminal!, keys.publicKey, { currentDate: new Date(1_800_000_061_000) })).rejects.toThrow();
  });
  it("request files follow the TS contract; the resolve body is the original base plus the terminal, nothing else", async () => {
    const row = fixtureRow(), r = await run(row);
    expect(r.resolve_request).toMatchObject({ schema_version: "pm.native-lease-recovery-request.v1", action: "resolve" });
    const body = r.resolve_request!.body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["binding", "deadline", "domain", "manager_intent", "schema_version", "signed_terminal"]);
    expect(body.signed_terminal).toBe(r.signed_terminal);
    const { signed_terminal: _t, ...rest } = body;
    expect(canonical(rest)).toBe(row.base_body);
    expect(canonical(r.status_request!.body)).toBe(row.base_body);
  });
  it("the status request is deterministic: identical for --check and --mint, so its hash can be approved before signing", async () => {
    const row = fixtureRow(), a = await run(row, false), b = await run(row, true);
    expect(JSON.stringify(a.status_request)).toBe(JSON.stringify(b.status_request));
  });
  it("expectations from TS are enforced", async () => {
    const row = fixtureRow();
    await expect(run(row, true, { source_digest: hex("9") })).rejects.toMatchObject({ code: "ARCHIVE_SOURCE_DIGEST_EXPECTATION_MISMATCH" });
    await expect(run(row, true, { binding_digest: hex("9") })).rejects.toMatchObject({ code: "ARCHIVE_BINDING_DIGEST_EXPECTATION_MISMATCH" });
    await expect(run(row, true, { source_digest: row.native_source_digest, binding_digest: row.binding_digest })).resolves.toBeDefined();
  });
  it.each([
    ["not UNKNOWN", { phase: "ADMITTED" }, "ARCHIVE_ROW_NOT_THE_STUCK_FRAME_ROW"],
    ["already reconciled", { source_reconciled: true }, "ARCHIVE_ROW_NOT_THE_STUCK_FRAME_ROW"],
    ["not fenced", { no_send_fenced: false }, "ARCHIVE_ROW_NOT_THE_STUCK_FRAME_ROW"],
    ["has an ENTER digest", { enter_response_digest: "sha256:" + hex("6") }, "ARCHIVE_ROW_NOT_THE_STUCK_FRAME_ROW"],
    ["has a body digest (may have been sent)", { body_digest: "sha256:" + hex("6") }, "ARCHIVE_ROW_NOT_THE_STUCK_FRAME_ROW"],
    ["already has a receipt", { receipt_id: randomUUID() }, "ARCHIVE_ROW_NOT_THE_STUCK_FRAME_ROW"],
    ["not a frame lease", { lifecycle_kind: "MANAGER_HTTP" }, "ARCHIVE_ROW_NOT_THE_STUCK_FRAME_ROW"],
    ["source never recorded", { native_source_digest: null }, "ARCHIVE_ROW_NOT_THE_STUCK_FRAME_ROW"],
    ["binding digest differs", { binding_digest: hex("7") }, "ARCHIVE_BASE_DIGEST_MISMATCH"],
    ["stable digest differs", { stable_core_digest: hex("7") }, "ARCHIVE_BASE_DIGEST_MISMATCH"],
    ["lease id differs from the base", { lease_id: randomUUID() }, "ARCHIVE_BINDING_MISMATCH"],
    ["workload differs from the base", { workload_id: "TEST_ONLY-other" }, "ARCHIVE_BINDING_MISMATCH"],
    ["scope digest differs", { scope_digest: "sha256:" + hex("8") }, "ARCHIVE_SCOPE_DIGEST_MISMATCH"],
  ])("refuses when the row is %s", async (_name, patch, code) => {
    await expect(run({ ...fixtureRow(), ...patch })).rejects.toMatchObject({ code });
    await expect(run({ ...fixtureRow(), ...patch })).rejects.toBeInstanceOf(NativeArchiveTerminalError);
  });
  it("refuses a tampered base body even when its digests are copied", async () => {
    const row = fixtureRow();
    await expect(run({ ...row, base_body: row.base_body.replace("TEST_ONLY-dataset", "TEST_ONLY-datasex") }))
      .rejects.toMatchObject({ code: expect.stringMatching(/^ARCHIVE_BASE_(DIGEST_MISMATCH|REJECTED_BY_CODEC)$/) });
  });
  it("refuses a v1 (finite) base", async () => {
    const row = fixtureRow(), base = JSON.parse(row.base_body);
    const intent = { schema_version: "pma.manager-read-intent.v1", action: "catalogue" };
    const { request_digest: _d, ...bind } = base.binding;
    const digest = sha(canonical({ binding: bind, domain: base.domain, deadline: base.deadline, manager_intent: intent }));
    const v1 = { ...base, binding: { ...base.binding, request_digest: digest }, manager_intent: { ...intent, digest } };
    const body = canonical(v1);
    await expect(run({ ...row, base_body: body, binding_digest: sha(canonical(v1.binding)),
      stable_core_digest: sha(canonical({ schema_version: v1.schema_version, binding: v1.binding, domain: v1.domain, manager_intent: v1.manager_intent, deadline: v1.deadline })) }))
      .rejects.toMatchObject({ code: "ARCHIVE_NOT_A_FRAME_LEASE" });
  });
  it("rejects a ttl above the 60 s source cap", async () => {
    await expect(mintArchivedUnsentFrameTerminal({ row: fixtureRow(), terminal: { ...terminal(), ttl_seconds: 61 }, now_s: 1_800_000_000,
      mint: true, limits })).rejects.toMatchObject({ code: "ARCHIVE_TERMINAL_TIME_INVALID" });
  });
});
