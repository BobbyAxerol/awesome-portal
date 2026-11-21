import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { planQualificationReservation, RESERVATION_INPUT_SCHEMA } from '../lib/qualification-reservation.mjs';
import { runQualificationPlan } from '../qualification-plan.mjs';

const shipped = JSON.parse(readFileSync(new URL('../workloads/read-sets.v1.json', import.meta.url), 'utf8'));
const fixture = () => ({ schema_version: RESERVATION_INPUT_SCHEMA,
  workload: Object.fromEntries(['schema_version', 'seed', 'sets', 'stages'].map(key => [key, structuredClone(shipped[key])])),
  m2: { tabs: [1, 2, 4, 8, 16], idle_ms: 600000, hidden_ms: 300000, per_cell_allowance_ms: 240000 },
  m5: { stage_orders: { rep1: ['B0', 'B1', 'B2'], rep2: ['B2', 'B0', 'B1'] }, minimum_duration_ms: 600000,
    stabilization_intervals: 6, stabilization_ms: 300000, margin_ms: 1800000 },
  proposed_window: { scope: 'M2_THEN_M5', duration_ms: 7200000, max_tabs: 16 },
  retained: { ceiling: 288, reserve: 20, current_count: 21, scenarios: [
    { scope: 'CURRENT_FULL_SUITE', new_finite: 9, new_stream_bound: 244 },
    { scope: 'HISTORICAL_CASE', historical_count: 16, new_finite: 2, new_stream_bound: 244 },
  ] },
});

test('current source census is B2 SUM=28; M2 is19min/cell and95min for5cells, not80', () => {
  const plan = planQualificationReservation(fixture());
  assert.deepEqual(plan.workload_tabs, { B1: 8, B2: 28 });
  assert.equal(plan.m2.per_cell_ms, 19 * 60000);
  assert.equal(plan.m2.reservation_ms, 95 * 60000);
  assert.equal(plan.m2.existing_driver_duration_guards_met, true);
  assert.equal(plan.proposed_window.required_max_tabs, 28);
  assert.equal(plan.proposed_window.tab_shortfall, 12);
});

test('M5 has90min base plus explicit margin; combined requires185min BEFORE margin', () => {
  const input = fixture(), plan = planQualificationReservation(input);
  assert.equal(plan.m5.measurement_ms, 60 * 60000);
  assert.equal(plan.m5.stabilization_ms, 30 * 60000);
  assert.equal(plan.m5.base_reservation_ms, 90 * 60000);
  assert.equal(plan.m5.reservation_ms, 120 * 60000);
  assert.equal(plan.combined_reservation_ms, 215 * 60000);
  assert.equal(plan.proposed_window.duration_shortfall_ms, 95 * 60000);
  input.m5.margin_ms = 0;
  assert.equal(planQualificationReservation(input).combined_reservation_ms, 185 * 60000);
});

test('historical H16 missing-case282 is not current H21 full-suite294 or fresh current remaining-case287', () => {
  const input = fixture();
  input.retained.scenarios.push({ scope: 'CURRENT_REMAINING_CASES', new_finite: 2, new_stream_bound: 244 });
  const { retained } = planQualificationReservation(input);
  assert.equal(retained.headroom_before_new_admissions, 247);
  assert.deepEqual(retained.scenarios.map(row => [row.scope, row.required_retained, row.remaining_after_reservation, row.historical_only]),
    [['CURRENT_FULL_SUITE', 294, -6, false], ['HISTORICAL_CASE', 282, 6, true], ['CURRENT_REMAINING_CASES', 287, 1, false]]);
  assert.ok(retained.scenarios.every(row => row.admission_authorized === false));
});

test('explicit M2-only/M5-only windows do not ambiguously combine or inherit the other load', () => {
  const input = fixture(); input.retained.scenarios = [input.retained.scenarios[1]];
  input.proposed_window = { scope: 'M2_ONLY', duration_ms: 95 * 60000, max_tabs: 16 };
  const m2 = planQualificationReservation(input);
  assert.equal(m2.calculation_status, 'NUMERICALLY_CONSISTENT');
  assert.equal(m2.proposed_window.required_max_tabs, 16);
  input.proposed_window = { scope: 'M5_ONLY', duration_ms: 120 * 60000, max_tabs: 28 };
  const m5 = planQualificationReservation(input);
  assert.equal(m5.calculation_status, 'NUMERICALLY_CONSISTENT');
  assert.equal(m5.proposed_window.required_duration_ms, 120 * 60000);
  for (const plan of [m2, m5]) {
    assert.equal(plan.status, 'PLANNING_ONLY_NOT_AUTHORIZED');
    for (const key of ['authority_verified', 'execution_authorized', 'calibration_evidence', 'approved_budget']) assert.equal(plan[key], false);
  }
});

