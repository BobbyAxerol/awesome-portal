/**
 * Visual baseline — U02 exit gate.
 *
 * The token layer and the seven component states already have unit tests. What
 * had never been checked is the thing a reader actually meets: the rendered
 * screen, at each breakpoint, in each theme. This suite is that check, and it
 * is also the Operations Dark review that the backlog had blocked on it.
 *
 * Scope is deliberately the four screens whose layout claims are load-bearing:
 *  - Command Center — the shell itself, plus summary state rendering;
 *  - Portal Map — the lifecycle rail and the persona filter;
 *  - Planning Roadmap — the v1.1 timeline, whose claim is "readable at four
 *    breakpoints" and which used to be a 1240px-wide table;
 *  - Planning Board — the v1.1 board, embedded, which is where a token missing
 *    from the Portal side would show up as a colourless card.
 *
 * Print is captured at one breakpoint: the print sheet forces a light theme
 * and a fixed page width, so a breakpoint matrix would say nothing new.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  BREAKPOINTS,
  THEMES,
  freezeClock,
  settle,
  stubPortalApi,
  usePreferences,
} from "./fixtures";

interface Screen {
  name: string;
  path: string;
  /**
   * Something that only exists once the screen has really rendered.
   *
   * The Command Center is addressed by its `h1` rather than a container,
   * because every one of its states (loading, failed, and each summary
   * fixture) renders the module header and nothing else in common — which is
   * exactly what the summary-state cases below need.
   */
  ready: (page: Page) => Locator;
}

const SCREENS: Screen[] = [
  {
    name: "command-center",
    path: "/",
    ready: (page) => page.getByRole("heading", { level: 1, name: "Command Center" }),
  },
  { name: "portal-map", path: "/portal-map", ready: (page) => page.locator(".portal-map") },
  {
    name: "planning-roadmap",
    path: "/planning/roadmap",
    ready: (page) => page.getByTestId("roadmap-timeline"),
  },
  {
    name: "planning-board",
    path: "/planning/board",
    ready: (page) => page.getByTestId("task-board-feature"),
  },
];

for (const theme of THEMES) {
  test.describe(`${theme} theme`, () => {
    for (const breakpoint of BREAKPOINTS) {
      for (const screen of SCREENS) {
        test(`${screen.name} @ ${breakpoint.name}`, async ({ page }) => {
          await page.setViewportSize({ width: breakpoint.width, height: breakpoint.height });
          await freezeClock(page);
          await usePreferences(page, theme);
          await stubPortalApi(page, "healthy");

          await page.goto(screen.path);
          await screen.ready(page).first().waitFor({ state: "visible" });
          await settle(page);

          await expect(page).toHaveScreenshot(`${screen.name}-${theme}-${breakpoint.name}.png`, {
            fullPage: true,
          });
        });
      }
    }
  });
}

test.describe("print theme", () => {
  for (const screen of SCREENS) {
    test(`${screen.name} @ print`, async ({ page }) => {
      // Print is captured at laptop width: the print sheet fixes its own page
      // box, so the viewport only has to be wide enough to lay out.
      await page.setViewportSize({ width: 1280, height: 900 });
      await freezeClock(page);
      // Print must come out light even when the app is in Operations dark —
      // that is the §26.6 rule the token file encodes, and capturing it from
      // the dark theme is what proves the override works.
      await usePreferences(page, "operations");
      await stubPortalApi(page, "healthy");

      await page.goto(screen.path);
      await screen.ready(page).first().waitFor({ state: "visible" });
      await page.emulateMedia({ media: "print" });
      await settle(page);

      await expect(page).toHaveScreenshot(`${screen.name}-print.png`, { fullPage: true });
    });
  }
});

/**
 * Summary states, at one breakpoint and one theme.
 *
 * The point here is not layout but that the states stay visually distinct:
 * `partial`, `unavailable` and `empty` must not converge on the same grey
 * screen, which is the failure the display contract exists to prevent.
 */
test.describe("Command Center summary states", () => {
  for (const state of ["partial", "unavailable", "empty"] as const) {
    test(`command-center @ ${state}`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await freezeClock(page);
      await usePreferences(page, "research");
      await stubPortalApi(page, state);

      await page.goto("/");
      await page.getByRole("heading", { level: 1, name: "Command Center" }).waitFor({ state: "visible" });
      await settle(page);

      await expect(page).toHaveScreenshot(`command-center-${state}.png`, { fullPage: true });
    });
  }
});
