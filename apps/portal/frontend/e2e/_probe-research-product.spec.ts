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
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

import { freezeClock, settle, stubPortalApi } from "./fixtures";

const OUT = process.env.RESEARCH_SHOT_DIR ?? "/tmp/research-shots";

const JOURNEY = "/research/quantbt/journey";
const ATLAS = "/research/quantbt/atlas";
const NEW_RUN = "/research/quantbt/runs/new";
const ALPHA_IMPORT = "/research/quantbt/alpha-import";

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
    const journeyV2 = JSON.parse(readFileSync(resolve(
      process.cwd(),
      "../../../packages/contracts/fixtures/research-foundation.journey-v2.valid.json",
    ), "utf8")) as { descriptor: { phases: { cards: unknown[] }[] } };
    await page.route("**/api/v1/research/journey*", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(journeyV2),
    }));
    await page.goto(JOURNEY);
    await settle(page);

    await expect(page.locator("[data-screen='journey-map']")).toBeVisible();
    await expect(page.getByRole("heading", { name: "QuantBT Backtest — journey map" })).toBeVisible();

    // All cards in the canonical v2 descriptor, not the stale P09 v1 stub.
    await expect(page.locator("[data-phase]")).toHaveCount(8);
    await expect(page.locator("[data-card]")).toHaveCount(journeyV2.descriptor.phases.reduce((n, phase) => n + phase.cards.length, 0));

    // One shell: the Portal's. The screen adds no second navigation.
    await expect(page.locator(".portal-shell")).toHaveCount(1);
    await expect(page.locator("[data-screen='journey-map'] nav")).toHaveCount(0);
    await expect(page.locator("[data-screen='journey-map'] aside")).toHaveCount(0);

    // At 660 px two short cards still sit side by side: keep the flow cue.
    const arrows = await page.locator("[data-arrow]:visible").count();
    expect(arrows, `no flow arrows at ${width}px`).toBeGreaterThan(0);

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

  // `alpha_import` is now routed (`FD-P09-02` resolved), so the card is a link.
  const card = page.locator("[data-card='alpha-import']");
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("href", ALPHA_IMPORT);

  // `preflight` is still AVAILABLE server-side with no screen of its own — a
  // preflight is declared inside Screen 02. The card stays drawn and honest.
  const unrouted = page.locator("[data-card='preflight']");
  await expect(unrouted).toBeVisible();
  await expect(unrouted).toHaveAttribute("data-card-availability", "AVAILABLE");
  await expect(unrouted).toHaveAttribute("data-card-unreachable", "NOT ROUTED");
  expect(await unrouted.evaluate((n) => n.tagName)).not.toBe("A");

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


for (const [name, width] of [
  ["laptop", 1280],
  ["mobile", 660],
] as const) {
  test(`S02 New Run renders all eight steps on its product route at ${name}`, async ({ page }) => {
    const noise = recorder(page);
    await freezeClock(page);
    await stubPortalApi(page, "healthy");
    await page.setViewportSize({ width, height: 900 });
    await page.goto(NEW_RUN);
    await settle(page);

    await expect(page.locator("[data-screen='new-run']")).toBeVisible();
    await expect(page.locator("[data-step-pill]")).toHaveCount(8);

    /* All eight are actually on screen, not eight in the DOM with two behind a
       scrollbar — a wizard whose first step is invisible reads as one that
       starts at step three. */
    const hidden = await page.locator("[data-step-pill]").evaluateAll((nodes) =>
      nodes.filter((node) => {
        const bar = node.parentElement!.getBoundingClientRect();
        const box = node.getBoundingClientRect();
        return box.left < bar.left - 1 || box.right > bar.right + 1;
      }).length,
    );
    expect(hidden, `${hidden} step pills are clipped by the wizard bar`).toBe(0);
    // One shell, the Portal's.
    await expect(page.locator(".portal-shell")).toHaveCount(1);

    // The route grid is the installed release's, read from the Atlas.
    await page.locator("[data-step-pill='route']").click();
    await expect(page.locator("[data-route-card]")).toHaveCount(14);
    /* A route the release will not admit is shown with the engine's own
       reason. The expected string comes from the manifest rather than from
       this file: asserting a remembered sentence would pass while the screen
       printed a different one. */
    const manifest = (await page.evaluate(async () => {
      const response = await fetch("/api/v1/research/quantbt/atlas");
      return response.json();
    })) as { atlas: { routes: { route_id: string; reason: string; axes: { admission: string } }[] } };
    const blocked = manifest.atlas.routes.find((r) => r.axes.admission !== "P04_BASELINE_ONLY")!;
    const deferred = page.locator(`[data-route-card='${blocked.route_id}']`);
    await expect(deferred).toBeDisabled();
    expect(await deferred.getAttribute("title")).toBe(blocked.reason);
    await expect(deferred).toContainText(blocked.reason);

    // Every step opens and reports its own problems where they can be fixed.
    for (const step of ["context", "strategy", "data", "windows", "parameters", "optimization", "review"]) {
      await page.locator(`[data-step-pill='${step}']`).click();
      await expect(page.locator(`[data-step-pill='${step}']`)).toHaveAttribute("aria-selected", "true");
    }

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `page overflows by ${overflow}px`).toBeLessThanOrEqual(1);

    await page.screenshot({ path: `${OUT}/s02-new-run-${name}.png`, fullPage: true });
    expect(noise, noise.join("\n")).toEqual([]);
  });
}

test("S02 declares, previews and creates a run through the real routes", async ({ page }) => {
  const noise = recorder(page);
  const sent: { url: string; body: unknown }[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/api/v1/research/")) {
      sent.push({ url: request.url(), body: JSON.parse(request.postData() ?? "{}") });
    }
  });

  await freezeClock(page);
  await stubPortalApi(page, "healthy");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(NEW_RUN);
  await settle(page);

  // Fill the declaration through the form the reader uses.
  await page.locator("[data-step-pill='context']").click();
  await page.getByLabel("Alpha", { exact: true }).selectOption("delta-rsi-polynomial-alpha");
  await page.getByLabel("Alpha version").selectOption("av_delta_rsi_polynomial_alpha_1_0_0");
  await page.locator("[data-step-pill='strategy']").click();
  await expect(page.getByLabel("Strategy id")).toHaveValue("delta-rsi-polynomial-alpha");
  await expect(page.getByLabel("Strategy id")).toHaveAttribute("readonly", "");
  await page.locator("[data-step-pill='data']").click();
  await page.getByLabel("Dataset").fill("ds_btcusdt_4h");
  await page.getByLabel("Symbol").fill("BTCUSDT");
  await page.locator("[data-step-pill='windows']").click();
  for (const [label, value] of [
    ["IS start", "2022-01-01T00:00"],
    ["IS end exclusive", "2024-01-01T00:00"],
    ["OOS start", "2024-01-01T00:00"],
    ["OOS end exclusive", "2025-01-01T00:00"],
    ["Holdout start", "2025-01-01T00:00"],
    ["Holdout end exclusive", "2026-01-01T00:00"],
  ] as const) {
    await page.getByLabel(label).fill(value);
  }
  await page.locator("[data-step-pill='optimization']").click();
  await page.getByLabel("Optuna trials").fill("400");
  await page.getByLabel("Random seed").fill("42");

  await page.locator("[data-step-pill='review']").click();
  await expect(page.locator("[data-blocking]")).toHaveCount(0);

  await page.locator("[data-action='preflight']").click();
  await expect(page.locator("[data-may-create]")).toHaveAttribute("data-may-create", "true");

  await page.locator("[data-action='create-run']").click();
  await expect(page.locator("[data-created]")).toHaveAttribute("data-created", "run_01HZQ7PROBE");

  // The preflight and the create carried the identical requested spec.
  // The release the form was declared against travels with the spec.
  const spec = (createCallSpec: Record<string, unknown>) =>
    (createCallSpec.requested_spec as Record<string, unknown>).client as Record<string, unknown>;

  const preflightCall = sent.find((r) => r.url.includes("/preflights"))!;
  const createCall = sent.find((r) => r.url.endsWith("/research/runs"))!;
  expect(createCall.body).toMatchObject({ intent_kind: "NEW", preflight_token: "pf_01HZQ7PROBE" });
  expect((createCall.body as Record<string, unknown>).requested_spec).toEqual(
    (preflightCall.body as Record<string, unknown>).requested_spec,
  );

  expect(spec(createCall.body as Record<string, unknown>).engine_release_id).toBe("er_quantbt_111");

  // Nothing derived or private went up.
  const raw = JSON.stringify(createCall.body);
  for (const forbidden of ["effective_spec_digest", "lease_epoch", "worker_id", "adapter_id"]) {
    expect(raw, forbidden).not.toContain(forbidden);
  }

  await page.screenshot({ path: `${OUT}/s02-new-run-created.png`, fullPage: true });
  expect(noise, noise.join("\n")).toEqual([]);
});

