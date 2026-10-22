/**
 * The one eligibility question the Access screen can ask without a resource id on the page: "may I send capital commands at the
 * ROOT?" (DEBT-UXM07-051, FE-015/068).
 *
 * `portal.self-eligibility-batch.v2` is asked per resource. Access has no portfolio or deployment, but the caller's own grants can
 * name a root (`ROOT_SCOPE`, `root_id`), and the eight capital actions that accept the kind ROOT can be asked about it. That is all
 * this read answers: a root-level grant. A portfolio-level capital delegate gets "no root-level grant" here and is answered on the
 * portfolio's own Actions rail. The 20 other actions need a PORTFOLIO, DEPLOYMENT, ACCOUNT, ALPHA or BINDING id this page does not
 * have, so they are not asked.
 *
 * Same rules as the rail's hook (portfolios/portfolio/useRailEligibility.ts), each with a test: asked only when it can be answered
 * (workspace, root id, port), a late answer from an older scope is dropped, an answer to another question is not shown, one timeout
 * at the session ceiling drops the rows, nothing polls or stores. A read is advice, never a grant.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ExecutionApi } from "../../../api/ports";
import type { AccessEnvironment } from "../../readers/accessEffective";
import { ELIGIBILITY_ACTIONS, ELIGIBILITY_ACTION_KINDS, selfProjectionExpiry, type EligibilityAction } from "../../readers/accessSelf";
import { batchResult, eligibilityBatchAnswers, type BatchEligibilityRow } from "../../readers/accessSelfBatch";

/** The capital actions whose target rules accept a ROOT resource, in the vocabulary's order. */
export const ROOT_CAPITAL_ACTIONS: readonly EligibilityAction[] = ELIGIBILITY_ACTIONS.filter(
  (action) => action.startsWith("capital.") && (ELIGIBILITY_ACTION_KINDS[action] as readonly string[]).includes("ROOT"),
);

export type CapitalEligibilityView =
  | { phase: "idle"; reason: string }
  | { phase: "loading" }
  | { phase: "ready"; rows: readonly BatchEligibilityRow[] }
  | { phase: "denied" | "unavailable" | "expired"; reason: string };

export const IDLE_NO_PORT = "This page was opened without the eligibility read, so capital commands were not asked about.";
export const IDLE_NO_WORKSPACE = "No workspace is named for this page, so capital commands were not asked about.";
export const IDLE_NO_ROOT = "None of your grants names a root, so there is no root to ask about. Portfolio-level capital is answered on each portfolio.";
const EXPIRED = "The eligibility read for your session ended and is no longer shown. Read it again to check.";
const MAX_TIMEOUT_MS = 2_147_483_647;

export interface UseRootCapitalEligibilityOptions {
  api: Pick<ExecutionApi, "getSelfEligibilityBatch"> | undefined;
  workspaceId: string | null;
  environment: AccessEnvironment;
  /** The root the caller's own grants name, or null when none does. */
  rootId: string | null;
  now?: () => number;
}

type Slot =
  | { key: string; phase: "loading" }
  | { key: string; phase: "ready"; rows: readonly BatchEligibilityRow[] }
  | { key: string; phase: "denied" | "unavailable" | "expired"; reason: string };

export function useRootCapitalEligibility(options: UseRootCapitalEligibilityOptions): { view: CapitalEligibilityView; retry(): void } {
  const { api, workspaceId, environment, rootId } = options;
  const nowRef = useRef<() => number>(options.now ?? Date.now);
  nowRef.current = options.now ?? Date.now;
  const apiRef = useRef(api);
  apiRef.current = api;

  const scopeKey = api !== undefined && workspaceId !== null && rootId !== null ? `${workspaceId}\u0000${environment}\u0000${rootId}` : null;
  const [slot, setSlot] = useState<Slot | null>(null);
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);

  useEffect(() => {
    generation.current += 1;
    const mine = generation.current;
    const port = apiRef.current;
    if (scopeKey === null || workspaceId === null || rootId === null || port === undefined) {
      setSlot(null);
      return () => {
        generation.current += 1;
      };
    }
    setSlot({ key: scopeKey, phase: "loading" });
    const request = { workspaceId, environment, resources: [{ kind: "ROOT", id: rootId }], actions: ROOT_CAPITAL_ACTIONS } as const;
    let timer: ReturnType<typeof setTimeout> | null = null;
    void Promise.resolve(port.getSelfEligibilityBatch(request))
      .then((result) => {
        if (mine !== generation.current) return;
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
        if (selfProjectionExpiry(read.batch, nowRef.current()).state === "expired") {
          setSlot({ key: scopeKey, phase: "expired", reason: EXPIRED });
          return;
        }
        setSlot({ key: scopeKey, phase: "ready", rows: batchResult(read.batch, "ROOT", rootId)?.actions ?? [] });
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
      generation.current += 1;
      if (timer !== null) clearTimeout(timer);
    };
  }, [scopeKey, workspaceId, environment, rootId, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const view = useMemo<CapitalEligibilityView>(() => {
    if (scopeKey === null) {
      return { phase: "idle", reason: api === undefined ? IDLE_NO_PORT : workspaceId === null ? IDLE_NO_WORKSPACE : IDLE_NO_ROOT };
    }
    if (slot === null || slot.key !== scopeKey || slot.phase === "loading") return { phase: "loading" };
    if (slot.phase === "ready") return { phase: "ready", rows: slot.rows };
    return { phase: slot.phase, reason: slot.reason };
  }, [scopeKey, api, workspaceId, slot]);

  return { view, retry };
}
