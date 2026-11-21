import test from 'node:test';
import assert from 'node:assert/strict';
import { compareParity } from './direct-parity-receipt.mjs';

const runId = 'rrun_d8e174e6268aedbf868de56edd062b29';
function sample() {
  return {
    source: {
      engine_version: '1.1.1',
      direct: { bars: '636', final_equity: '20130.193634373325', num_trades: '4' },
      sealed_source: { bars: '636', final_equity: '20130.193634373325', num_trades: '4' },
    },
    api: {
      run_id: runId, availability: { state: 'AVAILABLE' }, readiness: 'COMPLETE',
      core: { engine_version: '1.1.1' },
      metrics: [
        { key: 'BARS_PROCESSED', value: '636', origin: 'ENGINE_DIRECT', definition_id: 'bars', availability: { state: 'AVAILABLE' } },
        { key: 'FINAL_EQUITY', value: '20130.193634373325', origin: 'ENGINE_DIRECT', definition_id: 'equity', availability: { state: 'AVAILABLE' } },
        { key: 'TRADE_COUNT', value: '4', origin: 'ENGINE_DIRECT', definition_id: 'trades', availability: { state: 'AVAILABLE' } },
      ],
    },
  };
}

test('exact direct engine, sealed source and owner BFF metric values agree', () => {
  const { source, api } = sample();
  assert.deepEqual(compareParity(source, api).differences,
    { bars: '0', final_equity: '0', num_trades: '0' });
});

test('a changed sealed source or BFF value is not accepted as numerical parity', () => {
  const sealed = sample(); sealed.source.sealed_source.final_equity = '20130.193634373326';
  assert.throws(() => compareParity(sealed.source, sealed.api), /final_equity_SOURCE_DIFF/);
  const bff = sample(); bff.api.metrics[1].value = '20130.193634373326';
  assert.throws(() => compareParity(bff.source, bff.api), /final_equity_API_DIFF/);
});

test('typed absence and a different run cannot pass the direct-data receipt', () => {
  const absent = sample(); absent.api.metrics[0].availability.state = 'NOT_PUBLISHED';
  assert.throws(() => compareParity(absent.source, absent.api), /BARS_PROCESSED_UNAVAILABLE/);
  const foreign = sample(); foreign.api.run_id = 'rrun_foreign';
  assert.throws(() => compareParity(foreign.source, foreign.api), /RUN_BINDING_MISMATCH/);
});
