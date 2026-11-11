# C2 STATUS preparation writer fence — 2026-11-06

**SOURCE WIP / DISPOSABLE TESTS ONLY.** Not a candidate freeze, installed
runtime, real owner acceptance, real Edge ACK, V2 restore or phase PASS.
Checkout `docs/research-loop-plan@2faa8968fddb` contains shared uncommitted WIP.

## Finding and correction

The candidate C2 STATUS issuer could issue when the durable preparation was
absent, and, when present, its earlier test compared only the context digest
and consumption marker. A changed call or other correlated values could thus
reach lease issuance. This was reproduced with synthetic identities and a
disposable PostgreSQL cell; it is not a claim of a production incident.

Under the existing authority transaction lock, the writer now requires one
unconsumed preparation for C2 and checks its context, actor/session revision,
workspace/workload, original/fingerprint, call, binding, receiver, authority
fingerprint, request/token digests and timestamps before issuing. Legacy
non-C2 contexts without a preparation retain their existing behavior. This
does not establish independent owner authentication or prevent a privileged
writer from forging the preparation and its linked fingerprint.

The P7 synthetic two-PG suite exercises absent preparation, eleven changed
correlation inputs, valid issue, successor, same-original recovery and the
existing revoke/HTTP paths. Direct-preparation rows used for specific synthetic
cases are seeded only in disposable tests; they are not source authority.

## Verification and failures retained

- Before the writer fix, the negative mismatch test reproduced an unexpected
  issue. Intermediate retakes also exposed test setup problems: authority
  revision changed after fixture grants, a missing fixture variable, and
  finally an assertion expecting the old later refusal when the new fence
  correctly rejected first. The last pre-fix-expectation retake was 6/9; it is
  not counted as a PASS.
- `bash scripts/test-elp2-c2-p7-pg.sh owner-intent`: **9/9 PASS** on two
  independent disposable PostgreSQL clusters with synthetic source and owner.
- `bash scripts/test-elp2-restore-inventory-rls.sh status-recovery`: **3 PASS,
  5 SKIP**. `... c2-trust-reuse`: **3 PASS, 107 SKIP**. `... status-context`:
  **1 PASS, 109 SKIP**. These are selected tests, not the full suites; the
  latter two select from the same test file and counts are not a coverage sum.
- Focused strict TypeScript for `current-human-candidate.ts`: exit 0. This is
  not a test-inclusive full-project typecheck or normal hook.
- The two-PG script bounds its containers to 2 CPU / 1.5 GiB aggregate;
  actual peaks were not measured. Script traps performed their named teardown;
  a subsequent rootful Docker listing for the relevant test-cell prefixes was
  empty. No shared runtime, production data, frontend, Edge, or Live was
  modified.

## Source pins

