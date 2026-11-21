import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { serviceHeartbeatsPageSchema, serviceHeartbeatsQuerySchema }
  from "../../../apps/control-api/src/execution-v2/service-heartbeats.contract";
const spec = JSON.parse(readFileSync(new URL("../openapi/execution-scoped-records.openapi.json", import.meta.url), "utf8"));
const fixtures = JSON.parse(readFileSync(new URL("../fixtures/execution-scoped-records.synthetic.valid.json", import.meta.url), "utf8"));
const ajv = new Ajv2020({ strict: false, allErrors: true }); ajv.addSchema(spec, "heartbeat");
const validate = ajv.getSchema("heartbeat#/components/schemas/ServiceHeartbeatsPage")!;
const cases = fixtures.cases.filter(item => item.type === "ServiceHeartbeatsPage");
const valid = () => structuredClone(cases.find(item => item.value.capture_state === "OBSERVATIONS").value);
describe("ELP2-04 finite retained technical heartbeat contract", () => {
  it.each(cases)("matches synthetic fixture $value.capture_state in both published and runtime schema", ({ value }) => {
    expect(fixtures.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT");
    expect(validate(value), ajv.errorsText(validate.errors)).toBe(true);
    expect(serviceHeartbeatsPageSchema.safeParse(value).success).toBe(true);
  });
  it("publishes only the exact Core technical read, no raw selector or global union", () => {
    const get = spec.paths["/api/v1/execution/technical/service-heartbeats"].get;
    expect(get.operationId).toBe("executionRetainedServiceHeartbeatsPageV1");
    expect(get.parameters.map(parameter => parameter.name)).toEqual(["environment", "workspace_id", "limit", "after"]);
    expect(get.parameters.find(parameter => parameter.name === "environment").required).toBe(true);
    expect(spec.components.schemas.ServiceHeartbeatsPage.description).toContain("not a business or ADMIN fallback");
  });
  it.each(["service_name", "instance_id", "hostname", "source_workspace_id", "source_cursor", "private_clock_fence", "global_count"])(
    "does not accept hidden field %s", field => {
      const top = { ...valid(), [field]: "PRIVATE_MUST_NOT_PASS" };
      expect(validate(top)).toBe(false); expect(serviceHeartbeatsPageSchema.safeParse(top).success).toBe(false);
      const row = valid(); row.records[0][field] = "PRIVATE_MUST_NOT_PASS";
      expect(validate(row)).toBe(false); expect(serviceHeartbeatsPageSchema.safeParse(row).success).toBe(false);
    });
  it.each(["source_status", "health"])("cannot fabricate %s from source text or a recent clock", field => {
    const value = valid(); value.records[0][field] = "HEALTHY";
    expect(validate(value)).toBe(false); expect(serviceHeartbeatsPageSchema.safeParse(value).success).toBe(false);
  });
  it.each([true, false, [100], {}, null, "", " 100", "100\n", "1e2", "01", "0", 0, 201, 1.5, Infinity, "all"])(
    "rejects coercive/nonfinite/out-of-bound limit %#", limit => {
      expect(serviceHeartbeatsQuerySchema.safeParse({ environment: "paper", limit }).success).toBe(false);
    });
  it.each([1, 100, 200, "1", "100", "200"])("accepts exact page limit %s", limit => {
    expect(serviceHeartbeatsQuerySchema.parse({ environment: "paper", limit }).limit).toBe(Number(limit));
  });
  it("requires one environment and rejects actor/source/profile/scope selectors", () => {
    expect(serviceHeartbeatsQuerySchema.safeParse({}).success).toBe(false);
    expect(serviceHeartbeatsQuerySchema.safeParse({ environment: "all" }).success).toBe(false);
    for (const key of ["profile_id", "scope", "actor", "source_id", "relation", "root_id"])
      expect(serviceHeartbeatsQuerySchema.safeParse({ environment: "paper", [key]: "PRIVATE" }).success).toBe(false);
    expect(serviceHeartbeatsQuerySchema.parse({ environment: "paper" }).limit).toBe(100);
  });
  it("validates clock/availability/page correlations without replacing missing facts by zero", () => {
    const mutate = [
      value => value.records[0].source_last_seen_at_ms = null,
      value => value.records[0].source_last_seen_reason_code = "SOURCE_CLOCK_NOT_PUBLISHED",
      value => value.records[0].source_last_seen_at_ms = value.read_at_ms + 1,
      value => value.source_as_of_reason_code = null,
      value => value.snapshot_received_at_ms = value.read_at_ms + 1,
      value => value.captured_source_freshness = null,
      value => value.page.returned_count = 0,
      value => value.page.next_cursor = "kc1.not.a.real.cursor",
      value => value.availability = "UNAVAILABLE",
      value => value.capture_state = "EMPTY_COMPLETE",
      value => value.records.push(structuredClone(value.records[0])),
    ];
    for (const change of mutate) { const value = valid(); change(value); expect(serviceHeartbeatsPageSchema.safeParse(value).success).toBe(false); }
    const zero = valid(); zero.records[0].source_last_seen_at_ms = 0;
    expect(serviceHeartbeatsPageSchema.safeParse(zero).success).toBe(true);
  });
});
