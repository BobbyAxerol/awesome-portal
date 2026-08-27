# Lark Task Notification — presentation handoff to Claude

Status: backend stable-text contract implemented; interactive-card presentation
is a follow-up and must not block the stable delivery repair.

## Backend facts Claude may rely on

- The action actor is injected by Control API from the authenticated Portal
  session. Browser-provided `X-Portal-Actor` is overwritten.
- A notification is created only for a real task status transition.
- Available display values are: actor, task ID/title, notes/description,
  previous/new status, assignee, assignment/creation time, optional ISO
  deadline, optional timeline/workstream and a same-origin task-board URL.
- Deadline remaining is computed by the backend only when the source value is a
  valid ISO date/datetime. Missing data must say `Chưa đặt`; never fabricate it.
- The only canonical mention aliases are `bobby`, `stan`, `thanhvuong`. Runtime
  maps them to Lark `open_id` values (`ou_...`). Unknown owners are plain text
  and must never become mentions.
- Task text is untrusted and escaped before it reaches Lark markup. Do not
  re-enable arbitrary HTML or mention parsing.

## Presentation request

Design one compact Lark interactive card plus a plain-text fallback. The card
should make this scanning order obvious:

1. status change and authenticated action actor;
2. task title, with ID secondary;
3. description limited to two or three visual lines;
4. assignee (real `@` mention when configured), assignment time and deadline
   remaining;
5. workstream/timeline and a single `Mở task` action.

Avoid source hashes, internal activity IDs, raw JSON, secrets, webhook details,
oversized typography or decorative copy. Use one coherent visual hierarchy,
accessible contrast and restrained status colour. Long values must truncate or
wrap predictably on desktop and mobile Lark clients.

## Acceptance contract

- Same semantic fields and fallback text remain usable if interactive cards are
  rejected or temporarily disabled.
- No additional task mutation, read authority or direct Lark credential reaches
  the browser.
- Bobby, Stan and Thanhvuong aliases each have positive fixture coverage;
  unknown owner and malicious-markup fixtures remain negative coverage.
- Card rendering failure cannot roll back a task transition and must retain the
  persisted outbox retry/abandon policy.

