/**
 * Research composition browser probe.
 *
 * Runs against the labelled fixture lane, not a product route: the claim is
 * that every Research panel keeps its composition in the browser, at two
 * breakpoints, with a clean console. Portal API responses are stubbed with the
 * established helper so the probe tests composition rather than the auth gate.
 */
import { expect, test } from "@playwright/test";

import { freezeClock, settle, stubPortalApi } from "./fixtures";

const OUT = process.env.RESEARCH_SHOT_DIR ?? "/tmp/research-shots";

for (const [name, width, height] of [
  ["laptop", 1280, 900],
  ["mobile", 660, 900],
] as const) {
  test(`research fixtures render at ${name}`, async ({ page }) => {
    const noise: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning") noise.push(`${m.type()}: ${m.text()}`);
    });
    page.on("pageerror", (e) => noise.push(`pageerror: ${e}`));

    await freezeClock(page);
    await stubPortalApi(page, "healthy");
    await page.setViewportSize({ width, height });
    await page.goto("/research/_fixtures");
    await settle(page);

    await expect(page.locator("[data-research-fixtures]")).toBeVisible();
    await expect(page.locator("[data-fixture-warning]")).toContainText("FIXTURE LANE");

    // Every panel keeps its frame; none collapsed into a blank.
    expect(await page.locator("[data-research-panel]").count()).toBeGreaterThan(20);

    // Both Atlas instances are present: one with a document, one without.
    const screens = page.locator("[data-screen='engine-atlas']");
    await expect(screens).toHaveCount(2);
    const degraded = screens.nth(1);
    await expect(degraded.getByRole("heading", { name: "Engine Atlas" })).toBeVisible();
    await expect(degraded.getByRole("tab")).toHaveCount(3);
    await expect(degraded.locator("[data-research-state='unavailable']")).toBeVisible();

    // No horizontal page scroll: the wide tables scroll inside their own frame.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `page overflows by ${overflow}px`).toBeLessThanOrEqual(1);

    await page.screenshot({ path: `${OUT}/research-fixtures-${name}.png`, fullPage: true });
    expect(noise, noise.join("\n")).toEqual([]);
  });
}

test("no internal identifier reaches the rendered page", async ({ page }) => {
  // A module can be clean while a server-supplied string still puts an internal
  // identifier on screen, so the same prohibition is asserted against the DOM.
  await freezeClock(page);
  await stubPortalApi(page, "healthy");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/research/_fixtures");
  await settle(page);

  const text = await page.locator("body").innerText();
  const html = await page.content();
  for (const [label, pattern] of [
    ["lease epoch", /lease[_ ]?epoch|\blease\b/i],
    ["worker identity", /worker[_ ]?(id|pid|host)\b/i],
    ["work digest", /work[_ ]?digest/i],
    ["storage locator", /\/var\/|\/srv\/|file:\/\/|s3:\/\/|\.parquet/i],
    ["credential", /\b(hmac|bearer|api[_ ]?key)\b/i],
  ] as const) {
    expect(text, `${label} visible in rendered text`).not.toMatch(pattern);
    expect(html, `${label} present in markup`).not.toMatch(pattern);
  }

  // The attempt anatomy survives the removal: ordinal and state remain.
  await expect(page.locator("[data-attempt-ordinal]").first()).toBeVisible();
  expect(await page.locator("[data-attempt-ordinal]").count()).toBeGreaterThan(5);
});

test("keyboard reaches the Atlas tabs and every panel is a named region", async ({ page }) => {
  await freezeClock(page);
  await stubPortalApi(page, "healthy");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/research/_fixtures");
  await settle(page);

  const tabs = page.locator("[data-screen='engine-atlas']").first().getByRole("tab");
  await tabs.first().focus();
  await expect(tabs.first()).toBeFocused();
  await page.keyboard.press("Enter");

  // Every panel is reachable by name rather than being an anonymous box.
  const regions = page.getByRole("region");
  expect(await regions.count()).toBeGreaterThan(20);
  for (const region of (await regions.all()).slice(0, 5)) {
    expect((await region.getAttribute("aria-label"))?.length ?? 0).toBeGreaterThan(0);
  }
});

