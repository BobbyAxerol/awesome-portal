/**
 * Ad-hoc screenshots of the Execution fixture page, for showing the owner.
 *
 * Deliberately NOT a spec: it must never join the 101-snapshot baseline, whose
 * value comes from being a fixed set that only changes on purpose. This just
 * drives the same preview build and writes PNGs.
 *
 *   PORTAL_URL=http://127.0.0.1:4174 OUT=/tmp/shots node e2e/shots.mjs
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

import { freezeClock, settle, stubPortalApi, usePreferences } from "./fixtures.ts";

const BASE = process.env.PORTAL_URL ?? "http://127.0.0.1:4174";
const OUT = process.env.OUT ?? "e2e/shots";
mkdirSync(OUT, { recursive: true });

// Section headings on the fixture page, matched loosely so a reworded note
// does not silently produce an empty image.
const SECTIONS = process.env.SECTIONS
  ? process.env.SECTIONS.split("|")
  : ["Phase 1 — Approval Inbox", "Phase 2 — Gate R1", "Phase 3 — Gate R2", "Phase 5 — Paper Exit", "Wired flow"];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 2 });
await freezeClock(page);
await stubPortalApi(page, "healthy");
await usePreferences(page, "research");
await page.goto(`${BASE}/execution/_fixtures`, { waitUntil: "networkidle" });
await settle(page);

await page.screenshot({ path: `${OUT}/00-full.png`, fullPage: true });

for (const [i, heading] of SECTIONS.entries()) {
  const group = page
    .locator(".exec-fixtures-group")
    .filter({ has: page.getByText(heading, { exact: false }) })
    .first();
  if ((await group.count()) === 0) {
    console.error(`no group matched: ${heading}`);
    continue;
  }
  await group.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  const slug = heading.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  await group.screenshot({ path: `${OUT}/${String(i + 1).padStart(2, "0")}-${slug}.png` });
  console.log(`shot: ${slug}`);
}

await browser.close();
