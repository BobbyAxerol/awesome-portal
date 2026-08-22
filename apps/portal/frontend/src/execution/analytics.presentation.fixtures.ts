/**
 * Analytics PRESENTATION and SCALE fixtures — not backend examples.
 *
 * The name carries the distinction because the distinction was invisible while
 * it was `analytics.fixtures.ts`, and C-PI04-06 turns on it. The canonical
 * backend documents are the six files in `packages/contracts/fixtures`, loaded
 * directly by `contractFixtures.test.ts`; nothing in here is authority for what
 * the server sends.
 *
 * What these are for is the other half: rendering at a scale and in states the
 * canonical examples do not reach — a funnel bounded at 4,180 events, a
 * correlation matrix at the packed limit, a batch with mixed errors. Deleting
 * them in favour of the contract fixtures would leave every degradation path
 * untested, because the canonical documents are deliberately small.
 *
 * Shaped to the published schema, including the two-layer envelope: screen
 * metadata on the outside, `analytics` (the computation) around `data` (the
 * figures). The first draft of these guessed a flat `data.lines[]` and nine
 * field names; the schema landed and the fixtures moved. No screen moved.
 *
 * Every money value is a **literal**, decided here exactly once, because these
 * stand in for the engine. If they held raw inputs and the screens derived the
 * rest, the screens would learn to derive — and that habit would survive the
 * swap to the real endpoint, which is the outcome the whole rule exists to stop.
 *
 * `source_profile` is `fixture` throughout. Nothing here marks an endpoint live.
 */
import { CORRELATION_PACK_LIMIT, packedLength } from "./analytics";

/** The outer envelope, shared by every response below. */
function envelope(over: Record<string, unknown> = {}) {
  return {
    schema_version: "execution.analytics.screen.v1",
    epoch_id: "018f0d5e-7b61-7a00-8000-000000000001",
    source_snapshot_id: "018f0d5e-7b61-7a00-8000-000000000002",
    capability_snapshot_id: "cap_fixture_v1",
    source_profile: "fixture",
    projection_sequence: 42,
    freshness_policy_version: "paper.analytics.v1",
    read_at: "2026-08-22T10:00:00Z",
    ...over,
  };
}

/** The computation layer. `panel_state` and the freshness floor live here. */
function derived(formulaVersion: string, over: Record<string, unknown> = {}) {
  return {
    schema_version: "execution.analytics.v1",
    formula_version: formulaVersion,
    source_authority: "DERIVED",
    input_freshness_floor: "OK",
    panel_state: "ok",
    input_completeness: "COMPLETE",
    input_as_of: "2026-08-22T09:59:59Z",
    warnings: [],
    ...over,
  };
}

function screen(formulaVersion: string, data: unknown, over: Record<string, unknown> = {}) {
  return { ...envelope(), analytics: { ...derived(formulaVersion, over), data } };
}

/* -------------------------------------------------------------------------
 * Gate R2 — capital preview
 * ---------------------------------------------------------------------- */

/**
 * The healthy case, decidable.
 *
 * The digits are deliberate. `"50.000000000000000001"` is from the published
 * fixture and survives here for the same reason it exists there: it is the
 * value a `double` quietly rounds, so anything that passes it through as a
 * number fails visibly rather than by a rounding nobody notices.
 */
const CAPITAL_OK_DATA = {
  portfolio_id: "PF-1",
  currency: "USDT",
  requested_amount: "50.000000000000000001",
  allocated_before: "500",
  allocated_after: "550.000000000000000001",
  maximum_allocated: "1000",
  used: "100",
  reserved: "25",
  available_before: "375",
  available_after: "425.000000000000000001",
  allocation_headroom_before: "500",
  allocation_headroom_after: "449.999999999999999999",
  decision_eligible: true,
  blockers: [],
} as const;

export const CAPITAL_PREVIEW_OK = screen("capital-preview.v1", CAPITAL_OK_DATA);

/**
 * Visible, diagnosable, and not decidable.
 *
 * §2.2 asks for exactly this pair: the numbers stay on screen so an operator
 * can work out *what* went stale, and `decision_eligible=false` stops anyone
 * approving against them. Hiding the panel removes the diagnosis; enabling the
 * button approves against figures nobody stands behind.
 */
