/**
 * I1 — rapid inspection on 04/06/07/08/13 and the 03 progress transport.
 *
 * Every action is counted against the read budget the client code states
 * (file:line in the A1 report). Across all of it: zero write requests, DOM
 * element count after settle within +5 % of the count before, and no two
 * identical GETs in flight at once (aborted, superseded reads excluded).
 */
import { expect, test, type Page } from "@playwright/test";

import { freezeClock } from "../fixtures";
import { cursorKeys, domNodes, guide, location, open, quiet, rootText, upsertRow } from "./harness";
import { installLane, screen, watchConsole, watchNetwork, type ApiRequest, type NetLog } from "./stubs";

interface Row {
  screen: string;
  action: string;
  observed: Record<string, number>;
  budget: string;
  pass: boolean;
}

function count(net: NetLog, from: number, pattern: RegExp, method = "GET"): number {
  return net.requests.slice(from).filter((r) => r.method === method && pattern.test(r.url)).length;
}

function record(row: Row): void {
  upsertRow("interaction.json", "fixture lane, single context", `${row.screen} ${row.action}`, row);
  expect.soft(row.pass, `[s${row.screen}] ${row.action}: observed ${JSON.stringify(row.observed)} vs budget ${row.budget}`).toBe(true);
}

function commonChecks(tag: string, net: NetLog, noise: string[], before: number, after: number): void {
  expect.soft(net.writes().map((r) => `${r.method} ${r.url}`), `${tag} write requests`).toEqual([]);
  expect.soft(after, `${tag} DOM elements after settle (${after}) vs before (${before}) + 5 %`).toBeLessThanOrEqual(Math.ceil(before * 1.05));
  expect.soft(net.concurrentDuplicates(), `${tag} identical GETs in flight at once`).toEqual([]);
  expect.soft(net.gaps, `${tag} fixture gaps (501)`).toEqual([]);
  expect.soft(noise, `${tag} console error/warning/pageerror`).toEqual([]);
}

async function boot(page: Page, progress?: "running" | "terminal-after-event") {
  await page.setViewportSize({ width: 1280, height: 900 });
  await freezeClock(page);
  await installLane(page, progress ? { progress } : {});
  const net = watchNetwork(page);
  const { noise } = watchConsole(page, net);
  return { net, noise };
}

/** Pushes one same-document history entry by assigning the hash. */
async function pushHash(page: Page, hash: string): Promise<void> {
  await page.evaluate((value) => {
    window.location.hash = value;
  }, hash);
}

async function backForward(page: Page, pairs: number, onStep?: () => Promise<void>): Promise<void> {
  for (let i = 0; i < pairs; i += 1) {
    await page.goBack();
    await onStep?.();
    await page.goForward();
    await onStep?.();
  }
}


