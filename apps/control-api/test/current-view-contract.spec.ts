import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import { currentViewDecision, currentViewError, currentViewRecheck, currentViewResolve,
  parseCurrentViewRequest } from "../src/execution-v2/current-view-wire";

const root = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts");
const read = (file: string) => JSON.parse(readFileSync(resolve(root, file), "utf8"));
const document = read("openapi/execution-current-view.openapi.json");
const jsonSchema = read("schemas/execution-current-view.v1.schema.json");
const fixture = read("fixtures/execution-current-view.test-only.v1.json");
const runtime = { CurrentViewResolve: currentViewResolve, CurrentViewRecheck: currentViewRecheck,
  CurrentViewDecision: currentViewDecision, CurrentViewError: currentViewError };
type Component = keyof typeof runtime;
interface Vector { id: string; component: Component; value: unknown; canonical_utf8: string; sha256: string }
const vectors = fixture.vectors as Vector[];
const schema = new Ajv2020({ strict: false, allErrors: true }).compile(jsonSchema);
const published = Object.fromEntries(Object.keys(runtime).map(component => [component,
  new Ajv2020({ strict: false, allErrors: true }).compile({
    $defs: JSON.parse(JSON.stringify(document.components.schemas).replaceAll("#/components/schemas/", "#/$defs/")),
    $ref: `#/$defs/${component}`,
  })])) as Record<Component, ReturnType<Ajv2020["compile"]>>;
const clone = <T>(value: T): T => structuredClone(value);
const example = (component: Component): any => clone(vectors.find(vector => vector.component === component)!.value);
function canonical(value: unknown): string {
  const sorted = (value: unknown): unknown => Array.isArray(value) ? value.map(sorted)
    : value !== null && typeof value === "object" ? Object.fromEntries(Object.entries(value)
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, entry]) => [key, sorted(entry)])) : value;
  return JSON.stringify(sorted(value));
}
function rejected(component: Component, value: unknown) {
  expect(schema(value)).toBe(false);
  expect(published[component](value)).toBe(false);
  expect(runtime[component].safeParse(value).success).toBe(false);
}

