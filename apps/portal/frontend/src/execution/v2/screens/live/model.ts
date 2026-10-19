/**
 * Live operations: the view model, built from either body the route can answer.
 *
 * Two bodies share `GET /deployments/{id}/live` (dispatch.ts):
 * - V1 `execution.live-full-operations.v1` (`LiveFullOperations`): KPIs, source panels, broker
 *   consistency, projection continuity, the predecessor Canary envelope and the command policy.
 *   Its reader (liveFull.ts) already strips every broker-derived figure while
 *   `broker_values_visible` is not exactly true; this model never sees one then.
 * - V2 `portal.execution.live-source-operations.v2` (`LiveSourceOperationsV2`): eleven finite
 *   panels of retained observations. No KPI, no verdict, no runtime state, no continuity.
 *
 * This file is pure: values in, plain data out, no React. It states only what a body published.
 * Everything else is `Not published (FE-xxx)` (the request that will publish it) or
 * `Not available`; nothing here prints 0, a dash, a freshness word or a run state the source did not say.
 *
 * Reconciliation. `broker_consistency.state` is `UNAVAILABLE | MISMATCH | IN_SYNC`. The sentence
 * "Hidden while the figures disagree" is a claim that the figures disagree, so it is printed only for
 * MISMATCH. An UNAVAILABLE broker state still withholds every broker figure (the reader strips them),
 * but says "Not available", which is a different fact.
 */
import { safeInternalHref } from "../../safeHref";
import { formatAsOf, readMetric, type Metric } from "../../boundary";
import type { BlockerItem, NotPublishedId, SpineStageId, StageChips, StageChipValue, TriadCell, TriadRow, TriadSide } from "../../blocks";
import type { FlagKind } from "../../flagKinds";
import type { LiveFullVersionRead } from "../../readers/dispatch";
import type { LiveSourceOperationsV2, LiveSourcePanelName, LiveSourcePanelV2, LiveSourceRecordV2, LiveSourceValueV2 } from "../../readers/liveSourceOperations";
import { readUtcEpochMs, type UtcEpochMs } from "../../../screenDataContract";
import type { LiveFullOperations, LivePanel } from "../../../liveFull";
import type { RowCollection } from "../../../certification";
import { publishedRowsOf, type PublishedRows } from "../../readers/publishedRows";

/* ── constants ────────────────────────────────────────────────────────────── */

/** Rows a table draws. A longer list says so and keeps the rest behind keyset `Load more`. */
export const ROW_CAP = 200;

export const LIVE_SCREEN_KEY = "live" as const;

export const LIVE_TABS = [
  { id: "exposure-orders", label: "Exposure & orders" },
  { id: "continuity", label: "Continuity" },
  { id: "predecessor-envelope", label: "Predecessor envelope" },
  { id: "guard-rules", label: "Guard rules" },
] as const;
export type LiveTabKey = (typeof LIVE_TABS)[number]["id"];

export const ACCESS_PATH = "/administration/profile-access";
export const FLEET_PATH = "/deployments/alphas";
export const OPERATIONS_PATH = "/execution/operations";

/** "Unavailable / not published" placeholders are cells, so a table cell and a list line read alike. */
export type Cell =
  | { t: "text"; text: string }
  | { t: "na"; reason?: string }
  | { t: "np"; fe: NotPublishedId; what?: string }
  | { t: "flag"; kind: FlagKind; label: string }
  | { t: "list"; items: readonly string[] };

const na = (reason?: string): Cell => ({ t: "na", ...(reason === undefined ? {} : { reason }) });
const np = (fe: NotPublishedId, what?: string): Cell => ({ t: "np", fe, ...(what === undefined ? {} : { what }) });
const text = (value: string): Cell => ({ t: "text", text: value });
const flag = (kind: FlagKind, label: string): Cell => ({ t: "flag", kind, label });

/* ── small helpers ────────────────────────────────────────────────────────── */

export function humanize(code: string): string {
  const words = code.replace(/[_-]+/g, " ").trim().toLowerCase();
  return words === "" ? code : words.charAt(0).toUpperCase() + words.slice(1);
}

/** A server link that is safe to render: an in-app path (one leading slash, no scheme). Shared with Sandbox and Canary. */
export { safeInternalHref } from "../../safeHref";

export function canaryHref(deploymentId: string): string {
  return `/deployments/live/${encodeURIComponent(deploymentId)}/canary`;
}

/** An ISO instant to the house style, or `null` when it does not parse. */
function instantOf(iso: string | null): UtcEpochMs | null {
  if (iso === null) return null;
  const ms = Date.parse(iso);
  return readUtcEpochMs(ms);
}
function whenText(iso: string | null): string | null {
  const ms = instantOf(iso);
  return ms === null ? null : formatAsOf(ms);
}

