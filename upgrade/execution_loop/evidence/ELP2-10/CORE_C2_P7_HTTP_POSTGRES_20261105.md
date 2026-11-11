# P7 HTTP/session and PostgreSQL composition — 2026-11-05

**SOURCE ONLY; A2 NOT_READY; B2 NOT_SIGNED.** An isolated test now combines
the real Nest/Fastify controller, session guard, session and workspace
repositories, mutation security, P7 candidate services and PostgreSQL in one
process. The identity, session, owner step-up, source attestation and database
are all synthetic; no real owner acceptance or delegation is asserted.

The test checks anonymous refusal with `private, no-store`, authenticated
preview, CSRF refusal, rejection of a caller-supplied workspace, successful
preparation tied to the same database session, absence of the test session and
proof in the response, and denial of recovery after session revocation.
Success remains `P7_PREPARATION_RECORDED_NOT_AUTHORIZED`.

- `bash scripts/test-elp2-c2-p7-pg.sh owner-intent`: **5/5 PASS**, exit 0 on
  disposable PostgreSQL. The script's teardown completed; a subsequent
  read-only container inventory found no `elp2-c2-p7` container.
- `git diff --check`: exit 0 for tracked changes. The new test is untracked and
  its local SHA256 is
  `15360917e6e3ba15095730a149bad9cff79dd3aa694ecc92a289001179b516cf`.
- No runtime, shared database, real grants, credentials, UI, command/Live,
  dev/main/stable or remote refs were changed.

This does not establish a commissioned source, real current owner/step-up,
the issuer's same-fence HTTP delivery, listener, acceptance/delegation, full
typecheck, normal hook or connected A2. Recovery V2 still requires an
independent cutover barrier and post-snapshot terminal/ACK reconciliation.
Claude has no new UI field to consume from this test; review remains dark.
