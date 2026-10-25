# Core → Edge: STATUS bootstrap and finite Alpha follow-through

Date:25Oct2026; observations below use UTC explicitly. Coordinator: Codex.
Scope remains Bobby's candidate-only continuation of ELP2-05/06/07/09/10.
No UI/public DTO/generated-type change, push, shared-preview replacement,
stable/dev/main/provider28445, command SUBMIT or Live activation.

## 1. STATUS source delivered

**SOURCE_READY / FOCUSED_PASS / NOT_INSTALLED / NOT_CONNECTED.**

Owned HK candidate:
`/home/bobby/.worktrees/portal-core-current-policy-wire-20261024`, branch
`feat/core-current-policy-wire-20261024`, commit
**86178d694abf156453cdf450553fa80bdd9becab**, parent
ef4945fae32abe3820b870ab893ff639dca9aef2. Six Rust source/test paths:
**+1,422/-57**, no deleted file. Peer Edge8727e530/PM6f474c72 WIP untouched;
owned PM remains fad5e3fd876460f3aecfcf8ebd57a66610b6069c.

This closes the missing STATUS private loader/CLI/lifecycle implementation
identified in the [ROOT repair return](CORE_ROOT_COORDINATOR_REPAIR_2026-10-25.md).
It does not replace the separate existing-original or connected-runtime gate.

- Default OFF. Explicit `core-command-status-check` is offline;
  `core-command-status-serve` deliberately mounts the finite listener.
- `EDGE_COMMAND_STATUS_RUNTIME_FILE`/`SHA256` select a private pinned input.
  Closed schemas: `execution.command-status.runtime.v1`,
  `execution.command-status.owner-acceptance.v1`,
  `execution.command-status.registrations.v1`.
- Owner acceptance must equal the exact installation; registrations, resources,
  database/TLS references, target, requester, workspace, Paper profile,
  purpose-specific trust and finite bounds are independently validated.
- Constructor and offline check share exact original/authorization/intent
  digest validation. Actual retained-original custody is read before bind.
  No DDL, original seeding, grant issue or command send is performed.
- Stop admission, join the physical listener/handlers, then census local and
  registered-original custody. Timeout/error never becomes a source terminal.
- External Core callback obligations are not durably proven by the Edge
  process-local issuer. Drain output explicitly carries
  `external_core_obligations=NOT_VERIFIED` and `global_custody_settled=false`;
  empty memory after restart is not global cleanup proof.

Final actual gate: Rust1.85.1, locked/offline pinned image
`sha256:e51d0265072d2d9d5d320f6a44dde6b9ef13653b035098febd68cce8fa7c0bc4`,
network none,2CPU/1536MiB/300s ceiling:

```sh
cargo test --locked --offline -p edge-service --lib command_status -- --test-threads=1
cargo clippy --locked --offline -p edge-service --bins -- -D warnings
```

**27/27 PASS; production Clippy PASS; exit0, OOM=false.** These are27 distinct
selected cases, including12 new loader cases and2 new HTTP/census cases; do not
add overlapping earlier STATUS runs as new coverage. Independent final source
review ACCEPT. Initial undefined-variable compile failure and subsequent
main-function Clippy failure were fixed, not called flakes or erased.
Normal Git commit used the owned HK candidate; no executable default pre-commit
hook was present there. Focused source verification is not full landing R2.

## 2. Integrated source preservation and actual R2 disposition

Historical frozen integration candidate used by the interrupted hook:
`/home/bobby/portal-research-integrate-20261025`, branch
`chore/research-source-integration-20261025`, commit
**19f0c17af7b686cae61973b24c43c2a9b748a265**, tree
050a965f767323d48c92b26b6eb1e7f2dd30cd1d.

It preserves canonical15fab12bf, all Claude00e7f6cff history and Core90585527/
c155581f7 ancestry: **482 files,+39,284/-1,791** versus canonical15fab12bf,
including both contributors, not solely this round's code. No deleted files.
Only two shared Markdown merge conflicts were resolved, retaining both sides'
unique entries. No blanket ours/theirs or frontend redesign was used.

The normal hook attempt was interrupted by the operator's1500s wrapper:
**exit124 / FULL_R2_NOT_MET**, not a completed API failure diagnosis.
Recorded completed work on this frozen candidate:

- Contracts112files/1887tests PASS and generated checks PASS.
- Production Control API TypeScript build PASS.
- Core20completed files/1488tests PASS. The next F0 collection suite was
  interrupted with44 skipped;533 Core files have no terminal report.
- No completed full-Core result or restore result exists for this attempt.
  Earlier source-matched ROOT280/build/migration153/restore receipts remain
  separately reusable; they are not a new integrated whole-hook PASS.
