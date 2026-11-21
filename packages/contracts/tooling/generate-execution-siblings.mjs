// WP-K second pass (GAP-3, 4, 5, 6, 7, 9, 11, 12, 13, 14, 15, 16): small additive SIBLING reads, defined ONCE in a tiny DSL that writes
//   - the JSON Schema, the OpenAPI document, the d.ts (via openapi-typescript in the npm script) and the TEST_ONLY fixtures (valid + refusals),
//   - the strict frontend reader (`siblings.generated.ts`, built on `strictRead.ts`), so reader and schema cannot drift,
//   - the index the specs iterate (`fixtures/execution-siblings.index.json`).
// Every section of a read follows the slice-2 rule: key omitted = no owning source, null = the source exists and was not read, value = published;
// a count or a list of 0 is a published true zero. Money and ratios are exact decimal TEXT with their currency; a clock is a UTC millisecond integer.
// CONTRACT ONLY: no producer exists for any of them (Edge/Core inputs are in WP_K_CONTRACTS_2026-10-23.md); the fixtures are TEST_ONLY, none is a receipt.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const feOut = resolve(root, '../../apps/portal/frontend/src/execution/v2/readers/siblings.generated.ts');

/* ── the DSL ─────────────────────────────────────────────────────────────── */
const T = {
  str: (max = 256) => ({ k: 'str', max }), id: () => ({ k: 'id' }), ms: () => ({ k: 'ms' }), int: (min = 0, max) => ({ k: 'int', min, max }), dec: () => ({ k: 'dec' }),
  bool: () => ({ k: 'bool' }), lit: v => ({ k: 'lit', v }), en: (...v) => ({ k: 'en', v }), nul: of => ({ k: 'nul', of }), arr: (of, max = 200, min = 0) => ({ k: 'arr', of, max, min }),
  sec: of => ({ k: 'sec', of }), obj: props => ({ k: 'obj', props }), sha: () => ({ k: 'sha' }), code: () => ({ k: 'code' }), path: () => ({ k: 'path' }),
  /** a rule JSON Schema and the reader both state: `js` is a predicate body over the parsed value `v`, `schema` its JSON Schema `allOf` entry (or null when only arithmetic). */
  rule: (of, js, schema = null) => ({ ...of, rule: { js, schema } }),
};
const PRINTABLE = '^[^\\u0000-\\u001f\\u007f]+$(?![\\s\\S])';
function schemaOf(n) {
  let s;
  switch (n.k) {
    case 'str': s = { type: 'string', minLength: 1, maxLength: n.max, pattern: PRINTABLE }; break;
    case 'id': s = { type: 'string', minLength: 1, maxLength: 191, pattern: '^[A-Za-z0-9._:-]+$(?![\\s\\S])' }; break;
    case 'ms': s = { type: 'integer', minimum: 0, maximum: 9007199254740991 }; break;
    case 'int': s = { type: 'integer', minimum: n.min, maximum: n.max ?? 9007199254740991 }; break;
    case 'dec': s = { type: 'string', maxLength: 80, pattern: '^-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?$(?![\\s\\S])' }; break;
    case 'bool': s = { type: 'boolean' }; break;
    case 'lit': s = { const: n.v }; break;
    case 'en': s = { type: 'string', enum: n.v }; break;
    case 'nul': s = { anyOf: [schemaOf(n.of), { type: 'null' }] }; break;
    case 'arr': s = { type: 'array', maxItems: n.max, ...(n.min ? { minItems: n.min } : {}), items: schemaOf(n.of) }; break;
    case 'sec': s = { anyOf: [schemaOf(n.of), { type: 'null' }] }; break;
    case 'sha': s = { type: 'string', pattern: '^sha256:[a-f0-9]{64}$(?![\\s\\S])' }; break;
    case 'code': s = { type: 'string', pattern: '^[A-Z][A-Z0-9_]{1,63}$(?![\\s\\S])' }; break;
    case 'path': s = { type: 'string', minLength: 2, maxLength: 512, pattern: '^/[^\\u0000-\\u001f\\u007f\\s]*$(?![\\s\\S])' }; break;
    case 'obj': {
      const keys = Object.keys(n.props);
      s = { type: 'object', additionalProperties: false, required: keys.filter(k => n.props[k].k !== 'sec'), properties: Object.fromEntries(keys.map(k => [k, schemaOf(n.props[k])])) };
      break;
    }
    default: throw new Error('unknown node ' + n.k);
  }
  if (n.rule?.schema) s.allOf = [...(s.allOf ?? []), ...n.rule.schema];
  return s;
}
function tsOf(n) {
  let c;
  switch (n.k) {
    case 'str': c = `S.str(${n.max})`; break;
    case 'id': c = 'S.id'; break; case 'ms': c = 'S.ms'; break; case 'dec': c = 'S.dec'; break; case 'bool': c = 'S.bool'; break;
    case 'sha': c = 'S.sha'; break; case 'code': c = 'S.code'; break; case 'path': c = 'S.path'; break;
    case 'int': c = `S.int(${n.min}${n.max === undefined ? '' : ', ' + n.max})`; break;
    case 'lit': c = `S.lit(${JSON.stringify(n.v)})`; break;
    case 'en': c = `S.en(${n.v.map(v => JSON.stringify(v)).join(', ')})`; break;
    case 'nul': c = `S.nul(${tsOf(n.of)})`; break;
    case 'arr': c = `S.arr(${tsOf(n.of)}, ${n.max}${n.min ? ', ' + n.min : ''})`; break;
    case 'sec': c = `S.sec(${tsOf(n.of)})`; break;
    case 'obj': c = `S.obj({ ${Object.entries(n.props).map(([k, v]) => `${JSON.stringify(k)}: ${tsOf(v)}`).join(', ')} })`; break;
    default: throw new Error('unknown node ' + n.k);
  }
  return n.rule ? `S.refine(${c}, (v: any) => ${n.rule.js})` : c;
}

/* ── shared pieces ───────────────────────────────────────────────────────── */
const T0 = 1_800_000_000_000, H = 3_600_000, DAY = 86_400_000;
const head = name => ({ schema_version: T.lit(`portal.execution.${name}.v1`), workspace_id: T.str(), record_authority: T.lit('PORTAL_PROJECTION'), read_at_ms: T.ms() });
const hv = name => ({ schema_version: `portal.execution.${name}.v1`, workspace_id: 'TEST_ONLY:workspace', record_authority: 'PORTAL_PROJECTION', read_at_ms: T0 });
const subject = T.obj({ type: T.en('ALPHA', 'PORTFOLIO', 'ACCOUNT', 'DEPLOYMENT', 'OPERATION', 'INCIDENT', 'APPROVAL'), id: T.id() });
const money = T.obj({ currency: T.str(32), value: T.dec() });
const sha = c => 'sha256:' + c.repeat(64);

/* ── the siblings ────────────────────────────────────────────────────────── */
const DEFS = [];
const def = d => DEFS.push(d);

