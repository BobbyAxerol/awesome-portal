/**
 * Screen 08's transport — the one clock every panel reads (spec 08 §4).
 *
 * A small external store, read through `useSyncExternalStore`, so a tick
 * re-renders only the components that look at the playhead and never the
 * screen around them. It moves over samples that are already loaded and over
 * nothing else: reaching the end of the window stops playback. It never
 * fetches — asking for another window is a separate, explicit reader action.
 */

import { useSyncExternalStore } from "react";

export const SPEEDS = [1, 4, 16, 64] as const;
export type Speed = (typeof SPEEDS)[number];

/** Samples per second at 1×. A sample is not a bar, so the rate is a pace, not time. */
export const BASE_RATE = 4;
export const JUMP = 10;

export interface TransportSnapshot {
  playing: boolean;
  speed: Speed;
  /** Index into the loaded window, not a public ordinal. */
  index: number;
  /** Number of loaded samples; 0 means there is nothing to play. */
  length: number;
  /** Set when the page hid itself mid-play; cleared by the next explicit action. */
  pausedHidden: boolean;
}

type Listener = () => void;

export interface TransportScheduler {
  request: (callback: (now: number) => void) => number;
  cancel: (handle: number) => void;
  now: () => number;
}

const browserScheduler: TransportScheduler = {
  request: (callback) => window.requestAnimationFrame(callback),
  cancel: (handle) => window.cancelAnimationFrame(handle),
  now: () => performance.now(),
};

export class ReplayTransport {
  private snapshot: TransportSnapshot = { playing: false, speed: 1, index: 0, length: 0, pausedHidden: false };
  private listeners = new Set<Listener>();
  private frame: number | null = null;
  private last = 0;
  private carry = 0;

  constructor(private readonly scheduler: TransportScheduler = browserScheduler) {}

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): TransportSnapshot => this.snapshot;

  private set(patch: Partial<TransportSnapshot>): void {
    const next = { ...this.snapshot, ...patch };
    if (
      next.playing === this.snapshot.playing &&
      next.speed === this.snapshot.speed &&
      next.index === this.snapshot.index &&
      next.length === this.snapshot.length &&
      next.pausedHidden === this.snapshot.pausedHidden
    ) {
      return;
    }
    this.snapshot = next;
    this.listeners.forEach((listener) => listener());
  }

  private clamp(index: number): number {
    return Math.max(0, Math.min(index, Math.max(0, this.snapshot.length - 1)));
  }

  /** A new window arrived. Playback stops; the playhead lands where the caller says. */
  load(length: number, index: number): void {
    this.stopLoop();
    const clamped = Math.max(0, Math.min(index, Math.max(0, length - 1)));
    this.set({ index: clamped, length, playing: false });
  }

  seek(index: number): void {
    this.pause();
    this.set({ index: this.clamp(index), pausedHidden: false });
  }

  step(delta: number): void {
    this.seek(this.snapshot.index + delta);
  }

  setSpeed(speed: Speed): void {
    this.set({ speed });
  }

  play(): void {
    if (this.snapshot.length < 2) return;
    /* Play from the end starts over, as a player does. */
    const index = this.snapshot.index >= this.snapshot.length - 1 ? 0 : this.snapshot.index;
    this.set({ playing: true, index, pausedHidden: false });
    this.last = this.scheduler.now();
    this.carry = 0;
    this.loop();
  }

  pause(): void {
    this.stopLoop();
    this.set({ playing: false });
  }

  toggle(): void {
    if (this.snapshot.playing) this.pause();
    else this.play();
  }

  /** The page was hidden. Stop and say why; resuming is the reader's choice. */
  hide(): void {
    if (!this.snapshot.playing) return;
    this.stopLoop();
    this.set({ playing: false, pausedHidden: true });
  }

  dispose(): void {
    this.stopLoop();
    this.listeners.clear();
  }

  private stopLoop(): void {
    if (this.frame !== null) this.scheduler.cancel(this.frame);
    this.frame = null;
  }

  private loop(): void {
    this.frame = this.scheduler.request((now) => {
      this.frame = null;
      if (!this.snapshot.playing) return;
      const elapsed = Math.max(0, now - this.last);
      this.last = now;
      this.carry += (elapsed / 1000) * BASE_RATE * this.snapshot.speed;
      const advance = Math.floor(this.carry);
      if (advance > 0) {
        this.carry -= advance;
        const last = this.snapshot.length - 1;
        const index = Math.min(last, this.snapshot.index + advance);
        this.set({ index, playing: index < last });
        if (index >= last) return;
      }
      this.loop();
    });
  }
}

export function useTransport(transport: ReplayTransport): TransportSnapshot {
  return useSyncExternalStore(transport.subscribe, transport.getSnapshot, transport.getSnapshot);
}

/**
 * Space toggles, ←/→ step one sample, Shift+←/→ jump ten (spec 08 §2.4).
 * Keys typed into a field are the field's.
 */
export function transportKey(transport: ReplayTransport, event: { key: string; code?: string; shiftKey: boolean; target: EventTarget | null }): boolean {
  const target = event.target as HTMLElement | null;
  const tag = target?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) {
    /* The seek slider is an input, but its arrows should still move the transport. */
    if (!(tag === "INPUT" && (target as HTMLInputElement).type === "range")) return false;
  }
  if (event.key === " " || event.code === "Space") {
    if (tag === "BUTTON") return false;
    transport.toggle();
    return true;
  }
  if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
    const direction = event.key === "ArrowRight" ? 1 : -1;
    transport.step(direction * (event.shiftKey ? JUMP : 1));
    return true;
  }
  return false;
}
