/**
 * `useMediaQuery(query)`: whether the browser says the query matches now, and
 * again whenever it changes. `false` where the browser cannot tell (jsdom,
 * SSR), so the wide layout is the default. Same guard as `useDockMode`.
 */
import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
  const list = () => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(query) : null);
  const [matches, setMatches] = useState(() => list()?.matches ?? false);
  useEffect(() => {
    const mql = list();
    if (!mql) return;
    const sync = () => setMatches(mql.matches);
    sync();
    mql.addEventListener("change", sync);
    return () => mql.removeEventListener("change", sync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);
  return matches;
}
