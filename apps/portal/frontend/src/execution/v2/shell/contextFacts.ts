/**
 * What a screen knows that the context bar does not (UXM-07, concept C1).
 *
 * The bar is mounted by `PreviewFrame`, above the screen, so it cannot see the
 * screen's reads. A screen that knows a fact the bar should show publishes it
 * here with `useContextFacts`; the bar reads it. Nothing is guessed on the
 * bar's side and nothing outlives the screen: the facts are dropped when the
 * screen unmounts.
 *
 * - `scope`: set only when the screen's data is narrowed by the reader's
 *   authority (it holds no fund-wide read). Absent means "no statement", which
 *   is not the same as "fund-wide": a screen that cannot know publishes nothing.
 * - `ccy`: the currency the screen is actually stating. `null` means the screen
 *   states none right now, so a `ccy` left in the URL by another screen is not
 *   echoed as if this screen used it; `undefined` means "no statement" and the
 *   bar falls back to the URL.
 *
 * Module state, not a React provider: the bar and the screens are lazy chunks
 * that share this module, and `ExecutionPreviewRoute` never imports it, so a
 * flag-off build carries none of it.
 */
import { useEffect, useRef, useSyncExternalStore } from "react";

export interface ContextFacts {
  scope?: string | null;
  ccy?: string | null;
}

const EMPTY: ContextFacts = Object.freeze({});
let current: ContextFacts = EMPTY;
let owner: object | null = null;
const listeners = new Set<() => void>();

function publish(next: ContextFacts, by: object): void {
  owner = by;
  if (current.scope === next.scope && current.ccy === next.ccy) return;
  current = next;
  listeners.forEach((listener) => listener());
}

function retract(by: object): void {
  if (owner !== by) return;
  owner = null;
  if (current === EMPTY) return;
  current = EMPTY;
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const snapshot = (): ContextFacts => current;

/** For the bar: the facts the mounted screen has published, or none. */
export function useContextFactsValue(): ContextFacts {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** For a screen: publish while mounted, update when a value changes, retract on unmount. */
export function useContextFacts(facts: ContextFacts): void {
  const token = useRef<object>({});
  const { scope, ccy } = facts;
  useEffect(() => {
    publish({ scope, ccy }, token.current);
  }, [scope, ccy]);
  useEffect(() => {
    const mine = token.current;
    return () => retract(mine);
  }, []);
}
