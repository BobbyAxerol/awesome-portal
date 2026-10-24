# Core → Edge — qualified source selection and financial authority adapter

Date: 2026-10-24. Coordinator/integrator: Codex/Core. Existing ELP2-10/C7,
CORE-03/04/06 follow-through; this receipt is not a new request ledger.

**Verdict: SOURCE_IMPLEMENTED / FOCUSED_GATES_PASS / NOT_INSTALLED.**
Full08/read09 and ELP2-10 remain NOT_MET; ELP2-11 is not opened. This return
supersedes the old “source provider/financial adapter absent” implementation
status, not the missing qualified-source/trust acceptance in the
[cumulative return §§18.2–18.3](CORE_TO_EDGE_TS_PM_CONSOLIDATED_RETURN_2026-10-22.md#183-edge-actual-source-selection-is-a-separate-concrete-factory-input).

## 1. Source pins, scope and preservation

| Input | Exact pin / state |
|---|---|
| Core canonical | `docs/research-loop-plan@16a919a6fd0ab2d0070e029123c798b3e86cf35f` before this Markdown-only return |
| HK owned candidate | `/home/bobby/.worktrees/portal-core-current-policy-wire-20261024`, `feat/core-current-policy-wire-20261024` |
| Candidate parent | `fa96dc385ad3c7c07fbfe881aef581acd58c4f09` |
| New source commit | **`0435aab1fadb646680fadd18da1ad1c56561394d`**, 14 files, +3325/−11; clean after normal commit |
| Edge active feature, last checked 05:26:57 UTC | `8727e5303b1815d54bc2bdcb927a55457ff4da5b`; peer tracked Markdown and untracked intake preserved, not staged or replaced |
| PM, read through Edge coordination | `6f474c72088f000a198a73324ad3083236f2bf5c` |
| New PM wrapper | `2505a7645a8de20bbd38d6b435b64d6edb88cf49`, `services/portfolio_management/report_publication_authority.py`, SHA256 `a1403b288c6fbed0badc7a2f35e14cd67e8f25d1d919740bb4b634a8f0795016` |
| PM public return | `upgrade/PM_TO_EXECUTION_REVIEW_RESPONSE_2026-10-22.md` §§7.30–7.31, SHA256 `6c33aaf18156e476dbeb70181127e195202aa5d78e566aab96ac6410f95fa76b` |
| Claude consumer lane | `/home/bobby/portal-research-fe2`, `claude/post-land-20261022@00e7f6cff2fadbd88b8ed461fa870b28ee88ad94`, clean; no new committed delta this round |

Bobby authorizes continued backend work on the correct isolated HK source
candidate. No production/dev/main/stable/provider28445, command/Live, credential,
source grant, runtime, DB or peer UI change in this slice. Two existing agents
implemented disjoint provider/financial files; primary reviewed, repaired
composition/resource ownership and integrated. Heavy gates ran serially.

## 2. What is actually implemented

### CORE-03/06: current-policy backed by committed source metadata

- `projection-store-pg/src/bootstrap_selection.rs` adds
  `PgProjectionStore::bootstrap_selection_snapshot`: a read-only REPEATABLE READ
  transaction over the selected bootstrap generation, exact binding/slot/dataset/
  schema, READY/RETAINED state and actual rebuild deadline. An initializing or
  ready-but-unselected shadow cannot become the current source.
- Metadata only: ingest-time canonical payload digest, entity revision and
  top-level field names from the same committed rows. No economic payload copy,
  legacy Manager fallback, inferred alpha-version relationship or source signing.
- Complete population or typed refusal: 4096 rows, 1 MiB metadata, 64 fields/row,
  64 KiB manifest, 2 s statement and 5 s operation limits. These private adapter
  safety bounds do not silently truncate data or constitute production budgets.
  The existing 16 MiB resource reservation remains held by the returned snapshot
  until inspection finishes; it is not released prematurely after SQL.
- `edge-service/src/core_source_selection.rs` publishes
  `PinnedQualifiedSource` and `PgQualifiedSelectionProvider`. The owner supplies
  generation/epoch, canonical row hashes and full qualified entity five-tuples.
  Each resolve/recheck re-reads committed metadata; changed source content or
  lineage requires explicit new qualification, never retargeting an old context.
- `core_scoped_entrypoint::connect_qualified` and
  `ScopedBackend::connect_with_policy_factory` share **one governed pool** between
  the source provider and reader. Core's actual private resolve/recheck policy
  remains the independent current human authority. CURRENT does not grant
  HISTORY, REPLAY, EXPORT or STREAM. Default uncommissioned routes still refuse.

### CORE-04: PM authority at the existing publication worker seam

- `edge-service/src/financial_source_authority.rs` publishes
  `PmFinancialSourceAuthority`, `FinancialAuthorityChannel` and explicit
  `FinancialAuthorityLimits`. Exact prepared request bytes, canonical UTF-8,
  financial binding, original manifest/generation and bounded fresh authority
  are checked before returning authenticated values.
- PM's exact lowercase proof kinds are independently verified, then bridged to
  the existing store's uppercase kinds. No accepting/default verifier, invented
  PM HTTP endpoint, new signature convention or browser authority is supplied.
- The actual store `BootstrapReceipt` exposes its generation. ACK checks the
  original receiver's committed generation/cursor before source acknowledgement.
  Lost response, timeout or cancellation retain the **same original** retry key;
  another manifest/generation/cursor cannot replace unresolved custody.
- Independent review caught borrowed provider handles that could not compose as
  the existing `FinancialSource.authority: Arc<dyn FinancialSourceAuthority>`.
  The adapter now owns Arc channel/verifier/clock handles, with a regression
  proving local construction, use after local scope exit, and cleanup on the
  last handle drop. No globals, leaked references or service API change.

No Portal public OpenAPI/DTO/route, generated browser type, migration or approved
UI changes. No contract regeneration is needed for these Rust internal seams.
The 14-file source commit is the reproducible contract/implementation reference.

## 3. Validation and actual resource scope

All final source bytes were read back from HK and matched the tested source's
14 SHA256 values before commit. Transfer archive SHA256:
`fb4c953e749d26ba0336aa0b637952b56be67294e45bd1467da417b0f075e8ba`.

| Final affected gate | Actual result |
|---|---|
| Strict Clippy: Edge lib + financial PG test target | PASS, `-D warnings` |
| Strict Clippy: PG lib + bootstrap integration target | PASS, `-D warnings` |
| Rustfmt check on all 14 owned files | PASS |
| Disposable PostgreSQL selected-generation/metadata tests | **9/9 PASS** |
| Actual disposable PostgreSQL COMMIT/checkpoint/receipt/ACK recovery | **6/6 PASS** |
| Edge library regressions, including new provider and owning adapter | **100/100 PASS** |
| Source candidate diff and normal git commit | PASS; no configured pre-commit hook, **not** a full landing-hook PASS |

115 distinct tests, not the sum of repeated retakes. The financial lane uses a
synthetic exact-allowlist source with a **real PostgreSQL receiver**. It proves
actual receiver COMMIT/ACK/recovery, not connected PM financial signatures or
native source publication. Prior connected/active-revoke evidence remains scoped
to its original source; no retired source/window/session was reopened.

Reproducible focused commands in the pinned Rust workspace:

```sh
cargo clippy --offline --locked -p edge-service --lib --test financial_authority_post_commit --features pm-custody-pg-test -- -D warnings
cargo clippy --offline --locked -p projection-store-pg --lib --test epg10_04_bootstrap -- -D warnings
cargo test --offline --locked -p projection-store-pg --test epg10_04_bootstrap selection:: -- --test-threads=1
cargo test --offline --locked -p edge-service --features pm-custody-pg-test --test financial_authority_post_commit -- --test-threads=1
cargo test --offline --locked -p edge-service --lib
```

Test-only compiler image
`sha256:e51d0265072d2d9d5d320f6a44dde6b9ef13653b035098febd68cce8fa7c0bc4`,
toolchain 1.85.1; PostgreSQL image
`sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685`.
Total cell ceiling 2 CPU/1536 MiB/300 s: compiler/test 1.5 CPU/1280 MiB plus
PG 0.5 CPU/256 MiB; loopback-only ephemeral DB, 128 MiB tmpfs. Exit 0,
OOM=false. No production calibration or coexistence/G2 conclusion from this.

Local receipts are retained under
`/tmp/elp210-edge-source-20261024.gt6Znz8L/`:

| Log | SHA256 | Disposition |
|---|---|---|
| `final-source-clippy.log` | `1dfb98d077bc0c36fa5ea806346e76ae4a2428c2ff0e307f5019b0dd908669d4` | Final strict lint PASS |
| `final-pg-source-retake.log` | `2e4c4776c7f600619315532d41102b6937c92ed054ab942bffebca529b141da6` | Final 9+6+100 PASS |
| `final-pg-source-gate.log` | `7c926b87e40b26ec6ffb4c78f403571ac977ece539b51f52b4a58a6943d143ea` | Initial harness startup failed before tests; not PASS |

Earlier scalar-payload/rebuild-deadline test assumptions, missing doc backticks
and composition lifetime were repaired, not suppressed. One final disposable
DB took longer than the initial 10 s startup wait: the test-only runner now
retains startup diagnostics and waits at most 40 s inside the unchanged 300 s
cell limit. No product timeout, SLO, assertion or resource budget was weakened.
Final owned test containers were removed and the label census is empty;
source, logs and rollback evidence remain. No volume/image/data pruning.

## 4. Runtime unchanged; exact next owner/action through Edge

Core image remains installed/healthy at
`sha256:01692fc5702f21856f5c932efc0786d3f65ff47bb3ed7d1949ee18666f31458a`;
815-source closure
`4433841854013cf104c4b2267d7c7cbe57686d1c4efe2841199883058d10b541`.
Current-view listener remains OFF; actual model heads 0, retained bindings 174
from the prior installation receipt. No new runtime image/config/schema pin is
claimed. These source changes must not reinstall an older Core/Claude bundle.

| Lane | Next owner / exact required action | Can proceed independently |
|---|---|---|
| Qualified CURRENT / finite READ | Edge reviews/imports `0435aab1` without losing feature WIP; returns selected **real** resource/dataset/schema, binding/slot/generation/epoch, entity digest map, full entity five-tuples and field map; then Core binds its actual current-policy authority | Do not wait for financial/command/G2 to return this bounded selection |
| HISTORY/REPLAY/EXPORT and independent STREAM | Edge returns physical purpose/retention/capability pins; Core issues only the separately permitted operations for the same original actual human context, then checks cache/cursor/SSE/revoke/recovery | CURRENT approval is not an implicit grant; no retired-window reuse |
| PM financial publication | Edge coordinates PM's **implemented but UNMOUNTED** wrapper §§7.30–7.31: signing-purpose/envelope, verifier and original receiver trust plus same-original APPLIED/status binding. Then assemble `FinancialAuthorityChannel` with the adapter and real report source | Source adapter and PG receipt tests are delivered now; do not ask PM to reimplement the existing wrapper |
| Manager trust / actual API | Existing Research key/certificate remain valid; Edge returns loaded overlap JWKS/config/image, kid `research-20261021-c185ee3d`, audience `portal-execution-edge-paper`, profile `PAPER_BINANCE_USDM`, Paper8443 and fresh human read binding | No new key/CSR. Existing TLS probe is not business API/JWT acceptance |
| Command07 | Edge returns commissioned submit/status/recovery gateway and original intent/custody pins for the existing Core adapter | Do not bypass Edge, substitute R1 executor or enable command/Live |
| Qualification | Edge routes target owner/PM/TS production input decisions: numeric bounds, financial inputs and calibration; freeze workload/candidate dependencies before coexistence/G2 | Test cell ceilings and fixture constants are not approved production budgets |

Manager public trust reference remains the previously issued Research leaf/
inactive config under the private HK directory already shared with Edge. Leaf
expires 2026-10-29 13:27:14 UTC. No private file contents, token or cookie are
included here. The old native9 source has expired/retired and is not a usable
substitute for any row above.

## 5. Claude handoff, exit and rollback

- **AWAITING_CONSUMER_REVIEW.** Core/Edge internal source wiring is now concrete;
  do not call the private resolve/recheck endpoint from the browser. Preserve
  current accepted components, rich linked fixture and all later UI work.
- No new browser field or manual type is requested. Existing public Accounts/
  Portfolio/Exposure readers consume real data only after the qualified source
  and financial source factory are commissioned through Edge. Fixture/browser
  work remains independently usable and does not wait for command/Live.
- The previous narrow `readGroupAttribution` unknown-enum CHANGE in cumulative
  §18.6 remains Claude-owned; this source slice does not claim it was fixed.
- Edge can review this candidate immediately, then return ACCEPTED/CHANGE and
  the source inputs per row in the **existing cumulative coordination return**.
  Sending this file does not establish owner ACK or a connected PASS.
- Rollback: do not mount the source candidate; preserve the existing runtime,
  bindings, audit, backups and original custody. If code is integrated, use an
  explicit reviewed revert/forward fix, never delete state or reset peer history.
  No migration/down-migration or rollback of later business writes is involved.

Backend next: actual qualified CURRENT source binding, then independent STREAM/
HISTORY/REPLAY connected acceptance; financial trust and command gateway can be
completed separately. ELP2-10 remains open for those runtime inputs, approved
budget/calibration, matched coexistence/G2 and Claude browser acceptance.
