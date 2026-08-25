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
import { setThemeOverride } from "../styles/themeWriter";

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
  /**
   * Chrome a screen may light up (hi-fi 4e/4d): the topbar `⚑ Alerts · n
   * critical` chip and a count badge on a sidebar item. Producers own both
   * ends — set on mount, clear on unmount. Nothing here invents a number: a
   * screen sets it only from data it holds (today: declared smoke; BR-EX-43).
   */
  chrome: PresentationChrome;
  setChrome: (chrome: PresentationChrome) => void;
}

export interface PresentationChrome {
  alerts?: { critical: number; href: string; onToggle?: () => void } | null;
  navBadge?: { route: string; count: number; tone: "warn" | "bad" } | null;
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
  const [entityLabel, setEntityLabel] = useState<string | null>(null);
  const [chrome, setChrome] = useState<PresentationChrome>({});

  const mode = useMemo(
    () => presentationModeFor(registry, location.pathname),
    [registry, location.pathname],
  );

  // The route override half of the theme (styles/themeWriter.ts holds the
  // pair and writes the attribute — see the ordering lesson documented there).
  // Everything the mode covers — topbar, sidebar, canvas, rail, overlays,
  // palette, screen — flips through one attribute recomputed in one place:
  // atomic by construction. Cleanup clears the override so unmounting the
  // shell can never leave Carbon smeared over an auth screen.
  useEffect(() => {
    setThemeOverride(mode);
    return () => setThemeOverride(null);
  }, [mode]);

  // Entity labels are cleared by their PRODUCER's unmount cleanup, not by a
  // pathname effect here. A parent effect clearing on route change runs AFTER
  // the newly mounted screen's set — child effects fire first — so the first
  // cut of this cleared every label the moment it was written. The producer
  // owning both ends has no ordering to lose.

  const value = useMemo(
    () => ({ mode, entityLabel, setEntityLabel, chrome, setChrome }),
    [mode, entityLabel, chrome],
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
/** Null-safe: screens render in unit tests without the shell provider. */
export function usePresentationChrome(): { chrome: PresentationChrome; setChrome: (c: PresentationChrome) => void } | null {
  const v = useContext(PresentationContext);
  return v ? { chrome: v.chrome, setChrome: v.setChrome } : null;
}

export function usePresentationMode(): PortalPresentationMode {
  return useContext(PresentationContext)?.mode ?? "research-light";
}
