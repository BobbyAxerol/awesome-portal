# Core → Edge: G9 closed — READ-only install plan implemented (addendum to the Core preparation return)

Public text only: **no secret, no key bytes.** Nothing here is SDK_READY, a grant,
a session, a ready document or a connected PASS.

## 1. What changed

Gap G9 of `CORE_TO_EDGE_M0_R2_CORE_PREPARATION_RETURN_20261112.md` §3 is decided by
Bobby: option (b), a READ-only install plan. Core implemented it.

| Item | Value |
| --- | --- |
| Core commit | `a5b66cf3f` on `claude/slice-followthrough`, fast-forwarded to `docs/research-loop-plan` (not pushed) |
| Plan name | `grant_window.plan = READ_ONLY` (the existing `READ_AND_STREAM` is unchanged) |
| Effect | installs **exactly one** finite READ grant (`business.read_all`); **no** STREAM grant; the install ACK reports `authority_scope DOMAIN_READ_ONLY`, `stream_commissioned:false`, `plan:"READ_ONLY"` |
| Caps kept | grant ≤ 7,200,000 ms (2 h) and never beyond the renewed source trust, for the single READ grant too |
| Refused | a READ_ONLY pin over an artifact that also carries a STREAM grant; a pin plan that disagrees with the validator plan (both directions); a grant longer than the pin; a grant outliving the trust |
| Gates actually run | vitest, 6 spec files, **118/118 pass** (new `be-p10-read-only-plan` plus the Plan B installer, CORE-009 preparation and validator, templates and ready-producer specs); `tsc --noEmit` clean. Full pre-commit hook **not** run (docs/in-slice, scoped gates only) |

Not changed: stable, dev, provider 28445, any runtime flag. The shared Plan B
template stays READ_AND_STREAM; READ-only is a pin value, not a new default.

## 2. Consequence for the ready document

With the READ_ONLY plan the document carries `stream_authorized:false` and no
`stream_*` / `source_set_ref` fields, which the Core producer (`4dce48c5a`) and
Edge's `connected_read.py` both accept. READ does not grant STREAM.

## 3. Manifest bounds (Bobby approved the conservative set)

Applied to the private draft `runtime.json.draft` (outside Git, 0600, not mountable),
plan READ_ONLY, max grant 7,200,000 ms. **27 distinct fields stay open**, none invented:
8 hex64, 7 text, 5 ms values, 4 sha256-prefixed, 3 paths, 2 ISO times, 1 UUID, 1 URL.
Their owners are unchanged: Edge/TS for N1–N9 (workload id, audience, PM leaf, source
origin, TLS refs, source bounds, seals, fingerprint, native acceptance); Core for dates
once the slot is confirmed.

## 4. Still open (unchanged, restated)

| ID | Needed | Owner |
| --- | --- | --- |
| N1–N9 | TS source receipts | Edge / TS |
| N12 | TS protected-owner / SDK mapping for `usr_5a38d5df…`; Bobby names his TS account | Bobby, TS via Edge |
| N13 | full SHA256 of the r2 contract (Edge cited only `81a3c328`) | Edge |
| N5a | source PKI subject / SAN / EKU rules for the Core client CSR | TS PKI owner via Edge |
| N14 | confirm Core may state `api_ip` in the ready document | Bobby / Core |
| — | owner artifact: approval reference and policy digest; install and rollback operators | Bobby |

Slot proposal unchanged: 13Nov07:15–09:15Z; grant 07:00–09:00Z issued at consumption;
step 5 epoch only immediately before consumption. No contact with TS.

## 5. Integrity

SHA256 is in the sibling `.sha256`; mirrored to the HK EPG10-08 mailbox.
