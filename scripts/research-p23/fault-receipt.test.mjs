import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertFaultPreservation } from './fault-receipt.mjs';
test('an outage cannot claim preservation after changing source, pins or authority',()=>{
  const before={producer:{manifest:'a'},source:[{sequence:1}],principal:{role:'USER'}};
  assert.doesNotThrow(()=>assertFaultPreservation(before,structuredClone(before)));
  for(const changed of [{...before,source:[]},{...before,producer:{manifest:'b'}},
    {...before,principal:{role:'ADMIN'}}]) assert.throws(()=>assertFaultPreservation(before,changed));
});
