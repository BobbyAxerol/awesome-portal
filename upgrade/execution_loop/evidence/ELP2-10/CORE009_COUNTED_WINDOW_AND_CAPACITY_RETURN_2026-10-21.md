# Core009 — counted finite window and independent capacity return

Status: **SOURCE_CONFIRMED / PROPOSAL, NOT CONNECTED_ACCEPTED**.
Owner: Core integrator; recipients: Edge acceptance owner, Claude P22/browser
owner and source measurement owners. Verification: R0; no source, authority,
runtime, database or process was changed for this return.

## 1. Pins and why this is separate from the frozen writer

Read cut21Oct18:21UTC: canonical `ab092459d937ccc292d58e2388c8e7956a85d9c4`,
Claude `7224d4aafdcdb92a11f13db897495530eb2abbfc`. The corrected writer remains
frozen at `8ac4f5530adfcfc6f5ecfb92da55bb56329df92d`; its one normal gate is
still running. This note does not edit/rebase that tree, launch a second gate,
install its intended image or open a finite source window. See the separate
[normal/image/target return](CORE009_SUCCESSOR_NORMAL_IMAGE_RETURN_2026-10-21.md).

## 2. Actual cumulative admission budget

The actual18:12:38 Research census is9retained/0unresolved, native8/0unreconciled.
With the existing32ceiling and20reserved recovery obligations, at most **3 new
admissions** remain. Terminal rows still count; recovery/ACK is not a reset.

Reviewed Core sources at8ac4f553:
`apps/control-api/src/execution-v2/current-human-candidate.ts:330–341,865–872,1313–1362`,
`native-manager-consumer.ts:302–353`, and
`current-human-candidate.sql:188–201`. Root directly re-read the frame admission
query and the conditional heartbeat/poll loop at `realtime.ts:315–345`.

| Case | Additional retained obligations |
| --- | ---: |
| Positive native deployments, repeated/cache-HIT or snapshot GET | 1 each |
| Separately selected relation GET | 1 |
| Open SSE before any physical frame | 0 |
| Each physically admitted revalidate **or heartbeat** frame | 1 each |
| Same-key source status/resolve/cancel, genuine ACK or official revoke | 0 new |
| Refused fresh/old-cursor request | 0 only if actually refused before admission |
| Genuine independent unaffected-scope READ | 1 |
| Admitted delivery later cancelled or UNKNOWN | Still retained/counting |

Heartbeat is emitted only when the notice batch is empty, not in addition to
each notice. Client frame limits are **observation limits**, not authoritative
admission bounds: socket buffering and admitted/in-flight frames can outrun
the reader. Do not promise one or two retained frames from a client flag.

### Eligible partial case under unchanged bounds

After the actual qualified image/config/window are returned, one snapshot
with opaque cursor(1), official READ revoke, actual fresh/old-cursor denials
and one independent unaffected-scope positive READ(1) uses **2** new
admissions, leaving one spare. The independent scope must genuinely exist and
be separately authorized; do not mint a fixture scope or assume a denial is
pre-admission. This proves only those READ/revoke/cursor-isolation properties,
not cache-HIT, active SSE, restart/recovery or full08/09 acceptance.

Alternative, only with a real installed observer: same-query MISS/HIT pair(2)
plus revoke/denial and unaffected-scope READ(1) uses3, with no active-SSE lane.
These are alternatives, not two suites that both fit the same remaining3.

### Edge request: return a counted full-case plan before the full driver

Existing Edge `scripts/epg10-08/connected_read.py:595–603` always performs3
baseline GETs, plus1 optional relation; normal stream mode may open two
subscriptions(`618–632`). STREAM-poststage performs2 positive READs and2
expected denials(`562–578`); READ-poststage performs2 expected denials(`579–591`).
Driver SHA256:
`cad1eeb6b8f3cd8244cdf7e3f3dd0001a7fefb32a105bdbfab60d7ecc519debf`.

For both normal-resume and active-observation specimens, the proposal is:

`required_cap = 9 existing + 20 reserve + 2*(3+R) + 2 preserved READs + 1 unaffected READ + F + C`

`= 38 + 2R + F + C`, where R is0/1 selected relation, F is the **server-admitted
frame bound**, and C counts additional admitted/cancelled attempts not already
included. No arbitrary numeric cap or source window is approved by this
formula. Return the concrete cases, genuine per-frame counter/stop fence,
upper bounds and recovery margin, then obtain the separate budget decision
before applying any higher cap. Do not purge custody rows or restart to reset.
An eligible partial READ does not wait for optional cache/Manager/financial
inputs, but cannot be called the full connected result.

## 3. Resource hygiene — exact owner acknowledgement requested

At18:10 host MemAvailable was2,927,348KiB; at18:21:46 it recovered to8,272,328KiB.
The image builder retains its6GiB floor and rechecks at actual build entry;
no weakening or manually bypassing the guard. Disk18:21:46:
150,804,115,456available of665,811,062,784bytes(22.65%). No load measurement or
coexistence PASS is inferred from this idle/correctness snapshot.

Independent read-only host attribution found11 Vite processes started1–2Oct,
aggregate RSS8,415,804KiB(~8.03GiB). They are **not** the stopped21Oct Codex
tsc/normal attempts. `†` means the kernel reports a deleted working directory.
Paths below are relative to `/home/bobby/`:

