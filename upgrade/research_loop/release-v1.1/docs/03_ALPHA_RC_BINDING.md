# 03 · Alpha → av_ → run → rc_ — binding, taxonomy, publish

Source of truth: Execution-side spec v0.7 §3.1–3.4, §4.1. This doc states what the research screens implement.

## 1. Entity chain (never bind alpha↔run directly)

```
alpha_id (identity, mutable metadata)                 alpha_7f2 · alpha_momentum_btc
└─ alpha_version_id av_ (code artifact, IMMUTABLE)    av_0_9_3 · sha256:3fe4a1 · U14 import state
   ├─ run_id / run_attempt_id (evidence only)         R-WFO-118 · att_04
   ├─ selected_parameter_artifact_id prm_             prm_7c1a9e (θ*)
   ├─ final_audit_run_id                              = the run above
   └─ release_candidate_id rc_ (THE promotable unit)  rc_2026_0914_a
      └─ Gate R1 (research evidence) → deployment_candidate dc_ → Gate R2 → Paper/Sandbox/Canary/Live
```

- A run binds exactly one av_ at submit (02 Context step); binding is immutable after submit.
- **Scratch rule (approved):** a run without av_ is runnable, full evidence, and permanently `NOT_PUBLISHABLE` — no rc_ can ever be composed from it. Surfaces: 02 banner+chip, 01 dashed chip, 11 blocked publish.
- Import states (U14): DRAFT → ACTIVE → SUPERSEDED. Only ACTIVE versions compose rc_; DRAFT runs warn on 02.

## 2. Change taxonomy (what re-runs which gate)

| Change | Consequence |
|---|---|
| code / entrypoint / packaging ⇒ **new av_** | R1 + R2 re-run — never modeled as an attempt (10 shows it as a diff row `alpha_version: av_a → av_b · gates reset`) |
| selected strategy params (prm_ changes) | R1 + R2 re-run |
| data contract / dataset snapshot | R1 + R2 re-run |
| target venue / account / capital | R2 only — belongs to dc_, UNSET on research side by design |
| report-only fields | no gate |

## 3. Publish payload (screen 11, YAML preview = record §3.2)

`release_candidate_id, alpha_id, alpha_version_id, alpha_artifact_digest, entrypoint, selected_parameter_artifact_id, parameter_digest, final_audit_run_id, run_spec_digest, quantbt_engine_release_id, engine_image_digest, dataset_snapshot_ids[], universe_snapshot_id, methodology_claim_id, known_limitations[], proposed_use_restrictions[], created_at`

- Publish writes ONE immutable record to the portal governance store; creates no account, starts nothing.
- Any later change ⇒ NEW rc_ that supersedes; a published record never mutates.
- Separation of duties: publisher ≠ sole R1 approver where policy requires. R1 expiry default: approved_at + 90d (policy default — confirm).

## 4. Evidence pack — 12 R1 items (screen 11 block 2)

1 Alpha Version passport · 2 Engine/capability/backend (runtime authority resolved + reason) · 3 Dataset & universe snapshots · 4 Methodology claim · 5 Selected params lineage (SelectionTraceV1) · 6 Final audit replay (report_level=audit) · 7 Metrics semantics (headline = OOS only; holdout sealed) · 8 Execution assumptions · 9 Robustness/param stability/regime · 10 Known limitations & waivers (INPUT) · 11 Reproducibility/parity checksums · 12 Proposed use restrictions (INPUT).

- Status axis: COMPLETE / DEGRADED (travels as DEGRADED — reviewer sees it) / INPUT (signed researcher declaration) / MISSING (blocks publish).
- Every non-INPUT row links to the screen that proves it (04/05/06/07/08/09).

## 5. Approval mirror (post-publish, read-model)

Research side renders the inbox row it created — gate R1 · PENDING · SLA · assignee pool · decision outcomes `APPROVED · APPROVED_WITH_CONDITIONS · CHANGES_REQUESTED · REJECTED · SUPERSEDED · EXPIRED` — read-only; decisions live on the Execution side. Ghost (dashed) until the record exists: the screen never fakes a governance state.

## 6. Two certification axes — never mixed

- **Methodology claim ceiling A–D**: from mode × schedule (+ holdout state). Owned by the claim strip / Stage 5.
- **Engine cert L0–L4**: from the execution contract (L1 accounting → L2 causal → L3 parity → L4 external/nautilus).
- A run's certificate = min(engine cert, methodology cap, artifact completeness). Screen 11 carries both chips side by side; screen 12 tab 3 is the reference.
