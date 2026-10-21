// BE-P16 / ELP2-09: publish the named dataset `alpha_fleet_overview` as real operations, generated from the backend Zod vocabulary.
// The stream frame is the EXISTING ScopedRealtimeFrame (copied byte-for-byte from execution-scoped-realtime.openapi.json, which stays
// a schema-only handoff with paths={}); this file adds the baseline snapshot, the two routes, and fixtures proved by the real validators.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import ts from 'typescript';
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
  if (t === 'ZodEffects') return json(d.schema);
  if (t === 'ZodOptional') return json(d.innerType);
  if (t === 'ZodUnion') return { anyOf: d.options.map(json) };
  if (t === 'ZodNullable') return { anyOf: [json(d.innerType), { type: 'null' }] };
  if (t === 'ZodNull') return { type: 'null' };
  if (t === 'ZodLiteral') return { const: d.value };
  if (t === 'ZodBoolean') return { type: 'boolean' };
  if (t === 'ZodEnum') return { type: 'string', enum: d.values };
  if (t === 'ZodArray') return { type: 'array', items: json(d.type), ...(d.maxLength ? { maxItems: d.maxLength.value } : {}) };
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
  if (t === 'ZodObject') {
    const shape = d.shape();
    return { type: 'object', additionalProperties: d.unknownKeys !== 'strict', properties: Object.fromEntries(Object.entries(shape).map(([k, v]) => [k, json(v)])),
      required: Object.entries(shape).filter(([, v]) => !v.isOptional()).map(([k]) => k) };
  }
  throw Error('Unsupported alpha-fleet realtime Zod ' + t);
}
const read = name => JSON.parse(readFileSync(resolve(root, name), 'utf8'));
const c = load(resolve(root, '../../apps/control-api/src/execution-v2/alpha-fleet-realtime.contract.ts'));
const rt = load(resolve(root, '../../apps/control-api/src/execution-v2/realtime.contract.ts'));
const frames = read('openapi/execution-scoped-realtime.openapi.json');
const ref = name => ({ $ref: '#/components/schemas/' + name });

