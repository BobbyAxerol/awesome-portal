# Core integration checkpoint — 4 November 2026

## Landing receipt — supersedes the historical WIP status below

- Integration commit `c61f60b8e4f77a0742893524b517c835ea46f0eb`, tree
  `2ba11854b567e7b5cc5a0c89bb5a72c25d3142bf`, was fast-forwarded into
  `docs/research-loop-plan`. Its parents are Research
  `f804659dfd8f77f1c1d5ecd4c67c3fce0c39590c` and Claude checkpoint
  `c7429e1ed2f7f6444393cd359ea3c5599a15dc9f`; the latter's 11 commits are
  ancestors, not a squash or a wholesale replacement. The integration diff
  is 245 files, +10,260/−663 lines, including code, tests and evidence from
  both sides; this is not an attribution of all lines to one author.
- The **normal hook** on that exact tree exited 0: contracts 113/113 files,
  1,941/1,941 tests; Control API 583 files passed / five skipped, 12,312 tests
  passed / ten skipped; its PostgreSQL restore drill and monorepo verifier
  also passed. These are local, isolated checks. Full log:
  `/home/bobby/.local/state/portal-final-hook-20261104-vpPxRcGs/hook.log`.
  The previous hook failure and the test-harness fix are preserved below.
- Before fast-forward, the original Research WIP was checked against its
  byte-for-byte archive and preserved in Git stash
  `5bc6a59e54e1b0a1b5139133361c0add81244759`; the archive remains at
  `/home/bobby/.local/state/portal-research-wip-20261104-B6GUF547/research-wip.tar`
  with SHA-256 `3a1cc129c4e91fd9a789b5bdf4297e56b57c69732090395f18d075018d3beaad`.
  Its 204 pre-integration paths were checked: all files present were also
  present in the candidate; 20 differed after subsequent integration and are
  retained exactly in the stash/archive for inspection. Do not blindly pop
  the stash over the landed integration.
- This is **source landing only**. No remote push, preview rebuild, migration,
  runtime activation, Edge connection, command or Live action was performed.
  Three sibling sources remain dark until independently qualified; isolated
  tests do not constitute Edge field authority, a real STATUS ACK, real
  financial/Approval evidence, connected browser acceptance, G2 qualification,
  or final ELP2-10/11 closeout. The historical paragraphs below record what
  was true at earlier checkpoints and are not the current landing status.
- Receipt verification: **R0**, Markdown only. The landed code tree passed the
  normal hook above; the receipt-only follow-up does not alter that code tree.

## Scope and pins

This is an **in-progress working-tree checkpoint**, not a frozen candidate,
normal-hook receipt, deployment, or phase closeout. The target checkout is
`/home/bobby/portal-research`, branch `docs/research-loop-plan`, HEAD
`f804659dfd8f77f1c1d5ecd4c67c3fce0c39590c`. Before this checkpoint it had
181 modified and 20 untracked paths. They were not discarded, staged or
committed. They include other work and must be reviewed, not automatically
assigned to this slice.

The inspected Claude checkpoint is `claude/slice-followthrough` at
`c7429e1ed2f7f6444393cd359ea3c5599a15dc9f`, merge-base
`f5993a79d3df54257a1ac0b9413a1662060f3ab1`. It has 11 commits not in
Research; Research has 29 commits not in that checkpoint. Its three-dot
diff has 26 files; two Control API tests also have existing local changes.
No merge, rebase, branch rewrite or wholesale side selection was performed.
The remaining Claude UI, tests and documentation have not yet received a
complete integration review.

## Imported backend slice — source only

Reviewed the backend portion of Claude `14f0cfdeb2b783266543473b60270219d0525990`
and incorporated its equity projection bootstrap and full-AppModule test into
the existing working tree. Kept the existing changes in the two overlapping
test files; the local boot test uses the current Fastify typecheck convention.
Expanded the bootstrap negative cases to cover native review, non-local/dev
environment and missing auth. The new gate mounts `SOURCE_DARK` only under
the existing retained review profile **and** local environment **and** dev
authentication. It supplies neither source data nor additional authority.
No contract, frontend component, runtime, image or service was changed.

