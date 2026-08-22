/**
 * Account / Broker 360° fixtures (hi-fi 1g, CAST).
 *
 * Typed props, because most of this screen has no published contract yet: the
 * exposure buckets do (`EX-BE-07b`), the three-column comparison, the linked
 * accounts and the aggregate verdict do not. See BR-EX-26.
 *
 * Every figure is a literal. The aggregate in particular is *given*, not
 * derived from the linked rows below it — that is the whole point of the
 * screen's rule, and a fixture that summed the rows would quietly teach the
 * tests that summing is acceptable.
 */
import type {
  AccountBroker360Props,
  AggregateHeadroom,
  LinkedAccount,
  StateColumn,
  SyncRow,
} from "./screens/AccountBroker360";
import { EXPOSURE_PARTIAL } from "./analytics.fixtures";
import { readBindingExposure } from "./analytics";

/**
 * Exposure consistent with the three linked accounts the hi-fi draws.
 *
 * The first draft reused `EXPOSURE_COMPLETE` from the analytics fixtures, which
 * reports 24 accounts — and the cap notice correctly announced "showing 3 of
 * 24". The fixture was wrong, not the notice: a screen listing three of a
 * binding's twenty-four accounts should say so, and this one was not meant to
 * be that case. `PARTIAL_EXPOSURE` is where that case is tested.
 */
const EXPOSURE_FOR_THREE = {
  analytics: {
    data: {
      binding_id: "bnd-binance_main_01",
      account_count: 3,
      expected_account_count: 3,
      population_completeness: "COMPLETE",
      buckets: [
        {
          currency: "USDT",
          account_count: 3,
          used: "41000.00",
          reserved: "2020.00",
          available: "2120.00",
          headroom: "2120.00",
          oldest_source_as_of: "2026-08-22T10:40:00Z",
          newest_source_as_of: "2026-08-22T10:42:01Z",
        },
      ],
    },
  },
};

const INTERNAL: StateColumn = {
  positions: "2",
  openOrders: "1",
  headline: { label: "equity", value: "61,204.00", currency: "USDT" },
  extra: [
    { label: "cash free", value: "44,180.00" },
    { label: "locked / reserved", value: "2,020.00" },
  ],
  envelope: { authority: "EXECUTION", asOf: "2026-08-22T10:42:01Z", freshness: "OK" },
};

const BROKER: StateColumn = {
  positions: "2",
  openOrders: "1",
  headline: { label: "balance", value: "61,390.00", currency: "USDT" },
  envelope: { authority: "BROKER", asOf: "2026-08-22T10:42:00Z", freshness: "OK" },
  digest: "4f2a91…7c",
};

const LINKED: LinkedAccount[] = [
  {
    accountId: "acct-live-grid-v21",
    alpha: "Grid v2.1",
    virtualExposure: "18,400.00",
    stage: "LIVE_FULL",
    current: true,
  },
  {
    accountId: "acct-live-carry-v32",
    alpha: "Carry v3.2",
    virtualExposure: "14,900.00",
    stage: "LIVE_FULL",
  },
  {
    accountId: "acct-canary-mm-v11",
    alpha: "MM v1.1",
    virtualExposure: "7,700.00",
    stage: "LIVE_CANARY",
  },
];

const SYNC: SyncRow[] = [
  { at: "10:42:01", source: "ws stream", status: "OK", digest: "4f2a91…7c" },
  { at: "10:40:00", source: "REST snapshot", status: "OK", digest: "2e9c44…1a" },
  // The hi-fi's stale row. Kept, because a sync history with only successes is
  // not a history, it is an advertisement.
  { at: "10:35:00", source: "REST snapshot", status: "STALE", detail: "6.2s", digest: "9b1f02…dd" },
];

/** Within headroom. `Σ virtual 41,000.00 vs physical 43,120.00 → +2,120.00`. */
export const HEADROOM_OK: AggregateHeadroom = {
  virtualTotal: "41,000.00",
  physicalTotal: "43,120.00",
  headroom: "+2,120.00",
  currency: "USDT",
  verdict: "OK",
  envelope: {
    authority: "DERIVED",
    asOf: "2026-08-22T10:42:01Z",
    freshness: "OK",
    formulaVersion: "headroom.v1",
  },
};

/** Breached. Every linked account fails closed until this clears. */
export const HEADROOM_EXCEEDED: AggregateHeadroom = {
  ...HEADROOM_OK,
  virtualTotal: "46,800.00",
  headroom: "−3,680.00",
  verdict: "EXCEEDED",
};

/** The population could not be completed, so neither verdict can be made. */
export const HEADROOM_UNKNOWN: AggregateHeadroom = {
  ...HEADROOM_OK,
  verdict: "UNKNOWN",
  envelope: { ...HEADROOM_OK.envelope, freshness: "STALE" },
};

export function account360(over: Partial<AccountBroker360Props> = {}): AccountBroker360Props {
  return {
    accountId: "acct-live-grid-v21",
    alpha: "Grid v2.1",
    deployment: "dep_88",
    portfolio: "PF-CRYPTO",
    stage: "LIVE_FULL",
    venue: "BINANCE",
    marginMode: "MARGIN / CROSS",
    settleCurrency: "USDT",
    accountRevision: "account rev 14",
    internal: INTERNAL,
    broker: BROKER,
    difference: {
      envelope: {
        authority: "DERIVED",
        asOf: "2026-08-22T10:42:01Z",
        freshness: "OK",
        formulaVersion: "diff.v1",
      },
      rows: [
        { label: "positions", verdict: "MATCH" },
        { label: "open orders", verdict: "MATCH" },
        {
          label: "balance",
          verdict: "DIFFERS",
          delta: "186.00",
          note: "funding accrual pending",
          severity: "INFO",
        },
      ],
    },
    externalAccountRef: "binance_main_01",
    credentialAlias: "BIN-01",
    credentialValid: true,
    positionMode: "NET",
    linked: LINKED,
    aggregate: HEADROOM_OK,
    exposure: readBindingExposure(EXPOSURE_FOR_THREE),
    syncPolicy: "BINANCE live 5s · ws + 5m snapshot",
    syncHistory: SYNC,
    openFindings: 0,
    lastDryRun: { verdict: "clean", at: "12:01Z", id: "rec_902" },
    resolvedFindings: 3,
    operatorAdmin: false,
    ...over,
  };
}

/** 21 of 24 accounts reported. An OK verdict here is an OK about most of it. */
export const PARTIAL_EXPOSURE = readBindingExposure(EXPOSURE_PARTIAL);
