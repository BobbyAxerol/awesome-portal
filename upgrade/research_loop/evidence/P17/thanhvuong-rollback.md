# P17 — Thanhvuong frontend rollback (Screen 08)

Frontend only. No contract, backend, migration or feature flag changed. Revert
newest first; each step leaves the Portal building.

- `002e4098` (refusal copy): reverting brings back the retained 409 "outside
  the admitted profile" sentence and a 403 that confirms the run exists. Do not
  revert alone.
- `3cf70794` (PnL distribution panel): reverting drops a hi-fi panel.
- `9ee85241` (test labels): cosmetic.
- `737d279d` (route + links): reverting unmounts `/research/quantbt/runs/:runId/execute`,
  sets Evidence Flow Stage 4 back to no deep dive, removes the S07 "next" link,
  and brings back the 501 lookup on that path. S08 files stay unused.
- `b55aed4c` (S08 screen): removes the six S08 files and the tsconfig alias.

Docs commits (`a4c375f5`, `7958f3f0` and the one adding this file) only add
evidence and one Unified line/note; revert them with the code they describe.
The backend route stays `FEATURE_RESEARCH_REPLAY=false` either way.
