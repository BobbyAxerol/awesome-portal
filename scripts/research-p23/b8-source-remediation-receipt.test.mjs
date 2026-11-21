import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { INDEX, metadataCases } from './b8-source-remediation-receipt.mjs';

test('source remediation is a contiguous-index boundary oracle, not approximate dates', () => {
  assert.equal((INDEX.end - INDEX.start)/INDEX.step, INDEX.bars);
  const cases = metadataCases();
  assert.equal(cases.length, 7);
  assert.equal(cases.find(row => row.name === 'one-warmup-bar-short').before, 299);
  assert.equal(cases.find(row => row.name === 'exact-earliest-warmup').start, INDEX.start + 300*INDEX.step);
  assert(cases.every(row => row.start % INDEX.step === 0 && row.end % INDEX.step === 0));
});
test('GET metadata proof neither refreshes identities nor starts profiles or shared preview', () => {
  const code = readFileSync(new URL('./b8-source-remediation-receipt.mjs', import.meta.url), 'utf8');
  assert(!code.includes('http://127.0.0.1:8095'));
  assert(!code.includes('prepareSessions('));
  assert(!code.includes('operatorClient('));
  assert(!code.includes('/api/v1/research/runs'));
  assert(code.includes("'/api/auth/logout'"));
});
