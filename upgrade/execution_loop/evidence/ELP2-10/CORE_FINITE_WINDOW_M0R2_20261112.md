# Core finite window for the first bounded READ (A4) — PREPARED, nothing issued

Prepared 2026-11-12T10:52Z. UTC checked against the Core host clock; **every instant below is in the
future** (earliest 2026-11-13T07:00Z, latest 2026-11-13T10:00Z, 23 h after this file). No window from an
earlier proposal is reused: the earlier `07:00–09:00Z` grant is **replaced** because consumption was
`07:15–09:15Z` and a grant ending at 09:00Z cannot cover reads in the last quarter hour.

| Window | Start (UTC) | End (UTC) | Length | Owner | Note |
| --- | --- | --- | --- | --- | --- |
| Slot (consumption) | 2026-11-13T07:15:00Z | 2026-11-13T09:15:00Z | 2 h | Edge/Core | unchanged |
| Fresh epoch (step 5) | 2026-11-13T07:15:00Z | immediately before consumption | — | Edge | never earlier, never overnight; predecessor `01a05c70-…` |
| Installation intake (owner artifact may be installed) | 07:10:00Z (`1794553800000`) | 07:50:00Z (`1794556200000`) | 40 min | Core | intake only, not a grant TTL |
| **Single READ grant** | **07:15:00Z (`1794554100000`)** | **09:15:00Z (`1794561300000`)** | **7,200,000 ms exactly = the 2 h ceiling, not above** | Core issues at consumption | no STREAM grant, no DENY |
| Seal / domain validity | 07:00:00Z | 09:15:00Z | contains the grant | Core | |
| Renewed source trust + native acceptance, **requested** | effective ≤ 07:10:00Z | expires ≥ **10:00:00Z** (`1794564000000`) | 2 h 50 min+ | TS (lifetime review requested) | must outlive the grant end by ≥ 45 min; native lease/JWT not extended |
| Installation scope / installation_expires | — | 10:00:00Z | ≤ trust end, ≤ 24 h from now | Core | |
| Portal acceptance session | issued after install, ~07:20–07:30Z | `issued + 2,700 s` (45 min) | 45 min | Core | not issued; the token path template rules apply |
| Runner start (latest) | — | `session_expiry − 630 s` | — | Edge | e.g. session issued 07:25:00Z → expires 08:10:00Z → runner must start by 07:59:30Z |
| Ready document timestamps (`expires_at`, `trust_expires_at`, `native_expires_at`) | — | each strictly later than runner start + 30 s | — | Core | the 600 s reserve is **not** applied to them |

**Reserve split (as Edge's runner defines it):** global test deadline 30 s; the Portal session must
still have at least deadline + 600 s = **630 s** at runner start (exactly 630 s passes). Native
lease (60 s), human JWT (60 s) and the source bound (5,000 ms, 32,768 B request, 32,768 B response,
1 in flight) are **unchanged**; no TTL is lengthened to carry the 630 s.

**Issuer / audience / keyset:** human issuer `portal-control-api.native-manager-read`; Core signing key
id `research-core-20261112-6e988815aebe` (public DER SHA256
`6e988815aebe53a28c89a9cd3aabf452a6b6920bffa10e7ef6d335d99b3c192`, already delivered); **audience =
UNRESOLVED**, it is the PM audience of the fresh trust bundle (TS, N1/N3). Workload id, source leaf
SHA256 and source origin are likewise **UNRESOLVED**, owner TS via Edge.

**Request to TS (via Edge):** review that the renewed trust and native acceptance can be valid from
≤ 07:10Z to ≥ 10:00Z on 13 Nov (a shorter end is acceptable only if it is later than 09:15Z), and
return accepted / CHANGE with the exact end.

**Late start:** if the epoch cannot be activated by 07:20Z, the slot is re-coordinated; Core does not
stretch the grant or reuse an expired window. The grant ceiling stays 2 h.
