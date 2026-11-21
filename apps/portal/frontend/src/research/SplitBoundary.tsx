/**
 * Screen 05 · S1 Split — structural boundary only (P08 composition scope).
 *
 * P08 publishes typed topology and sealed-holdout integrity metadata. It does
 * not publish purge or embargo spans, inner folds, θ* digests, a gap scan or
 * any evaluation result, so none of those appear here. P14 owns the completed
 * split screen; this is the boundary it will grow around.
 *
 * Spec 05's first rule governs the whole file: *every fold boundary is an
 * engine fact — the frontend renders dates, it never recomputes one.* So the
 * bars below are positioned from server milliseconds and nothing is derived
 * except the pixel offset itself.
 *
 * The seal is drawn as a seal. Spec 05 pitfall 3 is explicit that a holdout
 * painted like a normal test segment is a lie about what may be read, and
 * pitfall 4 forbids an emoji for it — so it is hatched, labelled `SEALED`, and
 * carries the server's own disclosure sentence.
 */

import type { Fold, SealedHoldout, Topology, UtcRange } from "./preflightClient";
import { ResearchPanel } from "./ResearchPanel";
import { foldWindow, rangeLabel } from "./PreflightPanel";
import { foldShort, foldTitle } from "./researchFormat";
import type { ResearchState } from "./state";

/** Spec 05 §2.7, scoped to what P08 actually supplies. */
export const BOUNDARY_FOOTER =
  "Boundaries come from the engine's fold plan — this screen renders them, it never recomputes a date.";

/** What this surface does not yet know, said plainly rather than left blank. */
export const P08_SCOPE_NOTE =
  "Structural boundary only — purge, embargo, inner folds and the gap scan arrive with the completed split evidence.";

const TRAIN_TONE = "var(--viz-train)";

function offsets(range: UtcRange, frame: { start: number; end: number }) {
  const span = Math.max(1, frame.end - frame.start);
  return {
    left: ((range.start_utc_ms - frame.start) / span) * 100,
    width: Math.max(((range.end_exclusive_utc_ms - range.start_utc_ms) / span) * 100, 0.4),
  };
}

function ProtocolStrip({ topology }: { topology: Topology }) {
  const pairs: [string, string][] = [
    ["protocol", topology.protocol],
    ["outer folds", String(topology.folds.length)],
    ["topology digest", topology.topology_digest],
  ];
  if (topology.protocol === "advanced_walk_forward") {
    pairs.splice(1, 0, ["frequency", topology.frequency], ["window mode", topology.window_mode]);
  }
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1.5" data-protocol-strip>
      {pairs.map(([label, value]) => (
        <span key={label} className="flex items-baseline gap-1.5" data-protocol-fact={label}>
          <span
            className="mono text-[9px] uppercase tracking-[.07em]"
            style={{ color: "var(--ink-faint)" }}
          >
            {label}
          </span>
          <span className="mono text-[10.5px]" style={{ color: "var(--ink)" }}>
            {value}
          </span>
        </span>
      ))}
      {topology.protocol === "three_window_decay" ? (
        <span
          className="mono rounded-[3px] border px-[5px] text-[9px] font-bold leading-[15px]"
          style={{ color: "var(--role-holdout)", borderColor: "var(--role-holdout)", background: "var(--paper)" }}
          title="The sealed span is never read by this screen."
          data-sealed-chip
        >
          holdout {rangeLabel(topology.sealed_holdout)} · SEALED
        </span>
      ) : null}
    </div>
  );
}

function AnatomyRow({
  fold,
  frame,
  sealed,
}: {
  fold: Fold;
  frame: { start: number; end: number };
  sealed: SealedHoldout | null;
}) {
  const train = offsets(fold.train, frame);
  const oos = offsets(fold.outer_oos, frame);
  const seal = sealed ? offsets(sealed, frame) : null;
  return (
    <div
      className="flex items-center gap-2.5 py-[3px]"
      data-anatomy-fold={fold.fold_id}
      data-fold-state={fold.state}
    >
      <span className="mono flex-none text-[9.5px]" style={{ width: 74, color: "var(--ink-soft)" }} title={foldTitle(fold.fold_id)}>
        {foldShort(fold.fold_id)}
      </span>
      <span
        className="relative h-[14px] flex-1 rounded-[2px]"
        style={{ background: "var(--paper-sunken)", minWidth: 140 }}
      >
        <span
          className="absolute top-0 h-full rounded-[2px]"
          style={{ left: `${train.left}%`, width: `${train.width}%`, background: TRAIN_TONE }}
          title={`train ${rangeLabel(fold.train)}`}
          data-segment="train"
        />
        <span
          className="absolute top-0 h-full rounded-[2px]"
          style={{ left: `${oos.left}%`, width: `${oos.width}%`, background: "var(--role-oos)" }}
          title={`outer oos ${rangeLabel(fold.outer_oos)}`}
          data-segment="outer_oos"
        />
        {seal ? (
          /* Hatched and grey, never the teal of a readable segment. */
          <span
            className="absolute top-0 h-full rounded-[2px]"
            style={{
              left: `${seal.left}%`,
              width: `${seal.width}%`,
              backgroundImage:
                "repeating-linear-gradient(135deg, var(--line-strong) 0 3px, transparent 3px 6px)",
              borderLeft: "1px solid var(--role-holdout)",
            }}
            title="SEALED — not read by this screen"
            data-segment="sealed"
          />
        ) : null}
      </span>
      {/* Named, because an unlabelled interval at the end of a fold row reads
          as the fold's whole span rather than as the window it is. */}
      <span className="mono flex-none text-[9px]" style={{ color: "var(--ink-faint)", width: 176 }}>
        oos {rangeLabel(fold.outer_oos)}
      </span>
    </div>
  );
}

