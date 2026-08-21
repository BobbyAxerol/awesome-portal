/**
 * Hi-fi HTML export of the QuantBT Backtest domain and the screens around it.
 *
 * The point is a handoff a designer can open in a browser and redraw from, so
 * the export is a *capture*, not a rewrite: each screen is rendered by the real
 * production build against the same recorded fixtures the visual baseline uses,
 * then the live DOM is frozen to a standalone file.
 *
 * Freezing means four things, and each of them is what keeps the file honest:
 *  - every stylesheet rule is inlined, so the file needs no build to render;
 *  - `<script>` is stripped, so React cannot re-mount and rewrite the DOM it
 *    was captured from — the file is the rendered result, not the app;
 *  - ECharts draws to canvas, and a canvas serialises as an empty box, so each
 *    one becomes a PNG `<img>` at its own size and position;
 *  - fonts are copied beside the HTML and their URLs rewritten to relative,
 *    so the folder is portable off this machine.
 *
 * A PNG of each screen is written next to its HTML, because a static reference
 * shot is what most redraw work actually starts from.
 */
import { mkdirSync, writeFileSync, readdirSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  FIXTURE_RUN_ID,
  FIXTURE_RUNNING_RUN_ID,
  freezeClock,
  settle,
  stubPortalApi,
  stubRunApi,
  usePreferences,
  type AuthStubState,
  type ThemeName,
} from "./fixtures";

const OUT_DIR = process.env.HIFI_OUT ?? "/out";
const DIST = join(dirname(fileURLToPath(import.meta.url)), "../dist/assets");

/** Desktop analysis width — the one v0.4 §26.1 sends research work to. */
const VIEWPORT = { width: 1440, height: 1024 };

const THEMES: { name: ThemeName; label: string }[] = [
  { name: "research", label: "Research Light" },
  { name: "operations", label: "Operations Dark" },
];

interface Screen {
  /** File stem, prefixed so the folder reads in flow order. */
  name: string;
  title: string;
  path: string;
  ready: (page: Page) => Locator;
  /** Auth state to put the shell into; defaults to a signed-in session. */
  auth?: AuthStubState;
  /** Endpoints this screen needs that the shared stubs do not serve. */
  extra?: (page: Page) => Promise<void>;
  /** Interaction to perform after load, for states that need one. */
  after?: (page: Page) => Promise<void>;
  /**
   * Accept a page whose diagrams have not all drawn.
   *
   * `settle` insists every `.mermaid` became an `<svg>`, which is right for a
   * pixel baseline. Continuous mode mounts all sixteen sections at once and
   * mermaid does not finish them inside the window, so for this one capture a
   * diagram still in source form is the honest state of the screen rather than
   * a reason to produce no file at all.
   */
  allowUnsettled?: boolean;
}

/** Synthetic bodies, copied from the visual baseline — no real principal. */
const ADMIN_USERS = {
  users: [
    { user_id: "u-1", username: "bobby", display_name: "Bobby", role: "ADMIN", status: "ACTIVE", must_change_password: false, locked_until: null, created_at: "2026-07-01T08:00:00+00:00", disabled_at: null },
    { user_id: "u-2", username: "analyst", display_name: "Quant Analyst", role: "USER", status: "ACTIVE", must_change_password: true, locked_until: null, created_at: "2026-08-02T08:00:00+00:00", disabled_at: null },
    { user_id: "u-3", username: "retired", display_name: "Former Member", role: "USER", status: "DISABLED", must_change_password: false, locked_until: null, created_at: "2026-05-11T08:00:00+00:00", disabled_at: "2026-08-09T10:00:00+00:00" },
  ],
};

const ALPHA_VERSION = {
  alpha_id: "vb-momentum-alpha",
  version: "0.3.1",
  name: "VB Momentum Alpha",
  entrypoint: "alphas.vb_momentum:build",
  artifact_digest: "sha256:11112222333344445555666677778888aaaabbbbccccddddeeeeffff00001111",
  lifecycle: { stage: "RESEARCH", certification: null, promotion_evidence: [], quarantined: false, quarantine_reason: null },
};

const run = (tab: string) => `/research/quantbt/runs/${FIXTURE_RUN_ID}/${tab}`;
const figure = (page: Page) => page.locator("figure[data-fig='1']");

