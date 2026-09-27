import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readBoundedJson, makeClient } from './api-client.mjs';

test('bounded private JSON reader returns exact values without conversion', async () => {
  const response = new Response('{"value":"9007199254740993.01"}', { headers: { 'content-type': 'application/json' } });
  assert.deepEqual(await readBoundedJson(response), { value: '9007199254740993.01' });
});
test('reader cancels an oversized stream before consuming its next chunk', async () => {
  let pulls = 0, cancelled = false;
  const response = new Response(new ReadableStream({
    pull(controller) { pulls++; controller.enqueue(new Uint8Array(16)); },
    cancel() { cancelled = true; },
  }, { highWaterMark: 0 }), { headers: { 'content-type': 'application/json' } });
  await assert.rejects(readBoundedJson(response, 8), /NAMED_RESPONSE_BOUND_EXCEEDED/);
  assert.equal(pulls, 1); assert(cancelled);
});
test('client refuses non-test principals before any fetch', () => {
  assert.throws(() => makeClient({ username: 'bobby' }), /TEST_IDENTITY_REQUIRED/);
});
