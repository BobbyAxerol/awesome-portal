# EVIDENCE_B7 — `enriched_analysis_availability` on S04 / S09 (S01 blocked)

Base: `138300f1` (contains `8829f7a0`). `999be160` named as the fallback in COMMON.md does NOT contain Codex's B7 foundation, so it was not used.

| Item | Status | Where / tests |
|---|---|---|
| S04 (Hub, current-source Evidence): served reason when no block | DONE | `enrichedAvailability.tsx` (`enrichedAbsenceCode`, `EnrichedAbsenceLine`), `evidenceClient.enrichedAbsenceOf`, one line under `EnrichedRefusedLine` in `EvidenceFlow.tsx`. Tests `enrichedAvailability.b7.test.tsx` "B7 S04 ..." (both codes, field not served, AVAILABLE+block, stale NOT_PUBLISHED+block) |
| S09 supplemental section | DONE | `ReportAllTime.tsx` `AbsentLine` takes a `title`; `AllTimeSupplement` takes `absentCode`; `reportClient.enrichedAbsenceOfReport`; `ReportDetail.tsx` passes it. Tests "B7 S09 ..." (both codes, canonical null-block fixture pair, field not served keeps code-less line, AVAILABLE value path) |
| S01 all-time cell | BLOCKED | `RunLibraryItem` in `research-run-library.d.ts` has `analytics_all_time?` only; NO availability field (the schema type `EnrichedAnalysisAvailability` is present but unreferenced). FE keeps today's behaviour |
| Browser check at 1440/660 | NOT RUN | preview API answered 401 SESSION_REQUIRED even with `x-dev-access-email`; preview likely predates the index build anyway |

Rules kept: block present => nothing changes; field not served => today's code-less "not published"; code never invented; a null/empty reason_code is not shown as a code. Tooltip = served code + "the screen adds no reason". Words: S04 +1 compact line only on served absence (before: none); S09 line "all-time analytics — not published" gains the code (before: no code).

## Backend request (S01)
- Endpoint/field: `RunLibraryItem.analytics_all_time_availability` (same `EnrichedAnalysisAvailability`) beside the missing `analytics_all_time`.
- Lý do UI: S01 card shows a bare "not published" for old seals with no reason.
- Ảnh hưởng hiện tại: no code on the card.
- Đề xuất nhỏ nhất: serve the same object Evidence/Hub/Report already serve.
- Hiện FE làm gì: falls back to the existing sparkline path, no code.

## Proposed vs canonical differences
Not applicable to this group (S02 only).
