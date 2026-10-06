/** Append106: exact percent-equity identities; preserve every historical row. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../../../',import.meta.url),check=process.argv.includes('--check');
const table=JSON.parse(readFileSync(new URL('apps/portal/registry/research-execution-recipes.v1.json',root)));
const binding=JSON.parse(readFileSync(new URL('apps/portal/registry/research-full06-delta-binding.v1.json',root)));
const rows=table.recipes.filter(r=>r.descriptor.schema_version==='research.full06-delta-profile.v1');assert.equal(rows.length,63);
const indexed=table.recipes.filter(r=>r.source_requirement==='FULL03_IMMUTABLE_DELTA_BINDING');
const old=readFileSync(new URL('apps/control-api/migrations/1723680000104_research-full05-imported-search.sql',root),'utf8');
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const hash=v=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex'),q=v=>"'"+v.replaceAll("'","''")+"'";
const oldIds=old.match(/execution_profile_id_check CHECK\(execution_profile_id IN\(([^\n]+?)\)\),/)[1];
const oldDigest=old.match(/execution_profile_digest_check CHECK\(([\s\S]+?)\),\n ADD CONSTRAINT run_producers_imported_adapter_profile_pair_check/)[1];
const pairs=old.match(/current_source_seals_v1_source_profile_pair_check CHECK\(([\s\S]+?)\);/)[1];
const previousBinding=JSON.parse(readFileSync(new URL('apps/portal/registry/research-full03-delta-binding.v1.json',root)));
const exactBindings=[previousBinding,binding].map(b=>`(alpha_version_id=${q(b.alpha_version_id)} AND contract_digest=${q(b.adapter_contract_digest)})`).join(' OR ');
const exactRows=indexed.map(r=>`(execution_profile_id=${q(r.profile_id)} AND alpha_version_id=${q(r.descriptor.alpha_binding_requirements.alpha_version_id)} AND adapter_contract_digest=${q(r.descriptor.adapter_contract_digest)})`).join('\n OR ');
const sql=[
 '-- FULL06/6a distinct immutable percent-equity declaration/account; not a notional alias.',
 'DROP INDEX research.alpha_versions_legacy_code_entrypoint_unique;',
 `CREATE UNIQUE INDEX alpha_versions_legacy_code_entrypoint_unique ON research.alpha_versions(workspace_id,alpha_id,code_digest,entrypoint) WHERE alpha_version_id NOT IN(${q(previousBinding.alpha_version_id)},${q(binding.alpha_version_id)});`,
 `ALTER TABLE research.alpha_versions ADD CONSTRAINT alpha_versions_full06_identity_check CHECK(alpha_version_id<>${q(binding.alpha_version_id)} OR (alpha_id=${q(binding.alpha_id)} AND code_digest=${q(binding.declared_contract.provenance.protected_kernel_sha256)} AND entrypoint=${q(binding.declared_contract.entrypoint)} AND declared_contract=${q(JSON.stringify(binding.declared_contract))}::jsonb));`,
 'ALTER TABLE research.execution_adapter_bindings DROP CONSTRAINT execution_adapter_bindings_full03_exact_check;',
 `ALTER TABLE research.execution_adapter_bindings ADD CONSTRAINT execution_adapter_bindings_full03_exact_check CHECK(adapter_id<>'full03.delta-rsi.v1' OR (${exactBindings}));`,
 'ALTER TABLE research.run_producers DROP CONSTRAINT run_producers_execution_profile_id_check, DROP CONSTRAINT run_producers_execution_profile_digest_check, DROP CONSTRAINT run_producers_full03_exact_check;',
 `ALTER TABLE research.run_producers ADD CONSTRAINT run_producers_execution_profile_id_check CHECK(execution_profile_id IN(${oldIds},${rows.map(r=>q(r.profile_id)).join(',')})),`,
 ' ADD CONSTRAINT run_producers_execution_profile_digest_check CHECK('+oldDigest,
 ...rows.map(r=>` OR (execution_profile_id=${q(r.profile_id)} AND execution_profile_digest=${q(r.profile_digest)} AND execution_profile_digest IS NOT NULL)`),
 ' ),',
 ` ADD CONSTRAINT run_producers_full03_exact_check CHECK((execution_adapter_id='full03.delta-rsi.v1')=(execution_profile_id IN(${indexed.map(r=>q(r.profile_id)).join(',')})) AND (execution_adapter_id<>'full03.delta-rsi.v1' OR (${exactRows})));`,
 'ALTER TABLE research.current_source_seals_v1 DROP CONSTRAINT current_source_seals_v1_source_profile_pair_check;',
 'ALTER TABLE research.current_source_seals_v1 ADD CONSTRAINT current_source_seals_v1_source_profile_pair_check CHECK('+pairs,
 ...rows.map(r=>` OR (source_adapter_id=${q(r.descriptor.current_source.source_adapter_id)} AND profile_id=${q(r.descriptor.current_source.profile_id)})`),' );',
 ...rows.flatMap(r=>[
  `INSERT INTO research.execution_recipe_descriptors_v1(profile_id,profile_digest,recipe_digest,descriptor,policy) VALUES(${q(r.profile_id)},${q(r.profile_digest)},${q(hash(r))},${q(JSON.stringify(r.descriptor))}::jsonb,${q(JSON.stringify(Object.fromEntries(Object.entries(r).filter(([k])=>k!=='descriptor'))))}::jsonb);`,
  `INSERT INTO research.execution_recipe_qualifications_v1(recipe_digest,kind,state,receipt_path,receipt_sha256,scope) VALUES(${q(hash(r))},'CANDIDATE_NOT_QUALIFIED','CANDIDATE',NULL,NULL,'OWNER_CELL_ONLY_NOT_PRODUCT_AUTHORITY');`,
 ]),
 old.slice(old.indexOf('CREATE OR REPLACE FUNCTION research.run_library_display_kind')).replace(' END; $$;',()=>rows.map(r=>` WHEN ${q(r.profile_id)} THEN '${r.descriptor.protocol==='advanced'?'WFO':'OPT'}'`).join('\n')+'\n END; $$;'),
].join('\n').replace(/[ \t]+$/gm,'').trimEnd()+'\n';
const file=new URL('apps/control-api/migrations/1723680000106_research-full06-percent-equity.sql',root);
if(check)assert.equal(readFileSync(file,'utf8'),sql);else writeFileSync(file,sql);
console.log('FULL06 append106 exact custody '+(check?'verified':'generated'));
