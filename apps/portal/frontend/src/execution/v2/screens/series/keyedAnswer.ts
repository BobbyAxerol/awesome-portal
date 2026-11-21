/**
 * One read bound to a COMPLETE REQUEST KEY, with the returned state derived during render (Codex R-C 1, applied to the hooks that reset
 * their state in a passive effect).
 *
 * An answer is stored with the key it was read for and is returned only while that key is the current key; any other key returns `loading`,
 * and a `null` key returns `idle`, in the SAME commit as the changed props. The effect only starts the read; a reply is fenced by the effect
 * run that asked for it (a changed key or an unmount writes nothing). No setState in an effect resets what the render has already hidden.
 */
import { useEffect, useRef, useState } from "react";

const ids = new WeakMap<object, number>();
let next = 1;
/** A stable small integer per object (a port, a function), for building a key that changes when the port does. */
export function identityOf(value: object | null | undefined): number {
  if (value === null || value === undefined) return 0;
  let id = ids.get(value);
  if (id === undefined) {
    id = next;
    next += 1;
    ids.set(value, id);
  }
  return id;
}

export function useKeyedAnswer<T>(key: string | null, idle: T, loading: T, run: (settle: (value: T) => void) => void): T {
  const [held, setHeld] = useState<{ key: string; value: T } | null>(null);
  const runRef = useRef(run);
  runRef.current = run;
  useEffect(() => {
    if (key === null) {
      setHeld((h) => (h === null ? h : null));
      return undefined;
    }
    let live = true;
    runRef.current((value) => { if (live) setHeld({ key, value }); });
    return () => { live = false; };
  }, [key]);
  if (key === null) return idle;
  return held !== null && held.key === key ? held.value : loading;
}
