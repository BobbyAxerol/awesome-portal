/**
 * What a stage screen may say about WHICH alpha and portfolio a deployment belongs to (FE-066, S3-U5), from the five
 * BE-P3 identity keys (`execution/stageFacts.ts` `readDeploymentIdentity`).
 *
 * - `alpha_id` is published only from the qualified deployment-to-alpha tuple; it is never a strategy id. The crumb links
 *   to the Alpha screen ONLY when it is published (this closes the "back to Alpha" request for the stage screens).
 * - `alpha_name` is null today with `ALPHA_NAME_NOT_PUBLISHED`: the screen prints the id (when published) and
 *   `Alpha name Not published (FE-066)` with the server's reason in the title. No name is ever composed from an id.
 * - `portfolio_name` is the portfolio's own name under the viewer's policy; when it is null the portfolio id the body
 *   always carries is the label, and the reason code sits in the title.
 * - A body without the keys (an older producer, a SCOPED_V2 stage body) is `identity: null`: every part is absent and the
 *   screen says `Not published (FE-066)` without a reason. That body shape is a request for a parent-field purpose (receipt).
 */
import type { DeploymentIdentity } from "../../../stageFacts";

export const FE_IDENTITY = "FE-066" as const;

export interface StageIdentity {
  /** The five keys were present and valid. `false` = typed absence (older producer, SCOPED_V2 body, or a refused member). */
  published: boolean;
  alphaId: string | null;
  alphaName: string | null;
  /** Why the alpha name (or id) is null, as the server said. */
  alphaReasonCode: string | null;
  portfolioName: string | null;
  portfolioNameReasonCode: string | null;
}

const ABSENT: StageIdentity = { published: false, alphaId: null, alphaName: null, alphaReasonCode: null, portfolioName: null, portfolioNameReasonCode: null };

export function stageIdentity(identity: DeploymentIdentity | null): StageIdentity {
  if (identity === null) return ABSENT;
  return {
    published: true,
    alphaId: identity.alphaId,
    alphaName: identity.alphaName,
    alphaReasonCode: identity.alphaReasonCode,
    portfolioName: identity.portfolioName,
    portfolioNameReasonCode: identity.portfolioNameReasonCode,
  };
}

export const alphaHref = (alphaId: string): string => `/deployments/alphas/${encodeURIComponent(alphaId)}`;

/** The Alpha crumb: present only when the server published `alpha_id`; labelled by the name when it published one, else by the id. */
export function alphaCrumb(identity: StageIdentity): { label: string; to: string } | null {
  if (identity.alphaId === null) return null;
  return { label: identity.alphaName ?? identity.alphaId, to: alphaHref(identity.alphaId) };
}

/** The portfolio's label: its published name, else the id the body always carries. */
export function portfolioLabel(identity: StageIdentity, portfolioId: string): string {
  return identity.portfolioName ?? portfolioId;
}