test("S14 renders on its canonical route and keeps three authority states", async ({ page }) => {
  const noise = recorder(page);
  await freezeClock(page);
  await stubPortalApi(page, "healthy");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(ALPHA_IMPORT);
  await settle(page);

  await expect(page.locator("[data-screen='alpha-import']")).toBeVisible();
  // `S14-VIS-01`: three authority states, and Code anatomy is not a fourth.
  await expect(page.locator("[data-step-marker]")).toHaveCount(3);
  await expect(page.locator("[data-code-anatomy]")).toHaveCount(1);
  await expect(page.locator(".portal-shell")).toHaveCount(1);

  const before = await page
    .locator("[data-action]")
    .evaluateAll((nodes) => nodes.map((n) => [n.getAttribute("data-action"), (n as HTMLButtonElement).disabled]));
  await page.locator("[data-code-anatomy] summary").click();
  const after = await page
    .locator("[data-action]")
    .evaluateAll((nodes) => nodes.map((n) => [n.getAttribute("data-action"), (n as HTMLButtonElement).disabled]));
  expect(after, "opening Code anatomy changed an enablement").toEqual(before);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);

  await page.screenshot({ path: `${OUT}/s14-alpha-import-route.png`, fullPage: true });
  expect(noise, noise.join("\n")).toEqual([]);
});

test("S02 uses the typed declaration and release validators", async ({ page }) => {
  const noise = recorder(page);
  await freezeClock(page);
  await stubPortalApi(page, "healthy");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(NEW_RUN);
  await settle(page);

  /* The declaration comes from the registry read, so the validators can only
     fire once the exact bound version is found. Anything less and the screen
     must say what it could not read rather than pass silently. */
  await page.locator("[data-step-pill='context']").click();
  await page.getByLabel("Alpha", { exact: true }).selectOption("delta-rsi-polynomial-alpha");
  await page.getByLabel("Alpha version").selectOption("av_delta_rsi_polynomial_alpha_1_0_0");
  await expect(page.locator("[data-declaration-bound]")).toHaveAttribute(
    "data-declaration-bound",
    "true",
  );
  await expect(page.locator("[data-missing-constraints]")).toHaveCount(0);

  // The server pins strategy_id to alpha_id; the entrypoint remains a separate declaration fact.
  await page.locator("[data-step-pill='strategy']").click();
  await expect(page.getByLabel("Strategy id")).toHaveValue("delta-rsi-polynomial-alpha");
  await expect(page.getByLabel("Strategy id")).toHaveAttribute("readonly", "");

  // The browser offers only the bound declaration's timeframes. A disallowed
  // value remains covered by validateData's unit test and server preflight.
  await page.locator("[data-step-pill='data']").click();
  await page.getByLabel("Symbol").fill("BTCUSDT");
  await expect(page.getByLabel("Timeframe").locator("option")).toHaveText(
    ["1h", "4h"],
  );
  await page.getByLabel("Timeframe").selectOption("4h");

  // 3. the release's published ceiling, and 4. the declared seed requirement
  await page.locator("[data-step-pill='optimization']").click();
  await page.getByLabel("Optuna trials").fill("9999");
  await expect(page.locator("[data-step-card] [data-step-error]")).toHaveText(
    "The engine release publishes a ceiling of 4000 trials.",
  );
  await page.getByLabel("Optuna trials").fill("1");
  await page.getByLabel("Random seed").fill("");
  await expect(page.locator("[data-step-card] [data-step-error]")).toHaveText(
    "The strategy declares determinism.seed_required — a fixed random seed is required.",
  );

  // The declared parameter space was adopted, not invented.
  await page.locator("[data-step-pill='parameters']").click();
  await expect(page.locator("[data-parameter]")).toHaveCount(4);
  await expect(page.locator("[data-parameter='warmup_bars']")).toContainText("pinned at 120");

  await page.screenshot({ path: `${OUT}/s02-validators.png`, fullPage: true });
  expect(noise, noise.join("\n")).toEqual([]);
});

test("S02 renders the four release-default groups as locked", async ({ page }) => {
  const noise = recorder(page);
  await freezeClock(page);
  await stubPortalApi(page, "healthy");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(NEW_RUN);
  await settle(page);

  await page.locator("[data-step-pill='optimization']").click();
  const groups = await page
    .locator("[data-default-group]")
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-default-group")));
  expect(groups).toEqual(["study", "sampler", "objective", "candidate_selection"]);

  // Every field is the release's, and a locked one offers no input at all.
  const sources = await page
    .locator("[data-default-field]")
    .evaluateAll((nodes) => [...new Set(nodes.map((n) => n.getAttribute("data-value-source")))]);
  expect(sources).toEqual(["RELEASE_DEFAULT"]);
  expect(await page.locator("[data-default-field] input, [data-default-field] select").count()).toBe(0);
  expect(await page.locator("[data-override-state='LOCKED']").count()).toBeGreaterThan(0);

  // Rendering a default adds nothing to what would be serialized.
  await expect(page.locator("[data-override-summary]")).toContainText("nothing serialized");
  await expect(page.locator("[data-submission-constraints]")).toContainText("trials 1");

  await page.screenshot({ path: `${OUT}/s02-release-defaults.png`, fullPage: true });
  expect(noise, noise.join("\n")).toEqual([]);
});

const RUN_PROGRESS = "/research/quantbt/runs/run_01HZQ7PROBE/progress";

for (const [name, width] of [
  ["laptop", 1280],
  ["mobile", 660],
] as const) {
  test(`S03 Run Progress renders every block on its product route at ${name}`, async ({ page }) => {
    const noise = recorder(page);
    await freezeClock(page);
    await stubPortalApi(page, "healthy");
    await page.setViewportSize({ width, height: 900 });
    await page.goto(RUN_PROGRESS);
    await settle(page);

    await expect(page.locator("[data-screen='run-progress']")).toBeVisible();
    await expect(page.locator(".portal-shell")).toHaveCount(1);

    // Five stages, in order, and never a sixth.
    await expect(page.locator("[data-stage]")).toHaveCount(5);
    const stages = await page
      .locator("[data-stage]")
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-stage")));
    expect(stages).toEqual(["S1", "S2", "S3", "S4", "S5"]);
    await expect(page.locator("[data-stage='S3']")).toHaveAttribute("aria-disabled", "true");

    // The server's own numbers, printed and not recomputed.
    await expect(page.locator("[data-tqdm]")).toHaveText(
      "fold 07/32 · study 7 · trial 214/400 · best J₁ 1.049 · prune 12%",
    );
    await expect(page.locator("[data-budget]")).toContainText("12.500/60.000 core-min");
    await expect(page.locator("[data-fold]")).toHaveCount(3);
    await expect(page.locator("[data-artifact]")).toHaveCount(3);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `page overflows by ${overflow}px`).toBeLessThanOrEqual(1);

    await page.screenshot({ path: `${OUT}/s03-progress-${name}.png`, fullPage: true });
    expect(noise, noise.join("\n")).toEqual([]);
  });
}

test("S03 is correct on the poll floor with no stream at all", async ({ page }) => {
  const noise = recorder(page);
  await freezeClock(page);
  await stubPortalApi(page, "healthy");
  // Remove EventSource entirely: spec 03 §1.1 says the stream is an
  // accelerator and the poll is the floor, so the screen must be right without
  // it ever existing.
  await page.addInitScript(() => {
    // @ts-expect-error deliberate removal for the test
    delete window.EventSource;
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(RUN_PROGRESS);
  await settle(page);

  await expect(page.locator("[data-screen='run-progress']")).toBeVisible();
  await expect(page.locator("[data-transport]")).toHaveAttribute("data-transport", "poll");
  await expect(page.locator("[data-transport]")).toContainText("poll floor 5s");
  // A dropped stream is a dot and a label, never a banner (pitfall 5).
  expect(await page.locator("[data-screen='run-progress'] [role='alert']").count()).toBe(0);
  await expect(page.locator("[data-tqdm]")).toContainText("trial 214/400");
  expect(noise, noise.join("\n")).toEqual([]);
});

test("S03 keeps artifacts unlinked and states why", async ({ page }) => {
  await freezeClock(page);
  await stubPortalApi(page, "healthy");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(RUN_PROGRESS);
  await settle(page);

  const sealed = page.locator("[data-artifact='trials.parquet']");
  await expect(sealed).toHaveAttribute("data-artifact-state", "SEALED");
  await expect(sealed).toContainText("1.2 MB");
  // reader_href is null by contract: readiness is not authorization.
  expect(await page.locator("[data-artifacts] a").count()).toBe(0);
  await expect(page.locator("[data-artifact-no-reader]")).toBeVisible();

  // The claim is a dashed forecast while the source has not sealed.
  await expect(page.locator("[data-claim]")).toHaveAttribute("data-claim", "FORECAST");
  const border = await page.locator("[data-claim]").evaluate((n) => getComputedStyle(n).borderStyle);
  expect(border).toBe("dashed");
  await expect(page.locator("[data-readiness]")).toContainText("mandatory PENDING");
});

test("S03 console is a bounded log region, and cancel confirms once", async ({ page }) => {
  const noise = recorder(page);
  await freezeClock(page);
  await stubPortalApi(page, "healthy");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(RUN_PROGRESS);
  await settle(page);

  const box = page.locator("[data-console-box]");
  await expect(box).toHaveAttribute("role", "log");
  await expect(box).toHaveAttribute("aria-live", "polite");

  // Backfill is a bounded page keyed on after_seq, never a full history.
  const consoleCalls: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/console")) consoleCalls.push(r.url());
  });
  await page.locator("[data-action='load-older']").click();
  await expect(page.locator("[data-console-line]")).toHaveCount(3);
  expect(consoleCalls.some((u) => /after_seq=\d+/.test(u) && /limit=500/.test(u))).toBe(true);

  // Cancel is one confirm step, and there is no retry to offer.
  await page.locator("[data-action='cancel']").click();
  await expect(page.locator("[data-action='cancel-confirm']")).toBeVisible();
  await expect(page.locator("[data-retry-reason]")).toHaveText("This release does not offer retry from Run Progress.");

  await page.screenshot({ path: `${OUT}/s03-console.png`, fullPage: true });
  expect(noise, noise.join("\n")).toEqual([]);
});

