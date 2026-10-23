import { describe, it, expect } from 'vitest';
import { topologyWorld } from '../tooling/execution-manager-scoped-world.mjs';
import { positiveManagerWorld } from '../tooling/execution-manager-positive-world.mjs';
describe('linked positive Manager fixture world', () => {
  it('preserves one identity graph and leaves original absence scenarios untouched', () => {
    const before = topologyWorld();
    const world = positiveManagerWorld();
    expect(world.tuples).toEqual(before.tuples);
    expect(world.bindings).toEqual(before.bindings);
    expect(topologyWorld()).toEqual(before);
    expect(positiveManagerWorld()).toEqual(world);
  });
  it.each(['paper', 'sandbox', 'live'])('%s links every allocation, strategy, deployment and account with exact book tie-outs', environment => {
    const world = positiveManagerWorld(); const rows = world.relations[environment];
    expect(new Set(rows.account_balances.map((r: any) => r.account_id)).size).toBe(2);
    for (const tuple of world.tuples) {
      expect(rows.portfolios.some((r: any) => r.portfolio_id === tuple.portfolio_id)).toBe(true);
      expect(world.bindings.some((r: any) => r.account_id === tuple.account_id)).toBe(true);
      const pair = world.strategy_pairs.find((r: any) => r.alpha_id === tuple.alpha_id);
      expect(rows.strategies.some((r: any) => r.strategy_id === pair.strategy_id)).toBe(true);
    }
    const allocation = rows.portfolio_allocations.reduce((sum: bigint, r: any) => sum + BigInt(r.allocated_capital), 0n);
    const pnl = rows.positions_v2.reduce((sum: bigint, r: any) => sum + BigInt(r.realized_pnl) + BigInt(r.unrealized_pnl), 0n);
    const balance = rows.account_balances.reduce((sum: bigint, r: any) => sum + BigInt(r.total), 0n);
    expect(balance).toBe(allocation + pnl);
    for (const row of rows.account_balances) expect(BigInt(row.total)).toBe(BigInt(row.free) + BigInt(row.locked));
  });
});
