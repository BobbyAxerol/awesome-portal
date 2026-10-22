/**
 * Patience for the V2 screen tests that wait on a large render, a paging chain or a focus move.
 *
 * Testing-library gives `waitFor` / `findBy*` 1000 ms by default. On a quiet machine a 130-row table
 * renders far inside that; in the 2026-10-21 whole-suite run (hundreds of jsdom files in parallel) the
 * same renders took longer than a second and the tests failed while passing alone (DEBT-UXM07-032).
 * The assertion is unchanged: this only says how long a state that WILL arrive may take to arrive.
 * A test that is really broken still fails, just later; use it for states that appear, not for
 * "nothing happened" checks, where the longer limit would only slow a red test down.
 *
 * Pass it as the options object: `waitFor(() => expect(x).toBe(y), SLOW)`,
 * `findByRole("table", { name }, SLOW)`.
 */
export const SLOW = { timeout: 8000 } as const;

/**
 * Per-test budget (ms) for a test that chains several SLOW waits (page 50 -> 100 -> 130, then a typed
 * filter). The suite-wide `testTimeout` is 20 s; three waits that each take the full SLOW limit
 * would not fit in it. Same 2026-10-21 whole-suite flake.
 */
export const SLOW_TEST = 60_000;
