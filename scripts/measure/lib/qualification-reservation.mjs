/** Offline arithmetic only. A reservation is neither an owner authorization
 * nor a measurement. All proposed durations/counts are explicit; no clock,
 * credentials, sources, collectors, file writes or load are used here.
 */
import { stageTabCensus } from './stage.mjs';

export const RESERVATION_INPUT_SCHEMA = 'portal.elp2-10.qualification-reservation-input.v1';
export const RESERVATION_SCHEMA = 'portal.elp2-10.qualification-reservation.v1';
const fail = code => { throw new Error(`QUALIFICATION_RESERVATION_REFUSED:${code}`); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
function dictionary(value, maximum) {
  if (!object(value) || Reflect.ownKeys(value).length < 1 || Reflect.ownKeys(value).length > maximum ||
    Reflect.ownKeys(value).some(key => typeof key !== 'string' ||
      !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'))) fail('SHAPE');
}
function shape(value, required, optional = []) {
  if (!object(value) || Reflect.ownKeys(value).some(key => typeof key !== 'string' ||
    !required.concat(optional).includes(key) || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value')) ||
    required.some(key => !Object.hasOwn(value, key))) fail('SHAPE');
}
const integer = (value, positive = false) => {
  if (!Number.isSafeInteger(value) || value < (positive ? 1 : 0)) fail('INTEGER');
  return value;
};
function array(value, maximum = 256) {
  if (!Array.isArray(value) || value.length < 1 || value.length > maximum ||
    Reflect.ownKeys(value).some(key => key !== 'length' && (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/.test(key))) ||
    Array.from({ length: value.length }, (_, index) => !Object.hasOwn(value, index) ||
      !Object.hasOwn(Object.getOwnPropertyDescriptor(value, String(index)), 'value')).some(Boolean)) fail('ARRAY');
  return value;
}
function sum(...values) {
  const total = values.reduce((n, value) => n + BigInt(integer(value)), 0n);
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) fail('ARITHMETIC_OVERFLOW');
  return Number(total);
}
function multiply(a, b) {
  const total = BigInt(integer(a)) * BigInt(integer(b));
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) fail('ARITHMETIC_OVERFLOW');
  return Number(total);
}
const samePopulation = values => values.length === 3 && new Set(values).size === 3 &&
  values.every(value => ['B0', 'B1', 'B2'].includes(value));

function workloadCensus(workload) {
  // Supply the driver's four structural fields. Source/target/approval metadata
  // belongs to the existing pinned workload selector, not this calculator.
  shape(workload, ['schema_version', 'seed', 'sets', 'stages']);
  integer(workload.seed);
  dictionary(workload.sets, 256);
  if (!object(workload.stages)) fail('WORKLOAD');
  const sets = Object.keys(workload.sets);
  if (!sets.length || sets.length > 256) fail('WORKLOAD');
  for (const set of sets) {
    if (!set.length || set.length > 128 || !Array.isArray(workload.sets[set])) fail('WORKLOAD');
    for (const line of array(workload.sets[set], 4096))
      if (typeof line !== 'string' || line.length > 4096 || !/^GET \/api\/[^\u0000-\u001f\u007f]*$/.test(line)) fail('WORKLOAD');
  }
  shape(workload.stages, ['B1', 'B2']);
  for (const stage of ['B1', 'B2']) {
    for (const entry of array(workload.stages[stage])) {
      shape(entry, ['set', 'tabs', 'cadence_ms']);
      if (typeof entry.set !== 'string' || entry.set.length < 1 || entry.set.length > 128 ||
        !Object.hasOwn(workload.sets, entry.set)) fail('WORKLOAD');
      integer(entry.tabs, true); integer(entry.cadence_ms, true);
    }
    sum(...workload.stages[stage].map(entry => entry.tabs));
  }
  try {
    // The current execution driver counts SUM(entries.tabs), never max(entry).
    // Do not return set names/paths: these may contain private resource IDs.
    return Object.fromEntries(['B1', 'B2'].map(stage => [stage, stageTabCensus(workload, stage).total_tabs]));
  } catch { fail('WORKLOAD'); }
}

export function planQualificationReservation(input) {
  shape(input, ['schema_version', 'workload', 'm2', 'm5', 'proposed_window', 'retained']);
  if (input.schema_version !== RESERVATION_INPUT_SCHEMA) fail('SCHEMA');
  const census = workloadCensus(input.workload);
  const m2 = input.m2;
  shape(m2, ['tabs', 'idle_ms', 'hidden_ms', 'per_cell_allowance_ms']);
  const tabs = array(m2.tabs).map(value => integer(value, true));
  if (new Set(tabs).size !== tabs.length || tabs.some((value, index) => index && value <= tabs[index - 1])) fail('M2_TAB_ORDER');
  const perCellMs = sum(m2.idle_ms, m2.hidden_ms, m2.per_cell_allowance_ms);
  const m2Ms = multiply(tabs.length, perCellMs);
  const m2DriverFits = m2.idle_ms >= 600_000 && m2.hidden_ms >= 300_000 && m2.per_cell_allowance_ms >= 240_000;
  // These are the existing M2 driver's admission guards, not new soak defaults.
  // A different proposal remains calculable but cannot pass those driver guards.
  const m5 = input.m5;
  shape(m5, ['stage_orders', 'minimum_duration_ms', 'stabilization_intervals', 'stabilization_ms', 'margin_ms']);
  dictionary(m5.stage_orders, 16);
  const orders = Object.values(m5.stage_orders);
  if (!orders.length || orders.length > 16 || orders.some(order => !samePopulation(array(order, 3)))) fail('M5_STAGE_ORDERS');
  const stageCount = sum(...orders.map(order => order.length));
  integer(m5.minimum_duration_ms, true);
  integer(m5.stabilization_intervals);
  if (m5.stabilization_intervals > stageCount) fail('M5_STABILIZATION_COUNT');
  const measuredMs = multiply(stageCount, m5.minimum_duration_ms);
  const stabilizationMs = multiply(m5.stabilization_intervals, m5.stabilization_ms);
  const m5BaseMs = sum(measuredMs, stabilizationMs);
  const m5Ms = sum(m5BaseMs, m5.margin_ms);
  const combinedMs = sum(m2Ms, m5Ms);
  const window = input.proposed_window;
  shape(window, ['scope', 'duration_ms', 'max_tabs']);
  if (!['M2_ONLY', 'M5_ONLY', 'M2_THEN_M5'].includes(window.scope)) fail('WINDOW_SCOPE');
  integer(window.duration_ms, true); integer(window.max_tabs, true);
  const m2Included = window.scope !== 'M5_ONLY', m5Included = window.scope !== 'M2_ONLY';
  const requiredMs = window.scope === 'M2_ONLY' ? m2Ms : window.scope === 'M5_ONLY' ? m5Ms : combinedMs;
  const requiredTabs = Math.max(m2Included ? tabs[tabs.length - 1] : 0, m5Included ? Math.max(census.B1, census.B2) : 0);
  const retained = input.retained;
  shape(retained, ['ceiling', 'reserve', 'current_count', 'scenarios']);
  integer(retained.ceiling, true); integer(retained.reserve); integer(retained.current_count);
  const scopes = new Set();
  const scenarios = array(retained.scenarios, 64).map(scenario => {
    shape(scenario, ['scope', 'new_finite', 'new_stream_bound'], ['historical_count']);
    if (!['CURRENT_FULL_SUITE', 'CURRENT_REMAINING_CASES', 'HISTORICAL_CASE'].includes(scenario.scope) || scopes.has(scenario.scope)) fail('RETAINED_SCOPE');
    scopes.add(scenario.scope);
    const historical = scenario.scope === 'HISTORICAL_CASE';
    if (historical !== Object.hasOwn(scenario, 'historical_count')) fail('RETAINED_CENSUS_SCOPE');
    const baseline = historical ? integer(scenario.historical_count) : retained.current_count;
    const required = sum(baseline, scenario.new_finite, scenario.new_stream_bound, retained.reserve);
    return { scope: scenario.scope, baseline_count: baseline, new_finite: scenario.new_finite,
      new_stream_bound: scenario.new_stream_bound, required_retained: required,
      remaining_after_reservation: retained.ceiling - required,
      status: required <= retained.ceiling ? 'WITHIN_DECLARED_CEILING' : 'EXCEEDS_DECLARED_CEILING',
      historical_only: historical, admission_authorized: false };
  });
  const dispositions = [];
  if (m2Included && !m2DriverFits) dispositions.push('CURRENT_M2_DRIVER_DURATION_GUARDS_NOT_MET');
  if (requiredTabs > window.max_tabs) dispositions.push('PROPOSED_WINDOW_TAB_CEILING_TOO_SMALL');
  if (requiredMs > window.duration_ms) dispositions.push('PROPOSED_WINDOW_DURATION_TOO_SHORT');
  if (scenarios.some(scenario => !scenario.historical_only && scenario.status === 'EXCEEDS_DECLARED_CEILING'))
    dispositions.push('CURRENT_RETAINED_RESERVATION_EXCEEDS_DECLARED_CEILING');
  return {
    schema_version: RESERVATION_SCHEMA, status: 'PLANNING_ONLY_NOT_AUTHORIZED',
    calculation_status: dispositions.length ? 'REQUIRES_DISPOSITION' : 'NUMERICALLY_CONSISTENT',
    authority_verified: false, execution_authorized: false, calibration_evidence: false, approved_budget: false,
    workload_tabs: census,
    m2: { cells: tabs.length, max_tabs: tabs[tabs.length - 1], per_cell_ms: perCellMs,
      reservation_ms: m2Ms, existing_driver_duration_guards_met: m2DriverFits },
    m5: { repetitions: orders.length, stage_count: stageCount, measurement_ms: measuredMs,
      stabilization_ms: stabilizationMs, base_reservation_ms: m5BaseMs, margin_ms: m5.margin_ms, reservation_ms: m5Ms },
    combined_reservation_ms: combinedMs,
    proposed_window: { scope: window.scope, duration_ms: window.duration_ms, required_duration_ms: requiredMs,
      duration_shortfall_ms: Math.max(0, requiredMs - window.duration_ms), max_tabs: window.max_tabs,
      required_max_tabs: requiredTabs, tab_shortfall: Math.max(0, requiredTabs - window.max_tabs) },
    retained: { declared_ceiling: retained.ceiling, reserve: retained.reserve, current_count: retained.current_count,
      headroom_before_new_admissions: retained.ceiling - sum(retained.current_count, retained.reserve), scenarios },
    required_dispositions: dispositions,
    limitations: ['EXPLICIT_INPUT_ARITHMETIC_NOT_MEASUREMENTS_OR_INSTALLED_CONFIG',
      'HISTORICAL_CASE_CANNOT_AUTHORIZE_CURRENT_ADMISSION', 'NO_WORKLOAD_SHRINKING_HISTORY_DELETION_OR_GRANT_RENEWAL',
      'EXISTING_PINNED_TARGET_OWNER_WINDOW_REPIN_COLLECTOR_AND_STOP_RESTORE_GATES_STILL_REQUIRED',
      'M5_MARGIN_STABILIZATION_AND_CALIBRATION_REQUIRE_SEPARATE_OWNER_ACCEPTANCE'],
  };
}
