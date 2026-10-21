/**
 * The "quiet" gate of the measurement meters (measureLane.ts, execution-v2-coexistence.spec.ts), as a pure function.
 *
 * Quiet = nothing in flight AND nothing started or finished for `quietMs`, counted from the call. If that is not reached
 * before `capMs` elapses the window is NOT settled, so the sample is not a measurement: the gate throws
 * MeasurementQuietTimeout (code MEASUREMENT_QUIET_TIMEOUT, `invalidMeasurement: true`) instead of returning. The deadline is never
 * extended and the failure is never swallowed here; a caller that catches it must record the sample as INVALID, never PASS.
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
 * @returns {Promise<{ waitedMs: number }>} resolves only when the window is genuinely quiet
 */
export async function waitForQuiet({ quietMs, capMs, stepMs = 50, now, sleep, state }) {
  const startedAt = now();
  const deadline = startedAt + capMs;
  for (;;) {
    const t = now();
    const { inFlight, lastActivity } = state();
    // Counted from this call: activity before it does not make the window quiet, a body that has just mounted is inside it.
    const msSinceActivity = t - Math.max(lastActivity, startedAt);
    if (inFlight === 0 && msSinceActivity >= quietMs) return { waitedMs: t - startedAt };
    if (t >= deadline) throw new MeasurementQuietTimeout({ waitedMs: t - startedAt, capMs, quietMs, inFlight, msSinceActivity });
    await sleep(stepMs);
  }
}
