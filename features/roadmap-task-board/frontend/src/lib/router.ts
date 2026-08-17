/**
 * Hash router — legacy-compatible: #view=<view>&page=<pageId>.
 *
 * v1.1 removed the `interpretation`, `evidence` and `portal` (Portal Preview)
 * views. They are gone rather than hidden, so their hashes are no longer valid
 * and fall back to `docs` like any other unknown view.
 */
export type View = "docs" | "roadmap" | "board" | "reports";

export interface Route {
  view: View;
  page: string | null;
}

export function parseHash(hash: string): Route {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const view = (params.get("view") ?? "docs") as View;
  const page = params.get("page");
  const valid: View[] = ["docs", "roadmap", "board", "reports"];
  return { view: valid.includes(view) ? view : "docs", page };
}

export function routeHash(route: Route): string {
  if (route.view === "docs") {
    return `#view=docs&page=${route.page ?? ""}`;
  }
  return `#view=${route.view}`;
}

/** Subscribe to hash changes (equivalent of legacy applyHash-on-load + nav). */
export function subscribeHash(onChange: (route: Route) => void): () => void {
  const apply = () => onChange(parseHash(window.location.hash));
  window.addEventListener("hashchange", apply);
  apply();
  return () => window.removeEventListener("hashchange", apply);
}

export function navigate(route: Route): void {
  const next = routeHash(route);
  try {
    if (window.location.hash !== next) {
      window.history.pushState(null, "", next);
    }
  } catch {
    window.location.hash = next;
  }
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}
