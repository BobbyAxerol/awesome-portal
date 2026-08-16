# BAR-13 — Live Control & Operational Safety foundations

> **Version:** 0.1 · **Status:** complete · **Updated:** 2026-08-16
> **Unified phase:** U16 · **Guide:** v0.4 §10.6–10.7, §12.5–12.8

Signed/expiring/idempotent deployment intents, dual approval with short-lived
step-up grants, fail-closed stale/unknown-state blocking, audited break-glass
and the incident state machine (OPEN→ACKNOWLEDGED→RESOLVED→RETIRED). The
risk engine stays the final authority; Portal never emits raw normal-UI
orders. `services/live_control.py` + `tests/test_live_control.py` (**7
tests**). No change was pushed or deployed.
