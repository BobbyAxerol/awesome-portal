import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const script = fileURLToPath(new URL('./contracts-test.sh', import.meta.url));
function probe(owned) {
  const temporary = mkdtempSync(join(tmpdir(), 'contracts-isolation-test-'));
  try {
    const bin = join(temporary, 'bin'); mkdirSync(bin);
    writeFileSync(join(bin, 'docker'), `#!/bin/bash
set -euo pipefail
printf '%s\\n' "$*" >> "$CONTRACTS_STUB_HOME/commands"
if [[ "$1" == info ]]; then echo '[]'; exit 0; fi
if [[ "$1" == inspect ]]; then
  if [[ "$CONTRACTS_STUB_OWNED" == true ]]; then IFS= read -r owner < "$CONTRACTS_STUB_HOME/owner"; printf '%s\\n' "$owner";
  else echo foreign-owner; fi
  exit 0
fi
if [[ "$1" == run ]]; then
  previous=''
  for argument in "$@"; do
    if [[ "$previous" == -v && "$argument" == *:/deps ]]; then
      directory="$(printf '%s' "$argument" | cut -d: -f1)"; mkdir -p "$directory/node_modules"
    fi
    if [[ "$argument" == io.primus.contract-test.owner=* ]]; then
      owner="$(printf '%s' "$argument" | cut -d= -f2-)"; printf '%s\\n' "$owner" > "$CONTRACTS_STUB_HOME/owner"
    fi
    previous="$argument"
  done
fi
`, { mode: 0o700 });
    const result = spawnSync('bash', [script], { encoding: 'utf8', maxBuffer: 1024 * 1024,
      env: { ...process.env, PATH: `${bin}:/usr/bin:/bin`, CONTRACTS_STUB_HOME: temporary, CONTRACTS_STUB_OWNED: String(owned) } });
    assert.equal(result.status, 0, result.stderr);
    const commands = readFileSync(join(temporary, 'commands'), 'utf8').split('\n');
    const invocation = commands.find(line => line.startsWith('run --rm --name '));
    assert(invocation, 'NAMED_NETWORKLESS_TEST_REQUIRED');
    const name = invocation.split(' ')[3];
    assert.match(name, /^contracts-test-node-tmp\.[A-Za-z0-9]+$/);
    assert(invocation.includes('--network none --read-only'));
    const owner = readFileSync(join(temporary, 'owner'), 'utf8').trim();
    assert(invocation.includes(`--label io.primus.contract-test.owner=${owner}`));
    assert.equal(commands.some(line => line === `rm -f ${name}`), owned);
    assert(!commands.some(line => line === 'rm -f contracts-test-node'));
    return name;
  } finally { rmSync(temporary, { recursive: true }); }
}
test('ordinary cleanup targets only this invocation with matching owner label', () => { probe(true); });
test('foreign ownership is never removed even if the name is reused', () => { probe(false); });
test('independent worktree verifications have distinct names', () => {
  assert.notEqual(probe(true), probe(true));
});
test('FULL06 product proof is copied as a public hash-bound input, never private evidence', () => {
  const source = readFileSync(script, 'utf8');
  assert(source.includes('P10/FULL_06_PERCENT_EQUITY_PRODUCT_QUALIFICATION_2026-10-06.md'));
  assert(!source.includes('/.local/state/portal-research-p23'));
  assert(!source.includes('sessions.json'));
});
test('completed-window schema and Bracket V4 proof are explicit public CI inputs', () => {
  const source = readFileSync(script, 'utf8');
  assert(source.includes('apps/control-api/src/research/window-execution.contract.ts'));
  assert(source.includes('apps/control-api/src/research/replay-continuity.contract.ts'));
  assert(source.includes('P10/BRACKET_V4_SOURCE_JOURNAL_QUALIFICATION_2026-10-07.md'));
  assert(!source.includes('/.local/state/portal-research-p23'));
});
