import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/** Offline shape/integrity check only. It is not an acceptance, delegation,
 * C2 seal, signature, publication or permission to contact a source. */
const MAX_BYTES = 131_072;
const MAX_NODES = 4096;
const MAX_DEPTH = 16;
const reject = (): never => { throw new Error("C2_B1_INVALID"); };

/** JSON.parse alone silently accepts duplicate (including escaped-alias) keys.
 * Parse into null-prototype objects under explicit length, depth and node limits. */
function parseUniqueJson(bytes: Uint8Array): unknown {
  let source: string;
  try { source = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return reject(); }
  const quoted = /"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"/y;
  const numeric = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
  let i = 0, nodes = 0;
  const ws = () => { while (i < source.length && /[\x20\t\n\r]/.test(source[i]!)) i++; };
  const string = (): string => {
    quoted.lastIndex = i;
    const match = quoted.exec(source);
    if (!match) return reject();
    i = quoted.lastIndex;
    const value = JSON.parse(match[0]) as string;
    if (/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/u.test(value)) return reject();
    return value;
  };
  const value = (depth: number): unknown => {
    if (++nodes > MAX_NODES || depth > MAX_DEPTH) return reject();
    ws();
    if (source[i] === '"') return string();
    if (source[i] === "{") {
      i++; ws();
      const object: Record<string, unknown> = Object.create(null);
      if (source[i] !== "}") for (;;) {
        const key = string();
        if (Object.hasOwn(object, key)) return reject();
        ws(); if (source[i++] !== ":") return reject();
        object[key] = value(depth + 1);
        ws(); if (source[i] !== ",") break;
        i++; ws();
      }
      if (source[i++] !== "}") return reject();
      return object;
    }
    if (source[i] === "[") {
      i++; ws();
      const array: unknown[] = [];
      if (source[i] !== "]") for (;;) {
        array.push(value(depth + 1)); ws();
        if (source[i] !== ",") break;
        i++; ws();
      }
      if (source[i++] !== "]") return reject();
      return array;
    }
    for (const [literal, result] of [["true", true], ["false", false], ["null", null]] as const)
      if (source.slice(i, i + literal.length) === literal) { i += literal.length; return result; }
    numeric.lastIndex = i;
    const match = numeric.exec(source);
    if (!match) return reject();
    i = numeric.lastIndex;
    if (!/^-?(?:0|[1-9][0-9]*)$/.test(match[0])) return reject();
    const number = Number(match[0]);
    if (!Number.isSafeInteger(number)) return reject();
    return number;
  };
  const result = value(0);
  ws(); if (i !== source.length) return reject();
  return result;
}

const identifier = z.string().min(1).max(512)
  .refine(v => v.trim() === v && !/[\u0000-\u001f\u007f]/u.test(v));
const unique = <T>(values: T[]) => new Set(values).size === values.length;
const portalFills = ["head.acceptance_id", "head.workspace_id", "head.workload_ref", "acceptance.effective_from",
  "acceptance.expires_at", "document.human_authority_revision", "document.application_revision",
  "document.acceptance_ref", "document.delegation_ref"] as const;
const copyVerbatim = ["expected_version", "head.user_id", "head.environment", "head.db_login", "head.db_role", "head.version",
  "acceptance.revoked", "acceptance.document.membership_policy_revision", "acceptance.document.field_revision",
  "acceptance.document.visibility", "acceptance.document.fields", "acceptance.document.operations",
  "acceptance.document.physical_refs", "acceptance.document.scopes"] as const;
const exactSequence = (expected: readonly string[]) => z.array(z.string()).refine(
  actual => actual.length === expected.length && actual.every((entry, index) => entry === expected[index]));
const scope = z.object({ environment: z.literal("paper"), portfolio_id: identifier }).strict();
const document = z.object({ field_revision: z.literal("pma-field-policy-20261016-r1"),
  fields: z.tuple([z.literal("business_report")]), membership_policy_revision: z.literal(1),
  operations: z.array(z.enum(["READ", "HISTORY", "EXPORT", "STREAM"])).min(1).max(4).refine(unique),
  // This exchange supplies no physical-reference semantics. Fail closed.
  physical_refs: z.array(z.never()).max(0),
  scopes: z.array(scope).min(1).max(200).refine(v => unique(v.map(s => s.portfolio_id))),
  visibility: z.literal("BUSINESS") }).strict();
const b1 = z.object({ schema: z.literal("ts.c2.pm-current-access-publication-input.v1"), expected_version: z.literal(0),
  head: z.object({ db_login: z.literal("ts_pm_operator"), db_role: z.literal("pm_scoped_writer"),
    environment: z.literal("paper"), user_id: z.literal("b2b70006-2373-4f10-b2d4-5e4c32af9204"), version: z.literal(1) }).strict(),
  acceptance: z.object({ document, revoked: z.literal(false) }).strict(), portal_fills: exactSequence(portalFills),
  rules: z.object({ canonical: z.literal("json.dumps(sort_keys=True,separators=(',',':'),ensure_ascii=True,allow_nan=False)"),
    copy_verbatim: exactSequence(copyVerbatim), effective_from: z.literal("signing time, UTC Z, whole seconds"),
    window_max_days: z.literal(90) }).strict() }).strict();

/** Parsed value is input for offline inspection only, never authority. */
export type C2B1Unapproved = z.infer<typeof b1>;
export function inspectPinnedC2B1NotAuthorized(bytes: Uint8Array, expectedSha256: string): C2B1Unapproved {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1 || bytes.byteLength > MAX_BYTES
      || !/^[a-f0-9]{64}$/.test(expectedSha256)) return reject();
  // Detach caller-owned bytes before hashing/parsing to avoid a changed view.
  const snapshot = Buffer.from(bytes);
  if (snapshot.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) return reject();
  const actual = createHash("sha256").update(snapshot).digest();
  if (!timingSafeEqual(actual, Buffer.from(expectedSha256, "hex"))) return reject();
  const parsed = b1.safeParse(parseUniqueJson(snapshot));
  if (!parsed.success) return reject();
  return parsed.data;
}

/** Pin must come from a separately verified A1/B1 handoff, not from this input.
 * No resulting authority is created. A new B1 revision requires a new pin. */
export function preflightC2B1(bytes: Uint8Array, expectedSha256: string): Readonly<{
  state: "B1_VALIDATED_NOT_AUTHORIZED"; input_sha256: string; scope_count: number; operation_count: number }> {
  const data = inspectPinnedC2B1NotAuthorized(bytes, expectedSha256);
  return Object.freeze({ state: "B1_VALIDATED_NOT_AUTHORIZED", input_sha256: expectedSha256,
    scope_count: data.acceptance.document.scopes.length,
    operation_count: data.acceptance.document.operations.length });
}