/** The sentence for a published blocker code. A code with no sentence reads generically and keeps its code in Provenance. */
const BLOCKER_SENTENCE: Readonly<Record<string, string>> = {
  PRODUCTION_COMMAND_INACTIVE: "Commands are closed on this build.",
  READ_NOT_COMMAND_AUTHORITY: "Commands are closed on this build.",
  LIVE_FULL_ACTIVATION_NOT_APPROVED: "Live activation is not approved.",
  CANARY_EXIT_EVIDENCE_UNAVAILABLE: "Canary exit evidence is not available.",
  LIVE_SOURCE_UNAVAILABLE: "The live source is not available.",
  SOURCE_CONTINUITY_UNAVAILABLE: "Update continuity is not available.",
  BROKER_STATE_UNAVAILABLE: "The broker state is not available.",
  ROLLBACK_EVIDENCE_UNAVAILABLE: "Rollback evidence is not available.",
  PROTECTIVE_CAPABILITY_UNAVAILABLE: "Protective actions are not available.",
  EX_BE_08_PENDING: "A backend delivery is still pending.",
  REALTIME_INACTIVE: "Realtime updates are off.",
  SOURCE_RUNTIME_ACTIVATION_NOT_ASSERTED: "The source does not assert that the deployment is running.",
  FINITE_SCOPED_READ_NOT_STREAM_AUTHORITY: "This read is a snapshot, not a live stream.",
};
export const BLOCKER_FALLBACK = "A blocker is published without a description.";

export function blockerSentence(code: string): string {
  return Object.hasOwn(BLOCKER_SENTENCE, code) ? BLOCKER_SENTENCE[code]! : BLOCKER_FALLBACK;
}

/* ── the model ────────────────────────────────────────────────────────────── */

export type LiveNoticeKind = "untrusted" | "unqualified" | "stale" | "partial" | "empty" | "retained";
export interface LiveNotice {
  kind: LiveNoticeKind;
  text: string;
}

export interface KpiCell {
  key: string;
  label: string;
  kind: "metric" | "hidden" | "not-published" | "absent";
  metric?: Metric | null;
  suffix?: string;
  basis?: string;
  signed?: boolean;
  absentReason?: string;
}

export type ChartSlotModel =
  | { kind: "mismatch"; findingHref: string | null; reconcileHref: string | null }
  | { kind: "gap" }
  | { kind: "unavailable" };

export interface TriadFigure {
  key: string;
  label: string;
  suffix?: string;
  internal?: TriadCell;
  broker?: TriadCell;
  difference?: TriadCell;
}

export interface TriadModel {
  rows: readonly TriadRow[];
  internal: TriadSide | null;
  broker: TriadSide | null;
  /** The figures disagree: Broker and Difference are not drawn. */
  suppressed: boolean;
  /** True when the source published per-figure rows (never today: FE-072). */
  rowsPublished: boolean;
}

/**
 * `positions` / `orders` of a V1 body. The rows are free objects whose field names the contract does not publish (FE-072), so a
 * table is the source's own members under its own names (`readers/publishedRows.ts`); the typed hi-fi columns stay Not published.
 */
export type V1RowsPanel =
  | { kind: "none" }
  | { kind: "withheld"; text: string }
  | { kind: "table"; table: PublishedRows; caption: string; line: string | null };
export interface V1Rows {
  positions: V1RowsPanel;
  orders: V1RowsPanel;
}

export interface ContinuityRow {
  key: string;
  label: string;
  value: Cell;
}
export interface ContinuityModel {
  flag: { kind: FlagKind; label: string };
  rows: readonly ContinuityRow[];
  provenance: readonly string[];
}

export interface CoverageRow {
  name: LiveSourcePanelName;
  title: string;
  state: "PARTIAL" | "NOT_PUBLISHED";
  reason: string;
  returned: number;
  hasMore: boolean;
}

export interface PredecessorRow {
  key: string;
  label: string;
  approved: Cell;
  applies: Cell;
}
export type PredecessorModel =
  | { present: false; reason: string; canaryHref: string | null }
  | { present: true; activeFlag: { kind: FlagKind; label: string }; meta: string; rows: readonly PredecessorRow[]; canaryHref: string | null };

export interface GuardRuleRow {
  key: string;
  when: string;
  effect: Cell;
  now: Cell;
}

export interface LadderRung {
  key: "halt" | "reduce" | "emergency-close";
  title: string;
  note: string;
  step: string;
}

export interface LiveModel {
  version: "v1" | "v2";
  deploymentId: string | null;
  portfolioId: string | null;
  accountId: string | null;
  venue: string | null;
  /** The stage the body names. `null` when it names none (V2). */
  stage: SpineStageId | null;
  /** V1 names a Canary deployment: the screen says so with a link and does not redirect (D5). */
  inCanary: boolean;
  /** Spine node -> where a click goes. Only what the body links; others do nothing. */
  spineTargets: Partial<Record<SpineStageId, string>>;
  spineBlocked: boolean;
  chips: StageChips;
  notice: LiveNotice | null;
  kpis: readonly KpiCell[];
  chart: ChartSlotModel;
  mismatch: boolean;
  triad: TriadModel | null;
  /** V1 body: its positions and orders; `null` for a V2 body (its panels are in `coverage` and the retained tables). */
  v1Rows: V1Rows | null;
  continuity: ContinuityModel;
  coverage: readonly CoverageRow[];
  predecessor: PredecessorModel;
  guardRules: readonly GuardRuleRow[];
  guardProvenance: readonly string[];
  ladder: readonly LadderRung[];
  gapNote: string | null;
  blockers: readonly BlockerItem[];
  blockerProvenance: readonly string[];
}