const SCREENS: Screen[] = [
  /* --- The way in --------------------------------------------------- */
  {
    name: "01-login",
    title: "Sign in (Frame 01B)",
    path: "/",
    auth: "APP_LOGIN_REQUIRED",
    ready: (page) => page.getByTestId("login-screen"),
  },
  {
    name: "02-command-center",
    title: "Command Center",
    path: "/",
    ready: (page) => page.getByRole("heading", { level: 1, name: "Command Center" }),
  },
  {
    name: "03-portal-map",
    title: "Portal Map",
    path: "/portal-map",
    ready: (page) => page.locator(".portal-map"),
  },

  /* --- QuantBT Backtest ---------------------------------------------- */
  {
    name: "04-run-library",
    title: "QuantBT · Run Library",
    path: "/research/quantbt/runs",
    // The module header owns the other `h1` ("QuantBT Backtest"), so the
    // library is addressed by its own title rather than by level.
    ready: (page) => page.getByRole("heading", { name: "Run Library" }),
  },
  {
    name: "05-new-run",
    title: "QuantBT · New Run",
    path: "/research/quantbt/new",
    ready: (page) => page.getByRole("heading", { level: 2, name: "New Run" }),
  },
  {
    name: "06-run-progress",
    title: "QuantBT · Run Progress (running)",
    path: `/research/quantbt/runs/${FIXTURE_RUNNING_RUN_ID}/overview`,
    ready: (page) => page.getByText(/fold timeline|Window timeline/i),
  },
  { name: "07-run-overview", title: "QuantBT · Overview", path: run("overview"), ready: figure },
  { name: "08-run-optimization", title: "QuantBT · Optimization", path: run("optimization"), ready: figure },
  { name: "09-run-parameters", title: "QuantBT · Parameters", path: run("parameters"), ready: figure },
  { name: "10-run-execution", title: "QuantBT · Execution", path: run("execution"), ready: figure },
  {
    name: "11-run-audit",
    title: "QuantBT · Audit",
    path: run("audit"),
    ready: (page) => page.getByRole("heading", { level: 1 }),
  },
  {
    name: "12-alpha-imports",
    title: "QuantBT · Alpha Imports",
    path: "/research/quantbt/imports",
    ready: (page) => page.getByTestId("import-summary"),
  },
  {
    name: "13-alpha-version",
    title: "QuantBT · Alpha 360°",
    path: "/research/quantbt/alphas/vb-momentum-alpha/0.3.1",
    ready: (page) => page.getByTestId("alpha-lifecycle-rail"),
    extra: async (page) => {
      await page.route("**/api/v1/alphas/*/versions/0.3.1", (route) =>
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ALPHA_VERSION) }),
      );
    },
  },

  /* --- Screens the domain links to ------------------------------------ */
  {
    name: "14-users-access",
    title: "Administration · Users & Access",
    path: "/administration/users",
    ready: (page) => page.getByTestId("admin-users"),
    extra: async (page) => {
      await page.route("**/api/admin/users", (route) =>
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ADMIN_USERS) }),
      );
    },
  },
  {
    name: "15-planning-roadmap",
    title: "Planning · Roadmap",
    path: "/planning/roadmap",
    ready: (page) => page.getByTestId("roadmap-timeline"),
  },
  {
    name: "16-planning-board",
    title: "Planning · Task Board",
    path: "/planning/board",
    ready: (page) => page.getByTestId("task-board-feature"),
  },
  {
    name: "17-planning-reports",
    title: "Planning · Reports",
    path: "/planning/reports",
    ready: (page) => page.getByTestId("reports-feature"),
  },
  {
    name: "18-planning-docs",
    title: "Planning · Documents (section mode)",
    path: "/planning/docs",
    ready: (page) => page.getByTestId("docs-feature"),
  },
  {
    name: "19-planning-docs-whole",
    title: "Planning · Documents (whole document)",
    path: "/planning/docs",
    ready: (page) => page.getByTestId("docs-feature"),
    allowUnsettled: true,
    after: async (page) => {
      await page.getByRole("button", { name: "Whole document" }).click();
    },
  },
];

/**
 * Freezes the rendered page into one self-contained file.
 *
 * Runs entirely in the page because everything it needs — the CSSOM, the
 * painted canvases, the DOM as React left it — only exists there.
 */
