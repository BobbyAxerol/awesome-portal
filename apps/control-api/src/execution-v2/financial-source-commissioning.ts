/** Explicit private owner operation, NOT a startup hook or financial authority.
 * Uses the configured existing actor only. Construction performs no I/O and
 * preflight creates no session/grant/lease. Source ISSUE/terminal/recovery remain
 * owned by the existing candidate, composition and mutation coordinator.
 */
import type { Pool } from "pg";
import { performance } from "node:perf_hooks";
import { z } from "zod";
import { withTransaction } from "../db/pool";
import { AccessPolicyError } from "./access.contract";
import { CurrentHumanLeaseError } from "./current-human-candidate";
import { lockCurrentHumanSnapshot } from "./current-human-snapshot";
import { FinancialSourceAssertionError } from "./financial-source-assertion";
import { FinancialSourceCompositionError, type FinancialSourceComposition } from "./financial-source-composition";
import type { PreparedFinancialSourceRuntime } from "./financial-source-runtime";

type Code = "FINANCIAL_SOURCE_COMMISSIONING_CONFIG_INVALID" | "FINANCIAL_SOURCE_COMMISSIONING_BUSY" |
  "FINANCIAL_SOURCE_COMMISSIONING_EXPIRED" | "FINANCIAL_SOURCE_COMMISSIONING_CANCELLED" |
  "FINANCIAL_SOURCE_COMMISSIONING_DEADLINE_EXCEEDED" | "FINANCIAL_SOURCE_COMMISSIONING_FAILED";
export class FinancialSourceCommissioningError extends Error {
  constructor(readonly code: Code) { super("The private financial source operation is not available."); }
}
export interface FinancialSourceOwnerContext {
  /** Secret capability for the injected private-reference owner only. Never log. */
  readonly original_context: string;
  /** Actual registration expiry, distinct from this operation's earlier bound. */
  readonly registration_expires_at_ms: number;
  readonly expires_at_ms: number;
  readonly signal: AbortSignal;
}
export interface FinancialSourceOwnerOptions { deadline_ms: number; signal?: AbortSignal; }
const text = z.string().min(1).max(256).refine(value => value === value.trim() &&
  !/[\u0000-\u0020\u007f-\u009f]/u.test(value));
const integer = z.number().int().nonnegative().safe();
const pinsSchema = z.object({
  actor: z.object({ user_id: text, session_id: text, session_generation: integer }).strict(),
  workspace: text, principal: z.object({ user_id: text, workspace_id: text }).strict(),
  installation: z.object({ workspace_id: text, environment: z.literal("paper"), valid_until_ms: integer.positive() }).strict(),
  selection: z.object({ workspace_id: text, environment: z.literal("paper") }).strict(),
  context_ttl_ms: integer.positive().max(300_000),
}).strict();
const failure = (code: Code) => new FinancialSourceCommissioningError(code);
function safeFailure(error: unknown): Error {
  if (error instanceof FinancialSourceCommissioningError || error instanceof AccessPolicyError ||
    error instanceof CurrentHumanLeaseError || error instanceof FinancialSourceAssertionError ||
    error instanceof FinancialSourceCompositionError) return error;
  // Driver, file-owner and DB errors can contain private paths/credentials.
  return failure("FINANCIAL_SOURCE_COMMISSIONING_FAILED");
}

/** Owner calls this only AFTER the already prepared composition has started.
 * It does not start/stop listeners, recover originals, acknowledge a source,
 * clean SQL rows, change identity or claim that a private context is a grant.
 * `use` owns private export/removal and must join its actual worker on abort.
 * An uncooperative callback stays pending and BUSY, never a fake joined result.
 */