export const CAPITAL_PREVIEW_STALE = screen(
  "capital-preview.v1",
  {
    ...CAPITAL_OK_DATA,
    decision_eligible: false,
    blockers: [
      "The source balance snapshot is 3h 28m old.",
      "One venue binding did not report in this window.",
    ],
  },
  {
    input_freshness_floor: "STALE",
    panel_state: "stale",
    input_as_of: "2026-08-22T06:31:12Z",
    warnings: [
      { code: "SOURCE_STALE", message: "The balance snapshot is older than the freshness floor." },
    ],
  },
);

/** A request that would take allocation past the ceiling. Blockers, not a flag. */
export const CAPITAL_PREVIEW_BREACH = screen(
  "capital-preview.v1",
  {
    ...CAPITAL_OK_DATA,
    requested_amount: "600",
    allocated_after: "1100",
    available_after: "975",
    allocation_headroom_after: "-100",
    decision_eligible: false,
    blockers: ["The requested allocation exceeds the portfolio ceiling by 100 USDT."],
  },
  { panel_state: "partial" },
);

/** Population incomplete: some accounts did not report into the preview. */
export const CAPITAL_PREVIEW_PARTIAL = screen(
  "capital-preview.v1",
  { ...CAPITAL_OK_DATA, decision_eligible: false, blockers: ["2 of 9 accounts did not report."] },
  { input_completeness: "PARTIAL", panel_state: "partial" },
);

/* -------------------------------------------------------------------------
 * Full Blotter — order funnel
 * ---------------------------------------------------------------------- */

function quality(over: Record<string, unknown> = {}) {
  return {
    source_authority: "EXECUTION",
    freshness_state: "OK",
    completeness: "COMPLETE",
    as_of: "2026-08-22T09:15:12Z",
    ...over,
  };
}

const SUBMIT_STAGE = {
  stage: "SUBMIT",
  state: "OBSERVED",
  events: [
    {
      stage: "SUBMIT",
      source_authority: "EXECUTION",
      source_id: "req-a41f",
      occurred_at: "2026-08-22T09:15:02.114Z",
      quantity: "1000",
      quality: quality(),
    },
  ],
};

const SOURCE_ACK_STAGE = {
  stage: "SOURCE_ACK",
  state: "OBSERVED",
  events: [
    {
      stage: "SOURCE_ACK",
      source_authority: "EXECUTION",
      source_id: "evt-6620",
      occurred_at: "2026-08-22T09:15:02.402Z",
      quantity: null,
      quality: quality(),
    },
  ],
};

/** Every hop observed, and three fills that must stay in the server's order. */
/**
 * A bounded funnel: the source returned four events out of 4,180 and said so.
 *
 * Presentation/scale fixture, not a backend example — the canonical document is
 * `packages/contracts/fixtures/execution-analytics.order-funnel.valid.json`,
 * which `bounded.test.tsx` loads directly. This one exists so the fixtures page
 * can show what a bounded window looks like at a scale the canonical example
 * does not reach.
 */
export const FUNNEL_BOUNDED = screen("order-funnel.v1", {
  order_id: "ord-88213",
  window: "LIFECYCLE_AND_LATEST",
  event_count: 4180,
  returned_event_count: 4,
  has_more: true,
  stages: [
    { ...SUBMIT_STAGE, event_count: 1, returned_event_count: 1, truncated: false },
    { ...SOURCE_ACK_STAGE, event_count: 1, returned_event_count: 1, truncated: false },
    {
      stage: "BROKER_ACK",
      state: "OBSERVED",
      event_count: 1,
      returned_event_count: 1,
      truncated: false,
      events: [
        {
          stage: "BROKER_ACK",
          source_authority: "BROKER",
          source_id: "brk-1180",
          occurred_at: "2026-08-22T10:41:59.902Z",
          quality: { completeness: "COMPLETE", freshness_state: "OK" },
        },
      ],
    },
    {
      stage: "FILL",
      state: "OBSERVED",
      // 4,177 fills exist and one came back. The two numbers must stay apart.
      event_count: 4177,
      returned_event_count: 1,
      truncated: true,
      events: [
        {
          stage: "FILL",
          source_authority: "BROKER",
          source_id: "fil-9902",
          occurred_at: "2026-08-22T10:42:01.118Z",
          quantity: "0.0400",
          quality: { completeness: "COMPLETE", freshness_state: "OK" },
        },
      ],
    },
  ],
});

