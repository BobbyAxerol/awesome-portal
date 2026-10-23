import { createHash } from 'node:crypto';

// Development fixture producer. Input is a NAV fixture, never a live response.
// All four views share one zero-external-flow synthetic book and exact closing NAV.
const SCALE = 10n ** 18n;
const hash = value => `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
const quality = () => ({ completeness: 'COMPLETE', freshness: 'FRESH', reasons: [] });
function amount(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)(\.\d{1,18})?$/.test(value)) throw Error('Positive NAV decimal required');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(18, '0'));
}
function decimal(value) {
  const sign = value < 0n ? '-' : '';
  const digits = (value < 0n ? -value : value).toString().padStart(19, '0');
  return `${sign}${digits.slice(0, -18)}.${digits.slice(-18)}`.replace(/\.?0+$/, '') || '0';
}

/** Returns four existing ManagerSeries DTOs; schema and consumer stay unchanged.
 * Carry the fixture lane at the BFF boundary. Positive data can be AVAILABLE /
 * VERIFIED in this scenario, independently of the real source's readiness.
 */
export function buildPositiveManagerSeries({ lane, nav, pointCount = 240 }) {
  if (lane !== 'FIXTURE_LAB') throw Error('Explicit fixture lane required');
  if (!Number.isSafeInteger(pointCount) || pointCount < 3 || pointCount > 1440) throw Error('Fixture point count must be 3..1440');
  if (nav?.metric !== 'NAV' || !Array.isArray(nav.series) || nav.series.length < 1 || nav.series.length > 4) throw Error('NAV fixture subjects required');
  const identities = new Set();
  const walks = nav.series.map(entry => {
    const identity = JSON.stringify(entry.subject);
    if (identities.has(identity)) throw Error('Duplicate fixture subject');
    identities.add(identity);
    if (entry.state !== 'AVAILABLE' || !entry.points?.length || !entry.window || !entry.partition) throw Error('Choose a populated NAV fixture');
    const { from_ms: start, to_ms: end } = entry.window;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end - start < pointCount) throw Error('Fixture window is too small');
    const first = amount(entry.points[0].value);
    const last = amount(entry.points.at(-1).value);
    if (first <= 0n || last <= 0n) throw Error('NAV endpoints must be positive');
    let peak = first;
    return Array.from({ length: pointCount }, (_, index) => {
      const trend = first + (last - first) * BigInt(index) / BigInt(pointCount - 1);
      const wave = index === 0 || index === pointCount - 1 ? 0n : (first < last ? first : last) * BigInt(index % 17 - 8) / 1000n;
      const value = trend + wave;
      if (value > peak) peak = value;
      return { ts_ms: start + Number(BigInt(index) * BigInt((end - 1) - start) / BigInt(pointCount - 1)),
        NAV: decimal(value), NET_PNL: decimal(value - first),
        RETURN: decimal((value - first) * SCALE / first), DRAWDOWN: decimal((value - peak) * SCALE / peak) };
    });
  });
  const result = {};
  for (const metric of ['NAV', 'NET_PNL', 'RETURN', 'DRAWDOWN']) {
    const body = structuredClone(nav);
    const ratio = metric === 'RETURN' || metric === 'DRAWDOWN';
    body.metric = metric;
    body.quality = quality();
    body.series_source = { state: 'PUBLISHED', reason_code: null };
    body.series = body.series.map((entry, index) => ({ ...entry, state: 'AVAILABLE', reason_code: null,
      unit: ratio ? 'RATIO' : 'MONEY', currency: ratio ? null : entry.partition.currency,
      ratio_scale: ratio ? 'FRACTION' : null,
      methodology_ref: `FIXTURE_LAB:zero-external-flow:${metric}:v1`,
      points: walks[index].map(point => ({ ts_ms: point.ts_ms, value: point[metric] })), gaps: [],
      quality: quality(), source_confidence: 'VERIFIED',
      provenance_refs: [hash(['FIXTURE_LAB', entry.subject, entry.partition, entry.window, walks[index]])],
      calculation_revision: 'FIXTURE_LAB:positive-series.v1', policy_revision: 'FIXTURE_LAB:review-scenario.v1' }));
    const first = body.series[0];
    const common = entry => ({ economic_domain: entry.partition.economic_domain, native_profile_ref: entry.partition.native_profile_ref,
      currency: entry.currency, basis: entry.basis, unit: entry.unit, ratio_scale: entry.ratio_scale,
      methodology_ref: entry.methodology_ref, window: entry.window });
    // Same precedence as the served producer contract. Ratios have no currency;
    // comparing them is not adding money from different currencies.
    const checks = [
      ['CURRENCY_MIXED', entry => entry.currency !== first.currency],
      ['ECONOMIC_PARTITION_MIXED', entry => entry.partition.economic_domain !== first.partition.economic_domain || entry.partition.native_profile_ref !== first.partition.native_profile_ref],
      ['BASIS_MIXED', entry => entry.basis !== first.basis],
      ['UNIT_MIXED', entry => entry.unit !== first.unit],
      ['RATIO_SCALE_MIXED', entry => entry.ratio_scale !== first.ratio_scale],
      ['METHODOLOGY_MIXED', entry => entry.methodology_ref !== first.methodology_ref],
      ['WINDOW_MISMATCH', entry => entry.window.from_ms !== first.window.from_ms || entry.window.to_ms !== first.window.to_ms],
    ];
    const reason = checks.find(([, differs]) => body.series.some(differs))?.[0] ?? null;
    const equal = reason === null;
    body.comparison = { state: body.series.length === 1 ? 'SINGLE_SUBJECT' : equal ? 'ALIGNED' : 'INCOMPARABLE',
      reason_code: reason, transform: 'NONE_NO_REBASE_NO_CROSS_CURRENCY_SUM',
      common: equal ? common(first) : null,
      axis_ms: equal && body.series.length > 1 ? walks[0].map(point => point.ts_ms) : null };
    body.lineage = { ...body.lineage, source_set_ref: hash(['FIXTURE_LAB', walks]), revision: hash(body.series) };
    result[metric] = body;
  }
  return result;
}