- Full pinned-image visual comparison was NOT_RUN in this round. Shared shell
  and TradeReplayEvents changed, so a V2-only comparison would be insufficient.

Independent review: preservation ACCEPT; **landing CHANGE** until actual R2 and
required compare-only visual finish. Do not ff-only this candidate into
`docs/research-loop-plan` yet. Do not rerun passed contracts/static selectors
merely to rewrite this receipt; schedule the required landing gate once the
next source freeze is selected, with a realistic completion budget.

The source-preserving successor is now
**98c7226a9d96a9f19e3489275a7d407a774bc992**, tree
d807058539fd79ad0e5af27f5e528fd90c9eeca0. It adds the tested Alpha commit
below without conflict: six paths,+156/-49 versus19f0c17af. Against the same
canonical15fab12bf baseline it contains **482 files,+39,392/-1,792**, no
deleted files. Ancestry checks preserve canonical15fab12bf, Claude00e7f6cff
and Coref9b816cd; all six Alpha paths are byte-equivalent to the tested source.
This merge is intermediate source preservation under campaign§10.10c, not
landing. The historical hook result applies to19f0/tree050a, not a completed
whole-hook result on98c722/tree d807. Required landing R2/visual remain NOT_MET.

## 3. Named Paper Alpha360 follow-through

**SOURCE_READY / FOCUSED_PASS / NOT_INSTALLED / NOT_CONNECTED.**

Owned Core source candidate:
`/home/bobby/portal-core-provider-assembly-20261025`, branch
`chore/core-provider-assembly-20261025`, commit
**f9b816cd5d4e8417e89d2e554ac6ebd89f913b13**, parent
c155581f784570303ae61da8432ca8020347ca03. Six source/test paths:
**+156/-49**, no deleted files. Frozen staged source tree used by the gate:
6d80c1a1ae822600ebfed22e7acefa50e486a87f.

- Named Paper `GET /api/v1/execution/manager/alphas/:id/overview` now selects
  native physical delivery when its private provider is installed. A closed
  Account/Alpha helper requires independently valid `alpha.read` and exact
  ALPHA target. Account permission/configuration does not grant Alpha access.
- Reuses post-ENTER snapshot/publication checks, genuine current-authority
  Core COMMIT, final synchronous permission check and the sole physical send.
  No ordinary-reader fallback or second body after native ownership/ACK loss.
- Active ENTER correctly rejects revoke with the existing P0001 custody fence.
  A genuine projection-head change aborts the pending response with zero body
  bytes and ACK; the same revoke can then finish and the next GET denies without
  ENTER. Tests do not force a revoke through active source custody.
- Lost terminal ACK recovers using the same lease/attempt/receipt/hash, status
  and resolution only; no second ENTER or response. ALL/non-Paper/uninstalled
  ordinary paths are unchanged. No Fleet/ALL/Fund/Portfolio/Deployment,
  HISTORY/STREAM/mutation or public DTO expansion.
- Existing Account-only private examples are not silently widened: actual
  Alpha remains denied until a qualified `alpha.read`/exact source target is
  installed. Existing config token naming is retained for compatibility.

Actual official focused PG/HTTP gate,25Oct2026 **12:21:50–12:28:37UTC**:

```sh
bash scripts/control-api-test.sh \
  test/elp210-native-current-manager-account.spec.ts \
  test/elp210-native-current-runtime.spec.ts \
  test/native-research-review-mode.spec.ts \
  test/elp2-manager-reads.spec.ts
```

**197/197 PASS** across four selected suites:19+18+121+39. Production
TypeScript build, forward migrations through153 and actual dump/restore with
identity/session/command/custody preservation PASS. These are isolated real
PG/HTTP correctness checks, not proof of qualified external source authority.
Node3CPU/3GiB, PG1GiB; observed compiler1.369GiB/3GiB, OOM=false. The official
runner owned the heavy lock; exact Node/PG/network suffix202610251220125 was
removed. No overlapping heavy job was started. Independent source review ACCEPT;
N29/EDS-12 integrity refresh unchanged/PASS, runtime_effect remains NONE.
Intermediate source commit uses campaign§10.10c after the focused gate; full
landing R2/visual remains pending. Combined this round's two separate source
commits:12 source/test file entries,+1,578/-106, not the full integration diff.

## 4. Evidence and preservation

Artifacts under `/home/bobby/.local/state/portal-integrations/20261025/`:

