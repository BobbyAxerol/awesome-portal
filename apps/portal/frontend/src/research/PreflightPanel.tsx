/**
 * Screen 02 · preflight result (P08 composition scope).
 *
 * Everything on this surface is the server's. The panel's whole job is to show
 * the manifest that the browser preview, the submitted spec and the worker
 * input all share — so any number computed here would be a fourth version of
 * a fact that is supposed to have one.
 *
 * Three habits are deliberate and each has a rule behind it:
 *
 *  - **`[start, end)` is written as `[start, end)`.** A half-open range drawn
 *    as `start → end` reads as inclusive, and the bar at `end` is exactly the
 *    one the methodology excludes.
 *  - **Zero is printed; absent is not.** `gaps 0` is a measurement and belongs
 *    on screen. A field the server did not send has no digit at all (§3.3).
 *  - **The server's own disclosures are rendered, never paraphrased.**
 *    `resource_estimate.disclosure`, `sealed_holdout.disclosure` and the
 *    `scope` constant are contract values; a friendlier local rewrite would be
 *    a different claim about compute and about the seal.
 */

import type {
  Capability,
  Fold,
  PreflightResponse,
  Quality,
  ResourceEstimate,
  Snapshot,
  Topology,
  UtcRange,
  Warmup,
} from "./preflightClient";
import { ResearchPanel } from "./ResearchPanel";
import { foldShort, foldTitle, formatUtc } from "./researchFormat";
import type { ResearchState } from "./state";
import { iso } from "./utcMinute";

/* ------------------------------------------------------------------ parts */

/** A half-open UTC interval, written the way the methodology means it. */
export function rangeLabel(range: UtcRange): string {
  return `[${range.start_utc}, ${range.end_exclusive_utc})`;
}

/**
 * An exact integer with thousands separators.
 *
 * Grouping is not abbreviation: every digit stays, nothing is rounded and no
 * unit changes. `268435456 bytes` and `268,435,456 bytes` are the same number,
 * but only one of them can be read at a glance — and a resource estimate whose
 * magnitude cannot be read at a glance is not doing its job. A value that is
 * not a finite number is refused rather than coerced.
 */
