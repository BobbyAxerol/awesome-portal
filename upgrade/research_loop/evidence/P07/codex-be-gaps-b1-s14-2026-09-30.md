# B1 CG-FG-S14-02/03 — Registry activation and run-version precheck

The P07 registry now returns `may_activate_reason` from the caller's role and the exact version/import/current-active facts. A non-imported fixed version is not offered the import-only Activate action; SUPERSEDED/ABANDONED versions are not offered it. ACTIVE current-version replay remains allowed. Registration returns the caller-specific reason as well.

Each registry entry also returns `run_admission {may_create_run, code}` from the same version-level precheck used by P10. It checks account eligibility, producer/imported feature fences, lifecycle and the installed immutable adapter binding in the existing bounded registry SQL query. A positive precheck **does not authorize POST create**: requested-spec, fresh preflight, capacity and lease are still evaluated by P10. The UI must not treat the list fact as a run token.

Verification: Control API TypeScript build; P07 disposable PostgreSQL 9/9 including true imported DRAFT precheck and USER denial; canonical JSON-schema fixture; generated `research-alpha-import.d.ts` and snapshot check. No frontend, runtime flag or migration changed.

Frontend handoff: regenerate the P07 client; show the typed activation reason and use `run_admission` to decide whether to offer New Run. The actual link behavior remains the separate Bobby decision VD-FG-01-32; no client route was changed here.
