/**
 * Research Loop — preflight client (P08, Screens 02 and 05).
 *
 * Two same-origin operations and nothing else. Every shape comes from
 * `@portal/contracts-research-preflight`; no field name is retyped here and no
 * server payload is parsed into a local structure, because P08's whole point is
 * that the browser preview, the submitted spec and the worker input are the
 * same immutable manifest. A frontend that re-derives any part of it has
 * already broken that.
 *
 * Two prohibitions are structural rather than stylistic:
 *
 *  - **`requested_spec_digest` is never sent.** Control API canonicalises the
 *    spec and derives the digest. A digest computed here would be a second
 *    canonicalisation, and the first time the two disagreed the mismatch would
 *    surface as an unexplained refusal.
 *  - **`effective_spec` is authoritative.** Anything the form estimates —
 *    fold counts above all — is a visual hint and may never overwrite it.
 *
 * The refusal map is a `Record` over the contract's own code union, so a code
 * added backend-side fails this build instead of degrading into a generic
 * message.
 */

import type { components } from "@portal/contracts-research-preflight";

import { CSRF_HEADER, csrfTokenFromCookie } from "../auth/authApi";
import { PortalApiError } from "../lib/api";
import type { ResearchState } from "./state";
import { reportSessionExpired } from "../auth/sessionExpiry";

type Schemas = components["schemas"];

/**
 * The requested spec as it goes on the wire.
 *
 * The generated declaration carries the JSON-Schema `$defs` block as a required
 * property; the Control API's strict parser refuses any payload that contains
 * it, so every preflight built from the generated type was a 400 (CG-P02-01,
 * RF-04 FE-S02-01). Until the contract drops it, the wire type does.
 */
export type RequestedSpec = Omit<Schemas["RequestedSpec"], "$defs">;
export type CreateRequest = Omit<Schemas["CreateRequest"], "requested_spec"> & {
  requested_spec: RequestedSpec;
};
export type PreflightResponse = Schemas["ResearchPreflightV1"];

export type EffectiveSpec = Schemas["EffectiveSpec"];
export type Snapshot = Schemas["Snapshot"];
export type Quality = Schemas["Quality"];
export type UtcRange = Schemas["UtcRange"];
export type Warmup = Schemas["Warmup"];
export type Topology = Schemas["Topology"];
export type ThreeWindowTopology = Schemas["ThreeWindowTopology"];
export type AdvancedTopology = Schemas["AdvancedTopology"];
export type Fold = Schemas["Fold"];
export type SealedHoldout = Schemas["SealedHoldout"];
export type ResourceEstimate = Schemas["ResourceEstimate"];
export type DatasetBinding = Schemas["DatasetBinding"];
export type Capability = Schemas["Capability"];

/** The contract's own refusal vocabulary. Not a local list. */
export type PreflightProblemCode = Schemas["Problem"]["error"]["code"];

const BASE = "/api/v1/research/preflights";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const isWrite = (init?.method ?? "GET").toUpperCase() !== "GET";
  const csrf = isWrite ? csrfTokenFromCookie() : null;
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...(csrf ? { [CSRF_HEADER]: csrf } : {}),
      ...(init?.headers as Record<string, string> | undefined),
    },
  });

  if (!response.ok) {
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
    throw new PortalApiError(message, response.status, code, requestId);
  }
  return (await response.json()) as T;
}

function query(workspaceId?: string): string {
  return workspaceId ? `?${new URLSearchParams({ workspace_id: workspaceId }).toString()}` : "";
}

export const preflightApi = {
  /** Authoritative preflight. The body carries the spec, never a digest of it. */
  create: (body: CreateRequest) =>
    call<PreflightResponse>(BASE, { method: "POST", body: JSON.stringify(body) }),

  /** Reopen an unchanged preview. Returns current immutable metadata only. */
  get: (preflightToken: string, workspaceId?: string) =>
    call<PreflightResponse>(`${BASE}/${encodeURIComponent(preflightToken)}${query(workspaceId)}`),
} as const;

/* -------------------------------------------------------------------------
 * Refusal mapping
 * ---------------------------------------------------------------------- */

interface PreflightRefusalPresentation {
  /** Which Portal state word this refusal is. */
  state: ResearchState["state"];
  /** Whether re-sending the same request could ever succeed. */
  mayRetry: boolean;
  /** True when the locally held token is dead and must be dropped. */
  invalidatesToken: boolean;
  /** True when the submitted spec is at fault, so the form is what to point at. */
  highlightsInput: boolean;
  /** True when the caller must re-read something before trying again. */
  requiresRefresh: boolean;
}

const NO: Omit<PreflightRefusalPresentation, "state"> = {
  mayRetry: false,
  invalidatesToken: false,
  highlightsInput: false,
  requiresRefresh: false,
};

