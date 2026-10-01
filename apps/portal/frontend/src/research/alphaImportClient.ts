/**
 * Research Loop — Alpha Import client (P07, Screen 14).
 *
 * Five same-origin operations, typed entirely from
 * `@portal/contracts-research-alpha-import`. Nothing here parses a server
 * string or hand-writes a shape: if the contract changes, this file stops
 * compiling, which is the point.
 *
 * The error map is a `Record` over the contract's own code union rather than a
 * list of strings. A code added by the backend therefore fails the build here
 * instead of falling through to a generic message — which is how a typed
 * refusal quietly becomes "something went wrong".
 *
 * CSRF and same-origin credentials reuse the Portal's existing primitives
 * rather than restating them; `PortalApiError` already carries status, code and
 * request id, so no second error class exists for Research.
 */

import type { components } from "@portal/contracts-research-alpha-import";

import { CSRF_HEADER, csrfTokenFromCookie } from "../auth/authApi";
import { PortalApiError } from "../lib/api";
import type { ResearchState } from "./state";
import { reportSessionExpired } from "../auth/sessionExpiry";
import { REFUSAL_COPY, refusalCopy, stateOfStatus } from "./researchRefusal";

type Schemas = components["schemas"];

export type ParseRequest = Schemas["ParseRequest"];
export type GatesRequest = Schemas["GatesRequest"];
export type RegisterRequest = Schemas["RegisterRequest"];
export type ActivateRequest = Schemas["ActivateRequest"];

export type SourceResponse = Schemas["SourceResponse"];
export type GatesResponse = Schemas["GatesResponse"];
export type RegistrationResponse = Schemas["RegistrationResponse"];
export type ActivationResponse = Schemas["ActivationResponse"];
export type RegistryListResponse = Schemas["RegistryListResponse"];

/** Evidence for the registered Alpha source only; served on registration and on each registry row (14-09). */
export type ImportAttestation = Schemas["ImportAttestation"];

export type MirrorField = Schemas["MirrorField"];
export type GateRow = Schemas["GateRow"];
export type RegistryEntry = Schemas["RegistryEntry"];
export type GateName = GateRow["name"];
export type LifecycleState = RegistryEntry["lifecycle_state"];

/** The bounded, server-projected declaration of one immutable version. */
export type AlphaVersionDeclaration = Schemas["AlphaVersionDeclaration"];
export type DeclaredParameter = Schemas["ParameterDeclaration"];

/** The contract's own refusal vocabulary. Not a local list. */
export type ProblemCode = Schemas["Problem"]["error"]["code"];

const BASE = "/api/v1/research/alphas";

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

function query(workspaceId?: string, extra?: Record<string, string>): string {
  const params = new URLSearchParams({
    ...(workspaceId ? { workspace_id: workspaceId } : {}),
    ...(extra ?? {}),
  });
  const text = params.toString();
  return text ? `?${text}` : "";
}

