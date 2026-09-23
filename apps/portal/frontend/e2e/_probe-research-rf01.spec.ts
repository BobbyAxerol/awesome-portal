/**
 * RF-01 browser receipt — the cross-cutting truth fixes, as a reader meets them.
 *
 * Each block is a finding from AUDIT_P01_P05_CLAUDE_2026-09-23.md that only a
 * browser settles: a retry that is actually on screen (F-02), a 401 that leads
 * to sign-in (F-03), a denial that confirms nothing (F-04), server text kept
 * out of the headline (F-05), one cursor codec that neither drops nor hides a
 * key (F-01), and retained tables drawn through ArtifactPanel (F-07/B-03).
 *
 * Routes are answered by the repository's stubs; each test overrides only the
 * one read it is about.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

import { freezeClock, settle, stubPortalApi } from "./fixtures";

const OUT = process.env.RESEARCH_SHOT_DIR ?? "/tmp/research-shots";

const RUN_PROGRESS = "/research/quantbt/runs/run_01HZQ7PROBE/progress";
const EVIDENCE = "/research/quantbt/runs/R-WFO-118/evidence";
const SPLIT = "/research/quantbt/runs/R-WFO-118/split";
const ATLAS = "/research/quantbt/atlas";
const JOURNEY = "/research/quantbt/journey";

const VIEWPORTS = [
  ["laptop", 1280, 900],
  ["mobile", 660, 900],
] as const;

function recorder(page: Page) {
  const noise: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") noise.push(`${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => noise.push(`pageerror: ${e}`));
  return noise;
}

/**
 * The refusal each test provokes logs one resource error before any
 * application code runs; so does the fixture run's typed 404 on the
 * retained-source lane (the same line `_probe-research-product` names). Those
 * are the refusals working. Anything else still fails the test.
 */
function withoutResourceErrors(noise: string[]): string[] {
  return noise.filter((line) => !/^error: Failed to load resource: the server responded with a status of (401|403|404|503) /.test(line));
}

async function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

function problem(status: number, code: string, message: string) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify({ error: { code, message }, request_id: `rq-rf01-${status}` }),
  };
}

const HERE = dirname(fileURLToPath(import.meta.url));

const progressRead = JSON.parse(
  readFileSync(join(HERE, "research-foundation", "progress-read.json"), "utf8"),
) as Record<string, unknown>;

const RETAINED = [
  ["equity", "SEALED", 1789836582123],
  ["folds", "CORRUPT", 1789836582123],
  ["trades", "MISSING", 1789836582123],
  ["trials", "PENDING", null],
  ["oos_samples", "WRITING", null],
  ["search_ledger", "ABORTED", null],
].map(([table_kind, state, sealed]) => ({
  table_kind,
  state,
  // An unsealed row carries the authority's zero defaults, not totals.
  total_rows: sealed === null ? "0" : "9007199254740993",
  total_bytes: sealed === null ? "0" : "1048576",
  sealed_at_utc_ms: sealed,
  reader_href: null,
}));

