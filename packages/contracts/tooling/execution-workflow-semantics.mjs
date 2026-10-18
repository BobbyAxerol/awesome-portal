/** Representable structural refinements of the existing canonical Zod
 * Create/Lifecycle/Navigation/Confirmation contracts. Pure emitter: no generator imports,
 * source reads, runtime authority, arithmetic extensions or new semantics.
 * Capital/Score keep their existing separate canonical emitters/definitions. */
const ZERO = '^0(?:\\.0+)?$';
// Nullable objects must not satisfy a nested condition vacuously.
const at = (path, leaf) => path.split('.').reduceRight((child, key) => ({
  type: 'object', properties: { [key]: child }, required: [key],
}), leaf);
const all = (...allOf) => ({ allOf });
const any = (...anyOf) => ({ anyOf });
const is = (path, value) => at(path, { const: value });
const not = rule => ({ not: rule });
const choose = (condition, yes, no) => ({ if: condition, then: yes, ...(no === undefined ? {} : { else: no }) });
const zero = path => at(path, { type: 'string', pattern: ZERO });
const state = value => is('state', value);
const steps = ['create', 'fund', 'initial_grant'];

export function workflowStructuralRefinements(contract, json) {
  // Names come from the same canonical count object, not another census.
  const counts = Object.keys(json(contract.workflowObligationCounts).properties);
  const countRule = resume => at('obligations.counts', {
    type: 'object', required: counts,
    properties: Object.fromEntries(counts.map(key => [key,
      !resume || ['locks', 'recalls', 'unknown_outcomes'].includes(key) ? { const: 0 } : { type: 'integer' }])),
  });
  const applied = path => is(path + '.state', 'APPLIED');
  // This is the exact priority order of deriveCreateWorkflowState. Do not
  // flatten UNKNOWN/REJECTED conditions into overlapping independent rules.
  const derivedCreate = choose(any(...steps.map(step => is(step + '.state', 'UNKNOWN'))), state('OUTCOME_UNKNOWN'),
    choose(any(...steps.map(step => is(step + '.state', 'REJECTED'))), state('REJECTED'),
      choose(is('create.state', 'NOT_REQUESTED'), state('DRAFT'),
        choose(not(applied('create')), state('CREATE_PENDING'),
          choose(all(not(zero('requested_economic_capital')), not(applied('fund'))),
            choose(is('fund.state', 'PENDING'), state('FUNDING_PENDING'), state('CREATED_UNFUNDED')),
            choose(all(not(zero('requested_initial_budget')), not(applied('initial_grant'))), state('BUDGET_PENDING'),
              choose(zero('requested_economic_capital'), state('CREATED_ZERO_CAPITAL'), state('CREATED_WITH_CAPITAL'))))))));
  const ready = is('state', 'READY_FOR_AUTHORITY_REVIEW');
  const requiredMonitorFields = {
    deployment_id: 'string', origin_deployment_id: 'string', alpha_version_id: 'string',
    params_digest: 'string', lineage_receipt_ref: 'string', reason: 'string', effective_at_ms: 'integer',
    approved_config_digest: 'string', virtual_capital: 'string', currency: 'string',
  };
  return {
    WorkflowCreate: [
      not(is('create.state', 'NOT_REQUIRED')),
      choose(zero('requested_economic_capital'), is('fund.state', 'NOT_REQUIRED'), not(is('fund.state', 'NOT_REQUIRED'))),
      choose(zero('requested_initial_budget'), is('initial_grant.state', 'NOT_REQUIRED'), not(is('initial_grant.state', 'NOT_REQUIRED'))),
      choose(not(applied('create')), all(not(applied('fund')), not(applied('initial_grant')))),
      derivedCreate,
    ],
    WorkflowLifecycle: [
      choose(ready, all(
        at('reason_code', { type: 'null' }),
        not(is('operation', 'REACTIVATE')),
        choose(is('lifecycle', 'ARCHIVED'), is('operation', 'CREATE_PAPER_MONITOR')),
        choose(is('lifecycle', 'ARCHIVE_REQUESTED'), not(is('operation', 'RESUME'))),
        is('obligations.coverage', 'COMPLETE'), is('obligations.freshness', 'FRESH'),
        at('obligations.source_receipt_ref', { type: 'string' }),
        choose(is('operation', 'RESUME'), countRule(true), countRule(false)),
        choose(is('operation', 'MOVE_ASSIGNMENT'), all(...['source_budget_return', 'destination_budget_grant', 'economic_settlement'].map(applied))),
        choose(is('operation', 'ARCHIVE'), all(not(is('lifecycle', 'ACTIVE')), zero('remaining_budget'))),
      ), at('reason_code', { type: 'string' })),
      ...Object.entries({ paper: ['PAPER'], sandbox: ['SANDBOX'], live: ['CANARY', 'LIVE'] }).map(([environment, stages]) =>
        choose(is('context.environment', environment), at('financial_stage', { enum: stages }))),
      choose(not(is('monitor.state', 'NOT_PROVISIONED')), all(
        ...Object.entries(requiredMonitorFields).map(([field, type]) => at('monitor.' + field, { type })),
        choose(is('monitor.state', 'RUNNING'), at('monitor.last_observation_ms', { type: 'integer' })),
      )),
      { $comment: 'Canonical runtime additionally checks monitor deployment_id != origin_deployment_id and last_observation_ms >= effective_at_ms. Ordinary JSON Schema has no arbitrary sibling-value comparison. Current source/target authority and pure-projector prerequisites are not installed by this structural schema.' },
    ],
    WorkflowNavigation: [
      choose(is('origin.gate', 'PAPER_EXIT'), at('origin.review_id', { type: 'string' })),
      ...Object.entries({ PAPER: 'paper', SANDBOX: 'sandbox', CANARY: 'live', LIVE: 'live' }).map(([stage, environment]) =>
        choose(is('financial_stage_filter', stage), is('environment', environment))),
      { $comment: 'Canonical runtime additionally requires window.from_ms < window.to_ms when window is not null. ALL does not force environment=null. Navigation is not an authorization grant.' },
    ],
    WorkflowConfirmation: ['before', 'projected_after'].map(path => choose(
      any(...['economic_backing', 'margin_risk_budget', 'exposure_cap'].map(field => at(path + '.' + field, { not: { type: 'null' } }))),
      all(at(path + '.source_receipt_ref', { type: 'string' }), at(path + '.source_as_of_ms', { type: 'integer' })),
    )),
  };
}
