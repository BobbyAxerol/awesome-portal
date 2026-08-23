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
/**
 * Who owns the record.
 *
 * `PORTAL` was added when the Command Center snapshot arrived
 * (`execution.command-center-snapshot.v1`): approvals and pins are rows the
 * Portal itself is authoritative for, which is a different claim from
 * `DERIVED` — derived means computed from someone else's truth, PORTAL means
 * this *is* the truth. Conflating them would let a Portal-owned figure inherit
 * the caveats a derived one carries, and vice versa.
 */
export type Authority = "RESEARCH" | "PORTAL" | "EXECUTION" | "BROKER" | "DERIVED";

/**
 * Freshness judged against per-venue policy, never a constant in the client.
 *
 * `PAUSED` is not a degraded state: it is what a venue calendar produces
 * outside session hours (Paper Workbench VNM, phase 13). Rendering it as STALE
 * would raise a false alarm every night the market is shut.
 */
export type FreshnessState = "OK" | "AGING" | "STALE" | "PAUSED" | "UNKNOWN";

/**
 * Position of a row in the Trading System's own ordering.
 *
 * A tuple, not a number, because the Trading System publishes no global
 * sequence. It is enough to resume a poll from where the last one stopped and
 * enough to detect REORDERING — it is **not** enough to detect a missing row.
 * See the note on `sourceSequence` below.
 */
export interface SourceCursor {
  eventTs: string;
  createdAt: string;
  eventId: string;
}

/**
 * The envelope every Execution read carries.
 *
 * Two reconciliations produced this shape. The first (2026-08-21) checked the
 * guide against `extract/freshness-authority.json` and found three fields the
 * guide describes as Trading System-supplied that are not. The second checked it
 * against the backend master plan §7.1, which is now the binding contract.
 *
 * The rule the whole interface encodes is the mapping doc's own instruction: the
 * connector "MUST stamp its own read time separately and never present it as
 * Trading System authority". Hence `asOf` and `readAt` are two fields. Merging
 * them would let a fast read of a two-hour-old row render as two seconds fresh,
 * which is the exact failure the AuthorityBadge exists to prevent.
 *
 * Field names here are camelCase; the wire is snake_case (master plan §7.1).
 * The adapter layer does that translation in one place.
 */
