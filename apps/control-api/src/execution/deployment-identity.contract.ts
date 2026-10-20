/**
 * FE-066 / S3-U5 - the Alpha-Portfolio identity vocabulary and its pure composition.
 *
 * Leaf module (no runtime imports): the contract workspace stages and tests it
 * against the published schemas, so the reason codes below cannot drift from
 * the schema enums without a red test.
 *
 *   alpha_id        ONLY from a qualified, authorized deployment->alpha tuple
 *                   publication. A strategy id is a different namespace and is
 *                   never promoted to an alpha id by string equality.
 *   alpha_name      no execution source publishes an alpha display name today
 *                   (`alphas` carries id/description, `strategies` ids only); the
 *                   Research catalogue's names are another namespace with no
 *                   qualified join. Typed ALPHA_NAME_NOT_PUBLISHED.
 *   portfolio_name  `portfolios.name` of the deployment's own portfolio id,
 *                   under the viewer's row and field policy.
 */
type ProjectionScalar = string | number | boolean | null | readonly (string | number | boolean | null)[];

export const ALPHA_IDENTITY_REASONS = [
  "ALPHA_MEMBERSHIP_NOT_QUALIFIED", // no qualified deployment->alpha publication on this read path
  "ALPHA_MEMBERSHIP_NOT_PUBLISHED", // qualified publication, but it names no alpha for this deployment
  "ALPHA_MEMBERSHIP_AMBIGUOUS", // qualified publication names more than one alpha
  "ALPHA_IDENTITY_NOT_AUTHORIZED", // the viewer's field policy does not include alpha_id
  "ALPHA_NAME_NOT_PUBLISHED", // alpha_id known, no source publishes a display name
  "DEPLOYMENT_IDENTITY_NOT_READ", // the producer did not read the identity source for this body
] as const;
export const PORTFOLIO_NAME_REASONS = [
  "PORTFOLIO_NOT_ASSIGNED", // the deployment row carries no portfolio id
  "PORTFOLIO_NAME_NOT_PUBLISHED", // relation unavailable, row absent, or the row has no name
  "PORTFOLIO_NAME_AMBIGUOUS", // more than one row for the same portfolio id
  "PORTFOLIO_NAME_NOT_AUTHORIZED", // the viewer's row/field policy does not include the name
  "DEPLOYMENT_IDENTITY_NOT_READ",
] as const;
export type AlphaIdentityReason = (typeof ALPHA_IDENTITY_REASONS)[number];
export type PortfolioNameReason = (typeof PORTFOLIO_NAME_REASONS)[number];

export interface DeploymentIdentity {
  readonly alpha_id: string | null;
  readonly alpha_name: string | null;
  readonly portfolio_name: string | null;
  /** Non-null iff alpha_id or alpha_name is null; says why (alpha_id's reason first). */
  readonly alpha_reason_code: AlphaIdentityReason | null;
  /** Non-null iff portfolio_name is null. */
  readonly portfolio_name_reason_code: PortfolioNameReason | null;
}

/** What a producer emits when it did not read the identity source at all. */
export const IDENTITY_NOT_READ: DeploymentIdentity = Object.freeze({
  alpha_id: null, alpha_name: null, portfolio_name: null,
  alpha_reason_code: "DEPLOYMENT_IDENTITY_NOT_READ", portfolio_name_reason_code: "DEPLOYMENT_IDENTITY_NOT_READ",
});

// The intersection of the Identifier patterns the four published schemas use.
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/;
const MAX_NAME = 256;
// Same hostile-text rule the other published display strings use: no control
// or bidirectional-format characters.
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f؜‎‏‪-‮⁦-⁩]/u;
const safeName = (value: unknown): string | null =>
  typeof value === "string" && value.length >= 1 && [...value].length <= MAX_NAME && !UNSAFE_TEXT.test(value) &&
  value.trim() === value ? value : null;

export type AlphaMembership =
  | { readonly kind: "UNQUALIFIED" }
  | { readonly kind: "QUALIFIED"; readonly alphaIds: readonly string[]; readonly alphaIdAllowed: boolean };
export type PortfolioNames =
  | { readonly kind: "UNAVAILABLE" }
  | { readonly kind: "ROWS"; readonly rows: readonly Record<string, ProjectionScalar>[]; readonly nameAllowed: boolean;
      /** A row for this portfolio id exists in the retained relation but the viewer's row policy hides it. */
      readonly hiddenMatch?: boolean };

export interface IdentityInput {
  readonly portfolioId: string | null;
  /** False when the viewer's field policy hides portfolio_id itself: "not assigned" would be a lie. */
  readonly portfolioIdAllowed?: boolean;
  readonly membership: AlphaMembership;
  readonly portfolios: PortfolioNames;
}

export function composeDeploymentIdentity(input: IdentityInput): DeploymentIdentity {
  let alphaId: string | null = null;
  let alphaReason: AlphaIdentityReason | null;
  const membership = input.membership;
  if (membership.kind === "UNQUALIFIED") alphaReason = "ALPHA_MEMBERSHIP_NOT_QUALIFIED";
  else if (!membership.alphaIdAllowed) alphaReason = "ALPHA_IDENTITY_NOT_AUTHORIZED";
  else {
    const ids = [...new Set(membership.alphaIds)];
    if (ids.length === 0) alphaReason = "ALPHA_MEMBERSHIP_NOT_PUBLISHED";
    else if (ids.length > 1) alphaReason = "ALPHA_MEMBERSHIP_AMBIGUOUS";
    else if (!ID.test(ids[0])) alphaReason = "ALPHA_MEMBERSHIP_NOT_PUBLISHED";
    else { alphaId = ids[0]; alphaReason = "ALPHA_NAME_NOT_PUBLISHED"; }
  }

  let portfolioName: string | null = null;
  let portfolioReason: PortfolioNameReason | null;
  const portfolios = input.portfolios;
  if (input.portfolioIdAllowed === false) portfolioReason = "PORTFOLIO_NAME_NOT_AUTHORIZED";
  else if (input.portfolioId === null || input.portfolioId === "") portfolioReason = "PORTFOLIO_NOT_ASSIGNED";
  else if (portfolios.kind === "UNAVAILABLE") portfolioReason = "PORTFOLIO_NAME_NOT_PUBLISHED";
  else if (!portfolios.nameAllowed) portfolioReason = "PORTFOLIO_NAME_NOT_AUTHORIZED";
  else {
    const rows = portfolios.rows.filter(row => row.portfolio_id === input.portfolioId);
    if (rows.length > 1) portfolioReason = "PORTFOLIO_NAME_AMBIGUOUS";
    else {
      portfolioName = rows.length === 1 ? safeName(rows[0].name) : null;
      portfolioReason = portfolioName !== null ? null
        : rows.length === 0 && portfolios.hiddenMatch ? "PORTFOLIO_NAME_NOT_AUTHORIZED" : "PORTFOLIO_NAME_NOT_PUBLISHED";
    }
  }
  return Object.freeze({ alpha_id: alphaId, alpha_name: null, portfolio_name: portfolioName,
    alpha_reason_code: alphaReason, portfolio_name_reason_code: portfolioReason });
}

/** Flat keys, exactly as every block that carries the identity publishes them. */
export function identityFields(identity: DeploymentIdentity) {
  return {
    alpha_id: identity.alpha_id,
    alpha_name: identity.alpha_name,
    portfolio_name: identity.portfolio_name,
    alpha_reason_code: identity.alpha_reason_code,
    portfolio_name_reason_code: identity.portfolio_name_reason_code,
  };
}
