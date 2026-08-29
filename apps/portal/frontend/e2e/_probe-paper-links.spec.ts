// Scratch harness — NOT a gate. Lists every link on the three Paper screens and
// says whether the route resolves to a screen or to the registry's not-found.
import { test, expect } from "@playwright/test";
import { freezeClock, settle, stubPortalApi, usePreferences } from "./fixtures";

const ROUTES: [string, string][] = [
  ["paper", "/deployments/paper/dep_74"],
  ["vnm", "/deployments/paper/dep_102/vn-market"],
  ["exit", "/governance/exit-reviews/EX-771"],
];

test("paper link map", async ({ page }) => {
  // This diagnostic intentionally visits every internal link on three dense
  // screens. It normally completes in about a minute in isolation, but shares
  // four browser workers in the full visual suite; keep its bound explicit so
  // host load cannot turn a clean link map into a false timeout.
  test.setTimeout(180_000);
  await freezeClock(page); await usePreferences(page, "operations"); await stubPortalApi(page, "healthy");
  await page.setViewportSize({ width: 1440, height: 900 });
  const out: string[] = [];
  for (const [name, route] of ROUTES) {
    await page.goto(route); await settle(page);
    const hrefs: string[] = await page.evaluate(() =>
      [...new Set([...document.querySelectorAll<HTMLAnchorElement>("main a[href], [data-group] a[href], a[href]")]
        .map((a) => a.getAttribute("href") ?? "")
        .filter((h) => h.startsWith("/")))],
    );
    for (const href of hrefs) {
      await page.goto(href); await settle(page);
      const dead = await page.evaluate(() => document.body.textContent?.includes("No feature in the current registry claims this route") ?? false);
      const h1 = await page.evaluate(() => document.querySelector("h1, [role='heading'][aria-level='1']")?.textContent?.trim().slice(0, 44) ?? "(no heading)");
      out.push(`${name.padEnd(6)} ${dead ? "DEAD  " : "ok    "} ${href.padEnd(52)} ${h1}`);
    }
    await page.goto(route); await settle(page);
  }
  console.log("\n" + out.join("\n"));
  expect(out.filter((l) => l.includes("DEAD"))).toEqual([]);
});
