import { exportJWK, exportPKCS8, generateKeyPair, jwtVerify } from "jose";
import { describe, expect, it } from "vitest";
import { ExecutionDelegationService } from "../src/execution/delegation";

async function fixture(ttlSeconds = 45) {
  const { privateKey, publicKey } = await generateKeyPair("RS256", { extractable: true });
  const service = await ExecutionDelegationService.create({
    issuer: "portal-control-api",
    audience: "portal-execution-edge-paper",
    keyId: "execution-k1",
    privateKeyPem: await exportPKCS8(privateKey),
    ttlSeconds,
    environment: "paper",
  });
  return { service, publicKey: await exportJWK(publicKey) };
}

describe("execution delegated read assertions", () => {
  it("issues an RS256 assertion with exact audience, environment and resources", async () => {
    const { service, publicKey } = await fixture();
    const token = await service.issueReadAssertion({
      principalId: "usr_bobby",
      sessionId: "ses_123",
      workspaceId: "ws_research",
      roles: ["ADMIN"],
      resources: ["alpha:alpha-paper-1"],
      authenticationTime: new Date(),
      authenticationMethods: ["cloudflare_access", "portal_session"],
    });
    const { payload, protectedHeader } = await jwtVerify(token, publicKey, {
      issuer: "portal-control-api",
      audience: "portal-execution-edge-paper",
      algorithms: ["RS256"],
    });
    expect(protectedHeader.kid).toBe("execution-k1");
    expect(payload.scopes).toEqual(["execution.read"]);
    expect(payload.resources).toEqual(["alpha:alpha-paper-1"]);
    expect(payload.environment).toBe("paper");
    expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBe(45);
  });

  it("rejects unsafe lifetime, wildcard resources and empty scope sets", async () => {
    await expect(fixture(61)).rejects.toThrow("outside the read-only boundary");
    const { service } = await fixture();
    await expect(
      service.issueReadAssertion({
        principalId: "usr_bobby",
        sessionId: "ses_123",
        workspaceId: "ws_research",
        roles: ["ADMIN"],
        resources: ["alpha:*"],
        authenticationTime: new Date(),
        authenticationMethods: ["portal_session"],
      }),
    ).rejects.toThrow("principal is invalid");
  });

  it("never offers a command-scope parameter", async () => {
    const { service } = await fixture();
    const token = await service.issueReadAssertion({
      principalId: "usr_reader",
      sessionId: "ses_456",
      workspaceId: "ws_research",
      roles: ["USER"],
      resources: ["deployment:dep-paper-1"],
      authenticationTime: new Date(),
      authenticationMethods: ["portal_session"],
    });
    const [, payload] = token.split(".");
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    expect(decoded.scopes).toEqual(["execution.read"]);
    expect(JSON.stringify(decoded)).not.toContain("command");
  });

  it("supports the exact command-center screen resource without wildcards", async () => {
    const { service, publicKey } = await fixture();
    const token = await service.issueReadAssertion({
      principalId: "usr_reader",
      sessionId: "ses_789",
      workspaceId: "ws_research",
      roles: ["USER"],
      resources: ["execution:command-center"],
      authenticationTime: new Date(),
      authenticationMethods: ["portal_session"],
    });
    const { payload } = await jwtVerify(token, publicKey, {
      issuer: "portal-control-api",
      audience: "portal-execution-edge-paper",
      algorithms: ["RS256"],
    });
    expect(payload.resources).toEqual(["execution:command-center"]);
  });
});
