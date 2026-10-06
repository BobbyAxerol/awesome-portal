/** FULL05 additive exact imported profile IDs; no qualification is granted. */
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {replaceComponent} from './generate-research-progress-truth.mjs';
const root=new URL('../../../',import.meta.url);
const table=JSON.parse(readFileSync(new URL('apps/portal/registry/research-execution-recipes.v1.json',root)));
const rows=table.recipes.filter(r=>r.source_requirement==='IMPORTED_IMMUTABLE_SEARCH_BINDING');
export function amendFull05(original,file){
  const document=JSON.parse(original),schemas=document.components.schemas;let next=original;
  for(const [name,raw]of Object.entries(schemas)){
    const value=structuredClone(raw);let changed=false;
    const walk=node=>{
      if(!node||typeof node!=='object')return;
      if(node.enum?.includes('p10.delta-signal-notional-wfo.v1'))for(const row of rows)
        if(!node.enum.includes(row.profile_id)){node.enum.push(row.profile_id);changed=true;}
      for(const child of Object.values(node))walk(child);
    };walk(value);
    if(name==='ParameterAuthority'&&file==='research-current-source'){
      const scopes=value.properties.code_fixed.properties.hash_scope.enum;
      if(!scopes.includes('SOURCE_CODE_SHA256')){scopes.push('SOURCE_CODE_SHA256');changed=true;}
    }
    if(name==='Provenance'&&file==='research-current-source')for(const row of rows){
      const pair=row.descriptor.current_source;
      for(const key of ['source_adapter_id','profile_id'])if(!value.properties[key].enum.includes(pair[key])){
        value.properties[key].enum.push(pair[key]);changed=true;}
      if(!value.oneOf.some(p=>p.properties?.profile_id?.const===pair.profile_id)){
        value.oneOf.push({properties:{source_adapter_id:{const:pair.source_adapter_id},profile_id:{const:pair.profile_id}}});changed=true;}
    }
    if(changed)next=replaceComponent(next,name,value,next.indexOf('"schemas": {'));
  }
  return next;
}
if(process.argv[1]===fileURLToPath(import.meta.url))for(const file of [
  'research-foundation','research-run-create','research-progress','research-current-source','research-run-library',
  'research-evidence','research-split','research-search','research-freeze','research-replay','research-report','research-attempt-lineage',
]){
  const path=new URL(`../openapi/${file}.openapi.json`,import.meta.url),old=readFileSync(path,'utf8'),next=amendFull05(old,file);
  if(process.argv.includes('--check')){if(old!==next)throw new Error(`FULL05 contract drift ${file}`);}else if(old!==next)writeFileSync(path,next);
}
