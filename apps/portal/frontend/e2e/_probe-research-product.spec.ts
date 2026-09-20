/**
 * P09 browser receipt — the real product routes.
 *
 * Unlike the fixture-lane probe, this drives `/research/quantbt/journey` and
 * `/research/quantbt/atlas` as a reader reaches them: through the Portal shell,
 * with the registry and session answered by the repository's own stubs and the
 * two foundation reads answered from fixtures generated out of the descriptor
 * module and the engine catalog.
 *
 * The claims under test are the ones only a browser can settle: one shell, no
 * overflow, a clean console, keyboard reach, and reduced motion honoured.
 */
import { expect, test } from "@playwright/test";

import { freezeClock, settle, stubPortalApi } from "./fixtures";

const OUT = process.env.RESEARCH_SHOT_DIR ?? "/tmp/research-shots";

const JOURNEY = "/research/quantbt/journey";
const ATLAS = "/research/quantbt/atlas";

function recorder(page: import("@playwright/test").Page) {
  const noise: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") noise.push(`${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => noise.push(`pageerror: ${e}`));
  return noise;
}

for (const [name, width, height] of [
  ["laptop", 1280, 900],
  ["mobile", 660, 900],
] as const) {
  test(`S00 Journey Map renders on its product route at ${name}`, async ({ page }) => {
    const noise = recorder(page);
    await freezeClock(page);
    await stubPortalApi(page, "healthy");
    await page.setViewportSize({ width, height });
    await page.goto(JOURNEY);
    await settle(page);

    await expect(page.locator("[data-screen='journey-map']")).toBeVisible();
    await expect(page.getByRole("heading", { name: "QuantBT Backtest — journey map" })).toBeVisible();

    // Eight phases and fourteen cards, exactly as the descriptor declares.
    await expect(page.locator("[data-phase]")).toHaveCount(8);
    await expect(page.locator("[data-card]")).toHaveCount(14);

    // One shell: the Portal's. The screen adds no second navigation.
    await expect(page.locator(".portal-shell")).toHaveCount(1);
    await expect(page.locator("[data-screen='journey-map'] nav")).toHaveCount(0);
    await expect(page.locator("[data-screen='journey-map'] aside")).toHaveCount(0);

    // The flow arrow only means something while the cards sit side by side.
    const arrows = await page.locator("[data-arrow]:visible").count();
    if (width >= 768) {
      expect(arrows, "no flow arrows at laptop width").toBeGreaterThan(0);
    } else {
      expect(arrows, "arrows still point right while the cards stack").toBe(0);
    }

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `page overflows by ${overflow}px`).toBeLessThanOrEqual(1);

    await page.screenshot({ path: `${OUT}/s00-journey-${name}.png`, fullPage: true });
    expect(noise, noise.join("\n")).toEqual([]);
  });

  test(`S12 Engine Atlas renders on its product route at ${name}`, async ({ page }) => {
    const noise = recorder(page);
    await freezeClock(page);
    await stubPortalApi(page, "healthy");
    await page.setViewportSize({ width, height });
    await page.goto(ATLAS);
    await settle(page);

    await expect(page.locator("[data-screen='engine-atlas']")).toBeVisible();
    await expect(page.getByRole("tab")).toHaveCount(3);

    // The default tab first, so the three captures below cover all three.
    await expect(page.locator("[data-mode]")).toHaveCount(5);
    await page.screenshot({ path: `${OUT}/s12-atlas-modes-${name}.png`, fullPage: true });

    // 14 routes and 5 modes are source facts, not a copied list.
    await page.getByRole("tab", { name: /routes/i }).click();
    await expect(page.locator("[data-route]")).toHaveCount(14);
    await page.getByRole("tab", { name: /modes/i }).click();
    await expect(page.locator("[data-mode]")).toHaveCount(5);
    await page.getByRole("tab", { name: /claims/i }).click();
    await expect(page.locator("[data-contract]")).toHaveCount(7);

    /* The contract's honest limit must be readable where it sits. As a fourth
       fixed column it needed a 980px table and ended up behind a horizontal
       scrollbar at 1280 — found by reading the screenshot, not by a passing
       assertion. */
    const clipped = await page.locator("[data-never-claims]").first().evaluate((node) => {
      const box = node.getBoundingClientRect();
      const panel = node.closest("[data-research-panel]") ?? document.body;
      return box.right > panel.getBoundingClientRect().right + 1;
    });
    expect(clipped, "the never-claims limit is clipped by its panel").toBe(false);
    // Nothing on this screen hides a fact behind a sideways scrollbar.
    const sideways = await page
      .locator("[data-screen='engine-atlas'] *")
      .evaluateAll((nodes) => nodes.filter((n) => n.scrollWidth - n.clientWidth > 1).length);
    expect(sideways, `${sideways} elements need sideways scroll`).toBe(0);

    await page.screenshot({ path: `${OUT}/s12-atlas-claims-${name}.png`, fullPage: true });
    await page.getByRole("tab", { name: /routes/i }).click();
    await expect(page.locator("[data-route]")).toHaveCount(14);

    /* Every refusal reason and input class must be readable where it sits. The
       routes table had the same clipping as the claims table and the fixture
       lane could not show it, because the lane has no sidebar. */
    for (const selector of ["[data-route-reason]", "[data-input-class]"]) {
      const overflowing = await page.locator(selector).evaluateAll((nodes) =>
        nodes.filter((node) => {
          const panel = node.closest("[data-research-panel]");
          if (!panel) return false;
          return node.getBoundingClientRect().right > panel.getBoundingClientRect().right + 1;
        }).length,
      );
      expect(overflowing, `${selector}: ${overflowing} clipped`).toBe(0);
    }

    await page.screenshot({ path: `${OUT}/s12-atlas-routes-${name}.png`, fullPage: true });

    await expect(page.locator(".portal-shell")).toHaveCount(1);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `page overflows by ${overflow}px`).toBeLessThanOrEqual(1);

    expect(noise, noise.join("\n")).toEqual([]);
  });
}

