/**
 * THE DECLARED VARIANT GRAPH OF THE FIXTURE WORLD (UXM-07; Codex disposition R-A, 29 Oct 2026).
 *
 * A variant id (`dep_live_01_mismatch`, `dep_canary_01_stale`, ...) is a SYNTHETIC FIXTURE VIEW of a deployment: the same deployment with an injected
 * condition. It is NOT a production deployment relationship and NOT an authorization rule; no production payload carries such a field and none may
 * (Core publishes no source-backed `view_of_deployment_id`). Inside the fixture, though, the relation must be explicit, never read out of an id's spelling:
 * this table DECLARES, per deployment of the world and per stage, which variant views exist. A variant id resolves to its base only when it is declared here.
 * An undeclared id (an unknown deployment, a base id, `dep_live_01_breach` whose stage has no breach view, `dep_x_dark`) resolves to nothing: no suffix is stripped.
 *
 * The mapping reaches consumers without touching any closed production schema: the fixture adapter code (rooms, blotter scope, Operations target) calls
 * `viewOfDeployment` here, and the fixture-only route `GET /__fixture/variants` publishes the same table (marked FIXTURE) for tests and reviewers.
 * A link to the base grants no access: the destination read performs its own scope check.
 *
 * Nothing here is a source fact or a permission; nothing reaches the product bundle (e2e/ is kept out of it).
 */
import { scaled } from "./bffScale";
import { worldAlphas } from "./bffWorld";

export type StageViewVariant = "dark" | "mismatch" | "stale" | "gap" | "breach" | "halted" | "vn";

/** The variant views the fixture declares for a deployment, by the stage of the deployment (the injected conditions that make sense for that room). */
export const DECLARED_VARIANTS_BY_STAGE: Readonly<Record<"PAPER" | "SANDBOX" | "CANARY" | "LIVE", readonly StageViewVariant[]>> = {
  PAPER: ["dark", "halted", "vn"],
  SANDBOX: ["dark", "mismatch", "stale", "halted"],
  CANARY: ["dark", "stale", "breach", "halted"],
  LIVE: ["dark", "mismatch", "stale", "gap", "halted"],
};

export interface VariantView {
  /** the variant id, as a room route carries it */
  id: string;
  /** the declared base deployment: the deployment the view is a view of */
  view_of_deployment_id: string;
  variant: StageViewVariant;
  /** every row of this table is synthetic */
  fixture: true;
}

let table: { universe: unknown; views: ReadonlyMap<string, VariantView> } | null = null;
function build(): ReadonlyMap<string, VariantView> {
  const out = new Map<string, VariantView>();
  for (const alpha of worldAlphas()) {
    for (const deployment of alpha.deployments) {
      const stage = deployment.stage as keyof typeof DECLARED_VARIANTS_BY_STAGE;
      for (const variant of DECLARED_VARIANTS_BY_STAGE[stage] ?? []) {
        const id = `${deployment.id}_${variant}`;
        out.set(id, { id, view_of_deployment_id: deployment.id, variant, fixture: true });
      }
    }
  }
  return out;
}
/** Every declared variant view of the world. */
const current = (): ReadonlyMap<string, VariantView> => {
  const universe = scaled(); // the generated universe changes with the server's scale: the table follows it
  if (table === null || table.universe !== universe) table = { universe, views: build() };
  return table.views;
};
export const variantViews = (): readonly VariantView[] => [...current().values()];
/** The declared view for an id, or null: a base id, an unknown id and an undeclared look-alike are all null. */
export const variantViewOf = (id: string): VariantView | null => current().get(id) ?? null;
/** The base deployment a variant id is declared a view of; null for anything that is not a declared variant. */
export const viewOfDeployment = (id: string): string | null => variantViewOf(id)?.view_of_deployment_id ?? null;
/** For navigation (blotter scope, Operations target): the base of a declared variant, else the id itself (never a stripped one). */
export const deploymentOfView = (id: string): string => viewOfDeployment(id) ?? id;
