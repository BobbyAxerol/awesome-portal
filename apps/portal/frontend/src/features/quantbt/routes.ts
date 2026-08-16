/**
 * QuantBT route adaptation.
 *
 * The registry stays authoritative for WHICH legacy routes exist
 * (`legacy_routes` on the QUANTBT_RESEARCH feature); this module owns HOW its
 * own legacy paths translate to canonical ones. `routes.test.ts` asserts that
 * every legacy route the registry declares is handled here, so adding one to
 * the registry without a translation fails the build.
 */

/** Canonical module root. */
export const QUANTBT_ROOT = "/research/quantbt";

/** Result tabs, in flow order (v0.4 §P0.9). */
export const QUANTBT_TABS = ["overview", "optimization", "parameters", "execution", "audit"] as const;

export type QuantBTTab = (typeof QUANTBT_TABS)[number];

/**
 * Translates a legacy QuantBT path to its canonical equivalent.
 *
 * The compatibility window keeps `?run=` selection semantics intact: the query
 * string is preserved verbatim rather than being re-encoded into the path, so
 * an old deep link resolves to exactly the run it always did.
 *
 * Returns `null` when the path is not a QuantBT legacy route.
 */
export function canonicalQuantBTPath(pathname: string, search = ""): string | null {
  const normalised = pathname.replace(/\/+$/, "") || "/";
  const suffix = search && !search.startsWith("?") ? `?${search}` : search;

  if (normalised === "/runs") return `${QUANTBT_ROOT}/runs${suffix}`;

  const tab = normalised.slice(1);
  if ((QUANTBT_TABS as readonly string[]).includes(tab)) {
    return `${QUANTBT_ROOT}/${tab}${suffix}`;
  }
  return null;
}
