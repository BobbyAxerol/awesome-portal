# BAR-09 — Engine Capability Authority

> **Version:** 0.1<br>
> **Status:** BAR-09 complete<br>
> **Updated:** 2026-08-18<br>
> **Unified phase:** U12 Engine Capability Registry & Full QuantBT UI<br>
> **Guide authority:** v0.4 §7 full QuantBT integration, Screen 10 Endpoint Explorer

## 1. Goal and scope

BAR-09 makes the QuantBT engine surface machine-readable instead of
hard-coded: a source-controlled capability manifest, an installed-wheel
inspector and typed preflight.

- `registry/engine-capabilities.v1.json` + JSON Schema pin the engine release
  (`quantbt-engine==1.0.8` with the dist-info RECORD sha256) and declare
  certified capabilities (`three_window_decay`, `advanced_walk_forward` on
  endpoint `walk_forward`) with backend/data/methodology/resource
  requirements.
- `services/engine_capabilities.py` loads the manifest fail-closed at startup
  (invalid → app cannot compose), verifies the installed wheel against the
  pinned digest and preflights every run request.
- Unadvertised or uncertified protocols are rejected even when the request is
  syntactically valid; a newly certified capability in the manifest needs no
  dispatch-code change (gate test).
- `GET /api/v1/portal/capabilities` serves the read-only public projection
  (installed verification included, digests not leaked into semantics).

Non-goals: full Endpoint Explorer UI, Generic Run API, the Control API
capability registry tables (later U12 slices).

## 2. Locked decisions

1. **The manifest is the authority.** Dispatch stays code-based for the two
   certified protocols; the manifest decides what may be requested and with
   which resource bounds.
2. **Wheel identity is the canonical dist-info RECORD fingerprint** of the
   installed distribution (the wheel file itself is not present at runtime).
   Only sorted wheel-owned rows carrying content digests participate;
   installer-managed `INSTALLER`, `REQUESTED`, `direct_url.json` and unhashed
   bytecode rows do not. This preserves the same payload identity across pip
   and uv; version and fingerprint must both match the pin.
3. **Preflight is typed and fail-closed:** unknown protocol, uncertified
   capability, disallowed data class or exceeded resource profile all raise
   `ENGINE_CAPABILITY_DENIED` before any engine call.

## 3. Implementation evidence

- [x] Manifest + schema with one pinned release and two certified
  capabilities; loader validates schema, domain model, uniqueness and
  release references.
- [x] Inspector verifies installed `quantbt-engine 1.0.8` canonical RECORD
  fingerprint `0963c05b…73c9` matches the pin under pip and uv.
- [x] PreflightService now runs capability preflight for every preflight and
  run submission (protocol, dataset source class, optuna trials, parameter
  space size); existing API/run flows stay green.
- [x] Read-only `/api/v1/portal/capabilities` endpoint (405 on mutation).
- [x] BE suite: `13` tests (manifest load, installer-independent
  fingerprint/payload sensitivity, installed-wheel match, fail-closed
  mutations incl. app composition, certified acceptance, unadvertised/
  uncertified rejection, resource bounds, data-class gating, synthetic
  capability via manifest-only, endpoint safety).
- [x] Full Portal backend regression was `329 passed, 1 skipped` at delivery;
  the 2026-08-18 canonical-fingerprint remediation passes `387 passed, 1
  skipped` plus all `13` focused capability tests. Full Planning backend
  `18 passed`; contracts workspace sync includes the endpoint; workspace
  verification passes including the protected strategy hash.

Technical debt and rollback:

- Control API capability registry tables and the Endpoint Explorer UI are
  later U12 slices; protocol dispatch remains code-based behind the manifest.
- Rollback: revert the BAR-09 commits; the manifest is additive and existing
  run flows are unchanged.
