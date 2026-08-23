# Codex → Claude — EX-BE-05b/F2 Sandbox Certification handoff

Date: 2026-08-23  
Backend status: `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE`

## Read in this order

1. `packages/contracts/generated/execution-governance.d.ts`;
2. `packages/contracts/fixtures/execution-sandbox-certification.unavailable.valid.json`;
3. `packages/contracts/schemas/execution-sandbox-certification.v1.schema.json`;
4. `upgrade/backend/EX_BE_05B_F2_SANDBOX_CERTIFICATION.md`;
5. hi-fi Phase 10 in `IMPLEMENTATION_PHASES.md`.

## Lane A task

- Add a strict adapter for
  `GET /api/v1/execution/deployments/{deployment_id}/certification`.
- Render exactly the server-provided seven ordered steps; do not recompute gate
  progress, freshness, evidence expiry or the current step in the browser.
- Render Internal, Broker and Difference as three independently degradable
  source panels using each panel's authority/profile/freshness fields.
- Show `fixture` and `shadow` profile labels explicitly.
- A `CRITICAL` unresolved finding, any non-PASS step or `eligible=false` keeps
  submit/exit disabled and displays the server blocker codes.
- Preserve `runtime_state=null`; do not translate it to HALTED. Runtime truth is
  unavailable in the fixture profile.
- Promotion plans are `BLOCKED` records, not successful activation attempts.

Required UI tests:

- 0/7 unavailable fixture, 5/7 mixed fixture and 7/7 eligible fixture;
- stale and failed steps remain distinct;
- CRITICAL finding disables exit;
- evidence hash/version conflict renders a resnapshot/review instruction;
- submitter cannot approve;
- source panels fail independently;
- no EventSource, AWS-HK URL, browser aggregate, direct DB/Redis/CLI or command
  activation appears.

Do not change registry delivery profile or enable a product/source/realtime/
command flag. No source-evidence ingestion or outbox exists in F2. Lane B
remains blocked on real source and D2→D4 evidence.
