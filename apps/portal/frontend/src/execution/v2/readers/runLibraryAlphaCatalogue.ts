/**
 * V2 reader and traversal for the Run Library's run-derived alpha facet (FE-069, BE `feafe56a`):
 * `GET /api/v1/quantbt/runs/alpha-catalogue[?workspace_id][&cursor][&limit]`, operationId `researchRunLibraryAlphaCatalogueV1`,
 * `research-run-library.openapi.json#/components/schemas/RunLibraryAlphaCatalogueResponse` (`research.run-library-alpha-catalogue.v1`).
 *
 * What the body is, and what no screen may let it say:
 *
 * - It is the workspace's RUN-DERIVED alpha facet: the alphas that have a recorded run in the caller's workspace. It is NOT the Alpha
 *   Registry, NOT a complete list of every strategy and NOT a create authorization. The reader names it `alphaCatalogue` and nothing in
 *   it says "registry" or "eligible".
 * - It is paged (at most 200 per page, bytewise `ALPHA_ID_ASC`). One page is never "the list": `traverseAlphaCatalogue` follows
 *   `page.next_cursor` while `page.has_more`, and only a traversal that reached a page with `has_more: false` is `complete`.
 * - Every page is a fresh snapshot; the cursor is signed, workspace- and page-size-bound and expires. This file therefore NEVER stores a
 *   cursor beyond one traversal and never resumes: a refused cursor, a revoked workspace or any failure ends the traversal and the next
 *   attempt starts again from the first page ("restart for a current census"). Nothing is repaired, skipped or guessed.
 *
 * Closed allowlists, never repaired: the root, `items[]` and `page` accept exactly the published keys (an own `__proto__` is an unknown
 * key); `alpha_id` is the published `^[a-z][a-z0-9-]{2,63}$`; `alpha_name` is 1..240 UTF-16 units with no control, zero-width, bidi
 * or lone-surrogate character and is not whitespace-only; `page.limit` is 1..200 and must equal the limit asked (the cursor is bound to
 * it); `has_more` pairs with a cursor (and only with one); `order` is the constant; ids are strictly ascending inside a page AND
 * across the pages of one traversal (a repeated or backwards id is a body from two snapshots, not a census).
 *
 * Failure words are a closed vocabulary (`CATALOGUE_FAILURES`) taken from the HTTP status and, for the one 400 that matters, the
 * published error code `RESEARCH_RUN_LIBRARY_CURSOR_INVALID`. Server prose (`message`) is never read or shown. Nothing here throws.
 */

export const ALPHA_CATALOGUE_SCHEMA = "research.run-library-alpha-catalogue.v1";
export const ALPHA_CATALOGUE_PATH = "/api/v1/quantbt/runs/alpha-catalogue";
export const ALPHA_CATALOGUE_AUTHORITY = "PORTAL_PERSISTED_RESEARCH";
export const ALPHA_CATALOGUE_ORDER = "ALPHA_ID_ASC";
export const CATALOGUE_MAX_LIMIT = 200;
export const CATALOGUE_DEFAULT_LIMIT = 200;
/** The most pages one traversal follows (10,000 alphas). Past it the traversal is `partial` with `PAGE_CAP`, never "complete". */
export const CATALOGUE_MAX_PAGES = 50;
export const CURSOR_INVALID_CODE = "RESEARCH_RUN_LIBRARY_CURSOR_INVALID";

export const CATALOGUE_FAILURES = [
  "UNREADABLE", "WRONG_SCHEMA", "WRONG_AUTHORITY", "ITEMS_INVALID", "ORDER_VIOLATION", "PAGE_INVALID", "LIMIT_MISMATCH",
  "CURSOR_REPEATED", "PAGE_CAP", "CURSOR_REFUSED", "REQUEST_INVALID", "UNAUTHENTICATED", "FORBIDDEN", "WORKSPACE_NOT_OBSERVABLE",
  "UNAVAILABLE", "NETWORK", "NOT_OFFERED", "ABORTED",
] as const;
export type CatalogueFailure = (typeof CATALOGUE_FAILURES)[number];

