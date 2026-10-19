/**
 * Shared test helpers for the Live operations suites (model.test.ts, live.test.tsx). Not imported by
 * product code.
 *
 * Lanes (rules 9.8.3): the V2 bodies are the published synthetic canonical `execution-live-source.synthetic`
 * verbatim or derived from it by structure (more records, cursors); the V1 bodies start from the published
 * `execution-live-full-operations.unavailable` and `populatedV1` fills the dark sources at the VIEW-MODEL
 * level (FIXTURE_LAB): the V1 schema pins dark constants, so a populated V1 body is not wire-valid and no
 * test here calls it real-API evidence.
 */
import type { ExecutionApi, Result } from "../../../api/ports";
import { readLiveFullOperations, type LiveFullOperations } from "../../../liveFull";
import type { LiveFullVersionRead, LiveFullVersionedOptions } from "../../readers/dispatch";
import { LIVE_SOURCE_V2_SCHEMA, readLiveSourceOperationsV2, type LiveSourceOperationsV2 } from "../../readers/liveSourceOperations";
import { loadCanonical } from "../../testkit/loadCanonical";
import { setPath, type Draft } from "../../testkit/matrix";

export const V1_FILE = "execution-live-full-operations.unavailable";
export const V2_FILE = "execution-live-source.synthetic";

export const v1Raw = (): Draft => loadCanonical<Draft>(V1_FILE);
export const v2Canonical = (): { populated: Draft; unpublished: Draft } => loadCanonical<Draft>(V2_FILE);
export const v2Populated = (): Draft => v2Canonical().populated;
export const v2Unpublished = (): Draft => v2Canonical().unpublished;

export const DEPLOYMENT_ID = "dep_TEST_ONLY_live";
export const SOURCE_AS_OF = "2026-10-17T12:04:00.000Z";

export interface PopulatedV1 {
  state: "UNAVAILABLE" | "MISMATCH" | "IN_SYNC";
  visible: boolean;
  gap: boolean | null;
  /** The reader's word for the freshness; the wire says `FRESH` for `OK` (see `wireFreshness`). */
  freshness: "OK" | "AGING" | "STALE" | "UNKNOWN";
  sourceBacked: boolean;
  stage: string;
  brokerEquity: string | null;
  runtimeState: string | null;
}

export const POPULATED_DEFAULTS: PopulatedV1 = {
  state: "IN_SYNC", visible: true, gap: false, freshness: "OK", sourceBacked: true, stage: "LIVE_FULL", brokerEquity: "60118.40", runtimeState: null,
};

/** The published `freshness_state` word for a reader freshness: the schema says FRESH where the reader says OK. */
export const wireFreshness = (freshness: PopulatedV1["freshness"]): string => (freshness === "OK" ? "FRESH" : freshness);

const BROKER_EQUITY_FIGURE = "60118.40";
export const BROKER_FIGURE = BROKER_EQUITY_FIGURE;

/** The unavailable canonical with its dark sources filled (KPIs, three source panels, verdict, continuity). View-model lane. */
export function populatedV1(over: Partial<PopulatedV1> = {}): Draft {
  const o = { ...POPULATED_DEFAULTS, ...over };
  const raw = v1Raw();
  const panel = (id: string, authority: string, state: string): Draft => ({
    panel_id: id, source_authority: authority, panel_state: state, freshness_state: wireFreshness(o.freshness), delivery_profile: "LIVE_BINANCE_USDM",
    source_verification_state: "VERIFIED", as_of: SOURCE_AS_OF, read_at: SOURCE_AS_OF, age_seconds: null, lag_ms: null, source_cursor: null,
    projection_epoch: null, projection_sequence: null, capability_snapshot_id: null, data: null, warnings: [],
  });
  raw.source_integration_state = o.sourceBacked ? "SOURCE_BACKED" : "UNAVAILABLE";
  raw.delivery_profile = "LIVE_BINANCE_USDM";
  setPath(raw, ["deployment", "deployment_id"], DEPLOYMENT_ID);
  setPath(raw, ["lifecycle", "declared_stage"], o.stage);
  setPath(raw, ["lifecycle", "runtime_state"], o.runtimeState);
  const values: Record<string, string | null> = { capital: "60000.00", gross_notional: "41080.00", daily_pnl: "-240.00", open_orders: "2", broker_equity: o.brokerEquity };
  raw.kpis = raw.kpis.map((k: Draft) => ({
    ...k, value: values[k.key] ?? null, envelope: panel(`kpi-${k.key}`, k.envelope.source_authority, "ready"),
  }));
  raw.source_panels = {
    internal: panel("internal", "EXECUTION", "ready"),
    broker: panel("broker", "BROKER", o.visible ? "ready" : o.state === "MISMATCH" ? "suppressed" : "unavailable"),
    difference: panel("difference", "DERIVED", o.visible ? "ready" : o.state === "MISMATCH" ? "suppressed" : "unavailable"),
  };
  raw.broker_consistency = { ...raw.broker_consistency, state: o.state, broker_values_visible: o.visible, finding_href: o.state === "MISMATCH" ? "/execution/operations/inc_TEST_ONLY_1" : null, blocker_codes: [] };
  raw.projection_continuity = {
    state: o.gap === true ? "GAP" : o.gap === false ? "CONTIGUOUS" : "UNAVAILABLE", epoch: "41", cursor: null, sequence: 88240, gap_detected: o.gap,
    affected_authorities: o.gap === true ? ["BROKER", "DERIVED"] : [], blocker_codes: [],
  };
  return raw;
}

