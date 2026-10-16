import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assessQualification, REQUIREMENTS, BUDGET_GROUPS, sha256 } from './qualification-readiness.mjs';

// Entirely synthetic unit data. A ready result never authorizes runtime or
// substitutes these fabricated receipts for a source/browser measurement.
function fixture() {
  const files = new Map([['src/input.ts', Buffer.from('pinned source')]]);
  const selection = { workspace_id: 'workspace-unit', environment: 'paper', profile_id: 'profile-unit',
    catalogue_sha256: `sha256:${'a'.repeat(64)}`, schema_sha256: `sha256:${'b'.repeat(64)}`,
    source_commit: 'c'.repeat(40), dependency_hashes: { 'src/input.ts': sha256(files.get('src/input.ts')) } };
  const input = { schema_version: 'portal.elp2-10.qualification-input.v1', selection, records: {} };
  const approvalPins = {};
  const evidence = {};
  const put = kind => {
    const path = `evidence/${kind}.json`, bytes = Buffer.from(JSON.stringify(evidence[kind]));
    files.set(path, bytes); input.records[kind] = { artifact: { path, sha256: sha256(bytes) } };
  };
  for (const kind of Object.keys(REQUIREMENTS)) {
    evidence[kind] = { schema_version: 'portal.elp2-10.qualification-evidence.v1', kind,
      status: 'PASS', evidence_class: 'RUNTIME_VERIFIED', selection: structuredClone(selection), observed_at_ms: 900 };
    if (['calibration', 'budgets', 'source_window'].includes(kind)) {
      evidence[kind].approval_id = `independent-${kind}`; evidence[kind].approval_state = 'APPROVED';
    }
    if (kind === 'budgets') evidence[kind].budgets = BUDGET_GROUPS.map(id => ({ id, owner: 'synthetic unit fixture',
      approval_ref: `unit-${id}`, metrics: [{ id: 'unit_metric', unit: 'count', bound_kind: 'MAX_ABSOLUTE', baseline: 0, approved_bound: 0 }] }));
    if (kind === 'source_window') evidence[kind].window = { starts_at_ms: 800, ends_at_ms: 1100 };
    put(kind);
  }
  const approve = kind => { approvalPins[kind] = { artifact_sha256: input.records[kind].artifact.sha256, approval_id: evidence[kind].approval_id }; };
  for (const kind of ['calibration', 'budgets', 'source_window']) approve(kind);
  const options = { readArtifact: path => { assert(files.has(path), 'fixture artifact missing'); return files.get(path); },
    approvalPins, nowMs: 1000, maximumAgeMs: 200 };
  return { input, options, files, evidence, put, approve,
    check: () => assessQualification(input, options) };
}
function blocked(f, requirement, reason) {
  const result = f.check(); assert.equal(result.verdict, 'BLOCKED');
  assert(result.blockers.some(item => item.requirement === requirement && item.reason === reason), JSON.stringify(result));
  assert.equal(result.runtime_authorized, false); assert.equal(result.full_phase_pass, false);
}

