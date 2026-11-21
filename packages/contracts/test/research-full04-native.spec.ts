/** Sanitized public wire fixtures; ordinary product evidence is a separate receipt. */
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import {describe,it,expect} from 'vitest';
const root=join(__dirname,'..');
const original=JSON.parse(readFileSync(join(root,'openapi/research-current-source.openapi.json'),'utf8'));
const rewrite=(v:any):any=>Array.isArray(v)?v.map(rewrite):v&&typeof v==='object'
  ?Object.fromEntries(Object.entries(v).map(([k,item])=>[k,k==='$ref'?String(item).replace('#/components/schemas/','#/$defs/'):rewrite(item)])):v;
const ajv=new Ajv2020({allErrors:true,strict:false});
ajv.addSchema({$id:'full04',$defs:rewrite(original.components.schemas)});
const validate=ajv.getSchema('full04#/$defs/OptimizerDisclosure')!;
const packet=JSON.parse(readFileSync(join(root,'fixtures/research-full04-optimizer-disclosure.valid.json'),'utf8'));
describe('FULL04 native optimizer wire contracts',()=>{
  it('strictly carries all five actual native selection branches and explicit partial facts',()=>{
    expect(packet.scope).toBe('SANITIZED_PUBLIC_CONTRACT_FIXTURE_NOT_ACTIVATION_PROOF');
    expect(packet.fixtures).toHaveLength(5);
    for(const item of packet.fixtures){if(!validate(item.optimizer_disclosure))throw new Error(JSON.stringify(validate.errors));}
    const full=packet.fixtures.find((v:any)=>v.method==='mode5-global').optimizer_disclosure;
    expect(full).toMatchObject({calibration_sample:'FULL_SAMPLE',oos_used_for_selection:false,full_sample_used_for_selection:true});
    expect(full.mode_evidence.reason_code).toBe('QUANTBT_MODE_DETAIL_NOT_PUBLISHED');
    const causal=packet.fixtures.find((v:any)=>v.method==='mode4-causal').optimizer_disclosure;
    expect(causal.selection_target.kind).toBe('STUDY_LOCAL_TRIAL');
    expect(causal).not.toHaveProperty('inner_fold_count');
  });
  it('refuses invented bootstrap facts, causal claims and unbound centroid ordinals',()=>{
    const base=packet.fixtures.find((v:any)=>v.method==='mode5-global').optimizer_disclosure;
    expect(validate({...base,full_sample_used_for_selection:false})).toBe(false);
    expect(validate({...base,optimization_schedule:'per_fold_causal'})).toBe(false);
    expect(validate({...base,mode_evidence:{...base.mode_evidence,synthetic_oos_mean:'0'}})).toBe(false);
    expect(validate({...base,selection_target:{...base.selection_target,kind:'SYNTHETIC_CENTROID',trial_id:'-1'}})).toBe(false);
    const generated=readFileSync(join(root,'generated/research-current-source.d.ts'),'utf8');
    for(const fact of ['OptimizerDisclosure','Mode4Selection','FULL_SAMPLE_ROBUST','IS_ONLY_DISPERSION','BOOTSTRAP_PROXY','RETAINED_FULL_SAMPLE_CALIBRATION_PATH'])expect(generated).toContain(fact);
  });
});