export const LADDER: readonly LadderRung[] = [
  { key: "halt", title: "Halt", note: "Stops new orders.", step: "1 of 3" },
  { key: "reduce", title: "Reduce", note: "Trims exposure.", step: "2 of 3" },
  { key: "emergency-close", title: "Emergency close", note: "Closes every position now.", step: "3 of 3" },
];

const TRIAD_LABELS: readonly { key: string; label: string; money: boolean }[] = [
  { key: "equity", label: "Equity", money: true },
  { key: "gross", label: "Gross exposure", money: true },
  { key: "positions", label: "Positions", money: false },
  { key: "orders", label: "Open orders", money: false },
];

/**
 * The one currency the read states for its money figures: the unit every non-count KPI carries, when they agree.
 * `null` when the read states none or two, so a row shows no unit rather than a guessed one.
 */
export function readCurrency(kpis: readonly { unit: string | null }[]): string | null {
  const units = new Set(kpis.map((kpi) => kpi.unit).filter((unit): unit is string => unit !== null && unit !== "" && unit.toUpperCase() !== "COUNT"));
  return units.size === 1 ? [...units][0]! : null;
}

/**
 * The three-column rows. The source publishes no per-figure keys today (FE-072), so with no `figures`
 * every cell is absent and prints `Not available`. When figures exist, Broker and Difference come
 * through only while the broker figures are visible: a withheld figure is dropped here, before any
 * component can print it.
 */
export function buildTriadRows(figures: readonly TriadFigure[] | null, brokerVisible: boolean, currency: string | null = null): TriadRow[] {
  if (figures === null) return TRIAD_LABELS.map((row) => ({ key: row.key, label: row.label, ...(row.money && currency !== null ? { suffix: currency } : {}) }));
  return figures.map((figure) => ({
    key: figure.key,
    label: figure.label,
    ...(figure.suffix ? { suffix: figure.suffix } : {}),
    internal: figure.internal,
    ...(brokerVisible ? { broker: figure.broker, difference: figure.difference } : {}),
  }));
}

/* ── caption of a capped, keyset-paged table ─────────────────────────────── */

/**
 * "Top 200 of 340 rows" when the total is published and larger than what is drawn; when it is not
 * published (every V2 panel: `exact_total` is null) the caption says what is loaded and that the total is
 * not published. A page size is never presented as a total.
 */
export function capCaption(input: { shown: number; loaded: number; total: number | null; hasMore: boolean; noun: string }): string {
  const { shown, loaded, total, hasMore, noun } = input;
  const head = total !== null
    ? shown < total ? `Top ${shown} of ${total} ${noun}` : `${total} ${noun}`
    : shown < loaded ? `Top ${shown} of ${loaded} ${noun} loaded` : `${loaded} ${noun} loaded`;
  const tail = total === null ? " · total not published" : "";
  return `${head}${tail}${hasMore ? " · more available" : " · no further page"}`;
}

/* ── V1 ───────────────────────────────────────────────────────────────────── */

const KPI_SLOTS: readonly { key: string; label: string; signed: boolean }[] = [
  { key: "capital", label: "Capital", signed: false },
  { key: "gross_notional", label: "Gross notional", signed: false },
  { key: "daily_pnl", label: "Daily PnL", signed: true },
  { key: "open_orders", label: "Open orders", signed: false },
  { key: "broker_equity", label: "Broker equity", signed: false },
];

const AUTHORITY_WORD: Readonly<Record<string, string>> = { EXECUTION: "Execution figure", BROKER: "Broker figure", DERIVED: "Derived figure", PORTAL: "Portal figure", RESEARCH: "Research figure" };

function stageOf(declared: string | null): SpineStageId | null {
  const word = (declared ?? "").toUpperCase();
  if (word === "") return null;
  if (word.includes("CANARY")) return "canary";
  if (word.startsWith("LIVE")) return "live";
  return null;
}

function runtimeChip(state: string | null): StageChipValue {
  if (state === null) return { state: "not-published", id: "FE-067", detail: "Runtime state" };
  switch (state.toUpperCase()) {
    // ACTIVE says the deployment was activated; it does not say it is running. Only the word RUNNING is "Running".
    case "ACTIVE":
      return { state: "flag", kind: "neutral", label: "Active" };
    case "RUNNING":
      return { state: "flag", kind: "ok", label: "Running" };
    case "HALTED":
      return { state: "flag", kind: "attention", label: "Halted" };
    case "REDUCING":
      return { state: "flag", kind: "pending", label: "Reducing" };
    default:
      return { state: "flag", kind: "unknown", label: humanize(state) };
  }
}

function freshnessChip(panel: LivePanel | undefined): StageChipValue {
  const envelope = panel?.envelope;
  if (envelope === undefined || envelope.freshness === null || envelope.freshness === "UNKNOWN") {
    return { state: "not-available", reason: "Freshness not published" };
  }
  // A panel that is withheld or failed makes no claim about its data, whatever freshness word it carries.
  if (envelope.suppressed) return { state: "not-available", reason: "Withheld by the server" };
  if (envelope.panelState === "unavailable" || envelope.panelState === "denied" || envelope.panelState === "terminal") {
    return { state: "not-available", reason: "Source unavailable" };
  }
  const at = whenText(envelope.asOf);
  const suffix = at === null ? "" : ` · ${at}`;
  switch (envelope.freshness) {
    case "OK": return { state: "dot", tone: "ok", text: `Fresh${suffix}` };
    case "AGING": return { state: "dot", tone: "warn", text: `Aging${suffix}` };
    case "STALE": return { state: "dot", tone: "warn", text: `Stale${suffix}` };
    default: return { state: "not-available", reason: "Freshness not published" };
  }
}

