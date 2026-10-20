// BE-P4 / FE-013 + FE-033: canonical synthetic fixtures of the Manager series read and of the stored
// publication a producer must supply. Every value is TEST_ONLY; none is a product receipt. The shapes are
// parsed through the real Zod contract by the generator, and the comparison block is the real
// deriveSeriesComparison, so a fixture cannot drift from the validator it documents.
export const SERIES_FIXTURE_LANE = 'TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT';
const DAY = 86_400_000, AS_OF = 1_800_000_000_000;
const WINDOW = { from_ms: AS_OF - 30 * DAY, to_ms: AS_OF };
const digest = c => 'sha256:' + c.repeat(64);
const partition = (currency, domain = 'PAPER') => ({ economic_domain: domain, currency, basis: 'TEST_ONLY:nav-ledger',
  native_profile_ref: `TEST_ONLY:${domain.toLowerCase()}-ledger`, domain_proof_ref: 'TEST_ONLY:domain-proof' });
const at = day => WINDOW.from_ms + day * DAY;
const quality = { completeness: 'COMPLETE', freshness: 'FRESH', reasons: [] };

const unavailable = (subject, reason) => ({ subject, state: 'UNAVAILABLE', reason_code: reason, partition: null, unit: null, currency: null, ratio_scale: null,
  basis: null, methodology_ref: null, window: null, points: [], gaps: [],
  quality: { completeness: 'UNRESOLVED', freshness: 'UNKNOWN', reasons: [reason] }, source_confidence: 'UNKNOWN',
  provenance_refs: ['SOURCE_NOT_PUBLISHED'], calculation_revision: 'manager-series.v1', policy_revision: 'NOT_PUBLISHED' });
const served = (subject, currency, points, { gaps = [], domain = 'PAPER', methodology = 'TEST_ONLY:nav-twr.v1', unit = 'MONEY', cur = currency, scale = null } = {}) => ({
  subject, state: points.length ? 'AVAILABLE' : 'EMPTY', reason_code: points.length ? null : 'NO_POINTS_PUBLISHED_IN_WINDOW',
  partition: partition(currency, domain), unit, currency: unit === 'MONEY' ? cur : null, ratio_scale: unit === 'RATIO' ? scale : null, basis: 'TEST_ONLY:nav-ledger',
  methodology_ref: methodology, window: { ...WINDOW }, points: points.map(([day, value]) => ({ ts_ms: at(day), value })), gaps,
  quality: { ...quality }, source_confidence: 'VERIFIED', provenance_refs: [digest('d')], calculation_revision: 'TEST_ONLY:calc',
  policy_revision: 'TEST_ONLY:policy' });
const portfolio = id => ({ subject_type: 'PORTFOLIO', subject_id: id });