Working-file SHA-256 after the edit:

| File | SHA-256 |
| --- | --- |
| `apps/control-api/src/equity-projection/equity-projection-source.bootstrap.ts` | `1cffa3e068066fa5dee1a493b5d868114c1515e22f01427b6ca0fd80e89ad28b` |
| `apps/control-api/src/main.ts` | `c13125fcd74c61eab84adb6e67181d85723ef6fee25656ede45e4c0e95d21086` |
| `apps/control-api/test/approval-evidence.spec.ts` | `d5377b51c0f0e480201a128bab05866c1f9e477aa739e5e4a73ca7cbc8c38952` |
| `apps/control-api/test/elp204-positive-parent.spec.ts` | `08b3fd434a94eb4409d9fee9cbde7a32b3f955209e8ef727fa0005cae6a88073` |

The full AppModule PG boot test was added, **not run in this checkpoint**.
Claude's 382/382 result at the earlier source is historical and is not a
receipt for this working tree. The code is not installed on preview.

## Focused checks

- `npm test --` for `approval-evidence`, `sibling-source-seam`,
  `sibling-page-cursor`, `sibling-paged-source`, `sibling-source-dark-http`,
  `command-source-assertion`, `command-status-composition`, and
  `binding-financial-batch`: **258/258**, exit 0. Sources are test doubles;
  this is not Edge, browser or PG acceptance.
- `edge-command-status-transport`: **24/24**, exit 0 on a separate approved
  local loopback test run. The first grouped run had 257 passes and 24
  setup failures because sandboxed loopback listen returned `EPERM`; those
  failures were not counted as passes. The independent loopback retake is
  synthetic mTLS, not an actual Edge ACK. The grouped run and its retakes
  overlap and must not be summed as independent coverage.
- `git diff --check`: exit 0 at the time checked. This checks whitespace,
  not semantic integration or the contents of untracked files.
- `tsc -p tsconfig.build.json --noEmit --pretty false` exited 0 with no
  diagnostics on the edited working tree. This is the build-project compiler,
  not the test-inclusive full typecheck or normal hook.
- Focused qualification readiness, current Manager workload/selection and
  reservation Node tests: **144/144**, exit 0, with synthetic inputs and
  dry-run paths only. An initial sandboxed grouped run reported one failed
  test file and was interrupted (exit 130), so it is not a PASS. The explicit
  subprocess-capable retake passed; it did not execute G2 load or confer
  runtime/calibration approval. This overlaps earlier tooling receipts.
- `scripts/execution-tracking-test.sh`: exit 0 after the Unified link update.

## Gate matrix and next action

| Gate | Existing evidence and compatibility | Candidate action / disposition |
| --- | --- | --- |
| Reader/cursor and STATUS local negatives | The focused tests above cover this working tree's selected files. | Follow-through below adds an uninstalled three-reader custody composition, exercised with synthetic HTTP/fences. Source-specific positive providers, qualified field/parent authority and real native physical-egress acceptance remain missing. Account native composition likewise has only synthetic source evidence. Re-run affected tests if dependencies change. |
| STATUS restart and ACK | [Prior isolated PG/mTLS receipt](SIBLING_PAGING_AND_PREVIEW_REHEARSAL_2026-11-03.md) records restart/restore with synthetic ACK, not this new checkpoint's real Edge. | Review and integrate the candidate and validate exact original/lease/terminal with a commissioned Edge; do not create a replacement intent. |
| Approval/financial | Above focused tests exercise defined local semantics and dark handling. | Source carrier, ownership/census, snapshot/field authority and APPLIED→ACK still need qualified Edge evidence; no fixture is source qualification. |
| Migration / restore | Prior receipt reports a fresh synthetic Control API cell through 0158 and a populated STATUS custody restore. Migration 0157 SHA-256 `d0e5428fcc6c724de1a033e14f3a585b1318f6472350c0b1c2b589b894bf01b5`; 0158 `2461986e1c4d8873b44aa719368ab2c8b95ab0e38aaa5060c133841ff3f27b53`. | These are reusable only after confirming the same migration and dependencies; final-candidate historical data, ownership/ACL, triggers, restore and rollback remain open. |
| Compiler / normal hook | Prior full Core/cross-loop typecheck passed for its then-current working-tree fingerprint, before this checkpoint. | Check the changed source; after all code, tests and docs are reconciled, freeze the candidate and run the full normal hook once. No hook PASS is claimed here. |
| G2 / coexistence / browser | Earlier measured receipts are scoped to their own sources, configuration and workloads. | Classify exact impacted dependencies and reuse compatible evidence only; production-representative G2 requires approved target, bounds and calibration. Real-source browser acceptance remains separate. |

