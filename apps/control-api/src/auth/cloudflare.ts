import { createRemoteJWKSet, JWTPayload, jwtVerify } from "jose";
import { normalizeEmail, VerifiedAccessIdentity } from "../domain";

export interface CloudflareConfig {
  issuer: string;
  audience: string;
  jwksUri: string;
  allowedEmailDomain: string;
  jwksCacheTtlSeconds: number;
}

export class CloudflareJwtError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Verifies Cloudflare Access assertions (Cf-Access-Jwt-Assertion).
 *
 * `kid` resolution goes through the remote JWKS (cached by jose with a TTL
 * and an unknown-kid refetch). Fail-closed on missing header, unknown kid,
 * bad signature, wrong issuer/audience, invalid times or disallowed email
 * domain. Raw tokens and identities never reach logs here.
 */
export class CloudflareJwtVerifier {
  private readonly remoteJwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly audience: string;
  private readonly issuer: string;
  private readonly allowedEmailDomain: string;

  constructor(private readonly config: CloudflareConfig) {
    this.audience = config.audience;
    this.issuer = config.issuer;
    this.allowedEmailDomain = config.allowedEmailDomain.toLowerCase();
    this.remoteJwks = createRemoteJWKSet(
      new URL(config.jwksUri),
      {
        cooldownDuration: config.jwksCacheTtlSeconds * 1000,
        cacheMaxAge: config.jwksCacheTtlSeconds * 1000,
      },
    );
  }

  async verify(assertion: string | undefined): Promise<VerifiedAccessIdentity> {
    if (!assertion) {
      throw new CloudflareJwtError(
        "ACCESS_JWT_MISSING",
        "missing Cf-Access-Jwt-Assertion",
      );
    }
    let payload: JWTPayload;
    try {
      const result = await jwtVerify(assertion, this.remoteJwks, {
        issuer: this.issuer,
        audience: this.audience,
        algorithms: ["RS256", "ES256", "PS256"],
        clockTolerance: "30 seconds",
      });
      payload = result.payload;
    } catch {
      throw new CloudflareJwtError("ACCESS_JWT_INVALID", "Access JWT verification failed");
    }
    const email = typeof payload.email === "string" ? payload.email : undefined;
    if (!email) {
      throw new CloudflareJwtError("ACCESS_JWT_NO_EMAIL", "Access JWT has no email claim");
    }
    const normalized = normalizeEmail(email);
    if (!normalized.endsWith(`@${this.allowedEmailDomain}`)) {
      throw new CloudflareJwtError(
        "ACCESS_EMAIL_DOMAIN_DENIED",
        "Access email domain is not allowed",
      );
    }
    const sub = typeof payload.sub === "string" ? payload.sub : "";
    const authenticationTime = payload.auth_time
      ? new Date(Number(payload.auth_time) * 1000)
      : new Date((payload.iat ?? 0) * 1000);
    const tokenExpiresAt = new Date((payload.exp ?? 0) * 1000);
    return {
      sub,
      email,
      normalizedEmail: normalized,
      iss: this.issuer,
      aud: this.audience,
      authenticationTime,
      tokenExpiresAt,
    };
  }
}
