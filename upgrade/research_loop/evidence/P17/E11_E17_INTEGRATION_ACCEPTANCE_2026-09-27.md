# E11–E17 — current-source integration acceptance

Date: 2026-09-27 · branch: `docs/research-loop-plan` · Codex.
Verdict: **ISOLATED_REAL_API_AND_CONSUMER_ACCEPTED** within the approved
current-source scope and E16-R1 amendment. This is not a deployment, signed
release, pixel-parity approval, full Research/P24 acceptance or Production
activation. Finalization requires the mandatory, unbypassed merge commit gate.

## Authority, preservation and scope

This additive integration reconciles local `1ac1c628` with incoming Claude
`a00df203` (merge base `2f4f9e978d442918e1aaa989bbec06b1040c7052`).
Both histories and Claude's incoming frontend, tests and evidence are retained.
Eight conflicting files were reconciled semantically, not replaced wholesale.
Bobby explicitly approved Codex logic/data-binding changes, **not redesign**.
No CSS, design token, color, font, layout or visual baseline is changed by
Codex's consumer amendments. Incoming Claude composition remains his work.

Only the owned loopback `portal-research-e17` cell on port 8098 was used.
Shared preview 8095, dev/main, stable, AWS-HK and Trading System were untouched.
No push, secret publication, direct source DB access or history deletion occurred.

## Requirement-to-proof ledger

| Item | Delivered and independently checked | Remaining source limit, not invented |
|---|---|---|
| E11 | Library retained WFO metrics/sparkline; S04 exact FIXED IS curve, engine rolling Sharpe63, six behaviour slots and distinct CHILD_TAPE total count are consumed from the named generated DTOs. Actual values, scopes and reasons are asserted in both browser widths. | Four audited-trade behaviours and selected-candidate WFO IS remain typed absent. Old seals cannot acquire new analytics by reading them. |
| E12 | Immutable descriptor revision 3 and mounted-screen availability retained; real Journey consumer passes at both widths. Local migration namespace is append-only, not a rewritten historical ledger. | No new activation authority is inferred from an AVAILABLE descriptor. |
| E13 | Root → clone → reproduction, all completed, immutable exact parents, 13 input pins, zero reproduction diff, 409 changed pins, 404 missing parent and idempotent replay; S10 reads the persisted depth 0/1/2 tree. | Runtime image/dependency equivalence is NOT_PUBLISHED; immutable-input reproduction is not a bitwise environment promise. |
| E14 | WFO stitch/gap, existing candidate-drawdown/constraint authority, FIXED DECLARED_NOT_EXECUTED and scoped Report net OOS retained; Split/Search/Report real consumers pass. | Candidate/feasibility values exist only when the engine actually supplies their definition and fact. |
| E15 | Seven artifact slots, per-profile typed absences, backend-owned journal/order/cursors retained; real Progress consumer passes. | Missing source fold-segment wall-clock facts remain absent. |
| E16 | New P04 seals canonical bounded OOS OHLC, exact provenance and null fill markers; legacy 12-bucket shape remains readable. Parent validation, route-aware seek/cursor and Reveal causal hiding are checked. | E16-R1 permits an overview, not per-bar replay/backfill. Transition counts are not fills. Older runs without retained tape stay typed absent. |
| E17 | Exact imported/DRAFT admission, actual enforced AppArmor child and three completed real HMD runs retained; imported labels/hash authority and Freeze engine pin are bound by the browser, not guessed. | Production flags remain dark. This test does not enable arbitrary imported code or a Production rollout. |

Earlier source/backend packets are preserved with a supersession link:
[E11/E14](../P13/E11_E14_SOURCE_TIME_ANALYTICS_ACCEPTANCE_2026-09-27.md),
[E13](../P19/E13_REPRODUCTION_REAL_API_ACCEPTANCE_2026-09-27.md),
[E17](../P10/E17_IMPORTED_DRAFT_EXECUTION_BACKEND_RECEIPT_2026-09-27.md),
[E16-R1](./E16R1_P04_CANDLE_OVERVIEW_CLAUDE_2026-09-27.md).
Their earlier CONSUMER_PENDING statements describe those checkpoints, not
this later integration; original machine receipts are not rewritten.

## Canonical producer, parent and retained storage

The confined child chooses at most 48/24/12/8 true-extrema buckets inside its
24-KiB receipt budget; the parent still enforces its 28-KiB ingress limit.
Strict parent validation distinguishes canonical 48-bucket data from legacy
12-bucket data, rejects bool-as-int/invalid decimals/chronology/geometry/OHLC
and envelope mismatches, and accepts the producer's typed budget absence.
Malformed stored overview degrades that panel, not the whole Evidence Hub.
The compatibility alias does not turn legacy transition counts into fills.

Incoming migrations 068/069 become **075/076** because the owned baseline had
already applied 070–074. Both new migrations were applied forward normally;
no prior ledger row, evidence or check-order function was edited. Historical
Claude receipts naming 068/069 remain intact. The comment in 075 about a
not-yet-applied incoming 068 is scoped to this owned integration cell, not a
claim about every preview. Generated OpenAPI names separate canonical and
legacy shapes instead of silently colliding under one schema name.

## New real P04 proof and independent HMD oracle

Actual completed run: `rrun_3a911fa35a250022def4d9d1e567d1c5`.
Pinned QuantBT 1.1.1; approved read-only HMD reader 0.1.0rc3;
`crypto-binance-1m`, BTCUSDT 1h; IS June 1–8, OOS June 8–15,
holdout June 15–17 2026 UTC, half-open and excluded from compute.
The run traversed public preflight/admission, confined child, fenced retention
and the named preview API, not a direct engine experiment.

