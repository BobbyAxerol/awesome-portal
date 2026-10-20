/**
 * The optional closed `identity` member of the SCOPED_V2 stage bodies (BE-P12, FE-066, S3-U5): Live
 * `live-source-operations.v2` and Sandbox / Canary `following-parent.v2`, present ONLY when the request asked for
 * `include=identity`. One reader for the three bodies because the schema states one object three times
 * (`execution-operations.v1.schema.json`, `identity` of `LiveSourceOperationsReadV2`, `SandboxParentReadV2`,
 * `CanaryParentReadV2`; the bytes are identical).
 *
 * Closed like the schema: exactly the six keys, `basis` is the one published constant, `alpha_name` is the constant
 * `null` (no source publishes an alpha display name; a string here is refused, never shown), and the two rules of
 * the schema's `allOf` hold:
 *
 * - `alpha_id` is a string exactly when `alpha_reason_code` is `ALPHA_NAME_NOT_PUBLISHED`;
 * - `portfolio_name` is a string exactly when `portfolio_name_reason_code` is `null`.
 *
 * A member that is present and breaks any of this is `undefined` (the whole body is refused by its reader: a closed
 * object that is wrong is not "nothing to show"). A member that is absent is `null`: the request did not ask, or the
 * server answered the original body, and the screen says nothing about identity.
 */
import type { DeploymentIdentity } from "../../stageFacts";

export const SCOPED_IDENTITY_BASIS = "RETAINED_PROJECTION_ROW_AND_FIELD_POLICY" as const;

export const SCOPED_ALPHA_REASONS = [
  "ALPHA_MEMBERSHIP_NOT_QUALIFIED", "ALPHA_MEMBERSHIP_NOT_PUBLISHED", "ALPHA_MEMBERSHIP_AMBIGUOUS", "ALPHA_IDENTITY_NOT_AUTHORIZED",
  "ALPHA_NAME_NOT_PUBLISHED", "DEPLOYMENT_IDENTITY_NOT_READ",
] as const;
export const SCOPED_PORTFOLIO_REASONS = [
  "PORTFOLIO_NOT_ASSIGNED", "PORTFOLIO_NAME_NOT_PUBLISHED", "PORTFOLIO_NAME_AMBIGUOUS", "PORTFOLIO_NAME_NOT_AUTHORIZED",
  "DEPLOYMENT_IDENTITY_NOT_READ",
] as const;
type AlphaReason = (typeof SCOPED_ALPHA_REASONS)[number];
type PortfolioReason = (typeof SCOPED_PORTFOLIO_REASONS)[number];

/** The identity as the screens already take it (`DeploymentIdentity`), plus the one published basis. */
export interface ScopedIdentityV2 extends DeploymentIdentity {
  basis: typeof SCOPED_IDENTITY_BASIS;
  alphaName: null;
  alphaReasonCode: AlphaReason;
  portfolioNameReasonCode: PortfolioReason | null;
}

const KEYS = ["basis", "alpha_id", "alpha_name", "portfolio_name", "alpha_reason_code", "portfolio_name_reason_code"] as const;
/** `alpha_id` of the schema: `^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$`, 1..191. */
const ALPHA_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/;
/** `portfolio_name` of the schema, verbatim (no control, bidi-format or surrounding space; the trailing `(?![\s\S])` is JS's `$`). */
const PORTFOLIO_NAME = /^[^\s\u0000-\u001f\u007f-\u009f؜‎‏‪-‮⁦-⁩](?:[^\u0000-\u001f\u007f-\u009f؜‎‏‪-‮⁦-⁩]*[^\s\u0000-\u001f\u007f-\u009f؜‎‏‪-‮⁦-⁩])?$/;

function oneOf<T extends string>(value: unknown, words: readonly T[]): T | null {
  return typeof value === "string" && (words as readonly string[]).includes(value) ? (value as T) : null;
}

/**
 * `body.identity` of a SCOPED_V2 stage body: `null` when the key is absent (the body is the original), the read
 * identity, or `undefined` when the member is present and not what the schema allows.
 */
export function readScopedIdentityV2(raw: unknown, present: boolean): ScopedIdentityV2 | null | undefined {
  if (!present) return null;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const own = Object.keys(o);
  if (own.length !== KEYS.length || !KEYS.every((key) => Object.hasOwn(o, key))) return undefined;
  if (o.basis !== SCOPED_IDENTITY_BASIS || o.alpha_name !== null) return undefined;
  const alphaReasonCode = oneOf(o.alpha_reason_code, SCOPED_ALPHA_REASONS);
  if (alphaReasonCode === null) return undefined;
  let alphaId: string | null = null;
  if (o.alpha_id !== null) {
    if (typeof o.alpha_id !== "string" || !ALPHA_ID.test(o.alpha_id)) return undefined;
    alphaId = o.alpha_id;
  }
  // allOf 1: an id travels with ALPHA_NAME_NOT_PUBLISHED; without an id that code is not a reason.
  if ((alphaId !== null) !== (alphaReasonCode === "ALPHA_NAME_NOT_PUBLISHED")) return undefined;
  let portfolioName: string | null = null;
  if (o.portfolio_name !== null) {
    if (typeof o.portfolio_name !== "string" || o.portfolio_name.length > 256 || !PORTFOLIO_NAME.test(o.portfolio_name)) return undefined;
    portfolioName = o.portfolio_name;
  }
  let portfolioNameReasonCode: PortfolioReason | null = null;
  if (o.portfolio_name_reason_code !== null) {
    portfolioNameReasonCode = oneOf(o.portfolio_name_reason_code, SCOPED_PORTFOLIO_REASONS);
    if (portfolioNameReasonCode === null) return undefined;
  }
  // allOf 2: a name has no reason; no name has one.
  if ((portfolioName !== null) !== (portfolioNameReasonCode === null)) return undefined;
  return { basis: SCOPED_IDENTITY_BASIS, alphaId, alphaName: null, portfolioName, alphaReasonCode, portfolioNameReasonCode };
}
