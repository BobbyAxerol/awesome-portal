/**
 * Screen 14 · Code anatomy — reference content (decision `S14-VIS-01`).
 *
 * The HIFI shows four visual groups; the frozen authority model has three
 * functional stages: **parse → seven gates → register/activate**. This module
 * is the fourth group, and the decision recorded with P09 is that it stays
 * *presentation only*:
 *
 *   Render Code anatomy as a substage beneath parse. Do not add a lifecycle
 *   state, an API field, a migration or a backend transition for it.
 *
 * That is why this is a local constant and not a request. Nothing here is a
 * server fact about a particular import: it is the module contract every
 * import is measured against, the same text for every reader, and giving it a
 * lifecycle would invent a fourth authority state the backend does not have.
 *
 * The copy is verbatim from `QuantBT 14 Alpha Import.dc.html`. It is reference
 * documentation, so paraphrasing it would put a second, drifting description
 * of the adapter contract in front of the people writing against it.
 */

/** Which stage a chip's unlock belongs to, for its tone. */
export type UnlockKind = "route" | "gate";

export interface AnatomyUnlock {
  label: string;
  kind: UnlockKind;
}

export interface AnatomySection {
  /** Verbatim section heading from the hi-fi. */
  section: string;
  /** What declaring this section makes available. */
  unlocks: readonly AnatomyUnlock[];
  /** The code sketch, newline-preserved. Not executable and not editable. */
  code: string;
  /** Why the section exists, verbatim. */
  note: string;
}

function unlock(label: string): AnatomyUnlock {
  /* The hi-fi tones a chip gold when it names a gate rather than a route —
     "numba speed" is a perf gate, not a route, which is why it is matched by
     meaning here rather than by the word "gate" alone. */
  return {
    label,
    kind: label.includes("gate") || label === "numba speed" ? "gate" : "route",
  };
}

export const CODE_ANATOMY: readonly AnatomySection[] = [
  {
    section: "specification.py — the immutable thesis",
    unlocks: [unlock("all routes")],
    code: `@dataclass(frozen=True, slots=True)
class StrategySpecification:
    strategy_id · display_name · version
    default_timeframe · required_columns
    structural_contract: dict          # thesis flags: entries, exits,
                                       # atr_filter, hard_stop_loss…
    parameter_space: {name: (low, high, step)}`,
    note: "Provenance for UI and audit — it never re-implements logic. Immutable per version; changing it is a new av_. parameter_space tuples are what New Run's sweep/pin table renders.",
  },
  {
    section: "errors + validators — fail with names, not booleans",
    unlocks: [unlock("quarantine gates")],
    code: `class StrategyParameterError(ValueError)
class StrategyDataError(ValueError)

_validate_input(frame):
    required_columns ⊆ frame.columns
    DatetimeIndex · UTC · monotonic · unique · float64
_validate_params(params):
    raise with the sorted MISSING KEYS listed`,
    note: "The pipeline's smoke gate asserts these raise correctly — an import whose validator swallows errors fails the gate. Portal preflight reuses the same messages verbatim.",
  },
  {
    section: "compute block — pure indicator functions",
    unlocks: [unlock("numba speed")],
    code: `def _rsi(close, length): …     # pure, vectorized
def _atr(high, low, close, n): …
def _rvol(volume, n): …        # no state, no IO`,
    note: "One job each, and NOT optional style: any loop that numpy can vectorize must be vectorized or @njit — the perf gate AST-scans for python-loop indicators and fails the import (QUARANTINED_PERF_FLOOR). The engine core is rust/numba-fast; a slow alpha is a UX regression the pipeline refuses.",
  },
  {
    section: "strategy + risk block — entries, exits, intents",
    unlocks: [unlock("intrabar_bracket"), unlock("dca_ladder")],
    code: `def _entries(ind, p): …   # long: signal_line_crossing
def _exits(ind, p): …     # short/exit: direction_change
def _risk(frame, p):      # OPTIONAL intent columns
    stop_value / take_profit_value / trailing_value
    ladder_level              # 0 flat · 1 base · 2+ safety`,
    note: "Declare only what the thesis has (structural_contract says hard_stop_loss: true, trailing: false — the code must match). Emitting intent columns unlocks intrabar_bracket_v1; ladder levels unlock dca_ladder. No intents ⇒ close_target_v2 only, honestly.",
  },
  {
    section: "public surface — the ONLY two functions the adapter calls",
    unlocks: [unlock("walk_forward"), unlock("signal_notional")],
    code: `def generate_signals(data, params) -> DataFrame:
    _validate_input(data); _validate_params(params)
    return data.copy() + [pos_weight, exit_type, exit_price]
    # input NEVER mutated

def build_walkforward_signal(data, params,
        train_index, test_index, fold) -> Series:
    frame = data.loc[: test_index[-1]]   # CAUSAL CUTOFF
    return sig.reindex(test_index).fillna(0.0)`,
    note: "Output index is exactly test_index; no bar after test_index[-1] is ever read — the no-lookahead gate shifts inputs and asserts signals do not move. pos_weight is -1/0/1 (use_pyramiding=false) or fractional scale.",
  },
  {
    section: "warm_up + hygiene — what is forbidden",
    unlocks: [unlock("determinism gate")],
    code: `def warm_up(params=None): …
    # compile Numba ONCE on a synthetic frame
    # deterministic · side-effect free · idempotent

# forbidden anywhere in the package:
# print/display/plot · mutable module globals
# absolute paths · external IO · unseeded RNG`,
    note: "warm_up runs before timing so compile cost never pollutes a benchmark. The determinism gate runs the package twice seeded and requires byte-identical output.",
  },
];

export interface UnlockRow {
  /** What the module emits. */
  output: string;
  /** Which execution routes that output makes reachable. */
  routes: string;
}

export const UNLOCK_MAP: readonly UnlockRow[] = [
  {
    output: "pos_weight (-1/0/1 or fractional)",
    routes: "signal_notional · pct_equity · walk_forward · train_test_split",
  },
  {
    output: "+ stop_value · take_profit_value · trailing_value",
    routes: "intrabar_bracket_v1 (SL/TP inside the bar, ambiguity flagged)",
  },
  {
    output: "+ ladder_level (0 · 1 · 2+)",
    routes: "dca_ladder (base + safety orders at grid touches)",
  },
  {
    output: "position matrix (per-symbol weights)",
    routes: "portfolio — 6 modes × 8 sizing rules",
  },
  {
    output: "OrderIntent / OrderCommand tape",
    routes: "orders · native_event_lifecycle (OCO, cancel/replace)",
  },
  {
    output: "reactive on_bar kernel",
    routes: "native_event_strategy R0–R3B (wake-driven)",
  },
];

/** Verbatim footer of the unlock panel. */
export const UNLOCK_FOOTER =
  "Routes are capability-gated per release — declare an output the code does not produce and the smoke gate fails, not the run.";

/** Says what this substage is, so it cannot be read as a stage of the import. */
export const ANATOMY_SUBSTAGE_NOTE =
  "Reference for writing the module — not a step of this import. The authority states are parse, the seven gates, then register and activate.";
