import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { SiblingSourceSeam, siblingSchemas, type SiblingKind, type SiblingScope } from "../src/execution-v2/sibling-source-seam";

const scope = (kind: SiblingKind): SiblingScope => ({ workspaceId: "ws_test", principalId: "user_test", sessionId: "session_test",
  environment: "paper", kind, targetType: kind === "account-profile" || kind === "reconciliation" || kind === "obligations" ? "ACCOUNT" : "ORDER", targetId: "target_1" });
const body = (s: SiblingScope) => ({ schema_version: `portal.execution.${s.kind}.v1`, workspace_id: s.workspaceId,
  record_authority: "PORTAL_PROJECTION", read_at_ms: 123,
  ...(s.kind === "order-detail" ? { order_id: s.targetId, filled_quantity: "0" } :
    s.kind === "account-profile" ? { account_id: s.targetId, wallet_balance: null } : { subject: { type: s.targetType, id: s.targetId } }) });

describe("source-only sibling seam", () => {
  it("matches the canonical synthetic positive and negative contract vectors", () => {
    const dir = resolve(process.env.PORTAL_CONTRACTS_DIR ?? resolve(process.cwd(), "../../packages/contracts"), "fixtures");
    for (const kind of ["order-detail", "account-profile", "reconciliation", "obligations"] as const) {
      const read = (name: string) => JSON.parse(readFileSync(resolve(dir, name), "utf8"));
      for (const name of readdirSync(dir).filter(n => n.startsWith(`execution-${kind}.`) && n.endsWith(".synthetic.valid.json")))
        expect(siblingSchemas[kind].safeParse(read(name).value).success, name).toBe(true);
      const vectors = read(`execution-${kind}.synthetic.negative.json`);
      for (const vector of vectors.cases) {
        const value = structuredClone(read(vectors.bases[vector.base]).value);
        for (const op of vector.ops) {
          let node = value;
          for (const part of op.path.slice(0, -1)) node = node[part];
          if (op.op === "delete") delete node[op.path.at(-1)]; else node[op.path.at(-1)] = op.value;
        }
        expect(siblingSchemas[kind].safeParse(value).success, `${kind}/${vector.id}`).toBe(false);
      }
    }
  });
  for (const kind of ["order-detail", "account-profile", "reconciliation", "obligations"] as const) {
    it(`${kind}: returns only the exact authorized, complete source body`, async () => {
      const s = scope(kind);
      const seam = new SiblingSourceSeam({ check: async () => true }, { read: async () => ({ scope: s, body: body(s), complete: true }) });
      expect(await seam.read(s)).toEqual(body(s));
    });
  }
  it("fails closed before touching source and after a mid-read revocation", async () => {
    const s = scope("order-detail"); let reads = 0, checks = 0;
    const denied = new SiblingSourceSeam({ check: async () => false }, { read: async () => { reads++; return { scope: s, body: body(s), complete: true }; } });
    await expect(denied.read(s)).rejects.toMatchObject({ code: "SIBLING_ACCESS_DENIED" });
    expect(reads).toBe(0);
    const revoked = new SiblingSourceSeam({ check: async () => ++checks === 1 }, { read: async () => ({ scope: s, body: body(s), complete: true }) });
    await expect(revoked.read(s)).rejects.toMatchObject({ code: "SIBLING_ACCESS_DENIED" });
  });
  it("refuses an uncommissioned source, wrong principal/workspace/target, and incomplete pages", async () => {
    const s = scope("reconciliation"); const authority = { check: async () => true };
    await expect(new SiblingSourceSeam(authority).read(s)).rejects.toMatchObject({ code: "SIBLING_SOURCE_NOT_COMMISSIONED" });
    for (const altered of [{ ...s, principalId: "other" }, { ...s, workspaceId: "other" }, { ...s, targetId: "other" }]) {
      const seam = new SiblingSourceSeam(authority, { read: async () => ({ scope: altered, body: body(s), complete: true }) });
      await expect(seam.read(s)).rejects.toMatchObject({ code: "SIBLING_SOURCE_SCOPE_MISMATCH" });
    }
    const incomplete = new SiblingSourceSeam(authority, { read: async () => ({ scope: s, body: body(s), complete: false }) });
    await expect(incomplete.read(s)).rejects.toMatchObject({ code: "SIBLING_PAGINATION_NOT_COMMISSIONED" });
  });
  it("refuses malformed fees and source errors without inventing a zero", async () => {
    const s = scope("order-detail"), authority = { check: async () => true };
    const invalid = new SiblingSourceSeam(authority, { read: async () => ({ scope: s, complete: true,
      body: { ...body(s), fee: { currency: "USD", value: 0 } } }) });
    await expect(invalid.read(s)).rejects.toMatchObject({ code: "SIBLING_SOURCE_INVALID" });
    const failed = new SiblingSourceSeam(authority, { read: async () => { throw Error("private source error"); } });
    await expect(failed.read(s)).rejects.toMatchObject({ code: "SIBLING_SOURCE_UNAVAILABLE" });
  });
});
