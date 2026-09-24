import { useEffect, useState } from "react";

/**
 * Remembers where the user was (portal + tab) in localStorage, so a page
 * refresh or re-opening the site returns them to the same screen.
 *
 * Only small, non-sensitive UI values are stored (which portal, which tab).
 * Every access is wrapped in try/catch: private mode or blocked storage just
 * means "nothing remembered", never a crash.
 */

const PREFIX = "mannsaathi.";

export const LAST_PAGE_KEYS = {
  session: "session", // which portal is open: "victim" | "counsellor"
  victimTab: "victim.tab",
  counsellorTab: "counsellor.tab",
} as const;

export function readLast(key: string): string | null {
  try {
    return window.localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

export function writeLast(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(PREFIX + key);
    else window.localStorage.setItem(PREFIX + key, value);
  } catch {
    /* storage unavailable — ignore */
  }
}

/** Forget everything (used on logout). */
export function clearLastPage() {
  Object.values(LAST_PAGE_KEYS).forEach((k) => writeLast(k, null));
}

/**
 * useState that is restored from / saved to localStorage.
 * `allowed` guards against stale values (e.g. a tab that no longer exists).
 */
export function useRememberedState(key: string, fallback: string, allowed: readonly string[]) {
  const [value, setValue] = useState<string>(() => {
    const saved = readLast(key);
    return saved && allowed.includes(saved) ? saved : fallback;
  });
  useEffect(() => {
    writeLast(key, value);
  }, [key, value]);
  return [value, setValue] as const;
}
