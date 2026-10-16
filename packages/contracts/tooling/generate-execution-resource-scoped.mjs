import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const obj = (properties, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, properties, required });
const nullable = schema => ({ anyOf: [schema, { type: 'null' }] });
const ref = name => ({ $ref: `#/$defs/${name}` });
const array = (items, maxItems = 200) => ({ type: 'array', maxItems, items });
const nil = { type: 'null' };
const text = { type: 'string', minLength: 1, maxLength: 512, pattern: '^[^\\u0000-\\u001f\\u007f]+$(?![\\s\\S])' };
const decimal = { type: 'string', maxLength: 128, pattern: '^-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?$(?![\\s\\S])' };
const integer = { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
const bool = { type: 'boolean' };
const environment = { enum: ['paper', 'sandbox', 'live'] };
const reason = nullable(text);
const states = { enum: ['AVAILABLE', 'EMPTY', 'PARTIAL', 'UNAVAILABLE'] };
const money = new Set(('total free locked signed_qty quantity avg_px_open avg_px_close mark_price realized_pnl unrealized_pnl notional allocated_capital equity drawdown gross_pnl net_pnl fee_total funding_pnl margin_initial margin_maintenance exposure_long exposure_short price trigger_price commission').split(' '));
const counts = new Set(['submitted_count', 'risk_rejected_count', 'broker_rejected_count', 'filled_count']);
const clocks = new Set(['ts', 'created_at', 'updated_at', 'submitted_at', 'trade_time', 'mark_price_at']);
// Closed per-relation public vocabulary. This is not a grant: the runtime
// intersects these raw names with reviewed BUSINESS_READ_FIELDS first.
// Physical custody, external account IDs, errors and source cursors are absent.
const fields = {
  strategies: 'strategy_id alpha_id name version state stage created_at updated_at',
  deployments: 'deployment_id strategy_id account_id mode venue currency portfolio_id state created_at updated_at',
  accounts: 'account_id strategy_id mode venue base_currency state created_at updated_at',
  account_balances: 'account_id currency total locked free updated_at',
  margin_balances: 'account_id instrument_id currency updated_at',
  account_sync: 'account_id mode venue status currency created_at',
  broker_sync: '',
  venue_accounts: 'binding_id account_id mode venue state status created_at updated_at',
  portfolios: 'portfolio_id name owner base_currency state created_at updated_at',
  portfolio_allocations: 'portfolio_id strategy_id deployment_id account_id mode venue currency allocated_capital state created_at updated_at',
  positions: 'position_id strategy_id account_id mode venue instrument_id side signed_qty quantity avg_px_open avg_px_close realized_pnl unrealized_pnl mark_price notional updated_at',
  sessions: 'strategy_id account_id mode venue state submitted_count risk_rejected_count filled_count broker_rejected_count updated_at',
  orders: 'order_id strategy_id account_id mode venue instrument_id symbol side quantity price status submitted_at updated_at risk_grant_id',
  fills: 'fill_id trade_time strategy_id account_id mode venue instrument_id side price quantity realized_pnl',
  performance: 'ts deployment_id strategy_id account_id mode venue instrument_id symbol currency position_qty signed_qty avg_px_open mark_price notional exposure_long exposure_short realized_pnl unrealized_pnl fee_total funding_pnl gross_pnl net_pnl equity created_at',
  account_equity: 'ts deployment_id strategy_id account_id mode venue currency margin_initial margin_maintenance realized_pnl unrealized_pnl fee_total funding_pnl gross_pnl net_pnl equity drawdown created_at',
  portfolio_equity: 'ts portfolio_id currency allocated_capital margin_initial margin_maintenance realized_pnl unrealized_pnl fee_total funding_pnl gross_pnl net_pnl equity drawdown created_at',
  reconciliation: 'account_id strategy_id mode venue status created_at',
  journal: 'mode venue alpha_id account_id state updated_at',
};
const common = 'deployments accounts account_balances margin_balances account_sync broker_sync venue_accounts portfolios portfolio_allocations positions sessions orders fills performance account_equity reconciliation strategies'.split(' ');
const relations = { Alpha: [...common, 'journal'], Portfolio: [...common, 'portfolio_equity'], Account: [...common], Binding: [...common] };
const rowName = alias => alias.split('_').map(s => s[0].toUpperCase() + s.slice(1)).join('') + 'ScopedRow';
const defs = {};
for (const [alias, keys] of Object.entries(fields)) {
  const properties = { profile_environment: environment };
  for (const key of keys.split(' ').filter(Boolean)) {
    properties[key] = nullable(money.has(key) || ['position_qty'].includes(key) ? decimal : counts.has(key) ? { anyOf: [integer, { type: 'string', pattern: '^(?:0|[1-9][0-9]*)$(?![\\s\\S])' }] } : clocks.has(key) ? { anyOf: [text, integer] } : key === 'mode' ? environment : text);
    if (clocks.has(key)) properties[`${key}_ms`] = integer;
  }
  // Resource linkage may add deployment_id only after qualified unique tuple
  // resolution; it never creates an account or financial amount.
  if (alias !== 'broker_sync') properties.deployment_id ??= nullable(text);
  defs[rowName(alias)] = obj(properties, ['profile_environment']);
}
defs.ScopedResourceMetricAvailability = obj({ state: states, reason_code: reason });
defs.ScopedResourceProfileCoverage = obj(Object.fromEntries(environment.enum.map(env => [env, obj({
  profile_id: nullable(text), state: { enum: ['FOUND', 'EMPTY', 'PARTIAL', 'UNAVAILABLE'] }, reason_code: reason,
  projection_epoch: nil, projection_sequence: nil, source_as_of: nil,
})])), []);
defs.ScopedResourceProjection = obj({ environment, epoch: nil, sequence: nil,
  payload_digest: { type: 'string', pattern: '^sha256:[a-f0-9]{64}$(?![\\s\\S])' }, last_successful_refresh_at: nil });
defs.ScopedResourceCapability = obj({ capability_id: text, state: states, relations: { type: 'array', maxItems: 0 }, reason_code: reason, retryable: bool });
defs.ScopedResourceUnavailableBranch = { oneOf: [
  obj({ capability_id: text, state: { enum: ['EMPTY', 'PARTIAL', 'UNAVAILABLE'] }, reason_code: reason, retryable: bool }),
  obj({ capability_id: { const: 'resource.identity' }, environment, state: { enum: ['EMPTY', 'PARTIAL', 'UNAVAILABLE'] }, reason_code: reason, retryable: bool }),
] };
for (const alias of Object.keys(fields)) {
  defs[`${rowName(alias)}Panel`] = obj({
    state: { enum: ['READY', 'EMPTY', 'PARTIAL', 'STALE', 'UNAVAILABLE', 'DENIED', 'ERROR'] },
    data: nullable(obj({ rows: array(ref(rowName(alias))) })),
    clocks: obj({ event_time_ms: nil, source_published_at_ms: nil, received_at_ms: nil, ingested_at_ms: nil,
      processed_at_ms: nil, as_of_ms: nil, read_at_ms: integer }),
    coverage: obj({ from_ms: nil, to_ms: nil, source_total: nullable({ type: 'string', pattern: '^(?:0|[1-9][0-9]*)$(?![\\s\\S])' }),
      filtered_total: nullable({ type: 'string', pattern: '^(?:0|[1-9][0-9]*)$(?![\\s\\S])' }),
      returned_count: { type: 'integer', minimum: 0, maximum: 200 }, truncated: bool, downsampled: { const: false },
      has_more: bool, next_cursor: nil, gaps: { type: 'array', maxItems: 0 } }),
    source_history_semantics: { const: ['performance', 'account_equity', 'portfolio_equity'].includes(alias) ? 'RETAINED_RANGE_OR_CURRENT_WINDOW' : 'CURRENT_STATE_ONLY' },
    formula: nil, reason_code: reason, retryable: bool,
  });
}
for (const [kind, aliases] of Object.entries(relations)) {
  const lower = kind.toLowerCase();
  const summary = obj({ kind: { const: kind.toUpperCase() }, id: text, visibility: { const: 'SCOPED' }, coverage: { const: 'AUTHORIZED_ONLY' },
    financial_summary: obj({ state: { const: 'UNAVAILABLE' }, reason_code: { const: 'SCOPED_RAW_FACTS_ONLY_NO_IMPLIED_TOTALS' } }),
    ...Object.fromEntries(['alpha_id', 'portfolio_id', 'account_id', 'binding_id', 'name', 'display_name', 'state', 'base_currency'].map(key => [key, nullable(text)])),
    deployments: array(ref('DeploymentsScopedRow')),
    portfolios: array(obj({ portfolio_id: nullable(text), name: nullable(text), display_name: nullable(text) }, [])),
    metrics_availability: obj({ account_balance: ref('ScopedResourceMetricAvailability'), current_position_pnl: ref('ScopedResourceMetricAvailability'), equity_series: ref('ScopedResourceMetricAvailability') }),
  }, ['kind', 'id', 'visibility', 'coverage', 'financial_summary', 'deployments', 'portfolios', 'metrics_availability']);
  defs[`${kind}ScopedSummary`] = summary;
  defs[`${kind}ScopedData`] = { oneOf: [obj({}), obj({
    ...Object.fromEntries(aliases.map(alias => [alias, array(ref(rowName(alias)))])),
    [lower]: ref(`${kind}ScopedSummary`), profile_coverage: ref('ScopedResourceProfileCoverage'),
  })] };
  const base = {
    schema_version: { const: `execution.${lower}-resource.v2` },
    record_authority: { const: 'PORTAL_CONTROL' }, source_authority: { const: 'TRADING_SYSTEM' },
    delivery_profile: text, workspace_id: text, requested_environment: { enum: ['all', ...environment.enum] }, selected_environment: nullable(environment),
    resource: obj({ kind: { const: kind.toUpperCase() }, id: text, label: text }, ['kind', 'id']),
    read_at_ms: integer, as_of_ms: nil, read_at: text, as_of: nil,
    state: { enum: ['ready', 'empty', 'partial', 'stale', 'unavailable'] },
    freshness: { enum: ['FRESH', 'AGING', 'STALE', 'UNKNOWN'] }, completeness: { const: 'PARTIAL' },
    projection: array(ref('ScopedResourceProjection'), 3), capabilities: array(ref('ScopedResourceCapability'), aliases.length + 1),
    panels: obj(Object.fromEntries(aliases.map(alias => [alias, ref(`${rowName(alias)}Panel`)]))),
    unavailable_branches: array(ref('ScopedResourceUnavailableBranch'), aliases.length + 3),
    actor: obj({ user_id: text, username: text, roles: { type: 'array', minItems: 1, maxItems: 1, items: { enum: ['ADMIN', 'USER'] } } }),
  };
  const scope = { visibility: { const: 'SCOPED' }, coverage: { const: 'AUTHORIZED_ONLY' }, totals_scope: { const: 'VISIBLE_ROWS_ONLY' },
    is_full_portfolio: { const: false }, read_scope: { ...array(obj({ environment, policy_revision: nullable(text) }), 3), minItems: 1 } };
  defs[`${kind}ScopedResourceResponse`] = obj({ ...base, ...scope, data: ref(`${kind}ScopedData`) });
  // Explicit exceptional byte-bound shell; this is not a successful summary
  // with fabricated zeroes. Only the exact typed reason permits this variant.
  defs[`${kind}ScopedResourceBoundedResponse`] = obj({ ...base, ...scope, state: { const: 'partial' }, completeness: { const: 'PARTIAL' },
    data: obj({ [lower]: obj({ id: text, state: { const: 'PARTIAL' }, reason_code: { const: 'EDS04_RESOURCE_RESPONSE_BYTE_BOUND' } }), profile_coverage: ref('ScopedResourceProfileCoverage') }),
  });
  defs[`${kind}ScopedResourceWireResponse`] = { oneOf: [ref(`${kind}ScopedResourceResponse`), ref(`${kind}ScopedResourceBoundedResponse`)] };
}
defs.ScopedResourceResponse = { oneOf: Object.keys(relations).map(kind => ref(`${kind}ScopedResourceWireResponse`)) };
const schema = { $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://contracts.primusspark.com/execution-resource-scoped.v2.schema.json',
  description: 'Server-selected SCOPED_V2 Resource360 projection. Authorized retained raw facts, not complete portfolio totals or physical custody. Legacy v1 is a separate contract. All row objects closed; missing facts remain absent, never coerced to zero. Counts cover visible rows only. Raw global projection identity is not public. Synthetic fixtures do not certify production.',
  $defs: defs };
const paths = {};
for (const kind of Object.keys(relations)) {
  const plural = kind === 'Alpha' ? 'alphas' : kind === 'Portfolio' ? 'portfolios' : kind === 'Account' ? 'accounts' : 'bindings';
  paths[`/api/v1/execution/resources/${plural}/{resource_id}`] = { get: {
    operationId: `executionScoped${kind}ResourceGetV2`,
    description: 'SCOPED_V2 representation of the existing operation, selected only by durable server policy; no browser flag can select or downgrade authority. Legacy v1 remains unchanged and is not represented by this dedicated V2 document. private, no-store.',
    parameters: [{ name: 'resource_id', in: 'path', required: true, schema: { type: 'string', pattern: '^[A-Za-z0-9._:@-]{1,160}$' } },
      { name: 'workspace_id', in: 'query', schema: { type: 'string', minLength: 1, maxLength: 96 } },
      { name: 'environment', in: 'query', schema: environment }],
    responses: { '200': { description: 'Authorized Resource360 V2 response or explicit byte-bound shell; no total-NAV claim.',
      content: { 'application/json': { schema: { $ref: `../schemas/execution-resource-scoped.v2.schema.json#/$defs/${kind}ScopedResourceWireResponse` } } } },
      ...Object.fromEntries([400, 401, 403, 404, 409, 503].map(status => [status, { description: 'Typed refusal: malformed query, current authority, unknown-or-hidden resource, stale publication/policy or unqualified source. No hidden fact disclosed.' }])),
    },
  } };
}
const openapi = { openapi: '3.1.0', info: { title: 'Execution Resource360 Scoped V2', version: '2.0.0' }, paths };
const time = 1790812800000;
const fixtureCases = [];
for (const [kind, aliases] of Object.entries(relations)) {
  const lower = kind.toLowerCase(), id = `${lower}_TEST_ONLY`;
  const rows = Object.fromEntries(aliases.map(alias => [alias, []]));
  rows.deployments = [{ profile_environment: 'paper', deployment_id: 'deployment_TEST_ONLY', strategy_id: 'strategy_TEST_ONLY', account_id: 'account_TEST_ONLY', mode: 'paper' }];
  rows.account_balances = [{ profile_environment: 'paper', account_id: 'account_TEST_ONLY', currency: 'USD', total: '1234567890123456789.1234567890123456789', free: '0', locked: null }];
  const panels = Object.fromEntries(aliases.map(alias => [alias, {
    state: alias === 'broker_sync' ? 'UNAVAILABLE' : 'PARTIAL', data: alias === 'broker_sync' ? null : { rows: rows[alias] },
    clocks: { event_time_ms: null, source_published_at_ms: null, received_at_ms: null, ingested_at_ms: null, processed_at_ms: null, as_of_ms: null, read_at_ms: time },
    coverage: { from_ms: null, to_ms: null, source_total: alias === 'broker_sync' ? null : String(rows[alias].length), filtered_total: alias === 'broker_sync' ? null : String(rows[alias].length), returned_count: rows[alias].length, truncated: false, downsampled: false, has_more: false, next_cursor: null, gaps: [] },
    source_history_semantics: ['performance', 'account_equity', 'portfolio_equity'].includes(alias) ? 'RETAINED_RANGE_OR_CURRENT_WINDOW' : 'CURRENT_STATE_ONLY',
    formula: null, reason_code: alias === 'broker_sync' ? 'EXECUTION_CUSTODY_READ_NOT_COMMISSIONED' : 'SOURCE_PARTIAL', retryable: alias === 'broker_sync',
  }]));
  const value = {
    schema_version: `execution.${lower}-resource.v2`, visibility: 'SCOPED', coverage: 'AUTHORIZED_ONLY', totals_scope: 'VISIBLE_ROWS_ONLY', is_full_portfolio: false,
    read_scope: [{ environment: 'paper', policy_revision: 'TEST_ONLY-policy' }], record_authority: 'PORTAL_CONTROL', source_authority: 'TRADING_SYSTEM',
    delivery_profile: 'profile_TEST_ONLY', workspace_id: 'workspace_TEST_ONLY', requested_environment: 'paper', selected_environment: 'paper',
    resource: { kind: kind.toUpperCase(), id, label: `TEST_ONLY ${kind}` }, read_at_ms: time, as_of_ms: null, read_at: new Date(time).toISOString(), as_of: null,
    state: 'partial', freshness: 'STALE', completeness: 'PARTIAL',
    projection: [{ environment: 'paper', epoch: null, sequence: null, payload_digest: `sha256:${'a'.repeat(64)}`, last_successful_refresh_at: null }],
    capabilities: [{ capability_id: `resource.${lower}.identity`, state: 'AVAILABLE', relations: [], reason_code: null, retryable: false }],
    panels, data: { ...rows, [lower]: { kind: kind.toUpperCase(), id, visibility: 'SCOPED', coverage: 'AUTHORIZED_ONLY',
      financial_summary: { state: 'UNAVAILABLE', reason_code: 'SCOPED_RAW_FACTS_ONLY_NO_IMPLIED_TOTALS' }, deployments: rows.deployments, portfolios: [],
      metrics_availability: { account_balance: { state: 'PARTIAL', reason_code: 'SOURCE_PARTIAL' }, current_position_pnl: { state: 'UNAVAILABLE', reason_code: 'SOURCE_PARTIAL' }, equity_series: { state: 'UNAVAILABLE', reason_code: 'SOURCE_PARTIAL' } } },
      profile_coverage: { paper: { profile_id: 'profile_TEST_ONLY', state: 'FOUND', reason_code: null, projection_epoch: null, projection_sequence: null, source_as_of: null } } },
    unavailable_branches: [], actor: { user_id: 'user_TEST_ONLY', username: 'TEST_ONLY', roles: ['USER'] },
  };
  fixtureCases.push(value);
}
const empty = structuredClone(fixtureCases[0]);
empty.resource = { kind: 'ALPHA', id: 'empty_TEST_ONLY' }; empty.data = {}; empty.projection = [];
empty.selected_environment = null; empty.state = 'empty'; empty.freshness = 'UNKNOWN'; empty.completeness = 'PARTIAL';
empty.capabilities[0].state = 'EMPTY';
for (const panel of Object.values(empty.panels)) {
  panel.state = 'EMPTY'; panel.data = null; panel.reason_code = null; panel.retryable = false;
  panel.coverage.source_total = '0'; panel.coverage.filtered_total = '0'; panel.coverage.returned_count = 0;
}
const bounded = structuredClone(fixtureCases[0]);
bounded.data = { alpha: { id: 'alpha_TEST_ONLY', state: 'PARTIAL', reason_code: 'EDS04_RESOURCE_RESPONSE_BYTE_BOUND' }, profile_coverage: bounded.data.profile_coverage };
for (const panel of Object.values(bounded.panels)) {
  panel.state = 'PARTIAL'; panel.data = { rows: [] }; panel.reason_code = 'EDS04_RESOURCE_RESPONSE_BYTE_BOUND'; panel.retryable = false;
  panel.coverage = { ...panel.coverage, source_total: null, filtered_total: null, returned_count: 0, truncated: true, has_more: true };
}
fixtureCases.push(empty, bounded);
const fixtures = { lane: 'TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT', cases: fixtureCases };
for (const [file, value] of Object.entries({ 'schemas/execution-resource-scoped.v2.schema.json': schema,
  'openapi/execution-resource-scoped.openapi.json': openapi, 'fixtures/execution-resource-scoped.synthetic.valid.json': fixtures })) {
  const bytes = JSON.stringify(value, null, 2) + '\n', path = resolve(root, file);
  if (process.argv.includes('--check')) { if (readFileSync(path, 'utf8') !== bytes) throw new Error(`Generated drift: ${file}`); }
  else writeFileSync(path, bytes);
}

// Emit explicit strict Zod objects from the exact same finite schema, never
// z.unknown()/passthrough(). All references resolve to named closed schemas.
function zod(s) {
  if (s.$ref) return `z.lazy(() => definitions[${JSON.stringify(s.$ref.split('/').at(-1))}])`;
  if (s.oneOf || s.anyOf) return `z.union([${(s.oneOf ?? s.anyOf).map(zod).join(', ')}])`;
  if ('const' in s) return s.const === null ? 'z.null()' : `z.literal(${JSON.stringify(s.const)})`;
  if (s.enum) return `z.enum(${JSON.stringify(s.enum)} as [string, ...string[]])`;
  if (s.type === 'null') return 'z.null()';
  if (s.type === 'boolean') return 'z.boolean()';
  if (s.type === 'integer') return `z.number().int().min(${s.minimum ?? 0}).max(${s.maximum ?? Number.MAX_SAFE_INTEGER})`;
  if (s.type === 'string') {
    let result = 'z.string()';
    if (s.minLength !== undefined || s.maxLength !== undefined) result += `.refine(v => [...v].length >= ${s.minLength ?? 0} && [...v].length <= ${s.maxLength ?? Number.MAX_SAFE_INTEGER})`;
    if (s.pattern) result += `.refine(v => new RegExp(${JSON.stringify(s.pattern)}, "u").test(v))`;
    return result;
  }
  if (s.type === 'array') return `z.array(${s.items ? zod(s.items) : 'z.never()'})${s.minItems !== undefined ? `.min(${s.minItems})` : ''}.max(${s.maxItems})`;
  if (s.type === 'object' && s.additionalProperties === false) return `z.object({${Object.entries(s.properties).map(([key, value]) => `${JSON.stringify(key)}: ${zod(value)}${s.required.includes(key) ? '' : '.optional()'}`).join(',\n')}}).strict()`;
  throw new Error(`Unsupported runtime schema: ${JSON.stringify(s)}`);
}
const runtime = `// Generated by packages/contracts/tooling/generate-execution-resource-scoped.mjs.\n// Do not edit: runtime Zod and JSON Schema share one closed wire vocabulary.\nimport { z } from "zod";\nconst definitions: Record<string, z.ZodTypeAny> = {};\n${Object.entries(defs).map(([key, value]) => `definitions[${JSON.stringify(key)}] = ${zod(value)};`).join('\n')}\nexport const scopedResourceRowSchemas = { ${Object.keys(fields).map(alias => `${JSON.stringify(alias)}: definitions[${JSON.stringify(rowName(alias))}]`).join(', ')} };\nfunction resourceConsistency(value: any, ctx: z.RefinementCtx): void {\n  for (const [alias, panel] of Object.entries(value.panels) as [string, any][]) {\n    const rows = panel.data?.rows ?? [];\n    if (panel.coverage.returned_count !== rows.length || panel.coverage.has_more !== panel.coverage.truncated)\n      ctx.addIssue({code: z.ZodIssueCode.custom, message: "RESOURCE_PANEL_COVERAGE_INCONSISTENT", path: ["panels", alias, "coverage"]});\n    if (value.data[alias] && JSON.stringify(value.data[alias]) !== JSON.stringify(rows))\n      ctx.addIssue({code: z.ZodIssueCode.custom, message: "RESOURCE_PANEL_DATA_INCONSISTENT", path: ["data", alias]});\n  }\n  if (Buffer.byteLength(JSON.stringify(value), "utf8") > 1048576)\n    ctx.addIssue({code: z.ZodIssueCode.custom, message: "RESOURCE_RESPONSE_BYTE_BOUND"});\n}\nexport const scopedResourceResponseSchemas = { ${Object.keys(relations).map(kind => `${kind.toUpperCase()}: definitions.${kind}ScopedResourceWireResponse.superRefine(resourceConsistency)`).join(', ')} };\nexport const scopedResourceResponseSchema = definitions.ScopedResourceResponse.superRefine(resourceConsistency);\n`;
const runtimePath = resolve(root, '../../apps/control-api/src/resource-read/scoped-resource.contract.ts');
if (process.argv.includes('--check')) { if (readFileSync(runtimePath, 'utf8') !== runtime) throw new Error('Generated drift: scoped-resource.contract.ts'); }
else writeFileSync(runtimePath, runtime);