async function freezeToHtml(page: Page, title: string): Promise<string> {
  return page.evaluate((documentTitle) => {
    // 1. Canvases first: `toDataURL` reads the painted bitmap, which is gone
    //    the moment anything re-lays-out the page.
    for (const canvas of Array.from(document.querySelectorAll("canvas"))) {
      let data: string;
      try {
        data = canvas.toDataURL("image/png");
      } catch {
        continue; // tainted canvas — leave the element alone rather than blank it
      }
      const img = document.createElement("img");
      img.src = data;
      img.setAttribute("data-was", "canvas");
      // The canvas carries its own absolute position and size from ECharts;
      // copying both attributes keeps the image exactly where it was drawn.
      if (canvas.getAttribute("style")) img.setAttribute("style", canvas.getAttribute("style")!);
      if (canvas.className) img.className = canvas.className;
      canvas.replaceWith(img);
    }

    // 2. Every rule the browser actually applied, in cascade order.
    const css: string[] = [];
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        for (const rule of Array.from(sheet.cssRules)) css.push(rule.cssText);
      } catch {
        css.push(`/* unreadable stylesheet: ${(sheet as CSSStyleSheet).href ?? "inline"} */`);
      }
    }

    // 3. Swap the link/style elements for one inlined block.
    for (const node of Array.from(document.querySelectorAll("link[rel='stylesheet'], style"))) {
      node.remove();
    }
    const style = document.createElement("style");
    style.textContent = css.join("\n");
    document.head.append(style);

    // 4. No scripts: a snapshot that boots React would replace itself with a
    //    loading state against an API that is not there. The module preloads go
    //    with them — they point at bundles this folder does not carry.
    for (const node of Array.from(
      document.querySelectorAll("script, link[rel='modulepreload'], link[rel='preload']"),
    )) {
      node.remove();
    }

    document.title = documentTitle;
    return document.documentElement.outerHTML;
  }, title);
}

test.beforeAll(() => {
  mkdirSync(join(OUT_DIR, "assets"), { recursive: true });
  mkdirSync(join(OUT_DIR, "png"), { recursive: true });
  // Fonts are the one asset the CSS still points at after inlining.
  for (const file of readdirSync(DIST)) {
    if (file.endsWith(".woff2") || file.endsWith(".woff") || file.endsWith(".ttf")) {
      copyFileSync(join(DIST, file), join(OUT_DIR, "assets", file));
    }
  }
});

for (const theme of THEMES) {
  test.describe(`${theme.label}`, () => {
    for (const screen of SCREENS) {
      test(`${screen.name} · ${theme.name}`, async ({ page }) => {
        await page.setViewportSize(VIEWPORT);
        await freezeClock(page);
        await usePreferences(page, theme.name);
        await stubPortalApi(page, "healthy", screen.auth ?? "AUTHENTICATED");
        await stubRunApi(page);
        if (screen.extra) await screen.extra(page);

        const rest = async () => {
          if (screen.allowUnsettled) {
            await settle(page).catch(() => page.waitForTimeout(4000));
          } else {
            await settle(page);
          }
        };

        await page.goto(screen.path);
        await screen.ready(page).first().waitFor({ state: "visible" });
        await rest();
        if (screen.after) {
          await screen.after(page);
          await rest();
        }

        const stem = `${screen.name}-${theme.name}`;
        // PNG before the freeze — freezing removes the scripts and rewrites the
        // DOM, so a shot taken after it would not be the live screen.
        await page.screenshot({ path: join(OUT_DIR, "png", `${stem}.png`), fullPage: true });

        const html = (await freezeToHtml(page, `${screen.title} — ${theme.label}`))
          // Relative so the folder works from `file://` anywhere.
          .replaceAll('url("/assets/', 'url("assets/')
          .replaceAll("url('/assets/", "url('assets/")
          .replaceAll("url(/assets/", "url(assets/");

        const header = [
          "<!doctype html>",
          `<!-- QuantBT Portal hi-fi capture`,
          `     screen: ${screen.title}`,
          `     route:  ${screen.path}`,
          `     theme:  ${theme.label} (${theme.name})`,
          `     width:  ${VIEWPORT.width}px`,
          `     source: production build, recorded fixtures (visual-baseline-run)`,
          `     note:   rendered DOM with CSS inlined and scripts stripped —`,
          `             it is the screen as captured, not a re-drawing of it.`,
          `-->`,
        ].join("\n");

        writeFileSync(join(OUT_DIR, `${stem}.html`), `${header}\n${html}\n`, "utf8");
        expect(html.length).toBeGreaterThan(2000);
      });
    }
  });
}
