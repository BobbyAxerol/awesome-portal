/**
 * One pure answerer for every route the Execution V2 screens read from the BFF.
 *
 * `answerFixtureRequest(request, options)` takes a request as data (method, path, query string,
 * headers, parsed body) and answers it as data (status, headers, body), or `null` for a route no
 * double models. It does no I/O, holds no socket and imports no browser or Playwright code, so two
 * callers share it:
 *
 *  - the standalone fixture BFF (`apps/portal/fixture-bff`), which puts it behind `node:http`;
 *  - any test that wants the answers without a browser.
 *
 * The Playwright stubs are NOT rewired onto it. `stubExecutionBff` was already a thin adapter over
 * the pure `answerExecutionBff`, and the admin reads are wired inline by the specs; this module
 * composes the same functions in the same order the V2 specs do (`execution-v2-s1.spec.ts`), so a
 * spec and the server answer one request identically. `src/fixtureBff/equivalence.test.ts` proves
 * that against answers recorded from the stub before this file existed.
 *
 * What it adds, and nothing more:
 *  - `null` instead of the double's 501 `bff_double_gap` ("not mine": the server answers 404
 *    FIXTURE_ROUTE_NOT_SERVED rather than anything fabricated);
 *  - the session capabilities the specs inline for `GET /api/admin/access/self`, so the screens are
 *    not fail-closed;
 *  - the admin reads (`/api/admin/profile-access/v2/effective`, `/api/admin/accounts`,
 *    `/api/admin/step-up`) from their own doubles, and the four advisory self reads of `bffDoubleSelfAccess.ts`
 *    (`self-navigation`, `eligibility`, `eligibility/batch`, `self-context`);
 *  - the Run Library list (`GET /api/v1/quantbt/runs`) the New request pickers read;
 *  - the four shell bootstrap reads (`bffDoubleShell.ts`: the fixture identity, the registry, the links and the summary), so a
 *    deployed preview needs no Control API to sign in.
 */
import { answerAccessEffective, ACCESS_DOUBLE_DEFAULT_USER } from "./bffDoubleAccess";
import { answerSelfAccess } from "./bffDoubleSelfAccess";
import { fixtureNowMs } from "./bffScale";
import { answerUsers, setUsersDoubleSessionUser } from "./bffDoubleUsers";
import { answerExecutionBff, type BffDoubleOptions } from "./bffDouble";
import { answerQuantbtRuns, QUANTBT_RUNS_PATH } from "./bffDoubleStage";
import { answerShell, SHELL_PATHS } from "./bffDoubleShell";

export interface BffRequest {
  method: string;
  /** The URL path, no query string. */
  path: string;
  /** The raw query string, with or without the leading `?`. */
  search: string;
  /** Lower-case header names. No double reads them today; they are part of the request so one can. */
  headers: Record<string, string | undefined>;
  /** Parsed JSON for a write, otherwise `null`. */
  body: unknown;
}

export interface BffResponse {
  status: number;
  /** Lower-case header names. `content-type` is always set. */
  headers: Record<string, string>;
  /** A JSON-serialisable value, or a string for an event stream. */
  body: unknown;
}

export interface FixtureAnswererOptions extends BffDoubleOptions {
  /** The signed-in user the access reads describe. Defaults to the id the doubles use. */
  userId?: string;
  /** Capabilities `GET /api/admin/access/self` grants. Defaults to {@link MANAGER_CAPABILITIES}. */
  capabilities?: readonly string[];
}

/**
 * A manager-like session: the owner capabilities the portal issues today plus the four menu tokens a live
 * self-navigation read would add (`nav:<served feature id>`, FE-037, DEBT-UXM07-005; no server capability). Without
 * them every Accounts, Portfolios and Operations page correctly stays fail-closed. Copied from `e2e/execution-v2-s1.spec.ts`; a test keeps the two
 * lists equal.
 */
export const MANAGER_CAPABILITIES: readonly string[] = [
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
  "nav:EXECUTION_PORTFOLIOS",
  "nav:EXECUTION_ACCOUNTS_BINDINGS",
  "nav:EXECUTION_OPERATIONS",
  "nav:EXECUTION_BLOTTER",
];

