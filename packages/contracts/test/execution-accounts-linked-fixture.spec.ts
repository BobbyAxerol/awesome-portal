import { describe, it, expect, afterEach } from 'vitest';
import { answerFixtureRequest, V2_OPTIONS } from '../../../apps/portal/frontend/e2e/bffAnswerer';
import { scaled, setFixtureScale, addDecimal } from '../../../apps/portal/frontend/e2e/bffScale';
import { transformReviewBody } from '../../../apps/portal/fixture-bff/review-relations';
import { mapBindingFigures } from '../../../apps/control-api/src/manager-lists/binding-figures';
import { readBindings, readProfileEnvelope, readBindingDetail } from '../../../apps/portal/frontend/src/execution/api/profileRead';
import { readBindingExposure, readAnalyticsEnvelope } from '../../../apps/portal/frontend/src/execution/analytics';

function raw(path: string, search = ''): any {
  const answer = answerFixtureRequest({ method: 'GET', path, search, headers: {}, body: null }, { ...V2_OPTIONS, simulated: true });
  expect(answer?.status).toBe(200);
  return answer!.body;
}
function read(path: string, search = ''): any { return transformReviewBody(path, raw(path, search), 'populated'); }
describe('Accounts list linked review fixture', () => {
  afterEach(() => setFixtureScale('small'));
  it.each(['medium', 'large'] as const)('%s: complete snapshot counts and graph figures survive page traversal', scale => {
    setFixtureScale(scale);
    const all = scaled();
    for (const environment of ['paper', 'sandbox', 'live']) {
      let after: string | null = null;
      let count = 0;
      let expected = 0;
      do {
        const query = new URLSearchParams({ environment, limit: '7' });
        if (after) query.set('after', after);
        const page = read('/api/v1/execution/broker-bindings', query.toString());
        expect(readBindings(page)).not.toBeNull();
        expected = page.page.total_count;
        expect(page.counts.by_environment[environment]).toBe(expected);
        expect(page.counts.all).toBe(all.bindings.length + 5);
        for (const row of page.page.rows) {
          count++;
          const binding = all.bindings.find(b => b.bindingId === row.binding_id);
          if (!binding) continue;
          expect(mapBindingFigures(row.figures)).toEqual(row.figures);
          if (['NOT_PUBLISHED', 'EXPIRED'].includes(binding.credentialState)) {
            expect(row.figures.native_equity).toBeNull();
            const exposure = read(`/api/v1/execution/broker-bindings/${encodeURIComponent(binding.bindingId)}/exposure`);
            expect(readBindingExposure(exposure)).not.toBeNull();
            expect(readAnalyticsEnvelope(exposure)).not.toBeNull();
            expect(exposure.analytics.data.buckets).toEqual([]);
            const detail = read(`/api/v1/execution/resources/accounts/${binding.accountId}`, `environment=${environment}`);
            expect(detail.data.broker_sync ?? []).toEqual([]);
            continue;
          }
          const detail = read(`/api/v1/execution/resources/accounts/${binding.accountId}`, `environment=${environment}`);
          const exposure = read(`/api/v1/execution/broker-bindings/${encodeURIComponent(binding.bindingId)}/exposure`);
          const item = read(`/api/v1/execution/broker-bindings/${encodeURIComponent(binding.bindingId)}`, `environment=${environment}`);
          expect(readProfileEnvelope(detail)).not.toBeNull();
          expect(readBindingExposure(exposure)).not.toBeNull();
          expect(readAnalyticsEnvelope(exposure)).not.toBeNull();
          expect(readBindingDetail(item)).not.toBeNull();
          expect(item.item.figures).toEqual(row.figures);
          for (const used of row.figures.virtual_used) {
            const source = all.alphas.flatMap(a => a.deployments).filter(d => d.accountId === binding.accountId && d.environment === environment && d.currency === used.currency);
            expect(used.value).toBe(source.reduce((sum, d) => addDecimal(sum, d.allocation), '0'));
            const physical = detail.data.broker_sync.find((b: any) => b.currency === used.currency);
            const bucket = exposure.analytics.data.buckets.find((b: any) => b.currency === used.currency);
            expect(row.figures.native_equity.find((b: any) => b.currency === used.currency).value).toBe(physical.native_equity);
            expect(physical.native_equity).not.toBe(physical.wallet_balance);
            expect(bucket.used).toBe(used.value);
            expect(addDecimal(bucket.used, bucket.headroom)).toBe(physical.native_equity);
            expect(addDecimal(bucket.available, bucket.reserved)).toBe(bucket.headroom);
            expect(bucket.oldest_source_as_of).toBe(used.observed_at);
          }
        }
        after = page.page.next_cursor;
      } while (after);
      expect(count).toBe(expected);
    }
  });
  it('does not rewrite native named scenarios, unknown routes, failures or original responses', () => {
    setFixtureScale('medium');
    const path = '/api/v1/execution/broker-bindings/bnc_main%40BINANCE/exposure';
    const source = raw(path), before = JSON.stringify(source);
    expect(transformReviewBody(path, source, 'populated')).toEqual(source);
    expect(JSON.stringify(source)).toBe(before);
    const denied = { error: 'DENIED' };
    expect(transformReviewBody('/api/v1/execution/broker-bindings', denied, 'populated')).toBe(denied);
    expect(transformReviewBody('/unrelated', source, 'populated')).toBe(source);
  });
});
