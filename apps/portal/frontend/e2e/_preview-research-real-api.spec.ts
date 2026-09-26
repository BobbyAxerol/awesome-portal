/**
 * RF02-F4 · REAL_API_E2E_RECEIPT — the Research foundation screens on the
 * isolated preview stack (RF02-B3), against real reads.
 *
 * Nothing is stubbed: the browser signs in through the real BFF as
 * `claude-preview`, and every screen reads the run `seed-run.mjs` produced
 * through P10 → P06 → P11. The receipt is valid only for the commit recorded
 * in the preview's identity.json; screenshots and the request log are written
 * outside the repository (RESEARCH_PREVIEW_RECEIPTS).
 *
 * Run: npx playwright test -c playwright.research-preview.config.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { expect, test, type Locator, type Page } from "@playwright/test";

const HOME = `${process.env.HOME}/.config/portal-research-preview`;
const OUT = process.env.RESEARCH_PREVIEW_RECEIPTS ?? `${HOME}/receipts`;
mkdirSync(OUT, { recursive: true, mode: 0o700 });
const PASSWORD = readFileSync(`${HOME}/claude-preview.password`, "utf8").trim();
const RUN = (JSON.parse(readFileSync(`${HOME}/seeded-run.json`, "utf8")) as { run_id: string }).run_id;
const ORIGIN = process.env.RESEARCH_PREVIEW_ORIGIN ?? "http://localhost:8095";

const VIEWPORTS = [
  ["laptop", 1280, 900],
  ["mobile", 660, 900],
] as const;

interface Observed {
  requests: string[];
  failures: string[];
  /** Problem codes of refused reads, read from the response body. */
  refusalCodes: string[];
  noise: string[];
}

/**
 * Typed refusals a real run may legitimately produce. Chrome logs one
 * resource error for each before any application code runs; it is accepted
 * only for these codes, and only when the screen says what the code means.
 */
const EXPECTED_REFUSALS: Record<string, RegExp> = {
  // RS-02: this preview has no retention materializer, so a completed run's
  // retained current source stays PENDING_RETENTION.
  RESEARCH_CURRENT_SOURCE_CONFLICT: /pending retention/,
};

function observe(page: Page): Observed {
  const observed: Observed = { requests: [], failures: [], refusalCodes: [], noise: [] };
  page.on("response", async (response) => {
    const url = new URL(response.url());
    if (!url.pathname.startsWith("/api/")) return;
    observed.requests.push(`${response.request().method()} ${url.pathname} ${response.status()}`);
    if (response.status() >= 400) {
      observed.failures.push(`${url.pathname} ${response.status()}`);
      try {
        const body = (await response.json()) as { error?: { code?: string } };
        if (body.error?.code) observed.refusalCodes.push(body.error.code);
      } catch {
        observed.refusalCodes.push("UNTYPED");
      }
    }
  });
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") observed.noise.push(`${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => observed.noise.push(`pageerror: ${error}`));
  return observed;
}

/**
 * W6a: read the API from inside the page. Behind a dev proxy that carries the
 * stack's public (https) Origin, the session cookie is Secure: the browser
 * sends it to http://127.0.0.1, Playwright's request context does not.
 */
async function pageGet(page: Page, path: string): Promise<{ status: number; body: any }> {
  return page.evaluate(async (url) => {
    const response = await fetch(url, { credentials: "same-origin" });
    return { status: response.status, body: await response.json() };
  }, path);
}

async function signIn(page: Page) {
  const response = await page.request.post("/api/auth/login", {
    data: { username: "claude-preview", credential: PASSWORD },
    headers: { origin: ORIGIN },
  });
  expect(response.status(), "real BFF sign-in").toBeLessThan(300);
}


const SCREENS = [
  ["S01", "/research/quantbt/runs", "[data-screen='run-library']"],
  ["S03", `/research/quantbt/runs/${RUN}/progress`, "[data-screen='run-progress']"],
  ["S04", `/research/quantbt/runs/${RUN}/evidence`, "[data-screen='evidence-flow']"],
  ["S05", `/research/quantbt/runs/${RUN}/split`, "[data-screen='split-detail']"],
  ["S06", `/research/quantbt/runs/${RUN}/search`, "[data-screen='search-detail']"],
  ["S07", `/research/quantbt/runs/${RUN}/freeze`, "[data-screen='freeze-detail']"],
  ["S02", "/research/quantbt/runs/new", "[data-screen='new-run']"],
  ["S12", `/research/quantbt/atlas#tab=modes&run=${RUN}`, "[data-screen='engine-atlas']"],
] as const;

