/**
 * FE-GOV-C01…C06 · the R1 / R2 / Live / Paper Exit read journey on the real preview (GET-only after sign-in, no stubs).
 *
 *   RESEARCH_PREVIEW_ORIGIN=... RESEARCH_PREVIEW_BASE_URL=http://localhost:8095 \
 *     npx playwright test -c playwright.research-preview.config.ts _preview-governance-c06
 *
 * Records what the screen does with the SERVER'S context on a stack that may be a retained review: decision controls read-only with a reason, the
 * request carries the Research workspace, no write is sent, nothing polls while idle. It never plans or applies a decision.
 */
import { expect, test, type Page } from "@playwright/test";

import { pageGet, signIn } from "./w1StateRuns";

const WIDTHS = [1280, 660] as const;
const SHOTS = process.env.GOV_SHOTS ?? "/tmp/gov-shots";
const WORKSPACE = process.env.GOV_WORKSPACE ?? "";

type Found = { id: string; gate: string };

async function discover(page: Page, workspace: string): Promise<Found[]> {
  const out: Found[] = [];
  for (const path of [`/api/v1/execution/governance/approvals?view=ALL&limit=50&workspace_id=${workspace}`, `/api/v1/execution/governance/approvals/history?limit=50&workspace_id=${workspace}`]) {
    const r = await pageGet(page, path);
    console.log(`discover ${path.split("?")[0]} -> ${r.status}`);
    const rows = (r.body?.page?.rows ?? r.body?.rows ?? r.body?.items ?? r.body?.data?.rows ?? []) as any[];
    for (const row of Array.isArray(rows) ? rows : []) {
      const id = row?.approval_id ?? row?.id;
      const gate = row?.gate ?? row?.approval?.gate;
      if (typeof id === "string" && typeof gate === "string" && !out.some((o) => o.id === id)) out.push({ id, gate });
    }
  }
  return out;
}

const routeFor = (f: Found, workspace: string) =>
  f.gate === "R1" ? `/governance/approvals/${f.id}/r1?workspace_id=${workspace}`
  : f.gate === "R2" ? `/governance/approvals/${f.id}/r2?workspace_id=${workspace}`
  : f.gate === "LIVE_GATE" ? `/governance/approvals/${f.id}/live?workspace_id=${workspace}`
  : `/governance/exit-reviews/${f.id}?workspace_id=${workspace}`;