for (const [name, width, height] of VIEWPORTS) {
  test(`RF01-F6 S03 draws the six authority states through ArtifactPanel at ${name}`, async ({ page }) => {
    const noise = recorder(page);
    await freezeClock(page);
    await stubPortalApi(page, "healthy");
    await page.route("**/api/v1/research/runs/*/progress*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...progressRead, retained_artifacts: RETAINED }),
      }),
    );
    await page.setViewportSize({ width, height });
    await page.goto(RUN_PROGRESS);
    await settle(page);

    const tables = page.locator("[data-retained-tables]");
    await expect(tables).toBeVisible();
    for (const state of ["SEALED", "CORRUPT", "MISSING", "PENDING", "WRITING", "ABORTED"]) {
      await expect(tables.locator(`[data-artifact-state='${state}']`)).toHaveCount(1);
    }
    await expect(tables).toContainText("9007199254740993");
    await expect(tables.locator("a, button")).toHaveCount(0);
    // The bundle strip is still its own list.
    await expect(page.locator("[data-artifact]")).toHaveCount(3);

    expect(await overflow(page), "horizontal overflow").toBeLessThanOrEqual(1);
    await tables.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT}/rf01-s03-retained-${name}.png`, fullPage: true });
    expect(noise, noise.join("\n")).toEqual([]);
  });

  test(`RF01-F2 S05 on 503 offers a retry that works at ${name}`, async ({ page }) => {
    const noise = recorder(page);
    await freezeClock(page);
    await stubPortalApi(page, "healthy");
    let refuse = true;
    await page.route(/\/api\/v1\/quantbt\/runs\/[^/]+\/split(\?.*)?$/, (route) =>
      refuse
        ? route.fulfill(problem(503, "RESEARCH_SPLIT_UNAVAILABLE", "upstream split reader timed out after 5000 ms"))
        : route.fallback(),
    );
    await page.setViewportSize({ width, height });
    await page.goto(SPLIT);
    await settle(page);

    const panel = page.locator("[data-research-panel][data-state='unavailable']").first();
    await expect(panel).toBeVisible();
    // Fixed copy on screen; the server's sentence only inside details.
    await expect(panel.locator("[data-research-state]")).toContainText("The Research service did not answer. Try again.");
    const details = panel.locator("[data-research-detail]");
    await expect(details).toHaveCount(1);
    await expect(details).not.toHaveAttribute("open", "");
    await expect(details).toContainText("upstream split reader timed out");

    const retry = panel.locator("[data-research-recovery] [data-action='reread']");
    await expect(retry).toBeVisible();
    await page.screenshot({ path: `${OUT}/rf01-s05-unavailable-${name}.png`, fullPage: true });

    refuse = false;
    await retry.click();
    await expect(page.locator("[data-window='outer_oos']")).toHaveCount(1);
    await expect(page.locator("[data-research-panel][data-state='unavailable']")).toHaveCount(0);
    expect(await overflow(page), "horizontal overflow").toBeLessThanOrEqual(1);
    expect(withoutResourceErrors(noise), noise.join("\n")).toEqual([]);
  });

  test(`RF01-F3 S12 on 401 hands over to sign-in and returns to the same link at ${name}`, async ({ page }) => {
    const noise = recorder(page);
    await freezeClock(page);
    await stubPortalApi(page, "healthy");
    let expired = true;
    await page.route("**/api/v1/research/quantbt/atlas*", (route) =>
      expired ? route.fulfill(problem(401, "SESSION_EXPIRED", "session cookie rejected")) : route.fallback(),
    );
    await page.setViewportSize({ width, height });
    const deepLink = `${ATLAS}#tab=modes`;
    await page.goto(deepLink);
    await settle(page);

    const frame = page.locator("[data-testid='access-problem-screen']");
    await expect(frame).toHaveAttribute("data-problem", "SESSION_EXPIRED");
    await expect(frame).toContainText("Your session has expired. Sign in again to continue.");
    await expect(frame).not.toContainText("session cookie rejected");
    await page.screenshot({ path: `${OUT}/rf01-s12-session-expired-${name}.png`, fullPage: true });

    expired = false;
    await page.getByRole("button", { name: "Sign in again" }).click();
    await expect(page.locator("[data-screen='engine-atlas']")).toBeVisible();
    expect(new URL(page.url()).pathname + new URL(page.url()).hash).toBe(deepLink);
    expect(withoutResourceErrors(noise), noise.join("\n")).toEqual([]);
  });

  test(`RF01-F1 S04 denial confirms nothing at ${name}`, async ({ page }) => {
    const noise = recorder(page);
    await freezeClock(page);
    await stubPortalApi(page, "healthy");
    await page.route(/\/api\/v1\/quantbt\/runs\/[^/]+\/evidence(\?.*)?$/, (route) =>
      route.fulfill(problem(403, "RESEARCH_EVIDENCE_FORBIDDEN", "run R-WFO-118 belongs to workspace ws_quant_desk")),
    );
    await page.setViewportSize({ width, height });
    await page.goto(EVIDENCE);
    await settle(page);

    const notice = page.locator("[data-research-state='denied']").first();
    await expect(notice).toContainText(
      "You don't have access to this in your current workspace, or it doesn't exist.",
    );
    // The reason line itself names no workspace and no owner.
    const reason = await notice.evaluate((node) =>
      [...node.querySelectorAll(":scope > span > span")].map((span) => span.textContent ?? "").slice(0, 2).join(" "),
    );
    expect(reason).not.toMatch(/ws_|belongs to|member/);
    await expect(page.locator("[data-research-recovery]")).toHaveCount(0);
    await page.screenshot({ path: `${OUT}/rf01-s04-denied-${name}.png`, fullPage: true });
    expect(withoutResourceErrors(noise), noise.join("\n")).toEqual([]);
  });
}

test("RF01-F5 S04 names a refused cursor key and keeps the keys it does not read", async ({ page }) => {
  const noise = recorder(page);
  await freezeClock(page);
  await stubPortalApi(page, "healthy");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${EVIDENCE}#stage=search&fold=2&study=s-west&pick=best&tab=metrics`);
  await settle(page);

  await expect(page.locator("[data-cursor-notice]")).toContainText("“tab”");
  const hash = new URL(page.url()).hash;
  expect(hash).toContain("stage=search");
  expect(hash).toContain("fold=2");
  expect(hash).toContain("study=s-west");
  expect(hash).toContain("pick=best");
  expect(hash).not.toContain("tab=");
  await page.screenshot({ path: `${OUT}/rf01-s04-cursor-notice.png`, fullPage: true });
  expect(noise, noise.join("\n")).toEqual([]);
});

test("RF01-F5 S00 hands its cursor to S04 through the same codec", async ({ page }) => {
  const noise = recorder(page);
  await freezeClock(page);
  await stubPortalApi(page, "healthy");
  await page.route("**/api/v1/research/journey*", async (route) => {
    const body = JSON.parse(readFileSync(join(HERE, "research-foundation", "journey.json"), "utf8")) as {
      inspection: Record<string, unknown>;
    };
    const url = new URL(route.request().url());
    const cursor: Record<string, string> = {};
    for (const key of ["stage", "fold", "study", "trial", "pick"]) {
      const value = url.searchParams.get(key);
      if (value) cursor[key] = value;
    }
    body.inspection = { ...body.inspection, cursor, codec: "p02-cursor.v2" };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${JOURNEY}?run_id=R-WFO-118&stage=freeze&fold=2&study=s-west&colour=red`);
  await settle(page);

  await expect(page.locator("[data-cursor-notice]")).toContainText("“colour”");
  const link = page.locator("[data-open-evidence]");
  await expect(link).toHaveAttribute(
    "href",
    "/research/quantbt/runs/R-WFO-118/evidence#stage=freeze&fold=2&study=s-west",
  );
  await page.screenshot({ path: `${OUT}/rf01-s00-cursor.png`, fullPage: true });
  await link.click();
  await expect(page.locator("[data-screen='evidence-flow']")).toBeVisible();
  expect(new URL(page.url()).hash).toBe("#stage=freeze&fold=2&study=s-west");
  expect(noise, noise.join("\n")).toEqual([]);
});
