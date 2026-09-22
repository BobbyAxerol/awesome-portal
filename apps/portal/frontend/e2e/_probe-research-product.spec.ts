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
  await expect(page.locator("[data-retry-reason]")).toHaveText("P12_OWNED_NO_P11_RETRY_ROUTE");

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

  // A settled card offers evidence as refused rather than pointing at a route
  // that would 404. It is never an anchor, so it cannot be followed.
  const evidence = page.locator("[data-run='R-WFO-118'] [data-open-evidence]");
  await expect(evidence).toHaveAttribute("data-open-evidence", "UNPUBLISHED");
  await expect(evidence).toHaveAttribute("title", /no published route yet/);
  await expect(page.locator("[data-open-evidence]")).toHaveCount(3);
  await expect(page.locator("a[data-open-evidence]")).toHaveCount(0);
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
