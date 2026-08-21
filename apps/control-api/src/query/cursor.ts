import { createHmac, createHash, timingSafeEqual } from "crypto";
import { AppliedSort, NormalizedFilter, QueryContractError, QueryScalar } from "./contracts";

export type CursorDirection = "after" | "before";

interface CursorPayload {
  version: 1;
  key_id: string;
  resource_id: string;
  workspace_id: string;
  direction: CursorDirection;
  query_fingerprint: string;
  boundary: readonly QueryScalar[];
  issued_at: number;
  expires_at: number;
}

export interface CursorExpectation {
  resourceId: string;
  workspaceId: string;
  direction: CursorDirection;
  queryFingerprint: string;
  boundarySize: number;
}

export interface CursorKeyring {
  activeKeyId: string;
  keys: Readonly<Record<string, string | Buffer>>;
  ttlSeconds?: number;
  now?: () => number;
}

const TOKEN_PREFIX = "kc1";
const DOMAIN = "portal-control-query-cursor-v1\0";

function invalidCursor(): never {
  throw new QueryContractError("INVALID_CURSOR", "Invalid or expired query cursor.");
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error("cursor payload contains an unsupported value");
  return serialized;
}

export function queryFingerprint(input: {
  resourceId: string;
  limit: number;
  filters: readonly NormalizedFilter[];
  sort: readonly AppliedSort[];
}): string {
  const normalized = {
    resource_id: input.resourceId,
    limit: input.limit,
    filters: input.filters.map(({ field, op, values }) => ({ field, op, values })),
    sort: input.sort,
  };
  return createHash("sha256").update(canonical(normalized)).digest("base64url");
}

export class KeysetCursorCodec {
  private readonly activeKeyId: string;
  private readonly keys: Readonly<Record<string, Buffer>>;
  private readonly ttlSeconds: number;
  private readonly now: () => number;

  constructor(keyring: CursorKeyring) {
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(keyring.activeKeyId)) {
      throw new Error("cursor active key id is invalid");
    }
    const keys = Object.fromEntries(
      Object.entries(keyring.keys).map(([keyId, value]) => {
        if (!/^[A-Za-z0-9_-]{1,32}$/.test(keyId)) throw new Error("cursor key id is invalid");
        const key = Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8");
        if (key.length < 32) throw new Error("cursor signing keys must be at least 32 bytes");
        return [keyId, key];
      }),
    );
    if (!keys[keyring.activeKeyId]) throw new Error("cursor active key is missing");
    this.activeKeyId = keyring.activeKeyId;
    this.keys = keys;
    this.ttlSeconds = keyring.ttlSeconds ?? 15 * 60;
    this.now = keyring.now ?? (() => Math.floor(Date.now() / 1000));
    if (!Number.isSafeInteger(this.ttlSeconds) || this.ttlSeconds < 30) {
      throw new Error("cursor TTL must be at least 30 seconds");
    }
  }

  encode(input: Omit<CursorPayload, "version" | "key_id" | "issued_at" | "expires_at">): string {
    if (
      input.boundary.some(
        (value) =>
          !["string", "number", "boolean"].includes(typeof value) ||
          (typeof value === "number" && !Number.isFinite(value)),
      )
    ) {
      throw new Error("cursor boundary contains an unsupported value");
    }
    const issuedAt = this.now();
    const payload: CursorPayload = {
      version: 1,
      key_id: this.activeKeyId,
      issued_at: issuedAt,
      expires_at: issuedAt + this.ttlSeconds,
      ...input,
    };
    const encoded = Buffer.from(canonical(payload), "utf8").toString("base64url");
    const signature = this.sign(this.activeKeyId, encoded).toString("base64url");
    return `${TOKEN_PREFIX}.${this.activeKeyId}.${encoded}.${signature}`;
  }

  decode(token: string, expected: CursorExpectation): readonly QueryScalar[] {
    try {
      if (token.length > 4096) return invalidCursor();
      const [prefix, keyId, encoded, rawSignature, ...rest] = token.split(".");
      if (prefix !== TOKEN_PREFIX || !keyId || !encoded || !rawSignature || rest.length > 0) {
        return invalidCursor();
      }
      const key = this.keys[keyId];
      if (!key) return invalidCursor();
      const actual = Buffer.from(rawSignature, "base64url");
      const wanted = this.sign(keyId, encoded);
      if (
        actual.toString("base64url") !== rawSignature ||
        actual.length !== wanted.length ||
        !timingSafeEqual(actual, wanted)
      ) {
        return invalidCursor();
      }
      const decoded = Buffer.from(encoded, "base64url");
      if (decoded.toString("base64url") !== encoded) return invalidCursor();
      const payload = JSON.parse(decoded.toString("utf8")) as CursorPayload;
      const now = this.now();
      if (
        payload.version !== 1 ||
        payload.key_id !== keyId ||
        payload.resource_id !== expected.resourceId ||
        payload.workspace_id !== expected.workspaceId ||
        payload.direction !== expected.direction ||
        payload.query_fingerprint !== expected.queryFingerprint ||
        !Number.isSafeInteger(payload.issued_at) ||
        !Number.isSafeInteger(payload.expires_at) ||
        payload.issued_at > now + 30 ||
        payload.expires_at <= now ||
        !Array.isArray(payload.boundary) ||
        payload.boundary.length !== expected.boundarySize ||
        payload.boundary.some(
          (value) =>
            !["string", "number", "boolean"].includes(typeof value) ||
            (typeof value === "number" && !Number.isFinite(value)),
        )
      ) {
        return invalidCursor();
      }
      return payload.boundary;
    } catch (error) {
      if (error instanceof QueryContractError) throw error;
      return invalidCursor();
    }
  }

  private sign(keyId: string, encoded: string): Buffer {
    return createHmac("sha256", this.keys[keyId])
      .update(DOMAIN)
      .update(keyId)
      .update("\0")
      .update(encoded)
      .digest();
  }
}
