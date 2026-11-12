/** Offline unit tests for the connected-read-ready producer. Every value is TEST_ONLY
 * and none is a real grant, session, epoch, image or hash of a real file. */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CONNECTED_READ_MINIMUM_REMAINING_MS, ConnectedReadReadyError, connectedReadReadyBytes, isGlobalIp,
  validateConnectedReadReady,
} from "../src/execution-v2/connected-read-ready";

const NOW = Date.parse("2026-11-13T07:15:00Z");
const h = (c: string) => c.repeat(64);
const SESSION = h("5");
const iso = (ms: number) => new Date(ms).toISOString();
const base = () => ({
  schema_version: "portal.execution.connected-read-ready.v1", status: "INSTALLED", native_selection_verified: true,
  origin: "https://research-portal.primusspark.com", environment: "paper", workspace_id: "ws_TESTONLY0001",
  profile_id: "PAPER_BINANCE_USDM", projection_epoch: "epoch-TEST-ONLY-0001", acceptance_id: "acceptance-TEST-ONLY-0001",
  core_commit: "a".repeat(40), core_image: `sha256:${h("b")}`, core_config_sha256: h("c"), field_policy_sha256: h("d"),
  catalogue_sha256: h("e"), api_ip: "8.8.8.8", subject: "usr_TESTONLY0001", native_revision: 1,
  policy_revision: "policy-TEST-ONLY-1", manager_grant_id: "grant-TEST-ONLY-read", manager_grant_revision: "rev-TEST-ONLY-1",
  read_authorized: true, native_revoked: false, stream_authorized: false, session_sha256: SESSION,
  expires_at: iso(NOW + 3_600_000), trust_expires_at: iso(NOW + 3_600_000), native_expires_at: iso(NOW + 3_600_000),
}) as Record<string, unknown>;
const run = (doc: unknown, extra: Record<string, unknown> = {}) =>
  validateConnectedReadReady(doc, { nowMs: NOW, sessionFileSha256: SESSION, ...extra });
const codeOf = (fn: () => unknown) => { try { fn(); } catch (error) { return error instanceof ConnectedReadReadyError ? error.code : "OTHER"; } return "NO_ERROR"; };

