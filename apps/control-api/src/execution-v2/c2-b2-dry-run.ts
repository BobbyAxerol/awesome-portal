import { z } from "zod";
import { inspectPinnedC2B1NotAuthorized } from "./c2-b1-preflight";

/** Offline rehearsal only. No approval, source I/O, signing, persistence,
 * runtime mounting, publication, or permission to perform any operation. */
const fail = (): never => { throw new Error("C2_B2_DRY_RUN_INVALID"); };
const text = z.string().min(1).max(512).refine(v => v.trim() === v && !/[\u0000-\u001f\u007f]/u.test(v)
  && !/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/u.test(v));
const scopeIdentifier = text.refine(v => Buffer.byteLength(v, "utf8") <= 128);
const timestamp = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|\+00:00)$/);
const portalFields = z.object({ acceptance_id: text, workspace_id: scopeIdentifier, workload_ref: scopeIdentifier,
  effective_from: timestamp, expires_at: timestamp,
  human_authority_revision: z.number().int().nonnegative().safe(), application_revision: text,
  acceptance_ref: text, delegation_ref: text }).strict();
export type C2B2DryRunPortalFields = z.infer<typeof portalFields>;

const REVOKED_CORE009 = ["b922c105-4e99-4830-8be2-bb2e1f41b5d9",
  "43506806fe2592ce77281a3f7e5c045830f7613ddde32c469d807cf73ec4a26c",
  "e28b9e3256b8127953df430b586a792d22663702057c6c8c42b2e6c8ee098983",
  "d54296c23b12607c3c0ebfbb2eb999b5853bd0fd1bb35708ed48ec287fbfbcc1",
  "2026-10-22t02:48:30z", "2026-10-22t02:48:30+00:00"];
const FORBIDDEN_WHOLE = new Set(["tbd", "todo", "dummy", "example", "none", "null", "n/a", "unset",
  "acceptance_ref", "delegation_ref", "publication", "delegation", "ref"]);
function checkProductionText(value: unknown): void {
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    if (/test[_-]only|fixture|placeholder|changeme|replace[_-]me|<[^<>]+>|\$\{[^{}]+\}/iu.test(value)
      || FORBIDDEN_WHOLE.has(lower) || /^([0-9a-f])\1{63}$/u.test(lower)
      || lower === "00000000-0000-0000-0000-000000000000") fail();
    for (const old of REVOKED_CORE009) {
      let offset = lower.indexOf(old);
      while (offset !== -1) {
        const before = lower[offset - 1], after = lower[offset + old.length];
        if ((!before || !/[a-z0-9]/.test(before)) && (!after || !/[a-z0-9]/.test(after))) fail();
        offset = lower.indexOf(old, offset + 1);
      }
    }
  } else if (Array.isArray(value)) for (const item of value) checkProductionText(item);
  else if (value && typeof value === "object") for (const item of Object.values(value)) checkProductionText(item);
}
function utcMillis(value: string): number {
  if (value.startsWith("0000-")) return fail();
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== value.replace(/(?:Z|\+00:00)$/, ".000Z")) return fail();
  return time;
}
/** Canonical output is equivalent to json.dumps(sort_keys=True,
 * separators=(',',':'),ensure_ascii=True,allow_nan=False) for this closed
 * schema: keys are ASCII, numbers are safe integers, no undefined/floats. */
function canonical(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value).replace(/[\u007f-\uffff]/g,
    char => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
  if (typeof value === "boolean" || typeof value === "number") {
    if (typeof value === "number" && !Number.isSafeInteger(value)) return fail();
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    if (keys.some(key => !/^[a-z_]+$/.test(key))) return fail();
    return `{${keys.map(key => `${canonical(key)}:${canonical(obj[key])}`).join(",")}}`;
  }
  return fail();
}

export function assembleC2B2DryRun(b1Bytes: Uint8Array, expectedB1Sha256: string, unknownPortalFields: unknown): Readonly<{
  state: "DRY_RUN_NOT_AUTHORIZED"; b1_sha256: string; canonical_payload_ascii: string }> {
  const input = inspectPinnedC2B1NotAuthorized(b1Bytes, expectedB1Sha256);
  const parsed = portalFields.safeParse(unknownPortalFields);
  if (!parsed.success) return fail();
  const p = parsed.data;
  const start = utcMillis(p.effective_from), end = utcMillis(p.expires_at);
  if (end <= start || end - start > 90 * 86400_000) return fail();
  const document = { ...input.acceptance.document, human_authority_revision: p.human_authority_revision,
    application_revision: p.application_revision, acceptance_ref: p.acceptance_ref, delegation_ref: p.delegation_ref };
  const payload = { schema: "pma.current-access.accepted-import.v1", expected_version: input.expected_version,
    head: { ...input.head, acceptance_id: p.acceptance_id, workspace_id: p.workspace_id, workload_ref: p.workload_ref },
    acceptance: { document, revoked: input.acceptance.revoked, effective_from: p.effective_from, expires_at: p.expires_at } };
  checkProductionText(payload.head); checkProductionText(payload.acceptance);
  const output = canonical(payload);
  if (Buffer.byteLength(output, "ascii") > 131_072) return fail();
  return Object.freeze({ state: "DRY_RUN_NOT_AUTHORIZED", b1_sha256: expectedB1Sha256, canonical_payload_ascii: output });
}
