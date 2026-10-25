/**
 * The fixture BFF: the Playwright doubles behind `node:http`, so a deployed preview can serve the
 * Execution V2 screens with full, realistic fixture data. FIXTURE_LAB lane. NOT acceptance evidence.
 *
 * It answers the routes the doubles model, from the doubles' own code (`e2e/bffAnswerer.ts`), and
 * nothing else: an unknown path is 404 FIXTURE_ROUTE_NOT_SERVED, never a fabricated body. It reads
 * no file but the published fixtures the doubles load at start, opens no outbound connection and
 * keeps no production state. The visit-digest adapter retains bounded per-user/workspace
 * scenario acknowledgement state for this server's lifetime only.
 *
 * `createFixtureServer` applies the configuration to the doubles, which are module singletons, so a
 * process runs ONE fixture server (tests call `resetFixtureGlobals` between runs).
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { answerFixtureRequest, type BffRequest, type BffResponse, type FixtureAnswererOptions, V2_OPTIONS } from "../frontend/e2e/bffAnswerer";
import { setOverviewDoubleVariants, setOverviewPlanMode, resetOverviewDouble, type OverviewDoubleVariants } from "../frontend/e2e/bffDoubleOverview";
import { OPERATIONS_V2_DOUBLE_NOW_ISO } from "../frontend/e2e/bffDoubleV2";
import { ACCESS_DOUBLE_DEFAULT_USER } from "../frontend/e2e/bffDoubleAccess";
import { setUsersDoubleLastSignIn, setUsersDoubleVariant, type UsersDoubleVariant } from "../frontend/e2e/bffDoubleUsers";
import { isScaleName, setFixtureNow, setFixtureScale, type ScaleName } from "../frontend/e2e/bffScale";
import { isReviewProfile, reviewCatalog, reviewHtml, type ReviewProfile } from "./review-catalog";
import { answerReviewManager, wpAccountBook, wpAlphaResource, wpDeploymentFact, wpPortfolioBook, wpRecall } from "./review-manager";
import { setPositiveMode } from "../frontend/e2e/bffPositiveMode";
import { commandStoryRoute } from "./command-story";
import { applyScenarioBody, resetFixtureTransitions, scenarioRequest, scenarioVariants } from "./scenario-apply";
import { onScenarioChange, healsDoubles, configuredScenario, configureScenario, DEFAULT_SCENARIO, type FixtureScenario, FIXTURE_SCENARIOS, getScenario, isFixtureScenario, resetScenario, SCENARIO_DESCRIPTIONS, setScenario } from "./scenario";
import { transformReviewBody } from "./review-relations";
import { rebaseBody } from "./time-rebase";
import { createVisitDigestFixture } from "./review-visit-digest";

export const LANE_HEADER = "x-fixture-lane";
export const DEFAULT_LANE = "FIXTURE_LAB";
export const MAX_BODY_BYTES = 1024 * 1024;
export const SOURCE_NOTE = "e2e doubles + published synthetic fixtures";

export interface FixtureConfig {
  port: number;
  host: string;
  laneLabel: string;
  scale: ScaleName;
  nowIso: string;
  userId: string;
  /** `doubles`: the writes the doubles model answer as they do. `refuse`: every non-GET is 405. */
  writes: "doubles" | "refuse";
  overview: Partial<OverviewDoubleVariants>;
  users: UsersDoubleVariant | null;
  /** Opt-in server-only data. Never a browser/real-API fallback. */
  reviewProfile: ReviewProfile;
  /** WP-P: the review scenario (FIXTURE_SCENARIO). `positive` is the default world; the others are separately selectable. */
  scenario: FixtureScenario;
  /** Preview only (FIXTURE_REBASE_TIME=1): shift the time-valued fields of a served body to the real clock (see time-rebase.ts). */
  rebaseTime: boolean;
}

/* ── configuration ──────────────────────────────────────────────────────── */

const OVERVIEW_VALUES: { [K in keyof OverviewDoubleVariants]: readonly OverviewDoubleVariants[K][] } = {
  commandCenter: ["busy", "quiet", "partial", "stale", "feed-unavailable"],
  fleet: ["passthrough", "multi-currency", "empty-summary", "no-summary", "error"],
  operations: ["v2", "legacy"],
  blotter: ["paged", "partial", "stale", "empty", "denied", "error"],
  admin: ["relay-off", "connected-read", "partial", "denied"],
  stream: ["unpublished", "published"],
};
const USERS_VALUES: readonly UsersDoubleVariant[] = ["paged", "verified", "empty", "denied", "broken"];

