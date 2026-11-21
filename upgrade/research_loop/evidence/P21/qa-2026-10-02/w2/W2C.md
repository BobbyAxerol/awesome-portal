# W2C — S14 Alpha Import

Done: stepper keyboard (roving tabindex, Left/Right wrap, Home/End), one refusal message per step
(`StepRefusal`, Reload only for origin/CSRF, code + detail + request id in the tooltip, no banner),
`.py`-only file input (`.py files only.`, never read) with "last input wins" (a file replaces the paste
with an Undo; typing clears the file), fewer words (stepper Source/Gates/Register, regex line to tooltip,
quarantine line to the Parse tooltip, disabled reasons as tooltip + aria-describedby), stepper 40px, 44px
at <=720px.

Retry semantics unchanged: this client sends no `client_intent_id` today; a refused parse is not retried
automatically and the Parse button resends a byte-identical body (test: alphaImport.w2c.test.tsx).

Not done / handed off: `TRONG INBOX` is `<dt>Trong inbox</dt>` in features/imports/ImportInbox.tsx:139
(Vietnamese "in inbox"; legacy /imports, not S14) -> label "In inbox" (NEEDS-SHARED, legacy-routes owner).
Visual baseline `s14-alpha-import` changes deliberately (title, stepper, no rules line); Bobby records it.
