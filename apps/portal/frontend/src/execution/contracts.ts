/**
 * Execution Loop presentation contracts.
 *
 * These types are the frontend's half of the Execution cluster. They are NOT
 * invented ahead of the backend: every one of them is transcribed from a
 * document that already exists, so that when codex publishes the Execution
 * Query API the wiring is a mapping exercise rather than a redesign.
 *
 *   envelope fields      EXECUTION_CLUSTER_GUIDE §5
 *   chart envelope       spec v0.7 §16.2
 *   stage vocabulary     spec v0.7 §5.2, DESIGN_SYSTEM_EXECUTION §6
 *   identity ids         DB_ALPHA_PORTFOLIO_ACCOUNT_SCHEMA_GUIDE, layers 2/3/5/9
 *
 * The rule these types exist to enforce is spec §5.2 / DS §6: runtime state,
 * promotion stage, readiness and broker sync are FOUR SEPARATE FIELDS. They are
 * modelled as four unrelated unions on purpose — a single `status` string would
 * make the merge that the spec forbids the path of least resistance.
 */

/* ---------------------------------------------------------------------------
 * Identity (schema guide layers 2, 3, 5, 9)
 *
 * Branded aliases rather than bare `string`, so passing an account where a
 * deployment belongs is a compile error. They cost nothing at runtime.
 * ------------------------------------------------------------------------ */

declare const brand: unique symbol;
type Id<Tag extends string> = string & { readonly [brand]?: Tag };

/** `strategies.strategy_id`. Called "alpha" in the hi-fi and the spec. */
export type StrategyId = Id<"strategy">;
/** Portal-side alpha version identity (spec §3.1), e.g. `av_2041`. */
export type AlphaVersionId = Id<"alpha_version">;
/** `strategy_deployments.deployment_id`. Unique per (strategy, account, mode, venue). */
export type DeploymentId = Id<"deployment">;
/** `accounts.account_id` — the internal, virtual account. */
export type AccountId = Id<"account">;
/** `venue_accounts.external_account_ref` — the physical broker account. */
export type ExternalAccountRef = Id<"external_account">;
/** `portfolios.portfolio_id`. Lives on the DEPLOYMENT, not on the strategy. */
export type PortfolioId = Id<"portfolio">;
/** `venues.venue`. Venue is data (decision D5) — never a hardcoded union. */
export type VenueCode = Id<"venue">;
/** Approval / exit-review identity, e.g. `AP-352`, `EX-771`. */
export type ApprovalId = Id<"approval">;
/** Operation identity from the command journal, e.g. `op_1251`. */
export type OperationId = Id<"operation">;
/** Incident identity, e.g. `inc_44`. */
export type IncidentId = Id<"incident">;

/* ---------------------------------------------------------------------------
 * The four fields that must never be merged (spec §5.2)
 * ------------------------------------------------------------------------ */

/** 1 of 4. What the deployment's runtime is doing right now. */
export type RuntimeState = "ACTIVE" | "REDUCING" | "HALTED" | "ARCHIVED";

/** 2 of 4. How far through promotion it is. Names are verbatim (DS §6). */
export type PromotionStage =
  | "PAPER_OBSERVATION"
  | "SANDBOX_VALIDATION"
  | "LIVE_CANARY"
  | "LIVE_FULL";

/** 3 of 4. Whether it satisfies its gate. `ACTIVE ≠ READY` (guide §6). */
export type Readiness = "READY" | "NOT_READY" | "BLOCKED" | "UNKNOWN";

/**
 * 4 of 4. Agreement between our books and the broker's.
 *
 * `OK / STALE / MISMATCH / ERROR` are the DB CHECK on
 * `account_sync_snapshots.status`, verbatim. `ERROR` means the sync attempt
 * itself failed, which is different from `MISMATCH` (it ran and disagreed) and
 * from `STALE` (it has not run recently enough).
 *
 * `UNKNOWN` is Portal-side and has no Trading System counterpart: it is what a
 * binding shows before any snapshot has been taken. Kept because rendering a
 * never-synced account as `OK` would be a lie, and as `ERROR` would raise an
 * alarm for something that has simply not happened yet.
 */
