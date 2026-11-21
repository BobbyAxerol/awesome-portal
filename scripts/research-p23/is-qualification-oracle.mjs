/** Independent, read-only raw-IS numerical oracle. No engine/metric imports or runtime calls. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export const IS_ORACLE_LIMITS = Object.freeze({ rows: 20_000, bytes: 2 * 1024 * 1024,
  lineBytes: 8192, metadataBytes: 2048, curvePoints: 24, tolerance: 1e-12 });
const DAY_MS = 86_400_000;
const DIGEST = /^[0-9a-f]{64}$/;
const FLOAT_REPR = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:e[+-]?[0-9]+)?$/;
const DECIMAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
const IS_DEFINITION = 'B9_FULL_DECLARED_IS_ACCOUNT_AND_DAILY_DISTRIBUTION_V1';
const IS_LOCATOR = "quantbt==1.1.1:scoped_result(scope='test',fold_table=[declared_IS.start,last_actual_IS_bar_before_end_exclusive])";
const POLICY = Object.freeze({ quantile_method: 'LINEAR_TYPE_7', probability: '0.95',
  risk_variable: 'LOSS_FRACTION_NEGATIVE_RETURN', risk_sign: 'SIGNED_LOSS_FRACTION',
  tail: 'LOSS_GTE_VAR_INCLUSIVE', minimum_observations: 2 });

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function keys(value, expected, label) {
  assert(value && typeof value === 'object' && !Array.isArray(value), label);
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), label);
}
function utc(value, label) { assert(Number.isSafeInteger(value) && value >= 0, label); return value; }
function id(value, label) { assert(typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(value), label); }
function locator(value) { return typeof value === 'string' && /^[\x20-\x7e]{1,256}$/.test(value); }
function same(actual, expected, label) { assert.deepEqual(actual, expected, label); }
/** Python's ensure_ascii=True; the exact header contains no binary64 values. */
export function canonicalIsJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalIsJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort()
    .map(key => `${canonicalIsJson(key)}:${canonicalIsJson(value[key])}`).join(',')}}`;
  assert(value === null || typeof value === 'string' || typeof value === 'boolean'
    || Number.isSafeInteger(value), 'CANONICAL_HEADER_PRIMITIVE_REQUIRED');
  return JSON.stringify(value).replace(/[\u007f-\uffff]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
}
function rawFloat(value, label) {
  assert(typeof value === 'string' && value.length <= 96, label);
  assert(FLOAT_REPR.test(value), label);
  const numeric = Number(value); assert(Number.isFinite(numeric), label); return numeric;
}
function decimal(value, label) {
  assert(typeof value === 'string' && value.length <= 96 && DECIMAL.test(value), label);
  const numeric = Number(value); assert(Number.isFinite(numeric), label); return numeric;
}
function near(actual, expected, label) {
  assert(Number.isFinite(expected) && Math.abs(decimal(actual, label) - expected) <= IS_ORACLE_LIMITS.tolerance, label);
}
function normalizedWindows(value) {
  keys(value, ['is', 'oos', 'holdout'], 'EXACT_DECLARED_SOURCE_WINDOWS_REQUIRED');
  for (const [name, row] of Object.entries(value)) {
    keys(row, ['start_ms', 'end_ms', 'source_locator'], `EXACT_${name}_WINDOW_REQUIRED`);
    assert(utc(row.start_ms, 'WINDOW_START') < utc(row.end_ms, 'WINDOW_END'), 'HALF_OPEN_WINDOW_REQUIRED');
    assert(locator(row.source_locator), 'WINDOW_SOURCE_LOCATOR_REQUIRED');
  }
  assert(value.is.end_ms === value.oos.start_ms && value.oos.end_ms === value.holdout.start_ms, 'IS_OOS_HOLDOUT_BOUNDARY_MISMATCH');
  return value;
}

/** Verify three independent hash domains without converting the original row strings. */
export function verifyIsWitness({ witnessBytes, metadata, expectedBinding, expectedWindows,
  expectedSymbols, expectedPositionColumns, expectedBenchmarkLocator }) {
  assert(Buffer.isBuffer(witnessBytes) || witnessBytes instanceof Uint8Array, 'RAW_WITNESS_BYTES_REQUIRED');
  const bytes = Buffer.from(witnessBytes);
  assert(bytes.length > 0 && bytes.length <= IS_ORACLE_LIMITS.bytes, 'RAW_WITNESS_BYTE_CAP');
  assert(Buffer.byteLength(canonicalIsJson(metadata)) < IS_ORACLE_LIMITS.metadataBytes, 'SOURCE_METADATA_BYTE_CAP');
  keys(metadata, ['schema_version', 'state', 'reason_code', 'file_name', 'file_sha256', 'byte_count',
    'normalized_rows_sha256', 'observation_is_digest', 'row_count', 'is_start_utc_ms', 'is_end_exclusive_utc_ms',
    'first_observed_utc_ms', 'last_observed_utc_ms', 'binding_sha256'], 'EXACT_SOURCE_METADATA_REQUIRED');
  same([metadata.schema_version, metadata.state, metadata.reason_code, metadata.file_name],
    ['research.is-qualification-source.v1', 'AVAILABLE', null, 'is-qualification.ndjson'], 'FULL_IS_SOURCE_METADATA_REQUIRED');
  for (const name of ['file_sha256', 'normalized_rows_sha256', 'observation_is_digest', 'binding_sha256']) assert(DIGEST.test(metadata[name]), 'SOURCE_DIGEST_REQUIRED');
  assert.equal(metadata.byte_count, bytes.length, 'SOURCE_BYTE_COUNT_MISMATCH');
  assert.equal(metadata.file_sha256, sha(bytes), 'SOURCE_FILE_BYTE_DIGEST_MISMATCH');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  assert(text.endsWith('\n') && !text.includes('\r'), 'EXACT_NDJSON_LF_REQUIRED');
  const lines = text.slice(0, -1).split('\n');
  assert(lines.length >= 3 && lines.length <= IS_ORACLE_LIMITS.rows + 1, 'FULL_IS_ROW_CAP');
  assert(lines.every(line => line.length > 0 && Buffer.byteLength(line) + 1 <= IS_ORACLE_LIMITS.lineBytes), 'NDJSON_LINE_CAP');
  const header = JSON.parse(lines[0]);
  keys(header, ['schema_version', 'binding', 'source_windows', 'observation_header'], 'EXACT_WITNESS_HEADER_REQUIRED');
  assert.equal(lines[0], canonicalIsJson(header), 'CANONICAL_WITNESS_HEADER_REQUIRED');
  assert.equal(header.schema_version, 'research.is-qualification-witness.v1', 'WITNESS_SCHEMA_REQUIRED');
  keys(header.binding, ['run_id', 'job_id', 'worker_attempt_id', 'lease_epoch'], 'EXACT_ATTEMPT_BINDING_REQUIRED');
  for (const name of ['run_id', 'job_id', 'worker_attempt_id']) id(header.binding[name], 'ATTEMPT_ID_REQUIRED');
  assert(Number.isSafeInteger(header.binding.lease_epoch) && header.binding.lease_epoch > 0, 'LEASE_EPOCH_REQUIRED');
  same(header.binding, expectedBinding, 'SOURCE_ATTEMPT_BINDING_MISMATCH');
  assert.equal(metadata.binding_sha256, sha(canonicalIsJson(header.binding)), 'SOURCE_BINDING_DIGEST_MISMATCH');
  normalizedWindows(header.source_windows); normalizedWindows(expectedWindows);
  same(header.source_windows, expectedWindows, 'IMMUTABLE_SOURCE_WINDOWS_MISMATCH');
  const observation = header.observation_header;
  keys(observation, ['definition', 'bounds', 'symbols', 'position_columns', 'benchmark_locator'], 'EXACT_OBSERVATION_HASH_HEADER_REQUIRED');
  same(observation.bounds, { ...expectedWindows.is, bounds_semantics: 'START_INCLUSIVE_END_EXCLUSIVE' }, 'NORMALIZED_IS_HASH_BOUNDS_MISMATCH');
  assert.equal(observation.definition, IS_DEFINITION, 'IS_DEFINITION_MISMATCH');
  assert(Array.isArray(expectedSymbols) && expectedSymbols.length === 1, 'EXACT_NATIVE_SINGLETON_REQUIRED');
  assert(expectedSymbols.every(symbol => typeof symbol === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/.test(symbol)), 'PRINTABLE_NATIVE_SYMBOL_REQUIRED');
  same(observation.symbols, expectedSymbols, 'NATIVE_SYMBOL_MISMATCH');
  same(observation.position_columns, expectedPositionColumns, 'NATIVE_POSITION_COLUMNS_MISMATCH');
  same(expectedPositionColumns, expectedSymbols.map(symbol => `Position_${symbol}`), 'PINNED_NATIVE_POSITION_PREFIX_REQUIRED');
  assert(locator(expectedBenchmarkLocator), 'BOUND_SOURCE_CLOSE_LOCATOR_REQUIRED');
  assert.equal(observation.benchmark_locator, expectedBenchmarkLocator, 'SOURCE_CLOSE_LOCATOR_MISMATCH');
  const observationHash = createHash('sha256').update(canonicalIsJson(observation));
  const normalizedHash = createHash('sha256').update('[');
  const rows = lines.slice(1).map((line, ordinal) => {
    const row = JSON.parse(line);
    assert(Array.isArray(row) && row.length === 5 && JSON.stringify(row) === line, 'EXACT_SOURCE_ROW_SERIALIZATION_REQUIRED');
    observationHash.update(line); normalizedHash.update(`${ordinal ? ',' : ''}${line}`);
    const [at, equity, returns, positions, close] = row;
    utc(at, 'SOURCE_UTC_MS_REQUIRED');
    assert(at >= expectedWindows.is.start_ms && at < expectedWindows.is.end_ms, 'SOURCE_ROW_OUTSIDE_DECLARED_IS');
    assert(Array.isArray(positions) && positions.length === observation.position_columns.length, 'NATIVE_POSITION_DIMENSION_MISMATCH');
    const account = rawFloat(equity, 'FINITE_SOURCE_EQUITY_REQUIRED'); assert(account > 0, 'POSITIVE_SOURCE_EQUITY_REQUIRED');
    return { at, equity: account, returns: rawFloat(returns, 'FINITE_SOURCE_RETURN_REQUIRED'),
      positions: positions.map(value => rawFloat(value, 'FINITE_SOURCE_POSITION_REQUIRED')),
      close: rawFloat(close, 'SOURCE_CLOSE_REPR_REQUIRED') };
  });
  normalizedHash.update(']');
  assert(rows.every((row, index) => index === 0 || row.at > rows[index - 1].at), 'UNIQUE_CHRONOLOGICAL_IS_ROWS_REQUIRED');
  assert(rows.every(row => row.close > 0), 'QUALIFIED_SOURCE_POSITIVE_CLOSE_REQUIRED');
  assert.equal(metadata.row_count, rows.length, 'SOURCE_ROW_COUNT_MISMATCH');
  same([metadata.is_start_utc_ms, metadata.is_end_exclusive_utc_ms, metadata.first_observed_utc_ms, metadata.last_observed_utc_ms],
    [expectedWindows.is.start_ms, expectedWindows.is.end_ms, rows[0].at, rows.at(-1).at], 'SOURCE_BOUNDS_MISMATCH');
  assert.equal(metadata.normalized_rows_sha256, normalizedHash.digest('hex'), 'NORMALIZED_ROW_ARRAY_DIGEST_MISMATCH');
  assert.equal(metadata.observation_is_digest, observationHash.digest('hex'), 'OBSERVATION_IS_DIGEST_MISMATCH');
  return { header, rows, metadata };
}

function mean(values) { return values.reduce((sum, value) => sum + value, 0) / values.length; }
function quantile(values, probability) {
  const sorted = [...values].sort((a, b) => a - b), at = (sorted.length - 1) * probability, low = Math.floor(at);
  return sorted[low] + (sorted[Math.min(low + 1, sorted.length - 1)] - sorted[low]) * (at - low);
}
function exactHistogramCounts(values) {
  const decimals = values.map(value => {
    const [mantissa, exponent = '0'] = String(value).split('e'), negative = mantissa.startsWith('-');
    const [whole, fraction = ''] = (negative ? mantissa.slice(1) : mantissa).split('.');
    return { integer: BigInt(`${negative ? '-' : ''}${whole}${fraction}`), scale: fraction.length - Number(exponent) };
  });
  const scale = Math.max(0, ...decimals.map(value => value.scale));
  const integers = decimals.map(value => value.integer * 10n ** BigInt(scale - value.scale));
  const low = integers.reduce((a, b) => a < b ? a : b), high = integers.reduce((a, b) => a > b ? a : b);
  const counts = Array(12).fill(0);
  for (const value of integers) {
    let bucket = 0;
    while (bucket < 11 && value * 12n >= low * BigInt(11 - bucket) + high * BigInt(bucket + 1)) bucket++;
    counts[bucket]++;
  }
  return counts;
}
function derive(rows) {
  const observed = new Map();
  for (const row of rows) observed.set(Math.floor(row.at / DAY_MS), row.equity);
  const observedCloses = [...observed.values()];
  // Primary QuantBT full_report array policy: no synthetic missing-day close.
  const engineDaily = observedCloses.slice(1).map((value, index) => (value - observedCloses[index]) / observedCloses[index]);
  const sample = engineDaily.length ? engineDaily : rows.map(row => row.returns);
  const deltas = rows.slice(1).map((row, index) => (row.at - rows[index].at) / 1000);
  const periods = observed.size >= 2 ? 365 : 365.25 * 86_400 / quantile(deltas, .5);
  const average = mean(sample), variance = sample.length < 2 ? NaN : mean(sample.map(value => (value - average) ** 2)) * sample.length / (sample.length - 1);
  const sharpe = sample.length < 2 ? { state: 'NOT_APPLICABLE', reason: 'P13_IS_RETURN_SAMPLE_BELOW_TWO' }
    : variance === 0 ? { state: 'NOT_APPLICABLE', reason: 'P13_IS_RETURN_ZERO_VARIANCE' }
    : { state: 'AVAILABLE', value: average / Math.sqrt(variance) * Math.sqrt(periods) };
  // BacktestResultV2.daily_returns: UTC-calendar resample.last().ffill(), then pct_change.
  const firstDay = Math.floor(rows[0].at / DAY_MS), lastDay = Math.floor(rows.at(-1).at / DAY_MS);
  assert(lastDay - firstDay <= 366, 'QUALIFICATION_CALENDAR_DAY_CAP');
  const daily = []; let previous;
  for (let day = firstDay; day <= lastDay; day++) {
    const close = observed.get(day) ?? previous;
    if (previous !== undefined) daily.push(close / previous - 1);
    previous = close;
  }
  let peak = rows[0].equity;
  const drawdowns = rows.map(row => { peak = Math.max(peak, row.equity); return row.equity / peak - 1; });
  const statistics = daily.length < 2 ? null : (() => {
    const losses = daily.map(value => -value), threshold = quantile(losses, .95);
    return { mean: mean(daily), median: quantile(daily, .5), var_95: threshold,
      cvar_95: mean(losses.filter(value => value >= threshold)) };
  })();
  return { daily, engineDaily, sample, periods, sharpe, drawdowns, statistics,
    endpoint: rows.at(-1).equity / rows[0].equity - 1, maxDrawdown: Math.min(...drawdowns) };
}
function availableFact(fact, value, digest, origin, locator, label) {
  assert(fact, label); same([fact.state, fact.reason_code, fact.scope, fact.origin, fact.input_digest, fact.source_locator],
    ['AVAILABLE', null, 'IS', origin, digest, locator], `${label}_PROVENANCE`);
  near(fact.value, value, label);
}
function absentFact(fact, reason, digest, origin, label) {
  assert(fact, label); same([fact.state, fact.reason_code, fact.value, fact.scope, fact.origin, fact.input_digest],
    ['NOT_APPLICABLE', reason, null, 'IS', origin, digest], `${label}_TYPED_ABSENCE`);
  assert(typeof fact.source_locator === 'string' && fact.source_locator.includes('DECLARED_IS'), `${label}_LOCATOR`);
}
function apiBlock(value, label) {
  const body = value?.body ?? value;
  assert(body?.enriched_analysis && Buffer.byteLength(JSON.stringify(body)) <= 2 * 1024 * 1024, `${label}_NAMED_ENRICHMENT_REQUIRED`);
  if (value?.status !== undefined) assert.equal(value.status, 200, `${label}_HTTP_200_REQUIRED`);
  return body.enriched_analysis;
}
function verifyCurves(payload, rows, expected) {
  const curves = payload.curves, byAt = new Map(rows.map((row, index) => [row.at, index]));
  same([curves.sampling.source_observation_count, curves.sampling.emitted_point_count, curves.sampling.method],
    [rows.length, curves.strategy_rebased_100.length, 'EXTREMA_BUCKET_V1'], 'IS_CURVE_SAMPLING_MISMATCH');
  const closeValid = rows.every(row => Number.isFinite(row.close) && row.close > 0);
  for (const key of ['strategy_rebased_100', 'benchmark_rebased_100', 'drawdown_fraction']) {
    const curve = curves[key]; assert(Array.isArray(curve) && curve.length <= IS_ORACLE_LIMITS.curvePoints, 'BOUNDED_IS_CURVE_REQUIRED');
    if (key === 'benchmark_rebased_100' && !closeValid) { assert.equal(curve.length, 0, 'INVALID_CLOSE_HAS_NO_BENCHMARK'); continue; }
    assert(curve.length >= 2 && curve.length <= rows.length, 'IS_CURVE_POPULATION_REQUIRED');
    same([curve[0].at_utc_ms, curve.at(-1).at_utc_ms], [rows[0].at, rows.at(-1).at], 'IS_CURVE_ENDPOINT_MISMATCH');
    for (const [ordinal, point] of curve.entries()) {
      const index = byAt.get(point.at_utc_ms); assert(index !== undefined && (ordinal === 0 || point.at_utc_ms > curve[ordinal - 1].at_utc_ms), 'IS_CURVE_SOURCE_TIME_REQUIRED');
      const value = key === 'drawdown_fraction' ? expected.drawdowns[index]
        : key === 'strategy_rebased_100' ? rows[index].equity / rows[0].equity * 100 : rows[index].close / rows[0].close * 100;
      near(point.value, value, `${key}_RAW_SOURCE_ORACLE`);
    }
  }
  return closeValid;
}

function verifyPayload(block, witness, expected) {
  const { header, rows, metadata } = witness, payload = block.by_window?.is, digest = block.input_digest;
  assert(DIGEST.test(digest) && block.run_id === header.binding.run_id && block.lane === 'FIXED', 'NAMED_SOURCE_RUN_BINDING_MISMATCH');
  assert(payload?.state === 'AVAILABLE' && payload.reason_code === null && payload.basis === 'ALL_TIME', 'AVAILABLE_FULL_IS_PAYLOAD_REQUIRED');
  const scope = payload.scope, bounds = header.observation_header.bounds;
  same([scope.window, scope.coverage, scope.source_table, scope.locator, scope.observation_count,
    scope.first_at_utc_ms, scope.last_at_utc_ms], ['IS', 'FULL_SOURCE_IS', 'OBSERVATION_IS', IS_LOCATOR, rows.length, rows[0].at, rows.at(-1).at], 'IS_SOURCE_SCOPE_MISMATCH');
  for (const key of Object.keys(bounds)) same(scope[key], bounds[key], 'IS_DECLARED_SCOPE_BOUND_MISMATCH');
  assert(Array.isArray(block.source_tables) && block.source_tables.length <= 8, 'BOUNDED_SOURCE_TABLES_REQUIRED');
  const inputs = block.source_tables.filter(table => table.name === 'OBSERVATION_IS');
  assert.equal(inputs.length, 1, 'EXACT_OBSERVATION_IS_TABLE_REQUIRED');
  same(inputs[0], { name: 'OBSERVATION_IS', row_count: rows.length, digest: metadata.observation_is_digest }, 'IS_RAW_SOURCE_TABLE_DIGEST_MISMATCH');
  const basis = payload.return_basis;
  same([basis.definition_id, basis.source_locator, basis.first_at_utc_ms, basis.last_at_utc_ms],
    ['FIRST_LAST_DECLARED_IS_EQUITY_V1', IS_LOCATOR, rows[0].at, rows.at(-1).at], 'IS_ENDPOINT_BASIS_MISMATCH');
  near(basis.start_equity, rows[0].equity, 'IS_START_EQUITY'); near(basis.end_equity, rows.at(-1).equity, 'IS_END_EQUITY');
  const metrics = payload.facts.metrics;
  availableFact(metrics.return_fraction, expected.endpoint, digest, 'PORTAL_DERIVED', 'QuantBT.result.equity:DECLARED_IS:first_last_ratio_minus_one', 'IS_ENDPOINT_RETURN');
  availableFact(metrics.max_drawdown_fraction, expected.maxDrawdown, digest, 'ENGINE_DIRECT', 'quantbt.metrics.performance.full_report.max_drawdown_pct:-/100:DECLARED_IS', 'IS_MAX_DRAWDOWN');
  if (expected.sharpe.state === 'AVAILABLE') availableFact(metrics.sharpe, expected.sharpe.value, digest, 'ENGINE_DIRECT',
    'quantbt.metrics.performance.full_report(trading_days=365).sharpe:DECLARED_IS', 'IS_QUANTBT_SHARPE');
  else absentFact(metrics.sharpe, expected.sharpe.reason, digest, 'ENGINE_DIRECT', 'IS_QUANTBT_SHARPE');
  const closeValid = verifyCurves(payload, rows, expected), benchmark = payload.benchmark;
  const sourceLocator = header.observation_header.benchmark_locator;
  same([benchmark.state, benchmark.reason_code, benchmark.input_digest, benchmark.definition_id, benchmark.source_locator],
    [closeValid ? 'AVAILABLE' : 'NOT_PUBLISHED', closeValid ? null : 'IS_SOURCE_ALIGNED_POSITIVE_CLOSE_NOT_PUBLISHED', digest,
      'DECLARED_IS_SOURCE_CLOSE_REBASED_100_V1', sourceLocator.endsWith(':OOS') ? `${sourceLocator.slice(0, -4)}:IS`
        : 'enriched_analysis.scope.benchmark_locator:loaded_close:DECLARED_IS'], 'IS_BENCHMARK_PROVENANCE_MISMATCH');
  const histogram = payload.return_distribution;
  same([histogram.origin, histogram.sampling, histogram.bucket_basis, histogram.observation_count],
    ['PORTAL_DERIVED', 'UTC_DAY', 'ALL_TIME_SOURCE_UTC_DAILY_RETURNS_12_BIN_V1', expected.daily.length], 'IS_DAILY_SAMPLE_MISMATCH');
  same(histogram.statistics_policy, POLICY, 'IS_SIGNED_LOSS_TYPE7_POLICY_MISMATCH');
  const definitions = { mean: 'arithmetic_mean_return', median: 'return_type7_p0.5', var_95: 'signed_loss_type7_p0.95', cvar_95: 'mean_signed_loss_gte_var_inclusive' };
  for (const [key, definition] of Object.entries(definitions)) {
    if (expected.statistics) availableFact(histogram[key], expected.statistics[key], digest, 'PORTAL_DERIVED',
      `scoped.daily_returns:ALL_TIME_UTC_DAY:${definition}:DECLARED_IS`, `IS_${key.toUpperCase()}`);
    else absentFact(histogram[key], 'PORTAL_DAILY_RETURN_STATISTICS_TOO_FEW_OBSERVATIONS', digest, 'PORTAL_DERIVED', `IS_${key.toUpperCase()}`);
  }
  const nonconstant = expected.daily.length >= 2 && Math.min(...expected.daily) !== Math.max(...expected.daily);
  same([histogram.state, histogram.reason_code], nonconstant ? ['AVAILABLE', null] : ['NOT_APPLICABLE', expected.daily.length < 2
    ? 'PORTAL_DAILY_RETURN_DISTRIBUTION_TOO_FEW_OBSERVATIONS' : 'PORTAL_DAILY_RETURN_DISTRIBUTION_ZERO_VARIANCE'], 'IS_HISTOGRAM_AVAILABILITY_MISMATCH');
  assert(Array.isArray(histogram.buckets) && histogram.buckets.length === (nonconstant ? 12 : 0), 'IS_HISTOGRAM_BUCKET_COUNT');
  if (nonconstant) {
    const lo = Math.min(...expected.daily), hi = Math.max(...expected.daily);
    const edges = Array.from({ length: 13 }, (_, index) => (lo * (12 - index) + hi * index) / 12);
    // Exact decimal cross-products for inclusive lower/exclusive upper
    // counts, independently of the published (48-digit rounded) edges.
    const counts = exactHistogramCounts(expected.daily);
    histogram.buckets.forEach((row, index) => {
      near(row.lower_inclusive, edges[index], 'IS_HISTOGRAM_LOWER_EDGE'); near(row.upper, edges[index + 1], 'IS_HISTOGRAM_UPPER_EDGE');
      same([row.count, row.upper_inclusive], [counts[index], index === 11 ? 'true' : 'false'], 'IS_HISTOGRAM_EXACT_COUNTS');
    });
    assert.equal(histogram.buckets.reduce((sum, row) => sum + row.count, 0), expected.daily.length, 'IS_HISTOGRAM_FULL_POPULATION');
  }
  verifyOosScope(block, header.source_windows, rows.at(-1).at);
}
function verifyOosScope(block, windows, lastIsAt) {
  assert(block.scope?.window === 'OOS' && block.scope.coverage === 'FULL_RETAINED_OOS', 'SEPARATE_FULL_OOS_SCOPE_REQUIRED');
  assert(block.scope.first_at_utc_ms >= windows.oos.start_ms && block.scope.first_at_utc_ms > lastIsAt
    && block.scope.last_at_utc_ms >= block.scope.first_at_utc_ms && block.scope.last_at_utc_ms < windows.oos.end_ms, 'OOS_SCOPE_BOUNDARY_MISMATCH');
  for (const kind of ['is', 'oos', 'holdout']) {
    const head = block.windows[kind];
    same([head.start_ms, head.end_ms, head.source_locator, head.bounds_semantics],
      [windows[kind].start_ms, windows[kind].end_ms, windows[kind].source_locator, 'START_INCLUSIVE_END_EXCLUSIVE'], 'API_DECLARED_WINDOWS_MISMATCH');
    assert.equal(head.state, kind === 'holdout' ? 'NOT_PUBLISHED' : 'AVAILABLE', 'NO_HOLDOUT_ACCOUNT_PAYLOAD');
  }
  const oosTables = block.source_tables.filter(table => table.name === 'OBSERVATION');
  assert.equal(oosTables.length, 1, 'SEPARATE_OOS_SOURCE_TABLE_REQUIRED');
  assert(DIGEST.test(oosTables[0].digest) && oosTables[0].row_count === block.scope.observation_count, 'OOS_SOURCE_COUNT_BINDING_MISMATCH');
  for (const curve of [block.curves?.strategy_rebased_100, block.curves?.benchmark_rebased_100, block.curves?.drawdown_fraction, block.library_summary?.sparkline]) {
    assert(Array.isArray(curve) && curve.length <= 64, 'BOUNDED_OOS_CURVE_REQUIRED');
    assert(curve.every(point => point.at_utc_ms >= windows.oos.start_ms && point.at_utc_ms < windows.oos.end_ms), 'IS_OR_HOLDOUT_MUST_NOT_ENTER_OOS_CURVE');
  }
}
/** Optional independent previous OOS projection: composite digest may change, numbers/locators may not. */
function withoutDigest(value) {
  if (Array.isArray(value)) return value.map(withoutDigest);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== 'input_digest').map(([key, entry]) => [key, withoutDigest(entry)]));
  return value;
}
export function verifyIsQualification(input) {
  if (input.metadata?.state === 'NOT_PUBLISHED') {
    const source = input.metadata;
    keys(source, ['schema_version', 'state', 'reason_code', 'binding_sha256', 'is_start_utc_ms', 'is_end_exclusive_utc_ms'], 'EXACT_SOURCE_ABSENCE_REQUIRED');
    assert.equal(source.schema_version, 'research.is-qualification-source.v1', 'SOURCE_ABSENCE_SCHEMA');
    assert(['IS_QUALIFICATION_SOURCE_UNAVAILABLE', 'IS_QUALIFICATION_SOURCE_INVALID', 'IS_QUALIFICATION_DECLARED_WINDOWS_UNAVAILABLE',
      'IS_QUALIFICATION_NOT_FIXED', 'IS_QUALIFICATION_SAMPLED_SOURCE', 'IS_QUALIFICATION_ROW_LIMIT_EXCEEDED',
      'IS_QUALIFICATION_FILE_LIMIT_EXCEEDED', 'IS_QUALIFICATION_MARKET_CLOSE_UNAVAILABLE'].includes(source.reason_code), 'CLOSED_SOURCE_ABSENCE_REASON');
    assert(!input.witnessBytes || input.witnessBytes.length === 0, 'SOURCE_ABSENCE_CANNOT_CARRY_RAW_ROWS');
    assert.equal(source.binding_sha256, sha(canonicalIsJson(input.expectedBinding)), 'SOURCE_ABSENCE_BINDING_MISMATCH');
    same([source.is_start_utc_ms, source.is_end_exclusive_utc_ms],
      [input.expectedWindows?.is?.start_ms ?? null, input.expectedWindows?.is?.end_ms ?? null], 'SOURCE_ABSENCE_BOUNDARY_MISMATCH');
    const hub = apiBlock(input.hub, 'HUB'), report = apiBlock(input.report, 'REPORT');
    same(report, hub, 'HUB_REPORT_SAME_SUPPLEMENT_REQUIRED');
    assert.equal(hub.run_id, input.expectedBinding.run_id, 'SOURCE_ABSENCE_RUN_MISMATCH');
    if (source.reason_code === 'IS_QUALIFICATION_MARKET_CLOSE_UNAVAILABLE') {
      same([hub.by_window?.is?.benchmark?.state, hub.by_window?.is?.benchmark?.reason_code,
        hub.by_window?.is?.curves?.benchmark_rebased_100], ['NOT_PUBLISHED', 'IS_SOURCE_ALIGNED_POSITIVE_CLOSE_NOT_PUBLISHED', []],
      'INVALID_CLOSE_TYPED_API_ABSENCE_REQUIRED');
    }
    return { schema_version: 'research.is-qualification-oracle.v1', passed: false, state: 'NOT_PUBLISHED',
      reason_code: source.reason_code, run_id: input.expectedBinding.run_id, binding_sha256: source.binding_sha256,
      numerical_proof: 'NOT_PERFORMED_WITHOUT_FULL_RAW_IS_WITNESS' };
  }
  const witness = verifyIsWitness(input), expected = derive(witness.rows);
  const hub = apiBlock(input.hub, 'HUB'), report = apiBlock(input.report, 'REPORT');
  same(report, hub, 'HUB_REPORT_SAME_SUPPLEMENT_REQUIRED');
  verifyPayload(hub, witness, expected);
  if (input.oosBaseline) {
    const before = input.oosBaseline.enriched_analysis ?? input.oosBaseline;
    for (const key of ['scope', 'facts', 'curves', 'monthly_returns', 'return_distribution', 'drawdown_episodes', 'library_summary', 'rolling']) {
      same(withoutDigest(hub[key]), withoutDigest(before[key]), 'EXISTING_OOS_BEHAVIOR_MUST_NOT_CHANGE');
    }
    same(hub.source_tables.find(row => row.name === 'OBSERVATION'), before.source_tables.find(row => row.name === 'OBSERVATION'), 'ORIGINAL_OOS_INPUT_DIGEST_MUST_NOT_CHANGE');
  }
  return { schema_version: 'research.is-qualification-oracle.v1', passed: true,
    run_id: witness.header.binding.run_id, file_sha256: witness.metadata.file_sha256,
    normalized_rows_sha256: witness.metadata.normalized_rows_sha256,
    observation_is_digest: witness.metadata.observation_is_digest,
    source_rows: witness.rows.length, first_observed_utc_ms: witness.rows[0].at, last_observed_utc_ms: witness.rows.at(-1).at,
    engine_sample_kind: expected.engineDaily.length ? 'OBSERVED_UTC_DAY_EQUITY' : 'NATIVE_BAR_RETURNS',
    engine_sample_count: expected.sample.length, annualization_periods: expected.periods,
    calendar_daily_return_count: expected.daily.length, benchmark_available: witness.rows.every(row => Number.isFinite(row.close) && row.close > 0),
    numerical_tolerance: '0.000000000001', oos_baseline_compared: Boolean(input.oosBaseline) };
}
