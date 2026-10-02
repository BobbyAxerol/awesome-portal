import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertActorLocked} from './b8-rc-terminal-receipt.mjs';
test('actor-local sealed draft requires consistent read/action lock',()=>{
  const value={local_seal:{state:'SEALED_LOCAL'},actions:{may_edit_draft:false,may_seal:false,seal_blocked_reason:'P21_ALREADY_SEALED'}};
  assertActorLocked(value);
  assert.throws(()=>assertActorLocked({...value,actions:{...value.actions,may_edit_draft:true}}));
  assert.throws(()=>assertActorLocked({...value,local_seal:{state:'UNSEALED'}}));
});
