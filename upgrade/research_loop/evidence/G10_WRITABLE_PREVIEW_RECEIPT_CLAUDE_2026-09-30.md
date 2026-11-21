# G10 — writable-preview receipts on fresh runs (Claude, 2026-09-30)

Unified §13.4.1 G10. Bobby approved option A on 2026-09-30: seed new runs on the isolated preview so the
"closed in code" packages can be proven on real data. This is that receipt.

## Stack

| Fact | Value |
|---|---|
| Built from | `d3d99f26` (docs/research-loop-plan HEAD) — first build to carry E16-R1 (068), E10-O3 (069), RF-04 |
| Running images | control-api `59530e6fcea0`, portal-web `fc78f52c5485` — each **equals its built tag** |
| Migrations | 066 → 067 → 068 → 069, applied in order (checked in `pgmigrations`) |
| Seeded | P04 `rrun_464bf9c3…` = **R-P04-018** and WFO `rrun_17f76212…` = **R-WFO-017**, both COMPLETED/READY via `scripts/research-preview/seed-run.mjs` |
| Created through the UI | `rrun_6d431f0d…` = **R-P04-019**, a clone of R-P04-018 (S02, below) |
| Runs on the preview | 33 → **36** |
| Previous seed records | kept as `seeded-run.json.pre-2026-09-30` and `seeded-wfo-run.json.pre-2026-09-30` |

## Receipts

| Package | What was proven on real data | Result |
|---|---|---|
| **E14** 9.8 + 9.7 | Both new reports carry a **seventh headline key `NET_RETURN`** (P04 −0.00154…, WFO −0.00367…); the P04 identity `optimization` row carries `qualifier: {state: DECLARED_NOT_EXECUTED, reason_code: P04_FIXED_PROFILE_RUN_DID_NOT_EXECUTE_THE_DECLARED_OPTIMIZER}`; the WFO row carries `qualifier: null` (it did search). On screen, S09 (R-P04-018) shows **NET RETURN −0.15%** in red and "mode_1_decay × global — declared, not executed" with the code | **PASS** — closes what the 2026-09-30 audit found only closed in code |
| **E16-R1** | P04 replay read: `candle_overview.state = AVAILABLE`, `sampling OHLC_BUCKET_V1`, 744 source bars → **47 buckets of 16 bars**, envelope 57758.6 – 66924.1. On screen, S08 (R-P04-018) draws the **price overview strip** with the caption "744 bars in 47 candles of 16 bars — each high/low is the true extreme of its bars", beside the E2c IS/OOS/HOLDOUT band. The WFO run correctly reads `NOT_PUBLISHED / P13_EVIDENCE_NOT_READABLE_FOR_RETAINED_CANDLE_OVERVIEW` on the hub lane (its candles are on the retained lane) | **PASS** |
| **S02 create** (E4-O1, F5) | Driven in a real browser: `runs/new?from=R-P04-018` → clone state `available` → Review → **Run preflight → `POST /api/v1/research/preflights` 201** (token issued, gates PASS) → **Create run enabled → `POST /api/v1/research/runs` 202** → S03 opens on the new run **R-P04-019**, which then ran to COMPLETED | **PASS** — first real S02 write ever |
| **E13** lineage parent | Lineage read: the UI clone `ratt_6d431f0d…` has **`parent_state: RETURNED`, parent `ratt_464bf9c3…`** — the first nested attempt among 36 (35 ROOT). S10 shows the node indented, "clone of rrun_464bf9c3…", "compare with parent →", diff vs parent "No allow-listed key changed from the parent" (true: nothing was changed) | **PASS** — plus one defect fixed (below) |
| **E10** one status | All **36** runs: Run Library status == Run Progress `current.effective_status` (17 COMPLETED/COMPLETED, 19 FAILED/FAILED), **0 mismatches**; no run is non-terminal | **PASS** |
| **E10-O1/O3** convergence | Needs a run that is actually stranded (lost terminal write, or a `RETRY_WAIT` past its deadline). Seeded runs complete normally, so none exists. Producing one means deliberately breaking a run (stopping the worker mid-run, or editing job rows) | **NOT_RUN — needs Bobby's go for fault injection** |
| **S14 write** | Delegated to a parallel agent; its own record: `P10/S14_REAL_WRITE_RECEIPT_CLAUDE_2026-09-30.md` | see that record |

