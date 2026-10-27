/**
 * DOM-level TIES (WP-P). FIXTURE_LAB. Loads the SCREEN routes and compares the SAME quantity as RENDERED TEXT on every screen that shows it, so a
 * screen that formats, picks a window or a partition differently from the read it was built on is caught (the API-level ties in fixture-ties.mjs
 * cannot see that). `runDomTies(page, base)` returns {checked, mismatches[], skipped[]}.
 *
 *   P1  Portfolios register row  == Portfolio 360 tiles   (economic capital/NAV, net PnL, return, drawdown, score) for natives and generated books
 *   P2  Portfolio 360 NAV tile   == its Capital panel NAV;  Allocated tile == Allocated of the Capital panel
 *   P3  Live page  vs Alpha 360 deployments: the same account id and the same allocated capital for dep_live_01
 *   P4  Account 360: the sleeves named in the header == the rows of the balance table
 *   P5  Fleet: the 'In stage' days of a row == the days on Alpha 360's spine for the same alpha and stage
 *   P6  Blotter scoped to a deployment holds orders (no 'No loaded order matches')
 */
const norm = (text) => text.replace(/\s+/g, " ").trim();
const num = (text) => {
  if (text === null || text === undefined) return null;
  const m = /([+-]?)\s*([\d,]+(?:\.\d+)?)/.exec(text.replace(/−/g, "-"));
  return m ? (m[1] === "-" ? "-" : "") + m[2].replace(/,/g, "").replace(/^(-?)0+(?=\d)/, "$1") : null;
};