At inspection, root had 85 GiB available of 621 GiB (87% used). No
disk-intensive build, image cleanup, volume deletion, runtime migration,
preview change, push or dev/main operation was performed. Apply the C4
capacity decision and the heavy-cell lock before a later disk-intensive gate.

## Handoff

Claude can continue UI work against the existing typed contract and fixtures;
this checkpoint only integrates the dark backend bootstrap and does not claim
the equity data source is available. The remaining Claude branch must be
reviewed and reconciled with both overlapping test files before a candidate is
frozen. Backend next: complete the three native readers' source-independent
authority/custody composition without inventing source facts, then finish
candidate review and the applicable PG/normal gates. Edge remains the sole
coordination point for the missing source proofs, actual STATUS ACK and
qualified financial publications. ELP2-10/11 remain open.

## Candidate reconciliation and disposable PostgreSQL — 4 November

- A non-frozen integration worktree exists at
  `/home/bobby/portal-elp2-candidate-20261104`, branch
  `codex/elp2-candidate-20261104`. It starts at Research
  `f804659dfd8f77f1c1d5ecd4c67c3fce0c39590c` with an uncommitted merge of
  Claude `c7429e1ed2f7f6444393cd359ea3c5599a15dc9f`: eleven Claude-only
  commits (merge base `f5993a79d3df54257a1ac0b9413a1662060f3ab1`).
  All tracked and untracked Research WIP was copied to this candidate and
  compared byte-for-byte at integration, without altering the shared worktree.
  The single merge conflict in `elp204-positive-parent.spec.ts` was resolved
  preserving both the approval-revoke and equity-bootstrap tests. The merge
  is not committed; staged Claude changes and unstaged Research WIP remain.
  The candidate is not a final SHA and is not installed on preview.
- Candidate-only safety fix: `manager-binding-figures.spec.ts` no longer
  defaults to a host database or truncates it accidentally. Its destructive
  tests require an explicit matching disposable-cell URL and otherwise skip;
  a guard regression was added. The isolated cell additionally used an
  internal network and tmpfs. This does not certify other tests' DB guards.
- Focused candidate tests: eight sibling, approval, STATUS and financial
  suites **258/258**; isolated synthetic mTLS transport **24/24**;
  current-view and financial composition **61/61**; Claude frontend drawer
  and navigation-count tests **62/62**. These are targeted, overlap other
  receipts, and are not full hook, browser or connected-source acceptance.
- On this still-uncommitted candidate, `npm run typecheck -- --pretty false`
  in Control API (including the cross-loop compiler project) completed
  exit 0. This does not include frontend browser acceptance or the normal
  hook and must be repeated if relevant source or dependencies change.
- A first combined attempt produced 147 passes, 25 failures and 26 skips:
  sandboxed loopback and the unconfigured host DB were denied (`EPERM`).
  It is not a PASS. The affected source-composition suites were retaken
  separately with permitted loopback, and the DB suite only in an isolated
  cell. The first isolated runner exited on a read-only Vite config-cache
  write before running tests; `--configLoader runner` fixed the runner.
- Disposable PostgreSQL: the isolated Manager list/boot run passed **6/6**
  selected tests (356 parent tests skipped); STATUS PG/restart and guarded
  migration rollback passed **10/10**. A separate populated synthetic
  custody backup/restore ran STATUS **7/7** and restore **1/1**: original,
  lease, context and ACK bytes and effective ACLs were compared; one raw
  owner-default ACL representation differed. Unapproved down was refused.
  These runs used pinned PostgreSQL
  `sha256:44c4ee9810eff91f7eab4d822642e01115b1a9eccce4bcbdde7604752d68eac6`
  and Node
  `sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32`.
  Test containers and networks were removed and checked. Synthetic data is
  not a representative historical database or a genuine Edge ACK.
