"use client";

import { useSyncExternalStore } from "react";

// Per-viewer settings kept in localStorage (theme, column count).
const EVENT = "lumaflow-pref";

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function usePref<T extends string>(key: string, fallback: T, allowed: readonly T[]) {
  const stored = useSyncExternalStore(subscribe, () => read(key), () => null);
  const value = allowed.includes(stored as T) ? (stored as T) : fallback;
  const set = (next: T) => {
    try {
      localStorage.setItem(key, next);
    } catch {
      // Private mode or blocked storage: the choice just lasts until reload.
    }
    window.dispatchEvent(new Event(EVENT));
  };
  return [value, set] as const;
}
