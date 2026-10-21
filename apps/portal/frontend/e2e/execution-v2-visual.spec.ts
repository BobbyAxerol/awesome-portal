/**
 * UXM-07 · pixel baselines for the V2 screens (the new groups only: AGENT_WORKING_RULES G4 + 10.10).
 *
 * Lane: FIXTURE_LAB over BFF_DOUBLE, port-4176 build, project chromium-v2 (no real read, no live stream). The other
 * execution-v2-*.spec.ts files check behaviour and axe; this one is the only V2 file that compares pixels.
 *
 * Each cell photographs the main region (#portal-content, the sidebar excluded) of one screen at 1440 and 390 wide
 * (1024 as well for Fleet and Alpha 360). Stable by construction: the page clock is fixed, Math.random is seeded,
 * polling intervals of 1 s or more are neutralised, CSS animation/transition/caret are off, the focus ring and scroll
 * offsets are reset, fonts are loaded and canvases have painted before the shutter, and `mask` covers the few elements
 * whose text is a clock or a request id. A route nobody stubbed (501), a console error or a failed response fails the
 * cell: a fixture gap is never photographed as an empty screen.
 *
 * Compare-only: `updateSnapshots: "none"` in the config stands. Baselines are recorded by scripts/portal-web-visual-record-v2.sh
 * inside the pinned Playwright image. Outside that image the cells skip, so the behavioural V2 lane stays usable on a host.
 */
import { expect, test, type Page } from "@playwright/test";

import { stubExecutionBff } from "./bffDouble";
import { SLICE_URL, stubScopedBff } from "./bffDoubleScoped";
import { OPERATIONS_V2_DOUBLE_NOW_ISO } from "./bffDoubleV2";
import { settle, stubPortalApi, usePreferences } from "./fixtures";
import { V2_WORKSPACE, stubAdminRoutes, stubQuantbtRuns, watchPage } from "./v2Lane";

const PINNED = Boolean(process.env.PORTAL_VISUAL_PINNED_IMAGE);

type Width = 1440 | 1024 | 390;
const HEIGHT: Record<Width, number> = { 1440: 900, 1024: 800, 390: 844 };
const TWO: readonly Width[] = [1440, 390];
const THREE: readonly Width[] = [1440, 1024, 390];

interface Cell {
  /** File-name stem; the image is `v2-<slug>-<width>`. */
  slug: string;
  /** Group label for the contact sheet README. */
  group: string;
  route: string;
  /** The screen root that must be visible and out of its loading state. */
  root: string;
  widths: readonly Width[];
  /** Waits for something the root alone does not guarantee. */
  ready?: (page: Page) => Promise<void>;
  /** Extra elements to mask (volatile text). */
  mask?: string[];
  scoped?: boolean;
}

const WS = `workspace_id=${V2_WORKSPACE}`;

const CELLS: readonly Cell[] = [
  { slug: "fleet", group: "Fleet", route: "/deployments/alphas", root: ".exec-fleet-v2", widths: THREE },
  { slug: "overview", group: "Overview", route: "/execution", root: '[data-screen="overview-v2"]', widths: TWO },
  { slug: "portfolios", group: "Portfolios", route: "/deployments/portfolios", root: '[data-screen="portfolios-v2"]', widths: TWO },
  { slug: "portfolio-360", group: "Portfolio 360", route: "/deployments/portfolios/pf_TEST_ONLY_core", root: '[data-screen="portfolio-360-v2"]', widths: TWO },
  { slug: "alpha-360-overview", group: "Alpha 360 / Overview", route: "/deployments/alphas/alpha_btc_trend", root: '[data-screen="alpha-360-v2"]', widths: THREE },
  { slug: "alpha-360-orders", group: "Alpha 360 / Orders & Fills", route: "/deployments/alphas/alpha_btc_trend?tab=orders", root: '[data-screen="alpha-360-v2"]', widths: THREE },
  { slug: "alpha-360-deployments", group: "Alpha 360 / Deployments", route: "/deployments/alphas/alpha_btc_trend?tab=deployments", root: '[data-screen="alpha-360-v2"]', widths: THREE },
  { slug: "account-360", group: "Account", route: "/deployments/accounts/acc_bnc_core", root: ".exec-acct-v2", widths: TWO },
  {
    slug: "compare",
    group: "Compare",
    route: "/deployments/portfolios?view=compare&in=pf_TEST_ONLY_core,pf_TEST_ONLY_satellite",
    root: '[data-screen="compare-v2"]',
    widths: TWO,
  },
  { slug: "blotter", group: "Blotter", route: "/deployments/blotter", root: '[data-screen="blotter-v2"]', widths: TWO },
  { slug: "workbench-paper", group: "Workbench (Paper)", route: "/deployments/paper/dep_paper_01", root: '[data-screen="workbench-v2"]', widths: TWO },
  { slug: "live", group: "Live", route: `/deployments/live/dep_live_01?${WS}`, root: '[data-screen="live-v2"]', widths: TWO },
  { slug: "canary", group: "Canary", route: `/deployments/live/dep_canary_01/canary?${WS}`, root: '[data-screen="canary-v2"]', widths: TWO },
  { slug: "sandbox", group: "Sandbox", route: `/deployments/sandbox/dep_sandbox_01?${WS}`, root: '[data-screen="sandbox-v2"]', widths: TWO },
  { slug: "admin-actions", group: "Admin", route: "/administration/actions", root: '[data-screen="admin-actions-v2"]', widths: TWO },
  { slug: "users", group: "Users", route: "/administration/users", root: '[data-screen="users-v2"]', widths: TWO },
  { slug: "trade-replay", group: "Trade Replay", route: "/deployments/alphas/alpha_btc_trend?tab=replay", root: '[data-screen="alpha-360-v2"]', widths: TWO },
  { slug: "access", group: "Access", route: "/administration/profile-access?workspace_id=ws_TEST_GRANTS", root: ".exec-acc-kpi", widths: TWO },
  { slug: "cockpit", group: "Cockpit", route: "/governance/approvals", root: ".exec-ck", widths: TWO },
  { slug: "operations", group: "Operations", route: "/execution/operations", root: ".exec-ops", widths: TWO },
  {
    slug: "scoped-slice",
    group: "Scoped slice",
    route: SLICE_URL,
    root: '[data-screen="slice-v2"]',
    widths: TWO,
    scoped: true,
    ready: async (page) => {
      await expect(page.getByRole("heading", { name: "Scoped slice" })).toBeVisible();
      await expect(page.getByTestId("stream-chip")).toContainText("Live (fixture)");
    },
  },
];