test("evidence hub 04: rapid tabs, cursor hash changes and history stay within the read budget", async ({ page }) => {
  guide("P23-T11");
  const s = screen("04");
  const { net, noise } = await boot(page);
  await open(page, net, s.path, s.root);
  const initial = await location(page);
  const initialTab = (await page.locator(`${s.root} [role='tab'][aria-selected='true']`).first().getAttribute("data-tab")) ?? "search";
  const before = await domNodes(page);
  const HUB = /\/api\/v1\/quantbt\/runs\/[^/]+\/evidence(\?|$)/;
  const SERIES = /\/api\/v1\/quantbt\/runs\/[^/]+\/evidence\/series\?/;
  const PASSPORT = /\/api\/v1\/quantbt\/runs\/[^/]+\/current-source\/evidence/;
  const kinds = (from: number) => {
    const out: Record<string, number> = {};
    for (const r of net.requests.slice(from).filter((q) => SERIES.test(q.url))) {
      const kind = new URL(r.url, "http://x").searchParams.get("kind") ?? "?";
      out[kind] = (out[kind] ?? 0) + 1;
    }
    return out;
  };

  const tabs = await page.locator(`${s.root} [role='tab'][data-tab]`).evaluateAll((els) => els.map((el) => el.getAttribute("data-tab")!));
  const m0 = net.requests.length;
  for (let i = 0; i < 40; i += 1) {
    await page.locator(`${s.root} [role='tab'][data-tab='${tabs[i % tabs.length]}']`).click();
  }
  await quiet(page, net);
  const kA = kinds(m0);
  record({
    screen: "04",
    action: `40 rapid tab clicks over ${tabs.length} tabs`,
    observed: { hubGET: count(net, m0, HUB), passportGET: count(net, m0, PASSPORT), ...Object.fromEntries(Object.entries(kA).map(([k, v]) => [`series:${k}`, v])) },
    budget: "hub 0 · series ≤ 1 per kind for the life of the run · passport ≤ 1",
    pass: count(net, m0, HUB) === 0 && count(net, m0, PASSPORT) <= 1 && Object.values(kA).every((v) => v <= 1),
  });

  const m1 = net.requests.length;
  for (let i = 0; i < 40; i += 1) {
    await pushHash(page, `stage=search&fold=${1 + (i % 5)}&params=prm_7c1a9e`);
  }
  await quiet(page, net);
  const kB = kinds(m0);
  record({
    screen: "04",
    action: "40 cursor hash changes (fold 1→5 cycling)",
    observed: { hubGET: count(net, m1, HUB), seriesGET: count(net, m1, SERIES), passportGET: count(net, m1, PASSPORT) },
    budget: "hub 0 · no series kind read twice · passport ≤ 1 total",
    pass: count(net, m1, HUB) === 0 && Object.values(kB).every((v) => v <= 1) && count(net, m0, PASSPORT) <= 1,
  });

  const m2 = net.requests.length;
  await backForward(page, 20);
  await quiet(page, net);
  record({
    screen: "04",
    action: "20 back/forward pairs (same-document hash entries)",
    observed: { hubGET: count(net, m2, HUB), seriesGET: count(net, m2, SERIES), passportGET: count(net, m2, PASSPORT) },
    budget: "hub 0 · series 0 new kinds re-read",
    pass: count(net, m2, HUB) === 0 && Object.values(kinds(m0)).every((v) => v <= 1),
  });

  await pushHash(page, initial.slice(initial.indexOf("#") + 1));
  await page.locator(`${s.root} [role='tab'][data-tab='${initialTab}']`).click();
  await quiet(page, net);
  commonChecks("[s04]", net, noise, before, await domNodes(page));
});

