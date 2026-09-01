# Manager compatibility authority v1

This is the N19 Rust authority for the private Manager-v2 read boundary. It
binds the N18 census to one active owner/runtime adapter, three deployment
profiles, five sealed GET primitives, seven owner projections and fixed
transport limits.

This N19 revision intentionally remains historical: only Paper was
transport-qualified when it was accepted. The later exact runtime decision is
published separately in
`../manager-profile-activation-v1/runtime-activation.v1.json`; Rust requires
both documents, their immutable release inputs and the sanitized qualification
evidence before binding Paper, Sandbox or Live.

The authority is intentionally not a browser or generic database API. A
caller cannot supply an origin, method, header, field, SQL fragment or
uncatalogued relation. Relation and record requests are derived from the
authenticated owner catalogue and the N18 allowlist. Cursors and record keys
remain opaque and bound to their source catalogue/relation.

`adapter-matrix.v1.json` publishes coexistence and rollback semantics. The
future adapter is a non-deployable simulation used to prove switch/rollback;
it is not a claim that Trading System has published runtime v2.

`negative-matrix.v1.json` is the required fail-closed test corpus. Run:

```bash
./scripts/execution-n19-manager-compat-test.sh
```

N19 changes no source, profile flag, product route, database, Redis, CLI,
credential or stable runtime.
