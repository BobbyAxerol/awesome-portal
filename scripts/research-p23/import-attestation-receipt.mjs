#!/usr/bin/env node
/** E6-BR-01 real parse/gates/register/readback, on the owned cell only. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_HOME, operatorClient, privateJson, savePrivate } from './api-client.mjs';
import { PROJECT, BASE_URL, validateHome } from './cell.mjs';

export function assertAttestation(response) {
  const fact = response.import_attestation;
  assert(fact && fact.schema_version === 'research.alpha-import-attestation.v1');
  assert.equal(fact.scope, 'REGISTERED_ALPHA_SOURCE_ONLY');
  assert.equal(fact.source_digest, response.source_digest, 'EXACT_REGISTERED_SOURCE_SUBJECT_REQUIRED');
  for (const [kind, reason] of [['signature','RESEARCH_ALPHA_IMPORT_SIGNATURE_NOT_PRODUCED'],
    ['sbom','RESEARCH_ALPHA_IMPORT_SBOM_NOT_PRODUCED']]) {
    assert.deepEqual(fact[kind], { state:'NOT_PUBLISHED', reason_code:reason,
      source_locator:'apps/control-api/src/research/alpha-import.service.ts#register' });
  }
  return fact;
}

async function main() {
  const home = validateHome(process.argv.find(a => a.startsWith('--home='))?.slice(7) ?? DEFAULT_HOME);
  const path = join(home, 'import-attestation-receipt.json');
  const client = await operatorClient(home);
  let receipt;
  if (existsSync(path)) {
    receipt = privateJson(path);
    assert.equal(receipt.project, PROJECT); assert.equal(receipt.base_url, BASE_URL);
    assert(!receipt.passed, 'PRIOR_COMPLETED_RECEIPT_REUSE_DO_NOT_REIMPORT');
  } else {
    // Reuse the accepted E17 Alpha source, with an inert test-only comment
    // making this registration distinct. Do not execute source or widen a gate.
    const fixture = readFileSync(new URL('../research-preview/e17-imported-receipt.mjs', import.meta.url), 'utf8');
    const match = fixture.match(/const source = `([\s\S]*?)`;/);
    assert(match, 'ACCEPTED_E17_SOURCE_FIXTURE_REQUIRED');
    const nonce = randomUUID();
    const source = `# P23 owned attestation subject ${nonce}\n${match[1]}`;
    receipt = { schema_version:'research.p23-import-attestation-receipt.v1', project:PROJECT, base_url:BASE_URL,
      identity:privateJson(join(home,'identity.json')), started_at_utc:new Date().toISOString(),
      alpha_id:`p23-attestation-${nonce.slice(0,8)}`, source, source_digest:createHash('sha256').update(source).digest('hex'),
      passed:false };
    savePrivate(path, receipt);
  }
  // Temporary parse/gate custody may expire while a build is being checked.
  // Keep the original response as evidence and re-parse the same exact bytes
  // through the public route. Never extend a TTL or rewrite the source row.
  if (!receipt.registration && receipt.parse?.body.expires_at_utc_ms <= Date.now()) {
    (receipt.expired_parse_history ??= []).push({ parse:receipt.parse, gates:receipt.gates ?? null,
      recorded_at_utc:new Date().toISOString(), reason:'PUBLIC_SOURCE_CUSTODY_TTL_EXPIRED' });
    delete receipt.parse; delete receipt.gates;
    savePrivate(path,receipt);
  }
  if (!receipt.parse) {
    receipt.parse=await client.call('POST','/api/v1/research/alphas/import/parse',{
      original_filename:'p23-attestation.py',source_text:receipt.source,expected_source_digest:receipt.source_digest,
    },[201]);savePrivate(path,receipt);
  }
  if (!receipt.gates) {
    receipt.gates=await client.call('POST','/api/v1/research/alphas/import/gates',{
      source_file_ref:receipt.parse.body.source_file_ref,
    });assert.equal(receipt.gates.body.all_pass,true);savePrivate(path,receipt);
  }
  const register={alpha_id:receipt.alpha_id,source_file_ref:receipt.parse.body.source_file_ref,
    gate_receipt_id:receipt.gates.body.gate_receipt_id};
  if (!receipt.registration) {
    receipt.registration=await client.call('POST','/api/v1/research/alphas/import/register',register,[201]);
    savePrivate(path,receipt);
  }
  assert.equal(receipt.registration.body.source_digest,receipt.source_digest);
  assert.equal(receipt.registration.body.lifecycle_state,'DRAFT');
  assertAttestation(receipt.registration.body);
  receipt.replay=await client.call('POST','/api/v1/research/alphas/import/register',register,[201]);
  assert.equal(receipt.replay.body.replayed,true);assert.equal(receipt.replay.body.alpha_version_id,receipt.registration.body.alpha_version_id);
  assert.deepEqual(assertAttestation(receipt.replay.body),receipt.registration.body.import_attestation);
  receipt.registry=await client.call('GET',`/api/v1/research/alphas?alpha_id=${receipt.alpha_id}`);
  assert.equal(receipt.registry.body.entries.length,1);
  assert.deepEqual(assertAttestation(receipt.registry.body.entries[0]),receipt.registration.body.import_attestation);
  receipt.injection=await client.call('POST','/api/v1/research/alphas/import/register',{
    ...register,import_attestation:{scope:'SIGNED_RELEASE_IMAGE',signature:{state:'AVAILABLE'}},
  },[400]);
  receipt.passed=true;receipt.completed_at_utc=new Date().toISOString();savePrivate(path,receipt);
  console.log(JSON.stringify({passed:true,alpha_version_id:receipt.registration.body.alpha_version_id,
    source_digest:receipt.source_digest,registration_state:'DRAFT',replay:true,caller_injection_status:receipt.injection.status}));
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  main().catch(error=>{console.error('P23 import attestation refused:',error.message);process.exitCode=1;});
}
