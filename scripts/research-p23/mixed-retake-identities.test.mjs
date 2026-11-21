import assert from 'node:assert/strict';
import test from 'node:test';
import { allowedRetakeIdentity } from './mixed-retake-identities.mjs';
test('retake account scope permits exactly twenty existing P23 reader names, never real owners or other test operators',()=>{
  for(let i=1;i<=20;i++)assert.equal(allowedRetakeIdentity({username:`p23-reader-${String(i).padStart(2,'0')}`}),true);
  for(const username of ['bobby','stan','thanhvuong','p23-owner','p23-approver','p23-reader-00','p23-reader-21','p23-reader-1']) {
    assert.equal(allowedRetakeIdentity({username}),false);
  }
});
