# ELP2-10 — Claude numeric proposal packet (M5 / M7 / M2c / calibration / independent control domain)

Date 2026-10-23. Author: Claude. Verification tier: **R0** (Markdown only; no code, test, docker, runtime or network was used).
Assignment: [Codex approved closeout §4, last bullet](CODEX_TO_CLAUDE_APPROVED_CLOSEOUT_2026-10-23.md) (source `S1`).
Base: `claude/post-land-20261022` (contains `3ed9a2f71`).

**Status of this document: PROPOSAL / SOURCE_ONLY. Nothing here was measured, approved, installed, granted or connected.**
No window exists. No budget is approved. No original receipt is changed. No fixture constant is promoted to configuration.

## 0. Conventions

| Tag | Meaning in this packet |
| --- | --- |
| `SOURCE_ONLY` | Read from a cited file; not run by me. |
| `PROPOSAL` | A number or step I put forward for the owner's decision. Never installed. |
| `FIXTURE_ONLY` | Came from a fixture or synthetic run; shown only to say it is not a basis. |
| `DERIVED` | Arithmetic on a cited source line (the arithmetic is shown). |
| `RECOMMENDED` | No source number exists; my recommendation, with the stated reason. |
| `OWNER_INPUT` | Cannot be derived. Exact field, unit, owner, and who returns it (always through Edge). |
| `NOT_FOUND` | I looked in the listed files and the item is not there. |

Source ids `S1…S22` are indexed in section 9. Line numbers are lines of the file as read on 2026-10-23.

Hard rules applied (from `S1` §4 and `S2` §4):
1. Correctness caps C288, reserve R20, 2 CPU / 1536 MiB are **limits**, never load budgets (`S2:100–102`, `S5:386–392`).
2. Accepting the formula or contract is not calibrated production policy (`S1:113`).
3. Methodology D1–D7 stays approved and is not asked again (`S2:94`, `S3:74–75`).
4. Everything owner-side is returned **through Edge** (`S6:10–16`), not "waiting Bobby/Codex".

---

## 1. TARGET — which artifacts remain

### 1.1 Original receipts (immutable; hashes re-computed by me with `sha256sum` and equal to the sources)

| Receipt | File | Raw SHA256 (verbatim) | Lane | Source that records the hash |
| --- | --- | --- | --- | --- |
| M5 | `measurements/M-5-2026-10-21.json` | `9f1913bf2ca6a8318cfdb8ca4145dff4d7d78548807b34a3cceb4a3bd69134ab` | NOT_RUN (`status: READY_NEEDS_WINDOW`) | `S2:86`, `S4:89` |
| M7 | `measurements/M-7-2026-10-21.json` | `0a0ca83baf637b3a490ecb36c9352d48a9bc7d3d1712d8bc42f685dd70e1332f` | NOT_RUN (`status: READY_NEEDS_WINDOW`) | `S2:87`, `S4:90` |
| M2c | `measurements/M-2c-2026-10-21.json` | `2255c340741bda66bbfdcf6b06c07bbcf2ee08625ee421e249964fc0b1edb5a1` | NOT_RUN (`status: READY_NEEDS_WINDOW`) | **NOT_FOUND** in any ELP2-10 or execution_loop Markdown (grep). Hash is my own `sha256sum` of the file today; treat as `SOURCE_ONLY` observation, not an Edge/Codex pin. |

In-file `receipt_digest` values (not the raw-file hashes): M5 `sha256:1172397231de9624621acd1359c398032af1c10f408c82fbe91e6daf74bfbf4e`; M7 `sha256:af2c2cba04ded346a61d01dedafb231cdf08fb878000d04ba26c53e3364cd47f`; M2c `sha256:e70437ccce3a344929ba4695108c0e27b3bc56f8c2d99a4237fc8f9cd9dcc482`.
All three carry `evidence_class: TEST_ONLY_FIXTURE_NOT_CALIBRATION_EVIDENCE`, `calibration_evidence: false`, `approved_budget: false`.
Their "unmet: Core008/image7b not Core009" wording is historical: superseded by installed a96/runtime9869/schema149 and real native READ (`S2:89–92`; the superseding sentence names M5/M7; applying it to M2c is my inference). Superseded wording does **not** mean any measurement ran (`S2:91–92`). Do not overwrite the JSON; do not reuse the finite READ session as load authority.

### 1.2 What remains, what it would let the Portal claim, and what it would not

