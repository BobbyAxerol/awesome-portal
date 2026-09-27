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

import { expect, test, type Page } from "@playwright/test";

const HOME = `${process.env.HOME}/.config/portal-research-preview`;
const OUT = process.env.RESEARCH_PREVIEW_RECEIPTS ?? `${HOME}/receipts`;
mkdirSync(OUT, { recursive: true, mode: 0o700 });
const PASSWORD = readFileSync(`${HOME}/claude-preview.password`, "utf8").trim();
const RUN = (JSON.parse(readFileSync(`${HOME}/seeded-run.json`, "utf8")) as { run_id: string }).run_id;
const ORIGIN = process.env.RESEARCH_PREVIEW_ORIGIN ?? "http://localhost:8095";

const VIEWPORTS = [
  ["laptop", Number(process.env.RESEARCH_PREVIEW_LAPTOP_WIDTH ?? 1280), 900],
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
        /* E5: the selected card is the HiFi selCard — S_IS, S̄_OOS, d̄ decay, max_dd — not J. */
        const selectedCard = page.locator("[data-role-card='selected']");
        await expect(selectedCard.locator("[data-role-row]")).toHaveCount(4);
        await expect(selectedCard).toContainText(String(search.selection.selected_trial_id ?? ""));
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
        /* The retained WFO lane draws its own θ* table (`data-frozen-parameter`); the P16 lane draws `data-frozen-param`. */
        await expect(page.locator("[data-frozen-param], [data-frozen-parameter]")).toHaveCount(Object.keys(freeze.frozen_selection.parameters).length);
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
    /* The mirror ghost's outcome vocabulary is copy, not a governance state. */
    copy.querySelectorAll("style, [data-mirror-meta]").forEach((element) => element.remove());
    return copy.textContent ?? "";
  });
}

/** Where a pack row's evidence lives in this build, by contract key (X1-D04, W5c D-04). */
function sourceRouteOf(item: any, runId: string, alphaId: string | null): string | null {
  if (item.source.href === null) return null;
  const run = `/research/quantbt/runs/${runId}`;
  const byKey: Record<string, string | null> = {
    ENGINE_CAPABILITY_BACKEND: "/research/quantbt/atlas",
    DATASET_UNIVERSE_SNAPSHOTS: `${run}/split`,
    EXECUTION_ASSUMPTIONS: `${run}/split`,
    METHODOLOGY_CLAIM: `${run}/evidence#stage=claim`,
    SELECTED_PARAMS_LINEAGE: `${run}/search`,
    FINAL_AUDIT_REPLAY: `${run}/execute`,
    METRICS_SEMANTICS: `${run}/report`,
    REPRODUCIBILITY_PARITY_CHECKSUMS: `${run}/freeze`,
    ROBUSTNESS_PARAM_STABILITY_REGIME: alphaId ? `/research/quantbt/alphas/${alphaId}/compare` : null,
  };
  return byKey[item.key] ?? null;
}

