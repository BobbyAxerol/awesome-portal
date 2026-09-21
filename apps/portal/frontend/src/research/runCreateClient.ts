/**
 * Research Loop — run create client (P10, Screen 02).
 *
 * One same-origin write. Every shape comes from
 * `@portal/contracts-research-run-create`; `may_create_run` comes from the P08
 * preflight contract, because the field belongs to the preview a run is built
 * from, not to the create call.
 *
 * The prohibitions are the handoff's, restated where they are enforceable:
 * no digest is computed here, no cursor or token is encoded, and no source
 * path, snapshot byte, worker id, lease epoch, adapter id, effective digest or
 * private principal is ever sent. What goes up is the opaque preflight token,
 * the canonical requested spec, a bounded client intent id and the intent kind.
 *
 * `client_intent_id` is generated per submission attempt and reused across
 * retries of that attempt. That is what makes the server's `replayed` flag
 * meaningful: a second press of the same button must be recognisable as the
 * same intent rather than as a second run.
 */

import type { components } from "@portal/contracts-research-run-create";

import { CSRF_HEADER, csrfTokenFromCookie } from "../auth/authApi";
import { PortalApiError } from "../lib/api";
import type { ResearchState } from "./state";

type Schemas = components["schemas"];

export type RunCreateRequest = Schemas["RunCreateRequest"];
export type RunCreateResponse = Schemas["RunCreateResponse"];
export type IntentKind = RunCreateRequest["intent_kind"];
export type RunCreateProblemCode = Schemas["Problem"]["error"]["code"];

const RUNS_PATH = "/api/v1/research/runs";

async function call<T>(path: string, body: unknown): Promise<T> {
  const csrf = csrfTokenFromCookie();
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      ...(csrf ? { [CSRF_HEADER]: csrf } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    let code: string | null = null;
    let requestId: string | null = response.headers.get("x-request-id");
    try {
      const problem = (await response.json()) as Partial<Schemas["Problem"]>;
      if (problem?.error?.message) message = problem.error.message;
      code = problem?.error?.code ?? null;
      requestId = problem?.request_id ?? requestId;
    } catch {
      /* non-JSON error body: keep the status line the server gave */
    }
    throw new PortalApiError(message, response.status, code, requestId);
  }
  return (await response.json()) as T;
}

export const runCreateApi = {
  create: (body: RunCreateRequest) => call<RunCreateResponse>(RUNS_PATH, body),
} as const;

/**
 * A bounded, opaque intent id for one submission attempt.
 *
 * Not a digest and not derived from the spec: it identifies *this press of the
 * button*, which is exactly what makes a replay distinguishable from a second
 * run. `crypto.randomUUID` where available, and a bounded random fallback
 * where it is not — never a counter, which would collide across tabs.
 */
export function newClientIntentId(): string {
  const random = globalThis.crypto;
  if (random && typeof random.randomUUID === "function") return random.randomUUID();
  const bytes = new Uint8Array(16);
  if (random && typeof random.getRandomValues === "function") {
    random.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/* -------------------------------------------------------------------------
 * Refusal mapping
 * ---------------------------------------------------------------------- */

interface RunCreateRefusalPresentation {
  state: ResearchState["state"];
  mayRetry: boolean;
  /** True when the held preflight token is dead and a fresh preflight is owed. */
  invalidatesPreflight: boolean;
  /** True when the reader's declaration is what the server rejected. */
  highlightsInput: boolean;
}

const NO: Omit<RunCreateRefusalPresentation, "state"> = {
  mayRetry: false,
  invalidatesPreflight: false,
  highlightsInput: false,
};

const REFUSAL: Record<RunCreateProblemCode, RunCreateRefusalPresentation> = {
  SESSION_REQUIRED: { ...NO, state: "denied", invalidatesPreflight: true },
  REQUEST_REJECTED: { ...NO, state: "terminal" },

  /* The declaration is at fault; every field stays on screen. */
  RESEARCH_RUN_CREATE_INVALID: { ...NO, state: "terminal", highlightsInput: true },

  /* Admission, re-evaluated atomically at submit. `may_create_run` being true
     a moment ago is display state, not a promise, so this is a normal outcome
     rather than a contradiction to explain away. */
  RESEARCH_RUN_CREATE_FORBIDDEN: { ...NO, state: "denied" },

  /* The preview a run would be built from is gone or was never usable. */
  RESEARCH_RUN_PREFLIGHT_NOT_READY: { ...NO, state: "terminal", invalidatesPreflight: true },
  RESEARCH_RUN_PREFLIGHT_STALE: { ...NO, state: "terminal", invalidatesPreflight: true },

  /* The bound alpha version is no longer the one that may run. */
  RESEARCH_RUN_ALPHA_NOT_ACTIVE: { ...NO, state: "terminal", highlightsInput: true },

  /*
   * The fixed P04 adapter cannot serve these parameters or this intent.
   * `highlightsInput` points at the declaration, and the container keeps every
   * valid field: silently downgrading rich parameters to the adapter's fixed
   * ones would submit something the reader did not declare.
   */
  RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE: {
    ...NO,
    state: "unavailable",
    highlightsInput: true,
  },

  /* Dependencies. Retryable where retrying could plausibly differ. */
  RESEARCH_RUN_PRODUCER_UNAVAILABLE: { ...NO, state: "unavailable", mayRetry: true },
  RESEARCH_RUN_UPSTREAM_REJECTED: { ...NO, state: "failed-retryable", mayRetry: true },

  /*
   * The transport did not say whether the run was created.
   *
   * Not retryable on its own: a blind retry is how one declaration becomes two
   * runs. The recovery is the same `client_intent_id`, which lets the server
   * answer `replayed` instead of creating a second one — so the control is
   * offered as an explicit "check again", never as an automatic retry.
   */
  RESEARCH_RUN_TRANSPORT_UNKNOWN: { ...NO, state: "unavailable" },

  RESEARCH_RUN_NOT_FOUND: { ...NO, state: "terminal" },
};

export interface RunCreateRefusal extends RunCreateRefusalPresentation {
  code: RunCreateProblemCode | null;
  /** The server's own sentence. Never rewritten locally. */
  message: string;
  status: number;
  requestId: string | null;
}

export function toRunCreateRefusal(error: unknown): RunCreateRefusal {
  if (!(error instanceof PortalApiError)) {
    return {
      ...NO,
      code: null,
      message: "The request did not reach the server.",
      status: 0,
      requestId: null,
      /* Indistinguishable from `TRANSPORT_UNKNOWN` from here: the run may or
         may not exist, so nothing is retried automatically. */
      state: "unavailable",
    };
  }
  const known =
    error.code && error.code in REFUSAL ? REFUSAL[error.code as RunCreateProblemCode] : null;
  return {
    ...(known ?? { ...NO, state: error.status >= 500 ? "unavailable" : "terminal" }),
    code: (error.code as RunCreateProblemCode | null) ?? null,
    message: error.message,
    status: error.status,
    requestId: error.requestId,
  };
}

/** Every code the contract declares, for exhaustiveness tests. */
export const RUN_CREATE_PROBLEM_CODES = Object.keys(REFUSAL) as RunCreateProblemCode[];

/**
 * Whether a refusal leaves the run's existence unknown.
 *
 * These are the only two outcomes where "submit again" is the wrong word:
 * the safe action is to re-send the *same* intent so the server can answer
 * `replayed`, and the screen says so rather than offering a fresh submit.
 */
export function outcomeIsUnknown(refusal: RunCreateRefusal): boolean {
  return refusal.code === "RESEARCH_RUN_TRANSPORT_UNKNOWN" || refusal.code === null;
}
