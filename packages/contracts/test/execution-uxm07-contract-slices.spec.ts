/**
 * UXM-07 additive contract slices: FE-056 (operator task display metadata), FE-049 (fleet v2 Decimal bound and
 * PARTIAL metric state) and FE-061 (closed error-code vocabularies). The source side of FE-061 (every code the
 * control-api actually throws) is checked by apps/control-api/test/problem-code-vocabulary.spec.ts.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import { pendingControlReason } from "../../../apps/control-api/src/execution-v2/pending-control.contract";
import {
  ACCESS_PROBLEM_CODES, ACCESS_REFUSAL_CODES, MUTATION_SECURITY_CODES, pendingControlProblemCodes,
} from "../tooling/execution-problem-vocabulary.mjs";

const root = resolve(__dirname, "..");
const load = (path: string) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const clone = <T>(value: T): T => structuredClone(value);

describe("FE-056 operator task display metadata", () => {
  const schema = load("schemas/execution-command-tasks.v1.schema.json");
  const fixture = load("fixtures/execution-command-tasks.valid.json");
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  addFormats(ajv);
  ajv.addSchema(schema);
  const validate = ajv.getSchema(schema.$id)!;
  const validateTask = ajv.getSchema(`${schema.$id}#/$defs/Task`)!;
  const task = () => clone(fixture.tasks[0]);

  it("publishes the three keys as optional bounded strings and leaves the catalogue revision alone", () => {
    const definition = schema.$defs.Task;
    for (const key of ["display_name", "description", "scope_label"]) {
      expect(definition.properties[key].type).toBe("string");
      expect(definition.properties[key].minLength).toBe(1);
      expect(definition.properties[key].maxLength).toBeLessThanOrEqual(240);
      expect(definition.required).not.toContain(key);
    }
    expect(definition.additionalProperties).toBe(false);
    // Additive: the task set, its order and the revision consumers pin are unchanged.
    expect(schema.properties.catalogue_revision).toEqual({ const: 3 });
    expect(fixture.catalogue_revision).toBe(3);
  });

  it("the canonical fixture validates and gives every one of the 24 tasks honest, distinct display text", () => {
    expect(validate(fixture), JSON.stringify(validate.errors)).toBe(true);
    expect(fixture.tasks).toHaveLength(24);
    for (const row of fixture.tasks) {
      expect(typeof row.display_name, row.task_id).toBe("string");
      expect(typeof row.description, row.task_id).toBe("string");
      expect(typeof row.scope_label, row.task_id).toBe("string");
      // `meta` stays the source reference; it is not replaced by prose.
      expect(row.meta).toMatch(/^(cli\/__main__\.py:\d+|Portal-curated task; source operation not published)$/);
    }
    expect(new Set(fixture.tasks.map((row: { display_name: string }) => row.display_name)).size).toBe(24);
  });

  it("keeps older bodies valid: the keys may be absent", () => {
    const legacy = task();
    delete legacy.display_name; delete legacy.description; delete legacy.scope_label;
    expect(validateTask(legacy), JSON.stringify(validateTask.errors)).toBe(true);
  });

  it("rejects control and bidirectional-format characters, empty text, over-long text and unknown keys", () => {
    for (const key of ["display_name", "description", "scope_label"]) {
      for (const bad of ["", "line\nbreak", "tab\tstop", "nul\u0000", "del\u007f", "c1\u0085", "rlo ‮ reversed",
        "isolate ⁦ x ⁩", "mark‎", "alm؜"]) {
        const row = task(); row[key] = bad;
        expect(validateTask(row), `${key} ${JSON.stringify(bad)}`).toBe(false);
      }
      const limit = key === "description" ? 240 : 80;
      const atLimit = task(); atLimit[key] = "a".repeat(limit);
      expect(validateTask(atLimit), `${key} at ${limit}`).toBe(true);
      const over = task(); over[key] = "a".repeat(limit + 1);
      expect(validateTask(over), `${key} over ${limit}`).toBe(false);
      const wrongType = task(); wrongType[key] = null;
      expect(validateTask(wrongType), `${key} null`).toBe(false);
    }
    expect(validateTask({ ...task(), display: "x" })).toBe(false);
  });
});

describe("FE-049 alpha fleet list v2 hardening", () => {
  const schema = load("schemas/execution-alpha-fleet-list.v2.schema.json");
  const fixture = load("fixtures/execution-alpha-fleet-list.v2.valid.json");
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  addFormats(ajv);
  ajv.addSchema(schema);
  const validate = ajv.getSchema(`${schema.$id}#/$defs/AlphaFleetResponse`)!;

  it("accepts the canonical fixture and the PARTIAL state the server emits for the 30-day metrics", () => {
    expect(validate(fixture), JSON.stringify(validate.errors)).toBe(true);
    expect(schema.$defs.MetricState.properties.state.enum).toEqual(["AVAILABLE", "EMPTY", "PARTIAL", "UNAVAILABLE"]);
    const partial = clone(fixture);
    partial.page.rows[0].metrics_availability.equity_series_30d = { state: "PARTIAL", reason_code: "SOURCE_30D_WINDOW_INCOMPLETE" };
    partial.page.rows[0].metrics_availability.max_drawdown_30d = { state: "PARTIAL", reason_code: "SOURCE_30D_WINDOW_INCOMPLETE" };
    expect(validate(partial), JSON.stringify(validate.errors)).toBe(true);
    const invented = clone(fixture);
    invented.page.rows[0].metrics_availability.equity_series_30d = { state: "DENIED", reason_code: null };
    expect(validate(invented)).toBe(false);
  });

  it("bounds every Decimal at 128 characters", () => {
    expect(schema.$defs.Decimal.maxLength).toBe(128);
    const atLimit = clone(fixture);
    atLimit.page.rows[0].allocations = [{ currency: "USDT", value: "1".repeat(128) }];
    expect(validate(atLimit), JSON.stringify(validate.errors)).toBe(true);
    const over = clone(fixture);
    over.page.rows[0].allocations = [{ currency: "USDT", value: "1".repeat(129) }];
    expect(validate(over)).toBe(false);
    const overFraction = clone(fixture);
    overFraction.page.rows[0].deployments[0].net_pnl = `0.${"1".repeat(128)}`;
    expect(validate(overFraction)).toBe(false);
  });
});

describe("FE-061 closed problem-code vocabularies", () => {
  const access = load("openapi/execution-access.openapi.json");
  const pending = load("openapi/execution-pending-control.openapi.json");
  const accessCodes: string[] = access.components.schemas.AccessProblem.properties.error.properties.code.enum;
  const pendingCodes: string[] = pending.components.schemas.PendingControlProblem.properties.error.properties.code.enum;
  const compile = (spec: { components: { schemas: unknown } }, id: string, name: string) => {
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    ajv.addSchema({
      $schema: "https://json-schema.org/draft/2020-12/schema", $id: id,
      $defs: JSON.parse(JSON.stringify(spec.components.schemas).replaceAll("#/components/schemas/", "#/$defs/")),
    });
    return ajv.getSchema(`${id}#/$defs/${name}`)!;
  };
  const validateAccess = compile(access, "https://test-only.invalid/access", "AccessProblem");
  const validatePending = compile(pending, "https://test-only.invalid/pending", "PendingControlProblem");
  const body = (code: string) => ({ error: { code, message: "TEST_ONLY" }, request_id: "TEST_ONLY_request" });

  it("derives the published enums from the single vocabulary module, without duplicates", () => {
    expect(accessCodes).toEqual([...ACCESS_PROBLEM_CODES]);
    expect(pendingCodes).toEqual([...pendingControlProblemCodes(pendingControlReason.options)]);
    expect(new Set(accessCodes).size).toBe(accessCodes.length);
    expect(new Set(pendingCodes).size).toBe(pendingCodes.length);
  });

  it("covers the retry-relevant access refusals and the mutation-security codes on both families", () => {
    for (const code of ["ACCESS_RETRY_REQUIRED", "ACCESS_SCOPE_LIMIT_EXCEEDED", "ACCESS_CURSOR_INVALID", "STEP_UP_REQUIRED",
      "ACCESS_INPUT_INVALID", "IDEMPOTENCY_KEY_REQUIRED", "SESSION_REQUIRED"]) expect(accessCodes).toContain(code);
    for (const code of [...ACCESS_REFUSAL_CODES, ...MUTATION_SECURITY_CODES]) {
      expect(accessCodes).toContain(code);
      expect(pendingCodes).toContain(code);
    }
    expect(pendingCodes).toContain("PENDING_CONTROL_INPUT_INVALID");
    for (const code of pendingControlReason.options) expect(pendingCodes).toContain(code);
    expect(accessCodes).not.toContain("PENDING_CONTROL_INPUT_INVALID");
  });

  it("accepts every published code and rejects anything outside the vocabulary", () => {
    for (const code of accessCodes) expect(validateAccess(body(code)), code).toBe(true);
    for (const code of pendingCodes) expect(validatePending(body(code)), code).toBe(true);
    for (const code of ["ANYTHING", "", "access_denied", "ACCESS_DENIED ", "PENDING_CONTROL_NEW_THING"]) {
      expect(validateAccess(body(code)), `access ${JSON.stringify(code)}`).toBe(false);
      expect(validatePending(body(code)), `pending ${JSON.stringify(code)}`).toBe(false);
    }
    // PendingControlProblem keeps its other fields; a pending-only code is not an access code.
    expect(validatePending({ ...body("PENDING_CONTROL_UNAVAILABLE"), public_copy_key: "PENDING_CONTROL_UNAVAILABLE",
      safe_next_action: "QUERY_SAME_INTENT" })).toBe(true);
    expect(validateAccess(body("PENDING_CONTROL_UNAVAILABLE"))).toBe(false);
  });
});