export type BrokerSync = "OK" | "STALE" | "MISMATCH" | "ERROR" | "UNKNOWN";

/* ---------------------------------------------------------------------------
 * Authority and freshness (guide §5, §6)
 * ------------------------------------------------------------------------ */

/**
 * Who owns a number. Rendered on every data panel.
 *
 * **This is a Portal classification, not a Trading System field.**
 * `extract/freshness-authority.json` is explicit: `source_authority` is the
 * constant `EXECUTION_CELL` on every Trading System answer, and per-venue
 * authority lives in `/v1/health/capabilities rollout_state`. So the connector
 * assigns EXECUTION / BROKER / DERIVED from which surface it read, and Portal
 * owns that mapping. It must be applied in one place, not per screen.
 *
 * The hi-fi differentiates these by the WORD in one shared tone, not by hue —
 * see the note on `--authority-ink` in tokens.css. Do not reintroduce a colour
 * per authority: an operator who cannot separate two hues would lose the
 * distinction entirely, and the distinction is load-bearing.
 */
export type Authority = "RESEARCH" | "EXECUTION" | "BROKER" | "DERIVED";

/**
 * Freshness judged against per-venue policy, never a constant in the client.
 *
 * `PAUSED` is not a degraded state: it is what a venue calendar produces
 * outside session hours (Paper Workbench VNM, phase 13). Rendering it as STALE
 * would raise a false alarm every night the market is shut.
 */
export type FreshnessState = "OK" | "AGING" | "STALE" | "PAUSED" | "UNKNOWN";

/**
 * The envelope every Execution read carries (guide §5).
 *
 * Reconciled 2026-08-21 against
 * `trading_system_portal_contract_pack/extract/freshness-authority.json`
 * (`portal_envelope_mapping`). Three fields the guide describes as if the
 * Trading System supplies them, it does not:
 *
 *   - `as_of` — no server-supplied value on list endpoints. It comes from the
 *     row's own `updated_at` / `ts` / `trade_time`.
 *   - `source_sequence` — **not on HTTP responses at all** today.
 *   - `freshness_state` — no single enum is emitted; the connector derives it.
 *
 * The mapping doc's own instruction is the rule this interface encodes: the
 * connector "MUST stamp its own read time separately and never present it as
 * Trading System authority". Hence `asOf` and `readAt` are two fields. Merging
 * them would let a fast read of a two-hour-old row render as two seconds fresh,
 * which is the exact failure the AuthorityBadge exists to prevent.
 */
export interface Envelope {
  authority: Authority;
  /**
   * When the DATA was true — the row's own timestamp. ISO-8601 UTC.
   *
   * `null` where the upstream genuinely publishes none; the badge then says so
   * rather than substituting `readAt`, which would be a different claim.
   */
  asOf: string | null;
  /**
   * When the CONNECTOR read it. ISO-8601 UTC, always connector-derived.
   * Never render this as Trading System authority.
   */
  readAt?: string | null;
  /**
   * Monotonic per stream; a jump means events were missed.
   *
   * Not exposed over HTTP today — it exists as `copy_event_outbox.sequence_id`
   * and via `domain_events` ordering, neither of which the gateway serves. Until
   * BR-EX-11 lands this is `null` and the M3 gap check cannot run, so a missed
   * event is currently undetectable. That is a known hole, not a resolved one.
   */
  sourceSequence?: number | null;
  /**
   * Connector-derived, not read from a Trading System field. Sources per the
   * mapping doc: `/v1/health.checks.stale_or_bad_services` (heartbeat age over
   * 180s by default), broker adapter `circuit_open`, and data-layer feed
   * staleness.
   */
  freshness: FreshnessState;
  /** Age in seconds against `asOf`. Connector-computed; label it as such. */
  ageSeconds?: number | null;
  /** Non-fatal caveats the panel must surface rather than swallow. */
  warnings?: readonly string[];
  /** Broker snapshot digest, for BROKER authority. */
  digest?: string | null;
  /** Formula version, required for DERIVED authority (guide §6). */
  formulaVersion?: string | null;
}

