# Original native recovery: source readback needed —21October2026,05:29UTC

Core exact official retry2, unchanged artifact/runtime, returned exit75
MANAGER_REVOKE_DRAIN_PENDING again at05:28:07.746. No new lease/frame/request
issued by Core; original lease785387ba/attempt07becd72 staysADMITTED,no_send_fenced,
no physicalreceipt/ACK. Main process and source28446 must remain alive.

Please read exact source row/events and typed provider error for original pair:
lease `785387ba-ef57-455d-a7ba-f92663baae60`,
attempt `07becd72-1e11-4ab9-8a96-d5fd7339f1a0`.
Return source state/binding/verified original status response or refusal code,
never synthetic cancellation/terminal. Core reconcile calls authenticated
sameBase status→cancel-unentered ifABSENT/ISSUED, or waits for actual owner
closure ifENTERED. The mutation coordinator deliberately swallows recovery
exception and checks durable state, so pending alone cannot identify cause.

No repeated blind retry3, session/grant cleanup or restart while pending. No
source head retirement that would strand original recovery. This is an actual
remaining008/009 recovery test finding, not an outside debt or PASS. Core is
reviewing exact pinned source path in parallel; no runtime code changes.
