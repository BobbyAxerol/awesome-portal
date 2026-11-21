#!/usr/bin/env node
/** GET-only metadata oracle on the owned P23 cell; never shared :8095. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE_URL, PROJECT, validateHome } from './cell.mjs';
import { DEFAULT_HOME, loadSessions, makeClient, savePrivate } from './api-client.mjs';
import { container, docker } from './runtime-tools.mjs';

// Exact already-built index of the OWNED cell, not the wider shared B7 index.
export const INDEX = Object.freeze({ start: 1777593600000, end: 1788220800000, step: 3600000, bars: 2952 });
export function metadataCases() {
  const { start: s, end: e, step: h } = INDEX;
  return [
    { name: 'indexed-first-day-no-warmup', start: s, end: s + 24*h, warmup: 0, state: 'AVAILABLE', bars: 24, before: 0 },
    { name: 'indexed-first-day-warmup-refused', start: s, end: s + 24*h, warmup: 300, state: 'NOT_PUBLISHED', bars: 24, before: 0 },
    { name: 'one-warmup-bar-short', start: s + 299*h, end: s + 323*h, warmup: 300, state: 'NOT_PUBLISHED', bars: 24, before: 299 },
    { name: 'exact-earliest-warmup', start: s + 300*h, end: s + 324*h, warmup: 300, state: 'AVAILABLE', bars: 24, before: 300 },
    { name: 'left-outside-index', start: s - h, end: s + 24*h, warmup: 300, state: 'NOT_PUBLISHED', bars: null, before: null },
    { name: 'right-outside-index', start: e - h, end: e + h, warmup: 300, state: 'NOT_PUBLISHED', bars: null, before: null },
    { name: 'july-august-retained-window', start: 1782864000000, end: 1788220800000, warmup: 0, state: 'AVAILABLE', bars: 1488, before: 0 },
  ];
}
const WORKSPACE = 'ws_06GE6XY0SKNPFS7TP8WCE938Z5';
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function pathFor({ start, end, warmup }, symbol = 'BTCUSDT', dataset = 'crypto-binance-1m', workspace = WORKSPACE, timeframe = '1h') {
  return `/api/v1/research/datasets/${dataset}/bar-metadata?${new URLSearchParams({
    workspace_id: workspace, symbol, timeframe, start_utc_ms: String(start),
    end_exclusive_utc_ms: String(end), warmup_bars: String(warmup),
  })}`;
}

export async function sourceRemediationReceipt(home = DEFAULT_HOME) {
  home = validateHome(home);
  const saved = loadSessions(home).identities.find(row => row.username === 'p23-owner');
  assert(saved?.id && saved.password, 'EXISTING_OWNED_OWNER_REQUIRED');
  const user = { ...saved, cookies: {} }, client = makeClient(user);
  const receipt = { schema_version: 'research.b8-source-remediation-owned-api.v1',
    project: PROJECT, base_url: BASE_URL, scope: 'INDEX_METADATA_ONLY_NOT_PREFLIGHT_ADMISSION',
    at_utc: new Date().toISOString(), workspace_id: WORKSPACE, source_index: INDEX,
    image_id: docker(['inspect', '--format', '{{.Image}}', container('control-api')]).trim(),
    portal_api_image_id: docker(['inspect', '--format', '{{.Image}}', container('portal-api')]).trim(),
    catalog: null, cases: [], negative_cases: [], passed: false };
  let authenticated = false;
  try {
    await client.call('POST', '/api/auth/login', { username: user.username, credential: user.password }, [201]);
    authenticated = true;
    const context = (await client.call('GET', '/api/auth/context')).body;
    assert.equal(context.state, 'AUTHENTICATED'); assert.equal(context.principal.principalId, saved.id);
    receipt.catalog = await client.call('GET', `/api/v1/research/datasets/catalog-v2?workspace_id=${WORKSPACE}`);
    const dataset = receipt.catalog.body.datasets.find(row => row.dataset_id === 'crypto-binance-1m');
    assert(dataset, 'PINNED_FUTURES_INDEX_REQUIRED');
    const symbol = dataset.symbols.items.find(row => row.symbol === 'BTCUSDT');
    assert(symbol, 'INDEXED_BTCUSDT_REQUIRED');
    const coverage = symbol.coverage_by_timeframe.find(row => row.timeframe === '1h');
    assert.equal(coverage.bar_count, INDEX.bars); assert.equal(coverage.gap_count, 0);
    assert.equal(coverage.first_bar_utc_ms, INDEX.start); assert.equal(coverage.last_closed_bar_end_utc_ms, INDEX.end);
    for (const sample of metadataCases()) {
      const response = await client.call('GET', pathFor(sample)), body = response.body;
      assert.equal(body.availability, sample.state, sample.name);
      assert.equal(body.bars, sample.bars, sample.name);
      assert.equal(body.warmup_bars_available_before_start, sample.before, sample.name);
      assert.deepEqual(body.verified_range, { start_utc_ms: INDEX.start, end_exclusive_utc_ms: INDEX.end,
        basis: 'INDEXED_TARGET_BAR_RANGE_V1' });
      assert.equal(body.earliest_start_with_warmup_utc_ms, INDEX.start + sample.warmup*INDEX.step);
      if (sample.bars === null) {
        assert.equal(body.first_bar_utc_ms, null); assert.equal(body.last_bar_utc_ms, null);
      } else {
        assert.equal(body.first_bar_utc_ms, sample.start); assert.equal(body.last_bar_utc_ms, sample.end - INDEX.step);
      }
      assert.equal('may_create_run' in body, false, 'METADATA_IS_NOT_ADMISSION');
      receipt.cases.push({ name: sample.name, expected: sample, response, response_digest: sha(body) });
    }
    const unknown = await client.call('GET', pathFor(metadataCases()[0], 'NOTLISTED'));
    assert.equal(unknown.body.availability, 'NOT_PUBLISHED');
    assert.equal(unknown.body.reason_code, 'HMD_SYMBOL_INTERVAL_NOT_INDEXED');
    assert.equal(unknown.body.verified_range, null); assert.equal(unknown.body.earliest_start_with_warmup_utc_ms, null);
    receipt.negative_cases.push({ name: 'unindexed-symbol', response: unknown });
    for (const [name, path, status, code] of [
      ['misaligned-hour-bound', pathFor({ start: 1782864000001, end: 1788220800000, warmup: 0 }), 400, 'WINDOW_BOUND_NOT_ALIGNED'],
      ['warmup-over-bound', pathFor({ ...metadataCases()[0], warmup: 100001 }), 400, 'RESEARCH_PREFLIGHT_INVALID'],
      ['foreign-workspace', pathFor(metadataCases()[0], 'BTCUSDT', 'crypto-binance-1m', 'ws_not_member'), 404, 'RESEARCH_PREFLIGHT_NOT_FOUND'],
      ['unqualified-vn-source-utc', pathFor({ start: 1785715200000, end: 1786406400000, warmup: 0 }, 'FPT', 'vn-stock-daily', WORKSPACE, '1d'), 404, 'RESEARCH_PREFLIGHT_NOT_FOUND'],
      ['vn-local-midnight-alignment', pathFor({ start: 1785690000000, end: 1786381200000, warmup: 0 }, 'FPT', 'vn-stock-daily', WORKSPACE, '1d'), 400, 'WINDOW_BOUND_NOT_ALIGNED'],
    ]) {
      const response = await client.call('GET', path, undefined, [status]);
      assert.equal(response.body.error.code, code, name);
      receipt.negative_cases.push({ name, response });
    }
    assert(!receipt.catalog.body.datasets.some(row => row.dataset_id === 'vn-stock-daily'));
    receipt.vn_daily = { state: 'NOT_QUALIFIED', reader_proof_does_not_grant_admission: true,
      missing: ['AUTHORITATIVE_SESSION_CALENDAR', 'TRADING_BAR_WARMUP_INDEX', 'INSTRUMENT_TERMS', 'DAILY_EXECUTION_PROFILE'] };
    receipt.passed = true;
    return receipt;
  } finally {
    if (authenticated) await client.call('POST', '/api/auth/logout', {}, [200, 201]);
    receipt.owner_session_revoked = authenticated;
    receipt.finished_at_utc = new Date().toISOString();
    savePrivate(join(home, 'b8-source-remediation-receipt.json'), receipt);
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const home = process.argv.find(arg => arg.startsWith('--home='))?.slice(7) ?? DEFAULT_HOME;
  sourceRemediationReceipt(home).then(receipt => {
    console.log(`Owned metadata ${receipt.cases.length}+${receipt.negative_cases.length} checks PASS; ${sha(receipt)}`);
  }).catch(error => { console.error('Owned source remediation refused:', error.message); process.exitCode = 1; });
}
