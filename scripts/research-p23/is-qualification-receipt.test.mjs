import assert from 'node:assert/strict';
import test from 'node:test';
import { assertQualificationFacts, assertQualificationPreset, fixedQualificationRequestedSpec,
  fixedQualificationWindows, qualificationWindowPreset } from './is-qualification-receipt.mjs';
import { requestedSpec } from './real-run.mjs';

const BINDING={alpha_id:'alpha',alpha_version_id:'av_alpha'};
const RELEASE={release_id:'er_quantbt_111',config_digest:'a'.repeat(64)};

test('qualification bounds use the same explicit UTC fixed declaration, never host timezone',()=>{
  const spec=requestedSpec({alpha_id:'alpha',alpha_version_id:'av_alpha'},{release_id:'er_quantbt_111',config_digest:'a'.repeat(64)},'p04');
  const windows=fixedQualificationWindows(spec);
  assert.equal(windows.is.start_ms,1780272000000);
  assert.equal(windows.is.end_ms,windows.oos.start_ms);
  assert.equal(windows.oos.end_ms,windows.holdout.start_ms);
  assert.equal(windows.is.source_locator,'P10.immutable_requested_spec.windows.is');
  assert.throws(()=>fixedQualificationWindows({...spec,protocol:'advanced'}));
  spec.windows.is.start='2026-06-01T00:00-07:00';
  assert.throws(()=>fixedQualificationWindows(spec));
});

test('weekly stays the exact default request and independent receipt label/population',()=>{
  assert.deepEqual(fixedQualificationRequestedSpec(BINDING,RELEASE,'p04'),requestedSpec(BINDING,RELEASE,'p04'));
  const preset=qualificationWindowPreset();
  assert.equal(preset.label,'b8-is-oracle-20261002');assert.equal(preset.is_rows,168);
  assertQualificationPreset(requestedSpec(BINDING,RELEASE,'p04'));
  // Weekly allows genuine flat equity with typed Sharpe/histogram absence.
  assertQualificationFacts({row_count:168},{by_window:{is:{facts:{metrics:{sharpe:{state:'NOT_APPLICABLE'}}},return_distribution:{state:'NOT_APPLICABLE'}}}});
  assert.throws(()=>assertQualificationFacts({row_count:720},{},'weekly'),/FIXED_IS_POPULATION/);
});

test('monthly changes only declared fixed windows and uses a separate label/private files',()=>{
  const weekly=requestedSpec(BINDING,RELEASE,'p04'),monthly=fixedQualificationRequestedSpec(BINDING,RELEASE,'p04','monthly');
  const {windows:monthlyWindows,...monthlyRest}=monthly,{windows:weeklyWindows,...weeklyRest}=weekly;
  assert.deepEqual(monthlyRest,weeklyRest);assert.notDeepEqual(monthlyWindows,weeklyWindows);
  const bounds=fixedQualificationWindows(monthly);
  assert.equal(bounds.is.start_ms,Date.parse('2026-06-01T00:00:00Z'));
  assert.equal(bounds.is.end_ms,Date.parse('2026-07-01T00:00:00Z'));
  assert.equal(bounds.oos.end_ms,Date.parse('2026-08-01T00:00:00Z'));
  assert.equal(bounds.holdout.end_ms,Date.parse('2026-09-01T00:00:00Z'));
  assert.equal((bounds.is.end_ms-bounds.is.start_ms)/3_600_000,720);
  assertQualificationPreset(monthly,'monthly');
  assert.equal(qualificationWindowPreset('monthly').label,'b8-is-monthly-20261002');
  assert.equal(qualificationWindowPreset('monthly').is_rows,720);
  assert.notEqual(qualificationWindowPreset().label,qualificationWindowPreset('monthly').label);
});

test('cached admission cannot relabel a weekly run as monthly or substitute any declared boundary',()=>{
  assert.throws(()=>assertQualificationPreset(requestedSpec(BINDING,RELEASE,'p04'),'monthly'),/PRESET_MISMATCH/);
  for(const kind of ['is','oos','holdout']) {
    const spec=fixedQualificationRequestedSpec(BINDING,RELEASE,'p04','monthly');
    spec.windows[kind].end_exclusive='2026-09-02T00:00';
    assert.throws(()=>assertQualificationPreset(spec,'monthly'),/PRESET_MISMATCH/);
  }
  assert.throws(()=>qualificationWindowPreset('quarterly'),/NAMED_IS_WINDOW_PRESET/);
  assert.throws(()=>fixedQualificationRequestedSpec(BINDING,RELEASE,'wfo','monthly'),/FIXED_IS_QUALIFICATION/);
  const mutable=qualificationWindowPreset('monthly');mutable.boundaries[0]='invented';
  assert.equal(qualificationWindowPreset('monthly').boundaries[0],'2026-06-01T00:00');
});

test('monthly nonzero numerical gate fails closed for flat/few/absent actual source facts',()=>{
  const enrichment={by_window:{is:{facts:{metrics:{sharpe:{state:'AVAILABLE'}}},return_distribution:{state:'AVAILABLE',observation_count:29}}}};
  assertQualificationFacts({row_count:720},enrichment,'monthly');
  assert.throws(()=>assertQualificationFacts({row_count:168},enrichment,'monthly'),/FIXED_IS_POPULATION/);
  for(const state of ['NOT_APPLICABLE','NOT_PUBLISHED',undefined]) {
    const absent=structuredClone(enrichment);absent.by_window.is.facts.metrics.sharpe.state=state;
    assert.throws(()=>assertQualificationFacts({row_count:720},absent,'monthly'),/SHARPE_MUST_BE_AVAILABLE/);
    const histogram=structuredClone(enrichment);histogram.by_window.is.return_distribution.state=state;
    assert.throws(()=>assertQualificationFacts({row_count:720},histogram,'monthly'),/HISTOGRAM_MUST_BE_AVAILABLE/);
  }
  for(const observation_count of [0,1,1.5,'29',undefined]) {
    const short=structuredClone(enrichment);short.by_window.is.return_distribution.observation_count=observation_count;
    assert.throws(()=>assertQualificationFacts({row_count:720},short,'monthly'),/DAILY_SAMPLE_MUST_BE_AT_LEAST_TWO/);
  }
});