/* ── schemas ─────────────────────────────────────────────────────────────────────────────────── */
const snapshot = json(c.alphaFleetRealtimeSnapshot);
snapshot.description = 'Baseline barrier of the named fleet read, not a figure. `baseline.revision` is the stored head revision (what the cursor and the ordinal count); it is NOT compared with the fleet answer. `named_snapshot.lineage_revision` is the exact public lineage identity of the paired GET /manager/fleet answer for this actor, session, workspace, environment, grants and head (a sha256 digest bound to the alpha.read read scope and the head revision); the consumer pairs by exact string equality with the `lineage.revision` of that answer, and any other string is a stale or foreign barrier. `scope_fingerprint` changes whenever the authorization identity changes: a consumer holding a different fingerprint than before must re-baseline. `source` states where a notice would come from; no Edge scoped-notice source is commissioned for this dataset.';
snapshot.properties.quality = ref('Quality');
const stream = snapshot.properties.stream;
stream.anyOf = [ref('AlphaFleetStreamAvailable'), ref('AlphaFleetStreamUnavailable')];
const schemas = {
  Quality: frames.components.schemas.Quality,
  ScopedRealtimeFrame: frames.components.schemas.ScopedRealtimeFrame,
  AlphaFleetStreamAvailable: json(c.alphaFleetStreamAvailable),
  AlphaFleetStreamUnavailable: json(c.alphaFleetStreamUnavailable),
  AlphaFleetRealtimeSnapshot: snapshot,
  Problem: { type: 'object', additionalProperties: false, required: ['error', 'request_id'], properties: {
    error: { type: 'object', additionalProperties: false, required: ['code', 'message'], properties: {
      code: { type: 'string', enum: ['EXECUTION_READ_NOT_AVAILABLE', 'EXECUTION_READ_QUERY_INVALID', 'EXECUTION_READ_CURSOR_INVALID', 'EXECUTION_READ_ACCESS_CHANGED',
        'EXECUTION_READ_POLICY_PENDING', 'EXECUTION_READ_PUBLICATION_NOT_QUALIFIED', 'EXECUTION_READ_FIELD_POLICY_PENDING', 'EXECUTION_READ_SCOPE_LIMIT',
        'EXECUTION_READ_AUTHORITY_UNAVAILABLE'] },
      message: { const: 'The requested Execution read is not available.' } } },
    request_id: { type: 'string' } } },
};
const queryParams = [
  { name: 'environment', in: 'query', required: true, schema: { type: 'string', enum: ['paper', 'sandbox', 'live'] } },
  { name: 'workspace_id', in: 'query', required: false, description: 'Only ever the caller\'s own workspace; any other value is a 404.', schema: { type: 'string', minLength: 1, maxLength: 256 } },
];
const noStore = { 'Cache-Control': { required: true, schema: { type: 'string', const: 'private, no-store' } } };
const problem = description => ({ description, headers: noStore, content: { 'application/json': { schema: ref('Problem') } } });
const paths = {
  [c.ALPHA_FLEET_SNAPSHOT_PATH]: { get: {
    operationId: 'executionAlphaFleetRealtimeSnapshotGetV1', security: [{ PortalSession: [] }],
    description: 'Named dataset `alpha_fleet_overview`: the baseline barrier a stream starts from. It names the Manager publication revision, generation, epoch and checkpoint ordinal the paired GET /api/v1/execution/manager/fleet answers, the authorization fingerprint, and either a resume token or a typed reason there is no stream. Read the fleet and the barrier together and compare `named_snapshot.lineage_revision` with `lineage.revision` of the fleet answer; a mismatch means a newer publication or another authorization scope, and the barrier must be re-read. Carries no figure; never an event replay.',
    parameters: queryParams,
    responses: {
      200: { description: 'Current authorized barrier; a stream that cannot be offered is `stream.state: UNAVAILABLE` with a reason, never an error.', headers: noStore,
        content: { 'application/json': { schema: ref('AlphaFleetRealtimeSnapshot') } } },
      400: problem('Invalid closed query'), 401: problem('Session required'), 404: problem('Workspace or current grant unavailable'),
      409: problem('Authority or publication changed during the read'), 503: problem('Publication not qualified or authority unavailable') } } },
  [c.ALPHA_FLEET_STREAM_PATH]: { get: {
    operationId: 'executionAlphaFleetRealtimeStreamGetV1', security: [{ PortalSession: [] }],
    description: 'Server-sent notifications for `alpha_fleet_overview`. Each SSE event is one ScopedRealtimeFrame (NOTIFICATION_ONLY): `event:` equals its `event_type`, a live frame carries `id:` equal to its `resume_cursor`, a terminal frame carries no `id`. `revalidate` means a newer Manager publication revision committed in the same generation: read GET /manager/fleet once. It carries no figure and no delta. `heartbeat` is liveness only. Every terminal frame (`resync_required`, `access_revoked`, `unavailable`) is followed by the server closing the response. Failures after the stream opened are terminal frames, never an HTTP status (an EventSource cannot read an error body). The stream starts only from a snapshot cursor: with neither `Last-Event-ID` nor `cursor` the answer is one terminal `resync_required`/`SNAPSHOT_REQUIRED` frame. Current authority and the exact `stream.subscribe` grant are re-checked before every source read and every write.',
    parameters: [...queryParams,
      { name: 'cursor', in: 'query', required: false, description: 'The snapshot\'s `stream.resume_cursor`. `Last-Event-ID` takes precedence.', schema: json(rt.replayOpaqueToken) },
      { name: 'Last-Event-ID', in: 'header', required: false, description: 'The `id` of the last delivered frame (EventSource reconnect).', schema: json(rt.replayOpaqueToken) }],
    responses: {
      200: { description: 'text/event-stream', headers: { ...noStore, 'X-Accel-Buffering': { required: true, schema: { type: 'string', const: 'no' } } },
        content: { 'text/event-stream': { schema: { type: 'string' }, 'x-sse-frame': ref('ScopedRealtimeFrame') } } },
      400: problem('Invalid closed query or Last-Event-ID'), 401: problem('Session required'), 404: problem('Workspace unavailable'),
      503: problem('Publication not qualified or authority unavailable') } } },
};
const api = { openapi: '3.1.0', info: { title: 'Execution alpha fleet realtime (alpha_fleet_overview)', version: '1.0.0',
  description: 'ELP2-09 scoped realtime for the named dataset alpha_fleet_overview: a baseline barrier and a NOTIFICATION_ONLY stream. execution_profile_observation is served by the opt-in native headers/stream of execution-profile-realtime.openapi.json and is not repeated here.' },
  paths, components: { securitySchemes: { PortalSession: { type: 'apiKey', in: 'cookie', name: '__Host-portal_session' } }, schemas } };