test("S03 honours reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await freezeClock(page);
  await stubPortalApi(page, "healthy");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(RUN_PROGRESS);
  await settle(page);

  const moving = await page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-screen='run-progress'] *"))
      .map((node) => {
        const style = getComputedStyle(node);
        const longest = (value: string) =>
          Math.max(0, ...value.split(",").map((part) => Number.parseFloat(part) || 0));
        return Math.max(longest(style.animationDuration), longest(style.transitionDuration));
      })
      .filter((seconds) => seconds > 0.001).length,
  );
  expect(moving, `${moving} elements still animate under reduced motion`).toBe(0);
});

/* ------------------------------------------------------------------ P12 */

/*
 * S01 Run Library on `/research/quantbt/runs`.
 *
 * The fixture answers the two published operations — `GET /api/v1/quantbt/runs`
 * and its `/sparkline` — with four rows chosen so every typed state the handoff
 * names is on screen at once: a completed run with an issued certificate, a
 * running one whose claim is `PENDING_SOURCE_CALLBACK`, a failed one carrying a
 * superseded note and a different `comparison.key`, and a
 * `LEGACY_1_0_8_METADATA` row with no binding, no certificate and no key.
 */
const RUN_LIBRARY = "/research/quantbt/runs";

for (const [name, width, height] of [
  ["laptop", 1280, 900],
  ["mobile", 660, 900],
] as const) {
  test(`S01 Run Library renders every block on its product route at ${name}`, async ({ page }) => {
    const noise = recorder(page);
    await freezeClock(page);
    await stubPortalApi(page, "healthy");
    await page.setViewportSize({ width, height });
    await page.goto(RUN_LIBRARY);
    await settle(page);

    await expect(page.locator("[data-screen='run-library']")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Run library" })).toBeVisible();
    await expect(page.locator("[data-screen='run-library']")).toContainText(
      "The library renders them; it ranks nothing.",
    );

    // Header, filter bar, ledger, cards, compare-less footer: the whole
    // composition, not a subset that happens to fit.
    await expect(page.locator("[data-filter-bar]")).toBeVisible();
    await expect(page.locator("[data-counter]")).toContainText("4 of 4 runs");
    await expect(page.locator("[data-claim-ledger]")).toContainText(
      "claims · 1 issued · 1 not issued · 1 pending · 1 failed",
    );
    await expect(page.locator("[data-run]")).toHaveCount(4);
    // Five evidence cells per card — S1…S5, present even where unpublished.
    await expect(page.locator("[data-run='R-WFO-118'] [data-stage-cell]")).toHaveCount(5);
    await expect(page.locator("[data-screen='run-library']")).toContainText(
      "Nothing here is scored against anything else.",
    );

    // One shell: the Portal's. The screen adds no second navigation.
    await expect(page.locator(".portal-shell")).toHaveCount(1);
    await expect(page.locator("[data-screen='run-library'] nav")).toHaveCount(0);
    await expect(page.locator("[data-screen='run-library'] aside")).toHaveCount(0);

    // Nothing is cut off sideways at either width.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(0);

    await page.screenshot({ path: `${OUT}/s01-run-library-${name}.png`, fullPage: true });
    expect(noise, noise.join("\n")).toEqual([]);
  });
}

test("S01 says what each row withheld instead of filling it in", async ({ page }) => {
  const noise = recorder(page);
  await freezeClock(page);
  await stubPortalApi(page, "healthy");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(RUN_LIBRARY);
  await settle(page);

  // The legacy row keeps its card and states the reason; it is never dressed
  // as current engine evidence.
  const legacy = page.locator("[data-run='R-LEGACY-07']");
  await expect(legacy).toHaveAttribute("data-source-kind", "LEGACY_1_0_8_METADATA");
  // No binding chip is drawn at all — the row is not given a version it never
  // had. What stands in its place names the reason.
  await expect(legacy.locator("[data-binding]")).toHaveCount(0);
  await expect(
    legacy.locator("[data-withheld='LEGACY_METADATA_ONLY']").first(),
  ).toBeVisible();
  await expect(legacy.locator("[data-certificate]")).toHaveCount(0);

  // An unpublished metric is withheld with its reason — never 0, "-" or "N/A".
  const decay = page.locator("[data-run='R-WFO-118'] [data-metric='DECAY']");
  await expect(decay).toContainText("not published");
  await expect(decay).not.toContainText("0");
  await expect(decay.locator("[data-withheld]")).toHaveAttribute("data-withheld", "NOT_PUBLISHED");

  // A claim the source has not called back on is pending, not absent and not
  // a quiet success.
  const running = page.locator("[data-run='R-WFO-119']");
  await expect(running.locator("[data-status]")).toHaveAttribute("data-status", "RUNNING");
  await expect(running.locator("[data-claim]")).toContainText(
    "claim pending — engine issues it at Stage 5, never before",
  );
  expect(await running.locator("[data-certificate]").count()).toBe(0);

  // A derived tooltip is labelled as derived, so nobody reads it as the
  // engine's own words.
  await expect(
    page.locator("[data-run='R-WFO-118'] [data-stage-cell='S3']"),
  ).toHaveAttribute("data-tooltip-source", "DERIVED_FROM_PERSISTED_STATE");

  // `rc: null` reserves nothing.
  expect(await page.locator("[data-rc]").count()).toBe(0);
  expect(noise, noise.join("\n")).toEqual([]);
});

test("S01 keeps its filters and selection in the URL across reload and back", async ({ page }) => {
  await freezeClock(page);
  await stubPortalApi(page, "healthy");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(RUN_LIBRARY);
  await settle(page);

  await page.locator("[data-filter-status='RUNNING']").click();
  await expect(page).toHaveURL(/status=RUNNING/);

  // A reload restores the same question from the URL alone.
  await page.reload();
  await settle(page);
  await expect(page.locator("[data-filter-status='RUNNING']")).toHaveAttribute(
    "data-selected",
    "true",
  );

  // Selection is navigation and pushes; a filter is a view and replaces, so
  // back undoes the selection without walking the filter back too.
  await page.locator("[data-compare-check='R-WFO-118']").click();
  await expect(page).toHaveURL(/sel=R-WFO-118/);
  await page.goBack();
  await settle(page);
  await expect(page).toHaveURL(/status=RUNNING/);
  await expect(page).not.toHaveURL(/sel=/);
  await expect(page.locator("[data-compare-bar]")).toHaveCount(0);
});

test("S01 refuses a two-card compare across contract keys and allows it within one", async ({
  page,
}) => {
  const noise = recorder(page);
  await freezeClock(page);
  await stubPortalApi(page, "healthy");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(RUN_LIBRARY);
  await settle(page);

  await page.locator("[data-compare-check='R-WFO-118']").click();
  await expect(page.locator("[data-compare-bar]")).toHaveAttribute("data-compare-bar", "pending");

  // R-WFO-120 is ETHUSDT·1h: a different ComparisonContractKey.
  await page.locator("[data-compare-check='R-WFO-120']").click();
  await expect(page.locator("[data-compare-bar]")).toHaveAttribute("data-compare-bar", "refused");
  await expect(page.locator("[data-compare-refusal]")).toContainText("comparison lie");
  await expect(page.locator("[data-action='open-compare']")).toBeDisabled();

  // R-WFO-119 shares 118's key, so the same pair of clicks is allowed.
  await page.locator("[data-compare-check='R-WFO-120']").click();
  await page.locator("[data-compare-check='R-WFO-119']").click();
  await expect(page.locator("[data-compare-bar]")).toHaveAttribute("data-compare-bar", "ready");
  await expect(page.locator("[data-action='open-compare']")).toBeVisible();
  expect(noise, noise.join("\n")).toEqual([]);
});

test("S01 polls only visible running rows and stops when the tab is hidden", async ({ page }) => {
  const noise = recorder(page);
  await freezeClock(page);
  await stubPortalApi(page, "healthy");

  const polls: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("/api/v1/quantbt/runs") && url.includes("ids=")) polls.push(url);
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(RUN_LIBRARY);
  await settle(page);

  // One running card is visible, so one poll starts — and it carries only the
  // ids, never a filter or a cursor.
  await expect.poll(() => polls.length).toBeGreaterThan(0);
  for (const url of polls) {
    expect(url).toContain("ids=R-WFO-119");
    expect(url).not.toMatch(/[?&](status|mode|alpha|q|cursor|before)=/);
  }
  const started = polls.length;

  await page.clock.runFor(10_500);
  await expect.poll(() => polls.length).toBeGreaterThan(started);
  const beforeHidden = polls.length;

  // Hidden means hidden: no interval per card, and no asking a tab nobody is
  // looking at.
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.runFor(60_000);
  expect(polls.length, "polled while hidden").toBe(beforeHidden);

  // Leaving the route tears the interval down for good.
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  });
  await page.goto(JOURNEY);
  await settle(page);
  const afterLeaving = polls.length;
  await page.clock.runFor(60_000);
  expect(polls.length, "polled after unmount").toBe(afterLeaving);
  expect(noise, noise.join("\n")).toEqual([]);
});

