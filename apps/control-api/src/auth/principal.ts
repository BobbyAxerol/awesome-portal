import { createHmac, timingSafeEqual } from "crypto";
import { PortalPrincipal } from "../domain";

/**
 * HMAC-SHA256 signed internal principal context (BAR-04 §2.5).
 *
 * Downstream services verify `sig` against `INTERNAL_PRINCIPAL_SECRET` and
 * reject expired or structurally invalid principals. Browser-supplied
 * identity headers never become a principal.
 */
export class PrincipalService {
  private readonly secret: Buffer;

  constructor(secret: string) {
    this.secret = Buffer.from(secret, "utf8");
  }

  sign(principal: Omit<PortalPrincipal, "exp" | "policyVersion"> & { policyVersion?: never }): string {
    const issuedAt = new Date().toISOString();
    const exp = Math.floor(Date.now() / 1000) + 60;
    const payload: PortalPrincipal = {
      ...principal,
      issuedAt,
      exp,
      policyVersion: "auth-policy-v1",
    };
    const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    const signature = createHmac("sha256", this.secret)
      .update(encoded)
      .digest("base64url");
    return `${encoded}.${signature}`;
  }

  verify(token: string): PortalPrincipal | null {
    const [encoded, signature] = token.split(".");
    if (!encoded || !signature) return null;
    const expected = createHmac("sha256", this.secret)
      .update(encoded)
      .digest("base64url");
    const actualBuffer = Buffer.from(signature, "utf8");
    const expectedBuffer = Buffer.from(expected, "utf8");
    if (
      actualBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(actualBuffer, expectedBuffer)
    ) {
      return null;
    }
    try {
      const payload = JSON.parse(
        Buffer.from(encoded, "base64url").toString("utf8"),
      ) as PortalPrincipal;
      if (payload.policyVersion !== "auth-policy-v1") return null;
      if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) {
        return null;
      }
      return payload;
    } catch {
      return null;
    }
  }
}
