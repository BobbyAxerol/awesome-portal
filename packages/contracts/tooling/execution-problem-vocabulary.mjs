// FE-061 · closed public vocabularies for `error.code` of the Portal's access and pending-control problem bodies.
// Single source for generate-execution-access.mjs and generate-execution-pending-control.mjs; the source side of this
// list is re-derived from the TypeScript by apps/control-api/test/problem-code-vocabulary.spec.ts, which fails on drift.
//
// Where each code comes from (apps/control-api/src):
//  - ACCESS_REFUSAL_CODES: the `AccessRefusal` union of execution-v2/access.contract.ts. `AccessPolicyError` can carry nothing
//    else, and both access.controller.ts and pending-control.controller.ts forward its code unchanged (pending maps status 404
//    to PENDING_CONTROL_NOT_FOUND).
//  - MUTATION_SECURITY_CODES: `MutationSecurityDenial` of auth/mutation-security.ts, thrown by both controllers with status 403.
//  - SHARED_TRANSPORT_CODES: the session guard (SESSION_REQUIRED), CurrentHumanWorkspaceProvisioner
//    (WORKSPACE_PROVISIONING_CONFLICT, PORTAL_AUTHORITY_UNAVAILABLE) and http-error.filter.ts (REQUEST_REJECTED for any other
//    HttpException, PORTAL_READ_STORE_UNAVAILABLE for a GET read-store outage, INTERNAL_ERROR for every unclassified failure;
//    the last is the only code that appears with an undeclared status, 500).
//  - ACCESS_ROUTE_CODES: the two codes access.controller.ts itself raises. PENDING_CONTROL_ROUTE_CODES: the code
//    pending-control.controller.ts itself raises besides the PendingControlReason members (NOT_FOUND and UNAVAILABLE are members).
export const ACCESS_REFUSAL_CODES = Object.freeze([
  'POLICY_PENDING', 'CURRENT_ACTOR_AUTHORITY_REQUIRED', 'ACCESS_DENIED', 'DELEGATION_CEILING_EXCEEDED',
  'SELF_PRIVILEGE_CHANGE_DENIED', 'PROTECTED_OWNER_CHANGE_DENIED', 'OWNER_RECOVERY_NOT_APPROVED', 'POLICY_REVISION_CONFLICT',
  'GRANT_REVISION_CONFLICT', 'TS_MEMBERSHIP_NOT_ACCEPTED', 'TS_MEMBERSHIP_REVISION_CONFLICT', 'SOURCE_RELATION_NOT_QUALIFIED',
  'RESEARCHER_FIELD_POLICY_PENDING', 'IDEMPOTENCY_KEY_PAYLOAD_CONFLICT', 'RECEIPT_NOT_QUALIFIED', 'RECEIPT_BINDING_MISMATCH',
  'RECEIPT_REVISION_CONFLICT', 'RECEIPT_PAYLOAD_CONFLICT', 'STEP_UP_REQUIRED', 'STEP_UP_REJECTED', 'ACCESS_RESOURCE_NOT_FOUND',
  'ACCESS_RETRY_REQUIRED', 'ACCESS_SCOPE_LIMIT_EXCEEDED', 'ACCESS_CURSOR_INVALID',
]);
export const MUTATION_SECURITY_CODES = Object.freeze(['ORIGIN_MISSING', 'ORIGIN_DENIED', 'CSRF_MISSING', 'CSRF_INVALID']);
export const SHARED_TRANSPORT_CODES = Object.freeze([
  'SESSION_REQUIRED', 'WORKSPACE_PROVISIONING_CONFLICT', 'PORTAL_AUTHORITY_UNAVAILABLE', 'REQUEST_REJECTED',
  'PORTAL_READ_STORE_UNAVAILABLE', 'INTERNAL_ERROR',
]);
export const ACCESS_ROUTE_CODES = Object.freeze(['ACCESS_INPUT_INVALID', 'IDEMPOTENCY_KEY_REQUIRED']);
export const PENDING_CONTROL_ROUTE_CODES = Object.freeze(['PENDING_CONTROL_INPUT_INVALID']);

const unique = codes => {
  if (new Set(codes).size !== codes.length) throw new Error('Problem vocabulary lists a code twice.');
  return Object.freeze([...codes]);
};
export const ACCESS_PROBLEM_CODES = unique([
  ...ACCESS_REFUSAL_CODES, ...ACCESS_ROUTE_CODES, ...MUTATION_SECURITY_CODES, ...SHARED_TRANSPORT_CODES,
]);
/** `reasonCodes` is `pendingControlReason.options`, read from the runtime contract by the pending-control generator. */
export const pendingControlProblemCodes = reasonCodes => unique([
  ...reasonCodes, ...PENDING_CONTROL_ROUTE_CODES, ...ACCESS_REFUSAL_CODES, ...MUTATION_SECURITY_CODES, ...SHARED_TRANSPORT_CODES,
]);
export const PROBLEM_CODE_DESCRIPTION =
  'Closed vocabulary (FE-061). A value outside it is a contract violation, not a new code; the consumer must not invent copy for it.';
