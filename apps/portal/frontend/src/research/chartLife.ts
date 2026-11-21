/**
 * Entry motion + hover readout for the DOM/SVG diagrams of the Research pages.
 *
 * Alive but honest: marks draw in once when the diagram first mounts (never on a
 * re-render or a poll), and only when motion is allowed — `prefers-reduced-motion`
 * and the fixtures/automation switch (`smokeMotionAllowed`) both turn it off.
 * Nothing here changes a value; it only animates geometry the server already
 * published and echoes the text a mark already carries.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import { smokeMotionAllowed } from "../execution/smokeMotion";

export const ENTRY_MS = 600;
export const ENTRY_EASING = "cubic-bezier(0.215, 0.61, 0.355, 1)"; /* cubicOut */

export type EntryKind = "x" | "y" | "fade";

/** Whether a diagram may animate in right now. */
export function entryAllowed(): boolean {
  return smokeMotionAllowed();
}

/** The WAAPI keyframes for a mark, or null when it must not move. */
export function entryKeyframes(kind: EntryKind, allowed: boolean = entryAllowed()): Keyframe[] | null {
  if (!allowed) return null;
  if (kind === "x") return [{ transform: "scaleX(0)", opacity: 0.4 }, { transform: "scaleX(1)", opacity: 1 }];
  if (kind === "y") return [{ transform: "scaleY(0)", opacity: 0.4 }, { transform: "scaleY(1)", opacity: 1 }];
  return [{ opacity: 0 }, { opacity: 1 }];
}

/**
 * Animate every `[data-entry]` descendant once, on first mount. `data-entry` is
 * `x` | `y` | `fade`; `data-entry-origin` (left|right|bottom|center) sets the
 * transform origin so a bar grows from its baseline. Marks are staggered a hair.
 */
export function useEntryAnimation(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const root = ref.current;
    if (!root || !entryAllowed()) return;
    const marks = Array.from(root.querySelectorAll<HTMLElement>("[data-entry]"));
    const running: Animation[] = [];
    marks.forEach((mark, index) => {
      if (typeof mark.animate !== "function") return;
      const kind = (mark.dataset.entry as EntryKind) ?? "fade";
      const frames = entryKeyframes(kind);
      if (!frames) return;
      if (mark.dataset.entryOrigin) mark.style.transformOrigin = mark.dataset.entryOrigin;
      running.push(mark.animate(frames, { duration: ENTRY_MS, delay: Math.min(index * 12, 240), easing: ENTRY_EASING, fill: "backwards" }));
    });
    return () => running.forEach((animation) => animation.cancel());
    // First mount only: a poll or re-render must never replay the entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** `ref` for a diagram container whose `[data-entry]` marks draw in once. */
export function useEntryRef<T extends HTMLElement>(): RefObject<T> {
  const ref = useRef<T>(null);
  useEntryAnimation(ref);
  return ref;
}

/** A hover/focus/tap readout: the real text of the mark under the pointer. */
export function useReadout(): { text: string | null; bind: (text: string) => Record<string, unknown>; clear: () => void } {
  const [text, setText] = useState<string | null>(null);
  const clear = useCallback(() => setText(null), []);
  const bind = useCallback(
    (value: string) => ({
      onMouseEnter: () => setText(value),
      onFocus: () => setText(value),
      onMouseLeave: clear,
      onBlur: clear,
      onPointerDown: () => setText(value),
    }),
    [clear],
  );
  return { text, bind, clear };
}
