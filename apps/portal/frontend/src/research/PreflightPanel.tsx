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
import type { ResearchState } from "./state";

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
        {/* The ratio is a measured decimal, so it is printed as the server sent
            it — grouping or rounding it would change the measurement. */}
        {groupDigits(quality.gaps)} · {groupDigits(quality.missing_bar_count)} missing bars · ratio{" "}
        {quality.gap_ratio}
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
      <span className="mono flex-none text-[9.5px]" style={{ width: 74, color: "var(--ink-soft)" }}>
        {fold.fold_id}
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
            {/* Expanding is the only certified window mode; rolling is refused
                by the server, never derived here. */}
            <Constant value={topology.window_mode} />
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
          <FoldRow key={fold.fold_id} fold={fold} window={frame} />
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
              {new Date(preflight.expires_at_utc_ms).toISOString()}
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
