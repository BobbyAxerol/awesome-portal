/**
 * Print is always the LIGHT palette (v0.4 §26.6; QA T-D1/T-D2).
 *
 * tokens.css restates only a dozen tokens inside `@media print`, so Operations Dark's status
 * tints (`--bad-bg`, `--state-*-bg`, `--accent-2-soft`, `--surface-*`) still printed as dark fills
 * with dark ink. Raw colours may not live outside the token files, so instead of redeclaring them
 * the document is switched to the light theme for the duration of the print and put back after.
 */
const LIGHT = "research";

export function installPrintLightTheme(): () => void {
  if (typeof document === "undefined" || typeof window === "undefined") return () => {};
  const root = document.documentElement;
  let saved: string | null | undefined;
  const enter = () => {
    if (saved !== undefined) return;
    saved = root.getAttribute("data-theme");
    if (saved !== LIGHT) root.setAttribute("data-theme", LIGHT);
  };
  const leave = () => {
    if (saved === undefined) return;
    if (saved !== null && saved !== LIGHT) root.setAttribute("data-theme", saved);
    else if (saved === null) root.removeAttribute("data-theme");
    saved = undefined;
  };
  const query = typeof window.matchMedia === "function" ? window.matchMedia("print") : null;
  const onQuery = (event: MediaQueryListEvent) => (event.matches ? enter() : leave());
  query?.addEventListener?.("change", onQuery);
  window.addEventListener("beforeprint", enter);
  window.addEventListener("afterprint", leave);
  if (query?.matches) enter();
  return () => {
    query?.removeEventListener?.("change", onQuery);
    window.removeEventListener("beforeprint", enter);
    window.removeEventListener("afterprint", leave);
    leave();
  };
}