function reconciliationChip(live: LiveFullOperations): StageChipValue {
  const c = live.brokerConsistency;
  if (c === null) return { state: "not-available", reason: "No broker verdict published" };
  if (c.state === "MISMATCH") return { state: "flag", kind: "attention", label: "Mismatch" };
  if (c.state === "IN_SYNC" && c.brokerValuesVisible) return { state: "flag", kind: "ok", label: "Matched" };
  // UNAVAILABLE, an unknown word, or an in-sync verdict that does not release the broker figures: not a match.
  return { state: "flag", kind: "unknown", label: "Not checked" };
}

function kpiCellV1(slot: (typeof KPI_SLOTS)[number], live: LiveFullOperations, mismatch: boolean): KpiCell {
  const kpi = live.kpis.find((k) => k.key === slot.key);
  if (kpi === undefined) return { key: slot.key, label: slot.label, kind: "not-published" };
  const label = kpi.label || slot.label;
  if (kpi.suppressed) {
    return mismatch
      ? { key: slot.key, label, kind: "hidden", basis: "While figures disagree" }
      : { key: slot.key, label, kind: "absent", absentReason: "Broker state not available" };
  }
  if (kpi.value === null) return { key: slot.key, label, kind: "not-published" };
  const isCount = (kpi.unit ?? "").toUpperCase() === "COUNT";
  const metric = readMetric({ state: "AVAILABLE", value: kpi.value }, { unit: isCount ? "count" : "money" });
  const basis = kpi.authority === null ? undefined : AUTHORITY_WORD[kpi.authority];
  return {
    key: slot.key,
    label,
    kind: "metric",
    metric,
    ...(isCount || kpi.unit === null ? {} : { suffix: kpi.unit }),
    ...(basis === undefined ? {} : { basis }),
    signed: slot.signed,
  };
}

function sideOf(panel: LivePanel | undefined): TriadSide | null {
  if (panel === undefined) return null;
  const state = panel.envelope.panelState;
  if (state !== "ok" && state !== "partial" && state !== "stale") return null;
  return { asOf: instantOf(panel.envelope.asOf) };
}

function continuityV1(live: LiveFullOperations): ContinuityModel {
  const c = live.projectionContinuity;
  const gap = c?.gapDetected ?? null;
  const lastUpdate = whenText((live.panels.internal ?? live.panels.broker)?.envelope.asOf ?? null);
  const stateWord = c?.state ?? null;
  const flagOf = (): { kind: FlagKind; label: string } => {
    if (stateWord === null) return { kind: "na", label: "Not available" };
    switch (stateWord) {
      case "CONTIGUOUS": return { kind: "ok", label: "Continuous" };
      case "GAP": return { kind: "partial", label: "Gap" };
      case "UNAVAILABLE": return { kind: "na", label: "Not available" };
      default: return { kind: "unknown", label: humanize(stateWord) };
    }
  };
  const rows: ContinuityRow[] = [
    {
      key: "state",
      label: "State",
      value: gap === true ? text("Gap in updates") : gap === false ? text("Continuous") : na("The server could not tell whether updates are continuous"),
    },
    {
      key: "window",
      label: "Gap window",
      value: gap === true ? np("FE-072", "Gap window") : gap === false ? text("None") : na(),
    },
    { key: "last", label: "Last update", value: lastUpdate === null ? na("No source clock published") : text(lastUpdate) },
    {
      key: "sources",
      label: "Affected sources",
      value: c === null || c.affectedAuthorities.length === 0
        ? na()
        : { t: "list", items: c.affectedAuthorities.map(humanize) },
    },
  ];
  const provenance: string[] = [];
  if (c !== null) {
    provenance.push(`Epoch ${c.epoch ?? "not published"} · sequence ${c.sequence === null ? "not published" : String(c.sequence)}`);
    if (c.blockerCodes.length > 0) provenance.push(c.blockerCodes.join(" · "));
  }
  return { flag: flagOf(), rows, provenance };
}

function predecessorV1(live: LiveFullOperations, id: string | null): PredecessorModel {
  const link = id === null ? null : canaryHref(id);
  const p = live.predecessorEnvelope;
  if (p === null) {
    return { present: false, reason: "No predecessor Canary envelope was published for this deployment.", canaryHref: link };
  }
  const applies: Cell = p.activeForLiveFull ? text("Yes") : text("No");
  const cap = (value: string | null): Cell => {
    if (value === null) return na("Not published for this envelope");
    const metric = readMetric({ state: "AVAILABLE", value }, { unit: "money" });
    if (metric === null || metric.kind !== "value") return na("Unreadable value");
    return text(`${metric.decimal.display}${p.currency ? ` ${p.currency}` : ""}`);
  };
  const meta = [p.revision === null ? null : `Revision ${p.revision}`, p.status === null ? null : humanize(p.status)].filter((x): x is string => x !== null).join(" · ");
  return {
    present: true,
    activeFlag: p.activeForLiveFull ? { kind: "ok", label: "Active for Live" } : { kind: "na", label: "Not active for Live" },
    meta,
    rows: [
      { key: "capital", label: "Capital cap", approved: cap(p.capitalCap), applies },
      { key: "gross", label: "Gross notional cap", approved: cap(p.grossNotionalCap), applies },
      { key: "loss", label: "Daily loss cap", approved: cap(p.dailyLossCap), applies },
    ],
    canaryHref: link,
  };
}

