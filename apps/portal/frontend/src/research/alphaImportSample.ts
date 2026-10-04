/**
 * Bobby-approved canonical, runnable Delta-RSI reference for the Import screen.
 * One checked-in Python source owns the download/upload and displayed bytes;
 * the browser only copies them, never parses or executes them. Runtime pins,
 * admission and all seven gates remain server-owned.
 */

import deltaRsiReferenceSource from "./samples/deltaRsiReference.py?raw";

export const ALPHA_SOURCE_SAMPLE = deltaRsiReferenceSource;

export interface RequiredField {
  field: string;
  declares: string;
  example: string;
}

/** The eight fields the analyser requires in ALPHA_CONTRACT (research_alpha_analyzer.py), nothing else. */
export const REQUIRED_FIELDS: readonly RequiredField[] = [
  { field: "schema_version", declares: "contract version", example: '"research.alpha-source.v1"' },
  { field: "version", declares: "semantic version", example: '"1.0.0"' },
  { field: "entrypoint", declares: "the Portal entrypoint", example: '"generate_signals"' },
  { field: "timeframes", declares: "bar intervals", example: '["1h"]' },
  { field: "required_columns", declares: "candle columns read", example: '["open", "close", …]' },
  { field: "warmup_bars", declares: "bars before the first signal", example: "256" },
  { field: "determinism", declares: "seed required or not", example: '{"seed_required": True}' },
  { field: "parameter_space", declares: "tunable parameters", example: '{"window": {"kind": "int_range", …}}' },
];
