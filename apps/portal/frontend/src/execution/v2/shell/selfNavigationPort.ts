/**
 * The self-navigation read as a port (FE-057/058, W1 of the UXM-07 self-contract review).
 *
 * `GET /api/admin/profile-access/v2/self-navigation?workspace_id=&environment=` (`portal.self-navigation.v1`, operationId
 * `portalScopedAccessSelfNavigationGetV1`) lives under `/api/admin/**`, outside the execution port the screens receive, and the
 * rail that consumes it sits ABOVE the router's screens. So the read has its own small port here, next to the hook that owns its
 * life cycle; `useSelfNavigation` takes any `SelfNavigationPort`, which keeps the hook testable without a network and leaves
 * the shared `ExecutionApi` (api/ports.ts) untouched.
 *
 * What an outcome is, and is not:
 *
 * - `ok`: a body that passed the strict reader (`readAccessSelfNavigation`). It is still a body for the question that was asked
 *   only after `navigationAnswers`, which the hook checks; this port does not.
 * - `conflict`: HTTP 409. Core's private final-egress fence crossed while it evaluated (the published projection carries no such
 *   deadline). It is a retry hint for the hook (once), not a refusal and not a statement about permissions.
 * - `denied`: 401 or 403. A fact about now, never softened into "unavailable".
 * - `unavailable`: everything else, each with the one honest sentence for it. An HTTP 500 on this read says nothing about
 *   permissions.
 *
 * The port never throws and never caches (`no-store`, same-origin credentials from the session cookie). The session key the hook
 * passes is NOT sent anywhere: the cookie is the session. It is part of the request so a fake in a test, and a future transport,
 * can see which session the question belongs to.
 */
import { readAccessSelfNavigation, accessSelfNavigationUrl, type AccessSelfNavigation } from "../readers/accessSelf";
import { ACCESS_SELF_CONTEXT_PATH, readAccessSelfContext, type AccessSelfContext } from "../readers/accessSelfContext";
import type { AccessEnvironment } from "../readers/accessEffective";

export interface SelfNavigationQuestion {
  workspaceId: string;
  environment: AccessEnvironment;
  /** The session the question is asked for. Never sent; the cookie carries the session. */
  sessionKey: string;
}

export interface SelfNavigationProblem {
  /** The closed-vocabulary problem code the Portal sent, when it sent one in the published shape. */
  code: string | null;
  requestId: string | null;
}

export type SelfNavigationOutcome =
  | { kind: "ok"; navigation: AccessSelfNavigation }
  | ({ kind: "conflict" } & SelfNavigationProblem)
  | ({ kind: "denied"; status: 401 | 403 } & SelfNavigationProblem)
  | ({ kind: "unavailable"; reason: string; status: number | null } & SelfNavigationProblem);

export interface SelfNavigationPort {
  /** Resolves; never rejects. An aborted read resolves as `unavailable` and the hook discards it by token. */
  read(request: SelfNavigationQuestion, signal: AbortSignal): Promise<SelfNavigationOutcome>;
  /**
   * `GET /api/admin/profile-access/v2/self-context` (BE-P7): asked ONLY when the address names no workspace. The read takes no
   * query (the workspace is its output). Optional so a port that predates it still works: without it a workspace-less address stays
   * idle, as before. Same contract as `read`: resolves, never rejects, nothing is cached, the session key is not sent.
   */
  readContext?(request: SelfContextQuestion, signal: AbortSignal): Promise<SelfContextOutcome>;
}

export interface SelfContextQuestion {
  /** The session the question is asked for. Never sent; the cookie carries the session. */
  sessionKey: string;
}

/** `conflict` does not exist here: the context is a membership read with no private egress fence; a 409 is just `unavailable`. */
export type SelfContextOutcome =
  | { kind: "ok"; context: AccessSelfContext }
  | ({ kind: "denied"; status: 401 | 403 } & SelfNavigationProblem)
  | ({ kind: "unavailable"; reason: string; status: number | null } & SelfNavigationProblem);