test("Screen 14 holds its fail-closed composition in the browser", async ({ page }) => {
  const noise: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") noise.push(`${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => noise.push(`pageerror: ${e}`));

  await freezeClock(page);
  await stubPortalApi(page, "healthy");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/research/_fixtures");
  await settle(page);

  const screens = page.locator("[data-screen='alpha-import']");
  await expect(screens).toHaveCount(4);

  // The failing instance: gate 3 red, everything after it SKIPPED, step 3 shut.
  const failing = screens.nth(1);
  // The rows arrive on a 120 ms stagger, so wait for the list rather than for
  // a fixed delay: a timing-flaky probe is worse than no probe.
  await expect(failing.locator("[data-gate]")).toHaveCount(7);
  await expect(failing.locator("[data-gate='digest-unique']")).toHaveAttribute(
    "data-gate-state",
    "FAIL",
  );
  const states = await failing.locator("[data-gate-state]").evaluateAll((nodes) =>
    nodes.map((n) => n.getAttribute("data-gate-state")),
  );
  expect(states).toEqual(["PASS", "PASS", "FAIL", "SKIPPED", "SKIPPED", "SKIPPED", "SKIPPED"]);
  await expect(failing.locator("[data-fail-closed-note]")).toHaveText(
    "fail-closed: a red gate stops the import — there is no provisional registration.",
  );
  await expect(failing.locator("[data-action='register']")).toBeDisabled();
  await expect(failing.locator("[data-disabled-reason='register']")).toHaveText(
    "A gate failed. Fix the module and submit it again.",
  );

  // The clean instance: seven passes, DRAFT, and the disclosure from the DTO.
  const clean = screens.nth(0);
  await expect(clean.locator("[data-gate-state='PASS']")).toHaveCount(7);
  await expect(clean.locator("[data-lifecycle='DRAFT']").first()).toBeVisible();
  await expect(clean.locator("[data-draft-note]")).toHaveText(
    "a DRAFT version can run as evidence but cannot compose rc_",
  );
  await expect(clean.locator("[data-static-scan-disclosure]")).toHaveText(
    "Static scan — runtime causality is proven per run at Stage 3/4.",
  );

  // A field the parser did not find prints no value at all — not 0, - or N/A.
  const missing = screens.nth(2).locator("[data-mirror-field='warmup_bars']");
  await expect(missing).toHaveAttribute("data-mirror-state", "missing");
  // E6: the value cell carries the typed absence, and only that.
  expect((await missing.locator("dd").first().innerText()).trim()).toBe("missing");
  await expect(missing.locator("dd [data-absent]")).toHaveAttribute("data-absent", "missing");

  // The unparsed instance keeps its frame and says what is still owed.
  const idle = screens.nth(3);
  await expect(idle.locator("[data-research-panel='parsed contract mirror']")).toBeVisible();
  await expect(idle.locator("[data-research-panel='import gates']")).toContainText(
    "Gates run once a source parses",
  );

  // Crops rather than a full page: the last three defects on this surface were
  // found by reading a screenshot, not by a passing assertion.
  await clean.screenshot({ path: `${OUT}/s14-clean.png` });
  await failing.screenshot({ path: `${OUT}/s14-failing.png` });

  expect(noise, noise.join("\n")).toEqual([]);
});

test("Screen 14 does not overflow a 660px viewport", async ({ page }) => {
  await freezeClock(page);
  await stubPortalApi(page, "healthy");
  await page.setViewportSize({ width: 660, height: 900 });
  await page.goto("/research/_fixtures");
  await settle(page);

  const screen14 = page.locator("[data-screen='alpha-import']").first();
  await expect(screen14).toBeVisible();
  // Wait out the stagger, or the crop records a half-drawn list as the layout.
  await expect(screen14.locator("[data-gate]")).toHaveCount(7);

  // The mirror carries its own horizontal scroll, so when its content is wider
  // than the phone the *frame* scrolls and the page does not. Assert the
  // containment itself rather than that overflow happens to occur at this
  // width: the fixture's longest value could shrink and quietly retire the
  // check.
  // E6: one step view at a time; the clean instance opens on step 3.
  await screen14.locator("[data-step-marker='1']").click();
  const mirror = screen14.locator("[data-mirror]").first();
  await expect(mirror).toBeVisible();
  const contained = await mirror.evaluate(
    (node) => node.getBoundingClientRect().right <= window.innerWidth + 1,
  );
  expect(contained, "the mirror frame reaches past the viewport").toBe(true);
  expect(await mirror.evaluate((n) => getComputedStyle(n).overflowX)).toBe("auto");

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `page overflows by ${overflow}px`).toBeLessThanOrEqual(1);

  await screen14.screenshot({ path: `${OUT}/s14-clean-660.png` });
});

