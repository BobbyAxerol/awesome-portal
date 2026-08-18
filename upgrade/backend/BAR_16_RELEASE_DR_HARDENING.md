# BAR-16 — Release, DR & hardening foundations

> **Version:** 0.1 · **Status:** complete (release report + hygiene scan) ·
> **Updated:** 2026-08-16
> **Unified phase:** U19 · **Guide:** U19 Release/DR/Open-Source

`apps/portal/scripts/export_release_report.py` produces the credential-free
`upgrade/backend/bar16/release-report.json`: commit/protected-hash/freeze
digests, documented backup commands (pg_dump/minio mirror/sqlite copy — never
executed here), the DR restore checklist and a tracked-source secret-hygiene
scan (tests + marker allowlists excluded; planted secrets detected).
`tests/test_release_report.py` (**4 tests**). No change was pushed or
deployed.