export function groupDigits(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  const sign = value < 0 ? "-" : "";
  const digits = String(Math.abs(value));
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function Row({
  label,
  children,
  wide,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 border-b py-[3px] last:border-b-0"
      style={{ borderColor: "var(--line-soft)" }}
      data-fact={label}
    >
      <span
        className="mono flex-none text-[9.5px] uppercase tracking-[.06em]"
        style={{ width: wide ? 172 : 148, color: "var(--ink-faint)" }}
      >
        {label}
      </span>
      <span className="mono flex-1 break-words text-[10.5px]" style={{ color: "var(--ink)" }}>
        {children}
      </span>
    </div>
  );
}

/** A server-declared constant, shown as the fixed fact it is. */
function Constant({ value }: { value: string }) {
  return (
    <span
      className="mono rounded-[3px] border px-1 text-[8.5px] leading-[14px]"
      style={{ color: "var(--ink-soft)", borderColor: "var(--line-strong)" }}
      data-constant={value}
    >
      {value}
    </span>
  );
}

function RangeBar({
  range,
  window: frame,
  tone,
  title,
}: {
  range: UtcRange;
  window: { start: number; end: number };
  tone: string;
  title: string;
}) {
  const span = Math.max(1, frame.end - frame.start);
  const left = ((range.start_utc_ms - frame.start) / span) * 100;
  const width = ((range.end_exclusive_utc_ms - range.start_utc_ms) / span) * 100;
  return (
    <span
      className="absolute top-0 h-full rounded-[2px]"
      style={{ left: `${left}%`, width: `${Math.max(width, 0.4)}%`, background: tone }}
      title={title}
      data-band={title}
    />
  );
}

/* -------------------------------------------------------------- snapshot */

function DataBinding({ snapshot, binding }: { snapshot: Snapshot; binding: PreflightResponse["dataset_binding"] }) {
  return (
    <div className="flex flex-col" data-data-binding>
      <Row label="dataset">
        {binding.dataset_id} · {binding.symbol} · {binding.timeframe}
      </Row>
      <Row label="query">{rangeLabel(snapshot.query)}</Row>
      <Row label="logical range">{rangeLabel(snapshot.logical_range)}</Row>
      <Row label="timezone">
        {snapshot.timezone} · calendar {snapshot.calendar_policy}{" "}
        <Constant value={snapshot.closed_bar_policy} />
      </Row>
      <Row label="columns">{snapshot.columns.join(" · ")}</Row>
      <Row label="rows / bytes">
        {groupDigits(snapshot.row_count)} rows · {groupDigits(snapshot.byte_count)} bytes
      </Row>
      <Row label="snapshot hash">{snapshot.snapshot_content_hash}</Row>
      <Row label="market hash">{snapshot.market_content_hash}</Row>
      <Row label="source manifest">{snapshot.source_manifest_digest}</Row>
    </div>
  );
}

function WarmupRow({ warmup }: { warmup: Warmup }) {
  return (
    <div className="flex flex-col" data-warmup>
      <Row label="warmup">
        {warmup.requested_bars} bars · {rangeLabel(warmup)} <Constant value={warmup.state} />
      </Row>
    </div>
  );
}

/**
 * Quality counters.
 *
 * `passed: true` is a contract constant, so it says nothing about the data — it
 * says the snapshot would not have been sealed otherwise. Rendering it as a
 * green verdict would turn a precondition into a result, which is why the
 * state word is shown beside it.
 */
function QualityCounters({ quality }: { quality: Quality }) {
  return (
    <div className="flex flex-col" data-quality>
      <Row label="rows">{groupDigits(quality.rows)}</Row>
      <Row label="gaps">
        {quality.gaps === null || quality.missing_bar_count === null || quality.gap_ratio === null ? (
          /* An observed-date tape (a source with no published session calendar) measures no gaps: the server says null, never 0. */
          <span title={quality.state}>not measured · observed dates only</span>
        ) : (
          /* The ratio is a measured decimal, so it is printed as the server sent
             it — grouping or rounding it would change the measurement. */
          <>
            {groupDigits(quality.gaps)} · {groupDigits(quality.missing_bar_count)} missing bars · ratio {quality.gap_ratio}
          </>
        )}
      </Row>
      <Row label="duplicates">{quality.duplicates}</Row>
      <Row label="reason codes">
        {quality.reason_codes.length > 0 ? (
          quality.reason_codes.join(" · ")
        ) : (
          /* No codes is a measured result, not a missing field. */
          <span style={{ color: "var(--ink-faint)" }}>none reported</span>
        )}
      </Row>
      <Row label="integrity">
        <Constant value={quality.state} />
      </Row>
    </div>
  );
}

/* -------------------------------------------------------------- topology */

export function foldWindow(topology: Topology): { start: number; end: number } {
  const bounds = topology.folds.flatMap((fold) => [
    fold.train.start_utc_ms,
    fold.outer_oos.end_exclusive_utc_ms,
  ]);
  const sealed = topology.protocol === "three_window_decay" ? topology.sealed_holdout : null;
  if (sealed) bounds.push(sealed.start_utc_ms, sealed.end_exclusive_utc_ms);
  return { start: Math.min(...bounds), end: Math.max(...bounds) };
}

export function FoldRow({
  fold,
  window: frame,
}: {
  fold: Fold;
  window: { start: number; end: number };
}) {
  return (
    <div
      className="flex items-center gap-2.5 border-b py-1 last:border-b-0"
      style={{ borderColor: "var(--line-soft)" }}
      data-fold={fold.fold_id}
      data-fold-state={fold.state}
    >
      <span className="mono flex-none text-[9.5px]" style={{ width: 74, color: "var(--ink-soft)" }} title={foldTitle(fold.fold_id)}>
        {foldShort(fold.fold_id)}
      </span>
      <span
        className="relative h-[10px] flex-1 rounded-[2px]"
        style={{ background: "var(--paper-sunken)", minWidth: 120 }}
      >
        <RangeBar
          range={fold.train}
          window={frame}
          tone="var(--viz-train)"
          title={`train ${rangeLabel(fold.train)}`}
        />
        <RangeBar
          range={fold.outer_oos}
          window={frame}
          tone="var(--role-oos)"
          title={`outer oos ${rangeLabel(fold.outer_oos)}`}
        />
      </span>
      {/* The boundary is fixed; nothing here has been evaluated. */}
      <Constant value={fold.state} />
      {fold.inner_fold_count !== undefined ? (
        <span className="mono flex-none text-[9px]" style={{ color: "var(--ink-soft)" }} data-inner-count={fold.inner_fold_count}>
          {fold.inner_fold_count} inner
        </span>
      ) : null}
    </div>
  );
}

/** CG-P02-02: the engine's guard spans for one fold, as bars and half-open ranges. */
function GuardRow({ fold }: { fold: Fold }) {
  const guards = fold.guards;
  if (!guards) return null;
  const spans = ([["label horizon", guards.label_horizon], ["purge", guards.purge], ["embargo", guards.embargo]] as const)
    .filter(([, range]) => range !== null);
  if (spans.length === 0) return null;
  return (
    <div className="mono flex flex-wrap gap-x-3 pl-[84px] text-[9px]" style={{ color: "var(--ink-faint)" }} data-guards={fold.fold_id}>
      {spans.map(([label, range]) => (
        <span key={label} title={range ? rangeLabel(range) : undefined}>
          {label} {range?.bars ?? "?"} bars
        </span>
      ))}
    </div>
  );
}

function TopologyBlock({ topology }: { topology: Topology }) {
  const frame = foldWindow(topology);
  return (
    <div className="flex flex-col gap-2" data-topology={topology.protocol}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="mono text-[10.5px] font-semibold">{topology.protocol}</span>
        {topology.protocol === "advanced_walk_forward" ? (
          <>
            <span className="mono text-[9.5px]" style={{ color: "var(--ink-soft)" }}>
              frequency {topology.frequency}
            </span>
            <Constant value={topology.window_mode} />
            {topology.train_window ? (
              <span className="mono text-[9.5px]" style={{ color: "var(--ink-soft)" }}>train {topology.train_window}</span>
            ) : null}
            {topology.temporal_guards ? (
              <span className="mono text-[9.5px]" style={{ color: "var(--ink-soft)" }} data-temporal-guards-summary>
                label {topology.temporal_guards.label_horizon_bars} · purge {topology.temporal_guards.purge_bars} · embargo{" "}
                {topology.temporal_guards.embargo_bars} bars
              </span>
            ) : null}
            {topology.plan_source ? (
              <span className="mono text-[9px]" style={{ color: "var(--ink-faint)" }} title={topology.plan_source} data-plan-source>
                engine-built plan
              </span>
            ) : null}
          </>
        ) : null}
        <span className="mono text-[9.5px]" style={{ color: "var(--ink-soft)" }}>
          {topology.folds.length} folds
        </span>
        <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }}>
          {topology.topology_digest}
        </span>
      </div>

      <div className="flex flex-col">
        {topology.folds.map((fold) => (
          <div key={fold.fold_id}>
            <FoldRow fold={fold} window={frame} />
            <GuardRow fold={fold} />
          </div>
        ))}
      </div>

      {topology.protocol === "three_window_decay" ? (
        <SealedHoldoutCard holdout={topology.sealed_holdout} />
      ) : (
        /* `advanced_walk_forward` seals nothing, and saying so is not the same
           as showing an empty card where a seal would be. */
        <p className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-no-holdout>
          advanced_walk_forward declares no sealed holdout.
        </p>
      )}
    </div>
  );
}

