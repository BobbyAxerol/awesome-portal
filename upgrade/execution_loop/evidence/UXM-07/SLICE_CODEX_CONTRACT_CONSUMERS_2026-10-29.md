# Slice: consumers for Codex's two answers to hand-back 2 (29 Oct 2026)

Branch `claude/slice-codex-consumers`, based on the frozen candidate `claude/step-b-integrate` (hook-verified `9054bd410`; docs after it only), plus two Codex commits cherry-picked unchanged in meaning: `9188297ba` (approval inbox `subject_type`, now `feefca6b3` here) and `9d5b9ced9` (FE-069 negative vectors, now `15b7ad775`). The frozen branch is untouched; this slice is separate so Codex can take it together with, or after, its landing.

## What it does

1. **Approval inbox `subject_type`** (`APPROVAL_INBOX_SUBJECT_TYPE_2026-10-28.md`): `readInboxRowV2` validates the optional enum `ALPHA_VERSION | DEPLOYMENT | EXIT_REVIEW`; absent (older server) is a valid row with no type; any other value, null, lower case or non-string refuses the row. The queue context line prints the kind in words ("alpha version av_grid22") next to the id. It is a hint, not a link: Codex's note says the target must be resolved through its own authorized relation, and none is published for the row, so no link is made and nothing is inferred from the gate, label or id. Tests: 4 new cases in `inboxRowV2.test.ts` (35 pass).
2. **FE-069 negative vectors** (`FE069_CATALOGUE_NEGATIVE_FIXTURE_2026-10-28.md`): the catalogue reader refuses all six published cases whole (unknown authority, limit above cap, unexpected field, missing cursor for more, cursor when no more, duplicate alpha id), never as an empty page, and the `schema_rejects` flag each case carries is true against the schema (three cross-field cases are schema-valid on purpose). Tests: `runLibraryAlphaCatalogue.conformance.test.ts` 62 pass (was 55).

## Checks run on this slice, and not run

Run: the two test files above; cockpit, readers, `src/execution/api`, `src/fixtureBff` (2,095 tests) and the hygiene tests (disabledReason, v2Hygiene, titleAbsence, productBoundary) with 12 files / 924 tests green; `tsc --noEmit`: no error outside `features/roadmap-task-board` (that tree has no dependencies linked in this worktree); N29 and EDS-12 refresh: unchanged.
Not run: the full vitest, the full hook, V2 pixel baselines and a browser journey. The queue line changes one text segment of the cockpit cell, so the V2 cockpit baseline may need one re-record; the normal hook on the final integrated tree is Codex's gate. Old closed-schema consumers outside the V2 reader were not searched beyond the typed readers.

## Open after this slice

Linking the row to its subject needs a published authorized relation per kind (Codex's note: do not assume `ALPHA_VERSION` is an Alpha 360 id; do not invent a deployment id from an exit review). Until it is published the row stays text.
