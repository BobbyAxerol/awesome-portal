# P24 — Cinema selection and immutable parameter consumer

Date: 2026-10-04 UTC. Base: `de424fad`, branch `codex/be-gaps`.
Scope: approved Research logic/data-binding and focused consumer tests only.
Claude's `5115b34e`, `1c65ff71`, `de424fad` composition, sample, CSS and visual
baselines are preserved. This packet does not grant production/release authority.

## Delivered consumer changes

1. S06 Cinema Beat 5 resolves the **exact source trial identity** when its row
   is outside the first ledger page. It echoes server-minted opaque cursors
   through `researchCurrentSourceSearchGetV1`, with the same workspace, run and
   fold filter. Bound: 400 inspected rows, four pages including the initial
   page, at most three additional named GETs. Only the selected row is retained;
   the browser does not append 400 rows to the visible ledger.
2. Each page must retain the run, source/representation revisions, source count
   and fold filter. Causal selection also requires exact `facts.study_id` and
   `facts.fold_scope.fold_id`. Repeated cursors, absent/malformed scope, changed
   revisions and over-bound populations remain explicit UI typed absences.
   Selection is never guessed from a display ordinal or parsed trial label.
3. Abort/context fencing prevents an old workspace's row or refusal from
   attaching to another context. A row already in the owning page is immediate
   authority: no redundant GET or asynchronous completion state is generated.
4. A causal study's duel/parameter fallback no longer borrows the final-deployment
   candidate merely because that candidate is the run-global selection. The
   selected digest/parameters use the exact selected row or exact surface facts.
5. Cinema's existing Freeze link now retains workspace. S06 also exposes the
   existing S07-style `propose new attempt` link: exact `?from=<run>` and scoped
   workspace, new-draft navigation only, no selection write or job allocation.
6. S03 Progress, S04 Evidence and S05 Split consume optional `run_declaration`
   from their **owning typed read**. A collapsed read-only disclosure uses
   Claude's unchanged `ParameterSpaceTable`, immutable alpha/version binding,
   entrypoint, timeframes, required columns, warmup and seed requirement. Explicit
   pin/sweep statuses come only from carried requested overrides. No Registry
   lookup, active-pointer substitution or invented default is added.
7. S06 renders typed `sampler_evidence`: verified **requested configuration** and
   random seed remain request-scoped; retained trial counts are observation,
   **not** sampler internals. The actual source's internal trace remains
   `NOT_PUBLISHED / QUANTBT_WALK_FORWARD_DID_NOT_PUBLISH_SAMPLER_INTERNAL_TRACE`
   with source locator. Atlas defaults remain separately labelled release
   metadata. Old bodies preserve their old explicit absence sentence.

Missing declarations render the carried `NOT_PUBLISHED`/`NOT_APPLICABLE` reason
and locator, not empty rows, zeros or another version's fields. Optional old
read bodies add no declaration block. The illustrative import sample remains
clearly labelled an example, not Bobby's original strategy or run evidence.

## Owned files

- `apps/portal/frontend/src/research/{SearchCinema,SearchDetail,RunProgress,EvidenceFlow,SplitDetail}.tsx`
- `apps/portal/frontend/src/research/{useSelectedCinemaTrial,RunDeclarationRead,SamplerEvidenceRead}.{ts,tsx}`
- Focused tests: `useSelectedCinemaTrial.test.tsx`, `runDeclarationRead.test.tsx`,
  `samplerEvidenceRead.test.tsx`, `searchCinema.p25.test.tsx`, `searchDetail.test.tsx`.

No backend/schema/migration, Unified/queue, runtime, staging, commit, push,
CSS/token, router or visual-baseline edits belong to this consumer slice.

## Verification

One offline disposable Node 22 affected batch covered nine test files:
selected-trial hook, declaration/sampler consumers, Cinema, shared parameter
table, Search, Progress, Evidence and Split. Initial result: **425 PASS / 11
FAIL**, all eleven were strict console-guard failures from a redundant async
state update for an already-carried row. The synchronous-authority correction
kept every assertion; only hook/Cinema were retaken: **23/23 PASS**. Combined
affected coverage: **436/436 PASS**, zero console warnings on the corrected
retake. The 413 other passing cases were not needlessly rerun.

Cases include θ* `342` outside page 100; three exact opaque GETs; in-page zero
GET; causal study/fold identity; no selection; page/context revision drift;
repeated cursor; bounded missing row; abort/unmount; late workspace response;
play/scrub without mutation; scoped Freeze/new-attempt links; all parameter
kinds; exact pin/sweep status; typed declaration absence; and no writes or
Registry request from parameter/sampler disclosure.

Typecheck first exposed generated `RunDeclaration` incorrectly requiring
JSON-Schema `$defs` as a runtime response property. The contract owner fixed
OpenAPI component integration and regenerated all four read packages; no cast,
fabricated `$defs` response or weakened consumer fixture was used.
Final `tsc -b --pretty false` after regeneration: **PASS, exit 0**.

The parent records final typecheck/build/image identity and real-browser
receipts on its exact isolated candidate. These focused fixtures do **not**
claim the real 400-trial browser receipt, a sampler internal trace, owner visual
acceptance or full P24 completion. No browser/runtime is started by this packet.

## Final centroid consumer addendum

The final conditional browser lane uncovered an additional real data-binding
defect: a global centroid has carried parameters but no source trial. Beat5
previously treated every null trial ID as no θ*. Corrected using only typed
`roles.centroid.state=AVAILABLE` plus carried nonempty selection parameters;
same existing composition/CSS, explicit no source trial and unpublished centroid
digest. None remains absence; global centroid cannot leak into a causal study.
No raw-best/deployment candidate/hash inference. Exactly three added focused
cases; latest Cinema17/17 PASS. Combined affected aggregate is **439**, not a
full-suite repeat. Final Web-only rebuild and coherent None/centroid four-screen
browser2/2 PASS are captured in the [root closeout](./P24_CINEMA_CURRENT_SOURCE_CLOSEOUT_2026-10-04.md).
