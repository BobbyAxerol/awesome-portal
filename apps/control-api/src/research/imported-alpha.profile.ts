/**
 * E17's one installed adapter for a P07 imported AlphaVersion.
 *
 * Registry lifecycle alone never grants execution. The immutable binding is
 * installed with exact P07 registration custody (including DRAFT); admission
 * still requires the opt-in feature fence. Publication separately requires ACTIVE.
 * Raw source bytes and source paths are deliberately absent from this public
 * profile; the worker obtains exact bytes through a lease-bound internal read.
 */

import { createHash } from "node:crypto";

export const IMPORTED_ALPHA_ADAPTER_ID = "p17.imported-signal-notional.v1" as const;
export const IMPORTED_ALPHA_PROFILE_ID = "p17.imported-signal-notional.v1" as const;
export const IMPORTED_ALPHA_ADAPTER_CONTRACT_DIGEST =
  "b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6" as const;
export const IMPORTED_ALPHA_PROFILE_DIGEST =
  "f1ed5dbccdd90ca7dd35be2755f3b3b5f7e9a29b1641beb08bd0136783c0f298" as const;

export const IMPORTED_ALPHA_ADAPTER_CONTRACT = Object.freeze({
  schema_version: "research.p17.imported-adapter-binding.v1",
  adapter_id: IMPORTED_ALPHA_ADAPTER_ID,
  source_contract: "research.alpha-source.v1",
  context_contract: "research.imported-alpha-context.v1",
  output_contract: "research.imported-signal-notional-output.v1",
  execution_route: "signal_notional",
  engine_release_id: "er_quantbt_111",
  security_policy: "research.imported-python-restricted.v1",
} as const);

export const IMPORTED_ALPHA_PROFILE = Object.freeze({
  schema_version: "research.p17.imported-signal-notional-profile.v1",
  profile_id: IMPORTED_ALPHA_PROFILE_ID,
  adapter_id: IMPORTED_ALPHA_ADAPTER_ID,
  adapter_contract_digest: IMPORTED_ALPHA_ADAPTER_CONTRACT_DIGEST,
  engine_release_id: "er_quantbt_111",
  execution_route: "signal_notional",
  protocol: "three_window_decay",
  parameter_mode: "declared-pins-v1",
  source_contract: "research.alpha-source.v1",
  context_contract: "research.imported-alpha-context.v1",
  output_contract: "research.imported-signal-notional-output.v1",
  child_limits: Object.freeze({
    cpu_seconds: 120,
    wall_seconds: 240,
    max_source_bytes: 256 * 1024,
    max_signal_points: 250_000,
  }),
} as const);

function canonicalJson(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, nested]) => [key, normalize(nested)]),
      );
    }
    return input;
  };
  return JSON.stringify(normalize(value));
}

export function importedAlphaDigest(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

if (importedAlphaDigest(IMPORTED_ALPHA_ADAPTER_CONTRACT) !== IMPORTED_ALPHA_ADAPTER_CONTRACT_DIGEST) {
  throw new Error("Imported Alpha adapter contract digest drifted.");
}
if (importedAlphaDigest(IMPORTED_ALPHA_PROFILE) !== IMPORTED_ALPHA_PROFILE_DIGEST) {
  throw new Error("Imported Alpha execution profile digest drifted.");
}

export const IMPORTED_ALPHA_RESOURCE_PROFILE = Object.freeze({
  memoryBytes: 4 * 1024 * 1024 * 1024,
  cpuSeconds: IMPORTED_ALPHA_PROFILE.child_limits.cpu_seconds,
  scratchBytes: 128 * 1024 * 1024,
  ioBytes: 512 * 1024 * 1024,
});

export const IMPORTED_ALPHA_RESOURCE_CLASS = "p17-imported-signal-notional-v1" as const;
export const IMPORTED_ALPHA_WORK_SCHEMA_VERSION = "research.p17.imported-work.v1" as const;
