# Approval Evidence HISTORY/diff — authority design

Status: **design only, not commissioned, not mounted**. This does not add a
grant or declare an existing access action to mean financial HISTORY. It is
for the `prior_economic_history` and `evidence_diff` sections of the existing
Approval Evidence contract; their semantics and typed absence remain unchanged.

## Existing fences and gap

- `ApprovalEvidenceNativeDelivery` only admits `receipt_preview` and
  `obligations_after_approval`; its `CURRENT_SECTIONS` rejects both historical
  sections even if a qualifier tries to name them.
- `CurrentViewAuthority.validateSelection` requires HISTORY to have a separately
  supplied server-owned operation requirement, identical resource/dataset,
  non-null window and projection generation. `authorize` checks that requirement
  in addition to the business read. These are necessary, but the accepted
  operation-action vocabulary itself does **not** establish that any existing
  action authorizes Approval financial history.
- `CurrentViewCoreComposition.deliverNative` holds the native finite CURRENT
  custody; it is not a HISTORY transport. Neither a new label on CURRENT nor
  an Approval visibility check qualifies it for historical evidence.

## Required implementation before a positive history section

1. Edge must publish a qualified historical dataset, immutable snapshot and
   revision lineage, coverage/window and exact field/provenance policy, plus
   the source-owned relationship to the specific Approval and subject. For a
   diff it must identify both revisions and their common lineage, not infer a
   prior revision from the currently visible deployment.
2. Core and Edge must commission an explicitly reviewed, independent HISTORY
   purpose and matching source-grant mapping, bound to exact user, session,
   workspace, resource, dataset, version, window and allowed fields. Until
   that mapping exists no choice among existing action strings is a decision.
   CURRENT, STREAM, export, unrelated audit access and fixture data confer no
   such purpose by themselves.
3. Add a native HISTORY finite-delivery path with separate source operation,
   current human/purpose/section/path revalidation and the same physical HTTP
   custody, byte budget, immutable terminal, drain and recovery guarantees as
   CURRENT. Tie all returned sections and revisions to a qualified common
   snapshot; reject mixed snapshots or an inconsistent lineage. Recheck every
   required grant synchronously at physical dispatch. Do not mount by default.
4. Extend the qualifier/field policy only after the source semantics are
   reviewed. Preserve existing `null`/omitted distinction and current response
   schema. An unavailable field or absent revision cannot be filled with zero,
   derived from the CURRENT projection or repaired with a fixture value.

## Test and acceptance matrix

Current `approval-evidence-native-http.spec.ts` has explicit negative tests
that each of the two historical section names is refused under the CURRENT
composition. Full-history work must additionally test: CURRENT only; HISTORY
only without the required business read; wrong workspace, approval, subject,
dataset, window, projection generation or field; expired and revoked HISTORY
grant at source-read and dispatch; foreign/changed revision; mixed snapshots;
missing field/source; bounded output; lost terminal ACK and restart using the
same original; and zero bytes on refusal. Positive HTTP tests need real native
custody/PostgreSQL in an isolated cell and two genuinely qualified source
revisions. Synthetic vectors can prove the guards, never connected acceptance.

Owner: Core implements the transport and final fence after Edge supplies the
reviewed source/purpose/lineage contract. Edge remains the sole source-facing
coordination point. No component, runtime, credential or grant is changed by
this document.
