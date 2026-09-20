# P07 frontend handoff for Claude — Screen 14 Alpha Import

Status: `BACKEND_CONTRACT_PUBLISHED_FE_HANDOFF_PENDING`; Claude owns the Screen
14 HIFI composition, frontend tests and required browser/dev receipt. Do not
replace approved Research shell or modify protected QuantBT source.

## Codex response — `CG-P07-01` resolved

Claude's finding was correct: the original P07 delivery had five controller
routes but did not publish their canonical client contract. That gap is now
closed; do **not** hand-write request, response or error types.

- Canonical source: `packages/contracts/openapi/research-alpha-import.openapi.json`.
- Generated output: `packages/contracts/generated/research-alpha-import.d.ts`.
- Frontend alias: `@portal/contracts-research-alpha-import`.
- Regeneration: `cd packages/contracts && npm run generate` (or the narrow
  `npm run generate:research-alpha-import`). Generated-file drift is checked.
- Import only types, for example:
  `import type { components, operations } from "@portal/contracts-research-alpha-import";`.
  `operations[...]` owns request/response/status typing and
  `components["schemas"]["Problem"]` owns the bounded error-code union.
  `ResearchAlphaAnalysisV1` is shared server/parser compatibility typing, **not**
  a browser endpoint or payload to render.

The published operations are exactly `researchAlphaRegistryListV1`,
`researchAlphaImportParseV1`, `researchAlphaImportGatesV1`,
`researchAlphaImportRegisterV1` and `researchAlphaActivateV1`. Their public
responses now carry explicit schema versions. `RESEARCH_ALPHA_IMPORT_ADMISSION_SATURATED`
and `RESEARCH_ALPHA_IMPORT_VERSION_CONFLICT` are now P07-specific typed errors
rather than leaked generic repository codes.

**Route decision:** Screen 14 is a new Research Loop route,
`/research/alphas/import`, and is **parallel** to the existing
`/research/quantbt/imports` legacy quarantine inbox. Do not delete, redirect,
restyle in place or otherwise replace the legacy route. A future explicit
migration/cutover phase must own that decision and compatibility receipt.

## Consume only these same-origin operations

| Product need | Method/path | Browser input | Server-derived output |
|---|---|---|---|
| Initial/imported registry | `GET /api/v1/research/alphas` | optional `workspace_id`, `alpha_id` | `research.alpha-registry.v1` safe registry envelope |
| Parse one source | `POST /api/v1/research/alphas/import/parse` | `original_filename`, `source_text`, optional `workspace_id` | `research.alpha-source.v1` opaque ref, digests, parse state, readonly mirror |
| Run gates | `POST /api/v1/research/alphas/import/gates` | opaque `source_file_ref`, optional workspace | `research.alpha-import-gates.v1` ordered seven gate rows + receipt |
| Register draft | `POST /api/v1/research/alphas/import/register` | opaque ref, `alpha_id`, optional receipt/workspace | `research.alpha-registration.v1` DRAFT version and revision |
| Activate draft | `POST /api/v1/research/alphas/:alpha_version_id/activate` | `expected_alpha_revision`, optional workspace | `research.alpha-activation.v1` ACTIVE version/revision or typed conflict |

All mutations require existing same-origin session, CSRF and allowed-origin
mechanisms. Do not call Portal API, PostgreSQL, QuantBT, NATS, Execution or
Trading System directly; do not hold private principal or select an analyser
URL in browser code.

## Rendering and state rules

1. Use HIFI Screen 14 structure. Keep source text local until Parse; after
   parse, treat returned mirror as read-only. Never offer editable parsed
   entrypoint, parameter-space, determinism or data-contract fields.
2. Any source edit clears displayed receipt/draft affordance locally and
   requires a new Parse → Gates sequence. Never reuse a receipt for changed
   bytes, a different actor or a different workspace.
3. Render every gate in order. On first `FAIL`, later gates render `SKIPPED`;
   do not fake progress, causal proof or provisional registration.
4. Show this disclosure verbatim beside Gate 7:
   `Static scan — runtime causality is proven per run at Stage 3/4.`
5. `DRAFT` means bytes/contract are registered but not active. `ACTIVE` comes
   only from activation response. Render 409 conflict by refreshing registry
   revision; never client-retry blindly.
6. Map typed backend errors faithfully: invalid source (`400`), expired/stale
   source or receipt (`409`), duplicate digest/version (`409`), cross-scope
   absence (`404`), non-admin activation (`403`) and analyser/admission
   unavailability (`503`). Do not degrade them to generic success/empty.
7. No dependency installer, path picker, zip/multi-file import, source
   execution, test run, runtime-causality badge or browser-held source copy
   after successful registration.

## Required Claude receipt

- Generated/typed client maps all five operations and listed state/error paths
  without hand-parsing server strings.
- S14 tests cover upload/paste, valid parse, gate failure→SKIPPED, source edit
  invalidation, DRAFT/ACTIVE, stale CAS, non-admin/typed denial, keyboard and
  responsive HIFI behavior.
- Run only narrow relevant frontend unit/build/browser journey; do not rebuild
  images or deploy solely for this handoff. Record exact commands, counts and
  dev URL receipt back in P07 board/evidence.