/** Words an operator reads. Fixed here; the body never supplies copy. */
export const CATALOGUE_FAILURE_TEXT: Readonly<Record<CatalogueFailure, string>> = {
  UNREADABLE: "The alpha list answered in a shape this build does not accept.",
  WRONG_SCHEMA: "The alpha list answered with another contract version.",
  WRONG_AUTHORITY: "The alpha list did not come from the persisted Research source.",
  ITEMS_INVALID: "The alpha list held an entry this build does not accept.",
  ORDER_VIOLATION: "The alpha list was not in order, so it was not used (it may have changed while it was read).",
  PAGE_INVALID: "The alpha list's paging did not add up.",
  LIMIT_MISMATCH: "The alpha list answered with another page size than the one asked.",
  CURSOR_REPEATED: "The alpha list pointed back at a page already read.",
  PAGE_CAP: "The alpha list is longer than this form reads.",
  CURSOR_REFUSED: "The alpha list's paging expired or changed; it has to be read again from the start.",
  REQUEST_INVALID: "The alpha list request was not one the Portal accepts.",
  UNAUTHENTICATED: "The alpha list needs a signed-in session.",
  FORBIDDEN: "This session may not read the alpha list.",
  WORKSPACE_NOT_OBSERVABLE: "This workspace is not available to this session any more.",
  UNAVAILABLE: "The alpha list could not be read right now.",
  NETWORK: "The alpha list never reached the Portal.",
  NOT_OFFERED: "This source does not offer the alpha list.",
  ABORTED: "The alpha list read was replaced by a newer one.",
};

export interface CatalogueAlpha {
  id: string;
  name: string;
}

export interface AlphaCataloguePage {
  items: CatalogueAlpha[];
  limit: number;
  hasMore: boolean;
  nextCursor: string | null;
  asOfUtcMs: number;
}

export type AlphaCataloguePageRead = { kind: "page"; page: AlphaCataloguePage } | { kind: "refused"; word: CatalogueFailure };

export interface AlphaCatalogueQuery {
  /** Omitted: the session's own workspace. Present: that workspace (the server still checks membership). */
  workspaceId?: string;
  /** The `page.next_cursor` of the previous page of THIS traversal. Never one from another workspace, limit or traversal. */
  cursor?: string | null;
  limit?: number;
}

/** What the port answers: one parsed page, or one typed failure word. Never a throw. */
export type AlphaCataloguePageAnswer = { kind: "page"; page: AlphaCataloguePage } | { kind: "failed"; word: CatalogueFailure };

const ALPHA_ID = /^[a-z][a-z0-9-]{2,63}$/;
const WORKSPACE_ID = /^[A-Za-z0-9._-]{1,128}$/;
// ASCII/C1 control, zero-width, bidi controls and the line/paragraph separators.
// eslint-disable-next-line no-control-regex
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/;
// eslint-disable-next-line no-control-regex
const CURSOR_UNSAFE = /[\u0000-\u0020\u007f-\u009f]/;
const ROOT_KEYS = ["schema_version", "read_authority", "items", "page", "as_of_utc_ms"] as const;
const ITEM_KEYS = ["alpha_id", "alpha_name"] as const;
const PAGE_KEYS = ["limit", "has_more", "next_cursor", "order"] as const;

const isPlain = (v: unknown): v is Record<string, unknown> => {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v) as unknown;
  return proto === Object.prototype || proto === null;
};
const sameKeys = (v: Record<string, unknown>, keys: readonly string[]): boolean => {
  const own = Reflect.ownKeys(v);
  return own.length === keys.length && keys.every((k) => Object.prototype.hasOwnProperty.call(v, k)) && own.every((k) => typeof k === "string");
};
const loneSurrogate = (s: string): boolean => {
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = s.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) i += 1;
      else return true;
    } else if (c >= 0xdc00 && c <= 0xdfff) return true;
  }
  return false;
};
const nameOk = (s: unknown): s is string => typeof s === "string" && s.length >= 1 && s.length <= 240 && !UNSAFE_TEXT.test(s) && !loneSurrogate(s) && s.trim() !== "";
const cursorOk = (s: unknown): s is string => typeof s === "string" && s.length >= 1 && s.length <= 4096 && !CURSOR_UNSAFE.test(s) && !loneSurrogate(s);

/**
 * One body -> one page, or a typed refusal. `limit` is the page size that was asked (the cursor binds it): a body that answers with
 * another one is refused. Pass `null` only to read a body whose question is not known (a conformance read).
 */
export function readAlphaCataloguePage(raw: unknown, askedLimit: number | null = null): AlphaCataloguePageRead {
  try {
    return readUnsafe(raw, askedLimit);
  } catch {
    return { kind: "refused", word: "UNREADABLE" };
  }
}