/**
 * Elements whose text depends on the wall clock or on an id the server mints: the relative age ("14 min ago", Account)
 * and the request id an error state prints (Access). Absolute instants ("17 Oct 12:04Z") are fixture data under the
 * fixed clock and stay visible: masking every <time> would blank real content of the tables.
 */
const VOLATILE = [".exec-acct-ago", ".exec-acc-code", "[data-volatile]"];

const STILL_CSS = `
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
    scroll-behavior: auto !important;
    caret-color: transparent !important;
  }
  :focus, :focus-visible { outline: none !important; }
`;

async function freezeNondeterminism(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date(OPERATIONS_V2_DOUBLE_NOW_ISO));
  await page.addInitScript(() => {
    let seed = 0x9e3779b9;
    Math.random = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    // Polling off: a re-read answers the same stub, but a timer firing mid-capture could still repaint.
    const nativeSetInterval = window.setInterval.bind(window);
    window.setInterval = ((handler: TimerHandler, ms?: number, ...rest: unknown[]) =>
      (ms ?? 0) >= 1000 ? 0 : nativeSetInterval(handler, ms, ...rest)) as typeof window.setInterval;
  });
}

async function stillFrame(page: Page): Promise<void> {
  await page.addStyleTag({ content: STILL_CSS });
  await page.waitForFunction(() => !document.fonts || document.fonts.status === "loaded");
  await page.waitForFunction(() => Array.from(document.querySelectorAll("canvas")).every((c) => c.width > 0 && c.height > 0));
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        (document.activeElement as HTMLElement | null)?.blur?.();
        window.scrollTo(0, 0);
        for (const el of Array.from(document.querySelectorAll<HTMLElement>("*"))) {
          if (el.scrollTop !== 0) el.scrollTop = 0;
          if (el.scrollLeft !== 0) el.scrollLeft = 0;
        }
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

test.use({ locale: "en-US", timezoneId: "UTC", colorScheme: "light" });

for (const cell of CELLS) {
  for (const width of cell.widths) {
    test(`${cell.group} @ ${width}`, async ({ page, baseURL }) => {
      test.skip(!PINNED, "pixel baselines compare only inside the pinned Playwright image (scripts/portal-web-visual.sh)");

      await page.setViewportSize({ width, height: HEIGHT[width] });
      await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
      await freezeNondeterminism(page);
      await usePreferences(page, "operations");
      await stubPortalApi(page, "healthy");
      await stubExecutionBff(page, { operationsV2: true, screensV2: true });
      await stubAdminRoutes(page);
      await stubQuantbtRuns(page);
      if (cell.scoped) await stubScopedBff(page);

      const gaps: string[] = [];
      page.on("response", (response) => {
        if (response.status() === 501) gaps.push(response.url());
      });
      const watch = watchPage(page, baseURL);

      await page.goto(cell.route);
      await expect(page.locator(cell.root).first()).toBeVisible();
      await expect(page.locator(cell.root).first()).not.toHaveAttribute("data-state", "loading");
      if (cell.ready) await cell.ready(page);
      await settle(page);
      await stillFrame(page);

      expect(gaps, `unstubbed routes: ${gaps.join(", ")}`).toEqual([]);
      expect(watch.foreign).toEqual([]);
      expect(watch.take()).toEqual([]);

      // Photograph the page at its full height instead of letting the element shot scroll and stitch: a sticky bar
      // (Workbench) would otherwise be drawn again over the middle of the content.
      const full = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight));
      await page.setViewportSize({ width, height: Math.min(Math.max(full, HEIGHT[width]), 16_000) });
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            window.dispatchEvent(new Event("resize"));
            requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
          }),
      );

      const main = page.locator("#portal-content");
      await expect(main).toHaveScreenshot(`v2-${cell.slug}-${width}.png`, {
        caret: "hide",
        animations: "disabled",
        mask: [...VOLATILE, ...(cell.mask ?? [])].map((selector) => main.locator(selector)),
      });
    });
  }
}