describe("connected-read-ready producer", () => {
  it("accepts a READ-only document that does not authorize STREAM", () => {
    const d = run(base());
    expect(d.stream_authorized).toBe(false);
    expect(d.stream_grant_id).toBeUndefined();
  });

  it("is deterministic, key-sorted, compact, and its hash is the hash of its bytes", () => {
    const { bytes, sha256 } = connectedReadReadyBytes(run(base()));
    const text = bytes.toString("utf8");
    expect(text.includes("\n") || text.includes(" ")).toBe(false);
    const keys = Object.keys(JSON.parse(text));
    expect(keys).toEqual([...keys].sort());
    expect(sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(connectedReadReadyBytes(run(base())).sha256).toBe(sha256);
  });

  it("refuses the wrong origin, an unknown environment and an unknown extra field", () => {
    expect(codeOf(() => run({ ...base(), origin: "https://portal.primusspark.com" }))).toBe("READY_SHAPE_INVALID");
    expect(codeOf(() => run({ ...base(), environment: "canary" }))).toBe("READY_SHAPE_INVALID");
    expect(codeOf(() => run({ ...base(), session_token: "x" }))).toBe("READY_SHAPE_INVALID");
  });

  it("refuses malformed pins: short commit, unprefixed image, uppercase hash", () => {
    expect(codeOf(() => run({ ...base(), core_commit: "a".repeat(39) }))).toBe("READY_SHAPE_INVALID");
    expect(codeOf(() => run({ ...base(), core_image: h("b") }))).toBe("READY_SHAPE_INVALID");
    expect(codeOf(() => run({ ...base(), catalogue_sha256: h("e").toUpperCase() }))).toBe("READY_SHAPE_INVALID");
  });

  it("requires a current READ authority for the baseline stage and allows a revoked one for post-revoke", () => {
    expect(codeOf(() => run({ ...base(), read_authorized: false }))).toBe("READY_NOT_CURRENT");
    expect(codeOf(() => run({ ...base(), native_revoked: true }))).toBe("READY_NOT_CURRENT");
    expect(run({ ...base(), read_authorized: false, native_revoked: true }, { requireReadCurrent: false }).native_revoked).toBe(true);
  });

  it("READ never implies STREAM: stream grant fields need stream_authorized, and stream_authorized needs them", () => {
    expect(codeOf(() => run({ ...base(), stream_grant_id: "g2", stream_grant_revision: "r2" }))).toBe("READY_STREAM_FIELDS_INCONSISTENT");
    expect(codeOf(() => run({ ...base(), stream_authorized: true }))).toBe("READY_STREAM_FIELDS_INCONSISTENT");
    expect(codeOf(() => run({ ...base(), stream_authorized: true, stream_grant_id: "g2" }))).toBe("READY_STREAM_FIELDS_INCONSISTENT");
  });

  it("a STREAM grant must be distinct from the READ grant and needs a source set reference", () => {
    const stream = { stream_authorized: true, stream_grant_id: "grant-TEST-ONLY-stream", stream_grant_revision: "r1" };
    expect(codeOf(() => run({ ...base(), ...stream, stream_grant_id: "grant-TEST-ONLY-read" }))).toBe("READY_STREAM_GRANT_NOT_DISTINCT");
    expect(codeOf(() => run({ ...base(), ...stream }))).toBe("READY_STREAM_SOURCE_SET_MISSING");
    expect(run({ ...base(), ...stream, source_set_ref: "source-set-TEST-ONLY" }).stream_authorized).toBe(true);
  });

  it("refuses a private, loopback, link-local, documentation or malformed api_ip (the runner refuses them too)", () => {
    for (const ip of ["10.0.0.1", "127.0.0.1", "169.254.1.1", "172.16.0.9", "192.168.1.1", "100.64.0.1", "203.0.113.5", "::1", "fe80::1", "2001:db8::1", "999.1.1.1", "not-an-ip"])
      expect(isGlobalIp(ip), ip).toBe(false);
    for (const ip of ["8.8.8.8", "178.128.51.255", "2606:4700:4700::1111"]) expect(isGlobalIp(ip), ip).toBe(true);
    expect(codeOf(() => run({ ...base(), api_ip: "10.0.0.1" }))).toBe("READY_API_IP_NOT_GLOBAL");
  });

  it("every expiry must outlive the deadline plus the 600 s margin (630 s), not only the deadline", () => {
    expect(CONNECTED_READ_MINIMUM_REMAINING_MS).toBe(630_000);
    for (const key of ["expires_at", "trust_expires_at", "native_expires_at"]) {
      expect(codeOf(() => run({ ...base(), [key]: iso(NOW + 629_000) })), key).toBe("READY_EXPIRY_TOO_SHORT");
      expect(codeOf(() => run({ ...base(), [key]: iso(NOW + 630_000) })), `${key} exactly at the limit`).toBe("READY_EXPIRY_TOO_SHORT");
      expect(run({ ...base(), [key]: iso(NOW + 631_000) })[key as "expires_at"]).toBe(iso(NOW + 631_000));
    }
  });

  it("refuses a document whose session hash is not the hash of the session file given", () => {
    expect(codeOf(() => validateConnectedReadReady(base(), { nowMs: NOW, sessionFileSha256: h("6") }))).toBe("READY_SESSION_HASH_MISMATCH");
  });

  it("refuses an invalid clock and never echoes input values in an error", () => {
    expect(codeOf(() => validateConnectedReadReady(base(), { nowMs: 0, sessionFileSha256: SESSION }))).toBe("READY_CLOCK_INVALID");
    try { run({ ...base(), core_image: "SECRET-LOOKING-VALUE" }); } catch (error) { expect(String(error)).not.toContain("SECRET-LOOKING-VALUE"); }
  });
});
