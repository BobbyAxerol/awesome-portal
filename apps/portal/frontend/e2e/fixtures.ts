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

/**
 * A response fixture owned by this suite rather than by the registry.
 *
 * P09 published no canonical fixture for either foundation read, so these two
 * are generated from the repository's own sources — the journey descriptor
 * module and the engine catalog — and regenerated when those change. Recorded
 * as `CG-P09-02`: the durable fix is for the contract package to publish them
 * beside the other `*.valid.json` files.
 */
function local(name: string): unknown {
  return JSON.parse(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), "research-foundation", name), "utf8"),
  );
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
  | "ACTIVATION_RECOVERY_REQUIRED"
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

  // The QuantBT module header reads these on every route it owns. They were
  // unstubbed, so the catch-all answered 501 and every QuantBT screen carried
  // two console errors that had nothing to do with the screen. Empty is the
  // truthful answer for a fixture environment with no runs.
  await page.route("**/api/runs", (route) => void json(route, []));
  await page.route("**/api/strategies", (route) => void json(route, []));

  // P08/P10 · the preflight preview and the run producer. Both answer the
  // product route's own writes, so Screen 02 can be driven end to end without
  // a backend.
  await page.route("**/api/v1/research/preflights*", (route) =>
    void json(route, local("preflight.json")),
  );
  await page.route("**/api/v1/research/runs", (route) => void json(route, local("run-create.json")));

  /*
   * P11 · the progress stream.
   *
   * One heartbeat and then end-of-body. EventSource sees the close as an
   * error, which is precisely the handover the screen must perform: close the
   * stream and fall back to the 5-second poll floor rather than letting the
   * native reconnect spin. Leaving the route unstubbed would have produced a
   * 501 and two console errors that say nothing about the screen.
   */
  await page.route("**/api/v1/research/runs/*/events*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      headers: { "cache-control": "no-store" },
      body:
        'data: {"schema_version":"research.progress-stream.v1","event_type":"research.progress.heartbeat","terminal":false}\n\n',
    }),
  );

  // P11 · the progress read and console page.
  await page.route("**/api/v1/research/runs/*/progress*", (route) =>
    void json(route, local("progress-read.json")),
  );
  await page.route("**/api/v1/research/runs/*/console*", (route) =>
    void json(route, local("progress-console.json")),
  );
  await page.route("**/api/v1/research/runs/*/cancel", (route) =>
    void json(route, {
      schema_version: "research.progress-cancel.v1",
      run_id: "run_01HZQ7PROBE",
      status: "CANCEL_REQUESTED",
      source_marker: "REQUESTED",
    }),
  );

  // P09 · the two Research foundation BFF reads. The journey descriptor is
  // generated from `journey.descriptor.ts` and the Atlas from
  // `research-engine-catalog.v1.json`, so the probe renders the facts the
  // server actually serves rather than a hand-written approximation.
  // P07 registry, now carrying the safe version declaration Screen 02's
  // validators read. Generated from the same shape the contract publishes.
  await page.route("**/api/v1/research/alphas*", (route) =>
    void json(route, local("alpha-registry.json")),
  );

  await page.route("**/api/v1/research/journey*", (route) =>
    void json(route, local("journey.json")),
  );
  await page.route("**/api/v1/research/quantbt/atlas*", (route) => {
    const url = new URL(route.request().url());
    const historical = url.searchParams.get("release_id") === "er_quantbt_108";
    return void json(route, local(historical ? "atlas-historical.json" : "atlas.json"));
  });

  // Service health, read by the sign-in plate before any session exists. Pinned
  // versions: the strip prints them, so a real deployment's version would
  // rewrite the baseline on every release.
  await page.route("**/api/health", (route) =>
    void json(route, { status: "ok", service: "portal-api", version: "0.1.0" }),
  );
  await page.route("**/api/control/healthz", (route) =>
    void json(route, { status: "ok", service: "control-api", version: "0.1.0" }),
  );

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

  /*
   * A4-1 · what the signed-in baseline principal may do.
   *
   * The shell stopped deriving authority from `principal.role` and now asks
   * the server. Without this route the baseline principal is "not the owner",
   * the owner link leaves the top bar, and twenty-three Research and Planning
   * snapshots shift at the narrow breakpoints — a fixture gap that would read
   * as a design change. The baseline has always depicted the administrator's
   * view, so the stub answers for the same person the `principal` above
   * describes.
   */
  /*
   * A4-2 · the owner account control desk.
   *
   * Stubbed here for the same reason `/access/self` is: the shell asks for
   * these on the Users & Access route, and an unstubbed route falls to the 501
   * catch-all — which shifts the layout and floods the zero-console-error
   * test, so a fixture gap would read as a design change.
   *
   * The roster is pinned, not generated: a baseline whose rows move is not a
   * baseline. Step-up is REQUIRED so the recorded screen shows the state an
   * owner actually arrives in.
   */
  await page.route("**/api/admin/accounts", (route) =>
    void json(route, {
      schema_version: "portal.account-roster.v1",
      record_authority: "PORTAL_CONTROL",
      accounts: [
        {
          user_id: "usr_baseline_bobby",
          username: "bobby",
          display_name: "Bobby",
          role: "ADMIN",
          account_state: "ACTIVE",
          must_change_password: false,
          account_revision: 12,
          locked: false,
        },
        {
          user_id: "usr_baseline_stan",
          username: "stan",
          display_name: "Stan",
          role: "USER",
          account_state: "ACTIVE",
          must_change_password: false,
          account_revision: 7,
          locked: false,
        },
        {
          user_id: "usr_baseline_thanh",
          username: "thanhvuong",
          display_name: "Thanh Vuong",
          role: "USER",
          account_state: "DISABLED",
          must_change_password: true,
          account_revision: 4,
          locked: true,
        },
        {
          user_id: "usr_baseline_former",
          username: "former-analyst",
          display_name: "Former Analyst",
          role: "USER",
          account_state: "ARCHIVED",
          must_change_password: false,
          account_revision: 21,
          locked: false,
        },
      ],
    }),
  );

  /*
   * A4-D13 · one account's detail, served for the expanded-row baseline.
   *
   * Registered after the roster route so the more specific pattern is the one
   * that answers `/accounts/<id>`; without it that read falls to the 501
   * catch-all, the history panel renders its failure state, and a fixture gap
   * would photograph as a design regression.
   */
  await page.route("**/api/admin/accounts/*", (route) =>
    void json(route, {
      schema_version: "portal.account-detail.v1",
      record_authority: "PORTAL_CONTROL",
      account: {
        user_id: "usr_baseline_stan",
        username: "stan",
        display_name: "Stan",
        role: "USER",
        account_state: "ACTIVE",
        must_change_password: false,
        account_revision: 7,
        locked: false,
      },
      history: [
        {
          operation_id: "alo_baseline_2",
          action: "REVOKE_SESSIONS",
          outcome: "APPLIED",
          reason_code: null,
          expected_revision: 6,
          resulting_revision: 7,
          rollback_description: "Sessions cannot be restored; the account signs in again.",
          step_up_used: true,
          occurred_at: "2026-09-15T04:12:00Z",
        },
        {
          operation_id: "alo_baseline_1",
          action: "ISSUE_ACTIVATION",
          outcome: "APPLIED",
          reason_code: null,
          expected_revision: 5,
          resulting_revision: 6,
          rollback_description: "Reissue to revoke this credential and issue another.",
          step_up_used: true,
          occurred_at: "2026-09-14T09:30:00Z",
        },
      ],
    }),
  );

  /*
   * A4-3 · the Governance policy matrix.
   *
   * Pinned rather than generated, and deliberately showing all three cell
   * states the grid can be in: a direct grant, the read implied by a decide,
   * and an account with no Portal access at all. A baseline that only shows
   * the empty grid proves nothing about the thing this screen exists to say.
   */
  await page.route("**/api/admin/profile-access", (route) =>
    void json(route, {
      schema_version: "portal.profile-access.v1",
      record_authority: "PORTAL_CONTROL",
      accounts: [
        {
          user_id: "usr_baseline_bobby",
          username: "bobby",
          display_name: "Bobby",
          is_owner: true,
          account_state: "ACTIVE",
          capabilities: [],
        },
        {
          user_id: "usr_baseline_stan",
          username: "stan",
          display_name: "Stan",
          is_owner: false,
          account_state: "ACTIVE",
          capabilities: [
            { capability: "governance.r1.read", grant_id: "grn_1", workspace_id: null, grant_revision: 1 },
            { capability: "governance.r2.decide", grant_id: "grn_2", workspace_id: null, grant_revision: 2 },
          ],
        },
        {
          user_id: "usr_baseline_thanh",
          username: "thanhvuong",
          display_name: "Thanh Vuong",
          is_owner: false,
          account_state: "ACTIVE",
          capabilities: [
            { capability: "governance.canary.read", grant_id: "grn_3", workspace_id: null, grant_revision: 1 },
          ],
        },
        {
          user_id: "usr_baseline_former",
          username: "former-analyst",
          display_name: "Former Analyst",
          is_owner: false,
          account_state: "ARCHIVED",
          capabilities: [],
        },
      ],
    }),
  );

  await page.route("**/api/admin/profile-access/activity**", (route) =>
    void json(route, {
      schema_version: "portal.profile-access-activity.v1",
      activity: [],
    }),
  );

  await page.route("**/api/admin/step-up", (route) =>
    void json(route, {
      schema_version: "portal.owner-step-up.v1",
      state: "REQUIRED",
      expires_at: null,
    }),
  );

  await page.route("**/api/admin/access/self", (route) =>
    void json(route, {
      schema_version: "portal.owner-access.v1",
      record_authority: "PORTAL_CONTROL",
      user_id: "principal-visual-baseline",
      is_owner: authState === "AUTHENTICATED",
      owner_state: authState === "AUTHENTICATED" ? "OWNER" : "NOT_OWNER",
      capabilities:
        authState === "AUTHENTICATED"
          ? [
              "administration.profile_access.manage",
              "administration.users.manage",
              "governance.canary.decide",
              "governance.canary.read",
              "governance.live.decide",
              "governance.live.read",
              "governance.r1.decide",
              "governance.r1.read",
              "governance.r2.decide",
              "governance.r2.read",
            ]
          : [],
      mutation_requirements: {
        origin: "REQUIRED",
        csrf: "REQUIRED",
        step_up: "REQUIRED_FOR_DESTRUCTIVE",
      },
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
  // Do not await `document.fonts.ready` itself.  That browser-owned Promise
  // is invalidated if a route finishes its last navigation between the call
  // being scheduled and the renderer completing it, which leaves Playwright
  // with "Resulting promise was garbage collected" under parallel visual
  // runs.  Polling the stable status is equivalent for the shutter while
  // remaining bound to Playwright's navigation-aware execution context.
  await page.waitForFunction(() => !document.fonts || document.fonts.status === "loaded");
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
  // Charts size themselves from the layout they were born into; a column that
  // widened after a sibling mounted leaves a narrower canvas behind. One resize
  // event after everything settled puts every canvas at its final width, and
  // two frames let the repaint land before the shutter opens.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        window.dispatchEvent(new Event("resize"));
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}
