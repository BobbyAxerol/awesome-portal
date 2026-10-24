import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePreservationArguments } from './migration-preservation-cli.mjs';

const env = { PGHOST: 'control-api-test-postgres-12345', PGPORT: '5432', PGUSER: 'portal',
  PGPASSWORD: 'test-only', PGDATABASE: 'portal_control_test' };
const args = ['capture', '--profile', 'PORTAL_V1', '--output', '/tmp/manifest.json'];
test('capture accepts only an explicitly named disposable cell', () => {
  assert.equal(parsePreservationArguments(args, env).command, 'capture');
  for (const field of ['PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE']) {
    assert.throws(() => parsePreservationArguments(args, { ...env, [field]: '' }), /DISPOSABLE_TARGET_REQUIRED/);
  }
  for (const patch of [{ PGHOST: 'localhost' }, { PGHOST: 'portal-research-preview-portal-postgres-1' },
    { PGDATABASE: 'portal_control' }, { PGDATABASE: 'portal_execution' }, { DATABASE_URL: 'postgres://runtime' },
    { PGOPTIONS: '-c search_path=public' }, { PGHOSTADDR: '127.0.0.1' }, { PGSERVICE: 'runtime' }]) {
    assert.throws(() => parsePreservationArguments(args, { ...env, ...patch }), /DISPOSABLE_TARGET_REQUIRED/);
  }
});
test('reject unknown/duplicate arguments and unregistered profiles', () => {
  for (const invalid of [[], [...args, '--output', 'again'], [...args, '--anything', 'x'],
    ['capture', '--profile', 'AUTO', '--output', 'x'], ['capture', '--profile', 'PORTAL_V1']]) {
    assert.throws(() => parsePreservationArguments(invalid, env));
  }
});
test('offline comparison never resolves credentials or accepts DB arguments', () => {
  assert.equal(parsePreservationArguments(['compare', '--source', 'a', '--restored', 'b', '--output', 'c'], {}).command, 'compare');
  assert.throws(() => parsePreservationArguments(['compare', '--source', 'a', '--restored', 'b', '--output', 'c', '--database', 'runtime'], {}));
});