test("an unrouted card is drawn and says so", async ({ page }) => {
  await freezeClock(page);
  await stubPortalApi(page, "healthy");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(JOURNEY);
  await settle(page);

  // `alpha_import` is AVAILABLE server-side but this build serves no route for
  // it, so the card is present and honest rather than missing.
  const card = page.locator("[data-card='alpha-import']");
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("data-card-availability", "AVAILABLE");
  await expect(card).toHaveAttribute("data-card-unreachable", "NOT ROUTED");
  expect(await card.evaluate((n) => n.tagName)).not.toBe("A");

  // A reachable card is a real link resolved through the owned map.
  const atlasCard = page.locator("[data-card='engine-atlas']");
  await expect(atlasCard).toHaveAttribute("href", ATLAS);

  // No descriptor value became a URL: every href is a same-origin path.
  const hrefs = await page
    .locator("[data-screen='journey-map'] a[href]")
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("href")));
  for (const href of hrefs) expect(href).toMatch(/^\/(?!\/)/);
});

test("a journey deep link inspects and never dispatches", async ({ page }) => {
  const noise = recorder(page);
  await freezeClock(page);
  await stubPortalApi(page, "healthy");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${JOURNEY}?run_id=r_1&study=s_2&pick=p_9`);
  await settle(page);

  await expect(page.locator("[data-pick-effect]")).toHaveText("INSPECTION_ONLY");
  // Nothing on the screen can promote, select or dispatch.
  await expect(page.locator("[data-screen='journey-map'] button")).toHaveCount(0);
  await expect(page.locator("[data-screen='journey-map'] form")).toHaveCount(0);
  expect(noise, noise.join("\n")).toEqual([]);
});

test("a historical selection says it cannot run", async ({ page }) => {
  await freezeClock(page);
  await stubPortalApi(page, "healthy");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${ATLAS}?release_id=er_quantbt_108`);
  await settle(page);

  await expect(page.locator("[data-selected-release]")).toHaveAttribute(
    "data-selected-kind",
    "HISTORICAL",
  );
  await expect(page.locator("[data-historical-note]")).toHaveText(
    "Historical identity retained — this release is not installed and cannot run.",
  );
});

test("the Atlas tabs are reachable by keyboard", async ({ page }) => {
  await freezeClock(page);
  await stubPortalApi(page, "healthy");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(ATLAS);
  await settle(page);

  const tabs = page.getByRole("tab");
  await tabs.first().focus();
  await expect(tabs.first()).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-screen='engine-atlas']")).toBeVisible();

  // Every panel is a named region rather than an anonymous box.
  const regions = page.getByRole("region");
  expect(await regions.count()).toBeGreaterThan(0);
  for (const region of await regions.all()) {
    expect((await region.getAttribute("aria-label"))?.length ?? 0).toBeGreaterThan(0);
  }
});

test("reduced motion is honoured on both product routes", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const noise = recorder(page);
  await freezeClock(page);
  await stubPortalApi(page, "healthy");
  await page.setViewportSize({ width: 1280, height: 900 });

  for (const path of [JOURNEY, ATLAS]) {
    await page.goto(path);
    await settle(page);
    /* The global rule collapses every duration to 0.01ms rather than to zero,
       which is the standard way to keep transition-end events firing. So the
       claim under test is that nothing still *moves* — a duration above a
       millisecond — not that the computed value is literally `0s`. Checking
       for zero was the first version of this assertion and it flagged 483
       elements that were already honouring the preference. */
    const moving = await page.evaluate(() =>
      Array.from(document.querySelectorAll("*"))
        .map((node) => {
          const style = getComputedStyle(node);
          const longest = (value: string) =>
            Math.max(0, ...value.split(",").map((part) => Number.parseFloat(part) || 0));
          return Math.max(longest(style.animationDuration), longest(style.transitionDuration));
        })
        .filter((seconds) => seconds > 0.001).length,
    );
    expect(moving, `${path} keeps ${moving} animated elements under reduced motion`).toBe(0);
  }
  expect(noise, noise.join("\n")).toEqual([]);
});
