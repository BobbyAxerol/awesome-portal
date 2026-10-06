/** Append exact mode identities; previously applied SQL is only read, never changed. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../../../',import.meta.url);
const table=JSON.parse(readFileSync(new URL('apps/portal/registry/research-execution-recipes.v1.json',root)));
const previous=readFileSync(new URL('apps/control-api/migrations/1723680000098_research-full03-indexed-recipes.sql',root),'utf8');
const rows=table.recipes.filter(r=>r.descriptor.schema_version==='research.full04-delta-profile.v1');
assert.equal(rows.length,35);
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'
  ?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const sha=v=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
const q=s=>"'"+s.replaceAll("'","''")+"'";
const ids=rows.map(r=>q(r.profile_id)).join(',');
const oldIds=previous.match(/run_producers_execution_profile_id_check CHECK\(execution_profile_id IN\(([^\n]+?)\)\),/)[1];
const oldDigest=previous.match(/ADD CONSTRAINT run_producers_execution_profile_digest_check CHECK\(([\s\S]+?)\),\n ADD CONSTRAINT run_producers_full03_exact_check/)[1];
const full03=table.recipes.filter(r=>r.descriptor.adapter_id==='full03.delta-rsi.v1'&&r.descriptor.schema_version!=='research.full06-delta-profile.v1');
const oldPairs=previous.match(/current_source_seals_v1_source_profile_pair_check CHECK\(([\s\S]+?)\);/)[1];
const display=previous.slice(previous.indexOf('CREATE OR REPLACE FUNCTION research.run_library_display_kind'))
  .replace(' END; $$;',()=>rows.map(r=>` WHEN ${q(r.profile_id)} THEN 'WFO'`).join('\n')+'\n END; $$;');
const output=[
  '-- FULL04 append-only exact mode/schedule/source pairs. No historical row is rewritten.',
  'ALTER TABLE research.run_producers DROP CONSTRAINT run_producers_execution_profile_id_check,',
  ' DROP CONSTRAINT run_producers_execution_profile_digest_check, DROP CONSTRAINT run_producers_full03_exact_check;',
  `ALTER TABLE research.run_producers ADD CONSTRAINT run_producers_execution_profile_id_check CHECK(execution_profile_id IN(${oldIds},${ids})),`,
  ' ADD CONSTRAINT run_producers_execution_profile_digest_check CHECK('+oldDigest,
  ...rows.map(r=>` OR (execution_profile_id=${q(r.profile_id)} AND execution_profile_digest=${q(r.profile_digest)} AND execution_profile_digest IS NOT NULL)`),
  ' ),',
  ` ADD CONSTRAINT run_producers_full03_exact_check CHECK((execution_adapter_id='full03.delta-rsi.v1')=(execution_profile_id IN(${full03.map(r=>q(r.profile_id)).join(',')})) AND (execution_adapter_id<>'full03.delta-rsi.v1' OR (alpha_version_id='av_delta_rsi_polynomial_alpha_1_0_1' AND adapter_contract_digest='23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b')));`,
  'ALTER TABLE research.current_source_seals_v1 DROP CONSTRAINT current_source_seals_v1_source_profile_pair_check;',
  'ALTER TABLE research.current_source_seals_v1 ADD CONSTRAINT current_source_seals_v1_source_profile_pair_check CHECK('+oldPairs,
  ...rows.map(r=>` OR (source_adapter_id=${q(r.descriptor.current_source.source_adapter_id)} AND profile_id=${q(r.descriptor.current_source.profile_id)})`),
  ' );',
  ...rows.flatMap(r=>[
    `INSERT INTO research.execution_recipe_descriptors_v1(profile_id,profile_digest,recipe_digest,descriptor,policy) VALUES(${q(r.profile_id)},${q(r.profile_digest)},${q(sha(r))},${q(JSON.stringify(r.descriptor))}::jsonb,${q(JSON.stringify(Object.fromEntries(Object.entries(r).filter(([k])=>k!=='descriptor'))))}::jsonb);`,
    `INSERT INTO research.execution_recipe_qualifications_v1(recipe_digest,kind,state,receipt_path,receipt_sha256,scope) VALUES(${q(sha(r))},'CANDIDATE_NOT_QUALIFIED','CANDIDATE',NULL,NULL,'OWNER_CELL_ONLY_NOT_PRODUCT_AUTHORITY');`,
  ]),display,
].join('\n').trimEnd()+'\n';
writeFileSync(new URL('apps/control-api/migrations/1723680000101_research-full04-mode-recipes.sql',root),output);
console.log('FULL04 migration101 generated:35 exact candidate rows; historical SQL unchanged.');