export function createFinancialSourceOwnerCommissioning(pool: Pool, runtime: PreparedFinancialSourceRuntime,
  composition: Pick<FinancialSourceComposition, "withPrincipal">) {
  let pins: z.infer<typeof pinsSchema>;
  try {
    pins = pinsSchema.parse({ actor: runtime.actor, workspace: runtime.schemaTarget.workspace_id,
      principal: runtime.schemaTarget.principal_workspace_pins[0],
      installation: runtime.config.candidate.installation_scope,
      selection: { workspace_id: runtime.config.source_selection.workspace_id,
        environment: runtime.config.source_selection.environment }, context_ttl_ms: runtime.config.assertion_limits.ttl_ms });
    if (pins.workspace !== pins.installation.workspace_id || pins.workspace !== pins.selection.workspace_id ||
      pins.workspace !== pins.principal.workspace_id || pins.actor.user_id !== pins.principal.user_id ||
      typeof composition?.withPrincipal !== "function") throw failure("FINANCIAL_SOURCE_COMMISSIONING_CONFIG_INVALID");
  } catch { throw failure("FINANCIAL_SOURCE_COMMISSIONING_CONFIG_INVALID"); }
  Object.freeze(pins.actor);
  let busy = false;
  return Object.freeze({
    async withOwnerContext<T>(use: (context: FinancialSourceOwnerContext) => T | Promise<T>,
      options: FinancialSourceOwnerOptions): Promise<T> {
      let duration: number, external: AbortSignal | undefined;
      try {
        duration = z.number().int().min(1).max(300_000).parse(options.deadline_ms);
        external = options.signal;
        if (typeof use !== "function" || external !== undefined && !(external instanceof AbortSignal))
          throw failure("FINANCIAL_SOURCE_COMMISSIONING_CONFIG_INVALID");
      } catch { throw failure("FINANCIAL_SOURCE_COMMISSIONING_CONFIG_INVALID"); }
      if (external?.aborted) throw failure("FINANCIAL_SOURCE_COMMISSIONING_CANCELLED");
      const started = Date.now();
      if (started >= pins.installation.valid_until_ms) throw failure("FINANCIAL_SOURCE_COMMISSIONING_EXPIRED");
      if (busy) throw failure("FINANCIAL_SOURCE_COMMISSIONING_BUSY");
      busy = true;
      // Re-arming after DB/registration must never give time back if the UTC
      // clock steps backwards. Absolute source/session timestamps still apply
      // independently; this monotonic ceiling only bounds our own duration.
      const monotonicUntil = performance.now() + duration;
      const controller = new AbortController();
      let cancelled: FinancialSourceCommissioningError | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let until = Math.min(started + duration, pins.installation.valid_until_ms);
      const cancel = (code: Code) => {
        if (!cancelled) { cancelled = failure(code); controller.abort(cancelled); }
      };
      const externalAbort = () => cancel("FINANCIAL_SOURCE_COMMISSIONING_CANCELLED");
      const assertActive = () => {
        if (cancelled) throw cancelled;
        if (Date.now() >= until || performance.now() >= monotonicUntil) {
          cancel("FINANCIAL_SOURCE_COMMISSIONING_DEADLINE_EXCEEDED");
          throw cancelled;
        }
      };
      const arm = () => {
        if (timer !== undefined) clearTimeout(timer);
        timer = setTimeout(() => cancel("FINANCIAL_SOURCE_COMMISSIONING_DEADLINE_EXCEEDED"),
          Math.max(0, Math.min(until - Date.now(), monotonicUntil - performance.now())));
      };
      try {
        external?.addEventListener("abort", externalAbort, { once: true });
        if (external?.aborted) externalAbort();
        assertActive(); arm();
        const current = await withTransaction(pool, async db => {
          // Explicitly prevent a reused connection's default isolation from
          // turning this short authority fence into a retained RR snapshot.
          await db.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED READ WRITE");
          assertActive();
          const snapshot = await lockCurrentHumanSnapshot(db, { ...pins.actor }, pins.workspace);
          // The existing helper holds authority but does not inspect its drain.
          // A current session alone is not permission to open another context
          // while a mutation/revoke owns that same global admission fence.
          const authority = await db.query<{ drain_id: string | null }>(
            "SELECT drain_id FROM elp210_candidate.authority WHERE singleton FOR UPDATE");
          if (authority.rowCount !== 1) throw new CurrentHumanLeaseError("CURRENT_HUMAN_CANDIDATE_NOT_INSTALLED");
          if (authority.rows[0]!.drain_id !== null) throw new CurrentHumanLeaseError("CURRENT_HUMAN_DRAINING");
          return snapshot;
        });
        // withTransaction has already COMMITted and released its client here.
        if (!Number.isSafeInteger(current.lease_until_ms) || current.lease_until_ms < 0)
          throw failure("FINANCIAL_SOURCE_COMMISSIONING_FAILED");
        until = Math.min(until, current.lease_until_ms);
        assertActive(); arm();
        const result = await composition.withPrincipal({ ...pins.actor }, async (originalContext, registration) => {
          if (!Number.isSafeInteger(registration.expires_at_ms) || registration.expires_at_ms <= 0 ||
            registration.expires_at_ms > Date.now() + pins.context_ttl_ms)
            throw failure("FINANCIAL_SOURCE_COMMISSIONING_CONFIG_INVALID");
          until = Math.min(until, registration.expires_at_ms);
          assertActive(); arm();
          return use(Object.freeze({ original_context: originalContext,
            registration_expires_at_ms: registration.expires_at_ms,
            expires_at_ms: Math.min(until, Date.now() + Math.ceil(Math.max(0, monotonicUntil - performance.now()))),
            signal: controller.signal }));
        }, { signal: controller.signal });
        assertActive();
        return result;
      } catch (error) { throw cancelled ?? safeFailure(error); }
      finally {
        if (timer !== undefined) clearTimeout(timer);
        external?.removeEventListener("abort", externalAbort);
        busy = false;
      }
    },
  });
}