export class ConfigError extends Error {}

/** Reads the named variables and nothing else. No file, no secret. */
export function loadConfig(env: Record<string, string | undefined>): FixtureConfig {
  const text = (name: string): string | undefined => {
    const value = env[name];
    return value === undefined || value.trim() === "" ? undefined : value.trim();
  };

  const port = Number(text("PORT") ?? "4100");
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new ConfigError("PORT must be an integer from 0 to 65535");

  const laneLabel = text("FIXTURE_LANE_LABEL") ?? DEFAULT_LANE;
  // The label always starts FIXTURE_LAB, so no configuration can dress this server up as another lane.
  if (!/^FIXTURE_LAB[A-Za-z0-9_./-]{0,48}$/.test(laneLabel)) throw new ConfigError("FIXTURE_LANE_LABEL must start with FIXTURE_LAB");

  const scale = text("FIXTURE_SCALE") ?? "medium";
  if (!isScaleName(scale)) throw new ConfigError("FIXTURE_SCALE must be small, medium or large");

  const nowIso = text("FIXTURE_NOW_ISO") ?? OPERATIONS_V2_DOUBLE_NOW_ISO;
  if (!Number.isFinite(Date.parse(nowIso))) throw new ConfigError("FIXTURE_NOW_ISO must be an ISO-8601 instant");

  const rebaseRaw = text("FIXTURE_REBASE_TIME");
  if (rebaseRaw !== undefined && rebaseRaw !== "0" && rebaseRaw !== "1") throw new ConfigError("FIXTURE_REBASE_TIME must be 0 or 1");

  const writes = text("FIXTURE_WRITES") ?? "doubles";
  if (writes !== "doubles" && writes !== "refuse") throw new ConfigError("FIXTURE_WRITES must be doubles or refuse");
  const reviewProfile = text("FIXTURE_REVIEW_PROFILE") ?? "sparse-realistic";
  if (!isReviewProfile(reviewProfile)) throw new ConfigError("FIXTURE_REVIEW_PROFILE must be sparse-realistic, populated or layout-stress");

  const scenario = text("FIXTURE_SCENARIO") ?? DEFAULT_SCENARIO;
  if (!isFixtureScenario(scenario)) throw new ConfigError(`FIXTURE_SCENARIO must be one of ${FIXTURE_SCENARIOS.join(", ")}`);

  let overview: Partial<OverviewDoubleVariants> = {};
  let users: UsersDoubleVariant | null = null;
  const variantsText = text("FIXTURE_VARIANTS");
  if (variantsText !== undefined) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(variantsText);
    } catch {
      throw new ConfigError("FIXTURE_VARIANTS must be JSON, e.g. {\"overview\":{\"blotter\":\"stale\"},\"users\":\"verified\"}");
    }
    const record = (parsed ?? {}) as { overview?: Record<string, unknown>; users?: unknown };
    for (const [key, value] of Object.entries(record.overview ?? {})) {
      const allowed = (OVERVIEW_VALUES as Record<string, readonly unknown[] | undefined>)[key];
      if (allowed === undefined || !allowed.includes(value)) throw new ConfigError(`FIXTURE_VARIANTS.overview.${key} is not a known variant`);
      overview = { ...overview, [key]: value };
    }
    if (record.users !== undefined) {
      if (!USERS_VALUES.includes(record.users as UsersDoubleVariant)) throw new ConfigError("FIXTURE_VARIANTS.users is not a known variant");
      users = record.users as UsersDoubleVariant;
    }
  }

  return {
    port,
    host: text("FIXTURE_HOST") ?? "0.0.0.0",
    laneLabel,
    scale,
    nowIso,
    rebaseTime: rebaseRaw === "1",
    userId: text("FIXTURE_USER_ID") ?? ACCESS_DOUBLE_DEFAULT_USER,
    writes,
    overview,
    users,
    reviewProfile,
    scenario,
  };
}

/** Puts the doubles back to what the specs expect (tests; a server never needs it). */
export function resetFixtureGlobals(): void {
  onScenarioChange(null);
  setFixtureScale("small");
  setOverviewPlanMode("sequence");
  resetOverviewDouble();
  setPositiveMode(false);
  setUsersDoubleVariant("paged");
  setUsersDoubleLastSignIn(false);
}

