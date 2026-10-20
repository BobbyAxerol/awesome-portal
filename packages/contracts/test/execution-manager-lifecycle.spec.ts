import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import { managerDatasetResponse, managerDatasetRow, managerModelQuery } from "../../../apps/control-api/src/execution-v2/manager-model.contract";
import { managerP1Options } from "../../../apps/control-api/src/execution-v2/manager-query-p1.contract";

// BE-P4 / FE-027 + FE-012: lifecycle scalars on a Manager row, in Zod, JSON Schema, OpenAPI and fixtures.
const root = resolve(__dirname, "..");
const load = (file: string) => JSON.parse(readFileSync(resolve(root, file), "utf8"));
const api = load("openapi/execution-manager-models.openapi.json");
const schema = load("schemas/execution-manager-dataset.v1.schema.json");
const ajv = new Ajv2020({ strict: true, allErrors: true });
const check = ajv.compile(schema);
const live = load("fixtures/execution-manager-dataset.lifecycle.live.synthetic.valid.json");
const MS_PER_DAY = 86_400_000;

describe("FE-027/FE-012 Manager lifecycle scalars", () => {
  it("every canonical dataset fixture carries the lifecycle keys and passes both validators", () => {
    for (const name of ["synthetic", "rows.synthetic", "all-window.synthetic", "lifecycle.live.synthetic"]) {
      const sample = load(`fixtures/execution-manager-dataset.${name}.valid.json`);
      expect(sample.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT");
      expect(check(sample.value), JSON.stringify(check.errors)).toBe(true);
      expect(managerDatasetResponse.parse(sample.value)).toEqual(sample.value);
      expect(sample.value.stage_lifecycle).toEqual({ current_stage_rule: "SINGLE_ACTIVE_MEMBER_STAGE_IN_SELECTED_ENVIRONMENT",
        covers: "DEPLOYED_STAGES_OF_SELECTED_ENVIRONMENT_ONLY", entry_time: "STAGE_ENTRY_TIME_NOT_PUBLISHED" });
      expect(sample.value.query_options.unavailable_fields.map((f: { field: string }) => f.field)).toEqual(["days_in_stage", "entered_at_ms"]);
      for (const row of sample.value.items) {
        expect(row.entered_at_ms).toBeNull(); expect(row.days_in_stage).toBeNull();
        expect(row.stage_lifecycle_reasons.entered_at_ms).toBe("STAGE_ENTRY_TIME_NOT_PUBLISHED");
        expect(managerDatasetRow.parse(row)).toEqual(row);
      }
    }
  });

  it("the live fixture shows both honest shapes: one stage published, Canary+Live withheld", () => {
    const [single, both] = live.value.items;
    expect(single).toMatchObject({ stage_presence: ["LIVE"], current_stage: "LIVE", stage_lifecycle_reasons: { current_stage: null } });
    expect(both).toMatchObject({ stage_presence: ["CANARY", "LIVE"], current_stage: null,
      stage_lifecycle_reasons: { current_stage: "MULTIPLE_ACTIVE_STAGES" } });
    expect(live.value.environment).toBe("live");
  });

  it("publishes current_stage as a sortable/groupable/filterable scalar and keeps the entry pair out of the sort set", () => {
    const options = api.components.schemas.ManagerQueryOptions.properties;
    expect(options.sort_fields.items.enum).toContain("current_stage");
    expect(options.sort_fields.items.enum).not.toContain("days_in_stage");
    expect(options.sort_fields.items.enum).not.toContain("entered_at_ms");
    expect(options.group_fields.items.enum).toContain("current_stage");
    const query = api.components.schemas.ManagerDatasetQuery;
    const checkQuery = ajv.compile(query);
    for (const ok of [{ environment: "live", sort: [{ field: "current_stage", direction: "asc" }] },
      { environment: "live", group_by: ["current_stage"] },
      { environment: "live", filters: [{ field: "current_stage", op: "IN", values: ["CANARY", "LIVE"] }] }]) {
      expect(checkQuery(ok), JSON.stringify(checkQuery.errors)).toBe(true);
      expect(managerModelQuery.safeParse(ok).success).toBe(true);
    }
    for (const bad of [{ environment: "live", sort: [{ field: "days_in_stage", direction: "asc" }] },
      { environment: "live", sort: [{ field: "entered_at_ms", direction: "asc" }] },
      { environment: "live", group_by: ["days_in_stage"] }]) {
      expect(checkQuery(bad)).toBe(false); expect(managerModelQuery.safeParse(bad).success).toBe(false);
    }
    // Options keep the sort->group invariant: current_stage may be grouped only if it can be sorted.
    const base = load("fixtures/execution-manager-dataset.rows.synthetic.valid.json").value.query_options;
    const noSort = { ...base, sort_fields: base.sort_fields.filter((k: string) => k !== "current_stage") };
    expect(managerP1Options.safeParse(noSort).success).toBe(false);
    expect(ajv.compile(api.components.schemas.ManagerQueryOptions)(noSort)).toBe(false);
  });

  describe("the same tampering is refused by Zod and by the published JSON Schema", () => {
    const clone = () => structuredClone(live.value) as any;
    const withLive = (v: any) => v.items.find((r: any) => r.current_stage === "LIVE");
    const withNull = (v: any) => v.items.find((r: any) => r.current_stage === null);
    const populate = (v: any, days: number, extra = 0) => {
      const r = withLive(v);
      v.as_of_ms = 1_800_000_000_000; // the synthetic fixture's cutoff is too small to have a past
      r.entered_at_ms = v.as_of_ms - days * MS_PER_DAY - extra; r.days_in_stage = days;
      r.stage_lifecycle_reasons.entered_at_ms = null; r.stage_lifecycle_reasons.days_in_stage = null;
    };
    it("accepts a populated entry pair equal to the whole elapsed days", () => {
      const v = clone(); populate(v, 3, 5);
      const parsed = managerDatasetResponse.safeParse(v);
      expect(parsed.success, JSON.stringify(parsed.success ? null : parsed.error.issues)).toBe(true);
      expect(check(v), JSON.stringify(check.errors)).toBe(true);
    });
    it.each([
      ["a published stage on a two-stage row", (v: any) => { const r = withNull(v); r.current_stage = "LIVE"; r.stage_lifecycle_reasons.current_stage = null; }, true],
      ["a published stage that is not the row's own", (v: any) => { withLive(v).current_stage = "CANARY"; }, true],
      ["a null stage with no reason", (v: any) => { withNull(v).stage_lifecycle_reasons.current_stage = null; }, true],
      ["a reason beside a published stage", (v: any) => { withLive(v).stage_lifecycle_reasons.current_stage = "MULTIPLE_ACTIVE_STAGES"; }, true],
      ["an entry time with its absence reason kept", (v: any) => { v.items[0].entered_at_ms = v.as_of_ms - 1; }, true],
      ["days without an entry time", (v: any) => { const r = v.items[0]; r.days_in_stage = 2; r.stage_lifecycle_reasons.days_in_stage = null; }, true],
      ["an unknown stage reason", (v: any) => { withNull(v).stage_lifecycle_reasons.current_stage = "BECAUSE"; }, true],
      ["a stage on an empty presence", (v: any) => { const r = withLive(v); r.stage_presence = []; }, true],
      // Cross-field arithmetic against the cutoff is a Zod-only check (JSON Schema has no date arithmetic).
      ["days that disagree with the cutoff", (v: any) => { populate(v, 3); withLive(v).days_in_stage = 4; }, false],
      ["an entry time after the cutoff", (v: any) => { populate(v, 0); withLive(v).entered_at_ms = v.as_of_ms + 1; }, false],
    ])("rejects %s", (_name, mutate, jsonToo) => {
      const v = clone(); mutate(v);
      expect(managerDatasetResponse.safeParse(v).success).toBe(false);
      if (jsonToo) expect(check(v)).toBe(false);
    });
  });
});
