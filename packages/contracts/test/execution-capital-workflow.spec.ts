import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import { workflowCapital } from "../../../apps/control-api/src/execution-v2/workflow.contract";

const root = resolve(__dirname, "..");
const load = (path: string) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const api = load("openapi/execution-trusted-commands.openapi.json");
const pureApi = load("openapi/execution-workflows.openapi.json");
const fixture = load("fixtures/execution-capital-workflow.synthetic.valid.json");
const stories = load("fixtures/execution-workflows.synthetic.valid.json").cases;
const ajv = new Ajv2020({ strict: false, allErrors: true });
const validate = ajv.compile({ $ref: "#/components/schemas/WorkflowCapital", components: { schemas: api.components.schemas } });

describe("ELP2-07/08 current-authorized local capital workflow GET contract", () => {
  it("adds one private read with strict id/workspace and no authority/body intake", () => {
    const path = api.paths["/api/v1/execution/capital-commands/{id}/workflow"];
    expect(Object.keys(path)).toEqual(["get"]);
    const get = path.get;
    expect(get.operationId).toBe("executionCapitalCommandWorkflowGetV1");
    expect(get.security).toEqual([{ PortalSession: [] }]);
    expect(get.requestBody).toBeUndefined();
    expect(get.parameters.map((value: { name: string }) => value.name)).toEqual(["id", "workspace_id"]);
    expect(get.parameters.every((value: { required: boolean }) => value.required)).toBe(true);
    expect(get.responses[200].content["application/json"].schema.$ref).toBe("#/components/schemas/WorkflowCapital");
    for (const status of [200, 400, 401, 403, 404, 409, 503])
      expect(get.responses[status].headers["Cache-Control"].schema.const).toBe("private, no-store");
    expect(get.responses[503].description).toContain("COMMAND_STATUS_UNVERIFIED");
    expect(get.responses[404].description).toContain("hidden and unknown are identical");
  });
  it("preserves canonical WorkflowCapital semantics without a generation cycle or new installer", () => {
    expect(pureApi.paths).toEqual({});
    for (const name of ["WorkflowCapital", "WorkflowContext", "CommandStatus"])
      expect(api.components.schemas[name]).toEqual(pureApi.components.schemas[name]);
    expect(api.components.schemas.WorkflowCapital.properties.context.$ref).toBe("#/components/schemas/WorkflowContext");
    expect(api.components.schemas.WorkflowCapital.properties.status.$ref).toBe("#/components/schemas/CommandStatus");
  });
  it("publishes an explicitly synthetic UNKNOWN response, not a financial/source receipt", () => {
    expect(fixture.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT");
    expect(fixture.runtime_qualified).toBe(false);
    expect(fixture.response.status.command_id).toBe(fixture.command_id);
    expect(fixture.response.context.workspace_id).toBe(fixture.query.workspace_id);
    expect(fixture.response.context.source_as_of_ms).toBeNull();
    expect(fixture.response.status.business).toEqual({ state: "UNKNOWN", receipt_ref: null, source_event_ref: null, revision: null, amounts: null });
    expect(fixture.response.automatic_resend).toBe(false);
    expect(validate(fixture.response), JSON.stringify(validate.errors)).toBe(true);
    expect(workflowCapital.safeParse(fixture.response).success).toBe(true);
    expect(validate({ ...fixture.response, authorization_fact: { private: true } })).toBe(false);
  });
  it.each(stories.filter((value: { schema: string }) => value.schema === "WorkflowCapital"))("$id remains valid in the served schema", (story: { response: unknown }) => {
    expect(validate(story.response), JSON.stringify(validate.errors)).toBe(true);
    expect(workflowCapital.safeParse(story.response).success).toBe(true);
  });
  it("retains non-amount target exceptions but never lets UNKNOWN carry an owning receipt", () => {
    const target = structuredClone(stories.find((value: { id: string }) => value.id === "W08-ROOT-LIMIT-NONAMOUNT").response);
    expect(validate(target)).toBe(true);
    expect(target.status.business.amounts).toBeNull();
    for (const field of ["receipt_ref", "source_event_ref", "revision"]) {
      const invalid = { ...target, status: { ...target.status, business: { ...target.status.business, [field]: null } } };
      expect(validate(invalid)).toBe(false);
      expect(workflowCapital.safeParse(invalid).success).toBe(false);
    }
    const unknown = { ...target, status: { ...target.status, business: { ...target.status.business, state: "UNKNOWN" } } };
    expect(validate(unknown)).toBe(false);
    expect(workflowCapital.safeParse(unknown).success).toBe(false);
    for (const operation of ["FUND", "TOP_UP", "RECALL_FULL"]) {
      const invalid = { ...target, status: { ...target.status, operation }, effect_kind: operation === "FUND" ? "ECONOMIC_ASSIGNMENT" : "MANAGEMENT_BUDGET" };
      expect(validate(invalid)).toBe(false);
      expect(workflowCapital.safeParse(invalid).success).toBe(false);
    }
  });
});