export const FUNNEL_COMPLETE = screen("order-funnel.v1", {
  order_id: "ord-88213",
  stages: [
    SUBMIT_STAGE,
    SOURCE_ACK_STAGE,
    {
      stage: "BROKER_ACK",
      state: "OBSERVED",
      events: [
        {
          stage: "BROKER_ACK",
          source_authority: "BROKER",
          source_id: "brk-1180",
          occurred_at: "2026-08-22T09:15:03.771Z",
          quantity: null,
          quality: quality({ source_authority: "BROKER" }),
        },
      ],
    },
    {
      stage: "FILL",
      state: "OBSERVED",
      events: [
        {
          stage: "FILL", source_authority: "BROKER", source_id: "fill-1",
          occurred_at: "2026-08-22T09:15:07.330Z", quantity: "400",
          quality: quality({ source_authority: "BROKER" }),
        },
        {
          stage: "FILL", source_authority: "BROKER", source_id: "fill-2",
          occurred_at: "2026-08-22T09:15:09.918Z", quantity: "350",
          quality: quality({ source_authority: "BROKER" }),
        },
        {
          stage: "FILL", source_authority: "BROKER", source_id: "fill-3",
          occurred_at: "2026-08-22T09:15:11.006Z", quantity: "250",
          quality: quality({ source_authority: "BROKER" }),
        },
      ],
    },
  ],
});

/**
 * The case the four-stage rule exists for.
 *
 * Fills arrived; the broker acknowledgement never did, and the server does not
 * send a stage for it. A funnel that inferred the ack from the fills would
 * render a hop we never observed as observed — precisely the claim this screen
 * is not allowed to make.
 */
export const FUNNEL_MISSING_BROKER_ACK = screen(
  "order-funnel.v1",
  {
    order_id: "ord-88301",
    stages: [
      SUBMIT_STAGE,
      SOURCE_ACK_STAGE,
      {
        stage: "FILL",
        state: "PARTIAL",
        events: [
          {
            stage: "FILL", source_authority: "BROKER", source_id: "fill-9",
            occurred_at: "2026-08-22T09:22:41.550Z", quantity: "200",
            quality: quality({ source_authority: "BROKER", completeness: "PARTIAL" }),
          },
        ],
      },
    ],
  },
  { input_completeness: "PARTIAL", panel_state: "partial" },
);

/** Submitted and nothing since. Three MISSING stages, rendered as MISSING. */
export const FUNNEL_SUBMIT_ONLY = screen(
  "order-funnel.v1",
  { order_id: "ord-88355", stages: [SUBMIT_STAGE] },
  { input_completeness: "PARTIAL", panel_state: "partial" },
);

/* -------------------------------------------------------------------------
 * Alpha 360° — insight batch
 * ---------------------------------------------------------------------- */

function insightItem(i: number) {
  return {
    insight_id: `ins-${String(i).padStart(3, "0")}`,
    alpha_id: `alpha-${String(i % 12).padStart(2, "0")}`,
    portfolio_id: "PF-1",
    state: "READY",
    freshness_state: "OK",
    metrics: [
      { metric: "ALLOCATED_CAPITAL", value: `${5000 + i * 25}` },
      { metric: "USED_CAPITAL", value: `${3100 + i * 17}` },
      { metric: "NET_PNL", value: (i % 7 === 0 ? -1 : 1) * (120 + i * 3) + ".50" },
      { metric: "DRAWDOWN", value: `-${(2 + (i % 9) * 0.4).toFixed(2)}` },
      { metric: "CONTRIBUTION", value: (0.4 + i * 0.007).toFixed(4) },
    ],
    error_code: null,
    error_message: null,
  };
}

/** A full 64-item batch — the schema's exact ceiling, populated. */
export const INSIGHT_BATCH_FULL = screen("alpha-insight.v1", {
  portfolio_id: "PF-1",
  requested_count: 64,
  ready_count: 64,
  error_count: 0,
  items: Array.from({ length: 64 }, (_, i) => insightItem(i)),
});

