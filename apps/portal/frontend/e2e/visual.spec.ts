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
  FIXTURE_RUN_ID,
  FIXTURE_RUNNING_RUN_ID,
  THEMES,
  freezeClock,
  runFixtureDigest,
  runResponseIndex,
  settle,
  stubPortalApi,
  stubRunApi,
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
  // Reports renders from the parsed document now rather than from injected
  // legacy markup, so it belongs in the baseline: this is where a token or
  // layout regression in that change would show.
  {
    name: "planning-reports",
    path: "/planning/reports",
    ready: (page) => page.getByTestId("reports-feature"),
  },
];

/**
 * The Research screens, served from the recorded run responses.
 *
 * These are the screens the backlog listed as unprovable: they need a completed
 * run, and until `registry/fixtures/runs/visual-baseline-run` existed there was
 * none. The fixture is an `advanced_walk_forward` run, which is why Overview
 * and Execution read the stitched series rather than the per-segment ones.
 */
const RUN_SCREENS: Screen[] = [
  {
    name: "new-run",
    path: "/research/quantbt/new",
    // The level-1 heading is the module header ("QuantBT Research"); the
    // flow's own title is level 2.
    ready: (page) => page.getByRole("heading", { level: 2, name: "New Run" }),
  },
  {
    name: "run-overview",
    path: `/research/quantbt/runs/${FIXTURE_RUN_ID}/overview`,
    ready: (page) => page.locator("figure[data-fig='1']"),
  },
  {
    name: "run-optimization",
    path: `/research/quantbt/runs/${FIXTURE_RUN_ID}/optimization`,
    ready: (page) => page.locator("figure[data-fig='1']"),
  },
  {
    name: "run-parameters",
    path: `/research/quantbt/runs/${FIXTURE_RUN_ID}/parameters`,
    ready: (page) => page.locator("figure[data-fig='1']"),
  },
  {
    name: "run-execution",
    path: `/research/quantbt/runs/${FIXTURE_RUN_ID}/execution`,
    ready: (page) => page.locator("figure[data-fig='1']"),
  },
  // Run Progress renders only for a non-terminal run, which is why it needed
  // its own fixture. The detail response still carries the completed run's id
  // (backend request 13), so this shot also captures the mismatch notice — the
  // honest rendering of an inconsistency rather than a silent normalisation.
  {
    name: "run-progress",
    path: `/research/quantbt/runs/${FIXTURE_RUNNING_RUN_ID}/overview`,
    ready: (page) => page.getByText(/fold timeline|Window timeline/i),
  },
  {
    name: "alpha-imports",
    path: "/research/quantbt/imports",
    ready: (page) => page.getByTestId("import-summary"),
  },
  {
    name: "run-audit",
    path: `/research/quantbt/runs/${FIXTURE_RUN_ID}/audit`,
    ready: (page) => page.getByRole("heading", { level: 1 }),
  },
];

/**
 * Staleness gate.
 *
 * The baseline replays recorded responses. If the run fixture is regenerated
 * and `export_run_responses.py` is not re-run, every Research screenshot would
 * keep baselining numbers that no longer exist — silently. Comparing the
 * recorded digest against the fixture on disk is what makes that a failure.
 */
test("recorded run responses match the committed run fixtures", () => {
  const index = runResponseIndex();
  expect(index.run_id).toBe(FIXTURE_RUN_ID);
  expect(index.running_run_id).toBe(FIXTURE_RUNNING_RUN_ID);
  const hint = "run fixture changed — re-run apps/portal/scripts/export_run_responses.py";
  expect(index.source_digest, hint).toBe(runFixtureDigest(FIXTURE_RUN_ID));
  expect(index.running_source_digest, hint).toBe(runFixtureDigest(FIXTURE_RUNNING_RUN_ID));
});

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

/**
 * Research screens, both themes, at the two widths they are designed for.
 *
 * Deliberately not the full 4x2 matrix: a result screen is a desktop analysis
 * surface (v0.4 §26.1 sends research work to "open on desktop"), so mobile and
 * tablet shots would baseline a layout nobody is asked to work in. Laptop and
 * workstation are the real ones.
 */
