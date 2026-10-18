// Public contract/fixture parity; real source qualification is a separate gate.
// Canonical TEST_ONLY examples test public shape, never installed-source authority.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import type { ZodTypeAny } from "zod";
import { pendingControlIntent, pendingControlSubmit, pendingControlQuery, pendingControlPreview,
  pendingControlStatus, pendingRecallReceipt, pendingAmounts }
  from "../../../apps/control-api/src/execution-v2/pending-control.contract";

const root = resolve(__dirname, "..");
const load = (path: string) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const api = load("openapi/execution-pending-control.openapi.json");
const fixture = load("fixtures/execution-pending-control.synthetic.valid.json");
const ajv = new Ajv2020({ strict: false });
const validators = new Map<string, ReturnType<typeof ajv.compile>>();
function compile(name: string) {
  if (!validators.has(name)) validators.set(name, ajv.compile({ $ref: "#/components/schemas/" + name,
    components: { schemas: api.components.schemas } }));
  return validators.get(name)!;
}
function same(name: string, runtime: ZodTypeAny, value: unknown, expected: boolean) {
  const validate = compile(name);
  expect(validate(value), JSON.stringify(validate.errors)).toBe(expected);
  // Deliberately assert no throw: guarded BigInt must survive malformed lexical input.
  let result: ReturnType<ZodTypeAny["safeParse"]> | undefined;
  expect(() => { result = runtime.safeParse(value); }).not.toThrow();
  expect(result?.success).toBe(expected);
}
const copy = <T>(value: T): T => structuredClone(value);
const base = "/api/v1/execution/pending-recalls";
const validCases: readonly [string, string, ZodTypeAny][] = [
  ["PendingControlIntent", "intent", pendingControlIntent],
  ["PendingControlIntent", "intent_deployment", pendingControlIntent],
  ["PendingControlSubmit", "submit", pendingControlSubmit],
  ["PendingControlQuery", "query", pendingControlQuery],
  ["PendingControlPreview", "preview_blocked", pendingControlPreview],
  ["PendingControlPreview", "preview_allowed", pendingControlPreview],
  ["PendingControlPreview", "preview_cancel", pendingControlPreview],
  ...["unknown", "failed_before_send", "waiting", "applied", "cancelled", "partially_applied_cancelled",
    "rejected", "linked_operation_not_published"].map((key): [string, string, ZodTypeAny] =>
    ["PendingControlStatus", key, pendingControlStatus]),
];
describe("ELP2-07 separate existing pending recall control public contract", () => {
  it("publishes exactly four named session-guarded operations with no-store on every declared response", () => {
    expect(Object.keys(api.paths).sort()).toEqual([base, base + "/preview", base + "/{id}", base + "/{id}/reconcile"].sort());
    expect(api.components.securitySchemes.PortalSession).toEqual({ type: "apiKey", in: "cookie", name: "__Host-portal_session" });
    const operations = Object.values(api.paths).flatMap(path => Object.values(path as Record<string, any>));
    expect(operations.map((operation: any) => operation.operationId).sort()).toEqual([
      "Preview", "Submit", "Status", "Reconcile",
    ].map(suffix => "executionPendingControl" + suffix + "V1").sort());
    for (const operation of operations as any[]) {
      expect(operation.security).toEqual([{ PortalSession: [] }]);
      expect(Object.keys(operation.responses).sort()).toEqual(["200", "400", "401", "403", "404", "409", "503"]);
      for (const response of Object.values(operation.responses) as any[])
        expect(response.headers["Cache-Control"].schema.const).toBe("private, no-store");
      expect(operation.responses[502]).toBeUndefined();
    }
    expect(api.paths[base + "/{id}"].get.requestBody).toBeUndefined();
    expect(api.paths[base + "/{id}"].post).toBeUndefined();
    expect(api.paths[base].get).toBeUndefined();
  });
  it("requires Origin, current-session double CSRF and idempotency on all POSTs, not the read-only GET", () => {
    for (const [path, method] of [[base + "/preview", "post"], [base, "post"], [base + "/{id}/reconcile", "post"]]) {
      const operation = api.paths[path][method];
      for (const name of ["Origin", "x-portal-csrf", "x-portal-idempotency-key"])
        expect(operation.parameters.find((p: any) => p.in === "header" && p.name === name)?.required).toBe(true);
      const key = operation.parameters.find((p: any) => p.name === "x-portal-idempotency-key");
      const validate = ajv.compile(key.schema);
      expect(validate("TEST_ONLY:pending-key")).toBe(true);
      for (const bad of ["short", "a".repeat(129), "TEST_ONLY:key\n", "not a valid key"])
        expect(validate(bad)).toBe(false);
    }
    const get = api.paths[base + "/{id}"].get;
    expect(get.parameters.some((p: any) => p.in === "header")).toBe(false);
    expect(get.parameters.find((p: any) => p.name === "workspace_id")?.required).toBe(true);
    expect(get.description).toMatch(/independent current audit.read/);
    expect(get.description).toMatch(/No upstream lookup\/write/);
    expect(api.paths[base + "/{id}/reconcile"].post.description).toMatch(/never resend/);
    expect(api.paths[base + "/preview"].post.description).toMatch(/Default-dark/);
  });
  it.each(validCases)("%s/%s fixture passes finite JSON and runtime shape, not commissioning", (name, key, runtime) => {
    same(name, runtime, fixture[key], true);
    same(name, runtime, { ...fixture[key], actor_id: "forbidden" }, false);
    expect(fixture.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT");
    expect(fixture.runtime_qualified).toBe(false);
  });
  it("keeps the source discriminator closed and exact target kinds, without ROOT/new-recall/amount fields", () => {
    const original = fixture.intent;
    for (const payload of [
      { ...original.business_payload, operation: "RECALL_FULL" },
      { ...original.business_payload, recipient_kind: "ROOT" },
      { ...original.business_payload, recipient_account_id: "unexpected" },
      ...["amount", "source_url", "actor_id", "human_context", "recipient_instance_id", "target_ref"]
        .map(key => ({ ...original.business_payload, [key]: "forbidden" })),
      { ...original.business_payload, expected_versions: { ...original.business_payload.expected_versions, extra: "1" } },
    ]) same("PendingControlIntent", pendingControlIntent, { ...original, business_payload: payload }, false);
    same("PendingControlIntent", pendingControlIntent, { ...original,
      resource: { kind: "DEPLOYMENT", id: "wrong-kind" } }, false);
    same("PendingControlIntent", pendingControlIntent, { ...fixture.intent_deployment,
      resource: { kind: "PORTFOLIO", id: "wrong-kind" } }, false);
    same("PendingControlIntent", pendingControlIntent, { ...original,
      resource: { kind: "ROOT", id: "no-root-continuation" } }, false);
  });
  it("preserves all five source int64 STRING counters and separate opaque Portal policy revision", () => {
    const original = fixture.intent;
    expect(original.expected_policy_revision).toBe("TEST_ONLY:portal-policy");
    expect(original.business_payload.expected_versions.budget).toBe("9007199254740993");
    for (const field of ["budget", "source", "parent", "book", "command"]) {
      for (const counter of ["0", "9007199254740993", "9223372036854775807"])
        same("PendingControlIntent", pendingControlIntent, { ...original, business_payload: {
          ...original.business_payload, expected_versions: { ...original.business_payload.expected_versions, [field]: counter },
        } }, true);
      for (const counter of [1, "", "01", "+1", "-1", "1.0", "1e3", "9223372036854775808",
        "9999999999999999999", "9223372036854775807\n", "not-a-bigint"]) {
        same("PendingControlIntent", pendingControlIntent, { ...original, business_payload: {
          ...original.business_payload, expected_versions: { ...original.business_payload.expected_versions, [field]: counter },
        } }, false);
      }
      const missing = copy(original); delete missing.business_payload.expected_versions[field];
      same("PendingControlIntent", pendingControlIntent, missing, false);
    }
  });
  it("preserves PM512-byte source text instead of narrowing it to Portal256 metadata", () => {
    const original = fixture.intent;
    for (const text of ["x".repeat(300), "x".repeat(512), "é".repeat(256)])
      same("PendingControlIntent", pendingControlIntent, { ...original,
        business_payload: { ...original.business_payload, reason: text } }, true);
    for (const text of ["", " x", "x ", "\u0085x", "x\u3000", "x\n", "x\u0000y", "x".repeat(513)])
      same("PendingControlIntent", pendingControlIntent, { ...original,
        business_payload: { ...original.business_payload, reason: text } }, false);
    same("PendingControlQuery", pendingControlQuery, { workspace_id: "x".repeat(256) }, true);
    same("PendingControlQuery", pendingControlQuery, { workspace_id: "😀".repeat(256) }, true);
    for (const text of ["", "x".repeat(257), "x\n", "x\u007f"])
      same("PendingControlQuery", pendingControlQuery, { workspace_id: text }, false);
  });
  it("admits a rollback preview only with all complete nonnull source prediction/context fields", () => {
    const good = fixture.preview_allowed, blocked = fixture.preview_blocked;
    for (const field of ["preview_digest", "expires_at_ms", "profile_ref", "prediction"])
      same("PendingControlPreview", pendingControlPreview, { ...good, [field]: null }, false);
    same("PendingControlPreview", pendingControlPreview, { ...good, reason_code: "PENDING_CONTROL_NOT_QUALIFIED" }, false);
    same("PendingControlPreview", pendingControlPreview, { ...blocked, reason_code: null }, false);
    for (const field of ["preview_digest", "expires_at_ms", "profile_ref", "prediction"])
      same("PendingControlPreview", pendingControlPreview, { ...blocked, [field]: good[field] }, false);
    for (const key of ["reserved", "business_applied"])
      same("PendingControlPreview", pendingControlPreview, { ...good, [key]: true }, false);
    same("PendingControlPreview", pendingControlPreview, { ...good,
      prediction: { ...good.prediction, state: "UNKNOWN" } }, false);
    same("PendingControlPreview", pendingControlPreview, { ...good,
      prediction: { ...good.prediction, blockers: Array(129).fill("TEST_ONLY:blocker") } }, false);
    for (const digest of ["a".repeat(64), "sha256:" + "A".repeat(64), good.preview_digest + "\n"])
      same("PendingControlSubmit", pendingControlSubmit, { ...fixture.submit, preview_digest: digest }, false);
  });
  it("enforces ACK iff business known and exact next-action/known receipt coupling for every declared state", () => {
    for (const key of ["waiting", "applied", "cancelled", "partially_applied_cancelled", "rejected"]) {
      const value = fixture[key];
      for (const delivery of ["PREPARED", "SENDING", "DELIVERY_UNKNOWN", "FAILED_BEFORE_SEND"])
        same("PendingControlStatus", pendingControlStatus, { ...value, delivery }, false);
      for (const field of ["amounts", "receipt", "business_applied"])
        same("PendingControlStatus", pendingControlStatus, { ...value, business: { ...value.business, [field]: null } }, false);
      const expected = key === "waiting" ? "QUERY_SAME_INTENT" : "REVIEW_RECEIPT";
      for (const next_action of ["QUERY_SAME_INTENT", "REVIEW_RECEIPT", "REVIEW_BLOCKER"].filter(action => action !== expected))
        same("PendingControlStatus", pendingControlStatus, { ...value, next_action }, false);
      same("PendingControlStatus", pendingControlStatus, { ...value,
        business: { ...value.business, business_applied: !value.business.business_applied } }, false);
    }
    const unknown = fixture.unknown;
    same("PendingControlStatus", pendingControlStatus, { ...unknown, delivery: "ACKNOWLEDGED" }, false);
    for (const delivery of ["PREPARED", "SENDING", "DELIVERY_UNKNOWN", "FAILED_BEFORE_SEND"]) {
      const next_action = delivery === "FAILED_BEFORE_SEND" ? "REVIEW_BLOCKER" : "QUERY_SAME_INTENT";
      same("PendingControlStatus", pendingControlStatus, { ...unknown, delivery, next_action }, true);
      for (const action of ["QUERY_SAME_INTENT", "REVIEW_RECEIPT", "REVIEW_BLOCKER"].filter(action => action !== next_action))
        same("PendingControlStatus", pendingControlStatus, { ...unknown, delivery, next_action: action }, false);
    }
    for (const extra of [{ business_applied: false }, { amounts: fixture.waiting.business.amounts },
      { receipt: fixture.waiting.business.receipt }, { blockers: ["TEST_ONLY:blocker"] }])
      same("PendingControlStatus", pendingControlStatus, { ...unknown, business: { ...unknown.business, ...extra } }, false);
    expect(fixture.waiting.business.amounts.applied).toBe("25"); // WAITING is NOT zero-applied.
  });
  it("makes latest-operation absence explicit without replacing the immutable original control identity", () => {
    const original = fixture.applied.business.receipt;
    const linked = fixture.linked_operation_not_published.business.receipt;
    same("PendingRecallReceipt", pendingRecallReceipt, original, true);
    same("PendingRecallReceipt", pendingRecallReceipt, linked, true);
    expect(linked.control_receipt_id).toBe(original.control_receipt_id);
    expect(linked.latest_receipt_id).not.toBe(linked.control_receipt_id);
    expect(linked.latest_operation).toBeNull();
    expect(linked.control_receipt_id).not.toBe(fixture.intent.business_payload.idempotency_key);
    for (const receipt of [
      { ...original, latest_operation: null },
      { ...original, latest_operation_reason: "SOURCE_OPERATION_NOT_PUBLISHED" },
      { ...linked, latest_operation: fixture.intent.business_payload.operation },
      { ...linked, latest_operation_reason: null },
      { ...linked, latest_operation_availability: "MISSING" },
      { ...original, original_payload_sha256: "sha256:" + original.original_payload_sha256 },
      { ...original, original_payload_sha256: original.original_payload_sha256 + "\n" },
      { ...original, latest_operation: "FUND" },
    ]) same("PendingRecallReceipt", pendingRecallReceipt, receipt, false);
  });
  it("rejects financial/transfer/projection inventions and malformed decimal strings", () => {
    for (const extra of [{ economic_cash_changed: true }, { physical_transfer_performed: true },
      { projection: "CURRENT" }, { venue: "FILLED" }, { family: "CAPITAL" }, { authority: "QUALIFIED" },
      { business: { ...fixture.applied.business, state: "PARTIALLY_APPLIED" } }])
      same("PendingControlStatus", pendingControlStatus, { ...fixture.applied, ...extra }, false);
    for (const requested of [100, "01", "-1", "1e2", "100\n", "NaN", "9".repeat(129)])
      same("PendingControlAmounts", pendingAmounts, { ...fixture.applied.business.amounts, requested }, false);
    for (const value of ["ecm_" + "f".repeat(32) + "\n", "ecm_" + "F".repeat(32), "not-a-command"])
      same("PendingControlStatus", pendingControlStatus, { ...fixture.unknown, command_id: value }, false);
  });
  it("retains fixed problem shape, without private source frames or trusted authority in errors", () => {
    const validate = compile("PendingControlProblem");
    expect(validate({ error: { code: "PENDING_CONTROL_RECEIPT_UNVERIFIED", message: "Query the original request." },
      request_id: "TEST_ONLY:request", safe_next_action: "QUERY_SAME_INTENT" })).toBe(true);
    expect(validate({ error: { code: "x", message: "x", raw_source: {} }, request_id: "x" })).toBe(false);
    expect(validate({ error: { code: "x", message: "x" }, request_id: "x", source_receipt: {} })).toBe(false);
  });
  it("does not widen existing financial or registration families", () => {
    const capital = load("openapi/execution-trusted-commands.openapi.json");
    expect(capital.components.schemas.CommandStatus.properties.operation.enum).toEqual([
      "FUND", "INITIAL_GRANT", "TOP_UP", "IMMEDIATE_DECREASE", "RECALL_PARTIAL", "RECALL_FULL", "ADJUST_TARGET_BUDGET", "SET_ROOT_LIMIT",
    ]);
    const registration = load("openapi/execution-instance-registration.openapi.json");
    expect(registration.components.schemas.InstanceRegistrationStatus.properties.family.const).toBe("INSTANCE_REGISTRATION");
    expect(registration.components.schemas.InstanceRegistrationStatus.properties.operation.const).toBe("REGISTER_INSTANCE");
    expect(api.components.schemas.PendingControlStatus.properties.family.const).toBe("PENDING_RECALL_CONTROL");
    expect(api.components.schemas.PendingControlBody.oneOf).toHaveLength(2);
  });
  it("documents portable JSON limits explicitly instead of pretending arithmetic/UTF8/equality/clock parity", () => {
    // Portable JSON Schema cannot compare arbitrary sibling field values.
    const mismatch = copy(fixture.intent_deployment);
    mismatch.business_payload.recipient_deployment_id = "TEST_ONLY:another-deployment";
    expect(compile("PendingControlIntent")(mismatch)).toBe(true);
    expect(pendingControlIntent.safeParse(mismatch).success).toBe(false);
    // 300 codepoints, but 600 bytes: JSON codepoint maximum is necessary, not sufficient.
    const overBytes = copy(fixture.intent); overBytes.business_payload.reason = "é".repeat(300);
    expect(compile("PendingControlIntent")(overBytes)).toBe(true);
    expect(pendingControlIntent.safeParse(overBytes).success).toBe(false);
    const malformedUtf16 = { workspace_id: "TEST_ONLY:\ud800" };
    expect(compile("PendingControlQuery")(malformedUtf16)).toBe(true);
    expect(pendingControlQuery.safeParse(malformedUtf16).success).toBe(false);
    const arithmetic = { ...fixture.applied.business.amounts, requested: "101" };
    expect(compile("PendingControlAmounts")(arithmetic)).toBe(true);
    expect(pendingAmounts.safeParse(arithmetic).success).toBe(false);
    const chronology = { ...fixture.applied, updated_at_ms: fixture.applied.created_at_ms - 1 };
    expect(compile("PendingControlStatus")(chronology)).toBe(true);
    expect(pendingControlStatus.safeParse(chronology).success).toBe(false);
    // The existing opaqueRevision max(256) counts JS UTF16 units; JSON maxLength counts codepoints.
    const opaqueUtf16 = { ...fixture.intent, expected_policy_revision: "😀".repeat(129) };
    expect(compile("PendingControlIntent")(opaqueUtf16)).toBe(true);
    expect(pendingControlIntent.safeParse(opaqueUtf16).success).toBe(false);
  });
});
