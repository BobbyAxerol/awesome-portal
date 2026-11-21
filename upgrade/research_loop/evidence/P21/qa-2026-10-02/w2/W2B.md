# W2B notes (route shell, Journey, Library copy)

Done: redirects (new, imports, runs/legacy; query+hash kept), Command Center + Journey nodes 04/05/12 point to redesigned screens, "shipped" removed from the page, landing has no duplicate header, Runs count dropped, document title for the index, mobile min-w rules (<=720px), alpha-pick banner, Library copy cuts, Continue draft chip (stub), final-30D labels.

NEEDS-SHARED: libraryDraftChip.ts returns null until W2A exports readDraftSummary() from runDraftStore.ts; then `return readDraftSummary();`.
NEEDS-BACKEND: run_library_search_documents has no display_label, so q=R-P04-022 returns 0 (FE keeps its "search does not read labels" note). Descriptor v5 to drop "shipped" copy from card descriptions (FE hides any description containing it).
Not run: Playwright/visual (journey + library baselines will change: tags, descriptions, mapping block, kicker removed); 390/360 overflow not verified in a browser.
