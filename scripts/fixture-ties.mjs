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

// WP-B2-S3: the clock a stage page is READ at: its own read_at (the world clock), else the as-of of its panels
const readClockOf = (kind, b) => b.read_at ?? (kind === "paper" ? b.as_of : b.orders?.envelope?.as_of ?? b.blotter?.envelope?.as_of ?? b.positions?.envelope?.as_of ?? b.source_panels?.[0]?.as_of);
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
      asOf = ms(readClockOf(kind, p.body)) ?? overview.as_of_ms; // WP-B2-S3: a stage the alpha left has panels as-of its exit, which is not the clock the lifecycle is chained from
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
    for (const [kind, id] of [["live", "dep_live_01"], ["canary", "dep_canary_01"], ["sandbox", "dep_sandbox_01"], ["paper", "dep_paper_01"]]) { const p = await page(kind, id); if (p) at(`${kind} room ${id}`, readClockOf(kind, p.body)); } // WP-B2-S3
    const fund = await ok200(`${E}/manager/fund-overview?environment=live&window=30D&limit=1`);
    at("fund dataset", fund?.as_of_ms);
    const q = await ok200(`${E}/operations?limit=1`);
    at("operations queue", q?.observed_at_ms ?? q?.source_as_of_ms);
    if (incidentIds[0]) at("incident root", (await ok200(`${E}/operations/incidents/${incidentIds[0]}`))?.observed_at_ms);
    const [refWhere, ref] = reads[0] ?? ["", 0];
    for (const [where, t] of reads.slice(1)) check("W13", Math.abs(t - ref) <= DAY, `${where} is read at ${new Date(t).toISOString()}, ${refWhere} at ${new Date(ref).toISOString()}`);
  }
  // ===== WP-B2-S3 begin: W30 to W35, the QA6 stage-page defect classes (R4-01/03/05, R4-02/13, R5-04/06, R5-02/09, R5-01/05, R4-06/R2-05)
  {
    const STAGE_PATH = { paper: (id) => `/screens/paper/${id}`, sandbox: (id) => `/deployments/${id}/certification`, canary: (id) => `/deployments/${id}/canary`, live: (id) => `/deployments/${id}/live` };
    const idsOfFleet = [...deployments.keys()].slice(0, 40);
    // the variant ids the review index and the layout audit open (a variant is a state of a deployment, reached by a typed URL)
    const VARIANTS = [["paper", "dep_paper_01_dark"], ["sandbox", "dep_sandbox_01_mismatch"], ["sandbox", "dep_sandbox_01_dark"], ["canary", "dep_canary_01_stale"], ["canary", "dep_canary_01_breach"],
      ["canary", "dep_canary_01_dark"], ["canary", "dep_c1"], ["live", "dep_live_01_mismatch"], ["live", "dep_live_01_gap"], ["live", "dep_live_01_stale"], ["live", "dep_live_01_dark"]];
    const read = async (kind, id) => { const r = await get(`${E}${STAGE_PATH[kind](id)}`); return r.status === 200 ? r.body : null; };
    const subjectOf = (kind, b) => (kind === "paper" ? b.data?.deployment : kind === "sandbox" ? b.certification : b.deployment);
    const factsOf = (kind, b) => (kind === "paper" ? b.data?.stage_facts : b.stage_facts);
    const pageSet = [];
    for (const id of idsOfFleet) { const stage = deployments.get(id).stage.toLowerCase(); pageSet.push([stage, id]); }
    pageSet.push(...VARIANTS);
    // the history records of a stage an alpha left without a deployment of its own (the canary room links them as its sandbox exit)
    for (const a of alphaRows) for (const stage of ["sandbox", "canary"]) { const hid = `dep_${a.alpha_id.replace(/^alpha_/, "")}_${stage}_hist`; if (STAGE_RANK[a.stage] > STAGE_RANK[stage.toUpperCase()] && !(a.deployments ?? []).some((d) => d.stage.toLowerCase() === stage)) pageSet.push([stage, hid]); }
    const alphaByLabel = new Map(alphaRows.map((a) => [a.alpha_label, a]));

    // W31: a page that says MISMATCH or lists an open blocking finding blocks its gate; a decided certification is closed (nothing is eligible to submit)
    for (const [kind, id] of pageSet.filter(([k]) => k === "sandbox")) {
      const b = await read(kind, id);
      if (b === null) continue;
      const equity = b.source_figures?.figures?.find((f) => f.key === "equity");
      const diff = equity?.difference?.value;
      const open = Number(factsOf(kind, b)?.reconciliation?.open_finding_count?.value ?? 0);
      const verdict = factsOf(kind, b)?.reconciliation?.verdict?.value;
      if (diff !== undefined && diff !== null && Number(diff) !== 0) {
        check("W31", open > 0 && verdict === "OPEN_FINDINGS", `${id}: the equity difference is ${diff} yet the page counts ${open} open findings (verdict ${verdict})`);
        check("W31", (b.findings?.rows ?? []).some((f) => f.blocking === true || f.severity === "CRITICAL"), `${id}: the equity difference ${diff} has no blocking finding`);
        check("W31", b.progress?.eligible === false, `${id}: the equity difference ${diff} yet the gate is eligible`);
      }
      // W30 (QA7 N4-01 / N5-02): a decided certification reads as PASSED in the contract's own words: APPROVED, eligible, no blocker, every step PASS/DONE, no finding, both sides of every figure equal
      if (b.certification?.workflow_state === "APPROVED") {
        check("W30", b.progress?.eligible === true && (b.progress?.blocker_codes ?? []).length === 0, `${id}: an APPROVED certification is gate-blocked (eligible ${b.progress?.eligible}, blockers ${JSON.stringify(b.progress?.blocker_codes)})`);
        check("W30", (b.steps ?? []).every((x) => x.evaluation_state === "PASS" && x.strip_state === "DONE") && (b.findings?.rows ?? []).length === 0, `${id}: an APPROVED certification has a step that is not PASS/DONE or an open finding`);
        check("W30", (b.source_figures?.figures ?? []).every((f) => f.difference?.value === null || f.difference?.value === undefined || Number(f.difference.value) === 0), `${id}: an APPROVED certification states a figure difference`);
      }
      // a step that passed was checked inside the run, before the submission, and its evidence has not expired at the page's own read
      const readAt = ms(b.read_at);
      for (const step of b.steps ?? []) {
        if (step.evaluation_state !== "PASS") continue;
        check("W31", step.expires_at === null || ms(step.expires_at) >= (b.certification?.workflow_state === "APPROVED" ? 0 : readAt), `${id}: step ${step.step_key} PASS with evidence expired ${step.expires_at}`);
        if (b.certification?.submitted_at && step.step_key !== "EXIT_REVIEW") check("W31", ms(step.as_of) <= ms(b.certification.submitted_at), `${id}: step ${step.step_key} checked ${step.as_of}, after the submission ${b.certification.submitted_at}`);
      }
      if (b.progress && b.steps) check("W31", b.progress.passed_count === b.steps.filter((x) => x.evaluation_state === "PASS").length, `${id}: progress counts ${b.progress.passed_count} passed, the steps ${b.steps.filter((x) => x.evaluation_state === "PASS").length}`);
    }

    // W32: every lineage entry is a request of THIS alpha that opens; one request id belongs to one alpha
    const owner = new Map();
    for (const [kind, id] of pageSet) {
      const b = await read(kind, id);
      if (b === null) continue;
      const subject = subjectOf(kind, b);
      for (const entry of b.lineage ?? []) {
        const value = entry.value;
        if (typeof value !== "string" || !/^(AP|EX|SX)-\d+$/.test(value)) continue;
        const known = owner.get(value);
        if (known === undefined) owner.set(value, subject?.alpha_name); else check("W32", known === subject?.alpha_name, `${id}: ${value} is ${subject?.alpha_name}'s lineage here and ${known}'s elsewhere`);
        const href = entry.href;
        if (typeof href !== "string") { check("W32", false, `${id}: lineage ${entry.kind} ${value} has no link`); continue; }
        const m = /^\/governance\/(?:approvals\/(AP-\d+)\/(r1|r2|live)|exit-reviews\/((?:EX|SX)-\d+))$/.exec(href);
        if (m === null) { if (!/^\/deployments\/(sandbox|paper|live)\//.test(href)) check("W32", false, `${id}: lineage ${entry.kind} ${value} links ${href}`); continue; }
        check("W32", (m[1] ?? m[3]) === value, `${id}: lineage ${entry.kind} says ${value} but links ${href}`);
        const detail = await get(`${E}${m[1] ? `/governance/approvals/${m[1]}/${m[2]}` : `/governance/exit-reviews/${m[3]}`}`);
        check("W32", detail.status === 200, `${id}: lineage ${entry.kind} ${value} (${href}) does not open (${detail.status})`);
        if (detail.status === 200 && subject?.alpha_name) {
          const label = String(detail.body?.data?.approval?.subject_label ?? detail.body?.review?.subject_label ?? detail.body?.approval?.subject_label ?? "");
          if (label !== "") check("W32", label.includes(subject.alpha_name) || !alphaRows.some((a) => label.includes(a.alpha_label)), `${id}: lineage ${entry.kind} ${value} opens "${label}", this page is ${subject.alpha_name}'s`);
        }
        // a link to a sandbox record opens a sandbox page of the same alpha
        // (checked below with the stage links)
      }
      // a link to a stage record of the same alpha
      for (const entry of b.lineage ?? []) {
        const m = /^\/deployments\/(sandbox|paper|live)\/([^/]+?)(?:\/canary)?$/.exec(entry.href ?? "");
        if (m === null) continue;
        const linkedKind = (entry.href ?? "").endsWith("/canary") ? "canary" : m[1];
        const linked = await read(linkedKind, decodeURIComponent(m[2]));
        check("W32", linked !== null, `${id}: lineage ${entry.kind} links ${entry.href}, which does not open`);
        if (linked !== null) check("W32", subjectOf(linkedKind, linked)?.alpha_name === subject?.alpha_name, `${id}: lineage ${entry.kind} links ${entry.href}, a ${subjectOf(linkedKind, linked)?.alpha_name} record, this page is ${subject?.alpha_name}'s`);
      }
    }

    // W33: one halt fact. A room that says HALTED is HALTED in the Fleet row and the alpha resource (and the reverse); nothing is ordered after the halt
    for (const id of idsOfFleet) {
      const row = deployments.get(id).row;
      const kind = deployments.get(id).stage.toLowerCase();
      const b = await read(kind, id);
      if (b === null) continue;
      const runtime = factsOf(kind, b)?.runtime?.runtime_state?.value;
      check("W33", (runtime === "HALTED") === (row.state === "HALTED"), `${id}: the room says ${runtime}, the Fleet row ${row.state}`);
      const alphaResource = await ok200(`${E}/resources/alphas/${deployments.get(id).alphaId}`);
      const inResource = alphaResource?.data?.deployments?.find((x) => x.deployment_id === id);
      if (inResource !== undefined) check("W33", (runtime === "HALTED") === (inResource.state === "HALTED"), `${id}: the room says ${runtime}, the alpha resource ${inResource.state}`);
      if (runtime === "HALTED") {
        const since = ms(factsOf(kind, b)?.runtime?.since?.value);
        const orders = await pages(`${E}/screens/blotter?limit=200`, (body) => body.data?.orders ?? [], (body) => body.data?.page?.next_cursor);
        for (const o of orders.filter((x) => x.deployment_id === id)) check("W33", Math.floor(ms(o.submitted_at) / 60_000) < Math.floor(since / 60_000), /* a page prints minutes: the order is in an earlier minute than the halt (QA7 R5-09) */ `${id}: order ${o.order_id} submitted ${o.submitted_at}, after the halt ${new Date(since).toISOString()}`);
      }
    }

    // W34: a stage page never contradicts the alpha's own record (Alpha 360 / Fleet): an alpha that left a stage has no running room or open gate there, and a page of a stage the alpha left is read as-of its exit
    for (const [kind, id] of pageSet) {
      const b = await read(kind, id);
      if (b === null) continue;
      const subject = subjectOf(kind, b);
      const alphaRow = alphaByLabel.get(subject?.alpha_name);
      if (alphaRow === undefined || STAGE_RANK[alphaRow.stage] === undefined) continue;
      const left = STAGE_RANK[alphaRow.stage] > STAGE_RANK[kind.toUpperCase()];
      const runtime = factsOf(kind, b)?.runtime?.runtime_state?.value;
      if (left && runtime !== null && runtime !== undefined) {
        check("W34", runtime === "STOPPED", `${id}: ${subject.alpha_name} is in ${alphaRow.stage} but its ${kind} page says ${runtime}`);
        const since = ms(factsOf(kind, b)?.runtime?.since?.value);
        for (const [where, at] of [["reconciliation", factsOf(kind, b)?.reconciliation?.as_of?.value], ["panel", (b.source_panels?.[0] ?? b.source_panels?.internal)?.as_of]]) {
          if (at !== null && at !== undefined) check("W34", ms(at) <= since + 1000, `${id}: STOPPED ${new Date(since).toISOString()} yet its ${where} is as-of ${at}`);
        }
      }
    }

    // W35: a Canary the alpha finished is a Canary record: its room declares the Canary stage, and every Live deployment of an alpha that passed Canary links a predecessor that opens
    for (const id of idsOfFleet.filter((x) => deployments.get(x).stage === "CANARY")) {
      const b = await read("canary", id);
      if (b !== null) check("W35", b.lifecycle?.declared_stage === "LIVE_CANARY" && b.deployment?.declared_environment === "LIVE_CANARY", `${id}: a Canary deployment's room declares ${b.lifecycle?.declared_stage}`);
    }
    for (const id of idsOfFleet.filter((x) => deployments.get(x).stage === "LIVE" && deployments.get(x).alphaStage === "LIVE")) {
      const b = await read("live", id);
      const link = (b?.lineage ?? []).find((l) => l.kind === "CANARY_ENVELOPE");
      if (link === undefined) continue;
      check("W35", link.state === "AVAILABLE" && typeof link.href === "string", `${id}: ${deployments.get(id).alphaLabel} is Live (Canary passed) but its predecessor envelope is ${link.state}`);
      if (typeof link.href === "string") {
        const m = /^\/deployments\/live\/([^/]+)\/canary$/.exec(link.href);
        const trial = m === null ? null : await read("canary", decodeURIComponent(m[1]));
        check("W35", trial !== null && trial.lifecycle?.declared_stage === "LIVE_CANARY" && factsOf("canary", trial)?.runtime?.runtime_state?.value === "STOPPED", `${id}: the predecessor ${link.href} does not open as a finished Canary trial`);
      }
    }
  }
  // W36 (QA7 N5-01): a Live page's predecessor envelope is the linked Canary room's own envelope (same id, same caps), finished, and never active for live
  for (const id of [...deployments.keys()].slice(0, 40).filter((x) => deployments.get(x).stage === "LIVE")) {
    const r = await get(`${E}/deployments/${id}/live`);
    const live = r.status === 200 ? r.body : null;
    const env = live?.predecessor_canary_envelope;
    const link = (live?.lineage ?? []).find((l) => l.kind === "CANARY_ENVELOPE" && typeof l.href === "string");
    if (env === null || env === undefined || link === undefined) continue;
    const trial = await ok200(`${E}${link.href.replace(/^\/deployments\/live\//, "/deployments/")}`);
    check("W36", trial !== null, `${id}: the predecessor link ${link.href} does not open`);
    if (trial === null) continue;
    check("W36", env.envelope_id === trial.envelope?.envelope_id, `${id}: predecessor envelope ${env.envelope_id}, the linked canary's ${trial.envelope?.envelope_id}`);
    for (const key of ["capital_cap", "gross_notional_cap", "daily_loss_cap"]) check("W36", sameDecimal(env.limits?.[key], trial.envelope?.limits?.[key]), `${id}: predecessor ${key} ${env.limits?.[key]}, the linked canary's ${trial.envelope?.limits?.[key]}`);
    check("W36", env.active_for_live_full === false && env.status !== "ACTIVE", `${id}: a finished canary's envelope is ${env.status} / active for live ${env.active_for_live_full}`);
  }
  // W37 (QA7 R5-03, N5-09): the links of a mismatch page open the deployment's own records: the finding is an incident of THIS deployment (Real-funded, open) and the dry-run link's Operations queue is not empty and is the deployment's
  for (const id of ["dep_live_01_mismatch"]) {
    const r = await get(`${E}/deployments/${id}/live`);
    const consistency = r.status === 200 ? r.body?.broker_consistency : null;
    if (consistency?.state !== "MISMATCH") continue;
    const base = id.replace(/_mismatch$/, "");
    const incidentId = /\/incidents\/([^/?]+)$/.exec(consistency.finding_href ?? "")?.[1];
    check("W37", incidentId !== undefined, `${id}: the mismatch has no finding link (${consistency.finding_href})`);
    if (incidentId !== undefined) {
      const inc = await ok200(`${E}/operations/incidents/${incidentId}`);
      check("W37", inc !== null && JSON.stringify(inc).includes(`"${base}"`), `${id}: the finding ${incidentId} is not an incident of ${base}`);
      check("W37", inc !== null && /live/i.test(String(inc.environment ?? inc.incident?.environment ?? "live")), `${id}: the finding ${incidentId} is not Real-funded`);
    }
    const target = /target_id=([^&]+)/.exec(consistency.dry_run_reconcile_href ?? "")?.[1];
    check("W37", target === id, `${id}: the dry-run link targets ${target}`);
    const queue = target === undefined ? null : await ok200(`${E}/operations?target_id=${target}&limit=50`);
    const queueRows = queue?.page?.rows ?? [];
    check("W37", queueRows.length > 0 && queueRows.every((row) => row.target?.id === base), `${id}: the dry-run link's queue has ${queueRows.length} rows, targets ${[...new Set(queueRows.map((row) => row.target?.id))]}`);
  }
  // W38 (QA7 R1-01): an alpha link of the Overview (with its query) and the alpha resource under every workspace/deployment query answer THAT alpha's own deployments, stage and allocation
  {
    const digest = await ok200(`${E}/visit-digest`);
    const links = [];
    const collect = (o) => { if (Array.isArray(o)) o.forEach(collect); else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) { if (k === "href" && typeof v === "string" && /^\/deployments\/alphas\/[^/?]+\?/.test(v)) links.push(v); else collect(v); } };
    collect(digest ?? {});
    const queries = new Map();
    for (const a of alphaRows.slice(0, 12)) for (const q of ["", "?workspace_id=ws_TEST_ONLY", ...((a.deployments ?? []).length > 0 ? [`?workspace_id=ws_TEST_ONLY&deployment_id=${a.deployments[0].deployment_id}`] : [])]) queries.set(`${a.alpha_id}${q}`, [a.alpha_id, q]);
    for (const href of links) { const m = /^\/deployments\/alphas\/([^/?]+)(\?.*)$/.exec(href); queries.set(`${m[1]}${m[2]}`, [m[1], m[2]]); }
    check("W38", links.length > 0, "the Overview digest links no alpha with a query");
    for (const [alphaId, q] of queries.values()) {
      const row = alphaRows.find((a) => a.alpha_id === alphaId);
      const body = row === undefined ? null : await ok200(`${E}/resources/alphas/${alphaId}${q.replace(/&?deployment_id=[^&]*/, "")}`);
      if (row === undefined || body === null) continue;
      const own = new Set((row.deployments ?? []).map((d) => d.deployment_id));
      const mentioned = [...new Set(JSON.stringify(body).match(/\bdep_(?!scale_)[a-z0-9]+(?:_[a-z0-9]+)*/g) ?? [])].filter((id) => !/_\d$/.test(id) || own.has(id));
      for (const id of mentioned) check("W38", own.has(id) || [...own].some((o) => id.startsWith(`${o}_`)), `${alphaId}${q}: the alpha resource names ${id}, which is not a deployment of ${row.alpha_label}`);
      check("W38", body.data?.alpha?.stage === undefined || body.data.alpha.stage === row.stage, `${alphaId}${q}: the resource says stage ${body.data?.alpha?.stage}, the fleet ${row.stage}`);
      const sum = (row.deployments ?? []).reduce((n, d) => n + (numOf(d.allocation) ?? 0n), 0n);
      const stated = (body.data?.alpha?.allocations ?? []).reduce((n, x) => n + (numOf(x.value) ?? 0n), 0n);
      check("W38", sum === stated, `${alphaId}${q}: the resource states allocation ${stated}, the fleet's deployments ${sum}`);
    }
  }
  // W39 (QA7 N4-04, N4-05): a Paper stage the alpha left nets flat (orders net to zero per symbol, no position, no locked cash with nothing open), its accounting fee is the sum of the USDT fees of the fills it lists, and its gate minimum is the one its exit review states
  for (const id of [...deployments.keys()].slice(0, 40)) {
    const d = deployments.get(id);
    if (d.stage !== "PAPER" || STAGE_RANK[d.alphaStage] === undefined || STAGE_RANK[d.alphaStage] <= STAGE_RANK.PAPER) continue;
    const r = await get(`${E}/screens/paper/${id}`);
    const data = r.status === 200 ? r.body?.data : null;
    if (data === null || data === undefined) continue;
    const net = new Map();
    for (const o of data.orders ?? []) if (String(o.status).toUpperCase() === "FILLED") net.set(o.instrument_id, (net.get(o.instrument_id) ?? 0n) + (o.side === "BUY" ? 1n : -1n) * (numOf(o.quantity) ?? 0n));
    for (const [symbol, quantity] of net) check("W39", quantity === 0n, `${id}: filled orders net ${quantity} units of ${symbol}, yet the stage ended flat`);
    check("W39", (data.positions ?? []).length === 0, `${id}: ${(data.positions ?? []).length} open positions on a stage the alpha left`);
    const last = (data.account_equity ?? []).at(-1);
    if (last !== undefined) {
      check("W39", numOf(last.cash_locked) === 0n, `${id}: cash locked ${last.cash_locked} with nothing open`);
      const usdt = (data.fills ?? []).filter((f) => f.commission_currency === "USDT" && f.commission != null).reduce((n, f) => n + numOf(f.commission), 0n);
      check("W39", numOf(last.fee_total) === usdt, `${id}: accounting fees ${last.fee_total}, the fills list ${usdt} USDT in fees`);
    }
    const sandbox = (alphaRows.find((a) => a.alpha_id === d.alphaId)?.deployments ?? []).find((x) => x.stage === "SANDBOX");
    const lineage = sandbox === undefined ? [] : ((await ok200(`${E}/deployments/${sandbox.deployment_id}/certification`))?.lineage ?? []);
    const exit = lineage.find((l) => l.kind === "PAPER_EXIT" && /^EX-\d+$/.test(l.value ?? ""));
    if (exit !== undefined) {
      const review = await ok200(`${E}/governance/exit-reviews/${exit.value}`);
      const minimum = data.observation_gate?.policy_minimum_observed_days;
      check("W39", review !== null && String(review.gate_summary ?? "").includes(`gate minimum ${minimum} days`), `${id}: the page's gate minimum is ${minimum} days, the exit review ${exit.value} says "${review?.gate_summary}"`);
    }
  }
  // W40 (QA7 N4-09): Alpha 360's "criteria met" of a stage is the stage page's own count (a Sandbox deployment's steps passed; seven once the alpha left it)
  for (const id of [...deployments.keys()].slice(0, 40)) {
    const d = deployments.get(id);
    if (d.stage !== "SANDBOX" || STAGE_RANK[d.alphaStage] === undefined) continue;
    const env = { PAPER: "paper", SANDBOX: "sandbox", CANARY: "live", LIVE: "live" }[d.alphaStage];
    const overview = await ok200(`${E}/manager/alphas/${d.alphaId}/overview?environment=${env}&window=30D`);
    const m = overview?.items?.find((x) => x.alpha_id === d.alphaId)?.economic_partitions?.[0];
    const page = (await get(`${E}/deployments/${id}/certification`)).body;
    if (!m || !page?.progress) continue;
    check("W40", Number(metricStr(m, "life_sandbox_criteria_met")) === page.progress.passed_count, `${id}: Alpha 360 counts ${metricStr(m, "life_sandbox_criteria_met")} of 7 sandbox criteria met, the Sandbox page ${page.progress.passed_count} of ${page.progress.total_count}`);
  }
  // W41 (QA7 N5-05): a Canary trial that ended carries ended facts: no rollback check claims readiness, no promotion gate waits on the owner, no capital is consumed with nothing held, the exit is in the past
  const canaryIds = [...[...deployments.keys()].slice(0, 40).filter((x) => deployments.get(x).stage === "CANARY"), ...alphaRows.filter((x) => STAGE_RANK[x.stage] > STAGE_RANK.CANARY && !(x.deployments ?? []).some((d) => d.stage === "CANARY")).map((x) => `dep_${x.alpha_id.replace(/^alpha_/, "")}_canary_hist`), "dep_canary_01"];
  const factsOf = (kind, b) => (kind === "paper" ? b.data?.stage_facts : b.stage_facts);
  for (const id of [...new Set(canaryIds)]) {
    const kind = "canary";
    const b = await ok200(`${E}/deployments/${id}/canary`);
    if (b === null || factsOf("canary", b)?.runtime?.runtime_state?.value !== "STOPPED") continue;
    check("W41", (b.rollback_readiness?.items ?? []).every((x) => x.ready?.value !== true) && b.rollback_readiness?.ready === false, `${id}: an ended trial's rollback readiness still claims ready`);
    const codes = [...(b.command_policy?.scale_up?.blocker_codes ?? []), ...(b.command_policy?.protective?.blocker_codes ?? []), ...(b.lifecycle?.blocker_codes ?? []), ...(b.envelope?.blocker_codes ?? [])];
    check("W41", !codes.includes("CANARY_OWNER_GATE_REQUIRED") && codes.includes("CANARY_TRIAL_ENDED"), `${id}: an ended trial waits on ${JSON.stringify(codes)}`);
    const gross = b.envelope_compliance?.rows?.find((r) => r.cap === "gross_notional")?.consumed?.value;
    const capital = b.envelope_compliance?.rows?.find((r) => r.cap === "capital")?.consumed?.value;
    if (numOf(gross) === 0n) check("W41", numOf(capital) === 0n, `${id}: capital consumed ${capital} with gross notional ${gross}`);
    const opens = ms(b.lifecycle?.trial?.exit_review_opens_at?.value);
    check("W41", opens !== null && opens <= ms(factsOf("canary", b)?.runtime?.since?.value) + 1000, `${id}: the exit review opens ${b.lifecycle?.trial?.exit_review_opens_at?.value}, after the trial ended ${factsOf("canary", b)?.runtime?.since?.value}`);
  }
  // W70 (QA8 N8a-01, N8a-03): the published lifecycle of an alpha is its own history: its CURRENT stage is the fleet's stage, the stages it left are DONE, the later ones NOT_STARTED (so a variant page of a deployment, which names that alpha, spines the alpha's real stage)
  for (const a of alphaRows.filter((x) => STAGE_RANK[x.stage] !== undefined).slice(0, 14)) {
    const life = await ok200(`${E}/alphas/${a.alpha_id}/lifecycle`);
    if (life === null) continue;
    for (const row of life.stages ?? []) {
      if (STAGE_RANK[row.stage] === undefined) continue;
      const expected = STAGE_RANK[row.stage] < STAGE_RANK[a.stage] ? "DONE" : row.stage === a.stage ? "CURRENT" : "NOT_STARTED";
      check("W70", row.state === expected, `${a.alpha_label} (in ${a.stage}): the lifecycle says ${row.stage} is ${row.state}, expected ${expected}`);
    }
  }
  // W71 (QA8 N8a-04): a dark variant removes SOURCE facts only: its declared envelope (limits, approved caps) and trial duration are the base room's
  for (const id of [...deployments.keys()].slice(0, 40).filter((x) => deployments.get(x).stage === "CANARY")) {
    const base = await ok200(`${E}/deployments/${id}/canary`);
    const dark = await ok200(`${E}/deployments/${id}_dark/canary`);
    if (base === null || dark === null) continue;
    check("W71", JSON.stringify(dark.envelope?.limits) === JSON.stringify(base.envelope?.limits), `${id}_dark: envelope limits ${JSON.stringify(dark.envelope?.limits)}, the base room's ${JSON.stringify(base.envelope?.limits)}`);
    check("W71", dark.lifecycle?.duration_days === base.lifecycle?.duration_days && dark.lifecycle?.day_index === base.lifecycle?.day_index, `${id}_dark: trial ${dark.lifecycle?.day_index}/${dark.lifecycle?.duration_days} days, the base room's ${base.lifecycle?.day_index}/${base.lifecycle?.duration_days}`);
    check("W71", JSON.stringify((dark.envelope_compliance?.rows ?? []).map((r) => r.approved)) === JSON.stringify((base.envelope_compliance?.rows ?? []).map((r) => r.approved)), `${id}_dark: approved caps differ from the base room's`);
  }
  // W72 (QA8 N8b-02, N8b-03, N8b-04): a room and its variants are one deployment: an open reconciliation incident of the deployment is an open finding of the base room too, and every variant id a room link carries opens the deployment's own non-empty blotter and operations list
  {
    const base = "dep_live_01";
    const baseRoom = await ok200(`${E}/deployments/${base}/live`);
    const incidents = ((await ok200(`${E}/operations?target_id=${base}&limit=100`))?.page?.rows ?? []);
    const incidentLinked = incidents.some((row) => (row.incident_links?.items ?? []).some((i) => i.state === "LINKED"));
    if (baseRoom !== null && incidentLinked) {
      check("W72", Number(baseRoom.stage_facts?.reconciliation?.open_finding_count?.value) >= 1 && baseRoom.stage_facts?.reconciliation?.verdict?.value === "OPEN_FINDINGS", `${base}: an incident is open on it yet its room says ${baseRoom.stage_facts?.reconciliation?.verdict?.value} (${baseRoom.stage_facts?.reconciliation?.open_finding_count?.value})`);
    }
    const baseBlotter = await ok200(`${E}/screens/blotter?deployment_id=${base}&limit=200`);
    check("W72", (baseBlotter?.data?.orders ?? []).length > 0, `${base}: its own blotter is empty`);
    for (const variant of ["gap", "mismatch", "stale", "dark"]) {
      const id = `${base}_${variant}`;
      const blotter = await ok200(`${E}/screens/blotter?deployment_id=${id}&limit=200`);
      const orders = blotter?.data?.orders ?? [];
      check("W72", orders.length === (baseBlotter?.data?.orders ?? []).length && orders.every((o) => o.deployment_id === base), `${id}: the blotter scope lists ${orders.length} orders (the deployment's own: ${(baseBlotter?.data?.orders ?? []).length})`);
      const ops = await ok200(`${E}/operations?target_id=${id}&limit=100`);
      const rows = ops?.page?.rows ?? [];
      check("W72", rows.length > 0 && rows.every((row) => row.target?.id === base), `${id}: the operations list has ${rows.length} rows, targets ${[...new Set(rows.map((row) => row.target?.id))]}`);
    }
  }
  // ===== WP-B2-S3 end
  // ===== WP-B2-A3 begin
  // ── W19: a request exists only for the NEXT gate of its subject, once, and its quorum is open (R3-02, R3-09, R3-10, R3-03) ───────────────────────────────
  {
    const NEXT = { R1: "RESEARCH", R2: "RESEARCH", PAPER_EXIT: "PAPER", SANDBOX_EXIT: "SANDBOX", LIVE_GATE: "CANARY" };
    const openByKey = new Map();
    for (const row of approvalRows) {
      const label = String(row.subject ?? "").split(/\s+[·→]\s+/)[0];
      const alpha = alphaRows.find((a) => a.alpha_label === label);
      if (alpha === undefined) { check("W19", false, `${row.id}: the subject "${label}" is no alpha of the fleet`); continue; }
      check("W19", alpha.stage === NEXT[row.gate], `${row.id} (${row.gate}) is open for ${alpha.alpha_label}, which the fleet puts at ${alpha.stage}; the gate waits at ${NEXT[row.gate]}`);
      const dep = /\b(dep_[A-Za-z0-9_]+)/.exec(String(row.subject))?.[1];
      if (dep !== undefined) {
        const known = deployments.get(dep);
        check("W19", known !== undefined && known.alphaId === alpha.alpha_id, `${row.id}: ${dep} is not a deployment of ${alpha.alpha_label}`);
        if (row.gate === "SANDBOX_EXIT" || row.gate === "PAPER_EXIT") check("W19", known?.stage === (row.gate === "SANDBOX_EXIT" ? "SANDBOX" : "PAPER"), `${row.id}: ${dep} is a ${known?.stage} deployment, the ${row.gate} leaves ${row.gate === "SANDBOX_EXIT" ? "SANDBOX" : "PAPER"}`);
      }
      const key = `${alpha.alpha_id}:${row.gate}:${dep ?? ""}`;
      check("W19", !openByKey.has(key), `${row.id} and ${openByKey.get(key)} are two open ${row.gate} requests for ${alpha.alpha_label} ${dep ?? ""}`);
      openByKey.set(key, row.id);
      check("W19", Number(row.quorum_met) < Number(row.quorum_required), `${row.id} is pending with its quorum complete (${row.quorum_met} of ${row.quorum_required})`);
      // R2 and the sandbox / paper environment label: the capital the request moves is a partition of the label's environment
      if (row.gate === "R2") {
        const d = await ok200(`${E}/governance/approvals/${row.id}/r2`);
        const pf = portfolios.get(d?.approval?.portfolio_id);
        check("W19", pf !== undefined && (pf.environments ?? []).map((e) => e.toLowerCase()).includes(String(row.environment).toLowerCase()), `${row.id}: labelled ${row.environment}, but it moves capital of ${d?.approval?.portfolio_id}, which holds ${(pf?.environments ?? []).join(", ")}`);
        const account = d?.readiness?.flatMap((g) => g.entries ?? []).find((e) => e.label === "account (new)")?.value;
        if (account !== undefined) check("W19", (await get(`${E}/resources/accounts/${account}`)).status === 200, `${row.id}: the new account ${account} does not resolve`);
      }
      if (row.gate === "LIVE_GATE" || row.gate === "SANDBOX_EXIT" || row.gate === "PAPER_EXIT") {
        const d = await ok200(`${E}/governance/${row.gate === "LIVE_GATE" ? `approvals/${row.id}/live` : `exit-reviews/${row.id}`}`);
        const refs = (d?.lineage ?? []).filter((l) => l.label === "R1" || l.label === "R2");
        if (row.gate !== "LIVE_GATE") check("W19", refs.length === 2, `${row.id}: the lineage names ${refs.length} of the R1 and R2 requests of ${alpha.alpha_label}`);
        for (const ref of refs) check("W19", (await get(`${E}/governance/approvals/${ref.value}/${ref.label.toLowerCase()}`)).status === 200, `${row.id}: lineage ${ref.label} ${ref.value} does not resolve`);
      }
    }
  }
  // ── W20: an account has one environment: every operation row that names it, and its Account 360, say the same (R3-04) ──
  {
    const seen = new Map();
    for (const o of opsRows) if (o.target?.type === "ACCOUNT") { if (!seen.has(o.target.id)) seen.set(o.target.id, new Set()); seen.get(o.target.id).add(String(o.environment).toLowerCase()); }
    for (const [id, envs] of [...seen].slice(0, 40)) {
      check("W20", envs.size === 1, `account ${id} is labelled ${[...envs].join(" and ")} by different operations`);
      const account = await ok200(`${E}/resources/accounts/${id}`);
      if (account?.selected_environment !== undefined) check("W20", envs.has(String(account.selected_environment).toLowerCase()), `account ${id}: operations say ${[...envs].join("/")}, its Account 360 says ${account.selected_environment}`);
    }
  }
  // ── W21: Account 360 ties inside itself and to the Accounts list (R3-05, R3-06, R3-08) ──
  {
    for (const id of ["acc_bnc_core", "acc_bnc_sub", "acc_okx_main"]) {
      const r = await ok200(`${E}/resources/accounts/${id}`);
      const data = r?.data;
      if (data === undefined) continue;
      const ledger = data.account_balances?.find((b) => b.currency === "USDT")?.total;
      const sync = (data.broker_sync ?? []).filter((x) => x.wallet_balance !== undefined).sort((a, b) => b.synced_at_ms - a.synced_at_ms)[0];
      const marginRow = (data.margin_balances ?? []).find((m) => m.currency === "USDT" && m.margin_ratio !== undefined);
      if (marginRow !== undefined && ledger !== undefined) {
        const equity = numOf(sync?.wallet_balance ?? ledger);
        const bp = (numOf(marginRow.maintenance) * 10000n) / equity;
        const expected = `${bp / 100n}.${String(bp % 100n).padStart(2, "0")}`;
        check("W21", marginRow.margin_ratio === expected, `${id}: margin ratio ${marginRow.margin_ratio}%, maintenance ${marginRow.maintenance} over equity ${sync?.wallet_balance ?? ledger} is ${expected}%`);
      }
      if (sync !== undefined && ledger !== undefined && id !== "acc_bnc_core") check("W21", numOf(sync.wallet_balance) >= numOf(ledger), `${id}: the venue wallet ${sync.wallet_balance} is below the internal ledger ${ledger} with nothing flagged`);
      const names = (data.deployments ?? []).map((d) => d.deployment_name).filter((n) => n !== undefined);
      check("W21", new Set(names).size === names.length, `${id}: two deployments carry the same name (${names.join(", ")})`);
      const account = alphaRows.length >= 0 ? (data.accounts ?? [])[0] : undefined;
      const bindingId = (data.venue_accounts ?? [])[0]?.binding_id;
      if (account !== undefined && bindingId !== undefined && id !== "acc_bnc_core") {
        const exposure = await ok200(`${E}/broker-bindings/${bindingId}/exposure`);
        const bucket = exposure?.analytics?.data?.buckets?.find((b) => b.currency === "USDT");
        if (bucket !== undefined && ledger !== undefined) check("W21", sameDecimal(bucket.used, ledger), `${id}: the Accounts list says ${bucket.used} virtual, Account 360 says an internal ledger of ${ledger}`);
      }
    }
  }
  // ── W22: "since your last visit" lists only observations after that visit (R1-04) ──
  {
    const digest = await ok200(`${E}/visit-digest?workspace_id=ws_fixture_tie`);
    const since = ms(digest?.baseline?.seen_at);
    for (const item of digest?.items ?? []) check("W22", since !== null && ms(item.as_of) > since, `"${item.label}" is as of ${item.as_of}, not after the last visit ${digest.baseline?.seen_at}`);
  }
  // ===== WP-B2-A3 end
  // ── W23: a scoped blotter is the scope's population (QA6 R2-02): the server narrows BEFORE paging, so every order of the deployment / alpha is on it (including a rejected one), and its count and chips equal the filtered population ──
  {
    const readAll = async (query) => {
      const orders = [];
      let first = null;
      let cursor = null;
      for (let n = 0; n < 40; n += 1) {
        const r = await get(`${E}/screens/blotter?limit=200${query}${cursor === null ? "" : `&after=${encodeURIComponent(cursor)}`}`);
        if (r.status !== 200) return first === null ? { status: r.status, body: r.body, orders } : { first, orders };
        first ??= r.body;
        orders.push(...(r.body.data.orders ?? []));
        cursor = r.body.data.page?.next_cursor ?? null;
        if (cursor === null) break;
      }
      return { first, orders };
    };
    const book = await readAll("");
    const axes = [["deployment_id", (o) => o.deployment_id], ["alpha_id", (o) => o.alpha_id ?? o.strategy_id], ["account_id", (o) => o.account_id]];
    if (book.first) {
      const statusOf = (orders) => { const c = {}; for (const o of orders) c[o.status] = (c[o.status] ?? 0) + 1; return c; };
      for (const [axis, of] of axes) {
        const values = [...new Set(book.orders.map(of).filter((v) => typeof v === "string"))].slice(0, 12);
        for (const value of values) {
          const expected = book.orders.filter((o) => of(o) === value);
          const scoped = await readAll(`&${axis}=${encodeURIComponent(value)}`);
          const where = `${axis}=${value}`;
          if (!scoped.first) { check("W23", false, `${where}: the scoped blotter answered ${scoped.status}`); continue; }
          const ids = new Set(scoped.orders.map((o) => o.order_id));
          const missing = expected.filter((o) => !ids.has(o.order_id)).map((o) => o.order_id);
          const alien = scoped.orders.filter((o) => of(o) !== value).map((o) => o.order_id);
          check("W23", missing.length === 0 && alien.length === 0 && scoped.orders.length === expected.length, `${where}: ${expected.length} orders in the book, ${scoped.orders.length} on the scoped blotter (missing ${missing.slice(0, 3).join(", ") || "none"}; foreign ${alien.slice(0, 3).join(", ") || "none"})`);
          check("W23", scoped.first.scalars?.exact_total === expected.length || scoped.first.data?.exact_total === expected.length, `${where}: the scoped blotter counts ${scoped.first.data?.exact_total ?? scoped.first.scalars?.exact_total}, its population is ${expected.length}`);
          const chips = scoped.first.data?.aggregates?.status ?? {};
          const want = statusOf(expected);
          check("W23", JSON.stringify(Object.entries(chips).sort()) === JSON.stringify(Object.entries(want).sort()), `${where}: chips ${JSON.stringify(chips)} but the population is ${JSON.stringify(want)}`);
        }
      }
      // a rejected order is on the blotter of its own deployment and alpha (the QA6 case: Carry A's rejected order)
      const rejected = book.orders.find((o) => o.status === "REJECTED" && typeof o.deployment_id === "string");
      if (rejected) {
        for (const [axis, of] of axes.slice(0, 2)) {
          const scoped = await readAll(`&${axis}=${encodeURIComponent(of(rejected))}`);
          check("W23", (scoped.orders ?? []).some((o) => o.order_id === rejected.order_id), `rejected order ${rejected.order_id} is not on the blotter scoped by ${axis}=${of(rejected)}`);
        }
      }
      // the contract's refusal for a stage the Paper blotter does not serve
      const refused = await get(`${E}/screens/blotter?limit=1&stage=LIVE`);
      check("W23", refused.status === 400 && JSON.stringify(refused.body).includes("N22_BLOTTER_STAGE_NOT_AVAILABLE"), `stage=LIVE answered ${refused.status}, not the contract's N22_BLOTTER_STAGE_NOT_AVAILABLE refusal`);
    }
  }
  // ===== WP-B2-C3 begin: money/figures (QA6 R2-01 R2-03 R2-04 R2-06 R2-07 R2-09 R2-10 R2-11 R2-12 R3-07 R5-07 R5-08 R5-10)
  const c3Alphas = alphaRows.slice(0, 12).filter((a) => alphaResources.has(a.alpha_id));
  const liveStageOf = (stage) => STAGE_ENV[stage] === "LIVE";
  const SCALE18 = 10n ** 18n;
  const worstDrawdown = (points) => { let peak = null; let worst = 0n; for (const v of points) { if (peak === null || v > peak) peak = v; if (peak > 0n) { const dd = (v - peak) * SCALE18 / peak; if (dd < worst) worst = dd; } } return worst; };
  // W24: ONE definition of the money of a book (R2-03, R5-08): Net PnL = the published realized, a venue = the sum of its deployments, equity = allocation + realized + unrealized, a ledger figure that omits the unrealized is not called equity
  for (const a of c3Alphas) {
    const resource = alphaResources.get(a.alpha_id).data;
    const liveRows = (resource.alpha?.deployments ?? []).filter((d) => liveStageOf(d.stage));
    if (liveRows.length === 0) continue;
    const lifecycle = await ok200(`${E}/alphas/${a.alpha_id}/lifecycle?environment=live`);
    for (const v of lifecycle?.venue_net_pnl ?? []) {
      const sum = liveRows.filter((d) => d.venue === v.venue && d.currency === v.currency).reduce((n, d) => n + numOf(d.net_pnl), 0n);
      check("W24", numOf(v.net_pnl) === sum, `alpha ${a.alpha_id}: Contribution by venue ${v.venue} says ${v.net_pnl}, its deployments' Net PnL add up to ${fromUnits(sum)}`);
    }
    const overview = await ok200(`${E}/manager/alphas/${a.alpha_id}/overview?environment=live&window=30D`);
    const rows = overview?.items ?? [];
    if (rows.length > 0) {
      const sumKey = (key) => rows.reduce((n, r) => n + (numOf(metricStr(r.economic_partitions?.[0] ?? {}, key)) ?? 0n), 0n);
      check("W24", sumKey("net_pnl") === liveRows.reduce((n, d) => n + numOf(d.net_pnl), 0n), `alpha ${a.alpha_id}: the dataset Net PnL ${fromUnits(sumKey("net_pnl"))} is not the sum of its live deployments' Net PnL`);
      check("W24", sumKey("equity_30d_end_value") === sumKey("allocation") + sumKey("net_pnl") + sumKey("unrealized_pnl"), `alpha ${a.alpha_id}: Equity ${fromUnits(sumKey("equity_30d_end_value"))} is not allocation + Net PnL + unrealized`);
      const open = (resource.positions ?? []).filter((p) => liveRows.some((d) => d.deployment_id === p.deployment_id)).reduce((n, p) => n + (numOf(p.unrealized_pnl) ?? 0n), 0n);
      check("W24", sumKey("unrealized_pnl") === open, `alpha ${a.alpha_id}: unrealized ${fromUnits(sumKey("unrealized_pnl"))} is not the sum of its open positions' PnL ${fromUnits(open)}`);
    }
  }
  for (const [id, info] of [...deployments].filter(([, d]) => d.stage === "LIVE").slice(0, 8)) {
    const p = await page("live", id);
    const figure = p?.body.source_figures?.figures?.find((f) => f.key === "equity");
    const spec = (alphaResources.get(info.alphaId)?.data.alpha?.deployments ?? []).find((d) => d.deployment_id === id);
    if (figure === undefined || spec === undefined) continue;
    const equity = numOf(figure.internal.value);
    const full = numOf(spec.allocation) + numOf(spec.net_pnl) + numOf(spec.unrealized_pnl);
    check("W24", equity === full || (figure.label !== "Equity" && equity === numOf(spec.allocation) + numOf(spec.net_pnl)), `${id}: the Live room's "${figure.label}" ${figure.internal.value} is neither allocation + Net PnL + unrealized (${fromUnits(full)}) nor a figure named for what it leaves out`);
  }
  // W25: the Alpha 360 equity lines (R2-01, R2-04): one line per account, each the alpha's OWN deployments on it, from the book's first day to the equity of those deployments
  for (const a of c3Alphas) {
    const resource = alphaResources.get(a.alpha_id).data;
    const chart = await ok200(`${E}/views/equity-chart?environment=live&subject_kind=alpha&subject_id=${a.alpha_id}&metric=equity&viewport_px=1440`);
    const lines = chart?.panel?.data?.series ?? [];
    for (const line of lines) {
      const mine = (resource.alpha?.deployments ?? []).filter((d) => liveStageOf(d.stage) && d.account_id === line.account_id);
      if (mine.length === 0 || line.points.length < 2) continue;
      const opening = mine.reduce((n, d) => n + numOf(d.allocation), 0n);
      const closing = mine.reduce((n, d) => n + numOf(d.allocation) + numOf(d.net_pnl) + numOf(d.unrealized_pnl), 0n);
      check("W25", numOf(line.points[0][1]) === opening, `alpha ${a.alpha_id} "${line.label}": opens at ${line.points[0][1]}, the allocation of its own deployments on ${line.account_id} is ${fromUnits(opening)}`);
      check("W25", numOf(line.points.at(-1)[1]) === closing, `alpha ${a.alpha_id} "${line.label}": ends at ${line.points.at(-1)[1]}, allocation + Net PnL + unrealized of its own deployments on ${line.account_id} is ${fromUnits(closing)}`);
      const starts = [];
      for (const d of mine) {
        const room = await page(d.stage === "CANARY" ? "canary" : "live", d.deployment_id);
        const began = d.stage === "CANARY" ? room?.body.lifecycle?.trial?.started_at?.value : room?.body.lifecycle?.activated_at;
        if (began) starts.push(Date.parse(began));
      }
      if (starts.length === mine.length) {
        const firstDay = Math.min(...starts);
        // the line starts on the book's first day, at the earliest: nothing is drawn before the first of its deployments ran (the preview moves the instants as one, so the comparison is to the day)
        check("W25", Math.abs(line.points[0][0] - firstDay) < DAY / 24, `alpha ${a.alpha_id} "${line.label}": the line starts ${new Date(line.points[0][0]).toISOString()}, its first deployment began ${new Date(firstDay).toISOString()}`);
      }
    }
  }
  // W26: drawdown is the drawdown of a level path, the SAME path in every chart of the book (R2-12, R3-07)
  for (const a of c3Alphas.slice(0, 6)) {
    const resource = alphaResources.get(a.alpha_id).data;
    const liveRows = (resource.alpha?.deployments ?? []).filter((d) => liveStageOf(d.stage));
    const accounts = new Set(liveRows.map((d) => d.account_id));
    if (accounts.size !== 1) continue; // one account: the pane and the line are one book
    const subjects = encodeURIComponent(JSON.stringify([{ subject_type: "ALPHA", subject_id: a.alpha_id }]));
    const pane = await ok200(`${E}/manager/series?environment=live&metric=DRAWDOWN&window=${encodeURIComponent('"30D"')}&subjects=${subjects}`);
    const nav = await ok200(`${E}/manager/series?environment=live&metric=NAV&window=${encodeURIComponent('"30D"')}&subjects=${subjects}`);
    const chart = await ok200(`${E}/views/equity-chart?environment=live&subject_kind=alpha&subject_id=${a.alpha_id}&metric=equity&viewport_px=1440`);
    const dd = pane?.series?.[0], level = nav?.series?.[0], line = chart?.panel?.data?.series?.[0];
    if (dd?.state !== "AVAILABLE" || level?.state !== "AVAILABLE" || line === undefined) continue;
    const levels = level.points.map((p) => numOf(p.value));
    check("W26", numOf(dd.points.at(-1).value) === (levels.at(-1) - levels.reduce((m, v) => (v > m ? v : m))) * SCALE18 / levels.reduce((m, v) => (v > m ? v : m)), `alpha ${a.alpha_id}: the drawdown pane ends at ${dd.points.at(-1).value}, its own NAV path ends ${fromUnits(levels.at(-1))} under a high of ${fromUnits(levels.reduce((m, v) => (v > m ? v : m)))}`);
    // the pane and the line above it are one path: their worst drawdowns differ only by the unrealized the line adds (a sawtooth the line cannot produce is a violation)
    const paneWorst = worstDrawdown(levels), lineWorst = worstDrawdown(line.points.map((p) => numOf(p[1])));
    const unrealized = liveRows.reduce((n, d) => n + abs(numOf(d.unrealized_pnl)), 0n);
    const slack = unrealized * SCALE18 / levels.reduce((m, v) => (v > m ? v : m)) + SCALE18 / 1000n; // the unrealized as a share of the NAV, plus 0.1 percentage points
    check("W26", abs(paneWorst - lineWorst) <= slack, `alpha ${a.alpha_id}: the drawdown pane's worst is ${fromUnits(paneWorst * 100n)}%, the equity line above it ${fromUnits(lineWorst * 100n)}%: not one path`);
  }
  for (const [sleeve, portfolio] of [["acc_bnc_core", "pf_TEST_ONLY_core"], ["acc_bnc_sat", "pf_TEST_ONLY_satellite"]]) {
    const chart = await ok200(`${E}/views/equity-chart?environment=live&subject_kind=account&subject_id=${sleeve}&metric=equity&viewport_px=1440`);
    const series = chart?.panel?.data?.series?.[0];
    const subjects = encodeURIComponent(JSON.stringify([{ subject_type: "PORTFOLIO", subject_id: portfolio }]));
    const dd = (await ok200(`${E}/manager/series?environment=live&metric=DRAWDOWN&window=${encodeURIComponent('"90D"')}&subjects=${subjects}`))?.series?.[0];
    const nav = (await ok200(`${E}/manager/series?environment=live&metric=NAV&window=${encodeURIComponent('"90D"')}&subjects=${subjects}`))?.series?.[0];
    if (series === undefined || dd?.state !== "AVAILABLE" || nav?.state !== "AVAILABLE") continue;
    const levels = series.points.map((p) => numOf(p[1]));
    check("W26", numOf(nav.points[0].value) === levels[0] && numOf(nav.points.at(-1).value) === levels.at(-1), `${sleeve} vs ${portfolio}: the sleeve line runs ${fromUnits(levels[0])} -> ${fromUnits(levels.at(-1))}, the Portfolio NAV ${nav.points[0].value} -> ${nav.points.at(-1).value}`);
    const portfolioWorst = dd.points.reduce((m, p) => (numOf(p.value) < m ? numOf(p.value) : m), 0n);
    check("W26", abs(portfolioWorst - worstDrawdown(levels)) <= SCALE18 / 100_000n, `${sleeve} vs ${portfolio}: the sleeve's worst drawdown is ${fromUnits(worstDrawdown(levels) * 100n)}%, the Portfolio's ${fromUnits(portfolioWorst * 100n)}% (same series, same window)`);
    // R3-07: the sleeve's open PnL is the sum of its positions' PnL
    const account = accountResources.get(sleeve)?.data;
    const rowsPnl = (account?.positions ?? []).reduce((n, p) => n + (numOf(p.unrealized_pnl) ?? 0n), 0n);
    const stated = numOf(account?.account_equity?.[0]?.unrealized_pnl);
    if (stated !== null) check("W26", stated === rowsPnl, `${sleeve}: Unrealized PnL ${fromUnits(stated)}, its positions add up to ${fromUnits(rowsPnl)}`);
  }
  // W27: one fee model (R2-06): the 30-day cost drag of a live book is not below what its deployments have paid since they began
  for (const [id, info] of [...deployments].filter(([, d]) => d.stage === "LIVE").slice(0, 8)) {
    const p = await page("live", id);
    const paid = numOf(p?.body.source_figures?.figures?.find((f) => f.key === "fees")?.internal?.value);
    const overview = await ok200(`${E}/manager/alphas/${info.alphaId}/overview?environment=live&window=30D`);
    const items = overview?.items ?? [];
    if (paid === null || items.length !== 1 || (items[0].children ?? []).length !== 1) continue; // a row of one deployment is comparable to its room
    const windowFees = numOf(metricStr(items[0].economic_partitions?.[0] ?? {}, "cost_drag_fees"));
    // every live run of the world is under thirty days, so the 30-day figure covers the whole run
    if (windowFees !== null) check("W27", windowFees >= paid, `${id}: the 30D cost drag fees ${fromUnits(windowFees)} are below the ${fromUnits(paid)} the Live room says it has paid since activation`);
  }
  // W28: the lifecycle read is taken at the world clock (R2-09 R2-10 R2-11): no event after the read, a stage exit is named for the stage exited, a stage that began has its start event
  for (const a of alphaRows.slice(0, 12)) {
    const lifecycle = await ok200(`${E}/alphas/${a.alpha_id}/lifecycle?environment=live`);
    if (lifecycle === null) continue;
    for (const e of lifecycle.events?.items ?? []) check("W28", e.at_ms <= lifecycle.read_at_ms, `alpha ${a.alpha_id}: "${e.title}" is dated ${new Date(e.at_ms).toISOString()}, after the read at ${new Date(lifecycle.read_at_ms).toISOString()}`);
    const exits = (lifecycle.events?.items ?? []).filter((e) => /^(Paper|Sandbox|Canary) exit approved$/.test(e.title));
    const started = (lifecycle.events?.items ?? []).filter((e) => /^(Paper|Sandbox|Canary|Live) started$/.test(e.title));
    const rows = new Map((lifecycle.stages ?? []).map((r) => [r.stage, r]));
    const word = (stage) => stage[0] + stage.slice(1).toLowerCase();
    const reached = STAGE_RANK[a.stage];
    if (reached === undefined) continue; // a research-only alpha has no deployment stage to tell
    for (const stage of ["PAPER", "SANDBOX", "CANARY", "LIVE"]) {
      const row = rows.get(stage);
      const event = started.find((e) => e.title === `${word(stage)} started`);
      const exit = exits.find((e) => e.title === `${word(stage)} exit approved`);
      // told only for what happened: a stage the alpha has not reached has neither a start nor an exit event; one it has left has both, the exit dated with the stage's own exit
      check("W28", (STAGE_RANK[stage] <= reached) === (event !== undefined), `alpha ${a.alpha_id} (in ${a.stage}): ${event === undefined ? `no "${word(stage)} started" event` : `"${word(stage)} started" is told`} for a stage it ${STAGE_RANK[stage] <= reached ? "has reached" : "has not reached"}`);
      if (stage !== "LIVE") check("W28", (STAGE_RANK[stage] < reached) === (exit !== undefined), `alpha ${a.alpha_id} (in ${a.stage}): ${exit === undefined ? `no "${word(stage)} exit approved" event` : `"${word(stage)} exit approved" is told`} for a stage it ${STAGE_RANK[stage] < reached ? "has left" : "has not left"}`);
      if (row !== undefined && event !== undefined && row.entered_at_ms !== null) check("W28", event.at_ms <= row.entered_at_ms + 1000, `alpha ${a.alpha_id}: the ${stage} start event ${new Date(event.at_ms).toISOString()} is after the stage's entry ${new Date(row.entered_at_ms).toISOString()}`);
      if (row !== undefined && exit !== undefined && row.exited_at_ms !== null) check("W28", Math.abs(row.exited_at_ms - exit.at_ms) <= DAY, `alpha ${a.alpha_id}: "${exit.title}" ${new Date(exit.at_ms).toISOString()}, the ${stage} stage exited ${new Date(row.exited_at_ms).toISOString()}`);
    }
  }
  // W29: a limit exactly reached is full, not breached (R5-07); a stage that ended has no daily PnL (R5-10)
  for (const [id, info] of [...deployments].filter(([, d]) => d.stage === "CANARY" || d.stage === "LIVE").slice(0, 12)) {
    const room = await page("canary", id);
    if (room === null) continue;
    const rows = room.body.envelope_compliance?.rows ?? [];
    const over = rows.some((r) => numOf(r.consumed?.value) > numOf(r.approved));
    if (rows.length > 0) check("W29", (room.body.envelope_compliance?.verdict?.state === "BREACH") === over, `${id}: the envelope verdict says ${room.body.envelope_compliance?.verdict?.state}, but ${over ? "a cap is above its approved limit" : "no cap is above its approved limit"} (exactly at the limit is within)`);
    const daily = (room.body.kpis ?? []).find((k) => k.key === "daily_pnl");
    if (daily !== undefined && room.runtime === "STOPPED") check("W29", daily.value === null, `${id}: the trial is STOPPED but states a daily PnL of ${daily.value}`);
  }
  // ===== WP-B2-C3 end
  // ===== WP-B2-C4 begin: (QA7 N2-01 N2-02 N2-03 N2-04 N5-06)
  const dayOf = (t) => new Date(t).toISOString().slice(0, 10);
  const scopedBlotter = async (deploymentId) => { const r = await ok200(`${E}/screens/blotter?limit=200&deployment_id=${encodeURIComponent(deploymentId)}`); return r === null ? null : { orders: r.data.orders ?? [], fills: r.data.fills ?? [] }; };
  // W50: a stage's daily closes are its own book's: inside the days the stage ran, none after the world's day, and the last one is the equity the stage's room / the alpha table states
  for (const a of c3Alphas.slice(0, 8)) {
    const resource = alphaResources.get(a.alpha_id).data;
    const drift = await ok200(`${E}/alphas/${a.alpha_id}/stage-drift?numeric_format=DECIMAL_STRING`);
    const lifecycle = await ok200(`${E}/alphas/${a.alpha_id}/lifecycle?environment=live`);
    if (drift === null || lifecycle === null) continue;
    check("W50", drift.calendar.every((d) => d <= dayOf(lifecycle.read_at_ms)), `alpha ${a.alpha_id}: the stage-drift calendar runs to ${drift.calendar.at(-1)}, after the world's day ${dayOf(lifecycle.read_at_ms)}`);
    const reached = STAGE_RANK[a.stage];
    if (reached === undefined) continue;
    for (const [stage, rank, envName, rows] of [["paper", 0, "PAPER", ["PAPER"]], ["sandbox", 1, "SANDBOX", ["SANDBOX"]], ["live", 3, "LIVE", ["CANARY", "LIVE"]]]) {
      const mine = (resource.alpha?.deployments ?? []).filter((d) => STAGE_ENV[d.stage] === envName);
      const values = drift.stages[stage].series.map((v, i) => [drift.calendar[i], v]).filter(([, v]) => v !== null);
      if (mine.length === 0 || values.length === 0) continue;
      const equity = mine.reduce((n, d) => n + numOf(d.allocation) + numOf(d.net_pnl) + numOf(d.unrealized_pnl), 0n);
      check("W50", numOf(values.at(-1)[1]) === equity, `alpha ${a.alpha_id}: the ${stage} book's last daily close is ${values.at(-1)[1]}, its deployments' allocation + Net PnL + unrealized is ${fromUnits(equity)}`);
      const stageRows = (lifecycle.stages ?? []).filter((r) => rows.includes(r.stage) && r.entered_at_ms !== null && STAGE_RANK[r.stage] <= reached);
      if (stageRows.length > 0) {
        check("W50", values[0][0] >= dayOf(Math.min(...stageRows.map((r) => r.entered_at_ms))), `alpha ${a.alpha_id}: the ${stage} book publishes a close for ${values[0][0]}, before its stage began ${dayOf(Math.min(...stageRows.map((r) => r.entered_at_ms)))}`);
        const exits = stageRows.map((r) => r.exited_at_ms);
        if (exits.every((e) => e !== null) && STAGE_RANK[rows.at(-1)] < reached) check("W50", values.at(-1)[0] <= dayOf(Math.max(...exits)), `alpha ${a.alpha_id}: the ${stage} book publishes a close for ${values.at(-1)[0]}, after its stage ended ${dayOf(Math.max(...exits))}`);
      }
    }
  }
  // W51: one drawdown per book and window: the dataset tile (a read that names no window = the page's default window, 90D) is the worst point of the DRAWDOWN series over that window
  for (const a of c3Alphas.slice(0, 8)) {
    const overview = await ok200(`${E}/manager/alphas/${a.alpha_id}/overview?environment=live`);
    const tile = metricStr(overview?.items?.[0]?.economic_partitions?.[0] ?? {}, "max_drawdown_pct");
    const pane = (await ok200(`${E}/manager/series?environment=live&metric=DRAWDOWN&window=${encodeURIComponent('"90D"')}&subjects=${encodeURIComponent(JSON.stringify([{ subject_type: "ALPHA", subject_id: a.alpha_id }]))}`))?.series?.[0];
    if (tile === null || pane?.state !== "AVAILABLE") continue;
    const worst = pane.points.reduce((m, p) => (numOf(p.value) < m ? numOf(p.value) : m), 0n) * 100n;
    check("W51", abs(numOf(tile) - worst) <= SCALE18 / 100_000n, `alpha ${a.alpha_id}: the Max drawdown tile says ${tile}%, the lowest point of the 90D drawdown pane is ${fromUnits(worst)}%`);
  }
  // W52: the Orders rollup is the blotter's own book of the alpha's deployments in the book (orders, fills and statuses)
  for (const a of c3Alphas.slice(0, 8)) {
    const resource = alphaResources.get(a.alpha_id).data;
    for (const environment of ["live", "paper", "sandbox"]) {
      const ids = (resource.alpha?.deployments ?? []).filter((d) => STAGE_ENV[d.stage] === environment.toUpperCase()).map((d) => d.deployment_id);
      const rollup = (await ok200(`${E}/derivations/alphas/${a.alpha_id}/activity?environment=${environment}`))?.data;
      if (ids.length === 0 || rollup === undefined) continue;
      const books = [];
      for (const id of ids) { const b = await scopedBlotter(id); if (b !== null) books.push(b); }
      const orders = books.flatMap((b) => b.orders);
      const counts = {};
      for (const o of orders) counts[o.status] = String(Number(counts[o.status] ?? "0") + 1);
      check("W52", Number(rollup.order_population) === orders.length, `alpha ${a.alpha_id} ${environment}: the Orders rollup counts ${rollup.order_population} orders, the blotter scoped to its deployments holds ${orders.length}`);
      check("W52", Number(rollup.fill_population) === books.flatMap((b) => b.fills).length, `alpha ${a.alpha_id} ${environment}: the Orders rollup counts ${rollup.fill_population} fills, the blotter scoped to its deployments holds ${books.flatMap((b) => b.fills).length}`);
      check("W52", JSON.stringify(Object.entries(rollup.order_status_counts ?? {}).sort()) === JSON.stringify(Object.entries(counts).sort()), `alpha ${a.alpha_id} ${environment}: the rollup's statuses ${JSON.stringify(rollup.order_status_counts)} are not the blotter's ${JSON.stringify(counts)}`);
    }
  }
  // W53: every open position of a Real-funded room is either opened by fills the order book holds or says, in a typed warning, that the retained order window does not rebuild it
  for (const [id] of [...deployments].filter(([, d]) => d.stage === "LIVE" || d.stage === "CANARY").slice(0, 10)) {
    const room = await page(deployments.get(id).stage === "LIVE" ? "live" : "canary", id);
    const rows = room?.body.positions?.typed?.rows ?? [];
    if (rows.length === 0) continue;
    const book = await scopedBlotter(id);
    if (book === null) continue;
    const byId = new Map(book.orders.map((o) => [o.order_id, o]));
    const warned = (room.body.positions?.envelope?.warnings ?? []).some((w) => w.code === "POSITIONS_OPENED_BEFORE_THE_RETAINED_ORDER_WINDOW");
    for (const p of rows) {
      const opening = p.side === "long" ? "BUY" : "SELL";
      const opened = book.fills.reduce((n, f) => { const o = byId.get(f.order_id ?? String(f.client_order_id).replace(/^cl-/, "ord_")); return o && o.symbol === p.symbol && o.side === opening ? n + (numOf(f.quantity) ?? 0n) : n; }, 0n);
      check("W53", opened >= numOf(p.quantity) || warned, `${id}: ${p.side} ${p.quantity} ${p.symbol} is opened by ${fromUnits(opened)} of filled ${opening} orders in the book, and the positions panel carries no typed warning that they predate the retained order window`);
    }
  }
  // W54: the room's KPI that holds allocation + realized is not named equity (the unrealized sits on the positions, apart)
  for (const [id, info] of [...deployments].filter(([, d]) => d.stage === "LIVE" || d.stage === "CANARY").slice(0, 10)) {
    const room = await page(info.stage === "LIVE" ? "live" : "canary", id);
    const kpi = (room?.body.kpis ?? []).find((k) => k.key === "broker_equity");
    const spec = (alphaResources.get(info.alphaId)?.data.alpha?.deployments ?? []).find((d) => d.deployment_id === id);
    if (kpi === undefined || kpi.value === null || spec === undefined) continue;
    const full = numOf(spec.allocation) + numOf(spec.net_pnl) + numOf(spec.unrealized_pnl);
    check("W54", numOf(kpi.value) === full || (kpi.label !== "Broker equity" && numOf(kpi.value) === numOf(spec.allocation) + numOf(spec.net_pnl)), `${id}: the KPI "${kpi.label}" ${kpi.value} is neither allocation + Net PnL + unrealized (${fromUnits(full)}) nor named for what it leaves out`);
    const series = room?.body.series;
    if (series && typeof series.methodology_ref === "string") check("W54", /realized/i.test(series.methodology_ref), `${id}: the Net PnL series' methodology "${series.methodology_ref}" does not say it is the realized figure`);
  }
  // ===== WP-B2-C4 end
  // ===== WP-B2-A3 round D begin
  // ── W60: an Accounts list row is a projection of the same account fact as its Account 360 (N3-01) ──
  {
    const bindingRows = await pages(`${E}/broker-bindings?limit=50&environment=live`, (b) => b.page?.rows ?? [], (b) => b.page?.next_cursor ?? null, 4);
    for (const row of bindingRows) {
      const used = row.figures?.virtual_used?.[0];
      if (used === undefined || used === null) continue;
      const exposure = await ok200(`${E}/broker-bindings/${row.binding_id}/exposure`);
      const bucket = exposure?.analytics?.data?.buckets?.find((b) => b.currency === used.currency);
      if (bucket !== undefined) check("W60", sameDecimal(bucket.used, used.value), `${row.binding_id}: the list says virtual ${used.value}, the binding exposure says used ${bucket.used}`);
      if (!/^acc_(bnc_sub|okx_main)$/.test(row.account_id)) continue;
      const account = await ok200(`${E}/resources/accounts/${row.account_id}`);
      const ledger = account?.data?.account_balances?.find((b) => b.currency === used.currency)?.total;
      if (ledger !== undefined) check("W60", sameDecimal(ledger, used.value), `${row.account_id}: the list says virtual ${used.value}, Account 360 says an internal ledger of ${ledger}`);
      const head = row.figures?.virtual_headroom?.[0];
      if (head && bucket) check("W60", sameDecimal(head.value, bucket.headroom), `${row.account_id}: the list says headroom ${head.value}, the capital invariant (binding exposure) says ${bucket.headroom}`);
    }
  }
  // ── W61: a decided request is decided everywhere: not in the queue, status APPROVED, quorum met, actions locked (N5-04) ──
  {
    const history = await pages(`${E}/governance/approvals/history?limit=50`, (b) => b.page?.rows ?? [], (b) => b.page?.next_cursor ?? null, 3);
    const open = new Set(approvalRows.map((r) => r.id));
    for (const h of history.slice(0, 40)) {
      check("W61", !open.has(h.approval_id), `${h.approval_id} is decided (${h.outcome}) and still in the queue`);
      const gate = String(h.gate).toLowerCase();
      const path = gate === "r1" || gate === "r2" || gate === "live_gate" ? `${E}/governance/approvals/${h.approval_id}/${gate === "live_gate" ? "live" : gate}` : `${E}/governance/exit-reviews/${h.approval_id}`;
      const d = await ok200(path);
      const approval = d?.data?.approval ?? d?.governance_backbone?.data?.approval ?? d?.approval;
      if (approval?.status !== undefined) {
        check("W61", approval.status === "APPROVED", `${h.approval_id}: history says decided, the page says ${approval.status}`);
        check("W61", approval.quorum_met >= approval.quorum_required, `${h.approval_id}: decided with quorum ${approval.quorum_met} of ${approval.quorum_required}`);
      }
      const elig = d?.data?.eligibility ?? d?.eligibility ?? d?.governance_backbone?.data?.eligibility;
      if (elig !== undefined) check("W61", elig.can_approve === false && elig.can_deny === false, `${h.approval_id}: decided, yet the page allows a decision`);
    }
  }
  // ── W62: a Live gate request states the decided R1 of its alpha (two gates past R1), and it opens (R3-02 residual) ──
  {
    for (const row of approvalRows.filter((r) => r.gate === "LIVE_GATE")) {
      const d = await ok200(`${E}/governance/approvals/${row.id}/live`);
      const data = d?.governance_backbone?.data;
      if (data === undefined) continue;
      check("W62", data.r1_state === "APPROVED" && data.r1_reference?.state === "APPROVED", `${row.id}: a Live gate prints R1 state ${data.r1_state}`);
      if (data.r1_id) check("W62", (await get(`${E}/governance/approvals/${data.r1_id}/r1`)).status === 200, `${row.id}: R1 ${data.r1_id} does not open`);
    }
  }
  // ── W63: every approval subject opens a readable Alpha 360 (resource + lifecycle answer 200, never a 500), and its Fleet row stage is its approval's stage (N3-05, N3-09) ──
  {
    const WAITS = { R1: "RESEARCH", R2: "RESEARCH", PAPER_EXIT: "PAPER", SANDBOX_EXIT: "SANDBOX", LIVE_GATE: "CANARY" };
    for (const row of approvalRows) {
      const label = String(row.subject ?? "").split(/\s+[·→]\s+/)[0];
      const alpha = alphaRows.find((a) => a.alpha_label === label);
      if (alpha === undefined) continue;
      check("W63", (await get(`${E}/resources/alphas/${alpha.alpha_id}`)).status === 200, `${row.id}: the Alpha 360 of ${label} (${alpha.alpha_id}) does not answer 200`);
      check("W63", (await get(`${E}/alphas/${alpha.alpha_id}/lifecycle`)).status === 200, `${row.id}: the lifecycle of ${label} does not answer 200`);
      check("W63", alpha.stage === WAITS[row.gate], `${row.id}: the Fleet row of ${label} says ${alpha.stage}, its ${row.gate} waits at ${WAITS[row.gate]}`);
    }
  }
  // ── W64: the contribution an exit review prints is the Net PnL (realized, the published definition) of the deployment it reviews (N3-02) ──
  {
    for (const row of approvalRows.filter((r) => r.gate === "SANDBOX_EXIT" || r.gate === "PAPER_EXIT")) {
      const dep = /\b(dep_[A-Za-z0-9_]+)/.exec(String(row.subject))?.[1];
      const known = dep === undefined ? undefined : deployments.get(dep);
      const d = await ok200(`${E}/governance/exit-reviews/${row.id}`);
      const text = JSON.stringify(d?.panels ?? []);
      const m = /contribution (-?[\d,]+\.\d+) ([A-Z]+)/.exec(text);
      if (known === undefined || m === null) continue;
      check("W64", sameDecimal(m[1], known.row.realized_pnl), `${row.id}: contribution ${m[1]} ${m[2]}, the Fleet row of ${dep} publishes Net PnL ${known.row.realized_pnl}`);
      check("W64", m[2] === known.row.currency, `${row.id}: contribution in ${m[2]}, ${dep} is booked in ${known.row.currency}`);
    }
  }
  // ── W65: a request's portfolio weight is allocation over the NAV the portfolio's own chart ends on (N3-03) ──
  {
    for (const row of approvalRows.filter((r) => r.gate === "R2" && /^pf_scale_/.test(String(r.portfolio_id ?? "")))) {
      const d = await ok200(`${E}/governance/approvals/${row.id}/r2`);
      const weight = d?.capital?.find((c) => c.label === "portfolio weight");
      const alloc = d?.capital?.find((c) => c.label === "allocated capital");
      const series = await ok200(`${E}/manager/series?environment=${String(row.environment).toLowerCase()}&metric=NAV&window=${encodeURIComponent('"90D"')}&subjects=${encodeURIComponent(JSON.stringify([{ subject_type: "PORTFOLIO", subject_id: row.portfolio_id }]))}`);
      const last = [...(series?.series?.[0]?.points ?? [])].reverse().find((p) => p.value !== null);
      if (!weight || !alloc || last === undefined) continue;
      const nav = numOf(last.value);
      for (const [label, money, shown] of [["before", alloc.before, weight.before], ["after", alloc.after, weight.after]]) {
        const tenths = (numOf(String(money).replace(/,/g, "")) * 2000n + nav) / (2n * nav);
        check("W65", `${tenths / 10n}.${tenths % 10n}` === shown, `${row.id}: weight ${label} ${shown}%, allocation ${money} over NAV ${last.value} is ${tenths / 10n}.${tenths % 10n}%`);
      }
    }
  }
  // ── W66: no margin ratio and no buying power without the data they are made of (N3-04) ──
  {
    const rows46 = await pages(`${E}/broker-bindings?limit=50&environment=live`, (b) => b.page?.rows ?? [], (b) => b.page?.next_cursor ?? null, 4);
    for (const row of rows46.slice(0, 60)) {
      const data = (await ok200(`${E}/resources/accounts/${row.account_id}`))?.data;
      if (data === undefined) continue;
      const ledger = data.account_balances?.find((b) => b.currency === "USDT");
      for (const m of data.margin_balances ?? []) {
        if (m.margin_ratio === undefined) continue;
        check("W66", ledger !== undefined && numOf(ledger.total) > 0n && numOf(m.maintenance) > 0n, `${row.account_id}: margin ratio ${m.margin_ratio}% over maintenance ${m.maintenance} and a ledger of ${ledger?.total}`);
      }
      for (const sync of data.broker_sync ?? []) {
        if (sync.buying_power === undefined) continue;
        check("W66", !(numOf(sync.buying_power) === 0n && ledger !== undefined && numOf(ledger.total) === 0n), `${row.account_id}: buying power ${sync.buying_power} printed where the venue reported no balance`);
      }
    }
  }
  // ── W67: "account (new)" names an account that does not exist; an existing account is named as it is, with its capital check (N3-07) ──
  {
    for (const row of approvalRows.filter((r) => r.gate === "R2")) {
      const d = await ok200(`${E}/governance/approvals/${row.id}/r2`);
      const entries = (d?.readiness ?? []).flatMap((g) => g.entries ?? []);
      const account = entries.find((e) => e.label === "account (new)" || e.label === "account");
      if (account === undefined) continue;
      const exists = (await get(`${E}/resources/accounts/${account.value}`)).status === 200;
      check("W67", !(exists && account.label === "account (new)"), `${row.id}: "account (new)" names ${account.value}, which already exists`);
      if (exists) check("W67", entries.some((e) => e.label === "capital check"), `${row.id}: ${account.value} exists and the request states no capital check of it`);
    }
  }
  // ── W68: a request names the entity it decides (a linkable id of the fleet), and the picker the session reads lists no placeholder alpha (N3-06, N3-08) ──
  {
    for (const row of approvalRows) {
      const label = String(row.subject ?? "").split(/\s+[·→]\s+/)[0];
      const alpha = alphaRows.find((a) => a.alpha_label === label);
      const dep = /\b(dep_[A-Za-z0-9_]+)/.exec(String(row.subject))?.[1];
      // a Live gate names the alpha in text and the Canary deployment it promotes in subject_id
      const canary = row.gate === "LIVE_GATE" ? (alpha?.deployments ?? []).filter((d) => d.stage === "CANARY").map((d) => d.deployment_id) : [];
      check("W68", row.subject_id === (dep ?? alpha?.alpha_id) || canary.includes(row.subject_id), `${row.id}: subject_id ${row.subject_id} is not the ${dep !== undefined ? "deployment" : "alpha"} its subject names (${dep ?? alpha?.alpha_id})`);
    }
    const names = [];
    let cursor = null;
    for (let n = 0; n < 6; n += 1) {
      const page = await ok200(`/api/v1/quantbt/runs/alpha-catalogue?limit=200${cursor === null ? "" : `&cursor=${encodeURIComponent(cursor)}`}`);
      if (page === null) break;
      names.push(...page.items.map((i) => i.alpha_name));
      cursor = page.page?.next_cursor ?? null;
      if (cursor === null) break;
    }
    check("W68", names.length > 0, "the alpha catalogue answers nothing");
    for (const name of names) check("W68", !/^Fixture alpha /.test(name), `the picker lists the placeholder "${name}"`);
    // the catalogue is run-derived: alpha_e is the double's own research-only row, with no run in the world, so it is not in it
    for (const label of alphaRows.filter((a) => a.alpha_id !== "alpha_e").map((a) => a.alpha_label)) check("W68", names.includes(label), `the picker does not list the fleet alpha "${label}"`);
  }
  // ===== WP-B2-A3 round D end
  return { ties };
}

const fromUnits = show;
