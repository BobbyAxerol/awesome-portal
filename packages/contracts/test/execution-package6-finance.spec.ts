import { afterEach, describe, expect, it } from 'vitest';
import { answerFixtureRequest, V2_OPTIONS } from '../../../apps/portal/frontend/e2e/bffAnswerer';
import { scaled, setFixtureScale, addDecimal } from '../../../apps/portal/frontend/e2e/bffScale';
import { transformReviewBody } from '../../../apps/portal/fixture-bff/review-relations';
import { linkedReviewFinance } from '../../../apps/portal/fixture-bff/review-finance';
import { readProfileEnvelope } from '../../../apps/portal/frontend/src/execution/api/profileRead';

describe('package6 linked fixture financial statement', () => {
  afterEach(() => setFixtureScale('small'));
  it.each(['medium', 'large'] as const)('%s account allocation names and financial grains agree with shared graph', scale => {
    setFixtureScale(scale);
    let checked = 0;
    for (const binding of scaled().bindings) {
      const path = `/api/v1/execution/resources/accounts/${binding.accountId}`;
      const raw = answerFixtureRequest({ method: 'GET', path, search: `environment=${binding.environment}`, headers: {}, body: null }, { ...V2_OPTIONS, simulated: true });
      expect(raw?.status).toBe(200);
      const before = JSON.stringify(raw!.body);
      const body = transformReviewBody(path, raw!.body, 'populated') as any;
      expect(readProfileEnvelope(body)).not.toBeNull();
      expect(JSON.stringify(raw!.body)).toBe(before);
      if (['EXPIRED', 'NOT_PUBLISHED'].includes(binding.credentialState)) {
        expect(body.data.portfolio_allocations ?? []).toEqual((raw!.body as any).data.portfolio_allocations ?? []);
        continue;
      }
      for (const row of body.data.portfolio_allocations ?? []) {
        const alpha = scaled().alphas.find(a => a.deployments.some(d => d.id === row.deployment_id))!;
        const d = alpha.deployments.find(d => d.id === row.deployment_id)!;
        expect(row.portfolio_name).toBe(d.portfolioName);
        expect(row.strategy_name).toBe(alpha.label);
        expect(row.currency).toBe(d.currency);
        expect(row.updated_at).toBe(d.updatedAt);
        expect(addDecimal(row.exposure_long, row.exposure_short)).toBe(addDecimal(d.exposure, '0'));
        expect(row.exposure_gross).toBe(d.exposure);
        expect(addDecimal(row.budget_used, '500')).toBe(row.budget_approved);
        expect(row.allocated_capital).toBe(d.allocation);
        expect(body.data.deployments.find((r: any) => r.deployment_id === d.id).portfolio_name).toBe(row.portfolio_name);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(10);
  });
  it('does not cross account/environment/portfolio/currency boundaries or invent unknown data', () => {
    setFixtureScale('medium');
    const binding = scaled().bindings.find(b => !['EXPIRED', 'NOT_PUBLISHED'].includes(b.credentialState) && scaled().alphas.some(a => a.deployments.some(d => d.accountId === b.accountId)))!;
    const d = scaled().alphas.flatMap(a => a.deployments).find(d => d.accountId === binding.accountId)!;
    const row = { account_id: binding.accountId, deployment_id: d.id, portfolio_id: d.portfolioId, mode: d.environment, currency: d.currency };
    for (const mutation of [{ account_id: 'unknown' }, { portfolio_id: 'unknown' }, { mode: 'wrong' }, { currency: 'XYZ' }, { deployment_id: 'unknown' }]) {
      const body = { data: { portfolio_allocations: [{ ...row, ...mutation }] } };
      expect(linkedReviewFinance(`/api/v1/execution/resources/accounts/${binding.accountId}`, body)).toEqual(body);
    }
    const denied = { error: { code: 'DENIED' } };
    expect(linkedReviewFinance(`/api/v1/execution/resources/accounts/${binding.accountId}`, denied)).toBe(denied);
  });
  it('200-order pages retain complete order VWAP/fees despite the100-fill cap', () => {
    setFixtureScale('large');
    const path = '/api/v1/execution/screens/blotter';
    const get = (search: string): any => answerFixtureRequest({ method: 'GET', path, search, headers: {}, body: null }, { ...V2_OPTIONS, simulated: true })!.body;
    const raw = get('limit=200');
    expect(raw.data.fills).toHaveLength(100);
    const before = JSON.stringify(raw);
    const fixed: any = linkedReviewFinance(path, raw);
    const complete = new Map<string, any>();
    let after: string | null = null;
    for (let page = 0; page < 8; page++) {
      const body = get(`limit=25${after ? `&after=${after}` : ''}`);
      expect(body.data.fills.length).toBeLessThan(100);
      for (const row of body.data.orders) complete.set(row.order_id, row);
      after = body.data.page.next_cursor;
    }
    for (const row of fixed.data.orders) {
      const source = complete.get(row.order_id)!;
      for (const key of ['average_fill_price', 'filled_quantity', 'fee', 'fee_currency']) expect(row[key]).toBe(source[key]);
    }
    const tail = fixed.data.orders.slice(150).filter((row: any) => row.status === 'FILLED');
    expect(tail.length).toBeGreaterThan(0);
    expect(tail.every((row: any) => typeof row.average_fill_price === 'string')).toBe(true);
    expect(fixed.data.orders.some((row: any) => row.average_fill_price && !row.fee_currency)).toBe(true);
    expect(fixed.data.fills).toEqual(raw.data.fills);
    expect(fixed.data.page).toEqual(raw.data.page);
    expect(JSON.stringify(raw)).toBe(before);
  });
  it('resolves final source pages and filtered tail orders without mixing fee currencies', () => {
    setFixtureScale('large');
    const path = '/api/v1/execution/screens/blotter';
    const get = (search: string): any => answerFixtureRequest({ method: 'GET', path, search, headers: {}, body: null }, { ...V2_OPTIONS, simulated: true })!.body;
    const complete = new Map<string, any>();
    const mixed = new Set<string>();
    let after: string | null = null;
    let tailCursor = '';
    for (let page = 0; page < 60; page++) {
      const source = get(`limit=25${after ? `&after=${after}` : ''}`);
      expect(source.data.fills.length).toBeLessThan(100);
      for (const order of source.data.orders) {
        complete.set(order.order_id, order);
        const fills = source.data.fills.filter((fill: any) => fill.client_order_id === order.client_order_id);
        if (new Set(fills.map((fill: any) => fill.commission_currency)).size > 1 &&
            fills.every((fill: any) => typeof fill.commission === 'string')) mixed.add(order.order_id);
      }
      after = source.data.page.next_cursor;
      if (page === 51) tailCursor = after!; // 1300 consumed,200 remain.
    }
    expect(after).toBeNull();
    expect(complete.size).toBe(1500);
    const filter = 'status_bucket=FILLED&symbol=ETHUSDT';
    const firstFiltered = get(`limit=50&${filter}`);
    const queries = [`limit=200&after=${tailCursor}`, `limit=200&${filter}&after=${firstFiltered.data.page.next_cursor}`];
    let mixedChecked = 0;
    for (const query of queries) {
      const raw = get(query);
      expect(raw.data.fills).toHaveLength(100);
      const fixed: any = linkedReviewFinance(path, raw);
      expect(fixed.data.orders.map((r: any) => r.order_id)).toEqual(raw.data.orders.map((r: any) => r.order_id));
      expect(fixed.data.page).toEqual(raw.data.page);
      for (const order of fixed.data.orders) {
        const source = complete.get(order.order_id)!;
        for (const key of ['average_fill_price', 'filled_quantity', 'fee', 'fee_currency']) expect(order[key]).toBe(source[key]);
        if (mixed.has(order.order_id)) {
          expect(order).not.toHaveProperty('fee');
          expect(order).not.toHaveProperty('fee_currency');
          expect(order.average_fill_price).toBeDefined();
          mixedChecked++;
        }
      }
      expect(fixed.data.orders.some((order: any) => Number(order.order_id.slice(4)) < 25)).toBe(true);
      if (query.includes('symbol=')) expect(fixed.data.orders.every((order: any) => order.symbol === 'ETHUSDT' && order.status === 'FILLED')).toBe(true);
    }
    expect(mixedChecked).toBeGreaterThan(0);
  });
});
