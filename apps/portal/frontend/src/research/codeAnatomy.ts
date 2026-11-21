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
 * The visual grouping follows the HiFi, but the copy follows the current
 * restricted-definition parser and seven-gate contract. Plain stateless
 * classes/functions now organize the canonical Delta-RSI reference; imports,
 * inheritance, instance state and Numba decorators remain unadmitted.
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
    section: "literal ALPHA_CONTRACT",
    unlocks: [unlock("contract-complete gate")],
    code: `ALPHA_CONTRACT = {"schema_version":"research.alpha-source.v1",
  "version":"1.0.0","entrypoint":"generate_signals","timeframes":["1h","4h","1d"],
  "required_columns":["open","high","low","close","volume"],
  "warmup_bars":256,"determinism":{"seed_required":True},
  "parameter_space":{"window":{"kind":"int_range","low":20,"high":60,"step":2}, …}}`,
    note: "One literal declaration; the server verifies each field.",
  },
  {
    section: "parameters — admitted run pins",
    unlocks: [unlock("parameter-space-sane gate")],
    code: `class DeltaRsiParameters:\n    @staticmethod\n    def read(parameters):\n        # eight declared parameters; no silent defaults\n        return { … }`,
    note: "Exact run pins; missing keys fail.",
  },
  {
    section: "indicators — pure causal arithmetic",
    unlocks: [unlock("no-lookahead-static-scan gate")],
    code: `class DeltaRsiIndicators:\n    @staticmethod\n    def rsi(close, length): …\n    @staticmethod\n    def quadratic_derivative(values, window): …\n    # ema · sma · atr: bounded stateless helpers`,
    note: "Past-only RSI, quadratic derivative, ATR and volume.",
  },
  {
    section: "policy — entries, exits and hard stop",
    unlocks: [unlock("determinism-declared gate")],
    code: `class DeltaRsiPolicy:\n    @staticmethod\n    def target_weight(close, high, low, volume, parameters):\n        # filtered entries; direction-change exits; hard stop\n        return previous_target`,
    note: "Bounded-history reference; not protected full-history kernel parity.",
  },
  {
    section: "entrypoint — typed notional output",
    unlocks: [unlock("entrypoint-importable gate")],
    code: `def generate_signals(context):\n    # only the child supplies past-only history and admitted pins\n    weight = DeltaRsiPolicy.target_weight( … )\n    return {"schema_version":"research.imported-signal-notional-output.v1",\n            "signal_notional":1000.0 * weight}`,
    note: "Fixed target notional; QuantBT owns accounting and metrics.",
  },
  {
    section: "seven ordered gates",
    unlocks: [unlock("quarantine gates")],
    code: `contract-complete · entrypoint-importable · digest-unique\nparameter-space-sane · determinism-declared · data-contract-known\nno-lookahead-static-scan`,
    note: "A FAIL skips later gates; gate 7 static.",
  },
];

export interface UnlockRow {
  /** What the module emits. */
  output: string;
  /** What the current source actually proves; never a route entitlement. */
  routes: string;
}

export const UNLOCK_MAP: readonly UnlockRow[] = [
  { output: "Literal contract", routes: "Fields mirrored; no route admitted yet." },
  { output: "Seven passing gates", routes: "This exact source may be registered." },
  { output: "Admitted version", routes: "Run eligibility comes from preflight." },
];

/** Current-authority disclosure for the reference panel. */
export const UNLOCK_FOOTER =
  "Not runtime proof. Preflight decides admissible routes.";

/** Says what this substage is, so it cannot be read as a stage of the import. */
export const ANATOMY_SUBSTAGE_NOTE =
  "Reference only, not an import step.";
