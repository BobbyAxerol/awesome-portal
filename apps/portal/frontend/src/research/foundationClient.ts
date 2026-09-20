/**
 * Research Loop — foundation client (P09, Screens 00 and 12).
 *
 * Two same-origin, session-bound reads and nothing else. Every shape comes
 * from `@portal/contracts-research-foundation`; no response is hand-parsed and
 * no local DTO is constructed.
 *
 * `304` is handled explicitly rather than left to the browser cache, because
 * the contract makes it meaningful: the private representation has not changed,
 * so the **last exact typed response** is reused. Returning nothing, or
 * re-deriving a document, would both break that. A `304` arriving with no local
 * copy means the cache was dropped mid-flight, so the request is repeated
 * unconditionally rather than answered with an empty screen — the same
 * behaviour `portal/client.ts` established for the registry.
 *
 * The cache is keyed by the full query, because unlike the registry these
 * endpoints take parameters and two selections are two representations.
 *
 * P04's direct Portal API atlas route is **not** a fallback here. An Atlas that
 * cannot be reached is `unavailable`; substituting a plausible local manifest
 * would put uncertified routes on screen under a certified-looking heading.
 */

import type { components } from "@portal/contracts-research-foundation";

import { PortalApiError } from "../lib/api";
import type { ResearchState } from "./state";

type Schemas = components["schemas"];

export type JourneyResponse = Schemas["JourneyResponse"];
export type JourneyDescriptor = Schemas["JourneyDescriptor"];
export type JourneyPhase = Schemas["JourneyPhase"];
export type JourneyCard = Schemas["JourneyCard"];
export type InspectionCursor = Schemas["InspectionCursor"];
export type CardTargetKind = JourneyCard["target_kind"];
export type CardAvailability = JourneyCard["availability"];

export type AtlasResponse = Schemas["AtlasResponse"];
export type FoundationAtlas = Schemas["Atlas"];
export type AtlasReleaseKind = AtlasResponse["selected_release_kind"];

/** The contract's own refusal vocabulary. Not a local list. */
export type FoundationProblemCode = Schemas["Problem"]["error"]["code"];

const JOURNEY_PATH = "/api/v1/research/journey";
const ATLAS_PATH = "/api/v1/research/quantbt/atlas";

/**
 * The P02 cursor keys the journey read accepts.
 *
 * Declared once, in the contract's own order, so a key cannot be smuggled onto
 * the query by a caller that happens to hold a wider object.
 */
export const JOURNEY_CURSOR_KEYS = [
  "run_id",
  "fold",
  "study",
  "trial",
  "pick",
  "params",
  "trade",
  "seq",
  "event_seq",
  "mode",
  "schedule",
  "route",
  "playback_ordinal",
] as const;

export type JourneyCursorKey = (typeof JOURNEY_CURSOR_KEYS)[number];
export type JourneyQuery = Partial<Record<JourneyCursorKey, string>> & { workspace_id?: string };

export type AtlasQuery = {
  workspace_id?: string;
  release_id?: string;
  route?: string;
  mode?: string;
};

/**
 * `seq` and its legacy alias `event_seq` may both appear, but only when they
 * agree. Two different values are not a cursor with a preference — they are two
 * contradictory claims about the same position, and silently picking one would
 * send the reader to an event nobody linked to.
 */
export const SEQ_ALIAS_CONFLICT =
  "This link carries two different event positions (seq and event_seq). Open it with one.";

export class JourneyLinkConflict extends Error {
  constructor() {
    super(SEQ_ALIAS_CONFLICT);
    this.name = "JourneyLinkConflict";
  }
}

/**
 * Builds the journey query from a URL's search parameters.
 *
 * Only the declared P02 keys survive; anything else a link carries is dropped
 * rather than forwarded, so a crafted URL cannot widen the request.
 */
export function journeyQueryFromSearch(search: string | URLSearchParams): JourneyQuery {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const query: JourneyQuery = {};

  const workspace = params.get("workspace_id");
  if (workspace) query.workspace_id = workspace;

  for (const key of JOURNEY_CURSOR_KEYS) {
    const value = params.get(key);
    if (value) query[key] = value;
  }

  if (query.seq && query.event_seq && query.seq !== query.event_seq) {
    throw new JourneyLinkConflict();
  }
  return query;
}

