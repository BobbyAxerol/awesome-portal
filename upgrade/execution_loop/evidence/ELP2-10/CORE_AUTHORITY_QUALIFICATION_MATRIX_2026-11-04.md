# Core authority / qualification impact matrix — 4 November 2026

Status: the namespace guard, restored COMMITTED test and actual-composition
Approval retakes are committed in `48e675f06b7102bb62e98dc448b98b404d0ffeca`
(tree `690722203b90b901ebcd70354d4959e2ac9ff435`). Its normal monorepo hook
exited 0: Control API 584 files / 12,327 tests passed, 5 files / 10 tests
skipped. The opt-in isolated restore/composition retakes were run separately;
they are not counted as hook coverage. Unrelated documentation WIP was present
during the hook. This is not an image or deployment identity. SHA-256
pins below identify individual bytes, not every input of a run. Reuse a receipt
only after checking its source, schema, configuration, fixtures, dependency and
runtime inputs, not simply because a file or a test name matches.

| Area and pin | Earlier evidence / what it proves | Required retake or external gate |
| --- | --- | --- |
| STATUS source assertion `92deaeaa1d8a9f8271d05b62eda0ffc3f2df13b667aa7ebd93856beaa3230d6e`; composition `6529d2425b867ee612b24dc0042355cf0b0694e739c17f4e59e865dd56023334`; preparations `823c810a4aaac2424c21fdba15052e655cfb150d70c8d1dc7a9d23aea02c631a` | [Retake](CORE_NATIVE_FINITE_RETAKE_2026-11-04.md#maintained-approval-issuer-crash-and-status-restored-repository-retake) covers process recovery and the actual fingerprint repository after populated TEST_ONLY custody restore. These three code hashes still match; the opt-in restore case ran separately and was skipped by the normal hook. | A genuine Edge original, terminal and ACK remain separate; repeat local STATUS/restore if code, schema or relevant dependencies change. |
| Migrations 0155/0156/0157/0158, respectively `e19def4c5dd28de66077469331ce0985a8397e9e971ff62d30b73c3fec1f1067`, `c48d6e76f45928eaf186cfce445dd72051274cdf5ca422a9e3ea6b4c0b271a6d`, `d0e5428fcc6c724de1a033e14f3a585b1318f6472350c0b1c2b589b894bf01b5`, `2461986e1c4d8873b44aa719368ab2c8b95ab0e38aaa5060c133841ff3f27b53` | [Combined historical-clone/custody retake](CORE_NATIVE_FINITE_RETAKE_2026-11-04.md#historical-clone-with-synthetic-custody--restore-retake) covers migrated protected rows, selected security metadata, a refused unapproved down and dump/restore with synthetic custody/STATUS records. These SQL hashes still match. | This does not prove an approved operational rollback, all database objects, actual Edge ACK or the final deployed candidate. Repeat affected scope if migration/schema/security dependencies change. |
| Restore lease fencing | The separate [M-6b fixture drill](measurements/M-6b-2026-10-21.json) reports two successful disposable PostgreSQL repetitions: immediately after snapshot restore the old holder was still valid, and only an epoch-checked reset fenced it before a new tenure committed. This is a separate, small synthetic Manager-only drill, not the historical-clone/custody retake. | A plain restore is unsafe to promote as a rollback: preserve post-snapshot revocations and late facts, quiesce affected paths, and prove applicable fencing/reconciliation on the final candidate before accepting operational recovery. M-6b does not establish current-human grant restoration, source epoch reconciliation, production-scale RTO or connected acceptance. |
| Historical UDB authorization restore | The older [UDB-04 scoped DR retake](../../../research_loop/evidence/UDB-04/test-receipt.md#later-scoped-retake) reports a stale pre-revocation restore refused before cutover, followed by current-authority restore and 27 Execution table hashes matching on its named image `c18099d2`. Its legacy script (`049eb351318013bc519d0a1aca77836c87cda4582396574ad540a0b84e5c0850`) fingerprints only its original authority tables. The [guard retake](CORE_NATIVE_FINITE_RETAKE_2026-11-04.md#legacy-udb-dr-schema-guard) makes that harness refuse an Execution V2 schema instead of claiming this older barrier protects newer custody. | This is prior-candidate evidence, not a retake on the current ELP2 candidate or proof that late source facts and every new custody table survive recovery. The historical image identifier is not a Git object. Build and verify a V2-compatible recovery barrier in a disposable cell; never restore a shared runtime to perform the drill. |
| Historical UDB rollout inventory | `scripts/research-udb/inventory.cjs` SHA-256 `f1d4400c06efe6e6d84da75b8272634fd41634437f5ce9319dd0780c4de7fad9` inventories table metadata broadly but computes row-level custody fingerprints only for a fixed legacy list. The separate rollout comparison also deliberately excludes session rows and checks a subset of binding fields. | Do not treat its table count or broad metadata inventory as row-level preservation proof for V2 grants, native custody, STATUS originals or ACKs. A current-candidate rollout/restore needs an explicit V2 custody and authority inventory and appropriate concurrency fences. |
| Approval native delivery `3c618bbf090dcaa9c8daaa7383302d63a641e47ffc6828e073c3860869db1991` | [Approval receipt](APPROVAL_EVIDENCE_NATIVE_CUSTODY_2026-11-04.md) records synthetic HTTP/fence tests and a normal hook on `7266bb53f`; this code hash still matches. The [PG/native retake](CORE_NATIVE_FINITE_RETAKE_2026-11-04.md#maintained-approval-issuer-crash-and-status-restored-repository-retake) additionally exercises a killed issuer and process recovery using a synthetic selected-read adapter/source; test commit `fec700592` passed the normal hook. | Real section/field authority, source lineage and connected ACK remain uncommissioned. |
| Sibling native delivery `e03d9401978af38bf0fb848333a1d17c84f200ab91cabb9567fa524bd58b23e1` | [Retake](CORE_NATIVE_FINITE_RETAKE_2026-11-04.md) covers synthetic source via isolated native PG/mTLS/HTTP including paging/revoke; the official grouped gate passed 53/53 and its restore drill passed. Commit `d1462632c` passed the normal hook. | Repeat relevant tests when its dependencies change. Qualified source and order relation are still absent. |
| HISTORY/diff | CURRENT-only rejection is covered by the Approval focused negative tests; see [design](APPROVAL_HISTORY_DIFF_AUTHORITY_DESIGN_2026-11-04.md). | Independent purpose, historical native custody, source lineage and positive connected acceptance are not implemented/commissioned. |
| Workload / G2 | M7 driver `53774ef36cff201e0072672def6d31756f836419448837f47c2bf9dca76ebc6b`, read sets `83809ec2950c1bb471077b62a45a0cc5780107f9aef6937a37b788bd27fd704f`; the current Manager workload, selection and reservation guard tests passed **33/33** with local subprocesses permitted. Their CLI dry-runs do not send load or grant authority. The earlier sandboxed attempt failed because subprocess creation returned `EPERM`; it is not a PASS. | Recheck stop/cleanup on the chosen candidate and compare all dependencies, not just these hashes. Production-representative G2 needs approved target, numeric bounds and calibration. |
| Test-inclusive TypeScript | `npm run typecheck` in Control API, including tests and the cross-loop project, exited 0 on this working source; see [retake](CORE_NATIVE_FINITE_RETAKE_2026-11-04.md). | Repeat on relevant source or dependency changes. A build-only compilation does not substitute for it. |
| Browser / connected | None of the synthetic tests above is an Edge or browser acceptance. | Commission the current Research source, grants and trust via Edge, then validate the corresponding browser and revocation/recovery paths on the deployed candidate. |

The code and receipt commits are local. No push, runtime install,
stable/dev/main change, command or Live enablement is implied. ELP2-10 and
ELP2-11 remain open. A later [STATUS restore retake](CORE_NATIVE_FINITE_RETAKE_2026-11-04.md#status-completion-retry-on-a-restored-database)
exercises duplicate completion on the restored database through pinned TEST_ONLY
mTLS, including wrong certificate/digest refusal. It does not establish a real
Edge ACK or an approved operational rollback after new source facts arrive.
The original opt-in receipt exercises `ROLLED_BACK` in a fresh authority
instance. A later [working-source retake](CORE_NATIVE_FINITE_RETAKE_2026-11-04.md#restored-committed-terminal-and-separate-core-process--working-source)
also exercises `COMMITTED` in a separate Core OS process against the restored
database. These opt-in subcases ran separately in isolated cells, not in the
normal hook. The later changes are in `48e675f06`.

An additional [working-source Approval retake](CORE_NATIVE_FINITE_RETAKE_2026-11-04.md#approval-issuer-crash-with-actual-core-composition--working-source)
combines the actual Core composition, native custody and issuer OS-process
crash/recovery with a synthetic source and field policy. The selected test
passed. Test-inclusive and cross-loop typecheck subsequently passed on the
working source; the subsequent normal hook passed on the committed test bytes.
It does not qualify real Edge authority or a connected source.

## Six-request completion audit — source candidate

1. **Approval CURRENT:** the working-source isolated retake combines actual
   Core composition, PostgreSQL/mTLS custody, two sections from one source
   read, dispatch revoke, lost synthetic ACK and issuer process restart. It
   has a normal-hook commit; real qualifier, field policy and lineage
   remain source-owned qualification work, not established by this fixture.
2. **Approval HISTORY/diff:** the separate authority design and CURRENT
   rejection tests exist. They do not implement or grant a historical purpose,
   nor establish historical source coverage.
3. **Order/reconciliation/obligations:** the sibling retake covers native
   custody, paging, cross-workspace refusal and revoke with synthetic source
   relationships. Edge source publication and field/relationship authority
   remain unqualified; the product routes remain source-dark.
4. **STATUS:** the populated restore and restored `COMMITTED` test keep the
   same TEST_ONLY original, lease and terminal and one synthetic ACK across a
   separate process. The test follow-through is committed; real
   Edge terminal/ACK and late facts are not proved.
5. **ELP2-11:** the representative historical clone was forward-migrated and
   restored with populated synthetic custody; selected ownership, effective
   ACL, RLS, triggers and function metadata were compared. The drill refuses
   an unapproved down; it is not a full operational rollback or a proof of
   post-snapshot revocation preservation. The old UDB harness is now guarded
   against unsupported V2 schemas, including the candidate namespace.
6. **ELP2-10:** the pins and impact decisions above, bounded workload dry-run
   and test-inclusive/cross-loop typecheck have receipts. Normal hook passed;
   G2 target/bounds/calibration and connected browser acceptance
   remain separate gates.

Do not mark the full ELP2-10/11 phase or operational restore green from this
local audit. Final candidate/runtime and source-dependent gates remain open.
