import { readFileSync } from 'node:fs';
import { score, pendingScore } from './execution-v2-fixtures.mjs';

/** Synthetic state stories, not product financial facts or authority grants. */
export function workflowFixtures(f, c) {
  const copy = v => structuredClone(v), hash = `sha256:${'b'.repeat(64)}`;
  const command = JSON.parse(readFileSync(new URL('../fixtures/execution-trusted-commands.synthetic.valid.json', import.meta.url), 'utf8'));
  const status = command.ack_only;
  const context = { workspace_id: 'TEST_ONLY:workspace', environment: status.environment, resource: status.resource,
    policy_revision: 'TEST_ONLY:policy', snapshot_ref: 'TEST_ONLY:snapshot', source_as_of_ms: null, observed_at_ms: 1792100000000 };
  const step = (state, receipt_ref = null) => ({ state, receipt_ref });
  const applied = name => step('APPLIED', 'TEST_ONLY:' + name);
  const cases = [], add = (id, gate, schema, response) => cases.push({ id, gate, schema, response: copy(response) });
  const create = { context, requested_economic_capital: '1000', requested_initial_budget: '300', currency: 'USDT',
    create: applied('create'), fund: step('NOT_REQUESTED'), initial_grant: step('NOT_REQUESTED') };
  add('W08-CREATED-UNFUNDED', 'T08-02', 'WorkflowCreate', f.createWorkflow(create));
  add('W08-CREATED-ZERO', 'T08-02', 'WorkflowCreate', f.createWorkflow({ ...create, requested_economic_capital: '0', requested_initial_budget: '0',
    fund: step('NOT_REQUIRED'), initial_grant: step('NOT_REQUIRED') }));
  add('W08-CREATED-FUNDED', 'T08-02', 'WorkflowCreate', f.createWorkflow({ ...create, fund: applied('fund'), initial_grant: applied('grant') }));
  add('W08-ACK-UNKNOWN', 'T08-10', 'WorkflowCapital', f.capitalWorkflow(context, 'USDT', status));
  const capital = (operation, state, amounts) => {
    const resource = operation === 'SET_ROOT_LIMIT' ? { kind: 'ROOT', id: 'TEST_ONLY:root' } : context.resource;
    return f.capitalWorkflow({ ...context, resource }, 'USDT', { ...status, operation, resource,
    business: { state, amounts, receipt_ref: 'TEST_ONLY:owning-receipt', source_event_ref: 'TEST_ONLY:event', revision: '9007199254740993' },
    projection: 'CATCHING_UP', venue: 'NOT_APPLICABLE' });
  };
  add('W08-FUND', 'T08-03', 'WorkflowCapital', capital('FUND', 'APPLIED', { requested: '1000', applied: '1000', pending: '0', cancelled: '0', rejected: '0' }));
  add('W08-TOPUP', 'T08-03', 'WorkflowCapital', capital('TOP_UP', 'APPLIED', { requested: '1000', applied: '1000', pending: '0', cancelled: '0', rejected: '0' }));
  // Target-setting receipts do not imply a source amount partition or transfer.
  add('W08-ROOT-LIMIT-NONAMOUNT', 'T08-03', 'WorkflowCapital', capital('SET_ROOT_LIMIT', 'APPLIED', null));
  add('W08-TARGET-BUDGET-REJECTED-NONAMOUNT', 'T08-04', 'WorkflowCapital', capital('ADJUST_TARGET_BUDGET', 'REJECTED', null));
  add('W08-DECREASE-REJECTED', 'T08-04', 'WorkflowCapital', capital('IMMEDIATE_DECREASE', 'REJECTED', { requested: '1000', applied: '0', pending: '0', cancelled: '0', rejected: '1000' }));
  add('W08-RECALL-PENDING', 'T08-04', 'WorkflowCapital', capital('RECALL_PARTIAL', 'WAITING_ENCUMBRANCE', { requested: '1000', applied: '0', pending: '1000', cancelled: '0', rejected: '0' }));
  add('W08-PARTIAL', 'T08-05', 'WorkflowCapital', capital('RECALL_PARTIAL', 'PARTIALLY_APPLIED', { requested: '1000.000000000000000001', applied: '300', pending: '700.000000000000000001', cancelled: '0', rejected: '0' }));
  add('W08-PARTIAL-CANCELLED', 'T08-05', 'WorkflowCapital', capital('RECALL_PARTIAL', 'PARTIALLY_APPLIED_CANCELLED', { requested: '1000.000000000000000001', applied: '300', pending: '0', cancelled: '700.000000000000000001', rejected: '0' }));
  add('W08-CONFIRM-SOURCE-DARK', 'T08-03', 'WorkflowConfirmation', c.workflowConfirmation.parse({ schema_version: 'portal.execution.workflow-confirmation.v1',
    intent: command.intent, preview: command.preview_blocked,
    before: { economic_backing: null, margin_risk_budget: null, exposure_cap: null, source_receipt_ref: null, source_as_of_ms: null },
    projected_after: { economic_backing: null, margin_risk_budget: null, exposure_cap: null, source_receipt_ref: null, source_as_of_ms: null },
    effect_is_projection_not_receipt: true, source_parent_ref: null, confirm_is_approval: false, physical_transfer_performed: false }));
  const counts = { positions: 0, working_orders: 0, reservations: 0, unknown_outcomes: 0, locks: 0, recalls: 0, settlements: 0, active_children: 0 };
  const lifecycle = { context, operation: 'MOVE_ASSIGNMENT', financial_stage: context.environment === 'paper' ? 'PAPER' : context.environment === 'sandbox' ? 'SANDBOX' : 'CANARY', lifecycle: 'ACTIVE',
    obligations: { counts, coverage: 'COMPLETE', freshness: 'FRESH', source_receipt_ref: 'TEST_ONLY:census' },
    source_portfolio_id: 'TEST_ONLY:P1', destination_portfolio_id: 'TEST_ONLY:P2', remaining_budget: '0',
    source_budget_return: step('NOT_REQUESTED'), destination_budget_grant: step('NOT_REQUESTED'), economic_settlement: step('NOT_REQUESTED'),
    monitor: { state: 'NOT_PROVISIONED', deployment_id: null, origin_deployment_id: null, alpha_version_id: null, params_digest: null,
      lineage_receipt_ref: null, reason: null, effective_at_ms: null, approved_config_digest: null,
      last_observation_ms: null, virtual_capital: null, currency: null } };
  const prerequisites = { current_source_access: true, current_destination_access: true, exact_instance_selected: true,
    source_operation_qualified: true, inherited_restriction: false, residual_disposition_receipt_ref: null };
  add('W08-INHERITED-LOCK', 'T08-06', 'WorkflowLifecycle', f.lifecycleWorkflow({ ...lifecycle, operation: 'RESUME' }, { ...prerequisites, inherited_restriction: true }));
  add('W08-EXACT-INSTANCE', 'T08-07', 'WorkflowLifecycle', f.lifecycleWorkflow(lifecycle, { ...prerequisites, exact_instance_selected: false }));
  add('W08-PENDING-DRAIN', 'T08-08', 'WorkflowLifecycle', f.lifecycleWorkflow({ ...lifecycle, obligations: { ...lifecycle.obligations, counts: { ...counts, working_orders: 3 } } }, prerequisites));
  add('W08-MOVE-RECEIPTS-MISSING', 'T08-08', 'WorkflowLifecycle', f.lifecycleWorkflow(lifecycle, prerequisites));
  add('W08-MOVE-REVIEW-ONLY', 'T08-08', 'WorkflowLifecycle', f.lifecycleWorkflow({ ...lifecycle, source_budget_return: applied('return'), destination_budget_grant: applied('target-grant'), economic_settlement: applied('residual') }, prerequisites));
  add('W08-REBIND-DISABLED', 'T08-09', 'WorkflowLifecycle', f.lifecycleWorkflow({ ...lifecycle, operation: 'REBIND' }, { ...prerequisites, source_operation_qualified: false }));
  add('W08-ARCHIVE-RESIDUAL', 'T08-13', 'WorkflowLifecycle', f.lifecycleWorkflow({ ...lifecycle, operation: 'ARCHIVE', lifecycle: 'ARCHIVE_REQUESTED',
    obligations: { ...lifecycle.obligations, counts: { ...counts, positions: 1 } } }, prerequisites));
  add('W08-ARCHIVE-MONITOR-MISSING', 'T08-13', 'WorkflowLifecycle', f.lifecycleWorkflow({ ...lifecycle, operation: 'CREATE_PAPER_MONITOR', lifecycle: 'ARCHIVED' }, prerequisites));
  add('W08-PAPER-MONITOR-LINEAGE', 'T08-13', 'WorkflowLifecycle', f.lifecycleWorkflow({ ...lifecycle, operation: 'CREATE_PAPER_MONITOR', lifecycle: 'ARCHIVED',
    monitor: { state: 'RUNNING', deployment_id: 'TEST_ONLY:monitor', origin_deployment_id: 'TEST_ONLY:original',
      alpha_version_id: 'TEST_ONLY:av', params_digest: hash, lineage_receipt_ref: 'TEST_ONLY:clone', reason: 'ARCHIVE_MONITOR',
      effective_at_ms: 1792099900000, approved_config_digest: hash, last_observation_ms: 1792099990000,
      virtual_capital: '1000', currency: 'USDT' } }, prerequisites));
  add('W08-REACTIVATION', 'T08-13', 'WorkflowLifecycle', f.lifecycleWorkflow({ ...lifecycle, operation: 'REACTIVATE', lifecycle: 'ARCHIVED' }, prerequisites));
  for (const state of ['LOADING', 'AUTHORIZED_EMPTY', 'READY', 'PARTIAL', 'STALE', 'UNAVAILABLE', 'DENIED', 'REVOKED', 'DISCONNECTED', 'RESYNC_REQUIRED', 'INSUFFICIENT_EVIDENCE', 'OUTCOME_UNKNOWN'])
    add('W08-READ-' + state, 'T08-10', 'WorkflowReadState', f.readWorkflowState(state, { source_as_of_ms: context.source_as_of_ms, observed_at_ms: context.observed_at_ms }));
  const navigation = { schema_version: 'portal.execution.workflow-navigation.v1', workspace_id: 'TEST_ONLY:workspace', view: 'MANAGER',
    financial_stage_filter: 'ALL', lifecycle_filter: 'ACTIVE', environment: null, currency: 'USDT', window: { from_ms: 1792000000000, to_ms: 1792100000000 },
    portfolio_id: 'TEST_ONLY:P1', alpha_id: 'TEST_ONLY:A1', deployment_id: 'TEST_ONLY:D1', query_revision: 'TEST_ONLY:q1',
    origin: { run_id: 'TEST_ONLY:run', release_candidate_id: 'TEST_ONLY:rc', approval_id: 'TEST_ONLY:approval', gate: 'R1', review_id: null, evidence_set_hash: hash },
    economic_aggregation: 'EXPLICIT_AUTHORIZED_PARTITION_ONLY', saved_view_grants_access: false };
  add('W08-MANAGER-NAVIGATION', 'T08-11', 'WorkflowNavigation', c.workflowNavigation.parse(navigation));
  add('W08-OWN-SLICE-NAVIGATION', 'T08-17', 'WorkflowNavigation', c.workflowNavigation.parse({ ...navigation, view: 'OWN_SLICE' }));
  for (const stage of ['PAPER', 'SANDBOX', 'CANARY', 'LIVE']) add('W08-STAGE-' + stage, 'T08-12', 'WorkflowNavigation', c.workflowNavigation.parse({ ...navigation,
    financial_stage_filter: stage, environment: stage === 'PAPER' ? 'paper' : stage === 'SANDBOX' ? 'sandbox' : 'live' }));
  add('W08-ARCHIVE-FILTER', 'T08-12', 'WorkflowNavigation', c.workflowNavigation.parse({ ...navigation, lifecycle_filter: 'ARCHIVED' }));
  const presentation = (canonical_score, headline, facet = 'ACTUAL', public_copy_key = 'PROVISIONAL') => ({ canonical_score, facet, headline, public_copy_key,
    regime_changes_score: false, analytics_gates_safety_action: false });
  const raw = copy(score); raw.components.P = '80'; raw.components.R = '66'; raw.components.B = '70';
  for (const [key, normalized, contribution] of [['mdd', '66', '11.88'], ['add', '66', '7.92'], ['positive_block_ratio', '70', '8.75'], ['stress_excess_twr', '70', '8.75']])
    Object.assign(raw.components.atomic[key], { normalized, contribution });
  add('W08-Q73-3', 'T08-15', 'WorkflowScorePresentation', presentation(raw, 'RAW_QUALITY'));
  add('W08-CONTRIBUTION', 'T08-15', 'WorkflowScorePresentation', presentation({ ...raw, kind: 'CONTRIBUTION', value: '18.325', quality_band: null,
    allocation_weight: '0.25', raw_score_ref: 'TEST_ONLY:q73.3' }, 'ALLOCATION_CONTRIBUTION_NO_BAND'));
  add('W08-DIRECT', 'T08-15', 'WorkflowScorePresentation', presentation({ ...raw, kind: 'DIRECT_NAV', subject_type: 'portfolio', research_binding_ref: null }, 'CONSOLIDATED_NAV_QUALITY'));
  add('W08-COMPOSITION', 'T08-15', 'WorkflowScorePresentation', presentation({ ...raw, kind: 'COMPOSITION', subject_type: 'portfolio', provisional_allocated_weight: '0.25', score_coverage_allocated: '1' }, 'ALLOCATED_CAPITAL_COMPOSITION'));
  add('W08-EARLY-5D', 'T08-16', 'WorkflowScorePresentation', presentation({ ...raw, requested_window: { start_ms: 1702080000000, end_exclusive_ms: 1704672000000 },
    effective_window: { start_ms: 1704240000000, end_exclusive_ms: 1704672000000 }, sample_count: 120, observed_duration_ms: 432000000, actual_duration_ms: 432000000 }, 'DIAGNOSTIC_ONLY', 'EARLY', 'EARLY_WINDOW'));
  add('W08-MIXED-70D-ACTUAL-10D', 'T08-16', 'WorkflowScorePresentation', presentation({ ...raw, series_kind: 'MIXED_FORWARD_DIAGNOSTIC', economic_domain: 'MIXED_DIAGNOSTIC',
    requested_window: { start_ms: 1698624000000, end_exclusive_ms: 1704672000000 }, effective_window: { start_ms: 1698624000000, end_exclusive_ms: 1704672000000 },
    observed_duration_ms: 6048000000, actual_duration_ms: 864000000,
    stage_breakdown: [{ financial_stage: 'PAPER', duration_ms: 3456000000 }, { financial_stage: 'SANDBOX', duration_ms: 1728000000 }, { financial_stage: 'LIVE', duration_ms: 864000000 }] }, 'DIAGNOSTIC_ONLY', 'MIXED_OBSERVATION', 'MIXED_NOT_ACTUAL'));
  add('W08-POLICY-PENDING', 'T08-14', 'WorkflowScorePresentation', presentation(pendingScore, 'RAW_QUALITY', 'ACTUAL', 'SCORE_POLICY_PENDING'));
  const actions = [
    ['CREATE_PORTFOLIO', 'portfolio.manage', 'WorkflowCreate'], ['REGISTER_INSTANCE', 'deployment.register', 'WorkflowCreate'],
    ...['FUND', 'INITIAL_GRANT', 'TOP_UP', 'IMMEDIATE_DECREASE', 'RECALL_PARTIAL', 'RECALL_FULL', 'ADJUST_TARGET_BUDGET', 'SET_ROOT_LIMIT'].map(op => [op, 'capital.' + op.toLowerCase(), 'WorkflowCapital']),
    ['RETURN_CAPITAL', 'capital.return_capital', 'WorkflowCapital'], ['APPLY_PENDING', null, 'WorkflowCapital'], ['CANCEL_REMAINING', null, 'WorkflowCapital'],
    ['REALLOCATE_BUDGET', null, 'WorkflowCapital'], ['ADMIN_LOCK', null, 'WorkflowLifecycle'], ['ADMIN_UNLOCK', null, 'WorkflowLifecycle'],
    ['HALT', 'safety.halt', 'WorkflowLifecycle'], ['REDUCING', 'safety.reducing', 'WorkflowLifecycle'], ['RESUME', 'safety.resume', 'WorkflowLifecycle'],
    ['MOVE_ASSIGNMENT', 'deployment.assignment.propose', 'WorkflowLifecycle'], ['REBIND', 'binding.change.propose', 'WorkflowLifecycle'],
    ['ARCHIVE', null, 'WorkflowLifecycle'], ['CREATE_PAPER_MONITOR', null, 'WorkflowLifecycle'], ['REACTIVATE', null, 'WorkflowLifecycle'],
  ].map(([operation, capability_ref, state_schema]) => {
    const bridge = ['FUND', 'INITIAL_GRANT', 'TOP_UP', 'IMMEDIATE_DECREASE', 'RECALL_PARTIAL', 'RECALL_FULL', 'ADJUST_TARGET_BUDGET', 'SET_ROOT_LIMIT'].includes(operation);
    return c.workflowAction.parse({ operation, capability_ref, dataset_refs: ['EXACT_RESOURCE_REGISTRY', 'CURRENT_SCOPED_AUTHORITY', 'OWNING_RECEIPTS'],
      preview_operation_id: bridge ? 'executionCapitalCommandPreviewV1' : null, submit_operation_id: bridge ? 'executionCapitalCommandSubmitV1' : null,
      status_operation_id: bridge ? 'executionCapitalCommandStatusV1' : null,
      state_schema: ['RETURN_CAPITAL', 'APPLY_PENDING', 'CANCEL_REMAINING', 'REALLOCATE_BUDGET', 'ADMIN_LOCK', 'ADMIN_UNLOCK', 'HALT', 'REDUCING'].includes(operation) ? null : state_schema,
      commissioning: bridge ? 'TECHNICAL_SOURCE_DARK' : capability_ref === null ? 'EXACT_ACTION_CATALOGUE_PENDING' : 'SOURCE_ADAPTER_PENDING',
      runtime_enabled: false, public_copy_key: 'SOURCE_NOT_QUALIFIED' });
  });
  const screens = [
    ['M01', null, 'PROPOSED', 'executionManagerFundOverviewGetV1'], ['M02', '/deployments/portfolios', 'EXISTING_DETAIL_REQUIRES_DIRECTORY_REFINEMENT', 'executionManagerPortfolio360GetV1'],
    ['M03', '/deployments/alphas', 'EXISTING_SOURCE_ROUTE', 'executionManagerFleetGetV1'], ['M04', '/deployments/portfolios/:id', 'EXISTING_SOURCE_ROUTE', 'executionManagerPortfolio360GetV1'],
    ['M05', '/deployments/alphas/:id', 'EXISTING_SOURCE_ROUTE', 'executionManagerAlpha360GetV1'], ['M06', '/deployments/accounts/:id', 'EXISTING_SOURCE_ROUTE', 'executionManagerAccount360GetV1'],
    ['M07', '/deployments/:environment/:id', 'EXISTING_SOURCE_ROUTE', 'executionManagerDeployment360GetV1'], ['M08', null, 'PROPOSED', null],
    ['M09', '/execution/operations', 'EXISTING_SOURCE_ROUTE', 'executionCapitalCommandStatusV1'], ['M10', '/administration/profile-access', 'EXISTING_SOURCE_ROUTE', null],
  ].map(([screen_id, ui_route, route_state, read]) => c.workflowScreen.parse({ screen_id, scope: 'BOTH_WITH_DISTINCT_PROJECTION', ui_route, route_state,
    read_operation_ids: read ? [read] : [], source_qualified: false, consumer_status: 'AWAITING_CONSUMER_REVIEW' }));
  return { schema_version: 'portal.execution.workflow-fixtures.v1', lane: 'TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT', production_config: false,
    cases, actions, screens, presets: [
      { principal_ref: 'TEST_ONLY:protected-owner', preset: 'PROTECTED_OWNER', business_visibility: 'ALL_BUSINESS', mutation_scope: 'EXPLICIT_CAPABILITIES_ONLY', delegation_ceiling: 'PROTECTED_OWNER_POLICY_REQUIRED' },
      { principal_ref: 'TEST_ONLY:manager', preset: 'MANAGER', business_visibility: 'ALL_BUSINESS', mutation_scope: 'EXPLICIT_CAPABILITIES_ONLY', delegation_ceiling: 'EXPLICIT_DELEGATION_REQUIRED' },
      { principal_ref: 'TEST_ONLY:researcher', preset: 'RESEARCHER', business_visibility: 'OWN_AUTHORIZED_SLICE', mutation_scope: 'EXPLICIT_CAPABILITIES_ONLY', delegation_ceiling: 'NONE_BY_DISCOVERY' },
    ] };
}