export const alphaImportApi = {
  /** `cursor` is the server's opaque `next_cursor`, sent back exactly as served and never parsed. */
  registry: (workspaceId?: string, alphaId?: string, cursor?: string) =>
    call<RegistryListResponse>(
      `${BASE}${query(workspaceId, { ...(alphaId ? { alpha_id: alphaId } : {}), ...(cursor ? { cursor } : {}) })}`,
    ),

  parse: (body: ParseRequest) =>
    call<SourceResponse>(`${BASE}/import/parse`, { method: "POST", body: JSON.stringify(body) }),

  gates: (body: GatesRequest) =>
    call<GatesResponse>(`${BASE}/import/gates`, { method: "POST", body: JSON.stringify(body) }),

  register: (body: RegisterRequest) =>
    call<RegistrationResponse>(`${BASE}/import/register`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  activate: (alphaVersionId: string, body: ActivateRequest) =>
    call<ActivationResponse>(`${BASE}/${encodeURIComponent(alphaVersionId)}/activate`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
} as const;

/* -------------------------------------------------------------------------
 * Refusal mapping
 *
 * Exhaustive over the contract's union. Adding a code backend-side breaks this
 * build rather than degrading the new refusal into a generic failure.
 * ---------------------------------------------------------------------- */

interface RefusalPresentation {
  /** Which Portal state word this refusal is. */
  state: ResearchState["state"];
  /** Whether a retry of the same request could ever succeed. */
  mayRetry: boolean;
  /** True when the caller must re-read before trying again. */
  requiresRefresh: boolean;
  /** True when the local source is no longer valid for this receipt. */
  invalidatesSource: boolean;
}

const REFUSAL: Record<ProblemCode, RefusalPresentation> = {
  SESSION_REQUIRED: {
    state: "denied",
    mayRetry: false,
    requiresRefresh: true,
    invalidatesSource: false,
  },
  REQUEST_REJECTED: {
    state: "terminal",
    mayRetry: false,
    requiresRefresh: false,
    invalidatesSource: false,
  },
  RESEARCH_ALPHA_IMPORT_INVALID: {
    state: "terminal",
    mayRetry: false,
    requiresRefresh: false,
    invalidatesSource: false,
  },
  /* The analyser is a dependency, not a verdict on the source. */
  RESEARCH_ALPHA_IMPORT_ANALYSIS_UNAVAILABLE: {
    state: "failed-retryable",
    mayRetry: true,
    requiresRefresh: false,
    invalidatesSource: false,
  },
  RESEARCH_ALPHA_IMPORT_ANALYSIS_REJECTED: {
    state: "terminal",
    mayRetry: false,
    requiresRefresh: false,
    invalidatesSource: false,
  },
  RESEARCH_ALPHA_IMPORT_DIGEST_MISMATCH: {
    state: "terminal",
    mayRetry: false,
    requiresRefresh: true,
    invalidatesSource: true,
  },
  /* The reference is gone or expired: the bytes must be parsed again. */
  RESEARCH_ALPHA_IMPORT_SOURCE_NOT_FOUND: {
    state: "terminal",
    mayRetry: false,
    requiresRefresh: false,
    invalidatesSource: true,
  },
  RESEARCH_ALPHA_IMPORT_SOURCE_EXPIRED: {
    state: "terminal",
    mayRetry: false,
    requiresRefresh: false,
    invalidatesSource: true,
  },
  RESEARCH_ALPHA_IMPORT_GATES_REQUIRED: {
    state: "terminal",
    mayRetry: false,
    requiresRefresh: false,
    invalidatesSource: false,
  },
  RESEARCH_ALPHA_IMPORT_GATES_FAILED: {
    state: "terminal",
    mayRetry: false,
    requiresRefresh: false,
    invalidatesSource: false,
  },
  /* Re-registering identical bytes is refused by design, not by accident. */
  RESEARCH_ALPHA_IMPORT_DIGEST_ALREADY_REGISTERED: {
    state: "terminal",
    mayRetry: false,
    requiresRefresh: true,
    invalidatesSource: false,
  },
  RESEARCH_ALPHA_IMPORT_VERSION_CONFLICT: {
    state: "terminal",
    mayRetry: false,
    requiresRefresh: true,
    invalidatesSource: false,
  },
  RESEARCH_ALPHA_IMPORT_ADMISSION_SATURATED: {
    state: "failed-retryable",
    mayRetry: true,
    requiresRefresh: false,
    invalidatesSource: false,
  },
  RESEARCH_ALPHA_IMPORT_ACTIVATION_FORBIDDEN: {
    state: "denied",
    mayRetry: false,
    requiresRefresh: false,
    invalidatesSource: false,
  },
  /* CAS lost: refresh the revision and decide again. Never blind-retry. */
  RESEARCH_ALPHA_IMPORT_ACTIVATION_CONFLICT: {
    state: "terminal",
    mayRetry: false,
    requiresRefresh: true,
    invalidatesSource: false,
  },
};

export interface ImportRefusal extends RefusalPresentation {
  code: ProblemCode | null;
  /** The screen's fixed sentence for the resolved state (VD-P23-01); never the server's prose. */
  message: string;
  /** The server's own sentence, for a details disclosure only. */
  detail?: string | null;
  status: number;
  requestId: string | null;
  /**
   * True when the screen's words are the one F-04 sentence for a 403 or a 404
   * (14-21/22). Such a refusal prints that sentence alone; the code, the
   * server's text and the request id ride in a details disclosure so a 403 and
   * a 404 are not told apart on the surface.
   */
  neutral?: boolean;
  /**
   * True when the banner keeps the raw `RESEARCH_*` code, the server's text and
   * the request id out of its surface and shows them under a details disclosure
   * only: the neutral 403/404 (F-04) and the origin/CSRF refusal, whose code
   * (`…_INVALID`) would contradict its own sentence.
   */
  codeInDetails?: boolean;
}

/**
 * S14-C1: the mutating routes refuse a request whose origin or CSRF check fails
 * with `403 RESEARCH_ALPHA_IMPORT_INVALID`. That is not an invalid import, so it
 * must not borrow the invalid-import sentence. VD-F1-01 (Bobby, 2026-10-01):
 * exactly this sentence — it names no cause; the `RESEARCH_…` code, the server's
 * text and the request id sit in the details line only.
 */
export const IMPORT_ORIGIN_REFUSED = "Request refused — reload the page and try again.";

/**
 * The screen's sentence per contract code (VD-P23-01): specific enough to act
 * on, fixed so no server prose reaches the screen. A code not listed falls
 * back to the state's sentence.
 */
export const IMPORT_REFUSAL_SENTENCE: Partial<Record<ProblemCode, string>> = {
  RESEARCH_ALPHA_IMPORT_INVALID: "The import request is not valid. Check the source and try again.",
  RESEARCH_ALPHA_IMPORT_ANALYSIS_UNAVAILABLE: "The analyser is not responding. Try again.",
  RESEARCH_ALPHA_IMPORT_ANALYSIS_REJECTED: "The analyser rejected this module. Nothing was registered.",
  RESEARCH_ALPHA_IMPORT_DIGEST_MISMATCH: "The module changed since it was parsed — its digest no longer matches. Parse it again.",
  /* 403 = 404 (F-04): one sentence, E1 `REFUSAL_COPY.denied`. */
  RESEARCH_ALPHA_IMPORT_SOURCE_NOT_FOUND: REFUSAL_COPY.denied,
  RESEARCH_ALPHA_IMPORT_SOURCE_EXPIRED: "That parse receipt expired. Parse the module again.",
  RESEARCH_ALPHA_IMPORT_GATES_REQUIRED: "The gates have not run for this source yet. Run them before registering.",
  RESEARCH_ALPHA_IMPORT_GATES_FAILED: "At least one gate failed for this source. Nothing was registered.",
  RESEARCH_ALPHA_IMPORT_DIGEST_ALREADY_REGISTERED: "This exact source is already registered as an alpha version.",
  RESEARCH_ALPHA_IMPORT_VERSION_CONFLICT: "This alpha changed since it was read. Read it again.",
  RESEARCH_ALPHA_IMPORT_ADMISSION_SATURATED: "The import queue is full. This request was not accepted and can be tried again.",
  RESEARCH_ALPHA_IMPORT_ACTIVATION_FORBIDDEN: REFUSAL_COPY.denied,
  RESEARCH_ALPHA_IMPORT_ACTIVATION_CONFLICT: "This version's lifecycle changed since it was read. Read it again.",
};

/**
 * Turns a failed call into a refusal the UI can render.
 *
 * An unknown code is reported as such rather than guessed at: a refusal the
 * browser does not recognise is still a refusal, and inventing a friendly
 * meaning for it is how a denial starts looking like an outage.
 */
export function toRefusal(error: unknown): ImportRefusal {
  if (!(error instanceof PortalApiError)) {
    return {
      code: null,
      message: "The request did not reach the server.",
      status: 0,
      requestId: null,
      state: "failed-retryable",
      mayRetry: true,
      requiresRefresh: false,
      invalidatesSource: false,
    };
  }
  /* RF01-F3: an expired session goes to the shell's sign-in path. */
  if (error.status === 401) reportSessionExpired();
  const known = error.code && error.code in REFUSAL ? REFUSAL[error.code as ProblemCode] : null;
  const state = known?.state ?? stateOfStatus(error.status);
  /* S14-C1: a 403 carrying INVALID is the origin/CSRF check, not a bad import. */
  const originRefused = error.status === 403 && error.code === "RESEARCH_ALPHA_IMPORT_INVALID";
  /* 14-21/22: every other 403 and 404 reads as the one F-04 sentence, whatever its code. */
  const neutral = (error.status === 403 || error.status === 404) && !originRefused;
  return {
    code: (error.code as ProblemCode | null) ?? null,
    /* VD-P23-01: the words on screen are the screen's; the server's sentence is detail. */
    message: originRefused
      ? IMPORT_ORIGIN_REFUSED
      : neutral
        ? REFUSAL_COPY.denied
        : (known && error.code ? IMPORT_REFUSAL_SENTENCE[error.code as ProblemCode] : undefined) ?? refusalCopy(state, error.status),
    detail: error.message || null,
    status: error.status,
    requestId: error.requestId,
    neutral,
    codeInDetails: neutral || originRefused,
    state,
    mayRetry: known?.mayRetry ?? state === "unavailable",
    requiresRefresh: known?.requiresRefresh ?? false,
    invalidatesSource: known?.invalidatesSource ?? false,
  };
}

/** Every code the contract declares, for exhaustiveness tests. */
export const PROBLEM_CODES = Object.keys(REFUSAL) as ProblemCode[];