function guardRulesV1(live: LiveFullOperations): { rows: GuardRuleRow[]; provenance: string[] } {
  const c = live.brokerConsistency;
  const policy = live.commandPolicy;
  const r4 = policy?.riskIncreasing ?? null;
  const r3 = policy?.protective ?? null;
  const gap = live.projectionContinuity?.gapDetected ?? null;

  const mismatchNow: Cell = c === null
    ? na()
    : c.state === "MISMATCH" ? flag("attention", "Active")
    : c.state === "IN_SYNC" && c.brokerValuesVisible ? flag("ok", "Not active")
    : flag("unknown", "Not checked");
  const gapNow = (blocks: boolean): Cell => (!blocks ? flag("ok", "Always") : gap === true ? flag("attention", "Active") : gap === false ? flag("ok", "Not active") : na("The server could not tell"));

  const rows: GuardRuleRow[] = [
    { key: "mismatch", when: "Internal and broker figures disagree", effect: text("Broker values are hidden"), now: mismatchNow },
    {
      key: "gap-r4",
      when: "Updates have a gap",
      effect: r4 === null ? np("FE-072", "Risk-increasing rule") : text(r4.sourceGapBlocks ? "Risk-increasing actions are blocked" : "Risk-increasing actions are not blocked by a gap"),
      now: r4 === null ? na() : r4.sourceGapBlocks ? gapNow(true) : flag("ok", "Not active"),
    },
    {
      key: "gap-r3",
      when: "Updates have a gap",
      effect: r3 === null ? np("FE-072", "Protective rule") : text(r3.sourceGapBlocks ? "Protective actions are blocked" : "Protective actions stay open"),
      now: r3 === null ? na() : gapNow(r3.sourceGapBlocks),
    },
  ];
  const provenance = [policy?.guardSemantics ?? null, c?.mismatchBehavior ?? null].filter((x): x is string => x !== null);
  return { rows, provenance };
}

/** What a gap does, from the policy flags the body carries; a rule the body does not carry is not described. */
export function gapNoteV1(live: LiveFullOperations): string {
  const r4 = live.commandPolicy?.riskIncreasing ?? null;
  const r3 = live.commandPolicy?.protective ?? null;
  const first = r4 === null
    ? "A gap is open; whether it blocks risk-increasing actions is not published."
    : r4.sourceGapBlocks ? "A gap blocks risk-increasing actions." : "A gap does not block risk-increasing actions.";
  const second = r3 === null
    ? "Whether it blocks protective actions is not published."
    : r3.sourceGapBlocks ? "Protective actions are blocked too." : "Protective actions stay open.";
  return `${first} ${second}`;
}

function blockersV1(live: LiveFullOperations, mismatch: boolean, gap: boolean | null): { items: BlockerItem[]; provenance: string[] } {
  const items: BlockerItem[] = [];
  const seen = new Set<string>();
  const addCode = (code: string) => {
    if (seen.has(code)) return;
    seen.add(code);
    items.push({ key: `code:${code}`, text: blockerSentence(code), code });
  };
  if (!live.productionCommandActive) addCode("PRODUCTION_COMMAND_INACTIVE");
  if (mismatch) items.push({ key: "mismatch", text: "Internal and broker figures disagree." });
  const r4 = live.commandPolicy?.riskIncreasing ?? null;
  if (gap === true && r4?.sourceGapBlocks === true) items.push({ key: "gap", text: "Risk-increasing actions are blocked until the gap closes." });
  for (const code of live.lifecycleBlockers) addCode(code);
  for (const code of live.brokerConsistency?.blockerCodes ?? []) addCode(code);
  for (const code of live.projectionContinuity?.blockerCodes ?? []) addCode(code);
  for (const code of live.realtimeBlockers) addCode(code);
  const provenance = [`Deployment ${live.deploymentId ?? "not stated"} · stage ${live.declaredStage ?? "not stated"}`];
  const withheldCount = live.suppressedBrokerFields.length + live.withheldRows.length;
  if (withheldCount > 0) provenance.push(`${withheldCount} broker figure(s) were withheld before reaching this screen`);
  return { items, provenance };
}

/** "2 of 5,000", or what is loaded when the server published no exact total. A cut list says it is cut. */
export function rowsCaption(shown: number, loaded: number, total: number | null): string {
  if (total !== null) return `${shown.toLocaleString("en-US")} of ${total.toLocaleString("en-US")}`;
  return loaded > shown ? `Top ${shown.toLocaleString("en-US")} of ${loaded.toLocaleString("en-US")} loaded · total not published` : `${shown.toLocaleString("en-US")} shown · total not published`;
}