| PID | Working directory | Vite config basename |
| --- | --- | --- |
| 3548331 | `portal/.claude/worktrees/wf_c2eb9556-88b-5/apps/portal/frontend`† | `vite.s04.config.ts` |
| 2985821 | `portal-research-fe/apps/portal/frontend` | `vite.local-after.config.ts` |
| 2438668 | `portal/.claude/worktrees/wf_c3a88615-df0-8/apps/portal/frontend`† | `vite.f1b-s03.config.ts` |
| 2355551 | `portal/.claude/worktrees/wf_c3a88615-df0-3/apps/portal/frontend`† | `vite.s06.local.config.ts` |
| 3283332 | `portal/.claude/worktrees/wf_a6e6b281-368-3/apps/portal/frontend`† | `vite.f2-s06s07.config.ts` |
| 663625 | `portal/.claude/worktrees/wf_0bd98f96-5b6-5/apps/portal/frontend` | `vite.s06s07.config.ts` |
| 3621942 | `portal/.claude/worktrees/wf_c2eb9556-88b-9/apps/portal/frontend`† | `vite.s11.config.ts` |
| 3253690 | `portal/.claude/worktrees/wf_a6e6b281-368-2/apps/portal/frontend`† | `vite.s03tmp.config.ts` |
| 1881220 | `portal/.claude/worktrees/wf_530268e1-bb8-3/apps/portal/frontend`† | `vite.f1-s10s13.local.config.ts` |
| 3247139 | `portal/.claude/worktrees/wf_a6e6b281-368-1/apps/portal/frontend`† | `vite.s01.config.ts` |
| 621592 | `portal/.claude/worktrees/wf_0bd98f96-5b6-4/apps/portal/frontend` | `vite.s04.tmp.config.ts` |

**Claude action:** identify exact no-longer-used owned processes and ACK any
bounded cleanup, preserving active V2/browser lanes. Deleted cwd or PPID1
alone does not authorize Root to kill a peer's process. No kill, stop or
prune was performed. Preserve normal controller3044319/timeout3044368 and
its disposable PostgreSQL/Node cell; do not compete for its heavy slot.

## 4. Other lanes / browser handoff

- Manager: return genuine issued public leaf/chain or controlled issuer-service
  reference from the existing owner request. No private Core key transfer,
  stable-key copying or substitute CA. Native READ is a different trust lane.
- Financial mapping: genuine economic leaves/expected ownership census,
  valuation cut/basis/currency and complete cost coverage remain needed. PM
  history-generation adoption is not that financial publication.
- Budget/calibration/coexistence/P184 G2: D1–D7 direction remains approved;
  numeric operational bounds and independent population are separate owner
  inputs, not derived from fixture constants or the correctness-cell ceiling.
- Claude has two new source commits `90f2a2c1`/`7224d4aa` for measurement
  guards/Fleet cancellation; Root's independent disposition is below.
- Browser continues on fixture/qualified lanes with actual bundle/API pins.
  Public8095 fixture BFF is not a native-connected receipt. Do not rebuild or
  run a competing heavy gate while this writer's normal/image owns the slot.

Subagents:3 existing agents reused for bounded read-only source counts,
capacity/operational review and Claude delta review;0 new spawns. Root owns
the final source decisions, shared Markdown and integration. ELP2-10 remains
OPEN; ELP2-11/release/dev/main/Live have not been entered.

## 5. Claude source delta — independent disposition21Oct18:25UTC

Root read the actual changed functions at clean7224d4aa and checked the
independent read-only review. No duplicate tests or load were run by Root.

| Source | Disposition / remaining acceptance |
| --- | --- |
| `apps/portal/frontend/e2e/quietGate.mjs:42–53` | **ACCEPT**: actual quiet-achievable time must be at/before deadline; delayed wake no longer rescues quiet after cap. |
| `apps/portal/frontend/src/execution/v2/screens/fleet/useFleetDataset.ts:232–300` | **ACCEPT source**: a cancelled physical flight is no answer, successor waits for settlement, per-waiter cancellation returns null; independent denied READ clears rows/head/cursor. New product-bundle browser proof is still separate. |
| `scripts/measure/lib/stage.mjs:46–66` | **ACCEPT**: SUM tab census checked before headers/network; B1=8, B2=28. D5 pilot direction is not automatic approval for28tabs. |
| `scripts/measure/lib/g2.mjs:52–103` | **ACCEPT semantic validation**: run/window/apparatus/source/expected population, unique identities, positive integer samples and p95<=max. Original thresholds unchanged. |
| `scripts/measure/m7-g2-window.mjs:58–63` | **CHANGE requested**: census hash then parse re-read the path; ingest reads bytes then hashes the path again. A replaced/mutated file can bind the receipt digest to bytes other than those parsed/evaluated. |

**Claude smallest follow-up:** for census and ingest, read one buffer, hash
that exact buffer, compare the requested digest, then parse/evaluate those
same bytes. Add a focused file-replacement/mutation regression showing a pin
cannot attest another read's bytes. No G2 apparatus/load/window or M1 rerun
is required for this local ingestion correction. Keep immutable old receipts.

Claude's published focused log SHA256
`61b699cce729da2595eac7131003435ce8c570dcead0009de3bcaf0024bd3c89`
contains31unit PASS and3browser probe PASS. These browser probes used the
prior16:53bundle; they do **not** qualify the new Fleet consumer bundle.
P22 actual private observer factory remains requested, no actual app/module
construction was added in these two commits. Frozen8ac writer is unaffected.

Owner delta18:23:24: Edge`e055fb95e9a6504c3075b5c005574329d34159a2`,
PM`61edc7616918cc314d135012988f23e5e6fce2c8`. PM reports11 distinct
PG/native generation-adoption cases PASS; source-only, not financial runtime
publication. No new finite-window, Manager issuer or numeric budget approval
was returned by this read. Transition handoff SHA256
`76ffe7e73d22b037c4681c581fdf984195e9c9f802765dfcfb0190096085bd57`.
