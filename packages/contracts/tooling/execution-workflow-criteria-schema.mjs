/** C5 presentation schema emitter. No I/O or authority.
 * Effects stripped by the existing workflow generator are restored where JSON
 * Schema can express them. Identity joins, evidence equality and sibling time
 * comparisons remain explicit runtime obligations, not invented AJV extensions.
 */
const at = (path, leaf) => path.split('.').reduceRight((v, k) => ({ type: 'object', properties: { [k]: v }, required: [k] }), leaf);
const is = (path, value) => at(path, { const: value });
const choose = (condition, then, otherwise) => ({ if: condition, then, ...(otherwise === undefined ? {} : { else: otherwise }) });
const nonnull = path => at(path, { not: { type: 'null' } });
const nil = path => at(path, { type: 'null' });
const all = (...allOf) => ({ allOf });
const display = (path, values) => Object.entries(values).map(([value, result]) => choose(is(path, value), is('display_class', result)));

function decorate(schema) {
  if (!schema || typeof schema !== 'object') return;
  for (const v of Object.values(schema)) {
    if (Array.isArray(v)) v.forEach(decorate); else if (v && typeof v === 'object') decorate(v);
  }
  if (schema.type === 'string' && schema.minLength === 1 && !schema.enum && !schema.pattern && schema.maxLength === undefined)
    Object.assign(schema, { maxLength: 191, pattern: '^[^\\u0000-\\u001f\\u007f]+$' });
  const p = schema.properties;
  if (!p) return;
  if (p.workspace_id) Object.assign(p.workspace_id, { minLength: 3, maxLength: 96 });
  for (const name of ['approval_version', 'quorum_required', 'review_version', 'workflow_version', 'revision', 'expected_certification_version'])
    if (p[name]) p[name].minimum = 1;
  // Exact reused public text refinements count Unicode code points. IDs already
  // have an ASCII pattern and/or length cap. Workspace has its separate bound.
  const rules = [];
  if (p.display_class && p.gate?.const === 'PAPER_EXIT') rules.push(...display('original.outcome', {
    PASS: 'PASS', WATCH: 'CAUTION', FAIL: 'FAIL', INSUFFICIENT: 'NO_VERDICT' }));
  if (p.display_class && p.gate?.const === 'SANDBOX') {
    rules.push(...display('original.stored_evaluation_state', { PASS: 'PASS', FAIL: 'FAIL', STALE: 'STALE', UNAVAILABLE: 'NO_VERDICT' }),
      choose(nil('original.stored_evaluation_state'), is('display_class', 'NO_VERDICT')),
      choose(nil('original.evidence_id'), is('evidence.availability', 'NOT_PUBLISHED'), is('evidence.availability', 'AVAILABLE')));
  }
  if (p.step_key && p.availability) rules.push(choose(is('availability', 'NOT_RECORDED'),
    all(...['evidence_id', 'stored_evaluation_state', 'source_authority', 'source_verification_state', 'as_of_ms', 'expires_at_ms'].map(nil)),
    all(...['evidence_id', 'stored_evaluation_state', 'source_authority', 'source_verification_state'].map(nonnull))));
  if (p.freshness_state && p.poll_interval_ms) rules.push(
    choose(is('freshness_state', 'OK'), nonnull('as_of_ms')),
    choose(is('source_completeness', 'POLL_BOUNDED'), nonnull('poll_interval_ms'), nil('poll_interval_ms')));
  if (p.gate?.const === 'SANDBOX' && p.criteria) {
    const keys = p.criteria.items.properties.original.properties.step_key.enum;
    p.criteria.allOf = keys.map(key => ({ contains: at('original.step_key', { const: key }), minContains: 1, maxContains: 1 }));
  }
  if (p.reason_code?.enum?.includes('CURRENT_PUBLIC_PARENT_HAS_NO_CRITERIA')) rules.push(choose(
    at('gate', { enum: ['PAPER_EXIT', 'SANDBOX'] }), is('reason_code', 'PARENT_FIELD_PURPOSE_NOT_QUALIFIED'),
    is('reason_code', 'CURRENT_PUBLIC_PARENT_HAS_NO_CRITERIA')));
  if (p.family?.const === 'R2') rules.push(is('approval.gate', 'R2'));
  if (p.family?.const === 'PAPER_EXIT') rules.push(is('approval.gate', 'PAPER_EXIT'));
  if (p.review_state) rules.push(choose(is('review_state', 'EXTENDED'),
    all(is('extension_days', 14), nonnull('extended_until_ms')), all(nil('extension_days'), nil('extended_until_ms'))));
  if (p.workflow_state && p.submitted_at_ms) rules.push(
    choose(is('workflow_state', 'DRAFT'), nil('submitted_at_ms'), nonnull('submitted_at_ms')),
    choose(at('workflow_state', { enum: ['APPROVED', 'DENIED'] }), nonnull('decided_at_ms'), nil('decided_at_ms')));
  if (p.previous_envelope_id && p.revision) rules.push(choose(is('revision', 1), nil('previous_envelope_id'), nonnull('previous_envelope_id')));
  if (rules.length) schema.allOf = [...(schema.allOf ?? []), ...rules];
}

export function workflowCriteriaSchemas(contract, json) {
  const names = {
    WorkflowPaperCriterion: 'paperCriterionCapsule', WorkflowSandboxCriterion: 'sandboxCriterionCapsule',
    WorkflowPaperCriteria: 'workflowPaperCriteria', WorkflowSandboxCriteria: 'workflowSandboxCriteria',
    WorkflowCriteriaCapsules: 'workflowCriteriaCapsules', WorkflowRecordedPortal: 'workflowRecordedPortal',
  };
  return Object.fromEntries(Object.entries(names).map(([name, key]) => {
    const schema = json(contract[key]); decorate(schema);
    schema.description = 'Schema-only projection of an already-authorized finite public Portal parent. Does not grant access, qualify a command, load private metrics, recalculate stored verdicts or assert source stage/history. Existing parent HTTP responses and reviewed field-purpose digests are unchanged.';
    schema.$comment = 'Runtime additionally enforces Paper panel/finding identity joins and uniqueness; exact Sandbox evidence-ID equality; Paper review-ID equality; and original approval/review/certification timestamp ordering. Ordinary JSON Schema cannot compare arbitrary sibling values. Consumer must validate the exact original parent before projection, and must not treat schema validation as current authority.';
    return [name, schema];
  }));
}
