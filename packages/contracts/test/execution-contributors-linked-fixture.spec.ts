import { afterEach, describe, expect, it, vi } from 'vitest';
import { answerReviewManager } from '../../../apps/portal/fixture-bff/review-manager';
import { setFixtureScale } from '../../../apps/portal/frontend/e2e/bffScale';
import { managerDatasetResponse } from '../../../apps/control-api/src/execution-v2/manager-model.contract';
import { readManagerDataset } from '../../../apps/portal/frontend/src/execution/v2/readers/managerDataset';

// Expand only this test's shared graph; every child keeps a valid parent and
// account/portfolio reference. The deployed fixture scale is not changed.
vi.mock('../../../apps/portal/frontend/e2e/bffScale', async importOriginal => {
  const source = await importOriginal<any>();
  return { ...source, scaled: () => {
    const graph = source.scaled();
    return { ...graph, alphas: [0, 1, 2].flatMap(copy => graph.alphas.map((alpha: any) => ({
      ...alpha, id: `${alpha.id}_copy${copy}`, name: `${alpha.name} copy ${copy}`,
      deployments: alpha.deployments.map((child: any) => ({ ...child, id: `${child.id}_copy${copy}`, alphaId: `${alpha.id}_copy${copy}` })),
    }))) };
  } };
});

const query = (extra: Record<string, string> = {}) => new URLSearchParams({ environment: 'live', group_by: 'alpha_id,portfolio_id', limit: '1', group_limit: '17', ...extra });
function read(search: URLSearchParams, path = '/manager/fund-overview'): any {
  const answer = answerReviewManager('GET', path, search, 'populated');
  expect(answer?.status, JSON.stringify(answer?.body)).toBe(200);
  const parsed = managerDatasetResponse.safeParse(answer!.body);
  expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues)).toBe(true);
  return answer!.body;
}
describe('Contributors linked fixture paging', () => {
  afterEach(() => setFixtureScale('small'));
  it('leaves ungrouped reads compatible with the existing frontend reader', () => {
    setFixtureScale('medium');
    const body = read(new URLSearchParams({ environment: 'live', limit: '1' }));
    expect(body.group_page).toBeUndefined();
    expect(readManagerDataset(body)).not.toBeNull();
  });
  it('traverses more than 200 complete groups independently from the one-row page and returns backwards', () => {
    setFixtureScale('large');
    const first = read(query());
    expect(first.group_page.authorized_filtered_count).toBeGreaterThan(200);
    expect(first.items).toHaveLength(1);
    expect(first.groups).toHaveLength(17);
    const second = read(query({ group_after: first.group_page.next_cursor }));
    expect(second.items).toEqual(first.items);
    expect(read(query({ group_before: second.group_page.previous_cursor })).groups).toEqual(first.groups);
    const seen = new Set(first.groups.map((group: any) => JSON.stringify(group.key)));
    let current = first;
    while (current.group_page.next_cursor) {
      current = read(query({ group_after: current.group_page.next_cursor }));
      for (const group of current.groups) {
        const key = JSON.stringify(group.key);
        expect(seen.has(key)).toBe(false);
        seen.add(key);
        expect(group.attribution.alpha_id).toBe(group.key[0].value);
        expect(group.attribution.name).toEqual(expect.any(String));
        expect(group.attribution.name_reason_code).toBeNull();
      }
    }
    expect(seen.size).toBe(first.group_page.authorized_filtered_count);
    const wider = read(query({ group_limit: '34' }));
    expect(wider.groups).toHaveLength(34);
    expect(wider.groups.slice(0, 17)).toEqual(first.groups);
    // Rich partitions can exceed the byte cap before the cardinality cap.
    // Refuse explicitly; never silently omit groups to make the page fit.
    expect(answerReviewManager('GET', '/manager/fund-overview', query({ group_limit: '200' }), 'populated')?.status).toBe(400);
  });
  it('rejects malformed controls and row/group cursor confusion or changed context', () => {
    setFixtureScale('medium');
    const first = read(query());
    for (const extra of [{ group_limit: '0' }, { group_limit: '201' }, { group_limit: '1.1' }, { group_after: 'x', group_before: 'y' }, { group_after: 'x'.repeat(4097) }, { group_before: first.group_page.next_cursor }, { group_after: first.page.next_cursor }, { after: first.group_page.next_cursor }]) {
      expect(answerReviewManager('GET', '/manager/fund-overview', query(extra), 'populated')?.status).toBe(400);
    }
    for (const extra of [{ window: '7D' }, { workspace_id: 'another-workspace' }, { group_limit: '18' }]) {
      expect(answerReviewManager('GET', '/manager/fund-overview', query({ ...extra, group_after: first.group_page.next_cursor }), 'populated')?.status).toBe(409);
    }
    expect(answerReviewManager('GET', '/manager/fund-overview', new URLSearchParams({ environment: 'live', group_limit: '2' }), 'populated')?.status).toBe(400);
  });
  it('ALL aggregates the entire environment populations before independent group paging', () => {
    setFixtureScale('large');
    const first = read(query({ environment: 'ALL' }), '/manager/fleet');
    const single = read(query());
    expect(first.page.authorized_filtered_count).toBeGreaterThan(single.page.authorized_filtered_count);
    expect(first.group_page.authorized_filtered_count).toBeGreaterThan(200);
    const second = read(query({ environment: 'ALL', group_after: first.group_page.next_cursor }), '/manager/fleet');
    expect(read(query({ environment: 'ALL', group_before: second.group_page.previous_cursor }), '/manager/fleet').groups).toEqual(first.groups);
  });
});