export interface Envelope {
  /** Wire: `source_authority`. */
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
  /** Where this row sits in the source's own ordering (master plan §7.1). */
  sourceCursor?: SourceCursor | null;
  /**
   * Monotonic per stream; a jump means events were missed.
   *
   * **Permanently nullable.** BR-EX-11 was ruled MODIFY: the Trading System
   * publishes no global sequence and Portal is forbidden to fabricate one
   * (master plan §1.2). Gap detection therefore runs on `projectionSequence`
   * instead, which is a weaker claim — see `projectionEpoch`.
   */
  sourceSequence?: number | null;
  /**
   * Identifies one build of the Portal projection. A change means the
   * projection was rebuilt and every cursor from the previous epoch is void:
   * the screen must resnapshot, not resume.
   */
  projectionEpoch?: string | null;
  /**
   * Monotonic **within** `projectionEpoch`. This is what M3 checks for gaps.
   *
   * Read the claim precisely: contiguous `projectionSequence` proves nothing was
   * lost between the edge and this browser. It does **not** prove nothing was
   * lost between the Trading System and the edge — today only `ORDER_STATUS`
   * is event-driven and everything else is polled, so a state that changed and
   * changed back between two polls leaves no trace at all. Never label this
   * field, or anything derived from it, as a source sequence.
   */
  projectionSequence?: number | null;
  /**
   * Whether this entity class is genuinely event-sourced or merely polled.
   *
   * The field exists because `projectionSequence` cannot say it. At the current
   * runtime only `ORDER_STATUS` may be `EVENT_SOURCED`; runtime, risk, account,
   * fill and reconciliation are `POLL_BOUNDED` or `UNKNOWN` until a later
   * contract pack proves broader coverage (master plan §7.1).
   *
   * A `POLL_BOUNDED` panel may only claim states that were observed at a poll.
   * `UNKNOWN` blocks continuity-sensitive claims outright.
   */
  sourceCompleteness?: SourceCompleteness;
  /** Effective poll interval, present when `sourceCompleteness` is POLL_BOUNDED. */
  pollIntervalMs?: number | null;
  /**
   * Which delivery profile produced this data (master plan §12.3).
   *
   * Registry revision 4 is the authority for a screen's profile; this echo lets
   * one panel of a composed screen be **stricter** than the screen. It may never
   * be laxer — see `reconcilePanelProfile` in `profile.ts`, which fails closed.
   */
  deliveryProfile?: DeliveryProfile;
  /**
   * Connector-derived, not read from a Trading System field. Sources per the
   * mapping doc: `/v1/health.checks.stale_or_bad_services` (heartbeat age over
   * 180s by default), broker adapter `circuit_open`, and data-layer feed
   * staleness. Thresholds are versioned Portal registry policy per venue and
   * dataset — never a constant in this client.
   */
  freshness: FreshnessState;
  /**
   * Age of the DATA in seconds, measured `readAt − asOf` **by the edge**, using
   * its trusted clock (BR-EX-19, accepted).
   *
   * Server-computed on purpose. Computing it here would need the browser clock,
   * which the same plan forbids for venue sessions; a laptop with a skewed clock
   * would render a fresh panel as an hour stale.
   *
   * An `asOf` in the future beyond skew tolerance arrives as freshness `UNKNOWN`
   * plus a warning rather than a clamped zero, so this is never negative.
   */
  ageSeconds?: number | null;
  /**
   * Projection lag in milliseconds — how far the read model trails its source.
   * A different quantity from `ageSeconds`: a panel can be seconds-fresh off a
   * projection that is minutes behind.
   */
  lagMs?: number | null;
  /** Which panel state this response resolves to (master plan §7.1). */
  panelState?: PanelStatus;
  /**
   * Ties a rendered decision back to the exact compatibility observation that
   * allowed it (master plan §6.1). Carried so an operator asking "why was this
   * button disabled at 14:02" has an answer.
   */
  capabilitySnapshotId?: string | null;
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

/**
 * How this entity class reaches the projection (master plan §7.1, BR-EX-16).
 *
 * The distinction a contiguous sequence cannot make. `EVENT_SOURCED` is covered
 * by a proven event contract. `POLL_BOUNDED` reached us by polling, so a value
 * that changed and changed back between two polls left no trace — the panel may
 * assert what was observed at a poll and nothing between polls. `UNKNOWN` has no
 * trustworthy basis and blocks continuity claims entirely.
 */
export type SourceCompleteness = "EVENT_SOURCED" | "POLL_BOUNDED" | "UNKNOWN";

/* ---------------------------------------------------------------------------
 * Retention (EX-BE-04b §3)
 * ------------------------------------------------------------------------ */

/**
 * What the requested range means against the retention policy.
 *
 * The contract's own sentence is the rule this vocabulary exists to encode:
 * `COLD_REQUESTABLE`, `PURGED` and `UNKNOWN` "may have no points, but are not
 * semantically an ordinary empty hot series".
 *
 * So a screen that renders zero rows must first ask *why* zero. "Nothing
 * matched your filter", "this is older than we keep online", "this was deleted"
 * and "we do not know what we keep" are four different answers, and only the
 * first is `empty`. Collapsing them tells an operator their query found nothing
 * when the truth is that nobody looked.
 */
export type RetentionOutcome =
  /** Fully inside the hot window. An empty result here really is empty. */
  | "HOT"
  /** The range starts before the hot window; only its hot suffix was queried. */
  | "PARTIAL_HOT"
  /** Archived. Restoring it is an administrative workflow, not a wider query. */
  | "COLD_REQUESTABLE"
  /** Deleted under policy. No request will bring it back. */
  | "PURGED"
  /** No retention policy is published for this scope, so nothing can be said. */
  | "UNKNOWN";

export interface RetentionState {
  outcome: RetentionOutcome;
  /** Oldest instant still online, when the policy publishes one. */
  hotFrom?: string | null;
  /** Which policy version produced this, so a later answer can be compared. */
  policyVersion?: string | null;
}

/* ---------------------------------------------------------------------------
 * Keyset list contract (master plan §7.2, BR-EX-01/02/03/17)
 * ------------------------------------------------------------------------ */

/** One allowlisted sort the server applied, echoed back so the UI shows truth. */
export interface SortSpec {
  field: string;
  direction: "asc" | "desc";
}

/** One allowlisted filter the server applied, echoed back. */
export interface FilterEcho {
  field: string;
  /** `null` when the server's echo did not say. Never defaulted to `eq`. */
  op: string | null;
  value: string | null;
}

/**
 * One page of a keyset list.
 *
 * There is no page number and no offset, by construction. `after` and `before`
 * are mutually exclusive opaque signed cursors; a client can step in either
 * direction but cannot seek to page *n*, which is why the table primitive
 * renders no page-number control. Offering one would be a lie about a
 * capability the contract does not have.
 *
 * Both counts come from the server over the full filtered population. The
 * browser never counts its own rows — that stays correct until the day the list
 * paginates and then becomes confidently wrong (mechanism M7).
 */
export interface KeysetPage<T> {
  rows: readonly T[];
  /**
   * Exact, across the whole dataset. Hi-fi footer: "48,213 total".
   *
   * `null` when the server did not publish one. It was coerced to `0` before,
   * and a footer reading "0 total" over a full page of rows is the null-renders
   * -as-zero failure this surface bans everywhere else.
   */
  totalCount: number | null;
  /** Exact, across the current filter. Hi-fi footer: "412 in selection". */
  filteredCount?: number | null;
  /** Opaque. Absent when this is the newest page. */
  nextCursor?: string | null;
  /** Opaque. Absent when this is the oldest page. */
  prevCursor?: string | null;
  hasMore?: boolean;
  hasPrevious?: boolean;
  /** What the server actually filtered and sorted by, not what was requested. */
  appliedFilters?: readonly FilterEcho[];
  appliedSort?: readonly SortSpec[];
  /**
   * Why this page holds what it holds. Absent means the endpoint published no
   * retention policy, which is not the same as everything being online.
   */
  retention?: RetentionState | null;
}

/**
 * The query shape a cursor was issued against.
 *
 * `EX-BE-04b`: "Changing filter, sort, limit, epoch, scope, resource or cursor
 * direction makes an old cursor fail closed." The server enforces it; the
 * client tracks it so a stale cursor is dropped before the request rather than
 * bounced after, and so the reader is told the page reset rather than watching
 * it silently jump.
 */
export interface CursorScope {
  filter: string;
  sort: string;
  limit: number;
  resource: string;
  /** Projection epoch, when the resource has one. */
  epoch?: string | null;
}

/** Would a cursor issued under `a` still be valid under `b`? */
export function cursorStillValid(a: CursorScope | null, b: CursorScope): boolean {
  if (!a) return false;
  return (
    a.filter === b.filter &&
    a.sort === b.sort &&
    a.limit === b.limit &&
    a.resource === b.resource &&
    (a.epoch ?? null) === (b.epoch ?? null)
  );
}

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
 * Where an operation sits in the Portal workflow. Portal-owned presentation.
 *
 * `202 ≠ success`: `AWAITING_APPLY` and `APPLIED_UNVERIFIED` both mean the
 * request was accepted and nothing is confirmed yet.
 */
export type OperationStatus =
  /**
   * The command was accepted but nothing was relayed, and `blockers` says why.
   *
   * Published by `execution.command-operation.v1` and absent from this union
   * until 2026-08-23, so `readEnum` scored the contract's own fixture as an
   * unrecognised token and the screen dropped it: an operator polling a
   * blocked operation was shown no status at all.
   */
  | "BLOCKED"
  | "PLANNED"
  | "AWAITING_APPLY"
  | "APPLIED_UNVERIFIED"
  | "VERIFIED"
  | "PARTIAL"
  | "FAILED";

/**
 * What `verify` actually observed (master plan §7.3). A **different axis** from
 * `OperationStatus`: that one is where the workflow is, this one is what the
 * Trading System reported. An operation can be `APPLIED_UNVERIFIED` while its
 * verification is `PENDING`, and the screen must be able to say both.
 *
 * `UNCERTAIN` is the value this whole surface exists for. It means the command
 * may or may not have taken effect and we cannot tell. It must never render as
 * a neutral grey chip beside `PENDING` — an operator who reads "we don't know
 * whether we halted the strategy" as "still working on it" will wait instead of
 * escalating. Its tone is `bad`, deliberately, even though nothing has been
 * proven to have failed.
 */
export type VerificationResult =
  /**
   * Verification has not begun. Published by `execution.command-operation.v1`
   * and missing from this union until 2026-08-23, so the contract's own
   * canonical fixture scored as an unrecognised token: the walk stalled on
   * "this build does not recognise" for the ordinary starting state of every
   * operation. `operations.ts` had it all along — two copies of one axis with
   * different members, and only one of them matched the contract.
   *
   * Not settled: see `isSettled`, which is an allowlist for that reason.
   */
  | "NOT_STARTED"
  | "PENDING"
  | "ACKNOWLEDGED"
  | "SUCCEEDED"
  | "FAILED"
  | "DENIED"
  | "PARTIAL"
  | "UNCERTAIN"
  | "EXPIRED";

/**
 * Per-capability negotiation state (master plan §6.2).
 *
 * The plan's own rule: "a global green flag is forbidden". Reads may be
 * `SUPPORTED` while the matching command path is `DISABLED`, so this is stored
 * and rendered per capability, never rolled into one system-health badge.
 */
export type CapabilityState =
  | "SUPPORTED"
  | "READ_ONLY"
  | "SHADOW_ONLY"
  | "DISABLED"
  | "INCOMPATIBLE";

/**
 * Risk tier of a command (master plan §9.2). Decides what the drawer must
 * demand before Apply: R0 nothing beyond session, R1 a reason, R2 fresh auth
 * plus a second person, R3 phishing-resistant step-up, R4 WebAuthn and dual
 * approval.
 *
 * R3 and R4 are not a scale of the same thing. R3 is protective (halt, reduce)
 * and R4 is risk-increasing (enable, expand). An emergency bypass built for R3
 * must never be reachable from R4 — the drawer models them as separate paths
 * rather than as one ladder with a threshold.
 */
export type RiskTier = "R0" | "R1" | "R2" | "R3" | "R4";

/**
 * How real a screen's data is right now (master plan §12.3).
 *
 * This is not decoration. In `shadow` the numbers are real reads compared
 * against golden truth, and they look exactly like `live_full` numbers. Without
 * this rendered somewhere the operator cannot miss it, the surface's central
 * promise — that you can always tell what you are looking at — is broken by the
 * one mode designed to look identical to production.
 */
export type DeliveryProfile =
  | "fixture"
  | "shadow"
  | "paper"
  | "sandbox"
  | "live_canary"
  | "live_full";

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
/** The server's own SLA verdict. Four states, published on the approval row. */
export type SlaState = "ON_TRACK" | "DUE_SOON" | "OVERDUE" | "EXPIRED";

export interface Sla {
  ageMinutes: number;
  budgetMinutes: number;
  /**
   * The server's verdict, when it publishes one.
   *
   * It exists because the server knows things two minute counts do not: a
   * paused clock, a policy that stops counting outside market hours, an
   * extension granted on the request. A client comparing age against budget
   * gets those cases wrong in the direction that matters — calling a request
   * overdue when the clock was stopped, or on-track when the deadline moved.
   */
  state?: SlaState | null;
}

/**
 * Is this request past its deadline?
 *
 * The server's verdict wins whenever there is one. The arithmetic is a
 * fallback for rows that predate the field, and it is the weaker answer.
 */
export function slaOverdue(sla: Sla): boolean {
  if (sla.state) return sla.state === "OVERDUE" || sla.state === "EXPIRED";
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
