/**
 * Deterministic Portal backend for the visual baseline.
 *
 * Every Portal endpoint is answered from the canonical fixtures in
 * `apps/portal/registry/fixtures/` — the same files the unit tests read. The
 * suite never talks to a running backend: a screenshot that depends on live
 * data is not a baseline, and inventing a response here would put a second
 * feature model in the repo (FRONTEND_HANDOFF §2).
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import type { Page } from "@playwright/test";

const REGISTRY = join(dirname(fileURLToPath(import.meta.url)), "../../registry");

function fixture(relative: string): unknown {
  return JSON.parse(readFileSync(join(REGISTRY, relative), "utf8"));
}

/** Summary fixtures, by the state each one demonstrates. */
export type SummaryState = "healthy" | "partial" | "unavailable" | "stale" | "empty" | "denied";

export const THEMES = ["research", "operations"] as const;
export type ThemeName = (typeof THEMES)[number];

/**
 * Breakpoints from v0.4 §26: phone, tablet, laptop and the operator
 * workstation the Operations theme is designed for.
 */
export const BREAKPOINTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 834, height: 1112 },
  { name: "laptop", width: 1280, height: 900 },
  { name: "workstation", width: 1728, height: 1080 },
] as const;

/**
 * The instant every screenshot is taken at.
 *
 * Freshness is computed against "now", so without a frozen clock the stale
 * badges and age labels would differ on every run and the baseline would
 * churn. This is deliberately AFTER the `as_of` values in the healthy fixture
 * so the shell renders its normal, non-stale state.
 */
export const FROZEN_NOW = new Date("2026-08-17T12:00:00.000Z");

/** Recorded run responses + the digest of the artifacts they came from. */
const RUN_RESPONSES = join(dirname(fileURLToPath(import.meta.url)), "run-responses");

interface RunResponseIndex {
  source: string;
  source_digest: string;
  running_source: string;
  running_source_digest: string;
  run_id: string;
  running_run_id: string;
  /** Recorded status is replayed too: `summary` answers 409 for a live run. */
  endpoints: Record<string, { file: string; status: number }>;
}

export function runResponseIndex(): RunResponseIndex {
  return JSON.parse(readFileSync(join(RUN_RESPONSES, "index.json"), "utf8")) as RunResponseIndex;
}

/** The completed run the recorded responses describe. */
export const FIXTURE_RUN_ID = "visual-baseline-run";
/** The non-terminal run, for the Run Progress screen. */
export const FIXTURE_RUNNING_RUN_ID = "visual-baseline-run-running";

/**
 * Digest of the run fixture directory, recomputed the same way the exporter does.
 *
 * The baseline replays recorded responses, so if the run fixture is regenerated
 * and the responses are not, the screenshots would keep baselining stale
 * numbers. Comparing this against `index.json` is what turns that into a
 * failing test instead of a silent lie.
 */
export function runFixtureDigest(runId: string = FIXTURE_RUN_ID): string {
  const root = join(REGISTRY, "fixtures/runs", runId);
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push(relative(root, full).split(sep).join("/"));
    }
  };
  walk(root);
  // Sort key is the relative POSIX path, matching the exporter exactly — an
  // absolute-string or per-directory sort disagrees with Python's ordering.
  const hash = createHash("sha256");
  for (const relativePath of files.sort()) {
    hash.update(relativePath);
    hash.update(readFileSync(join(root, relativePath)));
  }
  return `sha256:${hash.digest("hex")}`;
}

/**
 * Serves the run endpoints from the recorded responses.
 *
 * Bodies come from `apps/portal/scripts/export_run_responses.py`, which serves
 * the committed run fixture through the real FastAPI app — so these are the
 * API's own output, not invented run data.
 */
export async function stubRunApi(page: Page): Promise<void> {
  const index = runResponseIndex();
  for (const [url, recorded] of Object.entries(index.endpoints)) {
    const body = readFileSync(join(RUN_RESPONSES, recorded.file), "utf8");
    // The recorded key includes the query string, so a view asking for a
    // different `max_points` does not silently get another view's envelope.
    const [pathname, search = ""] = url.split("?");
    await page.route(`**${pathname}${search ? `?${search}` : ""}`, (route) =>
      route.fulfill({ status: recorded.status, contentType: "application/json", body }),
    );
  }
}

/**
 * Auth states the baseline can put the shell into.
 *
 * `AUTHENTICATED` is what every non-auth screenshot needs: the gateway is on
 * now, so without this the AuthGate would block the shell and every snapshot
 * would capture a login frame instead.
 */