describe("Private Execution current-view published contract", () => {
  it("publishes identical closed definitions in JSON Schema and OpenAPI", () => {
    expect(JSON.parse(JSON.stringify(document.components.schemas)
      .replaceAll("#/components/schemas/", "#/$defs/"))).toEqual(jsonSchema.$defs);
    for (const component of Object.keys(runtime)) {
      expect(jsonSchema.$defs[component].additionalProperties).toBe(false);
      expect(jsonSchema.$defs[component].required.sort()).toEqual(Object.keys(jsonSchema.$defs[component].properties).sort());
    }
  });

  it.each(vectors)("agrees across runtime/schema/OpenAPI and exact canonical bytes: $id", vector => {
    expect(runtime[vector.component].safeParse(vector.value).success).toBe(true);
    expect(schema(vector.value), JSON.stringify(schema.errors)).toBe(true);
    expect(published[vector.component](vector.value), JSON.stringify(published[vector.component].errors)).toBe(true);
    const bytes = canonical(vector.value);
    expect(bytes).toBe(vector.canonical_utf8);
    expect(`sha256:${createHash("sha256").update(bytes, "utf8").digest("hex")}`).toBe(vector.sha256);
  });

  it("declares fixtures synthetic and does not expose original-context registration or key issuing", () => {
    expect(fixture).toMatchObject({ provenance: "TEST_ONLY", authority: "NONE", runtime_enabled: false });
    expect(Object.keys(document.paths).sort()).toEqual([
      "/internal/elp210/current-view/recheck", "/internal/elp210/current-view/resolve",
    ]);
    expect(document.components.securitySchemes.edgeMachineMtls.type).toBe("mutualTLS");
    expect(document["x-transport-hard-ceilings"]).toMatchObject({ request_bytes: 8192, response_bytes: 65536,
      maximum_in_flight: 16, deadline_ms: 5000 });
    for (const item of Object.values(document.paths) as any[]) {
      expect(item.post.security).toEqual([{ edgeMachineMtls: [] }]);
      expect(item.post.responses[200].headers["Cache-Control"].schema.const).toBe("no-store");
      expect(Object.keys(item)).toEqual(["post"]);
    }
  });

  it.each(Object.keys(runtime) as Component[])("rejects extra top-level authority and private values: %s", component => {
    rejected(component, { ...example(component), actor_id: "forged-user" });
    rejected(component, { ...example(component), internal_provider_error: "private error" });
  });

  it("requires whole_population and keeps all correlated tuple/resource/dataset boundaries closed", () => {
    const absent = example("CurrentViewDecision"); delete absent.whole_population;
    rejected("CurrentViewDecision", absent);
    for (const mutate of [
      (value: any) => { value.whole_population = "true"; },
      (value: any) => { value.resource.authority = "ADMIN"; },
      (value: any) => { value.dataset_binding.actor_id = "another-user"; },
      (value: any) => { value.dataset_binding.window.extra = 1; },
      (value: any) => { value.allowed_tuples[0].role = "OWNER"; },
      (value: any) => { delete value.allowed_tuples[0].account_id; },
      (value: any) => { value.resources[0].arbitrary_selector = "ALL"; },
    ]) {
      const value = example("CurrentViewDecision"); mutate(value); rejected("CurrentViewDecision", value);
    }
  });

  it("accepts the published optional dataset metadata and exact empty population without expanding authority", () => {
    const value = example("CurrentViewDecision");
    delete value.dataset_binding.projection_generation;
    delete value.dataset_binding.catalogue_revision;
    value.dataset_binding.window = null;
    value.allowed_tuples = []; value.resources = [];
    for (const whole of [false, true]) {
      value.whole_population = whole;
      expect(currentViewDecision.safeParse(value).success).toBe(true);
      expect(schema(value)).toBe(true);
      expect(published.CurrentViewDecision(value)).toBe(true);
    }
  });

  it("requires sha256-prefixed digests, known operations/errors and bounded integer expiry", () => {
    for (const field of ["context_digest", "decision_digest", "workload_digest", "principal_digest", "session_digest"]) {
      for (const bad of ["a".repeat(64), `sha256:${"A".repeat(64)}`, "sha256:short", "sha256:" + "a".repeat(64) + "\n"]) {
        const value = example("CurrentViewDecision"); value[field] = bad; rejected("CurrentViewDecision", value);
      }
    }
    for (const bad of [-1, 1.1, Number.MAX_SAFE_INTEGER + 1, "1700000000000"]) {
      const value = example("CurrentViewDecision"); value.expires_at_ms = bad; rejected("CurrentViewDecision", value);
    }
    rejected("CurrentViewResolve", { ...example("CurrentViewResolve"), operation: "LIVE_COMMAND" });
    rejected("CurrentViewError", { ...example("CurrentViewError"), code: "ALLOW_ANYTHING" });
    rejected("CurrentViewRecheck", { ...example("CurrentViewRecheck"), decision_digest: "0".repeat(64) });
  });

  it("preserves array caps and refuses control characters or oversized text", () => {
    for (const [field, cap] of [["allowed_tuples", 2000], ["resources", 2000], ["fields", 64], ["detail_fields", 2000]] as const) {
      const value = example("CurrentViewDecision");
      value[field] = Array.from({ length: cap + 1 }, () => field === "allowed_tuples" ? value.allowed_tuples[0]
        : field === "resources" ? value.resources[0] : "TEST_ONLY-field");
      rejected("CurrentViewDecision", value);
    }
    for (const bad of ["", "a".repeat(257), "resource\u0000", "resource\n"]) {
      rejected("CurrentViewResolve", { ...example("CurrentViewResolve"), resource_ref: bad });
    }
    const unicode = example("CurrentViewDecision"); unicode.resource.id = "😀".repeat(256);
    expect(currentViewDecision.safeParse(unicode).success).toBe(true);
    expect(schema(unicode)).toBe(true);
    unicode.resource.id += "😀";
    rejected("CurrentViewDecision", unicode);
  });

  it("shares Unicode codepoint bounds for workspace/profile and request text", () => {
    for (const field of ["workspace_id", "profile_id", "resource_ref", "policy_revision"] as const) {
      const value = example("CurrentViewDecision"); value[field] = "😀".repeat(256);
      expect(currentViewDecision.safeParse(value).success).toBe(true);
      expect(schema(value)).toBe(true);
      expect(published.CurrentViewDecision(value)).toBe(true);
      value[field] += "😀";
      rejected("CurrentViewDecision", value);
    }
    for (const field of ["workload_id", "resource_ref"] as const) {
      const value = example("CurrentViewResolve"); value[field] = "😀".repeat(256);
      expect(currentViewResolve.safeParse(value).success).toBe(true);
      expect(schema(value)).toBe(true);
      expect(published.CurrentViewResolve(value)).toBe(true);
      value[field] += "😀";
      rejected("CurrentViewResolve", value);
    }
  });

  it.each(["RESOLVE", "RECHECK"] as const)("uses strict UTF-8/duplicate rejection before %s schema parsing", kind => {
    const component = kind === "RESOLVE" ? "CurrentViewResolve" : "CurrentViewRecheck";
    const value = example(component), bytes = JSON.stringify(value);
    expect(parseCurrentViewRequest(Buffer.from(bytes), kind)).toEqual(value);
    for (const invalid of [
      bytes.replace(/}$/, ',"operation":"STREAM"}'),
      bytes.replace(/}$/, ',"oper\\u0061tion":"STREAM"}'),
      bytes.replace(/}$/, ',"__proto__":"forged"}'),
      bytes.replace(/}$/, ',"actor_id":"forged"}'),
      bytes.replace('"workload_id":"TEST_ONLY-edge-worker"', '"workload_id":{"role":"ADMIN"}'),
      bytes + " trailing",
    ]) expect(() => parseCurrentViewRequest(Buffer.from(invalid), kind)).toThrow();
    expect(() => parseCurrentViewRequest(Buffer.from([0x7b, 0x22, 0xc3, 0x28, 0x22, 0x7d]), kind)).toThrow();
  });

  it("keeps non-null dataset interval semantics at the actual runtime authority boundary", () => {
    const value = example("CurrentViewDecision");
    value.dataset_binding.window.to_ms = value.dataset_binding.window.from_ms;
    expect(currentViewDecision.safeParse(value).success).toBe(false);
    expect(jsonSchema.$defs.CurrentViewDatasetBinding.description).toContain("from_ms < to_ms");
  });

  it("publishes generated path/operation types without public bearer-credential machinery", () => {
    const types = readFileSync(resolve(root, "generated/execution-current-view.d.ts"), "utf8");
    expect(types).toContain('"/internal/elp210/current-view/resolve"');
    expect(types).toContain('"/internal/elp210/current-view/recheck"');
    expect(types).toContain("executionCurrentViewResolveV1");
    expect(types).toContain("executionCurrentViewRecheckV1");
    expect(types).toContain("whole_population: boolean");
    expect(document.components.securitySchemes).not.toHaveProperty("bearerAuth");
  });
});
