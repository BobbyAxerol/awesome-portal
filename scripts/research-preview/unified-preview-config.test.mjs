import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const overlay = readFileSync(new URL('../../deploy/research-preview/compose.research-preview.yaml', import.meta.url), 'utf8');
function service(name) {
  const match = overlay.match(new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  [a-z][a-z0-9-]*:|$(?![\\s\\S]))`, 'm'));
  assert(match, `service missing: ${name}`);
  return match[1];
}

test('combined preview compiles existing product Execution routes, not a fixture consumer', () => {
  assert.match(service('portal-web'), /^        EXECUTION_PREVIEW_ENABLED: "true"$/m);
  const source = readFileSync(new URL('../../apps/portal/frontend/src/execution/ExecutionPreviewRoute.tsx', import.meta.url), 'utf8');
  assert.match(source, /createHttpApi\(\{ policy \}\)/);
  assert.doesNotMatch(source, /createFixtureApi\(/);
});

test('only existing local Execution snapshot is enabled; offline gates cannot inherit true from a host env', () => {
  const control = service('control-api');
  assert.match(control, /^      FEATURE_EXECUTION_COMMAND_CENTER_SNAPSHOT: "true"$/m);
  const disabled = ['EDGE', 'CURRENT_SOURCE_PAPER', 'CURRENT_SOURCE_PAPER_DNSE',
    'CURRENT_SOURCE_SANDBOX', 'CURRENT_SOURCE_LIVE', 'LOCAL_PROJECTION',
    'DURABLE_MIRROR', 'DURABLE_MIRROR_READS', 'REALTIME_SSE', 'ANALYTICS_QUERY',
    'SHADOW_QUERY', 'PAPER_WORKBENCH_SHADOW', 'MARKET_CONTEXT',
    'PUBLIC_MARKET_CANDLES', 'COMMAND_RELAY', 'LOCAL_R0_TASKS'];
  for (const key of disabled) {
    assert.match(control, new RegExp(`^      FEATURE_EXECUTION_${key}: "false"$`, 'm'), key);
  }
  assert.doesNotMatch(control, /^      (?:AUTH_MODE|DATABASE_URL|PORTAL_ENV|EXECUTION_EDGE_.*_FILE):/m);
  assert.doesNotMatch(control, /^      FEATURE_RESEARCH_.*: "false"$/m);
});

test('preview helper still fixes project/overlay and supports no-dependency application-only rollout', () => {
  const script = readFileSync(new URL('./preview.sh', import.meta.url), 'utf8');
  assert.match(script, /PROJECT="portal-research-preview"/);
  assert.match(script, /-f "\$ROOT\/deploy\/research-preview\/compose\.research-preview\.yaml"/);
  assert.match(script, /compose up -d --no-build --no-deps "\$\{recreate\[@\]\}" "\$@"/);
  assert.match(script, /force-recreate needs explicit application services/);
  assert.match(script, /recreate=\(--force-recreate\)/);
  assert.match(script, /scoped application rollout excludes DB\/NATS\/migrations\/bootstrap/);
  assert.match(script, /case "\$service" in control-api\|portal-web\|portal-api\|quant-worker-py\|roadmap-task-board-api\)/);
});