const CODE = /^[A-Z][A-Z0-9_]{2,63}$/;
const REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

async function problemOf(response: Response): Promise<SelfNavigationProblem> {
  let code: string | null = null;
  let requestId: string | null = null;
  try {
    const body = (await response.json()) as { error?: { code?: unknown; request_id?: unknown }; request_id?: unknown };
    if (typeof body?.error?.code === "string" && CODE.test(body.error.code)) code = body.error.code;
    const id = body?.error?.request_id ?? body?.request_id;
    if (typeof id === "string" && REQUEST_ID.test(id)) requestId = id;
  } catch {
    /* a proxy can answer with a non-JSON body; the status still counts */
  }
  const header = response.headers.get("x-request-id");
  if (requestId === null && header !== null && REQUEST_ID.test(header)) requestId = header;
  return { code, requestId };
}

const unavailable = (reason: string, status: number | null = null, problem: SelfNavigationProblem = { code: null, requestId: null }): SelfNavigationOutcome => ({
  kind: "unavailable", reason, status, ...problem,
});

/** The same-origin HTTP transport. `fetchImpl` is a test seam only. */
export function httpSelfNavigationPort(fetchImpl?: typeof fetch): SelfNavigationPort {
  return {
    async read(request, signal) {
      const url = accessSelfNavigationUrl({ workspaceId: request.workspaceId, environment: request.environment });
      if (url === null) return unavailable("The workspace or environment in the address is not one the Portal accepts, so navigation was not read.");
      try {
        const response = await (fetchImpl ?? fetch)(url, { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" }, signal });
        if (!response.ok) {
          const problem = await problemOf(response);
          if (response.status === 409) return { kind: "conflict", ...problem };
          if (response.status === 401 || response.status === 403) return { kind: "denied", status: response.status, ...problem };
          return unavailable(`The Portal answered ${response.status}.`, response.status, problem);
        }
        let body: unknown;
        try {
          body = await response.json();
        } catch {
          return unavailable("The answer was not readable.", response.status);
        }
        const read = readAccessSelfNavigation(body);
        if (read === null) return unavailable("The answer did not match the published navigation contract.", response.status);
        if (read.kind === "unsupported_shape") {
          return unavailable(
            read.schemaVersion === null
              ? "The answer carries no schema version this build reads."
              : `The answer is ${read.schemaVersion}, which this build does not read.`,
            response.status,
          );
        }
        return { kind: "ok", navigation: read.navigation };
      } catch {
        return unavailable("The Portal could not be reached.");
      }
    },

    async readContext(_request, signal): Promise<SelfContextOutcome> {
      const down = (reason: string, status: number | null = null, problem: SelfNavigationProblem = { code: null, requestId: null }): SelfContextOutcome => ({
        kind: "unavailable", reason, status, ...problem,
      });
      try {
        const response = await (fetchImpl ?? fetch)(ACCESS_SELF_CONTEXT_PATH, { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" }, signal });
        if (!response.ok) {
          const problem = await problemOf(response);
          if (response.status === 401 || response.status === 403) return { kind: "denied", status: response.status, ...problem };
          return down(`The Portal answered ${response.status}.`, response.status, problem);
        }
        let body: unknown;
        try {
          body = await response.json();
        } catch {
          return down("The answer was not readable.", response.status);
        }
        const read = readAccessSelfContext(body);
        if (read === null) return down("The answer did not match the published self-context contract.", response.status);
        if (read.kind === "unsupported_shape") {
          return down(
            read.schemaVersion === null
              ? "The answer carries no schema version this build reads."
              : `The answer is ${read.schemaVersion}, which this build does not read.`,
            response.status,
          );
        }
        return { kind: "ok", context: read.context };
      } catch {
        return down("The Portal could not be reached.");
      }
    },
  };
}
