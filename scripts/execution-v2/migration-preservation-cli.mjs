#!/usr/bin/env node
/** Disposable restore-gate adapter. Never connect this CLI to a runtime DB. */
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { capturePreservation, comparePreservation } from './migration-preservation.mjs';

const fail = code => { throw new Error(`MIGRATION_PRESERVATION_CLI_${code}`); };
export function parsePreservationArguments(args, env = process.env) {
  const [command, ...rest] = args;
  const options = {};
  if (rest.length % 2) fail('ARGUMENTS');
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    if (!key.startsWith('--') || Object.hasOwn(options, key) || !rest[index + 1]) fail('ARGUMENTS');
    options[key] = rest[index + 1];
  }
  const allowed = command === 'capture' ? ['--profile', '--output']
    : command === 'compare' ? ['--source', '--restored', '--output'] : [];
  if (!allowed.length || Object.keys(options).length !== allowed.length
    || allowed.some(key => !options[key]) || Object.keys(options).some(key => !allowed.includes(key))) fail('ARGUMENTS');
  if (command === 'capture') {
    if (!['PORTAL_V1', 'RESEARCH_CURRENT_HUMAN_V1'].includes(options['--profile'])) fail('PROFILE');
    // A database name alone is not a target fence: the host must also identify
    // the exact disposable PostgreSQL cell. No URL, service, socket or defaults.
    if (!/^(?:control-api-test-postgres|elp211-preservation-postgres)-[0-9]+$/.test(env.PGHOST ?? '')
      || !/^(?:portal_control_(?:test|restore)|elp211_preservation_(?:source|restore)_[0-9]+)$/.test(env.PGDATABASE ?? '')
      || env.PGPORT !== '5432' || env.PGUSER !== 'portal' || !env.PGPASSWORD
      || env.PGHOSTADDR || env.PGSERVICE || env.PGSERVICEFILE || env.PGOPTIONS
      || env.DATABASE_URL || env.TEST_DATABASE_URL) fail('DISPOSABLE_TARGET_REQUIRED');
  }
  return { command, options };
}

export async function runPreservationCli(args, env = process.env) {
  const { command, options } = parsePreservationArguments(args, env);
  let result;
  if (command === 'capture') {
    const require = createRequire(new URL('../../apps/control-api/package.json', import.meta.url));
    const { Client } = require('pg');
    const client = new Client({ host: env.PGHOST, port: 5432, user: 'portal', password: env.PGPASSWORD,
      database: env.PGDATABASE, connectionTimeoutMillis: 5000, application_name: 'elp211-preservation-read-only' });
    try {
      await client.connect();
      result = await capturePreservation((text, values) => client.query(text, values), { profile: options['--profile'] });
    } finally { await client.end().catch(() => {}); }
  } else {
    const [source, restored] = await Promise.all([options['--source'], options['--restored']]
      .map(async path => JSON.parse(await readFile(path, 'utf8'))));
    result = comparePreservation(source, restored);
  }
  await writeFile(options['--output'], `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  if (command === 'compare' && result.status !== 'PRESERVED') fail('NOT_PRESERVED');
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await runPreservationCli(process.argv.slice(2)); }
  catch (error) {
    // pg errors can contain connection/row details. Only our closed public
    // error vocabulary may leave the process; raw database errors never do.
    const code = typeof error?.message === 'string'
      && /^MIGRATION_PRESERVATION_(?:CLI_)?[A-Z_]+$/.test(error.message)
      ? error.message : 'MIGRATION_PRESERVATION_CLI_FAILED';
    process.stderr.write(`${code}\n`); process.exitCode = 1;
  }
}