| # | Artifact still missing | Owner of the missing input (via Edge) | Would let the Portal claim | Would NOT let the Portal claim |
| --- | --- | --- | --- | --- |
| T1 | **M5 coexistence B0/B1/B2**, including the **14-group scalar budget** with `approval_ref` (`S10-M5 results.missing`, `S11:14,18–29`) | Edge (EPG10-01 plan owner, window grantor) with TS and DL owners | "Under the pinned plan, on the named target, Portal read load B1/B2 stayed inside the approved per-group bounds relative to B0", for that target, those populations, those dates | Production capacity in general; any N-user or N-tab "safe" claim; trading-loop safety beyond B-TRADE as measured; calibration; P184 G2; native08 behaviour; any other target/config |
| T2 | **M7 / P184 G2 population validator run** (`S10-M7`, `S11:34–42`) | Edge (runs its P184 apparatus and supplies the per-feed/venue population) | "The Edge-supplied population passed the ORIGINAL gate: per-feed p95 <= 500 ms; trade max < 1,500 ms; quote/mark max < 1,000 ms" (`S10-M7 workload.original_gate`) | A new universal Portal SLO; TPS or orders/s; anything for feeds not in the supplied census; a waiver from the optional mainnet canary (it does not replace G2, `S10-M7 limitations`) |
| T3 | **M2c eligible STREAM counters / tab sweep on the real BFF** (`S10-M2c`, `S11:44–54`, `S3:66–69`) | Edge (source-call counter export, gap G-2); Codex (real BFF); exact current session/scope and publication/notices from Edge | "Source calls per phase window do not grow beyond ceil(1.25 x the 1-tab count) as tabs go 1->16; hidden tabs make 0 requests" (`S11:51`) | p95 latency at any tier (p95 only inside an exclusive M5/M7 window, `S10-M2c limitations`); a rate for native08; whole-Fleet stream rights (native READ does not grant STREAM, `S3:67–69`); capacity |
| T4 | **Calibration population** (T10-13 / M-8) (`S3:71–73`, `S16 §7`, `S12:169`) | Edge coordinating TS/PM/DL for a comparable independent population; independent approver for the Score config | "Score anchors were fit on a frozen comparable-basis population and evaluated on a separate pinned split" | A scientifically validated Score from fixture data; anchors from four overlapping 14-day tapes with one identical observation hash and unpublished currency/basis (`S3:71–73`, `S16 §7`); a change to the already-selected formula (`F=0.45P+0.30R+0.25B`, not reopened) |
| T5 | **Truly independent economic control domain** (`S13:43–74`, `S5:351`) | Edge -> PM/TS native authority owner; scope decision recorded in section 7 | The case "after Paper READ-domain revoke, a separate authorized domain is still readable" (positive control) | Anything if the control is a second URL/session, READ after STREAM revoke, a fixture or a denied scope (`S8:103–110`, §4 item 3) |

Lane label note: the M5/M7/M2c scripts label a run `REAL_READ_QUALIFIED` only when the Source Truth Board row is `EXISTS_MOUNTED` with a real source receipt, else `REAL_READ_RETAINED` (`S11:5`). Manager financial datasets are not qualified today (`S1:79`, `S6:80`), so a first window would be `REAL_READ_RETAINED` unless Edge returns the financial source receipt. This is `SOURCE_ONLY`.

---

## 2. NUMERIC PROPOSAL

Every number is labelled. "Derivation" cites a source line or says `no source: recommendation based on X`. Where the number was first proposed by me on 2026-10-21 (`S11`), it is **my own earlier proposal that the owners have not approved** (`S3:62–63`: "old proposed rates/tab counts/durations are not automatically approved production values"). It is repeated here only so the owner can ACCEPT / CHANGE / REJECT each row.

### 2.1 Portal-side M5 load shape (GET-only, open loop, seed 20261021 — `S11:25`)