// GAP-3: controls (locks and trading state).
def({
  name: 'controls', gap: 'GAP-3', route: '/api/v1/execution/controls', params: [], query: ['workspace_id', 'scope_type', 'scope_id'],
  description: 'Locks in force and the trading state of a scope (the workspace, a portfolio, an account or a deployment). `trading_state` REDUCING means only reducing orders are allowed. History is the recorded transitions, newest first.',
  schema: T.obj({ ...head('controls'),
    locks: T.sec(T.arr(T.obj({ lock_id: T.id(), scope: T.obj({ type: T.en('WORKSPACE', 'PORTFOLIO', 'ACCOUNT', 'DEPLOYMENT'), id: T.id() }), revision: T.int(1), state: T.en('ACTIVE', 'RELEASED'),
      set_at_ms: T.ms(), set_by: T.nul(T.str()), reason_code: T.nul(T.code()) }), 100)),
    trading_state: T.sec(T.obj({ state: T.en('ACTIVE', 'REDUCING', 'HALTED'), since_ms: T.ms(),
      history: T.arr(T.obj({ state: T.en('ACTIVE', 'REDUCING', 'HALTED'), at_ms: T.ms(), actor: T.nul(T.str()), reason_code: T.nul(T.code()) }), 100) })) }),
  valid: {
    published: { ...hv('controls'), locks: [{ lock_id: 'TEST_ONLY:lock-1', scope: { type: 'PORTFOLIO', id: 'TEST_ONLY:portfolio-a' }, revision: 3, state: 'ACTIVE', set_at_ms: T0 - DAY, set_by: 'TEST_ONLY:actor-1', reason_code: 'RISK_REVIEW' }],
      trading_state: { state: 'REDUCING', since_ms: T0 - 2 * H, history: [{ state: 'REDUCING', at_ms: T0 - 2 * H, actor: 'TEST_ONLY:actor-1', reason_code: 'LIMIT_WARN' }, { state: 'ACTIVE', at_ms: T0 - DAY, actor: null, reason_code: null }] } },
    'no-locks': { ...hv('controls'), locks: [], trading_state: { state: 'ACTIVE', since_ms: T0 - DAY, history: [] } },
    'not-read': { ...hv('controls'), locks: null, trading_state: null },
    'no-source': { ...hv('controls') },
  },
  negatives: [
    { id: 'lock-revision-zero', base: 'published', rule: 'a revision is positive', ops: [{ op: 'set', path: ['locks', 0, 'revision'], value: 0 }] },
    { id: 'trading-state-unknown', base: 'published', rule: 'the trading state vocabulary is closed', ops: [{ op: 'set', path: ['trading_state', 'state'], value: 'PAUSED' }] },
    { id: 'lock-scope-unknown', base: 'published', rule: 'lock scope types are closed', ops: [{ op: 'set', path: ['locks', 0, 'scope', 'type'], value: 'VENUE' }] },
    { id: 'reason-lowercase', base: 'published', rule: 'a reason is an upper-case code', ops: [{ op: 'set', path: ['locks', 0, 'reason_code'], value: 'risk review' }] }],
});

// GAP-4: obligation records behind the approval counts.
def({
  name: 'obligations', gap: 'GAP-4', route: '/api/v1/execution/obligations', params: [], query: ['workspace_id', 'subject_type', 'subject_id', 'page_size', 'cursor'],
  description: 'The records behind the counts of obligations_after_approval (and the stage unknown-order chip): one row per open position, working order, reservation, unknown outcome or settlement.',
  schema: T.obj({ ...head('obligations'), subject,
    items: T.sec(T.arr(T.obj({ obligation_id: T.id(), kind: T.en('OPEN_POSITION', 'WORKING_ORDER', 'RESERVATION', 'UNKNOWN_OUTCOME', 'SETTLEMENT_PENDING'), state: T.code(),
      recovery_id: T.nul(T.id()), order_id: T.nul(T.id()), operation_id: T.nul(T.id()), opened_at_ms: T.ms() }), 200)), next_cursor: T.sec(T.str(4096)) }),
  valid: {
    published: { ...hv('obligations'), subject: { type: 'PORTFOLIO', id: 'TEST_ONLY:portfolio-a' }, items: [
      { obligation_id: 'TEST_ONLY:ob-1', kind: 'OPEN_POSITION', state: 'OPEN', recovery_id: null, order_id: null, operation_id: null, opened_at_ms: T0 - DAY },
      { obligation_id: 'TEST_ONLY:ob-2', kind: 'UNKNOWN_OUTCOME', state: 'RECOVERING', recovery_id: 'TEST_ONLY:rec-1', order_id: 'TEST_ONLY:ord-9', operation_id: 'TEST_ONLY:op-3', opened_at_ms: T0 - H }], next_cursor: 'TEST_ONLY_CURSOR' },
    none: { ...hv('obligations'), subject: { type: 'PORTFOLIO', id: 'TEST_ONLY:portfolio-a' }, items: [], next_cursor: null },
    'not-read': { ...hv('obligations'), subject: { type: 'PORTFOLIO', id: 'TEST_ONLY:portfolio-a' }, items: null },
  },
  negatives: [
    { id: 'unknown-kind', base: 'published', rule: 'kinds are closed', ops: [{ op: 'set', path: ['items', 0, 'kind'], value: 'DEBT' }] },
    { id: 'state-lowercase', base: 'published', rule: 'a state is an upper-case code', ops: [{ op: 'set', path: ['items', 0, 'state'], value: 'open' }] },
    { id: 'opened-negative', base: 'published', rule: 'a clock is not negative', ops: [{ op: 'set', path: ['items', 0, 'opened_at_ms'], value: -1 }] }],
});

// GAP-5: portfolio members.
def({
  name: 'portfolio-members', gap: 'GAP-5', route: '/api/v1/execution/portfolios/{portfolio_id}/members', params: ['portfolio_id'], query: ['workspace_id'],
  description: 'The people with a membership on a portfolio. `role_label` is a DISPLAY word, never an authorization.',
  schema: T.obj({ ...head('portfolio-members'), portfolio_id: T.id(),
    members: T.sec(T.arr(T.obj({ membership_id: T.id(), user_id: T.id(), role_label: T.str(64), valid_from_ms: T.ms(), valid_until_ms: T.nul(T.ms()), state: T.en('ACTIVE', 'SCHEDULED', 'ENDED') }), 200)) }),
  valid: {
    published: { ...hv('portfolio-members'), portfolio_id: 'TEST_ONLY:portfolio-a', members: [
      { membership_id: 'TEST_ONLY:m-1', user_id: 'TEST_ONLY:user-1', role_label: 'Manager', valid_from_ms: T0 - 90 * DAY, valid_until_ms: null, state: 'ACTIVE' },
      { membership_id: 'TEST_ONLY:m-2', user_id: 'TEST_ONLY:user-2', role_label: 'Researcher', valid_from_ms: T0 - 90 * DAY, valid_until_ms: T0 - DAY, state: 'ENDED' }] },
    empty: { ...hv('portfolio-members'), portfolio_id: 'TEST_ONLY:portfolio-a', members: [] },
    'no-source': { ...hv('portfolio-members'), portfolio_id: 'TEST_ONLY:portfolio-a' },
  },
  negatives: [
    { id: 'state-unknown', base: 'published', rule: 'member states are closed', ops: [{ op: 'set', path: ['members', 0, 'state'], value: 'MAYBE' }] },
    { id: 'no-user', base: 'published', rule: 'a membership names its user', ops: [{ op: 'delete', path: ['members', 0, 'user_id'] }] },
    { id: 'role-empty', base: 'published', rule: 'a role label is text', ops: [{ op: 'set', path: ['members', 0, 'role_label'], value: '' }] }],
});

