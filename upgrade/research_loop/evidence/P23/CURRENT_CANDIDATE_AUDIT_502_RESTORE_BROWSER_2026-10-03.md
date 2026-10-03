# P23 — current candidate: audit recovery, genuine 502 and restored browser

2026-10-03 · Codex · **SCOPED_RUNTIME_ACCEPTED / FULL_GOAL_OPEN**.

## 1. Candidate, boundaries and verification

Clean shared/backend `4bc9cefe0bfe8de0f67c1ae2b54aa9032523db88` retains
Claude's latest `59d76862` / `2f4cb81a` and the linked-audit implementation
`576a32fe`. Correction: 7 owned files, +144/-5; no frontend change. Its
normal hook passed **267 contracts**, **1,883 Control tests / one named
skip**, workspace/security/restore/tracking gates. Focused regressions
25/25 and build passed separately. Only changed Control/web images were
rebuilt; native/Python/roadmap and all volumes were preserved.

| Component | Runnable image SHA-256 |
| --- | --- |
| Control | `a156cfcd5cb3975da340c8fdd570751b8b46809bd18752e139b6763e58529b04` |
| Web | `9490db8b87bef987ebdb9bfaee1b330ce06caa569d0fc0abe1949416aa8f9a00` |
| Python / worker | `7d68b990005ef504176128c83513fce7103c31b8db725979cfc30dcc75ac9700` |

All seven service pins are retained in private identity/custody evidence.
Only `portal-research-p23-ol12`, loopback :8096, was changed. No production,
dev/main, remote, protected kernel, frontend implementation or shared :8095
worker mutation. Existing P22 six-GET acceptance was not rerun.

## 2. Real existing-child recovery — accepted within its exact scope

18:59:56.985–18:59:59.769 UTC: actual authenticated Progress reconciliation
recovered `rrun_5a999cbd16d1cc3dd06a816494ae7b68` from the persisted terminal.
No engine rerun, manual READY update, new child or optimizer invocation.

- Parent `rrun_c3bc2113431102c1715a9d6d28d7b2bf` stays unchanged.
- Child READY / AUDIT / AUDIT_OF_SELECTION; job SUCCEEDED; one outbox,
  one immutable P05 proof; same intent replay returns the same child.
- Native result: QuantBT 1.1.1, 13 folds, 2,508 bars, optimizer_trials=0,
  optimizer_reinvoked=false, exact original snapshot/config/selection pins.
- P05 manifest `36892ff750b5445a8dccd7310dbb4ad9ba2d285a489b340ac3a3ac750f98ff3b`;
  result `7a13717ff2896e4310ab3af3edf30ce80e857c235f563443a62ca2b2c4cc8942`.
- Actual Report, RC and Lineage all bind the verified child. The frozen
  Report core is byte-equivalent; parent artifact/part/report custody hash
  remains `559aeec9e8850738fb7af2f0cd7e22595472213f458894ce6bd29ecd5acbd3fc`.

Receipt SHA `908f09275665cad99ac70703e91638a9201adf3c1948ad62c2e8fe2ff343d22e`.
**This parent is reusable.** The explicit boundary-only verdict does not
close the requested non-reusable case or per-fold causal audit admission.

## 3. F5 genuine JSON 502 and real browser — accepted

19:26:09.603–19:26:39.402 UTC: exact owned private relay forwards the real
analysis route to an unreachable private upstream port. The upstream log
proves connect ECONNREFUSED; live relay configuration was checked first.
No fixed return status/JSON, response fabrication or browser route stubbing.
Actual Control maps the genuine upstream 502 into
`RESEARCH_ALPHA_IMPORT_ANALYSIS_REJECTED`, JSON HTTP 502.

S14 submits the real request and renders **Module rejected.** at 1280×900
and 660×900, with no page error or overflow. One response is reused for the
responsive presentation, not replaced by a fixture. Jobs **242→242**, imports
**5→5**. Normal logout, original private origin restoration and exact relay
removal completed. Final SHA:
`cc7ce486d8645639c7f5c6d6d1c26e9df4263d974424874cd26ea4a393370ef2`.

Earlier failures remain private evidence: the relay initially exited because
its default nginx temp directory was on read-only root, so those attempts
returned 503, not PASS. Its temp paths now stay in bounded /tmp. Another
preflight expected a stopped worker container after restore had removed it;
the corrected guard proves no running worker by exact project/service labels.
Neither correction changes a product status mapping, contract or policy.