const schema = { $schema: 'https://json-schema.org/draft/2020-12/schema', $id: 'https://schemas.primusspark.com/portal/execution-alpha-fleet-realtime.v1.schema.json',
  $defs: JSON.parse(JSON.stringify(schemas).replaceAll('#/components/schemas/', '#/$defs/')) };

/* ── fixtures: TEST_ONLY, each proved by the real validators before it is written ────────────── */
const sha = n => 'sha256:' + n.repeat(32);
const TOKEN = 'TEST_ONLY_ENCRYPTED_TOKEN_NOT_FOR_RUNTIME';
const quality = { completeness: 'PARTIAL', freshness: 'UNKNOWN', coverage: 'AUTHORIZED_ONLY', source_as_of_ms: null, portal_observed_at_ms: 1800000000000,
  source_set_ref: sha('c3'), confidence: 'PROVISIONAL', reasons: ['BASELINE_BARRIER_ONLY', 'NO_EDGE_NOTICE_SOURCE', 'SOURCE_FRESHNESS_NOT_ATTESTED'] };
const available = { state: 'AVAILABLE', resume_cursor: TOKEN, stream_path: c.ALPHA_FLEET_STREAM_PATH, heartbeat_interval_ms: 5000, replay_window_ms: 300000,
  max_frame_bytes: 16384, max_streams_per_session: 4 };
const base = { schema_version: c.ALPHA_FLEET_SNAPSHOT_SCHEMA, dataset: 'alpha_fleet_overview', semantics: 'NOTIFICATION_ONLY', workspace_id: 'TEST_ONLY:workspace',
  environment: 'paper', scope_fingerprint: sha('b2'),
  baseline: { revision: 'TEST_ONLY:fleet-r7', projection_generation: 'TEST_ONLY:g1', source_epoch: 'TEST_ONLY:epoch-1', ordinal: '7', catalogue_digest: sha('a1') },
  named_snapshot: { operation_id: 'executionManagerFleetGetV1', path: '/api/v1/execution/manager/fleet', lineage_revision: sha('d4') },
  source: { notice_origin: 'PORTAL_PUBLICATION_REVISION', edge_notice_source: 'NOT_COMMISSIONED', qualification: 'SOURCE_VERIFIED' },
  stream: available, quality };