// GAP-6: Account 360 physical profile (typed; today open simulated keys).
def({
  name: 'account-profile', gap: 'GAP-6', route: '/api/v1/execution/accounts/{account_id}/profile', params: ['account_id'], query: ['workspace_id', 'environment'],
  description: 'The physical profile of an account/binding as the venue states it: product, network and when the network was proven, margin mode and ratio (a percent decimal text), wallet balance and native equity (each ONE currency).',
  schema: T.obj({ ...head('account-profile'), account_id: T.id(),
    product: T.sec(T.str(128)), network: T.sec(T.obj({ name: T.str(64), proof_at_ms: T.nul(T.ms()) })), margin_mode: T.sec(T.en('CROSS', 'ISOLATED', 'PORTFOLIO', 'NONE')),
    margin_ratio: T.sec(T.obj({ percent: T.dec(), as_of_ms: T.ms() })), wallet_balance: T.sec(T.obj({ currency: T.str(32), value: T.dec(), as_of_ms: T.ms() })),
    native_equity: T.sec(T.obj({ currency: T.str(32), value: T.dec(), as_of_ms: T.ms() })) }),
  valid: {
    identity_only: { ...hv('account-profile'), account_id: 'TEST_ONLY:account-1' },
    published: { ...hv('account-profile'), account_id: 'TEST_ONLY:account-1', product: 'USDT-M futures · hedge', network: { name: 'MAINNET', proof_at_ms: T0 - 2 * 60_000 }, margin_mode: 'CROSS',
      margin_ratio: { percent: '5.10', as_of_ms: T0 }, wallet_balance: { currency: 'USDT', value: '88200.00', as_of_ms: T0 }, native_equity: { currency: 'USDT', value: '88580.38', as_of_ms: T0 } },
    partial: { ...hv('account-profile'), account_id: 'TEST_ONLY:account-1', product: 'Perpetual swap · net', network: { name: 'MAINNET', proof_at_ms: null }, margin_mode: null, margin_ratio: null, wallet_balance: { currency: 'USDT', value: '0', as_of_ms: T0 } },
  },
  negatives: [
    { id: 'balance-number', base: 'published', rule: 'money is exact decimal text', ops: [{ op: 'set', path: ['wallet_balance', 'value'], value: 88200 }] },
    { id: 'balance-no-currency', base: 'published', rule: 'one currency per figure', ops: [{ op: 'delete', path: ['wallet_balance', 'currency'] }] },
    { id: 'margin-mode-unknown', base: 'published', rule: 'margin modes are closed', ops: [{ op: 'set', path: ['margin_mode'], value: 'YOLO' }] },
    { id: 'ratio-exponent', base: 'published', rule: 'a ratio is a plain decimal', ops: [{ op: 'set', path: ['margin_ratio', 'percent'], value: '5.1e0' }] }],
});

// GAP-9: readiness and archive state per alpha.
def({
  name: 'alpha-readiness', gap: 'GAP-9', route: '/api/v1/execution/readiness', params: [], query: ['workspace_id', 'environment'],
  description: 'Per alpha: gate readiness {met, total} and the archive disposition, for the Fleet KPIs (Ready for exit, Archive in progress), the 7-segment stage and the Archived lens.',
  schema: T.obj({ ...head('alpha-readiness'), environment: T.en('paper', 'sandbox', 'live'),
    // `items` is a section like every other optional figure here: omitted or null = no owning source. An empty array would state "no alpha", which no
    // source has said; the typed-absence answer omits it (11 Nov 2026, BACKEND_CONTRACT_ONLY_READS s3.1).
    items: T.sec(T.arr(T.obj({ alpha_id: T.id(), readiness: T.sec(T.rule(T.obj({ met: T.int(), total: T.int(1) }), 'v.met <= v.total')), archive_state: T.sec(T.en('ACTIVE', 'PAPER_WATCH', 'ARCHIVE_IN_PROGRESS', 'ARCHIVED')) }), 200)) }),
  valid: {
    published: { ...hv('alpha-readiness'), environment: 'paper', items: [
      { alpha_id: 'TEST_ONLY:alpha-a', readiness: { met: 7, total: 7 }, archive_state: 'ACTIVE' }, { alpha_id: 'TEST_ONLY:alpha-b', readiness: { met: 3, total: 7 }, archive_state: 'PAPER_WATCH' },
      { alpha_id: 'TEST_ONLY:alpha-c', readiness: null, archive_state: 'ARCHIVED' }, { alpha_id: 'TEST_ONLY:alpha-d' }] },
    empty: { ...hv('alpha-readiness'), environment: 'live', items: [] },
    no_source: { ...hv('alpha-readiness'), environment: 'paper' },
    items_null: { ...hv('alpha-readiness'), environment: 'sandbox', items: null },
  },
  negatives: [
    { id: 'met-above-total', base: 'published', rule: 'met never exceeds total', ops: [{ op: 'set', path: ['items', 0, 'readiness', 'met'], value: 8 }], schemaCannot: true },
    { id: 'total-zero', base: 'published', rule: 'a gate has at least one criterion', ops: [{ op: 'set', path: ['items', 0, 'readiness', 'total'], value: 0 }] },
    { id: 'archive-unknown', base: 'published', rule: 'archive states are closed', ops: [{ op: 'set', path: ['items', 0, 'archive_state'], value: 'LOST' }] },
    { id: 'items-not-an-array', base: 'published', rule: 'items is a list, a null, or absent; never an object or text', ops: [{ op: 'set', path: ['items'], value: 'none' }] },
    { id: 'environment-missing', base: 'no_source', rule: 'the answer names the environment it is about', ops: [{ op: 'delete', path: ['environment'] }] }],
});

// FE-035 (P3): the fleet-map projection, `view=MAP` of the fleet read as its own bounded read so the Manager model itself is untouched. A row is a SUBSET of the
// Manager row facts (same meaning, same vocabularies): row_key, name, allocation, windowed return and net PnL, health text, stage_presence. At most 1000 rows;
// `truncated` and `total_count` keep a cap from reading as the whole fleet (`total_count` is the number of rows the source holds, or null when it was not
// counted; fewer rows than the count without `truncated` is refused).
const mapRow = T.obj({ row_key: T.str(2048), name: T.sec(T.str(256)), allocation: T.sec(money),
  window_return: T.sec(T.obj({ ratio_scale: T.en('FRACTION', 'PERCENT'), value: T.dec() })), net_pnl: T.sec(money), health: T.sec(T.str(256)),
  stage_presence: T.arr(T.en('PAPER', 'SANDBOX', 'CANARY', 'LIVE'), 4) });
const mapRows = (n, first = 0) => Array.from({ length: n }, (_, i) => ({ row_key: `TEST_ONLY:map-row-${first + i}`, name: `Alpha ${first + i}`,
  allocation: { currency: 'USDT', value: `${1000 + ((first + i) % 9000)}.00` }, window_return: { ratio_scale: 'FRACTION', value: `0.0${(first + i) % 10}25` },
  net_pnl: { currency: 'USDT', value: `${((first + i) % 200) - 60}.50` }, health: (first + i) % 17 === 0 ? 'WARN' : 'OK', stage_presence: [['PAPER'], ['SANDBOX'], ['PAPER', 'CANARY'], ['LIVE']][(first + i) % 4] }));
