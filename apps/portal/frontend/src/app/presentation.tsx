/**
 * Route-aware workspace presentation — EL-V2-01.
 *
 * One mode for the whole workspace, owned above the shell chrome and derived
 * from the canonical route classification. This exists because the previous
 * architecture treated theme as a component-local skin: `ExecutionSurface`
 * painted Carbon on a nested wrapper while the topbar, sidebar and gutter kept
 * following the user's Research/Operations preference. The owner's 2026-08-24
 * screenshot of that state — a warm-white shell around a Carbon-black island,
 * with the selector still reading "Research Light" — is the rejection this
 * module answers. Theme is a workspace mode the user is IN, not a skin a
 * subtree wears.
 *
 * Presentation metadata only (handoff §4.2): deriving from the resolved
 * screen classification, never from `delivery_profile` — data delivery and
 * visual mode are different concepts — and granting no capability.
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { matchPath, useLocation } from "react-router-dom";

import type { PortalRegistryDocument } from "../portal/contracts";
import {
  EXECUTION_PREVIEW_FEATURE_DEFAULTS,
  hasExecutionPreview,
} from "../execution/previewRegistry";
import { usePreferences } from "./preferences";

export type PortalPresentationMode = "research-light" | "execution-carbon";

/**
 * Classify a pathname against the registry.
 *
 * Execution Carbon covers, per the owner override (§0.1), everything from
 * Approval Inbox/Gate R1 through Live — concretely:
 *  - `/execution/*`: the Lane A fixture surface and any execution-owned page;
 *  - every registry screen whose `screen_id` is one of the seventeen reviewed
 *    Execution screens (parameterised routes matched with `matchPath`);
 *  - the canonical routes of the Execution feature groups, so a feature ROOT
 *    (e.g. `/deployments/paper`) is Carbon even when no screen row carries
 *    that exact route.
 *
 * The classification deliberately ignores whether the preview flag is on: a
 * dark route rendering a "commissioned" placeholder is still an Execution
 * address, and flipping the whole workspace theme on a build flag would make
 * the flag change presentation — exactly the coupling §4.2 forbids.
 */
export function presentationModeFor(
  registry: PortalRegistryDocument | null,
  pathname: string,
): PortalPresentationMode {
  if (pathname === "/execution" || pathname.startsWith("/execution/")) return "execution-carbon";
  if (!registry) return "research-light";
  for (const screen of registry.screens) {
    if (!hasExecutionPreview(screen.screen_id)) continue;
    if (matchPath({ path: screen.route, end: true }, pathname)) return "execution-carbon";
  }
  for (const feature of registry.features) {
    const executionFeature =
      feature.id in EXECUTION_PREVIEW_FEATURE_DEFAULTS || feature.id.startsWith("EXECUTION_");
    if (!executionFeature) continue;
    if (
      pathname === feature.canonical_route ||
      pathname.startsWith(`${feature.canonical_route}/`)
    ) {
      return "execution-carbon";
    }
  }
  return "research-light";
}

interface PresentationContextValue {
  mode: PortalPresentationMode;
  /**
   * Human-readable entity for the breadcrumb tail (`Execution / Paper /
   * Carry v3.2`). Set by the screen that resolved the entity — the shell
   * cannot know fixture display names, and inventing one would be a second
   * feature model. `null` when the current route has no entity.
   */
  entityLabel: string | null;
  setEntityLabel: (label: string | null) => void;
}

const PresentationContext = createContext<PresentationContextValue | null>(null);

export function PortalPresentationProvider({
  registry,
  children,
}: {
  registry: PortalRegistryDocument | null;
  children: ReactNode;
}) {
  const location = useLocation();
  const preferences = usePreferences();
  const [entityLabel, setEntityLabel] = useState<string | null>(null);

  const mode = useMemo(
    () => presentationModeFor(registry, location.pathname),
    [registry, location.pathname],
  );

  // The single writer of the root theme attribute. It lived in
  // `PreferencesProvider` when preference WAS the whole answer; with a
  // route-derived override, two writers would race on every preference change
  // and the loser would paint half the workspace. Everything the mode covers —
  // topbar, sidebar, canvas, rail, overlays, palette, screen — flips through
  // this one attribute in the same commit of the same effect: atomic by
  // construction, not by coordination.
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute(
      "data-theme",
      mode === "execution-carbon" ? "execution-carbon" : preferences.theme,
    );
  }, [mode, preferences.theme]);

  // Entity labels do not survive route changes: a stale "Carry v3.2" on the
  // Blotter would be the breadcrumb lying about where the reader is.
  useEffect(() => {
    setEntityLabel(null);
  }, [location.pathname]);

  const value = useMemo(
    () => ({ mode, entityLabel, setEntityLabel }),
    [mode, entityLabel],
  );

  return <PresentationContext.Provider value={value}>{children}</PresentationContext.Provider>;
}

export function usePresentation(): PresentationContextValue {
  const value = useContext(PresentationContext);
  if (!value) throw new Error("usePresentation must be used inside PortalPresentationProvider");
  return value;
}

/**
 * Optional variant for chrome that renders in bootstrap states where the
 * provider is not mounted yet (registry loading/failed). Those states carry no
 * Execution route content, so research-light is the honest answer.
 */
export function usePresentationMode(): PortalPresentationMode {
  return useContext(PresentationContext)?.mode ?? "research-light";
}