async function load(page, base, path) {
  await page.goto(base + path, { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(700);
}

/** The text that follows a label inside the screen's main area, `|` separated by block. */
const flat = (page) => page.evaluate(() => (document.querySelector("main") ?? document.body).innerText.replace(/\n+/g, " | "));
const after = (text, label, skip = 0) => {
  const i = text.indexOf(`| ${label} |`);
  if (i < 0) return null;
  const parts = text.slice(i + label.length + 4).split(" | ").slice(skip);
  return parts[0] ?? null;
};

/** One row of the register as {header: cell}. */
async function registerRow(page, id) {
  return page.evaluate((rowId) => {
    const table = [...document.querySelectorAll("table")].find((t) => t.innerText.includes(rowId));
    if (!table) return null;
    const heads = [...table.querySelectorAll("thead th")].map((th) => th.innerText.replace(/\s+/g, " ").trim().toUpperCase());
    const row = [...table.querySelectorAll("tbody tr")].find((tr) => tr.innerText.includes(rowId));
    if (!row) return null;
    const out = {};
    [...row.children].forEach((cell, i) => { out[heads[i] ?? `C${i}`] = cell.innerText.replace(/\s+/g, " ").trim(); });
    return out;
  }, id);
}

export async function runDomTies(page, base) {
  const out = { checked: 0, mismatches: [], skipped: [], pairs: [] };
  const eq = (name, a, b, where = "") => {
    out.checked += 1;
    out.pairs.push(`${name}: ${a} | ${b}`);
    if (a === null || b === null || a !== b) out.mismatches.push(`${name}: "${a}" vs "${b}" ${where}`.trim());
  };

  // P1 + P2
  await load(page, base, "/deployments/portfolios?limit=100");
  const ids = ["pf_TEST_ONLY_core", "pf_TEST_ONLY_satellite", "pf_scale_006", "pf_scale_001"];
  const rows = {};
  for (const id of ids) rows[id] = await registerRow(page, id);
  for (const id of ids) {
    const row = rows[id];
    if (row === null) { out.skipped.push(`P1 ${id}: not in the register page`); continue; }
    const col = (prefix) => Object.entries(row).find(([k]) => k.startsWith(prefix))?.[1] ?? null;
    await load(page, base, `/deployments/portfolios/${id}`);
    const t = norm(await flat(page));
    const nav360 = num(after(t, "NAV"));
    const pnl360 = num(after(t, "Net PnL", 1));
    const ret360 = num(after(t, "Return", 1));
    const dd360 = num(after(t, "Drawdown", 1));
    const capital = /Net external flows \| ([\d,.]+) [A-Z]+ \| Net PnL \| ([+-][\d,.]+) [A-Z]+ \| NAV ([\d,.]+)/.exec(t);
    // a register column or 360 tile the tie cannot find is a SKIP that is said, never a silent pass
    for (const [label, header, value] of [["NAV", "NAV", nav360], ["allocated", "ALLOCATED CAPITAL", num(after(t, "Allocated (current)"))], ["net PnL", "NET PNL", pnl360], ["return", "RETURN", ret360], ["drawdown", "DRAWDOWN", dd360]]) {
      if (col(header) === null) out.skipped.push(`P1 ${label} ${id}: register column ${header} not found (headers: ${Object.keys(row).join(" / ").slice(0, 160)})`);
      else if (value === null) out.skipped.push(`P1 ${label} ${id}: 360 tile not found (page text: ${t.slice(0, 260)})`);
    }
    if (col("NAV") !== null) eq(`P1 NAV ${id}`, num(col("NAV")), nav360, "(register vs 360 tile)");
    if (col("ALLOCATED CAPITAL") !== null) eq(`P1 allocated ${id}`, num(col("ALLOCATED CAPITAL")), num(after(t, "Allocated (current)")), "(register vs 360 tile)");
    if (col("NET PNL") !== null && /\d/.test(col("NET PNL"))) eq(`P1 net PnL ${id}`, num(col("NET PNL")), pnl360, "(register vs 360 tile)");
    if (col("RETURN") !== null && /\d/.test(col("RETURN"))) eq(`P1 return ${id}`, num(col("RETURN")), ret360, "(register vs 360 tile)");
    if (col("DRAWDOWN") !== null && /\d/.test(col("DRAWDOWN"))) eq(`P1 drawdown ${id}`, num(col("DRAWDOWN")), dd360, "(register vs 360 tile)");
    if (capital) {
      eq(`P2 NAV tile = Capital panel NAV ${id}`, nav360, num(capital[3]));
      eq(`P2 net PnL tile = Capital panel ${id}`, pnl360, num(capital[2]));
    } else out.skipped.push(`P2 ${id}: capital panel text not found`);
    const allocTile = num(after(t, "Allocated (current)"));
    const allocPanel = /Approved \| ([\d,.]+) [A-Z]+ \| Allocated \| ([\d,.]+)/.exec(t);
    if (allocTile !== null && allocPanel) eq(`P2 Allocated tile = Capital panel ${id}`, allocTile, num(allocPanel[2]));
  }

  // P3: the Live page and Alpha 360 state one account and one allocation for dep_live_01
  await load(page, base, "/deployments/live/dep_live_01");
  const live = norm(await flat(page));
  await load(page, base, "/deployments/alphas/alpha_a?tab=deployments");
  const depRow = await registerRow(page, "dep_live_01");
  const accountOnLive = /\b(acc_[a-z0-9_]+|acct_[a-z0-9_]+)\b/.exec(live)?.[1] ?? null;
  const accountCell = depRow === null ? null : Object.values(depRow).find((cell) => /\b(acc_|acct_)/.test(cell)) ?? null;
  const accountOnAlpha = accountCell === null ? null : /\b(acc_[a-z0-9_]+|acct_[a-z0-9_]+)\b/.exec(accountCell)?.[1] ?? null;
  if (accountOnLive !== null || accountOnAlpha !== null) eq("P3 account of dep_live_01 (Live page vs Alpha 360)", accountOnLive, accountOnAlpha);
  else out.skipped.push("P3: no account id in either page text");
  const capitalOnLive = num(after(live, "CAPITAL") ?? after(live, "Capital") ?? (/Capital \| ([\d,.]+)/i.exec(live)?.[1] ?? null));
  const allocCell = depRow === null ? null : Object.entries(depRow).find(([k]) => /ALLOCATED/.test(k))?.[1] ?? null;
  if (capitalOnLive !== null && allocCell !== null) eq("P3 allocation of dep_live_01 (Live page vs Alpha 360)", capitalOnLive.replace(/\.00$/, ""), num(allocCell).replace(/\.00$/, ""));
  else out.skipped.push("P3 allocation: not found in both texts");

  // P4: the sleeve count in the Account 360 header equals the rows of its sleeves table
  await load(page, base, "/deployments/accounts/acc_bnc_core");
  const acct = await page.evaluate(() => {
    const text = (document.querySelector("main") ?? document.body).innerText;
    const stated = /Shared account\s*·\s*(\d+)\s*sleeves?/i.exec(text)?.[1] ?? null;
    const table = [...document.querySelectorAll("table")].find((t) => /INTERNAL BALANCE/i.test(t.innerText) && /SLEEVE/i.test(t.innerText));
    return { stated, rows: table ? table.querySelectorAll("tbody tr").length : null };
  });
  if (acct.stated !== null && acct.rows !== null) eq("P4 sleeves (header vs table) on acc_bnc_core", acct.stated, String(acct.rows));
  else out.skipped.push(`P4: sleeve count or table not found (${JSON.stringify(acct)})`);

  // P5: Fleet 'In stage' vs the Alpha 360 spine (days on the same stage)
  await load(page, base, "/deployments/alphas?q=alpha_a");
  const fleetRow = await registerRow(page, "Carry A");
  if (fleetRow !== null) {
    const days = num(Object.entries(fleetRow).find(([k]) => /IN STAGE/.test(k))?.[1] ?? null);
    const stageCell = Object.entries(fleetRow).find(([k]) => /^STAGE/.test(k))?.[1] ?? "";
    await load(page, base, "/deployments/alphas/alpha_a");
    const spine = norm(await flat(page));
    const m = /LIVE[^|]*\|[^|]*?(\d+) days?/i.exec(spine);
    if (days !== null && m && /live/i.test(stageCell)) eq("P5 days in stage (Fleet vs spine)", days, m[1]);
    else out.skipped.push(`P5: no comparable days (fleet ${days}, stage ${stageCell})`);
  } else out.skipped.push("P5: alpha_a not in the Fleet page");

  // P7: ONE stage history. Carry A is Live on its spine, so its Paper and Sandbox pages are COMPLETED records: no open observation gate, no failed step, no "Blocked"
  for (const [path, bad] of [["/deployments/paper/dep_paper_01", /Observation gate\s*\|?\s*PARTIAL|observation gate is partial/i], ["/deployments/sandbox/dep_sandbox_01", /Step \d failed|EXIT REVIEW\s*\|?\s*BLOCKED|Blocked until every step passes/i]]) {
    await load(page, base, path);
    const text = norm(await flat(page));
    out.checked += 1;
    if (bad.test(text)) out.mismatches.push(`P7 ${path} is an unfinished stage record for an alpha that is Live (${bad.exec(text)?.[0]})`);
  }

  // P8: the open orders of the Live page are the rows of the blotter the page links to
  await load(page, base, "/deployments/live/dep_live_01");
  const liveText = norm(await flat(page));
  const liveOrders = [...new Set(liveText.match(/\bord_\d{5}\b/g) ?? [])];
  await load(page, base, "/deployments/blotter?deployment=dep_live_01&env=live");
  const blotterText = norm(await flat(page));
  if (liveOrders.length === 0) out.skipped.push("P8: the Live page lists no order id");
  for (const orderId of liveOrders) eq(`P8 order ${orderId} of the Live page is in its blotter`, blotterText.includes(orderId) ? "yes" : "no", "yes");

  // P6: a blotter scoped to a deployment is not empty by construction
  await load(page, base, "/deployments/blotter?deployment=dep_live_01");
  const blotter = norm(await flat(page));
  out.checked += 1;
  if (/No loaded order matches/i.test(blotter)) out.mismatches.push("P6 the blotter scoped to dep_live_01 says 'No loaded order matches'");
  return out;
}