/**
 * One failure among many, isolated.
 *
 * Per-item states exist so a single unavailable metric does not take the batch
 * with it. A screen that failed the whole request here would blank 62 healthy
 * figures because one engine call timed out.
 */
export const INSIGHT_BATCH_MIXED = screen(
  "alpha-insight.v1",
  {
    portfolio_id: "PF-1",
    requested_count: 3,
    ready_count: 1,
    error_count: 1,
    items: [
      insightItem(0),
      {
        insight_id: "ins-901",
        alpha_id: "alpha-04",
        portfolio_id: "PF-1",
        state: "ERROR",
        freshness_state: "UNKNOWN",
        metrics: [],
        error_code: "BENCHMARK_UNAVAILABLE",
        error_message: "The benchmark series is unavailable for this window.",
      },
      {
        insight_id: "ins-902",
        alpha_id: "alpha-05",
        portfolio_id: "PF-1",
        state: "MISSING",
        freshness_state: "UNKNOWN",
        metrics: [],
        error_code: null,
        error_message: null,
      },
    ],
  },
  { input_completeness: "PARTIAL", panel_state: "partial" },
);

/* -------------------------------------------------------------------------
 * Portfolio 360° — correlation at the packing boundary
 * ---------------------------------------------------------------------- */

function coefficient(row: number, column: number): string {
  if (row === column) return "1"; // The diagonal is exactly this.
  // Deterministic, in range, and not uniform — a fixture whose off-diagonals
  // were all equal would pass an index test that a real matrix would fail.
  return (Math.sin((row * 31 + column * 17) / 23) * 0.82).toFixed(4);
}

function labels(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    entity_id: `INS-${String(i).padStart(3, "0")}`,
    display_name: `Instrument ${i}`,
  }));
}

const CLUSTERS = [
  { cluster_id: "cl-1", label: "Energy complex", members: ["INS-004", "INS-019", "INS-077"] },
  { cluster_id: "cl-2", label: "Rates duration", members: ["INS-011", "INS-042", "INS-133"] },
];

/** Packed lower triangle for `n` entities, row-major, diagonal included. */
export function packedCorrelationFixture(n: number) {
  const values: string[] = [];
  for (let row = 0; row < n; row += 1) {
    for (let column = 0; column <= row; column += 1) values.push(coefficient(row, column));
  }
  return screen("correlation.v1", {
    portfolio_id: "PF-1",
    labels: labels(n),
    clusters: CLUSTERS,
    representation: {
      kind: "PACKED_MATRIX",
      matrix: { dimension: n, packing: "LOWER_INCLUDING_DIAGONAL_ROW_MAJOR", values },
    },
  });
}

/** Exactly at the limit: still packed. `150 × 151 / 2 = 11,325` values. */
export const CORRELATION_AT_LIMIT = packedCorrelationFixture(CORRELATION_PACK_LIMIT);

/**
 * One past the limit: ranked pairs and clusters, never a square matrix.
 *
 * 151 entities would be 22,801 cells as a square and 11,476 packed. The reason
 * for the switch is not memory — it is that a 151×151 heatmap is 22,801 cells
 * nobody can read, so the representation changes to one that answers the
 * question a correlation view is actually asked: what is unusually coupled.
 */
export const CORRELATION_ABOVE_LIMIT = screen("correlation.v1", {
  portfolio_id: "PF-1",
  labels: labels(151),
  clusters: CLUSTERS,
  representation: {
    kind: "RANKED_PAIRS",
    pairs: Array.from({ length: 500 }, (_, i) => ({
      left_id: `INS-${String(i % 151).padStart(3, "0")}`,
      right_id: `INS-${String((i * 7 + 3) % 151).padStart(3, "0")}`,
      coefficient: (0.98 - i * 0.0012).toFixed(4),
      sample_count: 2600 - i,
    })),
  },
});

/** The expected packed length, so tests need not restate the formula. */
export const PACKED_LENGTH_AT_LIMIT = packedLength(CORRELATION_PACK_LIMIT);

/* -------------------------------------------------------------------------
 * Portfolio 360° — capital ledger
 * ---------------------------------------------------------------------- */

