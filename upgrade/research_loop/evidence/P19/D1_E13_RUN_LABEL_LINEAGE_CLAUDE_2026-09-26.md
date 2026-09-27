# D1 + E13 — the short run label, and the lineage writer that never wrote a parent

Claude · 2026-09-26 · branch `feat/research-d1-e13-run-label-lineage`, based on
`origin/docs/research-loop-plan@1dec9d33`.

Closes Unified plan §13.4.1 **D1** (`rl-open-ledger`) and package **E13**.
Audit rows answered: `X1`, `X2`, `X-1` (shell topbar), `10-3` (run label on
Screen 10), `10-4` (the flat tree), `11-4` and `13-2` in part — see
[What is still open](#what-is-still-open).

No migration was taken. 067, 068 and 069 are allocated to other agents and 070
is Codex's; neither half of this work needed one, and the reasons are recorded
below rather than assumed.

---

## 1. D1 — how the label is derived, and why it is stable

### The rule

`display_label` = `R-<KIND>-<NNN>`, where

* **`KIND`** is the run's **execution profile**, mapped through a frozen table:
  `p10.delta-signal-notional-wfo.v1` → `WFO`, `p04.fixed-qualification.v1` →
  `P04`. A profile the table does not know yields **no label at all**, not a
  token invented from the id.
* **`NNN`** is the run's position among the logical runs of that same kind in
  the same workspace, ordered by `created_at` with `run_id` as the tiebreak,
  zero-padded to three digits.

One module owns both halves:
`apps/control-api/src/research/run-display-label.ts` — `runDisplayLabel()` for
the formatting and `runDisplayOrdinalSql(runAlias, producerAlias)` for the
scalar subquery. Every read that publishes the label calls that same function,
so three copies of the SQL cannot drift apart. A test asserts the two call
sites are the identical string modulo aliases.

### Why no migration

The ordinal is a `count(*)` over `research.runs` joined to
`research.run_producers`, restricted to `relationship_kind = 'PRIMARY'` and to
peers whose `(created_at, run_id)` is not after this run's. Nothing is stored.

```sql
CASE WHEN <run>.relationship_kind = 'PRIMARY' THEN (
  SELECT count(*)
    FROM research.runs peer_run
    JOIN research.run_producers peer_producer
      ON peer_producer.workspace_id = peer_run.workspace_id
     AND peer_producer.run_id = peer_run.run_id
   WHERE peer_run.workspace_id = <run>.workspace_id
     AND peer_run.relationship_kind = 'PRIMARY'
     AND peer_producer.execution_profile_id = <producer>.execution_profile_id
     AND (peer_run.created_at, peer_run.run_id) <= (<run>.created_at, <run>.run_id)
) END
```

### Why it is stable

* `research.runs` is append-only on this schema — there is no delete path — and
  `created_at` is written once by the producer insert. A run accepted later
  gets a strictly later `(created_at, run_id)`, so it takes the next number and
  renumbers nothing already issued.
* `run_id` breaks a same-microsecond tie deterministically, so two readers
  computing the count in different transactions get the same answer.
* The partition key is the **stored** `execution_profile_id` column
  (`NOT NULL DEFAULT 'p04.fixed-qualification.v1'`, CHECK-constrained to two
  values by migration 062), not the optimization mode. The mode lives in the
  preflight manifest's JSONB and is absent for a run whose manifest was not
  retained — a label that disappeared when a manifest aged out would be worse
  than no label.

**Two things would move a number, and neither happens here:** deleting a run,
or inserting one with a back-dated `created_at`. If either becomes possible the
ordinal must be stored, and this is the note that says so.

**Only logical runs are numbered.** A worker child, an audit child, a
reproduction child and a retired 1.0.8 row all get `null`. Numbering them would
make the sequence skip for every reader.

### Deviation from the brief, recorded

The brief's example was `R-P04-07` (two digits). The HiFi pads to **three** on
all five kinds it prints — `R-WFO-118`, `R-TT-002`, `R-SBB-021`, `R-FULL-004`,
`R-CT-201` — so three digits is what shipped. `R-WFO-118` is identical either
way; only short ordinals differ.

The brief says "ordinal within its workspace". The HiFi's own data settles the
ambiguity: `R-TT-002` and `R-FULL-004` sit in the same Run Library list as
`R-WFO-118`, which is only possible if each kind counts separately. Shipped
per-(workspace, kind).

### Where the server publishes it

| Read | Phase | Field | Screens it reaches |
|---|---|---|---|
| `GET /api/v1/quantbt/runs` | P12/P13 | `items[].display_label` | S01, and the shared registry for the whole session |
| `GET /api/v1/research/runs/{id}/progress` | P11 | `run.display_label` | S03, and S05–S08 through `useRunIdentity` |
| `GET /api/v1/quantbt/runs/{id}/evidence` | P13 | `core.run_identity.display_label` | S04 and its stage cursor |
| `GET /api/v1/research/alphas/{id}/lineage` | P19 | `attempts[].primary_run.display_label` | S10 (audit 10-3) |

The lineage read costs nothing extra: `lineage.service.ts` already maps each
attempt's primary run through `ResearchRunLibraryService.mapRow` for `rc`, so
Screen 10 and Screen 01 read the label from the same row and cannot disagree.

### The P11 contract note, amended deliberately

`ProgressRunIdentity` carried "**No display id is minted: run_id is the
identity**" (CG-P11-03). That sentence now reads "No display id is minted **as
an identity**: run_id is the identity. `display_label` (D1) is a derived
presentation label, never an identity and never accepted as input." The rule it
protects is intact — no request may carry the label, nothing is looked up,
filtered or routed by it — and audit row X2 names P10/P11 as the owner of the
ask.

### The browser side, and why no screen was edited

Other agents are editing the screen bodies, so the change is in shared code
only:

* **`apps/portal/frontend/src/research/runLabels.ts`** (new) — a module-level
  registry `runId → label | null`, read through `useSyncExternalStore`. Module
  level rather than a React context because `ShortId` renders deep inside a
  dozen screens that must not be edited to thread a provider, and because unit
  tests mount those screens with no shell around them. `forgetRunLabels()` is
  the test seam.
* **`ShortId.tsx`** — renders the label when one is known for that id, and
  today's short id when it is not. The full id stays in `title`, in
  `data-full-id`, in the accessible name, and is what a click copies. A new
  `data-display-label` attribute states which happened. The registry is keyed by
  run id, so a digest or an alpha version can never be relabelled — asserted,
  not assumed.
* **Four clients** (`runLibraryClient`, `progressClient`, `evidenceClient`,
  `lineageClient`) call `rememberRunLabel(s)` on the read they already make. An
  absent field is remembered as **no label**, never as a number.
* **`apps/portal/frontend/src/app/researchRunCrumb.ts`** (new) +
  `app/TopBar.tsx` — the shell extends `Research / QuantBT Backtest` to
  `… / R-WFO-118 / Stage 1 · Split` on a run-scoped address (X1, X-1). The run
  crumb links to that run's Evidence Flow. A screen may still name the tail
  through the presentation context; the shell supplies it only when the screen
  named none, because only Screen 04 knows which stage its hash cursor holds.

**The one Research-screen line touched:** `EvidenceFlow.tsx:4002-4003` used to
put its own 13-character slice of the run id into the topbar
(`crumbRun = runId.slice(0, 13) + "…"`). With the shell writing the run, that
line printed it twice, so the screen now names only its stage. Two lines
became one; no header JSX was touched.

---

## 2. E13 — the lineage writer

### What was actually wrong

The column was never missing. `research.attempts.parent_attempt_id text NULL`
has existed since the foundation migration
(`1723680000037_research-schema-foundation.sql:98`), with a self-FK, a
self-reference CHECK and a recursive cycle-prevention trigger. The reader is
complete: `lineage.service.ts:515-518` derives `parent_state` three ways and
`semantic_diff` follows it; `LineageDetail.tsx` computes depth by walking
`parent_attempt_id` and has a diff panel waiting.

**Nothing wrote it for a clone.** The only production path that ever set a
parent was the Screen-07 what-if fork (`runs/new?from=<run>&fork=<cell>`), and
the wire contract made that the *only* declarable relation: `lineage.relation`
was the literal `"SIBLING_OF"` and `what_if_cell_id` was mandatory inside it.
The plain `?from=<run>` copy — the one Screens 03, 07 and **Screen 10's own
"clone →" button** (`LineageDetail.tsx:1763`) offer — sent no `lineage` at all.
`NewRunRoute.tsx` said so in a comment: "the original run is never referenced
by the new submission." So every cloned attempt was inserted with
`parent_attempt_id` NULL. That is why 33 of 33 attempts on the preview read
`parent_state: ROOT` and "diff vs parent" was always "Root attempt".

(`repository.ts:2194 createOrReplayAttempt` does accept a parent, but it has
zero callers in `src/` — only the P03/P05/P06/P07 schema specs.)

### The fix

`lineage` became a discriminated union on `relation`:

* `SIBLING_OF` — unchanged: names the what-if cell, must bind the same
  AlphaVersion as its parent, stores `relation_kind = 'SIBLING_OF'`.
* `CLONE_OF` — new: names only `parent_run_id`. The repository resolves that
  run's own PRIMARY attempt and stores it as `parent_attempt_id` with
  `intent_kind = 'CLONE_FOR_EXPERIMENT'`, `relation_kind = NULL` and
  `reason = "clone of <run>"`.

`relation_kind` stays NULL on purpose: the DB CHECK added by migration 064
reserves `SIBLING_OF` for a fork with a parent and `CLONE_FOR_EXPERIMENT`, and
a plain copy makes no such claim. The lineage reader already renders an
unqualified edge as "parent &lt;id&gt;". **That is what keeps this migration-free.**

A clone is **not** required to bind the same AlphaVersion. Refusing it would
break the one path the screens offer for starting from an existing run, and the
reader already has an honest state (`OUTSIDE_RETURNED_GRAPH` /
`PARENT_OUTSIDE_RETURNED_GRAPH`) for a parent outside the graph it returned.
An unresolvable parent run is a typed 404, not a silent root.

The 409 on `intent_kind !== "NEW"` is untouched: the browser still submits a
NEW intent with its own preflight and digests, and the server sets
`CLONE_FOR_EXPERIMENT` on the attempt itself, exactly as the sibling path
already did.

**No backfill.** Attempts written before this have no parent and keep reading
`ROOT`. A guessed parent is a lineage claim nobody made.

Browser side: `NewRunRoute` declares `CLONE_OF` **only once the copy actually
landed** — `?from=` in the address is an intention, and a read that failed
copied nothing. The rule is a pure function, `runLineageFor()` in
`useNewRun.ts`, so it is readable and testable without the route.

---

## 3. Contract changes

| File | Change |
|---|---|
| `packages/contracts/openapi/research-run-library.openapi.json` | `RunLibraryItem.display_label` — required, nullable, `^R-[A-Z0-9]{1,8}-[0-9]{3,6}$` |
| `packages/contracts/openapi/research-progress.openapi.json` | `ProgressRunIdentity.display_label` + amended CG-P11-03 description |
| `packages/contracts/openapi/research-evidence.openapi.json` | `RunIdentity.display_label` |
| `packages/contracts/openapi/research-attempt-lineage.openapi.json` | `AttemptLineageNode.primary_run.display_label` |
| `packages/contracts/openapi/research-run-create.openapi.json` | `lineage` becomes a `oneOf` of `SIBLING_OF` and `CLONE_OF` |

All five `.d.ts` were regenerated with the gate's own container and pinned
`openapi-typescript 7.13.0` — none was hand-edited. Matching zod changes in
`run-library.contract.ts`, `progress.service.ts`, `evidence.contract.ts`,
`lineage.contract.ts`, `run-create.contract.ts`.

**Fixtures.** `research-attempt-lineage.{healthy,partial,bounded}.valid.json`
were regenerated from the service itself with `W6B_WRITE_FIXTURES=1`, not hand
edited — the first attempt at hand-editing them was caught by
`research-lineage.fixtures.spec.ts`, which recomputes the service's answer and
its revision digest. They publish `display_label: null`, which is correct:
those builders wire no Run Library rows, the same reason `rc` is null there.
`w3bRealWfo.fixture.json` was deliberately **left alone** — it is a capture of
what the real API returned on 2026-09-25, and a pre-D1 server published no
label. Editing it would falsify a receipt.

---

## 4. Tests — exact counts

Run from `/home/bobby/portal/.claude/worktrees/agent-a3c4f7920fd322ea5`.

| Gate | Command | Result |
|---|---|---|
| Backend units (new + touched) | `vitest run test/research-run-display-label.spec.ts test/research-run-create-lineage.spec.ts test/research-run-library.service.spec.ts test/research-progress-w2.spec.ts` | **41 passed / 41**, 4 files |
| Backend lineage + evidence | `vitest run test/research-lineage.{service,contract,fixtures,controller,w6b}.spec.ts test/research-evidence.{service,contract,controller}.spec.ts test/research-evidence-rf05.spec.ts` | **65 passed / 65**, 9 files |
| Backend full suite (no PostgreSQL) | `vitest run` | **802 passed, 17 failed, 405 skipped** (1224); 113 files passed, 44 failed — see §4.1 |
| Frontend — ShortId + registry | `vitest run src/research/runLabels.test.tsx` | **8 passed / 8** |
| Frontend — shell | `vitest run src/app/researchRunCrumb.test.ts src/app/PortalShell.test.tsx src/portal/navigation.test.ts` | **62 passed / 62**, 3 files |
| Frontend — S10 + E13 browser rule | `vitest run src/research/lineageDetail.test.tsx src/research/w4.test.tsx` | **75 passed / 75**, 2 files |
| Frontend — whole `src/research` + `src/app` + `src/portal` | `vitest run src/research src/app src/portal` | **1462 passed, 0 failed, 3 skipped** (1465); 52 files, exit 0 |
| Contracts (generated-drift + fixture validation) | `./scripts/contracts-test.sh` | **passed**, exit 0 — `verify-generated.sh` regenerates all 38 `.d.ts` in the networkless container and diffs them against the committed files |
| `tsc` — control-api | `tsc -p tsconfig.build.json --noEmit` | **0 errors** |
| `tsc` — frontend | `tsc -b --noEmit` | **0 errors** on `apps/portal/frontend` |

`tsc -b` also reports pre-existing errors in
`features/roadmap-task-board/frontend` (its `node_modules` is not provisioned
in this worktree); no file of mine is in that project.

### New test files

* `apps/control-api/test/research-run-display-label.spec.ts` — 6 cases: the
  hi-fi's exact spelling and padding; the map is total over the two
  CHECK-constrained profiles and labels nothing else; a zero, negative or
  fractional ordinal is no label; `count(*)` read as string, number and bigint;
  the SQL counts only PRIMARY rows of the same kind up to this one; and the two
  call sites are the same fragment.
* `apps/control-api/test/research-run-create-lineage.spec.ts` — 6 cases on the
  submission boundary: a clone with only a parent; the sibling unchanged; a
  clone smuggling a cell is refused; a sibling with no cell and an unknown
  relation are refused; a malformed parent id is refused; `lineage` stays
  optional so a plain new run's command digest is byte-identical.
* `apps/portal/frontend/src/research/runLabels.test.tsx` — 8 cases: the
  registry per run; absent vs null; an unknown id; a whole list read; the label
  rendered with the id kept in title/aria/copy; the short-id fallback; a digest
  and an alpha version never relabelled; and a repaint when the read lands
  after the first frame.
* `apps/portal/frontend/src/app/researchRunCrumb.test.ts` — 6 cases: the run
  and stage the hi-fi names; the short-id fallback; all eight run-scoped
  segments; nothing outside a run; `runs/new` is not a run; an unknown
  run-scoped segment keeps the run and names no screen.

### Cases added to existing files

`research-run-library.service.spec.ts` (+2), `research-progress-w2.spec.ts`
(+1), `research-evidence.service.spec.ts` (+1 assertion pair),
`research-lineage.service.spec.ts` (+1), `research-w5a-migration.spec.ts`
(+1 block: the clone stores its parent with `relation_kind` NULL and
`reason = "clone of <run>"`, the parent row is unchanged, and a clone of an
unknown run is a 404), `w4.test.tsx` (+3), `lineageDetail.test.tsx` (+2).

### 4.1 Lanes that did not run here, and why

The full `vitest run` reports 44 failed files / 17 failed tests. **Every one of
them is `Error: connect ECONNREFUSED 127.0.0.1:5432`** — this worktree has no
PostgreSQL, so every DB-backed file fails in `beforeAll`. None is a spec this
change authored or touched, and the list is the same set of
`*-migration.spec.ts` / execution / auth / governance DB files on the base
commit.

That includes `research-w5a-migration.spec.ts`, the PostgreSQL proof of the
E13 writer: **NOT_RUN here**, needs `TEST_DATABASE_URL`. It runs in
`scripts/control-api-test.sh`, which provisions a disposable PostgreSQL in
Docker. The E13 writer is covered here by the contract spec and by `tsc`; the
row it lands is proved only by that lane.

One frontend flake seen once: `foundation.test.tsx > builds the three tabs and
the route rows from the document` failed in a full-suite run (a `waitFor` race
on `[data-selected-release]`) and passes on its own and on re-run. It touches
the Engine Atlas release selector, which this change does not go near.

---

## 5. Browser evidence — which shots are real and which are fixture

The preview at `http://localhost:8095` is read-only and was **never written
to**. It is rebuilt from `9f0a9066`, which predates this change, so its API
carries no `display_label`.

Shots were taken through a scratch Vite server on **5214**
(`scratchpad/d1/vite.d1.config.mts`, a copy of the E1 config with this
worktree's root, `fs.allow` and cacheDir). With `D1_INJECT=1` that config's dev
proxy adds `display_label` to the four reads on the way through.

* **Fixture-augmented** (`inject-*`): every shot below. The page, the
  components and the shell crumb are this branch's real code; only the field
  the shipped server will publish is supplied by the proxy.
* **Real** (unlabelled): the same six screens render identically with
  `D1_INJECT` off — every id falls back to today's short id. That is the
  fallback path, and it is what a pre-D1 server produces.

| Shot | Size | sha256 |
|---|---|---|
| `inject-s01-1440.png` | 1440×4288 | `47ba9b388975a98ca80e31177861e402b12a5ca93effa3818afcd516e746138c` |
| `inject-s01-660.png` | 660×8868 | `9de50dadd78965a7ba628d14f5636e0eb47e71a0d158361335693b188c8a7995` |
| `inject-s04-1440.png` | 1440×2928 | `365ca0c5a6c37ecbbc242901d64affb02296af0cc8131bde484d5ce8f3e01b60` |
| `inject-s04-660.png` | 660×4121 | `3d9061ae0ad61e437bb81bb12e40c449b369dd150d3b14e23d9ae98dbe62299d` |
| `inject-s09-1440.png` | 1440×3209 | `940df9d28decd77d7af752795bd54daaea0ec34338f72053993437e7da784896` |
| `inject-s09-660.png` | 660×4847 | `19e22a1e0338e53ce4a735fe428efc74e32d476b56a4b6ff3492ad3104734fcc` |
| `inject-s10-1440.png` | 1440×1016 | `eca4d08a3dbc13684ea09b29bcd35fc5e70a89a5993bc9583565b219681af68c` |
| `inject-s10-660.png` | 660×1687 | `4193f31539fc51e13675da95eb49b283ecef7404b6676b5441a8005cb9b27488` |
| `inject-s11-1440.png` | 1440×2175 | `0f6393f0a97abea8f8b92bebfcf6930cf1ca6fd005d7d848597c0e8b601ee650` |
| `inject-s11-660.png` | 660×3117 | `32f038a380b67a707da7768089847005995dd16a1b8a5ae65a1c91df2eef16ec` |
| `inject-s13-1440.png` | 1440×1942 | `5281a66640abc0e098fb33e33d45b8ee803d58ddb0ed152e9c4aae54470fc445` |
| `inject-s13-660.png` | 660×3805 | `718465e54f8b442ab7e643c2fdc1422a1e3111aad768f77f5049dbd2f2b9a914` |

Images are in the session scratchpad (`scratchpad/d1/shots/`), not committed.

### What the shots show

* **S04, both widths** — topbar reads `Research / QuantBT Backtest / R-WFO-118
  / Summary`; the meta strip reads `run R-WFO-118 COMPLETED mode_1_decay ·
  global …` on one line. At 660 the topbar trail still fits one line. This is
  the header X1/X2 said the 37-character id broke, and it does not break.
* **S10** — `data-display-label="R-WFO-001"` on the selected attempt's primary
  run (inside the "run and record details" disclosure, per D8). The tree is
  still flat with "parent — root" on every node: correct, because the preview's
  33 attempts predate the E13 writer and are not backfilled.
* **S09, S11, S13, S01 on a cold deep link** — the short id, because those
  reads do not carry the label (see below). Headers are unaffected.
* **Registry across an in-app navigation** — arriving on S01 and walking to
  S11 and S09 client-side, both print `… / R-WFO-001 / …` in the topbar and
  S09's title shows `R-WFO-001`. The registry survives route changes, so the
  four extended reads cover more screens in practice than the table suggests.

### Overflow

`documentElement.scrollWidth === clientWidth` on all twelve shots (1440/1440
and 660/660): **no horizontal page scroll anywhere**. Two inner scrollers
measure wider than the viewport — `TABLE.cp-difftable` on S13 (1488 at 1440,
1240 at 660) and a flex row on S04 at 660 (1096) — both predate this change and
neither escapes its scroll container. Zero page errors and zero 4xx/5xx API
responses on every shot.

---

## 6. What is still open

| # | Open item | Why it is open |
|---|---|---|
| D1-O1 | **S09 (report), S11 (release candidate) and S13 (compare) do not carry the label on a cold deep link.** | Their reads publish no `display_label`. Within a session they pick it up from the shared registry (proved above), so this is a deep-link gap, not a blank screen. Closing it means the same four-line change in `report`, `release-candidate` and `compare`: the label is already on the Run Library row all three could join. Rows 11-4 and 13-2 are therefore **partly** answered. |
| D1-O2 | **Screen 01's card prints its own short id.** | `RunLibrary.tsx` has a screen-local `RunId` button that duplicates `ShortId` rather than using it. Folding it into `ShortId` is a one-line change, but it is inside a screen body another agent may be editing, and the brief was explicit about not touching those. |
| D1-O3 | **An execution profile outside the frozen map yields no label.** | Deliberate — a token invented from an unknown profile id would be a guess. The map must be extended when a third profile ships. |
| D1-O4 | **The ordinal is derived, not stored.** | Correct while `research.runs` is append-only. A delete path, or a back-dated `created_at`, would renumber later runs and force a stored column. Flagged, not guarded. |
| E13-O1 | **No real clone exists on the preview yet.** | The writer fix applies to new work only; the 33 existing attempts keep reading `ROOT` by design. The close condition "a real clone makes a nested tree on the preview" needs a rebuilt preview and one clone submitted through Screen 10's "clone →". |
| E13-O2 | **`research-w5a-migration.spec.ts` was not run here.** | Needs `TEST_DATABASE_URL`; run it through `scripts/control-api-test.sh`. It is the only proof of the row the writer lands. |
| E13-O3 | **`relation_to_parent` has no `CLONE_OF` value.** | The DB CHECK on `relation_kind` permits only `SIBLING_OF`, and widening it needs a migration. A clone therefore reads as an unqualified parent edge, which the screen already renders. Ask before spending a migration number on this. |
| BE-01 | **CG-P11-03's "no display id" sentence was amended** to distinguish an identity from a presentation label. Audit X2 asks for exactly this, but the guard is Codex's text. Flagging rather than assuming consent. |

---

## 7. Rollback

Each step is its own commit and reverts cleanly. Reverting the frontend commit
alone leaves the servers publishing a field nobody reads — harmless, since
every field is additive and nullable. Reverting the backend commits alone
leaves `ShortId` falling back to the short id everywhere, which is exactly
today's behaviour. No migration, no data change, no feature flag.
