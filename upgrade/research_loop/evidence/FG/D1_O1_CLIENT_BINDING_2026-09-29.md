# CG-FG-D1-O1 — named-read client binding, 2026-09-29

Verdict: **FE code and focused tests pass; cold real-API browser receipt remains open.** This is a data-binding repair only. Layout, colors, typography, baseline images, API contract and backend authority were not changed.

The already-published `display_label: string | null` on Report detail, Release Candidate compose/pack and Compare run rows is now recorded by those exact same-origin reads. S09's existing `ShortId` consumes the shared label registry. S11's breadcrumb, run rail and sealed-pack run identity, and S13's run IDs consume the label before falling back to the existing short ID. No ordinal is computed in the browser. `304` preserves the prior label; refused Compare and null labels do not invent one. Links, `title` and identity attributes keep the full `run_id`.

Focused verification in `apps/portal/frontend`:

| Gate | Result |
| --- | --- |
| `npm test -- --run src/research/runLabels.clientBindings.test.ts src/research/runLabels.test.tsx src/research/compareDetail.test.tsx src/research/releaseCandidateDetail.test.tsx src/research/reportDetail.test.tsx` | 5 files, 204 tests passed |
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |

The backend real-API field receipt remains [FG backend requests](./FG-backend-requests.md#2-cg-fg-d1-o1--display_label-trên-ba-named-read-s09--s11--s13). A full `PRODUCT_ROUTE_BROWSER_RECEIPT` on cold S09/S11/S13 deep links and the exact-HEAD F3 lane are still required. The P23 cell was down during this source-only slice; no browser, build or runtime/deployment claim is made here.

W06 is independent. The current P13 candidate already passed two exact clean-image mixed retakes at the original 500-ms warm target (Library/Evidence 363/445 and 405/305 ms). Bobby approved backend optimization and a possible 500–600-ms acceptance band if needed; this binding slice neither changes P13 nor uses that relaxation. Existing failed receipts remain in the [W06 checkpoint](../P23/W06_INFLIGHT_BATCH_CHECKPOINT_2026-09-29.md).