/** Two currencies, each with its own gross totals. Nothing crosses between them. */
export const CAPITAL_LEDGER = screen("capital-ledger.v1", {
  portfolio_id: "PF-1",
  buckets: [
    {
      currency: "USDT",
      gross_increase: "750",
      gross_decrease: "200",
      entries: [
        {
          ledger_id: "led-1", allocation_id: "alc-1", account_id: "acc-1",
          movement_type: "INITIAL_ALLOCATE", direction: "INCREASE",
          amount: "500", before_allocated: "0", after_allocated: "500",
          occurred_at: "2026-08-20T08:00:00Z",
        },
        {
          ledger_id: "led-2", allocation_id: "alc-2", account_id: "acc-1",
          movement_type: "ALLOCATE", direction: "INCREASE",
          amount: "250", before_allocated: "500", after_allocated: "750",
          occurred_at: "2026-08-21T08:00:00Z",
        },
        {
          ledger_id: "led-3", allocation_id: "alc-3", account_id: "acc-2",
          movement_type: "WITHDRAW", direction: "DECREASE",
          amount: "200", before_allocated: "750", after_allocated: "550",
          occurred_at: "2026-08-22T08:00:00Z",
        },
        {
          // A rebalance that moved nothing. `UNCHANGED` is the server's word for
          // it — the client would have had to guess from an amount of zero, and
          // a zero-amount rebalance and a no-op are different events.
          ledger_id: "led-4", allocation_id: null, account_id: "acc-2",
          movement_type: "REBALANCE", direction: "UNCHANGED",
          amount: "0", before_allocated: "550", after_allocated: "550",
          occurred_at: "2026-08-22T09:00:00Z",
        },
      ],
    },
    {
      currency: "VND",
      gross_increase: "12000000",
      gross_decrease: "0",
      entries: [
        {
          ledger_id: "led-5", allocation_id: "alc-9", account_id: "acc-7",
          movement_type: "INITIAL_ALLOCATE", direction: "INCREASE",
          amount: "12000000", before_allocated: "0", after_allocated: "12000000",
          occurred_at: "2026-08-19T03:00:00Z",
        },
      ],
    },
  ],
});

/* -------------------------------------------------------------------------
 * Account / Broker 360° — binding exposure
 * ---------------------------------------------------------------------- */

const EXPOSURE_BUCKETS = [
  {
    currency: "USDT", account_count: 18,
    used: "4820150.00", reserved: "312000.00", available: "1867850.00", headroom: "2180000.00",
    oldest_source_as_of: "2026-08-22T09:31:00Z", newest_source_as_of: "2026-08-22T09:45:00Z",
  },
  {
    currency: "VND", account_count: 4,
    used: "1104300000", reserved: "58000000", available: "437700000", headroom: "600000000",
    oldest_source_as_of: "2026-08-22T09:29:00Z", newest_source_as_of: "2026-08-22T09:44:00Z",
  },
  {
    currency: "USD", account_count: 2,
    used: "88400.00", reserved: "0.00", available: "31600.00", headroom: "40000.00",
    oldest_source_as_of: "2026-08-22T09:12:00Z", newest_source_as_of: "2026-08-22T09:40:00Z",
  },
];

/** Every expected account reported. Only this may be called a total. */
export const EXPOSURE_COMPLETE = screen("binding-exposure.v1", {
  binding_id: "bnd-IBKR-U8841203",
  account_count: 24,
  expected_account_count: 24,
  population_completeness: "COMPLETE",
  buckets: EXPOSURE_BUCKETS,
});

/** Twenty-one of twenty-four. A sum, not the exposure. */
export const EXPOSURE_PARTIAL = screen(
  "binding-exposure.v1",
  {
    binding_id: "bnd-IBKR-U8841203",
    account_count: 21,
    expected_account_count: 24,
    population_completeness: "PARTIAL",
    buckets: EXPOSURE_BUCKETS,
  },
  { input_completeness: "PARTIAL", panel_state: "partial" },
);

/** The expected count itself is unknown. Weaker than partial, and must read so. */
export const EXPOSURE_UNKNOWN = screen(
  "binding-exposure.v1",
  {
    binding_id: "bnd-IBKR-U8841203",
    account_count: 21,
    expected_account_count: null,
    population_completeness: "UNKNOWN",
    buckets: EXPOSURE_BUCKETS,
  },
  { input_completeness: "UNKNOWN", panel_state: "partial" },
);