/**
 * The V1 body with rows in `positions` and `orders` (FIXTURE_LAB: the V1 schema pins both dark, and the member names are the
 * test's own because the contract does not name them). `authority` is the collection envelope's `source_authority`.
 */
export function withV1Rows(raw: Draft, authority: "EXECUTION" | "BROKER" = "EXECUTION", state = "ready"): Draft {
  const out = structuredClone(raw);
  const envelope = (id: string): Draft => ({
    panel_id: id, source_authority: authority, panel_state: state, freshness_state: "FRESH", delivery_profile: "LIVE_BINANCE_USDM",
    source_verification_state: "VERIFIED", as_of: SOURCE_AS_OF, read_at: SOURCE_AS_OF, age_seconds: null, lag_ms: null, source_cursor: null,
    projection_epoch: null, projection_sequence: null, capability_snapshot_id: null, data: { page: "first" }, warnings: [],
  });
  out.positions = {
    envelope: envelope("positions"), exact_total: 2, returned_count: 2, next_cursor: null, previous_cursor: null,
    rows: [
      { instrument: "BTCUSDT", side: "LONG", qty: "0.0120", entry_px: "64000.10", reduce_only: false },
      { instrument: "ETHUSDT", side: "SHORT", qty: "1.5000", entry_px: "3412.50", reduce_only: true },
    ],
  };
  out.orders = {
    envelope: envelope("orders"), exact_total: 1, returned_count: 1, next_cursor: null, previous_cursor: null,
    rows: [{ order_id: "o-1", instrument: "BTCUSDT", price: "63990.00", state: "NEW" }],
  };
  return out;
}

export const v1Of = (raw: unknown): LiveFullOperations => {
  const live = readLiveFullOperations(raw);
  if (live === null) throw new Error("the V1 body did not read");
  return live;
};
export const v1Read = (raw: unknown): LiveFullVersionRead => ({ kind: "v1", schemaVersion: "execution.live-full-operations.v1", value: v1Of(raw) });

export const v2Of = (raw: unknown): LiveSourceOperationsV2 => {
  const live = readLiveSourceOperationsV2(raw);
  if (live === null) throw new Error("the V2 body did not read");
  return live;
};
export const v2Read = (raw: unknown): LiveFullVersionRead => ({ kind: "v2", schemaVersion: LIVE_SOURCE_V2_SCHEMA, value: v2Of(raw) });

/** The V2 body with `count` retained records in one panel: ids, the page's cursor and `has_more` set together. */
export function withRecords(raw: Draft, name: string, count: number, next: string | null, start = 0): Draft {
  const out = structuredClone(raw);
  const template = structuredClone(out.data[name].records[0] ?? out.data.orders.records[0]);
  out.data[name].state = "PARTIAL";
  out.data[name].reason_code = "AUTHORIZED_RETAINED_OBSERVATIONS_ONLY";
  out.data[name].records = Array.from({ length: count }, (_, i) => {
    const record = structuredClone(template);
    record.observation_id = `por1_${(start + i + 1).toString(16).padStart(64, "0")}`;
    return record;
  });
  out.data[name].returned_count = count;
  out.data[name].has_more = next !== null;
  out.data[name].next_cursor = next;
  return out;
}

export const cursorFor = (name: string, n = 1): string => `lps2.${name}.${String(n).padStart(8, "0").slice(-8)}.1234567890.${"A".repeat(43)}`;

export type Handler = (deploymentId: string, options: LiveFullVersionedOptions | undefined) => Promise<Result<LiveFullVersionRead>> | Result<LiveFullVersionRead>;

/** A port that answers only the Live read, through `handler`, and records every call. */
export function fakeApi(handler: Handler): { api: ExecutionApi; calls: { deploymentId: string; options: LiveFullVersionedOptions | undefined }[] } {
  const calls: { deploymentId: string; options: LiveFullVersionedOptions | undefined }[] = [];
  const api = {
    getLiveFullVersioned: async (deploymentId: string, options?: LiveFullVersionedOptions) => {
      calls.push({ deploymentId, options });
      return handler(deploymentId, options);
    },
  } as unknown as ExecutionApi;
  return { api, calls };
}

export const ok = (read: LiveFullVersionRead): Result<LiveFullVersionRead> => ({ ok: true, value: read });
export const refused = (status: "denied" | "unavailable" | "stale" | "terminal" | "empty", reason: string): Result<LiveFullVersionRead> => ({ ok: false, status, reason });
