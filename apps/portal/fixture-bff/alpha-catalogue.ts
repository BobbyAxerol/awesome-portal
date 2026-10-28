/**
 * `GET /api/v1/quantbt/runs/alpha-catalogue` on the fixture lane (FE-069, WP-B2-P2, FIXTURE_LAB). NOT acceptance evidence.
 *
 * The body is `research.run-library-alpha-catalogue.v1` (`RunLibraryAlphaCatalogueResponse`): the workspace's run-derived alpha facet,
 * ordered by alpha id (bytewise), at most 200 per page, cursor-paged. It is deterministic and built from the world:
 *
 * - the native alphas of the world (`bffWorld.NATIVE_ALPHAS`) and the generated universe (`worldAlphas()`), their ids put in the
 *   published AlphaId spelling (`^[a-z][a-z0-9-]{2,63}$`: `alpha_btc_trend` is served as `alpha-btc-trend`; an id that cannot be spelled so
 *   is left out, never repaired into a look-alike);
 * - plus `FIXTURE_PAD` synthetic `fixture-alpha-NNN` entries so the list is longer than one page of 200 (and than two of 100), which is
 *   the only way a fixture exercises the traversal. They are named "Fixture alpha NNN" and mean nothing else.
 *
 * Cursor: opaque, bound to the workspace and the page size like the server's, and carries a checksum so a tampered one is refused.
 * Refusals are the published problem body (`{ error: { code } }`) with the real codes: a cursor of another workspace / page size / forged
 * -> 400 `RESEARCH_RUN_LIBRARY_CURSOR_INVALID`; a workspace the session no longer observes -> 404 `RESEARCH_RUN_LIBRARY_NOT_FOUND`.
 * Scenario workspaces (query `workspace_id`): `ws_TEST_CATALOGUE_EMPTY` (no alpha), `ws_TEST_CATALOGUE_REVOKED` (404 at once),
 * `ws_TEST_CATALOGUE_FAIL_P2` (the second page and later answer 503).
 */
import type { BffRequest, BffResponse } from "../frontend/e2e/bffAnswerer";
import { WORLD_NOW_MS, worldAlphas } from "../frontend/e2e/bffWorld";

export const ALPHA_CATALOGUE_ROUTE = "/api/v1/quantbt/runs/alpha-catalogue";
export const FIXTURE_PAD = 230;
export const WS_EMPTY = "ws_TEST_CATALOGUE_EMPTY";
export const WS_REVOKED = "ws_TEST_CATALOGUE_REVOKED";
export const WS_FAIL_PAGE2 = "ws_TEST_CATALOGUE_FAIL_P2";
const DEFAULT_WS = "session";
const ALPHA_ID = /^[a-z][a-z0-9-]{2,63}$/;
const WS_ID = /^[A-Za-z0-9._-]{1,128}$/;

const json = (status: number, body: unknown): BffResponse => ({ status, headers: { "content-type": "application/json" }, body });
const problem = (status: number, code: string): BffResponse => json(status, { error: { code, message: "Fixture refusal." }, request_id: "fixture-catalogue" });

export interface CatalogueEntry { alpha_id: string; alpha_name: string }

/** Deterministic: world alphas in the published spelling, then the padding, sorted by id. */
export function fixtureCatalogue(): CatalogueEntry[] {
  const byId = new Map<string, string>();
  for (const alpha of worldAlphas()) {
    const id = alpha.id.toLowerCase().replace(/_/g, "-");
    if (ALPHA_ID.test(id)) byId.set(id, alpha.label);
  }
  for (let n = 1; n <= FIXTURE_PAD; n += 1) byId.set(`fixture-alpha-${String(n).padStart(3, "0")}`, `Fixture alpha ${String(n).padStart(3, "0")}`);
  return [...byId.entries()].map(([alpha_id, alpha_name]) => ({ alpha_id, alpha_name })).sort((a, b) => (a.alpha_id < b.alpha_id ? -1 : a.alpha_id > b.alpha_id ? 1 : 0));
}

const checksum = (text: string): string => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  return h.toString(16).padStart(8, "0");
};
export const mintCursor = (workspace: string, limit: number, after: string): string => {
  const payload = JSON.stringify({ w: workspace, l: limit, a: after });
  return `${Buffer.from(payload, "utf8").toString("base64url")}.${checksum(payload)}`;
};
function openCursor(cursor: string): { w: string; l: number; a: string } | null {
  const [body, sum, extra] = cursor.split(".");
  if (body === undefined || sum === undefined || extra !== undefined) return null;
  try {
    const payload = Buffer.from(body, "base64url").toString("utf8");
    if (checksum(payload) !== sum) return null;
    const parsed = JSON.parse(payload) as { w?: unknown; l?: unknown; a?: unknown };
    return typeof parsed.w === "string" && typeof parsed.l === "number" && typeof parsed.a === "string" ? { w: parsed.w, l: parsed.l, a: parsed.a } : null;
  } catch {
    return null;
  }
}

/** `null` is "not mine". */
export function answerAlphaCatalogue(request: BffRequest): BffResponse | null {
  if (request.path !== ALPHA_CATALOGUE_ROUTE) return null;
  if (request.method.toUpperCase() !== "GET") return null;
  const params = new URLSearchParams(request.search.startsWith("?") ? request.search.slice(1) : request.search);
  const known = new Set(["workspace_id", "cursor", "limit"]);
  for (const key of params.keys()) if (!known.has(key)) return problem(400, "RESEARCH_RUN_LIBRARY_INVALID");

  const rawLimit = params.get("limit");
  const limit = rawLimit === null ? 100 : /^\d{1,3}$/.test(rawLimit) ? Number(rawLimit) : 0;
  if (limit < 1 || limit > 200) return problem(400, "RESEARCH_RUN_LIBRARY_INVALID");
  const workspace = params.get("workspace_id") ?? DEFAULT_WS;
  if (!WS_ID.test(workspace)) return problem(400, "RESEARCH_RUN_LIBRARY_INVALID");
  const rawCursor = params.get("cursor");
  if (rawCursor !== null && (rawCursor === "" || rawCursor.length > 4096)) return problem(400, "RESEARCH_RUN_LIBRARY_INVALID");

  // The membership check comes before the cursor is looked at: a revoked workspace never learns whether a cursor was good.
  if (workspace === WS_REVOKED) return problem(404, "RESEARCH_RUN_LIBRARY_NOT_FOUND");

  let after: string | null = null;
  if (rawCursor !== null) {
    const opened = openCursor(rawCursor);
    if (opened === null || opened.w !== workspace || opened.l !== limit) return problem(400, "RESEARCH_RUN_LIBRARY_CURSOR_INVALID");
    after = opened.a;
    if (workspace === WS_FAIL_PAGE2) return problem(503, "RESEARCH_RUN_LIBRARY_UNAVAILABLE");
  }

  const all = workspace === WS_EMPTY ? [] : fixtureCatalogue();
  const rest = after === null ? all : all.filter((entry) => entry.alpha_id > after!);
  const items = rest.slice(0, limit);
  const hasMore = rest.length > items.length;
  return json(200, {
    schema_version: "research.run-library-alpha-catalogue.v1",
    read_authority: "PORTAL_PERSISTED_RESEARCH",
    items,
    page: { limit, has_more: hasMore, next_cursor: hasMore ? mintCursor(workspace, limit, items[items.length - 1]!.alpha_id) : null, order: "ALPHA_ID_ASC" },
    as_of_utc_ms: WORLD_NOW_MS,
  });
}
