import { AccessPolicyError } from "./access.contract";

/** Operator-safe refusal categories. Never serialize the underlying exception:
 * paths, private artifacts and source/SQL details are not an owner receipt. */
export function nativeInstallFailureCode(error: unknown): string {
  if (error instanceof AccessPolicyError &&
      (error.code === "POLICY_REVISION_CONFLICT" || error.code === "RECEIPT_NOT_QUALIFIED")) {
    return error.code;
  }
  if (error instanceof Error &&
      /^(CURRENT_HUMAN_SCHEMA_[A-Z_]+|NATIVE_RESEARCH_INSTALL_GRANT_WINDOW_REQUIRED)$/.test(error.message)) {
    return error.message;
  }
  return "NATIVE_RESEARCH_INSTALL_FAILED";
}
