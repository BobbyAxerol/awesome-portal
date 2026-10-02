import assert from 'node:assert/strict';
import test from 'node:test';
import { assertVnPreflight, VN_PROFILE, vnFixedRequestedSpec } from './vn-fixed-product-receipt.mjs';

const binding = { alpha_id: 'delta-rsi-polynomial-alpha', alpha_version_id: 'av_p04' };
const release = { release_id: 'er_quantbt_111', config_digest: 'a'.repeat(64) };
test('operator preset binds only FPT daily fixed with explicit source offset and unchanged AV', () => {
  const spec = vnFixedRequestedSpec(binding, release);
  assert.deepEqual(spec.data, { dataset_id: 'vn-stock-daily', symbol: 'FPT', timeframe: '1d' });
  assert.deepEqual(spec.alpha_binding, { alpha_id: binding.alpha_id, alpha_version_id: binding.alpha_version_id });
  assert.equal(spec.optuna_trials, 1); assert.equal(spec.random_seed, null);
  assert.equal(spec.protocol, 'three_window_decay'); assert.equal(spec.optimization_schedule, 'global');
  assert.equal(Date.parse(spec.windows.is.start), Date.parse('2025-03-31T17:00:00Z'));
  assert.equal(spec.windows.is.end_exclusive, spec.windows.oos.start);
  assert.equal(spec.windows.oos.end_exclusive, spec.windows.holdout.start);
  assert.throws(() => vnFixedRequestedSpec(binding, release, 'wfo'));
  assert.equal(VN_PROFILE.digest.length, 64);
});
test('receipt does not call unknown session quality PASS or accept 299 calendar warmup', () => {
  const spec = vnFixedRequestedSpec(binding, release);
  const snapshot = { timezone: 'Asia/Ho_Chi_Minh', calendar_policy: 'OBSERVED_DATES_SESSION_CALENDAR_NOT_PUBLISHED',
    warmup: { bars: 300, requested_bars: 300 },
    query: { start_utc_ms: Date.parse('2024-01-01T17:00:00Z') },
    logical_range: { start_utc_ms: Date.parse(spec.windows.is.start), end_exclusive_utc_ms: Date.parse(spec.windows.holdout.end_exclusive) },
    quality: { passed: true, duplicates: 0, state: 'OBSERVED_TAPE_INTEGRITY_ONLY', gaps: null, gap_ratio: null, missing_bar_count: null },
    source_manifest_digest: 'a'.repeat(64),
    provenance: { clock_basis: 'OBSERVED_SOURCE_LOCAL_DATE_V1', source_timezone: 'Asia/Ho_Chi_Minh',
      warmup_semantics: 'LAST_N_OBSERVED_PREDECESSORS_V1', metadata_index_revision: 'b'.repeat(64),
      metadata_index_source_manifest_digest: 'a'.repeat(64) }, gap_scan: { state: 'NOT_PUBLISHED' } };
  assertVnPreflight({ may_create_run: true, snapshot }, spec);
  for (const altered of [
    { ...snapshot, calendar_policy: 'CRYPTO_24_7' },
    { ...snapshot, warmup: { bars: 299, requested_bars: 300 } },
    { ...snapshot, gap_scan: { state: 'SCANNED' } },
    { ...snapshot, query: { start_utc_ms: Date.parse('2024-01-02T00:00:00Z') } },
    { ...snapshot, quality: { ...snapshot.quality, gaps: 0 } },
    { ...snapshot, provenance: { ...snapshot.provenance, clock_basis: 'CRYPTO_UTC_BARS' } },
  ]) assert.throws(() => assertVnPreflight({ may_create_run: true, snapshot: altered }, spec));
});