const unavailable = reason => ({ state: 'UNAVAILABLE', reason_code: reason, resume_cursor: null });
const snapshotCases = [
  ['AFR-SNAPSHOT-AVAILABLE', base],
  ['AFR-SNAPSHOT-ORDINAL-WIDER-THAN-SAFE-INTEGER', { ...base, baseline: { ...base.baseline, ordinal: '9007199254740993' } }],
  ['AFR-SNAPSHOT-PARTIAL-VIEWER', { ...base, scope_fingerprint: sha('b3'), stream: unavailable('WHOLE_FLEET_AUTHORITY_REQUIRED') }],
  ['AFR-SNAPSHOT-STREAM-NOT-GRANTED', { ...base, scope_fingerprint: sha('b4'), stream: unavailable('STREAM_AUTHORITY_NOT_GRANTED') }],
  ['AFR-SNAPSHOT-CAPACITY', { ...base, stream: unavailable('STREAM_CAPACITY_REACHED') }],
].map(([id, response]) => ({ id, schema: 'AlphaFleetRealtimeSnapshot', response: c.alphaFleetRealtimeSnapshot.parse(response) }));
const live = { schema_version: 'portal.execution.scoped-realtime.v1', semantics: 'NOTIFICATION_ONLY', terminal: false, reconnect_required: false,
  resume_cursor: TOKEN, projection_generation: 'TEST_ONLY:g1', reason_code: null };
const noticeQuality = { ...quality, portal_observed_at_ms: 1800000005000, reasons: ['PORTAL_PUBLICATION_REVISION_NOTICE', 'NO_EDGE_NOTICE_SOURCE', 'SOURCE_FRESHNESS_NOT_ATTESTED'] };
const frameCases = [
  ['AFR-WIRE-REVALIDATE', { ...live, event_type: 'revalidate', quality: noticeQuality, next_action: 'READ_NAMED_SNAPSHOT' }],
  ['AFR-WIRE-HEARTBEAT', { ...live, event_type: 'heartbeat', quality: null, next_action: 'RESUME_PORTAL_CURSOR' }],
  ['AFR-WIRE-RESYNC-SLOW-CLIENT', c.terminalFleetFrame('SLOW_CLIENT')],
  ['AFR-WIRE-RESYNC-SNAPSHOT-REQUIRED', c.terminalFleetFrame('SNAPSHOT_REQUIRED')],
  ['AFR-WIRE-RESYNC-CURSOR-INVALID', c.terminalFleetFrame('CURSOR_INVALID_OR_EXPIRED')],
  ['AFR-WIRE-RESYNC-GENERATION-CHANGED', c.terminalFleetFrame('GENERATION_CHANGED')],
  ['AFR-WIRE-REVOKED', c.terminalFleetFrame('ACCESS_CHANGED')],
  ['AFR-WIRE-UNAVAILABLE-RECONNECT-LIMIT', c.terminalFleetFrame('RECONNECT_LIMIT')],
].map(([id, frame]) => {
  const parsed = rt.scopedRealtimeFrame.parse(frame);
  return { id, schema: 'ScopedRealtimeFrame', response: parsed, wire: c.serializeFleetFrame(parsed) };
});
const valid = { lane: 'TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT', production_config: false, cases: [...snapshotCases, ...frameCases] };