test('no mutation, network, input-string echo, expiry invention or automatic defaults', () => {
  const input = fixture(), before = structuredClone(input), fetch = globalThis.fetch;
  globalThis.fetch = () => { throw Error('NETWORK_MUST_NOT_RUN'); };
  try {
    input.workload.sets['overview-poll'] = ['GET /api/secret-resource-id-for-non-echo'];
    const plan = planQualificationReservation(input);
    assert.equal(JSON.stringify(plan).includes('secret-resource-id'), false);
    assert.equal(Object.hasOwn(plan, 'expires_at_ms'), false);
    assert.equal(Object.hasOwn(plan, 'observed_at_ms'), false);
    input.workload = before.workload; assert.deepEqual(input, before);
  } finally { globalThis.fetch = fetch; }
  for (const section of ['m2', 'm5', 'proposed_window', 'retained']) {
    const missing = fixture(); delete missing[section]; assert.throws(() => planQualificationReservation(missing), /REFUSED:SHAPE/);
  }
});

test('shorter M2 proposal remains arithmetic only, explicitly fails current driver guards, never imposes a new soak', () => {
  const input = fixture(); input.m2.idle_ms = 0; input.m2.hidden_ms = 0; input.m2.per_cell_allowance_ms = 0;
  const plan = planQualificationReservation(input);
  assert.equal(plan.m2.reservation_ms, 0);
  assert.equal(plan.m2.existing_driver_duration_guards_met, false);
  assert.ok(plan.required_dispositions.includes('CURRENT_M2_DRIVER_DURATION_GUARDS_NOT_MET'));
  input.m5.stabilization_ms = 0; input.m5.margin_ms = 0;
  assert.equal(planQualificationReservation(input).m5.reservation_ms, 60 * 60000);
});

test('stage entries reference an owned declared set, never inherited names or coercible objects', () => {
  for (const missing of ['toString', 'constructor', '', 'x'.repeat(129), {}, null, 1]) {
    const input = fixture(); input.workload.stages.B2[0].set = missing;
    assert.throws(() => planQualificationReservation(input), /QUALIFICATION_RESERVATION_REFUSED:WORKLOAD/);
  }
});

test('unknown fields, malformed scopes, negative/fractional/unsafe counts and unsafe arithmetic refuse', () => {
  const changes = [
    f => { f.approved = true; }, f => { f.m2.duration_default_ms = 1; }, f => { f.proposed_window.ends_at_ms = 1; },
    f => { f.workload.headers = { Authorization: 'secret' }; }, f => { f.workload.stages.B2[0].secret = true; },
    f => { f.proposed_window.scope = 'ANY'; }, f => { f.retained.scenarios[0].scope = 'FULL'; },
    f => { f.retained.scenarios[0].historical_count = 0; }, f => { delete f.retained.scenarios[1].historical_count; },
    f => { f.retained.scenarios.push({ ...f.retained.scenarios[0] }); },
    f => { f.m2.tabs = [2, 1]; }, f => { f.m2.tabs = [1, 1]; }, f => { f.m2.tabs = []; },
    f => { f.m5.stage_orders.rep1 = ['B0', 'B1', 'B1']; }, f => { f.m5.stabilization_intervals = 7; },
    f => { f.retained.reserve = -1; }, f => { f.m2.idle_ms = 0.5; }, f => { f.retained.ceiling = Infinity; },
    f => { f.m2.idle_ms = Number.MAX_SAFE_INTEGER + 1; }, f => { f.m2.idle_ms = Number.MAX_SAFE_INTEGER; },
    f => { f.m5.minimum_duration_ms = Number.MAX_SAFE_INTEGER; }, f => { f.retained.scenarios[0].new_stream_bound = Number.MAX_SAFE_INTEGER; },
    f => { f.workload.stages.B2[0].tabs = Number.MAX_SAFE_INTEGER; },
    f => { f.m5.stabilization_ms = Number.NaN; },
  ];
  for (const change of changes) { const input = fixture(); change(input); assert.throws(() => planQualificationReservation(input), /QUALIFICATION_RESERVATION_REFUSED/); }
});