function readUnsafe(raw: unknown, askedLimit: number | null): AlphaCataloguePageRead {
  const refuse = (word: CatalogueFailure): AlphaCataloguePageRead => ({ kind: "refused", word });
  if (!isPlain(raw) || !sameKeys(raw, ROOT_KEYS)) return refuse("UNREADABLE");
  if (raw.schema_version !== ALPHA_CATALOGUE_SCHEMA) return refuse("WRONG_SCHEMA");
  if (raw.read_authority !== ALPHA_CATALOGUE_AUTHORITY) return refuse("WRONG_AUTHORITY");
  const asOf = raw.as_of_utc_ms;
  if (typeof asOf !== "number" || !Number.isSafeInteger(asOf) || asOf < 0) return refuse("UNREADABLE");

  const page = raw.page;
  if (!isPlain(page) || !sameKeys(page, PAGE_KEYS)) return refuse("PAGE_INVALID");
  const { limit, has_more: hasMore, next_cursor: cursor } = page;
  if (typeof limit !== "number" || !Number.isSafeInteger(limit) || limit < 1 || limit > CATALOGUE_MAX_LIMIT) return refuse("PAGE_INVALID");
  if (page.order !== ALPHA_CATALOGUE_ORDER || typeof hasMore !== "boolean") return refuse("PAGE_INVALID");
  if (askedLimit !== null && limit !== askedLimit) return refuse("LIMIT_MISMATCH");
  // A further page needs a cursor to follow; a cursor on the last page would invite a read past the end.
  if (hasMore ? !cursorOk(cursor) : cursor !== null) return refuse("PAGE_INVALID");

  const items = raw.items;
  if (!Array.isArray(items) || items.length > limit) return refuse("ITEMS_INVALID");
  const out: CatalogueAlpha[] = [];
  for (const entry of items) {
    if (!isPlain(entry) || !sameKeys(entry, ITEM_KEYS)) return refuse("ITEMS_INVALID");
    const id = entry.alpha_id;
    if (typeof id !== "string" || !ALPHA_ID.test(id) || !nameOk(entry.alpha_name)) return refuse("ITEMS_INVALID");
    const previous = out[out.length - 1];
    if (previous !== undefined && !(previous.id < id)) return refuse("ORDER_VIOLATION");
    out.push({ id, name: entry.alpha_name });
  }
  // A page that says more follows but holds nothing makes no progress; refuse it rather than loop on it.
  if (hasMore && out.length === 0) return refuse("PAGE_INVALID");
  return { kind: "page", page: { items: out, limit, hasMore, nextCursor: hasMore ? (cursor as string) : null, asOfUtcMs: asOf } };
}

/** The request URL, or `null` for a query the contract could never accept (nothing is sent). */
export function alphaCatalogueUrl(query: AlphaCatalogueQuery = {}): string | null {
  const parts: string[] = [];
  if (query.workspaceId !== undefined && query.workspaceId !== "") {
    if (!WORKSPACE_ID.test(query.workspaceId)) return null;
    parts.push(`workspace_id=${encodeURIComponent(query.workspaceId)}`);
  }
  const limit = query.limit ?? CATALOGUE_DEFAULT_LIMIT;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > CATALOGUE_MAX_LIMIT) return null;
  parts.push(`limit=${limit}`);
  if (query.cursor !== undefined && query.cursor !== null) {
    if (!cursorOk(query.cursor)) return null;
    parts.push(`cursor=${encodeURIComponent(query.cursor)}`);
  }
  return `${ALPHA_CATALOGUE_PATH}?${parts.join("&")}`;
}

/** Status (and, for a 400, the published error code) -> the closed word. Server prose is never consulted. */
export function failureForStatus(status: number, code: string | null): CatalogueFailure {
  if (status === 400) return code === CURSOR_INVALID_CODE ? "CURSOR_REFUSED" : "REQUEST_INVALID";
  if (status === 401) return "UNAUTHENTICATED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "WORKSPACE_NOT_OBSERVABLE";
  return "UNAVAILABLE";
}

/**
 * The same-origin read behind the port method. Never throws. `fetchImpl` is for tests; the product passes nothing.
 * Abort (a newer read replaced this one) is `ABORTED`, not a network failure.
 */
export async function fetchAlphaCataloguePage(
  query: AlphaCatalogueQuery,
  signal?: AbortSignal,
  fetchImpl: typeof fetch | undefined = typeof fetch === "function" ? fetch : undefined,
): Promise<AlphaCataloguePageAnswer> {
  const url = alphaCatalogueUrl(query);
  if (url === null) return { kind: "failed", word: "REQUEST_INVALID" };
  if (fetchImpl === undefined) return { kind: "failed", word: "NOT_OFFERED" };
  try {
    const response = await fetchImpl(url, { credentials: "same-origin", headers: { accept: "application/json" }, signal });
    let body: unknown = null;
    try { body = await response.json(); } catch { /* a body that does not parse is read as absent below */ }
    if (!response.ok) {
      const error = isPlain(body) && isPlain(body.error) ? body.error.code : null;
      return { kind: "failed", word: failureForStatus(response.status, typeof error === "string" ? error : null) };
    }
    const read = readAlphaCataloguePage(body, query.limit ?? CATALOGUE_DEFAULT_LIMIT);
    return read.kind === "page" ? read : { kind: "failed", word: read.word };
  } catch {
    return { kind: "failed", word: signal?.aborted === true ? "ABORTED" : "NETWORK" };
  }
}