test("S01 reads a sparkline only for a visible row whose series exists", async ({ page }) => {
  const noise = recorder(page);
  await freezeClock(page);
  await stubPortalApi(page, "healthy");

  const asked: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/sparkline")) asked.push(request.url());
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(RUN_LIBRARY);
  await settle(page);

  await expect.poll(() => asked.length).toBeGreaterThan(0);
  // The legacy row publishes no series, so the only possible answer would be
  // "no" — the lazy read is never sent for it.
  expect(asked.some((url) => url.includes("R-LEGACY-07"))).toBe(false);
  await expect(page.locator("[data-run='R-LEGACY-07'] [data-sparkline-placeholder]")).toHaveAttribute(
    "data-sparkline-placeholder",
    "NOT_PUBLISHED",
  );

  // Asked once per row, and never again on a re-observe.
  const once = new Set(asked.map((url) => new URL(url).pathname));
  expect(asked.length).toBe(once.size);
  await expect(page.locator("[data-run='R-WFO-118'] [data-sparkline-values]")).toHaveAttribute(
    "data-sparkline-values",
    "8",
  );
  expect(noise, noise.join("\n")).toEqual([]);
});

test("S01 is reachable and operable by keyboard", async ({ page }) => {
  await freezeClock(page);
  await stubPortalApi(page, "healthy");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(RUN_LIBRARY);
  await settle(page);

  const check = page.locator("[data-compare-check='R-WFO-118']");
  await check.focus();
  await page.keyboard.press("Space");
  await expect(page).toHaveURL(/sel=R-WFO-118/);
  await expect(check).toBeChecked();

  // The filter chips are real buttons, so they answer Enter.
  await page.locator("[data-filter-status='FAILED']").focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/status=FAILED/);

  // Every control the screen offers carries an accessible name.
  const unnamed = await page.evaluate(() => {
    const root = document.querySelector("[data-screen='run-library']");
    if (!root) return ["no screen"];
    return [...root.querySelectorAll("button, a, input")]
      .filter((el) => {
        const label =
          el.getAttribute("aria-label") ??
          el.getAttribute("title") ??
          (el.textContent ?? "").trim();
        return label.length === 0;
      })
      .map((el) => el.outerHTML.slice(0, 120));
  });
  expect(unnamed, unnamed.join("\n")).toEqual([]);
});

test("S01 groups the loaded page by alpha and says that is what it grouped", async ({ page }) => {
  const noise = recorder(page);
  await freezeClock(page);
  await stubPortalApi(page, "healthy");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(RUN_LIBRARY);
  await settle(page);

  // Off by default: the server's order stands.
  await expect(page.locator("[data-group]")).toHaveCount(0);

  await page.locator("[data-filter-group]").click();
  await expect(page).toHaveURL(/group=1/);
  // Three bindings on this page: one alpha, and the legacy row whose binding
  // was never published — which is not the same thing as scratch.
  await expect(page.locator("[data-group]")).toHaveCount(2);
  await expect(page.locator("[data-group='a:alpha_momentum_btc:av_0_9_3']")).toContainText(
    "runs below share one immutable code artifact",
  );
  await expect(page.locator("[data-group='zz:withheld']")).toContainText("binding not published");
  // A count of the page is labelled as a count of the page: with keyset
  // paging the next page may carry more of the same alpha.
  await expect(page.locator("[data-group-count]").first()).toContainText("of this page");

  // Grouping is a view, so it survives a reload and does not push history.
  await page.reload();
  await settle(page);
  await expect(page.locator("[data-group]")).toHaveCount(2);
  expect(noise, noise.join("\n")).toEqual([]);
});

test("S01 beats the pulse only for a running run and offers evidence honestly", async ({ page }) => {
  await freezeClock(page);
  await stubPortalApi(page, "healthy");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(RUN_LIBRARY);
  await settle(page);

  // One pulse, on the one running card.
  await expect(page.locator("[data-pulse]")).toHaveCount(1);
  await expect(page.locator("[data-run='R-WFO-119'] [data-pulse]")).toBeVisible();

  // The running card links to Screen 03, which exists.
  await expect(page.locator("[data-run='R-WFO-119'] [data-open]")).toHaveAttribute(
    "href",
    "/research/quantbt/runs/R-WFO-119/progress",
  );

  // P13 opened Screen 04, so a settled card links to it — the refusal this
  // test used to assert is gone because the route it named now exists.
  const evidence = page.locator("[data-run='R-WFO-118'] [data-open-evidence]");
  await expect(evidence).toHaveAttribute("href", "/research/quantbt/runs/R-WFO-118/evidence");
  await expect(page.locator("a[data-open-evidence]")).toHaveCount(3);
});

test("S01 draws the claim ledger as a bar of the families it counted", async ({ page }) => {
  await freezeClock(page);
  await stubPortalApi(page, "healthy");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(RUN_LIBRARY);
  await settle(page);

  // Four families, four counts, four segments — and no sliver for a family
  // with nothing in it.
  await expect(page.locator("[data-ledger-segment]")).toHaveCount(4);
  await expect(page.locator("[data-ledger-segment='issued']")).toHaveAttribute("title", "1 issued");
  const widths = await page
    .locator("[data-ledger-segment]")
    .evaluateAll((nodes) => nodes.map((n) => (n as HTMLElement).getBoundingClientRect().width));
  for (const width of widths) expect(width).toBeGreaterThan(0);
});

/* ------------------------------------------------------------------ P13 */

/*
 * S04 Evidence Flow hub on `/research/quantbt/runs/:runId/evidence`.
 *
 * The fixture answers the Hub, three of its four series and a typed refusal
 * from the retained-source lane, so every claim below is about what the screen
 * does with facts it was actually given: it reads only what the open tab
 * draws, it keeps one cursor across seven tabs, and it names each absence for
 * what it is.
 */
/*
 * The retained-source lane answers this fixture run with a typed 404, which
 * Chrome logs at error level before any application code sees it. That one
 * line is the refusal working, so it is named here rather than silenced: any
 * other console output still fails the test.
 */
const PASSPORT_404 = "error: Failed to load resource: the server responded with a status of 404 (Not Found)";

function withoutPassportRefusal(noise: string[]): string[] {
  return noise.filter((line) => line !== PASSPORT_404);
}

const EVIDENCE = "/research/quantbt/runs/R-WFO-118/evidence";