function rowsPanelV1(live: LiveFullOperations, key: "positions" | "orders", collection: RowCollection | null, mismatch: boolean): V1RowsPanel {
  if (collection === null) return { kind: "none" };
  // The reader emptied a BROKER-authored collection while suppression is on; say why, in the same words as a suppressed KPI.
  if (live.withheldRows.includes(key)) {
    return { kind: "withheld", text: mismatch ? "Hidden while the figures disagree." : "Not available · broker state not available" };
  }
  const envelope = collection.envelope;
  if (envelope.suppressed) return { kind: "withheld", text: "Withheld by the server." };
  const table = publishedRowsOf(collection);
  if (table === null) return { kind: "withheld", text: envelope.panelState === "terminal" ? "Not available · the source read failed" : "Not available · source unavailable" };
  const line = envelope.panelState === "partial"
    ? "Partial: the source reported only part of it."
    : envelope.panelState === "stale"
      ? "Stale: the source has not updated within its freshness budget."
      : null;
  const shown = Math.min(table.rows.length, ROW_CAP);
  return { kind: "table", table, caption: rowsCaption(shown, table.rows.length, table.total), line };
}

function noticeV1(live: LiveFullOperations, mismatch: boolean): LiveNotice | null {
  if (live.sourceSideEffectRequested || live.runtimeActivationRequested || live.promotionExecutionRequested) {
    return { kind: "untrusted", text: "Not trusted. This response says a source action was requested. This screen never requests one, so the figures below are not trusted." };
  }
  if (live.sourceIntegrationState !== "SOURCE_BACKED") {
    return { kind: "unqualified", text: "Source not qualified. Figures stay unavailable until it is." };
  }
  const watched = [live.panels.internal, live.panels.broker].filter((p): p is LivePanel => p !== undefined);
  const stale = watched.find((p) => p.envelope.freshness === "STALE");
  if (stale !== undefined) {
    const at = whenText(stale.envelope.asOf);
    return { kind: "stale", text: at === null ? "Showing data that has not updated recently." : `Showing data as of ${at}. The source has not updated recently.` };
  }
  const panels = Object.values(live.panels);
  const reported = panels.filter((p) => p.envelope.panelState === "ok").length;
  if (panels.length > 0 && reported < panels.length && !mismatch) {
    return { kind: "partial", text: `Some figures are missing. ${reported} of ${panels.length} sources reported.` };
  }
  return null;
}

export function liveModelV1(live: LiveFullOperations): LiveModel {
  const c = live.brokerConsistency;
  const mismatch = c !== null && c.state === "MISMATCH";
  const brokerVisible = c !== null && c.brokerValuesVisible;
  const gap = live.projectionContinuity?.gapDetected ?? null;
  const brokerPanel = live.panels.broker;
  // "Hidden while the figures disagree" is a claim of disagreement: only MISMATCH makes it. A broker that is
  // simply not verified reads "Not available" (its figures are withheld by the reader all the same).
  const suppressed = mismatch;
  const id = live.deploymentId;
  const stage = stageOf(live.declaredStage);
  const targets: Partial<Record<SpineStageId, string>> = {};
  if (id !== null) targets.canary = canaryHref(id);
  for (const item of live.lineage) {
    const href = safeInternalHref(item.href);
    if (href === null) continue;
    if (item.kind === "R1_APPROVAL") targets.r1 = href;
    else if (item.kind === "R2_APPROVAL") targets.r2 = href;
    else if (item.kind === "SANDBOX_EXIT") targets.sandbox = href;
  }
  const guard = guardRulesV1(live);
  const blockers = blockersV1(live, mismatch, gap);
  return {
    version: "v1",
    deploymentId: id,
    portfolioId: live.portfolioId,
    accountId: live.accountId,
    venue: live.venue,
    stage,
    inCanary: stage === "canary",
    spineTargets: targets,
    spineBlocked: mismatch || gap === true,
    chips: { runtime: runtimeChip(live.runtimeState), freshness: freshnessChip(live.panels.internal ?? live.panels.broker), reconciliation: reconciliationChip(live) },
    notice: noticeV1(live, mismatch),
    kpis: KPI_SLOTS.map((slot) => kpiCellV1(slot, live, mismatch)),
    chart: mismatch
      ? { kind: "mismatch", findingHref: safeInternalHref(c?.findingHref), reconcileHref: safeInternalHref(c?.dryRunReconcileHref) }
      : gap === true ? { kind: "gap" } : { kind: "unavailable" },
    mismatch,
    triad: {
      rows: buildTriadRows(null, brokerVisible, readCurrency(live.kpis)),
      internal: sideOf(live.panels.internal),
      broker: brokerVisible ? sideOf(brokerPanel) : null,
      suppressed,
      rowsPublished: false,
    },
    v1Rows: { positions: rowsPanelV1(live, "positions", live.positionRows, mismatch), orders: rowsPanelV1(live, "orders", live.orderRows, mismatch) },
    continuity: continuityV1(live),
    coverage: [],
    predecessor: predecessorV1(live, id),
    guardRules: guard.rows,
    guardProvenance: guard.provenance,
    ladder: LADDER,
    gapNote: gap === true ? gapNoteV1(live) : null,
    blockers: blockers.items,
    blockerProvenance: blockers.provenance,
  };
}

/* ── V2 ───────────────────────────────────────────────────────────────────── */

const PANEL_TITLES: Readonly<Record<LiveSourcePanelName, string>> = {
  deployments: "Deployments",
  positions: "Positions",
  sessions: "Sessions",
  orders: "Orders",
  fills: "Fills",
  accounts: "Accounts",
  account_balances: "Account balances",
  margin_balances: "Margin balances",
  account_sync: "Account sync",
  reconciliation: "Reconciliation observations",
  broker_sync: "Broker sync",
};
export const panelTitle = (name: LiveSourcePanelName): string => PANEL_TITLES[name];