- Edge catalogue checked read-only over SSH remains at SHA-256
  `9257ebb0a3935bf58e6fe4858298bf4536cca2081e61f9c4543a82645a4f8c67`,
  matching the earlier inspection that classified the three sibling sources
  unavailable/not qualified. This does not establish their current runtime
  or grant authority. Order detail, reconciliation and obligations still
  need their real source/field authority and physical HTTP custody wiring;
  their dark routes must not be called positive readers.
- Open: complete semantic review and reconciliation of the full candidate
  including UI/docs; complete the three reader compositions without inventing
  source facts; test final candidate and representative migration/ACL/restore;
  obtain genuine financial/Approval and STATUS ACK and connected Edge proof;
  qualify G2/browser. Run the normal hook only once after the candidate is
  stable. At the check, the filesystem had 85 GiB free of 621 GiB (87%
  used); follow the C4 capacity rule before any disk-intensive gate. No
  preview, stable, dev, main, command or Live runtime was changed and nothing
  was pushed. Candidate dependency symlinks point to existing Research
  `node_modules`; preserve the candidate and its uncommitted merge.

## Historical clone: migration, ACL and rollback guard — 4 November follow-through

- Reconciled Research's current tracked/untracked WIP against the candidate by
  byte comparison. The only intentional candidate-only differences are the
  destructive-test guard in `manager-binding-figures.spec.ts` and the
  enhanced historical-clone test below. This comparison does not constitute a
  semantic review of all 226 candidate changes.
- The retained preview dump at
  `/home/bobby/.local/state/portal-preview-migration-20261103-EevDSNOc/preview.dump`
  still has SHA-256
  `324fb9f35dbb606773010af310caf1261e386abc6cb57be3abaf378f9f8c15c8`.
  It was restored read-only into isolated PostgreSQL cells with owner/ACL
  preservation. No preview or source database was changed. Three overlapping
  runs all passed **1/1**: the last run additionally checks non-internal
  trigger definition/enablement, including a known TEST_ONLY sentinel created
  only in the clone; executes the actual migration runner's down for 0158;
  requires `COMMAND_STATUS_PREPARATION_DOWN_REQUIRES_APPROVED_DRAIN`; then
  rechecks the protected row digests, migration ledger and prior scoped
  security metadata. Test SHA-256
  `47fee6992ac26bc6bc819d59db35ac6edd8fd9f5e422a6d7759990e7e4bd8022`.
  Migrations 0155–0158 SHA-256 respectively
  `e19def4c5dd28de66077469331ce0985a8397e9e971ff62d30b73c3fec1f1067`,
  `c48d6e76f45928eaf186cfce445dd72051274cdf5ca422a9e3ea6b4c0b271a6d`,
  `d0e5428fcc6c724de1a033e14f3a585b1318f6472350c0b1c2b589b894bf01b5`,
  `2461986e1c4d8873b44aa719368ab2c8b95ab0e38aaa5060c133841ff3f27b53`.
  Explicit containers and networks 6f9a1205–1207 were absent after cleanup.
  Scope is seven protected tables and security metadata in three named
  schemas/selected roles; this is a historical snapshot with empty real
  STATUS custody, not every global role/object, a fresh backup, an approved
  drain/rollback, or final-candidate acceptance.
- Contract fixture tests `execution-siblings.spec.ts` passed **97/97** on the
  candidate. The temporary contracts dependency symlink pointed to the
  existing Research dependency tree and was removed after the test; this is
  not an installed source.
