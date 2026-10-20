// BE-P14 / RV-12: the named scenario and refusal definitions. Pure data: the answers are read from the REAL ScopedManagerReader by the
// control-api spec `elp2-manager-scoped-fixtures.spec.ts` (capture mode writes execution-manager-scoped-capture.json; verify mode re-reads and compares),
// then published by generate-execution-manager-scoped.mjs. One scenario per dimension plus the combined worst case; deliberately NOT a Cartesian product.
import { topologyWorld, gridWorld } from './execution-manager-scoped-world.mjs';

export const WORLDS = { TOPOLOGY: () => topologyWorld(), // Alpha 0 holds one allocation per wide currency plus the USD balance of its account: 199 + 1 = 200 totals (the bound); 200 + 1 = 201 is over it.
  GRID_101: () => gridWorld({ alphas: 101, wide_currencies: 199 }), GRID_OVER_BOUND: () => gridWorld({ alphas: 2, wide_currencies: 200 }) };

/** `pages` > 1 follows next_cursor. `file` picks the published fixture the scenario lands in. */
export const SCENARIOS = [
  { id: 'portfolios-owner-all', file: 'scenarios', level: 'L2', world: 'TOPOLOGY', principal: 'OWNER', surface: 'PORTFOLIOS', query: { environment: 'all' },
    covers: ['PORTFOLIOS dataset non-empty', 'multi-environment (paper, sandbox, live)', 'multi-currency (one portfolio holds USD and EUR; totals are per currency)',
      'null, "0" and an unstated currency are three different things', 'a shared physical account is not attributed to either child portfolio (no double count)'] },
  { id: 'bindings-owner-live', file: 'scenarios', level: 'L1', world: 'TOPOLOGY', principal: 'OWNER', surface: 'BINDINGS', query: { environment: 'live' },
    covers: ['BINDINGS dataset non-empty', 'the shared account balance is stated exactly once, on the binding that owns the account', 'an explicit null allocation keeps its currency total null'] },
  { id: 'binding-detail-owner-live', file: 'scenarios', level: 'L1', world: 'TOPOLOGY', principal: 'OWNER', surface: 'BINDING_DETAIL', query: { environment: 'live' },
    bindingId: 'binding_TEST_ONLY_B2', covers: ['BINDING_DETAIL: one binding, its two instances on one shared account'] },
  { id: 'fleet-researcher-paper', file: 'scenarios', level: 'L2', world: 'TOPOLOGY', principal: 'RESEARCHER', surface: 'ALPHA_FLEET', query: { environment: 'paper' },
    covers: ['researcher-scoped authorized subset: role and scope are applied BEFORE aggregation (peer alpha A3 and portfolio P3 appear nowhere)',
      'a physical account shared with an invisible peer is not published as the researcher\'s balance'] },
  { id: 'fleet-owner-paper-chain', file: 'scenarios', level: 'L2', world: 'TOPOLOGY', principal: 'OWNER', surface: 'ALPHA_FLEET', query: { environment: 'paper', limit: 1 }, pages: 3,
    covers: ['has_more true across a 3 page chain', 'stable signed cursors: after on pages 2 and 3, previous_cursor walks back', 'visible_count is the authorized total, never a global count'] },
  { id: 'fleet-researcher-all-pending-unrecorded', file: 'scenarios', level: 'L2', world: 'TOPOLOGY', principal: 'RESEARCHER', surface: 'ALPHA_FLEET', query: { environment: 'all', limit: 1 },
    options: { policyPending: ['sandbox'], unrecorded: ['live'] },
    covers: ['combined worst case: researcher + all environments + has_more true', 'sandbox DENIED, policy pending', 'live UNAVAILABLE, no snapshot recorded (nothing connected to read)'] },
  { id: 'fleet-researcher-all-denied-unavailable', file: 'scenarios', level: 'L1', world: 'TOPOLOGY', principal: 'RESEARCHER', surface: 'ALPHA_FLEET', query: { environment: 'all' },
    options: { granted: ['paper', 'sandbox'], accessFails: ['sandbox'] },
    covers: ['live DENIED, no current grant (never granted or revoked: the contract does not distinguish)', 'sandbox UNAVAILABLE, authority layer failed'] },
  { id: 'portfolios-grid-bounded', file: 'bounded', level: 'L2', world: 'GRID_101', principal: 'OWNER', surface: 'PORTFOLIOS', query: { environment: 'paper', limit: 100 },
    covers: ['large but bounded: 100 items in one page (the maximum), has_more true, one item at the 200 currency-total bound'] },
];

