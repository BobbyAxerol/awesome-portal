# Genuine runtime factory qualification

This focused TEST_ONLY specimen supplements the immutable
[43-file source profile](../current-core-runtime-profile/README.md); it does
not change that profile, install authority or qualify connected reads.

`runtime-factory-pg.spec.ts` must run in `apps/control-api/test/` of an isolated
exactly applied Core5291 source closure. It uses the real filesystem, private
file protections, Ed25519/TLS material, runtime loader, composition, PostgreSQL
target introspection and AppModule factory. No filesystem/composition mocks.
Generated test keys stay in the disposable worker's tmpfs and are removed.
The selected PM origin is an intentionally unserved loopback endpoint; no PM
permission, real Portal login or network-delivery claim follows.

The target guard requires `EPG10_08_NATIVE_READ_TEST_ONLY=1`, a disposable
`control-api-test-postgres-<digits>/native_core_read_test` URL and the independently
captured stable ledger SHA. The 39 checked-in migration names through0036 must
match actual stable ledger SHA
`758c9056103f8a40714a0084e566731dafba7848ee7c8232e374da6dde4b2531`.
Only then are their Up bodies applied, followed by the reviewed132/134/Candidate
additions using `CoreNativeInstallation`; no future-migration harness is called.
Fixture users are explicitly TEST_ONLY, not production copies or grants.

Included companion source `core-native-installation.ts` SHA
`c2429fab2833dbb7b72d132232e4ad5f79b53725bb360f546a5aa28ed7e21fe9`
is an unchanged copy of the reviewed maintenance component, not a second
installer or a new runtime dependency. Copy it into the specimen's
`src/execution-v2/`. Copy the included `runtime-native-schema-golden.json` to
`test/fixtures/`; its SHA is
`a4f60de14ef01dd1a25f30241f246205193feb029efd8efde19f36a6cc5398fb`.
This bounded fixture contains schema definitions only, no source business rows.
Its independent `schema-reference.spec.ts` export uses another fresh specimen
and the existing manifest encoder; inspect and pin the reference before using
it as expected. The original finite golden does not cover the current SSE SQL
and remains immutable. Never derive expected schema from a live target or use
these test-only guards as an instruction to commission the actual stable DB.

Actual result: strict compilation PASS and seven genuine factory cases PASS,
zero failure/error/skip, in a fresh HK specimen. One separate independent
reference-export case PASS. The initial old-golden setup failure and its seven
skips are preserved, not relabelled green. See [qualification.json](qualification.json)
for source/terminal/JUnit pins, unchanged40runtime tuples and exact teardown.
The extra1163-file source copy20.4MB was removed; test keys died with tmpfs.

Results, failed attempts, exact source/executor hashes and cleanup must be
recorded in the [original08 journal](../../../EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md#23207-original08--actual-provider-owning-boundary-and-connected-acceptance).
An inert mounted factory does not authorize reads or prove revoke/cache/cursor/
SSE against genuine PM. Those remain in the original08 connected exit.