for (const theme of THEMES) {
  test.describe(`${theme} theme · research`, () => {
    for (const breakpoint of BREAKPOINTS.filter((b) => b.name === "laptop" || b.name === "workstation")) {
      for (const screen of RUN_SCREENS) {
        test(`${screen.name} @ ${breakpoint.name}`, async ({ page }) => {
          await page.setViewportSize({ width: breakpoint.width, height: breakpoint.height });
          await freezeClock(page);
          await usePreferences(page, theme);
          await stubPortalApi(page, "healthy");
          await stubRunApi(page);

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
      // Settle BEFORE switching media. mermaid measures text at render time, so
      // letting the media switch race the render made the SVG geometry differ
      // between runs — the repeatable `planning-reports @ print` failure. The
      // diagram is therefore always laid out under screen CSS, and print only
      // affects what CSS itself controls.
      await settle(page);
      await page.emulateMedia({ media: "print" });
      await settle(page);

      await expect(page).toHaveScreenshot(`${screen.name}-print.png`, { fullPage: true });
    });
  }
});

/**
 * Auth frames 01B/01C/01D (v0.4 §21.1).
 *
 * These render instead of the shell, so they are addressed by auth state rather
 * than by route. Mobile is included on purpose: unlike a result screen, a login
 * form is something a user will genuinely meet on a phone, and §21.1 specifies
 * the form-first collapse for exactly that case.
 */
const AUTH_FRAMES = [
  { name: "login", state: "APP_LOGIN_REQUIRED", ready: "login-screen" },
  { name: "password-change", state: "PASSWORD_CHANGE_REQUIRED", ready: "password-change-screen" },
  { name: "access-denied", state: "ACCESS_REQUIRED", ready: "access-problem-screen" },
  { name: "account-disabled", state: "ACCOUNT_DISABLED", ready: "access-problem-screen" },
] as const;

for (const theme of THEMES) {
  test.describe(`${theme} theme · auth`, () => {
    for (const breakpoint of BREAKPOINTS.filter((b) => b.name === "mobile" || b.name === "laptop")) {
      for (const frame of AUTH_FRAMES) {
        test(`auth-${frame.name} @ ${breakpoint.name}`, async ({ page }) => {
          await page.setViewportSize({ width: breakpoint.width, height: breakpoint.height });
          await freezeClock(page);
          await usePreferences(page, theme);
          await stubPortalApi(page, "healthy", frame.state);

          await page.goto("/");
          await page.getByTestId(frame.ready).waitFor({ state: "visible" });
          await settle(page);

          await expect(page).toHaveScreenshot(
            `auth-${frame.name}-${theme}-${breakpoint.name}.png`,
            { fullPage: true },
          );
        });
      }
    }
  });
}

/**
 * Administration and Alpha 360°.
 *
 * Both are screens whose whole job is to render consequence: one lists accounts
 * with destructive controls beside them, the other says where an alpha version
 * sits in a lifecycle it cannot move. A token or spacing regression here would
 * show up as a danger action that no longer reads as one, which is exactly the
 * kind of drift a unit test does not catch.
 *
 * The bodies below are pinned and obviously synthetic: no real principal, no real
 * digest, no token of any kind.
 */
const ADMIN_USERS = {
  users: [
    {
      user_id: "u-1",
      username: "bobby",
      display_name: "Bobby",
      role: "ADMIN",
      status: "ACTIVE",
      must_change_password: false,
      locked_until: null,
      created_at: "2026-07-01T08:00:00+00:00",
      disabled_at: null,
    },
    {
      user_id: "u-2",
      username: "analyst",
      display_name: "Quant Analyst",
      role: "USER",
      status: "ACTIVE",
      must_change_password: true,
      locked_until: null,
      created_at: "2026-08-02T08:00:00+00:00",
      disabled_at: null,
    },
    {
      user_id: "u-3",
      username: "retired",
      display_name: "Former Member",
      role: "USER",
      status: "DISABLED",
      must_change_password: false,
      locked_until: null,
      created_at: "2026-05-11T08:00:00+00:00",
      disabled_at: "2026-08-09T10:00:00+00:00",
    },
  ],
};

const ALPHA_VERSION = {
  alpha_id: "vb-momentum-alpha",
  version: "0.3.1",
  name: "VB Momentum Alpha",
  entrypoint: "alphas.vb_momentum:build",
  artifact_digest: "sha256:11112222333344445555666677778888aaaabbbbccccddddeeeeffff00001111",
  lifecycle: {
    stage: "RESEARCH",
    certification: null,
    promotion_evidence: [],
    quarantined: false,
    quarantine_reason: null,
  },
};

const ADMIN_SCREENS: Screen[] = [
  {
    name: "users-access",
    path: "/administration/users",
    ready: (page) => page.getByTestId("admin-users"),
  },
  {
    name: "alpha-version",
    path: "/research/quantbt/alphas/vb-momentum-alpha/0.3.1",
    ready: (page) => page.getByTestId("alpha-lifecycle-rail"),
  },
];

for (const theme of THEMES) {
  test.describe(`${theme} theme · administration`, () => {
    for (const screen of ADMIN_SCREENS) {
      test(`${screen.name} @ laptop`, async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 900 });
        await freezeClock(page);
        await usePreferences(page, theme);
        await stubPortalApi(page, "healthy");
        // Registered after the shared stubs so these win (reverse-order match).
        await page.route("**/api/admin/users", (route) =>
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(ADMIN_USERS),
          }),
        );
        await page.route("**/api/v1/alphas/*/versions/0.3.1", (route) =>
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(ALPHA_VERSION),
          }),
        );

        await page.goto(screen.path);
        await screen.ready(page).first().waitFor({ state: "visible" });
        await settle(page);

        await expect(page).toHaveScreenshot(`${screen.name}-${theme}-laptop.png`, {
          fullPage: true,
        });
      });
    }
  });
}

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
