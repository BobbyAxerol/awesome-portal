/** Additive immutable run inputs, distinct from current registry or execution facts. */
import { z } from "zod";

const Digest = z.string().regex(/^[0-9a-f]{64}$/);
const Id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/);
const Scalar = z.union([z.string(), z.number().finite(), z.boolean(), z.null()]);
const Parameter = z.union([
  z.object({ kind: z.literal("fixed"), value: Scalar }).strict(),
  z.object({ kind: z.literal("int_range"), low: z.number().int(), high: z.number().int(), step: z.number().int().positive() }).strict(),
  z.object({ kind: z.literal("float_range"), low: z.number().finite(), high: z.number().finite(), step: z.number().finite().positive() }).strict(),
  z.object({ kind: z.literal("categorical"), values: z.array(Scalar).min(1).max(64) }).strict(),
]);
export const RunAlphaDeclarationSchema = z.object({
  schema_version: z.literal("research.alpha-version-declaration.v1"),
  entrypoint: z.string().regex(/^[A-Za-z][A-Za-z0-9_.:]{0,159}$/),
  timeframes: z.array(z.string().regex(/^[1-9][0-9]*(?:m|h|d|w)$/)).min(1).max(12),
  required_columns: z.array(z.enum(["open", "high", "low", "close", "volume"])).min(1).max(5),
  warmup_bars: z.number().int().min(0).max(100_000),
  determinism: z.object({ seed_required: z.boolean() }).strict(),
  parameter_space: z.record(z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/), Parameter)
    .refine(value => Object.keys(value).length <= 12),
}).strict();
const Override = z.union([
  z.object({ kind: z.literal("pin"), name: Id, value: z.union([z.string().max(191), z.number().finite(), z.boolean()]) }).strict(),
  z.object({ kind: z.literal("sweep"), name: Id, low: z.union([z.string().max(191), z.number().finite(), z.boolean()]),
    high: z.union([z.string().max(191), z.number().finite(), z.boolean()]) }).strict(),
]);
export const ResearchRunDeclarationSchema = z.object({
  schema_version: z.literal("research.run-declaration.v1"),
  state: z.enum(["AVAILABLE", "NOT_PUBLISHED", "NOT_APPLICABLE"]),
  reason_code: z.string().regex(/^[A-Z][A-Z0-9_]{2,159}$/).nullable(),
  source_ref: z.literal("IMMUTABLE_RUN_REQUEST_AND_ALPHA_VERSION_DECLARATION_V1"),
  alpha_binding: z.object({ alpha_id: Id, alpha_version_id: Id }).strict().nullable(),
  declaration_digest: Digest.nullable(),
  requested_spec_digest: Digest.nullable(),
  declaration: RunAlphaDeclarationSchema.nullable(),
  requested_overrides: z.array(Override).max(64).nullable(),
}).strict().superRefine((value, context) => {
  if (value.state === "AVAILABLE") {
    if (value.reason_code !== null || !value.alpha_binding || !value.declaration || !value.declaration_digest
      || !value.requested_spec_digest || value.requested_overrides === null) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "available run declaration requires immutable source and request pins" });
    }
  } else if (!value.reason_code || value.declaration !== null || value.declaration_digest !== null
    || value.requested_overrides !== null) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "absent declaration requires reason and no invented parameter values" });
  }
});
export type ResearchRunDeclaration = z.infer<typeof ResearchRunDeclarationSchema>;
