# UXM-07 — execution checklist from the rules (S0 foundation + S1 Approvals/Operations/Access/Fleet identity)

Status: PROPOSED checklist, not a receipt. 2026-10-18, `claude/fe-parity` @ `0796122e` (9 ahead of merge-base `0aad2697`;
integration `docs/research-loop-plan` @ `ac056d46` is 19 ahead incl. ELP2-07 and contracts/generator changes). Sources: CLAUDE.md (V2 directives, §0 §3 §7.4/7.7-7.10 §8),
AGENT_WORKING_RULES §1-§10, PHASE_PACKET_TEMPLATE, Unified §14.x, UX guide §17-§18, design/README, UXM-07 card, review2.
Authority if sources collide: latest Bobby approval > applicable contract > recorded decision > guide (Rules §1). The
CLAUDE.md V2 directive overrides older "frontend-only / no upgrade/** edits / FRONTEND_HANDOFF §8" text for V2 work only.
## 0. Hard preconditions (nothing below starts without these)
- P0. **Bobby assigns UXM-07 (and no auto-start of UXM-08/09/10, S2-S4 stay design-only)** (Rules §7: dependency-ready is not permission; approving rules 9/10 is not an assignment;
  the scope card today says "CHƯA được giao"). Assignment must name: S0 or S0+S1, target branch, test resource
  budget, who lands into the integration tree. Without it: stop at design/docs.
- P2. Fixture success is never real-API acceptance; every receipt carries lane `FIXTURE_LAB`/`BFF_DOUBLE` (Rules 9.5.5).
## 1. Entry gate - write/record BEFORE the first line of code (Rules §7.1, §9.2 G0, §10.1, PHASE_PACKET_TEMPLATE §1)
Order matters; each item is a line in `evidence/UXM-07/README.md` (packet = template copy, links fixed).
1. **Round-start sync** (Rules 10.1; CLAUDE.md 7.8/7.9): in FRONTEND_BACKEND_SYNC §0-§1 record
   (a) `git log` + `git diff --stat` of `docs/research-loop-plan` (and `codex/be-gaps`) since last pin `0aad2697`
   (19 commits now, read-only, no checkout/stash); (b) inbox `ELP2-REQ-*` / `ELP2-REV-*` incl. already-closed phases
   (ELP2-04/05/06/07 packets and amendments, Unified §14 rows touched since pin, `git log -- packages/contracts/generated`);
   (c) classify each new item ACT_NOW / NEXT_GATE / INFO; (d) "Đã đối chiếu, không phát sinh" if nothing - mandatory line;
   (e) V2 equivalent of CLAUDE.md 7.8 cmd 3 (published `execution-*.valid.json` fixtures not yet referenced from
   `apps/portal/frontend/src/execution`) - the old `CODEX_TO_CLAUDE_*` path does not exist for V2; say so.
2. **Pins are stale -> rebase first** (Rules 10.1 last para, 10.5, 9.6): branch is behind by 19 commits; pins >24h or
   branch advanced = re-read. Rebase/move of the branch is "tự move branch" under Rules §1, so get it **approved in the
   assignment** (ref in scope card). No `git stash` (shared stack), no ours/theirs wholesale.
3. **G0 Pin record** (Rules 9.2/9.8.6): Portal producer full SHA; generated types path + `packages/contracts` generate
   command + hash; each fixture file + hash (L0 canonical verbatim, never edited); HiFi kit revision
   (`design/hifi/v2/*`, commit SHA - Unified 14.4 UXM-06 says link exact revision); review2/00 decision register rev;
   TS execution, PM, Edge pins. **PM pin is `UNRECONCILED`** (673ce7cf vs e62b6825): either do not use PM semantics in
   S0/S1 (write that down) or re-read read-only first. HK/SSH only if the assignment says so; no Docker/DB/build on HK
   (Rules §2, 9.8.6) -> otherwise "HK: N/A, pins from sync log with date".