def({
  name: 'fleet-map', gap: 'FE-035', route: '/api/v1/execution/manager/fleet-map', params: [], query: ['workspace_id', 'window'],
  description: 'The fleet-map projection (`view=MAP`): per row only row_key, name, allocation, windowed return and net PnL, health and stage_presence, at most 1000 rows, with its own byte cap, for the C1 heat map at fleet scale.',
  schema: T.rule(T.obj({ ...head('fleet-map'), window: T.str(32), rows: T.arr(mapRow, 1000), total_count: T.nul(T.int()), truncated: T.bool() }),
    'new Set(v.rows.map((r: any) => r.row_key)).size === v.rows.length && (v.truncated === true || v.total_count === null || v.total_count <= v.rows.length)'),
  valid: {
    published: { ...hv('fleet-map'), window: '30D', total_count: 3, truncated: false, rows: [
      ...mapRows(2), { row_key: 'TEST_ONLY:map-row-bare', stage_presence: [] }] },
    capped_small: { ...hv('fleet-map'), window: '7D', total_count: 5, truncated: true, rows: mapRows(2) },
    max_1000: { ...hv('fleet-map'), window: '30D', total_count: 1000, truncated: false, rows: mapRows(1000) },
  },
  negatives: [
    { id: 'rows-over-cap', base: 'max_1000', rule: 'a map answer carries at most 1000 rows', ops: [{ op: 'set', path: ['rows'], value: Array.from({ length: 1001 }, (_, i) => ({ row_key: `TEST_ONLY:map-row-${i}`, stage_presence: [] })) }] },
    { id: 'duplicate-row-key', base: 'published', rule: 'a row key is unique within a body', ops: [{ op: 'set', path: ['rows', 1, 'row_key'], value: 'TEST_ONLY:map-row-0' }], schemaCannot: true },
    { id: 'short-without-truncated', base: 'published', rule: 'fewer rows than the count, without truncated, would read as the whole fleet', ops: [{ op: 'set', path: ['total_count'], value: 9 }], schemaCannot: true },
    { id: 'stage-presence-unknown', base: 'published', rule: 'stage presence uses the Manager stage vocabulary', ops: [{ op: 'set', path: ['rows', 0, 'stage_presence'], value: ['RESEARCH'] }] },
    { id: 'allocation-number', base: 'published', rule: 'money is exact decimal text', ops: [{ op: 'set', path: ['rows', 0, 'allocation', 'value'], value: 1000 }] },
    { id: 'truncated-missing', base: 'published', rule: 'the answer states whether it was capped', ops: [{ op: 'delete', path: ['truncated'] }] }],
});

// GAP-11: reconciliation runs and breaks.
def({
  name: 'reconciliation', gap: 'GAP-11', route: '/api/v1/execution/reconciliation', params: [], query: ['workspace_id', 'subject_type', 'subject_id', 'page_size', 'cursor'],
  description: 'Reconciliation runs and the breaks they found for a subject, so the Reconciliation tab, the stage chips and the Account 360 triad stop counting rows.',
  schema: T.obj({ ...head('reconciliation'), subject,
    runs: T.sec(T.arr(T.obj({ run_id: T.id(), state: T.en('RUNNING', 'MATCHED', 'BREAKS_FOUND', 'FAILED'), started_at_ms: T.ms(), finished_at_ms: T.nul(T.ms()), breaks_open: T.int() }), 100)),
    breaks: T.sec(T.arr(T.obj({ break_id: T.id(), run_id: T.id(), state: T.en('OPEN', 'RESOLVING', 'RESOLVED'), kind: T.en('POSITION', 'BALANCE', 'ORDER', 'FILL'), resolution_revision: T.nul(T.int(1)), detected_at_ms: T.ms() }), 200)), next_cursor: T.sec(T.str(4096)) }),
  valid: {
    published: { ...hv('reconciliation'), subject: { type: 'ACCOUNT', id: 'TEST_ONLY:account-1' }, runs: [
      { run_id: 'TEST_ONLY:run-2', state: 'BREAKS_FOUND', started_at_ms: T0 - H, finished_at_ms: T0 - H + 60_000, breaks_open: 1 }, { run_id: 'TEST_ONLY:run-1', state: 'MATCHED', started_at_ms: T0 - DAY, finished_at_ms: T0 - DAY + 60_000, breaks_open: 0 }],
      breaks: [{ break_id: 'TEST_ONLY:brk-1', run_id: 'TEST_ONLY:run-2', state: 'OPEN', kind: 'BALANCE', resolution_revision: null, detected_at_ms: T0 - H }], next_cursor: 'TEST_ONLY_CURSOR' },
    clean: { ...hv('reconciliation'), subject: { type: 'ACCOUNT', id: 'TEST_ONLY:account-1' }, runs: [], breaks: [], next_cursor: null },
  },
  negatives: [
    { id: 'break-state-unknown', base: 'published', rule: 'break states are closed', ops: [{ op: 'set', path: ['breaks', 0, 'state'], value: 'IGNORED' }] },
    { id: 'revision-zero', base: 'published', rule: 'a resolution revision is positive', ops: [{ op: 'set', path: ['breaks', 0, 'resolution_revision'], value: 0 }] },
    { id: 'breaks-open-negative', base: 'published', rule: 'a count is not negative', ops: [{ op: 'set', path: ['runs', 0, 'breaks_open'], value: -1 }] }],
});

// GAP-12: limits.
def({
  name: 'limits', gap: 'GAP-12', route: '/api/v1/execution/limits', params: [], query: ['workspace_id', 'subject_type', 'subject_id'],
  description: 'The limit records of a scope with the model revision that evaluates them and the used ratio the SERVER states (six places, never computed by a client).',
  schema: T.obj({ ...head('limits'), subject,
    items: T.sec(T.arr(T.obj({ limit_id: T.id(), scope: T.obj({ type: T.en('WORKSPACE', 'PORTFOLIO', 'ACCOUNT', 'DEPLOYMENT'), id: T.id() }), label: T.str(), model_revision: T.str(64),
      used_ratio: T.nul(T.dec()), state: T.en('OK', 'WARN', 'BREACH', 'UNKNOWN'), cap: T.nul(money) }), 200)) }),
  valid: {
    published: { ...hv('limits'), subject: { type: 'DEPLOYMENT', id: 'TEST_ONLY:dep-1' }, items: [
      { limit_id: 'TEST_ONLY:lim-1', scope: { type: 'DEPLOYMENT', id: 'TEST_ONLY:dep-1' }, label: 'Gross notional', model_revision: 'TEST_ONLY:model-4', used_ratio: '0.412300', state: 'OK', cap: { currency: 'USDT', value: '150000.00' } },
      { limit_id: 'TEST_ONLY:lim-2', scope: { type: 'DEPLOYMENT', id: 'TEST_ONLY:dep-1' }, label: 'Open orders', model_revision: 'TEST_ONLY:model-4', used_ratio: null, state: 'UNKNOWN', cap: null }] },
    none: { ...hv('limits'), subject: { type: 'DEPLOYMENT', id: 'TEST_ONLY:dep-1' }, items: [] },
  },
  negatives: [
    { id: 'ratio-number', base: 'published', rule: 'a ratio is exact decimal text', ops: [{ op: 'set', path: ['items', 0, 'used_ratio'], value: 0.4123 }] },
    { id: 'state-unknown', base: 'published', rule: 'limit states are closed', ops: [{ op: 'set', path: ['items', 0, 'state'], value: 'FINE' }] },
    { id: 'cap-no-currency', base: 'published', rule: 'a cap states its currency', ops: [{ op: 'delete', path: ['items', 0, 'cap', 'currency'] }] }],
});

