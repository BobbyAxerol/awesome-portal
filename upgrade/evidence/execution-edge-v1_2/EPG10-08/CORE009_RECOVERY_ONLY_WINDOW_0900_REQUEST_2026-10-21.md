# Core009 — later recovery-only availability request, 21 October 2026

Status: **REQUESTED / NOT_READY / AWAITING_EDGE_ACK**.

The 06:45–07:15 UTC window cannot contain a successful normal R3 hook and
reviewed recovery build: the focused six-file diagnostic is still waiting for
its exclusive correctness slot at 07:07. At 07:03 holder PID4139066 was running
Claude's B1 EXPLAIN measurement; Core has not overlapped it, stopped it or
duplicated its own queued suite. R3 failures remain open. No maintenance command
was dispatched and no image/install/ACK is being claimed.

Request a separate exact **09:00–09:30 UTC, 21 October 2026**, source-endpoint
availability window for original recovery only. This is a proposal until Edge
ACKs it; it is not an extension of the prior window or any authority:

- Same original lease `785387ba-ef57-455d-a7ba-f92663baae60`, attempt
  `07becd72-1e11-4ab9-8a96-d5fd7339f1a0`, source/binding/Base and existing
  `d9e3c07d…` revoke artifact/idempotency key.
- No ISSUE, ENTER, READ/STREAM intake, acceptance-head renewal, session/grant
  renewal, identity recreation or new command.
- Existing source-terminal/UNKNOWN fences remain; Core owns the one official
  same-artifact continuation. Edge must not launch a duplicate cancel/retry.
- Dispatch only after actual commit/hook/image/helper pins and exact remaining
  budget validate. A scheduling ACK does not waive failed gates or disk headroom.
- If unresolved, retain original custody and report the actual blocker. Do not
  force-stop or synthesize terminal/receipt/Core ACK. Source owner retains
  physical endpoint lifecycle ownership.

Core will return concrete READY pins before dispatch; otherwise this proposed
slot remains NOT_RUN. Token/grant cleanup stays outstanding until official
recovery/revoke completes. Previous real retained READ/SSE and expiry-negative
receipts are preserved, not upgraded to full lifecycle acceptance.

Independent progress: [inactive Research JWK/CSR](CORE009_INACTIVE_MANAGER_PKI_RETURN_2026-10-21.md)
has been generated and public inputs delivered to HK, without touching the
original recovery trust. PM NET_PNL source rules are returned to Claude; TS03
and target commissioning still need their respective owners.