const REFUSAL: Record<PreflightProblemCode, PreflightRefusalPresentation> = {
  SESSION_REQUIRED: { ...NO, state: "denied", invalidatesToken: true, requiresRefresh: true },
  REQUEST_REJECTED: { ...NO, state: "terminal" },

  /* The spec is at fault. Keep every edit and point at the field, because the
     alternative — clearing the form on a validation error — destroys exactly
     the work the reader now has to correct. */
  RESEARCH_PREFLIGHT_INVALID: { ...NO, state: "terminal", highlightsInput: true },
  RESEARCH_PREFLIGHT_TOPOLOGY_INVALID: { ...NO, state: "terminal", highlightsInput: true },

  /* A declared dependency has nothing to give for this request. The reason is
     the server's; there is no fallback read and no empty preview. */
  RESEARCH_PREFLIGHT_DATA_UNAVAILABLE: { ...NO, state: "unavailable" },
  RESEARCH_PREFLIGHT_REQUIRED_COLUMNS_UNAVAILABLE: { ...NO, state: "unavailable" },
  RESEARCH_PREFLIGHT_FUNDING_UNAVAILABLE: { ...NO, state: "unavailable" },
  RESEARCH_PREFLIGHT_WARMUP_UNAVAILABLE: { ...NO, state: "unavailable" },

  /* The engine refused this configuration. Retrying it unchanged cannot help. */
  RESEARCH_PREFLIGHT_ROUTE_NOT_ADMITTED: { ...NO, state: "terminal" },
  RESEARCH_PREFLIGHT_ROUTE_UNKNOWN: { ...NO, state: "terminal" },
  /* W4 CG-P08-03: an invalid mode × schedule used to surface as a 502. */
  RESEARCH_PREFLIGHT_SCHEDULE_NOT_ADMITTED: { ...NO, state: "terminal", highlightsInput: true },
  RESEARCH_PREFLIGHT_TOPOLOGY_UNSUPPORTED: { ...NO, state: "terminal", highlightsInput: true },
  RESEARCH_PREFLIGHT_RESOURCE_REFUSED: { ...NO, state: "terminal", highlightsInput: true },
  RESEARCH_PREFLIGHT_SNAPSHOT_TOO_LARGE: { ...NO, state: "terminal", highlightsInput: true },

  /* The installed release moved under the form; the manifest must be re-read
     before the same declaration means the same thing. */
  RESEARCH_PREFLIGHT_RELEASE_STALE: {
    ...NO,
    state: "terminal",
    invalidatesToken: true,
    requiresRefresh: true,
  },

  /* Transient, and typed as such: the dependency answered, it said "not now". */
  RESEARCH_PREFLIGHT_UNAVAILABLE: { ...NO, state: "failed-retryable", mayRetry: true },
  RESEARCH_PREFLIGHT_REJECTED: { ...NO, state: "failed-retryable", mayRetry: true },

  /* The token is gone. It is never retried: a run must not be built on a
     preview the server no longer stands behind. */
  RESEARCH_PREFLIGHT_NOT_FOUND: { ...NO, state: "terminal", invalidatesToken: true },
  RESEARCH_PREFLIGHT_EXPIRED: { ...NO, state: "terminal", invalidatesToken: true },
  RESEARCH_PREFLIGHT_STALE: { ...NO, state: "terminal", invalidatesToken: true },
};

export interface PreflightRefusal extends PreflightRefusalPresentation {
  code: PreflightProblemCode | null;
  /** The server's own sentence. Never rewritten locally. */
  message: string;
  status: number;
  requestId: string | null;
}

/**
 * Turns a failed call into a refusal the UI can render.
 *
 * A transport failure is reported as one without naming the transport: the
 * reader can act on "the request did not reach the server", not on a status
 * line from a proxy.
 */
export function toPreflightRefusal(error: unknown): PreflightRefusal {
  if (!(error instanceof PortalApiError)) {
    return {
      ...NO,
      code: null,
      message: "The request did not reach the server.",
      status: 0,
      requestId: null,
      state: "failed-retryable",
      mayRetry: true,
    };
  }
  /* RF01-F3: an expired session goes to the shell's sign-in path. */
  if (error.status === 401) reportSessionExpired();
  const known =
    error.code && error.code in REFUSAL ? REFUSAL[error.code as PreflightProblemCode] : null;
  return {
    ...(known ?? {
      ...NO,
      state: error.status >= 500 ? "unavailable" : "terminal",
    }),
    code: (error.code as PreflightProblemCode | null) ?? null,
    message: error.message,
    status: error.status,
    requestId: error.requestId,
  };
}

/** Every code the contract declares, for exhaustiveness tests. */
export const PREFLIGHT_PROBLEM_CODES = Object.keys(REFUSAL) as PreflightProblemCode[];

/* -------------------------------------------------------------------------
 * Local token invalidation
 * ---------------------------------------------------------------------- */

/**
 * Key-ordered JSON of a requested spec.
 *
 * This is **not** a canonicalisation and **not** a digest. It never leaves the
 * browser, is never compared against `requested_spec_digest`, and is used for
 * exactly one decision: whether the spec on screen is still the spec the held
 * token was issued for. Control API owns canonicalisation; this owns "did the
 * reader change something since the preview".
 *
 * Keys are sorted so a rebuild that happens to construct the object in a
 * different order cannot silently turn "unchanged" into "changed".
 */
function stableShape(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableShape);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, entry]) => [key, stableShape(entry)]),
    );
  }
  return value;
}

/**
 * Whether two requested specs are the same declaration.
 *
 * Every difference is material. P08's contract has no "cosmetic" field: a
 * changed seed, a changed trial count and a changed symbol all produce a
 * different effective spec, so treating any of them as harmless would let a run
 * be built from a preview of something else.
 */
export function sameRequestedSpec(a: RequestedSpec | null, b: RequestedSpec | null): boolean {
  if (a === null || b === null) return a === b;
  return JSON.stringify(stableShape(a)) === JSON.stringify(stableShape(b));
}