// GAP-15: fee / funding cost events.
def({
  name: 'cost-events', gap: 'GAP-15', route: '/api/v1/execution/cost-events', params: [], query: ['workspace_id', 'subject_type', 'subject_id', 'window'],
  description: 'Fee, funding and interest events of a subject. One currency per event; nothing is summed across currencies; a window total, when asked, is per currency.',
  schema: T.obj({ ...head('cost-events'), subject,
    events: T.sec(T.arr(T.obj({ event_id: T.id(), kind: T.en('FEE', 'FUNDING', 'INTEREST'), at_ms: T.ms(), currency: T.str(32), amount: T.dec(), order_id: T.nul(T.id()) }), 200)),
    totals: T.sec(T.arr(T.obj({ kind: T.en('FEE', 'FUNDING', 'INTEREST'), currency: T.str(32), amount: T.dec() }), 30)) }),
  valid: {
    published: { ...hv('cost-events'), subject: { type: 'ALPHA', id: 'TEST_ONLY:alpha-a' }, events: [
      { event_id: 'TEST_ONLY:cost-1', kind: 'FEE', at_ms: T0 - H, currency: 'USDT', amount: '1.25', order_id: 'TEST_ONLY:ord-1' }, { event_id: 'TEST_ONLY:cost-2', kind: 'FUNDING', at_ms: T0 - 8 * H, currency: 'USDT', amount: '-0.40', order_id: null },
      { event_id: 'TEST_ONLY:cost-3', kind: 'FEE', at_ms: T0 - 2 * H, currency: 'BNB', amount: '0.0012', order_id: 'TEST_ONLY:ord-2' }],
      totals: [{ kind: 'FEE', currency: 'USDT', amount: '1.25' }, { kind: 'FEE', currency: 'BNB', amount: '0.0012' }, { kind: 'FUNDING', currency: 'USDT', amount: '-0.40' }] },
    none: { ...hv('cost-events'), subject: { type: 'ALPHA', id: 'TEST_ONLY:alpha-a' }, events: [], totals: [] },
  },
  negatives: [
    { id: 'amount-number', base: 'published', rule: 'money is exact decimal text', ops: [{ op: 'set', path: ['events', 0, 'amount'], value: 1.25 }] },
    { id: 'kind-unknown', base: 'published', rule: 'kinds are closed', ops: [{ op: 'set', path: ['events', 0, 'kind'], value: 'TIP' }] },
    { id: 'no-currency', base: 'published', rule: 'one currency per event', ops: [{ op: 'delete', path: ['events', 0, 'currency'] }] }],
});

// GAP-13: report snapshots.
def({
  name: 'report-snapshots', gap: 'GAP-13', route: '/api/v1/execution/reports', params: [], query: ['workspace_id', 'subject_type', 'subject_id'],
  description: 'Immutable report snapshots of a subject: id, content hash, the source cut they were built at. A report is a record, not a live view.',
  schema: T.obj({ ...head('report-snapshots'), subject,
    items: T.sec(T.arr(T.obj({ report_id: T.id(), content_hash: T.sha(), source_cut: T.obj({ as_of_ms: T.ms(), revision: T.sha() }), created_at_ms: T.ms(), created_by: T.nul(T.str()) }), 100)) }),
  valid: {
    published: { ...hv('report-snapshots'), subject: { type: 'PORTFOLIO', id: 'TEST_ONLY:portfolio-a' }, items: [
      { report_id: 'TEST_ONLY:rep-1', content_hash: sha('c'), source_cut: { as_of_ms: T0 - DAY, revision: sha('d') }, created_at_ms: T0 - DAY + 5000, created_by: 'TEST_ONLY:user-1' }] },
    none: { ...hv('report-snapshots'), subject: { type: 'PORTFOLIO', id: 'TEST_ONLY:portfolio-a' }, items: [] },
  },
  negatives: [
    { id: 'hash-not-sha', base: 'published', rule: 'a content hash is a sha256', ops: [{ op: 'set', path: ['items', 0, 'content_hash'], value: 'md5:abc' }] },
    { id: 'no-cut', base: 'published', rule: 'a report names its source cut', ops: [{ op: 'delete', path: ['items', 0, 'source_cut'] }] }],
});

// GAP-14: recovery / quality events.
def({
  name: 'recovery-events', gap: 'GAP-14', route: '/api/v1/execution/recovery-events', params: [], query: ['workspace_id', 'subject_type', 'subject_id'],
  description: 'Recovery and data-quality events of a subject, for the Incident Recovery section, the Live banner and Operations Source.',
  schema: T.obj({ ...head('recovery-events'), subject,
    events: T.sec(T.arr(T.obj({ event_id: T.id(), kind: T.en('RECOVERY_STARTED', 'RECOVERY_COMPLETED', 'RECOVERY_FAILED', 'QUALITY_DEGRADED', 'QUALITY_RESTORED'), at_ms: T.ms(),
      recovery_id: T.nul(T.id()), quality_event_id: T.nul(T.id()), detail: T.nul(T.str()) }), 200)) }),
  valid: {
    published: { ...hv('recovery-events'), subject: { type: 'INCIDENT', id: 'TEST_ONLY:incident-1' }, events: [
      { event_id: 'TEST_ONLY:rev-1', kind: 'RECOVERY_STARTED', at_ms: T0 - H, recovery_id: 'TEST_ONLY:rec-1', quality_event_id: null, detail: null },
      { event_id: 'TEST_ONLY:rev-2', kind: 'QUALITY_DEGRADED', at_ms: T0 - 2 * H, recovery_id: null, quality_event_id: 'TEST_ONLY:q-1', detail: 'Feed gap' }] },
    none: { ...hv('recovery-events'), subject: { type: 'INCIDENT', id: 'TEST_ONLY:incident-1' }, events: [] },
  },
  negatives: [
    { id: 'kind-unknown', base: 'published', rule: 'kinds are closed', ops: [{ op: 'set', path: ['events', 0, 'kind'], value: 'FIXED_ITSELF' }] },
    { id: 'at-float', base: 'published', rule: 'a clock is an integer', ops: [{ op: 'set', path: ['events', 0, 'at_ms'], value: 1.5 }] }],
});

