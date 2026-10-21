'use client';

import { useCallback, useEffect, useState, type SetStateAction } from 'react';

type Codec<T> = { read: (stored: unknown) => T | undefined; write: (value: T) => unknown };

/**
 * useState that this browser remembers between visits (localStorage) — for view preferences
 * only (layout, grouping, what's collapsed), never for records. The first render always uses
 * `initial` so server and browser markup match; the saved value is applied right after. If
 * storage is blocked or full, it quietly behaves like plain useState.
 */
export function usePersistentState<T>(key: string, initial: T, codec?: Codec<T>) {
  const [value, setValue] = useState<T>(initial);
  const read = codec?.read;
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return;
      const parsed: unknown = JSON.parse(raw);
      const v = read ? read(parsed) : (parsed as T);
      if (v !== undefined) setValue(v);
    } catch {
      // Unreadable or blocked storage: keep the default.
    }
  }, [key, read]);
  const write = codec?.write;
  const set = useCallback(
    (next: SetStateAction<T>) =>
      setValue((prev) => {
        const v = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        try {
          window.localStorage.setItem(key, JSON.stringify(write ? write(v) : v));
        } catch {
          // Private mode or full storage: the choice just isn't remembered.
        }
        return v;
      }),
    [key, write],
  );
  return [value, set] as const;
}

/** Codec for a Set of ids, stored as a JSON array. */
export const idSet: Codec<Set<string>> = {
  read: (v) => (Array.isArray(v) ? new Set(v.filter((x): x is string => typeof x === 'string')) : undefined),
  write: (s) => [...s],
};

/** Codec that only accepts one of the given strings. */
export const oneOf = <T extends string>(...allowed: T[]): Codec<T> => ({
  read: (v) => (typeof v === 'string' && (allowed as string[]).includes(v) ? (v as T) : undefined),
  write: (v) => v,
});
