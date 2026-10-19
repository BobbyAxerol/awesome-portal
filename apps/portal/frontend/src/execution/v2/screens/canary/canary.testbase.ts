/**
 * Shared test inputs for the Canary suites. Not a fixture producer: it reads the
 * canonical bodies Codex published, byte for byte, and mutates copies in memory
 * (`testkit/loadCanonical`); nothing here is imported by product code.
 *
 * `populatedV1` is a FIXTURE_LAB body: the published V1 fixture is source-dark, so the
 * lit-up states (figures, a fresh broker, a trial day) are built in memory at the
 * reader's own vocabulary (`panel_state: "ok"`, `freshness_state: "OK"`), which is not the
 * schema's (`ready` / `FRESH`) and is why it is not asserted against the schema.
 * Suites say which lane they run in.
 */
import type { ExecutionApi, Result } from "../../../api/ports";
import { loadCanonical } from "../../testkit/loadCanonical";
import type { Draft } from "../../testkit/matrix";
import { readCanaryByVersion, type CanaryVersionRead } from "../../readers/dispatch";

export const V1_FILE = "execution-canary-control-room.unavailable";
export const PARENT_FILE = "execution-positive-parent.synthetic";
export const SCHEMA_V1 = "execution-canary-control-room.v1";
export const SCHEMA_V2 = "execution-operations.v1";

export const DEP = "dep_TEST_ONLY_canary";

export const v1Body = (): Draft => loadCanonical<Draft>(V1_FILE);
export const parentBody = (key: "canary" | "canary_absent" | "canary_revision" = "canary"): Draft => loadCanonical<Draft>(PARENT_FILE)[key];

const AS_OF = "2026-10-17T12:04:00.000Z";

function lit(envelope: Draft, state: string, freshness: string, verification = "VERIFIED"): void {
  envelope.panel_state = state;
  envelope.freshness_state = freshness;
  envelope.source_verification_state = verification;
  envelope.as_of = AS_OF;
  envelope.warnings = [];
}

/** The V1 body with figures, fresh panels and a trial day 6 of 14 (reader vocabulary). */
export function populatedV1(overrides: { brokerFreshness?: string; brokerState?: string } = {}): Draft {
  const body = v1Body();
  body.deployment.deployment_id = DEP;
  const values: Record<string, string> = {
    capital_consumed: "3820.00",
    gross_notional: "6120.40",
    daily_pnl: "-38.60",
    open_orders: "1",
    broker_equity: "5112.40",
  };
  for (const kpi of body.kpis) {
    kpi.value = values[kpi.key];
    lit(kpi.envelope, "ok", "OK");
  }
  for (const panel of body.source_panels) {
    if (panel.panel_id === "broker") lit(panel, overrides.brokerState ?? "ok", overrides.brokerFreshness ?? "OK");
    else lit(panel, "ok", "OK");
  }
  body.lifecycle.day_index = 6;
  body.lifecycle.duration_days = 14;
  return body;
}

/** A port holding only the canary read. `answer` is what `getCanaryVersioned` resolves; calls are recorded. */
export function canaryPort(answer: () => Promise<Result<CanaryVersionRead>>): ExecutionApi & { calls: { id: string; options: unknown }[] } {
  const calls: { id: string; options: unknown }[] = [];
  const port = {
    calls,
    async getCanaryVersioned(id: string, options?: unknown) {
      calls.push({ id, options });
      return answer();
    },
  };
  // A port fake: the screen calls this one method and nothing else.
  return port as unknown as ExecutionApi & { calls: { id: string; options: unknown }[] };
}

/** `getCanaryVersioned` as the HTTP port answers it for a raw body: through the dispatcher. */
export const answering = (raw: unknown): (() => Promise<Result<CanaryVersionRead>>) => async () => ({ ok: true, value: readCanaryByVersion(raw) });
export const refusing = (status: "denied" | "unavailable" | "stale" | "terminal", reason: string): (() => Promise<Result<CanaryVersionRead>>) => async () => ({ ok: false, status, reason });
