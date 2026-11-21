import { describe, expect, it } from "vitest";
import { SiblingPageCursorCodec, type SiblingPageBinding } from "../src/execution-v2/sibling-page-cursor";

const key = "a".repeat(40);
const hash = `sha256:${"a".repeat(64)}`;
const binding: SiblingPageBinding = { workspace_id: "ws", principal_id: "user", session_id: "session", session_generation: 1,
  environment: "paper", kind: "obligations", target_type: "ACCOUNT", target_id: "account",
  app_policy_revision: "app-1", field_policy_revision: "fields-1", source_set_digest: hash,
  snapshot_id: "snapshot-1", query_digest: hash, page_size: 100 };
const code = { code: "SIBLING_CURSOR_INVALID_OR_EXPIRED" };

describe("private sibling page cursor", () => {
  it("encrypts a fixed-size continuation, with independent nonces", () => {
    const codec = new SiblingPageCursorCodec("active", { active: key }, 1000, () => 100);
    const a = codec.encode(binding, "source-position-1"), b = codec.encode(binding, "x");
    expect(a).not.toContain("source-position-1");
    expect(a.length).toBe(b.length);
    expect(a).not.toBe(codec.encode(binding, "source-position-1"));
    expect(codec.decode(a, binding)).toBe("source-position-1");
  });
  it("binds all authority, target, snapshot, query and page coordinates", () => {
    const codec = new SiblingPageCursorCodec("active", { active: key }, 1000, () => 100);
    const token = codec.encode(binding, "next");
    const changes: Partial<SiblingPageBinding>[] = [
      { workspace_id: "other" }, { principal_id: "other" }, { session_id: "other" }, { session_generation: 2 }, { environment: "live" },
      { kind: "reconciliation" }, { target_type: "PORTFOLIO" }, { target_id: "other" },
      { app_policy_revision: "app-2" }, { field_policy_revision: "fields-2" },
      { source_set_digest: `sha256:${"b".repeat(64)}` }, { snapshot_id: "snapshot-2" },
      { query_digest: `sha256:${"b".repeat(64)}` }, { page_size: 101 },
    ];
    for (const change of changes) expect(() => codec.decode(token, { ...binding, ...change })).toThrowError(expect.objectContaining(code));
  });
  it("rejects tampering, malformed tokens, expiration and backward clock", () => {
    let now = 100;
    const codec = new SiblingPageCursorCodec("active", { active: key }, 1000, () => now);
    const token = codec.encode(binding, "next");
    const parts = token.split(".");
    parts[4] = (parts[4][0] === "A" ? "B" : "A") + parts[4].slice(1);
    for (const bad of [parts.join("."), "", `${token}.extra`, token + "\n", "sp1.invalid"]) {
      expect(() => codec.decode(bad, binding)).toThrowError(expect.objectContaining(code));
    }
    now = 1100;
    expect(() => codec.decode(token, binding)).toThrowError(expect.objectContaining(code));
    now = 99;
    expect(() => codec.decode(token, binding)).toThrowError(expect.objectContaining(code));
  });
  it("supports bounded rotation without accepting a wrong key", () => {
    const old = new SiblingPageCursorCodec("old", { old: key }, 1000, () => 100);
    const token = old.encode(binding, "next");
    const rotated = new SiblingPageCursorCodec("new", { old: key, new: "b".repeat(40) }, 1000, () => 100);
    expect(rotated.decode(token, binding)).toBe("next");
    expect(() => new SiblingPageCursorCodec("new", { new: "b".repeat(40) }, 1000, () => 100).decode(token, binding))
      .toThrowError(expect.objectContaining(code));
  });
  it("applies a shortened current TTL to previously issued continuations", () => {
    const original = new SiblingPageCursorCodec("k", { k: key }, 1000, () => 100);
    const shortened = new SiblingPageCursorCodec("k", { k: key }, 500, () => 100);
    expect(() => shortened.decode(original.encode(binding, "next"), binding)).toThrowError(expect.objectContaining(code));
  });
  it("rejects invalid configuration, source coordinates and scope", () => {
    expect(() => new SiblingPageCursorCodec("active", { active: "short" }, 1000)).toThrow("SIBLING_CURSOR_CONFIG_INVALID");
    const codec = new SiblingPageCursorCodec("active", { active: key }, 1000, () => 100);
    for (const source of ["", "with space", "x".repeat(2049)]) expect(() => codec.encode(binding, source)).toThrowError(expect.objectContaining(code));
    expect(() => codec.encode({ ...binding, page_size: 201 }, "next")).toThrowError(expect.objectContaining(code));
  });
});