for (const id of ["06", "07"] as const) {
  test(`${id === "06" ? "search 06" : "freeze 07"}: rapid stage-rail clicks and fold history stay within the read budget`, async ({ page }) => {
    guide("P23-T11");
    const s = screen(id);
    const { net, noise } = await boot(page);
    await open(page, net, s.path, s.root);
    const before = await domNodes(page);
    const kind = id === "06" ? "search" : "freeze";
    const DETAIL = new RegExp(`/api/v1/quantbt/runs/[^/]+/${kind}(\\?|$)`);
    const LEDGER = new RegExp(`/api/v1/quantbt/runs/[^/]+/current-source/${kind}`);

    /* 06 and 07 carry no in-screen tab or inspect control (SearchDetail.tsx /
       FreezeDetail.tsx expose only `reread` on refusal and the 07 `verify`
       action, which is a write and is never clicked here). Their tab strip is
       the stage rail, so the 40 rapid clicks alternate S2 ⇄ S3. */
    const FOLDER = /\/api\/v1\/quantbt\/runs\/[^/]+\/(search|freeze)(\?|$)/;
    const hops = id === "06" ? ["[data-action='next-stage']", "[data-action='back-to-search']"] : ["[data-action='back-to-search']", "[data-action='next-stage']"];
    const m0 = net.requests.length;
    for (let i = 0; i < 40; i += 1) {
      const target = i % 2 === 0 ? (id === "06" ? /\/freeze(#|$)/ : /\/search(#|$)/) : id === "06" ? /\/search(#|$)/ : /\/freeze(#|$)/;
      await page.locator(`main#portal-content ${hops[i % 2]}`).first().click();
      await page.waitForURL(target, { timeout: 10_000 });
    }
    await quiet(page, net);
    const detailA = count(net, m0, FOLDER);
    record({
      screen: id,
      action: "40 rapid stage-rail clicks S2 ⇄ S3 (each lands on a new route)",
      observed: { detailGET: detailA, abortedDetail: net.requests.slice(m0).filter((r) => FOLDER.test(r.url) && r.failure !== null).length, ledgerGET: count(net, m0, LEDGER) },
      budget: "≤ 1 detail GET per arrival = 40 · retained ledger ≤ 1 per arrival on its own screen = 20 (the ledger panel asks once per mount)",
      pass: detailA <= 40 && count(net, m0, LEDGER) <= 20,
    });
    await page.goto(s.path);
    await page.locator(s.root).first().waitFor({ state: "visible", timeout: 15_000 });
    await quiet(page, net);

    const m1 = net.requests.length;
    const start = cursorKeys(await location(page));
    const otherFold = start.fold === "3" ? "4" : "3";
    await pushHash(page, `stage=${start.stage ?? kind}&fold=${otherFold}&params=${start.params ?? "prm_3b81c7"}`);
    await quiet(page, net);
    await backForward(page, 20);
    await quiet(page, net);
    const detailB = count(net, m1, DETAIL);
    const aborted = net.requests.slice(m1).filter((r: ApiRequest) => DETAIL.test(r.url) && r.failure !== null).length;
    record({
      screen: id,
      action: "1 fold hash entry + 20 back/forward pairs (41 fold changes)",
      observed: { detailGET: detailB, abortedDetail: aborted, ledgerGET: count(net, m1, LEDGER) },
      budget: "detail GET ≤ 1 per fold change = 41 · ledger 0 new",
      pass: detailB <= 41 && count(net, m1, LEDGER) === 0,
    });

    /* Back to the fold the screen arrived on, so before/after DOM compare like with like. */
    await page.goBack();
    await quiet(page, net);
    commonChecks(`[s${id}]`, net, noise, before, await domNodes(page));
  });
}

test("execute replay 08: transport clicks, far seeks, slider drags and history send no read", async ({ page }) => {
  guide("P23-T11");
  const s = screen("08");
  const { net, noise } = await boot(page);
  await open(page, net, s.path, s.root);
  const before = await domNodes(page);
  const REPLAY = /\/api\/v1\/quantbt\/runs\/[^/]+\/execute\/replay/;

  const m0 = net.requests.length;
  const transport = ["[data-speed='4']", "[aria-label='step forward']", "[data-speed='16']", "[aria-label='step back']", "[data-speed='64']", "[data-speed='1']"];
  for (let i = 0; i < 40; i += 1) {
    await page.locator(`${s.root} ${transport[i % transport.length]}`).first().click();
  }
  await quiet(page, net);
  record({ screen: "08", action: "40 rapid transport clicks (speed / step)", observed: { replayGET: count(net, m0, REPLAY) }, budget: "0 (transport never fetches)", pass: count(net, m0, REPLAY) === 0 });

  const seek = page.locator(`${s.root} input[type='range'][data-seek]`).first();
  const max = Number((await seek.getAttribute("max")) ?? "99");
  const min = Number((await seek.getAttribute("min")) ?? "0");
  const m1 = net.requests.length;
  for (let i = 0; i < 20; i += 1) {
    await seek.fill(String(i % 2 === 0 ? max - (i % 3) : min + (i % 3)));
  }
  await quiet(page, net);
  record({ screen: "08", action: `20 far seeks inside the loaded window (${min}↔${max})`, observed: { replayGET: count(net, m1, REPLAY) }, budget: "0 (seek inside a loaded window)", pass: count(net, m1, REPLAY) === 0 });

  const box = (await seek.boundingBox())!;
  const m2 = net.requests.length;
  for (let i = 0; i < 20; i += 1) {
    const [from, to] = i % 2 === 0 ? [0.02, 0.98] : [0.98, 0.02];
    await page.mouse.move(box.x + box.width * from, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * to, box.y + box.height / 2, { steps: 12 });
    await page.mouse.up();
  }
  await quiet(page, net);
  record({ screen: "08", action: "20 slider drags end to end (mouse.down/move/up)", observed: { replayGET: count(net, m2, REPLAY) }, budget: "0 (drag inside a loaded window)", pass: count(net, m2, REPLAY) === 0 });

  const m3 = net.requests.length;
  const cur = cursorKeys(await location(page));
  await pushHash(page, `stage=execute&fold=${cur.fold ?? "2"}&params=${cur.params ?? "prm_3b81c7"}&seq=40`);
  await quiet(page, net);
  await backForward(page, 20);
  await quiet(page, net);
  record({ screen: "08", action: "1 seq hash entry + 20 back/forward pairs", observed: { replayGET: count(net, m3, REPLAY) }, budget: "0 (one read on arrival; the route is keyed by run, not by seq)", pass: count(net, m3, REPLAY) === 0 });

  commonChecks("[s08]", net, noise, before, await domNodes(page));
});

test("compare 13: rapid mode clicks and history send one read per key change at most", async ({ page }) => {
  guide("P23-T11");
  const s = screen("13");
  const { net, noise } = await boot(page);
  await open(page, net, s.path, s.root);
  const before = await domNodes(page);
  const COMPARE = /\/api\/v1\/research\/alphas\/[^/]+\/compare/;

  const order = ["markets", "pair", "attempts"] as const;
  let mode: string = "attempts";
  let budgetA = 0;
  const m0 = net.requests.length;
  for (let i = 0; i < 40; i += 1) {
    const next = order[i % order.length]!;
    if (next !== mode && next !== "pair") budgetA += 1;
    mode = next;
    await page.locator(`${s.root} [data-mode-option='${next}']`).click();
  }
  await quiet(page, net);
  const obsA = count(net, m0, COMPARE);
  record({
    screen: "13",
    action: "40 rapid mode clicks (markets → pair → attempts)",
    observed: { compareGET: obsA, aborted: net.requests.slice(m0).filter((r) => COMPARE.test(r.url) && r.failure !== null).length },
    budget: `≤ 1 GET per key change to attempts/markets = ${budgetA}; pair without runs = 0`,
    pass: obsA <= budgetA,
  });

  const m1 = net.requests.length;
  await backForward(page, 20);
  await quiet(page, net);
  const obsB = count(net, m1, COMPARE);
  record({ screen: "13", action: "20 back/forward pairs over pushed mode history", observed: { compareGET: obsB }, budget: "≤ 1 GET per history step = 40", pass: obsB <= 40 });

  await page.locator(`${s.root} [data-mode-option='attempts']`).click();
  await quiet(page, net);
  commonChecks("[s13]", net, noise, before, await domNodes(page));
});

const PROGRESS = /\/api\/v1\/research\/runs\/[^/]+\/(progress|events)/;

test("run progress 03: a terminal run sends no progress request after the terminal event", async ({ page }) => {
  guide("P23-T11");
  const s = screen("03");
  const { net, noise } = await boot(page, "terminal-after-event");
  await open(page, net, s.path, s.root);
  await expect.poll(async () => /\bCOMPLETED\b/.test(await rootText(page, s.root)), { timeout: 15_000 }).toBe(true);
  await quiet(page, net);
  const bootReads = net.requests.filter((r) => PROGRESS.test(r.url)).map((r) => `${r.method} ${r.url.replace(/\?.*$/, "")}`);
  const m0 = net.requests.length;
  await page.clock.runFor(20_000);
  await quiet(page, net);
  const after = count(net, m0, PROGRESS);
  record({ screen: "03", action: `terminal run, 20 s after the run_completed event (boot: ${bootReads.join(", ")})`, observed: { progressOrEvents: after }, budget: "0", pass: after === 0 });
  expect.soft(net.writes().map((r) => `${r.method} ${r.url}`), "[s03 terminal] write requests").toEqual([]);
  expect.soft(noise, "[s03 terminal] console").toEqual([]);
});

test("run progress 03: a running run polls at most once per poll interval plus one", async ({ page }) => {
  guide("P23-T11");
  const s = screen("03");
  const { net, noise } = await boot(page, "running");
  await open(page, net, s.path, s.root);
  const m0 = net.requests.length;
  await page.clock.runFor(20_000);
  await quiet(page, net);
  const after = count(net, m0, PROGRESS);
  record({ screen: "03", action: "running run over 20 s (fixture stream ends after one heartbeat → poll floor)", observed: { progressOrEvents: after }, budget: "≤ 20 s / 5 s + 1 = 5", pass: after <= 5 });
  expect.soft(net.writes().map((r) => `${r.method} ${r.url}`), "[s03 running] write requests").toEqual([]);
  expect.soft(noise, "[s03 running] console").toEqual([]);
});
