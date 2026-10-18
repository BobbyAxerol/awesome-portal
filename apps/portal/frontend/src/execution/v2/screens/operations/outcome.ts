/**
 * How a queue row reads: receipt, next step, words.
 *
 * Three fields, three questions, never merged (operations.ts, V1):
 *   source_status        what the source did
 *   verification_result  what verification observed
 *   triage_state         what a person in the Portal has done
 *
 * The receipt flag is the one place the first two meet, and it fails toward
 * doubt: an unknown or uncertain outcome is `unknown`, a success the
 * verifier has not confirmed is `pending`, and only a success that
 * verification also confirmed is `ok`. Nothing else is ever green.
 */
import type { FlagKind } from "../../flagKinds";
import type {
  SeverityV2, SourceStatusV2, TargetTypeV2, TriageStateV2, VerificationResultV2,
} from "../../readers/operationalQueue";

export interface OutcomeView {
  kind: FlagKind;
  label: string;
  /** The reader must check the original request before doing anything else. */
  checkOriginal: boolean;
}

/** `NOT_STARTED` -> `Not started`. */
export function humanize(code: string): string {
  const spaced = code.toLowerCase().replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function receiptOutcome(source: SourceStatusV2, verification: VerificationResultV2): OutcomeView {
  // Doubt first: either axis saying "uncertain" wins over any success beside it.
  if (source === "UNCERTAIN" || verification === "UNCERTAIN") {
    return { kind: "unknown", label: "Unknown outcome", checkOriginal: true };
  }
  if (source === "FAILED" || verification === "FAILED") return { kind: "rejected", label: "Failed", checkOriginal: false };
  if (verification === "DENIED") return { kind: "rejected", label: "Denied", checkOriginal: false };
  if (source === "EXPIRED" || verification === "EXPIRED") return { kind: "stale", label: "Expired", checkOriginal: false };
  if (source === "BLOCKED") return { kind: "attention", label: "Blocked, not sent", checkOriginal: false };
  if (verification === "PARTIAL") return { kind: "partial", label: "Partial", checkOriginal: false };
  if (source === "SUCCEEDED" && verification === "SUCCEEDED") return { kind: "ok", label: "Verified", checkOriginal: false };
  if (source === "SUCCEEDED") return { kind: "pending", label: "Succeeded, not verified", checkOriginal: false };
  if (source === "RUNNING") return { kind: "pending", label: "Running", checkOriginal: false };
  return { kind: "pending", label: "Pending", checkOriginal: false };
}

/** Triage is a Portal record. RESOLVED is never green: it does not say the source is fine. */
export function triageOutcome(state: TriageStateV2): { kind: FlagKind; label: string } {
  switch (state) {
    case "UNACKNOWLEDGED": return { kind: "attention", label: "Unacknowledged" };
    case "ACKNOWLEDGED": return { kind: "neutral", label: "Acknowledged" };
    case "RESOLVED": return { kind: "neutral", label: "Resolved in the Portal" };
  }
}

export function severityWord(severity: SeverityV2): string {
  return humanize(severity);
}

export const TARGET_LABEL: Readonly<Record<TargetTypeV2, string>> = {
  ACCOUNT: "Account",
  PORTFOLIO: "Portfolio",
  DEPLOYMENT: "Deployment",
};

/** One sentence: both axes in words, for the cell under the flag. */
export function axesText(source: SourceStatusV2, verification: VerificationResultV2): string {
  return `Source ${humanize(source).toLowerCase()} · verification ${humanize(verification).toLowerCase()}`;
}

export const CHECK_ORIGINAL_COPY = "Outcome unknown. Check the original request. Do not send it again.";
