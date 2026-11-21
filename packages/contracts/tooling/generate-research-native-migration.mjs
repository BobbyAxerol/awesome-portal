/** Append109/112; immutable native editions, never rewriting applied SQL. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../../../',import.meta.url),check=process.argv.includes('--check');
const table=JSON.parse(readFileSync(new URL('apps/portal/registry/research-execution-recipes.v1.json',root)));
const revision=Number(process.argv.find(v=>v.startsWith('--revision=v'))?.slice(12)??1);
assert([1,2,3].includes(revision),'EXACT_APPEND_NATIVE_REVISION');
const number=revision===3?'113':revision===2?'112':'109';
const rows=table.recipes.filter(r=>r.descriptor.schema_version==='research.native-route-profile.v1'&&r.profile_id.endsWith(`.v${revision}`));assert.equal(rows.length,3);
const allBindings=JSON.parse(readFileSync(new URL('apps/portal/registry/research-native-delta-bindings.v1.json',root)));
const bindings=allBindings.filter(b=>rows.some(r=>r.descriptor.alpha_binding_requirements.alpha_version_id===b.alpha_version_id));
const nativeAtRevision=table.recipes.filter(r=>r.descriptor.schema_version==='research.native-route-profile.v1'
 &&Number(r.profile_id.match(/\.v([0-9]+)$/)[1])<=revision);
const applicableBindings=allBindings.filter(b=>nativeAtRevision.some(r=>r.descriptor.alpha_binding_requirements.alpha_version_id===b.alpha_version_id));
const predecessor=revision===3?'112_research-native-route-v2':revision===2?'109_research-native-route':'108_research-expanded-trial';
const old=readFileSync(new URL(`apps/control-api/migrations/1723680000${predecessor}-recipes.sql`,root),'utf8');
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const hash=v=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex'),q=v=>"'"+v.replaceAll("'","''")+"'";
const ids=old.match(/execution_profile_id_check CHECK\(execution_profile_id IN\(([^\n]+?)\)\),/)[1];
const digests=old.match(/execution_profile_digest_check CHECK\(([\s\S]+?)\),\n ADD CONSTRAINT run_producers_full03_exact_check/)[1];
const indexed=table.recipes.filter(r=>r.source_requirement==='FULL03_IMMUTABLE_DELTA_BINDING'
 &&(r.descriptor.schema_version!=='research.native-route-profile.v1'||nativeAtRevision.some(n=>n.profile_id===r.profile_id)));
const code=bindings[0].declared_contract.provenance.protected_kernel_sha256;
const sql=['-- Required native Delta editions: immutable inputs/clocks; no imported arbitrary command tape.',
 'DROP INDEX research.alpha_versions_legacy_code_entrypoint_unique;',
 `CREATE UNIQUE INDEX alpha_versions_legacy_code_entrypoint_unique ON research.alpha_versions(workspace_id,alpha_id,code_digest,entrypoint) WHERE alpha_version_id NOT IN('av_delta_rsi_polynomial_alpha_1_0_1','av_delta_rsi_polynomial_alpha_1_0_2',${applicableBindings.map(b=>q(b.alpha_version_id)).join(',')});`,
 ...bindings.map((b,i)=>`ALTER TABLE research.alpha_versions ADD CONSTRAINT alpha_versions_native_${i+1+3*(revision-1)}_identity_check CHECK(alpha_version_id<>${q(b.alpha_version_id)} OR (alpha_id=${q(b.alpha_id)} AND code_digest=${q(code)} AND entrypoint=${q(b.declared_contract.entrypoint)} AND declared_contract=${q(JSON.stringify(b.declared_contract))}::jsonb));`),
 'ALTER TABLE research.execution_adapter_bindings DROP CONSTRAINT execution_adapter_bindings_full03_exact_check;',
 `ALTER TABLE research.execution_adapter_bindings ADD CONSTRAINT execution_adapter_bindings_full03_exact_check CHECK(adapter_id<>'full03.delta-rsi.v1' OR (${indexed.map(r=>`(alpha_version_id=${q(r.descriptor.alpha_binding_requirements.alpha_version_id)} AND contract_digest=${q(r.descriptor.adapter_contract_digest)})`).filter((v,i,a)=>a.indexOf(v)===i).join(' OR ')}));`,
 'ALTER TABLE research.run_producers DROP CONSTRAINT run_producers_execution_profile_id_check, DROP CONSTRAINT run_producers_execution_profile_digest_check, DROP CONSTRAINT run_producers_full03_exact_check;',
 `ALTER TABLE research.run_producers ADD CONSTRAINT run_producers_execution_profile_id_check CHECK(execution_profile_id IN(${ids},${rows.map(r=>q(r.profile_id)).join(',')})),`,
 ' ADD CONSTRAINT run_producers_execution_profile_digest_check CHECK('+digests,
 ...rows.map(r=>` OR (execution_profile_id=${q(r.profile_id)} AND execution_profile_digest=${q(r.profile_digest)} AND execution_profile_digest IS NOT NULL)`),' ),',
 ` ADD CONSTRAINT run_producers_full03_exact_check CHECK((execution_adapter_id='full03.delta-rsi.v1')=(execution_profile_id IN(${indexed.map(r=>q(r.profile_id)).join(',')})) AND (execution_adapter_id<>'full03.delta-rsi.v1' OR (${indexed.map(r=>`(execution_profile_id=${q(r.profile_id)} AND alpha_version_id=${q(r.descriptor.alpha_binding_requirements.alpha_version_id)} AND adapter_contract_digest=${q(r.descriptor.adapter_contract_digest)})`).join(' OR ')})));`,
 ...rows.flatMap(r=>[`INSERT INTO research.execution_recipe_descriptors_v1(profile_id,profile_digest,recipe_digest,descriptor,policy) VALUES(${q(r.profile_id)},${q(r.profile_digest)},${q(hash(r))},${q(JSON.stringify(r.descriptor))}::jsonb,${q(JSON.stringify(Object.fromEntries(Object.entries(r).filter(([k])=>k!=='descriptor'))))}::jsonb);`,
 `INSERT INTO research.execution_recipe_qualifications_v1(recipe_digest,kind,state,receipt_path,receipt_sha256,scope) VALUES(${q(hash(r))},'CANDIDATE_NOT_QUALIFIED','CANDIDATE',NULL,NULL,'OWNER_CELL_ONLY_NOT_PRODUCT_AUTHORITY');`]),
 old.slice(old.indexOf('CREATE OR REPLACE FUNCTION research.run_library_display_kind')).replace(' END; $$;',()=>rows.map(r=>` WHEN ${q(r.profile_id)} THEN 'P04'`).join('\n')+'\n END; $$;')].join('\n').replace(/[ \t]+$/gm,'').trimEnd()+'\n';
const path=new URL(`apps/control-api/migrations/1723680000${number}_research-native-route${revision>1?'-v'+revision:''}-recipes.sql`,root);
if(check)assert.equal(readFileSync(path,'utf8'),sql);else writeFileSync(path,sql);