function SealedHoldoutCard({
  holdout,
}: {
  holdout: Extract<Topology, { protocol: "three_window_decay" }>["sealed_holdout"];
}) {
  return (
    <div
      className="flex flex-col gap-1 rounded-[6px] border-[1.5px] px-3 py-2"
      style={{ borderColor: "var(--role-holdout)", background: "var(--paper)" }}
      data-sealed-holdout
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <span
          className="mono rounded-[3px] border px-[5px] text-[9px] font-bold leading-[15px]"
          style={{ color: "var(--role-holdout)", borderColor: "var(--role-holdout)" }}
        >
          SEALED
        </span>
        <span className="mono text-[10px]">{rangeLabel(holdout)}</span>
        <Constant value={holdout.snapshot_read_state} />
        <Constant value={holdout.evaluation_state} />
      </div>
      {/* The server's own sentence about what the seal means. */}
      <p className="text-[10.5px] leading-[1.5]" style={{ color: "var(--ink-soft)" }} data-holdout-disclosure>
        {holdout.disclosure}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------- CG-P08-06 */

const VERDICT_COLOR: Record<string, string> = { PASS: "var(--good)", WATCH: "var(--accent-2)", CRITICAL: "var(--bad)" };

/**
 * One numeric cell of the gap scan. A count the server did not publish is
 * a typed absence, never a `0` — a window that "misses 0 bars" and a window
 * whose missing-bar count is unknown are different facts.
 */
function GapCount({ value, field }: { value: number | null | undefined; field: string }) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return (
      <td className="py-[2px] pr-2 text-right text-[9px] italic" style={{ color: "var(--ink-faint)" }} data-gap-absent={field}>
        not published
      </td>
    );
  }
  return (
    <td className="mono py-[2px] pr-2 text-right" data-gap-count={field}>
      {groupDigits(value)}
    </td>
  );
}

