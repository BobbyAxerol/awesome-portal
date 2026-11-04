# Research preview bootstrap observation — 4 November 2026

This supplements [the read-only image inventory](CORE_PREVIEW_RUNTIME_READ_ONLY_20261104.md)
and does not amend its mirrored bytes. At approximately 23:40 UTC, the same
preview container and image were inspected read-only. PID 1 was `docker-init`;
its Node child PID 7 executed `dist/main.js`. Only presence of named
environment-variable keys in the original process environment was reported;
no values, private paths, tokens or credentials were output or saved.

The Node process's original environment did not contain any of:

- `CONTROL_API_NATIVE_CORE_CONFIG_FILE` or `CONTROL_API_NATIVE_CORE_CONFIG_SHA256`;
- `CONTROL_API_CURRENT_VIEW_CONFIG_FILE`;
- `CONTROL_API_FINANCIAL_SOURCE_CONFIG_FILE`;
- `CONTROL_API_NATIVE_CURRENT_CONFIG_FILE`;
- `CONTROL_API_COMMAND_STATUS_CONFIG_FILE`;
- `CONTROL_API_NATIVE_ROOT_CONFIG_FILE`.

The image label declares Git revision `05ab409900bdd87dffc6ed0c6b0c4a9dfa5d1af0`.
At that declared source revision, `src/main.ts` selects the respective native
compositions through these references and skips them when the references are
absent. This is strong evidence that the ordinary configuration has not
commissioned those compositions in the inspected process. It is not a proof
of a reproducible image build, a complete census of other containers, a live
HTTP route test, current grants, schema, TLS trust or an external source. An
image label and `/proc` environment alone must not be used as an A2 READY or
as evidence of connected READ/STREAM, financial publication or STATUS ACK.

Next: a candidate installation must use an explicitly verified source/image,
schema and Research-only trust/binding, with approved backup/rollback and
the source/authority wire semantics resolved. This observation itself does
not authorize installation or changes to a running environment. No container,
database, credential, configuration, permission, service, command or Live
state was changed.
