/**
 * L1 — twenty concurrent Research readers, fixture lane (client cost only).
 *
 * Twenty contexts in one browser, each with its own cookie jar and its own
 * stub identity (`qual-user-NN`), start together and walk 01 → 03 → 04 → 06 →
 * 08 → 09 → 11. Every number below is **client cost, fixture lane**: the API
 * is `page.route` stubs, so latency here is browser work, not server time.
 */
import { execFileSync } from "node:child_process";

import { expect, test } from "@playwright/test";

import { freezeClock } from "../fixtures";
import { contextOptions, domNodes, guide, heap, mb, percentile, quiet, writeJson } from "./harness";
import { WRITE_METHODS, installLane, screen, watchNetwork } from "./stubs";

const USERS = 20;
const WALK = ["01", "03", "04", "06", "08", "09", "11"] as const;
const LABEL = "client cost, fixture lane";

interface Sample {
  user: string;
  screen: string;
  navToSettleMs: number;
  rootRendered: boolean;
  jsHeapUsedBytes: number;
  domNodes: number;
  requests: Record<string, number>;
}

/** Summed RSS (kB) of every process descending from this test worker (the browser tree). Best effort. */
function browserRssKb(): { kb: number; processes: number } | null {
  try {
    const out = execFileSync("ps", ["-eo", "pid=,ppid=,rss=,comm="], { encoding: "utf8" });
    const rows = out
      .trim()
      .split("\n")
      .map((line) => line.trim().split(/\s+/))
      .map(([pid, ppid, rss, comm]) => ({ pid: Number(pid), ppid: Number(ppid), rss: Number(rss), comm: comm ?? "" }));
    const children = new Map<number, number[]>();
    for (const row of rows) children.set(row.ppid, [...(children.get(row.ppid) ?? []), row.pid]);
    const seen = new Set<number>();
    const stack = [...(children.get(process.pid) ?? [])];
    while (stack.length) {
      const pid = stack.pop()!;
      if (seen.has(pid)) continue;
      seen.add(pid);
      stack.push(...(children.get(pid) ?? []));
    }
    const tree = rows.filter((row) => seen.has(row.pid));
    return { kb: tree.reduce((sum, row) => sum + row.rss, 0), processes: tree.length };
  } catch {
    return null;
  }
}

