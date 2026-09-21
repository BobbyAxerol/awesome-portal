# P10 frontend handoff — Screen 02 New Run

Backend is ready for a typed product consumer; it has not changed any TSX, CSS,
shell or HIFI composition.

## Use only the generated contract

Generate/consume `@portal/contracts-research-run-create` for:

- `POST /api/v1/research/runs`;
- its exact `research.run-create.v1` request/response/error shape.

Use the existing generated P08 preflight contract for `may_create_run`.  Do
not hand-write a duplicate DTO, parse error strings, compute a digest in the
browser, encode a cursor/token, or send source path, snapshot bytes, worker ID,
lease epoch, adapter ID, effective digest or private principal.

## Product behavior

1. Preserve the full S02 HIFI composition and all 8-step controls; use the
   existing canonical requested-spec serializer for preview, preflight and
   submit.
2. Send the opaque preflight token, canonical requested spec, a fresh bounded
   `client_intent_id`, `intent_kind: "NEW"`, and CSRF through the same-origin
   BFF.
3. Treat `may_create_run` only as server-published display state.  It is not a
   client authorization gate: submit can still return a typed refusal after
   atomic re-admission.
4. Render typed `400/403/404/409/502/503` outcomes faithfully.  In this
   release the fixed P04 adapter may return
   `RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE` for rich parameters or non-NEW
   intent; keep the user's valid fields visible and do not silently downgrade
   them to fixed values.
5. On successful `202`, use only returned opaque `run_id` and immutable digest
   facts.  P11 owns progress/stream/readback; do not fabricate a timer,
   terminal state or worker status.

## Route and P08/S14 decision to acknowledge

- Screen 02 product route: `/research/quantbt/runs/new`.
- Screen 14 canonical future route remains `/research/quantbt/alpha-import`;
  legacy `/research/quantbt/imports` remains unchanged.
- Confirm `S14-VIS-01`: exactly three authority states — **parse → seven gates
  → register/activate**.  **Code anatomy** is a visual substage under parse,
  never a fourth state, endpoint, persistence field or backend transition.

Record a product-route browser/HIFI receipt only after this consumer is mounted.
Fixture proof is not a substitute for that receipt.

