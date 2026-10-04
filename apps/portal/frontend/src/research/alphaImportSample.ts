/**
 * Illustrative sample for the Import screen's empty state. A frontend constant,
 * not a server fact: it is the shape the seven gates accept, not a trading
 * strategy. The contract is a Python literal — `True`, never JSON `true`, which
 * gate 1 refuses as "ALPHA_CONTRACT must be a literal object".
 */

export const ALPHA_SOURCE_SAMPLE = `# sample alpha (illustrative)
ALPHA_CONTRACT = {"schema_version":"research.alpha-source.v1","version":"0.1.0","entrypoint":"generate_signals","timeframes":["1h"],"required_columns":["open","high","low","close","volume"],"warmup_bars":32,"determinism":{"seed_required":True},"parameter_space":{"window":{"kind":"int_range","low":8,"high":64,"step":1},"threshold":{"kind":"float_range","low":0.5,"high":2.5,"step":0.25},"mode":{"kind":"categorical","values":["trend","revert"]}}}
def generate_signals(context):
    return context
`;

export interface RequiredField {
  field: string;
  declares: string;
  example: string;
}

/** The eight fields the analyser requires in ALPHA_CONTRACT (research_alpha_analyzer.py), nothing else. */
export const REQUIRED_FIELDS: readonly RequiredField[] = [
  { field: "schema_version", declares: "contract version", example: '"research.alpha-source.v1"' },
  { field: "version", declares: "semantic version", example: '"0.1.0"' },
  { field: "entrypoint", declares: "the one function", example: '"generate_signals"' },
  { field: "timeframes", declares: "bar intervals", example: '["1h"]' },
  { field: "required_columns", declares: "candle columns read", example: '["open", "close", …]' },
  { field: "warmup_bars", declares: "bars before the first signal", example: "32" },
  { field: "determinism", declares: "seed required or not", example: '{"seed_required": True}' },
  { field: "parameter_space", declares: "tunable parameters", example: '{"window": {"kind": "int_range", …}}' },
];