// GAP-16: grants and reservations.
def({
  name: 'grants', gap: 'GAP-16', route: '/api/v1/execution/grants', params: [], query: ['workspace_id', 'subject_type', 'subject_id'],
  description: 'Risk grants and reservations of a subject, with amounts per currency (never summed across currencies).',
  schema: T.obj({ ...head('grants'), subject,
    items: T.sec(T.arr(T.obj({ grant_id: T.id(), reservation_id: T.nul(T.id()), state: T.en('GRANTED', 'RESERVED', 'CONSUMED', 'RELEASED', 'EXPIRED'),
      amounts: T.arr(money, 8, 1), granted_at_ms: T.ms(), expires_at_ms: T.nul(T.ms()) }), 200)) }),
  valid: {
    published: { ...hv('grants'), subject: { type: 'DEPLOYMENT', id: 'TEST_ONLY:dep-1' }, items: [
      { grant_id: 'TEST_ONLY:g-1', reservation_id: 'TEST_ONLY:res-1', state: 'RESERVED', amounts: [{ currency: 'USDT', value: '5000.00' }], granted_at_ms: T0 - H, expires_at_ms: T0 + H },
      { grant_id: 'TEST_ONLY:g-2', reservation_id: null, state: 'CONSUMED', amounts: [{ currency: 'USDT', value: '250' }, { currency: 'BTC', value: '0.01' }], granted_at_ms: T0 - DAY, expires_at_ms: null }] },
    none: { ...hv('grants'), subject: { type: 'DEPLOYMENT', id: 'TEST_ONLY:dep-1' }, items: [] },
  },
  negatives: [
    { id: 'no-amounts', base: 'published', rule: 'a grant states at least one amount', ops: [{ op: 'set', path: ['items', 0, 'amounts'], value: [] }] },
    { id: 'amount-number', base: 'published', rule: 'money is exact decimal text', ops: [{ op: 'set', path: ['items', 0, 'amounts', 0, 'value'], value: 5000 }] },
    { id: 'state-unknown', base: 'published', rule: 'states are closed', ops: [{ op: 'set', path: ['items', 0, 'state'], value: 'LENT' }] }],
});

// GAP-2: the POSITIVE apply receipt. The pinned chain cannot carry one: `execution-operations.v1` publishes `relay_receipt` as a null const and `F0ApplyDecision.decision`
// as the const DENIED (and the F0 blocked operation states `source_side_effect_requested: false`); relaxing them would weaken the invariants that make a denial a denial.
// The smallest additive route is this sibling read of a command's receipt, keyed by operation_id: it leaves the pinned decision untouched and adds the positive case.
def({
  name: 'command-receipt', gap: 'GAP-2', route: '/api/v1/execution/commands/{operation_id}/receipt', params: ['operation_id'], query: ['workspace_id'],
  description: 'The receipt of one command operation: its state, what the Portal decided, and (once applied) the receipt reference, hash, what changed and the verification. A DENIED command carries the denial and no receipt. This is the positive companion of the pinned F0 denial; it does not change that denial.',
  schema: T.rule(T.obj({ ...head('command-receipt'), operation_id: T.id(), command_key: T.str(128), request_key: T.id(),
    state: T.en('PLANNED', 'DENIED', 'APPLIED', 'VERIFIED', 'FAILED', 'EXPIRED'),
    side_effect: T.obj({ source_request_sent: T.bool(), relay: T.en('DISABLED', 'NOT_ATTEMPTED', 'RELAYED') }),
    receipt: T.sec(T.obj({ receipt_ref: T.id(), content_hash: T.sha(), issued_at_ms: T.ms(), issued_by: T.nul(T.str()), what_changes: T.str(),
      verification: T.nul(T.obj({ result: T.en('PENDING', 'SUCCEEDED', 'FAILED', 'PARTIAL'), verified_at_ms: T.nul(T.ms()) })) })) }),
    '((v.state !== "APPLIED" && v.state !== "VERIFIED") || v.receipt.state === "PUBLISHED") && (v.state !== "DENIED" || (v.side_effect.source_request_sent === false && v.side_effect.relay !== "RELAYED"))',
    [{ if: { type: 'object', required: ['state'], properties: { state: { enum: ['APPLIED', 'VERIFIED'] } } }, then: { type: 'object', required: ['receipt'], properties: { receipt: { type: 'object' } } } },
      { if: { type: 'object', required: ['state'], properties: { state: { const: 'DENIED' } } }, then: { type: 'object', properties: { side_effect: { type: 'object', properties: { source_request_sent: { const: false }, relay: { enum: ['DISABLED', 'NOT_ATTEMPTED'] } } } } } }]),
  valid: {
    applied: { ...hv('command-receipt'), operation_id: 'TEST_ONLY:op-1', command_key: 'allocation/increase', request_key: 'TEST_ONLY:req-1', state: 'APPLIED',
      side_effect: { source_request_sent: true, relay: 'RELAYED' }, receipt: { receipt_ref: 'TEST_ONLY:receipt-1', content_hash: sha('e'), issued_at_ms: T0 - H, issued_by: 'TEST_ONLY:actor-1',
        what_changes: 'Allocation to portfolio A rises by 5000.00 USDT.', verification: { result: 'PENDING', verified_at_ms: null } } },
    verified: { ...hv('command-receipt'), operation_id: 'TEST_ONLY:op-1', command_key: 'allocation/increase', request_key: 'TEST_ONLY:req-1', state: 'VERIFIED',
      side_effect: { source_request_sent: true, relay: 'RELAYED' }, receipt: { receipt_ref: 'TEST_ONLY:receipt-1', content_hash: sha('e'), issued_at_ms: T0 - H, issued_by: null,
        what_changes: 'Allocation to portfolio A rises by 5000.00 USDT.', verification: { result: 'SUCCEEDED', verified_at_ms: T0 } } },
    denied: { ...hv('command-receipt'), operation_id: 'TEST_ONLY:op-2', command_key: 'allocation/increase', request_key: 'TEST_ONLY:req-2', state: 'DENIED',
      side_effect: { source_request_sent: false, relay: 'DISABLED' } },
  },
  negatives: [
    { id: 'applied-without-receipt', base: 'applied', rule: 'an applied command has a receipt', ops: [{ op: 'delete', path: ['receipt'] }], schemaCannot: false },
    { id: 'applied-receipt-null', base: 'applied', rule: 'an applied command has a receipt (not "not read")', ops: [{ op: 'set', path: ['receipt'], value: null }] },
    { id: 'denied-with-relay', base: 'denied', rule: 'a denied command sent nothing to the source', ops: [{ op: 'set', path: ['side_effect', 'source_request_sent'], value: true }] },
    { id: 'hash-not-sha', base: 'applied', rule: 'a receipt hash is a sha256', ops: [{ op: 'set', path: ['receipt', 'content_hash'], value: 'abc' }] },
    { id: 'state-unknown', base: 'applied', rule: 'states are closed', ops: [{ op: 'set', path: ['state'], value: 'DONE' }] }],
});

