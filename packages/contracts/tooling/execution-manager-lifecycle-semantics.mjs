// FE-027 / FE-012: JSON-schema counterpart of the cross-field rules in
// apps/control-api/src/execution-v2/manager-lifecycle.ts, plus the synthetic
// fixture shapes for the lifecycle scalars. Kept apart from the P1 semantics so
// the Manager VALIDATION rules (MD-1..8) and this slice do not share a file.
const lane = 'TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT';
const clone = value => structuredClone(value);
const obj = (properties, required = []) => ({ type: 'object', properties, ...(required.length ? { required } : {}) });
const isNull = key => obj({ [key]: { type: 'null' } }, [key]);
const isField = (key, value) => obj({ [key]: { const: value } }, [key]);
const add = (schema, ...conditions) => { schema.allOf = [...(schema.allOf ?? []), ...conditions]; };
const STAGES = ['PAPER', 'SANDBOX', 'CANARY', 'LIVE'];
export const MANAGER_STAGE_LIFECYCLE_POLICY = {
  current_stage_rule: 'SINGLE_ACTIVE_MEMBER_STAGE_IN_SELECTED_ENVIRONMENT',
  covers: 'DEPLOYED_STAGES_OF_SELECTED_ENVIRONMENT_ONLY', entry_time: 'STAGE_ENTRY_TIME_NOT_PUBLISHED' };

/** Row conditionals: a scalar is null exactly when its reason is a string. */
function rowSemantics(row) {
  const reasons = key => obj({ stage_lifecycle_reasons: obj({ [key]: { type: 'string' } }, [key]) }, ['stage_lifecycle_reasons']);
  const noReason = key => obj({ stage_lifecycle_reasons: obj({ [key]: { type: 'null' } }, [key]) }, ['stage_lifecycle_reasons']);
  for (const key of ['current_stage', 'entered_at_ms', 'days_in_stage'])
    add(row, { if: isNull(key), then: reasons(key), else: noReason(key) });
  // The two entry facts travel together: days without an entry time is meaningless.
  add(row, { if: { not: isNull('days_in_stage') }, then: { not: isNull('entered_at_ms') } });
  // A published stage is the row's own single visible stage. One visible stage may still be withheld (a stage filter hid the others).
  for (const stage of STAGES) add(row, { if: isField('current_stage', stage),
    then: obj({ stage_presence: { type: 'array', minItems: 1, maxItems: 1, items: { const: stage } } }, ['stage_presence']) });
  add(row, { if: obj({ stage_presence: { type: 'array', maxItems: 0 } }, ['stage_presence']),
    then: obj({ stage_lifecycle_reasons: obj({ current_stage: { const: 'STAGE_FIELD_NOT_PUBLISHED' } }, ['current_stage']) }, ['stage_lifecycle_reasons']),
    else: { if: isNull('current_stage'),
      then: obj({ stage_lifecycle_reasons: obj({ current_stage: { const: 'MULTIPLE_ACTIVE_STAGES' } }, ['current_stage']) }, ['stage_lifecycle_reasons']) } });
}

/** Amend the response items and the standalone row schema. Call after the P1 amendments. */
export function amendManagerLifecycleSchemas({ response, row }) {
  if (!response?.properties?.items?.items?.properties?.current_stage || !response.properties.stage_lifecycle)
    throw new Error('Manager lifecycle runtime schema must be integrated before semantic generation');
  rowSemantics(response.properties.items.items);
  if (row) rowSemantics(row);
}

const deriveRow = row => {
  const stages = [...new Set(row.stage_presence)];
  const single = stages.length === 1 ? stages[0] : null;
  return { current_stage: single, entered_at_ms: null, days_in_stage: null,
    stage_lifecycle_reasons: { current_stage: single !== null ? null : stages.length === 0 ? 'STAGE_FIELD_NOT_PUBLISHED' : 'MULTIPLE_ACTIVE_STAGES',
      entered_at_ms: 'STAGE_ENTRY_TIME_NOT_PUBLISHED', days_in_stage: 'STAGE_ENTRY_TIME_NOT_PUBLISHED' } };
};

/** Idempotent: give an existing synthetic dataset fixture the lifecycle keys. */
export function attachManagerLifecycleSynthetic(base) {
  if (base.lane !== lane) throw new Error('TEST_ONLY fixture lane required');
  const sample = clone(base);
  sample.value.stage_lifecycle = clone(MANAGER_STAGE_LIFECYCLE_POLICY);
  sample.value.items = sample.value.items.map(row => ({ ...row, ...deriveRow(row) }));
  return sample;
}

const retarget = (value, from, to) => {
  if (Array.isArray(value)) return value.map(v => retarget(v, from, to));
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, k === 'economic_domain' && v === from ? to : retarget(v, from, to)]));
  return value;
};

/**
 * Live-environment dataset with the two honest shapes: a row in one stage
 * (current_stage published) and a row in Canary AND Live (no single stage, so
 * null with MULTIPLE_ACTIVE_STAGES). Entry time is absent on both.
 */
export function managerLifecycleLiveSyntheticFixture(rows) {
  if (rows.lane !== lane) throw new Error('TEST_ONLY fixture lane required');
  const sample = retarget(clone(rows), 'PAPER', 'ACTUAL');
  const first = sample.value.items[0];
  const make = (suffix, stages) => {
    const item = clone(first);
    item.alpha_id = `TEST_ONLY:alpha-${suffix}`;
    item.row_key = JSON.stringify([item.alpha_id, item.alpha_version_id, item.portfolio_id]);
    item.stage_presence = [...stages].sort();
    item.children = stages.map((stage, index) => ({ ...clone(first.children[0]), alpha_id: item.alpha_id,
      deployment_id: `TEST_ONLY:deployment-${suffix}-${index}`, account_id: `TEST_ONLY:account-${suffix}-${index}`, stage }));
    return { ...item, ...deriveRow(item) };
  };
  sample.value.environment = 'live';
  sample.value.items = [make('single-live', ['LIVE']), make('canary-and-live', ['CANARY', 'LIVE'])];
  sample.value.page = { ...sample.value.page, returned_count: 2, authorized_filtered_count: 2 };
  sample.value.stage_lifecycle = clone(MANAGER_STAGE_LIFECYCLE_POLICY);
  return sample;
}
