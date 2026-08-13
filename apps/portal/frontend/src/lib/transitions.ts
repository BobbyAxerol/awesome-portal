/** Target transition detection from a series' signal_target (pos_weight). */

export interface TransitionPoint {
  index: number;
  side: 1 | -1;
  price: number;
}

/** 0 -> ±1 transitions (entries). */
export function entryPoints(
  target: Array<number | null>,
  close: Array<number | null>,
): TransitionPoint[] {
  const points: TransitionPoint[] = [];
  let prev = 0;
  for (let i = 0; i < target.length; i += 1) {
    const value = target[i] ?? 0;
    if (value !== 0 && prev === 0) {
      points.push({ index: i, side: value > 0 ? 1 : -1, price: close[i] ?? 0 });
    }
    prev = value;
  }
  return points;
}

/** ±1 -> 0 transitions (exits), including side flips (previous position closed). */
export function exitPoints(
  target: Array<number | null>,
  close: Array<number | null>,
): TransitionPoint[] {
  const points: TransitionPoint[] = [];
  let prev = 0;
  for (let i = 0; i < target.length; i += 1) {
    const value = target[i] ?? 0;
    if (prev !== 0 && value === 0) {
      points.push({ index: i, side: prev > 0 ? 1 : -1, price: close[i] ?? 0 });
    } else if (prev !== 0 && value !== 0 && value !== prev) {
      // side flip: old position closed, new one opened on the same bar
      points.push({ index: i, side: prev > 0 ? 1 : -1, price: close[i] ?? 0 });
    }
    prev = value;
  }
  return points;
}