// GAP-10: typed order fields of ONE order (the blotter rows carry open scalars; this is the typed, strict read) and the blotter's bucket / funnel summary.
// FEE RULE (F2->K 3): a fee is NEVER defaulted to 0. It is published only when every fill states a commission in ONE currency; otherwise it is not published and the reason is stated.
def({
  name: 'order-detail', gap: 'GAP-10', route: '/api/v1/execution/orders/{order_id}/detail', params: ['order_id'], query: ['workspace_id'],
  description: 'The typed fields of one order: deployment, filled quantity (a true 0 is a value), average fill price, fee with the fee rule (never defaulted to 0; absent with a stated reason when a fill has no commission or the fills use two currencies), acknowledgement latency and the order intent record.',
  schema: T.rule(T.obj({ ...head('order-detail'), order_id: T.id(), deployment_id: T.sec(T.id()), filled_quantity: T.sec(T.dec()), average_fill_price: T.sec(T.dec()),
    fee: T.sec(money), fee_absence: T.sec(T.en('NO_FILLS', 'FILL_WITHOUT_COMMISSION', 'MIXED_FEE_CURRENCIES')), ack_latency_ms: T.sec(T.int()),
    intent: T.sec(T.obj({ intent_id: T.id(), idempotency_scope: T.en('ACTOR_REQUEST_KEY', 'WORKSPACE_REQUEST_KEY') })) }),
    '!(v.fee.state === "PUBLISHED" && v.fee_absence.state === "PUBLISHED")',
    [{ not: { type: 'object', required: ['fee', 'fee_absence'], properties: { fee: { type: 'object' }, fee_absence: { type: 'string' } } } }]),
  valid: {
    filled: { ...hv('order-detail'), order_id: 'TEST_ONLY:ord-1', deployment_id: 'TEST_ONLY:dep-1', filled_quantity: '0.5', average_fill_price: '67250.5', fee: { currency: 'USDT', value: '1.25' }, ack_latency_ms: 42,
      intent: { intent_id: 'TEST_ONLY:intent-1', idempotency_scope: 'ACTOR_REQUEST_KEY' } },
    'no-fills': { ...hv('order-detail'), order_id: 'TEST_ONLY:ord-2', deployment_id: 'TEST_ONLY:dep-1', filled_quantity: '0', fee_absence: 'NO_FILLS' },
    'mixed-fee': { ...hv('order-detail'), order_id: 'TEST_ONLY:ord-3', filled_quantity: '2', average_fill_price: '100', fee_absence: 'MIXED_FEE_CURRENCIES', ack_latency_ms: 7 },
  },
  negatives: [
    { id: 'fee-and-absence', base: 'filled', rule: 'a fee and its absence reason never coexist', ops: [{ op: 'set', path: ['fee_absence'], value: 'NO_FILLS' }] },
    { id: 'fee-number', base: 'filled', rule: 'a fee is exact decimal text', ops: [{ op: 'set', path: ['fee', 'value'], value: 1.25 }] },
    { id: 'fee-no-currency', base: 'filled', rule: 'a fee states its currency', ops: [{ op: 'delete', path: ['fee', 'currency'] }] },
    { id: 'absence-unknown', base: 'no-fills', rule: 'fee absence reasons are closed', ops: [{ op: 'set', path: ['fee_absence'], value: 'FORGOTTEN' }] },
    { id: 'latency-float', base: 'filled', rule: 'a latency is an integer', ops: [{ op: 'set', path: ['ack_latency_ms'], value: 4.5 }] },
    { id: 'scope-unknown', base: 'filled', rule: 'idempotency scopes are closed', ops: [{ op: 'set', path: ['intent', 'idempotency_scope'], value: 'GLOBAL' }] }],
});
def({
  name: 'blotter-summary', gap: 'GAP-10', route: '/api/v1/execution/blotter/summary', params: [], query: ['workspace_id', 'environment', 'deployment_id'],
  description: 'Status buckets (incl. Working, Conditional, Cancelled) and the order funnel of one query scope. The funnel counts are integers (a true 0 is a value) and never grow along the funnel: filled <= venue_acknowledged <= risk_granted <= submitted.',
  schema: T.obj({ ...head('blotter-summary'), environment: T.en('paper', 'sandbox', 'live'),
    status_buckets: T.sec(T.arr(T.obj({ bucket: T.en('OPEN', 'WORKING', 'CONDITIONAL', 'PARTIAL', 'FILLED', 'CANCELLED', 'REJECTED'), count: T.int() }), 7)),
    funnel: T.sec(T.rule(T.obj({ submitted: T.int(), risk_granted: T.int(), venue_acknowledged: T.int(), filled: T.int() }), 'v.filled <= v.venue_acknowledged && v.venue_acknowledged <= v.risk_granted && v.risk_granted <= v.submitted')) }),
  valid: {
    published: { ...hv('blotter-summary'), environment: 'paper', status_buckets: [{ bucket: 'WORKING', count: 3 }, { bucket: 'CONDITIONAL', count: 0 }, { bucket: 'CANCELLED', count: 5 }, { bucket: 'FILLED', count: 40 }],
      funnel: { submitted: 50, risk_granted: 48, venue_acknowledged: 47, filled: 40 } },
    'not-read': { ...hv('blotter-summary'), environment: 'paper', status_buckets: null, funnel: null },
  },
  negatives: [
    { id: 'funnel-grows', base: 'published', rule: 'the funnel never grows along its steps', ops: [{ op: 'set', path: ['funnel', 'filled'], value: 49 }], schemaCannot: true },
    { id: 'bucket-unknown', base: 'published', rule: 'buckets are closed', ops: [{ op: 'set', path: ['status_buckets', 0, 'bucket'], value: 'LIMBO' }] },
    { id: 'count-negative', base: 'published', rule: 'a count is not negative', ops: [{ op: 'set', path: ['funnel', 'submitted'], value: -1 }] }],
});

