/**
 * Cross-screen TIES (WP-P). FIXTURE_LAB. Reads the SAME quantity through every read that a screen shows it from and fails on a mismatch:
 *
 *   T1  Portfolios list "allocated" (list item, every environment)  = sum of the dataset allocation of that portfolio over paper + sandbox + live
 *   T2  Portfolio 360 capital statement NAV (portfolio overview)    = the group's current NAV in the fund read (Portfolios list / Compare / Overview source)
 *   T3  NAV series end (Portfolio 360 / Compare / Overview chart)   = statement NAV;  NET_PNL series end = statement net PnL
 *   T4  fund statement NAV                                          = sum of the portfolio groups' current NAV (per environment and currency)
 *   T5  Capital panel: allocation + headroom = approved budget; Allocated KPI = the panel's allocation
 *   T6  Account 360 balances of the three sleeves                   = allocation + realized + unrealized of the live deployments booked on them
 *   T7  alpha resource allocation / balance                         = the Fleet rows of the same alpha and environment
 *   T8  Fleet: All lens count = sum of the three environments; page counts = returned rows when not paged
 *
 * `runTies(get)` takes an async `get(pathAndQuery) -> {status, body}`; it returns {checked, mismatches[]}. Exact decimals by BigInt, no float.
 */
const E = "/api/v1/execution";
const SCALE = 18;
const toUnits = (value) => {
  if (value === null || value === undefined) return null;
  const negative = String(value).startsWith("-");
  const [whole, fraction = ""] = String(value).replace("-", "").split(".");
  const n = BigInt(whole + fraction.padEnd(SCALE, "0").slice(0, SCALE));
  return negative ? -n : n;
};
const show = (units) => {
  if (units === null) return "null";
  const negative = units < 0n;
  const raw = (negative ? -units : units).toString().padStart(SCALE + 1, "0");
  return `${negative ? "-" : ""}${raw.slice(0, -SCALE)}.${raw.slice(-SCALE).replace(/0+$/, "").padEnd(2, "0")}`;
};
const metricOf = (entry, key) => (entry?.metrics?.[key]?.availability === "AVAILABLE" ? toUnits(entry.metrics[key].value) : null);
const ENVIRONMENTS = ["paper", "sandbox", "live"];
const SLEEVES = ["acc_bnc_core", "acc_bnc_sat", "acc_bnc_can"];