function applyConfig(config: FixtureConfig): void {
  resetFixtureGlobals();
  setFixtureScale(config.scale);
  setFixtureNow(config.nowIso);
  // The real command relay only ever answers BLOCKED; the doubles' ACCEPTED/UNKNOWN walk is for specs.
  setOverviewPlanMode("blocked");
  configureScenario(config.scenario);
  applyScenarioToDoubles(config);
  onScenarioChange(() => applyScenarioToDoubles(config));
  // SIMULATED (FE-CAT-8): the roster's last sign-in, only on the populated and layout-stress profiles like the other overlays.
  setUsersDoubleLastSignIn(config.reviewProfile !== "sparse-realistic");
}

/**
 * WP-P: puts the doubles' variants where the SELECTED scenario wants them. An explicit FIXTURE_VARIANTS still wins (it is the
 * operator's own override). The sparse-realistic profile is the legacy contract lane: it keeps the doubles' defaults whatever the scenario.
 */
function applyScenarioToDoubles(config: FixtureConfig): void {
  resetOverviewDouble();
  // WP-P: the positive world heals the doubles that used to default to a degraded story (accounts, bindings); stale/partial/missing keep them.
  setPositiveMode(config.reviewProfile !== "sparse-realistic" && healsDoubles(getScenario()), wpAccountBook, wpPortfolioBook, wpDeploymentFact, wpRecall);
  setOverviewPlanMode("blocked");
  const chosen = config.reviewProfile === "sparse-realistic" ? { overview: {}, users: "paged" as const } : scenarioVariants(getScenario());
  setOverviewDoubleVariants({ ...chosen.overview, ...config.overview });
  setUsersDoubleVariant(config.users ?? chosen.users);
}

/* ── the request ────────────────────────────────────────────────────────── */

const LANE_PATH = "/__fixture/lane";
const HEALTH_PATH = "/__fixture/healthz";
const SCENARIO_PATH = "/__fixture/scenario";

function send(response: ServerResponse, config: FixtureConfig, status: number, body: unknown, headers: Record<string, string> = {}): void {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    [LANE_HEADER]: config.laneLabel,
    "x-fixture-profile": config.reviewProfile,
    "x-fixture-scenario": getScenario(),
    ...headers,
  });
  response.end(payload);
}

class TooLarge extends Error {}

/** At most MAX_BODY_BYTES, counted as it arrives: a lying or absent Content-Length buys nothing. */
function readBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const declared = Number(request.headers["content-length"] ?? "0");
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      reject(new TooLarge());
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    const onData = (chunk: Buffer): void => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        // Stop keeping bytes at once; the caller answers 413 and closes the connection.
        request.off("data", onData);
        chunks.length = 0;
        reject(new TooLarge());
        return;
      }
      chunks.push(chunk);
    };
    request.on("data", onData);
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function laneBody(config: FixtureConfig): Record<string, unknown> {
  return {
    lane: DEFAULT_LANE,
    not_acceptance: true,
    source: SOURCE_NOTE,
    lane_label: config.laneLabel,
    scale: config.scale,
    fixture_now_iso: config.nowIso,
    writes: config.writes,
    review_profile: config.reviewProfile,
    scenario: getScenario(),
    configured_scenario: configuredScenario(),
    review_catalog: "/__fixture/review",
    real_api_fallback: false,
  };
}

function answererOptions(config: FixtureConfig): FixtureAnswererOptions {
  // SIMULATED facts (e2e/bffSimulated.ts) only on the populated and layout-stress profiles; the sparse default is unchanged.
  return { ...V2_OPTIONS, userId: config.userId, simulated: config.reviewProfile !== "sparse-realistic" };
}

function answerFor(config: FixtureConfig, rawRequest: BffRequest): BffResponse | null {
  const profile = config.reviewProfile;
  // WP-P: the selected scenario may reroute a read to a negative case the doubles already model, and shape the value-rewrite scenarios.
  const request = profile === "sparse-realistic" ? rawRequest : scenarioRequest(getScenario(), rawRequest);
  const review = profile === "sparse-realistic" ? null : answerReviewManager(request.method, request.path,
    new URLSearchParams(request.search), profile, request.body);
  const answered = review === null ? answerFixtureRequest(request, answererOptions(config)) : {
    ...review, headers: { "content-type": "application/json" },
  };
  if (answered === null || profile === "sparse-realistic" || answered.status !== 200 || request.method !== "GET") return answered;
  let shaped = transformReviewBody(request.path, answered.body, profile);
  // WP-P (R2-02): every alpha resource is derived from that alpha's own deployments in the positive-like scenarios, not cloned from the double's one alpha.
  const alphaResource = healsDoubles(getScenario()) ? /^\/api\/v1\/execution\/resources\/alphas\/([^/]+)$/.exec(request.path) : null;
  if (alphaResource !== null) shaped = wpAlphaResource(shaped, decodeURIComponent(alphaResource[1]!));
  return { ...answered, body: applyScenarioBody(getScenario(), request.path, shaped) };
}

