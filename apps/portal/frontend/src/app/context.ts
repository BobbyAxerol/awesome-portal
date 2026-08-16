/**
 * Shell context: the resolved registry plus the environment the summary
 * reported. Feature modules read their own metadata from here instead of
 * re-fetching or, worse, restating it locally.
 */
import { createContext, useContext } from "react";

import type { PortalEnvironment, PortalRegistryDocument } from "../portal/contracts";

export interface PortalContextValue {
  registry: PortalRegistryDocument | null;
  environment: PortalEnvironment | null;
}

export const PortalContext = createContext<PortalContextValue>({
  registry: null,
  environment: null,
});

export function usePortalContext(): PortalContextValue {
  return useContext(PortalContext);
}

/** Looks up a feature by registry id; `null` when the registry has not resolved. */
export function useFeature(featureId: string) {
  const { registry } = usePortalContext();
  return registry?.features.find((feature) => feature.id === featureId) ?? null;
}
