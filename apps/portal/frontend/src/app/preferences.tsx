/**
 * Shell preferences — theme, density and commissioned-module visibility.
 *
 * These are presentation preferences only. They never change what data the
 * Portal reports, and `showCommissioned` filters navigation without hiding a
 * feature that the user reaches by direct URL — a bookmarked commissioned
 * route still opens its preview.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import type { ThemeName } from "../styles/tokens";

export type Density = "comfortable" | "compact" | "operational";

export interface Preferences {
  theme: ThemeName;
  density: Density;
  showCommissioned: boolean;
  sidebarCollapsed: boolean;
}

const DEFAULTS: Preferences = {
  theme: "research",
  density: "comfortable",
  showCommissioned: true,
  sidebarCollapsed: false,
};

const STORAGE_KEY = "portal.preferences.v1";

interface PreferencesContextValue extends Preferences {
  set: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

function readStored(): Preferences {
  if (typeof localStorage === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    return {
      theme: parsed.theme === "operations" ? "operations" : DEFAULTS.theme,
      density:
        parsed.density === "compact" || parsed.density === "operational"
          ? parsed.density
          : DEFAULTS.density,
      showCommissioned:
        typeof parsed.showCommissioned === "boolean"
          ? parsed.showCommissioned
          : DEFAULTS.showCommissioned,
      sidebarCollapsed:
        typeof parsed.sidebarCollapsed === "boolean"
          ? parsed.sidebarCollapsed
          : DEFAULTS.sidebarCollapsed,
    };
  } catch {
    return DEFAULTS;
  }
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(readStored);

  // Density is an attribute on <html> so the token cascade sees one source of
  // truth. The THEME attribute is deliberately not written here any more: the
  // route-aware presentation provider owns it (app/presentation.tsx), because
  // on an Execution route the workspace is Carbon regardless of preference,
  // and two writers of one attribute race on every preference change — the
  // loser painting half the workspace. This provider still owns the stored
  // preference; presentation reads it and applies it wherever no override is
  // active.
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-density", preferences.density);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      /* Private mode or quota: preferences stay in-memory for this session. */
    }
  }, [preferences]);

  const value = useMemo<PreferencesContextValue>(
    () => ({
      ...preferences,
      set: (key, next) => setPreferences((current) => ({ ...current, [key]: next })),
    }),
    [preferences],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesContextValue {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error("usePreferences must be used inside PreferencesProvider");
  return value;
}
