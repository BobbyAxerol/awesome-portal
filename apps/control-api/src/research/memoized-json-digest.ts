import { createHash } from "node:crypto";
import { canonicalResearchJson } from "./preflight.service";
import { ExactJsonCalculationMemo } from "./exact-json-calculation-memo";

const calculation = new ExactJsonCalculationMemo<string>();
/** Only exact-current JSON hash math is reused; no cached source authority. */
export function memoizedResearchJsonDigest(value: unknown): string {
  return calculation.calculate(value, () => createHash("sha256").update(canonicalResearchJson(value), "utf8").digest("hex"));
}
