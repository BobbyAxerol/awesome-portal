# BAR-05 — Reproducibility Freeze (M0)

> **Version:** 0.1<br>
> **Status:** BAR-05-BE1/BE2/BE3 complete<br>
> **Updated:** 2026-08-15<br>
> **Unified phase:** U08 M0 Reproducibility Freeze<br>
> **Guide authority:** v0.4 §29.2 M0 baseline/inventory/golden evidence

## 1. Goal and scope

BAR-05 freezes the technical baseline so every later migration authority has
parity and rollback:

- A digest manifest (`upgrade/backend/bar05/m0-freeze-manifest.json`) over
  source, Python pins/wheels, OpenAPI snapshots, golden fixtures, artifact
  schema versions and configuration files.
- A credential-free deterministic environment report
  (`upgrade/backend/bar05/environment-report.json`).
- Golden routes (kernel parity + API submit/reopen) with documented
  tolerances and an executable verification script.
- A Roadmap export count/hash report (M0 exit-gate item, additive Planning
  change).
- Rollback documentation to the last known-good image set.

Non-goals: screenshots/Playwright flows and visual baselines are the frontend
slice; SLO/RSS baselines wait for the measured U10 observability boundary;
authenticated-BFF ingress runs are documented as pending the U10 façade
wiring (the BFF owns no routing authority yet).

## 2. Locked decisions

1. **Manifest is the freeze.** Regeneration must reproduce every digest;
   drift fails CI. `frozen_at_commit` records the freeze point.
2. **Tolerances stay exactly the documented golden policy:** `pos_weight`
   and `exit_type` exact float equality; `exit_price`
   `np.allclose(rtol=1e-9, atol=1e-12)`; determinism without RNG on the
   synthetic fixture.
3. **Reports never carry credentials, host paths or secret values.** Only
   version identifiers, mode names and digests.
4. **Planning export gains only additive fields:** `counts` and
   `content_hash`; existing keys are untouched and webhook configuration is
   never exported.

## 3. Freeze inventory

| Group | Frozen items |
| --- | --- |
| Protected kernel | `strategy/main.py` sha256, `PROTECTED_SHA256` |
| Registry contracts | `registry.json`, `links.v1.json`, public content digest |
| Python pins | `constraints/portal.txt` (quantbt-engine==1.0.8, HMD 0.1.0rc3), backend `pyproject.toml` |
| OpenAPI | Portal/Planning snapshots, bundled run-request schema |
| Golden fixtures | market/signals parquet + metadata json digests |
| Artifact schemas | `manifest.json` v1, Portal artifacts v1 (BAR-02 provenance) |
| Config | compose.yaml, production compose, nginx conf, `.env.example` (template only) |
| Control API | package manifests/lockfiles, migrations, tsconfig |
| Frontends | both package manifests/lockfiles |
| Planning | requirements.txt / requirements-dev.txt |

## 4. Golden route set (executable gate)

```bash
./scripts/verify-m0-golden.sh
```

runs the protected-hash check, golden fixture digest checks and the
deterministic golden parity + run API reopen suites. The full M0 golden set
(signal_notional, intrabar, event-driven, portfolio, WFO/three-window) is
covered by the existing golden fixture segments and the three-window run
reopen test; new protocol goldens belong to their bounded-context phases.

## 5. Rollback

Last known-good image set: `local/portal-*-{api,web}`,
`local/portal-roadmap-task-board-api`, `local/portal-control-api` at tag
`dev` for the freeze commit. Rollback = `docker compose down`, restore the
previous images/tags (or redeploy the freeze commit), and
`./scripts/portal smoke`. The Compose stack remains deployable and immutable.

## 6. Implementation slices

- **BAR-05-BE1:** freeze manifest exporter + committed manifest + digest tests.
- **BAR-05-BE2:** deterministic credential-free environment report + tests.
- **BAR-05-BE3:** Planning export count/hash report, `verify-m0-golden.sh`
  gate and evidence documentation.

Evidence is recorded per slice below.