function queryString(entries: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(entries)) {
    if (value !== undefined && value !== "") params.set(key, value);
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

async function failure(response: Response): Promise<PortalApiError> {
  let message = `${response.status} ${response.statusText}`;
  let code: string | null = null;
  let requestId: string | null = response.headers.get("x-request-id");
  try {
    const body = (await response.json()) as Partial<Schemas["Problem"]>;
    if (body?.error?.message) message = body.error.message;
    code = body?.error?.code ?? null;
    requestId = body?.request_id ?? requestId;
  } catch {
    /* non-JSON error body: keep the status line the server gave */
  }
  return new PortalApiError(message, response.status, code, requestId);
}

interface Cached<T> {
  etag: string;
  document: T;
}

/** One ETag cache per endpoint, keyed by the exact query. */
function etagReader<T>(path: string) {
  const cache = new Map<string, Cached<T>>();

  return async function read(query: string, signal?: AbortSignal): Promise<T> {
    const url = `${path}${query}`;
    const held = cache.get(query) ?? null;
    const response = await fetch(url, {
      credentials: "same-origin",
      headers: held ? { "If-None-Match": held.etag } : {},
      signal,
    });

    if (response.status === 304) {
      if (held) return held.document;
      /* The local copy was dropped between the request and the answer. Ask
         again unconditionally rather than rendering nothing. */
      const retry = await fetch(url, { credentials: "same-origin", signal, cache: "reload" });
      if (!retry.ok) throw await failure(retry);
      const document = (await retry.json()) as T;
      const etag = retry.headers.get("ETag");
      if (etag) cache.set(query, { etag, document });
      return document;
    }

    if (!response.ok) throw await failure(response);

    const document = (await response.json()) as T;
    const etag = response.headers.get("ETag");
    if (etag) cache.set(query, { etag, document });
    return document;
  };
}

let readJourney = etagReader<JourneyResponse>(JOURNEY_PATH);
let readAtlas = etagReader<AtlasResponse>(ATLAS_PATH);

export const foundationApi = {
  journey: (query: JourneyQuery = {}, signal?: AbortSignal) =>
    readJourney(queryString(query), signal),

  atlas: (query: AtlasQuery = {}, signal?: AbortSignal) => readAtlas(queryString(query), signal),
} as const;

/* -------------------------------------------------------------------------
 * Refusal mapping
 * ---------------------------------------------------------------------- */

interface FoundationRefusalPresentation {
  state: ResearchState["state"];
  mayRetry: boolean;
  /** True when the reader's own selection is what the server rejected. */
  highlightsSelection: boolean;
}

const REFUSAL: Record<FoundationProblemCode, FoundationRefusalPresentation> = {
  SESSION_REQUIRED: { state: "denied", mayRetry: false, highlightsSelection: false },
  REQUEST_REJECTED: { state: "terminal", mayRetry: false, highlightsSelection: false },

  /* The request itself was malformed — usually a hand-edited link. */
  RESEARCH_FOUNDATION_INVALID: { state: "terminal", mayRetry: false, highlightsSelection: true },
  RESEARCH_FOUNDATION_NOT_FOUND: { state: "empty", mayRetry: false, highlightsSelection: true },
  RESEARCH_FOUNDATION_CURSOR_STUDY_REQUIRED: {
    state: "terminal",
    mayRetry: false,
    highlightsSelection: true,
  },
  RESEARCH_FOUNDATION_DESCRIPTOR_MISMATCH: {
    state: "terminal",
    mayRetry: false,
    highlightsSelection: false,
  },

  /* A selection that names something the manifest does not carry. The screen
     keeps its composition and says which selection failed. */
  RESEARCH_FOUNDATION_RELEASE_NOT_FOUND: {
    state: "empty",
    mayRetry: false,
    highlightsSelection: true,
  },
  RESEARCH_FOUNDATION_ROUTE_NOT_FOUND: { state: "empty", mayRetry: false, highlightsSelection: true },
  RESEARCH_FOUNDATION_CAPABILITY_NOT_FOUND: {
    state: "empty",
    mayRetry: false,
    highlightsSelection: true,
  },

  /* A dependency did not answer. Never a local manifest instead. */
  RESEARCH_FOUNDATION_UNAVAILABLE: { state: "unavailable", mayRetry: true, highlightsSelection: false },
  RESEARCH_FOUNDATION_REJECTED: {
    state: "failed-retryable",
    mayRetry: true,
    highlightsSelection: false,
  },
};

export interface FoundationRefusal extends FoundationRefusalPresentation {
  code: FoundationProblemCode | null;
  /** The server's own sentence. Never rewritten locally. */
  message: string;
  status: number;
  requestId: string | null;
}

export function toFoundationRefusal(error: unknown): FoundationRefusal {
  if (error instanceof JourneyLinkConflict) {
    return {
      code: null,
      message: error.message,
      status: 0,
      requestId: null,
      state: "terminal",
      mayRetry: false,
      highlightsSelection: true,
    };
  }
  if (!(error instanceof PortalApiError)) {
    return {
      code: null,
      message: "The request did not reach the server.",
      status: 0,
      requestId: null,
      state: "failed-retryable",
      mayRetry: true,
      highlightsSelection: false,
    };
  }
  const known =
    error.code && error.code in REFUSAL ? REFUSAL[error.code as FoundationProblemCode] : null;
  return {
    ...(known ?? {
      state: error.status >= 500 ? "unavailable" : "terminal",
      mayRetry: error.status >= 500,
      highlightsSelection: false,
    }),
    code: (error.code as FoundationProblemCode | null) ?? null,
    message: error.message,
    status: error.status,
    requestId: error.requestId,
  };
}

/** Every code the contract declares, for exhaustiveness tests. */
export const FOUNDATION_PROBLEM_CODES = Object.keys(REFUSAL) as FoundationProblemCode[];

/**
 * Exposed for tests; the ETag caches are module-level by design.
 *
 * Production never calls this. A cache that could be cleared from the product
 * surface would be a way to force a full re-read, which is the behaviour the
 * `304` contract exists to avoid.
 */
export function __resetFoundationCaches(): void {
  readJourney = etagReader<JourneyResponse>(JOURNEY_PATH);
  readAtlas = etagReader<AtlasResponse>(ATLAS_PATH);
}
