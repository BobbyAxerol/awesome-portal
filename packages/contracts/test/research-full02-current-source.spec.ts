import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import { amendFull02CurrentSource } from "../tooling/generate-research-full02-current-source.mjs";

const root = join(__dirname,"..");
function contract(name: string) {
  const original = readFileSync(join(root,`openapi/${name}.openapi.json`),"utf8"), document = JSON.parse(original);
  const rewrite = (value: any): any => Array.isArray(value) ? value.map(rewrite) : value && typeof value === "object"
    ? Object.fromEntries(Object.entries(value).map(([key,nested]) => [key,key === "$ref" ? String(nested).replace("#/components/schemas/","#/$defs/") : rewrite(nested)])) : value;
  const ajv = new Ajv2020({ allErrors: true, strict: false,unicodeRegExp:false }); ajv.addSchema({ $id: name,$defs: rewrite(document.components.schemas) });
  return { original,document,valid: (component: string,input: unknown) => ajv.getSchema(`${name}#/$defs/${component}`)!(input) };
}
const fixture = (name: string,key: string) => JSON.parse(readFileSync(join(root,`fixtures/research-full02.${name}.synthetic.valid.json`),"utf8"))[key];
describe("FULL-02 named retained transport (synthetic fixtures)", () => {
  it("allows exactly one Three calibration fold, while preserving Advanced's two-fold minimum",()=>{
    const c=contract("research-current-source"),original=JSON.parse(readFileSync(join(root,"fixtures/research-current-source.split.valid.json"),"utf8"));
    const three={...original,fold_plan:{...original.fold_plan,chronology:"SOURCE_OBSERVED_THREE_WINDOW",folds:original.fold_plan.folds.slice(0,1)}};
    expect(c.valid("Split",three)).toBe(true);
    expect(c.valid("Split",{...three,fold_plan:{...three.fold_plan,chronology:"SOURCE_OBSERVED_ADVANCED_WFO"}})).toBe(false);
    expect(c.valid("Split",{...three,fold_plan:{...three.fold_plan,folds:[...three.fold_plan.folds,...three.fold_plan.folds]}})).toBe(false);
    expect(c.valid("Split",original)).toBe(true);
  });
  it("requires actual outer-OOS-used decay facts and scoped local ordinals", () => {
    const c = contract("research-current-source"), selection = fixture("fold-selection","selection");
    expect(c.valid("DisplayFoldSelection",selection)).toBe(true);
    expect(c.valid("DisplayFoldSelection",{ ...selection,outer_oos_used_for_selection: false })).toBe(false);
    expect(c.valid("DisplayFoldSelection",{ ...selection,objective_kind: "INNER_VALIDATION_DECAY_J" })).toBe(false);
    expect(c.valid("DisplayFoldSelection",{ ...selection,study_trial_rows: 400 })).toBe(true);
    expect(c.valid("DisplayFoldSelection",{ ...selection,study_trial_rows: 401 })).toBe(false);
    expect(c.valid("CausalSelection",selection)).toBe(false);
  });
  it("publishes Three Window independent holdout separately from calibration OOS", () => {
    const p = fixture("protocol-disclosure","protocol");
    for (const name of ["research-current-source","research-report"]) {
      const c = contract(name);
      expect(c.valid("ProtocolDisclosure",p)).toBe(true);
      expect(c.valid("ProtocolDisclosure",{ ...p,independent_holdout: { ...p.independent_holdout,holdout_used_for_selection: true } })).toBe(false);
      expect(c.valid("ProtocolDisclosure",{ ...p,engine_operation: "walk_forward" })).toBe(false);
      expect(amendFull02CurrentSource(c.original,name)).toBe(c.original);
    }
  });
  it("keeps exact source pairs and generated named scopes without enabling recipes", () => {
    const c = contract("research-current-source"), provenance = { source_adapter_id: "full02.quantbt-signal-notional-per-fold-decay.v1",
      profile_id: "full02.delta-signal-notional-per-fold-decay.v1",engine_version: "1.1.1",retained_at_utc_ms: 1,
      ...Object.fromEntries(["source_manifest_digest","source_transform_digest","retained_import_digest","requested_spec_digest","effective_spec_digest","dataset_binding_digest"].map(key => [key,"a".repeat(64)])) };
    expect(c.valid("Provenance",provenance)).toBe(true);
    expect(c.valid("Provenance",{ ...provenance,profile_id: "full02.delta-signal-notional-three-window.v1" })).toBe(false);
    const generated = readFileSync(join(root,"generated/research-current-source.d.ts"),"utf8");
    for (const value of ["OUTER_FOLD_DECAY_STUDY","OUTER_FOLD_DECAY_J","OOS_SELECTION_INPUT","ProtocolDisclosure","FoldSelection"]) expect(generated).toContain(value);
    expect(readFileSync(join(root,"generated/research-report.d.ts"),"utf8")).toContain("protocol_disclosure");
  });
});