- Edge worktree observed over SSH read-only at
  `636d58a7c4368a617903734ab1d0ce933d2804ca`; it has 96 changed/untracked
  entries, preserved. Catalogue families `orders_execution_status`,
  `reconciliation` and `obligations_unknown_execution_outcomes` each report
  `UNAVAILABLE / NEW_EDGE_V1_EXPORT_NOT_QUALIFIED`, no enabled environments
  and no coverage proof. This is source catalogue state, not proof of the
  Edge runtime. Do not infer order-parent/resource or field authority from it.
  The catalogue specifies `order_id/entity_revision` for orders and gates it
  on qualified writer plus economic export; reconciliation is
  `run_id/break_id/resolution_revision`, gated on economic and current
  native-profile/binding export; obligations are `obligation_id/recovery_id`,
  gated on qualified writer, economic and PM current-authority export.
  These are discovery locators/gates, not individual field-permission proofs.
- Remaining before landing: semantic review of the full candidate; review the
  independent reader composition and verify it stays source-dark without a
  qualified provider; final candidate freeze, impact-appropriate rechecks and
  normal hook. Source-specific target/field proof and real native physical
  egress are needed for connected acceptance, not for landing source-dark.
  Genuine connected source/ACK, financial/Approval, G2 and
  browser remain separate gates. No runtime, source rights, remote branch,
  command or Live was changed. The original backup remains intentionally
  retained for future restore/rollback work.

## Independent sibling native composition — candidate WIP

- Added an opt-in `SiblingNativeDelivery` path for order detail,
  reconciliation and obligations, using the existing current-human/native
  egress fence. The route validates the workspace and fails closed if the
  dependency is absent; AppModule deliberately does **not** install a source
  or a qualifier. No Edge source, order-parent relation or field permission was
  inferred. A future server-side qualifier must independently establish the
  exact relation, source/snapshot and field semantics and revalidate before
  physical dispatch. A mocked qualifier does not meet that condition.
- The projection has a closed output-path → business/detail authority mapping;
  a provider cannot relabel one granted field as another. Some proposed sibling
  fields have a separate sibling-only vocabulary, not the global record copier.
  The existing scoped authority requires each such field explicitly in the
  qualified reviewed field policy even for full-business readers. A test
  caught that expanding the global list affects an unrelated metadata reader;
  that expansion was removed. No policy was installed or permission granted.
  The plan, selected scope, fields and source reader are pinned across the
  asynchronous build; an asynchronous final-dispatch validation is refused.
- Reconciliation/obligations have additive optional `page_size`, `cursor`, and
  `next_cursor` in the generated contract/reader. The opaque continuation is
  bound to principal/session generation, workspace, target, policy, source,
  snapshot and page size. The **qualified source must supply a stable combined
  page**; its private position never goes directly to the client. Existing
  dark routes still refuse rather than publish invented empty data. Generated
  frontend reader changes are mechanical contract synchronization, not a UI
  redesign. Claude should consume cursor only after a real source qualifies.
- Candidate focused tests: sibling native composition, route, source, cursor
  and current-authority tests **93/93**, and generated sibling contract vectors
  **97/97**. These use synthetic providers and overlap prior receipts; they are
  not an Edge, source, native-HTTP integration or browser PASS. Independent
  STATUS/Approval/financial local suites passed **221/221** on this candidate;
  this does not include an Edge ACK or a real financial carrier.
- A second review exercised the actual Nest/Fastify controller and new
  composition together with a synthetic custody fence: three positive family
  responses, pre-dispatch revoke and workspace denial passed. Record-detail
  policy and contract regressions plus that HTTP harness passed **195/195**.
  An earlier attempt to expand the global detail vocabulary produced **189
  passes / 1 failure**; that expansion was removed, and the retake passed.
  The synthetic fence is not the live native provider or an Edge receipt.
- After isolating the sibling vocabulary, all ten affected sibling, current-view
  and existing record-detail suites passed **289/289**. The new test verifies
  that a full-business reader cannot obtain the new field without an explicit
  qualified policy entry and loses it after revocation. This is still a
  synthetic policy and does not commission the provider.
- A focused retake after adding policy-PENDING and missing-policy-reference
  negatives passed **57/57** (overlapping suites, not added coverage totals).
- The first test-inclusive candidate typecheck exited **2**: two deliberately
  negative field-proof mocks were inferred as `detail: true` only. The test
  factory was given the actual `SiblingNativePlan` return type; the same three
  focused suites then passed **57/57** again. The subsequent
  `npm run typecheck -- --pretty false` exited **0**, including the cross-loop
  project; this is not a normal-hook receipt or a frozen candidate SHA.
