/**
 * Sidebar count badges (WP-D, audit 2026-10-23 shell). Operations shows the open-exception count the queue read publishes
 * (`health.open_exception_count`, FE-CAT-2); Approvals shows the pending count the approvals read publishes (`counts.pending`).
 *
 * Rules, each with a test:
 * - ONE cheap read per badge (limit 1), on mount and on the existing poll cadence (`usePollTick`, which is off in a retained review
 *   and pauses in a hidden tab). No per-route reads, no extra polling timers of its own.
 * - Only a listed entry is read: a caller whose rail does not list Operations or Approvals never triggers the read.
 * - A badge exists only for a count the read published as a number. `null` (the source did not report it), a floor (`coverage`
 *   PARTIAL is drawn with a "+" and says so), an unsupported shape, a refusal and a failure all draw NO badge: the rail never
 *   prints a number it cannot stand behind, and a counted zero draws nothing (nothing needs you).
 * - The shell's workspace is the address's `workspace_id`; without one the read means "my own workspace", exactly like the screens.
 * - Never a sum, a client count of rows, or a default.
 */
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useLocation } from "react-router-dom";

import { useSession } from "../../../auth/session";
import { NO_NAV_BADGES, type NavBadge, type NavBadges } from "../../../app/selfNavView";
import type { PortalRegistryDocument } from "../../../portal/contracts";
import { sidebarGroups, type NavOptions } from "../../../portal/navigation";
import { createHttpApi } from "../../api/httpApi";
import type { ExecutionApi } from "../../api/ports";
import { usePollTick } from "../../useRevision";
import { EXECUTION_V2_SHELL } from "../flags";
import { parseUrlParams } from "../urlState";
import { applyV2Nav } from "./roleNav";

export const OPERATIONS_FEATURE = "EXECUTION_OPERATIONS";
export const APPROVALS_FEATURE = "EXECUTION_APPROVALS";
/** The badge cadence: slower than any screen's own read, so it never competes with them. */
export const NAV_COUNTS_POLL_MS = 60_000;

export const OPERATIONS_BADGE_LABEL = "open exceptions (queue health, FE-CAT-2)";
export const APPROVALS_BADGE_LABEL = "pending approvals (approvals read)";

function badge(count: number, partial: boolean, what: string, tone: NavBadge["tone"]): NavBadge | null {
  if (!Number.isSafeInteger(count) || count <= 0) return null;
  return { count, tone, label: `${count}${partial ? " or more" : ""} ${what}` };
}

/** The open-exception badge from one queue read; `null` when the read published nothing usable. */
export async function readOperationsBadge(api: ExecutionApi, workspaceId: string | undefined): Promise<NavBadge | null> {
  try {
    const result = await api.listOperationalQueueV2({ limit: 1, ...(workspaceId ? { workspaceId } : {}) });
    if (!result.ok || result.value.kind !== "queue") return null;
    const entry = result.value.queue.page.health?.openException;
    if (entry === undefined || entry.count === null) return null;
    return badge(entry.count, entry.coverage === "PARTIAL", OPERATIONS_BADGE_LABEL, "bad");
  } catch {
    return null;
  }
}

/** The pending badge from one approvals read; `null` when the read published no count. */
export async function readApprovalsBadge(api: ExecutionApi, workspaceId: string | undefined): Promise<NavBadge | null> {
  try {
    const result = await api.listApprovals({ filter: "ALL", limit: 1, ...(workspaceId ? { workspaceId } : {}) });
    if (!result.ok || result.value.counts === null) return null;
    return badge(result.value.counts.pending, false, APPROVALS_BADGE_LABEL, "warn");
  } catch {
    return null;
  }
}

/** Which badge-bearing entries the rail lists for this caller (the same overlay the rail uses). Pure. */
export function listedBadgeFeatures(registry: PortalRegistryDocument, options: NavOptions): { operations: boolean; approvals: boolean } {
  const items = applyV2Nav(sidebarGroups(registry, options), new Set(options.capabilities ?? [])).flatMap((group) => group.items);
  return {
    operations: items.some((item) => item.featureId === OPERATIONS_FEATURE),
    approvals: items.some((item) => item.featureId === APPROVALS_FEATURE),
  };
}

export interface NavCountsProps {
  registry: PortalRegistryDocument;
  options: NavOptions;
  onView: (badges: NavBadges) => void;
  /** Test seams. */
  enabled?: boolean;
  api?: ExecutionApi;
}

/** Renders nothing: reads the counts and hands the shell the badges. */
export default function NavCounts({ registry, options, onView, enabled = EXECUTION_V2_SHELL, api: injected }: NavCountsProps): null {
  const { principal } = useSession();
  const { search } = useLocation();
  const workspaceId = useMemo(() => parseUrlParams(search).value.workspace_id ?? undefined, [search]);
  const sessionKey = principal?.sessionId ?? null;
  const listed = useMemo(() => listedBadgeFeatures(registry, options), [registry, options]);
  const tick = usePollTick(NAV_COUNTS_POLL_MS, enabled && sessionKey !== null);
  const latest = useRef(onView);
  latest.current = onView;

  // The owning scope of every badge: session, workspace and which entries are listed (eligibility). Counts of another scope are
  // cleared on the same commit, before the new read starts, so a pending read for workspace B never shows workspace A's numbers.
  const scope = `${sessionKey ?? ""}|${workspaceId ?? ""}|${listed.operations ? 1 : 0}${listed.approvals ? 1 : 0}`;
  useLayoutEffect(() => {
    latest.current(NO_NAV_BADGES);
  }, [scope]);

  useEffect(() => {
    if (!enabled || sessionKey === null || (!listed.operations && !listed.approvals)) {
      latest.current(NO_NAV_BADGES);
      return undefined;
    }
    const controller = new AbortController();
    const api = injected ?? createHttpApi({ policy: null, signal: controller.signal });
    let cancelled = false;
    void Promise.all([
      listed.operations ? readOperationsBadge(api, workspaceId) : Promise.resolve(null),
      listed.approvals ? readApprovalsBadge(api, workspaceId) : Promise.resolve(null),
    ]).then(([operations, approvals]) => {
      if (cancelled) return;
      const next: Record<string, NavBadge> = {};
      if (operations !== null) next[OPERATIONS_FEATURE] = operations;
      if (approvals !== null) next[APPROVALS_FEATURE] = approvals;
      latest.current(Object.keys(next).length === 0 ? NO_NAV_BADGES : next);
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [enabled, sessionKey, workspaceId, listed, tick, injected]);

  // Leaving the shell (or a session change) must not leave a badge from the previous session on the rail.
  useEffect(() => () => latest.current(NO_NAV_BADGES), [sessionKey]);
  return null;
}
