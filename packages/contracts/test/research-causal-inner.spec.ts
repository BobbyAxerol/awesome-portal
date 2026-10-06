import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { describe,expect,it } from "vitest";
import { amendCausalInnerOpenApi } from "../tooling/generate-research-causal-inner.mjs";

const root=join(__dirname,"..");
function contract(file: string) {
  const original=readFileSync(join(root,`openapi/${file}.openapi.json`),"utf8");
  const document=JSON.parse(original);
  const rewrite=(v: any): any => Array.isArray(v) ? v.map(rewrite) : v && typeof v==="object"
    ? Object.fromEntries(Object.entries(v).map(([k,item])=>[k,k==="$ref" ? String(item).replace("#/components/schemas/","#/$defs/") : rewrite(item)])) : v;
  const ajv=new Ajv2020({allErrors:true,strict:false});
  ajv.addSchema({$id:file,$defs:rewrite(document.components.schemas)});
  return {original,document,validate:(name: string,value: unknown)=>ajv.getSchema(`${file}#/$defs/${name}`)!(value)};
}
describe("bounded additional causal/inner transport",()=>{
  it("publishes nested own-fold facts and refuses missing scope or a fabricated outer-selection claim",()=>{
    const c=contract("research-current-source");
    const {selection}=JSON.parse(readFileSync(join(root,"fixtures/research-causal-inner.selection.synthetic.valid.json"),"utf8"));
    expect(c.validate("CausalSelection",selection)).toBe(true);
    expect(c.validate("CausalSelection",{...selection,outer_oos_used_for_selection:true})).toBe(false);
    expect(c.validate("CausalSelection",{...selection,scope:"GLOBAL"})).toBe(false);
    expect(c.validate("CausalSelection",{...selection,inner_fold_count:1})).toBe(false);
    expect(c.validate("CausalSelection",{...selection,causality_claim:"global_selection_evaluates_outer_oos"})).toBe(false);
    const missing={...selection};delete missing.study_id;
    expect(c.validate("CausalSelection",missing)).toBe(false);
    expect(c.document.components.schemas.FoldOrderingRow.properties.verdict.enum).toContain("CAUSAL_DATA_TIME_SELECTION");
    expect(c.document.components.schemas.FoldOrdering.properties.wall_clock.properties.state.const).toBe("NOT_PUBLISHED");
  });
  it("regeneration is stable and generated readers carry scopes without widening the global profile",()=>{
    for(const file of ["research-foundation","research-progress","research-current-source","research-freeze","research-report","research-attempt-lineage"]) {
      const c=contract(file);expect(amendCausalInnerOpenApi(c.original,file)).toBe(c.original);
    }
    const source=readFileSync(join(root,"generated/research-current-source.d.ts"),"utf8");
    for(const field of ["CausalSelection","LAST_FOLD_DEPLOYMENT","OUTER_FOLD_SELECTION","inner_min_folds","CAUSAL_DATA_TIME_SELECTION","SearchStudySurface","surfaces_by_study","INNER_VALIDATION_OUTER_STUDY"])expect(source).toContain(field);
    expect(readFileSync(join(root,"generated/research-report.d.ts"),"utf8")).toContain("PER_FOLD_PARAMETER_SELECTIONS");
    expect(readFileSync(join(root,"generated/research-attempt-lineage.d.ts"),"utf8")).toContain("OUTER_FOLD_SELECTED_OOS_MEAN");
    const progress=contract("research-progress").document.components.schemas.ProgressFoldSelection;
    expect(progress.allOf[0].then.required).toEqual(["study_id","source_trial_id"]);
    const retained=contract("research-current-source").document.components.schemas;
    const freeze=contract("research-freeze").document.components.schemas;
    for(const name of ["Stage4BindingRow","Stage4Binding","ParameterAuthority"])
      expect(freeze[name]).toEqual(retained[name]);
  });
  it("bounds own-study surfaces and carries a verdict basis consistent with causal rows",()=>{
    const s=contract("research-current-source").document.components.schemas;
    expect(s.Search.allOf[1].properties.surfaces_by_study.minItems).toBe(2);
    expect(s.Search.allOf[1].properties.surfaces_by_study.maxItems).toBe(16);
    expect(s.SearchStudySurface.required).toEqual(["scope","fold_id","study_id","surface"]);
    expect(s.SearchStudySurface.properties.scope.enum).toEqual(["INNER_VALIDATION_OUTER_STUDY", "OUTER_FOLD_DECAY_STUDY"]);
    expect(s.SearchStudySurface.properties.surface.allOf[1].properties.source_trial_count.const).toBe(3);
    expect(s.SearchStudySurface.properties.surface.allOf[1].properties.points.maxItems).toBe(3);
    expect(s.SearchSurface.properties.state.enum).toContain("NOT_APPLICABLE");
    expect(s.FoldVerdicts.properties.rule.properties.score_basis.enum).toContain(s.FoldVerdictRow.properties.score_basis.const);
    expect(s.DeclaredSpace.properties.selection_scope.const).toBe("LAST_FOLD_DEPLOYMENT");
  });
});