export type AlphaCataloguePort = (query: AlphaCatalogueQuery) => Promise<AlphaCataloguePageAnswer>;

export type CatalogueTraversal =
  /** Every page was read to the last one (`has_more: false`) inside one workspace, in order. The only state that is "the list". */
  | { kind: "complete"; alphas: CatalogueAlpha[]; pages: number; asOfUtcMs: number }
  /** Pages were read, then one failed. `alphas` are the ones read so far and are NOT the list; shown as such, never as the whole. */
  | { kind: "partial"; alphas: CatalogueAlpha[]; pages: number; failure: CatalogueFailure }
  /** Nothing usable: the first page failed, or the workspace was revoked / the session lost mid-way (what was read is dropped). */
  | { kind: "failed"; pages: number; failure: CatalogueFailure };

export interface TraverseOptions {
  workspaceId?: string;
  limit?: number;
  maxPages?: number;
  /** Asked after every await: `false` means the workspace (or the question) changed and this traversal must end unused. */
  isCurrent?: () => boolean;
}

/** Failures after which what was read is NOT kept: the reader's right to the workspace is gone, so its rows are not shown. */
const DROPS_PARTIAL: ReadonlySet<CatalogueFailure> = new Set<CatalogueFailure>(["WORKSPACE_NOT_OBSERVABLE", "FORBIDDEN", "UNAUTHENTICATED", "ABORTED"]);

/**
 * Follows `page.next_cursor` from the first page to the last. The cursor lives in this call only: it is passed to the next read of the
 * SAME workspace and limit and is dropped with the call. There is no resume; a caller that wants a current census calls this again.
 * Never throws; `read` may reject and is then `NETWORK`.
 */
export async function traverseAlphaCatalogue(read: AlphaCataloguePort, options: TraverseOptions = {}): Promise<CatalogueTraversal> {
  const limit = options.limit ?? CATALOGUE_DEFAULT_LIMIT;
  const maxPages = options.maxPages ?? CATALOGUE_MAX_PAGES;
  const current = options.isCurrent ?? (() => true);
  const alphas: CatalogueAlpha[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  let pages = 0;
  let asOf = 0;

  const stop = (failure: CatalogueFailure): CatalogueTraversal =>
    pages === 0 || DROPS_PARTIAL.has(failure) ? { kind: "failed", pages, failure } : { kind: "partial", alphas, pages, failure };

  for (;;) {
    if (!current()) return { kind: "failed", pages, failure: "ABORTED" };
    let answer: AlphaCataloguePageAnswer;
    try {
      answer = await read({ ...(options.workspaceId !== undefined ? { workspaceId: options.workspaceId } : {}), cursor, limit });
    } catch {
      answer = { kind: "failed", word: "NETWORK" };
    }
    // A page for a workspace that is no longer the one asked is dropped whole, wherever it arrives.
    if (!current()) return { kind: "failed", pages, failure: "ABORTED" };
    if (answer.kind === "failed") return stop(answer.word);
    // Re-judged here so a port that skipped the reader cannot smuggle a page past the allowlists.
    const checked = readAlphaCataloguePage(
      { schema_version: ALPHA_CATALOGUE_SCHEMA, read_authority: ALPHA_CATALOGUE_AUTHORITY, items: answer.page.items.map((a) => ({ alpha_id: a.id, alpha_name: a.name })),
        page: { limit: answer.page.limit, has_more: answer.page.hasMore, next_cursor: answer.page.nextCursor, order: ALPHA_CATALOGUE_ORDER }, as_of_utc_ms: answer.page.asOfUtcMs },
      limit,
    );
    if (checked.kind === "refused") return stop(checked.word);
    const page = checked.page;
    const first = page.items[0];
    const last = alphas[alphas.length - 1];
    if (first !== undefined && last !== undefined && !(last.id < first.id)) return stop("ORDER_VIOLATION");
    alphas.push(...page.items);
    pages += 1;
    asOf = page.asOfUtcMs;
    if (!page.hasMore) return { kind: "complete", alphas, pages, asOfUtcMs: asOf };
    const next = page.nextCursor as string;
    if (seenCursors.has(next) || next === cursor) return stop("CURSOR_REPEATED");
    seenCursors.add(next);
    if (pages >= maxPages) return stop("PAGE_CAP");
    cursor = next;
  }
}
