/**
 * The single point that writes `data-theme` on <html> — EL-V2-01.
 *
 * Two components legitimately influence the theme: the stored preference
 * (Research/Operations, written by `PreferencesProvider`, which also covers
 * the auth screens that render before the shell mounts) and the route-derived
 * Execution override (written by `PortalPresentationProvider`, which only
 * exists inside the shell). Letting each write the attribute directly made the
 * outcome depend on React effect ordering — child effects run before parents,
 * so the preference writer overwrote the override on mount and the workspace
 * split in half again.
 *
 * Instead both callers hand their half to this module and the attribute is
 * recomputed from the pair. Whoever runs last, the answer is the same.
 */
import type { PortalPresentationMode } from "../app/presentation";

let preference = "research";
let override: PortalPresentationMode | null = null;

function apply(): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute(
    "data-theme",
    override === "execution-carbon"
      ? "execution-carbon"
      : override === "governance-light"
        ? // The governance review room is light regardless of the stored
          // Research/Operations preference (owner, 2026-08-30). It reuses the
          // research tokens — one light palette, not a second one.
          "research"
        : preference,
  );
}

export function setThemePreference(theme: string): void {
  preference = theme;
  apply();
}

/** `null` = no route override active (Research/Planning/auth). */
export function setThemeOverride(mode: PortalPresentationMode | null): void {
  override = mode === "execution-carbon" || mode === "governance-light" ? mode : null;
  apply();
}

/** Test hook: the writer is module state and must not leak between tests. */
export function __resetThemeWriter(): void {
  preference = "research";
  override = null;
}