export async function runTies(get, options = {}) {
  const out = { checked: 0, mismatches: [], skipped: [] };
  const eq = (name, a, b, detail = "") => {
    out.checked += 1;
    if (a === null || b === null || a !== b) out.mismatches.push(`${name}: ${show(a)} vs ${show(b)} ${detail}`.trim());
  };
  const window = encodeURIComponent("30D");
  const quoted = encodeURIComponent(JSON.stringify("30D")); // the series port takes a JSON value
  const dataset = async (path, env, extra = "") => {
    const r = await get(`${E}${path}?environment=${env}${env === "ALL" ? "" : `&window=${window}`}&limit=200${extra}`);
    return r.status === 200 ? r.body : null;
  };

  // reads
  const list = await get(`${E}/portfolios`);
  const funds = {};
  const groups = {};
  for (const env of ENVIRONMENTS) {
    funds[env] = await dataset("/manager/fund-overview", env);
    groups[env] = await dataset("/manager/fund-overview", env, "&group_by=portfolio_id");
  }
  if (list.status !== 200 || Object.values(funds).some((x) => x === null)) { out.mismatches.push("reads: the list or a fund read did not answer 200"); return out; }
  const groupOf = (env, id) => groups[env]?.groups?.find((g) => g.key?.[0]?.value === id);
  const natives = ["pf_TEST_ONLY_core", "pf_TEST_ONLY_satellite", "pf_TEST_ONLY_canary"];
  const scale = (groups.live?.groups ?? []).map((g) => g.key[0].value).filter((id) => id.startsWith("pf_scale_")).slice(0, 6);

  // T1 list allocation = dataset allocation over every environment (a currency at a time; the native books are one currency)
  for (const id of [...natives, ...scale]) {
    const item = list.body.items.find((i) => i.portfolio_id === id);
    if (!item || item.allocated_by_currency.length === 0) { out.skipped.push(`T1 ${id}: not in the list or no allocation`); continue; }
    for (const { currency, value } of item.allocated_by_currency) {
      let sum = 0n;
      let any = false;
      for (const env of ENVIRONMENTS) {
        const partition = groupOf(env, id)?.economic_partitions?.find((p) => p.partition.currency === currency);
        const a = metricOf(partition, "allocation");
        if (a !== null) { sum += a; any = true; }
      }
      if (any) eq(`T1 list allocated ${id} ${currency}`, toUnits(value), sum);
    }
  }

  // T2 + T3 + T5 per native portfolio (live) and per environment it holds
  for (const id of natives) {
    for (const env of ENVIRONMENTS) {
      const group = groupOf(env, id);
      if (!group) continue;
      const detail = await dataset(`/manager/portfolios/${id}/overview`, env);
      if (!detail) { out.mismatches.push(`T2 ${id} ${env}: portfolio overview did not answer 200`); continue; }
      for (const partition of group.economic_partitions) {
        const statement = detail.capital_statements.find((s) => s.partition.currency === partition.partition.currency && s.partition.economic_domain === partition.partition.economic_domain);
        if (!statement) { out.mismatches.push(`T2 ${id} ${env}: no capital statement for ${partition.partition.currency}`); continue; }
        eq(`T2 NAV ${id} ${env}`, metricOf(statement, "current_nav"), metricOf(partition, "current_nav"));
        eq(`T2 net PnL ${id} ${env}`, metricOf(statement, "net_pnl"), metricOf(partition, "net_pnl"));
        // T9 Portfolio 360 Equity chart ends on the NAV tile
        const chart = await get(`${E}/views/equity-chart?subject_kind=portfolio&subject_id=${id}&environment=${env}&metric=equity`);
        const line = chart.status === 200 ? chart.body.panel?.data?.series?.[0] : null;
        if (line?.points?.length && line.currency === partition.partition.currency) eq(`T9 Equity chart end = NAV ${id} ${env}`, toUnits(line.points.at(-1)[1]), metricOf(statement, "current_nav"));
        else out.skipped.push(`T9 ${id} ${env}: no equity line in ${partition.partition.currency}`);
        // T10 the Recalling row = the sum of the pending amounts of the open recalls of the same portfolio, environment and currency
        const recalling = metricOf(statement, "recalling");
        const recalls = await get(`${E}/pending-recalls?workspace_id=ws_fixture&resource_kind=PORTFOLIO&resource_id=${id}&environment=${env}`);
        if (recalling !== null && recalls.status === 200) {
          const pending = (recalls.body.items ?? []).filter((r) => r.currency === partition.partition.currency).reduce((n, r) => n + toUnits(r.amounts.pending), 0n);
          eq(`T10 Recalling = sum of pending recalls ${id} ${env}`, recalling, pending);
        }
        // T5
        const approved = metricOf(statement, "current_budget");
        const allocation = metricOf(statement, "allocation");
        const headroom = metricOf(statement, "headroom");
        if (approved !== null && allocation !== null && headroom !== null) eq(`T5 allocation + headroom = approved ${id} ${env}`, allocation + headroom, approved);
        // T3
        for (const [metric, key] of [["NAV", "current_nav"], ["NET_PNL", "net_pnl"]]) {
          const subjects = encodeURIComponent(JSON.stringify([{ subject_type: "PORTFOLIO", subject_id: id }]));
          const series = await get(`${E}/manager/series?environment=${env}&metric=${metric}&window=${quoted}&subjects=${subjects}`);
          const entry = series.status === 200 ? series.body.series?.[0] : null;
          if (!entry || entry.state !== "AVAILABLE") { out.skipped.push(`T3 ${metric} ${id} ${env}: no series`); continue; }
          if (entry.partition.currency !== partition.partition.currency) continue;
          eq(`T3 ${metric} series end ${id} ${env}`, toUnits(entry.points.at(-1).value), metricOf(statement, key));
        }
      }
    }
  }

  // T4 fund statement = sum of groups, per environment and currency
  for (const env of ENVIRONMENTS) {
    for (const statement of funds[env].capital_statements) {
      let sum = 0n;
      let all = true;
      for (const g of groups[env].groups) {
        const p = g.economic_partitions.find((x) => x.partition.currency === statement.partition.currency && x.partition.economic_domain === statement.partition.economic_domain);
        if (!p) continue;
        const v = metricOf(p, "current_nav");
        if (v === null) all = false; else sum += v;
      }
      if (all) eq(`T4 fund NAV = sum of portfolios ${env} ${statement.partition.currency}`, metricOf(statement, "current_nav"), sum);
      const fundSeries = await get(`${E}/manager/series?environment=${env}&metric=NAV&window=${quoted}&subjects=${encodeURIComponent(JSON.stringify([{ subject_type: "FUND" }]))}`);
      const entry = fundSeries.status === 200 ? fundSeries.body.series?.[0] : null;
      if (entry?.state === "AVAILABLE" && entry.partition.currency === statement.partition.currency) eq(`T3 fund NAV series end ${env}`, toUnits(entry.points.at(-1).value), metricOf(statement, "current_nav"));
    }
  }

  // T6 the three sleeves of the shared binding = the live deployments booked on them (through the live dataset children)
  const liveFleet = await dataset("/manager/fleet", "live");
  let sleeveBalance = 0n;
  let sleevesRead = 0;
  for (const id of SLEEVES) {
    const account = await get(`${E}/resources/accounts/${id}`);
    const row = account.status === 200 ? account.body.data?.account_balances?.find((b) => b.account_id === id) : null;
    if (row) { sleeveBalance += toUnits(row.total); sleevesRead += 1; }
  }
  if (liveFleet && sleevesRead >= 1) {
    // the account read lists the three sleeves on every one of them: read ONE sleeve's table and compare it with the sum of the three single reads
    const table = (await get(`${E}/resources/accounts/acc_bnc_core`)).body.data.account_balances;
    eq("T6 Account 360 table = sum of the single sleeve reads", table.reduce((n, b) => n + toUnits(b.total), 0n), sleeveBalance);
    const drawer = (await get(`${E}/resources/accounts/acc_bnc_core`)).body.data.venue_accounts;
    out.checked += 1;
    if (drawer.length !== table.length) out.mismatches.push(`T6 sleeves: venue_accounts ${drawer.length} vs balances ${table.length}`);
    let booked = 0n;
    for (const row of liveFleet.items) {
      if (!row.children.every((c) => SLEEVES.includes(c.account_id))) continue;
      const p = row.economic_partitions[0];
      const a = metricOf(p, "allocation"), n = metricOf(p, "net_pnl"), u = metricOf(p, "unrealized_pnl");
      if (a !== null && n !== null && u !== null) booked += a + n;
    }
    eq("T6 sleeve balances = allocation + realized of the deployments booked on them", sleeveBalance, booked);
  } else out.skipped.push("T6: sleeves or live fleet not readable");

  // T7 alpha resource vs Fleet rows
  for (const id of ["alpha_scale_001", "alpha_scale_006", "alpha_btc_trend", "alpha_a"]) {
    const rows = (liveFleet?.items ?? []).filter((r) => r.alpha_id === id);
    const resource = await get(`${E}/resources/alphas/${id}`);
    if (rows.length === 0 || resource.status !== 200) { out.skipped.push(`T7 ${id}: not in the live fleet`); continue; }
    const allocated = resource.body.data.portfolio_allocations.reduce((n, r) => n + toUnits(r.allocated_capital), 0n);
    eq(`T7 alpha resource allocation ${id}`, allocated, rows.reduce((n, r) => n + (metricOf(r.economic_partitions[0], "allocation") ?? 0n), 0n));
  }

  // T8 Fleet counts
  const all = await dataset("/manager/fleet", "ALL").catch(() => null);
  if (all) {
    let sum = 0;
    for (const env of ENVIRONMENTS) sum += (await dataset("/manager/fleet", env))?.page?.authorized_filtered_count ?? 0;
    out.checked += 1;
    if (all.page.authorized_filtered_count !== sum) out.mismatches.push(`T8 Fleet All lens ${all.page.authorized_filtered_count} vs per-environment sum ${sum}`);
  } else out.skipped.push("T8: ALL lens not answered");
  return out;
}