for (const [name, width, height] of [
  ["laptop", 1280, 1000],
  ["mobile", 660, 1000],
] as const) {
  test(`S04 Evidence hub renders every block on its product route at ${name}`, async ({ page }) => {
    const noise = recorder(page);
    await freezeClock(page);
    await stubPortalApi(page, "healthy");
    await page.setViewportSize({ width, height });
    await page.goto(EVIDENCE);
    await settle(page);

    await expect(page.locator("[data-screen='evidence-flow']")).toBeVisible();
    await expect(page.locator("[data-claim-strip]")).toHaveAttribute("data-claim-strip", "ISSUED");
    await expect(page.locator("[data-run-id]")).toHaveText("R-WFO-118");
    await expect(page.locator("[data-revision]")).toContainText("p13r1_");

    // The amendment's header facts, each on its own availability.
    await expect(page.locator("[data-run-status='READY']")).toBeVisible();
    await expect(page.locator("[data-run-identity] [data-header-value='mode']")).toContainText("mode_1_decay");
    // A selected route id is not a route contract: the contract is absent.
    await expect(page.locator("[data-header-fact='route contract'] [data-withheld]")).toHaveAttribute(
      "data-withheld",
      "NOT_PUBLISHED",
    );
    // A seed nobody selected is a real answer, not a missing one.
    await expect(page.locator("[data-header-fact='seed'] [data-withheld]")).toHaveAttribute(
      "data-withheld",
      "NOT_APPLICABLE",
    );
    // The fold selector is bounded by the folds P11 observed.
    await expect(page.locator("[data-fold-bound]")).toContainText("of 5 observed");
    await expect(page.locator("[data-fold-select] option")).toHaveCount(5);

    // Seven tabs, one selected, one panel.
    await expect(page.locator("[role='tab']")).toHaveCount(7);
    await expect(page.locator("[aria-selected='true']")).toHaveCount(1);
    await expect(page.locator("[data-panel='summary']")).toBeVisible();
    await expect(page.locator("[data-cursor-bar]")).toBeVisible();

    // Eight registry metrics, and the two the source withheld say so.
    await expect(page.locator("[data-metric]")).toHaveCount(8);
    await expect(page.locator("[data-metric-value='FINAL_EQUITY']")).toHaveText("128400.00");
    await expect(page.locator("[data-metric='BENCHMARK_RETURN_FRACTION']")).toContainText("not published");
    await expect(page.locator("[data-metric='FUNDING_TOTAL']")).toContainText("not applicable");

    // The charts the Hub published, drawn; the one it did not, named.
    await expect(page.locator("[data-series-panel='EQUITY_OOS']")).toHaveAttribute("data-series-state", "ready");
    // Equity and its underwater restatement: two panes, one response.
    await expect(page.locator("[data-chart='equity'] canvas")).toHaveCount(2);
    await expect(page.locator("[data-series-panel='RETURN_DISTRIBUTION']")).toContainText("not applicable");

    // One shell: the Portal's.
    await expect(page.locator(".portal-shell")).toHaveCount(1);
    await expect(page.locator("[data-screen='evidence-flow'] nav")).toHaveCount(0);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(0);

    await page.screenshot({ path: `${OUT}/s04-evidence-${name}.png`, fullPage: true });
    expect(withoutPassportRefusal(noise), noise.join("\n")).toEqual([]);
  });
}

test("S04 reads only the series the open tab draws", async ({ page }) => {
  const noise = recorder(page);
  await freezeClock(page);
  await stubPortalApi(page, "healthy");

  const reads: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("/evidence")) reads.push(url.replace(/^https?:\/\/[^/]+/, ""));
  });

  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(EVIDENCE);
  await settle(page);

  // The Hub, and the three series the summary tab draws. The distribution is
  // NOT_APPLICABLE, so it is never asked for: the only possible answer is no.
  await expect.poll(() => reads.filter((u) => u.includes("kind=")).length).toBe(3);
  expect(reads.some((u) => u.includes("kind=RETURN_DISTRIBUTION"))).toBe(false);
  expect(reads.filter((u) => u === "/api/v1/quantbt/runs/R-WFO-118/evidence").length).toBe(1);
  // One passport read, and it is a different operation on a different path.
  expect(reads.filter((u) => u.includes("/current-source/evidence")).length).toBe(1);

  // A tab that draws no series costs no request.
  const before = reads.length;
  await page.locator("[data-tab='claim']").click();
  await settle(page);
  await expect(page.locator("[data-panel='claim']")).toBeVisible();
  expect(reads.length, "a claim tab asked for a series").toBe(before);

  // Coming back does not re-read what is already in hand.
  await page.locator("[data-tab='summary']").click();
  await settle(page);
  expect(reads.length).toBe(before);
  expect(withoutPassportRefusal(noise), noise.join("\n")).toEqual([]);
});

test("S04 keeps one cursor across seven tabs and replaces rather than pushes", async ({ page }) => {
  await freezeClock(page);
  await stubPortalApi(page, "healthy");
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(`${EVIDENCE}#stage=execute&fold=4&trial=143&params=prm_7c1a9e`);
  await settle(page);

  // A deep link lands where it says.
  await expect(page.locator("[data-panel='execute']")).toBeVisible();
  await expect(page.locator("[data-cursor-fold]")).toContainText("fold 4");
  await expect(page.locator("[data-cursor-trial]")).toContainText("#143");

  const entries = await page.evaluate(() => history.length);
  await page.locator("[data-tab='search']").click();
  await settle(page);

  // The stage moved; nothing else did; and no history entry was spent on it.
  await expect(page).toHaveURL(/stage=search/);
  await expect(page).toHaveURL(/fold=4/);
  await expect(page).toHaveURL(/params=prm_7c1a9e/);
  await expect(page.locator("[data-carried-cursor]")).toContainText("fold=4");
  expect(await page.evaluate(() => history.length)).toBe(entries);

  // A hard refresh restores the same question from the URL alone.
  await page.reload();
  await settle(page);
  await expect(page.locator("[data-panel='search']")).toBeVisible();
  await expect(page.locator("[data-cursor-fold]")).toContainText("fold 4");
});

test("S04 says what it was never given, in the words of the state it is in", async ({ page }) => {
  const noise = recorder(page);
  await freezeClock(page);
  await stubPortalApi(page, "healthy");
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(EVIDENCE);
  await settle(page);

  // The retained-source lane refused this profile: the panel states it and the
  // rest of the hub is untouched.
  await expect(page.locator("[data-passport='refused']")).toBeVisible();
  await expect(page.locator("[data-passport-refusal]")).toContainText("does not admit");
  await expect(page.locator("[data-metrics]")).toBeVisible();

  // Panels the contract does not fill keep their frame and their reason.
  await expect(page.locator("[data-gap='per-fold-verdict']")).toBeVisible();
  await expect(page.locator("[data-gap='behavior-tiles']")).toBeVisible();

  await page.locator("[data-tab='claim']").click();
  await settle(page);
  await expect(page.locator("[data-gap='cert-chain']")).toBeVisible();
  await expect(page.locator("[data-gap='artifact-manifest']")).toBeVisible();
  // The Hub's own declared absences are listed, each with its reason.
  await expect(page.locator("[data-absence]")).toHaveCount(3);
  await expect(page.locator("[data-absence='benchmark'] [data-withheld]")).toHaveAttribute(
    "data-withheld",
    "NOT_PUBLISHED",
  );
  expect(withoutPassportRefusal(noise), noise.join("\n")).toEqual([]);
});

test("S04 opens the dataset drawer, traps focus and gives it back", async ({ page }) => {
  await freezeClock(page);
  await stubPortalApi(page, "healthy");
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(EVIDENCE);
  await settle(page);

  await page.locator("[data-action='dataset-drawer']").click();
  const drawer = page.locator("[data-drawer='dataset']");
  await expect(drawer).toBeVisible();
  await expect(drawer).toHaveAttribute("aria-modal", "true");
  await expect(drawer.locator("[data-drawer-row='manifest digest']")).toContainText("sha256:c25a1d77b0e4");
  // The drawer states what it was not given instead of drawing a coverage bar.
  await expect(drawer.locator("[data-gap='dataset-coverage']")).toBeVisible();

  // Focus is inside the drawer, not behind it.
  expect(await page.evaluate(() => document.activeElement?.closest("[data-drawer]") !== null)).toBe(true);

  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
});

test("S04 is operable by keyboard and every control is named", async ({ page }) => {
  await freezeClock(page);
  await stubPortalApi(page, "healthy");
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(EVIDENCE);
  await settle(page);

  await page.locator("[data-tab='summary']").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("[data-panel='split']")).toBeVisible();
  await page.keyboard.press("End");
  await expect(page.locator("[data-panel='atlas']")).toBeVisible();
  await page.keyboard.press("Home");
  await expect(page.locator("[data-panel='summary']")).toBeVisible();

  const unnamed = await page.evaluate(() => {
    const root = document.querySelector("[data-screen='evidence-flow']");
    if (!root) return ["no screen"];
    return [...root.querySelectorAll("button, a")]
      .filter((el) => {
        const label =
          el.getAttribute("aria-label") ?? el.getAttribute("title") ?? (el.textContent ?? "").trim();
        return label.length === 0;
      })
      .map((el) => el.outerHTML.slice(0, 120));
  });
  expect(unnamed, unnamed.join("\n")).toEqual([]);
});

