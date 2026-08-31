/**
 * URL-backed screen state, shared by product containers and the lab.
 *
 * Lifted out of `previewControllers.tsx` so the product graph can use it
 * without touching that module's fixture imports (N29 §8 boundary).
 */
import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

export function useParamState<T extends string>(key: string, allowed: readonly T[], fallback: T): [T, (next: T) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get(key);
  const value = (allowed as readonly string[]).includes(raw ?? "") ? (raw as T) : fallback;
  const set = useCallback(
    (next: T) => {
      const copy = new URLSearchParams(params);
      if (next === fallback) copy.delete(key);
      else copy.set(key, next);
      setParams(copy, { replace: false });
    },
    [params, setParams, key, fallback],
  );
  return [value, set];
}
