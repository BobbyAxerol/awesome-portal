import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { workflowFixtures } from './execution-workflow-fixtures.mjs';
import { capitalWorkflowSchemas } from './execution-capital-workflow-schema.mjs';
import { workflowStructuralRefinements } from './execution-workflow-semantics.mjs';
import { workflowCriteriaSchemas } from './execution-workflow-criteria-schema.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'), require = createRequire(import.meta.url), cache = new Map();
function load(path) {
  if (cache.has(path)) return cache.get(path).exports;
  const module = { exports: {} }; cache.set(path, module);
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', code)(name => name.startsWith('.') ? load(resolve(dirname(path), name + '.ts')) : require(name), module, module.exports);
  return module.exports;
}
function json(s) {
  const d = s._def, t = d.typeName;
  if (t === 'ZodEffects') return json(d.schema); // Structural semantics are restored below; relational checks remain runtime-only.
  if (t === 'ZodUnknown') return {}; // Nested PM transform is replaced with the canonical strict CommandIntent ref below.
  if (t === 'ZodUnion') return { anyOf: d.options.map(json) };
  if (t === 'ZodNullable') return { anyOf: [json(d.innerType), { type: 'null' }] };
  if (t === 'ZodLiteral') return { const: d.value };
  if (t === 'ZodBoolean') return { type: 'boolean' };
  if (t === 'ZodEnum') return { type: 'string', enum: d.values };
  if (t === 'ZodRecord') return { type: 'object', additionalProperties: json(d.valueType) };
  if (t === 'ZodArray') return { type: 'array', items: json(d.type), ...(d.minLength ? { minItems: d.minLength.value } : {}), ...(d.maxLength ? { maxItems: d.maxLength.value } : {}) };
  if (t === 'ZodString') {
    const v = { type: 'string' };
    for (const x of d.checks) { if (x.kind === 'min') v.minLength = x.value; else if (x.kind === 'max') v.maxLength = x.value; else if (x.kind === 'regex') v.pattern = x.regex.source; else throw Error(x.kind); }
    return v;
  }
  if (t === 'ZodNumber') {
    const v = { type: d.checks.some(x => x.kind === 'int') ? 'integer' : 'number' };
    for (const x of d.checks) { if (x.kind === 'min') v.minimum = x.value; else if (x.kind === 'max') v.maximum = x.value; else if (x.kind !== 'int') throw Error(x.kind); }
    return v;
  }
  if (t === 'ZodObject') { const shape = d.shape(); return { type: 'object', additionalProperties: d.unknownKeys !== 'strict', properties: Object.fromEntries(Object.entries(shape).map(([k, v]) => [k, json(v)])), required: Object.keys(shape) }; }
  throw Error('Unsupported workflow Zod ' + t);
}
const src = resolve(root, '../../apps/control-api/src/execution-v2');
const c = load(resolve(src, 'workflow.contract.ts')), functions = load(resolve(src, 'workflow.ts'));
const foundation = JSON.parse(readFileSync(resolve(root, 'openapi/execution-v2-foundation.openapi.json'), 'utf8'));
const command = JSON.parse(readFileSync(resolve(root, 'openapi/execution-trusted-commands.openapi.json'), 'utf8'));
// Workflow definitions are regenerated from their canonical Zod source below;
// never import them back through the command API or create an ordering cycle.
const schemas = { ...foundation.components.schemas,
  ...Object.fromEntries(Object.entries(command.components.schemas).filter(([name]) => !name.startsWith('Workflow'))) };
for (const [name, key] of Object.entries({ WorkflowContext: 'workflowContext', WorkflowReadState: 'workflowReadState',
  WorkflowReceiptStep: 'workflowReceiptStep', WorkflowCreate: 'workflowCreate', WorkflowCapital: 'workflowCapital',
  WorkflowConfirmation: 'workflowConfirmation', WorkflowLifecycle: 'workflowLifecycle', WorkflowNavigation: 'workflowNavigation',
  WorkflowAction: 'workflowAction', WorkflowScreen: 'workflowScreen' })) schemas[name] = json(c[key]);