const PANEL_NOUN: Readonly<Record<LiveSourcePanelName, string>> = {
  deployments: "rows", positions: "positions", sessions: "sessions", orders: "orders", fills: "fills", accounts: "accounts",
  account_balances: "balances", margin_balances: "balances", account_sync: "rows", reconciliation: "observations", broker_sync: "rows",
};
export const panelNoun = (name: LiveSourcePanelName): string => PANEL_NOUN[name];

const REASON_WORDS: Readonly<Record<string, string>> = {
  AUTHORIZED_RETAINED_OBSERVATIONS_ONLY: "Retained observations you are authorized to see, not the full history.",
  NO_AUTHORIZED_RETAINED_OBSERVATION: "No retained observation is available to you.",
  SOURCE_PANEL_NOT_CAPTURED: "The source did not capture this panel.",
  DEPLOYMENT_GRAIN_NOT_PROVEN: "The source does not prove this panel at deployment grain.",
  BROKER_PURPOSE_NOT_COMMISSIONED: "The broker purpose is not commissioned.",
};
export function panelReason(code: string): string {
  return Object.hasOwn(REASON_WORDS, code) ? REASON_WORDS[code]! : "The source gave no description for this state.";
}

/** The tab a panel's table sits on. `broker_sync` is not commissioned and has no table. */
export const PANEL_TAB: Readonly<Record<Exclude<LiveSourcePanelName, "broker_sync">, LiveTabKey>> = {
  positions: "exposure-orders", orders: "exposure-orders", fills: "exposure-orders", account_balances: "exposure-orders", margin_balances: "exposure-orders",
  sessions: "continuity", reconciliation: "continuity", account_sync: "continuity", deployments: "continuity", accounts: "continuity",
};
export const EXPOSURE_PANELS: readonly LiveSourcePanelName[] = ["positions", "orders", "fills", "account_balances", "margin_balances"];
export const CONTINUITY_PANELS: readonly LiveSourcePanelName[] = ["sessions", "reconciliation", "account_sync", "deployments", "accounts"];

/** Panel fields a table never draws: constants of the deployment (identity is in the header) and the mode. */
const HIDDEN_FIELDS: ReadonlySet<string> = new Set(["mode", "strategy_id", "deployment_id"]);
const FIELD_ORDER: readonly string[] = [
  "instrument_id", "side", "signed_qty", "quantity", "avg_px_open", "avg_px_close", "mark_price", "price", "notional", "realized_pnl", "unrealized_pnl",
  "position_id", "order_id", "fill_id", "state", "status", "submitted_count", "risk_rejected_count", "broker_rejected_count", "filled_count",
  "total", "free", "locked", "initial", "maintenance", "currency", "base_currency", "venue", "account_id", "portfolio_id",
  "created_at_ms", "updated_at_ms", "trade_time_ms",
];
const FIELD_LABEL: Readonly<Record<string, string>> = {
  instrument_id: "Symbol", side: "Side", signed_qty: "Signed quantity", quantity: "Quantity", avg_px_open: "Entry", avg_px_close: "Exit price",
  mark_price: "Mark", price: "Price", notional: "Notional", realized_pnl: "Realised PnL", unrealized_pnl: "Unrealised PnL", position_id: "Position",
  order_id: "Order", fill_id: "Fill", state: "State", status: "Status", submitted_count: "Submitted", risk_rejected_count: "Risk rejected",
  broker_rejected_count: "Broker rejected", filled_count: "Filled", total: "Total", free: "Free", locked: "Locked", initial: "Initial margin",
  maintenance: "Maintenance margin", currency: "Currency", base_currency: "Base currency", venue: "Venue", account_id: "Account",
  portfolio_id: "Portfolio", created_at_ms: "Created", updated_at_ms: "Updated", trade_time_ms: "Trade time",
};
const QUANTITY_FIELDS: ReadonlySet<string> = new Set(["signed_qty", "quantity"]);

export interface PanelColumn {
  field: string;
  label: string;
  numeric: boolean;
}

/** The columns a panel's rows need: only fields some row carries, in one fixed order. Unknown fields are never invented. */
export function panelColumns(records: readonly LiveSourceRecordV2[]): PanelColumn[] {
  const present = new Set<string>();
  for (const record of records) for (const field of Object.keys(record.values)) if (!HIDDEN_FIELDS.has(field)) present.add(field);
  const ordered = FIELD_ORDER.filter((field) => present.has(field));
  return ordered.map((field) => ({ field, label: FIELD_LABEL[field] ?? humanize(field), numeric: isNumericField(field) }));
}

function isNumericField(field: string): boolean {
  return !["instrument_id", "side", "state", "status", "currency", "base_currency", "venue", "account_id", "portfolio_id", "position_id", "order_id", "fill_id", "created_at_ms", "updated_at_ms", "trade_time_ms"].includes(field);
}

export type PanelCell =
  | { kind: "absent" }
  | { kind: "text"; text: string }
  | { kind: "side"; label: string }
  | { kind: "metric"; metric: Metric | null; suffix?: string }
  | { kind: "instant"; label: string };

