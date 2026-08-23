/**
 * Visual baseline — the Execution Loop fixture surface.
 *
 * Seventeen screens and 116 component cases have been built, audited and
 * called "hifi" across many phases with **no pixel ever checked**. The 101
 * shots in `visual.spec.ts` cover QuantBT routes only; the four whose names
 * contain "execution" are QuantBT's run-execution tab, not this surface.
 *
 * The 2026-08-23 audit is the argument for this file. It found
 * `className="exec-sr-only"` in the command drawer — a class with no rule
 * anywhere, so the screen-reader text "(done) / (current) / (not reached)"
 * rendered as ordinary visible words beside the step markers. 1,470 unit tests
 * did not see it and could not: they assert on text content, and the text was
 * correct. It was the *presentation* that was wrong, and only a screenshot
 * answers that question.
 *
 * Shot per group rather than per page. One image of a 116-case page is not
 * reviewable — a human cannot spot a broken cell in it, and a 0.2% diff budget
 * on a frame that tall would swallow a whole misrendered panel.
 *
 * Laptop and workstation only, following the same reasoning `visual.spec.ts`
 * applies to the Research screens: nobody is asked to run deployments from a
 * phone, so a mobile baseline would freeze a layout no operator meets.
 */
import { expect, test } from "@playwright/test";

import { BREAKPOINTS, freezeClock, settle, stubPortalApi, usePreferences } from "./fixtures";

const ROUTE = "/execution/_fixtures";

/**
 * Every group on the page, by its `data-group` address.
 *
 * Written out rather than discovered at runtime. A discovered list would grow
 * silently: a new group would be captured on its first run, its baseline
 * written, and it would pass forever without anyone deciding it was right. The
 * `matches the page` test below turns any addition, removal or rename into a
 * failure that a human has to answer.
 */
const GROUPS = [
  "authoritybadge",
  "freshnessindicator",
  "statuschip-four-vocabularies-never-one-field",
  "environmentbadge-and-guardband",
  "lifecyclerail",
  "observationprogress",
  "evidencepanel-and-sla",
  "venuescope",
  "charttile",
  "panel-states",
  "commandplandrawer",
  "cold-retention-six-answers-to-why-are-there-no-rows",
  "mechanism-m2-zoom-re-queries-it-does-not-magnify",
  "mechanism-m3-a-subscription-through-its-whole-lifecycle",
  "subscription-states-side-by-side",
  "source-completeness-not-the-same-question-as-freshness",
  "phase-1-approval-inbox-states-only",
  "phase-2-gate-r1-review-states-only",
  "wired-flow-list-detail-plan-apply-poll",
  "phase-3-gate-r2-review-states-only",
  "phase-5-paper-exit-review-states-only",
  "risk-tier-and-delivery-policy-what-apply-demands",
  "verificationchip-what-verify-observed-a-second-axis",
  "capabilitychip-per-capability-never-rolled-up",
  "profilebadge-registry-revision-4",
  "profile-reconciliation-fail-closed",
  "keysettable-mechanism-m1",
  "live-full-operations-1f",
  "sandbox-certification-1d",
  "canary-control-room-1e",
  "operations-queue-4e",
  "incident-detail-4d",
  "analytics-containers-port-screen",
  "command-center-5a",
  "admin-action-drawer-1i",
  "full-blotter-4c",
  "paper-workbench-1c-and-its-vn-variant-4h",
  "alpha-360-2a-2b",
  "portfolio-360-1h-3a",
  "account-broker-360-1g",
] as const;

const SHOT_BREAKPOINTS = BREAKPOINTS.filter((b) => b.name === "laptop" || b.name === "workstation");

