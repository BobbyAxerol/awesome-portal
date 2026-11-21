/** Fixture-only query-adapter tests. These do not claim a physical PostgreSQL
 * restore, source qualification, credential issuance, or custody recovery. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  capturePreservation, comparePreservation, NATIVE_SCHEMA_V1, PRESERVATION_RELATIONS,
} from './migration-preservation.mjs';

const clone = value => structuredClone(value);
const digest = text => createHash('sha256').update(text).digest('hex');
const cmp = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));
const profile = 'RESEARCH_CURRENT_HUMAN_V1';

function model(native = true) {
  const db = { native, tables: new Map(), sequences: new Map(), calls: [],
    context: { database_name: 'portal_control_test', server_version_num: '170006', server_encoding: 'UTF8',
      read_only: 'on', isolation: 'repeatable read', native_namespace: native } };
  for (const item of PRESERVATION_RELATIONS) {
    if (item.native && !native) continue;
    const row = Object.fromEntries(item.keys.map((key, index) => [key, `key-${index}`]));
    row.payload = { original: item.id, session_version: 4, generation: 19, phase: 'UNKNOWN', preserved: true };
    if (item.id === 'public.portal_native_review_schema') Object.assign(row, {
      version: NATIVE_SCHEMA_V1.version, schema_digest: NATIVE_SCHEMA_V1.schema_sha256,
      target_digest: digest('original Research binding'), catalogue_digest: digest('catalogue'),
    });
    db.tables.set(item.id, { kind: item.id.endsWith('.obligations') ? 'v' : 'r', rows: [row],
      definition: { columns: Object.keys(row).map(name => ({ name, type: 'text', not_null: item.keys.includes(name) })),
        primary_key: item.id.endsWith('.obligations') ? [] : [...item.keys],
        constraints: [], indexes: [], triggers: [], view: item.id.endsWith('.obligations') ? 'UNION ALL' : null,
        owned_sequences: item.sequence ? [{ name: item.sequence, column: item.keys[0] }] : [] } });
    if (item.sequence) db.sequences.set(item.sequence, { last_value: '9007199254740993', is_called: true });
  }
  return db;
}

function adapter(db, interfere = () => undefined) {
  return async (sql, values = []) => {
    db.calls.push({ sql, values });
    const replacement = interfere(sql, values);
    if (replacement !== undefined) return replacement;
    if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql) || sql.includes('preservation:settings')) return { rows: [] };
    if (sql.includes('preservation:context')) return { rows: [clone(db.context)] };
    if (sql.includes('preservation:catalogue')) return { rows: values[0].map(id => {
      const table = db.tables.get(id);
      return { id, kind: table?.kind ?? null, definition: clone(table?.definition ?? null) };
    }) };
    if (sql.includes('preservation:native-version')) return { rows: clone(db.tables.get('public.portal_native_review_schema').rows)
      .map(row => ({ version: row.version, schema_digest: row.schema_digest })) };
    const rowMatch = /preservation:rows:([a-z0-9_.]+)/.exec(sql);
    if (rowMatch) {
      const item = PRESERVATION_RELATIONS.find(entry => entry.id === rowMatch[1]);
      const rows = db.tables.get(item.id).rows.map(row => {
        const serialized = JSON.stringify(row);
        return { cursor: JSON.stringify(item.keys.map(key => String(row[key]))),
          row_sha256: digest(serialized), row_bytes: String(Buffer.byteLength(serialized)) };
      }).sort((a, b) => cmp(a.cursor, b.cursor));
      return { rows: rows.filter(row => values[0] === null || cmp(row.cursor, values[0]) > 0).slice(0, values[1]) };
    }
    const sequenceMatch = /preservation:sequence:([a-z0-9_.]+)/.exec(sql);
    if (sequenceMatch) return { rows: [clone(db.sequences.get(sequenceMatch[1]))] };
    throw new Error('Unexpected fixture query');
  };
}
const capture = (db, extra = {}) => capturePreservation(adapter(db), { profile: db.native ? profile : 'PORTAL_V1', ...extra });

test('the supported native version pins the actual checked-in schema bytes, not a fixture digest', () => {
  const source = readFileSync(new URL('../../apps/control-api/src/execution-v2/current-human-candidate.sql', import.meta.url));
  const registration = readFileSync(new URL('../../apps/control-api/src/execution-v2/current-human-schema.ts', import.meta.url), 'utf8');
  assert.equal(digest(source), NATIVE_SCHEMA_V1.schema_sha256);
  assert.ok(registration.includes(`CURRENT_HUMAN_RESEARCH_SCHEMA_VERSION="${NATIVE_SCHEMA_V1.version}"`));
  assert.ok(registration.includes(`CURRENT_HUMAN_RESEARCH_SCHEMA_SHA256="${NATIVE_SCHEMA_V1.schema_sha256}"`));
});

test('all original authority relations survive restore; DB name differs and no credential/body leaves the adapter', async () => {
  const source = model(), restored = model();
  restored.context.database_name = 'portal_control_restore';
  const before = await capture(source), after = await capture(restored);
  assert.equal(comparePreservation(before, after).status, 'PRESERVED');
  assert.equal(before.entries.length, 30);
  assert.equal(before.fingerprint_sha256, after.fingerprint_sha256);
  assert.doesNotMatch(JSON.stringify(before), /original Research binding|"payload"|"phase"|"session_version"/);
  assert.equal(before.claim, 'DATA_PRESERVATION_ONLY_NOT_AUTHORITY_OR_RECOVERY_READY');
  assert.equal(source.calls[0].sql, 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.equal(source.calls.at(-1).sql, 'COMMIT');
  assert.ok(source.calls.some(call => call.sql.includes('sha256(convert_to(to_jsonb(t)::text')));
});

for (const [table, field, value] of [
  ['public.portal_users', 'session_version', 5],
  ['public.external_identity_bindings', 'subject', 'another exact external subject'],
  ['public.password_credentials', 'password_hash', 'different credential hash'],
  ['public.activation_credentials', 'used_at', '2026-10-24T00:00:00Z'],
  ['public.auth_sessions', 'revoked_at', '2026-10-24T01:00:00Z'],
  ['public.workspace_members', 'membership_generation', 20],
  ['public.portal_owner_anchor', 'user_id', 'another owner'],
  ['public.portal_capability_grants', 'grant_revision', 6],
  ['public.portal_access_policy_state', 'revision', 21],
  ['public.portal_access_grants_v2', 'revoked_at', 42],
  ['public.portal_access_policy_events', 'original', 'changed revoke event'],
  ['public.execution_trusted_commands', 'intent', { amount: '2', original_hash: 'different' }],
  ['public.execution_trusted_command_events', 'status', { delivery: 'ACKNOWLEDGED' }],
  ['public.portal_native_review_schema', 'target_digest', digest('wrong target')],
  ['elp210_candidate.authority', 'lease_epoch', 22],
  ['elp210_candidate.leases', 'terminal_receipt_digest', digest('different terminal')],
  ['elp210_candidate.events', 'phase', 'ROLLED_BACK'],
  ['elp210_candidate.native_read_obligations', 'base_body', '{"different_original":true}'],
  ['elp210_candidate.native_read_events', 'phase', 'SERVED'],
  ['elp210_candidate.mutations', 'binding_digest', digest('different binding')],
  ['elp210_candidate.mutation_events', 'terminal_digest', digest('different mutation terminal')],
]) test(`detects same-count row change: ${table}.${field}`, async () => {
  const source = model(), restored = model();
  restored.tables.get(table).rows[0].payload[field] = value;
  // The schema is unchanged: these are payload/JSONB value changes, not DDL.
  const before = await capture(source), after = await capture(restored);
  const result = comparePreservation(before, after);
  assert.equal(result.status, 'CHANGED');
  assert.deepEqual(result.changed_relations, [table]);
  assert.equal(before.entries.find(entry => entry.relation === table).row_count,
    after.entries.find(entry => entry.relation === table).row_count);
});

test('keyset pages preserve duplicate-valued rows, composite keys, UTF8 ordering, and arrival-independent fingerprints', async () => {
  const source = model(), restored = model();
  const table = source.tables.get('public.execution_trusted_command_events');
  const rows = ['z', '1', '10', '\u{10000}', '\uE000'].map(key => ({ command_id: key, event_id: key, payload: 'same' }));
  table.rows = rows;
  restored.tables.get('public.execution_trusted_command_events').rows = [...rows].reverse();
  const before = await capture(source, { bounds: { page_rows: 1 } });
  const after = await capture(restored, { bounds: { page_rows: 2 } });
  assert.equal(comparePreservation(before, after).status, 'PRESERVED');
  assert.equal(before.entries.find(entry => entry.relation === 'public.execution_trusted_command_events').row_count, 5);
});

test('delete/add and sequence next-value or is_called changes cannot pass a preserved-row count', async () => {
  const source = model();
  for (const change of [db => db.tables.get('public.auth_sessions').rows.pop(),
    db => db.tables.get('public.auth_sessions').rows.push({ session_id: 'extra', payload: {} }),
    db => db.sequences.get('elp210_candidate.events_event_id_seq').last_value = '9007199254740994',
    db => db.sequences.get('elp210_candidate.events_event_id_seq').is_called = false]) {
    const restored = model(); change(restored);
    assert.equal(comparePreservation(await capture(source), await capture(restored)).status, 'CHANGED');
  }
});

test('schema constraints, trigger enablement, view definition and nullable columns remain part of preservation', async () => {
  for (const change of [db => db.tables.get('public.portal_users').definition.columns[0].not_null = false,
    db => db.tables.get('public.auth_sessions').definition.constraints.push('CHECK (false)'),
    db => { db.tables.get('public.auth_sessions').definition.row_security = false; },
    db => { db.tables.get('public.auth_sessions').definition.acl = '{PUBLIC=r/portal}'; },
    db => db.tables.get('elp210_candidate.leases').definition.triggers.push({ enabled: 'D', definition: 'guard' }),
    db => db.tables.get('elp210_candidate.obligations').definition.view = 'different union']) {
    const source = model(), restored = model(); change(restored);
    assert.equal(comparePreservation(await capture(source), await capture(restored)).status, 'CHANGED');
  }
});

test('absent native installation has explicit profile absence, never a native qualification claim', async () => {
  const before = await capture(model(false)), after = await capture(model(false));
  assert.equal(comparePreservation(before, after).status, 'PRESERVED');
  assert.equal(before.native_schema, null);
  assert.equal(before.entries.filter(entry => entry.state === 'ABSENT_BY_PROFILE').length, 9);
  assert.equal(comparePreservation(before, await capture(model())).status, 'INCOMPATIBLE');
});

test('required tables, installed native namespace, ledger revision and partial native installations fail closed', async () => {
  for (const [change, error] of [
    [db => db.tables.delete('public.auth_sessions'), /REQUIRED_RELATION_MISSING/],
    [db => db.tables.delete('elp210_candidate.native_read_events'), /REQUIRED_RELATION_MISSING/],
    [db => { db.context.native_namespace = false; }, /NATIVE_PROFILE_MISMATCH/],
    [db => { db.tables.get('public.portal_native_review_schema').rows[0].schema_digest = digest('other SQL'); }, /NATIVE_VERSION_UNSUPPORTED/],
    [db => { db.tables.get('public.portal_native_review_schema').rows.push({ version: 'future', schema_digest: digest('future') }); }, /NATIVE_VERSION_UNSUPPORTED/],
  ]) {
    const db = model(); change(db);
    await assert.rejects(capture(db), error);
    assert.equal(db.calls.at(-1).sql, 'ROLLBACK');
  }
  const emptyNamespace = model(false); emptyNamespace.context.native_namespace = true;
  await assert.rejects(capture(emptyNamespace), /NATIVE_PROFILE_MISMATCH/);
  const partial = model(false);
  partial.tables.set('public.portal_native_review_schema', model().tables.get('public.portal_native_review_schema'));
  await assert.rejects(capture(partial), /NATIVE_PROFILE_MISMATCH/);
});

test('unexpected PK or sequence owner refuses incompatible schemas before returning a manifest', async () => {
  const badPk = model(); badPk.tables.get('public.auth_sessions').definition.primary_key = ['session_token_hash'];
  await assert.rejects(capture(badPk), /RELATION_SCHEMA_MISMATCH/);
  const badSequence = model(); badSequence.tables.get('elp210_candidate.events').definition.owned_sequences[0].name = 'public.other_seq';
  await assert.rejects(capture(badSequence), /SEQUENCE_SCHEMA_MISMATCH/);
});

test('requires a read-only repeatable snapshot and supported server serialization; major upgrade is explicit incompatibility', async () => {
  for (const change of [db => { db.context.read_only = 'off'; },
    db => { db.context.isolation = 'read committed'; }, db => { db.context.server_encoding = 'LATIN1'; },
    db => { db.context.server_version_num = '130000'; }]) {
    const db = model(); change(db);
    await assert.rejects(capture(db), /SNAPSHOT_REQUIRED/);
    assert.equal(db.calls.at(-1).sql, 'ROLLBACK');
  }
  const newer = model(); newer.context.server_version_num = '180001';
  assert.equal(comparePreservation(await capture(model()), await capture(newer)).status, 'INCOMPATIBLE');
});

test('bounded scan fails rather than truncating rows or bytes, and rolls back', async () => {
  for (const bounds of [{ maximum_rows: 1 }, { maximum_bytes: 1 }]) {
    const db = model(); await assert.rejects(capture(db, { bounds }), /BOUND_EXCEEDED/);
    assert.equal(db.calls.at(-1).sql, 'ROLLBACK');
  }
  for (const bounds of [{ page_rows: 2049 }, { maximum_rows: Infinity }, { arbitrary_table: 'auth_sessions' }]) {
    const db = model(); await assert.rejects(capture(db, { bounds }), /LIMITS_INVALID/);
    assert.equal(db.calls.length, 0);
  }
});

test('invalid or non-monotonic rows, overfull pages and secret-bearing adapter errors never become evidence', async () => {
  for (const rows of [
    [{ cursor: '["a"]', row_sha256: 'a'.repeat(64) + '\n', row_bytes: '3' }],
    [{ cursor: '["a"]', row_sha256: 'a'.repeat(64), row_bytes: 'NaN' }],
    [{ cursor: '["a"]', row_sha256: 'a'.repeat(64), row_bytes: '3' },
      { cursor: '["a"]', row_sha256: 'a'.repeat(64), row_bytes: '3' }],
  ]) {
    const db = model(); const query = adapter(db, sql => sql.includes('preservation:rows:') ? { rows } : undefined);
    await assert.rejects(capturePreservation(query, { profile }), /PAGE_INVALID/);
    assert.equal(db.calls.at(-1).sql, 'ROLLBACK');
  }
  const db = model();
  await assert.rejects(capturePreservation(adapter(db, sql => {
    if (sql.includes('preservation:rows:')) throw new Error('secret-token-should-not-escape');
  }), { profile }), error => error.message === 'MIGRATION_PRESERVATION_QUERY_FAILED');
  assert.equal(db.calls.at(-1).sql, 'ROLLBACK');
  const overfull = model();
  await assert.rejects(capturePreservation(adapter(overfull, sql => sql.includes('preservation:rows:') ? {
    rows: new Array(257).fill({ cursor: 'a', row_sha256: 'a'.repeat(64), row_bytes: '1' }),
  } : undefined), { profile }), /PAGE_INVALID/);
});

test('incomplete, reordered, edited or unknown-version manifests are not comparable evidence', async () => {
  const good = await capture(model());
  for (const change of [s => s.entries.pop(), s => s.entries.reverse(),
    s => { s.entries[0].rows_sha256 = '0'.repeat(64); }, s => { s.schema_version = 'future'; },
    s => { s.native_schema = {}; }, s => { s.entries[0].sequence = {}; }]) {
    const invalid = clone(good); change(invalid);
    assert.throws(() => comparePreservation(good, invalid), /MANIFEST_INVALID/);
  }
  assert.throws(() => comparePreservation({}, good), /MANIFEST_INVALID/);
});
