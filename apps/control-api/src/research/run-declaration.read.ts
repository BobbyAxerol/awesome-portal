import { projectResearchAlphaVersionDeclaration } from "./alpha-version-declaration";
import { ResearchRequestedSpecSchema } from "./preflight.contract";
import { sha256ResearchJson } from "./preflight.service";
import { ResearchRunDeclarationSchema, type ResearchRunDeclaration } from "./run-declaration.contract";

/** Internal exact-version inputs, from the same scoped transaction as the owning read. */
export interface RunDeclarationInputs {
  alphaId?: string | null;
  alphaVersionId?: string | null;
  requestedSpec?: unknown;
  requestedSpecDigest?: string | null;
  declaredContract?: unknown;
  entrypoint?: string | null;
}
export function readRunDeclaration(input: RunDeclarationInputs): ResearchRunDeclaration {
  const source = "IMMUTABLE_RUN_REQUEST_AND_ALPHA_VERSION_DECLARATION_V1";
  const absence = (reason: string, state: "NOT_PUBLISHED" | "NOT_APPLICABLE" = "NOT_PUBLISHED") =>
    ResearchRunDeclarationSchema.parse({ schema_version: "research.run-declaration.v1", state, reason_code: reason,
      source_ref: source, alpha_binding: null, declaration_digest: null,
      requested_spec_digest: /^[0-9a-f]{64}$/.test(input.requestedSpecDigest ?? "") ? input.requestedSpecDigest : null,
      declaration: null, requested_overrides: null });
  const parsed = ResearchRequestedSpecSchema.safeParse(input.requestedSpec);
  if (!parsed.success) return absence("P24_RUN_REQUESTED_SPEC_NOT_RETAINED_OR_INCOMPATIBLE");
  if (sha256ResearchJson(input.requestedSpec) !== input.requestedSpecDigest) return absence("P24_RUN_REQUESTED_SPEC_DIGEST_MISMATCH");
  const binding = parsed.data.alpha_binding;
  if (binding === null) return absence("P24_SCRATCH_RUN_HAS_NO_ALPHA_VERSION_DECLARATION", "NOT_APPLICABLE");
  if (binding.alpha_id !== input.alphaId || binding.alpha_version_id !== input.alphaVersionId) {
    return absence("P24_RUN_ALPHA_VERSION_BINDING_MISMATCH");
  }
  if (!input.entrypoint || !input.declaredContract || typeof input.declaredContract !== "object" || Array.isArray(input.declaredContract)) {
    return absence("P24_RUN_BOUND_ALPHA_VERSION_DECLARATION_NOT_RECORDED");
  }
  try {
    const declaration = projectResearchAlphaVersionDeclaration(input.declaredContract as Record<string, unknown>, input.entrypoint);
    return ResearchRunDeclarationSchema.parse({ schema_version: "research.run-declaration.v1", state: "AVAILABLE", reason_code: null,
      source_ref: source, alpha_binding: binding, declaration_digest: sha256ResearchJson(declaration),
      requested_spec_digest: input.requestedSpecDigest, declaration, requested_overrides: parsed.data.parameter_space_overrides });
  } catch {
    return absence("P24_RUN_BOUND_ALPHA_VERSION_DECLARATION_INCOMPATIBLE");
  }
}