The API publishes **168 OOS bars summarized into 42 canonical buckets**.
`e16-source-oracle.py` independently read the same approved HMD scope through
the portal-api container's existing read-only mount: every bucket open/high/
low/close, source-time extrema, global extrema and contiguous source coverage
matched; fill markers are null. No bars or credentials were printed/committed.
Control API restart reread the same run and projections without another run.
Cross-run cursor reuse returns 400; legacy 12-bucket adaptation does not backfill.

The earlier failed run `rrun_37e7c6ec3c8e35b0c0bb6e26334789ef` remains FAILED:
its old parent admitted only 12 buckets and rejected the new canonical receipt.
The source producer and strict parent now agree. No terminal state was forced.

Private files remain 0600 under
`/home/bobby/.local/state/portal-research-e17/20260927/`:

| File | SHA-256 | Outcome |
|---|---|---|
| `e16-api-0574fc88-8d78-4ecf-8d8a-e770678b1b5a.json` | `3c420e6d3ee9704eb79b56a96dadd14e08b8b11eac4d9f3a1e593c8f06c90fc4` | Original FAILED parent rejection, preserved |
| `e16-api-9b69cb4e-156d-4b8b-afb6-be522f897d3c.json` | `d9319cc35587feeba26829a797b18602910da68b5c15847664d456f2e274bbe7` | Real API PASS |
| `e16-api-d703110e-1fd7-4c43-a089-0d5df600658c.json` | `9dc95963baebb04603c1041c748e652eca93bcb63d166fe7992a9f634f19d348` | Restart/read parity PASS |
| `e11-e17-browser-08055880-3299-47ce-a943-fd3b690cd985.json` | `f442244cc91450c2893bcce71d65d0a217645c82c359da2fb50da3ca471d49b4` | Final 30/30 real-API browser cells PASS |

Actual qualifying image IDs from Docker inspect, not an old build manifest:

- Portal-api/worker: `sha256:4cd1f1581653f2b649c11dc72d04ea58ceed45d0f3517c2737ee97971a3f98aa`.
- Control API: `sha256:202ad272bd40e0e824ad13c3a5fef21f12f48f0d63152639e87fbe3f770ae23f`.
- Worker profile: `portal-research-child`; host readback: `(enforce)`.

## Consumer and browser acceptance, with honest limits

The browser uses built product assets and real same-origin API reads, **no API
double**. The isolated static-asset harness is not a deployed gateway claim.
It blocks external origin and non-read requests. Fifteen surfaces each pass at
1280 and 660 px: Journey, Library, FIXED/WFO Evidence, Split, Search, Report,
Progress, P04/legacy replay, WFO Reveal, imported Evidence, P04/imported Freeze
and persisted Lineage. No console/page errors, unexpected 401/403/5xx or
horizontal overflow. A same-index-SHA resume reuses 12 successful cells rather
than rerunning the engine or discarding previous evidence. Failed harness
receipts remain archived; they are not counted as acceptance.

Final built index SHA-256:
`6121b558afd09f13715484e8b3d0a201534dc1a0e55c8e305b5f7a38f4e87d00`.
Four S04/S08 HiFi HTML reference renders were also captured at both widths.
They are **REFERENCE_RENDER_ONLY_NOT_PIXEL_PARITY**; no baseline was updated.
The incoming S12/Atlas composition is preserved, not certified by this slice.

Codex's approved binding changes:

- S04 reads retained analytics once from its authoritative lane: actual IS,
  inline rolling points, six behaviour values/reasons and separately scoped
  child-tape count. It never substitutes a WFO prefix for selected-candidate IS.
- Reveal withholds a bucket until its **last** ordinal is reached; scale and
  extrema caption use only completed visible buckets, including WFO overview.
- Imported source+adapter enum labels and source-code hash authority stay
  distinct from the protected P04 adapter contract; engine pin uses its typed
  published fact/reason. Missing historical facts remain missing.
- RESEARCH_RUN_REPRODUCTION_CONFLICT is terminal and does not auto-retry a new
  intent. The actual reproduction graph is reached by its existing attempt
  deep-link, without changing Claude's PROBE visibility/design.

## Gates and finalization

- Focused frontend Evidence/charts/replay: **216/216 PASS**.
- Focused Freeze/New Run/lineage: **91/91 PASS**; final Freeze rerun **14/14**.
- Focused Python canonical producer/supervisor: **42/42 PASS**.
- Contracts: **17 files, 195/195 PASS**; snapshot **219 files MATCH**.
- Final Control API build and frontend typecheck/production build: PASS.
- Mandatory pre-commit runs full workspace verification and disposable
  PostgreSQL tests once for this coherent merge. These focused counts do not
  replace that gate; the merge is finalized only when it succeeds without bypass.

## Scoped cleanup and next owner

After all real receipts, exact Compose project `portal-research-e17` was
stopped/removed **without `-v`**. Zero project containers remain; only its
three named artifact/NATS/PostgreSQL volumes are retained alongside receipts
and qualified images. No shared preview, business data or global build cache
was deleted. Disposable PostgreSQL suites clean their own resources by trap.
Post-cleanup host available RAM: **22,639 MiB**; root free: **264 GiB**.

Claude's broader shared-preview 54-cell lane, print/visual approval and any
other Unified F items are not silently closed by this 30-cell owned proof.
P24/Production release remains its own gate. No source upgrade is required
to use the facts delivered here, and no further approval is needed to bind
these already approved named facts. A future source expansion must remain
versioned and typed, not replace historical evidence or this authority scope.