| ID | Parameter | Value | Label | Derivation |
| --- | --- | --- | --- | --- |
| N-01 | B1 virtual tabs | 8 | PROPOSAL | `S11:25` ("8 tab Overview"); `S9:145` (stage.mjs checks SUM tab census B1=8). `S9:145` also says D5 pilot direction is not automatic approval. |
| N-02 | B1 per-tab cadence | 2 reads / 15 s | PROPOSAL | `S11:25`; `S16 PL-1` (`PROJECTION_POLL_MS` 15,000 ms x 2 reads, source `useRevision.ts:66`). 15 s is itself `PROPOSED_NOT_APPROVED` (`S16 §5`). |
| N-03 | B1 offered rate | 1.0667 req/s (source rounds to 1.07; peak 2/s) | DERIVED | 8 x 2 / 15 = 1.0667. Matches `S11:25`. |
| N-04 | B2 virtual tabs | 28 | PROPOSAL | `S9:145` (B2=28); `S11:25` (B1's 8 + 10 screens x 2 tabs = 28). |
| N-05 | B2 average offered rate | 6.267 req/s | DERIVED | 1.0667 + 2 sets x 78 reads / 30 s = 6.267. Matches `S11:25` "6,27 req/s". My reading of "(78 reads/pass/set)" as two sets (the two extra tabs per screen) is the only reading that reproduces 6.27. |
| N-06 | B2 precomputed peak | 18 req/s | SOURCE_ONLY | `S11:25`; I could not re-derive it from the quoted text (depends on burst alignment in `read-sets.v1.json`). Treat as the driver's declared number, not mine. |
| N-07 | Stage design | 3 stages (B0,B1,B2) x 2 independent repetitions x 600 s | SOURCE_ONLY | `S11:24`; Edge protocol "600 s, two independent repetitions" (`S12:173–176`). Counterbalanced order is Edge's plan, not mine. |
| N-08 | Stabilisation between stages | 6 x 300 s = 1,800 s | PROPOSAL | `S11:24` ("5 phut x 6"). No source for 300 s: recommendation based on letting queues/caches settle; Edge may shrink if plan states `minimum_duration_ms`. |
| N-09 | Window length requested | 120 min (`max_duration_ms` 7,200,000) | DERIVED | 3 x 2 x 600 s = 3,600 s measure + 1,800 s stabilise = 5,400 s = 90 min, plus margin to 120 min (`S11:24`, template `S11:72`). |
| N-10 | Portal request budget (total GETs offered) | per repetition B1 = 640, B2 = 3,760; both reps = 8,800 | DERIVED | 1.0667 x 600 = 640; 6.267 x 600 = 3,760; (640 + 3,760) x 2 = 8,800. Arithmetic on N-03/N-05. B0 carries no Portal traffic (Edge runs B0, `S11:23`). |
| N-11 | Authorization `max_rps` | must be >= 18; value to be set by grantor | OWNER_INPUT | Driver refuses to start when offered peak > `max_rps` (`S11:26`). Template shows 25 (`S11:72`) as an example only. I RECOMMEND the grantor writes the smallest value that clears N-06 plus the grantor's own headroom; I do not pick it. |
| N-12 | Authorization `max_tabs` | **conflict to resolve** | OWNER_INPUT | Template shows `max_tabs: 16` (`S11:72`) but B2 declares 28 virtual tabs (N-04). Either the field counts browser tabs only (M2c) or B2 would be refused. Edge/Claude must state which; I did not find the driver rule (NOT_FOUND in the files I read). |
| N-13 | Drain + end guard | 15 s request drain + 5 s window guard | SOURCE_ONLY | `S5:1012` (current driver). Older wording "window end - 5 s" (`S11:26`) is superseded by this. |
| N-14 | Workload file | `read-sets.v1.json` sha256 `83809ec2950c1bb471077b62a45a0cc5780107f9aef6937a37b788bd27fd704f` | FIXTURE_ONLY | `S5:367` labels it PROPOSED_NOT_APPROVED and fixture-derived (old Overview/operations polling, fixture IDs, legacy blotter stream URL; `S5:378–382`). Must be replaced by the current request/schema workload (`current-manager-workload.mjs`, `S5:673–694`) with real IDs before any run. |

### 2.2 M7 / G2 (Edge owns the apparatus)

| ID | Parameter | Value | Label | Derivation |
| --- | --- | --- | --- | --- |
| N-15 | Portal hold-load during Edge's P184 run | B1 = 1.0667 req/s, read-only; or idle if Edge prefers | PROPOSAL | `S11:40`, `S10-M7 workload.portal_part`. |
| N-16 | Pass thresholds | per-feed p95 <= 500 ms; trade max < 1,500 ms; quote/mark max < 1,000 ms | SOURCE_ONLY (original gate, **unchanged**) | `S10-M7 workload.original_gate`, `S11:41`. These are the gate, not a load budget; do not tune. |
| N-17 | Apparatus intensity | 6,000 and 9,000 controlled canonical events/s, 600 s, two independent repetitions | SOURCE_ONLY (planned input, not measured) | `S12:173–176`; guide W-COEXIST-6K/9K (`S15` §9.2 table above line 755; exact line not recorded). Edge's own plan owns pacing, initial state, normal then overload/recovery for 9K. |
| N-18 | Minimum apparatus time if run sequentially without overload/recovery | 2 fixtures x 2 reps x 600 s = 2,400 s | RECOMMENDED lower bound | Arithmetic on N-17 only; the real duration is Edge's (`OWNER_INPUT` below). |
| N-19 | Expected feed/venue/kind census, apparatus + gate revision, run/time pins, producer result schema (or adapter) | — | OWNER_INPUT | See 8.2. Input contract I proposed: `portal.elp2-10.g2-population-input.v1` (`S10-M7 results.input_contract_proposed`); Edge confirms or supplies an adapter. |

### 2.3 M2c tab sweep (Claude Playwright + Edge counters)

| ID | Parameter | Value | Label | Derivation |
| --- | --- | --- | --- | --- |
| N-20 | Tab levels | 1, 2, 4, 8, 16 | SOURCE_ONLY | D5 sweep approved (`S11:3`, `S11:54`). |
| N-21 | Time per cell | ~16 min (visible idle 10 min, 19-screen walk, hidden 5 min, reload) | SOURCE_ONLY | `S11:49`, `S10-M2c workload.real_time_cells`. |
| N-22 | Sweep duration | 5 x 16 = 80 min + 20 min margin = 100 min; +40 min if two real sessions (same scope / different scope) | DERIVED | `S11:49`. |
| N-23 | Reads | N tabs x 2 reads/15 s idle (0.133 req/s/tab; 16 tabs = 2.13 req/s) + one 19-screen walk (~70 reads/tab) | DERIVED | `S11:51`, `S16 PL-1`. |
| N-24 | Reads per sweep (all five cells) | about 4,650 (31 tab-instances x (80 idle + 70 walk)), plus reload reads | DERIVED (caveat) | 80 reads/tab/600 s from `S16 §3 B-12`; ~70 from `S11:51`. Reload reads have no source figure: NOT_FOUND, so 4,650 is a floor. |
| N-25 | Pass rule | tier-3 source calls with N tabs <= ceil(1.25 x tier-3 calls with 1 tab) in the same window; hidden tab = 0 requests | SOURCE_ONLY | `S11:51`; `S16 R-A` (rule 1.25, which is a deterministic-count regression margin, not a capacity tolerance). |
| N-26 | Host guard | stop if MemAvailable < 1.5 GiB; <= 16 Chromium tabs (~2.4 GiB) | SOURCE_ONLY | `S11:48`. |
| N-27 | Source-call counter export | per-phase-window, aligned to `phase_windows_ms` | OWNER_INPUT | Edge gap G-2 (`S11:28,48`). Format is not defined anywhere I read: NOT_FOUND. |

### 2.4 Per-group scalar budget decomposition across the 14 groups

The source documents define the **names, metric axes and baseline-measurement owner** of each group, but **no numeric bound**: the Edge plan's bounds are composite policies that the checker refuses to flatten (`S17:30–37`), and every per-group value is `UNDECIDED` which means "gate not met, not unlimited" (`S15` §9.3 intro). I do not set any group number.

Required scalar fields per group (from `S16 §6`, `S17:29`, `S12:168`): `bound_kind` in {`MAX_ABSOLUTE`, `MIN_ABSOLUTE`, `MAX_DELTA`, `MAX_RATIO`}; `value`; `unit`; B0 baseline value; population; reserve/actions; `approval_ref`; revision; validity.
Rule I RECOMMEND for turning a measured baseline into a bound (RECOMMENDED, `S16 R-C`, not approved): `bound = 1.25 x max(p95 over >= 2 independent repetitions)` and not worse than B0 by the plan's `MAX_DELTA`/`MAX_RATIO`; if variance across repetitions exceeds 25 % of the value, add repetitions rather than widen the margin. The 25 % itself has no statistical source (`S16 §1`: a choice; Bobby/owner may change it).

| Group | Metric axes (`S15` §9.3, lines 774–787) | Baseline measured by (`S16 §6`) | Scalar bound value (per group) | Level |
| --- | --- | --- | --- | --- |
| B-TS-CPU | CPU idle/steady/burst on TS | M-5 | OWNER_INPUT (Edge/TS) | OWNER_INPUT |
| B-TS-RAM | RSS steady/peak, growth after cycles | M-5 | OWNER_INPUT (Edge/TS) | OWNER_INPUT |
| B-TS-DB | query calls, time, scans, pool/lock wait | M-5 | OWNER_INPUT (Edge/TS) | OWNER_INPUT |
| B-TS-IO | disk/WAL/network bytes and latency | M-5 | OWNER_INPUT (Edge/TS) | OWNER_INPUT |
| B-TRADE | trading/admission latency and error; p99 not average | M-5 | OWNER_INPUT (Edge/TS) | OWNER_INPUT |
| B-RS | Research CPU/RSS/DB/IO/storage headroom | M-4 | OWNER_INPUT (Edge + Core for Research contribution) | OWNER_INPUT |
| B-FRESH | source->projection->UI lag per category; percentile + max stale age | M-3 | OWNER_INPUT; freshness target not approved | OWNER_INPUT |
| B-REVOKE | revocation boundary->denial; TS commit and frontend exposure separately | M-3 | OWNER_INPUT; the safety invariant (no wrong grant) has no tolerance | OWNER_INPUT |
| B-RECOVERY | recovery throughput/time, max backlog, cursor retention | M-6 | OWNER_INPUT; RPO/RTO from owner | OWNER_INPUT |
| B-CMD | accepted/status/terminal/unknown age per operation | M-4 | OWNER_INPUT; command transport is off | OWNER_INPUT |
| B-HISTORY | history query latency and export cost, bounded pages | M-6 | OWNER_INPUT | OWNER_INPUT |
| B-DL | DL freshness/throughput/error and reserve | M-5 | OWNER_INPUT (DL owner) | OWNER_INPUT |
| B-EDGE | producer CPU/RAM/query/IO hard ceilings; soft/high/hard and overload actions (guide §6.6, line 558) | M-5 | OWNER_INPUT (Edge) | OWNER_INPUT |
| B-ANALYTICS | bounded queued+running jobs, cadence, recompute cost per window | M-4 | OWNER_INPUT (Research/Edge) | OWNER_INPUT |

Sources for the "baseline measured by" column: `S16 §6` last paragraph. The assignment of a composite `bound_kind` to each specific group (the Edge plan `measurement-plan.json`, sha256 `f9418cd776292d7c2ac27e4d3a5a6df3748ef0b2a336e6ad4bea416836ed35cd`, `S4:85`) is **NOT_FOUND on this host** (the file is on the HK Edge checkout; `find` of `EPG10-01/measurement-plan.json` returned nothing). `S17:30–31` quotes its composite kinds but not their mapping.

Portal's own contribution to groups B-RS / B-EDGE-adjacent axes: Core measures Core latency, rate, error and bytes through its collector adapter; TS/DL/Edge/DB/IO/source-population clocks and numbers are **external** inputs (`S5:386–392`). The installed Core 1.5 CPU/1024 MiB + 0.5 CPU/512 MiB = 2 CPU/1536 MiB partition is a correctness ceiling (limit, not budget; `S5:386–389`, `S2:34–40`).

### 2.5 Correctness caps — shown only as limits

| Cap | Value | Use in this packet | Source |
| --- | --- | --- | --- |
| Retained ceiling C | 288 (approved; applied only for the finite Research config) | Limit that stops any native admission; **not** a load budget | `S8:26`, `S13:10–26`, `S14:30` |
| Reserve R | 20 | Never consumed | `S8:27` |
| Missing-only specimen bound | `H + 244 + 2 + 20 = 282 <= 288` (H=16) | Already consumed by the completed 23 Oct specimen; do not reuse for M5/M7 | `S14:29–30`, `S1:95–98` |
| Full-suite bound | `Cmin = H + 273` (H<=15) | Different case; do not mix with the specimen formula | `S13:15–16`, `S1:95–98` |
| Resource | API 1.5 CPU/1024 MiB + one CLI 0.5 CPU/512 MiB, pool 3+1<=4 | Limit; "configuration plan, not an installed or measured budget" | `S2:34–40`, `S5:386–389` |
| Current retained count | 21 after the specimen (initial 16), pending 0, unresolved 0 | `288 - 21 - 20 = 247` new admissions if the C288 config is active; with C32, 21 + 20 reserve = 41 > 32 so **none** | `S14:57–59`; arithmetic mine |

Whether the cap installed right now is 32 or 288 after restoring the inactive config: **NOT_FOUND** (the return names the restored inactive config `a8142e41…` but not its cap). Rollback may not be assumed automatic from 288 to 32 once more than 32 rows are retained (`S8:116`).

---

## 3. WORKLOAD

### 3.1 Roles

| Role | Who | Notes |
| --- | --- | --- |
| Single coordinator / window grantor | **Edge** (EPG10-01 plan owner) | Writes `portal.elp2-10.window-authorization.v1` + sha256 (out of band). Keeps authority to stop the whole window (`S11:26`). |
| Source and collector runners | Edge / TS / DL (B0 and the 14-group collectors) | `S11:23`. |
| Portal tier B1/B2 + M2c browser | **Claude** from the SGP host; no HK touch, no SSH write (`S11:23`) | GET-only. |
| Core operator (session, revoke, image/config) | Codex/Core | Temporary session and official revoker + zero-custody readback (`S11:26`). |
| Independent review | Codex | `S1:9`. |

One coordinator means: Core's native sole-client rule extends to the window — no second client, no overlapping subscriber (`S8:58–62`, `S7:73–76`).

### 3.2 Step order (all steps are `PROPOSAL`; none is scheduled)

| Step | Action | Gate to proceed | Owner |
| --- | --- | --- | --- |
| W0 | Edge returns inputs (section 8) and a **window authorization** + plan + id-map + session path | all `OWNER_INPUT` rows in 2.4, N-11, N-12, N-19, N-27 present | Edge |
| W1 | Fresh **M0 read-only repin** inside `--repin-max-age-ms`: full Edge/PM SHAs, Core image, lease root + user, competing jobs empty (`S11:12`) | repin newer than max age; trust unexpired (`S11:11`) | Claude |
| W2 | Non-executing dry-run of the current workload against the pinned OpenAPI: opens no credential, network or collector; missing owner artifacts must return `BLOCKED_MISSING_OWNER_INPUTS` (`S5:1003–1017`) | dry-run clean | Claude |
| W3 | **M2c first** (counts only; may share the window and run before M5, `S11:46`) | 1-tab baseline recorded before 2/4/8/16 | Claude + Edge counters |
| W4 | M5 stage order as the Edge plan pins (counterbalanced), 2 repetitions, B0 by Edge, B1/B2 by Claude | each stage preceded by its stabilisation interval | Edge / Claude |
| W5 | **M7 in its own separate window** (not merged with B0/B1/B2; `S11:36`) | Edge apparatus ready | Edge |
| W6 | Revoke temporary session with the official revoker; read back zero custody | readback receipt | Core / Edge |
| W7 | Claude writes the receipt into `ELP2-10/measurements/` as a **new** file; original JSON untouched | — | Claude |

### 3.3 Allowed vs forbidden traffic in the window

| Allowed | Forbidden |
| --- | --- |
| GET-only, open-loop requests from the pinned request set, rate <= `max_rps` (`S11:25–26`) | Any non-GET (the driver refuses a non-GET workload, `S10-M5 refusals_proven_by_tests`) |
| Edge-run B0 and collectors; Edge P184 apparatus | **Any broad browser, conformance or load traffic on the finite native08 source** (`S1:75–77`, `S1:46`) |
| M2c browsers up to the declared tab level, from SGP | **The 150-GET conformance checker on the finite native08 source** (`S1:45–46`) |
| Reads that resolve to the Manager data path (Edge Manager routes -> SourceProxy -> TS) | Any read that resolves to a native08 deployments/snapshot GET: each costs one retained obligation (`S9:31`), which would eat the C288 headroom in 2.5 |
| Exactly one Core process/coordinator | A second subscriber, a second client, a grant renewal that extends an interval, a restart/new coordinator mid-window without a fresh count (`S8:58–62`) |
| Fixture/dataset/UI work on other lanes | Reuse of the finite READ/session as load authority (`S2:91–92`); a test cell or hook on the measurement host at the same time (`S11:13`, P6) |

---

## 4. STOP LIMITS

### 4.1 Numeric stop conditions (Portal driver; `SOURCE_ONLY` from `S11:26`, `S5:1012`)

| Condition | Threshold |
| --- | --- |
| HTTP 429 | any one |
| HTTP 5xx rate | > 2 % with >= 20 requests in a 30 s window |
| Network error rate | > 5 % |
| In-flight (hung) requests | > 64 |
| Signal | SIGINT / SIGTERM |
| Window end | stop issuing at `ends_at - 15 s drain - 5 s guard` |
| Offered peak | start refused when peak > `max_rps` |
| Host memory (M2c) | MemAvailable < 1.5 GiB |
| Native retained count | abort any new admission if the actual count would exceed 288, on any unexpected increment, or if a terminal/ACK is missing (`S13:16–18`) |
| Source owner | Edge or Core may stop the whole window at any time (`S11:26`) |

Thresholds on the 14 groups themselves (e.g. TS CPU or trade p99) are `OWNER_INPUT` (section 2.4): a group bound breach stops the run; I do not set them.

### 4.2 What makes a run NOT_RUN / EXPIRED, not a smaller PASS

| Situation | Outcome | Basis |
| --- | --- | --- |
| Window expires, or the grant ends, before the required action completes | **NOT_RUN / EXPIRED** | `S8:69–70` ("expires before official active revoke is NOT_RUN/EXPIRED, not a smaller PASS") |
| Fewer tabs, fewer repetitions or shorter time than the pinned plan | **NOT_RUN**; no shrinkage of B1/B2 | `S5:378–382`, plan `minimum_duration_ms` (`S11:24`) |
| A route that fails is silently excluded | **NOT_RUN**; no silent exclusion | `S5:378–382` |
| Clock anomaly, restart, new coordinator or extra workload in the window | stop and recount; do not reuse 244 | `S8:58–62` |
| Variance between repetitions > 25 % of the value | add repetitions; do not widen the margin | `S16 R-C` (RECOMMENDED) |
| `max_rps` or `max_tabs` refused at start | **NOT_RUN** | `S11:26` |
| Fixture counts, a re-used fixture workload, or a retained-lane label offered as `REAL_READ_QUALIFIED` | not a PASS | `S11:5`, `S5:378` |

---

## 5. VALIDATION

| Claim | Receipt that proves it | Counters between stages | Who verifies |
| --- | --- | --- | --- |
| Window was authorized | `window-authorization.v1` + sha256; the script refuses mismatched/expired/wrong-measurement/wrong-lane/local-origin records (`S10-M5 refusals_proven_by_tests`) | `starts_at_ms`, `ends_at_ms` vs actual | Claude driver; Edge |
| Target/config was the pinned one | M0 repin receipt: Edge/PM full SHAs, Core image id, schema digest, lease root + user, empty job list | repin age <= `--repin-max-age-ms` | Claude; Codex review |
| Portal load shape ran as declared | `coexistence-stage.v1` fragment: p50/p95/p99 per endpoint, error rate, achieved req/s, bytes, offered vs achieved | after each stage: requests issued vs N-10; stop-condition tally | Claude |
| 14-group result | merged plan receipt, then `qualification-readiness.mjs` structural check (`S10-M5 results.ready`) | per group absolute and relative to B0, for each repetition | Edge merges; the readiness script is an eligibility check only, not authority (`S17:1–3`) |
| M2c amplification | M2c receipt with `phase_windows_ms` + Edge per-window source-call export | tier-3 calls at each N vs `ceil(1.25 x` 1-tab`)`; hidden-tab requests = 0 | Edge counts; Claude receipt |
| G2 | `portal.elp2-10.g2-population-input.v1` (or Edge adapter) ingested with hash-then-parse of the **same buffer** (`S5:370–372`) | population vs expected feed/venue/kind census; unique identities; positive integer samples; p95 <= max | Edge apparatus; Claude `--ingest` |
| Native retained admissions stayed inside the cap | Core census before/after each stage | retained count, pending, unresolved, unreconciled; abort on unexpected increment | Core; Codex |
| Cleanup | official revoker + zero-custody readback (runbook G5, `S11:26`) | sessions 0, grants 0 | Core / Edge |
| Honest labels | every receipt carries lane, `evidence_class`, `approved_budget` | — | Codex independent review |

No Portal claim of "capacity", "calibrated" or "G2 PASS" is allowed unless the matching row above has a real receipt. Any claim from a fixture, a dry-run or the 34/34 source harness is `SOURCE_ONLY` (`S2:101–102`).

---

## 6. ROLLBACK

None of these steps deletes history.

| Step | Restore action | Never |
| --- | --- | --- |
| R1 | Stop issuing load; drain in-flight (15 s) and release the Portal driver. Portal load is GET-only, so there is no Portal state to undo (`S11:26`). | Do not kill an UNKNOWN API or transport; a timeout is not physical close or a retry licence (`S2:40–42`, `S7:94–98`). |
| R2 | Official revoker for the temporary session/grant; read back zero custody. | No stable key copy, no token reuse. |
| R3 | Edge restores its B0 target/config pins it recorded before the window. | No change to Edge/TS/DL by Claude (`S11:23`). |
| R4 | Core restores the **prior image/config only if the retained census permits its limits**. | **Do not promise automatic 288->32 after retaining more than 32 rows** (`S8:114–120`). Keep immutable rows; keep a compatible reviewed bound while inactive, or return a separate owner decision. |
| R5 | Preserve all audit, custody, user and predecessor rows, and the original M5/M7/M2c JSON and their hashes. New runs write **new** receipt files (`S9:153`, `S2:91–92`). | Never delete custody history to fit an old configuration (`S8:118–119`). |
| R6 | Failed/blocked observations are kept; a re-run is a new observation (`S15` §9.4). | No editing of a failed receipt into a PASS. |

---

## 7. THE TRULY INDEPENDENT ECONOMIC CONTROL DOMAIN

**Exact requirement (SOURCE_ONLY, `S13:43–74`, `S5:351`, `S8:96–110`).** The "unaffected control" must be a second, genuinely independent native economic domain, with its own domain, seals, current source fingerprint and acceptance; its own mapping; its own Core grant revision and expiry; and its own native physical terminal and Core ACK. Before the Paper READ-domain revoke it must be positively readable, and after the revoke it must still be readable. Without it the control case stays NOT_RUN and full08 cannot reach PASS.

**Why the current Paper selector/principal composition does not prove it.**

| Finding | Source |
| --- | --- |
| The typed runtime permits exactly one active Paper selector / owner intake / principal; retained selections only recover old custody and do not admit new traffic | `native-core-runtime.ts:165–177` via `S13:48–50`, `S5:351`, `S8:103–106` |
| Currently served operations are bound to the same domain READ grant; a different URL, query, page or second session does not create an unaffected authorization scope | `current-human-snapshot.ts:133–143`, `execution/maximum-data-operation.service.ts:207–221` via `S13:51–54` |
| READ surviving a STREAM-only revoke is action isolation, not a positive control after READ-domain revoke | `S13:55–57`, `S2:50–54` |
| The installed successor writer renews the same action/domain; it cannot create a new authority scope | `S13:30–31` |
| The 23 Oct specimen proved STREAM-only revoke with READ still 200; it did not prove a second domain, Manager financial datasets or the UI | `S14:48`, `S1:82–89` |

**Existing valid control the sources name: NONE.** `S13:45–46` ("no supplied eligible independent SAME-actor native control"); `S5:351` ("No genuinely independent authorized domain is identified in installed config"). `S12`/`S19` do not name one either. I found no document that names an already-commissioned second binding.

**Smallest candidate the sources describe (PROPOSED / NOT_AUTHORIZED, `S13:58–66`).** Keep the Bobby user/workspace/TS mapping; add one independently sealed native domain, READ-only, for example the existing supported Sandbox profile; with an explicit two-binding typed ceiling and an independent source receipt. The existing user approval covers Paper, not Sandbox. Guards must not simply be loosened; a reviewed additive commissioning path is needed (`core-owner-commissioning.ts:45–57`, `manager-domain-successor.ts:67–114`).

**Exact Edge input needed (OWNER_INPUT).**

| Field | Unit / form | Returned by (through Edge) |
| --- | --- | --- |
| Named domain (environment/profile/binding id) distinct from `PAPER_BINANCE_USDM` | string ids | Edge, from PM/TS native authority |
| Domain catalogue, profile, field-policy hashes for that domain | sha256 | Edge / source owner |
| Seals and current source fingerprint | sha256 | Edge / source owner |
| Human <-> TS mapping and workspace for that domain | ids | PM/TS |
| Acceptance (READ-only), Core grant revision and expiry | revision, UTC | Core (official writer) after Edge returns the above |
| Native physical terminal and Core ACK for the control read | receipts | Edge + Core |
| Scope decision: authorize that domain (Sandbox READ-only, or another named one) or record NOT_RUN | one decision | Bobby, as owner of added scope (`S13:68`) |

**Prohibitions.** Nothing may be minted or copied: no new principal or domain, no copying of stable grants, no fixture scope, no denied/fixture/non-native substitute, no relaxing of the single-Paper guard (`S8:106–110`, `S13:73–74`, `S6:83`). Do not count a second URL/session or READ-after-STREAM-revoke as a second domain.

**Budget effect when it exists.** A genuine independent READ costs one more retained obligation (`S9:37`); it must be counted if not already in the schedule (`S13:24–25`).

---

## 8. RECOMMENDATION and exact remaining decisions

### 8.1 Recommendation

1. Treat the M5/M7/M2c numbers in 2.1–2.3 as a **shape to ACCEPT / CHANGE / REJECT row by row**, not as production policy. They are a workload shape, not a capacity claim.
2. Take no numeric bound for the 14 groups from Claude. Use measured B0 plus rule `R-C` (RECOMMENDED) once Edge has returned plan and baselines.
3. Record the independent control as **NOT_RUN until Edge names a real domain**; do not wait for it and do not substitute.
4. Do not start any window until all rows in 8.2 for that item are present; an expiring slot reserved early is wasted (`S3:55–56`).
5. Keep the native08 source off all load (section 3.3).

### 8.2 Ordered decisions (owner, concrete input/action)

| Order | Item | Owner who returns it (via Edge) | Concrete input / action | Deciding party |
| --- | --- | --- | --- | --- |
| 1 | **M5 numeric inputs** | Edge (EPG10-01) with TS and DL | (a) Pinned `coexistence-plan.v1` JSON + sha256 (target, images, config, hardware, counterbalanced stage orders, `minimum_duration_ms`); (b) all 14 groups as scalar rows: `bound_kind`, `value`, `unit`, B0 baseline, population, reserve/actions, `approval_ref`, revision, validity; (c) `max_rps` (N-11) and `max_tabs` rule (N-12); (d) collector/query/clock adapters; (e) accepted real dataset/resource ID map and exclusions; (f) a future quiet window authorization + sha256; (g) stop/restore permission; (h) temporary session file path (0600). | Approver of record for the scalar budgets: Bobby (`S12:168`, `S15` §9.3). Action: one ACCEPT/CHANGE/REJECT per N-row and per group row. |
| 2 | **M7 / P184** | Edge | Apparatus + gate revision, expected unique feed/venue/kind census, run/time pins, producer result schema or adapter for `portal.elp2-10.g2-population-input.v1`, apparatus duration and pacing, separate window authorization. Original thresholds unchanged. | Edge (window); Bobby only for any change to scope |
| 3 | **M2c counters** | Edge (+ Codex for BFF) | Source-call counter export by phase window (format for G-2); exact current session/scope for the real session(s) (one or two); confirm STREAM publication/notices. Claude supplies `phase_windows_ms`. | Edge |
| 4 | **Calibration population** | Edge coordinating TS/PM/DL; independent approver of the Score config | Comparable independent population with units/basis/window, coverage, **fit/evaluation split pinned before fitting**; anchors L/U per metric family and horizon (7/30/90 d), `delta_bps`, block manifest, observation grid, maturity/math/freshness thresholds, cash/FX/cost method, hash + independent approval (`S16 §7`). Include a minimum number of independent anchors only if the Score spec states one: NOT_FOUND in the files I read. | Independent approver; not the fitter |
| 5 | **Independent control domain** | Edge -> PM/TS native authority | Section 7 table. | Bobby decides scope; else record NOT_RUN |
| 6 | **Claude (own part)** | Claude | When items 1 and 2 arrive: re-parameterize `current-manager-workload` with real IDs; run the non-executing dry-run; fresh M0; no run without the window. Fix the `max_tabs` ambiguity (N-12) by reading the driver. | Claude, nothing to wait for before the dry-run |

### 8.3 What does NOT block other work

This packet and its five pending items **do not block**: fixture lanes (L0–L3 fixtures), the dataset/qualified-source consumers one family at a time, Paper-history work, the Accounts equity/cache fixes, the conformance/double repairs, the pending-control preview in the fixture lab, UI/visual baselines, additive catalogue backend, or the native08 acceptance operated by Codex/Edge (`S1:22–28, 61–89`). Fixture numbers stay labelled FIXTURE_ONLY and never become configuration. No part of M5/M7/M2c/calibration/control can be claimed in the UI until its receipt exists; until then the UI keeps typed absence and its fixture banner.

---

## 9. Source index

| Id | File | Lines / section used |
| --- | --- | --- |
| S1 | `ELP2-10/CODEX_TO_CLAUDE_APPROVED_CLOSEOUT_2026-10-23.md` | §4 lines 90–115 (task, 107–115); §1 lines 22–28; §2 lines 45–46; §3 lines 74–77, 82–89 |
| S2 | `ELP2-10/CORE009_AFTER_REAL_READ_OWNER_ACTIONS_2026-10-22.md` | §1 lines 15–54 (control 50–54, caps 28–42); §4 lines 80–102 (hashes 84–87) |
| S3 | `ELP2-10/CORE_PARALLEL_OWNER_INPUT_REQUEST_2026-10-21.md` | §3 lines 52–79 (M5 58–62, M7 63–65, M2c 66–69, calibration 70–73) |
| S4 | `ELP2-10/EDGE_TO_CORE_08_MANAGER_AND_G2_READINESS_2026-10-22.md` | §3 lines 81–102 (plan hash line 85; M5/M7 hashes 89–90) |
| S5 | `ELP2-10/CORE_TO_EDGE_TS_PM_CONSOLIDATED_RETURN_2026-10-22.md` | lines 330–358 (CORE-06, control row 351); 361–398 (CORE-07); 673–694; 1003–1017 |
| S6 | `ELP2-10/EDGE_TO_CORE_TS_PM_CONSOLIDATED_REQUEST_2026-10-22.md` | §1 lines 10–16; CORE-06/07 rows lines 82–83; mode invariant 85–90 |
| S7 | `ELP2-10/EDGE_TO_CORE_08_STREAM_WINDOW_PROPOSAL_2026-10-22.md` | §3 lines 73–115; §6 lines 170–184 |
| S8 | `ELP2-10/CORE009_FINITE_08_BOUNDS_PROPOSAL_2026-10-21.md` | §1–2 lines 8–70 (formula 17; table 26–37; B244 49–56; 58–62; 64–70); §4 lines 96–120 (control 103–110; rollback 114–120) |
| S9 | `ELP2-10/CORE009_COUNTED_WINDOW_AND_CAPACITY_RETURN_2026-10-21.md` | §2 lines 17–79 (admission table 29–43; formula 70); §5 lines 141–153 (stage.mjs 145, m7 hash-then-parse 147–153) |
| S10 | `ELP2-10/measurements/M-5-2026-10-21.json`, `M-7-2026-10-21.json`, `M-2c-2026-10-21.json` | `status`, `lane`, `evidence_class`, `workload`, `results.missing/unmet/ready`, `limitations` |
| S11 | `ELP2-10/measurements/WINDOW_REQUESTS_2026-10-21.md` | lines 3–76 (conditions 9–16; M5 18–32; M7 34–42; M2c 44–54; M-3c/M-4b/M-6c 56–66; template 68–76) |
| S12 | `ELP2-10/authority-continuation.md` | lines 160–176 (gates table 164–171); 255–264 |
| S13 | `ELP2-10/CORE009_08_FULL_SUITE_DISPOSITION_2026-10-22.md` | lines 8–26 (capacity); 28–41; 43–74 (control gap, proposal) |
| S14 | `ELP2-10/CORE_TO_EDGE_08_CORE_FIRST_ACTUAL_RETURN_2026-10-23.md` | §1 lines 21–30; §2 lines 36–52; §3 lines 55–70 (retained 21, initial 16) |
| S15 | `upgrade/execution_loop/EXECUTION_PORTAL_EDGE_UPGRADE_GUIDE_v1.2_VI.md` | §9.3 lines 755–790 (groups 774–787); §6.6 line 558; §9.4 |
| S16 | `evidence/BE-CLAUDE-2026-10-20/ELP2-10_BUDGET_CALIBRATION_PROPOSAL_2026-10-20.md` | §1 rules R-A..R-E; §3 B-12; §5 PL-1; §6 (14 groups, last paragraph); §7 (calibration) |
| S17 | `scripts/execution-v2/qualification-readiness.mjs` | lines 17–19 (`BUDGET_GROUPS`); 29–37 (bound kinds, composite policies) |
| S18 | `upgrade/execution_loop/AGENT_WORKING_RULES.md` (this worktree) | §10.13 lines 697–722 |
| S19 | `ELP2-10/CLAUDE_F8_REVIEW_DIGEST_2026-10-22.md` (this worktree) | appended "Current dispositions, 2026-10-23" table, rows 1, 3 |
| S20 | `evidence/UXM-07/SIMULATED_DATA_REGISTER_2026-10-22.md` (this worktree) | lines 9–12, 33 (fixture metrics are `FIXTURE_LAB`; fallback caps) — context only, no number used |
| S21 | `evidence/UXM-07/PAPER_HISTORY_QUALIFICATION_2026-10-23.md` (this worktree) | scope statement, §1 findings 1–4 — context only: synthetic history sizes are not HTTP/browser/capacity measurements |
| S22 | `scripts/measure/workloads/read-sets.v1.json` | hash `83809ec2…fd704f` via `S5:367` and `S10-M5 results.ready` |

Paths: `S1–S14` are in `/home/bobby/portal-research/upgrade/execution_loop/evidence/ELP2-10/` (read-only; not written). `S15, S17` read at `/home/bobby/portal-research`. `S16` under `…/evidence/BE-CLAUDE-2026-10-20/`.

### 9.1 NOT_FOUND list

| Item | Where I looked |
| --- | --- |
| Published hash for `M-2c-2026-10-21.json` | grep of `upgrade/execution_loop` for `2255c340` returned nothing |
| Edge plan `measurement-plan.json` (mapping of composite `bound_kind` to each group) | `find / -name measurement-plan.json -path '*EPG10-01*'` empty on this host |
| Driver rule for `max_tabs` versus B2's 28 virtual tabs | `S11`, `S5`, `S9`; not stated |
| Derivation of the B2 peak 18 req/s | `S11:25` states it; no formula |
| Format of Edge's source-call export (gap G-2) | `S11`, `S3` |
| Post-specimen installed retained cap (32 vs 288) | `S14` §3 |
| Any already-commissioned independent economic domain | `S13`, `S5`, `S8`, `S12`, `S19` |
| Minimum count of independent calibration anchors | `S16 §7`; Score spec itself not opened |
| Reload read count for M2c | `S11`, `S10-M2c` |
