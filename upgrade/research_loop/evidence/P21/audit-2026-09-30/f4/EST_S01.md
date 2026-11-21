# EST_S01 - Run Library: enriched_analysis_availability

Base eae8a7b5 verified (dataDeclarationV2.ts, newRun.qa02.test.tsx exist).

- DONE: card shows `all time — not published` (title `All-time analysis not published. <CODE>`, data-reason-code) under the sparkline label when `analytics_all_time` is absent and `enriched_analysis_availability` is NOT_PUBLISHED with a served code. Where: RunLibrary.tsx (Sparkline fallback branch), runLibraryClient.ts `readEnrichmentAbsence`.
- Unchanged: present/refused all-time block (wins, early return); AVAILABLE or field not served = today's behaviour. No invented codes (code printed as served).
- Tests: runLibrary.est.test.tsx (5; canonical fixture research-enriched-analysis.old-seal-absent.valid.json; both generated codes; AVAILABLE/not served; malformed; present block wins).
- Not run: browser/screenshot check (no dev server used). On the fallback card the absence is one extra 9px line, not a separate cell.
- Backend requests: none.