/** Runtime refusals answered by the real reader with `status` + `code`. `variant` names the fixed setup the spec performs. */
export const REFUSALS = [
  { id: 'cursor/changed-query', level: 'L3', status: 400, code: 'CURSOR_CONTEXT_MISMATCH', world: 'TOPOLOGY', principal: 'OWNER', surface: 'ALPHA_FLEET',
    rule: 'a cursor binds the exact query: page 2 of one query cannot be reused with another search', variant: { cursor: 'next-of-page-1', query: { environment: 'paper', limit: 1, search: 'Aurora' } } },
  { id: 'cursor/wrong-direction', level: 'L3', status: 400, code: 'CURSOR_CONTEXT_MISMATCH', world: 'TOPOLOGY', principal: 'OWNER', surface: 'ALPHA_FLEET',
    rule: 'an after cursor is not a before cursor', variant: { cursor: 'next-of-page-1', as: 'before', query: { environment: 'paper', limit: 1 } } },
  { id: 'cursor/other-workspace', level: 'L3', status: 400, code: 'CURSOR_CONTEXT_MISMATCH', world: 'TOPOLOGY', principal: 'OWNER', surface: 'ALPHA_FLEET',
    rule: 'a cursor minted for one workspace is refused in another', variant: { cursor: 'next-of-page-1', workspace_id: 'workspace_TEST_ONLY_OTHER', query: { environment: 'paper', limit: 1 } } },
  { id: 'cursor/tampered', level: 'L3', status: 400, code: 'INVALID_CURSOR', world: 'TOPOLOGY', principal: 'OWNER', surface: 'ALPHA_FLEET',
    rule: 'a cursor with an altered signature is invalid', variant: { cursor: 'next-of-page-1', tamper: true, query: { environment: 'paper', limit: 1 } } },
  { id: 'cursor/expired', level: 'L3', status: 400, code: 'CURSOR_EXPIRED', world: 'TOPOLOGY', principal: 'OWNER', surface: 'ALPHA_FLEET',
    rule: 'a cursor is valid for 900 seconds', variant: { cursor: 'next-of-page-1', advance_seconds: 901, query: { environment: 'paper', limit: 1 } } },
  { id: 'cursor/source-moved', level: 'L3', status: 400, code: 'CURSOR_CONTEXT_MISMATCH', world: 'TOPOLOGY', principal: 'OWNER', surface: 'ALPHA_FLEET',
    rule: 'a new source revision is a new query: the old cursor is not carried over', variant: { cursor: 'next-of-page-1', options: { sourceRevision: 'z' }, query: { environment: 'paper', limit: 1 } } },
  { id: 'read/revoked-mid-request', level: 'L3', status: 409, code: 'EXECUTION_READ_ACCESS_CHANGED', world: 'TOPOLOGY', principal: 'RESEARCHER', surface: 'ALPHA_FLEET',
    rule: 'authority that changes between the read and the delivery fence refuses the whole response', options: { revokeAfterPublicationReads: 1 }, query: { environment: 'paper' } },
  { id: 'read/single-environment-not-recorded', level: 'L1', status: 503, code: 'EXECUTION_READ_AUTHORITY_UNAVAILABLE', world: 'TOPOLOGY', principal: 'OWNER', surface: 'ALPHA_FLEET',
    rule: 'one named environment with no recorded snapshot is unavailable, not empty', options: { unrecorded: ['live'] }, query: { environment: 'live' } },
  { id: 'read/single-environment-not-granted', level: 'L1', status: 404, code: 'EXECUTION_READ_NOT_AVAILABLE', world: 'TOPOLOGY', principal: 'RESEARCHER', surface: 'ALPHA_FLEET',
    rule: 'one named environment without a current grant does not exist for the reader', options: { granted: ['paper'] }, query: { environment: 'live' } },
  { id: 'read/single-environment-policy-pending', level: 'L1', status: 403, code: 'EXECUTION_READ_POLICY_PENDING', world: 'TOPOLOGY', principal: 'RESEARCHER', surface: 'ALPHA_FLEET',
    rule: 'a reviewed policy that is still pending admits no scoped read', options: { policyPending: ['paper'] }, query: { environment: 'paper' } },
  { id: 'read/all-environments-denied', level: 'L1', status: 404, code: 'EXECUTION_READ_NOT_AVAILABLE', world: 'TOPOLOGY', principal: 'RESEARCHER', surface: 'ALPHA_FLEET',
    rule: 'when every environment is denied the request is refused, not an empty page', options: { granted: [] }, query: { environment: 'all' } },
  { id: 'read/field-policy-pending', level: 'L1', status: 503, code: 'EXECUTION_READ_FIELD_POLICY_PENDING', world: 'TOPOLOGY', principal: 'RESEARCHER', surface: 'ALPHA_FLEET',
    rule: 'a researcher field policy that does not qualify the resource id publishes nothing', options: { researcherFieldsWithout: ['alpha_id'] }, query: { environment: 'paper' } },
  { id: 'read/query-field-not-authorized', level: 'L1', status: 400, code: 'EXECUTION_READ_NOT_AVAILABLE', world: 'TOPOLOGY', principal: 'RESEARCHER', surface: 'ALPHA_FLEET',
    rule: 'a hidden field is not a search, sort or filter oracle', options: { researcherFieldsWithout: ['name'] }, query: { environment: 'paper', search: 'Aurora' } },
  { id: 'read/over-bound-is-refused-not-truncated', level: 'L3', status: 503, code: 'EXECUTION_READ_AUTHORITY_UNAVAILABLE', world: 'GRID_OVER_BOUND', principal: 'OWNER', surface: 'PORTFOLIOS',
    rule: 'an item that would need 201 currency totals (bound 200) is refused whole; the producer never drops a currency to fit', query: { environment: 'paper' } },
  { id: 'read/binding-detail-unknown', level: 'L1', status: 404, code: 'EXECUTION_READ_NOT_AVAILABLE', world: 'TOPOLOGY', principal: 'OWNER', surface: 'BINDING_DETAIL',
    rule: 'a binding the reader cannot see is not found', bindingId: 'binding_TEST_ONLY_UNKNOWN', query: { environment: 'live' } },
];
