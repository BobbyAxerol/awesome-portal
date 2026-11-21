/**
 * Text with break opportunities at the separators of a code, so a long reason code or capability key wraps between its parts
 * (`N23_GATE_` / `POLICY_` / `EVALUATION`) and never inside a word. A `<wbr>` carries no text, so a copy, a test and a screen reader
 * read the code as it was sent. Anything that is not a code (short words, sentences) is returned as it is.
 */
import { Fragment, type ReactNode } from "react";

/** A token of 10 or more characters that holds an underscore or a dot between word characters: a code, a key or an id. */
const CODE = /[A-Za-z0-9]+(?:[_.][A-Za-z0-9]+)+/g;

export function breakable(text: string): ReactNode {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(CODE)) {
    const token = match[0];
    const at = match.index ?? 0;
    if (token.length < 10) continue;
    if (at > last) out.push(text.slice(last, at));
    const parts = token.split(/(?<=[_.])/);
    parts.forEach((part, index) => {
      out.push(<Fragment key={`${key}:${index}`}>{part}{index < parts.length - 1 ? <wbr /> : null}</Fragment>);
    });
    key += 1;
    last = at + token.length;
  }
  if (out.length === 0) return text;
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}
