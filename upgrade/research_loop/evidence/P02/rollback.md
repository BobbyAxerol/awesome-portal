# P02 rollback and non-interference

P02 has no database migration, runtime service, deployment input, feature flag,
or protected-source edit. Rollback is a normal revert of the P02 harness and
evidence packet. It leaves:

- existing Execution Loop source and contracts untouched;
- existing Control API run/governance records untouched outside the isolated
  test database;
- existing Portal sessions, credentials, images, containers, and production
  configuration untouched.

The ignored constraints-installed `apps/portal/.venv` is retained for later
Research test phases. Removing it is optional local cleanup only and is not a
rollback requirement.
