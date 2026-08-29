# Codex → Claude: N06 Real-source Qualification Handoff

Status: `BACKEND_TEMPLATE_READY / REAL_SOURCE_EVIDENCE_PENDING /
FRONTEND_CONSUMER_ALLOWED_FOR_SANITIZED_STATES_ONLY`

Use the canonical fixture:

`services/portal-execution-edge-rs/crates/source-qualification/fixtures/n06-real-source-qualification.template.json`

Frontend rules:

1. Render `TEMPLATE`, `READY_FOR_OWNER_REVIEW` and `EVIDENCE_ACCEPTED` as
   evidence lifecycle states, never as runtime/read-profile states.
2. Keep `activation_authorized=false` and `registry_profile_changed=false`
   visible in the evidence drawer.
3. Show parity, soak duration, latency/resource ceilings, drill pass/fail and
   evidence freshness; never infer a pass from a missing field.
4. Do not expose source payloads, credentials or raw business identifiers.
5. Keep long digests out of primary panels. Use a short identity plus explicit
   copy/detail action.
6. Distinguish missing owner packs/window from a failed technical soak.
7. Do not select a source-backed frontend delivery profile before N07/N13.

Backend truth and operating commands are documented in:

`upgrade/backend/EX_BE_03_N06_REAL_SOURCE_QUALIFICATION_AND_SOAK.md`