test("S04 discards a chart answered at another revision", async ({ page }) => {
  const noise = recorder(page);
  await freezeClock(page);
  await stubPortalApi(page, "healthy");

  // The equity series answers at a stale revision, every time. The screen must
  // discard it, reread the hub, try once more and then say so — not spin.
  let equityReads = 0;
  await page.route("**/api/v1/quantbt/runs/*/evidence/series*", async (route) => {
    const kind = new URL(route.request().url()).searchParams.get("kind");
    if (kind !== "EQUITY_OOS") return route.fallback();
    equityReads += 1;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        schema_version: "research.evidence-series.v1",
        run_id: "R-WFO-118",
        revision: "rev_6",
        etag: '"rev_6"',
        kind: "EQUITY_OOS",
        availability: { state: "AVAILABLE", reason_code: null },
        source_sample: { source_observation_count: 2190, emitted_point_count: 1, sampling: "FULL" },
        values: [{ at_utc_ms: 1704067200000, equity: "100000.00", drawdown_fraction: "0.000" }],
      }),
    });
  });

  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(EVIDENCE);
  await settle(page);

  await expect(page.locator("[data-series-panel='EQUITY_OOS']")).toHaveAttribute(
    "data-series-state",
    "revision-mismatch",
  );
  await expect(page.locator("[data-series-mismatch]")).toContainText("discarded");
  // Exactly one retry, then it stops.
  expect(equityReads, "retried a mismatch in a loop").toBe(2);
  // The chart is gone; the metrics it does not belong to are not.
  await expect(page.locator("[data-chart='equity']")).toHaveCount(0);
  await expect(page.locator("[data-metric-value='FINAL_EQUITY']")).toHaveText("128400.00");
  expect(withoutPassportRefusal(noise), noise.join("\n")).toEqual([]);
});

test("S01's open evidence link reaches S04", async ({ page }) => {
  await freezeClock(page);
  await stubPortalApi(page, "healthy");
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(RUN_LIBRARY);
  await settle(page);

  await page.locator("[data-run='R-WFO-118'] [data-open-evidence]").click();
  await settle(page);
  await expect(page.locator("[data-screen='evidence-flow']")).toBeVisible();
  await expect(page).toHaveURL(/\/runs\/R-WFO-118\/evidence#stage=summary&fold=1/);
});

/* ------------------------------------------------------------------ P14 */

/*
 * S05 Split on `/research/quantbt/runs/:runId/split`.
 *
 * The fixture publishes the three windows plus a metadata-bound holdout, and
 * refuses the retained-source fold read — so the browser can be asked the two
 * questions that matter here: is every published boundary drawn from the
 * server's own timestamps, and does the screen ever describe the holdout as
 * something it is not.
 */
const SPLIT = "/research/quantbt/runs/R-WFO-118/split";

for (const [name, width, height] of [
  ["laptop", 1280, 1000],
  ["mobile", 660, 1000],
] as const) {
  test(`S05 Split renders every block on its product route at ${name}`, async ({ page }) => {
    const noise = recorder(page);
    await freezeClock(page);
    await stubPortalApi(page, "healthy");
    await page.setViewportSize({ width, height });
    await page.goto(SPLIT);
    await settle(page);

    await expect(page.locator("[data-screen='split-detail']")).toBeVisible();
    await expect(page.getByRole("heading", { name: "S1 · Split — how the data was cut" })).toBeVisible();
    await expect(page.locator("[data-subtitle]")).toContainText("nothing on this screen can read the sealed holdout");
    await expect(page.locator("[data-protocol-strip]")).toBeVisible();

    // Three windows and the holdout, each from its own published span.
    await expect(page.locator("[data-window='warmup']")).toHaveCount(1);
    await expect(page.locator("[data-window='is']")).toHaveCount(1);
    await expect(page.locator("[data-window='outer_oos']")).toHaveCount(1);
    await expect(page.locator("[data-window='holdout']")).toHaveCount(1);
    await expect(page.locator("[data-window-legend='is']")).toContainText("2994 bars");

    // Every protocol fact the source withheld keeps its row.
    await expect(page.locator("[data-protocol-absences] [data-absent]")).toHaveCount(6);
    await expect(page.locator("[data-rules-footer]")).toContainText("it never recomputes a date");

    await expect(page.locator(".portal-shell")).toHaveCount(1);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(0);

    await page.screenshot({ path: `${OUT}/s05-split-${name}.png`, fullPage: true });
    expect(withoutPassportRefusal(noise), noise.join("\n")).toEqual([]);
  });
}

test("S05 draws each window where the server put it", async ({ page }) => {
  await freezeClock(page);
  await stubPortalApi(page, "healthy");
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(SPLIT);
  await settle(page);

  // The windows are laid out in published order and do not overlap: IS ends
  // where outer OOS begins, which ends where the holdout begins.
  const geometry = await page.evaluate(() =>
    ["warmup", "is", "outer_oos", "holdout"].map((key) => {
      const node = document.querySelector(`[data-window='${key}']`) as HTMLElement | null;
      return node ? { key, left: parseFloat(node.style.left), width: parseFloat(node.style.width) } : null;
    }),
  );
  const [warmup, is, oos, holdout] = geometry as { key: string; left: number; width: number }[];
  expect(warmup.left).toBe(0);
  expect(is.left).toBeGreaterThan(warmup.left);
  expect(Math.abs(is.left + is.width - oos.left)).toBeLessThan(0.5);
  expect(Math.abs(oos.left + oos.width - holdout.left)).toBeLessThan(0.5);

  // The one-day warmup against an eight-hundred-day axis is sub-pixel: it is
  // floored to a hairline and marked, never dropped.
  expect(warmup.width).toBeGreaterThan(0);
  await expect(page.locator("[data-hairline-badge='warmup']")).toBeVisible();
});

test("S05 describes the holdout and offers no way into it", async ({ page }) => {
  const noise = recorder(page);
  await freezeClock(page);
  await stubPortalApi(page, "healthy");

  // Anything the screen asks for is recorded: nothing may ask for holdout
  // content, an unlock, or an evaluation.
  const asked: string[] = [];
  page.on("request", (request) => asked.push(request.url()));

  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(SPLIT);
  await settle(page);

  await expect(page.locator("[data-holdout-integrity='P08_METADATA_BOUND']")).toBeVisible();
  await expect(page.locator("[data-holdout-evaluation='NOT_EVALUATED']")).toBeVisible();
  // Three exposure facts, not two: the result of the holdout was never exposed.
  await expect(page.locator("[data-holdout-result='NOT_EXPOSED']")).toBeVisible();
  await expect(page.locator("[data-holdout]")).not.toContainText("SEALED");
  await expect(page.locator("[data-action-unlock]")).toHaveAttribute("data-action-unlock", "NOT_PUBLISHED");
  await expect(page.locator("button[data-action-unlock], a[data-action-unlock]")).toHaveCount(0);

  // Clicking the refused affordance cannot start anything.
  const before = asked.length;
  await page.locator("[data-action-unlock]").click();
  await settle(page);
  expect(asked.length).toBe(before);
  expect(asked.some((url) => /unlock|holdout|evaluate/i.test(url))).toBe(false);
  expect(withoutPassportRefusal(noise), noise.join("\n")).toEqual([]);
});

test("S05 keeps a fold refusal inside the fold panel", async ({ page }) => {
  await freezeClock(page);
  await stubPortalApi(page, "healthy");
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(SPLIT);
  await settle(page);

  await expect(page.locator("[data-fold-anatomy='refused']")).toBeVisible();
  await expect(page.locator("[data-fold-refusal]")).toContainText("does not admit");
  // The rest of the screen is a screen.
  await expect(page.locator("[data-window-anatomy]")).toBeVisible();
  await expect(page.locator("[data-holdout]")).toBeVisible();
  await expect(page.locator("[data-gap='inner-folds']")).toBeVisible();
});

test("S05 carries the cursor back to the hub and reads it from the hash", async ({ page }) => {
  await freezeClock(page);
  await stubPortalApi(page, "healthy");
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(`${SPLIT}#stage=split&fold=4&params=prm_7c1a9e`);
  await settle(page);

  const back = page.locator("[data-action='back-to-hub']");
  await expect(back).toHaveAttribute("href", /\/runs\/R-WFO-118\/evidence#/);
  await expect(back).toHaveAttribute("href", /fold=4/);
  await expect(back).toHaveAttribute("href", /params=prm_7c1a9e/);

  await back.click();
  await settle(page);
  await expect(page.locator("[data-screen='evidence-flow']")).toBeVisible();
  await expect(page.locator("[data-cursor-fold]")).toContainText("fold 4");
});

/* ------------------------------------------------------------------ P15 */

/*
 * S06 Search & Selection on `/research/quantbt/runs/:runId/search`.
 *
 * The run was qualified against a fixed profile rather than searched, so the
 * browser is asked the question this screen exists to answer: does an absent
 * optimizer ever look like a broken one, or like a study that found nothing.
 */
const SEARCH = "/research/quantbt/runs/R-WFO-118/search";

for (const [name, width, height] of [
  ["laptop", 1280, 1000],
  ["mobile", 660, 1000],
] as const) {
  test(`S06 Search renders every block on its product route at ${name}`, async ({ page }) => {
    const noise = recorder(page);
    await freezeClock(page);
    await stubPortalApi(page, "healthy");
    await page.setViewportSize({ width, height });
    await page.goto(SEARCH);
    await settle(page);

    await expect(page.locator("[data-screen='search-detail']")).toBeVisible();
    await expect(page.locator("[data-source-profile='FIXED_PROFILE_NO_SEARCH']")).toBeVisible();
    await expect(page.locator("[data-requested-optimizer]")).toContainText("declared not executed");
    await expect(page.locator("[data-one-mode]")).toContainText("fixed at submit");
    await expect(page.locator("[data-readiness]")).toContainText("readiness partial");

    // Stage A, the freeze line and Stage B all keep their place.
    await expect(page.locator("[data-stage='A']")).toBeVisible();
    await expect(page.locator("[data-freeze-line]")).toBeVisible();
    await expect(page.locator("[data-stage='B']")).toBeVisible();

    // The one panel with content, and the seven that state their absence.
    await expect(page.locator("[data-parameter]")).toHaveCount(4);
    await expect(page.locator("[data-effective='atr_mult']")).toHaveText("2.00");
    await expect(page.locator("[data-panel='scatter']")).toBeVisible();
    await expect(page.locator("[data-panel='importance']")).toBeVisible();

    await expect(page.locator(".portal-shell")).toHaveCount(1);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(0);

    await page.screenshot({ path: `${OUT}/s06-search-${name}.png`, fullPage: true });
    expect(withoutPassportRefusal(noise), noise.join("\n")).toEqual([]);
  });
}

test("S06 never draws an empty study, and never a zero", async ({ page }) => {
  const noise = recorder(page);
  await freezeClock(page);
  await stubPortalApi(page, "healthy");
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(SEARCH);
  await settle(page);

  // No chart anywhere on the screen: not an empty one, not a placeholder axis.
  await expect(page.locator("[data-screen='search-detail'] canvas")).toHaveCount(0);
  await expect(page.locator("[data-screen='search-detail'] svg")).toHaveCount(0);

  // Each empty panel carries the server's own reason code.
  const reasons = await page.locator("[data-gap-reason]").allTextContents();
  expect(reasons.length).toBe(7);
  for (const reason of reasons) expect(reason).toMatch(/^P04_/);

  // A question that does not arise reads differently from a fact nobody sent.
  await expect(page.locator("[data-panel='scatter']")).toHaveAttribute("data-panel-state", "NOT_APPLICABLE");
  await expect(page.locator("[data-panel='importance']")).toHaveAttribute("data-panel-state", "NOT_PUBLISHED");

  // Nothing offers a count of nothing.
  const body = (await page.locator("[data-screen='search-detail']").textContent()) ?? "";
  expect(body).not.toMatch(/\b0 trials\b|\b0 candidates\b|\bno results found\b/i);
  expect(withoutPassportRefusal(noise), noise.join("\n")).toEqual([]);
});

test("S06 points at no trial, because none exists", async ({ page }) => {
  await freezeClock(page);
  await stubPortalApi(page, "healthy");
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(SEARCH);
  await settle(page);

  await expect(page.locator("[data-selection-state='FIXED_PARAMETER_PROFILE']")).toBeVisible();
  await expect(page.locator("[data-selected-ref]")).toContainText("none published");
  await expect(page.locator("[data-selected-trial]")).toHaveCount(0);
  await expect(page.locator("[data-action='pick-trial'], [data-action='freeze']")).toHaveCount(0);

  // The ledger panel states the contract's reason, not a row count.
  await expect(page.locator("[data-ledger='refused']")).toBeVisible();
  await expect(page.locator("[data-ledger-refusal]")).toContainText("P04_RAN_NO_TRIALS");
  await expect(page.locator("[data-ledger-gap-state='NOT_APPLICABLE']")).toBeVisible();
});

test("S06 sends the cursor's fold and is told this source has no optimizer fold", async ({ page }) => {
  await freezeClock(page);
  await stubPortalApi(page, "healthy");

  const asked: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/search")) asked.push(request.url().replace(/^https?:\/\/[^/]+/, ""));
  });

  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(`${SEARCH}#stage=search&fold=3`);
  await settle(page);

  expect(asked.some((url) => url.includes("fold=3"))).toBe(true);
  // And nothing else is ever sent: no relation, cursor, revision or command.
  for (const url of asked) expect(url).not.toMatch(/relation|revision|cursor|command|optimi[sz]er=/);

  await expect(page.locator("[data-panel='inspection']")).toHaveAttribute(
    "data-inspection-state",
    "NOT_APPLICABLE",
  );
  await expect(page.locator("[data-panel='inspection']")).toContainText("no optimizer fold");
});

