/**
 * The life cycle of the Actions rail's eligibility read (DEBT-UXM07-011, W6; FE-015/060).
 *
 * One question per scope, where a scope is (workspace, environment, portfolio, action list). The rules, each with a test:
 *
 * - ASKED ONLY WHEN IT CAN BE ANSWERED. `enabled` is the rail being open; the workspace must be in the address (the same rule as the
 *   self-navigation read: a workspace is never guessed). Closed rail or no workspace: `idle`, no request.
 * - LATE ANSWERS. A generation counter changes with the scope and on unmount; an answer from an older generation or an older read is
 *   dropped whatever it says. A body that does not answer THIS question (`eligibilityBatchAnswers`) is `unavailable`, never shown.
 * - NO POLLING, NO STORAGE. One read per scope. The only clock is one timeout armed at the session ceiling `valid_until_ms`: when it
 *   passes the rows are dropped and the rail says so. Nothing is refetched by itself; `retry()` is the user's.
 * - A READ IS NOT A GRANT. The view carries rows for the rail to word. Nothing here enables a control (see railEligibility.ts).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ExecutionApi } from "../../../../api/ports";
import type { AccessEnvironment } from "../../../readers/accessEffective";
import { selfProjectionExpiry, type EligibilityAction } from "../../../readers/accessSelf";
import { batchResult, eligibilityBatchAnswers, type BatchEligibilityRow } from "../../../readers/accessSelfBatch";
import { RAIL_ELIGIBILITY_ACTIONS, RAIL_IDLE_NO_WORKSPACE, type RailEligibilityView } from "./railEligibility";

export interface UseRailEligibilityOptions {
  /** The rail is open. Closed: idle, no request. */
  enabled: boolean;
  /** The workspace in the address; `null`: nothing is asked. */
  workspaceId: string | null;
  environment: AccessEnvironment;
  portfolioId: string;
  /** Test seam: UTC epoch ms. */
  now?: () => number;
}

type Slot =
  | { key: string; phase: "loading" }
  | { key: string; phase: "ready"; rows: ReadonlyMap<EligibilityAction, BatchEligibilityRow>; validUntilMs: number }
  | { key: string; phase: "denied" | "unavailable"; reason: string }
  | { key: string; phase: "expired"; reason: string };

/** `setTimeout` holds a signed 32-bit delay; a longer ceiling is waited out in slices of this size. */
const MAX_TIMEOUT_MS = 2_147_483_647;

const EXPIRED = "The eligibility read for your session ended and is no longer shown. Read it again to check.";

export function useRailEligibility(api: Pick<ExecutionApi, "getSelfEligibilityBatch">, options: UseRailEligibilityOptions): { view: RailEligibilityView; retry(): void } {
  const { enabled, workspaceId, environment, portfolioId } = options;
  const nowRef = useRef<() => number>(options.now ?? Date.now);
  nowRef.current = options.now ?? Date.now;
  const apiRef = useRef(api);
  apiRef.current = api;

  const scopeKey = enabled && workspaceId !== null && portfolioId !== "" ? `${workspaceId}\u0000${environment}\u0000${portfolioId}` : null;
  const [slot, setSlot] = useState<Slot | null>(null);
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);

  useEffect(() => {
    generation.current += 1;
    const mine = generation.current;
    if (scopeKey === null || workspaceId === null) {
      setSlot(null);
      return () => {
        generation.current += 1;
      };
    }
    setSlot({ key: scopeKey, phase: "loading" });
    const request = { workspaceId, environment, resources: [{ kind: "PORTFOLIO", id: portfolioId }], actions: RAIL_ELIGIBILITY_ACTIONS } as const;
    let timer: ReturnType<typeof setTimeout> | null = null;
    void apiRef.current
      .getSelfEligibilityBatch(request)
      .then((result) => {
        if (mine !== generation.current) return; // another scope, or the rail closed: this answer is not for the page any more
        if (!result.ok) {
          setSlot({ key: scopeKey, phase: result.status === "denied" ? "denied" : "unavailable", reason: result.reason });
          return;
        }
        const read = result.value;
        if (read.kind !== "eligibility_batch") {
          setSlot({ key: scopeKey, phase: "unavailable", reason: "The Portal answered the eligibility read in a shape this build does not read, so nothing is shown." });
          return;
        }
        if (!eligibilityBatchAnswers(read.batch, request)) {
          setSlot({ key: scopeKey, phase: "unavailable", reason: "The eligibility read answered another question than the one asked, so it is not shown." });
          return;
        }
        const expiry = selfProjectionExpiry(read.batch, nowRef.current());
        if (expiry.state === "expired") {
          setSlot({ key: scopeKey, phase: "expired", reason: EXPIRED });
          return;
        }
        const rows = new Map<EligibilityAction, BatchEligibilityRow>();
        for (const row of batchResult(read.batch, "PORTFOLIO", portfolioId)?.actions ?? []) rows.set(row.action, row);
        setSlot({ key: scopeKey, phase: "ready", rows, validUntilMs: read.batch.validUntilMs });
        // One timeout at the ceiling, in slices when the delay is longer than setTimeout can hold. When it fires the rows are dropped.
        const arm = (): void => {
          const left = read.batch.validUntilMs - nowRef.current();
          if (left <= 0) {
            if (mine === generation.current) setSlot({ key: scopeKey, phase: "expired", reason: EXPIRED });
            return;
          }
          timer = setTimeout(arm, Math.min(left, MAX_TIMEOUT_MS));
        };
        arm();
      })
      .catch(() => {
        if (mine === generation.current) setSlot({ key: scopeKey, phase: "unavailable", reason: "The eligibility read could not be completed." });
      });
    return () => {
      generation.current += 1; // leaving the scope or unmounting: nothing started here may land
      if (timer !== null) clearTimeout(timer);
    };
  }, [scopeKey, workspaceId, environment, portfolioId, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  // Derived during render: the first frame under a new scope is already empty, never the previous scope's rows.
  const view = useMemo<RailEligibilityView>(() => {
    if (scopeKey === null) return { phase: "idle", reason: workspaceId === null ? RAIL_IDLE_NO_WORKSPACE : "Not read." };
    if (slot === null || slot.key !== scopeKey || slot.phase === "loading") return { phase: "loading" };
    if (slot.phase === "ready") return { phase: "ready", rows: slot.rows };
    return { phase: slot.phase, reason: slot.reason };
  }, [scopeKey, workspaceId, slot]);

  return { view, retry };
}