## Two defects only real data could show — both fixed

**1. S02 swallowed every refusal that names no field.** The first real preflight from the browser came back
`403 RESEARCH_PREFLIGHT_INVALID "Request origin is not allowed."` (the harness had opened the page on
`localhost:8095`; the server's same-origin guard `originAllowed` accepts only `PORTAL_PUBLIC_ORIGIN` — correct
behaviour). The screen showed **nothing**: the button returned to "Run preflight", the panel still said "none
read yet". Cause: `refusalStep = preflightRefusal?.fieldPath ? … : null` — only a refusal carrying a
`field_path` had anywhere to render, so a 403, 401, 503 or a transport failure was silent. Fix
(`NewRun.tsx`): every refusal renders; one with no field belongs to the Review step; a 403/404 reads the one
F-04 sentence (`REFUSAL_COPY.denied`) and never echoes the server's prose. Tests: 3 cases (403, 503,
transport) + the F-04 case in `w4.test.tsx`.

The harness then sent writes with the public origin through `route.fetch` (Chromium does not let
`route.continue` override `Origin`). The server check was not relaxed; this is what a browser on the real host
sends. **Note:** the Research real-API lane has never made a real write from the browser — every write in it is
stubbed — which is why this silence was never seen before.

**2. S10 drew a clone under the wrong parent.** `treeOrder` kept the server's flat chronological order and only
assigned depth, so a child landed under whichever node preceded it in time. The first real clone
(`ratt_6d431f0d…`, parent `ratt_464bf9c3…`) was drawn indented beneath `ratt_17f76212…`, created in between —
the rail named the wrong parent. Fixtures never showed it because every fixture parent precedes its child.
Fix (`LineageDetail.tsx`): depth-first — each child follows its parent's subtree; roots, and siblings under one
parent, keep the server's order; every attempt is placed exactly once. `S10-U39` had pinned the old behaviour and
is rewritten to the new rule. Verified on the real preview through Vite: the clone now sits directly under
`ratt_464bf9c3…`.

## Tests

| Gate | Result |
|---|---|
| `w4.test.tsx` + `newRun.test.tsx` + `preflight.test.tsx` | **124 passed** |
| `lineageDetail.test.tsx` + `lineageDetail.w6b.test.tsx` | **67 passed** |
| `tsc -b --noEmit` | exit 0 |
| Pre-commit hook | on the commit that carries this record |

## Screenshots (SHA-256, first 16 hex; not committed)

```
p8-1440.png   S08 R-P04-018, price overview   e15c3d482c8bd50d
p9-1440.png   S09 R-P04-018, NET RETURN        e530e5bf7625b10b
p1-1440.png   S01 after seeding                48ed07be24558c61
p3-1440.png   S03 R-P04-018                    d4d3e38536360fb7
s02-1-cloned.png   S02 ?from= clone            f6f9eb485f852a08
pf-403.png         S02 silent 403 (before fix)  53d8af59f1a64370
s02-2-preflight.png                              b1851de50d7dafa9
s02-3-created.png  S03 on R-P04-019            18c5e410c164d1d5
s10-clone.png        clone under wrong parent  44369feab5a448dd
s10-clone-fixed.png  clone under its parent    eee2314dff60061f
```

## Left open

1. **E10-O1/O3 convergence** — needs a deliberately stranded run (Bobby's go).
2. The preview serves the bundle built at `d3d99f26`; the two fixes above are in the tree, not yet on the
   preview. They show there after the next rebuild (with the parallel G1–G8 work).
3. **S08 on a cold deep link prints the short id**, not the run label (`rrun_464bf9c3`, not `R-P04-018`); S03
   cold shows the label. Handed to the G3 agent (D1-O1 extended to S05–S08).
