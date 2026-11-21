/**
 * FE-056 · the operator task catalogue carries optional display metadata.  Pure: no database, no HTTP.
 * The published fixture is the relay-disabled body of `operatorTaskCatalogue()`, so it cannot drift from the emitter.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import { EXECUTION_COMMAND_CATALOG } from "../src/operations/catalog.generated";
import {
  OPERATOR_TASK_DISPLAY_BOUNDS, OPERATOR_TASKS, operatorTaskCatalogue,
} from "../src/operations/operator-tasks";

const contracts = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts");
const schema = JSON.parse(readFileSync(resolve(contracts, "schemas/execution-command-tasks.v1.schema.json"), "utf8"));
const fixture = JSON.parse(readFileSync(resolve(contracts, "fixtures/execution-command-tasks.valid.json"), "utf8"));
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
ajv.addSchema(schema);
const validate = ajv.getSchema(schema.$id)!;
const scope = { workspace_id: "ws_test", actor_user_id: "usr_test", actor_role: "ADMIN" };
// eslint-disable-next-line no-control-regex
const FORBIDDEN = /[\u0000-\u001f\u007f-\u009f؜‎‏‪-‮⁦-⁩]/u;
const titleCase = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

describe("operator task display metadata (FE-056)", () => {
  it("is declared on every definition within the schema bounds, with no control or bidi characters", () => {
    expect(schema.$defs.Task.properties.display_name.maxLength).toBe(OPERATOR_TASK_DISPLAY_BOUNDS.displayName);
    expect(schema.$defs.Task.properties.description.maxLength).toBe(OPERATOR_TASK_DISPLAY_BOUNDS.description);
    expect(schema.$defs.Task.properties.scope_label.maxLength).toBe(OPERATOR_TASK_DISPLAY_BOUNDS.scopeLabel);
    expect(OPERATOR_TASKS).toHaveLength(24);
    for (const definition of OPERATOR_TASKS) {
      const { displayName, description, scopeLabel } = definition.display;
      for (const [text, limit] of [[displayName, OPERATOR_TASK_DISPLAY_BOUNDS.displayName],
        [description, OPERATOR_TASK_DISPLAY_BOUNDS.description], [scopeLabel, OPERATOR_TASK_DISPLAY_BOUNDS.scopeLabel]] as const) {
        expect(text.trim(), definition.taskId).toBe(text);
        expect(text.length, definition.taskId).toBeGreaterThan(0);
        expect(text.length, definition.taskId).toBeLessThanOrEqual(limit);
        expect(FORBIDDEN.test(text), `${definition.taskId}: ${JSON.stringify(text)}`).toBe(false);
      }
      expect(description.endsWith("."), definition.taskId).toBe(true);
      expect(description.split(". ").length, `${definition.taskId} is one sentence`).toBe(1);
    }
  });

  it("emits the keys on every task, keeps meta as the source reference, and validates against the published schema", () => {
    for (const relay of [false, true]) {
      const body = { ...operatorTaskCatalogue(relay), scope };
      expect(validate(body), JSON.stringify(validate.errors)).toBe(true);
      expect(body.catalogue_revision).toBe(3);
      expect(body.tasks).toHaveLength(24);
      for (const row of body.tasks) {
        const definition = OPERATOR_TASKS.find((candidate) => candidate.taskId === row.task_id)!;
        expect(row.display_name).toBe(definition.display.displayName);
        expect(row.description).toBe(definition.display.description);
        expect(row.scope_label).toBe(definition.display.scopeLabel);
        const source = EXECUTION_COMMAND_CATALOG.entries.find((entry) => entry.key === definition.catalogKey);
        expect(row.meta).toBe(source?.source_reference ?? "Portal-curated task; source operation not published");
        expect(row.task_title).toBe(definition.taskTitle);
      }
    }
  });

  it("the scope label names exactly the target kinds of the machine scope, title-cased", () => {
    for (const row of operatorTaskCatalogue(false).tasks) {
      expect(row.scope_label, row.task_id).toBe(row.scope.split(" · ").map(titleCase).join(" · "));
    }
  });

  it("describes what a task is for without claiming it can run, and says so for host-level procedures", () => {
    for (const row of operatorTaskCatalogue(false).tasks) {
      if (row.mode === "MUTATION" || row.mode === "DANGER") expect(row.description, row.task_id).not.toMatch(/^Read-only/);
      if (row.mode === "READ" && row.reason_code !== "DIRECT_REDIS_ACCESS_FORBIDDEN") {
        expect(row.description, row.task_id).toMatch(/^Read-only/);
      }
      expect(row.description, row.task_id).not.toMatch(/\b(is connected|runs now|can be run from the Portal|available now)\b/i);
      if (row.reason_code === "DIRECT_REDIS_ACCESS_FORBIDDEN" || row.reason_code === "HOST_DESTRUCTIVE_PROCEDURE_NOT_EXPOSED") {
        expect(row.description, row.task_id).toMatch(/(cannot be run|blocked in the Portal)/);
      }
    }
  });

  it("the published fixture carries exactly the emitted display text, task by task", () => {
    // The fixture's other per-parameter fields are owned by earlier slices; this slice pins only what it adds.
    const emitted = operatorTaskCatalogue(false);
    expect(fixture.tasks.map((row: { task_id: string }) => row.task_id)).toEqual(emitted.tasks.map((row) => row.task_id));
    for (const [index, row] of emitted.tasks.entries()) {
      const published = fixture.tasks[index];
      expect({ n: published.display_name, d: published.description, s: published.scope_label, m: published.meta, t: published.task_title })
        .toEqual({ n: row.display_name, d: row.description, s: row.scope_label, m: row.meta, t: row.task_title });
    }
    expect(fixture.catalogue_revision).toBe(emitted.catalogue_revision);
    expect(fixture.source_catalogue_revision).toBe(emitted.source_catalogue_revision);
  });
});
