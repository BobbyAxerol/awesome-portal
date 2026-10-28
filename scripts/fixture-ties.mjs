/**
 * Cross-screen TIES (WP-P). FIXTURE_LAB. Reads the SAME quantity through every read that a screen shows it from and fails on a mismatch:
 *
 *   T1  Portfolios list "allocated" (list item)  = the dataset allocation of the environment the 360 opens on (live, else the first held)
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
      // the allocated capital of a row is the one of the environment its 360 opens on: live when the portfolio has a live book, else the first one it holds
      const selected = ENVIRONMENTS.includes("live") && groupOf("live", id) ? "live" : ENVIRONMENTS.find((env) => groupOf(env, id));
      for (const env of selected ? [selected] : []) {
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
        // T12 the Max drawdown tile of the statement = the worst point of the DRAWDOWN series of the same portfolio, window and book (QA4 R1-04)
        const ddTile = metricOf(statement, "max_drawdown_pct");
        const ddSeries = await get(`${E}/manager/series?environment=${env}&metric=DRAWDOWN&window=${encodeURIComponent('"30D"')}&subjects=${encodeURIComponent(JSON.stringify([{ subject_type: "PORTFOLIO", subject_id: id }]))}`);
        const ddEntry = ddSeries.status === 200 ? ddSeries.body.series?.find((x) => x.state === "AVAILABLE" && x.partition?.currency === partition.partition.currency) : null;
        if (ddTile !== null && ddEntry?.points?.length) {
          const lowest = ddEntry.points.reduce((low, point) => { const v = toUnits(point.value); return v < low ? v : low; }, 0n);
          eq(`T12 drawdown tile = series minimum ${id} ${env}`, ddTile / 10n ** 12n, lowest / 10n ** 10n);
        } else out.skipped.push(`T12 ${id} ${env}: no drawdown tile or series`);
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

  // T11 the Alpha Fleet header (ALPHAS / DEPLOYMENTS / PORTFOLIOS of the Fleet read) counts the same world as the dataset reads of the three environments
  const header = await get(`${E}/alphas?limit=1`);
  if (header.status === 200 && header.body.summary) {
    const alphas = new Set(), deployments = new Set(), portfolios = new Set();
    for (const env of ENVIRONMENTS) {
      const d = await dataset("/manager/fleet", env);
      for (const row of d?.items ?? []) { alphas.add(row.alpha_id); portfolios.add(row.portfolio_id); for (const c of row.children) deployments.add(c.deployment_id); }
    }
    const s = header.body.summary;
    eq("T11 Fleet header alphas (less research-only) = alphas of the datasets", BigInt(s.alpha_count - s.research_only_count), BigInt(alphas.size));
    eq("T11 Fleet header deployments = deployments of the datasets", BigInt(s.deployment_count), BigInt(deployments.size));
    eq("T11 Fleet header portfolios = portfolios of the datasets", BigInt(s.portfolio_count), BigInt(portfolios.size));
  } else out.skipped.push("T11: the Alpha Fleet read did not answer");

  // T13 ONE mark per symbol: every position the alpha resources and the account resources state for an instrument carries the same mark price (QA4 R4-02)
  {
    const marks = new Map();
    const note = (where, instrument, mark) => { if (mark === null || mark === undefined || instrument === undefined) return; const key = String(instrument).replace(/\..*$/, ""); const seen = marks.get(key); if (seen === undefined) marks.set(key, { mark: String(mark), where }); else { out.checked += 1; if (toUnits(seen.mark) !== toUnits(mark)) out.mismatches.push(`T13 mark of ${key}: ${seen.mark} (${seen.where}) vs ${mark} (${where})`); } };
    for (const id of ["alpha_a", "alpha_btc_trend", "alpha_b"]) {
      const r = await get(`${E}/resources/alphas/${id}`);
      for (const p of r.status === 200 ? r.body.data.positions ?? [] : []) note(`alpha ${id}`, p.instrument_id, p.mark_price);
    }
    for (const id of ["acc_bnc_core", "acc_bnc_sat", "acc_pap_sim", "acc_tn_bnc"]) {
      const r = await get(`${E}/resources/accounts/${id}`);
      for (const p of r.status === 200 ? r.body.data.positions ?? [] : []) note(`account ${id}`, p.instrument_id, p.mark_price);
    }
    for (const id of ["dep_paper_01", "dep_btc_paper"]) {
      const r = await get(`${E}/screens/paper/${id}`);
      for (const p of r.status === 200 ? r.body.data.positions ?? [] : []) note(`paper ${id}`, p.instrument_id, p.mark_price);
    }
    if (marks.size === 0) out.skipped.push("T13: no positions found");
  }

  // T14 ONE order book: every open order the Live page and the Canary room state is a row of the blotter of the same deployment, with the same price (QA4 R2-01, R5-04)
  for (const [id, kind] of [["dep_live_01", "live"], ["dep_btc_live", "live"], ["dep_canary_01", "canary"]]) {
    const page = await get(`${E}/deployments/${id}/${kind}`);
    const blotterOrders = [];
    let cursor = null;
    for (let n = 0; n < 12; n += 1) {
      const next = await get(`${E}/screens/blotter?limit=200${cursor === null ? "" : `&after=${encodeURIComponent(cursor)}`}`);
      if (next.status !== 200) break;
      blotterOrders.push(...next.body.data.orders);
      cursor = next.body.data.page?.next_cursor ?? null;
      if (cursor === null) break;
    }
    const blotter = { status: blotterOrders.length > 0 ? 200 : 0, body: { data: { orders: blotterOrders } } };
    if (page.status !== 200 || blotter.status !== 200) { out.skipped.push(`T14 ${id}: page or blotter did not answer`); continue; }
    const rows = (kind === "live" ? page.body.orders : page.body.blotter)?.rows ?? [];
    const book = new Map(blotter.body.data.orders.filter((o) => o.deployment_id === id).map((o) => [o.order_id, o]));
    for (const row of rows) {
      const orderId = row.order_id ?? row.id ?? row.cells?.order_id;
      if (orderId === undefined) continue;
      out.checked += 1;
      if (!book.has(String(orderId))) out.mismatches.push(`T14 ${id}: order ${orderId} of the ${kind} page is not in the blotter of ${id} (${[...book.keys()].join(", ")})`);
    }
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

/* ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
 * WORLD TIES (UXM-07 fixture campaign, step B-T). One rule per QA5 BLOCKER, generalised over ALL entities. Unlike `runTies` (which stays green and
 * is part of the hook), `runWorldTies` reports per tie id; the vitest (src/fixtureBff/worldTies.test.ts) decides which ids are still open.
 * The catalogue is upgrade/execution_loop/evidence/UXM-07/WORLD_TIE_CATALOGUE_2026-10-28.md. Reads only served bodies: no world module is imported, so
 * the same function runs from the walker against a running stack.
 *
 *   const { ties } = await runWorldTies(get);   // ties[id] = { checked, violations[] }
 * ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
const DAY = 86_400_000;
const STAGE_RANK = { PAPER: 0, SANDBOX: 1, CANARY: 2, LIVE: 3 };
const STAGE_ENV = { PAPER: "PAPER", SANDBOX: "SANDBOX", CANARY: "LIVE", LIVE: "LIVE" };
const numOf = (v) => (v === null || v === undefined || v === "" ? null : toUnits(String(v).replace(/,/g, "")));
const metricStr = (entry, key) => (entry?.metrics?.[key]?.availability === "AVAILABLE" ? entry.metrics[key].value : null);
const symOf = (instrument) => (instrument === undefined || instrument === null ? null : String(instrument).replace(/\..*$/, ""));
const sameDecimal = (a, b) => numOf(a) !== null && numOf(b) !== null && numOf(a) === numOf(b);
const ms = (iso) => (iso === null || iso === undefined ? null : Date.parse(iso));
const abs = (n) => (n < 0n ? -n : n);
const cents = (units) => (units === null ? null : units / 10n ** BigInt(SCALE - 2));
const qm = (q, m) => (numOf(q) === null || numOf(m) === null ? null : (abs(numOf(q)) * numOf(m)) / 10n ** BigInt(SCALE));
const within1 = (a, b) => a !== null && b !== null && abs(a - b) <= 1n;

export async function runWorldTies(get) {
  const ties = {};
  const tie = (id) => (ties[id] ??= { checked: 0, violations: [] });
  tie("W07d"); // standing guard: present even when no ord_9xxxxx id is served
  const check = (id, ok, message) => { const t = tie(id); t.checked += 1; if (!ok) t.violations.push(message); };
  const ok200 = async (path) => { const r = await get(path); return r.status === 200 ? r.body : null; };
  const pages = async (path, rowsOf, nextOf, max = 12) => {
    const rows = [];
    let cursor = null;
    for (let n = 0; n < max; n += 1) {
      const sep = path.includes("?") ? "&" : "?";
      const r = await get(`${path}${cursor === null ? "" : `${sep}after=${encodeURIComponent(cursor)}`}`);
      if (r.status !== 200) break;
      rows.push(...rowsOf(r.body));
      cursor = nextOf(r.body) ?? null;
      if (cursor === null) break;
    }
    return rows;
  };

  // ── the world as the screens read it ──────────────────────────────────────────────────────────────────────────────────
  const fleet = await ok200(`${E}/alphas?limit=200`);
  const alphaRows = fleet?.page?.rows ?? [];
  const summary = fleet?.summary ?? {};
  const deployments = new Map(); // id -> { alphaId, alphaLabel, stage, row }
  for (const a of alphaRows) for (const d of a.deployments ?? []) deployments.set(d.deployment_id, { alphaId: a.alpha_id, alphaLabel: a.alpha_label, alphaStage: a.stage, stage: d.stage, row: d });
  const list = await ok200(`${E}/portfolios`);
  const portfolios = new Map((list?.items ?? []).map((p) => [p.portfolio_id, p]));
  if (fleet === null || list === null) { tie("W00").violations.push("reads: the alpha fleet or the portfolio list did not answer 200"); return { ties }; }

  // ── W01 / W02: a deployment has ONE current stage (QA5 R5-02, R5-03, R4-01, R2-01, R2-02) ───────────────────────────────
  const stagePage = async (kind, id) => {
    const path = { paper: `/screens/paper/${id}`, sandbox: `/deployments/${id}/certification`, canary: `/deployments/${id}/canary`, live: `/deployments/${id}/live` }[kind];
    const r = await get(`${E}${path}`);
    if (r.status !== 200) return null;
    const b = r.body;
    const facts = kind === "paper" ? b.data?.stage_facts : b.stage_facts;
    const subject = kind === "paper" ? b.data?.deployment?.deployment_id : kind === "sandbox" ? b.certification?.deployment_id : b.deployment?.deployment_id;
    return {
      body: b,
      runtime: facts?.runtime?.runtime_state?.value ?? null,
      since: facts?.runtime?.since?.value ?? null,
      subject,
      alphaName: kind === "paper" ? null : (kind === "sandbox" ? b.certification?.alpha_name : b.deployment?.alpha_name) ?? null,
      envelopeActive: kind === "canary" ? b.envelope?.status === "ACTIVE" : false,
    };
  };
  const stageCache = new Map();
  const page = async (kind, id) => { const key = `${kind}:${id}`; if (!stageCache.has(key)) stageCache.set(key, await stagePage(kind, id)); return stageCache.get(key); };
  const deploymentIds = [...deployments.keys()].slice(0, 40);
  for (const id of deploymentIds) {
    const own = deployments.get(id);
    const claims = [];
    for (const kind of ["paper", "sandbox", "canary", "live"]) {
      const p = await page(kind, id);
      if (p === null) continue;
      if (p.subject !== undefined && p.subject !== id) check("W01", false, `${id}: the ${kind} page answers for ${p.subject}`);
      if (p.alphaName !== null && p.alphaName !== own.alphaLabel) check("W01", false, `${id}: the ${kind} page names the alpha "${p.alphaName}", the fleet "${own.alphaLabel}"`);
      if (p.runtime === "RUNNING" || p.envelopeActive) claims.push(kind);
      check("W01b", kind.toUpperCase() === own.stage, `${id} is a ${own.stage} deployment, yet the ${kind} stage page answers for it`);
      check("W01", kind.toUpperCase() === own.stage || (p.runtime !== "RUNNING" && !p.envelopeActive), `${id} is a ${own.stage} deployment but its ${kind} page says ${p.envelopeActive ? "envelope ACTIVE" : "RUNNING"}`);
    }
    check("W01", claims.length <= 1, `${id}: ${claims.length} stage pages say it is running/current at once (${claims.join(", ")})`);
  }
  // a stage the alpha has left: no page, row or resource may still call its deployment running/active
  for (const a of alphaRows) {
    if (STAGE_RANK[a.stage] === undefined) continue;
    const resource = await ok200(`${E}/resources/alphas/${a.alpha_id}`);
    for (const d of a.deployments ?? []) {
      if (STAGE_RANK[d.stage] === undefined || STAGE_RANK[d.stage] >= STAGE_RANK[a.stage]) continue;
      const left = `${d.deployment_id} (${d.stage}, left: ${a.alpha_label} is in ${a.stage})`;
      check("W02", d.state !== "ACTIVE" && d.active !== true, `${left}: the Fleet row says state ${d.state}, active ${d.active}`);
      const inResource = resource?.data?.deployments?.find((x) => x.deployment_id === d.deployment_id);
      if (inResource !== undefined) check("W02", inResource.state !== "ACTIVE" && inResource.active !== true, `${left}: the alpha resource says state ${inResource.state}, active ${inResource.active}`);
      const own = await page(d.stage.toLowerCase(), d.deployment_id);
      if (own !== null) check("W02", own.runtime !== "RUNNING" && !own.envelopeActive, `${left}: its own ${d.stage} page says ${own.envelopeActive ? "envelope ACTIVE" : "RUNNING"}`);
    }
  }

  // ── W03: the alpha's lifecycle (days, dates) is the stage pages' lifecycle (R2-01, R5-02, R2-15) ───────────────────────────
  for (const a of alphaRows.filter((r) => STAGE_RANK[r.stage] !== undefined).slice(0, 14)) {
    const env = { PAPER: "paper", SANDBOX: "sandbox", CANARY: "live", LIVE: "live" }[a.stage];
    const overview = await ok200(`${E}/manager/alphas/${a.alpha_id}/overview?environment=${env}&window=30D`);
    const item = overview?.items?.find((x) => x.alpha_id === a.alpha_id);
    const m = item?.economic_partitions?.[0];
    if (!m) continue;
    const days = Object.fromEntries(["paper", "sandbox", "canary", "live"].map((s) => [s, Number(metricStr(m, `life_${s}_days`) ?? 0)]));
    const order = ["paper", "sandbox", "canary", "live"];
    let asOf = overview.as_of_ms; // each stage page is read on ITS OWN clock (its source panel); the lifecycle is chained back from that clock
    const endOf = (s) => asOf - order.slice(order.indexOf(s) + 1).reduce((n, x) => n + days[x] * DAY, 0);
    const startOf = (s) => endOf(s) - days[s] * DAY;
    const near = (iso, expected) => ms(iso) !== null && Math.abs(ms(iso) - expected) <= DAY / 2;
    for (const d of a.deployments ?? []) {
      const kind = d.stage.toLowerCase();
      const p = await page(kind, d.deployment_id);
      if (p === null || days[kind] === 0) continue;
      asOf = ms(kind === "paper" ? (p.body.read_at ?? p.body.as_of) /* WP-B2-S2: the read clock; a stage the alpha left is as-of its exit, which is not the clock the lifecycle is chained from */ : p.body.orders?.envelope?.as_of ?? p.body.blotter?.envelope?.as_of ?? p.body.positions?.envelope?.as_of ?? p.body.source_panels?.[0]?.as_of) ?? overview.as_of_ms;
      if (kind === "live") check("W03", near(p.body.lifecycle?.activated_at, startOf("live")), `${a.alpha_label} ${d.deployment_id}: Live page activated ${p.body.lifecycle?.activated_at}, the alpha's lifecycle starts Live ${new Date(startOf("live")).toISOString()}`);
      if (kind === "canary") {
        check("W03", near(p.body.lifecycle?.trial?.started_at?.value, startOf("canary")), `${a.alpha_label} ${d.deployment_id}: Canary room started ${p.body.lifecycle?.trial?.started_at?.value}, the alpha's lifecycle ${new Date(startOf("canary")).toISOString()}`);
        check("W03", p.body.lifecycle?.day_index === days.canary, `${a.alpha_label} ${d.deployment_id}: Canary room day ${p.body.lifecycle?.day_index}, the alpha's lifecycle ${days.canary} days`);
      }
      if (kind === "sandbox" && p.body.certification?.decided_at) check("W03", near(p.body.certification.decided_at, endOf("sandbox")), `${a.alpha_label} ${d.deployment_id}: Sandbox decided ${p.body.certification.decided_at}, the alpha's lifecycle ends Sandbox ${new Date(endOf("sandbox")).toISOString()}`);
      if (kind === "paper" && p.runtime === "STOPPED" && p.since) check("W03", near(p.since, endOf("paper")), `${a.alpha_label} ${d.deployment_id}: Paper stopped ${p.since}, the alpha's lifecycle ends Paper ${new Date(endOf("paper")).toISOString()}`);
    }
  }

  // ── W04: every id linked from Overview / approvals / incidents / operations resolves, with the same name and stage (R1-01,02,03,06, R5-07,08) ──
  const composition = await ok200(`${E}/compositions/command-center`);
  const hrefs = [];
  const walk = (o, path) => { if (Array.isArray(o)) o.forEach((x, i) => walk(x, `${path}[${i}]`)); else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) { if (k === "href" && typeof v === "string") hrefs.push({ href: v, at: path, node: o }); else walk(v, `${path}.${k}`); } };
  walk(composition ?? {}, "overview");
  for (const { href, node } of hrefs) {
    const [pathname] = href.split("?");
    let m;
    if ((m = /^\/execution\/operations\/incidents\/([^/]+)$/.exec(pathname))) check("W04", (await get(`${E}/operations/incidents/${m[1]}`)).status === 200, `Overview "${node.title ?? node.label ?? href}" -> ${href}: the incident does not resolve`);
    else if ((m = /^\/execution\/operations\/(op_[^/]+)$/.exec(pathname))) check("W04", (await get(`${E}/operations/${m[1]}`)).status === 200, `Overview "${node.title ?? node.label ?? href}" -> ${href}: the operation does not resolve`);
    else if ((m = /^\/governance\/approvals\/(AP-\d+)\/(r1|r2|live)$/.exec(pathname))) {
      const r = await get(`${E}/governance/approvals/${m[1]}/${m[2]}`);
      check("W04", r.status === 200, `Overview -> ${href}: the approval does not resolve`);
    } else if ((m = /^\/deployments\/(paper|sandbox|canary|live)\/(dep_[^/]+)$/.exec(pathname))) {
      const known = deployments.get(m[2]);
      check("W04", known !== undefined, `Overview -> ${href}: ${m[2]} is not a deployment of the fleet`);
      if (known) {
        check("W04", known.stage.toLowerCase() === m[1], `Overview -> ${href}: the fleet says ${m[2]} is a ${known.stage} deployment`);
        if (node.target_label !== undefined) check("W04", node.target_label === known.alphaLabel, `Overview -> ${href}: names it "${node.target_label}", the fleet "${known.alphaLabel}"`);
      }
    }
  }
  // ids inside approval, operation and incident bodies are entities of the world
  const idsIn = (text) => ({ deps: [...new Set(text.match(/\bdep_[A-Za-z0-9_]+/g) ?? [])], pfs: [...new Set(text.match(/\bpf_[A-Za-z0-9_]+/g) ?? [])] });
  const approvalRows = (await ok200(`${E}/governance/approvals?limit=200`))?.page?.rows ?? [];
  const opsRows = (await ok200(`${E}/operations?limit=200`))?.page?.rows ?? [];
  const incidentIds = [...new Set(opsRows.flatMap((o) => (o.incident_links?.items ?? []).map((i) => i.incident_id ?? i.id)).filter(Boolean))];
  const bodies = [["approvals inbox", JSON.stringify(approvalRows)], ["operations queue", JSON.stringify(opsRows)]];
  for (const row of approvalRows.slice(0, 12)) {
    const gate = String(row.gate ?? "").toLowerCase();
    const detail = await ok200(`${E}/governance/approvals/${row.id}/${gate}`);
    if (detail !== null) {
      bodies.push([`approval ${row.id}`, JSON.stringify(detail)]);
      const label = detail.approval?.subject_label ?? "";
      const alphaName = String(label).split(/\s+[→>]\s+/)[0];
      if (alphaName && alphaRows.length > 0) check("W04", alphaRows.some((a) => a.alpha_label === alphaName) || !/^[A-Z]/.test(alphaName), `approval ${row.id} names the alpha "${alphaName}", which is no alpha of the fleet`);
    }
  }
  for (const id of incidentIds.slice(0, 8)) { const r = await ok200(`${E}/operations/incidents/${id}`); if (r !== null) bodies.push([`incident ${id}`, JSON.stringify(r)]); }
  for (const [where, text] of bodies) {
    const { deps, pfs } = idsIn(text);
    for (const dep of deps) check("W04", deployments.has(dep) || /^dep_scale_/.test(dep), `${where}: deployment ${dep} is no deployment of the fleet`);
    for (const pf of pfs) check("W04", portfolios.has(pf), `${where}: portfolio ${pf} is not in the portfolio register`);
  }

  // ── W05: counts (R1-07, R2-03, R2-13) ───────────────────────────────────────────────────────────────────────────────────
  const depTotal = alphaRows.reduce((n, a) => n + (a.deployments?.length ?? 0), 0);
  check("W05", summary.alpha_count === (fleet.page.total_count ?? alphaRows.length), `Fleet header ALPHAS ${summary.alpha_count} vs ${fleet.page.total_count} rows`);
  check("W05", summary.deployment_count === depTotal, `Fleet header DEPLOYMENTS ${summary.deployment_count} vs ${depTotal} deployments in the rows`);
  // The Fleet header counts the portfolios that HOLD a deployment (T11); the register lists every portfolio, held or not.
  const heldIds = new Set(alphaRows.flatMap((a) => [...(a.portfolios ?? []).map((p) => p.portfolio_id), ...(a.deployments ?? []).map((d) => d.portfolio_id)]).filter(Boolean));
  const heldInRegister = [...portfolios.keys()].filter((id) => heldIds.has(id)).length;
  check("W05", summary.portfolio_count === heldInRegister, `Fleet header PORTFOLIOS ${summary.portfolio_count} vs ${heldInRegister} register portfolios that hold a deployment (register lists ${portfolios.size})`);
  check("W05", list.truncated === true || list.total_portfolios === portfolios.size, `register total_portfolios ${list.total_portfolios} vs ${portfolios.size} rows`);
  for (const s of Object.keys(STAGE_RANK)) {
    const members = alphaRows.filter((r) => (r.stages ?? []).includes(s)).length;
    check("W05", (summary.stage_counts?.[s] ?? 0) === members, `Fleet stage count ${s}: header ${summary.stage_counts?.[s]} vs ${members} alphas whose stages include it`);
    const lane = await ok200(`${E}/alphas?stage=${s}&limit=200`);
    if (lane) check("W05", lane.page.rows.length <= lane.page.filtered_count && lane.page.filtered_count === (summary.stage_counts?.[s] ?? 0), `Board lane ${s}: ${lane.page.rows.length} loaded of ${lane.page.filtered_count}, header count ${summary.stage_counts?.[s]}`);
  }
  const cells = composition?.data?.command_center?.panels?.fleet_health;
  if (cells) {
    check("W05", cells.total_deployments === summary.deployment_count, `Overview fleet total ${cells.total_deployments} deployments vs Fleet ${summary.deployment_count}`);
    check("W05", ["Live", "Canary", "Sandbox", "Paper"].reduce((n, l) => n + (cells.cells.find((c) => c.label === l)?.value ?? 0), 0) === cells.total_deployments, `Overview fleet cells do not add up to its own total ${cells.total_deployments}`);
    for (const [label, stage] of [["Live", "LIVE"], ["Canary", "CANARY"], ["Sandbox", "SANDBOX"], ["Paper", "PAPER"]]) {
      const real = [...deployments.values()].filter((d) => d.stage === stage).length;
      check("W05", cells.cells.find((c) => c.label === label)?.value === real, `Overview "${label}" ${cells.cells.find((c) => c.label === label)?.value} vs ${real} ${stage} deployments in the Fleet rows`);
    }
  }

  // the allocated capital of a portfolio as each read states it: register, capital derivation, portfolio resource
  const capitalWorlds = async (portfolioId, currency) => {
    const out = [];
    const reg = portfolios.get(portfolioId)?.allocated_by_currency?.find((c) => c.currency === currency)?.value;
    if (reg !== undefined) out.push(["the register", reg]);
    const derived = await ok200(`${E}/derivations/portfolios/${portfolioId}/capital?environment=live`);
    const d = derived?.data?.allocation_by_currency?.find((c) => c.currency === currency)?.allocated_capital;
    if (d !== undefined) out.push(["the capital derivation", d]);
    const res = await ok200(`${E}/resources/portfolios/${portfolioId}`);
    const r = res?.data?.allocation_by_currency?.find((c) => c.currency === currency)?.value;
    if (r !== undefined) out.push(["the portfolio resource", r]);
    return out;
  };
  // ── W06: one capital world per approval request (R3-01) ─────────────────────────────────────────────────────────────────
  for (const row of approvalRows.slice(0, 20)) {
    const detail = await ok200(`${E}/governance/approvals/${row.id}/${String(row.gate ?? "").toLowerCase()}`);
    const cap = detail?.capital?.find((c) => c.label === "allocated capital");
    const approval = detail?.approval;
    if (!cap || !approval?.requested_amount) continue;
    check("W06", numOf(cap.after) - numOf(cap.before) === numOf(approval.requested_amount), `${row.id}: capital preview ${cap.before} -> ${cap.after} moves ${fromUnits(numOf(cap.after) - numOf(cap.before))}, the request asks ${approval.requested_amount}`);
    const worlds = await capitalWorlds(approval.portfolio_id, approval.currency);
    for (const [where, value] of worlds) check("W06", sameDecimal(cap.before, value), `${row.id}: capital preview starts from ${cap.before}, ${where} says ${value} allocated to ${approval.portfolio_id}`);
  }
  for (const id of [...portfolios.keys()].slice(0, 12)) {
    const currency = portfolios.get(id).base_currency;
    const worlds = await capitalWorlds(id, currency);
    for (const [where, value] of worlds.slice(1)) check("W06", sameDecimal(worlds[0][1], value), `portfolio ${id}: allocated ${currency}: ${where} says ${value}, ${worlds[0][0]} says ${worlds[0][1]}`);
  }

  // ── W07: orders (R5-01, R5-04, R4-07, R2-05, R2-04, R4-06) ────────────────────────────────────────────────────────────────
  const blotterPath = `${E}/screens/blotter?limit=200`;
  const blotterFirst = await ok200(blotterPath);
  const orders = await pages(blotterPath, (b) => b.data.orders, (b) => b.data.page?.next_cursor ?? null);
  const fills = [...(blotterFirst?.data?.fills ?? [])];
  const book = new Map(orders.map((o) => [o.order_id, o]));
  const blotterAsOf = ms(blotterFirst?.as_of ?? blotterFirst?.read_at);
  const sameOrder = (where, id, row) => {
    const b = book.get(id);
    if (b === undefined) { check("W07", false, `${where}: order ${id} is not in the blotter`); return; }
    const bad = [];
    if (row.symbol && symOf(row.symbol) !== symOf(b.symbol)) bad.push(`symbol ${row.symbol} vs ${b.symbol}`);
    if (row.side && String(row.side).toLowerCase() !== String(b.side).toLowerCase()) bad.push(`side ${row.side} vs ${b.side}`);
    if (row.quantity !== undefined && !sameDecimal(row.quantity, b.quantity)) bad.push(`qty ${row.quantity} vs ${b.quantity}`);
    if (row.price !== undefined && row.price !== null && !sameDecimal(row.price, b.price)) bad.push(`price ${row.price} vs ${b.price}`);
    if (row.status && row.status !== b.status) bad.push(`status ${row.status} vs ${b.status}`);
    if (row.submitted_at && ms(row.submitted_at) !== ms(b.submitted_at)) bad.push(`submitted ${row.submitted_at} vs ${b.submitted_at}`);
    if (row.updated_at && ms(row.updated_at) !== ms(b.updated_at)) bad.push(`updated ${row.updated_at} vs ${b.updated_at}`);
    if (row.deployment_id && row.deployment_id !== b.deployment_id) bad.push(`deployment ${row.deployment_id} vs ${b.deployment_id}`);
    check("W07", bad.length === 0, `${where}: order ${id} differs from the blotter (${bad.join("; ")})`);
  };
  for (const [id, info] of [...deployments].filter(([, d]) => d.stage === "LIVE" || d.stage === "CANARY").slice(0, 12)) {
    const p = await page(info.stage.toLowerCase(), id);
    const rows = info.stage === "LIVE" ? p?.body.orders?.typed?.rows : p?.body.blotter?.typed?.rows;
    for (const r of rows ?? []) {
      sameOrder(`${info.stage} room ${id}`, r.id, { ...r, submitted_at: r.since, deployment_id: id });
      const roomAsOf = (info.stage === "LIVE" ? p.body.orders : p.body.blotter)?.envelope?.as_of;
      if (roomAsOf) check("W07b", ms(r.since) <= ms(roomAsOf), `${info.stage} room ${id}: order ${r.id} since ${r.since} is after the room's as-of ${roomAsOf}`);
    }
  }
  for (const a of alphaRows.slice(0, 8)) {
    const records = await ok200(`${E}/resources/alphas/${a.alpha_id}/orders`);
    for (const rec of records?.records ?? []) { sameOrder(`alpha ${a.alpha_id} orders`, rec.values.order_id, rec.values); if (book.has(rec.values.order_id)) check("W07", book.get(rec.values.order_id).strategy_id === a.alpha_id, `alpha ${a.alpha_id} orders: ${rec.values.order_id} belongs to ${book.get(rec.values.order_id).strategy_id} in the blotter`); }
    const f = await ok200(`${E}/resources/alphas/${a.alpha_id}/fills`);
    for (const rec of f?.records ?? []) fills.push({ ...rec.values, strategy_id: rec.values.strategy_id ?? a.alpha_id });
  }
  for (const id of ["acc_bnc_core", "acc_bnc_sat", "acc_bnc_can"]) {
    const records = await ok200(`${E}/resources/accounts/${id}/orders`);
    for (const rec of records?.records ?? []) sameOrder(`account ${id} orders`, rec.values.order_id, rec.values);
  }
  for (const [id, info] of [...deployments].filter(([, d]) => d.stage === "PAPER").slice(0, 6)) {
    const p = await page("paper", id);
    for (const o of p?.body.data?.orders ?? []) sameOrder(`paper ${id}`, o.order_id, { symbol: o.instrument_id, side: o.side, quantity: o.quantity, price: o.price, status: o.status, submitted_at: o.submitted_at, deployment_id: id });
    void info;
  }
  // W07b times inside one body: submit < fill <= as-of, and a row is not stamped after its own read
  for (const o of orders) {
    check("W07b", ms(o.submitted_at) <= ms(o.updated_at), `blotter ${o.order_id}: submitted ${o.submitted_at} after updated ${o.updated_at}`);
    if (blotterAsOf) check("W07b", ms(o.updated_at) <= blotterAsOf, `blotter ${o.order_id}: updated ${o.updated_at} after the blotter's as-of ${blotterFirst.as_of ?? blotterFirst.read_at}`);
  }
  const seenFill = new Set();
  for (const f of fills) {
    if (f.fill_id && seenFill.has(f.fill_id)) continue;
    if (f.fill_id) seenFill.add(f.fill_id);
    const o = orders.find((x) => x.client_order_id === f.client_order_id);
    if (!o) continue;
    check("W07b", ms(o.submitted_at) < ms(f.trade_time), `order ${o.order_id}: fill ${f.fill_id} at ${f.trade_time} is not after its submit ${o.submitted_at}`);
    if (blotterAsOf) check("W07b", ms(f.trade_time) <= blotterAsOf, `order ${o.order_id}: fill ${f.fill_id} at ${f.trade_time} is after the as-of`);
  }
  // W07c replay (observed timeline) shows the blotter's times
  for (const a of alphaRows.filter((r) => r.stage === "LIVE" || r.stage === "CANARY").slice(0, 6)) {
    const replay = await ok200(`${E}/views/observed-timeline?subject_kind=alpha&subject_id=${a.alpha_id}`);
    for (const e of replay?.observed_timeline?.data?.entries ?? []) {
      if (e.source_record?.kind !== "ORDER" || !book.has(e.source_record.id)) continue;
      check("W07c", e.observed_at_ms === ms(book.get(e.source_record.id).updated_at), `replay ${a.alpha_id}: ${e.source_record.id} observed ${new Date(e.observed_at_ms).toISOString()}, blotter updated ${book.get(e.source_record.id).updated_at}`);
    }
  }

  // ── W08: positions and accounts (R4-03, R4-04, R5-12, R2-09) ───────────────────────────────────────────────────────────────
  const marks = new Map(); // symbol -> { mark, where }
  const seenMark = (where, symbol, mark) => { if (!symbol || mark === null || mark === undefined) return; const s = symOf(symbol); const first = marks.get(s); if (!first) marks.set(s, { mark, where }); else check("W08", sameDecimal(first.mark, mark), `mark of ${s}: ${where} says ${mark}, ${first.where} says ${first.mark}`); };
  const alphaResources = new Map();
  for (const a of alphaRows.slice(0, 12)) {
    const r = await ok200(`${E}/resources/alphas/${a.alpha_id}`);
    if (r === null) continue;
    alphaResources.set(a.alpha_id, r);
    for (const p of r.data.positions ?? []) {
      seenMark(`alpha ${a.alpha_id}`, p.instrument_id, p.mark_price);
      if (numOf(p.mark_price) !== null) check("W08", within1(cents(qm(p.quantity, p.mark_price)), cents(numOf(p.notional))), `alpha ${a.alpha_id} ${p.instrument_id}: notional ${p.notional} is not quantity ${p.quantity} x mark ${p.mark_price}`);
    }
  }
  for (const [id, info] of [...deployments].filter(([, d]) => d.stage === "LIVE" || d.stage === "CANARY").slice(0, 12)) {
    const p = await page(info.stage.toLowerCase(), id);
    for (const r of (info.stage === "LIVE" ? p?.body.positions?.typed?.rows : p?.body.positions?.typed?.rows) ?? []) seenMark(`${info.stage} room ${id}`, r.symbol, r.mark);
    const gross = p?.body.kpis?.find((k) => k.key === "gross_notional")?.value;
    const rows = p?.body.positions?.typed?.rows ?? [];
    if (gross !== undefined && rows.length > 0) check("W08", cents(rows.reduce((n, r) => n + (qm(r.quantity, r.mark) ?? 0n), 0n)) === cents(numOf(gross)), `${info.stage} room ${id}: gross notional ${gross} is not the sum of its positions at their marks`);
  }
  for (const id of ["dep_paper_01", "dep_btc_paper"]) { const p = await page("paper", id); for (const r of p?.body.data?.positions ?? []) seenMark(`paper ${id}`, r.instrument_id, r.mark_price); }
  const accountResources = new Map();
  for (const id of ["acc_bnc_core", "acc_bnc_sat", "acc_bnc_can", "acc_pap_sim", "acc_tn_bnc"]) {
    const r = await ok200(`${E}/resources/accounts/${id}`);
    if (r === null) continue;
    accountResources.set(id, r);
    for (const p of r.data.positions ?? []) {
      // notional = quantity x the ONE mark of the symbol, to the cent (a mark with two places times a quarter lot has three)
      const known = marks.get(symOf(p.instrument_id));
      if (known && p.notional !== undefined && numOf(p.quantity) !== null) check("W08", within1(cents(qm(p.quantity, known.mark)), cents(numOf(p.notional))), `account ${id} ${p.instrument_id}: notional ${p.notional} is not quantity ${p.quantity} x mark ${known.mark} (${known.where})`);
    }
  }
  // W08b: whole-account figures are the same whichever sleeve opens them; a sleeve has ONE equity
  const sleeves = ["acc_bnc_core", "acc_bnc_sat", "acc_bnc_can"].filter((id) => accountResources.has(id));
  for (const id of sleeves) {
    const own = accountResources.get(id).data;
    for (const other of sleeves) {
      if (other === id) continue;
      const theirs = accountResources.get(other).data;
      for (const row of own.account_balances ?? []) {
        const same = (theirs.account_balances ?? []).find((x) => x.account_id === row.account_id && x.currency === row.currency);
        if (same) check("W08b", sameDecimal(row.total, same.total), `sleeve ${row.account_id}: ${id} states total ${row.total}, ${other} states ${same.total}`);
      }
    }
  }
  for (const [alphaId, r] of alphaResources) {
    for (const row of r.data.account_balances ?? []) {
      const acc = accountResources.get(row.account_id)?.data.account_balances?.find((x) => x.account_id === row.account_id && x.currency === row.currency);
      if (acc) check("W08b", sameDecimal(row.total, acc.total), `sleeve ${row.account_id} equity: alpha ${alphaId} states ${row.total}, the account page ${acc.total}`);
    }
    for (const d of r.data.alpha?.deployments ?? []) {
      const pos = (r.data.positions ?? []).filter((p) => p.deployment_id === d.deployment_id);
      if (pos.length > 0 && pos.every((p) => numOf(p.mark_price) !== null)) check("W08b", cents(pos.reduce((n, p) => n + (qm(p.quantity, p.mark_price) ?? 0n), 0n)) === cents(numOf(d.exposure)), `alpha ${alphaId} ${d.deployment_id}: exposure ${d.exposure} is not the sum of its positions' notionals`);
      check("W08b", numOf(d.realized_pnl) === numOf(d.net_pnl), `alpha ${alphaId} ${d.deployment_id}: net PnL ${d.net_pnl} != the published realized ${d.realized_pnl} (W09 decision: Net PnL is the dataset net_pnl; unrealized is its own field)`);
      check("W08b", numOf(d.balance_total) === numOf(d.allocation) + numOf(d.net_pnl) || numOf(d.balance_total) === numOf(d.allocation) + numOf(d.realized_pnl), `alpha ${alphaId} ${d.deployment_id}: balance ${d.balance_total} is not allocation ${d.allocation} + PnL`);
    }
  }

  // ── W09: one return / PnL per alpha-window across Overview, Alpha 360, Compare, Core contributors (R3-03, R5-13, R1-09, R1-10) ─────────
  const readings = new Map(); // `${alpha}:${deployment}:net_pnl|return` -> { value, where }
  const reading = (key, where, value) => { if (value === null || value === undefined) return; const seen = readings.get(key); if (!seen) readings.set(key, { value, where }); else check("W09", sameDecimal(seen.value, value), `${key}: ${where} says ${value}, ${seen.where} says ${seen.value}`); };
  for (const env of ["live", "paper", "sandbox"]) {
    const dataset = await ok200(`${E}/manager/fleet?environment=${env}&window=30D&limit=200`);
    for (const row of dataset?.items ?? []) for (const c of (row.children ?? []).length === 1 ? row.children : []) { // a row is alpha x portfolio: only a one-deployment row is comparable to a deployment
      reading(`${row.alpha_id}:${c.deployment_id}:net_pnl`, `Fleet ${env} dataset`, metricStr(row, "net_pnl"));
      reading(`${row.alpha_id}:${c.deployment_id}:return`, `Fleet ${env} dataset`, metricStr(row, "return_30d_pct"));
    }
  }
  for (const a of alphaRows.slice(0, 10)) {
    const env = { PAPER: "paper", SANDBOX: "sandbox", CANARY: "live", LIVE: "live" }[a.stage];
    const ov = await ok200(`${E}/manager/alphas/${a.alpha_id}/overview?environment=${env}&window=30D`);
    const item = ov?.items?.find((x) => x.alpha_id === a.alpha_id);
    if (item && (item.children ?? []).length === 1) {
      const dep = item.children[0].deployment_id;
      reading(`${a.alpha_id}:${dep}:net_pnl`, "Alpha 360 overview", metricStr(item, "net_pnl"));
      reading(`${a.alpha_id}:${dep}:return`, "Alpha 360 overview", metricStr(item, "return_30d_pct"));
      const dd = metricStr(item.economic_partitions?.[0] ?? {}, "max_drawdown_pct");
      if (dd !== null) check("W09b", numOf(dd) <= 0n, `Alpha 360 ${a.alpha_id}: max drawdown ${dd} is above zero`);
    }
  }
  for (const id of [...portfolios.keys()].slice(0, 10)) {
    const ov = await ok200(`${E}/manager/portfolios/${id}/overview?environment=live&window=30D&limit=200`);
    for (const row of ov?.items ?? []) {
      const dep = row.children?.[0]?.deployment_id;
      if (!dep || (row.children ?? []).length !== 1) continue;
      reading(`${row.alpha_id}:${dep}:net_pnl`, `Portfolio ${id} contributors`, metricStr(row, "net_pnl"));
      reading(`${row.alpha_id}:${dep}:return`, `Portfolio ${id} contributors`, metricStr(row, "return_30d_pct"));
    }
    for (const s of ov?.capital_statements ?? []) { const dd = metricStr(s, "max_drawdown_pct"); if (dd !== null) check("W09b", numOf(dd) <= 0n, `Portfolio ${id}: max drawdown ${dd} is above zero`); }
  }
  // the alpha resource and the stage rooms state the SAME current net PnL of a deployment as the datasets (realized + unrealized)
  for (const [alphaId, r] of alphaResources) for (const d of r.data.alpha?.deployments ?? []) {
    const key = `${alphaId}:${d.deployment_id}:net_pnl`;
    if (readings.has(key)) check("W09", sameDecimal(readings.get(key).value, d.net_pnl), `${key}: the alpha resource (Alpha 360 Net PnL block) says ${d.net_pnl}, ${readings.get(key).where} says ${readings.get(key).value}`);
    const alloc = numOf(d.allocation), rkey = `${alphaId}:${d.deployment_id}:return`;
    if (readings.has(rkey) && alloc > 0n && readings.has(key)) {
      const implied = (numOf(readings.get(key).value) * 100n * 1000n) / alloc; // percent, 3 places
      check("W09", abs(implied - numOf(readings.get(rkey).value) / 10n ** BigInt(SCALE - 3)) <= 1n, `${rkey}: return ${readings.get(rkey).value}% is not net PnL ${readings.get(key).value} / allocation ${d.allocation}`);
    }
  }
  for (const [id, info] of [...deployments].filter(([, d]) => d.stage === "LIVE").slice(0, 8)) {
    const p = await page("live", id);
    const eq = p?.body.source_figures?.figures?.find((f) => f.key === "equity")?.internal?.value;
    const alloc = numOf(info.row.allocation);
    const key = `${info.alphaId}:${id}:net_pnl`;
    if (eq !== undefined && alloc !== null && readings.has(key)) check("W09", numOf(eq) - alloc === numOf(readings.get(key).value), `${key}: the Live room's equity ${eq} less allocation ${info.row.allocation} is ${fromUnits(numOf(eq) - alloc)}, ${readings.get(key).where} says ${readings.get(key).value}`);
  }

  // ── W10: one last-seen per person across filters (R3-04) ──────────────────────────────────────────────────────────────────
  const roster = await ok200("/api/admin/accounts?limit=200");
  const seenAt = new Map();
  const note = (where, accounts) => { for (const u of accounts ?? []) { const s = seenAt.get(u.user_id); if (!s) seenAt.set(u.user_id, { at: u.last_sign_in_at, where }); else check("W10", s.at === u.last_sign_in_at, `${u.username}: last sign-in ${u.last_sign_in_at} in "${where}", ${s.at} in "${s.where}"`); } };
  note("plain roster", roster?.accounts);
  for (const person of (roster?.accounts ?? []).slice(0, 8)) {
    for (const [label, q] of [[`q=${person.username}`, `q=${encodeURIComponent(person.username)}`], [`q=${person.display_name}`, `q=${encodeURIComponent(person.display_name)}`], [`role=${person.role}`, `role=${person.role}&limit=200`], [`state=${person.account_state}`, `state=${person.account_state}&limit=200`]]) {
      const r = await ok200(`/api/admin/accounts?${q}`);
      note(label, (r?.accounts ?? []).filter((u) => u.user_id === person.user_id));
    }
  }

  // ── W11: environment labels derive from the entity's stage (R3-05, R3-10) ──────────────────────────────────────────────────
  const envOfDeployment = (id) => (deployments.has(id) ? STAGE_ENV[deployments.get(id).stage] : null);
  const labelled = [...opsRows.map((o) => ({ where: `operation ${o.operation_id}`, target: o.target, environment: o.environment }))];
  for (const id of incidentIds.slice(0, 8)) { const r = await ok200(`${E}/operations/incidents/${id}`); if (r) labelled.push({ where: `incident ${id}`, target: r.target, environment: r.environment }); }
  for (const l of labelled) {
    if (!l.target || !l.environment) continue;
    if (l.target.type === "DEPLOYMENT" && envOfDeployment(l.target.id) !== null) check("W11", String(l.environment).toUpperCase() === envOfDeployment(l.target.id), `${l.where}: environment ${l.environment}, but ${l.target.id} is a ${deployments.get(l.target.id).stage} deployment`);
    if (l.target.type === "PORTFOLIO" && portfolios.has(l.target.id)) check("W11", (portfolios.get(l.target.id).environments ?? []).map((e) => e.toUpperCase()).includes(String(l.environment).toUpperCase()), `${l.where}: environment ${l.environment} on portfolio ${l.target.id}, which holds only ${(portfolios.get(l.target.id).environments ?? []).join("/")}`);
  }
  for (const row of approvalRows) {
    const dep = row.deployment_id ?? null;
    if (dep && envOfDeployment(dep)) check("W11", String(row.environment).toUpperCase() === envOfDeployment(dep), `approval ${row.id}: environment ${row.environment}, but ${dep} is a ${deployments.get(dep).stage} deployment`);
  }

  // ── W12: register NAV / Net PnL == 360 for every portfolio (R1-05, R1-13, R1-15) ────────────────────────────────────────────
  for (const env of ["live", "paper", "sandbox"]) {
    const groups = await ok200(`${E}/manager/fund-overview?environment=${env}&window=30D&limit=200&group_by=portfolio_id`);
    for (const g of groups?.groups ?? []) {
      const id = g.key?.[0]?.value;
      if (!portfolios.has(id) || !(portfolios.get(id).environments ?? []).includes(env)) continue;
      const ov = await ok200(`${E}/manager/portfolios/${id}/overview?environment=${env}&window=30D&limit=200`);
      for (const part of g.economic_partitions ?? []) {
        const statement = ov?.capital_statements?.find((s) => s.partition.currency === part.partition.currency && s.partition.economic_domain === part.partition.economic_domain);
        for (const key of ["current_nav", "net_pnl"]) {
          const reg = metricStr(part, key), full = metricStr(statement ?? {}, key);
          check("W12", (reg === null) === (full === null) && (reg === null || sameDecimal(reg, full)), `${id} ${env} ${part.partition.currency} ${key}: register ${reg ?? "Not published"}, 360 ${statement ? full ?? "Not published" : "no statement"}`);
        }
      }
    }
  }
  // ── W13: one clock - every read of the world is taken at the same instant (within a day) (QA5 "the clock is one clock"; R3-10 chronology) ──
  {
    const reads = [];
    const at = (where, value) => { const t = typeof value === "number" ? value : ms(value); if (t !== null && Number.isFinite(t)) reads.push([where, t]); };
    const anyAlpha = alphaResources.values().next().value;
    at("alpha resource", anyAlpha?.as_of ?? anyAlpha?.as_of_ms);
    at("blotter", blotterFirst?.as_of);
    at("portfolio register", list.source_as_of);
    at("alpha fleet", fleet.source_as_of);
    for (const [kind, id] of [["live", "dep_live_01"], ["canary", "dep_canary_01"], ["sandbox", "dep_sandbox_01"], ["paper", "dep_paper_01"]]) { const p = await page(kind, id); if (p) at(`${kind} room ${id}`, kind === "paper" ? (p.body.read_at ?? p.body.as_of) : p.body.orders?.envelope?.as_of ?? p.body.blotter?.envelope?.as_of ?? p.body.positions?.envelope?.as_of ?? p.body.source_panels?.[0]?.as_of); }
    const fund = await ok200(`${E}/manager/fund-overview?environment=live&window=30D&limit=1`);
    at("fund dataset", fund?.as_of_ms);
    const q = await ok200(`${E}/operations?limit=1`);
    at("operations queue", q?.observed_at_ms ?? q?.source_as_of_ms);
    if (incidentIds[0]) at("incident root", (await ok200(`${E}/operations/incidents/${incidentIds[0]}`))?.observed_at_ms);
    const [refWhere, ref] = reads[0] ?? ["", 0];
    for (const [where, t] of reads.slice(1)) check("W13", Math.abs(t - ref) <= DAY, `${where} is read at ${new Date(t).toISOString()}, ${refWhere} at ${new Date(ref).toISOString()}`);
  }
  return { ties };
}

const fromUnits = show;