test("S06 walks back to the hub and to S05 with the cursor intact", async ({ page }) => {
  await freezeClock(page);
  await stubPortalApi(page, "healthy");
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(`${SEARCH}#stage=search&fold=2&params=prm_3b81c7`);
  await settle(page);

  await expect(page.locator("[data-action='back-to-split']")).toHaveAttribute("href", /fold=2/);
  await page.locator("[data-action='back-to-hub']").click();
  await settle(page);
  await expect(page.locator("[data-screen='evidence-flow']")).toBeVisible();
  await expect(page.locator("[data-cursor-fold]")).toContainText("fold 2");
  await expect(page.locator("[data-cursor-params]")).toContainText("prm_3b81c7");
});

/* ------------------------------------------------------------------ P16 */

/*
 * S07 Freeze on `/research/quantbt/runs/:runId/freeze`.
 *
 * Two questions only a browser settles here: does a row of matched digests
 * ever read as a verified chain, and can anything except a click reach the one
 * POST this surface has.
 */
const FREEZE = "/research/quantbt/runs/R-WFO-118/freeze";

for (const [name, width, height] of [
  ["laptop", 1280, 1000],
  ["mobile", 660, 1000],
] as const) {
  test(`S07 Freeze renders every block on its product route at ${name}`, async ({ page }) => {
    const noise = recorder(page);
    await freezeClock(page);
    await stubPortalApi(page, "healthy");
    await page.setViewportSize({ width, height });
    await page.goto(FREEZE);
    await settle(page);

    await expect(page.locator("[data-screen='freeze-detail']")).toBeVisible();
    await expect(page.getByRole("heading", { name: "S3 · Freeze — ordering & integrity" })).toBeVisible();
    await expect(page.locator("[data-integrity='PARTIAL']")).toBeVisible();
    await expect(page.locator("[data-check]")).toHaveCount(3);
    // Spec 07 §2.2's note, and the sentence that says only one clock exists here.
    await expect(page.locator("[data-two-clocks]")).toContainText("two clocks, never one axis");
    await expect(page.locator("[data-ordering-note]")).toContainText("Only one of those two clocks");
    // A window that publishes its evaluation state shows it; one that does not
    // shows no chip rather than an empty one.
    await expect(page.locator("[data-window-evaluation]")).toHaveCount(1);
    await expect(page.locator("[data-frozen-parameter]")).toHaveCount(3);
    await expect(page.locator("[data-panel='ordering']")).toBeVisible();
    await expect(page.locator("[data-panel='what-if']")).toBeVisible();
    await expect(page.locator("[data-window-row]")).toHaveCount(3);

    await expect(page.locator(".portal-shell")).toHaveCount(1);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(0);

    await page.screenshot({ path: `${OUT}/s07-freeze-${name}.png`, fullPage: true });
    expect(withoutPassportRefusal(noise), noise.join("\n")).toEqual([]);
  });
}

test("S07 never lets three matches read as a verified chain", async ({ page }) => {
  await freezeClock(page);
  await stubPortalApi(page, "healthy");
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(FREEZE);
  await settle(page);

  // The scope travels with the marks, on screen, not only in a tooltip.
  await expect(page.locator("[data-verification-scope='PORTAL_RETAINED_DIGEST_BINDING_ONLY']")).toBeVisible();
  await expect(page.locator("[data-scope-note]")).toContainText("not a check of the source artifact");
  await expect(page.locator("[data-integrity] [data-gap-fact='source artifact bytes']")).toHaveAttribute(
    "data-gap-state",
    "NOT_ATTESTED",
  );

  const text = (await page.locator("[data-screen='freeze-detail']").textContent()) ?? "";
  expect(text).not.toMatch(/chain intact|fully verified|integrity verified/i);
});

test("S07 writes only when the reader clicks verify", async ({ page }) => {
  const noise = recorder(page);
  await freezeClock(page);
  await stubPortalApi(page, "healthy");

  const writes: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET") writes.push(`${request.method()} ${request.url()}`);
  });

  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(`${FREEZE}#stage=freeze&fold=2`);
  await settle(page);

  // Mount, a hash carrying a fold, a full render: still no write.
  expect(writes, "a write fired without a click").toEqual([]);

  await page.locator("[data-action='verify']").click();
  await expect(page.locator("[data-verify-result='PARTIAL_MATCH']")).toBeVisible();
  expect(writes.filter((entry) => entry.startsWith("POST")).length).toBe(1);
  expect(writes[0]).toContain("/freeze/verify");
  expect(withoutPassportRefusal(noise), noise.join("\n")).toEqual([]);
});

