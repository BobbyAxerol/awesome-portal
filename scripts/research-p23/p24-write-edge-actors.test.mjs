import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EDGE_USERS, FOLLOWUP_USERS, FOLLOWUP_PRODUCER_USER, campaignProfile, requireEdgeUser } from './p24-write-edge-actors.mjs';

test('old and follow-up QA names are finite and separate', () => {
  assert.equal(new Set([...EDGE_USERS, ...FOLLOWUP_USERS, FOLLOWUP_PRODUCER_USER]).size, 7);
  for (const username of [...EDGE_USERS, ...FOLLOWUP_USERS, FOLLOWUP_PRODUCER_USER]) {
    assert.equal(requireEdgeUser({ username }).username, username);
  }
  for (const username of ['bobby', 'stan', 'thanhvuong', 'p24-round2-owner', 'p24-round2-producer-extra']) {
    assert.throws(() => requireEdgeUser({ username }), /EXACT_FRESH_EDGE_QA_ONLY/);
  }
});

test('campaign selection is a pure finite guard and keeps the old defaults', () => {
  assert.deepEqual(campaignProfile(), { isFollowup: false, users: EDGE_USERS, producerUser: 'p24-edge-producer' });
  assert.deepEqual(campaignProfile('cinema-remaining'), { isFollowup: true, users: FOLLOWUP_USERS, producerUser: FOLLOWUP_PRODUCER_USER });
  for (const campaign of ['anything-else', 'prod', '', '../write-edges']) {
    assert.throws(() => campaignProfile(campaign), /FINITE_APPROVED_CAMPAIGN_ONLY/);
  }
});
