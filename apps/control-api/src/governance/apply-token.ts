import { createHmac, timingSafeEqual } from "crypto";

const TOKEN_DOMAIN = "primusspark.portal.governance.apply.v1\0";

export class GovernanceApplyTokenSigner {
  private readonly keys: Record<string, Buffer>;

  constructor(
    readonly activeKeyId: string,
    keys: Record<string, string>,
  ) {
    this.keys = Object.fromEntries(
      Object.entries(keys).map(([keyId, secret]) => [keyId, Buffer.from(secret, "utf8")]),
    );
    if (!this.keys[activeKeyId]) throw new Error("active governance apply key is missing");
  }

  issue(operationId: string, payloadHash: string, keyId = this.activeKeyId): string {
    if (!this.keys[keyId]) throw new Error("governance apply signing key is missing");
    const signature = this.signature(keyId, operationId, payloadHash).toString("base64url");
    return `gat1.${keyId}.${operationId}.${signature}`;
  }

  verify(token: string, operationId: string, payloadHash: string, expectedKeyId: string): boolean {
    const [prefix, keyId, tokenOperationId, rawSignature, ...rest] = token.split(".");
    if (
      prefix !== "gat1" ||
      keyId !== expectedKeyId ||
      tokenOperationId !== operationId ||
      !rawSignature ||
      rest.length > 0 ||
      !this.keys[keyId]
    ) {
      return false;
    }
    const actual = Buffer.from(rawSignature, "base64url");
    const expected = this.signature(keyId, operationId, payloadHash);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  private signature(keyId: string, operationId: string, payloadHash: string): Buffer {
    return createHmac("sha256", this.keys[keyId])
      .update(TOKEN_DOMAIN)
      .update(keyId)
      .update("\0")
      .update(operationId)
      .update("\0")
      .update(payloadHash)
      .digest();
  }
}