export interface SplitBoundaryProps {
  topology: Topology | null;
  state: ResearchState;
}

export function SplitBoundary({ topology, state }: SplitBoundaryProps) {
  const sealed =
    topology && topology.protocol === "three_window_decay" ? topology.sealed_holdout : null;

  return (
    <div className="flex flex-col gap-2.5" data-screen="split-boundary">
      <header className="flex flex-col gap-[3px]">
        <h2
          className="text-[19px] font-light tracking-[-.01em]"
          style={{ fontFamily: "Newsreader, Georgia, serif" }}
        >
          S1 · Split — how the data was cut
        </h2>
        <p
          className="text-[12.5px] italic"
          style={{ fontFamily: "Newsreader, Georgia, serif", color: "var(--ink-faint)" }}
        >
          Every boundary below was fixed before the first trial ran.
        </p>
      </header>

      <ResearchPanel title="protocol" state={state} minBodyHeight={48}>
        {topology ? <ProtocolStrip topology={topology} /> : null}
      </ResearchPanel>

      <ResearchPanel
        title="fold anatomy"
        meta={topology ? `${topology.folds.length} outer folds` : undefined}
        state={state}
        minBodyHeight={110}
      >
        {topology ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-col" data-anatomy>
              {topology.folds.map((fold) => (
                <AnatomyRow
                  key={fold.fold_id}
                  fold={fold}
                  frame={foldWindow(topology)}
                  sealed={sealed}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1" data-legend>
              {[
                ["train", TRAIN_TONE],
                ["outer oos", "var(--role-oos)"],
              ].map(([label, tone]) => (
                <span key={label} className="flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="inline-block h-[8px] w-[14px] rounded-[2px]"
                    style={{ background: tone }}
                  />
                  <span className="mono text-[9px]" style={{ color: "var(--ink-faint)" }}>
                    {label}
                  </span>
                </span>
              ))}
              {sealed ? (
                <span className="flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="inline-block h-[8px] w-[14px] rounded-[2px]"
                    style={{
                      backgroundImage:
                        "repeating-linear-gradient(135deg, var(--line-strong) 0 3px, transparent 3px 6px)",
                    }}
                  />
                  <span className="mono text-[9px]" style={{ color: "var(--ink-faint)" }}>
                    sealed
                  </span>
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
      </ResearchPanel>

      <ResearchPanel title="holdout seal" state={state} minBodyHeight={72}>
        {topology ? (
          sealed ? (
            <div className="flex flex-col gap-1.5" data-seal-card>
              <div className="flex flex-wrap items-baseline gap-2">
                <span
                  className="mono rounded-[3px] border px-[5px] text-[9px] font-bold leading-[15px]"
                  style={{ color: "var(--role-holdout)", borderColor: "var(--role-holdout)" }}
                >
                  SEALED
                </span>
                <span className="mono text-[10.5px]">{rangeLabel(sealed)}</span>
                <span
                  className="mono rounded-[3px] border px-1 text-[8.5px] leading-[14px]"
                  style={{ color: "var(--ink-soft)", borderColor: "var(--line-strong)" }}
                  data-read-state
                >
                  {sealed.snapshot_read_state}
                </span>
                <span
                  className="mono rounded-[3px] border px-1 text-[8.5px] leading-[14px]"
                  style={{ color: "var(--ink-soft)", borderColor: "var(--line-strong)" }}
                  data-evaluation-state
                >
                  {sealed.evaluation_state}
                </span>
              </div>
              {/* The server's sentence about the seal, not a local summary. */}
              <p className="text-[10.5px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>
                {sealed.disclosure}
              </p>
              {/* There is no unlock control in P08, and an inert one would
                  advertise an action this phase cannot perform. */}
              <p className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }}>
                No panel on this screen reads a bar inside this span.
              </p>
            </div>
          ) : (
            <p className="mono text-[10px]" style={{ color: "var(--ink-faint)" }} data-no-seal>
              {topology.protocol} declares no sealed holdout.
            </p>
          )
        ) : null}
      </ResearchPanel>

      <footer className="flex flex-col gap-1">
        <p className="text-[10.5px] leading-[1.5]" style={{ color: "var(--ink-soft)" }} data-boundary-footer>
          {BOUNDARY_FOOTER}
        </p>
        <p className="text-[10.5px] leading-[1.5]" style={{ color: "var(--ink-faint)" }} data-scope-note>
          {P08_SCOPE_NOTE}
        </p>
      </footer>
    </div>
  );
}
