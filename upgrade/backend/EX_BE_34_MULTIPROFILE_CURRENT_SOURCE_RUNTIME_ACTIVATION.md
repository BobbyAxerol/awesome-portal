# EX-BE-34 — Multi-profile current-source runtime activation

Date: 2026-09-01  
Status: `IMPLEMENTATION_QUALIFIED / AWS_SOURCE_TRANSPORT_QUALIFIED / EDGE_IMAGE_DEPLOYMENT_PENDING`

## Goal and scope

Activate the maximum semantically valid Manager-v2 read surface already
published by Trading System for Paper, Sandbox and Live while preserving the
reviewed rich UI. Data-state truth is panel-local: source-backed rows render as
data, a valid zero-row response renders typed empty, and transport/contract
failures remain typed unavailable. No whole-screen envelope replacement is
authorized.

This slice does not change Trading System code, connect a command, expose raw
relations to the browser, or grant Live mutation. Canary is Portal governance
composed over the exact Live facts and therefore uses the Live read profile;
it is not a fabricated Trading System environment.

## Authority design

The historical N19 matrix remains unchanged: it records that only Paper had
been transport-qualified when N19 closed. The additive
`manager-profile-activation-v1` contract binds:

- the immutable N19 matrix and active Manager-v2 runtime-v1 adapter;
- the N22 Paper, N23 Sandbox/Live and N29 product release profiles;
- exact profile, audience and `execution:manager-v2:read` tuples;
- sanitized multi-profile TLS/mTLS/JWT qualification evidence; and
- authoritative-empty semantics for every exact profile.

Rust requires both the historical matrix and the new activation contract.
Unknown environment/profile/resource/revision combinations, generic origins,
command resources and adapter widening still fail closed. Projection,
analytics and SSE retain their ordered, independent runtime gates.

## AWS-HK qualification result

The same root-owned Source Proxy identity now has one CA-signed server
certificate with exact SAN coverage for the Paper, Sandbox and Live bridge
addresses. The key was generated and retained on AWS-HK; only its CSR left the
host for signing. All three Source Proxy containers are healthy with zero
restarts.

The bounded `strategy_deployments` probe returned:

| Profile | Result |
|---|---|
| Paper | accepted N22 source-backed rows; current multi-profile proxy healthy |
| Sandbox | HTTP 200, `AVAILABLE/FRESH`, five source-backed rows |
| Live | HTTP 200, `AVAILABLE/FRESH/COMPLETE`, zero rows — authoritative empty |

Only sanitized body digests, byte counts and row counts are committed. No
token, credential, raw business row, DSN or private key is stored in Git.

## Tests completed for implementation

- activation/evidence JSON parse and SHA manifests;
- N18 census and N19 matrix digest parity;
- exact three-profile/audience/resource set;
- historical future-adapter qualification and rollback semantics;
- wrong environment/profile/resource/revision rejection;
- all 96 relation and five Manager primitive bounds;
- exact decimal/cursor/catalogue drift handling; and
- Rust format plus `manager-compat-authority` unit suite: 8/8 pass.

## Ordered runtime closeout

1. build one immutable Edge image from this contract;
2. deploy that same content address to the three isolated profile runtimes;
3. prove Paper/Sandbox rows and truthful empty Live through the private Edge
   and same-origin Control API;
4. run N24 projection completion/parity before N25 query/analytics;
5. activate N26 SSE only after a complete active projection epoch; and
6. keep N27 command relay disabled unless an exact currently published command
   contract and dedicated authority pass separately.

Rollback disables the relevant Control API profile first, then returns that
profile's Edge image/config to the prior immutable release. It never rolls
back or edits Trading System data.