export function createFixtureServer(config: FixtureConfig): Server {
  applyConfig(config);
  const visitDigest = createVisitDigestFixture();

  const server = createServer((incoming, response) => {
    void handle(config, incoming, response, visitDigest).catch((error: unknown) => {
      if (response.headersSent) {
        response.destroy();
        return;
      }
      // A path segment the doubles cannot decode (a lone %) is the caller's mistake; anything else is ours.
      if (error instanceof URIError) send(response, config, 400, { error: "FIXTURE_BAD_REQUEST" });
      else send(response, config, 500, { error: "FIXTURE_INTERNAL" });
    });
  });
  // A slow client must not hold a socket: a preview lane has no use for one.
  server.headersTimeout = 10_000;
  server.requestTimeout = 15_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 64;
  return server;
}

/**
 * `GET /__fixture/scenario` reports the selection; `POST` switches it (`{"scenario":"stale"}` or `?name=stale`) or resets it
 * (`{"reset":true}`). In memory only: nothing is stored, a restart returns the configured scenario. Lane-internal, so it
 * answers even under FIXTURE_WRITES=refuse (it changes the fixture's own state, not a product write).
 */
async function handleScenario(config: FixtureConfig, method: string, url: URL, incoming: IncomingMessage, response: ServerResponse): Promise<void> {
  if (method === "GET") {
    // `?set=<name>` is the harness page's no-script chooser (a plain link). Lane-internal and in memory like the POST.
    const requested = url.searchParams.get("set");
    if (requested !== null) {
      if (!isFixtureScenario(requested)) {
        send(response, config, 400, { error: "FIXTURE_SCENARIO_UNKNOWN", scenarios: FIXTURE_SCENARIOS });
        return;
      }
      setScenario(requested);
      applyScenarioToDoubles(config);
      resetFixtureTransitions();
    }
    send(response, config, 200, scenarioBody(config));
    return;
  }
  if (method !== "POST") {
    send(response, config, 405, { error: "FIXTURE_METHOD_NOT_ALLOWED" }, { allow: "GET, POST" });
    return;
  }
  let body: { scenario?: unknown; reset?: unknown } = {};
  try {
    const raw = await readBody(incoming);
    if (raw.length > 0) body = JSON.parse(raw.toString("utf8")) as typeof body;
  } catch (error) {
    if (error instanceof TooLarge) {
      response.once("finish", () => incoming.destroy());
      send(response, config, 413, { error: "FIXTURE_BODY_TOO_LARGE" }, { connection: "close" });
      return;
    }
    send(response, config, 400, { error: "FIXTURE_BAD_REQUEST" });
    return;
  }
  if (body.reset === true) resetScenario();
  else {
    const name = body.scenario ?? url.searchParams.get("name");
    if (!isFixtureScenario(name)) {
      send(response, config, 400, { error: "FIXTURE_SCENARIO_UNKNOWN", scenarios: FIXTURE_SCENARIOS });
      return;
    }
    setScenario(name);
  }
  // Deterministic: the doubles go back to the variants of the selected scenario, nothing from the previous one survives.
  applyScenarioToDoubles(config);
  resetFixtureTransitions();
  send(response, config, 200, scenarioBody(config));
}

function scenarioBody(config: FixtureConfig): Record<string, unknown> {
  return {
    lane: DEFAULT_LANE,
    not_acceptance: true,
    scenario: getScenario(),
    configured_scenario: configuredScenario(),
    default_scenario: DEFAULT_SCENARIO,
    legacy_profile_ignores_scenario: config.reviewProfile === "sparse-realistic",
    scenarios: FIXTURE_SCENARIOS.map((id) => ({ id, description: SCENARIO_DESCRIPTIONS[id] })),
    persistence: "NONE",
  };
}