test('getters, inherited objects and sparse/custom arrays are not planning data', () => {
  const a = fixture(); Object.defineProperty(a, 'm2', { get() { throw Error('GETTER_MUST_NOT_RUN'); } });
  assert.throws(() => planQualificationReservation(a), /REFUSED:SHAPE/);
  const b = Object.create(fixture()); assert.throws(() => planQualificationReservation(b), /REFUSED:SHAPE/);
  const c = fixture(); delete c.m2.tabs[2]; assert.throws(() => planQualificationReservation(c), /REFUSED:ARRAY/);
  const d = fixture(); d.m2.tabs.secret = true; assert.throws(() => planQualificationReservation(d), /REFUSED:ARRAY/);
});

test('driver validation errors are sanitized and input strings are never returned', () => {
  const input = fixture(); input.workload.stages.B1[0].set = 'SECRET_FROM_SOURCE';
  assert.throws(() => planQualificationReservation(input), error => error.message === 'QUALIFICATION_RESERVATION_REFUSED:WORKLOAD');
  input.workload.sets['overview-poll'] = ['POST /api/SECRET_BODY'];
  assert.throws(() => planQualificationReservation(input), error => !error.message.includes('SECRET'));
});

test('nested workload/repetition dictionaries reject accessors before evaluating them', () => {
  for (const dictionaryOf of [f => f.workload.sets, f => f.m5.stage_orders]) {
    const input = fixture(); let invoked = false;
    Object.defineProperty(dictionaryOf(input), 'untrusted', { enumerable: true,
      get() { invoked = true; throw new Error('RAW_PRIVATE_VALUE'); } });
    assert.throws(() => planQualificationReservation(input), /REFUSED:SHAPE/);
    assert.equal(invoked, false);
  }
});

test('CLI reads public input only, writes stdout only, and never echoes raw input/errors/environment', t => {
  const directory = mkdtempSync(join(tmpdir(), 'qualification-plan-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'public.json'); writeFileSync(path, JSON.stringify(fixture()));
  let stdout = '', stderr = '';
  assert.equal(runQualificationPlan(['--public-plan', path], { stdout: s => { stdout += s; }, stderr: s => { stderr += s; } }), 0);
  assert.equal(JSON.parse(stdout).execution_authorized, false); assert.equal(stderr, '');
  assert.deepEqual(readdirSync(directory), ['public.json']);
  const cli = new URL('../qualification-plan.mjs', import.meta.url);
  const result = spawnSync(process.execPath, [cli.pathname, '--public-plan', path], { encoding: 'utf8', env: { ...process.env, QUALIFICATION_SECRET: 'MUST_NEVER_ECHO_SECRET' } });
  assert.equal(result.status, 0); assert.equal(JSON.parse(result.stdout).status, 'PLANNING_ONLY_NOT_AUTHORIZED');
  assert.equal((result.stdout + result.stderr).includes('MUST_NEVER_ECHO_SECRET'), false);
  for (const value of ['{"cookie":"RAW_SECRET"}', '{RAW_SECRET', 'x'.repeat(1048577)]) {
    writeFileSync(path, value); stdout = ''; stderr = '';
    assert.equal(runQualificationPlan(['--public-plan', path], { stdout: s => { stdout += s; }, stderr: s => { stderr += s; } }), 3);
    assert.equal(stdout, ''); assert.match(stderr, /REFUSED:[A-Z_]+\n$/); assert.equal(stderr.includes('RAW_SECRET'), false);
  }
  writeFileSync(path, JSON.stringify(fixture())); const link = join(directory, 'symlink.json'); symlinkSync(path, link);
  assert.equal(runQualificationPlan(['--public-plan', link], { stdout: () => assert.fail('no output'), stderr: () => {} }), 3);
  assert.equal(runQualificationPlan(['--public-plan', directory], { stderr: () => {} }), 3);
  assert.equal(runQualificationPlan(['--authorization', '/secret'], { stderr: () => {} }), 3);
});
