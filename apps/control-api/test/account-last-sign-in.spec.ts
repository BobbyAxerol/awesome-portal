import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import type { PortalUser } from "../src/domain";
import { projectAccount, withLastSignIn } from "../src/repos/account-lifecycle";

// FE-CAT-8. In-process contract rules; users-last-sign-in and the disposable PG
// roster spec separately verify the successful-login audit publication.
const user: PortalUser = {
  userId: "usr_a", username: "a", displayName: "A", role: "USER", status: "ACTIVE", mustChangePassword: false,
  failedLoginCount: 0, lockedUntil: null, sessionVersion: 1, accountRevision: 2, archivedAt: null,
  createdAt: new Date("2026-08-31T00:00:00Z"), updatedAt: new Date("2026-08-31T00:00:00Z"), disabledAt: null,
} as PortalUser;
const contractsDir = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts");
const spec = JSON.parse(readFileSync(resolve(contractsDir, "openapi/portal-account-lifecycle.openapi.json"), "utf8"));
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema(spec, "spec");
const summary = ajv.getSchema("spec#/components/schemas/AccountSummary")!;

describe("withLastSignIn", () => {
  const base = projectAccount(user, new Date("2026-10-23T00:00:00Z"));

  it("omits the key when the roster source supplied no fact (never a guessed null)", () => {
    const out = withLastSignIn(base, undefined);
    expect(Object.hasOwn(out, "last_sign_in_at")).toBe(false);
    expect(out).toEqual(base);
    expect(summary(out)).toBe(true);
  });

  it("publishes the instant exactly, and null only when the source says the account never signed in", () => {
    const at = withLastSignIn(base, new Date("2026-10-17T09:14:00Z"));
    expect(at.last_sign_in_at).toBe("2026-10-17T09:14:00.000Z");
    expect(summary(at)).toBe(true);
    const never = withLastSignIn(base, null);
    expect(never.last_sign_in_at).toBeNull();
    expect(summary(never)).toBe(true);
  });

  it("an unreadable instant is not published as a time or as 'never'", () => {
    for (const bad of [new Date(Number.NaN), new Date(-1), "2026-10-17" as unknown as Date, 5 as unknown as Date]) {
      expect(Object.hasOwn(withLastSignIn(base, bad), "last_sign_in_at")).toBe(false);
    }
  });

  it("the audit projection never carries it, and it adds no authority or other key", () => {
    expect(Object.hasOwn(base, "last_sign_in_at")).toBe(false);
    const out = withLastSignIn(base, new Date("2026-10-17T09:14:00Z"));
    expect(Object.keys(out).filter((k) => !(k in base))).toEqual(["last_sign_in_at"]);
    expect(Object.keys(out)).not.toContain("role_preset");
  });
});
