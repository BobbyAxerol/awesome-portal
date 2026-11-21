import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { accessDigest } from "./access-policy";

// Private preparation only. A cursor is a continuation, never a grant: the
// caller must recheck current authority and retain source custody through HTTP
// egress. No endpoint or commissioned source is enabled by this codec.
const text = z.string().min(1).max(256).regex(/^[^\u0000-\u001f\u007f]+$(?![\s\S])/);
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$(?![\s\S])/);
const bindingSchema = z.object({
  workspace_id: text, principal_id: text, session_id: text, session_generation: z.number().int().nonnegative().safe(),
  environment: z.enum(["paper", "sandbox", "live"]),
  kind: z.enum(["reconciliation", "obligations"]), target_type: text, target_id: text,
  app_policy_revision: text, field_policy_revision: text, source_set_digest: digest,
  snapshot_id: text, query_digest: digest, page_size: z.number().int().min(1).max(200),
}).strict();
export type SiblingPageBinding = z.infer<typeof bindingSchema>;

export class SiblingPageCursorError extends Error {
  readonly code = "SIBLING_CURSOR_INVALID_OR_EXPIRED";
  constructor() { super("The continuation is invalid or expired."); }
}

type State = { active: string; keys: ReadonlyMap<string, Buffer>; ttl: number; now: () => number };
const states = new WeakMap<object, State>();
const keyId = /^[A-Za-z0-9_-]{1,32}$(?![\s\S])/;
const sourceCoordinate = /^[A-Za-z0-9._~-]{1,2048}$(?![\s\S])/;
export const isSiblingSourceCoordinate = (value: unknown): value is string =>
  typeof value === "string" && sourceCoordinate.test(value);
const invalid = (): never => { throw new SiblingPageCursorError(); };

export class SiblingPageCursorCodec {
  constructor(active: string, keys: Readonly<Record<string, string>>, ttl: number, now: () => number = Date.now) {
    if (!keys || !keyId.test(active) || !Object.hasOwn(keys, active) || Object.keys(keys).length > 4 ||
        Object.entries(keys).some(([id, key]) => !keyId.test(id) || typeof key !== "string" || Buffer.byteLength(key) < 32) ||
        !Number.isSafeInteger(ttl) || ttl < 1 || ttl > 300_000 || typeof now !== "function")
      throw new Error("SIBLING_CURSOR_CONFIG_INVALID");
    const captured = new Map(Object.entries(keys).map(([id, key]) =>
      [id, createHash("sha256").update("portal-sibling-page-v1\0").update(key).digest()]));
    states.set(this, Object.freeze({ active, keys: captured, ttl, now }));
  }

  encode(binding: SiblingPageBinding, source: string): string {
    const state = states.get(this);
    if (!state) return invalid();
    const parsed = bindingSchema.safeParse(binding);
    if (!parsed.success || !isSiblingSourceCoordinate(source)) return invalid();
    const issued = state.now();
    if (!Number.isSafeInteger(issued) || issued < 0 || !Number.isSafeInteger(issued + state.ttl)) return invalid();
    const json = Buffer.from(JSON.stringify({ binding: accessDigest(parsed.data), source, issued, expires: issued + state.ttl }));
    // Fixed size prevents disclosing source-coordinate length to the browser.
    const payload = randomBytes(2816);
    if (json.length > payload.length - 4) return invalid();
    payload.writeUInt32BE(json.length); json.copy(payload, 4);
    const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", state.keys.get(state.active)!, iv);
    cipher.setAAD(Buffer.from(`portal-sibling-page.v1:${state.active}`));
    const data = Buffer.concat([cipher.update(payload), cipher.final()]);
    return ["sp1", state.active, iv.toString("base64url"), data.toString("base64url"), cipher.getAuthTag().toString("base64url")].join(".");
  }

  decode(token: string, binding: SiblingPageBinding): string {
    try {
      const state = states.get(this), parsed = bindingSchema.safeParse(binding);
      if (!state || !parsed.success || typeof token !== "string" || token.length > 4096 || !/^[A-Za-z0-9_.-]+$(?![\s\S])/.test(token)) return invalid();
      const [version, id, nonce, ciphertext, tag, ...extra] = token.split("."), key = state.keys.get(id);
      if (version !== "sp1" || !key || extra.length || !nonce || !ciphertext || !tag) return invalid();
      const iv = Buffer.from(nonce, "base64url"), data = Buffer.from(ciphertext, "base64url"), auth = Buffer.from(tag, "base64url");
      if (iv.length !== 12 || data.length !== 2816 || auth.length !== 16 || iv.toString("base64url") !== nonce ||
          data.toString("base64url") !== ciphertext || auth.toString("base64url") !== tag) return invalid();
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAAD(Buffer.from(`portal-sibling-page.v1:${id}`)); decipher.setAuthTag(auth);
      const payload = Buffer.concat([decipher.update(data), decipher.final()]), length = payload.readUInt32BE();
      if (length > payload.length - 4) return invalid();
      const raw: unknown = JSON.parse(payload.subarray(4, 4 + length).toString("utf8"));
      const envelope = z.object({ binding: digest, source: z.string().regex(sourceCoordinate),
        issued: z.number().int().nonnegative().safe(), expires: z.number().int().nonnegative().safe() }).strict().parse(raw);
      const now = state.now();
      if (!Number.isSafeInteger(now) || now < 0 || envelope.issued > now || envelope.expires <= now ||
          envelope.expires - envelope.issued < 1 || envelope.expires - envelope.issued > state.ttl ||
          envelope.binding !== accessDigest(parsed.data)) return invalid();
      return envelope.source;
    } catch { return invalid(); }
  }
}
