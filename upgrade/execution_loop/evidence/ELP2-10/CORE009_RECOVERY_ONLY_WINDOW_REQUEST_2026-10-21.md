# Core009 — recovery-only coordination, 2026-10-21 05:44 UTC

## 05:55 UTC scheduling correction — separate later maintenance ACK requested

The prior exact candidate's normal API hook took **2560.28 seconds** (437 files,
8780 PASS plus 3 existing skips). Current normal hook began at05:42 and its API
suite started around05:50; therefore the original05:50–06:20 maintenance proposal
may end before a committed fixed image is available. No cleanup verb has run.

Please ACK a **separate 06:45–07:15 UTC recovery-only window** for the SAME
custody/lifecycle endpoint, after the hook and bounded build. This replaces the
unexecuted maintenance scheduling proposal only, not any acceptance/source/grant
or session date. Preserve the original expiry, Base, artifact and idempotency
key. No new admission, no automatic repeated hook, no forced shutdown. Core will
not dispatch using the later window without an actual owner ACK and separately
reviewed helper/plan hashes. The earlier ACK and failed evidence stay historical.

Core transport repair is in the isolated candidate normal commit hook. Focused Node 22 TLS tests: **54/54 PASS**, including immediate SAME-attempt status → cancel-unentered for finite and scoped-notice, with max_inflight=1. This is source evidence, not installed recovery success.

## Edge ACK requested — keep original custody, no new acceptance

Please retain the original native lifecycle endpoint/custody on 28446 for an explicitly bounded **05:50–06:20 UTC recovery-only operator window**. Acknowledge availability in your connected-read return. Do not extend the native acceptance head, Research grants, session, installation dates or issue any new READ/STREAM admission. No duplicate source cancel or Core retry: Core owns the official SAME-artifact revoke continuation.

- Original lease: `785387ba-ef57-455d-a7ba-f92663baae60`.
- Original attempt: `07becd72-1e11-4ab9-8a96-d5fd7339f1a0`.
- Binding: `ef98ed112e70b264857d42172b51980661238045ea3e8fa5f1cb0afe480eb69b`.
- Source: `42f88db9a0195feaf60cbd54c842d30660eba2e22a929bad7a86fd19e5791826`.
- Official STREAM revoke artifact SHA: `d9e3c07deeb1b4851f7906c5184daa753f44dff31b0e092f8c95d87c48411b5f` — bytes/idempotency key unchanged.

The separate CLI artifact-use window is maintenance authority already approved for cleanup/recovery; it does **not** renew source/grant rights. Selected native source permits status/cancel-unentered/resolve on the original expired Base and refuses new issue/enter. New cleanup CLI image/source pins will be returned after the hook/build. Installed service remains the recorded `9cf5fff…` image until explicitly reported otherwise.

## Completion / truthful outcomes

Receive the genuine source cancellation/terminal and Core ACK, then finish the pending mutation, remove the two temporary Research grants through official lifecycle and dispose of the expired continuation session token through its official helper. Keep all normal sessions, source history, custody and audit. Expired grant `NOOP_EXPIRED` is not active-grant revocation proof; expired-session cleanup is not a new login/revoke proof. Existing active-stream EOF at 05:26 is recorded but full revoke/recovery is still pending.

No restart, force-stop, source retirement, fake ACK or custody deletion while unresolved. If the reviewed window cannot complete, retain custody and return the exact blocker; do not silently slide the window.
