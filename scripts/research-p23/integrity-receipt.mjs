#!/usr/bin/env node
/** OL-02 real observer: corrupt only an owned copy and restore it, not its seal. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_HOME, ownerClient, privateJson, savePrivate } from './api-client.mjs';
import { BASE_URL, PROJECT, validateHome } from './cell.mjs';
import { container, dbQuery, docker } from './runtime-tools.mjs';

const ROOT = resolve(new URL('../..', import.meta.url).pathname);
const ORIGINAL = '/var/lib/portal/artifacts/runs/durable-store/research-retained';
const COPY = '/var/lib/portal/artifacts/p23-integrity-copy';
function tree(artifactId) {
  const text = docker(['exec', container('portal-api'), 'sh', '-c',
    `find '${ORIGINAL}/artifacts/${artifactId}' -type f -exec sha256sum {} +`]);
  const rows = text.trim().split('\n').sort();
  assert(rows.length && rows.every(row => /^[a-f0-9]{64}\s/.test(row)), 'SOURCE_TREE_DIGEST_REQUIRED');
  return { files: rows, tree_sha256: createHash('sha256').update(rows.join('\n')).digest('hex') };
}
export async function integrityReceipt(home = DEFAULT_HOME) {
  home = validateHome(home);
  const seed = privateJson(join(home, 'run-integrity-original.json'));
  assert(seed.final?.body.current.effective_status === 'COMPLETED', 'REAL_COMPLETED_SEED_REQUIRED');
  const client = await ownerClient(home);
  const artifact = dbQuery(`SELECT artifact_id,manifest_digest,artifact_revision FROM research.artifacts
    WHERE run_id=$1 AND state='SEALED' AND artifact_revision>0 ORDER BY artifact_revision DESC LIMIT 1`, [seed.run_id]).rows[0];
  assert(artifact && /^[a-zA-Z0-9_-]+$/.test(artifact.artifact_id), 'SEALED_ARTIFACT_REQUIRED');
  const part = dbQuery(`SELECT relative_path,part_digest FROM research.artifact_parts
    WHERE artifact_id=$1 ORDER BY table_kind,part_ordinal LIMIT 1`, [artifact.artifact_id]).rows[0];
  assert(part && /^[a-zA-Z0-9_./-]+$/.test(part.relative_path) && !part.relative_path.includes('..'), 'SAFE_SEALED_PART_REQUIRED');
  const receipt = { schema_version: 'research.p23-integrity-runtime.v1', project: PROJECT, base_url: BASE_URL,
    identity: privateJson(join(home, 'identity.json')), run_id: seed.run_id,
    original_expectation: artifact, original_before: tree(artifact.artifact_id), steps: [],
    started_at_utc: new Date().toISOString() };
  const path = join(home, 'integrity-receipt.json');
  const verify = async (label, state) => {
    const response = await client.call('POST', `/api/v1/quantbt/runs/${seed.run_id}/freeze/verify`, {});
    receipt.steps.push({ label, response }); savePrivate(path, receipt);
    assert.equal(response.body.artifact_bytes.state, state, `ACTUAL_OBSERVER_${label}`);
    assert.equal(response.body.artifact_bytes.expected_manifest_digest, artifact.manifest_digest);
    if (state === 'MISMATCH') assert.equal(response.body.integrity.state, 'BLOCKED');
  };
  const switchObserver = mode => execFileSync('node', [join(ROOT, 'scripts/research-p23/cell.mjs'), mode, `--home=${home}`],
    { encoding: 'utf8', stdio: 'pipe', timeout: 120000 });
  await verify('original-match', 'MATCH');
  docker(['exec', container('portal-api'), 'sh', '-c',
    `test ! -e '${COPY}/artifacts/${artifact.artifact_id}' && mkdir -p '${COPY}/artifacts' && cp -a '${ORIGINAL}/artifacts/${artifact.artifact_id}' '${COPY}/artifacts/'`]);
  try {
    switchObserver('observer-copy');
    await verify('copy-match', 'MATCH');
    const copyPart = `${COPY}/artifacts/${artifact.artifact_id}/${part.relative_path}`;
    docker(['exec', container('portal-api'), 'sh', '-c',
      `chmod u+w '${copyPart}' && dd if=/dev/zero of='${copyPart}' bs=1 count=4 conv=notrunc status=none`]);
    await verify('copy-corrupt', 'MISMATCH');
    await verify('copy-corrupt-repeat', 'MISMATCH');
    docker(['exec', container('portal-api'), 'cp',
      `${ORIGINAL}/artifacts/${artifact.artifact_id}/${part.relative_path}`, copyPart]);
    await verify('copy-restored', 'MATCH');
  } finally { switchObserver('observer-normal'); }
  await verify('original-after-switch', 'MATCH');
  receipt.original_after = tree(artifact.artifact_id);
  assert.deepEqual(receipt.original_after, receipt.original_before);
  const after = dbQuery(`SELECT artifact_id,manifest_digest,artifact_revision FROM research.artifacts WHERE artifact_id=$1`, [artifact.artifact_id]).rows[0];
  assert.deepEqual(after, artifact);
  receipt.durable_receipts = dbQuery(`SELECT receipt_id,state,expected_manifest_digest,observed_manifest_digest
    FROM research.artifact_byte_receipts_v1 WHERE run_id=$1 ORDER BY verified_at,receipt_id`, [seed.run_id]).rows;
  const ids = receipt.steps.map(step => step.response.body.artifact_bytes.receipt_id);
  assert.equal(new Set(ids).size, 6);
  assert(ids.every(id => receipt.durable_receipts.some(row => row.receipt_id === id)));
  receipt.passed = true; receipt.finished_at_utc = new Date().toISOString(); savePrivate(path, receipt);
  console.log('OL-02 real observer PASS: six durable receipts, MATCH/MISMATCH/repeat/restore; original bytes and seal unchanged.');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  integrityReceipt(process.argv.find(arg => arg.startsWith('--home='))?.slice(7) ?? DEFAULT_HOME)
    .catch(error => { console.error('OL-02 runtime refused:', error.message); process.exitCode = 1; });
}
