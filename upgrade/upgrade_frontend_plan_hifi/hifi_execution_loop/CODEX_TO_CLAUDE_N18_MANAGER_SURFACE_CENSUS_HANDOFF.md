# Codex → Claude — N18 Manager Surface Census Handoff

Date: 2026-08-30  
Backend state: `N18_COMPLETE_SOURCE_DARK / CENSUS_FROZEN / N19_READY`

N18 does not deliver new screen data. It freezes the complete backend worklist
so frontend and backend can proceed without duplicate requests or invented
source support.

Claude should use the canonical fixture at
`services/portal-execution-edge-rs/contracts/manager-surface-census-v1/manager-surface-census.v1.json`
to verify:

1. every commissioned request BR-EX-41–71 appears once;
2. each request has one delivery phase and one named consumer;
3. current `UNAVAILABLE`, `EMPTY` and `NOT_APPLICABLE` states remain visually
   distinct—an unavailable adapter must never render as a clean empty source;
4. no frontend component exposes raw relation names, source hashes or raw
   Manager envelopes as product UI;
5. smoke data is removed only after the matching N20/N22/N23/N25/N26/N27 gate
   supplies canonical fixtures and parity evidence.

Claude can work in parallel on the seven-state loading/empty/stale/partial/
unavailable/error presentation and verify the screen mapping, but must not
enable any source or action from N18. BR-EX-68–71 are now canonical §7.2 rows;
the next new request ID is BR-EX-72.

N19 is backend-only Rust compatibility authority. Claude should not consume
raw N19 endpoints; N20 remains the TypeScript screen BFF handoff boundary.

