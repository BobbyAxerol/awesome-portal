/**
 * BE-P12 - the two optional, opt-in members the SCOPED_V2 stage bodies can carry:
 * `identity` (FE-066 / S3-U5) and `stage_facts` (FE-067).
 *
 * They are the SAME vocabulary the V1 bodies publish (deployment-identity.contract.ts,
 * stage-facts.ts), restated as closed Zod objects so the sealed v2 bodies can parse
 * their own output. Rules that differ from V1, on purpose:
 *
 *  - `alpha_name` is the constant null. No source publishes an alpha display name,
 *    so the sealed v2 object cannot carry one. A future source needs a reviewed
 *    revision of this object, not a silent widening.
 *  - `identity.basis` names the authority: a retained-projection row under the
 *    viewer's own row and field policy. It is NOT a Portal record and NOT a
 *    parent-field purpose, so it never appears in a parent seal field set.
 */
import { z } from "zod";
import { ALPHA_IDENTITY_REASONS, IDENTITY_ID_PATTERN, IDENTITY_MAX_NAME, IDENTITY_UNSAFE_TEXT,
  PORTFOLIO_NAME_REASONS } from "./deployment-identity.contract";
import { RECONCILIATION_VERDICTS, RUNTIME_STATES, SESSION_ROW_CAP, STAGE_FACTS_SCHEMA_VERSION } from "./stage-facts";

export const SCOPED_IDENTITY_BASIS = "RETAINED_PROJECTION_ROW_AND_FIELD_POLICY" as const;
const idText = z.string().regex(new RegExp(IDENTITY_ID_PATTERN.source + "(?![\\s\\S])"));
const nameText = z.string().min(1).refine(value => [...value].length <= IDENTITY_MAX_NAME &&
  !IDENTITY_UNSAFE_TEXT.test(value) && value.trim() === value, "IDENTITY_NAME_UNSAFE");

export const scopedIdentity = z.object({
  basis: z.literal(SCOPED_IDENTITY_BASIS),
  alpha_id: idText.nullable(),
  alpha_name: z.null(),
  portfolio_name: nameText.nullable(),
  alpha_reason_code: z.enum(ALPHA_IDENTITY_REASONS),
  portfolio_name_reason_code: z.enum(PORTFOLIO_NAME_REASONS).nullable(),
}).strict().superRefine((value, context) => {
  const issue = (message: string) => context.addIssue({ code: z.ZodIssueCode.custom, message });
  // alpha_name is always null, so the reason is always present; ALPHA_NAME_NOT_PUBLISHED
  // is the reason exactly when the id is known, and never otherwise.
  if ((value.alpha_id !== null) !== (value.alpha_reason_code === "ALPHA_NAME_NOT_PUBLISHED")) issue("IDENTITY_ALPHA_REASON_INVALID");
  if ((value.portfolio_name === null) === (value.portfolio_name_reason_code === null)) issue("IDENTITY_PORTFOLIO_REASON_INVALID");
});
export type ScopedIdentity = z.infer<typeof scopedIdentity>;

const reason = z.string().regex(/^[A-Z][A-Z0-9_]{2,127}$/);
const timestamp = z.string().datetime({ offset: false, precision: 3 });
const fact = <T extends z.ZodTypeAny>(value: T) => z.union([
  z.object({ availability: z.literal("AVAILABLE"), value, reason_code: z.null() }).strict(),
  z.object({ availability: z.literal("NOT_PUBLISHED"), value: z.null(), reason_code: reason }).strict(),
]);
const count = fact(z.number().int().min(0));
const sessionRow = z.object({
  id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,190}$/),
  started: timestamp, ended: timestamp.nullable(),
  state: z.string().regex(/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/).nullable(),
}).strict();
export const scopedStageFacts = z.object({
  schema_version: z.literal(STAGE_FACTS_SCHEMA_VERSION),
  runtime: z.object({ runtime_state: fact(z.enum(RUNTIME_STATES)), since: fact(timestamp) }).strict(),
  reconciliation: z.object({
    basis: z.literal("FINDINGS_RELATION_NOT_A_RECONCILIATION_RUN"),
    verdict: fact(z.enum(RECONCILIATION_VERDICTS)), open_finding_count: count, unknown_order_count: count,
    as_of: fact(timestamp),
  }).strict(),
  sessions: z.object({
    availability: z.enum(["AVAILABLE", "NOT_PUBLISHED"]), reason_code: reason.nullable(),
    basis: z.literal("EXECUTION_SESSIONS_BOUNDED_WINDOW"),
    rows: z.array(sessionRow).max(SESSION_ROW_CAP),
    returned_count: z.number().int().min(0).max(SESSION_ROW_CAP), omitted_count: z.number().int().min(0),
    source_complete: z.boolean().nullable(),
  }).strict().superRefine((value, context) => {
    const bad = value.availability === "NOT_PUBLISHED"
      ? value.reason_code === null || value.rows.length !== 0 || value.returned_count !== 0 || value.omitted_count !== 0 || value.source_complete !== null
      : value.reason_code !== null || value.source_complete === null || value.returned_count !== value.rows.length;
    if (bad) context.addIssue({ code: z.ZodIssueCode.custom, message: "STAGE_SESSIONS_FACT_INVALID" });
  }),
}).strict();
export type ScopedStageFacts = z.infer<typeof scopedStageFacts>;

/**
 * What a SCOPED_V2 Live read is allowed to state, as a contract and not only as producer behaviour:
 * the rows are the viewer's authorized population, so no runtime, no session list, no "no open
 * findings" and no count may appear AVAILABLE (see scoped-stage-facts.ts). A future source that can
 * prove more needs a reviewed revision of this object.
 */
export const liveScopedStageFacts = scopedStageFacts.superRefine((value, context) => {
  const bad = (path: (string | number)[]) => context.addIssue({ code: z.ZodIssueCode.custom, path, message: "SCOPED_STAGE_FACT_NOT_PROVABLE" });
  if (value.runtime.runtime_state.availability !== "NOT_PUBLISHED") bad(["runtime", "runtime_state"]);
  if (value.runtime.since.availability !== "NOT_PUBLISHED") bad(["runtime", "since"]);
  if (value.reconciliation.verdict.value === "NO_OPEN_FINDINGS") bad(["reconciliation", "verdict"]);
  if (value.reconciliation.open_finding_count.availability !== "NOT_PUBLISHED") bad(["reconciliation", "open_finding_count"]);
  if (value.reconciliation.unknown_order_count.availability !== "NOT_PUBLISHED") bad(["reconciliation", "unknown_order_count"]);
  if (value.sessions.availability !== "NOT_PUBLISHED") bad(["sessions"]);
});
