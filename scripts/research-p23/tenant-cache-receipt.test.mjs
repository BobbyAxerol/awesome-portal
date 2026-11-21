import assert from 'node:assert/strict';
import test from 'node:test';
import { assessTenantCache } from './tenant-cache-receipt.mjs';

const safe = { status: 200, cache_control: 'private, no-cache', etag: 'W/"rev"' };
const row = name => ({ name, owner: safe, nonmember: { status: 404, error_code: 'NOT_FOUND' },
  anonymous: { status: 401, error_code: 'UNAUTHENTICATED' }, should_revalidate: true,
  owner_revalidate: { status: 304, cache_control: 'private, no-cache' } });

test('ten route member and conditional-cache matrix is only scoped T05 evidence', () => {
  const result = assessTenantCache(Array.from({ length: 10 }, (_, index) => row(`route-${index}`)));
  assert.equal(result.member_boundary_passed, true);
  assert.equal(result.cache_policy_passed, true);
  assert.equal(result.revalidation_passed, true);
  assert.equal(result.full_t05_passed, false);
});
test('missing policy, body-ETag mismatch and forbidden cache re-use are independent failures', () => {
  const rows = Array.from({ length: 10 }, (_, index) => row(`route-${index}`));
  rows[0].owner = { ...safe, cache_control: null };
  rows[1].owner_revalidate = { status: 200, cache_control: null };
  rows[2].nonmember = { status: 304, error_code: null };
  const result = assessTenantCache(rows);
  assert.deepEqual(result.missing_policy, ['route-0']);
  assert.deepEqual(result.bad_revalidation, ['route-1']);
  assert.deepEqual(result.bad_authority, ['route-2']);
  assert.equal(result.full_t05_passed, false);
});
