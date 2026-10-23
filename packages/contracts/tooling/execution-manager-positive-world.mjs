import { topologyWorld } from './execution-manager-scoped-world.mjs';

/** Full positive review story using the existing scoped-reader world shape.
 * All IDs come from topologyWorld, including its shared physical account.
 * Negative, null and multicurrency scenarios remain in the original factory.
 * Allocation is opening capital; current balance includes synthetic PnL.
 */
export function positiveManagerWorld() {
  const world = topologyWorld();
  for (const [environment, scale] of [['paper', 1], ['sandbox', 2], ['live', 3]]) {
    const rows = world.relations[environment];
    rows.portfolios.forEach(row => { row.base_currency = 'USD'; });
    rows.portfolio_allocations = world.tuples.map((tuple, index) => ({
      portfolio_id: tuple.portfolio_id, alpha_id: tuple.alpha_id, currency: 'USD',
      allocated_capital: String((index + 1) * scale * 1000),
    }));
    rows.positions_v2.forEach((row, index) => {
      row.realized_pnl = String((index + 1) * scale * 10);
      row.unrealized_pnl = String(-(index + 1) * scale * 2);
      row.notional = String((index + 1) * scale * 800);
    });
    rows.account_balances = world.bindings.map(binding => {
      const indexes = world.tuples.flatMap((tuple, index) => tuple.account_id === binding.account_id ? [index] : []);
      const opening = indexes.reduce((sum, index) => sum + BigInt(rows.portfolio_allocations[index].allocated_capital), 0n);
      const pnl = indexes.reduce((sum, index) => sum + BigInt(rows.positions_v2[index].realized_pnl) + BigInt(rows.positions_v2[index].unrealized_pnl), 0n);
      const total = opening + pnl;
      const locked = opening / 5n;
      return { account_id: binding.account_id, currency: 'USD', total: String(total), free: String(total - locked), locked: String(locked) };
    });
  }
  return world;
}
