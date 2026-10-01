/**
 * RF-04 · axe on every Research screen S00–S14 (Unified 13.4.1 G7).
 *
 * What this replaces. The first version listed five routes, answered only the
 * Portal shell's own stubs, and then read `page.locator("[data-screen]").count()`
 * once, straight after `settle()`. On a served build that happened to pass; on
 * the Vite dev server it found no `[data-screen]` for any screen, so the axe
 * pass never ran. Two things were wrong, and neither was a screen:
 *
 *  1. The wait. `settle()` returns as soon as the shell's `<main>` exists —
 *     before the lazily loaded screen has mounted — and `count()` does not
 *     retry. On a `vite preview` build the screen chunk is a few ms behind the
 *     shell; on the dev server every module is transformed on first request, so
 *     the screen arrives 0.6–3 s later (measured) and the single look lands in
 *     the gap. The probe now waits for the screen's own root with a retrying
 *     locator, and says what it did see when the root never comes.
 *  2. The coverage and the state under test. Five routes answered by the shell
 *     stubs alone meant S03 was axed on a refusal frame and S01, S04–S11 and S13
 *     were not axed at all. The probe now walks the P23 lane's `SCREENS` — the
 *     fifteen screens, each with its own root — under `installLane`, which
 *     answers every read of every screen from the repository's own fixtures, so
 *     each screen is axed in the healthy state a reader meets.
 *
 * The host is chosen in `playwright.research-probe.config.ts`
 * (`RESEARCH_PROBE_BASE_URL`, or `RESEARCH_PROBE_SERVE=preview|dev` to build and
 * serve this tree). The config's fallback, 127.0.0.1:4317, is a long-running
 * preview of some earlier build; every receipt row records the base URL it
 * measured.
 *
 * Output: one JSON receipt (`RESEARCH_A11Y_RECEIPT`, else
 * `$RESEARCH_SHOT_DIR/rf04-a11y-receipt.json`) with every axe finding per
 * screen and width — all impact levels, node by node with the measured colour
 * pair, once per theme (Research light, then Operations Dark). Nothing is
 * accepted: contrast is judged strictly against 4.5:1. (The old D-B1 clause,
 * "fg == #939db0 is accepted", is gone — `.research-screen` carries its own
 * `--ink-faint`, so that colour no longer appears on these screens.) This stays a
 * probe: it measures and writes a receipt, it is not a gate.
 */
import { expect, test } from "@playwright/test";

import { analyze, recordRow } from "./axeReceipt";
import { freezeClock, usePreferences } from "./fixtures";
import { quiet } from "./research-qualification/harness";
import { SCREENS, installLane, watchConsole, watchNetwork, type ScreenDef } from "./research-qualification/stubs";

const WIDTHS = [1440, 1280, 660] as const;
/** Light first, then the dark workstation theme: the Research tokens are re-scoped for each (`tokens.css`, end of file). */
const THEME_PASSES = ["research", "operations"] as const;
const ROOT_TIMEOUT_MS = 30_000;

/** Screens whose bundle must not pull the charting chunks (production builds only: the names mean nothing on the dev server). */
const NO_CHART_BUNDLE = new Set(["00", "02", "03", "12", "14"]);

for (const theme of THEME_PASSES) {
for (const def of SCREENS as readonly ScreenDef[]) {
  for (const width of WIDTHS) {
    test(`${theme} · S${def.id} ${def.title}: axe finds nothing at ${width}px`, async ({ page, baseURL }) => {
      await freezeClock(page);
      await installLane(page);
      await usePreferences(page, theme);
      const net = watchNetwork(page);
      const { noise } = watchConsole(page, net);
      await page.setViewportSize({ width, height: 900 });
      /* axe reads the colour on screen at the instant it looks. The running-state pulse (S01, S03) dims text through
         the cycle, so a moving animation makes the same page pass or fail by timing. The screens honour reduced
         motion by holding the pulse still, and that still frame is the one WCAG contrast is judged on. */
      await page.emulateMedia({ reducedMotion: "reduce" });

      const started = Date.now();
      await page.goto(def.path);
      /* The retrying wait the first version lacked: the screen's own root, not the shell's <main>. */
      const root = page.locator(def.root).first();
      const rendered = await root.waitFor({ state: "visible", timeout: ROOT_TIMEOUT_MS }).then(
        () => true,
        () => false,
      );
      if (!rendered) {
        const seen = await page.evaluate(() => ({
          url: window.location.href,
          shell: document.querySelectorAll(".portal-shell").length,
          main: document.querySelectorAll("main").length,
          roots: Array.from(document.querySelectorAll("[data-screen]")).map((node) => node.getAttribute("data-screen")),
          heading: document.querySelector("h1")?.textContent?.trim() ?? null,
        }));
        throw new Error(
          `S${def.id}: ${def.root} did not become visible in ${ROOT_TIMEOUT_MS} ms at ${width}px. ` +
            `Served from ${baseURL}; page saw ${JSON.stringify(seen)}; ` +
            `fixture gaps (501): ${JSON.stringify(net.gaps)}; console: ${JSON.stringify(noise.slice(0, 3))}`,
        );
      }
      const waitedMs = Date.now() - started;
      await quiet(page, net);
      expect(await page.locator(def.root).count(), "one screen root").toBe(1);

      const result = await analyze(page, def.root);
      /* Strictly 4.5:1 and every other rule: nothing is accepted. D-B1 (the shared #939db0) is not a Research colour
         any more — `.research-screen` re-scopes `--ink-faint` — so a node in that colour is a failure like any other. */
      const failing = result.violations.flatMap((rule) =>
        rule.nodes.map((node) => ({ rule: rule.rule, impact: rule.impact, target: node.target, foreground: node.foreground, background: node.background, contrast: node.contrast, summary: node.summary })),
      );
      const darkTheme = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
      expect(darkTheme, "the theme the pass asked for is the one on <html>").toBe(theme);
      recordRow("RF-04 axe per Research screen (G7)", `${theme}:S${def.id}@${width}`, {
        theme,
        screen: `S${def.id}`,
        title: def.title,
        base_url: baseURL,
        path: def.path,
        width,
        root: def.root,
        waited_ms: waitedMs,
        axe_version: result.axe_version,
        passes: result.passes,
        incomplete: result.incomplete,
        failing_nodes: failing.length,
        violations: result.violations,
      });

      if (NO_CHART_BUNDLE.has(def.id)) {
        const jsFiles = await page.evaluate(() =>
          performance
            .getEntriesByType("resource")
            .map((entry) => new URL(entry.name).pathname)
            .filter((path) => path.endsWith(".js")),
        );
        expect(jsFiles.filter((path) => /\/(?:theme|echarts)-/.test(path))).toEqual([]);
      }
      expect(failing, `${failing.length} axe node(s) on S${def.id} at ${width}px (${theme})`).toEqual([]);
    });
  }
}
}
