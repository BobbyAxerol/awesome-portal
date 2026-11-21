# CG-FG-D1-O1 — named-read client binding, 2026-09-29

Verdict: **FE code, focused tests and scoped cold real-API browser receipt pass.** This is a data-binding repair only. Layout, colors, typography, baseline images, API contract and backend authority were not changed.

The already-published `display_label: string | null` on Report detail, Release Candidate compose/pack and Compare run rows is now recorded by those exact same-origin reads. S09's existing `ShortId` consumes the shared label registry. S11's breadcrumb, run rail and sealed-pack run identity, and S13's run IDs consume the label before falling back to the existing short ID. No ordinal is computed in the browser. `304` preserves the prior label; refused Compare and null labels do not invent one. Links, `title` and identity attributes keep the full `run_id`.

Focused verification in `apps/portal/frontend`:

| Gate | Result |
| --- | --- |
| `npm test -- --run src/research/runLabels.clientBindings.test.ts src/research/runLabels.test.tsx src/research/compareDetail.test.tsx src/research/releaseCandidateDetail.test.tsx src/research/reportDetail.test.tsx` | 5 files, 204 tests passed |
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |

The [FG backend requests](./FG-backend-requests.md#2-cg-fg-d1-o1--display_label-trên-ba-named-read-s09--s11--s13) contain the real-API field receipt. A clean image of source `8ad39e83fac311538060e713825fd88b1c94159c` was built and started only in the isolated P23 loopback cell (`127.0.0.1:8096`, seven pinned images, source dirty=false). `node scripts/research-p23/d1-o1-browser-real.mjs` passed five fresh Chromium contexts: cold S09 Report and S11 RC Compose for `R-WFO-075` and `R-P04-001`, plus S13 Compare for `R-WFO-001`. Browser labels matched their named API responses, full `rrun_` identity remained in title/link, 25 requests were same-origin GET except owned-test login, page errors were zero, and research job count stayed 158→158. Private 0600 receipt: `/home/bobby/.local/state/portal-research-p23/20260927/runtime/d1-o1-browser-real.json`, SHA-256 `2700b96e206f249258bf23767d3dd1b62edbf1009212af1d26c39e2b76be62ae`.

This closes only the scoped D1-O1 deep-link browser check. The receipt explicitly sets `full_f3_passed=false` and `full_p23_passed=false`; F3 exact-candidate full lane and visual acceptance remain separate. The `null` label fallback was verified by unit tests, not asserted as a real-source browser case because these sampled source runs publish labels.

W06 is independent. The current P13 candidate already passed two exact clean-image mixed retakes at the original 500-ms warm target (Library/Evidence 363/445 and 405/305 ms). Bobby approved backend optimization and a possible 500–600-ms acceptance band if needed; this binding slice neither changes P13 nor uses that relaxation. Existing failed receipts remain in the [W06 checkpoint](../P23/W06_INFLIGHT_BATCH_CHECKPOINT_2026-09-29.md).
