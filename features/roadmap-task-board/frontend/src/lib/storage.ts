/** Storage adapter — keeps legacy localStorage keys (Phase 1 F3/F4, manifest-compatible). */
export const LS_TASKS = "quantPortalTasksV1";
export const LS_PHASES = "quantPortalPhasesV1";
export const LS_BOARD_VIEW = "quantBoardViewV1";
export const LS_THEME = "quantPortalTheme";

export function storageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function storageSet(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function storageRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* noop */
  }
}

export function getTheme(): "light" | "dark" {
  const saved = storageGet(LS_THEME);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function saveTheme(theme: "light" | "dark"): void {
  storageSet(LS_THEME, theme);
  document.documentElement.dataset.theme = theme;
}