/** Per-window gap scan of the sealed snapshot (timestamps only, never prices). */
export function GapScanBlock({ scan }: { scan: NonNullable<Snapshot["gap_scan"]> }) {
  if (scan.state === "NOT_PUBLISHED") {
    return (
      <p className="text-[10.5px]" style={{ color: "var(--ink-soft)" }} data-gap-scan="NOT_PUBLISHED">
        <span className="mono text-[9px] font-bold uppercase" style={{ color: "var(--ink-faint)" }}>not published</span>{" "}
        {scan.reason}
      </p>
    );
  }
  const scanned = scan.windows.filter((window) => window.state === "SCANNED");
  const critical = scanned.filter((window) => window.verdict === "CRITICAL").length;
  const watch = scanned.filter((window) => window.verdict === "WATCH").length;
  return (
    <div className="flex flex-col gap-1" data-gap-scan="SCANNED">
      <span className="mono text-[9.5px]" style={{ color: "var(--ink-soft)" }}>
        {scanned.length} windows · {critical} critical · {watch} watch
      </span>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[540px] text-[10px]">
          <thead>
            <tr className="mono text-[8.5px] uppercase tracking-[.06em]" style={{ color: "var(--ink-faint)" }}>
              <th className="pr-2 text-left font-normal">window</th>
              <th className="pr-2 text-right font-normal">bars</th>
              <th className="pr-2 text-right font-normal">expected</th>
              <th className="pr-2 text-right font-normal">missing</th>
              <th className="pr-2 text-right font-normal">gap runs</th>
              <th className="text-left font-normal">verdict</th>
            </tr>
          </thead>
          <tbody>
            {scan.windows.map((window) => (
              <tr key={window.window} className="border-t" style={{ borderColor: "var(--line-soft)" }} data-gap-window={window.window} data-gap-verdict={window.verdict ?? window.state}>
                <td className="mono py-[2px] pr-2">{window.window}</td>
                {window.state === "SEALED" ? (
                  <td colSpan={5} className="py-[2px] italic" style={{ color: "var(--ink-faint)" }}>{window.note}</td>
                ) : (
                  <>
                    <GapCount value={window.bars} field="bars" />
                    <GapCount value={window.expected_bars} field="expected_bars" />
                    <GapCount value={window.missing_bars} field="missing_bars" />
                    <GapCount value={window.gap_runs} field="gap_runs" />
                    <td className="py-[2px]">
                      {window.verdict ? (
                        <span className="mono text-[9px] font-bold" style={{ color: VERDICT_COLOR[window.verdict] ?? "var(--ink-soft)" }}>{window.verdict}</span>
                      ) : (
                        <span className="text-[9px] italic" style={{ color: "var(--ink-faint)" }} data-gap-absent="verdict">verdict not published</span>
                      )}
                      {window.items.length > 0 ? (
                        <span className="mono ml-2 text-[9px]" style={{ color: "var(--ink-faint)" }}>
                          {window.items.map((item) => `${formatUtc(item.start_utc_ms)} · ${item.missing_bars} bar${item.missing_bars === 1 ? "" : "s"}`).join(" / ")}
                          {window.items_omitted > 0 ? ` +${window.items_omitted} more` : ""}
                        </span>
                      ) : null}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {scan.classification ? (
        <p className="text-[9.5px] leading-[1.5]" style={{ color: "var(--ink-faint)" }}>{scan.classification}</p>
      ) : null}
    </div>
  );
}

/** DR-01 read-only seal record; never an unlock control. */
function HoldoutSealBlock({ seal, issuedAt }: { seal: NonNullable<Snapshot["holdout_seal"]>; issuedAt: number | null }) {
  if ("state" in seal) {
    return (
      <p className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-holdout-seal="NOT_DECLARED">
        {seal.reason}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-0.5" data-holdout-seal="SEALED">
      <Row label="seal digest">{seal.seal_digest}</Row>
      <Row label="sealed">{issuedAt ? `${formatUtc(issuedAt)} by the preflight actor` : "at preflight, by its actor"}</Row>
      <Row label="read log">
        {seal.read_log.reads.length} reads <Constant value={seal.read_log.state} />
      </Row>
      <Row label="unlock">
        <Constant value={seal.unlock.state} /> <span className="text-[10px]" style={{ color: "var(--ink-soft)" }}>{seal.unlock.reason}</span>
      </Row>
      <Row label="cap">
        <Constant value={seal.cap.state} /> <span className="text-[10px]" style={{ color: "var(--ink-soft)" }}>{seal.cap.reason}</span>
      </Row>
    </div>
  );
}

/** CG-P08-03: every server gate this manifest passed, as the server named it. */
function GateRows({ gates }: { gates: NonNullable<PreflightResponse["gates"]> }) {
  return (
    <>
    {/* One segment per gate the server named, coloured by its own state — a glance before the rows. */}
    <div className="mb-1.5 flex gap-[2px]" data-gate-strip aria-hidden="true">
      {gates.map((gate) => (
        <span
          key={gate.gate}
          data-gate-segment={gate.state}
          title={`${gate.gate} · ${gate.state}`}
          style={{ flex: 1, height: 6, borderRadius: 2, background: gate.state === "PASS" ? "var(--good)" : gate.state === "FAIL" ? "var(--role-holdout)" : "var(--line-strong)" }}
        />
      ))}
    </div>
    <ol className="flex flex-col" role="list" data-preflight-gates>
      {gates.map((gate) => (
        <li key={gate.gate} className="flex items-baseline gap-2 border-b py-[2px] text-[10.5px] last:border-b-0" style={{ borderColor: "var(--line-soft)" }} data-preflight-gate={gate.gate} data-gate-state={gate.state}>
          <span className="mono w-[14px] flex-none font-bold" style={{ color: gate.state === "PASS" ? "var(--good)" : gate.state === "FAIL" ? "var(--role-holdout)" : "var(--ink-faint)" }}>
            {gate.state === "PASS" ? "✓" : gate.state === "FAIL" ? "✗" : "·"}
          </span>
          <span className="mono flex-none text-[9.5px]" style={{ width: 150, color: "var(--ink-soft)" }}>{gate.gate}</span>
          <span className="flex-1" style={{ color: gate.state === "PASS" ? "var(--ink-soft)" : "var(--ink-faint)" }}>
            {gate.state === "NOT_RECORDED" ? "not recorded — " : gate.state === "NOT_APPLICABLE" ? "n/a — " : ""}
            {gate.message}
          </span>
        </li>
      ))}
    </ol>
    </>
  );
}

/* -------------------------------------------------------------- resource */

function ResourceBlock({ estimate }: { estimate: ResourceEstimate }) {
  return (
    <div className="flex flex-col gap-1.5" data-resource-estimate>
      <div className="flex flex-col">
        <Row label="trials" wide>
          {groupDigits(estimate.trial_count)} × {estimate.seed_count} seed ×{" "}
          {groupDigits(estimate.outer_fold_count)} outer folds ={" "}
          {groupDigits(estimate.evaluation_count)} evaluations
        </Row>
        <Row label="scope" wide>
          {/* Contract constant. The wording is the limit of the claim. */}
          {estimate.scope}
        </Row>
        <Row label="raw frame" wide>
          {groupDigits(estimate.raw_frame_bytes)} bytes
        </Row>
        <Row label="snapshot" wide>
          {groupDigits(estimate.snapshot_bytes)} bytes
        </Row>
        <Row label="memory" wide>
          {groupDigits(estimate.estimated_memory_bytes)} bytes
        </Row>
        <Row label="scratch" wide>
          {groupDigits(estimate.estimated_scratch_bytes)} bytes
        </Row>
        <Row label="cpu" wide>
          {groupDigits(estimate.estimated_cpu_seconds)} s
        </Row>
        <Row label="admission" wide>
          <Constant value={estimate.admission_state} />
        </Row>
        {estimate.ceilings ? (
          <Row label="ceilings" wide>
            trials {groupDigits(estimate.ceilings.trial_ceiling)} · sweep dims {estimate.ceilings.swept_dimensions}/
            {estimate.ceilings.sweep_dimension_ceiling} · folds {estimate.ceilings.outer_fold_ceiling} · cpu{" "}
            {groupDigits(estimate.ceilings.estimated_cpu_seconds_ceiling)} s
          </Row>
        ) : null}
      </div>
      <p className="text-[10.5px] leading-[1.5]" style={{ color: "var(--ink-soft)" }} data-resource-disclosure>
        {estimate.disclosure}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------ capability */

function CapabilityBlock({ capability }: { capability: Capability }) {
  return (
    <div className="flex flex-col" data-capability>
      <Row label="engine release">{capability.engine_release_id}</Row>
      <Row label="catalog digest">{capability.engine_catalog_digest}</Row>
      <Row label="execution route">
        {capability.execution_route} · input {capability.required_input_class}
      </Row>
      <Row label="axes">
        {/* Four axes stay four facts: collapsing them hides who can unblock. */}
        <span className="flex flex-wrap gap-1">
          {(["engine", "integration", "evidence", "admission"] as const).map((axis) => (
            <span
              key={axis}
              className="mono rounded-[3px] border px-1 text-[8.5px] leading-[14px]"
              style={{ color: "var(--ink-soft)", borderColor: "var(--line-strong)" }}
              data-axis={axis}
            >
              {axis} {capability.route_axes[axis]}
            </span>
          ))}
        </span>
      </Row>
      <Row label="optimization">
        {capability.optimization_mode} × {capability.optimization_schedule}
      </Row>
      <Row label="admission">
        <Constant value={capability.preflight_admission} />
      </Row>
    </div>
  );
}

/* ----------------------------------------------------------------- panel */

export interface PreflightPanelProps {
  preflight: PreflightResponse | null;
  state: ResearchState;
  /** Set when the held preview was dropped because the declaration changed. */
  clearedBecause?: string | null;
}

export function PreflightPanel({ preflight, state, clearedBecause }: PreflightPanelProps) {
  return (
    <div className="flex flex-col gap-2.5" data-screen="preflight">
      {clearedBecause && preflight === null ? (
        <p role="status" className="text-[11px]" style={{ color: "var(--role-holdout)" }} data-cleared-note>
          {clearedBecause}
        </p>
      ) : null}

      {preflight?.gates ? (
        <ResearchPanel title="server preflight" meta={`${preflight.gates.filter((gate) => gate.state === "PASS").length} gates passed`} state={state} minBodyHeight={96}>
          <GateRows gates={preflight.gates} />
        </ResearchPanel>
      ) : null}

      <ResearchPanel
        title="preflight"
        meta={preflight ? preflight.schema_version : undefined}
        state={state}
        minBodyHeight={96}
      >
        {preflight ? (
          <div className="flex flex-col">
            <Row label="token" wide>
              {preflight.preflight_token}
            </Row>
            <Row label="expires" wide>
              {iso(preflight.expires_at_utc_ms)}
            </Row>
            <Row label="requested spec" wide>
              {preflight.requested_spec_digest}
            </Row>
            <Row label="effective spec" wide>
              {preflight.effective_spec_digest}
            </Row>
            <Row label="dataset binding" wide>
              {preflight.dataset_binding_digest}
            </Row>
            <Row label="manifest" wide>
              {preflight.manifest_digest}
            </Row>
            <Row label="may create run" wide>
              <span data-may-create={String(preflight.may_create_run)}>{String(preflight.may_create_run)}</span>
            </Row>
            <Row label="intent" wide>
              {preflight.effective_spec.intent.kind} · {preflight.effective_spec.intent.reproduction_semantics}
            </Row>
          </div>
        ) : null}
      </ResearchPanel>

      <ResearchPanel title="data binding &amp; snapshot" state={state} minBodyHeight={110}>
        {preflight ? (
          <div className="flex flex-col gap-1.5">
            <DataBinding snapshot={preflight.snapshot} binding={preflight.dataset_binding} />
            <WarmupRow warmup={preflight.snapshot.warmup} />
          </div>
        ) : null}
      </ResearchPanel>

      <ResearchPanel title="snapshot quality" state={state} minBodyHeight={86}>
        {preflight ? <QualityCounters quality={preflight.snapshot.quality} /> : null}
      </ResearchPanel>

      {preflight?.snapshot.gap_scan ? (
        <ResearchPanel title="gap scan" state={state} minBodyHeight={72}>
          <GapScanBlock scan={preflight.snapshot.gap_scan} />
        </ResearchPanel>
      ) : null}

      {preflight?.snapshot.holdout_seal ? (
        <ResearchPanel title="holdout seal" state={state} minBodyHeight={48}>
          <HoldoutSealBlock seal={preflight.snapshot.holdout_seal} issuedAt={preflight.issued_at_utc_ms ?? null} />
        </ResearchPanel>
      ) : null}

      <ResearchPanel title="engine capability" state={state} minBodyHeight={96}>
        {preflight ? <CapabilityBlock capability={preflight.capability} /> : null}
      </ResearchPanel>

      <ResearchPanel title="topology" state={state} minBodyHeight={110}>
        {preflight ? <TopologyBlock topology={preflight.topology} /> : null}
      </ResearchPanel>

      <ResearchPanel title="resource estimate" state={state} minBodyHeight={110}>
        {preflight ? <ResourceBlock estimate={preflight.resource_estimate} /> : null}
      </ResearchPanel>
    </div>
  );
}
