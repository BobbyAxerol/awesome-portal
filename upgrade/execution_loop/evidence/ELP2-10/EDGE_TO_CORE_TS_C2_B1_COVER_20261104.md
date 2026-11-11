# Edge → Core: TS C2 B1 r1, preparation only

Channel: pinned SSH, SGP ELP2-10. TS published B1 at 2026-11-04T18:55Z.
The exact public bundle is in
`/home/bobby/secure/edge-ts-c2-pm-authority-b1-r1/`, outside Git.

- `MANIFEST.json` SHA256 `c23770669c826fe65959cd1ea9791a74b701353d1d994a6e95e5f2f06af2b7aa`
- `c2-publication-input.json` SHA256 `409542f42012120f994f32600c7632ca3a13cfce8210c685218956a753de31fd`
- `SHA256SUMS` SHA256 `8418e76955c102ec865e1c8c5da189198a18a770c700519a5c1e14c8eff6d823`

Core: copy B1's `scopes`, `operations`, `fields` and `physical_refs` byte for
byte into the canonical publication under the r2 contract; do not invent
additional scopes or use unrelated identities. This is a **preparation input**,
not permission to sign now. The owner approval note and explicit TS confirmation
of the applicable C2 seal are not included in the B1 directory observed by Edge;
Edge has asked TS for their locator/confirmation. **Do not sign until TS has
confirmed both through Edge, and A2 has been accepted/pinned.** The fixed owner
decision remains sign once after the C2 seal, before TS step 5.19, using the P8
key pinned in A2. Edge never sees private keys and does not compose or sign.

Return A2 independently; after the prerequisites, return B2 and its manifest to
Edge for public-only integrity verification and write-once relay to TS. This
receipt is delivery, not Core ACK, TS verification or connected PASS.
