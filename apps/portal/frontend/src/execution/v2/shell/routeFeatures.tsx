/**
 * What the route says is mounted, for links a screen would otherwise offer blindly (audit M2).
 *
 * `ExecutionPreviewRoute` knows which V2 screens are flag-on; the Portfolios screens only know a path.
 * Their Compare link points at `?view=compare`, which mounts the Compare screen only when the `compare`
 * flag is on: with it off the link lands on the plain list, a button that does nothing. The route wraps
 * the V2 Portfolios mounts in this provider, and a screen that offers Compare reads `compare` first.
 *
 * Outside a provider (a screen under test, the fixture lab) everything reads as available, so a screen
 * is never hidden by the absence of a router that did not ask.
 */
import { createContext, useContext } from "react";

export interface RouteFeatures {
  /** The Compare screen is mounted on this build (`compare` flag on). */
  compare: boolean;
}

const DEFAULT_FEATURES: RouteFeatures = { compare: true };

const RouteFeaturesContext = createContext<RouteFeatures>(DEFAULT_FEATURES);

export const RouteFeaturesProvider = RouteFeaturesContext.Provider;

export function useRouteFeatures(): RouteFeatures {
  return useContext(RouteFeaturesContext);
}