for (const [name, width, height] of VIEWPORTS) {
  for (const [label, run] of RC_RUNS) {
    test(`X1 S11 ${label} composition on real reads at ${name}`, async ({ page }) => {
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
      /* 12 rows, statuses, reasons and counter as served. */
      const rows = await root.locator("[data-pack-row]").evaluateAll((nodes) => nodes.map((node) => [node.getAttribute("data-pack-row"), node.getAttribute("data-status")]));
      expect(rows).toEqual(api.pack.map((item: any) => [item.key, item.status]));
      for (const item of api.pack) {
        if ((item.status === "MISSING" || item.status === "DEGRADED") && item.availability.reason_code) {
          await expect(root.locator(`[data-pack-row='${item.key}'] .note [data-reason-code='${item.availability.reason_code}']`)).toBeVisible();
        }
        const route = sourceRouteOf(item, run, api.run.binding?.alpha_id ?? null);
        if (route) await expect(root.locator(`[data-source-link='${item.key}']`)).toHaveAttribute("href", route);
        else await expect(root.locator(`[data-pack-row='${item.key}'] [data-source-link]`)).toHaveCount(0);
      }
      const counts = api.pack_counts;
      await expect(root.locator("[data-pack-counts]")).toHaveText(`${counts.complete} COMPLETE · ${counts.degraded} DEGRADED · ${counts.input} INPUT · ${counts.missing} MISSING`);
      /* Rail tones and links, the server's seal and publish gates, the state chip. */
      const tones = await root.locator("[data-rail-node]").evaluateAll((nodes) => nodes.map((node) => [node.getAttribute("data-rail-node"), node.getAttribute("data-tone")]));
      expect(tones).toEqual(api.rail.map((node: any) => [node.key, node.tone]));
      if (api.run.binding) await expect(root.locator("[data-rail-node='alpha']")).toHaveAttribute("href", `/research/quantbt/alphas/${api.run.binding.alpha_id}/lineage`);
      await expect(root.locator("[data-rail-node='run']")).toHaveAttribute("href", `/research/quantbt/runs/${run}/evidence`);
      await expect(root.locator("[data-seal-blocked]")).toHaveAttribute("data-seal-blocked", api.actions.seal_blocked_reason ?? "LOCAL");
      await expect(root.locator("[data-action='local-seal']")).toHaveAttribute("aria-disabled", "true");
      if (!api.actions.publish.enabled) {
        await expect(root.locator("[data-action='publish']")).toHaveAttribute("aria-disabled", "true");
        await expect(root.locator("[data-publish-blocked]")).toHaveAttribute("data-publish-blocked", api.run.binding === null ? "P21_SCRATCH_RUN_UNBOUND" : api.actions.publish.blocked_reason);
      }
      await expect(root.locator("[data-mirror-ghost] a, [data-mirror-ghost] button, [data-mirror-ghost] [tabindex]")).toHaveCount(0);
      if (api.source_absences.approval_mirror?.reason_code) {
        await expect(root.locator(`[data-mirror-foot] [data-reason-code='${api.source_absences.approval_mirror.reason_code}']`)).toBeVisible();
      }
      await expect(root.locator("[data-state-chip]")).toHaveText(api.run.binding === null ? "NOT_PUBLISHABLE" : api.local_seal.delivery_state === "DELIVERED" ? "PUBLISHED" : api.state);
      const visible = await visibleText(page, "[data-screen='release-candidate']");
      expect(visible, "no fabricated governance state").not.toMatch(/\bPUBLISHED\b(?!_)|\bPENDING\b|\bAPPROVED\b(?!_)|Quant Reviewers|none recorded/);
      if (api.availability.state === "PARTIAL") {
        await expect(root.locator("[data-rc-notice]")).toHaveAttribute("data-rc-notice", "partial");
        await expect(root.locator("[data-rc-notice]")).toContainText(api.availability.reason_code);
      } else {
        await expect(root.locator("[data-rc-notice]")).toHaveCount(0);
      }
      /* An unsealed candidate reads no publication, and nothing ever asks for /mirror. */
      if (api.local_seal.state !== "SEALED_LOCAL") expect(observed.requests.filter((line) => line.includes("/publication"))).toEqual([]);
      expect(observed.requests.filter((line) => line.includes("/mirror"))).toEqual([]);
      /* 660px: the evidence table scrolls inside its own frame, never the page. */
      const pack = await root.locator(".rc-pack").evaluate((node) => ({ scroll: node.scrollWidth, client: node.clientWidth }));
      if (width < 960) expect(pack.scroll).toBeGreaterThan(pack.client);
      /* W7 (after a preview rebuild): the retained lane's DEGRADED rows carry their sentence. */
      const certificate = api.pack.find((item: any) => item.availability.reason_code === "P21_METHODOLOGY_CERTIFICATE_NOT_ISSUED");
      if (certificate) await expect(root.locator(`[data-pack-row='${certificate.key}'] .note`)).toContainText("claim retained, no issued methodology certificate");
      expect(await axeBlocking(page, "[data-screen='release-candidate']")).toEqual([]);

      await finish(page, `X1-S11-${label}-${name}`, observed, { run, api_availability: api.availability, api_counts: counts, api_publish: api.actions.publish });
      expect(observed.failures, "S11 failed reads").toEqual([]);
      expect(observed.noise, `S11 console:\n${observed.noise.join("\n")}`).toEqual([]);
    });
  }

  test(`X1 S11 DOUBLE declarations, 409, confirmed local seal, then the real publication read at ${name}`, async ({ page }) => {
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
    sealedBody.actions = { ...sealedBody.actions, may_seal: false, seal_blocked_reason: "P21_RESEARCHER_DECLARATIONS_REQUIRED", publish: { enabled: true, blocked_reason: null } };
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

    await page.goto(`/research/quantbt/runs/${RUN}/release-candidate`);
    const root = page.locator("[data-screen='release-candidate']");
    await expect(root.locator("[data-pack-row]")).toHaveCount(12, { timeout: 20_000 });
    /* Edit a declaration from its row; the first save meets a 409 and keeps the text. */
    await root.locator("[data-pack-row='KNOWN_LIMITATIONS_WAIVERS'] [data-action='edit-declaration']").click();
    const box = root.locator("[data-declaration-input='KNOWN_LIMITATIONS_WAIVERS']");
    await expect(box).toBeFocused();
    await box.fill("Single venue depth.");
    await root.locator("[data-action='save-declaration']").click();
    await expect(root.locator("[data-write-notice='patch'][data-outcome='conflict']")).toContainText("evidence changed since composing — review the pack");
    await expect(box).toHaveValue("Single venue depth.");
    await page.screenshot({ path: `${OUT}/X1-S11-DOUBLE-409-${name}.png`, fullPage: true });
    /* The second save succeeds; the seal asks for confirmation, then shows the server's seal. */
    await root.locator("[data-action='save-declaration']").click();
    await expect(root.locator("[data-draft-revision]")).toHaveAttribute("data-draft-revision", "1");
    await root.locator("[data-action='local-seal']").click();
    await expect(root.locator("[data-confirm='local-seal']")).toBeVisible();
    await expect(root.locator("[data-action='confirm-local-seal']")).toBeFocused();
    await page.screenshot({ path: `${OUT}/X1-S11-DOUBLE-confirm-${name}.png`, fullPage: true });
    await root.locator("[data-action='confirm-local-seal']").click();
    await expect(root.locator("[data-sealed]")).toHaveAttribute("data-sealed", rcId);
    await expect(root.locator("[data-seal-chip]")).toHaveText("SEALED_LOCAL");
    await expect(root.locator("[data-state-chip]")).toHaveText("DRAFT");
    /* The publication read goes to the real preview. An older preview serves no P22 route: the screen says so, typed, and publishes nothing. */
    const publicationRead = await pageGet(page, `/api/v1/research/release-candidates/${rcId}/publication`);
    if (publicationRead.status === 404) {
      await expect(root.locator("[data-publication-read='not-found']")).toContainText("This build serves no publication for this candidate.");
    } else {
      await expect(root.locator("[data-panel='publish']")).toHaveAttribute("data-publish-state", /.+/);
    }
    await expect(root.locator("[data-action='publish']")).toHaveAttribute("aria-disabled", "true");
    await expect(root.locator("[data-panel='mirror-ghost']")).toBeVisible();
    expect(writes.map((line) => line.split(" ")[0])).toEqual(["PATCH", "PATCH", "POST"]);
    expect(JSON.parse(writes[0]!.slice(6))).toEqual({ expected_revision: real.draft.revision, expected_source_fingerprint: real.source_fingerprint, known_limitations: "Single venue depth.", proposed_use_restrictions: real.draft.proposed_use_restrictions });
    expect(JSON.parse(writes[2]!.slice(5))).toEqual({ draft_id: saved.draft.draft_id, expected_draft_revision: 1, expected_source_fingerprint: real.source_fingerprint });
    expect(await axeBlocking(page, "[data-screen='release-candidate']")).toEqual([]);
    await finish(page, `X1-S11-DOUBLE-sealed-${name}`, observed, { doubled: ["PATCH draft", "POST seal", "GET compose after the doubled seal"], writes, publication_status: publicationRead.status });
    const noise = observed.noise.filter((line) => !/Failed to load resource: the server responded with a status of (409|404)/.test(line));
    expect(noise, `S11 DOUBLE console:\n${observed.noise.join("\n")}`).toEqual([]);
  });

  test(`X1 S11 DOUBLE P22 publish, PUBLISHED from the server, mirror and no ghost at ${name}`, async ({ page }) => {
    const observed = observe(page);
    await page.setViewportSize({ width, height });
    await signIn(page);
    const real = (await (await page.request.get(`/api/v1/quantbt/runs/${RUN}/release-candidate`)).json()) as any;
    const rcId = "rc_01K5W5CSEA1ED0000000000000";
    const sealedBody = JSON.parse(JSON.stringify(real));
    for (const item of sealedBody.pack) {
      if (item.status === "MISSING") Object.assign(item, { status: "COMPLETE", digest: "6".repeat(64), availability: { state: "AVAILABLE", reason_code: null } });
      if (item.status === "INPUT") Object.assign(item, { digest: "7".repeat(64), availability: { state: "AVAILABLE", reason_code: null } });
    }
    Object.assign(sealedBody, {
      pack_counts: { complete: 9, degraded: 1, input: 2, missing: 0 },
      draft: { draft_id: "rcd_01K5W5CDRAFT0000000000000", revision: 1, source_fingerprint: real.source_fingerprint, known_limitations: "Single venue depth.", proposed_use_restrictions: "Paper first.", state: "PERSISTED", updated_at_utc_ms: real.as_of_utc_ms },
      local_seal: { state: "SEALED_LOCAL", release_candidate_id: rcId, pack_digest: "5".repeat(64), sealed_at_utc_ms: real.as_of_utc_ms, delivery_state: "NOT_DELIVERED", approval_state: "NOT_APPROVED", availability: { state: "AVAILABLE", reason_code: null } },
      actions: { may_edit_draft: true, may_seal: true, seal_blocked_reason: null, publish: { enabled: true, blocked_reason: null } },
    });
    sealedBody.rail = sealedBody.rail.map((node: any) => (node.key === "release_candidate" ? { ...node, value: rcId, detail: "sealed locally — not delivered", tone: "green" } : node));
    sealedBody.source_absences = { ...sealedBody.source_absences, approval_mirror: { state: "NOT_PUBLISHED", reason_code: "P22_NOT_PUBLISHED" } };
    const deliveredBody = JSON.parse(JSON.stringify(sealedBody));
    deliveredBody.local_seal = { ...deliveredBody.local_seal, delivery_state: "DELIVERED", approval_state: "PENDING" };
    deliveredBody.actions = { ...deliveredBody.actions, publish: { enabled: false, blocked_reason: "P22_ALREADY_DELIVERED" } };
    deliveredBody.source_absences = { ...deliveredBody.source_absences, approval_mirror: { state: "NOT_APPLICABLE", reason_code: "P22_MIRROR_READ_ON_PUBLICATION_ROUTE" } };
    const binding = real.run.binding;
    const readBody = (published: boolean) => ({
      schema_version: "research.release-candidate-publication.v1", release_candidate_id: rcId, run_id: RUN,
      alpha_id: binding.alpha_id, alpha_version_id: binding.alpha_version_id, pack_digest: "5".repeat(64),
      source: { availability: "AVAILABLE", reason_code: null, run_status: "COMPLETED", legacy_artifact_sha256: `sha256:${"b".repeat(64)}`, artifact_schema_version: "quantbt.selected-params.v1", eligible_methodology_claim_ids: ["mclaim_x1"], captured_at: "2026-09-26T09:00:00.000Z" },
      state: published ? "DELIVERED" : "NOT_PUBLISHED", candidate_relation: "CURRENT", may_publish: !published, blocked_reason: published ? "P22_ALREADY_DELIVERED" : null,
      published: published ? { by_user_id: "usr_claude_preview", by_username: "claude-preview", approval_id: "apr_x1_double", at_utc_ms: real.as_of_utc_ms, receipt_digest: "d".repeat(64) } : null,
      approval_read: published ? "AVAILABLE" : "NOT_PUBLISHED",
      approval: published ? { approval_id: "apr_x1_double", gate: "R1", status: "PENDING", subject_id: binding.alpha_id, requester_user_id: "usr_claude_preview", evidence_set_hash: `sha256:${"c".repeat(64)}`, sla_due_at: "2026-09-27T09:12:00.000Z", expires_at: "2026-12-25T09:12:00.000Z", created_at: "2026-09-26T09:12:00.000Z", read_at: "2026-09-26T09:13:00.000Z", conditions: [], href: "/governance/approvals/apr_x1_double/r1" } : null,
      as_of_utc_ms: real.as_of_utc_ms, replayed: false,
    });
    let publishedYet = false;
    const writes: string[] = [];
    await page.route(`**/api/v1/quantbt/runs/${RUN}/release-candidate`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(publishedYet ? deliveredBody : sealedBody) }));
    await page.route(`**/api/v1/research/release-candidates/${rcId}/publication`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(readBody(publishedYet)) }));
    await page.route(`**/api/v1/research/release-candidates/${rcId}/publish`, (route) => {
      writes.push(route.request().postData() ?? "");
      publishedYet = true;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(readBody(true)) });
    });

    await page.goto(`/research/quantbt/runs/${RUN}/release-candidate`);
    const root = page.locator("[data-screen='release-candidate']");
    await expect(root.locator("[data-action='publish']")).toHaveAttribute("data-publish-enabled", "true", { timeout: 20_000 });
    await expect(root.locator("[data-action='publish']")).toHaveText(`Publish release candidate ${rcId}`);
    await page.screenshot({ path: `${OUT}/X1-S11-DOUBLE-P22-sealed-${name}.png`, fullPage: true });
    await root.locator("[data-action='publish']").click();
    await expect(root.locator("[data-confirm='publish']")).toBeVisible();
    await page.screenshot({ path: `${OUT}/X1-S11-DOUBLE-P22-confirm-${name}.png`, fullPage: true });
    await root.locator("[data-action='confirm-publish']").click();
    await expect(root.locator("[data-panel='published'] [data-published-receipt]")).toContainText("approval apr_x1_double");
    await expect(root.locator("[data-state-chip]")).toHaveText("PUBLISHED");
    await expect(root.locator("[data-panel='mirror'] [data-mirror-status]")).toHaveText("PENDING");
    await expect(root.locator("[data-panel='mirror-ghost']")).toHaveCount(0);
    await expect(root.locator("[data-action='edit-declaration']")).toHaveCount(0);
    expect(writes.map((line) => JSON.parse(line))).toEqual([{ schema_version: "research.release-candidate-publish-request.v1", expected_pack_digest: "5".repeat(64), methodology_claim_id: "mclaim_x1" }]);
    const visible = await visibleText(page, "[data-screen='release-candidate']");
    expect(visible).not.toMatch(/Quant Reviewers|none recorded|quorum/);
    expect(await axeBlocking(page, "[data-screen='release-candidate']")).toEqual([]);
    await finish(page, `X1-S11-DOUBLE-P22-published-${name}`, observed, { doubled: ["GET compose", "GET publication", "POST publish"], writes });
    expect(observed.noise, `S11 DOUBLE P22 console:\n${observed.noise.join("\n")}`).toEqual([]);
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
      /* E7 (D10): an attempt without a claim family folds into a compact row, not a ladder card. */
      const unclaimed = (result.attempts ?? []).filter((run: any) => run.claim?.family === "NOT_PUBLISHED");
      if (unclaimed.length > 0) await expect(root.locator("[data-unclaimed]")).toHaveAttribute("data-unclaimed", String(unclaimed.length));
      for (const run of (result.attempts ?? []).filter((item: any) => item.claim?.family !== "NOT_PUBLISHED")) {
        const card = root.locator(`[data-ladder-run='${run.run_id}']`);
        const sharpe = run.original_metrics.find((metric: any) => metric.key === "OOS_SHARPE");
        if (sharpe?.availability.state === "AVAILABLE") await expect(card.locator("[data-oos-sharpe]")).toHaveAttribute("data-oos-sharpe", sharpe.value);
        if (run.schedule.availability.state === "AVAILABLE") await expect(card.locator("[data-schedule]")).toHaveText(`${run.schedule.mode} × ${run.schedule.schedule}`); /* E7: no "sched" prefix, as the HiFi card head */
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
      // Behind the portal-web nginx (gzip) the validator arrives weak (W/"…");
      // the server accepts a weak If-None-Match, so compare the opaque value.
      expect(etag?.replace(/^W\//, "")).toBe(api.etag);
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
      /* E7 (D8): the claim reads in words ("not issued") followed by the source sentence. */
      if (node.run_facts.claim.state) await expect(row("claim")).toContainText(node.run_facts.claim.state.toLowerCase().replace(/_/g, " "));
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
 * E20 · the three screens this lane still missed: Screen 00, Screen 14 and
 * Screen 08 on the P04 run.
 *
 * Same rules as the cells above. Every assertion compares the screen with what
 * the preview served in the same session, read through the page so the Secure
 * session cookie rides along. Screen 14 is the one exception and says why in
 * its own comment: the preview is read-only, so its four writes never leave
 * the browser — they are answered with the canonical contract fixtures, and
 * the cell proves afterwards, from the real registry, that nothing landed.
 */

/** The repository root, from `apps/portal/frontend` (Playwright's cwd). */
const REPO = `${process.cwd()}/../../..`;
const alphaFixture = (name: string) =>
  readFileSync(`${REPO}/packages/contracts/fixtures/research-alpha-import.${name}.valid.json`, "utf8");

/** The shell's words for a path no feature claims (`PortalRoutes.tsx` `NotFound`). */
const NOT_FOUND_COPY = "No feature in the current registry claims this route.";

/**
 * Cards the descriptor calls AVAILABLE that this build cannot address at all.
 *
 * `alpha_version_legacy` used to sit here: its screen is mounted under an
 * Alpha and a version, which a context-free map cannot name. It now goes
 * through the Run Library picker like the other context-scoped cards, so the
 * list is empty and any card that draws NOT ROUTED fails this cell.
 */
const JOURNEY_UNROUTED_KEYS: readonly string[] = [];

/** The badge Screen 00 must print for a card, derived from the served card. */
function expectedJourneyBadge(card: { availability: string; target_key: string }): string | null {
  if (card.availability === "PLANNED") return "SOON";
  if (card.availability === "DEPENDENCY_REQUIRED") return "BLOCKED";
  if (JOURNEY_UNROUTED_KEYS.includes(card.target_key)) return "NOT ROUTED";
  return null;
}

/** A v1 single-file alpha module: a literal contract and one plain function. */
const ALPHA_MODULE = 'ALPHA_CONTRACT = {"schema_version": "research.alpha-source.v1"}\n\ndef generate_signals(context):\n    return context\n';

for (const [name, width, height] of VIEWPORTS) {
  /* ------------------------------------------------------------ Screen 00 */
  test(`E20 S00 journey map on real reads at ${name}`, async ({ page }) => {
    const observed = observe(page);
    await page.setViewportSize({ width, height });
    await signIn(page);
    await page.goto("/research/quantbt/journey");
    const root = page.locator("[data-screen='journey-map']");
    await expect(root).toBeVisible({ timeout: 20_000 });
    await expect(root.locator("[data-card]").first()).toBeVisible({ timeout: 20_000 });
    await page.waitForLoadState("networkidle");

    const read = await pageGet(page, "/api/v1/research/journey");
    expect(read.status, "S00 journey read").toBe(200);
    const descriptor = read.body.descriptor as {
      descriptor_id: string;
      revision: number;
      content_sha256: string;
      phases: { phase_id: string; cards: any[] }[];
    };
    const cards = descriptor.phases.flatMap((phase) => phase.cards);
    expect(cards.length, "the descriptor published cards").toBeGreaterThan(20);

    /* The map on screen is this descriptor's, and says which one: the digest
       line pins the exact revision's content. (The revision *number* is passed
       as a panel `meta`, which `variant="plain"` does not render — recorded in
       the P23 record rather than asserted against something not on screen.) */
    await expect(root.locator("[data-descriptor-digest]")).toHaveText(`${descriptor.descriptor_id} · ${descriptor.content_sha256}`);
    await expect(root.locator("[data-phase]")).toHaveCount(descriptor.phases.length);

    /* Settle before snapshotting: the panel draws a skeleton until the read
       lands, so the card list is read once it is the server's list. */
    await expect
      .poll(() => root.locator("[data-card]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-card"))), { timeout: 20_000 })
      .toEqual(cards.map((card) => card.card_id));
    const drawn = await root.locator("[data-card]").evaluateAll((nodes) =>
      nodes.map((node) => ({
        card: node.getAttribute("data-card"),
        kind: node.getAttribute("data-card-kind"),
        availability: node.getAttribute("data-card-availability"),
        badge: node.getAttribute("data-card-unreachable"),
        picks: node.getAttribute("data-card-picks-run"),
        href: node.getAttribute("href"),
        tag: node.tagName,
        disabled: node.getAttribute("aria-disabled"),
      })),
    );
    /* Every card the server published, in its order, with its own kind and availability. */
    expect(drawn.map((card) => [card.card, card.kind, card.availability])).toEqual(
      cards.map((card) => [card.card_id, card.target_kind, card.availability]),
    );
    /* 00-3: the badge column, derived from the server. A screen the descriptor
       calls built is a link — never "SOON", which only a PLANNED card earns. */
    expect(drawn.map((card) => [card.card, card.badge])).toEqual(cards.map((card) => [card.card_id, expectedJourneyBadge(card)]));
    expect(cards.filter((card) => card.availability === "PLANNED").map((card) => card.card_id), "revision 3 publishes no PLANNED card").toEqual([]);
    expect(drawn.filter((card) => card.badge === null && !card.href).map((card) => card.card), "a built card with nowhere to go").toEqual([]);

    /* The Execution side stays blocked — the server's word, and the screen's. */
    const execution = cards.filter((card) => card.target_kind === "EXECUTION_HANDOFF");
    expect(execution.length, "the descriptor publishes execution-side cards").toBeGreaterThan(0);
    for (const card of execution) {
      expect(card.availability, `${card.card_id} is blocked by the server`).toBe("DEPENDENCY_REQUIRED");
      const node = root.locator(`[data-card='${card.card_id}']`);
      await expect(node).toHaveAttribute("data-card-unreachable", "BLOCKED");
      await expect(node).toHaveAttribute("aria-disabled", "true");
      await expect(node.locator("a")).toHaveCount(0);
      expect(drawn.find((item) => item.card === card.card_id)?.href, `${card.card_id} carries an href`).toBeNull();
    }

    /* D2: a card that needs a run opens the Run Library carrying its target. */
    const picks = drawn.filter((card) => card.picks !== null);
    expect(picks.length, "the map offers no run picker").toBeGreaterThan(0);
    for (const card of picks) {
      const served = cards.find((item) => item.card_id === card.card);
      expect(card.picks, `${card.card} picks a target of its own`).toBe(served.target_key);
      expect(card.href, `${card.card} does not carry its target to the Run Library`).toBe(
        `/research/quantbt/runs?to=${encodeURIComponent(served.target_key)}`,
      );
      expect(served.requires_run, `${card.card} picks a run for a target that needs none`).toBe(true);
    }

    /* "Built" means mounted: each destination is opened, and none of them is
       the shell's "no feature claims this route". A second page keeps the
       journey screen's own request log clean. */
    const destinations = [...new Set(drawn.map((card) => card.href).filter((href): href is string => Boolean(href)))];
    const sweep = await page.context().newPage();
    const sweepObserved = observe(sweep);
    const unmounted: string[] = [];
    for (const href of destinations) {
      await sweep.goto(href, { waitUntil: "domcontentloaded" });
      await sweep.waitForSelector("main, [data-screen]", { timeout: 15_000 }).catch(() => undefined);
      if ((await sweep.locator("body").innerText()).includes(NOT_FOUND_COPY)) unmounted.push(href);
    }
    await sweep.close();
    expect(unmounted, "a card points at a route no feature claims").toEqual([]);
    for (const request of sweepObserved.requests) expect(request, "the route sweep reached a private route").not.toMatch(/\/internal\//);

    expect(await axeBlocking(page, "[data-screen='journey-map']")).toEqual([]);
    await finish(page, `E20-S00-${name}`, observed, {
      revision: descriptor.revision,
      content_sha256: descriptor.content_sha256,
      cards: cards.length,
      badges: drawn.filter((card) => card.badge).map((card) => `${card.card}=${card.badge}`),
      picks_run: picks.map((card) => card.picks),
      destinations,
      route_sweep: { mounted: destinations.length - unmounted.length, unmounted, requests: [...new Set(sweepObserved.requests)], failures: sweepObserved.failures, noise: sweepObserved.noise },
    });
    expect(observed.failures, "S00 failed reads").toEqual([]);
    expect(observed.noise, `S00 console:\n${observed.noise.join("\n")}`).toEqual([]);
  });

  /* ------------------------------------------------------------ Screen 14 */
  test(`E20 S14 alpha import on the canonical fixtures at ${name}`, async ({ page }) => {
    const observed = observe(page);
    await page.setViewportSize({ width, height });
    await signIn(page);

    /*
     * The preview is read-only. Screen 14's four writes are therefore answered
     * in the browser with the fixtures the contract itself ships
     * (`packages/contracts/fixtures`), exactly as E6's fixture lane does — and
     * every other non-GET is aborted and recorded, so a write this cell did
     * not expect fails the test instead of reaching the stack.
     */
    const source = JSON.parse(alphaFixture("source"));
    const gates = JSON.parse(alphaFixture("gates"));
    const registration = JSON.parse(alphaFixture("registration"));
    const activation = JSON.parse(alphaFixture("activation"));
    const writes: string[] = [];
    const escaped: string[] = [];
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      if (request.method() === "GET" || request.method() === "HEAD") return route.continue();
      const path = new URL(request.url()).pathname;
      const fixture =
        path === "/api/v1/research/alphas/import/parse" ? "source"
        : path === "/api/v1/research/alphas/import/gates" ? "gates"
        : path === "/api/v1/research/alphas/import/register" ? "registration"
        : /^\/api\/v1\/research\/alphas\/[^/]+\/activate$/.test(path) ? "activation"
        : null;
      if (fixture === null) {
        escaped.push(`${request.method()} ${path}`);
        return route.abort();
      }
      writes.push(`${request.method()} ${path}`);
      return route.fulfill({ status: 200, contentType: "application/json", body: alphaFixture(fixture) });
    });

    await page.goto("/research/quantbt/alpha-import");
    const root = page.locator("[data-screen='alpha-import']");
    await expect(root).toBeVisible({ timeout: 20_000 });
    await page.waitForLoadState("networkidle");

    /* Header: the HiFi title over the shared crumb, with the real endpoint family. */
    await expect(root.locator("h1")).toHaveText("Alpha Import — standardize the code artifact");
    await expect(root.locator(".ai-crumb [aria-current='page']")).toHaveText("Alpha Import");
    await expect(root.locator("[data-meta]")).toContainText("POST /api/v1/research/alphas/import/*");
    await expect(root.locator("[data-chip]")).toHaveCount(0);

    /* Registry strip: a real read of this workspace's versions, entry by entry. */
    const registryBefore = (await pageGet(page, "/api/v1/research/alphas")).body as { entries: any[] };
    expect(registryBefore.entries.length, "the preview registry has a version to draw").toBeGreaterThan(0);
    await expect(root.locator("[data-registry-entry]")).toHaveCount(registryBefore.entries.length);
    for (const entry of registryBefore.entries) {
      const chip = root.locator(`[data-registry-entry='${entry.alpha_version_id}']`);
      await expect(chip).toHaveAttribute("data-lifecycle", entry.lifecycle_state);
      await expect(chip).toContainText(entry.display_name);
      await expect(chip).toContainText(entry.version_label);
    }

    /*
     * Stepper: three authority states (DQ-06), each one's progress from its
     * receipt. Read with `expect.poll`, not once: a receipt arriving re-renders
     * the step it belongs to, so a single read can land mid-flight and see the
     * state before it. Polling asserts the settled value without weakening it.
     */
    const stepper = () =>
      root.locator("[data-step-marker]").evaluateAll((nodes) => nodes.map((node) => `${node.getAttribute("data-step-marker")}:${node.getAttribute("data-progress")}`));
    await expect(root.locator("[data-step-marker]")).toHaveCount(3);
    await expect.poll(stepper, { timeout: 15_000 }).toEqual(["1:open", "2:open", "3:open"]);

    /* Step 1 — the mirror is the served mirror, row for row. */
    await root.getByLabel("Alpha source text").fill(ALPHA_MODULE);
    await root.locator("[data-action='parse']").click();
    await expect(root.locator("[data-mirror-field]")).toHaveCount(source.mirror.length);
    const mirror = () =>
      root.locator("[data-mirror-field]").evaluateAll((nodes) =>
        nodes.map((node) => [node.getAttribute("data-mirror-field"), node.getAttribute("data-mirror-state"), node.getAttribute("data-mirror-check")]),
      );
    await expect.poll(mirror, { timeout: 15_000 }).toEqual(source.mirror.map((field: any) => [field.field, field.state, field.check]));
    for (const field of source.mirror) {
      const row = root.locator(`[data-mirror-field='${field.field}']`);
      await expect(row.locator("[data-mirror-verdict]")).toHaveAttribute("data-mirror-verdict", field.check);
      if (field.state === "parsed") await expect(row.locator("dd.v")).toContainText(String(field.value));
      else if (field.state === "server_computed") await expect(row.locator("dd.v")).toContainText(String(field.value).slice(0, 15));
      /* A field with no value prints its typed absence, never a blank or a dash. */
      else await expect(row.locator("[data-absent]")).toHaveAttribute("data-absent", field.state);
    }
    await expect(root.locator("[data-chip]")).toHaveAttribute("data-chip", "QUARANTINE");
    await expect.poll(stepper, { timeout: 15_000 }).toEqual(["1:done", "2:open", "3:open"]);

    /*
     * Step 2 — seven gates, each one's state, message and timing source as
     * served. While the one server request is in flight the screen honestly
     * draws seven RUNNING rows (CG-P07-04), and the answer then replaces them
     * with a 120ms stagger from zero. A single read is therefore racy — it can
     * catch the RUNNING set or the empty moment between the two lists — so the
     * exact triple is polled for instead.
     */
    await root.locator("[data-nav='2']").click();
    await root.locator("[data-action='run-gates']").click();
    const gateRows = () =>
      root.locator("[data-gate]").evaluateAll((nodes) =>
        nodes.map((node) => [node.getAttribute("data-gate"), node.getAttribute("data-gate-state"), node.querySelector("[data-gate-timing]")?.getAttribute("data-gate-timing") ?? null]),
      );
    await expect.poll(gateRows, { timeout: 20_000 }).toEqual(gates.gates.map((gate: any) => [gate.name, gate.state, gate.timing_source]));
    for (const gate of gates.gates) {
      await expect(root.locator(`[data-gate='${gate.name}'] [data-gate-message]`)).toContainText(gate.message);
    }
    await expect.poll(stepper, { timeout: 15_000 }).toEqual(["1:done", "2:done", "3:open"]);

    /* Step 3 — the registry rows are the served registration; three rows no v1
       response carries stay typed absences. */
    await root.locator("[data-nav='3']").click();
    await root.getByLabel("Alpha id").fill(registration.alpha_id);
    await root.locator("[data-action='register']").click();
    await expect(root.locator("[data-registration]")).toHaveAttribute("data-registration", registration.alpha_version_id);
    await expect(root.locator("[data-reg-row='alpha_id']")).toContainText(registration.alpha_id);
    await expect(root.locator("[data-reg-row='alpha_version_id']")).toContainText(registration.version_label);
    await expect(root.locator("[data-reg-row='alpha_version_id']")).toContainText(registration.alpha_version_id);
    await expect(root.locator("[data-reg-row='artifact digest']")).toContainText(registration.source_digest.slice(0, 8));
    await expect(root.locator("[data-reg-row='import state']")).toContainText(`${registration.lifecycle_state} · rev ${registration.alpha_revision}`);
    await expect(root.locator("[data-chip]")).toHaveAttribute("data-chip", registration.lifecycle_state);
    for (const [key, code] of [["entrypoint", "REGISTRY_NOT_READ"], ["capability registration", "NOT_IN_V1_CONTRACT"], ["signed publication", "NOT_PUBLISHED"]] as const) {
      await expect(root.locator(`[data-reg-row='${key}'] dd`)).toHaveAttribute("data-absent", code);
    }
    await expect.poll(stepper, { timeout: 15_000 }).toEqual(["1:done", "2:done", "3:done"]);

    /* OL-01: running an imported version is a typed absence, never a live link. */
    const notAdmitted = root.locator("[data-absent-action='new-run']");
    await expect(notAdmitted).toHaveAttribute("data-absent-code", "RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE");
    expect(await notAdmitted.evaluate((node) => node.tagName), "the OL-01 absence is an element that can be followed").toBe("SPAN");
    expect(await notAdmitted.getAttribute("href")).toBeNull();
    expect(await notAdmitted.getAttribute("tabindex")).toBeNull();
    await expect(root.locator("[data-where-next] a[href*='/runs/new']")).toHaveCount(0);
    await expect(root.locator("[data-run-not-admitted]")).toContainText("Not admitted yet (OL-01)");

    /* Activation is a registry action: the chip and the state row take the served lifecycle. */
    await root.locator("[data-action='activate']").click();
    await expect(root.locator("[data-chip]")).toHaveAttribute("data-chip", activation.lifecycle_state);
    await expect(root.locator("[data-reg-row='import state']")).toContainText(`${activation.lifecycle_state} · rev ${activation.alpha_revision}`);

    /* Nothing was written: four stubs, nothing aborted, and the real registry
       is the one it was before — the fixture alpha never reached the preview. */
    expect(writes, "S14 wrote somewhere this cell did not stub").toEqual([
      "POST /api/v1/research/alphas/import/parse",
      "POST /api/v1/research/alphas/import/gates",
      "POST /api/v1/research/alphas/import/register",
      `POST /api/v1/research/alphas/${registration.alpha_version_id}/activate`,
    ]);
    expect(escaped, "a write left the browser for the read-only preview").toEqual([]);
    const registryAfter = (await pageGet(page, "/api/v1/research/alphas")).body as { entries: any[] };
    expect(registryAfter.entries.map((entry) => entry.alpha_version_id), "the preview registry changed").toEqual(
      registryBefore.entries.map((entry) => entry.alpha_version_id),
    );
    expect(registryAfter.entries.some((entry) => entry.alpha_id === registration.alpha_id), "the fixture alpha reached the preview").toBe(false);

    expect(await axeBlocking(page, "[data-screen='alpha-import']")).toEqual([]);
    await finish(page, `E20-S14-${name}`, observed, {
      stubbed: writes,
      escaped,
      stub_note: "the POSTs listed in `requests` are this test's own route fulfillments; the preview answered none of them — registry_before/after is the proof",
      registry_before: registryBefore.entries.map((entry) => entry.alpha_version_id),
      registry_after: registryAfter.entries.map((entry) => entry.alpha_version_id),
      mirror_rows: source.mirror.length,
      gates: gates.gates.length,
    });
    expect(observed.failures, "S14 failed reads").toEqual([]);
    expect(observed.noise, `S14 console:\n${observed.noise.join("\n")}`).toEqual([]);
  });

  /* ------------------------------- Screen 08 on the P04 run (equity sample) */
  test(`E20 S08 P04 equity sample on real reads at ${name}`, async ({ page }) => {
    const observed = observe(page);
    await page.setViewportSize({ width, height });
    await signIn(page);
    await page.goto(`/research/quantbt/runs/${RUN}/execute`);
    const root = page.locator("[data-screen='execute-replay']");
    await expect(root).toBeVisible({ timeout: 20_000 });
    await page.waitForLoadState("networkidle");

    const read = await pageGet(page, `/api/v1/quantbt/runs/${RUN}/execute/replay`);
    expect(read.status, "S08 P04 replay read").toBe(200);
    const replay = read.body as any;
    const items = replay.equity_replay.items as any[];
    expect(items.length, "the P04 source published equity samples").toBeGreaterThan(1);

    /* The P04 run reads the hub lane, and the header is the served contract. */
    await expect(root).toHaveAttribute("data-lane", "hub");
    await expect(root.locator("[data-route-id]").first()).toHaveText(replay.route.id);
    await expect(root.locator("[data-route-state]").first()).toHaveAttribute("data-route-state", replay.route.state);
    await expect(root.locator("[data-replay-contract]").first()).toContainText(replay.route.replay_contract);
    await expect(root.locator("[data-readiness]").first()).toHaveAttribute("data-readiness", replay.readiness);
    const sampling = root.locator("[data-sampling]").first();
    await expect(sampling).toHaveAttribute("data-sampling", replay.equity_replay.sampling);
    await expect(sampling).toContainText(`source observations ${replay.equity_replay.source_observation_count}`);
    await expect(sampling).toContainText(`emitted samples ${replay.equity_replay.emitted_point_count}`);

    /* The chart's accessible table is the whole loaded window, sample for sample. */
    await expect(root.locator("[data-chart-table='replay-equity'] tbody tr")).toHaveCount(items.length);

    /* Spec 08 §2.5's window of 14 rows around the playhead: the exact server
       string rides the cell's title, and the reader sees it formatted. */
    const window = Math.min(14, items.length);
    await expect(root.locator("[data-sample-row]")).toHaveCount(window);
    /* Settle before snapshotting, as on Screen 00. */
    await expect
      .poll(() => root.locator("[data-sample-row]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-sample-row"))), { timeout: 20_000 })
      .toEqual(items.slice(0, window).map((item) => String(item.playback_ordinal)));
    const ledger = await root.locator("[data-sample-row]").evaluateAll((nodes) =>
      nodes.map((node) => {
        const cells = [...node.querySelectorAll("td")];
        return {
          ordinal: node.getAttribute("data-sample-row"),
          equity: cells[2]?.textContent?.trim() ?? "",
          equityExact: cells[2]?.getAttribute("title"),
          drawdown: cells[3]?.textContent?.trim() ?? "",
          drawdownExact: cells[3]?.getAttribute("title"),
        };
      }),
    );
    expect(ledger.map((row) => [row.ordinal, row.equityExact, row.drawdownExact])).toEqual(
      items.slice(0, window).map((item) => [String(item.playback_ordinal), item.equity, item.drawdown_fraction]),
    );
    for (const row of ledger) {
      expect(row.equity, `S08 ledger equity "${row.equity}" is not a displayed currency`).toMatch(/^\d{1,3}(,\d{3})*\.\d{2}$/);
      expect(row.drawdown, `S08 ledger drawdown "${row.drawdown}" is not a displayed percentage`).toMatch(/^[+−]\d{1,3}(,\d{3})*\.\d{2}%$/);
    }

    /* E2b/DQ-08: no raw float from this response reaches the reader. The
       chart's sr-only data table is the exact series by design, so it is
       removed before looking — everything a reader sees must be formatted. */
    const shown = await root.evaluate((node) => {
      const copy = node.cloneNode(true) as HTMLElement;
      copy.querySelectorAll("style, .sr-only, [data-chart-table]").forEach((element) => element.remove());
      return copy.textContent ?? "";
    });
    /* …and that copy really is what the reader sees, so the next loop is not
       looking at an empty string. */
    expect(shown, "the reader's copy of the ledger was not captured").toContain(ledger[0]!.equity);
    for (const item of items) {
      for (const raw of [item.equity, item.drawdown_fraction]) {
        if (/\.\d{3,}/.test(String(raw))) expect(shown, `S08 prints the raw float ${raw}`).not.toContain(String(raw));
      }
    }

    /* The playhead's own values are the first sample's, exact in their titles. */
    const readout = root.locator("[data-playhead-readout]");
    await expect(readout).toHaveAttribute("data-playhead-readout", String(items[0].playback_ordinal));
    expect(await readout.locator("[title]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("title")))).toEqual([
      String(items[0].equity),
      String(items[0].drawdown_fraction),
    ]);

    /* The transport is drawn with its five glyphs, each one laid out and able
       to move the playhead — the clock the rest of the screen listens to. */
    const transport = await root.locator("[data-transport] button[aria-label]").evaluateAll((nodes) =>
      nodes.map((node) => [node.getAttribute("aria-label"), node.textContent?.trim(), node.getBoundingClientRect().width > 0]),
    );
    expect(transport).toEqual([
      ["window start", "|◀", true],
      ["step back", "◀◀", true],
      ["play", "▶", true],
      ["step forward", "▶▶", true],
      ["window end", "▶|", true],
    ]);
    expect(await root.locator("[data-transport] [data-speed]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-speed")))).toEqual(["1", "4", "16", "64"]);
    await root.locator("[data-transport] button[aria-label='step forward']").click();
    await expect(readout).toHaveAttribute("data-playhead-readout", String(items[1].playback_ordinal));
    await expect(root.locator("[data-sample-row][data-play='true']")).toHaveAttribute("data-sample-row", String(items[1].playback_ordinal));

    /* Every capability the route did not publish carries the server's own code —
       candles above all: this run replays samples, and never draws a bar. */
    for (const [key, fact] of Object.entries(replay.route_capabilities) as [string, any][]) {
      const code = fact.reason_code ?? fact.availability?.reason_code;
      if (!code) continue;
      const chips = await root.locator(`[data-capability='${key}']`).evaluateAll((nodes) =>
        nodes.map((node) => [node.getAttribute("data-capability-state"), node.querySelector("[data-reason-code]")?.textContent?.trim()]),
      );
      expect(chips.length, `S08 draws no capability row for ${key}`).toBeGreaterThan(0);
      for (const chip of chips) expect(chip, `S08 ${key} does not carry the served reason`).toEqual([fact.state, code]);
    }
    expect(replay.route_capabilities.candle_windows.reason_code, "the P04 candle absence is typed").toBe("P04_SOURCE_DID_NOT_PUBLISH_REPLAY_CANDLE_WINDOWS");
    await expect(root.locator("[data-candle-row]")).toHaveCount(0);

    /* E2b left this screen at 0 px of horizontal overflow at 660; keep it there. */
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `S08 P04 horizontal overflow at ${width} (E2b closed a 91px one)`).toBe(0);

    /* The absences are behind one disclosure; a reader can open it, and the
       candle line is there in words, for every absence the server declared. */
    const absences = Object.keys(replay.source_absences);
    await expect(root.locator("[data-source-absences]")).toHaveAttribute("data-source-absences", String(absences.length));
    await root.locator("[data-source-absences] > summary").click();
    await expect(root.locator("[data-source-absence]")).toHaveCount(absences.length);
    await expect(root.locator("[data-source-absence='candles']")).toBeVisible();
    await expect(root.locator("[data-source-absence='candles']")).toContainText("candles — not published");
    const openOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(openOverflow, `S08 P04 overflow at ${width} with the absences open`).toBe(0);

    expect(await axeBlocking(page, "[data-screen='execute-replay']")).toEqual([]);
    await finish(page, `E20-S08-P04-${name}`, observed, {
      run: RUN,
      route: replay.route,
      readiness: replay.readiness,
      sampling: replay.equity_replay.sampling,
      source_observation_count: replay.equity_replay.source_observation_count,
      emitted_point_count: replay.equity_replay.emitted_point_count,
      ledger_rows: window,
      candle_reason: replay.route_capabilities.candle_windows.reason_code,
      source_absences: absences.length,
      overflow,
      overflow_absences_open: openOverflow,
    });
    expect(observed.failures, "S08 P04 failed reads").toEqual([]);
    expect(observed.noise, `S08 P04 console:\n${observed.noise.join("\n")}`).toEqual([]);
  });
}
