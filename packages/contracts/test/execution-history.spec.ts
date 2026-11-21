/** ELP2-04 schema/fixture parity. TEST_ONLY examples are never source or HTTP receipts. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import { HISTORY_IDENTIFIER_FIELDS, HISTORY_DECIMAL_FIELDS, HISTORY_TEXT_FIELDS, HISTORY_PUBLIC_FIELDS,
  historyRowSchema, historyV2Schema } from "../../../apps/control-api/src/execution-v2/history.contract";

const root = resolve(__dirname, "..");
const load = (path: string) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const spec = load("openapi/execution-history.openapi.json");
const fixtures = load("fixtures/execution-history.synthetic.valid.json");
const schemas = JSON.parse(JSON.stringify(spec.components.schemas).replaceAll("#/components/schemas/", "#/$defs/"));
const schemaId = "https://test-only.invalid/contracts/execution-history.v2";
const ajv = new Ajv2020({ strict: false, allErrors: true });
ajv.addSchema({ $schema: "https://json-schema.org/draft/2020-12/schema", $id: schemaId, $defs: schemas });
function validates(name: string, value: unknown): boolean {
  const validate = ajv.getSchema(`${schemaId}#/$defs/${name}`);
  if (!validate) throw new Error(`Unknown execution-history fixture schema: ${name}`);
  return Boolean(validate(value));
}
function fixture(type: string, state?: string) {
  const found = fixtures.cases.find((entry: { type: string; value: { state?: string } }) =>
    entry.type === type && (state === undefined || entry.value.state === state));
  if (!found) throw new Error(`Missing TEST_ONLY history fixture: ${type}/${state ?? "any"}`);
  return structuredClone(found.value);
}
const available = () => fixture("ScopedHistoryResponse", "AVAILABLE");
const empty = () => fixture("ScopedHistoryResponse", "EMPTY");
const row = () => ({ timestamp_ms: 1_790_812_800_123, alpha_id: "alpha_TEST_ONLY", equity: "100.1234567890123456789" });
function rowParity(value: unknown, expected: boolean) {
  expect(validates("ScopedHistoryRow", value)).toBe(expected);
  expect(historyRowSchema.safeParse(value).success).toBe(expected);
}
function responseParity(value: unknown, expected: boolean) {
  expect(validates("ScopedHistoryResponse", value)).toBe(expected);
  expect(historyV2Schema.safeParse(value).success).toBe(expected);
}
const path = "/api/v1/execution/history/{environment}/{relationKey}";
const operation = spec.paths[path].get;

describe("ELP2-04 canonical history fixtures / server structural parity", () => {
  it.each(fixtures.cases)("valid canonical $type fixture, not a retained product receipt", (entry: { type: string; value: unknown }) => {
    expect(fixtures.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT");
    const valid = validates(entry.type, entry.value);
    const errors = ajv.getSchema(`${schemaId}#/$defs/${entry.type}`)!.errors;
    expect(valid, `${entry.type}: ${ajv.errorsText(errors)}`).toBe(true);
    if (entry.type === "ScopedHistoryResponse") expect(historyV2Schema.safeParse(entry.value).success).toBe(true);
  });

  it("publishes authorized available and empty V2 plus unchanged structural legacy examples", () => {
    expect(fixtures.cases.map((entry: { type: string; value: { state: string } }) => [entry.type, entry.value.state]))
      .toEqual([["ScopedHistoryResponse", "AVAILABLE"], ["ScopedHistoryResponse", "EMPTY"], ["LegacyHistoryResponse", "AVAILABLE"]]);
    expect(available()).toMatchObject({ schema_version: "portal.execution.timeseries-history.v2",
      authority: "PORTAL_SGP_HISTORY_MIRROR", completeness: "PARTIAL",
      reason_code: "N33_RETAINED_RANGE_NOT_AUTHORITATIVE_HISTORY",
      read_scope: { visibility: "SCOPED", coverage: "AUTHORIZED_ONLY" },
      coverage: { basis: "EXACT_AUTHORIZED_RETAINED_RANGE", range: "START_INCLUSIVE_END_EXCLUSIVE" } });
    expect(empty()).toMatchObject({ state: "EMPTY", items: [], coverage: { row_count: 0, oldest_ms: null, newest_ms: null },
      page: { returned_count: 0, has_more: false, next_cursor: null } });
  });

  it("closed row vocabulary is exactly the server's purpose-specific field set, not all scalar source fields", () => {
    const expected = ["timestamp_ms", ...HISTORY_IDENTIFIER_FIELDS, ...HISTORY_DECIMAL_FIELDS, ...HISTORY_TEXT_FIELDS];
    expect(Object.keys(spec.components.schemas.ScopedHistoryRow.properties).sort()).toEqual([...expected].sort());
    expect([...HISTORY_PUBLIC_FIELDS].sort()).toEqual([...expected].sort());
    expect(new Set(expected).size).toBe(expected.length);
    expect(spec.components.schemas.ScopedHistoryRow.additionalProperties).toBe(false);
    expect(spec.components.schemas.ScopedHistoryRow.required).toEqual(["timestamp_ms"]);
    for (const key of HISTORY_IDENTIFIER_FIELDS) rowParity({ timestamp_ms: 0, [key]: "id_TEST_ONLY" }, true);
    for (const key of HISTORY_DECIMAL_FIELDS) rowParity({ timestamp_ms: 0, [key]: "0" }, true);
    for (const key of HISTORY_TEXT_FIELDS) rowParity({ timestamp_ms: 0, [key]: "TEST_ONLY" }, true);
  });

  it.each(["private_key", "token", "jwt", "mtls", "host", "technical.topology", "custody", "physical_balance",
    "global_nav", "portfolio_total", "hidden_row_count", "source_cursor", "raw_source_payload", "unknown_field"])(
    "rejects hidden/technical/global row key %s rather than silently forwarding it", key => {
      rowParity({ ...row(), [key]: "TEST_ONLY-MUST-NOT-LEAVE" }, false);
      const response = available(); response.items[0][key] = "TEST_ONLY-MUST-NOT-LEAVE";
      responseParity(response, false);
    });

  it("all identifiers, decimal and text fields preserve omitted versus explicit null without inventing zero", () => {
    rowParity({ timestamp_ms: 0 }, true);
    const nullable = Object.fromEntries([...HISTORY_IDENTIFIER_FIELDS, ...HISTORY_DECIMAL_FIELDS, ...HISTORY_TEXT_FIELDS].map(key => [key, null]));
    rowParity({ timestamp_ms: 0, ...nullable }, true);
    const parsed = historyRowSchema.parse({ timestamp_ms: 0, equity: null, realized_pnl: "0" });
    expect(parsed).toEqual({ timestamp_ms: 0, equity: null, realized_pnl: "0" });
    expect(parsed).not.toHaveProperty("unrealized_pnl");
  });

  it.each(["0", "-0", "0.000", "-0.001", "1234567890123456789.1234567890123456789", "9".repeat(128)])(
    "retains exact decimal string %s without Number conversion", equity => {
      rowParity({ timestamp_ms: 0, equity }, true);
      expect(historyRowSchema.parse({ timestamp_ms: 0, equity })).toEqual({ timestamp_ms: 0, equity });
    });

  it.each([0, -1, 0.5, true, "", "1e3", "+1", "01", "1.", ".1", "NaN", "Infinity", " 1", "1 ", "1\n", "9".repeat(129)])(
    "rejects coerced, noncanonical or oversized decimal %#", equity => rowParity({ timestamp_ms: 0, equity }, false));

  it.each([[], {}, { value: "1" }, ["1"]].map(equity => ({ equity })))("closed row values remain scalar, not nested payload %#", ({ equity }) => {
    rowParity({ timestamp_ms: 0, equity }, false);
  });

  it.each([0, 1_790_812_800_123, Number.MAX_SAFE_INTEGER])("accepts explicit integral UTC epoch-ms %#", timestamp_ms => {
    rowParity({ timestamp_ms }, true);
    const value = available(); value.coverage.oldest_ms = timestamp_ms; value.coverage.newest_ms = timestamp_ms;
    responseParity(value, true);
  });

  it.each([undefined, null, -1, 0.5, "1790812800123", "2026-10-01T00:00:00.123Z", Number.MAX_SAFE_INTEGER + 1])(
    "rejects absent/coerced/fractional/unsafe row clocks %#", timestamp_ms => rowParity({ timestamp_ms }, false));

  it("identifier and public text boundaries use the declared Unicode-codepoint length on both sides", () => {
    for (const value of ["a".repeat(256), "😀".repeat(256), "TEST_ONLY opaque /:@ id"])
      rowParity({ timestamp_ms: 0, alpha_id: value, currency: value }, true);
    for (const value of ["", "a".repeat(257), "😀".repeat(257), "bad\u0000id", "bad\nid", "bad\u007fid"])
      rowParity({ timestamp_ms: 0, alpha_id: value }, false);
  });
});

describe("ELP2-04 scoped History envelope, bounds and runtime consistency", () => {
  it("legacy and scoped V2 schemas cannot be mixed or selected by adding a browser authority field", () => {
    const scoped = available(), legacy = fixture("LegacyHistoryResponse");
    expect(validates("LegacyHistoryResponse", scoped)).toBe(false);
    expect(validates("ScopedHistoryResponse", legacy)).toBe(false);
    expect(historyV2Schema.safeParse(legacy).success).toBe(false);
    responseParity({ ...scoped, schema_version: "portal.execution.timeseries-history.v1" }, false);
    responseParity({ ...scoped, coverage: legacy.coverage }, false);
    responseParity({ ...scoped, page: legacy.page }, false);
    expect(validates("LegacyHistoryResponse", { ...legacy, read_scope: scoped.read_scope })).toBe(false);
    for (const key of ["actor", "session_id", "allow_test_only", "qualification", "ts_receipt", "scope", "policy", "global_totals"])
      responseParity({ ...scoped, [key]: "TEST_ONLY-SPOOF" }, false);
  });

  it("scope/coverage/page subobjects are closed and cannot conceal hidden counts or raw keysets", () => {
    const source = available();
    for (const [container, key] of [["read_scope", "allowed_resource_ids"], ["coverage", "global_row_count"],
      ["coverage", "oldest_ts"], ["page", "next_after_ts"], ["page", "next_after_id"], ["page", "source_cursor"]]) {
      const value = available(); value[container][key] = "TEST_ONLY-HIDDEN";
      responseParity(value, false);
    }
    for (const visibility of ["ALL", "GLOBAL", "FULL_BUSINESS"]) responseParity({ ...source,
      read_scope: { ...source.read_scope, visibility } }, false);
    responseParity({ ...source, coverage: { ...source.coverage, basis: "EXACT_REQUESTED_RETAINED_RANGE" } }, false);
    responseParity({ ...source, completeness: "COMPLETE" }, false);
  });

  it("response scope policy revision is mandatory, opaque and bounded exactly as published", () => {
    for (const policy_revision of ["TEST_ONLY-r1", "a".repeat(256), "😀".repeat(256)]) {
      const value = available(); value.read_scope.policy_revision = policy_revision; responseParity(value, true);
    }
    for (const policy_revision of [null, "", 1, "a".repeat(257), "😀".repeat(257)]) {
      const value = available(); value.read_scope.policy_revision = policy_revision; responseParity(value, false);
    }
    const missing = available(); delete missing.read_scope.policy_revision; responseParity(missing, false);
  });

  it("the opaque continuation is null or bounded text, not exposed raw ts/id ordering", () => {
    for (const next_cursor of ["TEST_ONLY.signed.opaque", "x".repeat(4096)]) {
      const value = available(); value.page.has_more = true; value.page.next_cursor = next_cursor;
      responseParity(value, true);
      expect(historyV2Schema.parse(value).page.next_cursor).toBe(next_cursor);
    }
    for (const next_cursor of ["", 1, {}, { ts: 1, row_id: "TEST_ONLY" }, "x".repeat(4097), "bad cursor", "a/b", "😀", "x\n"] ) {
      const value = available(); value.page.has_more = true; value.page.next_cursor = next_cursor;
      responseParity(value, false);
    }
    // Structural validation never authenticates the signature or current
    // actor/policy binding. Those belong to the mounted HTTP/DB regressions.
    expect(operation.description).toContain("cursor changes");
  });

  it("accepts a full 2,000-row page and safe exact counts without turning page bounds into a history cap", () => {
    const value = available();
    value.items = Array.from({ length: 2000 }, (_, index) => ({ timestamp_ms: index, equity: "0" }));
    value.page = { ...value.page, returned_count: 2000, limit: 2000 };
    value.coverage = { ...value.coverage, row_count: Number.MAX_SAFE_INTEGER, oldest_ms: 0, newest_ms: 1999 };
    responseParity(value, true);
    expect(operation.parameters.find((entry: { name: string }) => entry.name === "limit").description).toContain("not a total-history cap");
  });

  it("refuses over-bound pages, unsafe counters and altered byte-budget declarations", () => {
    for (const patch of [{ limit: 0 }, { limit: 2001 }, { limit: 0.5 }, { limit: "500" },
      { returned_count: -1 }, { returned_count: 2001 }, { maximum_response_bytes: 1048577 }]) {
      const value = available(); value.page = { ...value.page, ...patch }; responseParity(value, false);
    }
    for (const row_count of [-1, 0.5, "2", Number.MAX_SAFE_INTEGER + 1]) {
      const value = available(); value.coverage.row_count = row_count; responseParity(value, false);
    }
    const excess = available(); excess.items = Array.from({ length: 2001 }, row); responseParity(excess, false);
  });

  it("runtime enforces sibling-field invariants beyond standard JSON Schema primitives", () => {
    expect(spec.components.schemas.ScopedHistoryResponse.description).toContain("Runtime also checks cross-field");
    const invalid = [
      (() => { const value = available(); value.page.returned_count = 1; return value; })(),
      (() => { const value = available(); value.page.limit = 1; return value; })(),
      (() => { const value = available(); value.page.has_more = true; return value; })(),
      (() => { const value = available(); value.page.next_cursor = "TEST_ONLY-invalid-pair"; return value; })(),
      (() => { const value = available(); value.coverage.row_count = 1; return value; })(),
      (() => { const value = available(); value.coverage.oldest_ms = value.coverage.newest_ms + 1; return value; })(),
      (() => { const value = available(); value.coverage.oldest_ms = null; return value; })(),
      (() => { const value = empty(); value.state = "AVAILABLE"; return value; })(),
      (() => { const value = empty(); value.coverage.oldest_ms = 0; return value; })(),
      (() => { const value = empty(); value.page.has_more = true; value.page.next_cursor = "TEST_ONLY-invalid-empty-next"; return value; })(),
    ];
    for (const value of invalid) {
      expect(validates("ScopedHistoryResponse", value)).toBe(true);
      expect(historyV2Schema.safeParse(value).success).toBe(false);
    }
  });
});

describe("ELP2-04 named compatibility operation / canonical generation", () => {
  it("retains one authenticated deprecated GET with a server-selected legacy-or-scoped response", () => {
    expect(spec.openapi).toBe("3.1.0");
    expect(Object.keys(spec.paths)).toEqual([path]);
    expect(Object.keys(spec.paths[path])).toEqual(["get"]);
    expect(operation.operationId).toBe("executionRetainedHistoryGet");
    expect(operation.deprecated).toBe(true);
    expect(operation.security).toEqual([{ PortalSession: [] }]);
    expect(spec.components.securitySchemes.PortalSession).toEqual({ type: "apiKey", in: "cookie", name: "__Host-portal_session" });
    expect(operation.responses[200].content["application/json"].schema).toEqual({ oneOf: [
      { $ref: "#/components/schemas/ScopedHistoryResponse" }, { $ref: "#/components/schemas/LegacyHistoryResponse" },
    ] });
    expect(operation).not.toHaveProperty("requestBody");
    for (const status of [400, 401, 403, 404, 409, 503])
      expect(operation.responses[status].content["application/json"].schema).toEqual({ $ref: "#/components/schemas/HistoryProblem" });
  });

  it("publishes exact query bounds and marks raw cursors legacy-only, without actor/trust selectors", () => {
    const parameters = operation.parameters;
    expect(parameters.filter((entry: { in: string }) => entry.in === "query").map((entry: { name: string }) => entry.name))
      .toEqual(["workspace_id", "from", "to", "limit", "cursor", "after_ts", "after_id", "account_id", "portfolio_id", "deployment_id", "strategy_id", "instrument_id"]);
    expect(parameters.find((entry: { name: string }) => entry.name === "limit").schema)
      .toEqual({ type: "integer", minimum: 1, maximum: 2000, default: 500 });
    expect(parameters.find((entry: { name: string }) => entry.name === "cursor").schema)
      .toEqual({ type: "string", minLength: 1, maxLength: 4096, pattern: "^[A-Za-z0-9._-]+$(?![\\s\\S])" });
    for (const name of ["after_ts", "after_id"]) {
      const parameter = parameters.find((entry: { name: string }) => entry.name === name);
      expect(parameter.deprecated).toBe(true); expect(parameter.description).toContain("V2 refuses");
    }
    for (const key of ["schema_version", "actor", "role", "qualification", "allow_test_only", "scope", "sql", "url", "jwt", "mtls"])
      expect(parameters.some((entry: { name: string }) => entry.name === key), key).toBe(false);
  });

  it("typed public refusals cannot attach hidden counts, authority material or raw source payloads", () => {
    const value = { error: { code: "EXECUTION_READ_NOT_AVAILABLE", message: "The requested Execution read is not available." }, request_id: "TEST_ONLY_request" };
    expect(validates("HistoryProblem", value)).toBe(true);
    for (const key of ["global_row_count", "raw_source_payload", "ts_receipt", "token", "sql"])
      expect(validates("HistoryProblem", { ...value, [key]: "TEST_ONLY-private" })).toBe(false);
    expect(validates("HistoryProblem", { ...value, error: { ...value.error, raw_exception: "TEST_ONLY-private" } })).toBe(false);
  });

  it("canonical generators, checked declarations and drift verification remain connected", () => {
    const generator = readFileSync(resolve(root, "tooling/generate-execution-history.mjs"), "utf8");
    const manifest = load("package.json");
    const verifier = readFileSync(resolve(root, "tooling/verify-generated.sh"), "utf8");
    expect(generator).toContain("openapi/execution-history.openapi.json");
    expect(generator).toContain("fixtures/execution-history.synthetic.valid.json");
    expect(generator).toContain("--check"); expect(generator).toContain("Generated drift:");
    const command = manifest.scripts["generate:execution-history"];
    expect(command).toContain("node tooling/generate-execution-history.mjs");
    expect(command).toContain("openapi-typescript openapi/execution-history.openapi.json -o generated/execution-history.d.ts");
    expect(manifest.scripts.postgenerate).toContain("generate:execution-history");
    expect(verifier).toContain("node tooling/generate-execution-history.mjs --check");
    expect(verifier).toContain("generate_and_compare openapi/execution-history.openapi.json generated/execution-history.d.ts");
    const generated = readFileSync(resolve(root, "generated/execution-history.d.ts"), "utf8");
    expect(generated).toContain(`"${path}"`);
    expect(generated).toContain("executionRetainedHistoryGet:");
    for (const name of Object.keys(spec.components.schemas)) expect(generated).toContain(`${name}:`);
  });
});
