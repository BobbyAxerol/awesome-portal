/** E17: derive read identity from the run's immutable P07 version and P10 pins.
 * Never look up the Alpha's current/active version or install per-run values
 * into the release-wide P04 binding registry. No source bytes leave custody. */
import { z } from "zod";
import { projectResearchAlphaVersionDeclaration } from "./alpha-version-declaration";
import { IMPORTED_ALPHA_ADAPTER_CONTRACT_DIGEST, IMPORTED_ALPHA_PROFILE_DIGEST, IMPORTED_ALPHA_PROFILE_ID } from "./imported-alpha.profile";
import type { HistoricalParameterBinding, DeclaredRange } from "./parameter-binding.registry";
import { ResearchRequestedSpecSchema } from "./preflight.contract";
import { sha256ResearchJson } from "./preflight.service";
import type { SplitHubRow } from "./split.repository";

export const ImportedAlphaReadBindingSchema = z.object({
  schema_version: z.literal("research.imported-alpha-read-binding.v1"),
  source_digest: z.string().regex(/^[0-9a-f]{64}$/),
  entrypoint: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,159}$/),
  parameter_bundle_digest: z.string().regex(/^[0-9a-f]{64}$/),
  parameters: z.array(z.object({
    name: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/),
    kind: z.enum(["fixed", "int_range", "float_range", "categorical"]),
    value: z.union([z.string().max(4096), z.number().finite(), z.boolean()]),
  }).strict()).max(12),
}).strict();

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

export function importedAlphaReadBinding(row: SplitHubRow): {
  numeric: HistoricalParameterBinding;
  public: z.infer<typeof ImportedAlphaReadBindingSchema>;
} | null {
  if (row.kind !== "DURABLE" || row.executionProfileId !== IMPORTED_ALPHA_PROFILE_ID ||
      row.adapterContractDigest !== IMPORTED_ALPHA_ADAPTER_CONTRACT_DIGEST || !row.importedAlphaVersion) return null;
  const work = record(record(row.legacyRequest)?.research);
  const pins = record(work?.imported_parameters);
  const requested = ResearchRequestedSpecSchema.safeParse(work?.requested_spec);
  const version = row.importedAlphaVersion;
  if (!work || !pins || !requested.success ||
      work.execution_profile_digest !== IMPORTED_ALPHA_PROFILE_DIGEST ||
      work.imported_source_digest !== version.sourceDigest || work.imported_entrypoint !== version.entrypoint ||
      requested.data.alpha_binding?.alpha_version_id !== version.alphaVersionId ||
      sha256ResearchJson(requested.data) !== row.requestedSpecDigest) return null;
  try {
    const declaration = projectResearchAlphaVersionDeclaration(version.declaredContract, version.entrypoint);
    if (Object.keys(pins).length !== Object.keys(declaration.parameter_space).length) return null;
    const values: Record<string, number> = {};
    const space: Record<string, DeclaredRange> = {};
    const parameters = Object.entries(declaration.parameter_space).map(([name, spec]) => {
      const value = pins[name];
      const override = requested.data.parameter_space_overrides.find((pin) => pin.name === name);
      if (!(typeof value === "string" || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value))) {
        throw new Error("Imported pin is not a bounded scalar");
      }
      if (spec.kind === "fixed" && value !== spec.value ||
          spec.kind === "categorical" && !spec.values.includes(value)) throw new Error("Imported pin drifted");
      if (spec.kind !== "fixed" && (override?.kind !== "pin" || override.value !== value) ||
          spec.kind === "fixed" && override && (override.kind !== "pin" || override.value !== value)) {
        throw new Error("Imported pin differs from the immutable requested specification");
      }
      if (spec.kind === "int_range" || spec.kind === "float_range") {
        if (typeof value !== "number" || value < spec.low || value > spec.high ||
            spec.kind === "int_range" && !Number.isInteger(value) ||
            Math.abs((value - spec.low) / spec.step - Math.round((value - spec.low) / spec.step)) > 1e-9 ||
            override?.kind !== "pin" || override.value !== value) throw new Error("Imported range pin drifted");
        // A zero-width range is a real pin, but has no range placement.
        // Keep it in the complete typed pin list rather than fabricating a %.
        if (spec.low < spec.high) {
          values[name] = value;
          space[name] = { minimum: spec.low, maximum: spec.high, step: spec.step };
        }
      }
      return { name, kind: spec.kind, value };
    });
    const publicBinding = ImportedAlphaReadBindingSchema.parse({
      schema_version: "research.imported-alpha-read-binding.v1", source_digest: version.sourceDigest,
      entrypoint: version.entrypoint, parameter_bundle_digest: sha256ResearchJson(pins), parameters,
    });
    return {
      public: publicBinding,
      numeric: { adapterContractDigest: row.adapterContractDigest, parameterSpace: space, fixedParameters: values,
        fixedBundleDigest: publicBinding.parameter_bundle_digest, installedInRelease: "research-loop/E17" },
    };
  } catch { return null; }
}
