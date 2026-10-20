/**
 * Shared test inputs for the Canary suites. Not a fixture producer: it reads the
 * canonical bodies Codex published, byte for byte, and mutates copies in memory
 * (`testkit/loadCanonical`); nothing here is imported by product code.
 *
 * `populatedV1` is a FIXTURE_LAB body: the published V1 fixture is source-dark, so the
 * lit-up states (figures, a fresh broker, a trial day) are built in memory with the
 * schema's own words (`panel_state: "ready"`, `freshness_state: "FRESH"`) but with values the V1 schema pins
 * dark (a trial day, KPI figures), which is why the whole body is not asserted against the schema.
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

/**
 * The V1 body as a producer from BEFORE BE-P2/P3 wrote it: the additive members (stage facts, identity keys, compliance rows
 * and verdict, rollback items, trial, typed rows, source figures, series members) removed. The suites that pin the earlier
 * behaviour (legacy rollback, legacy compliance figures, free rows) build on this; the BE-P2/P3 members have their own
 * suites (`canary.facts.test.tsx`) and the L0 conformance reads the canonical body with all of them.
 */
export function legacyV1Body(): Draft {
  const body = v1Body();
  delete body.stage_facts;
  delete body.source_figures;
  for (const key of ["alpha_id", "alpha_name", "portfolio_name", "alpha_reason_code", "portfolio_name_reason_code"]) delete body.deployment[key];
  delete body.envelope_compliance.rows;
  delete body.envelope_compliance.verdict;
  delete body.rollback_readiness.items;
  delete body.lifecycle.trial;
  delete body.positions.typed;
  delete body.blotter.typed;
  return body;
}
export const parentBody = (key: "canary" | "canary_absent" | "canary_revision" = "canary"): Draft => loadCanonical<Draft>(PARENT_FILE)[key];

const AS_OF = "2026-10-17T12:04:00.000Z";

/** Lights a source envelope in memory with the schema's own words (`ready` / `FRESH`), a clock and no warning. */
export function lit(envelope: Draft, state: string, freshness: string, verification = "VERIFIED"): void {
  envelope.panel_state = state;
  envelope.freshness_state = freshness;
  envelope.source_verification_state = verification;
  envelope.as_of = AS_OF;
  envelope.warnings = [];
}

/** The V1 body with figures, fresh panels and a trial day 6 of 14 (reader vocabulary). */
export function populatedV1(overrides: { brokerFreshness?: string; brokerState?: string } = {}): Draft {
  const body = legacyV1Body();
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
    lit(kpi.envelope, "ready", "FRESH");
  }
  for (const panel of body.source_panels) {
    if (panel.panel_id === "broker") lit(panel, overrides.brokerState ?? "ready", overrides.brokerFreshness ?? "FRESH");
    else lit(panel, "ready", "FRESH");
  }
  body.lifecycle.day_index = 6;
  body.lifecycle.duration_days = 14;
  return body;
}

/**
 * A populated body that also carries rows, compliance figures and a ready rollback (FIXTURE_LAB: the V1 schema pins
 * all of these dark, and the row members are the test's own, since the contract does not name them).
 */
export function populatedWithFacts(): Draft {
  const body = populatedV1();
  lit(body.positions.envelope, "ready", "FRESH");
  body.positions.exact_total = 2;
  body.positions.returned_count = 2;
  body.positions.rows = [
    { symbol: "BTCUSDT", side: "LONG", qty: "0.0120", entry_price: "64000.10", hedged: false, note: null },
    { symbol: "ETHUSDT", side: "SHORT", qty: "1.5000", entry_price: "3412.50", hedged: true },
  ];
  lit(body.blotter.envelope, "ready", "FRESH");
  body.blotter.exact_total = 1;
  body.blotter.returned_count = 1;
  body.blotter.rows = [{ order_id: "o-1", price: "63990.00", type: "LIMIT" }];
  lit(body.envelope_compliance.envelope, "ready", "FRESH");
  body.envelope_compliance.consumed = { capital_cap: "3820.00", max_open_orders: "1", fees_paid: "4.25" };
  body.envelope_compliance.headroom = { capital_cap: "1180.00" };
  lit(body.rollback_readiness.envelope, "ready", "FRESH");
  body.rollback_readiness.ready = true;
  body.rollback_readiness.blocker_codes = [];
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
