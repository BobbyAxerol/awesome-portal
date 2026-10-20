/**
 * Scoped-slice reads for the e2e BFF double (UXM-08 browser receipt, lane BFF_DOUBLE; the page itself is FIXTURE_LAB).
 *
 * ADDITIVE: it answers nothing the other doubles answer. It adds exactly one behaviour, "access to the slice's scope was
 * withdrawn": once `revoke()` is called, a Portal read of the screens the slice links to (Portfolios, Portfolio 360, Alpha Fleet,
 * Alpha 360) is answered 403 `ACCESS_DENIED`, the same typed refusal `bffDoubleAlpha.ts` uses for `alpha_denied`. Before `revoke()`
 * it answers `null` and the request falls through to the existing doubles.
 *
 * The ids and the scope come from the canonical published example (`execution-manager-scoped.synthetic.valid.json`, lane
 * `TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT`), never typed here, so a change to the published example moves this double with it.
 *
 * What it does not do: it does not model the stream, a revocation frame or a snapshot read. The slice's own lane does that
 * in the page (`screens/slice/canonicalLane.ts`); this double only says what a Portal read of a linked screen would answer
 * once the same access is gone. It sends nothing and holds no data.
 *
 * Wiring (registered by the spec, AFTER `stubExecutionBff`, so it is asked first):
 *
 *   const scoped = await stubScopedBff(page);
 *   ...
 *   scoped.revoke();
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";

const CONTRACTS = join(dirname(fileURLToPath(import.meta.url)), "../../../../packages/contracts/fixtures");
const EXAMPLE = (JSON.parse(readFileSync(join(CONTRACTS, "execution-manager-scoped.synthetic.valid.json"), "utf8")) as {
  cases: { workspace_id: string; environment: string; items: { identity: { alpha_id: string; portfolio_id: string } }[] }[];
}).cases[0];

/** The scope of the published example: what the slice asks to be authorized for. */
export const SCOPED_WORKSPACE = EXAMPLE.workspace_id;
export const SCOPED_ENVIRONMENT = EXAMPLE.environment;
export const SCOPED_PORTFOLIO_ID = EXAMPLE.items[0].identity.portfolio_id;
export const SCOPED_ALPHA_ID = EXAMPLE.items[0].identity.alpha_id;

/** The slice route with the context the example is authorized for. */
export const SLICE_URL = `/execution/slice?env=${SCOPED_ENVIRONMENT}&workspace_id=${SCOPED_WORKSPACE}&window=30d`;

export interface BffAnswerScoped {
  status: number;
  body: unknown;
}

const READS = [
  /^\/portfolios$/,
  /^\/resources\/portfolios\//,
  /^\/derivations\/portfolios\//,
  /^\/portfolios\/[^/]+\//,
  /^\/alphas$/,
  /^\/resources\/alphas\//,
  /^\/alphas\/[^/]+\//,
  /^\/derivations\/alphas\//,
  /^\/views\//,
  /^\/subjects\//,
];

export interface ScopedBff {
  revoke(): void;
  isRevoked(): boolean;
  /** Pure: the answer for one request, or `null` to fall through. */
  answer(method: string, pathname: string): BffAnswerScoped | null;
}

export function createScopedBff(): ScopedBff {
  let revoked = false;
  return {
    revoke: () => {
      revoked = true;
    },
    isRevoked: () => revoked,
    answer(method, pathname) {
      if (!revoked || method !== "GET") return null;
      const path = pathname.replace(/^\/api\/v1\/execution/, "") || "/";
      if (!READS.some((pattern) => pattern.test(path))) return null;
      return { status: 403, body: { error: { code: "ACCESS_DENIED", message: "Your access to this scope was withdrawn." } } };
    },
  };
}

/** Register on a page. Playwright asks the last registered route first, so call this after `stubExecutionBff`. */
export async function stubScopedBff(page: Page): Promise<ScopedBff> {
  const scoped = createScopedBff();
  await page.route("**/api/v1/execution/**", (route) => {
    const request = route.request();
    const answer = scoped.answer(request.method(), new URL(request.url()).pathname);
    if (answer === null) return route.fallback();
    return route.fulfill({ status: answer.status, contentType: "application/json", body: JSON.stringify(answer.body) });
  });
  return scoped;
}