const ref = name => ({ $ref: '#/components/schemas/' + name });
schemas.WorkflowCapital.properties.status = ref('CommandStatus');
schemas.WorkflowConfirmation.properties.intent = ref('CommandIntent');
schemas.WorkflowConfirmation.properties.preview = ref('CommandPreview');
for (const name of ['WorkflowCreate', 'WorkflowCapital', 'WorkflowLifecycle']) schemas[name].properties.context = ref('WorkflowContext');
for (const name of ['create', 'fund', 'initial_grant']) schemas.WorkflowCreate.properties[name] = ref('WorkflowReceiptStep');
for (const name of ['source_budget_return', 'destination_budget_grant', 'economic_settlement']) schemas.WorkflowLifecycle.properties[name] = ref('WorkflowReceiptStep');
schemas.WorkflowReceiptStep.allOf = [{
  if: { properties: { state: { const: 'APPLIED' } }, required: ['state'] },
  then: { properties: { receipt_ref: { type: 'string' } } }, else: { properties: { receipt_ref: { type: 'null' } } },
}];
schemas.WorkflowReadState.allOf = [{
  if: { properties: { state: { enum: ['LOADING', 'UNAVAILABLE', 'DENIED', 'REVOKED', 'RESYNC_REQUIRED'] } }, required: ['state'] },
  then: { properties: { may_display_data: { const: false } } },
}];
// Preserve the runtime's receipt/null-amount distinction in served JSON too.
// Decimal partition arithmetic remains a runtime obligation, never target-as-amount.
Object.assign(schemas, capitalWorkflowSchemas(c, json));
for (const [name, allOf] of Object.entries(workflowStructuralRefinements(c, json))) schemas[name].allOf = allOf;
Object.assign(schemas, workflowCriteriaSchemas(c, json));
schemas.WorkflowScorePresentation = { type: 'object', additionalProperties: false,
  required: ['canonical_score', 'facet', 'headline', 'public_copy_key', 'regime_changes_score', 'analytics_gates_safety_action'],
  properties: { canonical_score: ref('ScoreCapsule'), facet: { enum: ['ACTUAL', 'SIMULATED', 'EARLY', 'MIXED_OBSERVATION'] },
    headline: { enum: ['RAW_QUALITY', 'ALLOCATION_CONTRIBUTION_NO_BAND', 'ALLOCATED_CAPITAL_COMPOSITION', 'CONSOLIDATED_NAV_QUALITY', 'DIAGNOSTIC_ONLY'] },
    public_copy_key: { enum: ['CANONICAL_SCORE', 'PROVISIONAL', 'EARLY_WINDOW', 'MIXED_NOT_ACTUAL', 'SCORE_POLICY_PENDING'] },
    regime_changes_score: { const: false }, analytics_gates_safety_action: { const: false } },
  allOf: [
    ...Object.entries({ RAW_ALPHA: 'RAW_QUALITY', CONTRIBUTION: 'ALLOCATION_CONTRIBUTION_NO_BAND', COMPOSITION: 'ALLOCATED_CAPITAL_COMPOSITION', DIRECT_NAV: 'CONSOLIDATED_NAV_QUALITY' }).map(([kind, headline]) => ({
      if: { properties: { canonical_score: { properties: { kind: { const: kind } }, required: ['kind'] } }, required: ['canonical_score'] },
      then: { properties: { headline: { enum: [headline, 'DIAGNOSTIC_ONLY'] } } } })),
    { if: { properties: { facet: { enum: ['EARLY', 'MIXED_OBSERVATION'] } }, required: ['facet'] }, then: { properties: { headline: { const: 'DIAGNOSTIC_ONLY' } } } },
    { if: { properties: { facet: { const: 'MIXED_OBSERVATION' } }, required: ['facet'] }, then: { properties: { public_copy_key: { const: 'MIXED_NOT_ACTUAL' }, canonical_score: { properties: { series_kind: { const: 'MIXED_FORWARD_DIAGNOSTIC' }, economic_domain: { const: 'MIXED_DIAGNOSTIC' } } } } } },
  ],
  description: 'Reuses the canonical ScoreCapsule. No calculator, policy defaults, hidden denominator or quality band for contribution is introduced. Diagnostic facets never replace actual headlines. Source/action authorization remains independent.' };
// Keep only reachable shared components rather than copying a second entire foundation.
const needed = new Set(Object.keys(schemas).filter(k => k.startsWith('Workflow')));
function visit(value) { if (!value || typeof value !== 'object') return; for (const [key, child] of Object.entries(value)) {
  if (key === '$ref' && typeof child === 'string' && child.startsWith('#/components/schemas/')) { const n = child.split('/').at(-1); if (!needed.has(n)) { needed.add(n); visit(schemas[n]); } }
  else visit(child);
} }
for (const name of [...needed]) visit(schemas[name]);
const selected = Object.fromEntries(Object.entries(schemas).filter(([name]) => needed.has(name)));
const api = { openapi: '3.1.0', info: { title: 'Execution V2 workflow states — schema-only consumer handoff, no mounted workflow API', version: '1.0.0' },
  paths: {}, components: { schemas: selected } };
const schema = { $schema: 'https://json-schema.org/draft/2020-12/schema', $id: 'https://schemas.primusspark.com/portal/execution-workflows.v1.schema.json',
  $defs: JSON.parse(JSON.stringify(selected).replaceAll('#/components/schemas/', '#/$defs/')) };
const outputs = { 'openapi/execution-workflows.openapi.json': api, 'schemas/execution-workflows.v1.schema.json': schema,
  'fixtures/execution-workflows.synthetic.valid.json': workflowFixtures(functions, c) };
for (const [name, value] of Object.entries(outputs)) {
  const bytes = JSON.stringify(value, null, 2) + '\n', path = resolve(root, name);
  if (process.argv.includes('--check')) { if (readFileSync(path, 'utf8') !== bytes) throw Error('Workflow contract drift ' + name); }
  else writeFileSync(path, bytes);
}
