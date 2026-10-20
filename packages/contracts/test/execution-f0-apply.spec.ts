import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import {
  f0ApplyAttemptLookup, f0ApplyDeniedProblem, f0ApplyKeyConflictProblem, f0ApplyRequest,
} from "../../../apps/control-api/src/operations/f0-apply.contract";

/** BE-P13 · F0 apply is DENIED-only. The workspace-level (networkless) proof that the published
 * contract has no success, that fixtures match schema AND the runtime parser, and that the lookup is a
 * strict read. The service behaviour is proved in apps/control-api/test/be-p13-f0-apply.spec.ts. */
const root = resolve(__dirname, "..");
const load = (name: string) => JSON.parse(readFileSync(resolve(root, name), "utf8"));
const schema = load("schemas/execution-operations.v1.schema.json");
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
ajv.addSchema(schema);
const def = (name: string) => ajv.getSchema(`${schema.$id}#/$defs/${name}`)!;
const api = load("openapi/execution-operations.openapi.json");
const apply = api.paths["/api/v1/execution/operations/{operation_id}/apply"].post;

describe("BE-P13 F0 apply contract", () => {
  it("publishes no success response and no success fixture", () => {
    expect(Object.keys(apply.responses).sort()).toEqual(["400", "401", "403", "404", "409"]);
    expect(JSON.stringify(apply)).not.toMatch(/ACCEPTED|SUCCEEDED|apply_token/);
    const names = readdirSync(resolve(root, "fixtures")).filter((name) => /^execution-command-apply/.test(name));
    expect(names).toHaveLength(6);
    for (const name of names) expect(readFileSync(resolve(root, "fixtures", name), "utf8"), name)
      .not.toMatch(/ACCEPTED|SUCCEEDED|apply_token|"status"/);
  });

  it("requires request_key in the request, in schema and runtime alike", () => {
    const ok = { schema_version: "execution.command-apply-request.v1", workspace_id: "ws_1", request_key: "k-0001", command_type: "EXECUTION_COMMAND" };
    const { request_key: _key, ...withoutKey } = ok;
    expect(def("ExecutionCommandApplyRequest")(ok)).toBe(true);
    expect(f0ApplyRequest.safeParse(ok).success).toBe(true);
    expect(def("ExecutionCommandApplyRequest")(withoutKey)).toBe(false);
    expect(f0ApplyRequest.safeParse(withoutKey).success).toBe(false);
  });

  const fixtures: Array<[string, string, (value: unknown) => { success: boolean }]> = [
    ["execution-command-apply-denied.valid.json", "F0ApplyDeniedProblem", (v) => f0ApplyDeniedProblem.safeParse(v)],
    ["execution-command-apply-denied.replayed.valid.json", "F0ApplyDeniedProblem", (v) => f0ApplyDeniedProblem.safeParse(v)],
    ["execution-command-apply-key-conflict.valid.json", "F0ApplyKeyConflictProblem", (v) => f0ApplyKeyConflictProblem.safeParse(v)],
    ["execution-command-apply-attempt.none.valid.json", "F0ApplyAttemptLookup", (v) => f0ApplyAttemptLookup.safeParse(v)],
    ["execution-command-apply-attempt.found.valid.json", "F0ApplyAttemptLookup", (v) => f0ApplyAttemptLookup.safeParse(v)],
    ["execution-command-apply-attempt.conflict.valid.json", "F0ApplyAttemptLookup", (v) => f0ApplyAttemptLookup.safeParse(v)],
  ];
  it.each(fixtures)("%s agrees with %s and the runtime parser", (name, definition, parse) => {
    const value = load("fixtures/" + name);
    expect(def(definition)(value), JSON.stringify(def(definition).errors)).toBe(true);
    expect(parse(value).success).toBe(true);
    expect(def(definition)({ ...value, injected: true })).toBe(false);
    expect(parse({ ...value, injected: true }).success).toBe(false);
  });

  it("the 409 is a oneOf of the denial and the key conflict; the lookup route is a strict read", () => {
    const schemaOf = apply.responses["409"].content["application/json"].schema;
    expect(schemaOf.oneOf.map((item: { $ref: string }) => item.$ref.split("/").pop())).toEqual(["F0ApplyDeniedProblem", "F0ApplyKeyConflictProblem"]);
    const lookup = api.paths["/api/v1/execution/operations/f0/{operation_id}/apply-attempts/{request_key}"];
    expect(Object.keys(lookup)).toEqual(["get"]);
    expect(lookup.get["x-strict-query-keys"]).toEqual(["workspace_id"]);
    expect(api.components.schemas.F0ApplyAttemptLookup.$ref).toMatch(/F0ApplyAttemptLookup$/);
  });
});