test("twenty concurrent readers walk seven screens without a write", async ({ browser }) => {
  guide("P23-T01");
  guide("P23-T11");
  test.setTimeout(180_000);
  const rssBefore = browserRssKb();

  const samples: Sample[] = [];
  const writesByUser: Record<string, string[]> = {};

  const users = await Promise.all(
    Array.from({ length: USERS }, async (_, i) => {
      const user = `qual-user-${String(i + 1).padStart(2, "0")}`;
      const context = await browser.newContext(contextOptions());
      await context.addCookies([
        { name: "p23_qual_session", value: `${user}-${Math.random().toString(36).slice(2, 10)}`, url: process.env.RESEARCH_QUAL_BASE_URL! },
      ]);
      const page = await context.newPage();
      await freezeClock(page);
      await installLane(page, { identity: user });
      const net = watchNetwork(page);
      /* Context-level counter, as the brief asks, alongside the page log. */
      const byMethod: Record<string, number> = {};
      context.on("request", (request) => {
        if (!new URL(request.url()).pathname.startsWith("/api/")) return;
        byMethod[request.method()] = (byMethod[request.method()] ?? 0) + 1;
      });
      return { user, context, page, net, byMethod };
    }),
  );
  const rssOpened = browserRssKb();

  await Promise.all(
    users.map(async ({ user, page, net, byMethod }) => {
      for (const id of WALK) {
        const s = screen(id);
        const before = { ...byMethod };
        const t0 = performance.now();
        await page.goto(s.path);
        const rootRendered = await page
          .locator(s.root)
          .first()
          .waitFor({ state: "visible", timeout: 30_000 })
          .then(
            () => true,
            () => false,
          );
        await quiet(page, net, 30_000);
        const navToSettleMs = performance.now() - t0;
        const metrics = await heap(page);
        const requests: Record<string, number> = {};
        for (const [method, count] of Object.entries(byMethod)) {
          const delta = count - (before[method] ?? 0);
          if (delta) requests[method] = delta;
        }
        samples.push({ user, screen: id, navToSettleMs, rootRendered, jsHeapUsedBytes: metrics.heapUsedBytes, domNodes: await domNodes(page), requests });
      }
      writesByUser[user] = net.writes().map((r) => `${r.method} ${r.url}`);
    }),
  );
  const rssAfter = browserRssKb();

  const summary = WALK.map((id) => {
    const rows = samples.filter((s) => s.screen === id);
    const ms = rows.map((r) => r.navToSettleMs);
    const heapBytes = rows.map((r) => r.jsHeapUsedBytes);
    const nodes = rows.map((r) => r.domNodes);
    const gets = rows.reduce((sum, r) => sum + (r.requests.GET ?? 0), 0);
    const other = rows.reduce((sum, r) => sum + Object.entries(r.requests).filter(([m]) => m !== "GET").reduce((a, [, n]) => a + n, 0), 0);
    const writes = rows.reduce((sum, r) => sum + Object.entries(r.requests).filter(([m]) => WRITE_METHODS.has(m)).reduce((a, [, n]) => a + n, 0), 0);
    return {
      screen: id,
      samples: rows.length,
      rendered: rows.filter((r) => r.rootRendered).length,
      p50Ms: Math.round(percentile(ms, 50)),
      p95Ms: Math.round(percentile(ms, 95)),
      heapMbP50: Number(mb(percentile(heapBytes, 50))),
      heapMbMax: Number(mb(Math.max(...heapBytes))),
      domNodesP50: percentile(nodes, 50),
      domNodesMax: Math.max(...nodes),
      getRequests: gets,
      otherRequests: other,
      writes,
    };
  });

  writeJson("load-samples.json", {
    label: LABEL,
    users: USERS,
    walk: WALK,
    browserRssKb: { before: rssBefore, contextsOpened: rssOpened, after: rssAfter, method: "ps -eo pid,ppid,rss descendants of the Playwright worker" },
    summary,
    samples,
    writesByUser,
  });

  console.log(`L1 (${LABEL}) — ${USERS} contexts`);
  for (const row of summary) {
    console.log(
      `  s${row.screen}: nav→settle p50 ${row.p50Ms} ms p95 ${row.p95Ms} ms · heap p50 ${row.heapMbP50} MB max ${row.heapMbMax} MB · DOM p50 ${row.domNodesP50} max ${row.domNodesMax} · GET ${row.getRequests} other ${row.otherRequests} · writes ${row.writes} · rendered ${row.rendered}/${row.samples}`,
    );
  }
  console.log(
    `  browser RSS (best effort): before ${rssBefore ? `${(rssBefore.kb / 1024).toFixed(0)} MB/${rssBefore.processes} procs` : "n/a"} · 20 contexts open ${rssOpened ? `${(rssOpened.kb / 1024).toFixed(0)} MB/${rssOpened.processes} procs` : "n/a"} · after walk ${rssAfter ? `${(rssAfter.kb / 1024).toFixed(0)} MB/${rssAfter.processes} procs` : "n/a"}`,
  );

  await Promise.all(users.map(({ context }) => context.close()));

  for (const [user, writes] of Object.entries(writesByUser)) {
    expect.soft(writes, `${user} write requests`).toEqual([]);
  }
  expect.soft(samples.filter((s) => !s.rootRendered).map((s) => `${s.user} s${s.screen}`), "screens whose root did not render").toEqual([]);
  expect(samples).toHaveLength(USERS * WALK.length);
});