| File | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/current-human-candidate.ts` | `3047fcf51029bd0c2e1933a621781ea1f91813c33d50eddb049788cc3e57f950` |
| `apps/control-api/test/c2-p7-owner-intent-candidate-pg.spec.ts` | `b5b60e5e55e40eaff4ec7ca1b8e663f7fc3c53267964bfce7465054cb3464c3a` |
| `scripts/test-elp2-c2-p7-pg.sh` | `daa31f5783e43c1812dc355ab0a3e9e505aa54b3ca3b347ae544c9f3e15f60da` |
| `scripts/test-elp2-restore-inventory-rls.sh` | `012de1838287af5fb1333ad49f48bfec93fcebc4ee5be51b1e4367bc0c9c8d25` |

## Remaining / handoff

Review WIP composition and enforce the runtime-only HTTP delivery custody;
qualify the restricted writer/owner authority and independent restore fence;
reconcile genuine terminal/ACK through Edge; then run affected integration,
migration/rollback and normal gate on a frozen candidate. Keep P7 and V2
restore fail-closed until those gates pass. No frontend contract changed and
no Claude consumer action is requested by this isolated change. Rollback is to
leave the candidate WIP uninstalled; no live schema/data was altered.

## Follow-through: resume and revalidation

The initial writer fence did not itself check the current preparation on a
same-lease resume or post-custody revalidation. A test-only privileged update
marked the preparation consumed while its lease remained ISSUED; the old
resume returned the synthetic assertion rather than refusing it. The normal
consume path refuses an unresolved lease, so this is a corruption/restore or
other-writer counterexample, not proof that ordinary consume creates that
state or that production was affected. The pre-fix cell recorded **5/9 PASS**;
the first failure exposed the missed refusal and three later cases depended on
the aborted first case. Only TEST_ONLY credentials/assertions were involved.

The candidate now uses the same preparation/fingerprint comparison under the
authority transaction lock for C2 issue, same-original resume and revalidation.
The existing non-C2 issue rule remains unchanged. After the test-only update,
both resume and revalidation refuse; an unchanged valid original still resumes.
This is not runtime HTTP custody, independently qualified DB writer authority,
or a cross-process/old-holder fence after that transaction commits.

- Two-PG P7/STATUS retake: **9/9 PASS**; this includes unrelated synthetic
  counterexample tests whose PASS is not a P7 security qualification.
- Legacy `status-context` selection: **1 PASS, 109 SKIP**. Focused strict
  source typecheck: exit 0. Neither result is the full project gate.
- Script-created PostgreSQL cells self-cleaned; a read-only rootful Docker
  listing of relevant test-cell prefixes was empty. No live runtime or DB was
  modified. Configured aggregate cell limit was 2 CPU / 1.5 GiB; actual peaks
  were not measured.
- Updated WIP SHA-256: `current-human-candidate.ts` =
  `364d601d4ceedf490a285b641412286a2a98f40c0bde69e908bc8661dc81f555`;
  `c2-p7-owner-intent-candidate-pg.spec.ts` =
  `36c1155529e8985f7bc2f4a03740492eae9db3df395421dcbcec28cf338d7164`.

The earlier source pins above describe that earlier retake, not this new WIP.
Remaining authority, genuine Edge ACK, V2 restore and integration gates are
unchanged. No frontend contract or Claude action is introduced.

## Follow-through: preparation held through revalidation

The preparation comparison now takes `FOR SHARE OF p` under the existing
authority transaction, so an independently executing writer cannot modify the
selected preparation between that comparison and the end of the issuer's
transaction. In a disposable two-PG test, an artificially held later scope
lock pauses actual STATUS revalidation after its preparation check; a second
privileged test transaction's attempt to mark the preparation consumed times
out on the row lock. Releasing the scope allows the unchanged valid
revalidation to finish. This exercise models an uncoordinated writer; it is
not evidence of a deployed incident or of a qualified writer role.

- Two-PG P7/STATUS regression **9/9 PASS**, including that lock test; legacy
  context selection **1 PASS / 109 SKIP**; focused strict source typecheck
  exit 0. These are not the complete project suite or final hook.
- The lock ends at transaction completion: HTTP egress, old-holder fencing,
  source ownership and genuine Edge ACK remain separate open gates. PostgreSQL
  row-lock permission and restricted runtime roles must be qualified on the
  candidate installation; test DB-owner privileges do not prove that boundary.
- The script-created cells self-cleaned; read-only rootful container listing
  for their prefixes was empty. Aggregate configured limit 2 CPU / 1.5 GiB;
  actual peaks were not measured. No live runtime or DB was changed.
- Current WIP SHA-256: `current-human-candidate.ts` =
  `6cd480f3ddca840b7238ea047fd07c503ebda939fed88e8424ec1006adf04598`;
  `c2-p7-owner-intent-candidate-pg.spec.ts` =
  `96a9c949c82cd629dd0f34739c666e93142e4a1c621c86c81f5f0424eea12877`.
  Earlier pins describe the earlier tests and must not be treated as this WIP.