- `scripts/execution-tracking-test.sh` was rerun after the Unified link and
  checkpoint updates and exited 0; it does not verify code or source authority.
- Working-file SHA-256: `sibling-native-delivery.ts`
  `40824fcc7aebb509c6ea7d7ea54f5de0f39ec6067730f6f7f9d703d3dfbec377`;
  `sibling-source-dark.controller.ts`
  `1bf9125616d6be4c4251f03b9143c11fe0f00e5cf23046effda608247fd02e25`;
  `sibling-paged-source.ts`
  `89e92a84a1bef21491b2201e51c842cda782077a12b4c966983b4cdf9b69813b`.
  Pins must be refreshed if files change before freeze.
- Field-policy implementation hashes: `read-fields.ts`
  `a42964edf3d86474af9d52de6a220b57e3ebd63cab1accc0321eb192ed45fbbf`,
  `read-scope.ts` `d2b313232d68d7bc40a5f7fec138103401c2f6c31108a4f56b120d1ea2d37c21`,
  `current-view-authority.ts` `e5eafd8fcc6fd0ea4e34f9d9748fedf7bbe7d9d81091485357331566d0c60b6e`.
  Generated contracts snapshot `ac70ce64cd371825db8f84595f079b09506334b830e93b259b8a66fffbbcb9c8`
  matches all 717 tracked entries. The temporary contracts dependency symlink
  used only for generation/testing was removed; existing shared dependencies
  and all backup/candidate data were retained.
- A later generator check initially failed because that temporary symlink had
  already been removed (`ERR_MODULE_NOT_FOUND: ajv`); recreating the same
  verified link for the check produced exit 0 and a trap removed it again.
  The initial environmental failure is not counted as a pass.
- Resource follow-through: filesystem read-only snapshot was 85 GiB free
  (87% used). The focused tests created no Docker cell in this follow-through;
  `docker system df` could not inspect the daemon because the current sandbox
  lacks socket permission. C4 host Docker/runner inventory remains an explicit
  closeout task; no image, volume, backup or other workspace was deleted.
- Still required: a reviewed policy for the actual workspace, independent
  source-specific qualifier and record/parent
  proof, actual native-custody HTTP/revoke with a qualified source, complete
  review of the integration diff, final-candidate typecheck/hook, and safe
  landing. The historical migration rehearsal above applies to its exact
  migration pins and scoped data only. G2/browser and genuine Edge ACK remain
  separate. Do not mark ELP2-10/11 or connected acceptance complete.

### Affected-gate pins for this WIP

These are individual working-file hashes, **not** a complete source-tree or
image identity. A receipt is reusable only if its other inputs (including
schema, profiles, dependencies, data and configuration) also match.

| Gate / current working-file SHA-256 | Reuse / next required action |
| --- | --- |
| STATUS assertion `92deaeaa1d8a9f8271d05b62eda0ffc3f2df13b667aa7ebd93856beaa3230d6e`; composition `6529d2425b867ee612b24dc0042355cf0b0694e739c17f4e59e865dd56023334`; preparation `823c810a4aaac2424c21fdba15052e655cfb150d70c8d1dc7a9d23aea02c631a` | Local focused and earlier synthetic restart/restore can be reused only for their pins; real same-original/lease/terminal/ACK remains unqualified. Recheck on any of these or dependency changes. |
| Manager runtime `fad7f4be86712ac02141cd5be80f17eaabb9e869a0b437e50b4f0027a2771190`; Approval service `734d220459b4aafcfcd2a966f622669ebd569dffa5a135ff3085917e343152f9` | Local mapping/dark/authority tests only. Qualified same-snapshot financial carrier, ownership/census and actual evidence need independent source proof. |
| Migration 0157 `d0e5428fcc6c724de1a033e14f3a585b1318f6472350c0b1c2b589b894bf01b5`; 0158 `2461986e1c4d8873b44aa719368ab2c8b95ab0e38aaa5060c133841ff3f27b53` | Historical-clone scoped preservation and guarded-down results above match these SQL files, not an approved final drain/rollback. Rerun affected rehearsal on schema/dependency or representative-data change. |
| G2 driver `53774ef36cff201e0072672def6d31756f836419448837f47c2bf9dca76ebc6b`; read sets `83809ec2950c1bb471077b62a45a0cc5780107f9aef6937a37b788bd27fd704f` | Existing dry-run tests are not production load results. Require approved target, bounds and calibration and matching deployed candidate before measurement. |
| Sibling native source / policy | Focused synthetic tests passed at pins above; repeat if route, schema, vocabulary, native custody or policy dependencies change. Real source relations, field publication and HTTP revoke still require qualified Edge/native evidence. |

