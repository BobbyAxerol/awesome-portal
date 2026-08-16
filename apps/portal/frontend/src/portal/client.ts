/**
 * Portal control-plane client — U03.
 *
 * Wraps the three read-only endpoints published in FRONTEND_HANDOFF §1 and
 * honours their cache contracts exactly:
 *
 *   /api/v1/portal/registry   ETag + no-cache, must-revalidate  -> 304 reuse
 *   /api/v1/portal/links      ETag + no-cache, must-revalidate  -> 304 reuse
 *   /api/v1/portal/summary    no-store                          -> never cached
 *
 * None of these accept input. The client therefore takes no query parameters:
 * a caller cannot ask the backend to select a different upstream or file.
 */
import type {
  PortalErrorResponse,
  PortalLinksDocument,
  PortalRegistryDocument,
  PortalSummaryV1,
} from "./contracts";

/** A failed Portal call, carrying the request id needed to report it. */
export class PortalRequestError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly requestId: string | null;
  /** Whether a retry could plausibly succeed; 4xx other than 408/429 cannot. */
  readonly retryable: boolean;

  constructor(init: {
    message: string;
    status: number;
    code?: string | null;
    requestId?: string | null;
  }) {
    super(init.message);
    this.name = "PortalRequestError";
    this.status = init.status;
    this.code = init.code ?? null;
    this.requestId = init.requestId ?? null;
    this.retryable = init.status >= 500 || init.status === 408 || init.status === 429 || init.status === 0;
  }
}

function isErrorEnvelope(body: unknown): body is PortalErrorResponse {
  if (typeof body !== "object" || body === null) return false;
  const error = (body as { error?: unknown }).error;
  return typeof error === "object" && error !== null && "code" in error;
}

async function failure(response: Response): Promise<PortalRequestError> {
  const requestId = response.headers.get("X-Request-ID");
  let code: string | null = null;
  let message = `${response.status} ${response.statusText}`;
  try {
    const body: unknown = await response.json();
    if (isErrorEnvelope(body)) {
      code = body.error.code;
      message = body.error.message;
    }
  } catch {
    /* Non-JSON body: keep the status line as the message. */
  }
  return new PortalRequestError({ message, status: response.status, code, requestId });
}

/* -------------------------------------------------------------------------
 * ETag-revalidated documents
 * ---------------------------------------------------------------------- */

interface CachedDocument<T> {
  etag: string;
  document: T;
}

/**
 * Fetches an ETag-cached document, sending `If-None-Match` when a copy is
 * already held and reusing it on `304`.
 *
 * The cache key is the endpoint itself, because the contract guarantees the
 * response depends on nothing else the client controls.
 */
function etagFetcher<T>(path: string) {
  let cached: CachedDocument<T> | null = null;

  return async function fetchDocument(signal?: AbortSignal): Promise<T> {
    const headers: HeadersInit = cached ? { "If-None-Match": cached.etag } : {};
    const response = await fetch(path, { headers, signal });

    if (response.status === 304) {
      if (cached) return cached.document;
      // A 304 without a local copy means our cache was dropped mid-flight.
      // Re-fetch unconditionally rather than returning nothing.
      const retry = await fetch(path, { signal, cache: "reload" });
      if (!retry.ok) throw await failure(retry);
      const document = (await retry.json()) as T;
      const etag = retry.headers.get("ETag");
      cached = etag ? { etag, document } : null;
      return document;
    }

    if (!response.ok) throw await failure(response);

    const document = (await response.json()) as T;
    const etag = response.headers.get("ETag");
    cached = etag ? { etag, document } : null;
    return document;
  };
}

/** Exposed for tests; resets the module-level ETag caches. */
export function __resetPortalClientCaches() {
  fetchRegistry = etagFetcher<PortalRegistryDocument>("/api/v1/portal/registry");
  fetchLinks = etagFetcher<PortalLinksDocument>("/api/v1/portal/links");
}

export let fetchRegistry = etagFetcher<PortalRegistryDocument>("/api/v1/portal/registry");
export let fetchLinks = etagFetcher<PortalLinksDocument>("/api/v1/portal/links");

/* -------------------------------------------------------------------------
 * Summary — always a fresh snapshot
 * ---------------------------------------------------------------------- */

/**
 * Fetches the Command Center summary.
 *
 * The server already applies a hard deadline and does not retry upstream, so
 * this deliberately performs no client-side retry loop either
 * (FRONTEND_HANDOFF §1). Refreshing means calling the endpoint again.
 */
export async function fetchSummary(signal?: AbortSignal): Promise<PortalSummaryV1> {
  const response = await fetch("/api/v1/portal/summary", { cache: "no-store", signal });
  if (!response.ok) throw await failure(response);
  return (await response.json()) as PortalSummaryV1;
}
