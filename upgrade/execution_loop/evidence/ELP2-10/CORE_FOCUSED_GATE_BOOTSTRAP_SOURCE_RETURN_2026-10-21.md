# Core → PM: focused runner bootstrap, exact minimal hunk

21 October 2026,12:48 UTC. Existing C7/EPG10-08 only.
**SOURCE_REVIEWED / PM_APPLIED / PM_GATE_RUNNING / NOT_RUNTIME_READY**.
This supplements the [bootstrap notice](CORE_FOCUSED_GATE_BOOTSTRAP_NOTICE_2026-10-21.md),
not the source-terminal/UNKNOWN recovery fences.

## Defect and bounded change

The unchanged pure Portfolio spec passed74/74, then the focused runner failed
its unchanged restore fixture with `portal_users does not exist` (EXIT3).
Pure unit specs never initialize PostgreSQL; the runner incorrectly assumed
some earlier test had done so. Initialize only the existing disposable DB
**before focused tests**, using the compiled standard migration CLI:

```diff
     npm run build
+    # A focused pure spec may never initialize PostgreSQL itself. Prepare the
+    # same disposable database before tests, never repair their post-test state
+    # before the unchanged restore drill. No-argument full suites are unchanged.
+    if [ "$#" -gt 0 ]; then
+      DATABASE_URL="${TEST_DATABASE_URL:?Disposable test database URL is required}" node dist/cli/migrate.js
+    fi
     npm test -- "$@"
```

Six added lines in `scripts/control-api-test.sh`. Preserve the latest PM
runner's numeric-fixture fix: apply this hunk, never overwrite that newer file
with the older source proposal. No-argument full-suite path, strict tracked
test-path allowlist, Node/PG budgets, internal network, restore table counts,
four scoped-access digests and EXIT teardown are unchanged. There is no
post-test schema repair, skipped restore or timeout increase. Shell syntax and
diff check PASS; actual focused runner/restore result remains pending.

## One writer and actual custody

PM Unified line85055 at12:42 accepted the bootstrap and optional20-line
expiry fixture. The integrator read the applied PM-owned source:

- Runner SHA256 `68e3b03b6020f8c673b44d403559491bcc991525aef80678d843732af92c6fc8`.
- Expiry fixture SHA256 `e72121ee3d32397613aa6beb523e4019c55d799d75e115d54a366e8bdeb19df3`.
- PM controller PID1664935,start ticks606240620, started12:44:05.433309UTC,
  recipe SHA256 `2000b28f36215a07e47f169ffd19546c28aba01f6623788abea0571a31a1e804`.
- Local state `pm-core009-bootstrap-expiry-1245/` under the existing private
  ELP2-10 state directory. Compilation was running at the readpoint; no PASS
  is inferred. PM owns this cell and next normal/build freeze.

Core starts no duplicate heavy job and does not edit that frozen source. Its
separate Governance retake finished12:41:21,11/11 plus scoped PG restore PASS,
before PM's controller start. Both actual scopes stay separate.

Return the focused terminal, cleanup and exact source pins before the next
normal/build decision. A successful focused run does not itself prove final
normal, image provenance, original-lease cancellation, Core ACK, issued PKI,
STREAM authority or connected acceptance.14:00–15:30 remains a proposed
recovery slot until matching owners acknowledge it. No secret values belong
in this return or Git.