4. **Scope card fields** (Rules 7.1 + 14.9.2 shape): goal + requirement IDs (S0/S1 items, FE-001..036, UX-F subset);
   approval reference (Bobby message/date, verbatim); repo/worktree/branch/full SHA/**dirty paths** (today: 6 staged docs
   incl. FRONTEND_BACKEND_SYNC, design/README, hifi/v2 approvals/accounts/new-approval, evidence/UXM-07 - commit the
   docs first, keep code commits separate); **owned files / forbidden files / exclusions** (see §1b); schema+fixture+HiFi
   pins; environment + **resource ceiling**; validation plan (§2); risks; **rollback**.
5. **Requirement -> implementation/contract -> test/receipt -> exit matrix** (Rules 7.1; template §2) with
   reuse/change/new class per row and an owner for every pending decision. Readiness stated separately:
   design / fixture / real read / command (Rules 7.1 last bullet). Old PASS affected by changed deps gets impact review.
6. **Fixture plan** (Rules 9.8.3-4): L0 canonical (verbatim) / L1 state matrix / L2 scale (200 rows, cursor, 1 MiB) /
   L3 negative; every FE-authored fixture passes a conformance gate against the published schema; include the
   "sparse realistic" profile (KPI `unavailable` with reason). Fixtures live in lab/test only.
7. **Scale-refine 6 cells per S1 screen** drafted in the packet before build (CLAUDE.md §8, Rules 9.5.6): cardinality,
   break point, degradation, server contract (-> request), invariants, perf budget. Screens: Approvals cockpit queue +
   frame, Operations (M09), Incident drawer, Access (M10), Fleet identity table. A screen with an empty cell is not done.
8. **Reuse report** (Rules 9.5.1, v0.5 §11.3) per new component; V1 weak components -> "Suggest" list, not replaced.
9. **Ledger entries** for every missing contract found (FE-025/027/028/030 are P1 blockers for S1 per the card) - Rules 5.3:
   locator, blocked UI, expected semantics, fixture, done-when; no invented facts, no relaxed types, no prose parsing.
   Controls blocked by a missing contract render disabled + one-line reason + M10 link (D9), not hidden, not faked.

### 1b. Owned / forbidden (proposal for the card)
- Owned (write): new `apps/portal/frontend/src/execution/v2/**` (screens, components, `ManagerApi` port, fixture + http
  adapters, reader), its own CSS file (only `font: var(--exec-font-*)`), lab mounts under `/execution/_fixtures`, new
  unit/e2e specs, `upgrade/execution_loop/{evidence/UXM-07/**,design/impl/**,FRONTEND_BACKEND_SYNC.md}`, Unified §14
  rows. Shared-path edits (tokens.css/tokens.ts, shell/nav, `PortalRoutes`, previewRegistry, vite-env flags) = single
  writer (primary) and need explicit mention in the approval (see §7).
- Forbidden: `apps/control-api/**`, `apps/portal/backend/**`, `registry/*.json`+schemas (Codex adds registry rev 7 via
  request), `packages/contracts/**` hand edits and `generated/**`, `apps/portal/strategy/**`, Research/Planning screens,
  global tokens/fonts/baselines beyond approved additions, accepted V1 UI/baselines, source guides, HK.
- Resource ceiling (proposal, as 14.9.2): one heavy job at a time, Playwright workers <=2, <=4 CPU/4 GiB, disk <=8 GiB,
  no new public port, no shared-preview rebuild, no DB; capacity check first; clean only own resources, no `docker prune`.
## 2. Tests/gates that apply, ORDER and tiering
Tiering (memory + Rules §6, 14.9.4): docs-only answers go out **before** the hook; full lanes only at a milestone
(slice end / coherent commit), never per line; focused tests per task; do not rerun unchanged suites with valid receipts
(record hash/impact); hook is never bypassed (`--no-verify` forbidden).
Order per slice:
1. Contracts: if the type pin moved -> regenerate with the contracts command **locally** (`contracts-test.sh`
   provisions node_modules in Docker), verify drift test; never hand-edit generated `.d.ts`.
2. `tsc -b` typecheck (no `Record<string, unknown>`, no hand types - Rules 9.3.1).
3. Focused vitest, written with the code: state matrix per screen (healthy / not-qualified / researcher / loading /
   authorized-empty / partial / stale / denied / revoked / resync / unknown / policy_pending); the one metric
   component; reader (positive + L3 negative + cross-constraint table from Codex FE-001/RV-1); URL layer (parser,
   `withContext`, tab alias table incl. `?tab=Insight+Charts`, default-not-serialised, back/forward/reload);
   capability->reason dictionary; no polling-as-motion (`usePollTick` uses `pollAllowed()`).
4. Structural/hygiene gates that must stay green (run them in the focused set, then in full):
   `typeRoles.test.ts` (locked `--exec-font-*` scale, no `font:` literal), `styles/tokens.test.ts` (no raw colour outside
   tokens.css/tokens.ts; CANVAS_TOKENS mirror - any `--series*`/`--flag-*` add must update both + no `color-mix`),
   `productBoundary.test.ts` (graph walk from `ExecutionPreviewRoute`: no `*.fixtures`/`*.smoke`/`createFixtureApi`
   reachable), `testHygiene.test.ts` (no early-return abstaining test), `absentValues` / `castLeak` / `runtimeBounds`
   (screen_id + route parity: never rename a `screen_id` or an existing route).
5. Full `vitest run` once at slice end; `npm run build` once.
6. Playwright (**background, never poll a 15-min run**; commit + record state first): new V2 lab group only, at 1280 and
   660 (+390/834 drawer per card), keyboard/focus, overflow, console errors, request counts/idle polling, deep link /
   back / reload, axe. `BFF_DOUBLE` built from L0 fixtures, 3 personas. Persona/state coverage is by route, not grep.
7. Visual suite **only** via `./scripts/portal-web-visual.sh` in the pinned image (bare host = phantom failures).
   (a) verify mode first: existing baselines must show zero drift (Research/Planning untouched; 46/100 are theme
   `operations`); (b) record **new groups only** - `portal-web-visual-record.sh` is hard-wired to the Research spec, so
   either pass the new spec/grep to `portal-web-visual.sh --update` or add a scoped recorder (tooling change = request
   in card); force `=all` for the new spec (changed-mode has 0.2% tolerance), review contact sheets, explain every
   delta; (c) `git status` -> restore every unrelated PNG to zero diff; (d) verify mode again. Visual failure = look for
   a missing fixture stub first; never `--update` to "fix" drift.
8. Release-integrity ledgers: Execution frontend files changed -> `scripts/refresh-release-integrity-ledgers.sh
   --write` (N29 first, then EDS-12), then `--check`; re-pin from the gate's own table, never hand-pin keys. **Freeze
   code while the hook runs**; wait by PID, not pgrep; wait for Codex's gate if it is running.
9. Commit through the normal hook (maintainer path = `verify-workspace.sh`). Check exit code of the gate itself, not of
   `tail` (root-owned dist/assets can hide).
UX-F applicability proposal (confirm in packet matrix; N/A needs reason): applicable F01 F02 F03(state only)
F04+F20(Fleet counts/context bar only, no money) F07 F18 F19 F21(state only) F22 F23 F24(empty only), F14-F17 only as
cockpit lane/receipt *render* states from fixtures; **N/A in S0/S1**: F05 F06 F08-F13 F25-F37 F40 (no money/score
surface; reason "S3/S4 design-only"), F38/F39 only if a "Not scored · policy not set" chip is shipped. Real-op parts of
F14-F18 and real SSE/revoke -> UXM-09/UXM-08.
## 3. Same-delivery updates (Rules §7.4, template §3-§6, Unified 14.8 step 4, CLAUDE.md 7.10)
Update packet + Unified in the **same delivery** as the code commit; round-end sync write (Rules 10.2) and the agent cost line (10.8.10) too.
- Packet `upgrade/execution_loop/evidence/UXM-07/README.md` (template: scope, matrix, delivery/resource closeout,
  contract/consumer handoff, request+debt ledger, exit/next-step). Journal = running requirement->code->test->verdict log
  in the packet (14.9.4 #2); do not batch to the end; one live progress index only.
- Unified §14: update the UXM-07 row in the 14.4 table (PLANNED -> real status, link) and the track row (~L9368
  "Claude UXM-00…10") + a short dated "Current return" paragraph like ELP2-07's; status vocabulary: READY_FOR_REVIEW is
  not OWNER_ACCEPTED, fixture is not runtime-ready. Do not create a second board.
- Ledger: FRONTEND_BACKEND_SYNC.md §0 (pins, agent roster), §1 (inbox, ACK status), §3 (FE->BE requests), §4 (reviews).
  Canonical request record lives in the packet of the phase that raised it; the sync file is the single FE->BE ledger -
  link, do not copy.
- **CLAUDE.md 7.10 five files**: those are `research_loop/evidence/PXX/thanhvuong-*` (Research, Vuong 2026-09-23). The V2
  directive supersedes duplicate trackers for V2 and gives no V2 file names. Proposed V2 equivalents, all in
  `evidence/UXM-07/`: (1) `frontend-receipt.md` (read-table file@commit incl. exact amendment names/commits, HiFi->
  component->field->state->assertion, HiFi comparison, discrepancies, commit+numstat); (2) `backend-requests.md`
  (ELP2-REQ-FE-nnn per 10.4 template + recheck date/baseline commit; thin if the ledger is in the sync file - link, do not
  duplicate); (3) `test-results.json` (tree SHA; per gate: cmd, exit code, pass/fail/skip; `not_run` + reason;
  SHA-256 of images/logs, images not committed); (4) `debt-register.json` (open/closed w/ commit, request, downstream
  gate); (5) `rollback.md` (per-commit revert, impact, flag off). **Ask Bobby to confirm these names in the scope card** -
  rules conflict by omission.
- **7-item end report** (CLAUDE.md 7.4, mandatory even for 1 line; mirror Rules 7.4 for Bobby): 1 where (phase, slice,
  step; "đang giữa" if mid) 2 every file path 3 +/- per file and total from `git diff --stat` (split implementation/
  generated/tests/docs, subagent work counted once) 4 align with Codex (which EX-BE/BR-EX/ELP2 contracts consumed,
  or "không chạm") 5 evidence = gates actually run, not-run stated 6 next + why first 7 exact condition to close UXM-07
  and open the next phase (gates, requests, scale-refine cells left). Rules 7.4's own 7 items (done / verification /
  exit / backend next / debt / Claude next / bidirectional requests) go in the packet and the Bobby message; point to
  files (CLAUDE.md 7.7: findings in markdown, chat only points). "Không phát sinh sau đối chiếu" if no requests.
- "Đóng" requires green gates (`npm test`+`build`+e2e) recorded; items not closed go to the debt list with real reason.
  Never DONE with empty evidence. Out-of-plan items: packet + sync file (not FRONTEND_HANDOFF §8, a duplicate tracker).

## 4. Delegating to subagents (Rules §8, 10.8)
- Only after assignment, only inside approved scope; agents never widen it. Docs-only / small / shared-file work = one
  writer; do not spawn to raise the count.
- Task map **before** delegation: task ID, input pins, goal, output, owner, read/write allowlist, forbidden files,
  dependency, acceptance, resource/test budget. Agents read applicable rules first.
- **One writer per file.** Primary alone owns: Unified, ledger/sync, packet, tokens.css/tokens.ts, shell/nav/routes,
  vite-env flag, lockfiles, generated outputs, integration, commits. Sub-agents return patches/notes for shared paths.
  Producer schema -> generated client -> consumer is sequential; no two agents define schema/reader semantics.
- Good to delegate: SSH read-only digests (only if the assignment allows), fixture generation + conformance, drift/
  scale audits, independent diff review (give the diff, not your conclusion), independent screen builds on frozen port.
  Do not delegate: IA/design decisions, ACK/review sign-off, shared contract/reader semantics, self-verification.
- Agents never checkout/branch/worktree/commit/merge/rebase/push/regenerate shared outputs/deploy/touch credentials/
  revert others' dirty files/`--no-verify`. Primary runs impacted integration once and reads the diff, not the summary.
- SendMessage-reuse before spawn; log agent ID/region/pin in sync "Sổ agent" (2 IDs missing today); digests >24h refreshed
  via deltas. Parallel for independent work; low effort for mechanical work. One heavy job at a time across all agents.

## 5. Talking to Codex (Rules §7.3, 9.6, §10)
- Request: `ELP2-REQ-FE-nnn` (next free number; existing FE-001..036 keep their IDs) with the 10.4 template: Pri,
  from->to, phase/screen, locator, observation with pin SHA, expected semantics, blocked UI, smallest proposal, fixture
  scenario, contract/test impact, done-when, status `OPEN->ACKNOWLEDGED->IN_PROGRESS->DELIVERED->VERIFIED->CLOSED`.
  Codex records state in the owning packet; one ledger. Mandatory request not at done-when = related gate not COMPLETE.
  FE verifies DELIVERED items (VERIFIED) where integration is affected; regression reopens same ID with revision.
- Review: `ELP2-REV-n` with severity BLOCKER|MAJOR|MINOR|NOTE, locator, observed vs expected, UI/UX impact, smallest
  fix. A review is **not an ACK**. BLOCKER must be answered next round (accept / refute with evidence / defer with
  owner); MAJOR within the related package. FE does not edit backend/contracts; Codex does not edit approved UI.
- **ACK semantics**: writing a file is not an ACK. ACK = `ACCEPTED` or `CHANGES_REQUESTED` with locator/receipt, only
  for what UXM-07 really consumed. Inbox (ELP2-REQ-00-001, 04-010, 05-002, 06-001, 08-001, 09-001, 10-001) stays
  `AWAITING_CONSUMER_REVIEW` unless consumed; fixture consumption can be ACCEPTED at "contract published" level only -
  never claim "backend ready" under `SOURCE_NOT_QUALIFIED`. Do not write "sent to Codex" unless actually sent; give
  Bobby the prompt/path.
- Round-start: sync steps in §1.1 before anything (even answer-only rounds); round-end: sync §3/§4 + packet "Request hai
  chiều" before the report. Commit messages cite request/review IDs; Codex cites them on delivery.
- Pre-code asks gating S0/S1: registry rev 7 additive; reader cross-constraint table (FE-001/RV-1; Rules 9.8.2 still
  "chờ giải thích thêm"); FE-025/027/028/030.

## 6. Landing (Rules §1, 9.6, 10.5; CLAUDE.md V2 directive)
- Work only on `claude/fe-parity` (rebase approved, §1.2). Commit small coherent units citing plan sections/IDs; stage
  owned paths only (path-commits sweep other agents' staged edits; check `git diff --cached`); never lump docs and code.
- Before commit: fetch + compare with `docs/research-loop-plan`; docs-only may land after the hook; Execution code ->
  run ledger refresh first (§2.8). Normal hook, no bypass, no manual `rm`/restore of hook outputs.
- **ff-merge into `/home/bobby/portal-research` only when that tree has no uncommitted/staged changes of Codex** - right
  now it has a large staged set (control-api execution-v2/governance/positive-parent) -> **do not ff-merge**; agree the
  landing turn with Codex/Bobby; no shared `git stash`; no ours/theirs wholesale.
- **No push, no dev/main merge, no deploy, no signing, no live/HK mutation** unless Bobby approves that exact step.
  (CLAUDE.md 7.10 "push to primus-origin and compare SHA" is the Research rule; the V2 directive denies push authority
  by default -> put push yes/no in the scope card.) No shared-preview/dev-portal rebuild; no flag flipping on dev/stable.
- Rollback: flags default off (`VITE_EXECUTION_V2_SCREENS` empty => V1 unchanged), per-commit `git revert`, no DB; V1 untouched.

## 7. Findings on the proposed scope card (evidence/UXM-07/README.md)
Rule violations / conflicts
- C1 **"Lát có dữ liệu thật" / "S1 có dữ liệu thật?" column** contradicts UXM-07 = fixture-browser only (Unified 14.4,
  guide §18, template). Real reads are UXM-08, endpoint-by-endpoint, after `source_ready`. review2/00 D itself says no V2
  source is qualified. Reword: "has the earliest real source, still fixture in UXM-07".
- C2 **Migration steps 5-6 (enable screens, delete V1 tests, delete V1 components/fixture-lab)**: removes the rollback
  (guide §18 UXM-07: flag off/route compat), changes accepted V1 UI/baselines (Rules §1, 9.5.4: baseline only for new
  groups; Rules 9.5.1 do not replace V1 mid-way) and enabling on the product route before G6 violates 9.5.3. Keep steps 1-4
  in UXM-07; move 5-6 to UXM-08/10 with their own approval, or ask Bobby explicitly.
- C3 **Flags "same route, two components" + `VITE_EXECUTION_V2_SCREENS` on dev and stable**: needs productBoundary
  proof (fixture adapter unreachable from product graph; flag-on in product would have only the `http` adapter) and an
  explicit statement that no flag is flipped on any stack in UXM-07 (memory: dev/stable already drift by 8 flags).
- C4 **S0 token additions in `styles/tokens.css`**: shared file; CLAUDE.md §0 + Rules 5.2/9.5.2 = stop and ask when a
  shared token could change Research/Planning (46/100 baselines on `operations`). Additive-only + tokens.test mirror +
  zero-diff baseline proof, **named in the approval**; alternative: scope under `[data-theme="execution-carbon"]`/V2 CSS.
  Also: `activeTheme()` folds execution-carbon into operations and ECharts navy/JetBrains Mono findings (design/README)
  are not to be fixed "while here".
- C5 **"Shell + context bar + ⌘K" and nav change to 9 items**: shell/nav render from the registry (CLAUDE.md §2 U03; no
  hard-coded nav; no second feature model) and `registry/*.json` is forbidden for FE -> blocked on Codex rev 7; ⌘K must
  be server-filtered, not client-trimmed (9.3.7). Put as dependency D-REG, not as S0 work.
- C6 **Cockpit "after recording a decision stay on receipt + Next request"**: a decision write is a command (UXM-09,
  ELP2-07 not source-qualified; FE-030 receipt contract absent; review2/00 D: buttons "Preview · not recorded", disabled).
  In UXM-07 only render receipt/outcome states from fixtures; no toast as outcome, 4-axis receipt (delivery/business/
  projection/venue), ACK != APPLIED, UNKNOWN -> look up same key.
- C7 **Reader decision**: README says "U2 hand-written" but Rules 9.8.2 is still excluded from approval; the card must cite
  Bobby's 2026-10-18 message verbatim as the approval reference and name Codex's table as a hard dependency (else the
  reader cannot enforce enum/decimal/availability<->value<->reason invariants).
- C8 **Operations/Incident "reviewer/researcher blocked"** is by role name; Rules 9.3.7 / review2 B8: capability, not
  role/ADMIN/name; blocked reason must be typed and must not leak hidden counts.
- C9 **Drawer ("một drawer")**: new drawers must be real modals (role=dialog, focus trap, Escape, focus return) and old
  Admin drawer is not edited (9.4.7); Incident route-drawer over M09 keeps `/execution/operations/incidents/:id`.
Missing from the card (add before assignment)
- Approval reference; repo/branch/**full SHA**/dirty paths; owned/forbidden files; resource ceiling + capacity check; test
  plan with order (§2); rollback with commit-level detail; risks; push/land decision; who lands (card §7 asks, good).
- Requirement->test->receipt->exit matrix; UX-F applicability list with N/A reasons; readiness split design/fixture/real/
  command; pins for generated types, fixtures (hash), HiFi revision, 4 sources (PM UNRECONCILED).
- Scale-refine 6 cells per screen; Reuse report; L0-L3 fixture plan incl. sparse profile and conformance gate;
  BFF_DOUBLE lane labels; keyboard/focus/console/idle-polling/request-count checks; UX copy (<=60 chars subtitles,
  <=4 long strings/screen), English only; metric-component single source.
- Card §3 steps reach Overview/cockpit (S2-S4): label out of scope. Inconsistency: decision U1 lists "Fleet identity" in S1, the S1 table row omits it and S2 lists "Fleet table". Fix.
- Receipt file names (§3), journal location, ledger IDs for the new asks, ACK plan, subagent task map, the N29 re-pin step.