/* ── generation ──────────────────────────────────────────────────────────── */
const headers = { 'Cache-Control': { required: true, schema: { type: 'string', const: 'private, no-store' } } };
const header = file => ({ $schema: 'https://json-schema.org/draft/2020-12/schema', $id: `https://schemas.primusspark.com/portal/${file}` });
const camel = s => s.replace(/(^|-)(\w)/g, (_, __, c) => c.toUpperCase());
const NO_PRODUCER = 'CONTRACT ONLY: no producer exists yet (Edge/Core inputs are in WP_K_CONTRACTS_2026-10-23.md), so nothing serves this route and every screen keeps its typed absence.';
const outputs = {};
const index = [];
const ajv = new Ajv2020({ strict: true, allErrors: true });
const apply = (body, ops) => { for (const op of ops) { const holder = op.path.slice(0, -1).reduce((n, k) => n[k], body); if (op.op === 'delete') delete holder[op.path.at(-1)]; else holder[op.path.at(-1)] = op.value; } return body; };
for (const d of DEFS) {
  const schema = schemaOf(d.schema);
  const file = `execution-${d.name}.v1.schema.json`;
  const check = ajv.compile({ ...header(file), ...schema });
  const Name = camel(d.name);
  const sourceDarkRoute = ['order-detail', 'account-profile', 'reconciliation', 'obligations'].includes(d.name);
  const nativeAccountProfile = d.name === 'account-profile';
  const nativeSibling = sourceDarkRoute;
  const problemCodes = ['EXECUTION_READ_NOT_AVAILABLE', 'EXECUTION_READ_QUERY_INVALID', ...(sourceDarkRoute
    ? ['SESSION_REQUIRED', 'REQUEST_REJECTED', 'PORTAL_AUTHORITY_UNAVAILABLE', 'PORTAL_READ_STORE_UNAVAILABLE', 'EXECUTION_LOCAL_READ_BUSY'] : []),
    ...(nativeSibling ? ['EXECUTION_READ_SCOPE_REQUIRED', 'EXECUTION_READ_ACCESS_CHANGED', 'EXECUTION_READ_CURRENT_ONLY',
      'EXECUTION_READ_POLICY_PENDING', 'EXECUTION_READ_PUBLICATION_NOT_QUALIFIED', 'EXECUTION_READ_FIELD_POLICY_PENDING',
      'EXECUTION_READ_SCOPE_LIMIT', 'EXECUTION_READ_AUTHORITY_UNAVAILABLE', 'EXECUTION_READ_CURSOR_INVALID'] : [])];
  const problem = { type: 'object', additionalProperties: false, required: ['error', 'request_id'], properties: {
    error: { type: 'object', additionalProperties: false, required: ['code', 'message'], properties: { code: { type: 'string', enum: problemCodes }, message: { type: 'string', minLength: 1, maxLength: 256 } } },
    request_id: { type: 'string' } } };
  const errors = Object.fromEntries([[400, 'Invalid query'], [401, 'Session required'], ...(sourceDarkRoute ? [[403, nativeAccountProfile ? 'Read refused' : 'Profile not commissioned']] : []), [404, 'Unavailable or not authorized'],
    ...(nativeSibling ? [[409, 'Authority or source changed before dispatch']] : []), [503, 'Source unavailable']]
    .map(([c, t]) => [c, { description: t, headers, content: { 'application/json': { schema: { $ref: `#/components/schemas/${Name}Problem` } } } }]));
  const get = { operationId: `execution${Name}GetV1`, security: [{ PortalSession: [] }], description: `${d.description} ${nativeAccountProfile
    ? 'When the separately qualified Paper Manager CURRENT and native HTTP custody are installed, the route can return account identity alone. Fields without source authority are omitted. Otherwise it refuses; no source is enabled by this contract.'
    : sourceDarkRoute ? 'Source-dark route: no positive producer is commissioned; the route refuses instead of inventing data.' : NO_PRODUCER}`,
    parameters: [...d.params.map(n => ({ name: n, in: 'path', required: true, schema: schemaOf(T.id()) })), ...d.query.map(n => ({ name: n, in: 'query', required: false, schema: n === 'environment' ? { type: 'string', enum: ['paper', 'sandbox', 'live'] } : n === 'page_size' ? { type: 'integer', minimum: 1, maximum: 200 } : n === 'cursor' ? schemaOf(T.str(4096)) : schemaOf(T.str()) }))],
    responses: { 200: { description: 'Authorized current answer; absence stays typed', headers, content: { 'application/json': { schema: { $ref: `#/components/schemas/${Name}` } } } }, ...errors } };
  const paths = { [d.route]: { get } };
  const schemas = { [Name]: schema, [`${Name}Problem`]: problem };
  if (d.post) {
    const body = schemaOf(d.post.body);
    schemas[`${Name}Mark`] = body;
    paths[d.post.route] = { post: { operationId: `execution${Name}MarkV1`, security: [{ PortalSession: [] }], description: `${d.post.description} CONTRACT ONLY.`,
      requestBody: { required: true, content: { 'application/json': { schema: { $ref: `#/components/schemas/${Name}Mark` } } } },
      responses: { 200: { description: 'The answer after the baseline moved', headers, content: { 'application/json': { schema: { $ref: `#/components/schemas/${Name}` } } } }, ...errors } } };
  }
  outputs[`schemas/${file}`] = { ...header(file), ...schema };
  outputs[`openapi/execution-${d.name}.openapi.json`] = { openapi: '3.1.0', info: { title: d.name, version: '1.0.0' }, paths,
    components: { securitySchemes: { PortalSession: { type: 'apiKey', in: 'cookie', name: '__Host-portal_session' } }, schemas } };
  for (const [vname, value] of Object.entries(d.valid)) {
    if (!check(value)) throw new Error(`${d.name}/${vname} is not valid: ${JSON.stringify(check.errors)}`);
    outputs[`fixtures/execution-${d.name}.${vname}.synthetic.valid.json`] = { lane: 'TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT', value };
  }
  const negatives = { lane: 'TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT', bases: Object.fromEntries(Object.keys(d.valid).map(v => [v, `execution-${d.name}.${v}.synthetic.valid.json`])), cases: d.negatives.map(({ schemaCannot, ...c }) => ({ ...c, ...(schemaCannot ? { refused_by: 'READER_ONLY' } : { refused_by: 'SCHEMA_AND_READER' }) })) };
  for (const c of d.negatives) {
    const body = apply(structuredClone(d.valid[c.base]), c.ops);
    if (!c.schemaCannot && check(body)) throw new Error(`negative ${d.name}/${c.id} is not refused by the schema`);
  }
  outputs[`fixtures/execution-${d.name}.synthetic.negative.json`] = negatives;
  index.push({ name: d.name, gap: d.gap, schema: file, route: d.route, valid: Object.keys(d.valid), post: d.post?.route ?? null });
}
outputs['fixtures/execution-siblings.index.json'] = { lane: 'TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT', siblings: index };

// the frontend readers, from the same definitions
const lines = ['// GENERATED by packages/contracts/tooling/generate-execution-siblings.mjs. Do not edit: change the definition and regenerate.',
  '/* eslint-disable @typescript-eslint/no-explicit-any */',
  'import * as S from "./strictRead";', '', 'const ID = /^[A-Za-z0-9._:-]{1,191}$/;',
  'export interface SiblingSpec { readonly gap: string; readonly schemaVersion: string; readonly read: S.R<any>; readonly path: (params: Readonly<Record<string, string>>) => string | null; readonly post?: string }', '',
  'export const SIBLINGS = {'];
for (const d of DEFS) {
  const route = d.route.replace('/api/v1/execution', '');
  const tpl = route.replace(/\{(\w+)\}/g, (_, p) => '${encodeURIComponent(params.' + p + ')}');
  const check = d.params.map(p => `!ID.test(params.${p} ?? "")`).join(' || ');
  lines.push(`  ${JSON.stringify(d.name)}: {`, `    gap: ${JSON.stringify(d.gap)}, schemaVersion: ${JSON.stringify(`portal.execution.${d.name}.v1`)},`,
    `    read: ${tsOf(d.schema)},`,
    `    path: (params) => {`, ...(check ? [`      if (${check}) return null;`] : []),
    `      const query = new URLSearchParams(); for (const key of ${JSON.stringify(d.query)}) if (params[key]) query.set(key, params[key]!);`,
    `      return \`${tpl}\${query.toString() === "" ? "" : "?" + query.toString()}\`;`, `    },`,
    ...(d.post ? [`    post: ${JSON.stringify(d.post.route.replace('/api/v1/execution', ''))},`] : []), `  },`);
}
lines.push('} as const satisfies Record<string, SiblingSpec>;', 'export type SiblingId = keyof typeof SIBLINGS;', '');
const ts = lines.join('\n');
for (const [file, value] of Object.entries(outputs)) {
  const content = JSON.stringify(value, null, 2) + '\n', path = resolve(root, file);
  if (process.argv.includes('--check')) { if (readFileSync(path, 'utf8') !== content) throw new Error('Generated sibling contract drift: ' + file); }
  else writeFileSync(path, content);
}
if (process.argv.includes('--check')) { if (readFileSync(feOut, 'utf8') !== ts) throw new Error('Generated sibling readers drift'); }
else writeFileSync(feOut, ts);
console.log(JSON.stringify(DEFS.map(d => d.name)));
