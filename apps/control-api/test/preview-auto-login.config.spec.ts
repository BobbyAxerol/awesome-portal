import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config";

const base = {
  DATABASE_URL: "postgres://portal:portal@localhost:5432/portal_control",
  INTERNAL_PRINCIPAL_SECRET: "local-dev-principal-secret-0123456789",
};

describe("PREVIEW_AUTO_LOGIN_USERNAME (research preview only)", () => {
  it("is accepted only with AUTH_MODE=dev and PORTAL_ENV=local", () => {
    expect(loadConfig({ ...base, AUTH_MODE: "dev", PORTAL_ENV: "local", PREVIEW_AUTO_LOGIN_USERNAME: "bobby" }).PREVIEW_AUTO_LOGIN_USERNAME).toBe("bobby");
  });

  it("refuses any other deployment at startup", () => {
    expect(() =>
      loadConfig({
        ...base,
        AUTH_MODE: "cloudflare_access_local_password",
        PORTAL_ENV: "local",
        PREVIEW_AUTO_LOGIN_USERNAME: "bobby",
        CLOUDFLARE_TEAM_DOMAIN: "t", CLOUDFLARE_ACCESS_ISSUER: "https://t", CLOUDFLARE_ACCESS_AUD: "a", CLOUDFLARE_ACCESS_JWKS_URI: "https://t/certs",
      }),
    ).toThrow(/PREVIEW_AUTO_LOGIN_USERNAME/);
  });

  it("is absent by default, and an empty value means absent", () => {
    expect(loadConfig({ ...base, AUTH_MODE: "dev", PORTAL_ENV: "local" }).PREVIEW_AUTO_LOGIN_USERNAME).toBeUndefined();
    expect(loadConfig({ ...base, AUTH_MODE: "dev", PORTAL_ENV: "local", PREVIEW_AUTO_LOGIN_USERNAME: "" }).PREVIEW_AUTO_LOGIN_USERNAME).toBeUndefined();
  });
});
