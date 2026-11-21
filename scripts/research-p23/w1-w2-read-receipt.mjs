#!/usr/bin/env node
/** Claude W1/W2 named reads; owned cell, no run/seal/publish mutation. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_HOME, loadSessions, makeClient, savePrivate } from './api-client.mjs';
import { BASE_URL, PROJECT, validateHome } from './cell.mjs';
import { container, dbQuery, docker } from './runtime-tools.mjs';

const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const WORKSPACE = 'ws_06GE6XY0SKNPFS7TP8WCE938Z5';
const RUNS = Object.freeze({ global: 'rrun_49142d25954abd176d3c2bd0f44b51e2', causal: 'rrun_becde1e160a2770d49246f7f665208ce',
  failed: 'rrun_26c7490c49549f89e1b665a9b83b7037' });
function custody() {
  return dbQuery(`SELECT 'report' kind, run_id, report_revision identity, frozen_core_digest digest FROM research.run_report_manifests_v1
    WHERE workspace_id=$1 UNION ALL SELECT 'rc',run_id,release_candidate_id,pack_digest FROM research.release_candidate_packs_v1
    WHERE workspace_id=$1 UNION ALL SELECT 'retained',run_id,artifact_revision::text,retained_import_digest FROM research.current_source_seals_v1
    WHERE workspace_id=$1 ORDER BY kind,run_id,identity`, [WORKSPACE]).rows;
}
export async function w1w2ReadReceipt(home = DEFAULT_HOME, label = 'w1-w2-read-20261003') {
  home = validateHome(home); assert(/^[a-z0-9-]{1,64}$/.test(label));
  const target = join(home, `${label}.json`); assert(!existsSync(target), 'IMMUTABLE_RECEIPT_ALREADY_EXISTS');
  const owner = loadSessions(home).identities.find(row => row.username === 'p23-owner');
  assert(owner?.id && owner.password, 'RETAINED_OWNER_ANCHOR_REQUIRED');
  const client = makeClient({ ...owner, cookies: {} });
  const receipt = { schema_version: 'research.w1-w2-owned-read-proof.v1', project: PROJECT, base_url: BASE_URL,
    at_utc: new Date().toISOString(), image_id: docker(['inspect','--format','{{.Image}}',container('control-api')]).trim(),
    passed: false, reads: {}, custody_before: sha(custody()), custody_after: null, session_revoked: false };
  const q = `workspace_id=${WORKSPACE}`;
  const get = async (key, path, statuses) => { const r = await client.call('GET',path,undefined,statuses);
    receipt.reads[key] = r; savePrivate(target,receipt); return r.body; };
  let authenticated = false;
  try {
    await client.call('POST','/api/auth/login',{username:owner.username,credential:owner.password},[201]); authenticated = true;
    const journey = await get('journey',`/api/v1/research/journey?${q}`);
    assert.equal(journey.descriptor.revision,5);
    assert.equal(journey.descriptor.content_sha256,'7e408074d63ee35cf3074de84a70d98d5481472df31d38c8a6c3ab91da01c9be');
    assert(journey.descriptor.phases.every(phase => !/shipped/i.test(phase.description)
      && phase.cards.every(card => !/shipped/i.test(card.description))));
    const conditional = await fetch(new URL(`/api/v1/research/journey?${q}`,BASE_URL), {
      redirect:'manual', signal:AbortSignal.timeout(10000), headers:{ origin:BASE_URL, accept:'application/json',
        'x-dev-access-email': `${owner.username}@azdag.com`,
        cookie:[...client.jar].map(([key,value])=>`${key}=${value}`).join('; '), 'if-none-match':journey.etag } });
    assert.equal(conditional.status,304); assert.equal(await conditional.text(),'');
    receipt.conditional_journey_status = conditional.status;
    await get('foreign_workspace', '/api/v1/research/journey?workspace_id=ws_w1_w2_absent', [404]);
    for (const [kind,id] of Object.entries(RUNS).filter(([key]) => key !== 'failed')) {
      const source = await get(`${kind}_evidence`,`/api/v1/quantbt/runs/${id}/current-source/evidence?${q}`);
      const search = await get(`${kind}_search`,`/api/v1/quantbt/runs/${id}/current-source/search?${q}&limit=1`);
      const freeze = await get(`${kind}_freeze`,`/api/v1/quantbt/runs/${id}/current-source/freeze?${q}`);
      const split = await get(`${kind}_split`,`/api/v1/quantbt/runs/${id}/current-source/split?${q}`);
      assert.equal(search.selection.selected_trial_ordinal_scope,kind === 'global' ? 'RUN_GLOBAL' : 'STUDY_LOCAL');
      assert(Number.isSafeInteger(search.selection.selected_trial_ordinal) && search.selection.selected_trial_ordinal > 0);
      assert.equal(freeze.frozen_selection.selected_trial_ordinal, search.selection.selected_trial_ordinal);
      if (kind === 'causal') assert(split.fold_plan.folds.every(fold => fold.causal_selection.selected_trial_ordinal_scope === 'STUDY_LOCAL'));
      const compose = await get(`${kind}_rc`,`/api/v1/quantbt/runs/${id}/release-candidate?${q}`);
      assert.equal(compose.run_status,'COMPLETED'); assert.equal(compose.report_sealed,true);
      const semantics = compose.pack.find(row => row.key === 'METRICS_SEMANTICS');
      assert(semantics && semantics.status !== 'MISSING', 'MATCHING_SEALED_REPORT_STILL_REFUSED');
      assert(compose.rail.find(row => row.key === 'selected_params').detail.includes(`trial ${search.selection.selected_trial_ordinal}`));
      assert(compose.source_fingerprint && source.revision);
      const label = dbQuery('SELECT research.run_library_display_label($1,$2) label',[WORKSPACE,id]).rows[0].label;
      assert(label);
      const library = await get(`${kind}_label_search`,`/api/v1/quantbt/runs?${q}&q=${encodeURIComponent(label)}&limit=50`);
      assert(library.items.some(row => row.run_id === id && row.display_label === label));
    }
    const failed = await get('failed_hub',`/api/v1/quantbt/runs/${RUNS.failed}/evidence?${q}`);
    const progress = await get('failed_progress',`/api/v1/research/runs/${RUNS.failed}/progress?${q}`);
    assert.equal(failed.lifecycle.display_status,'FAILED');
    assert.deepEqual(failed.lifecycle.failed_at,progress.current.failed_at);
    receipt.custody_after = sha(custody()); assert.equal(receipt.custody_after,receipt.custody_before);
    receipt.passed = true;
  } catch (error) { receipt.failure = error.message; throw error; }
  finally {
    if (authenticated) { await client.call('POST','/api/auth/logout',{},[200,201]); receipt.session_revoked = true; }
    receipt.finished_at_utc = new Date().toISOString(); savePrivate(target,receipt);
  }
  return receipt;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  w1w2ReadReceipt(process.argv.find(v=>v.startsWith('--home='))?.slice(7)??DEFAULT_HOME,
    process.argv.find(v=>v.startsWith('--label='))?.slice(8)??'w1-w2-read-20261003')
    .then(r=>console.log(`W1/W2 owned named reads PASS ${Object.keys(r.reads).length}, receipt ${sha(r)}`))
    .catch(e=>{ console.error('W1/W2 named read proof refused:',e.message); process.exitCode=1; });
}
