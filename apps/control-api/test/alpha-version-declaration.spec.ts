import { describe, expect, it } from "vitest";

import { P04_DELTA_DECLARED_CONTRACT } from "../src/research/p04-delta.binding";
import {
  projectResearchAlphaVersionDeclaration,
  ResearchAlphaVersionDeclarationError,
} from "../src/research/alpha-version-declaration";

describe("P10 safe AlphaVersion declaration projection", () => {
  it("normalizes the P07 and installed P04 declaration dialects into one generated union", () => {
    expect(projectResearchAlphaVersionDeclaration({
      required_columns: ["open", "high", "low", "close", "volume"],
      warmup_bars: 32,
      schema_version: "research.alpha-source.v1",
      entrypoint: "generate_signals",
      timeframes: ["1h"],
      determinism: { seed_required: true },
      parameter_space: {
        window: { kind: "int_range", low: 8, high: 64, step: 1 },
        regime: { kind: "categorical", values: ["normal", "stress"] },
      },
    }, "generate_signals")).toEqual({
      schema_version: "research.alpha-version-declaration.v1",
      required_columns: ["open", "high", "low", "close", "volume"],
      warmup_bars: 32,
      entrypoint: "generate_signals",
      timeframes: ["1h"],
      determinism: { seed_required: true },
      parameter_space: {
        regime: { kind: "categorical", values: ["normal", "stress"] },
        window: { kind: "int_range", low: 8, high: 64, step: 1 },
      },
    });

    const p04 = projectResearchAlphaVersionDeclaration(
      P04_DELTA_DECLARED_CONTRACT,
      "strategy.delta_rsi:generate_signals",
    );
    expect(p04).toMatchObject({
      entrypoint: "strategy.delta_rsi:generate_signals",
      timeframes: ["1h", "4h", "1d"],
      determinism: { seed_required: false },
      required_columns: ["open", "high", "low", "close", "volume"],
      warmup_bars: 300,
      parameter_space: {
        window: { kind: "int_range", low: 20, high: 60, step: 2 },
        rvol: { kind: "float_range", low: 1, high: 2.5, step: 0.1 },
      },
    });
    expect(JSON.stringify(p04)).not.toContain("protected_kernel_sha256");
    expect(JSON.stringify(p04)).not.toContain("execution");
  });

  it("fails closed instead of leaking or hand-parsing malformed persisted JSON", () => {
    expect(() => projectResearchAlphaVersionDeclaration({
      entrypoint: "other_entrypoint",
      timeframes: ["1h"],
      determinism: { seed_required: false },
      parameter_space: {},
    }, "generate_signals")).toThrow(ResearchAlphaVersionDeclarationError);
    expect(() => projectResearchAlphaVersionDeclaration({
      entrypoint: "generate_signals",
      timeframes: ["1h"],
      required_columns: ["open", "high", "low", "close", "volume"],
      warmup_bars: 100_001,
      determinism: { seed_required: false },
      parameter_space: {},
    }, "generate_signals")).toThrow(ResearchAlphaVersionDeclarationError);
    expect(() => projectResearchAlphaVersionDeclaration({
      entrypoint: "generate_signals",
      timeframes: ["1h"],
      determinism: { seed_required: false },
      parameter_space: { hostile: { kind: "fixed", value: { source_path: "/srv/private" } } },
    }, "generate_signals")).toThrow(ResearchAlphaVersionDeclarationError);
  });
});
