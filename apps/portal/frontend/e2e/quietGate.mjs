/**
 * The "quiet" gate of the measurement meters (measureLane.ts, execution-v2-coexistence.spec.ts), as a pure function.
 *
 * Quiet = nothing in flight AND nothing started or finished for `quietMs`, counted from the call. If that is not reached
 * before `capMs` elapses the window is NOT settled, so the sample is not a measurement: the gate throws
 * MeasurementQuietTimeout (code MEASUREMENT_QUIET_TIMEOUT, `invalidMeasurement: true`) instead of returning. The deadline is never
 * extended and the failure is never swallowed here; a caller that catches it must record the sample as INVALID, never PASS.
 *
 * Policy (the cap is a deadline for ACHIEVING quiet, not for noticing it): quiet is achieved at
 *   quietAt = max(lastActivity, callTime) + quietMs
 * and the gate passes only when nothing is in flight now AND quietAt <= callTime + capMs. `quietAt` is computed from the injected clock
 * and the activity timestamp, never from the (possibly late) time at which the loop woke up. So a wake-up after the deadline cannot turn
 * a window that was still busy inside the cap into a pass (call 0, cap 15000, quiet 400, last activity 14900, wake 15500: quiet could
 * only have held from 15300 > cap, so it throws), while a window that was already quiet by the cap still passes when the wake is late.
 * Exact-cap semantics (inclusive): last activity at exactly callTime + capMs - quietMs gives quietAt == deadline and PASSES; one ms
 * later gives quietAt == deadline + 1 and throws MEASUREMENT_QUIET_TIMEOUT. If quietMs > capMs no window can ever pass.
 *
 * Time and sleeping are injected so unit tests run on a controlled clock (scripts/measure/measure.test.mjs); the meters pass
 * Date.now and page.waitForTimeout. No polling of the page: the gate reads two counters the meter already keeps.
 */
export const MEASUREMENT_QUIET_TIMEOUT = "MEASUREMENT_QUIET_TIMEOUT";

export class MeasurementQuietTimeout extends Error {
  constructor(detail) {
    super(
      `${MEASUREMENT_QUIET_TIMEOUT}: INVALID_MEASUREMENT, not quiet after ${detail.waitedMs} ms (cap ${detail.capMs} ms, quiet interval ${detail.quietMs} ms): ` +
        `${detail.inFlight} request(s) still in flight, ${detail.msSinceActivity} ms since the last request activity`,
    );
    this.name = "MeasurementQuietTimeout";
    this.code = MEASUREMENT_QUIET_TIMEOUT;
    this.invalidMeasurement = true;
    this.detail = detail;
  }
}

/**
 * @param {{ quietMs: number, capMs: number, stepMs?: number,
 *           now: () => number, sleep: (ms: number) => Promise<unknown>,
 *           state: () => { inFlight: number, lastActivity: number } }} o
 * @returns {Promise<{ waitedMs: number, quietAchievedAtMs: number }>} resolves only when the window was genuinely quiet by the cap
 */
export async function waitForQuiet({ quietMs, capMs, stepMs = 50, now, sleep, state }) {
  const startedAt = now();
  const deadline = startedAt + capMs;
  for (;;) {
    const t = now();
    const { inFlight, lastActivity } = state();
    // Counted from this call: activity before it does not make the window quiet, a body that has just mounted is inside it.
    const msSinceActivity = t - Math.max(lastActivity, startedAt);
    const quietAt = Math.max(lastActivity, startedAt) + quietMs;
    if (inFlight === 0 && t >= quietAt && quietAt <= deadline) return { waitedMs: t - startedAt, quietAchievedAtMs: quietAt - startedAt };
    if (t >= deadline) throw new MeasurementQuietTimeout({ waitedMs: t - startedAt, capMs, quietMs, inFlight, msSinceActivity, quietAchievableAtMs: quietAt - startedAt });
    await sleep(stepMs);
  }
}
