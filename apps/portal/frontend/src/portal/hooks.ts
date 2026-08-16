/**
 * React Query bindings for the Portal control plane — U03.
 *
 * The cache policies here mirror the HTTP contract rather than guessing:
 * the registry is ETag-revalidated and safe to keep, the summary is
 * `no-store` and must never be served from a stale cache.
 */
import { useQuery } from "@tanstack/react-query";

import { PortalRequestError, fetchLinks, fetchRegistry, fetchSummary } from "./client";

/**
 * Registry document.
 *
 * Long `staleTime` is correct here: the transport revalidates with
 * `If-None-Match`, so a "stale" cache entry costs a 304, not a re-render with
 * wrong data. Retrying is pointless for a 4xx.
 */
export function useRegistry() {
  return useQuery({
    queryKey: ["portal", "registry"],
    queryFn: ({ signal }) => fetchRegistry(signal),
    staleTime: 5 * 60_000,
    retry: (attempt, error) =>
      attempt < 2 && error instanceof PortalRequestError && error.retryable,
  });
}

/**
 * Command Center summary.
 *
 * `staleTime: 0` and no client retry loop: the server applies a hard deadline
 * and does not retry upstream, so a failed snapshot is an answer, not a
 * transient to paper over (FRONTEND_HANDOFF §1).
 */
export function useSummary(options: { refetchInterval?: number | false } = {}) {
  return useQuery({
    queryKey: ["portal", "summary"],
    queryFn: ({ signal }) => fetchSummary(signal),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchInterval: options.refetchInterval ?? false,
  });
}

/** Cross-link sidecar; only fetched by screens that actually render links. */
export function useLinks(enabled = true) {
  return useQuery({
    queryKey: ["portal", "links"],
    queryFn: ({ signal }) => fetchLinks(signal),
    staleTime: 5 * 60_000,
    enabled,
    retry: (attempt, error) =>
      attempt < 2 && error instanceof PortalRequestError && error.retryable,
  });
}
