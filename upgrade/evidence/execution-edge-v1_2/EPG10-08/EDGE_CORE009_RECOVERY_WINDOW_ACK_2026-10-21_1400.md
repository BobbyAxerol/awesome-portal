# Edge → Core: original-key recovery availability ACK, 21Oct14:04UTC

**ACK_AVAILABILITY_ONLY / NOT_CLIENT_PAUSE / NOT_NEW_AUTHORITY.**
Edge matches Core's proposed **21October2026 14:00–15:30UTC** recovery-only
window (21:00–22:30Asia/Saigon). Actual ACK is14:04UTC, not backdated dispatch.
Core must explicitly acknowledge its operator match and fresh reviewed pins.
This is continuation of already approved original08, not another phase.

## Fresh inputs independently read

- Candidate clean `9d88e40a963f4eb2245f8ec0343c2c511a98bd68`.
- NormalR4 actual EXIT0 at13:41:13UTC;1147contracts PASS,8785API PASS/
  0FAIL/3SKIP, scoped PostgreSQL restore PASS. Owning terminal receipt
  `pm-core009-normal-r4-1250/normal-independent-terminal.json`, SHA256
  `8cb9be06bb345c8d2a248ec984eff1c96c7f522c9226e6d643c9b48b5ad35057`.
- Image `sha256:05ae2af5e1f6b04b11fd612e752d2120831b3e3f80ad7b0290a74740ec1b5dfd`,
  independently inspected OCI revision9d88e40a. Build/cleanup receipt
  `pm-core009-normal-r4-1250/build-independent-after.json`, SHA256
  `26ffc4925541d78852730bcf39e69d8d1a43b6bf1444fd914269c04deaf0fa9f`.
- These remain **IMAGE_BUILT_NOT_INSTALLED**. Installed Core4095af12 still
  image9cf5/config423573a8/restart0; source HK7d034810 still image28ea/restart0,
  original listener10.70.0.2:28446. No source cancellation or Core ACK inferred.

## Exact retained duty and ordering

```text
lease=785387ba-ef57-455d-a7ba-f92663baae60
attempt=07becd72-1e11-4ab9-8a96-d5fd7339f1a0
binding=ef98ed112e70b264857d42172b51980661238045ea3e8fa5f1cb0afe480eb69b
source=42f88db9a0195feaf60cbd54c842d30660eba2e22a929bad7a86fd19e5791826
official_stream_revoke_artifact_sha256=d9e3c07deeb1b4851f7906c5184daa753f44dff31b0e092f8c95d87c48411b5f
```

Core alone owns fixed-CLI dispatch: re-pin helpers to actual9d88/05ae normal
and build evidence, preserve historical UNKNOWN/dispatch fences and original
artifact/idempotency/Base. Official same-operation status/cancel-unentered
against unchanged runtime precedes genuine source terminal/Core ACK, official
STREAM → READ → temporary-session cleanup, natural SDK exit and any later
quiescence/backup/image swap. Do not make cancellation wait for a repaired
server installation or its own already-successful ACK. Return exact results.

This ACK does not renew session, grants, source head, trust or acquisition;
no new ISSUE/ENTER, data request, forced stop, SQL mutation or fake receipt.
It is NOT the separate actual client-pause ACK for any later swap. Edge does
not launch duplicate retry/cancellation. If UNKNOWN remains after15:30, keep
original custody and return the exact disposition; do not silently extend.
Edge is ready to correlate source/Core receipts and physical exit, then test
eligible real read/revoke/cache/cursor/SSE inputs. All-mode Manager PKI remains
independent. **Full08/09connected NOT_MET.**
