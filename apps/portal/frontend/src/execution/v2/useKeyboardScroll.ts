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

export interface KeyboardScrollProps {
  role?: "region";
  tabIndex?: 0;
  "aria-label"?: string;
}

/** `ref` goes on the scroll box and `props` is spread on it; `deps` are the inputs that change what it holds. */
export function useKeyboardScroll<T extends HTMLElement>(label: string, deps: readonly unknown[]): { ref: RefObject<T>; props: KeyboardScrollProps } {
  const ref = useRef<T>(null);
  const [scrolls, setScrolls] = useState(false);
  useEffect(() => {
    const box = ref.current;
    if (box === null) return;
    const measure = () => setScrolls(needsKeyboardScroll(box));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    for (const child of Array.from(box.children)) observer.observe(child);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { ref, props: scrolls ? { role: "region", tabIndex: 0, "aria-label": `${label}, scrolls sideways` } : {} };
}
