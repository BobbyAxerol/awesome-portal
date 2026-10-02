import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateOrderedPage } from './b8-fresh-source-receipt.mjs';
const page = { availability:{state:'AVAILABLE'},counts:{returned:2},rows:[{audit_ordinal:0},{audit_ordinal:1}] };
test('source ordinal pagination is exact and does not accept repeated/descending rows',()=>{
  assert.equal(validateOrderedPage(page,'audit'),1);
  assert.throws(()=>validateOrderedPage(page,'audit',0));
  assert.throws(()=>validateOrderedPage({...page,rows:[{audit_ordinal:1},{audit_ordinal:1}]},'audit'));
});
test('receipt refuses incomplete/source-absent and oversized pages',()=>{
  assert.throws(()=>validateOrderedPage({...page,availability:{state:'NOT_PUBLISHED'}},'audit'));
  assert.throws(()=>validateOrderedPage({...page,counts:{returned:1}},'audit'));
  assert.throws(()=>validateOrderedPage({...page,untrusted:'x'.repeat(1_048_577)},'audit'));
});
