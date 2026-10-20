// BE-P14 / RV-12: the TEST_ONLY source worlds the scoped Manager scenarios are read from.
// A world is plain JSON: topology (what an access publication would say), strategy/binding lineage, and the raw relation rows a retained
// profile snapshot would hold per environment. The control-api spec `elp2-manager-scoped-fixtures.spec.ts` feeds the SAME world to the
// real ScopedManagerReader and compares its answer with the published scenario, so a scenario is never a hand-made shape.
// Nothing here is a financial fact; every id, name and amount is TEST_ONLY.
export const WORKSPACE = 'workspace_TEST_ONLY';
export const AS_OF_MS = 1790812800000;
// The retained-review configuration profile names (config.ts pins exactly these three); they carry no account or credential.
export const PROFILES = { paper: 'PAPER_BINANCE_USDM', sandbox: 'SANDBOX_BINANCE_USDM', live: 'LIVE_BINANCE_USDM' };
const STAGE = { paper: 'PAPER', sandbox: 'SANDBOX', live: 'LIVE' };
// Per environment amounts differ so a page can never be mistaken for another environment's page.
const SCALE = { paper: ['1000.50', '250.125', '5000.00', '4500.00', '500.00'], sandbox: ['500.5', '75', '1200', '1100', '100'], live: ['2000', '10.000000000000000001', '90000.75', '80000.75', '10000'] };

/** Three alphas, three portfolios, two bindings. A2 and A3 share ONE physical account (XS); A1 has its own (X1). */
export function topologyWorld() {
  const tuple = (n, account) => ({ alpha_id: `alpha_TEST_ONLY_A${n}`, alpha_version_id: `version_TEST_ONLY_A${n}`, portfolio_id: `portfolio_TEST_ONLY_P${n}`, deployment_id: `deployment_TEST_ONLY_D${n}`, account_id: account });
  const tuples = [tuple(1, 'account_TEST_ONLY_X1'), tuple(2, 'account_TEST_ONLY_XS'), tuple(3, 'account_TEST_ONLY_XS')];
  const names = { 1: 'Aurora', 2: 'Borealis', 3: 'Cirrus' };
  const relations = {};
  for (const environment of ['paper', 'sandbox', 'live']) {
    const [a, b, total, free, locked] = SCALE[environment];
    relations[environment] = {
      strategies: [1, 2, 3].map(n => ({ strategy_id: `strategy_TEST_ONLY_S${n}`, name: `TEST_ONLY Alpha ${names[n]}`, state: 'ACTIVE', stage: STAGE[environment],
        venue: 'VENUE_TEST_ONLY', base_currency: 'USD', updated_at: AS_OF_MS - 60000 * n })),
      portfolios: [1, 2, 3].map(n => ({ portfolio_id: `portfolio_TEST_ONLY_P${n}`, name: `TEST_ONLY Portfolio ${names[n]}`, state: 'ACTIVE', base_currency: n === 3 ? 'EUR' : 'USD', updated_at: AS_OF_MS - 120000 * n })),
      venue_accounts: [1, 2].map(n => ({ binding_id: `binding_TEST_ONLY_B${n}`, name: `TEST_ONLY Binding ${names[n]}`, venue: 'VENUE_TEST_ONLY', state: 'ACTIVE', base_currency: 'USD', updated_at: AS_OF_MS - 180000 * n })),
      // P1 holds two currencies (a multi-currency item); P2 an explicit zero; P3 an explicit null. Three different things.
      portfolio_allocations: [
        { portfolio_id: 'portfolio_TEST_ONLY_P1', alpha_id: 'alpha_TEST_ONLY_A1', currency: 'USD', allocated_capital: a },
        { portfolio_id: 'portfolio_TEST_ONLY_P1', alpha_id: 'alpha_TEST_ONLY_A1', currency: 'EUR', allocated_capital: b },
        { portfolio_id: 'portfolio_TEST_ONLY_P2', alpha_id: 'alpha_TEST_ONLY_A2', currency: 'USD', allocated_capital: '0' },
        { portfolio_id: 'portfolio_TEST_ONLY_P3', alpha_id: 'alpha_TEST_ONLY_A3', currency: 'EUR', allocated_capital: null }],
      account_balances: [
        { account_id: 'account_TEST_ONLY_X1', currency: 'USD', total, free, locked },
        { account_id: 'account_TEST_ONLY_XS', currency: 'USD', total: '20000.000000000000000001', free: '19000', locked: '1000.000000000000000001' }],
      // positions_v2 states no currency: its facts are listed but never enter a currency total.
      positions_v2: [
        { position_id: 'position_TEST_ONLY_1', strategy_id: 'strategy_TEST_ONLY_S1', account_id: 'account_TEST_ONLY_X1', realized_pnl: '12.5', unrealized_pnl: '-3.25', notional: '800' },
        { position_id: 'position_TEST_ONLY_2', strategy_id: 'strategy_TEST_ONLY_S2', account_id: 'account_TEST_ONLY_XS', realized_pnl: '0', unrealized_pnl: '7.000000000000000001', notional: '1500' },
        { position_id: 'position_TEST_ONLY_3', strategy_id: 'strategy_TEST_ONLY_S3', account_id: 'account_TEST_ONLY_XS', realized_pnl: '-1', unrealized_pnl: '0', notional: '2500' }],
    };
  }
  return { kind: 'TOPOLOGY', workspace_id: WORKSPACE, profiles: PROFILES, tuples,
    strategy_pairs: [1, 2, 3].map(n => ({ strategy_id: `strategy_TEST_ONLY_S${n}`, alpha_id: `alpha_TEST_ONLY_A${n}` })),
    bindings: [{ binding_id: 'binding_TEST_ONLY_B1', account_id: 'account_TEST_ONLY_X1' }, { binding_id: 'binding_TEST_ONLY_B2', account_id: 'account_TEST_ONLY_XS' }],
    // The researcher owns A1 and A2 and is a member of P1 and P2. A3 and P3 are a peer's: they must never reach this reader's bytes.
    researcher: { own_alpha_ids: ['alpha_TEST_ONLY_A1', 'alpha_TEST_ONLY_A2'], member_portfolio_ids: ['portfolio_TEST_ONLY_P1', 'portfolio_TEST_ONLY_P2'] },
    relations };
}