/** One value, typed for the screen. A decimal keeps its exact string (the boundary formats it); an absent value stays absent. */
export function panelCell(field: string, value: LiveSourceValueV2 | undefined): PanelCell {
  if (value === undefined || value.kind === "absent") return { kind: "absent" };
  switch (value.kind) {
    case "text":
      return field === "side" ? { kind: "side", label: humanize(value.text) } : { kind: "text", text: field === "state" || field === "status" ? humanize(value.text) : value.text };
    case "decimal":
      return { kind: "metric", metric: readMetric({ state: "AVAILABLE", value: value.exact }, { unit: QUANTITY_FIELDS.has(field) ? "qty" : "money" }) };
    case "counter":
      return { kind: "metric", metric: readMetric({ state: "AVAILABLE", value: value.exact }, { unit: "count" }) };
    case "instant":
      return { kind: "instant", label: formatAsOf(value.at) };
  }
}

function coverageOf(v2: LiveSourceOperationsV2): CoverageRow[] {
  return (Object.keys(v2.panels) as LiveSourcePanelName[]).map((name) => {
    const panel: LiveSourcePanelV2 = v2.panels[name];
    return { name, title: panelTitle(name), state: panel.state, reason: panelReason(panel.reasonCode), returned: panel.returnedCount, hasMore: panel.hasMore };
  });
}

export function liveModelV2(v2: LiveSourceOperationsV2): LiveModel {
  const coverage = coverageOf(v2);
  const withRecords = coverage.filter((row) => row.returned > 0).length;
  const notice: LiveNotice = withRecords === 0
    ? { kind: "empty", text: "No retained observation is published for this deployment yet." }
    : { kind: "retained", text: "Retained observations only. The source has not asserted a verdict, a runtime state or completeness." };
  const items: BlockerItem[] = [
    { key: "commands", text: blockerSentence("READ_NOT_COMMAND_AUTHORITY"), code: "READ_NOT_COMMAND_AUTHORITY" },
    { key: "runtime", text: blockerSentence(v2.runtimeReasonCode), code: v2.runtimeReasonCode },
    { key: "stream", text: blockerSentence("FINITE_SCOPED_READ_NOT_STREAM_AUTHORITY"), code: "FINITE_SCOPED_READ_NOT_STREAM_AUTHORITY" },
  ];
  return {
    version: "v2",
    deploymentId: v2.deploymentId,
    portfolioId: null,
    accountId: null,
    venue: null,
    stage: null,
    inCanary: false,
    spineTargets: { canary: canaryHref(v2.deploymentId) },
    spineBlocked: false,
    chips: {
      runtime: { state: "not-published", id: "FE-067", detail: "Activation not asserted" },
      freshness: { state: "not-available", reason: "Source clock is not scoped" },
      reconciliation: { state: "not-available", reason: "Source verdict not asserted" },
    },
    notice,
    kpis: KPI_SLOTS.map((slot) => ({ key: slot.key, label: slot.label, kind: "not-published" as const })),
    chart: { kind: "unavailable" },
    mismatch: false,
    triad: null,
    v1Rows: null,
    continuity: {
      flag: { kind: "na", label: "Not available" },
      rows: [
        { key: "state", label: "State", value: na("This read does not assert update continuity") },
        { key: "window", label: "Gap window", value: np("FE-072", "Gap window") },
        { key: "last", label: "Last update", value: na("The source clock is not scoped") },
        { key: "sources", label: "Affected sources", value: na() },
      ],
      provenance: [`Read by the Portal at ${formatAsOf(v2.observedAt)} (a Portal clock, not the source's)`],
    },
    coverage,
    predecessor: { present: false, reason: "This read does not carry the predecessor Canary envelope.", canaryHref: canaryHref(v2.deploymentId) },
    guardRules: [
      // This read carries no guard policy, so no rule's effect is stated here: the server has not published one.
      { key: "mismatch", when: "Internal and broker figures disagree", effect: np("FE-072", "Broker mismatch rule"), now: na("No broker verdict in this read") },
      { key: "gap-r4", when: "Updates have a gap", effect: np("FE-072", "Risk-increasing rule"), now: na("No continuity verdict in this read") },
      { key: "gap-r3", when: "Updates have a gap", effect: np("FE-072", "Protective rule"), now: na("No continuity verdict in this read") },
    ],
    guardProvenance: ["This read carries no guard policy"],
    ladder: LADDER,
    gapNote: null,
    blockers: items,
    blockerProvenance: [`Deployment ${v2.deploymentId} · retained observations`],
  };
}

/* ── entry ────────────────────────────────────────────────────────────────── */

export type LiveModelOrUnsupported =
  | { kind: "model"; model: LiveModel; v2: LiveSourceOperationsV2 | null }
  | { kind: "unsupported"; read: Extract<LiveFullVersionRead, { kind: "unsupported" }> };

/** The body the port answered, as a model, or the `unsupported` answer unchanged (the screen words it with `unsupportedText`). */
export function liveModelOf(read: LiveFullVersionRead): LiveModelOrUnsupported {
  switch (read.kind) {
    case "v1": return { kind: "model", model: liveModelV1(read.value), v2: null };
    case "v2": return { kind: "model", model: liveModelV2(read.value), v2: read.value };
    case "unsupported": return { kind: "unsupported", read };
  }
}
