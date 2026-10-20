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

const unavailable = (subject, reason) => ({ subject, state: 'UNAVAILABLE', reason_code: reason, partition: null, unit: null, currency: null,
  basis: null, methodology_ref: null, window: null, points: [], gaps: [],
  quality: { completeness: 'UNRESOLVED', freshness: 'UNKNOWN', reasons: [reason] }, source_confidence: 'UNKNOWN',
  provenance_refs: ['SOURCE_NOT_PUBLISHED'], calculation_revision: 'manager-series.v1', policy_revision: 'NOT_PUBLISHED' });
const served = (subject, currency, points, { gaps = [], domain = 'PAPER', methodology = 'TEST_ONLY:nav-twr.v1', unit = 'MONEY', cur = currency } = {}) => ({
  subject, state: points.length ? 'AVAILABLE' : 'EMPTY', reason_code: points.length ? null : 'NO_POINTS_PUBLISHED_IN_WINDOW',
  partition: partition(currency, domain), unit, currency: unit === 'MONEY' ? cur : null, basis: 'TEST_ONLY:nav-ledger',
  methodology_ref: methodology, window: { ...WINDOW }, points: points.map(([day, value]) => ({ ts_ms: at(day), value })), gaps,
  quality: { ...quality }, source_confidence: 'VERIFIED', provenance_refs: [digest('d')], calculation_revision: 'TEST_ONLY:calc',
  policy_revision: 'TEST_ONLY:policy' });
const portfolio = id => ({ subject_type: 'PORTFOLIO', subject_id: id });

export function buildManagerSeriesFixtures(contract) {
  const { deriveSeriesComparison, managerSeriesResponse } = contract;
  const response = (entries, extra = {}) => {
    const value = { schema_version: 'portal.execution.manager-series.v1', workspace_id: 'TEST_ONLY:workspace', environment: 'paper',
      record_authority: 'PORTAL_PROJECTION', source_authority: 'TRADING_SYSTEM', metric: 'NAV',
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
    series: { unit: 'MONEY', currency: 'USDT', basis: 'TEST_ONLY:nav-ledger', methodology_ref: 'TEST_ONLY:nav-twr.v1',
      points: [{ ts_ms: at(0), value: '100.000000000000000001' }, { ts_ms: at(1), value: '101.5' }], gaps: [] },
    quality: { ...quality }, source_confidence: 'VERIFIED',
    provenance: { scope: { workspace_id: 'TEST_ONLY:workspace', environment: 'paper', profile_id: 'TEST_ONLY:paper-profile', catalogue_digest: digest('2') },
      source_revision: 'TEST_ONLY:model-r1', source_set_digest: digest('3'), source_qualification: 'SOURCE_VERIFIED', input_digest: digest('4'),
      calculation_revision: 'TEST_ONLY:calc', policy_revision: 'TEST_ONLY:policy', source_as_of_ms: AS_OF } };
  contract.managerSeriesPublication.parse(publication);
  return {
    'fixtures/execution-manager-series.populated.synthetic.valid.json': wrap(populated),
    'fixtures/execution-manager-series.empty.synthetic.valid.json': wrap(empty),
    'fixtures/execution-manager-series.unavailable.synthetic.valid.json': wrap(unavailableAll),
    'fixtures/execution-manager-series.currency-mixed.synthetic.valid.json': wrap(mixed),
    'fixtures/execution-manager-series-publication.synthetic.valid.json': wrap(publication),
    'fixtures/execution-manager-series-query.synthetic.valid.json': { lane: SERIES_FIXTURE_LANE, cases: [
      { environment: 'paper', metric: 'NAV', window: '30D', subjects: [{ subject_type: 'FUND' }] },
      { environment: 'paper', metric: 'NAV', window: '30D',
        subjects: [portfolio('TEST_ONLY:portfolio-a'), portfolio('TEST_ONLY:portfolio-b')], economic_partition: partition('USDT') },
      { environment: 'live', metric: 'RETURN', window: { from_ms: WINDOW.from_ms, to_ms: WINDOW.to_ms },
        subjects: [portfolio('TEST_ONLY:portfolio-a'), portfolio('TEST_ONLY:portfolio-b'), portfolio('TEST_ONLY:portfolio-c'), { subject_type: 'FUND' }] }] },
  };
}