export function buildManagerSeriesFixtures(contract) {
  const { deriveSeriesComparison, managerSeriesResponse, canonicalManagerZero } = contract;
  const response = (entries, extra = {}) => {
    const value = { schema_version: 'portal.execution.manager-series.v1', workspace_id: 'TEST_ONLY:workspace', environment: 'paper',
      record_authority: 'PORTAL_PROJECTION', source_authority: 'TRADING_SYSTEM', metric: extra.metric ?? 'NAV',
      selected_window: { requested: '30D', resolved: { ...WINDOW }, selection_basis: 'EXACT_PUBLISHED_METRIC_WINDOW_ONLY', reason_code: null },
      series_source: { state: 'PUBLISHED', reason_code: null }, as_of_ms: AS_OF, recorded_through_ms: AS_OF + 50,
      quality: { completeness: 'COMPLETE', freshness: 'FRESH', reasons: [] }, series: entries, comparison: deriveSeriesComparison(entries),
      lineage: { reducer_revision: 'manager-series.v1', source_set_ref: digest('a'), revision: digest('b') }, ...extra };
    return managerSeriesResponse.parse(value);
  };
  const wrap = value => ({ lane: SERIES_FIXTURE_LANE, value });
  // Two portfolios in one USDT partition: ALIGNED on the union axis. Portfolio B has a stated gap and no point on day 2 (no fill).
  const populated = response([
    served(portfolio('TEST_ONLY:portfolio-a'), 'USDT', [[0, '100.000000000000000001'], [1, '101.5'], [2, '99.25']]),
    served(portfolio('TEST_ONLY:portfolio-b'), 'USDT', [[0, '5000'], [1, '5012.0000000000000001'], [3, '4990']],
      { gaps: [{ from_ms: at(2), to_ms: at(2), reason: 'SOURCE_GAP' }] })]);
  const empty = response([served(portfolio('TEST_ONLY:portfolio-a'), 'USDT', [])]);
  // The state of every profile today: no financial normalized series source. Typed, per subject, with the profile-level flag.
  const unavailableAll = response([unavailable({ subject_type: 'FUND', subject_id: 'TEST_ONLY:workspace' }, 'SERIES_SOURCE_NOT_PUBLISHED'),
    unavailable(portfolio('TEST_ONLY:portfolio-a'), 'SERIES_SOURCE_NOT_PUBLISHED')],
  { series_source: { state: 'NOT_PUBLISHED', reason_code: 'FINANCIAL_NORMALIZED_SERIES_SOURCE_NOT_PUBLISHED' } });
  // USDT beside VND: each series is delivered untouched in its own currency, and the comparison refuses: no rebase, no sum, no shared axis.
  const mixed = response([
    served(portfolio('TEST_ONLY:portfolio-a'), 'USDT', [[0, '100'], [1, '101']]),
    served(portfolio('TEST_ONLY:portfolio-vnd'), 'VND', [[0, '2500000000'], [1, '2512500000']])]);
  if (mixed.comparison.state !== 'INCOMPARABLE' || mixed.comparison.reason_code !== 'CURRENCY_MIXED') throw new Error('mixed-currency fixture must be INCOMPARABLE');
  const publication = {
    binding: { subject_type: 'portfolio', subject_id: 'TEST_ONLY:portfolio-a', tuple_population_digest: digest('1'), stage_filter: ['PAPER'],
      metric: 'NAV', partition: partition('USDT'), window_start_ms: WINDOW.from_ms, window_end_ms: WINDOW.to_ms },
    series: { unit: 'MONEY', currency: 'USDT', ratio_scale: null, basis: 'TEST_ONLY:nav-ledger', methodology_ref: 'TEST_ONLY:nav-twr.v1',
      points: [{ ts_ms: at(0), value: '100.000000000000000001' }, { ts_ms: at(1), value: '101.5' }], gaps: [] },
    quality: { ...quality }, source_confidence: 'VERIFIED',
    provenance: { scope: { workspace_id: 'TEST_ONLY:workspace', environment: 'paper', profile_id: 'TEST_ONLY:paper-profile', catalogue_digest: digest('2') },
      source_revision: 'TEST_ONLY:model-r1', source_set_digest: digest('3'), source_qualification: 'SOURCE_VERIFIED', input_digest: digest('4'),
      calculation_revision: 'TEST_ONLY:calc', policy_revision: 'TEST_ONLY:policy', source_as_of_ms: AS_OF } };
  contract.managerSeriesPublication.parse(publication);
  // FE-013: RETURN is a RATIO whose scale (FRACTION: 1 = 100%; PERCENT: 100 = 100%) the SOURCE states. TEST_ONLY values, no product receipt.
  const retWindow = { methodology: 'TEST_ONLY:return-twr.v1', unit: 'RATIO' };
  const returnAligned = response([
    served(portfolio('TEST_ONLY:portfolio-a'), 'USDT', [[0, '0'], [1, '0.0123'], [2, '-0.004']], { ...retWindow, scale: 'FRACTION' }),
    served(portfolio('TEST_ONLY:portfolio-b'), 'USDT', [[0, '0'], [1, '0.0051']], { ...retWindow, scale: 'FRACTION' })], { metric: 'RETURN' });
  if (returnAligned.comparison.state !== 'ALIGNED' || returnAligned.comparison.common.ratio_scale !== 'FRACTION') throw new Error('return fixture must be ALIGNED on FRACTION');
  // The same two returns, one on PERCENT: 0.0123 and 1.23 are the same number; the comparison refuses to put them on one axis.
  const returnScaleMixed = response([
    served(portfolio('TEST_ONLY:portfolio-a'), 'USDT', [[0, '0'], [1, '0.0123']], { ...retWindow, scale: 'FRACTION' }),
    served(portfolio('TEST_ONLY:portfolio-b'), 'USDT', [[0, '0'], [1, '1.23']], { ...retWindow, scale: 'PERCENT' })], { metric: 'RETURN' });
  if (returnScaleMixed.comparison.state !== 'INCOMPARABLE' || returnScaleMixed.comparison.reason_code !== 'RATIO_SCALE_MIXED') throw new Error('mixed-scale fixture must be INCOMPARABLE');
  // The producer published returns but states no scale: the points are not served, the reason is typed.
  const returnScaleUnpublished = response([unavailable(portfolio('TEST_ONLY:portfolio-a'), 'RATIO_SCALE_NOT_PUBLISHED')], { metric: 'RETURN' });
  const returnPublication = structuredClone(publication);
  Object.assign(returnPublication.binding, { metric: 'RETURN' });
  Object.assign(returnPublication.series, { unit: 'RATIO', currency: null, ratio_scale: 'FRACTION', methodology_ref: 'TEST_ONLY:return-twr.v1',
    points: [{ ts_ms: at(0), value: '0' }, { ts_ms: at(1), value: '0.0123' }] });
  contract.managerSeriesPublication.parse(returnPublication);
  // FE-013 metric/unit/scale tie. Every case is proven refused by the real Zod contract before it is written; the tests then judge the
  // published JSON Schema on the ones marked SCHEMA_AND_PRODUCER. Mutations are applied to the named base example.
  const U = 'MANAGER_SERIES_METRIC_UNIT_MISMATCH', S = 'MANAGER_SERIES_RATIO_SCALE_INVALID';
  const bases = { nav: 'execution-manager-series.populated.synthetic.valid.json', return: 'execution-manager-series.return.synthetic.valid.json',
    unscaled: 'execution-manager-series.return-scale-not-published.synthetic.valid.json', pub: 'execution-manager-series-publication.synthetic.valid.json',
    pubReturn: 'execution-manager-series-publication.return.synthetic.valid.json' };
  const each = (n, path, value) => [...Array(n).keys()].map(i => ({ op: 'set', path: ['series', i, ...path], value }));
  const metricUnit = {
    lane: SERIES_FIXTURE_LANE, bases,
    note: 'FE-013: the metric fixes the unit. NAV and NET_PNL are MONEY with a currency (the partition currency); RETURN is a RATIO with a ratio_scale and no currency; nothing else. The scale is stated by the source, never inferred from magnitudes.',
    scales: { FRACTION: '1 = 100% (0.0123 is 1.23%)', PERCENT: '100 = 100% (1.23 is 1.23%)' },
    cases: [
      { id: 'FE-013/nav-as-ratio', base: 'nav', rule: 'NAV is MONEY', refused_by: 'SCHEMA_AND_PRODUCER', code: U,
        ops: [...each(2, ['unit'], 'RATIO'), ...each(2, ['currency'], null), ...each(2, ['ratio_scale'], 'FRACTION')] },
      { id: 'FE-013/net-pnl-as-ratio', base: 'nav', rule: 'NET_PNL is MONEY', refused_by: 'SCHEMA_AND_PRODUCER', code: U,
        ops: [{ op: 'set', path: ['metric'], value: 'NET_PNL' }, ...each(2, ['unit'], 'RATIO'), ...each(2, ['currency'], null), ...each(2, ['ratio_scale'], 'PERCENT')] },
      { id: 'FE-013/return-as-money', base: 'return', rule: 'RETURN is a RATIO', refused_by: 'SCHEMA_AND_PRODUCER', code: U,
        ops: [...each(2, ['unit'], 'MONEY'), ...each(2, ['currency'], 'USDT'), ...each(2, ['ratio_scale'], null)] },
      { id: 'FE-013/return-without-a-scale', base: 'return', rule: 'a RATIO states its scale', refused_by: 'SCHEMA_AND_PRODUCER', code: S,
        ops: each(2, ['ratio_scale'], null) },
      { id: 'FE-013/money-with-a-scale', base: 'nav', rule: 'a scale belongs to a ratio only', refused_by: 'SCHEMA_AND_PRODUCER', code: S,
        ops: [{ op: 'set', path: ['series', 0, 'ratio_scale'], value: 'FRACTION' }] },
      { id: 'FE-013/return-with-a-currency', base: 'return', rule: 'a RATIO has no currency', refused_by: 'SCHEMA_AND_PRODUCER', code: 'MANAGER_SERIES_UNIT_CURRENCY_INVALID',
        ops: [{ op: 'set', path: ['series', 0, 'currency'], value: 'USDT' }] },
      { id: 'FE-013/unavailable-with-a-scale', base: 'unscaled', rule: 'an absence carries no scale', refused_by: 'SCHEMA_AND_PRODUCER', code: 'MANAGER_SERIES_UNAVAILABLE_INVALID',
        ops: [{ op: 'set', path: ['series', 0, 'ratio_scale'], value: 'FRACTION' }] },
      { id: 'FE-013/scale-reason-on-a-money-metric', base: 'unscaled', rule: 'RATIO_SCALE_NOT_PUBLISHED can only be said of RETURN', refused_by: 'SCHEMA_AND_PRODUCER',
        code: 'MANAGER_SERIES_REASON_METRIC_INVALID', ops: [{ op: 'set', path: ['metric'], value: 'NAV' }] },
      { id: 'FE-013/scales-mixed-called-aligned', base: 'return', rule: 'two scales share no axis (comparison is re-derived)', refused_by: 'PRODUCER_ONLY',
        code: 'MANAGER_SERIES_COMPARISON_NOT_DERIVED', ops: [{ op: 'set', path: ['series', 1, 'ratio_scale'], value: 'PERCENT' }] }],
    stored_cases: [
      { id: 'FE-013/stored-nav-as-ratio', base: 'pub', rule: 'NAV is MONEY', refused_by: 'SCHEMA_AND_PRODUCER', code: U,
        ops: [{ op: 'set', path: ['series', 'unit'], value: 'RATIO' }, { op: 'set', path: ['series', 'currency'], value: null }, { op: 'set', path: ['series', 'ratio_scale'], value: 'FRACTION' }] },
      { id: 'FE-013/stored-return-as-money', base: 'pubReturn', rule: 'RETURN is a RATIO', refused_by: 'SCHEMA_AND_PRODUCER', code: U,
        ops: [{ op: 'set', path: ['series', 'unit'], value: 'MONEY' }, { op: 'set', path: ['series', 'currency'], value: 'USDT' }, { op: 'set', path: ['series', 'ratio_scale'], value: null }] },
      { id: 'FE-013/stored-return-points-without-a-scale', base: 'pubReturn', rule: 'values need a stated scale; an unscaled ratio may only be empty', refused_by: 'SCHEMA_AND_PRODUCER', code: S,
        ops: [{ op: 'set', path: ['series', 'ratio_scale'], value: null }] },
      { id: 'FE-013/stored-money-with-a-scale', base: 'pub', rule: 'a scale belongs to a ratio only', refused_by: 'SCHEMA_AND_PRODUCER', code: S,
        ops: [{ op: 'set', path: ['series', 'ratio_scale'], value: 'PERCENT' }] }],
  };
  const baseValue = { nav: populated, return: returnAligned, unscaled: returnScaleUnpublished, pub: publication, pubReturn: returnPublication };
  const apply = (body, ops) => { for (const op of ops) op.path.slice(0, -1).reduce((node, key) => node[key], body)[op.path.at(-1)] = op.value; return body; };
  for (const [list, parser] of [[metricUnit.cases, managerSeriesResponse], [metricUnit.stored_cases, contract.managerSeriesPublication]])
    for (const c of list) {
      const refused = parser.safeParse(apply(structuredClone(baseValue[c.base]), c.ops));
      if (refused.success || !refused.error.issues.some(i => i.message === c.code)) throw new Error('FE-013 case is not refused with its code: ' + c.id);
    }
  // The stored RETURN form with no scale and no points is the producer's typed way to say "no authoritative scale": it is admitted, and never served.
  if (!contract.managerSeriesPublication.safeParse(apply(structuredClone(returnPublication), [{ op: 'set', path: ['series', 'ratio_scale'], value: null }, { op: 'set', path: ['series', 'points'], value: [] }])).success)
    throw new Error('an unscaled empty RETURN publication must be admitted');
  // MD-5 (owner decision C, 2026-10-20): canonical zero on emit. A response that carries a signed zero point is refused with its
  // stated code (the generator proves each case before writing); the examples state what the emit step does with a SOURCE value.
  const ZERO_CODE = 'MANAGER_DECIMAL_NEGATIVE_ZERO';
  const negativeZero = {
    lane: SERIES_FIXTURE_LANE, base: 'execution-manager-series.populated.synthetic.valid.json',
    note: 'Each case mutates the base example. MD-5: canonical zero on emit, limited to the Manager series response; a stored publication (source) is not changed.',
    emit_rule: 'A source point value that is zero with a minus sign is emitted with the same scale and no sign. Nothing else changes. Idempotent.',
    cases: [['negative-zero-point', '-0'], ['negative-zero-point-with-a-scale', '-0.000']].map(([id, value]) => ({
      id: `MD-5/${id}`, gap: 'MD-5', rule: 'a zero is never signed', refused_by: 'SCHEMA_AND_PRODUCER', code: ZERO_CODE,
      ops: [{ op: 'set', path: ['series', 0, 'points', 1, 'value'], value }] })),
    emit_examples: [['-0', '0'], ['-0.000', '0.000'], ['0', '0'], ['0.00', '0.00'], ['-0.5', '-0.5'], ['-100', '-100']].map(([source, emitted]) => ({ source, emitted })),
  };
  for (const c of negativeZero.cases) {
    const body = structuredClone(populated);
    for (const op of c.ops) op.path.slice(0, -1).reduce((node, key) => node[key], body)[op.path.at(-1)] = op.value;
    const refused = managerSeriesResponse.safeParse(body);
    if (refused.success || !refused.error.issues.some(i => i.message === c.code)) throw new Error('Negative series case is not refused with its code: ' + c.id);
  }
  for (const { source, emitted } of negativeZero.emit_examples)
    if (canonicalManagerZero(source) !== emitted || canonicalManagerZero(emitted) !== emitted) throw new Error('Canonical zero emit example is wrong: ' + source);
  return {
    'fixtures/execution-manager-series.negative-zero.synthetic.negative.json': negativeZero,
    'fixtures/execution-manager-series.populated.synthetic.valid.json': wrap(populated),
    'fixtures/execution-manager-series.empty.synthetic.valid.json': wrap(empty),
    'fixtures/execution-manager-series.unavailable.synthetic.valid.json': wrap(unavailableAll),
    'fixtures/execution-manager-series.currency-mixed.synthetic.valid.json': wrap(mixed),
    'fixtures/execution-manager-series-publication.synthetic.valid.json': wrap(publication),
    'fixtures/execution-manager-series-publication.return.synthetic.valid.json': wrap(returnPublication),
    'fixtures/execution-manager-series.return.synthetic.valid.json': wrap(returnAligned),
    'fixtures/execution-manager-series.return-scale-mixed.synthetic.valid.json': wrap(returnScaleMixed),
    'fixtures/execution-manager-series.return-scale-not-published.synthetic.valid.json': wrap(returnScaleUnpublished),
    'fixtures/execution-manager-series.metric-unit.synthetic.negative.json': metricUnit,
    'fixtures/execution-manager-series-query.synthetic.valid.json': { lane: SERIES_FIXTURE_LANE, cases: [
      { environment: 'paper', metric: 'NAV', window: '30D', subjects: [{ subject_type: 'FUND' }] },
      { environment: 'paper', metric: 'NAV', window: '30D',
        subjects: [portfolio('TEST_ONLY:portfolio-a'), portfolio('TEST_ONLY:portfolio-b')], economic_partition: partition('USDT') },
      { environment: 'live', metric: 'RETURN', window: { from_ms: WINDOW.from_ms, to_ms: WINDOW.to_ms },
        subjects: [portfolio('TEST_ONLY:portfolio-a'), portfolio('TEST_ONLY:portfolio-b'), portfolio('TEST_ONLY:portfolio-c'), { subject_type: 'FUND' }] }] },
  };
}
