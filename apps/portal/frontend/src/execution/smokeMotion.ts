/**
 * Smoke motion switch shared by every `*.smoke.ts` tick hook.
 *
 * Motion is off under `prefers-reduced-motion` and on the evidence fixtures
 * page (`/execution/_fixtures`), where a dozen screens mount at once and a
 * dozen 1s/1.4s timers would re-render the whole page continuously — the
 * audits measure a still page, and the baselines must be deterministic.
 */
export function smokeMotionAllowed(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
  if (window.location?.pathname.includes("/_fixtures")) return false;
  return true;
}