const mutate = (change) => { const v = structuredClone(base); change(v); return v; };
const refused = [
  ['extra-top-level-key', 'a key the contract does not name', v => { v.jwt = 'x'; }],
  ['wrong-schema-version', 'unknown snapshot schema', v => { v.schema_version = 'portal.execution.alpha-fleet-realtime-snapshot.v2'; }],
  ['wrong-dataset', 'another dataset', v => { v.dataset = 'execution_profile_observation'; }],
  ['wrong-semantics', 'a snapshot is never an event replay', v => { v.semantics = 'EVENT_REPLAY'; }],
  ['environment-all', 'the snapshot is one environment', v => { v.environment = 'all'; }],
  ['fingerprint-not-a-digest', 'scope fingerprint is an opaque sha256', v => { v.scope_fingerprint = 'scope-1'; }],
  ['ordinal-as-number', 'ordinals are decimal strings', v => { v.baseline.ordinal = 7; }],
  ['ordinal-leading-zero', 'canonical decimal only', v => { v.baseline.ordinal = '07'; }],
  ['ordinal-negative', 'unsigned only', v => { v.baseline.ordinal = '-1'; }],
  ['lineage-revision-raw-head', 'the named lineage identity is a scope-bound digest, never the raw head revision (CR-01)', v => { v.named_snapshot.lineage_revision = v.baseline.revision; }],
  ['named-snapshot-other-operation', 'the pairing names exactly the fleet read', v => { v.named_snapshot.operation_id = 'executionManagerFundOverviewGetV1'; }],
  ['edge-source-claimed', 'no Edge notice source is commissioned', v => { v.source.edge_notice_source = 'COMMISSIONED'; }],
  ['origin-edge', 'notices originate from the Portal publication head', v => { v.source.notice_origin = 'EDGE_NOTICE'; }],
  ['source-test-only', 'a TEST_ONLY revision is never a baseline', v => { v.source.qualification = 'TEST_ONLY'; }],
  ['stream-available-without-cursor', 'an available stream has a cursor', v => { delete v.stream.resume_cursor; }],
  ['stream-unavailable-with-cursor', 'an unavailable stream keeps no cursor', v => { v.stream = { ...unavailable('WHOLE_FLEET_AUTHORITY_REQUIRED'), resume_cursor: TOKEN }; }],
  ['stream-unavailable-without-reason', 'unavailable is always explained', v => { v.stream = { state: 'UNAVAILABLE', resume_cursor: null }; }],
  ['stream-unknown-reason', 'finite reasons', v => { v.stream = unavailable('MAINTENANCE'); }],
  ['stream-other-path', 'the stream route is fixed', v => { v.stream.stream_path = '/api/v1/execution/profiles/paper/stream'; }],
  ['heartbeat-zero', 'a cadence is at least a second', v => { v.stream.heartbeat_interval_ms = 0; }],
  ['replay-window-over-five-minutes', 'the cursor window is capped', v => { v.stream.replay_window_ms = 300001; }],
  ['frame-bound-below-one-token', 'a bound under one fixed-length token could never deliver a frame', v => { v.stream.max_frame_bytes = 1024; }],
  ['frame-bound-over-one-mib', 'a frame is bounded', v => { v.stream.max_frame_bytes = 1048577; }],
  ['streams-per-session-zero', 'at least one stream', v => { v.stream.max_streams_per_session = 0; }],
  ['cursor-with-space', 'opaque token alphabet', v => { v.stream.resume_cursor = 'a b'; }],
  ['cursor-over-4096', 'token length bound', v => { v.stream.resume_cursor = 'a'.repeat(4097); }],
  ['quality-missing', 'the barrier states its quality', v => { delete v.quality; }],
  ['quality-completeness-outside-vocabulary', 'canonical Quality only', v => { v.quality.completeness = 'ALL'; }],
].map(([id, rule, change]) => ({ id, rule, schema: 'AlphaFleetRealtimeSnapshot', response: mutate(change) }));
for (const entry of refused) if (c.alphaFleetRealtimeSnapshot.safeParse(entry.response).success) throw Error('Negative fixture accepted by the producer validator: ' + entry.id);
const negative = { lane: 'TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT', production_config: false, cases: refused };

const outputs = { 'openapi/execution-alpha-fleet-realtime.openapi.json': api, 'schemas/execution-alpha-fleet-realtime.v1.schema.json': schema,
  'fixtures/execution-alpha-fleet-realtime.synthetic.valid.json': valid, 'fixtures/execution-alpha-fleet-realtime.synthetic.negative.json': negative };
for (const [name, value] of Object.entries(outputs)) {
  const bytes = JSON.stringify(value, null, 2) + '\n', path = resolve(root, name);
  if (process.argv.includes('--check')) { if (readFileSync(path, 'utf8') !== bytes) throw Error('Alpha fleet realtime contract drift ' + name); }
  else writeFileSync(path, bytes);
}