export type AuthStubState =
  | "AUTHENTICATED"
  | "APP_LOGIN_REQUIRED"
  | "PASSWORD_CHANGE_REQUIRED"
  | "ACCESS_REQUIRED"
  | "ACCOUNT_DISABLED";

/** Serves the Portal contract endpoints from the canonical fixtures. */
export async function stubPortalApi(
  page: Page,
  summary: SummaryState = "healthy",
  authState: AuthStubState = "AUTHENTICATED",
): Promise<void> {
  const registry = fixture("fixtures/registry.public.json");
  const links = fixture("fixtures/links.public.json");
  const summaryDocument = fixture(`fixtures/summary.${summary}.json`);

  const json = async (route: Parameters<Parameters<Page["route"]>[1]>[0], body: unknown) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      // The shell sends `If-None-Match`; answering 200 with a stable ETag keeps
      // the fixture authoritative without exercising the 304 path here.
      headers: { etag: '"visual-baseline"', "cache-control": "no-cache, must-revalidate" },
      body: JSON.stringify(body),
    });

  // Playwright matches routes in REVERSE registration order, so the catch-all
  // has to be registered FIRST for the specific handlers below to win. It
  // exists so that an endpoint the suite forgot fails loudly instead of
  // rendering a silently empty screen — which is what it did on the first run,
  // when it was registered last and swallowed every request.
  await page.route("**/api/**", (route) =>
    route.fulfill({
      status: 501,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "not_stubbed", message: `visual baseline has no fixture for ${route.request().url()}` },
      }),
    }),
  );

  await page.route("**/api/v1/portal/registry", (route) => void json(route, registry));
  await page.route("**/api/v1/portal/links", (route) => void json(route, links));
  await page.route("**/api/v1/portal/summary", (route) => void json(route, summaryDocument));
  await page.route("**/api/v1/portal/capabilities", (route) =>
    void json(route, fixture("engine-capabilities.v1.json")),
  );
  await page.route("**/api/v1/alphas", (route) => void json(route, fixture("alphas.v1.json")));

  // The identity BFF. Pinned values only: no real principal, no real token.
  await page.route("**/api/auth/context", (route) =>
    void json(route, {
      state: authState,
      principal:
        authState === "AUTHENTICATED"
          ? {
              principalId: "principal-visual-baseline",
              username: "bobby",
              role: "ADMIN",
              sessionId: "session-visual-baseline",
              mustChangePassword: false,
              authnMethods: ["access", "password"],
              issuedAt: "2026-08-17T09:00:00+00:00",
              exp: 2000000000,
            }
          : null,
      access_identity: { sub: "access-sub-baseline", email: "name@azdag.com" },
    }),
  );
}

/**
 * Pins theme and density before the app boots.
 *
 * Preferences live in localStorage, so this must run as an init script — a
 * click on the theme toggle after load would capture a transition frame.
 */
export async function usePreferences(page: Page, theme: ThemeName): Promise<void> {
  await page.addInitScript(
    ([storageKey, value]) => {
      window.localStorage.setItem(storageKey as string, value as string);
    },
    [
      "portal.preferences.v1",
      JSON.stringify({
        theme,
        // The Operations theme is designed to be read at operational density;
        // pairing them is what the baseline is supposed to show.
        density: theme === "operations" ? "operational" : "comfortable",
        showCommissioned: true,
        sidebarCollapsed: false,
      }),
    ],
  );
}

/** Freezes time so freshness labels do not rewrite the baseline. */
export async function freezeClock(page: Page): Promise<void> {
  await page.clock.install({ time: FROZEN_NOW });
}

/**
 * Removes the last sources of per-run pixel noise.
 *
 * Caret blink and CSS transitions are disabled by Playwright's
 * `animations: "disabled"`, but ECharts renders to canvas on its own timer and
 * mermaid measures text asynchronously, so both need to have settled before
 * the shutter opens.
 */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => {
    const pending = document.querySelectorAll("[role='status']").length;
    return pending === 0 || document.querySelector("main") !== null;
  });
  // Mermaid renders asynchronously (dynamic import, then a layout pass), so a
  // `pre.mermaid` that has not become an `svg` yet means the shutter would open
  // mid-render. This was a real, repeatable failure on the Reports print shot.
  await page.waitForFunction(
    () => {
      // mermaid keeps the `.mermaid` element and replaces its contents with an
      // `<svg>`; a failed render removes the element entirely, so "no diagrams"
      // and "all diagrams drawn" are both settled states.
      const diagrams = Array.from(document.querySelectorAll(".mermaid"));
      return diagrams.every((node) => node.querySelector("svg") !== null);
    },
    undefined,
    { timeout: 15_000 },
  );
  // One frame after layout, so canvas charts have painted at the final size.
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
}
