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
  await page.getByLabel("Alpha", { exact: true }).fill("delta_rsi");
  await page.getByLabel("Alpha version").fill("av_0_3_0");
  await page.locator("[data-step-pill='strategy']").click();
  await page.getByLabel("Strategy id").fill("delta_rsi_polynomial");
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

test("S02's four Spec 02 validators fire from the typed response", async ({ page }) => {
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
  await page.getByLabel("Alpha", { exact: true }).fill("delta-rsi-polynomial-alpha");
  await page.getByLabel("Alpha version").fill("av_delta_rsi_polynomial_alpha_1_0_0");
  await expect(page.locator("[data-declaration-bound]")).toHaveAttribute(
    "data-declaration-bound",
    "true",
  );
  await expect(page.locator("[data-missing-constraints]")).toHaveCount(0);

  // 1. the entrypoint pin, naming the version and the declared entrypoint
  await page.locator("[data-step-pill='strategy']").click();
  await page.getByLabel("Strategy id").fill("something_else");
  await expect(page.locator("[data-step-card] [data-step-error]")).toContainText(
    "Strategy is pinned by av_delta_rsi_polynomial_alpha_1_0_0 (entrypoint alpha.delta_rsi:run)",
  );
  await page.getByLabel("Strategy id").fill("alpha.delta_rsi:run");

  // 2. the declared timeframe list
  await page.locator("[data-step-pill='data']").click();
  await page.getByLabel("Symbol").fill("BTCUSDT");
  await page.getByLabel("Timeframe").selectOption("1d");
  await expect(page.locator("[data-step-card] [data-step-error]")).toHaveText(
    "The strategy declares only 1h, 4h.",
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