/**
 * VN market session state, for the Paper Workbench VNM freshness clock.
 *
 * Two facts from `extract/freshness-authority.json` that shape phase 13:
 * the sessions are 09:00–11:30 and 13:00–14:30 ICT (UTC+7) Mon–Fri, and the
 * calendar lives in the DATA LAYER, not in `trading_system`. A connector
 * reading only the gateway cannot see VN session state at all — it has to read
 * the data-layer health surface (`dnse_stream.status`).
 *
 * So `MARKET_CLOSED` is what drives `FreshnessState.PAUSED`, and `OPEN_STALE`
 * is a real stale reading during a session. Collapsing the two would raise a
 * false alarm every evening.
 */
export type VnSessionStatus = "OPEN_HEALTHY" | "OPEN_STALE" | "MARKET_CLOSED" | "BROKEN";

/* ---------------------------------------------------------------------------
 * Panel states (DS §6, §4g)
 * ------------------------------------------------------------------------ */

/**
 * Every panel of every screen renders one of these, including the screens whose
 * hi-fi only draws the happy path (DS §9 note 2).
 *
 * `partial` is separate from `ok` because PARTIAL must never render green, and
 * `insufficient_data` is separate from `empty` because "we have no rows" and
 * "we have rows but too few to compute honestly" are different claims.
 */
export type PanelStatus =
  | "loading"
  | "ok"
  | "empty"
  | "partial"
  | "stale"
  | "denied"
  | "unavailable"
  | "insufficient_data"
  | "terminal";

/* ---------------------------------------------------------------------------
 * Chart envelope (spec v0.7 §16.2)
 *
 * Rendered as a caption row under every chart, no exceptions. `interval` and
 * the two row counts are what let a reader tell an aggregated series from a
 * complete one — without them a downsampled chart misrepresents itself.
 * ------------------------------------------------------------------------ */

export interface ChartEnvelope {
  /** Time span requested, e.g. `30d`. */
  window: string;
  /** Bucket the server actually served, e.g. `1h` (scale doc §3.1 ladder). */
  interval: string;
  currency?: string | null;
  /** ISO-8601 UTC. */
  asOf: string;
  authority: Authority;
  formulaVersion?: string | null;
  /** Rows behind the series before aggregation. */
  sourceRows?: number | null;
  /** Points actually returned. */
  returnedRows?: number | null;
  /** Fraction of the window with data, 0–1. Gaps stay gaps (§16.3). */
  coverage?: number | null;
  /** Named only when the server had to reduce beyond bucket selection. */
  downsampleMethod?: string | null;
  warnings?: readonly string[];
}

/* ---------------------------------------------------------------------------
 * Domain vocabularies used by more than one screen
 * ------------------------------------------------------------------------ */

/**
 * Blotter row status — the Trading System's `OrderStatus` enum, verbatim.
 *
 * Twelve values, from `extract/vocabularies.json`. Note `CANCELED` with one L
 * and `PARTIALLY_FILLED` rather than `PARTIAL`: these are wire values, and a
 * frontend that "tidies" the spelling stops matching what the server sends.
 *
 * `DENIED` here is an order the risk authority refused. It is unrelated to the
 * `denied` panel state, which is about what the VIEWER may see.
 */
export type OrderStatus =
  | "INITIALIZED"
  | "SUBMITTED"
  | "ACCEPTED"
  | "REJECTED"
  | "DENIED"
  | "PENDING_UPDATE"
  | "PENDING_CANCEL"
  | "PARTIALLY_FILLED"
  | "FILLED"
  | "CANCELED"
  | "EXPIRED"
  | "TRIGGERED";

