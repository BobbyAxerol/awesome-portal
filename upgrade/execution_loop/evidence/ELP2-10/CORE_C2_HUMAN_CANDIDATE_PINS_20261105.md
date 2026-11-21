# Current-human candidate configuration pins — 2026-11-05

**SOURCE ONLY; not an installed issuer, authenticated P7 acceptance, or
restore barrier.** On `docs/research-loop-plan`, committed base
`2faa8968fddbde59b2e59525e334ba3d83886144`, with existing uncommitted WIP.

## Change

`CurrentHumanCandidate` used TypeScript-only private properties for its pool,
signing/source configuration, human verification key, and trust digests. The
instance could therefore expose its configuration as an ordinary property and
its selected values could be replaced after construction. These values are now
kept in ECMAScript private fields; the copied source and limits and the outer
configuration are frozen. A test shadows the former property names and checks
that owner issuance still uses the initially selected pool and signing key.
This is a hardening of an unmounted candidate, not a claim that untrusted JS
inside the process or a privileged database administrator is contained.

The preparation issuer's `C2_P7_AUTHORITY_NOT_COMMISSIONED` fence remains in
place. No source, P7 authorization, signing key, credential, migration, runtime,
grant, frontend or live command was installed or changed. Completion still
requires authentic P7 acceptance and same-fence delivery, an independent
old-holder fence, complete post-snapshot terminal/ACK census, restore rehearsal,
and connected/source qualification.

## Validation and cleanup

- `bash scripts/test-elp2-restore-inventory-rls.sh c2-owner`: **19/19 PASS**
  with two disposable PostgreSQL clusters. This includes the new property
  shadow case, owner/session and workspace negatives, revoke, same-original
  restart, and terminal handling. It is not a genuine owner or Edge test.
- `bash scripts/test-elp2-independent-custody-pg.sh`: **5/5 PASS** after this
  change, with two disposable PostgreSQL clusters and test mTLS. This retake
  updates the transitive issuer input of the earlier terminal-composition receipt.
- Focused issuer composition, transport and native runtime/selected-HTTP tests:
  **65 PASS, 33 SKIP** across 4 files, exit 0. The selected-HTTP PostgreSQL
  suite had no `TEST_DATABASE_URL`, and is not counted as passed. The first
  host run exited 1 with `listen EPERM 127.0.0.1` in the sandbox (21 failures,
  44 pass, 33 skip); the retake permitted local loopback and is the result
  above. These local TLS results do not constitute a connected Edge test.
- The scripts' own ephemeral containers and networks were removed. A broader
  read-only check found a separately named PostgreSQL container created at
  13:39 UTC and still running; it predates these cells and was left untouched.
  Neither the full semantic typecheck nor normal hook has passed yet.

| Local source/test | SHA-256 |
| --- | --- |
| `current-human-candidate.ts` | `3c3b8745ba62a64b572ce9b3989495c7a2110111d95be1c104413b708aee4701` |
| `c2-owner-issuer-pg.spec.ts` | `3c4d2905c487df1a29fedc65849eb4873947f740d72661769f8975e470b82536` |

Next backend: genuine same-fence P7/issuer and V2 recovery authority and
fencing; rerun affected qualification tests on the frozen candidate. Claude:
no UI contract change. Edge: this change does not provide A2 or require new
secret material; the previously identified connected steps remain open.