test("S07 offers no control for a question the source cannot answer", async ({ page }) => {
  await freezeClock(page);
  await stubPortalApi(page, "healthy");
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(FREEZE);
  await settle(page);

  await expect(page.locator("[data-what-if='NOT_APPLICABLE']")).toBeVisible();
  await expect(page.locator("input[type='range']")).toHaveCount(0);
  await expect(page.locator("[data-may-submit='false']")).toBeVisible();
  await expect(page.locator("[data-may-create='false']")).toBeVisible();

  // One button on the screen, and it is the verification.
  const actions = await page
    .locator("[data-screen='freeze-detail'] button[data-action]")
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-action")));
  expect(actions).toEqual(["verify"]);

  // The ordering panel shows windows, never a verdict.
  await expect(page.locator("[data-ordering-state='NOT_ASSERTED']")).toBeVisible();
  await expect(page.locator("[data-panel='ordering'] [data-verdict]")).toHaveCount(0);
});

test("S07 keeps the retained custody refusal inside its panel", async ({ page }) => {
  await freezeClock(page);
  await stubPortalApi(page, "healthy");
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(FREEZE);
  await settle(page);

  await expect(page.locator("[data-retained='refused']")).toBeVisible();
  await expect(page.locator("[data-retained-refusal]")).toContainText("does not admit");
  await expect(page.locator("[data-integrity='PARTIAL']")).toBeVisible();
  await expect(page.locator("[data-panel='frozen-parameters']")).toBeVisible();
});

test("the evidence chain walks 04 → 05 → 06 → 07 and back, carrying one cursor", async ({ page }) => {
  const noise = recorder(page);
  await freezeClock(page);
  await stubPortalApi(page, "healthy");
  await page.setViewportSize({ width: 1280, height: 1000 });

  // Start at the hub on a published fold, then walk out through each stage.
  await page.goto(`${EVIDENCE}#stage=split&fold=3`);
  await settle(page);
  await page.locator("[data-deep-dive='split']").click();
  await settle(page);
  await expect(page.locator("[data-screen='split-detail']")).toBeVisible();
  await expect(page).toHaveURL(/fold=3/);

  await page.locator("[data-action='next-stage']").click();
  await settle(page);
  await expect(page.locator("[data-screen='search-detail']")).toBeVisible();
  await expect(page).toHaveURL(/fold=3/);

  await page.locator("[data-action='next-stage']").click();
  await settle(page);
  await expect(page.locator("[data-screen='freeze-detail']")).toBeVisible();
  await expect(page).toHaveURL(/fold=3/);

  // And the way back lands on the hub with the same fold selected.
  await page.locator("[data-action='back-to-hub']").click();
  await settle(page);
  await expect(page.locator("[data-screen='evidence-flow']")).toBeVisible();
  await expect(page.locator("[data-cursor-fold]")).toContainText("fold 3");
  expect(withoutPassportRefusal(noise), noise.join("\n")).toEqual([]);
});

/*
 * The checks every deep-dive handoff asks for and the first pass of S05–S07
 * did not write: a hard refresh, a keyboard walk, and the provenance each
 * contract publishes.
 */
for (const [screen, path, marker] of [
  ["S05", SPLIT, "split-detail"],
  ["S06", SEARCH, "search-detail"],
  ["S07", FREEZE, "freeze-detail"],
] as const) {
  test(`${screen} survives a hard refresh on a deep link and names every control`, async ({ page }) => {
    const noise = recorder(page);
    await freezeClock(page);
    await stubPortalApi(page, "healthy");
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(`${path}#stage=split&fold=2&params=prm_3b81c7`);
    await settle(page);
    await expect(page.locator(`[data-screen='${marker}']`)).toBeVisible();

    // A refresh restores the same question from the URL alone.
    await page.reload();
    await settle(page);
    await expect(page.locator(`[data-screen='${marker}']`)).toBeVisible();
    await expect(page).toHaveURL(/fold=2/);
    await expect(page).toHaveURL(/params=prm_3b81c7/);

    // Every control carries an accessible name, and the first tab stop inside
    // the screen is reachable from the keyboard.
    const unnamed = await page.evaluate((selector) => {
      const root = document.querySelector(selector);
      if (!root) return ["no screen"];
      return [...root.querySelectorAll("button, a, input, select, summary")]
        .filter((el) => {
          const label =
            el.getAttribute("aria-label") ?? el.getAttribute("title") ?? (el.textContent ?? "").trim();
          return label.length === 0;
        })
        .map((el) => el.outerHTML.slice(0, 120));
    }, `[data-screen='${marker}']`);
    expect(unnamed, unnamed.join("\n")).toEqual([]);

    const first = page.locator(`[data-screen='${marker}'] a, [data-screen='${marker}'] button`).first();
    await first.focus();
    expect(
      await page.evaluate(
        (selector) => document.activeElement?.closest(selector) !== null,
        `[data-screen='${marker}']`,
      ),
    ).toBe(true);
    expect(withoutPassportRefusal(noise), noise.join("\n")).toEqual([]);
  });

  test(`${screen} shows the provenance its contract publishes`, async ({ page }) => {
    await freezeClock(page);
    await stubPortalApi(page, "healthy");
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(path);
    await settle(page);

    const strip = page.locator("[data-provenance]");
    await expect(strip).toBeVisible();
    // The identity is in the summary; the digests are one disclosure away.
    await expect(strip.locator("summary")).toContainText("provenance");
    await strip.locator("summary").click();

    // Requested and effective spec are two facts; a reader who sees only one
    // cannot tell whether this run is the run that was asked for.
    await expect(strip.locator("[data-provenance-digest='requested_spec_digest']")).toBeVisible();
    await expect(strip.locator("[data-provenance-digest='effective_spec_digest']")).toBeVisible();
  });
}

test("S05 ticks are presentation: density follows width, facts do not", async ({ page }) => {
  const noise = recorder(page);
  await freezeClock(page);
  await stubPortalApi(page, "healthy");

  const reads: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/v1/")) reads.push(request.url());
  });

  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(SPLIT);
  await settle(page);
  await expect(page.locator("[data-tick]")).toHaveCount(5);

  const read = async () => ({
    ticks: await page.locator("[data-tick]").allTextContents(),
    start: await page.locator("[data-timeline-start]").textContent(),
    end: await page.locator("[data-timeline-end]").textContent(),
    geometry: await page.evaluate(() =>
      ["warmup", "is", "outer_oos", "holdout"].map((key) => {
        const node = document.querySelector(`[data-window='${key}']`) as HTMLElement | null;
        return node ? `${key}:${node.style.left}:${node.style.width}` : `${key}:absent`;
      }),
    ),
    legend: await page.locator("[data-window-legend='is']").textContent(),
  });

  const wide = await read();
  expect(wide.ticks.length).toBe(5);
  for (const label of wide.ticks) expect(label).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  const requestsAfterWide = reads.length;

  // The same page, narrower. Per the P14 ruling this may change labels and
  // nothing else.
  await page.setViewportSize({ width: 660, height: 1000 });
  await settle(page);
  await expect.poll(() => page.locator("[data-tick]").count()).toBeLessThan(wide.ticks.length);
  const narrow = await read();

  expect(narrow.ticks.length).toBeLessThan(wide.ticks.length);
  expect(narrow.ticks[0]).toBe(wide.ticks[0]);
  expect(narrow.ticks[narrow.ticks.length - 1]).toBe(wide.ticks[wide.ticks.length - 1]);

  // Every semantic fact is byte-identical across the resize…
  expect(narrow.start).toBe(wide.start);
  expect(narrow.end).toBe(wide.end);
  expect(narrow.geometry).toEqual(wide.geometry);
  expect(narrow.legend).toBe(wide.legend);

  // …and the resize cost no read at all.
  expect(reads.length, "a viewport change issued a request").toBe(requestsAfterWide);
  // No tick ever reaches the URL.
  expect(page.url()).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  expect(withoutPassportRefusal(noise), noise.join("\n")).toEqual([]);
});

test("S06 shows an unbound selection metric as unpublished, never as a default", async ({ page }) => {
  await freezeClock(page);
  await stubPortalApi(page, "healthy");
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(SEARCH);
  await settle(page);

  await expect(page.locator("[data-metric-state='NOT_PUBLISHED']")).toBeVisible();
  await expect(page.locator("[data-metric-value]")).toHaveCount(0);
  // The installed catalogue's current default must never appear here: a
  // release's present setting is not evidence about a past request.
  const body = (await page.locator("[data-screen='search-detail']").textContent()) ?? "";
  expect(body).not.toMatch(/robust_decay|inferred/i);
});

test("S07 verification result carries its own scope", async ({ page }) => {
  await freezeClock(page);
  await stubPortalApi(page, "healthy");
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(FREEZE);
  await settle(page);

  await page.locator("[data-action='verify']").click();
  await expect(page.locator("[data-verify-result='PARTIAL_MATCH']")).toBeVisible();
  await expect(page.locator("[data-verify-scope='PORTAL_RETAINED_DIGEST_BINDING_ONLY']")).toContainText(
    "this verification covers",
  );
});