/** Programmatic world: `alphas` independent alphas on the paper profile, one portfolio and one account each. Alpha 0 holds `wide_currencies`
 * allocation rows, one per currency, so its item reaches the 200-total bound. Built identically by the control-api spec. */
export function gridWorld({ alphas, wide_currencies }) {
  const pad = n => String(n).padStart(3, '0');
  const tuples = [], strategy_pairs = [], strategies = [], portfolios = [], allocations = [], balances = [];
  for (let n = 0; n < alphas; n++) {
    const id = pad(n);
    tuples.push({ alpha_id: `alpha_TEST_ONLY_G${id}`, alpha_version_id: `version_TEST_ONLY_G${id}`, portfolio_id: `portfolio_TEST_ONLY_G${id}`, deployment_id: `deployment_TEST_ONLY_G${id}`, account_id: `account_TEST_ONLY_G${id}` });
    strategy_pairs.push({ strategy_id: `strategy_TEST_ONLY_G${id}`, alpha_id: `alpha_TEST_ONLY_G${id}` });
    strategies.push({ strategy_id: `strategy_TEST_ONLY_G${id}`, name: `TEST_ONLY Alpha ${id}`, state: 'ACTIVE', stage: 'PAPER', venue: 'VENUE_TEST_ONLY', base_currency: 'USD', updated_at: AS_OF_MS - n });
    portfolios.push({ portfolio_id: `portfolio_TEST_ONLY_G${id}`, name: `TEST_ONLY Portfolio ${id}`, state: 'ACTIVE', base_currency: 'USD', updated_at: AS_OF_MS - n });
    if (n === 0) for (let c = 0; c < wide_currencies; c++)
      allocations.push({ portfolio_id: `portfolio_TEST_ONLY_G${id}`, alpha_id: `alpha_TEST_ONLY_G${id}`, currency: `C${pad(c)}`, allocated_capital: `${c + 1}.5` });
    else allocations.push({ portfolio_id: `portfolio_TEST_ONLY_G${id}`, alpha_id: `alpha_TEST_ONLY_G${id}`, currency: 'USD', allocated_capital: `${n * 10}.25` });
    balances.push({ account_id: `account_TEST_ONLY_G${id}`, currency: 'USD', total: n ? `${n}000` : '0', free: n ? `${n}000` : '0', locked: '0' });
  }
  return { kind: 'GRID', workspace_id: WORKSPACE, profiles: PROFILES, tuples, strategy_pairs, bindings: [], researcher: { own_alpha_ids: [], member_portfolio_ids: [] },
    relations: { paper: { strategies, portfolios, venue_accounts: [], portfolio_allocations: allocations, account_balances: balances, positions_v2: [] } } };
}