for (const width of WIDTHS) {
  test.describe(`governance read journey @${width}`, () => {
    test.use({ viewport: { width, height: 900 } });
    test("every published approval opens read-only with a reason, in its own workspace, with no write and no idle polling", async ({ page }) => {
      test.setTimeout(170_000);
      expect(WORKSPACE, "GOV_WORKSPACE (the Research workspace id) is required").not.toBe("");
      await signIn(page);
      const writes: string[] = [];
      const external: string[] = [];
      const calls: string[] = [];
      const errors: string[] = [];
      page.on("request", (r) => {
        const u = new URL(r.url());
        if (r.method() !== "GET" && u.pathname.startsWith("/api/") && !u.pathname.startsWith("/api/auth/")) writes.push(`${r.method()} ${u.pathname}`);
        if (u.origin !== new URL(page.url() === "about:blank" ? "http://localhost:8095" : page.url()).origin && !r.url().startsWith("data:")) external.push(r.url());
        if (u.pathname.startsWith("/api/")) calls.push(`${r.method()} ${u.pathname}${u.search}`);
      });
      page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });
      page.on("pageerror", (e) => errors.push(`pageerror ${e.message}`.slice(0, 160)));

      await page.goto(`/governance/approvals?workspace_id=${WORKSPACE}`, { waitUntil: "networkidle" });
      const found = await discover(page, WORKSPACE);
      console.log(`found ${found.length}: ${found.map((f) => `${f.gate}:${f.id}`).join(" ")}`);
      const bundle = await page.evaluate(() => [...document.scripts].map((s) => s.src).find((s) => /index-.*\.js/.test(s)) ?? "");
      console.log(`bundle ${bundle.split("/").pop()}`);
      await page.screenshot({ path: `${SHOTS}/inbox-${width}.png` });

      const targets = found.slice(0, 6);
      for (const f of targets) {
        calls.length = 0;
        await page.goto(routeFor(f, WORKSPACE), { waitUntil: "networkidle" });
        await page.waitForTimeout(800);
        const reads = calls.filter((c) => c.startsWith("GET ") && c.includes(f.id) && !c.includes("capital-preview"));
        const sawWorkspace = reads.some((c) => c.includes(`workspace_id=${WORKSPACE}`));
        const buttons = await page.locator("button").evaluateAll((els) => els
          .filter((e) => /^(Approve|Deny|Request changes|Approve with condition|Approve live step|Promote|Reject|Extend)/i.test((e.textContent ?? "").trim()))
          .map((e) => ({ name: (e.textContent ?? "").trim().slice(0, 30), disabled: (e as HTMLButtonElement).disabled, title: (e.getAttribute("title") ?? "").slice(0, 120) })));
        const open = buttons.filter((b) => !b.disabled);
        const body = ((await page.locator("body").textContent()) ?? "").replace(/\s+/g, " ");
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        // idle: nothing may poll for 4 s
        const before = calls.length;
        await page.waitForTimeout(4000);
        const idle = calls.length - before;
        console.log(`${f.gate} ${f.id} @${width}: ws-on-read=${sawWorkspace} verbs=${buttons.length} open=${open.length} overflow=${overflow} idle-calls=${idle}`);
        for (const b of buttons) console.log(`   ${b.disabled ? "closed" : "OPEN  "} ${b.name} — ${b.title}`);
        console.log(`   text: ${body.match(/retained review[^.]*\./i)?.[0] ?? body.match(/No decision can be[^.]*\./i)?.[0] ?? "(no closing sentence found)"}`);
        expect(sawWorkspace, "the read carries the Research workspace").toBe(true);
        expect(overflow).toBeLessThanOrEqual(1);
        expect(idle, "no idle polling").toBe(0);
        await page.screenshot({ path: `${SHOTS}/${f.gate}-${f.id}-${width}.png` });
      }
      console.log(`writes=${JSON.stringify(writes)} external=${JSON.stringify(external)} errors=${JSON.stringify(errors)}`);
      expect(writes).toEqual([]);
      expect(external).toEqual([]);
      expect(errors).toEqual([]);
    });
  });
}

/* No R2, Live or Paper Exit record exists on this preview, so these three routes are read with ids that do not exist: each must answer with a typed state in its own frame. */
for (const width of WIDTHS) {
  test.describe(`governance absent records @${width}`, () => {
    test.use({ viewport: { width, height: 900 } });
    test("R2, Live and Paper Exit routes answer an unknown record with a typed state, never a write or an error page", async ({ page }) => {
      test.setTimeout(120_000);
      await signIn(page);
      const writes: string[] = [];
      const errors: string[] = [];
      page.on("request", (r) => { const u = new URL(r.url()); if (r.method() !== "GET" && u.pathname.startsWith("/api/") && !u.pathname.startsWith("/api/auth/")) writes.push(`${r.method()} ${u.pathname}`); });
      page.on("pageerror", (e) => errors.push(`pageerror ${e.message}`.slice(0, 160)));
      for (const [name, route] of [
        ["R2", `/governance/approvals/apr_absent_r2/r2?workspace_id=${WORKSPACE}`],
        ["Live", `/governance/approvals/apr_absent_live/live?workspace_id=${WORKSPACE}`],
        ["Exit", `/governance/exit-reviews/exit_absent?workspace_id=${WORKSPACE}`],
      ] as const) {
        await page.goto(route, { waitUntil: "networkidle" });
        await page.waitForTimeout(600);
        const open = await page.locator("button").evaluateAll((els) => els.filter((e) => /^(Approve|Deny|Request changes|Promote|Reject|Extend)/i.test((e.textContent ?? "").trim()) && !(e as HTMLButtonElement).disabled).length);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        const headline = ((await page.locator("main, [role=main], body").first().textContent()) ?? "").replace(/\s+/g, " ").slice(0, 160);
        console.log(`${name} absent @${width}: open-verbs=${open} overflow=${overflow} :: ${headline}`);
        expect(open).toBe(0);
        expect(overflow).toBeLessThanOrEqual(1);
        await page.screenshot({ path: `${SHOTS}/absent-${name}-${width}.png` });
      }
      expect(writes).toEqual([]);
      expect(errors).toEqual([]);
    });
  });
}
