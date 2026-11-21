/** Restored STATUS custody is complete only if EVERY retained context link
 * still resolves to the matching lease and authenticated ACK. This query does
 * not establish that the restore retained every historical link: an external
 * checkpoint/source census is still required before V2 cutover. */
export const COMMAND_STATUS_ACK_CENSUS_SQL = `WITH ordered AS (
  SELECT c.*, row_number() OVER (ORDER BY c.delivery_sequence)-1 AS expected_sequence,
    lag(c.lease_id) OVER (ORDER BY c.delivery_sequence) AS expected_previous,
    first_value(c.context_nonce) OVER chain AS expected_nonce,
    first_value(c.authority_fingerprint) OVER chain AS expected_authority,
    first_value(c.status_token_digest) OVER chain AS expected_status_token,
    first_value(c.status_request_digest) OVER chain AS expected_status_request,
    first_value(c.status_issued_at_ms) OVER chain AS expected_status_issued,
    first_value(c.receiver_id) OVER chain AS expected_receiver,
    first_value(c.context_expires_at_ms) OVER chain AS expected_expiry,
    first_value(c.request_digest) OVER chain AS expected_request
  FROM execution_command_status_context_links c WHERE c.context_digest=$1
  WINDOW chain AS (ORDER BY c.delivery_sequence)
)
SELECT count(*)::int AS total, count(*) FILTER (WHERE
  c.delivery_sequence <> c.expected_sequence OR c.previous_lease_id IS DISTINCT FROM c.expected_previous OR
  c.context_nonce IS DISTINCT FROM c.expected_nonce OR c.authority_fingerprint IS DISTINCT FROM c.expected_authority OR
  c.status_token_digest IS DISTINCT FROM c.expected_status_token OR c.status_request_digest IS DISTINCT FROM c.expected_status_request OR
  c.status_issued_at_ms IS DISTINCT FROM c.expected_status_issued OR c.receiver_id IS DISTINCT FROM c.expected_receiver OR
  c.context_expires_at_ms IS DISTINCT FROM c.expected_expiry OR c.request_digest IS DISTINCT FROM c.expected_request OR
  c.original_digest IS DISTINCT FROM $2 OR c.call_digest IS DISTINCT FROM $3 OR c.binding_digest IS DISTINCT FROM $4 OR
  l.lease_id IS NULL OR l.subject_id IS DISTINCT FROM $5 OR l.session_id IS DISTINCT FROM $6 OR
  l.session_revision IS DISTINCT FROM $7::bigint OR l.workspace_id IS DISTINCT FROM $8 OR
  l.environment IS DISTINCT FROM 'paper' OR l.workload_id IS DISTINCT FROM $9 OR
  l.request_digest IS DISTINCT FROM c.request_digest OR
  ((l.c2_custody_binding_digest IS NOT NULL OR l.c2_p7_binding_digest IS NOT NULL) AND
    l.human_assertion_digest IS NULL) OR
  (l.human_assertion_digest IS NOT NULL AND c.assertion_digest IS DISTINCT FROM l.human_assertion_digest) OR NOT EXISTS (
    SELECT 1 FROM execution_command_status_delivery_acks a WHERE a.lease_id=l.lease_id
      AND a.subject_id=l.subject_id AND a.session_id=l.session_id AND a.session_revision=l.session_revision
      AND a.workspace_id=l.workspace_id AND a.environment=l.environment AND a.workload_id=l.workload_id
      AND a.request_digest=l.request_digest AND a.terminal_receipt_digest=l.terminal_receipt_digest
      AND l.phase IN ('COMMITTED','ROLLED_BACK')
  ))::int AS unresolved
FROM ordered c LEFT JOIN elp210_candidate.leases l ON l.lease_id=c.lease_id`;
