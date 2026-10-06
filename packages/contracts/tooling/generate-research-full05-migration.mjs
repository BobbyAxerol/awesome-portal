/** Append104: extend custody, never rewrite previously applied SQL or runs. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../../../',import.meta.url),check=process.argv.includes('--check');
const table=JSON.parse(readFileSync(new URL('apps/portal/registry/research-execution-recipes.v1.json',root)));
const old=readFileSync(new URL('apps/control-api/migrations/1723680000101_research-full04-mode-recipes.sql',root),'utf8');
const rows=table.recipes.filter(r=>r.descriptor.schema_version==='research.full05-imported-profile.v1');assert.equal(rows.length,27);
const q=v=>"'"+v.replaceAll("'","''")+"'";
const normalize=v=>Array.isArray(v)?v.map(normalize):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,normalize(v[k])])):v;
const hash=v=>createHash('sha256').update(JSON.stringify(normalize(v))).digest('hex');
const oldIds=old.match(/execution_profile_id_check CHECK\(execution_profile_id IN\(([^\n]+?)\)\),/)[1];
const oldDigest=old.match(/execution_profile_digest_check CHECK\(([\s\S]+?)\),\n ADD CONSTRAINT run_producers_full03_exact_check/)[1];
const pairs=old.match(/current_source_seals_v1_source_profile_pair_check CHECK\(([\s\S]+?)\);/)[1];
const display=old.slice(old.indexOf('CREATE OR REPLACE FUNCTION research.run_library_display_kind'))
  .replace(' END; $$;',()=>rows.map(r=>` WHEN ${q(r.profile_id)} THEN '${r.descriptor.protocol==='advanced'?'WFO':'OPT'}'`).join('\n')+'\n END; $$;');
const sql=[
 '-- FULL05: separate confined imported search descriptors; old fixed import profile unchanged.',
 'ALTER TABLE research.run_producers DROP CONSTRAINT run_producers_execution_profile_id_check, DROP CONSTRAINT run_producers_execution_profile_digest_check, DROP CONSTRAINT run_producers_imported_adapter_profile_pair_check;',
 `ALTER TABLE research.run_producers ADD CONSTRAINT run_producers_execution_profile_id_check CHECK(execution_profile_id IN(${oldIds},${rows.map(r=>q(r.profile_id)).join(',')})),`,
 ' ADD CONSTRAINT run_producers_execution_profile_digest_check CHECK('+oldDigest,
 ...rows.map(r=>` OR (execution_profile_id=${q(r.profile_id)} AND execution_profile_digest=${q(r.profile_digest)} AND execution_profile_digest IS NOT NULL)`),
 ' ),',
 ` ADD CONSTRAINT run_producers_imported_adapter_profile_pair_check CHECK((execution_adapter_id='p17.imported-signal-notional.v1')=(execution_profile_id IN('p17.imported-signal-notional.v1',${rows.map(r=>q(r.profile_id)).join(',')})));`,
 'ALTER TABLE research.current_source_seals_v1 DROP CONSTRAINT current_source_seals_v1_source_profile_pair_check;',
 'ALTER TABLE research.current_source_seals_v1 ADD CONSTRAINT current_source_seals_v1_source_profile_pair_check CHECK('+pairs,
 ...rows.map(r=>` OR (source_adapter_id=${q(r.descriptor.current_source.source_adapter_id)} AND profile_id=${q(r.descriptor.current_source.profile_id)})`),' );',
 ...rows.flatMap(r=>[
  `INSERT INTO research.execution_recipe_descriptors_v1(profile_id,profile_digest,recipe_digest,descriptor,policy) VALUES(${q(r.profile_id)},${q(r.profile_digest)},${q(hash(r))},${q(JSON.stringify(r.descriptor))}::jsonb,${q(JSON.stringify(Object.fromEntries(Object.entries(r).filter(([k])=>k!=='descriptor'))))}::jsonb);`,
  `INSERT INTO research.execution_recipe_qualifications_v1(recipe_digest,kind,state,receipt_path,receipt_sha256,scope) VALUES(${q(hash(r))},'CANDIDATE_NOT_QUALIFIED','CANDIDATE',NULL,NULL,'OWNER_CELL_ONLY_NOT_PRODUCT_AUTHORITY');`,
 ]),display,
].join('\n').replace(/[ \t]+$/gm,'').trimEnd()+'\n';
const file=new URL('apps/control-api/migrations/1723680000104_research-full05-imported-search.sql',root);
if(check)assert.equal(readFileSync(file,'utf8'),sql);else writeFileSync(file,sql);
console.log('FULL05 append104 exact descriptor/source custody '+(check?'verified':'generated'));
