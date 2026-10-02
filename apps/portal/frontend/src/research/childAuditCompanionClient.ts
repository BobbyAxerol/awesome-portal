/**
 * Research Loop — child-audit companion client.
 *
 * `researchChildAuditCompanionGetV1`, `/api/v1/quantbt/runs/:runId/current-source/child-audit-companion`:
 * the full available source lifecycle rows of one run, paged by an opaque
 * signed cursor. The scope is "source lifecycle observations, not a generation
 * clock". A legacy 64-row sample is a different custody and never stands in
 * for the full rows. The browser derives nothing from these rows.
 *
 * The contract has no `@portal/contracts-*` alias yet (tsconfig is shared), so
 * the generated types are imported by relative path — type-only, erased at build.
 */

import type { components, operations } from "../../../../../packages/contracts/generated/research-child-audit-companion";

import { PortalApiError } from "../lib/api";
import { reportSessionExpired } from "../auth/sessionExpiry";

type Schemas = components["schemas"];

export type ChildAuditCompanionPage = Schemas["Page"];
export type ChildAuditCompanionRow = Schemas["Row"];
export type ChildAuditCompanionManifest = Schemas["Manifest"];
export type ChildAuditCompanionQuery = NonNullable<operations["researchChildAuditCompanionGetV1"]["parameters"]["query"]>;
export type ChildAuditContext = NonNullable<ChildAuditCompanionQuery["context"]>;

/** The four closed contexts the server accepts, in lifecycle order. */
export const CHILD_AUDIT_CONTEXTS: readonly ChildAuditContext[] = [
  "anti-leakage in-sample search",
  "in-sample scoring",
  "out-of-sample scoring",
  "out-of-sample generation",
];

/** Named page sizes offered to the reader; the server owns the real bound and refuses beyond it. */
export const CHILD_AUDIT_PAGE_SIZES = [25, 50, 100] as const;
export const CHILD_AUDIT_DEFAULT_PAGE_SIZE = 50;

const RUNS = "/api/v1/quantbt/runs";

export function childAuditCompanionPath(runId: string, query: ChildAuditCompanionQuery = {}): string {
  const params = new URLSearchParams();
  if (query.workspace_id) params.set("workspace_id", query.workspace_id);
  if (query.fold_id) params.set("fold_id", query.fold_id);
  if (query.context) params.set("context", query.context);
  /* Exact ordinal lookup and a cursor are mutually exclusive: the ordinal wins, no cursor rides along. */
  if (typeof query.audit_ordinal === "number") params.set("audit_ordinal", String(query.audit_ordinal));
  else if (query.cursor) params.set("cursor", query.cursor);
  if (typeof query.limit === "number") params.set("limit", String(query.limit));
  const serialized = params.toString();
  return `${RUNS}/${encodeURIComponent(runId)}/current-source/child-audit-companion${serialized ? `?${serialized}` : ""}`;
}

export const childAuditCompanionApi = {
  /** `researchChildAuditCompanionGetV1` */
  get: async (runId: string, query: ChildAuditCompanionQuery = {}, signal?: AbortSignal): Promise<ChildAuditCompanionPage> => {
    const response = await fetch(childAuditCompanionPath(runId, query), { credentials: "same-origin", signal });
    if (!response.ok) {
      let code: string | null = null;
      let requestId: string | null = response.headers.get("x-request-id");
      try {
        const problem = (await response.json()) as Partial<Schemas["Problem"]>;
        code = problem?.error?.code ?? null;
        requestId = problem?.request_id ?? requestId;
      } catch {
        /* non-JSON error body: the status is still typed */
      }
      if (response.status === 401) reportSessionExpired();
      throw new PortalApiError(`${response.status} ${response.statusText}`, response.status, code, requestId);
    }
    return (await response.json()) as ChildAuditCompanionPage;
  },
};