## Candidate integration review — disposable PostgreSQL guards

- On review, three destructive PostgreSQL test entry points accepted a URL whose
  visible hostname matched the disposable cell while query parameters could
  redirect the actual libpq/`pg` connection elsewhere. This was a test-target
  safety gap, not a product-source issue.
- `command-status-preview-clone-migration.spec.ts` now rejects connection
  overrides, a wrong protocol, user, port, hostname, database or fragment.
  `command-source-assertion-pg.spec.ts` applies the same no-overrides rule to
  the Docker cell; its separate Unix cell only accepts its verified private
  socket and checks its actual data directory before writing. The ACK/link
  migration/rollback test also validates every Docker target before creating
  its disposable database.
- Local guard tests: clone/manager target guards **2 passed, 5 skipped**;
  STATUS PG guard **1 passed, 7 skipped**; ACK migration target guard **1
  passed, 3 skipped**. The skipped cases need their
  explicitly disposable PostgreSQL cell and are not counted as real PG PASS.
  Prior clone receipts are for the previous test-file version; the migrations
  themselves have not changed. No shared database was contacted or modified.
- Candidate source/test changed after the previous typecheck; the final normal
  hook attempt stopped on the P01 static route ledger: the four mounted sibling
  routes were absent. The repository generator added exactly those four routes
  (325 → 329); `--live-routes` then passed with zero collisions and the
  protected kernel matching. The failed hook was not a commit or PASS; the
  complete hook must be repeated on the updated candidate. The static ledger
  is not evidence of a qualified Edge source or a positive runtime response.
- The next normal-hook attempt passed the P01 check and isolated N17A DR but
  stopped at the N29 generated evidence ledger: the Manager list test hash had
  changed in the integrated WIP. The official non-secret generator updated
  exactly that input digest and its manifest. The dependent EDS-12 static
  ledger was then repinned using its own generator; only its N29 input digest
  and manifest changed. Both static verifiers passed; N29 remains `NO_GO` and
  EDS-12 operations remain unqualified. These hash refreshes do not retake or
  claim any deployed/source/browser evidence. The failed hook is not a PASS.
- Pre-hook capacity check: root filesystem has approximately 85 GiB free.
  Read-only `sudo -n docker system df` reported 348 images, 60 containers,
  129 volumes, and 141.9 GB build cache (1.948 GB reclaimable); no container
  name matched the test/build/CI/qualification/measure/drill check at that
  instant. No Docker objects were deleted. This observation is not a source,
  runtime-health or coexistence qualification.
- The next normal-hook attempt did **not** pass: contracts completed with
  113 files / 1,941 tests passing, and the Control API run reported 582 files
  passed, five skipped, one failed to load; 12,280 tests passed and ten were
  skipped. `paper-history-http.spec.ts` loaded zero tests because Vitest left
  the Nest `@Module` decorator inside a function as raw syntax unsupported by
  its Node runner. The hook stopped before later gates and created no commit.
  Diagnostic log: `/home/bobby/.local/state/portal-integration-hook-20261104-ITamD2sL/hook.log`.
- The test harness now applies the same Nest `Module(...)` decorator as a
  function. No HTTP, authorization, history or test assertions were removed.
  A focused local retake passed **32/32**, including the final workspace
  revocation check and 100,000-row synthetic cases. Its source rows and SQL
  interpreter remain synthetic; it is not an Edge/source qualification or a
  substitute for the normal hook, which must be repeated on the final tree.


