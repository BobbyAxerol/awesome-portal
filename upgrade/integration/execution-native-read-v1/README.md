# Original EPG10-08 — qualified Core source publication

This is actual source code in a guarded patch, not another transport, generated
runtime state, deployed authority or an activation receipt. The patch preserves
the exact authored source tested in the 213-case qualification. It belongs to
the existing `awesome-portal` repository; no nested repository or dependency
cache is included.

Read the [main journal](../../EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md#23207-original08--actual-provider-owning-boundary-and-connected-acceptance)
and [current bounded qualification](../../evidence/execution-edge-v1_2/EPG10-08/native-current-manager-notice-port.json)
first. `manifest.json` pins each preimage and qualified output; `qualified.patch`
contains the complete 26-file delta against Core `0d5ceaba3281cd51e8dd2f7caebc9a7b8e82db05`:
23 latest authored files plus three earlier Manager reducer/binding prerequisites.
The complete 697-file qualification closure is hash-pinned, not copied wholesale.

## Safe application and parallel source

Use a separate feature checkout containing the exact Core preimage, never apply
to the operational release or a peer's dirty checkout/index. From that checkout:

```sh
python3 -B /path/to/edge/scripts/epg10-08/publication.py \
  --packet /path/to/edge/upgrade/integration/execution-native-read-v1 \
  --target "$PWD"
git apply --unidiff-zero --check /path/to/edge/upgrade/integration/execution-native-read-v1/qualified.patch
git apply --unidiff-zero /path/to/edge/upgrade/integration/execution-native-read-v1/qualified.patch
```

The patch uses zero context so unchanged source whitespace is not encoded as
new trailing whitespace in the publication file. Exact whole-file preimage
hashes, not relaxed context matching, are mandatory before applying it.
The verifier is read-only. Exact already-applied files are a no-op only when
the entire set matches. Any changed preimage, partial application or symlink
refuses; never use `--reject`, force, an overwrite or a relaxed permission check.

Current Core `ff83f176` has later changes overlapping four touched files:
`access.service.ts`, `read-scope.ts`, `current-source.proxy.ts`, `test/harness.ts`.
Preserve those changes and reconcile in an isolated feature checkout. The old
213-case receipt is NOT acceptance of that reconciled source or current Core.
Recheck exact dependencies and run affected compile/contracts/integration cases
before consumer mounting. No change to AppModule, DB, grants, secret references,
listener, runtime flags or protected owner occurs merely by applying this patch.

## Evidence and remaining work

The 213 cases are 145 pure +68 disposable PostgreSQL fixture cases, zero
failure/error/skip, with full production and seven-spec strict compilation.
PM protocol in these cases is synthetic. Receipt hashes and the complete source
manifest are in `manifest.json` and `qualified-source-pins.json`; these prevent
an unchanged source from being retested just because a separate owner advances.
They do not waive tests of changed source/dependencies, real PM current authority,
authenticated identity commissioning, runtime HTTP/SSE revoke/cache/cursor or
command-COMMIT qualification.

Original08 remains IN_PROGRESS/NOT_MET. Continue current-Core consumer/provider
binding in08, command transport in07, capture in03 and budgets in01/06; then09
connected,10 cutover/rollback and11 acceptance. Catalogue families are logical
contracts, not an assertion that all routes/history/commands are activated.
