/**
 * Reads the shared BFF double (`bffDouble.ts`) leaves at 501 or at its typed 404, answered for the V2 specs whose console must stay clean:
 * the same canonical fixtures and the same handlers `execution-v2-visual.spec.ts` uses, so a spec that watches the page sees no failed read
 * for a screen that now asks for them (Overview digest, an alpha's lifecycle, an approval's evidence, an incident's children, the paged alpha
 * catalogue, the equity projection of a deployment room). Fixture lane only: nothing here says what a real source answers.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";

import { answerEquityProjection } from "../../fixture-bff/equity-projection";
import { answerExecutionBff } from "./bffDouble";
import { incidentChildrenBody } from "./bffWorld";

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../packages/contracts/fixtures");

function fixtureBody(file: string, pick: (json: Record<string, unknown>) => Record<string, unknown>): Record<string, unknown> {
  return pick(JSON.parse(readFileSync(resolve(FIXTURES, file), "utf8")) as Record<string, unknown>);
}

/** The New request picker reads the paged alpha catalogue (FE-069): the canonical published valid body answers it, one page. */
export async function stubAlphaCatalogue(page: Page): Promise<void> {
  const body = fixtureBody("research-run-library-alpha-catalogue.synthetic.valid.json", (json) => json);
  await page.route(/\/api\/v1\/quantbt\/runs\/alpha-catalogue(\?|$)/, (route) => (route.request().method() === "GET"
    ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) })
    : route.fallback()));
}

/** The deployment rooms read the equity projection (R-C): the fixture BFF's own handler answers it from the world. */
export async function stubEquityProjection(page: Page): Promise<void> {
  await page.route(/\/api\/v1\/execution\/deployments\/[^/]+\/equity-projection(\?|$)/, (route) => {
    const url = new URL(route.request().url());
    const answer = answerEquityProjection({ method: route.request().method(), path: url.pathname, search: url.search, headers: {}, body: null });
    if (answer === null) return route.fallback();
    return route.fulfill({ status: answer.status, headers: answer.headers, body: JSON.stringify(answer.body) });
  });
}

/** The visit digest, an alpha's lifecycle record, an approval's evidence and an incident's children: only a read the double leaves at 501 is answered here. */
export async function stubPublishedReads(page: Page, options: Parameters<typeof answerExecutionBff>[4]): Promise<void> {
  const digest = fixtureBody("execution-visit-digest.synthetic.valid.json", (json) => (json.cases as { first_visit: Record<string, unknown> }).first_visit);
  const lifecycle = fixtureBody("execution-alpha-lifecycle.published.synthetic.valid.json", (json) => json.value as Record<string, unknown>);
  const evidence = fixtureBody("execution-approval-evidence.published.synthetic.valid.json", (json) => json.value as Record<string, unknown>);
  await page.route("**/api/v1/execution/**", (route) => {
    const url = new URL(route.request().url());
    const workspace = url.searchParams.get("workspace_id") ?? (digest.workspace_id as string);
    const answer = (body: Record<string, unknown>) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...body, workspace_id: workspace }) });
    if (route.request().method() !== "GET") return route.fallback();
    if (answerExecutionBff("GET", url.pathname, url.searchParams, options).status !== 501) return route.fallback();
    if (url.pathname === "/api/v1/execution/visit-digest") return answer(digest);
    const alpha = /^\/api\/v1\/execution\/alphas\/([^/]+)\/lifecycle$/.exec(url.pathname);
    if (alpha !== null) return answer({ ...lifecycle, alpha_id: decodeURIComponent(alpha[1]!) });
    const approval = /^\/api\/v1\/execution\/governance\/approvals\/([^/]+)\/evidence$/.exec(url.pathname);
    if (approval !== null) return answer({ ...evidence, approval_id: decodeURIComponent(approval[1]!) });
    const children = /^\/api\/v1\/execution\/operations\/incidents\/([^/]+)\/children$/.exec(url.pathname);
    const world = children === null ? null : incidentChildrenBody(decodeURIComponent(children[1]!), workspace);
    if (world !== null) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(world) });
    return route.fallback();
  });
}

/** All four, in the order the visual lane registers them. Pass the options given to `stubExecutionBff`. */
export async function stubV2Reads(page: Page, options: Parameters<typeof answerExecutionBff>[4]): Promise<void> {
  await stubPublishedReads(page, options);
  await stubAlphaCatalogue(page);
  await stubEquityProjection(page);
}

/**
 * The workspaces the fixture lane does not serve answer a deployment's equity projection with its typed 404 (`fixture-bff/equity-projection.ts`: no existence
 * oracle), and Chromium prints one console line per failed load. Those pairs, and only those, are the intended absence: every other line stays an offence.
 */
export function withoutProjectionAbsence(lines: string[]): string[] {
  const isRead = (line: string) => /^404 GET \S*\/deployments\/[^/]+\/equity-projection\?/.test(line);
  let consoleLines = lines.filter(isRead).length;
  return lines.filter((line) => {
    if (isRead(line)) return false;
    if (consoleLines > 0 && /^error: Failed to load resource: the server responded with a status of 404 /.test(line)) {
      consoleLines -= 1;
      return false;
    }
    return true;
  });
}