test('positive exact evidence is only eligible for independent measurement review', () => {
  const result = fixture().check(); assert.equal(result.verdict, 'READY_FOR_MEASUREMENT_REVIEW');
  assert.deepEqual(result.blockers, []); assert.equal(result.runtime_authorized, false); assert.equal(result.full_phase_pass, false);
  assert.equal(result.capacity_certified, false);
});
for (const [kind, reason] of Object.entries(REQUIREMENTS)) {
  test(`missing ${kind} has its own blocker`, () => { const f = fixture(); delete f.input.records[kind]; blocked(f, kind, reason); });
}
test('self-asserted installed state does not supply an artifact', () => {
  const f = fixture(); f.input.records.trust_adapter = { status: 'PASS', qualification: 'SOURCE_VERIFIED' };
  blocked(f, 'trust_adapter', 'ADAPTER_NOT_INSTALLED');
});
for (const evidenceClass of ['TEST_ONLY', 'SYNTHETIC', 'SOURCE_CONFIRMED', 'HISTORICAL_EVIDENCE']) {
  test(`rejects ${evidenceClass} for runtime eligibility`, () => {
    const f = fixture(); f.evidence.writer.evidence_class = evidenceClass; f.put('writer'); blocked(f, 'writer', 'NON_RUNTIME_EVIDENCE');
  });
}
for (const marker of [{ qualification: 'TEST_ONLY' }, { fixture: true }, { synthetic: true }, { test_only: true }]) {
  test(`runtime label cannot override ${JSON.stringify(marker)}`, () => {
    const f = fixture(); Object.assign(f.evidence.writer, marker); f.put('writer'); blocked(f, 'writer', 'NON_RUNTIME_EVIDENCE');
  });
}
test('tampered artifact bytes are not accepted even with PASS metadata', () => {
  const f = fixture(); f.files.set(f.input.records.writer.artifact.path, Buffer.from('{}')); blocked(f, 'writer', 'ARTIFACT_DIGEST_MISMATCH');
});
test('missing artifact is not an empty successful receipt', () => {
  const f = fixture(); f.files.delete(f.input.records.writer.artifact.path); blocked(f, 'writer', 'ARTIFACT_UNREADABLE_OR_INVALID_JSON');
});
for (const field of ['workspace_id', 'environment', 'profile_id', 'catalogue_sha256', 'schema_sha256', 'source_commit']) {
  test(`receipt cannot be reused across ${field}`, () => {
    const f = fixture(), changed = field === 'environment' ? 'live' : field.endsWith('_sha256') ? `sha256:${'d'.repeat(64)}` : field === 'source_commit' ? 'd'.repeat(40) : 'other';
    f.evidence.writer.selection[field] = changed; f.put('writer'); blocked(f, 'writer', 'SELECTION_OR_DEPENDENCY_PIN_MISMATCH');
  });
}
test('dependency bytes must match selected pins independently of receipts', () => {
  const f = fixture(); f.files.set('src/input.ts', Buffer.from('changed source')); blocked(f, 'manifest', 'DEPENDENCY_DIGEST_MISMATCH');
});
test('receipt with old dependency manifest is rejected', () => {
  const f = fixture(); f.evidence.writer.selection.dependency_hashes['src/input.ts'] = `sha256:${'e'.repeat(64)}`;
  f.put('writer'); blocked(f, 'writer', 'SELECTION_OR_DEPENDENCY_PIN_MISMATCH');
});
test('docs/tooling-only change does not invalidate unchanged selected producer receipts', () => {
  const f = fixture(); f.files.set('docs/new-audit.md', Buffer.from('new audit commit, same producer and component bytes'));
  assert.equal(f.check().verdict, 'READY_FOR_MEASUREMENT_REVIEW');
});
test('future observation is rejected', () => {
  const f = fixture(); f.evidence.writer.observed_at_ms = 1001; f.put('writer'); blocked(f, 'writer', 'OBSERVATION_INVALID_OR_FUTURE');
});
test('stale observation is rejected', () => {
  const f = fixture(); f.evidence.writer.observed_at_ms = 799; f.put('writer'); blocked(f, 'writer', 'EVIDENCE_TOO_OLD');
});
test('arbitrary approval_ref is not independent approval', () => {
  const f = fixture(); f.options.approvalPins = {}; f.evidence.calibration.approval_ref = 'Bobby approved'; f.put('calibration');
  blocked(f, 'calibration', 'INDEPENDENT_APPROVAL_PIN_REQUIRED');
});
test('approval pin of another artifact cannot approve changed evidence', () => {
  const f = fixture(); f.evidence.budgets.budgets[0].metrics[0].approved_bound = 1000;
  f.put('budgets'); blocked(f, 'budgets', 'INDEPENDENT_APPROVAL_PIN_REQUIRED');
});
test('pending budget approval fails even when its bytes are independently pinned', () => {
  const f = fixture(); f.evidence.budgets.approval_state = 'PENDING'; f.put('budgets'); f.approve('budgets');
  blocked(f, 'budgets', 'INDEPENDENT_APPROVAL_PIN_REQUIRED');
});
for (const value of [null, '500', -1]) {
  test(`budget ${JSON.stringify(value)} is not an approved numeric threshold`, () => {
    const f = fixture(); f.evidence.budgets.budgets[0].metrics[0].approved_bound = value; f.put('budgets'); f.approve('budgets');
    blocked(f, 'budgets', 'EDGE_APPROVED_BUDGET_GROUPS_REQUIRED');
  });
}
for (const mutate of [rows => rows.pop(), rows => { rows[1] = rows[0]; }, rows => { rows[0].approval_ref = null; },
  rows => { rows[0].metrics = []; }, rows => { rows[0].metrics.push(rows[0].metrics[0]); },
  rows => { rows[0].metrics[0].baseline = null; }, rows => { rows[0].metrics[0].unit = ''; },
  rows => { rows[0].metrics[0].bound_kind = ''; }]) {
  test('missing/duplicate/unapproved Edge budget groups or invalid metric rows fail closed', () => {
    const f = fixture(); mutate(f.evidence.budgets.budgets); f.put('budgets'); f.approve('budgets');
    blocked(f, 'budgets', 'EDGE_APPROVED_BUDGET_GROUPS_REQUIRED');
  });
}
for (const window of [{ starts_at_ms: 1001, ends_at_ms: 1100 }, { starts_at_ms: 800, ends_at_ms: 1000 }]) {
  test(`window ${JSON.stringify(window)} is not a current allocation`, () => {
    const f = fixture(); f.evidence.source_window.window = window; f.put('source_window'); f.approve('source_window');
    blocked(f, 'source_window', 'SOURCE_WINDOW_NOT_CURRENT');
  });
}
test('oversize artifact is refused before JSON decoding', () => {
  const f = fixture(); const bytes = Buffer.alloc(2 * 1024 * 1024 + 1, 32);
  f.files.set('large.json', bytes); f.input.records.writer.artifact = { path: 'large.json', sha256: sha256(bytes) };
  blocked(f, 'writer', 'ARTIFACT_TOO_LARGE');
});
test('relative path traversal is refused', () => {
  const f = fixture(); f.input.records.writer.artifact.path = '../secrets.json'; blocked(f, 'writer', 'ARTIFACT_POINTER_INVALID');
});
test('unknown requirement cannot silently expand the reviewed evidence set', () => {
  const f = fixture(); f.input.records.magic = {}; blocked(f, 'manifest', 'UNKNOWN_REQUIREMENT');
});
for (const mutate of [f => { f.options.maximumAgeMs = 0; }, f => { delete f.input.selection.source_commit; },
  f => { f.input.selection.environment = 'all'; }, f => { f.input.selection.dependency_hashes = {}; }]) {
  test('invalid explicit manifest/review boundary never becomes eligible', () => {
    const f = fixture(); mutate(f); blocked(f, 'manifest', 'MANIFEST_OR_REVIEW_BOUNDARY_INVALID');
  });
}
const CLI = fileURLToPath(new URL('./qualification-readiness.mjs', import.meta.url));
function cliCell(callback) {
  const temporary = mkdtempSync(join(tmpdir(), 'elp210-eligibility-'));
  try {
    const root = join(temporary, 'root'); mkdirSync(root);
    const run = input => spawnSync(process.execPath, [CLI, '--root', root, '--input', input,
      '--now-ms', '1000', '--max-age-ms', '200'], { encoding: 'utf8', timeout: 5000 });
    callback({ root, temporary, run });
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}
test('CLI rejects symlink escape instead of reading evidence outside selected root', () => cliCell(({ root, temporary, run }) => {
  writeFileSync(join(temporary, 'outside.json'), '{}'); symlinkSync(join(temporary, 'outside.json'), join(root, 'input.json'));
  const result = run('input.json'); assert.equal(result.status, 2); assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'QUALIFICATION_INPUT_REJECTED\n');
}));
test('CLI preserves future-observation blocker and never authorizes runtime', () => cliCell(({ root, run }) => {
  const f = fixture(); f.evidence.writer.observed_at_ms = 1001; f.put('writer');
  for (const [path, bytes] of f.files) { const target = join(root, path); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, bytes); }
  writeFileSync(join(root, 'input.json'), JSON.stringify(f.input));
  const result = run('input.json'); assert.equal(result.status, 2); const report = JSON.parse(result.stdout);
  assert(report.blockers.some(row => row.requirement === 'writer' && row.reason === 'OBSERVATION_INVALID_OR_FUTURE'));
  assert.equal(report.runtime_authorized, false); assert.equal(report.full_phase_pass, false);
}));
