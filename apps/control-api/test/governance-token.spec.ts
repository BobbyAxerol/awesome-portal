import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";
import { GovernanceApplyTokenSigner } from "../src/governance/apply-token";

const OLD = "old-governance-apply-key-material-32-bytes";
const CURRENT = "current-governance-apply-key-material-32-bytes";

describe("EX-BE-05a governance apply token", () => {
  it("binds the token to key, operation and payload", () => {
    const signer = new GovernanceApplyTokenSigner("governance-k2", {
      "governance-k1": OLD,
      "governance-k2": CURRENT,
    });
    const token = signer.issue("op_01K3GOVERNANCE", "sha256:payload");

    expect(signer.verify(token, "op_01K3GOVERNANCE", "sha256:payload", "governance-k2")).toBe(true);
    expect(signer.verify(token, "op_other", "sha256:payload", "governance-k2")).toBe(false);
    expect(signer.verify(token, "op_01K3GOVERNANCE", "sha256:other", "governance-k2")).toBe(false);
    expect(signer.verify(`${token}x`, "op_01K3GOVERNANCE", "sha256:payload", "governance-k2")).toBe(false);
  });

  it("can replay a still-valid plan with its previous signing key during rotation", () => {
    const signer = new GovernanceApplyTokenSigner("governance-k2", {
      "governance-k1": OLD,
      "governance-k2": CURRENT,
    });
    const token = signer.issue("op_01K3OLDPLAN", "sha256:payload", "governance-k1");

    expect(signer.verify(token, "op_01K3OLDPLAN", "sha256:payload", "governance-k1")).toBe(true);
    expect(signer.verify(token, "op_01K3OLDPLAN", "sha256:payload", "governance-k2")).toBe(false);
  });

  it("rejects a shared query/apply secret at startup", () => {
    expect(() =>
      loadConfig({
        DATABASE_URL: "postgres://portal:portal@localhost/portal",
        PORTAL_ENV: "local",
        AUTH_MODE: "dev",
        QUERY_CURSOR_KEYS_JSON: JSON.stringify({ "query-k1": CURRENT }),
        GOVERNANCE_APPLY_KEYS_JSON: JSON.stringify({ "governance-k1": CURRENT }),
      }),
    ).toThrow(/must not share secret values/);
  });
});
