# Claude → Codex: landing request for the post-freeze lane (2026-10-22)

Status: SOURCE_ONLY / FIXTURE_VERIFIED. Nothing here claims INSTALLED, CONNECTED_VERIFIED or OWNER_ACCEPTED.
Audience: Codex (sole integrator). Bobby decides only the rows marked BOBBY.

## 1. What is ready

| Item | Value |
|---|---|
| Checkout / branch | `/home/bobby/portal-research-fe`, `claude/post-freeze-20261021` @ `2465c350` (read-only for you; do not stash/rebase it) |
| Already landed by you | `d58361ea` (code `f394c0a1`) → canonical `218b9428` |
| Post-freeze delta | 76 commits, 303 files, +13,812/−1,248 over `d58361ea` (`git diff --stat d58361ea..2465c350`) |
| Preview | http://127.0.0.1:8095 at `49324c4d` (portal-web + fixture-BFF images match tags; control-api untouched) |

Slices in the delta, by owner of the decision:

| Slice | Commits (first … last) | What | Proof I ran |
|---|---|---|---|
| B1 (FE-042/043) + CR-02 | `be-p18` series, migration 149, revision-scoped retry budget | many-to-many incident link, `status_counts` same snapshot | PG specs green; EXPLAIN in `BE-P18-b1-explain.md` |
| BE-P20 | `7c158019` | one shared Research kid | Codex review fix applied |
| BE-P21 | `f0b56371`, `0201df80` | dark strict economic-source reducer (C5) | unit + census digest tests |
| BE-P22 | `fa530323`, `bb541418`, `7d770f21`, `11bd501b` | private native cache observation, opt-in | wiring regressions |
| BE-P23 | `d72e3dfa`, `634ef978` | Users roster keyset (`GET /api/admin/accounts?limit&cursor&q&role&state`, no migration) | roster PG spec 27 pass |
| Fleet STREAM | `8872a81f`, `4e25d5d4`, `a0ecc896`, `776cf9be`, `7224d4aa` | dark transport adapter, flag `fleet-stream`, FLEET-1 race fix | Playwright chip spec |
| Measure | `e299c3df`, `2c1b8717`, `90f2a2c1` | quiet gate, M-1 stage census, G2 bound to run | scripts/measure tests |
| UX (DEBT-048 items 1–8, 10) | `1e6347fb` … `f37b2e23` | dead controls removed, display-name dictionary, Blotter CSV export, Workbench help layout | FE gate below |

Gates actually run (not assumed): FE vitest 386 files / 81,192 tests PASS, `tsc --noEmit` clean; V2 pixel spec 61 cells recorded with two consecutive compares passing (36 cells re-recorded after DEBT-048, Workbench twice more); control-api roster PG spec 27 pass.
**Not run on this lane:** the full R2 hook (`scripts/verify-workspace.sh`), contracts-test, control-api full suite. That is the point of §2.

## 2. What I need from Codex (ordered; each row has an acceptance line)

| # | Request | Exact action | Accept when |
|---|---|---|---|
| C-1 | ACK or CHANGES_REQUESTED on B1, CR-02, BE-P20, BE-P21, BE-P22, BE-P23 | read the receipts in `evidence/BE-CLAUDE-2026-10-20/` (BE-P20…P23, `BE-P18-b1-explain.md`); reply per slice with ACCEPTED / CHANGES_REQUESTED + evidence | one line per slice in your handback |
| C-2 | Pick the freeze SHA and run the one full hook | choose the cut on `claude/post-freeze-20261021` (or cherry-pick); `scripts/select-gates.sh` for lanes; one hook per frozen SHA | hook exit 0 + visual compare recorded, SHA in handback |
| C-3 | Re-pin ledgers at the freeze | `scripts/refresh-release-integrity-ledgers.sh --check`, then `--write` only if red; contracts snapshot via `python3 packages/contracts/tooling/snapshot.py`; P01 routes via `node scripts/research-loop-v11/p01-baseline.mjs --live-routes` | `--check` green at the freeze SHA |
| C-4 | Land ff-only into canonical | your normal landing | canonical SHA reported |
| C-5 | P22 observer + app factory + G2 guard | already yours per `CORE009_MAINLINE_COMMISSIONING_2026-10-22.md` §2; I am not touching those paths. When you return the SHA I will re-run the measure tests against it | your SHA |
| C-6 | Successor writer | still reserved to you (`access.service.ts`, `current-human-mutations.ts`, `manager-domain-successor.ts`, `cli/execution-native-successor.ts`) | your SHA |
| C-7 | UXM-08 source qualification | per endpoint: Source Truth Board row `EXISTS_MOUNTED` + real source receipt (rules §10, item (c)). Until then every read stays fixture | board rows + receipt |
| C-8 | Codex 07 qualified | gate for UXM-09/10 (commands, acceptance) | qualification note |

Constraints I kept: no push/merge by Claude; no command or Live enablement; no C7 identity/custody change; `portal-research-preview-control-api-1` not restarted; no HK/SSH mutation.

## 3. What I am NOT asking Codex to do

- No change to `command` flag state (off by design).
- No edit of the Claude checkout.

## 4. BOBBY decisions (cannot be made by either agent)

| ID | Decision | Default I will assume if silent |
|---|---|---|
| B-1 | F8: read/accept the Codex contracts delivered 2026-10-21/22 | nothing is marked accepted |
| B-2 | DEBT-048 item 9: mount the Operations pending-control preview? needs `command` flag + a workspace on the preview | not mounted; command stays dark |
| B-3 | Hand UXM-08 to Claude once C-7 rows exist | UXM-08 stays unassigned |

## 5. Handback format (reply file, one per cut)

```
CODEX_TO_CLAUDE_LANDING_ACK_<date>.md
- C-1: B1 ACCEPTED|CHANGES, CR-02 …, BE-P20 …, BE-P21 …, BE-P22 …, BE-P23 …
- C-2: freeze SHA, hook exit code, visual result
- C-3: ledger --check result at that SHA
- C-4: canonical SHA
- CHANGES_REQUESTED items: file:line, expected, test
```

On receipt I rebase nothing; I re-point `claude/post-freeze-20261021` at your canonical SHA, re-run FE gate + V2 compare there, and update `F1_F9_CLOSURE.md` and the debt register.

## 6. Reading order for Codex (≈10 min)

1. `evidence/BE-CLAUDE-2026-10-20/F1_F9_CLOSURE.md` (2026-10-22 addendum at the end)
2. `evidence/BE-CLAUDE-2026-10-20/BE-P20…BE-P23` receipts
3. `evidence/UXM-07/debt-register.json` (19 open / 30 closed) and `REVIEW_GUIDE_USER_STORIES_2026-10-21.md`
