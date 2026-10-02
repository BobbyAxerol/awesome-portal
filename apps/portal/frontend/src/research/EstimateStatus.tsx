/**
 * Screen 02 · what the declaration-estimate call is doing, and when it said no.
 *
 * Five states, worded apart: asking, refused by the server (a typed 400 that names a field),
 * a refused request (other 4xx), the server unavailable (5xx) and no answer. The last
 * three carry a Retry. None of them reads as "not published": that is a served answer.
 * The client sentence is chosen by status class; the server's message is never printed,
 * only its code, the field path and the request id.
 */

import type { EstimateStatus } from "./useDeclarationEstimate";

export const ESTIMATE_ERROR_COPY = {
  "client-error": "estimate — request refused",
  "server-error": "estimate — server unavailable",
  network: "estimate — no answer",
} as const;

/** `walk_forward.start`: the requested-spec path a refusal names, as the server wrote it. */
export function fieldPathText(path: readonly string[] | null | undefined): string | null {
  return path && path.length > 0 ? path.join(".") : null;
}

/** Whether a typed refusal names this field (`windows.is`, `walk_forward.start`): the control then reads as invalid. */
export function refusedAt(status: EstimateStatus, head: string, key?: string): boolean {
  return status.kind === "refused" && status.fieldPath !== null && status.fieldPath[0] === head && (key === undefined || status.fieldPath[1] === key);
}

/** The refusal's served facts for a tooltip: code, field path, request id. */
function facts(parts: readonly (string | null | undefined)[]): string {
  return parts.filter((part): part is string => Boolean(part)).join(" · ");
}

/** The strip line under the window timeline: asking, a refusal, or a distinct error with Retry. Served estimates and idle print nothing here. */
export function EstimateStatusLine({ status, onRetry }: { status: EstimateStatus; onRetry?: () => void }) {
  if (status.kind === "pending") {
    return (
      <span className="mono text-[9px]" style={{ color: "var(--ink-faint)" }} role="status" data-estimate-status="pending">
        estimating…
      </span>
    );
  }
  if (status.kind === "refused") {
    const path = fieldPathText(status.fieldPath);
    const title = facts([status.code, path ? `field ${path}` : null, status.requestId ? `request ${status.requestId}` : null]);
    return (
      <span
        className="mono text-[9.5px]"
        style={{ color: "var(--bad)" }}
        title={title}
        aria-label={`estimate refused · ${title}`}
        tabIndex={0}
        data-estimate-status="refused"
        data-reason-code={status.code}
      >
        estimate refused · {status.code}
        {path ? ` · ${path}` : ""}
      </span>
    );
  }
  if (status.kind === "error") {
    const title = facts([status.status !== null ? `status ${status.status}` : null, status.code, status.requestId ? `request ${status.requestId}` : null]);
    return (
      <span className="flex flex-wrap items-baseline gap-x-2" data-estimate-status={status.failure}>
        <span className="text-[9.5px]" style={{ color: "var(--bad)" }} title={title || undefined} aria-label={title ? `${ESTIMATE_ERROR_COPY[status.failure]} · ${title}` : undefined} tabIndex={title ? 0 : undefined}>
          {ESTIMATE_ERROR_COPY[status.failure]}
          {status.status !== null ? ` · ${status.status}` : ""}
          {status.code ? ` · ${status.code}` : ""}
        </span>
        {onRetry ? (
          <button type="button" className="text-[9.5px] font-semibold underline" style={{ color: "var(--accent)" }} onClick={onRetry} data-estimate-retry>
            Retry
          </button>
        ) : null}
      </span>
    );
  }
  return null;
}

/**
 * The refusal at the field it names: the served code and the path, under the control. Printed
 * only when the refusal's path starts with `owns` (and, when given, continues with `key`).
 */
export function EstimateFieldRefusal({
  status,
  owns,
  key2,
}: {
  status: EstimateStatus;
  /** The requested-spec head the control belongs to (`windows`, `walk_forward`). */
  owns: string;
  /** The next path segment, when the control is one window of several (`is`, `oos`, `holdout`). */
  key2?: string;
}) {
  if (status.kind !== "refused" || status.fieldPath === null || status.fieldPath[0] !== owns) return null;
  if (key2 !== undefined && status.fieldPath[1] !== key2) return null;
  const path = fieldPathText(status.fieldPath);
  return (
    <p
      className="mono w-full text-[10px]"
      style={{ color: "var(--bad)" }}
      role="alert"
      title={facts([status.code, path, status.requestId ? `request ${status.requestId}` : null])}
      data-estimate-field-refusal={path ?? undefined}
      data-reason-code={status.code}
    >
      {status.code} · {path}
    </p>
  );
}