## 4. Restored DB, actual named reads and browser byte parity — accepted

19:07:06.082–19:08:25.671 UTC: reuse the existing coherent historical-accounted
restore volumes; do not repeat the unchanged 151-table dump/restore gate.
Run only forward migration `1723680000094_research-pinned-final-audit-v1`.
Worker remains absent; no bootstrap, password reset or compute on restored DB.

- **30/30 rendered routes**: S00–S14 at 1280×900 and 660×900.
- **28 actual named GET responses**, all HTTP 200; S14 remains an import
  presentation until a user action, not an invented read request.
- No page error/horizontal overflow. This is restore/render/read acceptance,
  not every tab/action/HiFi visual or accessibility scenario in P24.
- Current Control source health matches `4bc9cefe`; exact image/index/script
  bytes agree. Bundle `/assets/index-C41KmM2A.js`, SHA
  `215b10a6ee9c90832b0b61f2531d07cc2efdb2a15d2913709a9a06fd7203ad28`;
  index SHA `558c8b22fb0dcf078c64653beb77326b33cd2f3f71eea2589b15db56331dd649`.
- Restored test session revoked normally; original DB/artifact mounts and
  custody hash `63d56662a9032a1b0819838d10bd6c1eedfa7cdabb70fc4d30fbb899ba213edc`
  restored unchanged. New audit occurred after that backup, so this is not
  an assertion that its new proof was present in the older restored snapshot.

Receipt SHA `70ed23d72ccb671ab6cd7174af50363f8eaf1a1f8f1bc993d02f3c9e48a5fe54`.
Original missing test manifests remain **83/86 / strict integrity false**.
No old bytes regenerated, seal changed or historical exception waived.

## 5. Genuine non-reusable original located — execution still pending

Named GET-only discovery on shared :8095 confirms R-WFO-020
`rrun_3258a4c450816129d2d285f25b801061`: SINGLE_PARAMETER_SET, frozen candidate
`2944fed1ec99eb9d3940c1b7`, selected trial 393; all nine OOS-generation folds
NOT_PUBLISHED, optimizer_reinvoked=null, basis
`QUANTBT_CHILD_AUDIT_NOT_RETAINED_FOR_EVERY_FOLD`. Do not interpret the legacy
kind label REUSED_ORIGINAL as verified reuse when its proof is unknown.

Discovery SHA `016a3278e9f80551a5a95fe57dfdb2e05fab7ea569d1446d598234e8116400b2`.
Normal logout using the configured Research public Origin succeeded. The
first discovery used the loopback Origin and its logout was refused: only
that uniquely proven actor/session/timestamp was revoked through the existing
SessionsRepository; no other session/account/grant was changed. The failed
first probe is not source acceptance evidence.

Next: preserve/check original source pins and exercise this historical
parent in an owned isolated clone, never dispatch/restart shared :8095 or
remove generation facts to manufacture a case. No runtime child for this
original parent has been claimed yet.

## 6. C4, reproducibility, frontend handoff and whole-goal remainder

Private home: `/home/bobby/.local/state/portal-research-p23/20260927/runtime`.
Exact private harness sources/hashes retained in
`current-candidate-gate-harness-custody-20261003.json`; raw replies/screenshots/
cookie state remain 0600 and outside Git. The named final receipts above are
immutable; predecessor failures are retained, not overwritten as PASS.

Normal owner APIs completed cleanup: **0 active QA sessions**, **0 nonterminal
jobs**, **21 disabled non-owner QA accounts**, **0 activation reissues**.
Seven exact runnable images and original/restore volumes/backups retained;
owned cell containers/network removed **without -v**. Root 71% used / 181 GiB
free; available RAM 12,233 MiB; no swap. Cache prune NO_ACTION_NEEDED.

Claude: preserve current rich UI; generated `research-final-audit` contract
now has proven backend admission/verified additive Report–RC–Lineage wiring.
No UI design/mapping edited in this slice. The new browser bundle is C41KmM2A,
not a relabelled old DOdkCJHY acceptance run. P22 fields are already consumed.

Full goal remains active: original non-reusable parent product proof; actual
three lost bytes or explicit scope disposition; genuine second qualified
engine T07/T13/P24-T05; remaining full P24 interactions/field/action/owner and
signed-release aggregation. Do not reopen accepted P22/load/502/restored-read
gates just because an earlier ledger row still says OPEN.
