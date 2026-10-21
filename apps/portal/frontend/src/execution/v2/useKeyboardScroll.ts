/**
 * Keyboard access to a sideways-scrolling box (WCAG 2.1.1, axe `scrollable-region-focusable`, UXM-10 F-5).
 *
 * A scroll container with nothing focusable inside cannot be scrolled from the keyboard. Exactly then (it overflows AND holds
 * no link, button, summary or focusable row) the box becomes a named, focusable region; otherwise it stays a plain element and
 * adds no Tab stop. One helper for the table wrap (`CardsTable`) and the lifecycle spine, so the rule is written once.
 */
import { useEffect, useRef, useState, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/** True while the element scrolls sideways and nothing inside it can take focus. */
export function needsKeyboardScroll(box: HTMLElement): boolean {
  return box.scrollWidth > box.clientWidth + 1 && box.querySelector(FOCUSABLE) === null;
}

export type HiddenEdges = "start" | "end" | "both";

export interface KeyboardScrollProps {
  role?: "region";
  tabIndex?: 0;
  "aria-label"?: string;
  /** The side(s) of the box that hold content out of view. Absent when everything fits. */
  "data-more"?: HiddenEdges;
}

/** Which sides of a sideways-scrolling box hold content that is out of view; `null` when it all fits. */
export function hiddenEdges(box: HTMLElement): HiddenEdges | null {
  const room = box.scrollWidth - box.clientWidth;
  if (room <= 1) return null;
  const before = box.scrollLeft > 1;
  const after = box.scrollLeft < room - 1;
  return before && after ? "both" : after ? "end" : before ? "start" : null;
}

/**
 * `ref` goes on the scroll box and `props` is spread on it; `deps` are the inputs that change what it holds. `data-more` names the
 * side that is cut off, so the stylesheet can fade that edge: a table that stops at its scroller's edge shows that it goes on.
 */
export function useKeyboardScroll<T extends HTMLElement>(label: string, deps: readonly unknown[]): { ref: RefObject<T>; props: KeyboardScrollProps } {
  const ref = useRef<T>(null);
  const [scrolls, setScrolls] = useState(false);
  const [more, setMore] = useState<HiddenEdges | null>(null);
  useEffect(() => {
    const box = ref.current;
    if (box === null) return;
    const measure = () => {
      setScrolls(needsKeyboardScroll(box));
      setMore(hiddenEdges(box));
    };
    measure();
    box.addEventListener("scroll", measure, { passive: true });
    if (typeof ResizeObserver === "undefined") return () => box.removeEventListener("scroll", measure);
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    for (const child of Array.from(box.children)) observer.observe(child);
    return () => {
      box.removeEventListener("scroll", measure);
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return {
    ref,
    props: {
      ...(scrolls ? { role: "region" as const, tabIndex: 0 as const, "aria-label": `${label}, scrolls sideways` } : {}),
      ...(more === null ? {} : { "data-more": more }),
    },
  };
}