async function handle(config: FixtureConfig, incoming: IncomingMessage, response: ServerResponse,
  visitDigest: ReturnType<typeof createVisitDigestFixture>): Promise<void> {
  const method = (incoming.method ?? "GET").toUpperCase();
  let url: URL;
  try {
    url = new URL(incoming.url ?? "/", "http://fixture.invalid");
  } catch {
    send(response, config, 400, { error: "FIXTURE_BAD_REQUEST" });
    return;
  }

  // The lane endpoints belong to this server alone.
  if (url.pathname === "/__fixture/review" || url.pathname === "/__fixture/review.html") {
    if (method !== "GET") {
      send(response, config, 405, { error: "FIXTURE_METHOD_NOT_ALLOWED" }, { allow: "GET" });
      return;
    }
    const html = url.pathname.endsWith(".html");
    send(response, config, 200, html ? reviewHtml(config.reviewProfile, config.scale, getScenario()) : reviewCatalog(config.reviewProfile, config.scale, getScenario()),
      html ? { "content-type": "text/html; charset=utf-8", "content-security-policy": "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'" } : {});
    return;
  }
  if (url.pathname === SCENARIO_PATH) {
    await handleScenario(config, method, url, incoming, response);
    return;
  }
  if (url.pathname === LANE_PATH || url.pathname === HEALTH_PATH) {
    if (method !== "GET") {
      send(response, config, 405, { error: "FIXTURE_METHOD_NOT_ALLOWED" }, { allow: "GET" });
      return;
    }
    send(response, config, 200, url.pathname === LANE_PATH ? laneBody(config) : { ok: true });
    return;
  }

  let body: unknown = null;
  if (method !== "GET" && method !== "HEAD") {
    let raw: Buffer;
    try {
      raw = await readBody(incoming);
    } catch (error) {
      if (error instanceof TooLarge) {
        // Answer, then drop the connection once the answer is out (not before: the client must read it).
        response.once("finish", () => incoming.destroy());
        send(response, config, 413, { error: "FIXTURE_BODY_TOO_LARGE" }, { connection: "close" });
        return;
      }
      throw error;
    }
    if (raw.length > 0) {
      try {
        body = JSON.parse(raw.toString("utf8"));
      } catch {
        // The doubles read a body only to echo one key; an unreadable one is simply no body.
        body = null;
      }
    }
  }

  const request: BffRequest = {
    method,
    path: url.pathname,
    search: url.search,
    headers: Object.fromEntries(Object.entries(incoming.headers).map(([key, value]) => [key, Array.isArray(value) ? value.join(", ") : value])),
    body,
  };

  if (method === "HEAD") {
    // HEAD is GET without the body; nothing else is derived from it.
    const answered = answerFor(config, { ...request, method: "GET" });
    if (answered === null) send(response, config, 404, { error: "FIXTURE_ROUTE_NOT_SERVED" });
    else {
      response.writeHead(answered.status, { ...answered.headers, "cache-control": "no-store", [LANE_HEADER]: config.laneLabel, "x-fixture-profile": config.reviewProfile });
      response.end();
    }
    return;
  }

  if (method !== "GET" && config.writes === "refuse") {
    send(response, config, 405, { error: "FIXTURE_METHOD_NOT_ALLOWED" }, { allow: "GET" });
    return;
  }

  // WP-P: the in-memory command story (lane-internal paths, only with FIXTURE_WRITES=doubles: a refusing server already answered 405 above).
  const story = commandStoryRoute(method, url.pathname, body);
  if (story !== null) {
    send(response, config, story.status, story.body);
    return;
  }

  const answered = visitDigest(config, request) ?? answerFor(config, request);
  if (answered !== null) {
    const served = config.rebaseTime && typeof answered.body !== "string" ? rebaseBody(answered.body, OPERATIONS_V2_DOUBLE_NOW_ISO, Date.now()) : answered.body;
    send(response, config, answered.status, served, { ...answered.headers });
    return;
  }
  // Not modelled for this method. If the path IS served for GET, the method is the problem (405); otherwise nothing here answers it (404).
  if (method !== "GET" && answerFor(config, { ...request, method: "GET", body: null }) !== null) {
    send(response, config, 405, { error: "FIXTURE_METHOD_NOT_ALLOWED" }, { allow: "GET" });
    return;
  }
  send(response, config, 404, { error: "FIXTURE_ROUTE_NOT_SERVED" });
}
