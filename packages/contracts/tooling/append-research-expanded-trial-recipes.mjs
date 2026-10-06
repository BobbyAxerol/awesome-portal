/** Owner-approved trial ranges; append new identities, never rewrite old seals. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../../../',import.meta.url),path='apps/portal/registry/research-execution-recipes.v1.json';
const table=JSON.parse(readFileSync(new URL(path,root)));
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'
  ?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const hash=v=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
const bases=table.recipes.filter(r=>['FULL03_IMMUTABLE_DELTA_BINDING','IMPORTED_IMMUTABLE_SEARCH_BINDING'].includes(r.source_requirement)
  &&r.descriptor.schema_version!=='research.expanded-trial-profile.v1');
assert.equal(bases.length,153);
for(const base of bases){
  const id=base.profile_id.replace(/\.v1$/,'.v2');
  if(table.recipes.some(r=>r.profile_id===id))continue;
  const row=structuredClone(base),perFold=base.public_profile.optimization_schedule!=='global';
  const min=base.public_profile.optimization_mode==='mode_3_flat_minima'?5:2;
  row.profile_id=id;
  row.budgets={...row.budgets,cpu_seconds:1800,wall_seconds:2400,scratch_bytes:536870912,io_bytes:268435456};
  row.descriptor={...row.descriptor,schema_version:'research.expanded-trial-profile.v1',
    origin_schema_version:base.descriptor.schema_version,profile_id:id,
    predecessor_profile_id:base.profile_id,trial_count:{min,max:400},
    max_total_trials:perFold?6400:400,
    child_limits:{...row.descriptor.child_limits,cpu_seconds:1800,wall_seconds:2400},
    current_source:{source_adapter_id:base.descriptor.current_source.source_adapter_id.replace(/\.v1$/,'.v2'),
      profile_id:base.descriptor.current_source.profile_id.replace(/\.v1$/,'.v2')}};
  row.public_profile={...row.public_profile,profile_id:id,trial_count:{min,max:400},max_total_trials:perFold?6400:400};
  row.profile_digest=hash(row.descriptor);
  table.recipes.push(row);table.qualification_references.push({profile_id:id,recipe_digest:hash(row),
    kind:'CANDIDATE_NOT_QUALIFIED',receipt_path:null,receipt_sha256:null});
}
// Bounded historical catalogue: current intake suppresses qualified predecessors.
table.setup_bounds.maximum_profiles=512;
writeFileSync(new URL(path,root),JSON.stringify(table,null,2)+'\n');
const sp='apps/portal/registry/research-execution-recipes.v1.schema.json',schema=JSON.parse(readFileSync(new URL(sp,root)));
schema.properties.recipes.maxItems=512;schema.properties.qualification_references.maxItems=512;
schema.properties.setup_bounds.properties.maximum_profiles.const=512;
writeFileSync(new URL(sp,root),JSON.stringify(schema,null,2)+'\n');
console.log('Appended153 candidate trial-range identities; existing161 descriptors/qualifications unchanged.');