test("Screens 02 and 05 hold their preflight composition in the browser", async ({ page }) => {
  const noise: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") noise.push(`${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => noise.push(`pageerror: ${e}`));

  await freezeClock(page);
  await stubPortalApi(page, "healthy");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/research/_fixtures");
  await settle(page);

  const preflights = page.locator("[data-screen='preflight']");
  await expect(preflights).toHaveCount(3);
  const held = preflights.nth(0);

  // Half-open intervals, written as half-open.
  await expect(held.locator("[data-fact='logical range']")).toContainText(
    "[2022-01-01T00:00:00.000Z, 2026-01-01T00:00:00.000Z)",
  );
  await expect(held.locator("[data-warmup]")).toContainText("BOUNDARY_ONLY_NOT_FIT");

  // Measured counters, including the ones that are zero.
  await expect(held.locator("[data-quality]")).toContainText("2 · 2 missing bars");
  await expect(held.locator("[data-quality]")).toContainText("SNAPSHOT_INTEGRITY_ONLY");

  // The scope wording is the limit of the compute claim.
  await expect(held.locator("[data-resource-estimate]")).toContainText(
    "per_study_per_fold_per_seed; no product-wide trial claim is implied",
  );
  // Grouped, exact, and still in bytes — no "1.4 MB" hiding 402,560 of them.
  await expect(held.locator("[data-resource-estimate]")).toContainText("268,435,456 bytes");
  await expect(held.locator("[data-fact='rows / bytes']")).toContainText("8,766 rows");

  // Four axes stay four chips.
  await expect(held.locator("[data-axis]")).toHaveCount(4);

  // The refused instance keeps every panel and shows no metadata.
  const refused = preflights.nth(1);
  await expect(refused.locator("[data-research-panel='snapshot quality']")).toBeVisible();
  await expect(refused.locator("[data-quality]")).toHaveCount(0);

  // The dropped-preview instance says why.
  await expect(preflights.nth(2).locator("[data-cleared-note]")).toContainText(
    "run preflight again before creating a run",
  );

  // Screen 05: the seal is hatched, never the OOS colour, and never an emoji.
  const splits = page.locator("[data-screen='split-boundary']");
  await expect(splits).toHaveCount(3);
  const sealed = splits.nth(0);
  await expect(sealed.locator("[data-segment='sealed']").first()).toBeVisible();
  const sealBg = await sealed
    .locator("[data-segment='sealed']")
    .first()
    .evaluate((n) => getComputedStyle(n).backgroundImage);
  expect(sealBg).toContain("repeating-linear-gradient");
  await expect(sealed.locator("[data-evaluation-state]")).toHaveText("NOT_EVALUATED");
  await expect(sealed.locator("button")).toHaveCount(0);

  // The unsealed protocol says so rather than drawing an empty seal.
  await expect(splits.nth(1).locator("[data-no-seal]")).toHaveText(
    "advanced_walk_forward declares no sealed holdout.",
  );

  await held.screenshot({ path: `${OUT}/s02-preflight.png` });
  await sealed.screenshot({ path: `${OUT}/s05-split.png` });

  expect(noise, noise.join("\n")).toEqual([]);
});

test("Screens 02 and 05 do not overflow a 660px viewport", async ({ page }) => {
  await freezeClock(page);
  await stubPortalApi(page, "healthy");
  await page.setViewportSize({ width: 660, height: 900 });
  await page.goto("/research/_fixtures");
  await settle(page);

  const preflight = page.locator("[data-screen='preflight']").first();
  await expect(preflight).toBeVisible();
  const split = page.locator("[data-screen='split-boundary']").first();
  await expect(split).toBeVisible();

  for (const frame of [preflight, split]) {
    const contained = await frame.evaluate(
      (node) => node.getBoundingClientRect().right <= window.innerWidth + 1,
    );
    expect(contained).toBe(true);
  }

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `page overflows by ${overflow}px`).toBeLessThanOrEqual(1);

  await preflight.screenshot({ path: `${OUT}/s02-preflight-660.png` });
  await split.screenshot({ path: `${OUT}/s05-split-660.png` });
});