| Artifact | SHA256 |
| --- | --- |
| edge-command-status-runtime-gate-final.log | e35ab86164d6c760a69a93498393aa5bf2a3f9763ae8deafc2ad55e06a3e206e |
| edge-command-status-runtime-gate.log (initial compile failure) | 84cce9b723295cecefcceef9d73116fe220f03aac814a5aa0036140dcab6074f |
| edge-command-status-runtime-gate-retake.log (27PASS, Clippy failure) | 76e971e85b67f2dbb021bb5d4e393770ff0bd79be1a25347416b6e9783bb9b19 |
| integrated-normal-hook-20261025.log (interrupted) | 9faafc3441e020ba91b511b54a7f8a0692aa06aa485d66b20ec0ca6acfaf259c |
| core-native-alpha-focused-pg.log | abc640bcf9192e478b503f6aeef41f6c69ccdc5095481bbcde939b7093c64a80 |
| edge-status-bootstrap-86178d69.bundle | f760ab0cc0bd6f82b41be1b1718cd51e44cf8ab33b57e47fd14e3b574cd44cf1 |
| core-claude-integration-19f0c17af.bundle | b9ea2a5b1090095df9365c003989ae7118cafab8c40c7a824d3616543f0f9e82 |
| core-native-alpha-f9b816cd.bundle | a13dde1f2d6ae1aa2a121d89ad7fb6bd93485f9f71f504fa2de8b9d980feb296 |
| core-claude-integration-98c7226a.bundle | 7ae541e15cd4fee41f97b0cb9a1eb48922b87698b742da59f56e10a2de1b1fd1 |

STATUS bundle is verified on both SGP/HK, requires ef4945fae and is retained on
SGP at durable Git ref `refs/remotes/hk-candidate/status-bootstrap-20261025`.
The earlier ROOT bundle/return and19f0 integration bundle were also mirrored to
HK with matching hashes. New f9b816 Alpha and98c722 integration bundles are
verified locally in durable SGP storage; no code depends solely on `/tmp`.
Their attempted transfer to HK was denied by the tool's security reviewer for
lack of explicit authorization naming those source artifacts/destination.
No alternate transfer was attempted. Remote presence of these two new bundles
is NOT_VERIFIED; they are not an HK-installed bundle. The public sanitized
return can be delivered independently of that source-transfer approval.

Cleanup: normal-hook timeout left its exact Node/PG cells temporarily alive;
the first short Rust attempt overlapped that orphaned cell. This is a recorded
scheduling deviation, not independent-load qualification. Exact containers
9dfa5fe1b68a/a64768c5750d and network
control-api-test-net-27086832391317994 were stopped/removed; scratch
/tmp/tmp.5EseRdeMz7 is absent. Final Rust ran after cleanup and its named
container was removed by the trap. No volume, retained data or business audit
was deleted. No heavy lock was used for pure Rust. Root disk67% used/209GiB
available; capacity disposition NO_ACTION_NEEDED for this slice.

## 5. Edge / Claude handoff and remaining gates

Installed Research image remains
`sha256:01692fc5702f21856f5c932efc0786d3f65ff47bb3ed7d1949ee18666f31458a`.
No new runtime/config/schema/trust pins or window READY are claimed.

| Owner | Next action / done-when |
| --- | --- |
| Core | Named Alpha source/test slice complete; preserve candidate98c722/Claude history and select the final integration freeze; complete actual landing R2/visual before ff-only. Other finite Manager routes are not implicitly converted |
| Core through Edge | Select genuine CURRENT originals, exact Research principal/targets and purpose-specific trust; install only the separately accepted composition and prove physical READ/revoke/recovery |
| Edge/source owners | Reconcile original/requester/gateway STATUS registration and trust; real existing-original STATUS receipt plus separate Core global-custody census, never a fabricated command or empty-memory ACK |
| Core/Edge financial | Genuine source/verifier COMMIT→APPLIED→durable source ACK using the original; helper/source tests are already delivered, not to be rebuilt |
| Qualification owners | Accepted budget/calibration artifact, matched workload/candidate coexistence/G2 and browser evidence remain separate |
| Claude | No new public DTO/enum/component mapping; retain approved UI/fixtures. After qualified install, take exact-principal/workspace/revoke receipt for each mounted route |

Edge may review STATUS86178d69 source and its existing-original input now;
this handoff is not READY to bind a new native window. In particular it does
not reuse a retired source slot or claim READ implies STREAM/HISTORY/REPLAY.
CoreAlpha source is preserved in SGP Git and integration98c722; source transfer
approval, final integration qualification and isolated installation remain
distinct from giving the existing Claude consumer new UI work.

Round intake: Claude00e7f6cff unchanged/clean; no new committed request or
consumer ACK. Two existing helpers reused (STATUS writer and independent
integration reviewer),0 new agents. Their roles then changed explicitly for
the disjoint Alpha writer/independent review; primary owns shared docs/gates.
ELP2-05/06/07/09/10 remain incomplete; ELP2-11 not entry-ready. Rollback is
leaving these optional candidates unmounted; retain all originals/custody.
Verification: source focused; canonical receipt R0, not a full phase PASS.