/**
 * The Full Blotter's five filter chips (`IMPLEMENTATION_PHASES` phase 14).
 *
 * The hi-fi offers five; the system has twelve. So the chips are a BUCKETING,
 * and the bucket definition below is a UI decision that has to be agreed rather
 * than assumed — the server applies it (BR-EX-02), so both sides must bucket
 * identically or the count in the footer will not match the rows in the table.
 */
export type BlotterFilter = "ALL" | "FILLED" | "PARTIAL" | "REJECTED" | "OPEN";

/**
 * Proposed bucket map. `OPEN` means "still working": submitted or accepted by
 * the venue and not yet terminal. `TRIGGERED` counts as open because a
 * triggered stop is live in the book.
 */
export const BLOTTER_BUCKET: Record<Exclude<BlotterFilter, "ALL">, readonly OrderStatus[]> = {
  FILLED: ["FILLED"],
  PARTIAL: ["PARTIALLY_FILLED"],
  REJECTED: ["REJECTED", "DENIED"],
  OPEN: ["INITIALIZED", "SUBMITTED", "ACCEPTED", "PENDING_UPDATE", "PENDING_CANCEL", "TRIGGERED"],
};

/**
 * Statuses no bucket claims: `CANCELED` and `EXPIRED`.
 *
 * Deliberate. They are terminal and uninteresting to the five questions the
 * chips ask, and they remain reachable through `ALL`. Recorded because a
 * silently unreachable status would be a hole in the filter.
 */
export const BLOTTER_UNBUCKETED: readonly OrderStatus[] = ["CANCELED", "EXPIRED"];

/**
 * Command/operation lifecycle. `202 ≠ success`: `AWAITING_APPLY` and
 * `APPLIED_UNVERIFIED` both mean the request was accepted and nothing is
 * confirmed yet.
 */
export type OperationStatus =
  | "PLANNED"
  | "AWAITING_APPLY"
  | "APPLIED_UNVERIFIED"
  | "VERIFIED"
  | "PARTIAL"
  | "FAILED";

/** Evidence check outcome. `!` is a watch item: visible, non-blocking. */
export type EvidenceMark = "pass" | "watch" | "fail" | "insufficient";

/** Severity shared by alerts, findings and incidents. */
export type Severity = "CRITICAL" | "WARNING" | "INFO";

/* ---------------------------------------------------------------------------
 * Small shared shapes
 * ------------------------------------------------------------------------ */

/** A rendered ID is always a navigable chip (guide §4): no dead-end screens. */
export interface IdChip {
  label: string;
  href?: string;
  /** Long form for the tooltip, e.g. a full digest that is shown truncated. */
  title?: string;
}

/** `n of m` progress with the gate rule that reads it. */
export interface Progress {
  current: number;
  target: number;
  unit: string;
}

/** Service-level budget for a queued decision (Approval Inbox, Command Center). */
export interface Sla {
  ageMinutes: number;
  budgetMinutes: number;
}

export function slaOverdue(sla: Sla): boolean {
  return sla.ageMinutes > sla.budgetMinutes;
}

/**
 * Stage display label. The stage NAME is verbatim everywhere it is data; this
 * is only for the places the hi-fi prints a short form on a rail.
 */
export const STAGE_SHORT: Record<PromotionStage, string> = {
  PAPER_OBSERVATION: "PAPER",
  SANDBOX_VALIDATION: "SANDBOX",
  LIVE_CANARY: "CANARY",
  LIVE_FULL: "LIVE",
};

/** Stages in promotion order, for rails and steppers. */
export const STAGE_ORDER: readonly PromotionStage[] = [
  "PAPER_OBSERVATION",
  "SANDBOX_VALIDATION",
  "LIVE_CANARY",
  "LIVE_FULL",
];

/**
 * Guard treatment (decision D2). Canary and live share one red; the label and
 * the border weight carry the difference, never a second hue.
 */
export function guardFor(stage: PromotionStage): "none" | "canary" | "live" {
  if (stage === "LIVE_CANARY") return "canary";
  if (stage === "LIVE_FULL") return "live";
  return "none";
}
