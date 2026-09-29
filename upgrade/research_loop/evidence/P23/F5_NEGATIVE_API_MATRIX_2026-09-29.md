# F5 / P23 — real refusal subset on the owned cell

2026-09-29 · Codex · `docs/research-loop-plan` · **real API subset PASS; full F5/P23 OPEN**.

The clean, isolated `portal-research-p23-ol12` cell at `127.0.0.1:8096` ran seven pinned images from application source `89d8a817c9d32d6fae09c9444d49d6eb36e254f1`. `f5-negative-api.mjs` used disposable identities and real same-origin Control API endpoints, without route stubs or direct DB writes. Private mode-0600 receipt `f5-negative-api-20260929.json` has SHA-256 `b853eae602fb274d39d91d68a595737c68959de25094f7fc9d39cc4b66f64b8b`.

| Case | Actual status / typed code |
|---|---|
| S02 malformed preflight | 400 `RESEARCH_PREFLIGHT_INVALID` |
| S14 malformed parse | 400 `RESEARCH_ALPHA_IMPORT_INVALID` |
| S02/S14 anonymous mutation | 401 `SESSION_REQUIRED` each |
| S02/S14 valid session without CSRF | 403 `RESEARCH_PREFLIGHT_INVALID` / `RESEARCH_ALPHA_IMPORT_INVALID` |
| S02 missing preflight / S14 missing Alpha version | 404 `RESEARCH_PREFLIGHT_NOT_FOUND` / `RESEARCH_ALPHA_IMPORT_SOURCE_NOT_FOUND` |
| S14 non-admin activation | 403 `RESEARCH_ALPHA_IMPORT_ACTIVATION_FORBIDDEN` |
| S14 stale activation CAS | 409 `RESEARCH_ALPHA_IMPORT_ACTIVATION_CONFLICT` |

The 409 setup used real parse → seven passing gates → registration of a unique Alpha test source. Readback proves the refused version remains DRAFT at the same revision; workspace jobs stayed **158→158**.

The existing bounded `t12-admission-receipt.mjs` then ran on the same application/image identity with idle disposable actors. Eight S02 preflights returned 201, the ninth returned real **503 `RESEARCH_PREFLIGHT_UNAVAILABLE`**; an independent member still received 201. No compute job was admitted; resource samples passed the declared cap. Private receipt `f5-t12-preflight-503-20260929.json` has SHA-256 `e4d0a1eecd6a8d1584aa99a9f6ef2ecb16bd189ed8dbcb5af8a2ce99dd260d81` and `full_t12_passed:false`. This is an API 503, not a browser-visible S02 503 or utility-kind T12 quota.

**Remaining:** No authentic 502 was induced: that branch rejects an inconsistent private producer manifest, and manufacturing one in the running producer would weaken source integrity. Typed 502 frontend mapping has unit coverage, not a real-source receipt. Browser refusal presentation, disposal/revocation of temporary identities, full S00–S14 exact-candidate lane, F3/OL-24, other P23 gates and P24 remain open. Positive S02/S14 browser writes have separate receipts. The owned cell was stopped with `cell.mjs down` (no `-v`), retaining volumes/images/private evidence. No shared preview, dev, production, Trading System, push or release mutation occurred.