/**
 * The session ceiling the self reads publish: a year after the fixture clock. The fixture clock (`FIXTURE_NOW_ISO`) is a fixed
 * instant that is already in the past when a preview is opened, and a read whose ceiling had passed would be refused on arrival;
 * a year keeps the answer deterministic (the same request answers the same bytes) without being expired.
 */
export const SELF_ACCESS_CEILING_MS = 366 * 24 * 60 * 60 * 1000;

export const EXECUTION_PREFIX = "/api/v1/execution";
export const ACCESS_SELF_ROUTE = "/api/admin/access/self";

/** Both V2 flags on: what the V2 screens read (the options `execution-v2-s1.spec.ts` stubs with). */
export const V2_OPTIONS: BffDoubleOptions = { operationsV2: true, screensV2: true };

const JSON_HEADERS = { "content-type": "application/json" } as const;

function respond(answer: { status: number; body: unknown; contentType?: string }): BffResponse {
  return { status: answer.status, headers: { "content-type": answer.contentType ?? JSON_HEADERS["content-type"] }, body: answer.body };
}

function isGap(answer: { status: number; body: unknown }): boolean {
  if (answer.status !== 501) return false;
  const error = (answer.body as { error?: { code?: unknown } } | null)?.error;
  return error?.code === "bff_double_gap";
}

export function answerFixtureRequest(request: BffRequest, options: FixtureAnswererOptions = V2_OPTIONS): BffResponse | null {
  const method = request.method.toUpperCase();
  const params = new URLSearchParams(request.search.startsWith("?") ? request.search.slice(1) : request.search);
  const { path } = request;

  if (path === EXECUTION_PREFIX || path.startsWith(`${EXECUTION_PREFIX}/`)) {
    const answer = answerExecutionBff(method, path, params, options, request.body ?? undefined);
    return isGap(answer) ? null : respond(answer);
  }

  // The Run Library list the New request pickers read. It is outside /api/v1/execution, so the doubles above never see it.
  if (path === QUANTBT_RUNS_PATH) {
    const answer = answerQuantbtRuns(method, params);
    return answer === null ? null : respond(answer);
  }

  // The shell bootstrap: who is signed in (a synthetic fixture reviewer), the registry, the links, the summary.
  if (SHELL_PATHS.includes(path)) {
    const answer = answerShell(method, path, { userId: options.userId ?? ACCESS_DOUBLE_DEFAULT_USER });
    return answer === null ? null : respond(answer);
  }

  if (path === ACCESS_SELF_ROUTE) {
    if (method !== "GET") return null;
    return respond({
      status: 200,
      body: {
        schema_version: "portal.owner-access.v1",
        record_authority: "PORTAL_CONTROL",
        user_id: options.userId ?? ACCESS_DOUBLE_DEFAULT_USER,
        is_owner: true,
        owner_state: "OWNER",
        capabilities: options.capabilities ?? MANAGER_CAPABILITIES,
        mutation_requirements: { origin: "REQUIRED", csrf: "REQUIRED", step_up: "REQUIRED_FOR_DESTRUCTIVE" },
      },
    });
  }

  if (path.startsWith("/api/admin/")) {
    // ===== WP-E begin: the roster carries the signed-in person (simulated lanes only; see bffDoubleUsers `setUsersDoubleSessionUser`)
    setUsersDoubleSessionUser(options.simulated === true ? options.userId ?? ACCESS_DOUBLE_DEFAULT_USER : null);
    // ===== WP-E end
    // The same order the V2 spec uses: the access read first, then the Users reads.
    const answer =
      answerSelfAccess(method, path, params, { nowMs: fixtureNowMs(), ceilingMs: SELF_ACCESS_CEILING_MS }) ??
      answerAccessEffective(method, path, params, { userId: options.userId }) ??
      answerUsers(method, path, params);
    return answer === null ? null : respond(answer);
  }

  return null;
}