async function openFixtures(page: import("@playwright/test").Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await freezeClock(page);
  // The Carbon surface is set by the wrapper, not by this preference — see the
  // isolation test below, which is what makes one theme enough here.
  await usePreferences(page, "operations");
  await stubPortalApi(page, "healthy");
  await page.goto(ROUTE);
  await page.getByRole("heading", { level: 1, name: /Execution Loop/ }).waitFor({ state: "visible" });
  await settle(page);
  // The shell topbar is `position: sticky; z-index: 30`, so on any group tall
  // enough to be scrolled under it, it printed straight across the middle of
  // the shot — a workspace switcher and a search box slicing through three
  // command drawers. That is normal sticky behaviour and not a defect, but it
  // contaminates a baseline of the surface underneath and only on the tall
  // groups, so the images were not comparable with each other.
  //
  // `visibility`, not `display`: a sticky element still occupies its place in
  // flow, so hiding it this way removes the pixels without moving anything
  // else. `display: none` would widen the content and baseline a layout no
  // operator ever sees.
  await page.addStyleTag({ content: ".portal-topbar { visibility: hidden; }" });
  // Checked, not assumed, and this is not defensive padding — it is the exact
  // way this went wrong once.
  //
  // A run with contaminated images still compared EQUAL to clean ones. The
  // band is dark chrome over a dark surface, and `toHaveScreenshot` ignores
  // per-pixel differences under its default colour `threshold` of 0.2, so only
  // the text glyphs inside the band counted as changed — far under the 0.2%
  // frame budget. The suite was green over a mixed baseline set.
  //
  // So a silent failure of this one style rule is invisible downstream. If the
  // class is ever renamed, this line fails instead.
  const hidden = await page
    .locator(".portal-topbar")
    .evaluate((n) => getComputedStyle(n).visibility);
  expect(hidden, "the shell topbar must be hidden or it prints across the shot").toBe("hidden");
}

test.describe("the fixture page is the shape the baseline expects", () => {
  test("every group on the page is one this suite shoots", async ({ page }) => {
    await openFixtures(page, 1280, 900);
    const onPage = await page.locator("[data-group]").evaluateAll((nodes) =>
      nodes.map((n) => n.getAttribute("data-group") ?? ""),
    );
    // Order included on purpose: the page reads top to bottom as an argument,
    // and a reordering is a change to that argument even when the set matches.
    expect(onPage).toEqual([...GROUPS]);
  });

  test("no two groups share an address", async ({ page }) => {
    await openFixtures(page, 1280, 900);
    const onPage = await page.locator("[data-group]").evaluateAll((nodes) =>
      nodes.map((n) => n.getAttribute("data-group") ?? ""),
    );
    // Three groups share a heading ("Equity", "Allocate capital"), so a slug
    // derived from the title would collide and two different groups would
    // write the same baseline file — coverage that reads as present and is not.
    expect(new Set(onPage).size).toBe(onPage.length);
  });
});

/**
 * The surface is chosen by the wrapper, not by the reader's theme.
 *
 * This is what lets the shots below run under one theme instead of two. It is
 * checked rather than assumed: if the portal theme leaked into the Carbon
 * surface, every image here would be a baseline of one accidental half of the
 * behaviour.
 */
test.describe("Carbon surfaces ignore the portal theme", () => {
  for (const theme of ["research", "operations"] as const) {
    test(`governance stays light and deployments stays dark under ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await freezeClock(page);
      await usePreferences(page, theme);
      await stubPortalApi(page, "healthy");
      await page.goto(ROUTE);
      await page.getByRole("heading", { level: 1, name: /Execution Loop/ }).waitFor({ state: "visible" });
      await settle(page);

      const luminance = async (selector: string) => {
        const rgb = await page.locator(selector).first().evaluate(
          (n) => getComputedStyle(n).backgroundColor,
        );
        const [r, g, b] = (rgb.match(/\d+/g) ?? ["0", "0", "0"]).map(Number);
        return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      };

      // The surface is carried on `data-theme`, not a class name — see
      // `ExecutionSurface`, where the kind maps to a theme attribute so the
      // token layer can key off it.
      expect(await luminance('[data-theme="operations-carbon-light"]')).toBeGreaterThan(0.5);
      expect(await luminance('[data-theme="operations-carbon"]')).toBeLessThan(0.5);
    });
  }
});

for (const breakpoint of SHOT_BREAKPOINTS) {
  test.describe(`execution fixtures @ ${breakpoint.name}`, () => {
    for (const group of GROUPS) {
      test(group, async ({ page }) => {
        await openFixtures(page, breakpoint.width, breakpoint.height);
        const section = page.locator(`[data-group="${group}"]`);
        await section.waitFor({ state: "visible" });
        // 30s, not the 5s default. `toHaveScreenshot` proves stability by
        // capturing twice and comparing, and the two largest groups are whole
        // screens: `paper-workbench` is 1376×6476 at this breakpoint, which
        // measures ~2.0s per capture, so two captures plus overhead overran the
        // default and both failed at workstation while passing at laptop.
        // Measured, not guessed — a bare `screenshot()` of that element returns
        // 625KB in 1976ms. Nothing here is unstable: sampling the bounding box
        // eight times over a second gives one identical size every time.
        await expect(section).toHaveScreenshot(`execution-${group}-${breakpoint.name}.png`, {
          timeout: 30_000,
        });
      });
    }
  });
}