for (const [name, width, height] of VIEWPORTS) {
  for (const [screenId, path, selector] of SCREENS) {
    test(`${screenId} on real reads at ${name}`, async ({ page }) => {
      const observed = observe(page);
      await page.setViewportSize({ width, height });
      await signIn(page);
      await page.goto(path);
      await expect(page.locator(selector)).toBeVisible({ timeout: 20_000 });
      await page.waitForLoadState("networkidle");

      if (screenId === "S01") await expect(page.locator(`[data-run="${RUN}"]`).first()).toBeVisible();
      if (screenId === "S12") {
        await expect(page.locator('[data-mode="mode_1_decay"] [data-claim]')).toBeVisible();
        await page.locator('[data-mode="mode_1_decay"] [data-schedule="per_fold_decay"]').click();
        await expect(page.locator('[data-mode="mode_1_decay"] [data-claim]')).toHaveText("selection_adjusted_outer_oos");
        await expect(page.locator('[data-mode="mode_1_decay"] [data-formula-state="katex"]').first()).toBeVisible();
      }

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      await page.screenshot({ path: `${OUT}/${screenId}-${name}.png`, fullPage: true });
      // One file per test: a failing test restarts the worker, so an in-memory log would be lost.
      writeFileSync(
        `${OUT}/${screenId}-${name}.json`,
        JSON.stringify({ screen: screenId, viewport: name, path, overflow, requests: [...new Set(observed.requests)], failures: observed.failures, refusalCodes: observed.refusalCodes, noise: observed.noise }, null, 2),
        { mode: 0o600 },
      );

      for (const request of observed.requests) expect(request, `${screenId} reached a private route`).not.toMatch(/\/internal\//);
      expect(overflow, `${screenId} horizontal overflow at ${width}`).toBeLessThanOrEqual(1);
      const refusalsExplained = observed.refusalCodes.every((code) => code in EXPECTED_REFUSALS);
      expect(refusalsExplained, `${screenId} unexpected refusals: ${observed.refusalCodes.join(", ")}`).toBe(true);
      const text = (await page.locator(selector).textContent()) ?? "";
      for (const code of new Set(observed.refusalCodes)) {
        expect(text, `${screenId} does not say what ${code} means`).toMatch(EXPECTED_REFUSALS[code]!);
      }
      const unexplained = observed.noise.filter(
        (line) => !(refusalsExplained && /^error: Failed to load resource: the server responded with a status of 409 /.test(line)),
      );
      expect(unexplained, `${screenId} console:\n${observed.noise.join("\n")}`).toEqual([]);
    });
  }
}

/**
 * W1–W3 · the same screens on a real Delta signal-notional WFO run
 * (`SEED_PROFILE=wfo node scripts/research-preview/seed-run.mjs`). Beyond
 * "renders cleanly", each screen is checked against the value the real API
 * served for that run (V11 BR: what the page says equals what the server said).
 */
const WFO_SEED = `${HOME}/seeded-wfo-run.json`;
const WFO_RUN = existsSync(WFO_SEED) ? (JSON.parse(readFileSync(WFO_SEED, "utf8")) as { run_id: string }).run_id : null;
const minus = (value: string | number) => {
  const fixed = Number(value).toFixed(2);
  return fixed.startsWith("-") ? `−${fixed.slice(1)}` : fixed;
};

const WFO_SCREENS = [
  ["S03", "progress", "[data-screen='run-progress']"],
  ["S04", "evidence", "[data-screen='evidence-flow']"],
  ["S05", "split", "[data-screen='split-detail']"],
  ["S06", "search", "[data-screen='search-detail']"],
  ["S07", "freeze", "[data-screen='freeze-detail']"],
  ["S08", "execute", "[data-screen='execute-replay']"],
] as const;

for (const [name, width, height] of VIEWPORTS) {
  for (const [screenId, leaf, selector] of WFO_SCREENS) {
    test(`WFO ${screenId} on real reads at ${name}`, async ({ page }) => {
      test.skip(!WFO_RUN, "no seeded WFO run on this preview");
      const observed = observe(page);
      await page.setViewportSize({ width, height });
      await signIn(page);
      const read = async (lane: string) => (await (await page.request.get(`/api/v1/quantbt/runs/${WFO_RUN}/current-source/${lane}`)).json()) as any;
      await page.goto(`/research/quantbt/runs/${WFO_RUN}/${leaf}`);
      await expect(page.locator(selector)).toBeVisible({ timeout: 20_000 });
      await page.waitForLoadState("networkidle");

      if (screenId === "S03") {
        const progress = (await (await page.request.get(`/api/v1/research/runs/${WFO_RUN}/progress`)).json()) as any;
        expect(progress.current.effective_status).toBe("COMPLETED");
        await expect(page.locator(selector)).toContainText(progress.run.instrument.symbol ?? "BTCUSDT");
      }
      if (screenId === "S04") {
        const evidence = await read("evidence");
        await expect(page.locator("[data-retained-verdicts='AVAILABLE'] [data-verdict-row]")).toHaveCount(evidence.fold_verdicts.rows.length);
        const observations = evidence.passport.artifact_table_rows.observations as number;
        await expect(page.locator("[data-retained-sampling]").first()).toContainText(observations.toLocaleString("en-US"));
        await expect(page.locator("[data-claim-field='validation_claim']")).toHaveAttribute("data-claim-value", evidence.claim.validation_claim.value);
      }
      if (screenId === "S05") {
        const split = await read("split");
        await expect(page.locator("[data-fold-table-row]")).toHaveCount(split.fold_plan.folds.length);
      }
      if (screenId === "S06") {
        const search = await read("search");
        await expect(page.locator("[data-trial] [data-trial-is]")).toHaveCount(search.ledger.trials.length);
        await expect(page.locator("[data-role-card='selected']")).toContainText(minus(search.selection.objective));
      }
      /* W3b: a WFO run reads the retained lane; no P04-hub reason reaches the DOM (text, titles or data attributes). */
      const html = await page.locator(selector).innerHTML();
      expect(html, `${screenId} shows a P04-lane reason on a WFO run`).not.toMatch(
        /P13_SOURCE_EVIDENCE_NOT_PUBLISHED|P14_SOURCE_SPLIT_RECEIPT_NOT_PUBLISHED|P15_CURRENT_P04_SOURCE_RECEIPT_NOT_PUBLISHED|P16_DELTA_WFO_PROFILE_USES_RETAINED_CURRENT_SOURCE_FREEZE|P04_SOURCE_DID_NOT_PUBLISH_[A-Z_]+/,
      );
      expect(await page.locator(selector).innerText(), `${screenId} stale "not built" copy`).not.toMatch(/not built yet \(P1[79]\)|\(P19\) not built/);
      if (screenId === "S04") {
        const evidence = await read("evidence");
        await expect(page.locator("[data-metric-value='FINAL_EQUITY']")).toHaveAttribute("data-exact", evidence.passport.final_equity);
        await expect(page.locator("[data-metric-value='INITIAL_EQUITY']")).toHaveAttribute("data-exact", evidence.passport.initial_equity);
        await expect(page.locator("[data-not-ready]")).toHaveCount(0);
        await expect(page.locator("[data-series-panel='MONTHLY_RETURNS'] [data-month]")).toHaveCount(
          ((await (await page.request.get(`/api/v1/quantbt/runs/${WFO_RUN}/current-source/evidence/series?kind=MONTHLY_RETURNS`)).json()) as any).values.length,
        );
        await expect(page.locator("[data-series-panel='RETURN_DISTRIBUTION']")).toHaveAttribute("data-series-state", "ready");
      }
      if (screenId === "S05") {
        const requested = (await (await page.request.get(`/api/v1/research/runs/${WFO_RUN}/requested-spec`)).json()) as any;
        const wf = requested.requested_spec.walk_forward;
        await expect(page.locator("[data-protocol]").first()).toContainText(`advanced walk-forward · ${wf.frequency} · ${wf.window_mode}`);
        await expect(page.locator("[data-readiness]").first()).toContainText("READY");
        await expect(page.locator("[data-selection]").first()).toContainText("GLOBAL");
      }
      if (screenId === "S06") {
        const search = await read("search");
        await expect(page.locator("[data-run-mode]").first()).toContainText(search.search_contract.optimization_mode);
        await expect(page.locator("[data-run-schedule]").first()).toContainText(search.search_contract.optimization_schedule);
        await expect(page.locator("[data-readiness]").first()).toContainText("READY");
      }
      if (screenId === "S07") {
        const freeze = await read("freeze");
        await expect(page.locator("[data-frozen-param]")).toHaveCount(Object.keys(freeze.frozen_selection.parameters).length);
        await expect(page.locator("[data-integrity-state]").first()).toHaveAttribute("data-integrity-state", freeze.integrity.state);
      }
      if (screenId === "S08") {
        const replay = await read("replay");
        await expect(page.locator("[data-route-id]").first()).toContainText("signal_notional");
        // A seal retained after W5b carries the replay ledger (candles + per-bar
        // account facts): the screen replays candles. An older seal keeps the
        // retained sample ledger.
        if (replay.execution) {
          expect(await page.locator("[data-candle-row]").count(), "S08 replays the retained candles").toBeGreaterThan(0);
        } else {
          await expect(page.locator("[data-sample-ledger='retained']")).toBeVisible();
        }
        for (const key of ["orders", "fills", "candles"] as const) {
          const capability = replay.route_capabilities[key] as { state?: string; reason_code?: string | null };
          if (capability.reason_code) expect(html, `S08 ${key} carries the retained reason`).toContain(capability.reason_code);
        }
      }

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      await page.screenshot({ path: `${OUT}/WFO-${screenId}-${name}.png`, fullPage: true });
      writeFileSync(
        `${OUT}/WFO-${screenId}-${name}.json`,
        JSON.stringify({ screen: screenId, viewport: name, run: WFO_RUN, overflow, requests: [...new Set(observed.requests)], failures: observed.failures, refusalCodes: observed.refusalCodes, noise: observed.noise }, null, 2),
        { mode: 0o600 },
      );
      for (const request of observed.requests) expect(request, `${screenId} reached a private route`).not.toMatch(/\/internal\//);
      expect(overflow, `${screenId} horizontal overflow at ${width}`).toBeLessThanOrEqual(1);
      expect(observed.failures, `${screenId} failed reads`).toEqual([]);
      expect(observed.noise, `${screenId} console:\n${observed.noise.join("\n")}`).toEqual([]);
    });
  }
}

/**
 * W5c · Screens 09, 10, 11 and 13 on real reads (P18–P21).
 *
 * Run against a Vite dev server of *this* tree proxied to the preview API
 * (`vite.research-preview.config.ts`), because the preview serves an older
 * bundle. Every assertion compares what the page shows with what the real API
 * served for the same run in the same session. The S11 write flow — the one
 * part the preview must not be written to — is the only double: it is named
 * `DOUBLE` and intercepts only the PATCH, the POST, the pack read and the one
 * composition read that follows the doubled seal.
 */
const RC_RUNS: ReadonlyArray<readonly [string, string]> = [["P04", RUN], ...(WFO_RUN ? [["WFO", WFO_RUN] as const] : [])];
const ALPHA = "delta-rsi-polynomial-alpha";
const STATUS_TEXT: Record<string, string> = { "403": "Forbidden", "404": "Not Found", "409": "Conflict", "503": "Service Unavailable" };

/** A refused read the screen must name in words; only then is its Chrome resource error accepted. */
function explainedNoise(observed: Observed, allowed: Record<string, RegExp>, text: string): string[] {
  /* `UNTYPED` is the observer losing a race with navigation for the body; the test already read that refusal's code through the API. */
  for (const code of new Set(observed.refusalCodes.filter((value) => value !== "UNTYPED"))) {
    expect(code in allowed, `unexpected refusal ${code}`).toBe(true);
    expect(text, `the screen does not say what ${code} means`).toMatch(allowed[code]!);
  }
  const statuses = observed.failures.map((failure) => failure.split(" ").pop()!);
  return observed.noise.filter(
    (line) => !statuses.some((status) => line === `error: Failed to load resource: the server responded with a status of ${status} (${STATUS_TEXT[status]})`),
  );
}

type AxeViolation = { id: string; impact: string; nodes: { target: string[]; any: { data?: { fgColor?: string } }[] }[] };

async function axeBlocking(page: Page, selector: string) {
  await page.addScriptTag({ path: `${process.cwd()}/node_modules/axe-core/axe.min.js` });
  const violations = (await page.evaluate(async (scope) => {
    const axe = (window as unknown as { axe: { run: (context: unknown, options: unknown) => Promise<{ violations: unknown[] }> } }).axe;
    const result = await axe.run({ include: [[scope]] }, { resultTypes: ["violations"] });
    return result.violations;
  }, selector)) as AxeViolation[];
  return violations
    .filter((item) => item.impact === "serious" || item.impact === "critical")
    .flatMap((item) => item.nodes.map((node) => ({ id: item.id, target: node.target.join(" "), color: node.any[0]?.data?.fgColor })))
    /* D-B1: the shared --ink-faint contrast is a separately approved token change (RF-04); nothing else is ignored. */
    .filter((node) => !(node.id === "color-contrast" && node.color === "#939db0"));
}

async function finish(page: Page, name: string, observed: Observed, extra: Record<string, unknown> = {}) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  writeFileSync(
    `${OUT}/${name}.json`,
    JSON.stringify({ name, overflow, requests: [...new Set(observed.requests)], failures: observed.failures, refusalCodes: observed.refusalCodes, noise: observed.noise, ...extra }, null, 2),
    { mode: 0o600 },
  );
  for (const request of observed.requests) expect(request, `${name} reached a private route`).not.toMatch(/\/internal\//);
  expect(overflow, `${name} horizontal overflow`).toBeLessThanOrEqual(1);
}

/** What a reader sees in a region: its text without injected stylesheets (and, for S11, without the mirror's verbatim outcome vocabulary). */
async function visibleText(page: Page, selector: string): Promise<string> {
  return page.locator(selector).evaluate((node) => {
    const copy = node.cloneNode(true) as HTMLElement;
    copy.querySelectorAll("style, [data-mirror-ghost] .meta").forEach((element) => element.remove());
    return copy.textContent ?? "";
  });
}

for (const [name, width, height] of VIEWPORTS) {
  for (const [label, run] of RC_RUNS) {
    test(`W5c S11 ${label} composition on real reads at ${name}`, async ({ page }) => {
      const observed = observe(page);
      await page.setViewportSize({ width, height });
      await signIn(page);
      const api = (await (await page.request.get(`/api/v1/quantbt/runs/${run}/release-candidate`)).json()) as any;
      await page.goto(`/research/quantbt/runs/${run}/release-candidate`);
      const root = page.locator("[data-screen='release-candidate']");
      await expect(root.locator("[data-pack-row]")).toHaveCount(12, { timeout: 20_000 });
      await page.waitForLoadState("networkidle");

      /* 17 lines, in the server's order, each value exactly the server's (a null prints `null`). */
      await expect(root.locator("[data-yaml-key]")).toHaveCount(17);
      const lines = await root.locator("[data-yaml-key]").evaluateAll((nodes) => nodes.map((node) => [node.getAttribute("data-yaml-key"), node.getAttribute("data-yaml-value")]));
      expect(lines).toEqual(api.yaml.map((field: any) => [field.key, field.value ?? ""]));
      /* 12 rows, statuses and counter as served. */
      const rows = await root.locator("[data-pack-row]").evaluateAll((nodes) => nodes.map((node) => [node.getAttribute("data-pack-row"), node.getAttribute("data-status")]));
      expect(rows).toEqual(api.pack.map((item: any) => [item.key, item.status]));
      /* W7 · each row's digest and reason are the server's, row by row. */
      await expectRowsAsServed(root, api);
      const counts = api.pack_counts;
      await expect(root.locator("[data-pack-counts]")).toHaveText(`${counts.complete} COMPLETE · ${counts.degraded} DEGRADED · ${counts.input} INPUT · ${counts.missing} MISSING`);
      /* Rail tones, the server's seal reason, the typed publish ghost, the state chip. */
      const tones = await root.locator("[data-rail-key]").evaluateAll((nodes) => nodes.map((node) => [node.getAttribute("data-rail-key"), node.getAttribute("data-tone")]));
      expect(tones).toEqual(api.rail.map((node: any) => [node.key, node.tone]));
      await expect(root.locator("[data-seal-blocked]")).toHaveAttribute("data-seal-blocked", api.actions.seal_blocked_reason ?? "LOCAL");
      await expect(root.locator("[data-action='local-seal']")).toHaveAttribute("aria-disabled", "true");
      await expect(root.locator("[data-publish-ghost]")).toHaveAttribute("data-blocked-reason", api.actions.publish.blocked_reason);
      await expect(root.locator("[data-mirror-ghost] a, [data-mirror-ghost] button")).toHaveCount(0);
      await expect(root.locator("[data-rc-state]")).toHaveText(api.run.binding === null ? "NOT_PUBLISHABLE" : api.state);
      const visible = await visibleText(page, "[data-screen='release-candidate']");
      expect(visible, "no fabricated governance state").not.toMatch(/\bPUBLISHED\b(?!_)|\bPENDING\b|\bAPPROVED\b(?!_)/);
      if (api.availability.state === "PARTIAL") {
        await expect(root.locator("[data-rc-state-panel]")).toHaveAttribute("data-rc-state-panel", "partial");
      }
      /* 660px: the evidence table scrolls inside its own frame, never the page. */
      const pack = await root.locator(".rc-pack").evaluate((node) => ({ scroll: node.scrollWidth, client: node.clientWidth }));
      if (width < 960) expect(pack.scroll).toBeGreaterThan(pack.client);
      expect(await axeBlocking(page, "[data-screen='release-candidate']")).toEqual([]);

      await finish(page, `W5c-S11-${label}-${name}`, observed, { run, api_availability: api.availability, api_counts: counts });
      expect(observed.failures, "S11 failed reads").toEqual([]);
      expect(observed.noise, `S11 console:\n${observed.noise.join("\n")}`).toEqual([]);
    });
  }

  test(`W5c S11 DOUBLE declarations, 409 and local seal in a real browser at ${name}`, async ({ page }) => {
    const observed = observe(page);
    await page.setViewportSize({ width, height });
    await signIn(page);
    const real = (await (await page.request.get(`/api/v1/quantbt/runs/${RUN}/release-candidate`)).json()) as any;
    const rcId = "rc_01K5W5CSEA1ED0000000000000";
    const saved = JSON.parse(JSON.stringify(real));
    for (const item of saved.pack) {
      if (item.status === "MISSING") Object.assign(item, { status: "COMPLETE", digest: "6".repeat(64), availability: { state: "AVAILABLE", reason_code: null } });
    }
    Object.assign(saved, {
      pack_counts: { complete: 9, degraded: 1, input: 2, missing: 0 },
      draft: { draft_id: "rcd_01K5W5CDRAFT0000000000000", revision: 1, source_fingerprint: real.source_fingerprint, known_limitations: "Single venue depth.", proposed_use_restrictions: "Paper first.", state: "PERSISTED", updated_at_utc_ms: real.as_of_utc_ms },
      actions: { ...real.actions, may_seal: true, seal_blocked_reason: null },
    });
    const sealedBody = JSON.parse(JSON.stringify(saved));
    sealedBody.local_seal = { state: "SEALED_LOCAL", release_candidate_id: rcId, pack_digest: "5".repeat(64), sealed_at_utc_ms: real.as_of_utc_ms, delivery_state: "NOT_DELIVERED", approval_state: "NOT_APPROVED", availability: { state: "AVAILABLE", reason_code: null } };
    sealedBody.rail = sealedBody.rail.map((node: any) => (node.key === "release_candidate" ? { ...node, value: rcId, detail: "sealed locally — not delivered", tone: "green" } : node));
    let patches = 0;
    let sealedYet = false;
    const writes: string[] = [];
    await page.route(`**/api/v1/quantbt/runs/${RUN}/release-candidate/draft`, async (route) => {
      patches += 1;
      writes.push(`PATCH ${route.request().postData()}`);
      if (patches === 1) {
        return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: { code: "RESEARCH_RELEASE_CANDIDATE_CONFLICT", message: "Release Candidate draft changed; reload it." }, request_id: "double" }) });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(saved) });
    });
    await page.route(`**/api/v1/quantbt/runs/${RUN}/release-candidate/seal`, async (route) => {
      writes.push(`POST ${route.request().postData()}`);
      sealedYet = true;
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ schema_version: "research.release-candidate-local-seal.v1", release_candidate_id: rcId, run_id: RUN, pack_digest: "5".repeat(64), sealed_at_utc_ms: real.as_of_utc_ms, delivery_state: "NOT_DELIVERED", approval_state: "NOT_APPROVED" }) });
    });
    await page.route(`**/api/v1/quantbt/runs/${RUN}/release-candidate`, async (route) => (sealedYet ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(sealedBody) }) : route.continue()));
    await page.route(`**/api/v1/research/release-candidates/${rcId}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          schema_version: "research.release-candidate-pack.v1",
          read_authority: "PORTAL_PERSISTED_RESEARCH",
          release_candidate_id: rcId,
          run_id: RUN,
          pack_digest: "5".repeat(64),
          sealed_at_utc_ms: real.as_of_utc_ms,
          frozen_core: {
            fields: saved.fields.map((field: any) => (field.key === "release_candidate_id" ? { ...field, value: rcId, tone: "ink" } : field)),
            pack: saved.pack,
            source_fingerprint: saved.source_fingerprint,
            draft: { known_limitations: "Single venue depth.", proposed_use_restrictions: "Paper first." },
          },
          delivery: sealedBody.local_seal,
        }),
      }),
    );

    await page.goto(`/research/quantbt/runs/${RUN}/release-candidate`);
    const root = page.locator("[data-screen='release-candidate']");
    await expect(root.locator("[data-pack-row]")).toHaveCount(12, { timeout: 20_000 });
    /* Edit a declaration from its row; the first save meets a 409 and keeps the text. */
    await root.locator("[data-pack-row='KNOWN_LIMITATIONS_WAIVERS'] [data-action='edit-declaration']").click();
    const box = root.locator("[data-declaration-input='known_limitations']");
    await expect(box).toBeFocused();
    await box.fill("Single venue depth.");
    await root.locator("[data-action='save-declarations']").click();
    await expect(root.locator("[data-mutation-state='conflict']")).toContainText("evidence changed since composing — review the pack");
    await expect(box).toHaveValue("Single venue depth.");
    await page.screenshot({ path: `${OUT}/W5c-S11-DOUBLE-409-${name}.png`, fullPage: true });
    /* The second save succeeds; the seal asks for confirmation, then shows the immutable pack. */
    await root.locator("[data-action='save-declarations']").click();
    await expect(root.locator("[data-draft-revision]")).toHaveAttribute("data-draft-revision", "1");
    await root.locator("[data-action='local-seal']").click();
    await expect(root.locator("[data-seal-confirm]")).toBeVisible();
    await root.locator("[data-action='confirm-local-seal']").click();
    await expect(root.locator("[data-sealed]")).toHaveAttribute("data-sealed", rcId);
    await expect(root.locator("[data-sealed-pack] [data-frozen-field]")).toHaveCount(17);
    await expect(root.locator("[data-rc-seal-state]")).toHaveText("SEALED_LOCAL");
    await expect(root.locator("[data-rc-state]")).toHaveText("DRAFT");
    expect(writes.map((line) => line.split(" ")[0])).toEqual(["PATCH", "PATCH", "POST"]);
    expect(JSON.parse(writes[0]!.slice(6))).toEqual({ expected_revision: real.draft.revision, expected_source_fingerprint: real.source_fingerprint, known_limitations: "Single venue depth.", proposed_use_restrictions: null });
    expect(JSON.parse(writes[2]!.slice(5))).toEqual({ draft_id: saved.draft.draft_id, expected_draft_revision: 1, expected_source_fingerprint: real.source_fingerprint });
    expect(await axeBlocking(page, "[data-screen='release-candidate']")).toEqual([]);
    await finish(page, `W5c-S11-DOUBLE-sealed-${name}`, observed, { doubled: ["PATCH draft", "POST seal", "GET pack", "GET compose after the doubled seal"], writes });
    const noise = observed.noise.filter((line) => line !== "error: Failed to load resource: the server responded with a status of 409 (Conflict)");
    expect(noise, `S11 DOUBLE console:\n${observed.noise.join("\n")}`).toEqual([]);
  });

  for (const [label, run] of RC_RUNS) {
    test(`W5c S09 ${label} report on real reads at ${name}`, async ({ page }) => {
      const observed = observe(page);
      await page.setViewportSize({ width, height });
      await signIn(page);
      await page.goto(`/research/quantbt/runs/${run}/report`);
      const read = await pageGet(page, `/api/v1/quantbt/runs/${run}/report`);
      const response = { status: () => read.status };
      const api = read.body;
      const root = page.locator("[data-screen='run-report']");
      await expect(root).toBeVisible({ timeout: 20_000 });
      await page.waitForLoadState("networkidle");
      if (response.status() === 200) {
        await expect(root).toHaveAttribute("data-report-revision", api.report_revision);
        await expect(root.locator("[data-promotion-line]")).toHaveText(api.frozen_core.promotion.line);
        /* W6a: a headline is displayed by unit (DQ-08); the exact server string rides data-headline-value. */
        for (const cell of api.frozen_core.headline) {
          if (cell.value !== null) await expect(root.locator(`[data-headline='${cell.key}'] [data-headline-value]`)).toHaveAttribute("data-headline-value", cell.value);
          else await expect(root.locator(`[data-headline='${cell.key}'] [data-headline-withheld]`)).toContainText(cell.availability.reason_code ?? cell.availability.state);
        }
        for (const field of api.frozen_core.identity) {
          if (field.value !== null) await expect(root.locator(`[data-identity='${field.key}'] dd`)).toHaveText(field.value);
        }
        await expect(root.locator("[data-passport-fact]")).toHaveCount(api.frozen_core.passport.length);
        if (api.frozen_core.schema_version === "research.report-frozen-core.v2") {
          const core = api.frozen_core;
          if (core.title.text) await expect(root.locator("[data-report-title]")).toHaveText(core.title.text);
          await expect(root.locator("[data-cert] [data-reason-code]")).toHaveText(core.certification.reason_code);
          for (const [index, fact] of core.passport.entries()) {
            await expect(root.locator(`[data-passport-fact='${index + 1}']`)).toHaveAttribute("data-passport-key", fact.key);
          }
          await expect(root.locator("[data-fold]")).toHaveCount(core.folds.rows.length);
          for (const row of core.folds.rows) {
            if (row.oos_sharpe.value !== null) await expect(root.locator(`[data-fold='${row.fold_id}'] [data-fold-oos]`)).toHaveAttribute("data-fold-oos", row.oos_sharpe.value);
          }
          for (const stage of core.stages) await expect(root.locator(`[data-stage='${stage.key}']`)).toHaveAttribute("data-stage-check", stage.check.result);
        }
        await expect(root.locator("[data-action='release-candidate']")).toHaveAttribute("href", `/research/quantbt/runs/${run}/release-candidate`);
      } else {
        expect(api.error.code).toBe("RESEARCH_REPORT_NOT_FOUND");
        await expect(root.locator("[data-report-notice]")).toHaveAttribute("data-report-notice", "empty");
      }
      await finish(page, `W5c-S09-${label}-${name}`, observed, { run, api_status: response.status() });
      const noise = explainedNoise(observed, { RESEARCH_REPORT_NOT_FOUND: /No report was found for this run/ }, await root.innerText());
      expect(noise, `S09 console:\n${observed.noise.join("\n")}`).toEqual([]);
    });
  }

  test(`W5c S10 lineage on real reads at ${name}`, async ({ page }) => {
    const observed = observe(page);
    await page.setViewportSize({ width, height });
    await signIn(page);
    const api = (await (await page.request.get(`/api/v1/research/alphas/${ALPHA}/lineage`)).json()) as any;
    await page.goto(`/research/quantbt/alphas/${ALPHA}/lineage`);
    const root = page.locator("[data-screen='attempt-lineage']");
    await expect(root).toHaveAttribute("data-lineage-state", /available|partial/, { timeout: 20_000 });
    await page.waitForLoadState("networkidle");
    await expect(root).toContainText(`of ${api.counts.returned_attempts} attempts`);
    await expect(root).toContainText(api.alpha.versions.find((version: any) => version.alpha_version_id === api.alpha.active_version_id).label);
    /* Screen 11 composes from a run; without a published pick naming one, "rc & publish →" says why. */
    const picked = api.alpha.versions.some((version: any) => version.lifecycle_state === "ACTIVE" && version.promotion_pick?.state === "PUBLISHED" && version.promotion_pick.run_id);
    if (picked) await expect(root.locator("[data-action='release-candidate']")).toHaveCount(1);
    else await expect(root.locator("[data-action-unrouted='release-candidate']")).toHaveAttribute("title", /No published promotion pick names a run/);
    await finish(page, `W5c-S10-${name}`, observed, { total_attempts: api.counts.total_attempts, picked });
    expect(observed.failures, "S10 failed reads").toEqual([]);
    expect(observed.noise, `S10 console:\n${observed.noise.join("\n")}`).toEqual([]);
  });

  test(`W5c S13 compare on real reads at ${name}`, async ({ page }) => {
    const observed = observe(page);
    await page.setViewportSize({ width, height });
    await signIn(page);
    await page.goto(`/research/quantbt/alphas/${ALPHA}/compare`);
    const read = await pageGet(page, `/api/v1/research/alphas/${ALPHA}/compare?mode=attempts`);
    const response = { status: () => read.status, json: async () => read.body };
    const root = page.locator("[data-screen='compare']");
    await expect(root).toBeVisible({ timeout: 20_000 });
    await page.waitForLoadState("networkidle");
    if (response.status() === 200) {
      const api = (await response.json()) as any;
      await expect(root).toHaveAttribute("data-compare-state", /available|partial/);
      const result = api.result;
      for (const run of (result.attempts ?? []).map((item: any) => item.run_id).slice(0, 3)) {
        await expect(root.locator(`[data-rc-link='${run}']`).first()).toHaveAttribute("href", `/research/quantbt/runs/${run}/release-candidate`);
      }
      /* W6a: every CG-P20 field the ladder, fold chart and diff show equals the API. */
      for (const run of result.attempts ?? []) {
        const card = root.locator(`[data-ladder-run='${run.run_id}']`);
        const sharpe = run.original_metrics.find((metric: any) => metric.key === "OOS_SHARPE");
        if (sharpe?.availability.state === "AVAILABLE") await expect(card.locator("[data-oos-sharpe]")).toHaveAttribute("data-oos-sharpe", sharpe.value);
        if (run.schedule.availability.state === "AVAILABLE") await expect(card.locator("[data-schedule]")).toHaveText(`sched ${run.schedule.mode} × ${run.schedule.schedule}`);
        if (run.alpha_version_lifecycle.value) await expect(card).toHaveAttribute("data-lifecycle", run.alpha_version_lifecycle.value);
        await expect(card.locator("[data-cert-absent]")).toContainText(run.certification.reason_code);
      }
      const bars = (result.fold_series ?? []).filter((item: any) => item.state === "AVAILABLE").flatMap((item: any) => item.folds.filter((fold: any) => fold.oos_sharpe !== null).map((fold: any) => [item.run_id, fold]));
      await expect(root.locator("[data-fold-bar]")).toHaveCount(bars.length);
      for (const [runId, fold] of bars) await expect(root.locator(`[data-fold-bar='${runId}:${fold.fold_id}']`)).toHaveAttribute("data-exact", fold.oos_sharpe);
      if (result.config_diff?.availability.state === "AVAILABLE") {
        await expect(root.locator("[data-config-diff-path]")).toHaveCount(result.config_diff.paths.length);
      }
    } else {
      /* Until the preview carries the W5c compare fix, the real answer is 503; the screen must say so, not collapse. */
      expect(response.status()).toBe(503);
      await expect(root).toHaveAttribute("data-compare-state", "unavailable");
    }
    await finish(page, `W5c-S13-${name}`, observed, { api_status: response.status() });
    const noise = explainedNoise(observed, { RESEARCH_COMPARE_UNAVAILABLE: /unavailable|did not answer/i }, await root.innerText());
    expect(noise, `S13 console:\n${observed.noise.join("\n")}`).toEqual([]);
  });
}

/**
 * W6b · Screen 10 on lineage contract 1.1.0 (CG-P19-01…14), per seeded run.
 *
 * For the P04 run and the Delta WFO run, the page opened on that run's
 * attempt must print exactly what the lineage API served in the same
 * session: the spec line, claim, OOS Sharpe and decay (exact value in
 * `data-metric-value`, never a digit from null), cert, execution profile,
 * promotion standing, storied/probe, the version outcome, exercised and
 * untried, the counter — and the ETag must revalidate as `304`. When the
 * answering server predates 1.1.0 these checks are skipped by name rather
 * than weakened.
 */
const W6B_VIEWPORTS = [
  ["1440", 1440, 900],
  ["660", 660, 900],
] as const;
const PROMOTION_WORDS: Record<string, string> = {
  PICKED: "promotion pick",
  NOT_PICKED: "not the pick",
  AWAITING_PICK: "awaiting a published pick",
  CLOSED: "promotion closed",
};

for (const [name, width, height] of W6B_VIEWPORTS) {
  for (const [label, run] of RC_RUNS) {
    test(`W6b S10 ${label} attempt on real lineage at ${name}`, async ({ page }) => {
      const observed = observe(page);
      await page.setViewportSize({ width, height });
      await signIn(page);
      const response = await page.request.get(`/api/v1/research/alphas/${ALPHA}/lineage`);
      expect(response.status()).toBe(200);
      const api = (await response.json()) as any;
      test.skip(!api.presentation_rule, "the answering server predates lineage contract 1.1.0");
      const etag = response.headers()["etag"];
      expect(etag).toBe(api.etag);
      const revalidated = await page.request.get(`/api/v1/research/alphas/${ALPHA}/lineage`, { headers: { "if-none-match": etag! } });
      expect(revalidated.status(), "CG-P19-02 revalidation").toBe(304);

      const node = api.attempts.find((attempt: any) => attempt.primary_run.run_id === run);
      expect(node, `${label} run ${run} is an attempt of ${ALPHA}`).toBeTruthy();
      await page.goto(`/research/quantbt/alphas/${ALPHA}/lineage?attempt=${node.attempt_id}`);
      const root = page.locator("[data-screen='attempt-lineage']");
      await expect(root).toHaveAttribute("data-lineage-state", /available|partial/, { timeout: 20_000 });
      await page.waitForLoadState("networkidle");
      const selected = root.locator("[data-panel='selected']");
      await expect(selected).toHaveAttribute("data-selected-attempt", node.attempt_id);
      const row = (key: string) => selected.locator(`[data-row-key='${key}']`);
      await expect(row("mode × schedule")).toHaveText(node.spec_label.text);
      await expect(row("execution profile")).toHaveText(node.primary_run.execution_profile_id);
      await expect(row("promotion")).toHaveText(PROMOTION_WORDS[node.promotion_state]!);
      await expect(row("presentation")).toContainText(node.presentation_kind.toLowerCase());
      if (node.run_facts.claim.state) await expect(row("claim")).toHaveText(node.run_facts.claim.state);
      if (node.run_facts.certificate.grade) await expect(row("cert")).toHaveText(node.run_facts.certificate.grade);
      else await expect(row("cert")).toContainText(node.run_facts.certificate.availability.reason_code);
      for (const [key, fact] of [["OOS sharpe", node.run_facts.oos_sharpe], ["decay", node.run_facts.decay]] as const) {
        const metric = row(key).locator("[data-metric]");
        if (fact.value !== null) {
          await expect(metric).toHaveAttribute("data-metric-value", fact.value);
          await expect(metric).toContainText(Number(fact.value).toFixed(3));
        } else {
          await expect(metric).toHaveAttribute("data-metric-state", fact.availability.state);
          expect(await metric.innerText(), `${key} prints no digit for a null`).not.toMatch(/\d/);
        }
      }
      /* The card of this attempt; a probe opens the probes (spec T04). */
      const card = root.locator(`[data-attempt='${node.attempt_id}']`);
      await expect(card).toBeVisible();
      if (node.presentation_kind === "PROBE") {
        await expect(root.locator("[data-action='toggle-probes']")).toHaveAttribute("aria-pressed", "true");
      }
      const version = api.alpha.versions.find((item: any) => item.alpha_version_id === node.alpha_version_id);
      const band = root.locator(`[data-band='${version.alpha_version_id}']`);
      if (version.outcome.text) await expect(band.locator(".ln-out")).toHaveText(version.outcome.text);
      await expect(band.locator("[data-exercised-routes]")).toHaveText(version.exercised.routes.join(" · "));
      await expect(band.locator("[data-exercised-modes]")).toHaveText(version.exercised.modes.join(" · "));
      const active = api.alpha.versions.find((item: any) => item.lifecycle_state === "ACTIVE");
      if (active?.untried.routes.length) {
        await expect(root.locator("[data-untried-routes]")).toHaveText(active.untried.routes.map((route: any) => route.route_id).join(" · "));
      }
      await expect(root.locator("[data-counter]")).toContainText(`of ${api.counts.returned_attempts} attempts`);
      await expect(root.locator("[data-count='probe_returned'] .n")).toHaveText(String(api.counts.probe_returned));
      await expect(root.locator("[data-promotion-standing]")).toBeVisible();
      expect(await axeBlocking(page, "[data-screen='attempt-lineage']")).toEqual([]);
      await finish(page, `W6b-S10-${label}-${name}`, observed, { attempt: node.attempt_id, etag, promotion_state: node.promotion_state });
      expect(observed.failures, "S10 failed reads").toEqual([]);
      expect(observed.noise, `S10 console:\n${observed.noise.join("\n")}`).toEqual([]);
    });
  }
}

/**
 * W7 · the P21 retained (Delta WFO) lane.
 *
 * Row by row, a pack row shows the server's status, its digest whole and, for
 * a MISSING or DEGRADED row, the server's reason code.
 *
 * The preview still runs the pre-W7 composer, so its WFO answer is the one W7
 * replaces (3 · 0 · 2 · 7, P21_REFERENCED_SOURCE_INTEGRITY_FAILED). The
 * W7 composition of the same run — written by the control-api service test
 * from this run's real retained rows (packages/contracts fixtures) — is
 * injected for the one compose GET and labelled INJECTED; every other read is
 * real. The test first proves the fixture is this run: every identity the old
 * composer already published equals the fixture's.
 */
async function expectRowsAsServed(root: Locator, api: any) {
  for (const item of api.pack) {
    const row = root.locator(`[data-pack-row='${item.key}']`);
    await expect(row).toHaveAttribute("data-status", item.status);
    if (item.digest) await expect(row.locator("[data-digest]")).toHaveAttribute("data-digest", item.digest);
    if ((item.status === "MISSING" || item.status === "DEGRADED") && item.availability.reason_code) {
      await expect(row.locator(`[data-reason-for='${item.key}']`)).toHaveAttribute("data-reason-code", item.availability.reason_code);
    }
  }
}

const W7_FIXTURES = `${process.cwd()}/../../../packages/contracts/fixtures`;
const W7_VIEWPORTS = [
  ["wide", 1440, 900],
  ["mobile", 660, 900],
] as const;
const W7_SHARED_FIELDS = [
  "alpha_id", "alpha_version_id", "alpha_code_digest", "alpha_entrypoint", "requested_spec_digest", "effective_spec_digest",
  "dataset_binding_digest", "source_transform_digest", "engine_release_id", "adapter_contract_digest", "report_revision",
];

for (const [name, width, height] of W7_VIEWPORTS) {
  for (const [label, run] of RC_RUNS) {
    test(`W7 S11 ${label} rows as served on real reads at ${name}`, async ({ page }) => {
      const observed = observe(page);
      await page.setViewportSize({ width, height });
      await signIn(page);
      const api = (await (await page.request.get(`/api/v1/quantbt/runs/${run}/release-candidate`)).json()) as any;
      await page.goto(`/research/quantbt/runs/${run}/release-candidate`);
      const root = page.locator("[data-screen='release-candidate']");
      await expect(root.locator("[data-pack-row]")).toHaveCount(12, { timeout: 20_000 });
      await page.waitForLoadState("networkidle");
      await expectRowsAsServed(root, api);
      const counts = api.pack_counts;
      await expect(root.locator("[data-pack-counts]")).toHaveText(`${counts.complete} COMPLETE · ${counts.degraded} DEGRADED · ${counts.input} INPUT · ${counts.missing} MISSING`);
      await finish(page, `W7-S11-${label}-real-${name}`, observed, { run, api_availability: api.availability, api_counts: counts, api_blocked: api.actions.seal_blocked_reason });
      expect(observed.failures, "S11 failed reads").toEqual([]);
      expect(observed.noise, `S11 console:\n${observed.noise.join("\n")}`).toEqual([]);
    });
  }

  for (const [label, file] of [
    ["virtual", "research-release-candidate.wfo-retained.valid.json"],
    ["declared", "research-release-candidate.wfo-retained-declared.valid.json"],
  ] as const) {
    test(`W7 S11 WFO retained lane (${label} draft, composition INJECTED) at ${name}`, async ({ page }) => {
      test.skip(!WFO_RUN, "no seeded WFO run on this preview");
      const body = JSON.parse(readFileSync(`${W7_FIXTURES}/${file}`, "utf8"));
      test.skip(body.run_id !== WFO_RUN, "the W7 fixture is composed for another seeded WFO run");
      const observed = observe(page);
      await page.setViewportSize({ width, height });
      await signIn(page);
      const real = (await (await page.request.get(`/api/v1/quantbt/runs/${WFO_RUN}/release-candidate`)).json()) as any;
      const realFields = Object.fromEntries(real.fields.map((field: any) => [field.key, field.value]));
      const injectedFields = Object.fromEntries(body.fields.map((field: any) => [field.key, field.value]));
      for (const key of W7_SHARED_FIELDS) expect(injectedFields[key], `${key} is this run's own fact`).toBe(realFields[key]);
      await page.route(`**/api/v1/quantbt/runs/${WFO_RUN}/release-candidate`, (route) =>
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) }),
      );
      await page.goto(`/research/quantbt/runs/${WFO_RUN}/release-candidate`);
      const root = page.locator("[data-screen='release-candidate']");
      await expect(root.locator("[data-pack-row]")).toHaveCount(12, { timeout: 20_000 });
      await page.waitForLoadState("networkidle");
      await expectRowsAsServed(root, body);
      await expect(root.locator("[data-pack-counts]")).toHaveText("8 COMPLETE · 2 DEGRADED · 2 INPUT · 0 MISSING");
      await expect(root.locator("[data-pack-row][data-status='MISSING']")).toHaveCount(0);
      const lines = await root.locator("[data-yaml-key]").evaluateAll((nodes) => nodes.map((node) => [node.getAttribute("data-yaml-key"), node.getAttribute("data-yaml-value")]));
      expect(lines).toEqual(body.yaml.map((field: any) => [field.key, field.value ?? ""]));
      if (body.actions.may_seal) {
        await expect(root.locator("[data-action='local-seal']")).toHaveAttribute("data-seal-enabled", "true");
      } else {
        await expect(root.locator("[data-seal-blocked]")).toHaveAttribute("data-seal-blocked", body.actions.seal_blocked_reason);
      }
      await expect(root.locator("[data-publish-ghost]")).toHaveAttribute("data-blocked-reason", "P22_PUBLICATION_NOT_COMMISSIONED");
      await expect(root.locator("[data-rc-state-panel='partial']")).toHaveCount(0);
      const pack = await root.locator(".rc-pack").evaluate((node) => ({ scroll: node.scrollWidth, client: node.clientWidth }));
      if (width < 960) expect(pack.scroll).toBeGreaterThan(pack.client);
      expect(await axeBlocking(page, "[data-screen='release-candidate']")).toEqual([]);
      await finish(page, `W7-S11-WFO-retained-${label}-${name}`, observed, {
        run: WFO_RUN, injected: ["GET compose (W7 composition of this run)"], preview_counts: real.pack_counts, preview_blocked: real.actions.seal_blocked_reason,
      });
      expect(observed.failures, "S11 failed reads").toEqual([]);
      expect(observed.noise, `S11 console:\n${observed.noise.join("\n")}`).toEqual([]);
    });
  }
}
